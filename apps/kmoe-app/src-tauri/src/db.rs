use std::{
    path::{Path, PathBuf},
    time::Duration,
};

use rusqlite::{params, Connection};

use crate::fs_utils;
use crate::models::{
    CacheStats, ChapterCache, DownloadTask, DownloadedFile, PageCache, ReadingHistoryEntry,
    ReadingProgress, SaveChapterCacheInput, SaveReadingProgressInput, Shelf, ShelfItem,
};

#[path = "db_rows.rs"]
mod db_rows;
use db_rows::{
    priority_queue_created_at, read_chapter_cache, read_download_task, read_page_cache,
    read_reading_progress, read_shelf, read_shelf_item,
};

pub const SQLITE_FILENAME: &str = "kmoe-client.sqlite3";
pub const MAX_RETRY_COUNT: i64 = 3;
pub const RESTART_REAUTH_MESSAGE: &str = "App restarted; task needs re-authorization.";
pub const RESUME_REAUTH_MESSAGE: &str = "Task resumed; task needs re-authorization.";

pub const SQLITE_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS comics (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT,
  cover_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS volumes (
  id TEXT PRIMARY KEY,
  comic_id TEXT NOT NULL,
  vol_id TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT,
  page_count INTEGER,
  doc_page_count INTEGER,
  mobi_size INTEGER,
  epub_size INTEGER,
  source_zip_size INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS download_tasks (
  id TEXT PRIMARY KEY,
  comic_id TEXT NOT NULL,
  comic_title TEXT NOT NULL,
  vol_id TEXT NOT NULL,
  volume_title TEXT NOT NULL,
  format TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL DEFAULT 0,
  downloaded_bytes INTEGER DEFAULT 0,
  total_bytes INTEGER,
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  local_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS downloaded_files (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  comic_id TEXT NOT NULL,
  comic_title TEXT NOT NULL,
  vol_id TEXT NOT NULL,
  volume_title TEXT NOT NULL,
  format TEXT NOT NULL,
  local_path TEXT NOT NULL,
  size_bytes INTEGER,
  downloaded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shelves (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'custom',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS shelf_items (
  id TEXT PRIMARY KEY,
  shelf_id TEXT NOT NULL,
  comic_id TEXT NOT NULL,
  comic_title TEXT NOT NULL,
  comic_url TEXT,
  cover_url TEXT,
  comic_status TEXT,
  latest_volume TEXT,
  last_read_volume_id TEXT,
  last_read_label TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  cached INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_read_at TEXT,
  last_update_at TEXT,
  FOREIGN KEY (shelf_id) REFERENCES shelves(id) ON DELETE CASCADE,
  UNIQUE (shelf_id, comic_id)
);

CREATE INDEX IF NOT EXISTS idx_shelf_items_shelf_updated
  ON shelf_items (shelf_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_shelf_items_comic
  ON shelf_items (comic_id);

CREATE TABLE IF NOT EXISTS reading_progress (
  id TEXT PRIMARY KEY,
  comic_id TEXT NOT NULL,
  comic_title TEXT NOT NULL,
  volume_id TEXT NOT NULL,
  volume_title TEXT NOT NULL,
  page_index INTEGER NOT NULL DEFAULT 0,
  page_count INTEGER,
  progress_percent REAL NOT NULL DEFAULT 0,
  last_read_at TEXT NOT NULL,
  finished INTEGER NOT NULL DEFAULT 0,
  reading_mode TEXT NOT NULL DEFAULT 'paged',
  reading_direction TEXT NOT NULL DEFAULT 'rtl',
  page_layout TEXT NOT NULL DEFAULT 'auto',
  zoom REAL,
  rotation INTEGER,
  crop_json TEXT,
  spread_overrides_json TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (comic_id, volume_id)
);

CREATE INDEX IF NOT EXISTS idx_reading_progress_last_read
  ON reading_progress (last_read_at DESC);

CREATE TABLE IF NOT EXISTS reading_history (
  id TEXT PRIMARY KEY,
  comic_id TEXT NOT NULL,
  comic_title TEXT NOT NULL,
  volume_id TEXT NOT NULL,
  volume_title TEXT NOT NULL,
  page_index INTEGER NOT NULL DEFAULT 0,
  progress_percent REAL NOT NULL DEFAULT 0,
  event TEXT NOT NULL DEFAULT 'read',
  read_at TEXT NOT NULL,
  duration_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS idx_reading_history_comic_read_at
  ON reading_history (comic_id, read_at DESC);

CREATE TABLE IF NOT EXISTS chapter_cache (
  id TEXT PRIMARY KEY,
  comic_id TEXT NOT NULL,
  comic_title TEXT NOT NULL,
  volume_id TEXT NOT NULL,
  volume_title TEXT NOT NULL,
  format TEXT NOT NULL,
  cache_kind TEXT NOT NULL DEFAULT 'reading',
  source_task_id TEXT,
  cache_dir TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  page_count INTEGER,
  status TEXT NOT NULL DEFAULT 'ready',
  policy TEXT,
  last_accessed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT,
  UNIQUE (comic_id, volume_id, format, cache_kind)
);

CREATE INDEX IF NOT EXISTS idx_chapter_cache_accessed
  ON chapter_cache (last_accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_chapter_cache_status
  ON chapter_cache (status);

CREATE TABLE IF NOT EXISTS page_cache (
  id TEXT PRIMARY KEY,
  chapter_cache_id TEXT NOT NULL,
  comic_id TEXT NOT NULL,
  volume_id TEXT NOT NULL,
  page_index INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  size_bytes INTEGER,
  created_at TEXT NOT NULL,
  last_accessed_at TEXT NOT NULL,
  FOREIGN KEY (chapter_cache_id) REFERENCES chapter_cache(id) ON DELETE CASCADE,
  UNIQUE (chapter_cache_id, page_index)
);

CREATE INDEX IF NOT EXISTS idx_page_cache_chapter_page
  ON page_cache (chapter_cache_id, page_index);

CREATE TABLE IF NOT EXISTS cache_policy (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'balanced',
  keep_previous_chapters INTEGER NOT NULL DEFAULT 1,
  keep_next_chapters INTEGER NOT NULL DEFAULT 1,
  max_recent_chapters INTEGER NOT NULL DEFAULT 3,
  wifi_prefetch INTEGER NOT NULL DEFAULT 1,
  low_power_reduce_prefetch INTEGER NOT NULL DEFAULT 1,
  max_cache_bytes INTEGER,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
"#;

pub fn init_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(SQLITE_SCHEMA)?;
    ensure_column(conn, "download_tasks", "progress", "REAL DEFAULT 0")?;
    ensure_column(
        conn,
        "download_tasks",
        "downloaded_bytes",
        "INTEGER DEFAULT 0",
    )?;
    ensure_column(conn, "download_tasks", "total_bytes", "INTEGER")?;
    ensure_column(conn, "download_tasks", "retry_count", "INTEGER DEFAULT 0")?;
    ensure_column(conn, "download_tasks", "error_message", "TEXT")?;
    ensure_column(conn, "download_tasks", "local_path", "TEXT")?;
    ensure_column(conn, "downloaded_files", "task_id", "TEXT")?;
    ensure_column(conn, "downloaded_files", "size_bytes", "INTEGER")?;
    ensure_column(conn, "shelves", "kind", "TEXT NOT NULL DEFAULT 'custom'")?;
    ensure_column(conn, "shelves", "sort_order", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(conn, "shelves", "archived_at", "TEXT")?;
    ensure_column(conn, "shelf_items", "comic_url", "TEXT")?;
    ensure_column(conn, "shelf_items", "cover_url", "TEXT")?;
    ensure_column(conn, "shelf_items", "comic_status", "TEXT")?;
    ensure_column(conn, "shelf_items", "latest_volume", "TEXT")?;
    ensure_column(conn, "shelf_items", "last_read_volume_id", "TEXT")?;
    ensure_column(conn, "shelf_items", "last_read_label", "TEXT")?;
    ensure_column(
        conn,
        "shelf_items",
        "unread_count",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(conn, "shelf_items", "cached", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(
        conn,
        "shelf_items",
        "archived",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(conn, "shelf_items", "last_read_at", "TEXT")?;
    ensure_column(conn, "shelf_items", "last_update_at", "TEXT")?;
    ensure_column(conn, "reading_progress", "page_count", "INTEGER")?;
    ensure_column(
        conn,
        "reading_progress",
        "finished",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(
        conn,
        "reading_progress",
        "reading_mode",
        "TEXT NOT NULL DEFAULT 'paged'",
    )?;
    ensure_column(
        conn,
        "reading_progress",
        "reading_direction",
        "TEXT NOT NULL DEFAULT 'rtl'",
    )?;
    ensure_column(
        conn,
        "reading_progress",
        "page_layout",
        "TEXT NOT NULL DEFAULT 'auto'",
    )?;
    ensure_column(conn, "reading_progress", "zoom", "REAL")?;
    ensure_column(conn, "reading_progress", "rotation", "INTEGER")?;
    ensure_column(conn, "reading_progress", "crop_json", "TEXT")?;
    ensure_column(conn, "reading_progress", "spread_overrides_json", "TEXT")?;
    ensure_column(
        conn,
        "chapter_cache",
        "cache_kind",
        "TEXT NOT NULL DEFAULT 'reading'",
    )?;
    ensure_column(conn, "chapter_cache", "source_task_id", "TEXT")?;
    ensure_column(
        conn,
        "chapter_cache",
        "size_bytes",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(conn, "chapter_cache", "page_count", "INTEGER")?;
    ensure_column(
        conn,
        "chapter_cache",
        "status",
        "TEXT NOT NULL DEFAULT 'ready'",
    )?;
    ensure_column(conn, "chapter_cache", "policy", "TEXT")?;
    ensure_column(conn, "chapter_cache", "expires_at", "TEXT")?;
    ensure_column(conn, "page_cache", "width", "INTEGER")?;
    ensure_column(conn, "page_cache", "height", "INTEGER")?;
    ensure_column(conn, "page_cache", "size_bytes", "INTEGER")?;
    ensure_column(
        conn,
        "cache_policy",
        "mode",
        "TEXT NOT NULL DEFAULT 'balanced'",
    )?;
    ensure_column(
        conn,
        "cache_policy",
        "keep_previous_chapters",
        "INTEGER NOT NULL DEFAULT 1",
    )?;
    ensure_column(
        conn,
        "cache_policy",
        "keep_next_chapters",
        "INTEGER NOT NULL DEFAULT 1",
    )?;
    ensure_column(
        conn,
        "cache_policy",
        "max_recent_chapters",
        "INTEGER NOT NULL DEFAULT 3",
    )?;
    ensure_column(
        conn,
        "cache_policy",
        "wifi_prefetch",
        "INTEGER NOT NULL DEFAULT 1",
    )?;
    ensure_column(
        conn,
        "cache_policy",
        "low_power_reduce_prefetch",
        "INTEGER NOT NULL DEFAULT 1",
    )?;
    ensure_column(conn, "cache_policy", "max_cache_bytes", "INTEGER")?;
    Ok(())
}

fn ensure_column(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> rusqlite::Result<()> {
    let pragma = format!("PRAGMA table_info({table})");
    let mut stmt = conn.prepare(&pragma)?;
    let mut columns = stmt.query_map([], |row| row.get::<_, String>(1))?;
    while let Some(name) = columns.next().transpose()? {
        if name == column {
            return Ok(());
        }
    }

    let sql = format!("ALTER TABLE {table} ADD COLUMN {column} {definition}");
    conn.execute(&sql, [])?;
    Ok(())
}

pub fn open_default_connection() -> rusqlite::Result<Connection> {
    let path = default_database_path();
    if std::env::consts::OS == "ios" {
        migrate_legacy_database_if_needed(&path, &legacy_ios_database_path())?;
    }
    open_connection(path)
}

pub fn default_database_path() -> PathBuf {
    std::env::var("KMOE_CLIENT_DB")
        .map(PathBuf::from)
        .unwrap_or_else(|_| database_path_in_app_data_dir(&fs_utils::app_data_dir()))
}

pub fn database_path_in_app_data_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(SQLITE_FILENAME)
}

fn legacy_ios_database_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    Path::new(&home)
        .join(".local")
        .join("share")
        .join(fs_utils::APP_IDENTIFIER)
        .join(SQLITE_FILENAME)
}

fn migrate_legacy_database_if_needed(path: &Path, legacy_path: &Path) -> rusqlite::Result<()> {
    if path.exists() || !legacy_path.exists() {
        return Ok(());
    }
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent)
            .map_err(|_| rusqlite::Error::InvalidPath(path.to_path_buf()))?;
    }
    std::fs::copy(legacy_path, path)
        .map_err(|_| rusqlite::Error::InvalidPath(path.to_path_buf()))?;
    Ok(())
}

pub fn open_connection(path: PathBuf) -> rusqlite::Result<Connection> {
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent).map_err(|_| rusqlite::Error::InvalidPath(path.clone()))?;
    }
    let conn = Connection::open(path)?;
    conn.busy_timeout(Duration::from_secs(5))?;
    init_schema(&conn)?;
    Ok(conn)
}

pub fn upsert_download_task(conn: &Connection, task: &DownloadTask) -> rusqlite::Result<()> {
    conn.execute(
        r#"
        INSERT INTO download_tasks (
          id, comic_id, comic_title, vol_id, volume_title, format, status, progress,
          downloaded_bytes, total_bytes, retry_count, error_message, local_path,
          created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          progress = excluded.progress,
          downloaded_bytes = excluded.downloaded_bytes,
          total_bytes = excluded.total_bytes,
          retry_count = excluded.retry_count,
          error_message = excluded.error_message,
          local_path = excluded.local_path,
          updated_at = excluded.updated_at
        "#,
        params![
            &task.id,
            &task.comic_id,
            &task.comic_title,
            &task.vol_id,
            &task.volume_title,
            &task.format,
            &task.status,
            task.progress,
            task.downloaded_bytes,
            task.total_bytes,
            task.retry_count,
            &task.error_message,
            &task.local_path,
            &task.created_at,
            &task.updated_at
        ],
    )?;
    Ok(())
}

pub fn insert_download_task_if_absent(
    conn: &Connection,
    task: &DownloadTask,
) -> rusqlite::Result<bool> {
    let changed = conn.execute(
        r#"
        INSERT OR IGNORE INTO download_tasks (
          id, comic_id, comic_title, vol_id, volume_title, format, status, progress,
          downloaded_bytes, total_bytes, retry_count, error_message, local_path,
          created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
        "#,
        params![
            &task.id,
            &task.comic_id,
            &task.comic_title,
            &task.vol_id,
            &task.volume_title,
            &task.format,
            &task.status,
            task.progress,
            task.downloaded_bytes,
            task.total_bytes,
            task.retry_count,
            &task.error_message,
            &task.local_path,
            &task.created_at,
            &task.updated_at
        ],
    )?;
    Ok(changed > 0)
}

pub fn get_download_task(conn: &Connection, id: &str) -> rusqlite::Result<Option<DownloadTask>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, comic_id, comic_title, vol_id, volume_title, format, status, progress,
               downloaded_bytes, total_bytes, retry_count, error_message, local_path,
               created_at, updated_at
        FROM download_tasks
        WHERE id = ?1
        LIMIT 1
        "#,
    )?;
    let mut rows = stmt.query_map(params![id], read_download_task)?;
    rows.next().transpose()
}

pub fn list_download_tasks(conn: &Connection) -> rusqlite::Result<Vec<DownloadTask>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, comic_id, comic_title, vol_id, volume_title, format, status, progress,
               downloaded_bytes, total_bytes, retry_count, error_message, local_path,
               created_at, updated_at
        FROM download_tasks
        ORDER BY created_at DESC
        "#,
    )?;
    let rows = stmt.query_map([], read_download_task)?;
    rows.collect()
}

pub fn recover_interrupted_tasks(conn: &Connection, updated_at: &str) -> rusqlite::Result<usize> {
    conn.execute(
        r#"
        UPDATE download_tasks
        SET status = 'queued',
            progress = 0,
            downloaded_bytes = 0,
            error_message = ?1,
            local_path = NULL,
            updated_at = ?2
        WHERE status IN ('authorizing', 'downloading', 'verifying')
        "#,
        params![RESTART_REAUTH_MESSAGE, updated_at],
    )
}

pub fn first_queued_task(conn: &Connection) -> rusqlite::Result<Option<DownloadTask>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, comic_id, comic_title, vol_id, volume_title, format, status, progress,
               downloaded_bytes, total_bytes, retry_count, error_message, local_path,
               created_at, updated_at
        FROM download_tasks
        WHERE status = 'queued'
        ORDER BY created_at ASC, id ASC
        LIMIT 1
        "#,
    )?;
    let mut rows = stmt.query_map([], read_download_task)?;
    rows.next().transpose()
}

pub fn claim_next_queued_task(
    conn: &Connection,
    updated_at: &str,
) -> rusqlite::Result<Option<DownloadTask>> {
    conn.execute_batch("BEGIN IMMEDIATE TRANSACTION")?;
    let claim_result = claim_next_queued_task_in_transaction(conn, updated_at);
    match claim_result {
        Ok(task) => {
            if let Err(error) = conn.execute_batch("COMMIT") {
                let _ = conn.execute_batch("ROLLBACK");
                Err(error)
            } else {
                Ok(task)
            }
        }
        Err(error) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(error)
        }
    }
}

fn claim_next_queued_task_in_transaction(
    conn: &Connection,
    updated_at: &str,
) -> rusqlite::Result<Option<DownloadTask>> {
    let Some(mut task) = first_queued_task(conn)? else {
        return Ok(None);
    };
    let changed = conn.execute(
        r#"
        UPDATE download_tasks
        SET status = 'authorizing',
            progress = 4,
            downloaded_bytes = 0,
            error_message = NULL,
            local_path = NULL,
            updated_at = ?2
        WHERE id = ?1
          AND status = 'queued'
        "#,
        params![&task.id, updated_at],
    )?;
    if changed == 0 {
        return Ok(None);
    }
    task.status = "authorizing".to_string();
    task.progress = 4.0;
    task.downloaded_bytes = 0;
    task.error_message = None;
    task.local_path = None;
    task.updated_at = updated_at.to_string();
    Ok(Some(task))
}

pub fn update_download_task_unless_controlled(
    conn: &Connection,
    task: &DownloadTask,
) -> rusqlite::Result<bool> {
    let changed = conn.execute(
        r#"
        UPDATE download_tasks
        SET comic_id = ?2,
            comic_title = ?3,
            vol_id = ?4,
            volume_title = ?5,
            format = ?6,
            status = ?7,
            progress = ?8,
            downloaded_bytes = ?9,
            total_bytes = ?10,
            retry_count = ?11,
            error_message = ?12,
            local_path = ?13,
            created_at = ?14,
            updated_at = ?15
        WHERE id = ?1
          AND status NOT IN ('paused', 'cancelled')
        "#,
        params![
            &task.id,
            &task.comic_id,
            &task.comic_title,
            &task.vol_id,
            &task.volume_title,
            &task.format,
            &task.status,
            task.progress,
            task.downloaded_bytes,
            task.total_bytes,
            task.retry_count,
            &task.error_message,
            &task.local_path,
            &task.created_at,
            &task.updated_at
        ],
    )?;
    Ok(changed > 0)
}

pub fn pause_download_task(
    conn: &Connection,
    id: &str,
    updated_at: &str,
) -> Result<DownloadTask, String> {
    let changed = conn
        .execute(
            r#"
            UPDATE download_tasks
            SET status = 'paused',
                updated_at = ?2
            WHERE id = ?1
              AND status IN ('authorizing', 'downloading')
            "#,
            params![id, updated_at],
        )
        .map_err(|error| error.to_string())?;
    let task = require_task(conn, id)?;
    if changed > 0 || task.status == "paused" {
        return Ok(task);
    }
    if !matches!(task.status.as_str(), "authorizing" | "downloading") {
        return Err(format!("cannot pause task while status is {}", task.status));
    }
    Ok(task)
}

pub fn resume_download_task(
    conn: &Connection,
    id: &str,
    updated_at: &str,
) -> Result<DownloadTask, String> {
    let changed = conn
        .execute(
            r#"
            UPDATE download_tasks
            SET status = 'queued',
                progress = 0,
                downloaded_bytes = 0,
                local_path = NULL,
                error_message = ?2,
                updated_at = ?3
            WHERE id = ?1
              AND status = 'paused'
            "#,
            params![id, RESUME_REAUTH_MESSAGE, updated_at],
        )
        .map_err(|error| error.to_string())?;
    let task = require_task(conn, id)?;
    if changed > 0 || task.status == "queued" {
        return Ok(task);
    }
    if task.status != "paused" {
        return Err(format!(
            "cannot resume task while status is {}",
            task.status
        ));
    }
    Ok(task)
}

pub fn cancel_download_task(
    conn: &Connection,
    id: &str,
    updated_at: &str,
) -> Result<DownloadTask, String> {
    let changed = conn
        .execute(
            r#"
            UPDATE download_tasks
            SET status = 'cancelled',
                local_path = NULL,
                updated_at = ?2
            WHERE id = ?1
              AND status NOT IN ('completed', 'cancelled')
            "#,
            params![id, updated_at],
        )
        .map_err(|error| error.to_string())?;
    let task = require_task(conn, id)?;
    if changed > 0 || task.status == "cancelled" {
        return Ok(task);
    }
    if task.status == "completed" {
        return Err(format!(
            "cannot cancel task while status is {}",
            task.status
        ));
    }
    Ok(task)
}

pub fn retry_download_task(
    conn: &Connection,
    id: &str,
    updated_at: &str,
) -> Result<DownloadTask, String> {
    let task = require_task(conn, id)?;
    if !matches!(task.status.as_str(), "failed" | "cancelled") {
        if task.status == "queued" {
            return Ok(task);
        }
        return Err(format!("cannot retry task while status is {}", task.status));
    }
    if task.retry_count >= MAX_RETRY_COUNT {
        return Err(format!("retry limit reached ({MAX_RETRY_COUNT})"));
    }
    if is_policy_error(task.error_message.as_deref().unwrap_or_default()) {
        return Err("policy/quota/permission errors are not retried automatically".to_string());
    }
    let changed = conn
        .execute(
            r#"
            UPDATE download_tasks
            SET status = 'queued',
                progress = 0,
                downloaded_bytes = 0,
                retry_count = retry_count + 1,
                error_message = NULL,
                local_path = NULL,
                updated_at = ?4
            WHERE id = ?1
              AND status = ?2
              AND retry_count = ?3
            "#,
            params![id, &task.status, task.retry_count, updated_at],
        )
        .map_err(|error| error.to_string())?;
    let current = require_task(conn, id)?;
    if changed > 0 || current.status == "queued" {
        return Ok(current);
    }
    Err(format!(
        "cannot retry task while status is {}",
        current.status
    ))
}

pub fn prioritize_download_task(
    conn: &Connection,
    id: &str,
    updated_at: &str,
) -> Result<DownloadTask, String> {
    let task = require_task(conn, id)?;
    if task.status != "queued" {
        return Err(format!(
            "cannot prioritize task while status is {}",
            task.status
        ));
    }
    let priority_created_at = priority_queue_created_at(updated_at);
    let changed = conn
        .execute(
            r#"
            UPDATE download_tasks
            SET created_at = ?2,
                updated_at = ?3
            WHERE id = ?1
              AND status = 'queued'
            "#,
            params![id, &priority_created_at, updated_at],
        )
        .map_err(|error| error.to_string())?;
    let current = require_task(conn, id)?;
    if changed > 0 || current.created_at == priority_created_at {
        return Ok(current);
    }
    Err(format!(
        "cannot prioritize task while status is {}",
        current.status
    ))
}

pub fn insert_downloaded_file(conn: &Connection, file: &DownloadedFile) -> rusqlite::Result<()> {
    conn.execute(
        r#"
        INSERT OR REPLACE INTO downloaded_files (
          id, task_id, comic_id, comic_title, vol_id, volume_title, format,
          local_path, size_bytes, downloaded_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        "#,
        params![
            &file.id,
            &file.task_id,
            &file.comic_id,
            &file.comic_title,
            &file.vol_id,
            &file.volume_title,
            &file.format,
            &file.local_path,
            file.size_bytes,
            &file.downloaded_at
        ],
    )?;
    Ok(())
}

pub fn insert_downloaded_file_if_absent(
    conn: &Connection,
    file: &DownloadedFile,
) -> rusqlite::Result<bool> {
    let changed = conn.execute(
        r#"
        INSERT OR IGNORE INTO downloaded_files (
          id, task_id, comic_id, comic_title, vol_id, volume_title, format,
          local_path, size_bytes, downloaded_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        "#,
        params![
            &file.id,
            &file.task_id,
            &file.comic_id,
            &file.comic_title,
            &file.vol_id,
            &file.volume_title,
            &file.format,
            &file.local_path,
            file.size_bytes,
            &file.downloaded_at
        ],
    )?;
    Ok(changed > 0)
}

pub fn clear_unfinished_tasks(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM download_tasks WHERE status != 'completed'", [])?;
    Ok(())
}

pub fn list_downloaded_files(conn: &Connection) -> rusqlite::Result<Vec<DownloadedFile>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, task_id, comic_id, comic_title, vol_id, volume_title, format,
               local_path, size_bytes, downloaded_at
        FROM downloaded_files
        ORDER BY downloaded_at DESC
        "#,
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(DownloadedFile {
            id: row.get(0)?,
            task_id: row.get(1)?,
            comic_id: row.get(2)?,
            comic_title: row.get(3)?,
            vol_id: row.get(4)?,
            volume_title: row.get(5)?,
            format: row.get(6)?,
            local_path: row.get(7)?,
            size_bytes: row.get(8)?,
            downloaded_at: row.get(9)?,
        })
    })?;
    rows.collect()
}

pub fn list_shelves(conn: &Connection) -> rusqlite::Result<Vec<Shelf>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, name, kind, sort_order, created_at, updated_at, archived_at
        FROM shelves
        ORDER BY sort_order ASC, name ASC
        "#,
    )?;
    let rows = stmt.query_map([], read_shelf)?;
    rows.collect()
}

pub fn upsert_shelf(conn: &Connection, shelf: &Shelf) -> rusqlite::Result<()> {
    conn.execute(
        r#"
        INSERT INTO shelves (id, name, kind, sort_order, created_at, updated_at, archived_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          kind = excluded.kind,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at,
          archived_at = excluded.archived_at
        "#,
        params![
            &shelf.id,
            &shelf.name,
            &shelf.kind,
            shelf.sort_order,
            &shelf.created_at,
            &shelf.updated_at,
            &shelf.archived_at
        ],
    )?;
    Ok(())
}

pub fn list_shelf_items(conn: &Connection) -> rusqlite::Result<Vec<ShelfItem>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, shelf_id, comic_id, comic_title, comic_url, cover_url, comic_status, latest_volume,
               last_read_volume_id, last_read_label, unread_count, cached, archived,
               added_at, updated_at, last_read_at, last_update_at
        FROM shelf_items
        ORDER BY updated_at DESC, comic_title ASC
        "#,
    )?;
    let rows = stmt.query_map([], read_shelf_item)?;
    rows.collect()
}

pub fn upsert_shelf_item(conn: &Connection, item: &ShelfItem) -> rusqlite::Result<()> {
    conn.execute(
        r#"
        INSERT INTO shelf_items (
          id, shelf_id, comic_id, comic_title, comic_url, cover_url, comic_status, latest_volume,
          last_read_volume_id, last_read_label, unread_count, cached, archived,
          added_at, updated_at, last_read_at, last_update_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
        ON CONFLICT(shelf_id, comic_id) DO UPDATE SET
          comic_title = excluded.comic_title,
          comic_url = excluded.comic_url,
          cover_url = excluded.cover_url,
          comic_status = excluded.comic_status,
          latest_volume = excluded.latest_volume,
          last_read_volume_id = excluded.last_read_volume_id,
          last_read_label = excluded.last_read_label,
          unread_count = excluded.unread_count,
          cached = excluded.cached,
          archived = excluded.archived,
          updated_at = excluded.updated_at,
          last_read_at = excluded.last_read_at,
          last_update_at = excluded.last_update_at
        "#,
        params![
            &item.id,
            &item.shelf_id,
            &item.comic_id,
            &item.comic_title,
            &item.comic_url,
            &item.cover_url,
            &item.comic_status,
            &item.latest_volume,
            &item.last_read_volume_id,
            &item.last_read_label,
            item.unread_count,
            item.cached,
            item.archived,
            &item.added_at,
            &item.updated_at,
            &item.last_read_at,
            &item.last_update_at
        ],
    )?;
    Ok(())
}

pub fn remove_shelf_items(conn: &Connection, comic_ids: &[String]) -> rusqlite::Result<usize> {
    let mut removed = 0;
    for comic_id in comic_ids {
        removed += conn.execute(
            "DELETE FROM shelf_items WHERE comic_id = ?1",
            params![comic_id],
        )?;
    }
    Ok(removed)
}

pub fn get_reading_progress(
    conn: &Connection,
    comic_id: &str,
    volume_id: &str,
) -> rusqlite::Result<Option<ReadingProgress>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, comic_id, comic_title, volume_id, volume_title, page_index, page_count,
               progress_percent, last_read_at, finished, reading_mode, reading_direction,
               page_layout, zoom, rotation, crop_json, spread_overrides_json, updated_at
        FROM reading_progress
        WHERE comic_id = ?1 AND volume_id = ?2
        LIMIT 1
        "#,
    )?;
    let mut rows = stmt.query_map(params![comic_id, volume_id], read_reading_progress)?;
    rows.next().transpose()
}

pub fn list_reading_progress(conn: &Connection) -> rusqlite::Result<Vec<ReadingProgress>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, comic_id, comic_title, volume_id, volume_title, page_index, page_count,
               progress_percent, last_read_at, finished, reading_mode, reading_direction,
               page_layout, zoom, rotation, crop_json, spread_overrides_json, updated_at
        FROM reading_progress
        ORDER BY last_read_at DESC
        "#,
    )?;
    let rows = stmt.query_map([], read_reading_progress)?;
    rows.collect()
}

pub fn save_reading_progress(
    conn: &Connection,
    input: &SaveReadingProgressInput,
) -> rusqlite::Result<()> {
    let progress = &input.progress;
    conn.execute(
        r#"
        INSERT INTO reading_progress (
          id, comic_id, comic_title, volume_id, volume_title, page_index, page_count,
          progress_percent, last_read_at, finished, reading_mode, reading_direction,
          page_layout, zoom, rotation, crop_json, spread_overrides_json, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
        ON CONFLICT(comic_id, volume_id) DO UPDATE SET
          comic_title = excluded.comic_title,
          volume_title = excluded.volume_title,
          page_index = excluded.page_index,
          page_count = excluded.page_count,
          progress_percent = excluded.progress_percent,
          last_read_at = excluded.last_read_at,
          finished = excluded.finished,
          reading_mode = excluded.reading_mode,
          reading_direction = excluded.reading_direction,
          page_layout = excluded.page_layout,
          zoom = excluded.zoom,
          rotation = excluded.rotation,
          crop_json = excluded.crop_json,
          spread_overrides_json = excluded.spread_overrides_json,
          updated_at = excluded.updated_at
        "#,
        params![
            &progress.id,
            &progress.comic_id,
            &progress.comic_title,
            &progress.volume_id,
            &progress.volume_title,
            progress.page_index,
            progress.page_count,
            progress.progress_percent,
            &progress.last_read_at,
            progress.finished,
            &progress.reading_mode,
            &progress.reading_direction,
            &progress.page_layout,
            progress.zoom,
            progress.rotation,
            &progress.crop_json,
            &progress.spread_overrides_json,
            &progress.updated_at
        ],
    )?;

    if let Some(history) = &input.history {
        insert_reading_history(conn, history)?;
    }
    Ok(())
}

pub fn insert_reading_history(
    conn: &Connection,
    history: &ReadingHistoryEntry,
) -> rusqlite::Result<()> {
    conn.execute(
        r#"
        INSERT OR REPLACE INTO reading_history (
          id, comic_id, comic_title, volume_id, volume_title, page_index,
          progress_percent, event, read_at, duration_seconds
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        "#,
        params![
            &history.id,
            &history.comic_id,
            &history.comic_title,
            &history.volume_id,
            &history.volume_title,
            history.page_index,
            history.progress_percent,
            &history.event,
            &history.read_at,
            history.duration_seconds
        ],
    )?;
    Ok(())
}

pub fn save_chapter_cache(
    conn: &Connection,
    input: &SaveChapterCacheInput,
) -> rusqlite::Result<()> {
    let chapter = &input.chapter;
    let effective_chapter_id =
        find_chapter_cache_id(conn, chapter)?.unwrap_or_else(|| chapter.id.clone());
    conn.execute(
        r#"
        INSERT INTO chapter_cache (
          id, comic_id, comic_title, volume_id, volume_title, format, cache_kind,
          source_task_id, cache_dir, size_bytes, page_count, status, policy,
          last_accessed_at, created_at, updated_at, expires_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
        ON CONFLICT(comic_id, volume_id, format, cache_kind) DO UPDATE SET
          comic_title = excluded.comic_title,
          volume_title = excluded.volume_title,
          source_task_id = excluded.source_task_id,
          cache_dir = excluded.cache_dir,
          size_bytes = excluded.size_bytes,
          page_count = excluded.page_count,
          status = excluded.status,
          policy = excluded.policy,
          last_accessed_at = excluded.last_accessed_at,
          updated_at = excluded.updated_at,
          expires_at = excluded.expires_at
        "#,
        params![
            &effective_chapter_id,
            &chapter.comic_id,
            &chapter.comic_title,
            &chapter.volume_id,
            &chapter.volume_title,
            &chapter.format,
            &chapter.cache_kind,
            &chapter.source_task_id,
            &chapter.cache_dir,
            chapter.size_bytes,
            chapter.page_count,
            &chapter.status,
            &chapter.policy,
            &chapter.last_accessed_at,
            &chapter.created_at,
            &chapter.updated_at,
            &chapter.expires_at
        ],
    )?;
    conn.execute(
        "DELETE FROM page_cache WHERE chapter_cache_id = ?1",
        params![&effective_chapter_id],
    )?;
    for page in &input.pages {
        upsert_page_cache_for_chapter(conn, page, &effective_chapter_id)?;
    }
    Ok(())
}

fn find_chapter_cache_id(
    conn: &Connection,
    chapter: &ChapterCache,
) -> rusqlite::Result<Option<String>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id
        FROM chapter_cache
        WHERE comic_id = ?1 AND volume_id = ?2 AND format = ?3 AND cache_kind = ?4
        LIMIT 1
        "#,
    )?;
    let mut rows = stmt.query_map(
        params![
            &chapter.comic_id,
            &chapter.volume_id,
            &chapter.format,
            &chapter.cache_kind
        ],
        |row| row.get::<_, String>(0),
    )?;
    rows.next().transpose()
}

pub fn list_chapter_cache(conn: &Connection) -> rusqlite::Result<Vec<ChapterCache>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, comic_id, comic_title, volume_id, volume_title, format, cache_kind,
               source_task_id, cache_dir, size_bytes, page_count, status, policy,
               last_accessed_at, created_at, updated_at, expires_at
        FROM chapter_cache
        ORDER BY last_accessed_at DESC
        "#,
    )?;
    let rows = stmt.query_map([], read_chapter_cache)?;
    rows.collect()
}

pub fn list_page_cache_for_chapter(
    conn: &Connection,
    chapter_cache_id: &str,
) -> rusqlite::Result<Vec<PageCache>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, chapter_cache_id, comic_id, volume_id, page_index, file_path,
               width, height, size_bytes, created_at, last_accessed_at
        FROM page_cache
        WHERE chapter_cache_id = ?1
        ORDER BY page_index ASC
        "#,
    )?;
    let rows = stmt.query_map(params![chapter_cache_id], read_page_cache)?;
    rows.collect()
}

pub fn cache_stats(conn: &Connection) -> rusqlite::Result<CacheStats> {
    let mut stats = CacheStats {
        total_bytes: 0,
        permanent_download_bytes: 0,
        reading_cache_bytes: 0,
        metadata_cache_bytes: 0,
        chapter_count: conn
            .query_row("SELECT COUNT(*) FROM chapter_cache", [], |row| row.get(0))?,
        page_count: conn.query_row("SELECT COUNT(*) FROM page_cache", [], |row| row.get(0))?,
    };
    let mut stmt = conn.prepare(
        "SELECT cache_kind, COALESCE(SUM(size_bytes), 0) FROM chapter_cache GROUP BY cache_kind",
    )?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let kind: String = row.get(0)?;
        let bytes: i64 = row.get(1)?;
        stats.total_bytes += bytes;
        match kind.as_str() {
            "permanent_download" => stats.permanent_download_bytes += bytes,
            "reading_cache" | "reading" => stats.reading_cache_bytes += bytes,
            "metadata_cache" | "metadata" => stats.metadata_cache_bytes += bytes,
            _ => {}
        }
    }
    Ok(stats)
}

pub fn clear_reading_cache(
    conn: &Connection,
    chapter_ids: Option<&[String]>,
) -> rusqlite::Result<usize> {
    let ids = if let Some(ids) = chapter_ids {
        ids.to_vec()
    } else {
        let mut stmt = conn.prepare(
            "SELECT id FROM chapter_cache WHERE cache_kind IN ('reading_cache', 'reading')",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };

    let mut removed = 0;
    for id in ids {
        conn.execute(
            "DELETE FROM page_cache WHERE chapter_cache_id = ?1",
            params![&id],
        )?;
        removed += conn.execute(
            "DELETE FROM chapter_cache WHERE id = ?1 AND cache_kind IN ('reading_cache', 'reading')",
            params![&id],
        )?;
    }
    Ok(removed)
}

pub fn set_setting(
    conn: &Connection,
    key: &str,
    value: &str,
    updated_at: &str,
) -> rusqlite::Result<()> {
    conn.execute(
        r#"
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        "#,
        params![key, value, updated_at],
    )?;
    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM app_settings WHERE key = ?1 LIMIT 1")?;
    let mut rows = stmt.query(params![key])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn delete_setting(conn: &Connection, key: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM app_settings WHERE key = ?1", params![key])?;
    Ok(())
}

fn upsert_page_cache_for_chapter(
    conn: &Connection,
    page: &PageCache,
    chapter_cache_id: &str,
) -> rusqlite::Result<()> {
    conn.execute(
        r#"
        INSERT INTO page_cache (
          id, chapter_cache_id, comic_id, volume_id, page_index, file_path,
          width, height, size_bytes, created_at, last_accessed_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        ON CONFLICT(chapter_cache_id, page_index) DO UPDATE SET
          file_path = excluded.file_path,
          width = excluded.width,
          height = excluded.height,
          size_bytes = excluded.size_bytes,
          last_accessed_at = excluded.last_accessed_at
        "#,
        params![
            &page.id,
            chapter_cache_id,
            &page.comic_id,
            &page.volume_id,
            page.page_index,
            &page.file_path,
            page.width,
            page.height,
            page.size_bytes,
            &page.created_at,
            &page.last_accessed_at
        ],
    )?;
    Ok(())
}

fn require_task(conn: &Connection, id: &str) -> Result<DownloadTask, String> {
    get_download_task(conn, id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("download task not found: {id}"))
}

fn is_policy_error(message: &str) -> bool {
    let normalized = message.to_lowercase();
    [
        "vip",
        "lv2",
        "lv3",
        "level",
        "quota",
        "insufficient",
        "权限不足",
        "權限不足",
        "没有下载权限",
        "沒有下載權限",
        "no permission",
        "額度",
        "额度",
        "真實驗證",
        "真实验证",
        "true verification",
        "verification",
        "暫不可下載",
        "暂不可下载",
        "製作中",
        "制作中",
    ]
    .iter()
    .any(|needle| normalized.contains(needle))
}

#[cfg(test)]
#[path = "db_tests.rs"]
mod tests;
