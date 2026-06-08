use crate::models::{
    AppConfig, CacheStats, CatalogQueryInput, ChapterCache, DeleteLocalReadingDataInput,
    DeleteLocalReadingDataResult, DownloadPreflight, DownloadPreflightCheck, DownloadTask,
    DownloadedFile, LoginInput, MigrationSnapshotImportResult, PageCache,
    PrepareReaderChapterCacheInput, PreparedReaderChapterCache, ReaderCachedPageImage,
    ReadingProgress, SaveChapterCacheInput, SaveReadingProgressInput, Shelf, ShelfItem,
};
use crate::reader::ReaderArchiveManifest;
use crate::web_adapter::KmoeHttpClient;
use crate::{db, fs_utils, http, queue, reader};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde_json::Value;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::State;

#[path = "commands_open_spec.rs"]
mod commands_open_spec;
use commands_open_spec::open_command_spec;
#[cfg(test)]
use commands_open_spec::OpenCommandSpec;

const MAX_READER_PAGE_BYTES: u64 = 64 * 1024 * 1024;

#[tauri::command]
pub fn get_app_config() -> Result<AppConfig, String> {
    let download_dir = read_download_dir_setting()?;
    Ok(AppConfig {
        concurrency: 1,
        download_dir,
    })
}

#[tauri::command]
pub fn set_download_dir(path: String) -> Result<String, String> {
    let normalized = ensure_download_dir_for_platform(Some(path))?;
    let value = normalized.to_string_lossy().to_string();
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    db::set_setting(&conn, "download_dir", &value, &timestamp())
        .map_err(|error| error.to_string())?;
    Ok(value)
}

#[tauri::command]
pub fn get_download_dir() -> Result<String, String> {
    read_download_dir_setting()
}

fn read_download_dir_setting() -> Result<String, String> {
    if is_ios_runtime() {
        return Ok(mobile_download_dir());
    }

    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    db::get_setting(&conn, "download_dir")
        .map_err(|error| error.to_string())
        .map(|value| value.unwrap_or_else(fs_utils::default_download_dir))
}

#[tauri::command]
pub fn enqueue_download_tasks(tasks: Vec<DownloadTask>) -> Result<Vec<DownloadTask>, String> {
    let mut inserted = Vec::new();
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    for task in tasks {
        validate_native_task_shape(&task)?;
        if db::insert_download_task_if_absent(&conn, &task).map_err(|error| error.to_string())? {
            inserted.push(task);
        }
    }
    Ok(inserted)
}

#[tauri::command]
pub fn list_download_tasks(recover_interrupted: Option<bool>) -> Result<Vec<DownloadTask>, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    list_download_tasks_with_conn(
        &conn,
        recover_interrupted,
        queue::is_download_queue_running(None),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_downloaded_files() -> Result<Vec<DownloadedFile>, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    db::list_downloaded_files(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn link_downloaded_file(
    file: DownloadedFile,
    local_path: String,
) -> Result<Vec<DownloadedFile>, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    link_downloaded_file_into_conn(&conn, file, &local_path, &timestamp())
}

#[tauri::command]
pub async fn start_download_queue(
    client: State<'_, KmoeHttpClient>,
    download_dir: Option<String>,
) -> Result<(), String> {
    let download_dir = Some(
        ensure_download_dir_for_platform(download_dir)?
            .to_string_lossy()
            .to_string(),
    );
    match client.session_is_authenticated().await {
        Ok(true) => {}
        Ok(false) => {
            return Err("登录状态已失效，请重新登录后再启动下载队列。".to_string());
        }
        Err(error) => {
            return Err(format!("暂时无法确认登录状态：{error}"));
        }
    }

    queue::process_download_queue(&client, download_dir).await?;
    Ok(())
}

#[tauri::command]
pub fn preflight_download_queue(download_dir: Option<String>) -> DownloadPreflight {
    match db::open_default_connection() {
        Ok(conn) => preflight_download_queue_with_conn(&conn, download_dir),
        Err(error) => {
            let mut preflight = empty_preflight();
            push_preflight_check(
                &mut preflight.checks,
                "sqlite",
                "本地数据库",
                "fail",
                format!("无法打开本地资料库：{error}"),
            );
            finalize_preflight(preflight)
        }
    }
}

#[tauri::command]
pub fn pause_download_task(id: String) -> Result<(), String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    db::pause_download_task(&conn, &id, &timestamp())?;
    Ok(())
}

#[tauri::command]
pub fn resume_download_task(id: String) -> Result<(), String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    db::resume_download_task(&conn, &id, &timestamp())?;
    Ok(())
}

#[tauri::command]
pub fn cancel_download_task(id: String) -> Result<(), String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    db::cancel_download_task(&conn, &id, &timestamp())?;
    Ok(())
}

#[tauri::command]
pub fn retry_download_task(id: String) -> Result<(), String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    db::retry_download_task(&conn, &id, &timestamp())?;
    Ok(())
}

#[tauri::command]
pub fn prioritize_download_task(id: String) -> Result<DownloadTask, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    db::prioritize_download_task(&conn, &id, &timestamp())
}

#[tauri::command]
pub fn open_file(path: String) -> Result<String, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    let target = resolve_open_file_target(&conn, &path)?;
    open_path(&target, false)?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub fn reveal_in_folder(path: String) -> Result<String, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    let target = resolve_reveal_target(&conn, &path)?;
    open_path(&target, true)?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub fn clear_queue() -> Result<(), String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    db::clear_unfinished_tasks(&conn).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_migration_snapshot(snapshot_json: String) -> Result<String, String> {
    let download_dir = read_download_dir_setting()?;
    save_migration_snapshot_to_dir(&snapshot_json, &download_dir, &timestamp())
}

#[tauri::command]
pub fn import_migration_snapshot(
    snapshot_json: String,
) -> Result<MigrationSnapshotImportResult, String> {
    import_migration_snapshot_json(&snapshot_json, &timestamp())
}

#[tauri::command]
pub fn list_shelves() -> Result<Vec<Shelf>, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    db::list_shelves(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn upsert_shelf(shelf: Shelf) -> Result<Vec<Shelf>, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    db::upsert_shelf(&conn, &shelf).map_err(|error| error.to_string())?;
    db::list_shelves(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_shelf_items() -> Result<Vec<ShelfItem>, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    db::list_shelf_items(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn upsert_shelf_item(item: ShelfItem) -> Result<Vec<ShelfItem>, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    db::upsert_shelf_item(&conn, &item).map_err(|error| error.to_string())?;
    db::list_shelf_items(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn remove_shelf_items(comic_ids: Vec<String>) -> Result<Vec<ShelfItem>, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    db::remove_shelf_items(&conn, &comic_ids).map_err(|error| error.to_string())?;
    db::list_shelf_items(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_reading_progress(
    comic_id: String,
    volume_id: String,
) -> Result<Option<ReadingProgress>, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    db::get_reading_progress(&conn, &comic_id, &volume_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_reading_progress() -> Result<Vec<ReadingProgress>, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    db::list_reading_progress(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_reading_progress(input: SaveReadingProgressInput) -> Result<ReadingProgress, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    db::save_reading_progress(&conn, &input).map_err(|error| error.to_string())?;
    db::get_reading_progress(&conn, &input.progress.comic_id, &input.progress.volume_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "阅读进度保存失败，请稍后重试。".to_string())
}

#[tauri::command]
pub fn save_chapter_cache(input: SaveChapterCacheInput) -> Result<ChapterCache, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    validate_chapter_cache_under_root(&input, &reader_cache_root())?;
    db::save_chapter_cache(&conn, &input).map_err(|error| error.to_string())?;
    db::list_chapter_cache(&conn)
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|chapter| {
            chapter.id == input.chapter.id
                || (chapter.comic_id == input.chapter.comic_id
                    && chapter.volume_id == input.chapter.volume_id
                    && chapter.format == input.chapter.format
                    && chapter.cache_kind == input.chapter.cache_kind)
        })
        .ok_or_else(|| "章节缓存记录保存失败，请稍后重试。".to_string())
}

#[tauri::command]
pub fn list_chapter_cache() -> Result<Vec<ChapterCache>, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    db::list_chapter_cache(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_cached_chapter_pages(chapter_cache_id: String) -> Result<Vec<PageCache>, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    db::list_page_cache_for_chapter(&conn, &chapter_cache_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_cache_stats() -> Result<CacheStats, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    db::cache_stats(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn clear_reading_cache(chapter_ids: Option<Vec<String>>) -> Result<CacheStats, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    clear_reading_cache_with_root(&conn, chapter_ids.as_deref(), &reader_cache_root())
}

#[tauri::command]
pub fn delete_local_reading_data(
    input: DeleteLocalReadingDataInput,
) -> Result<DeleteLocalReadingDataResult, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    delete_local_reading_data_with_root(&conn, input, &reader_cache_root())
}

#[tauri::command]
pub fn set_ios_status_bar_hidden(hidden: bool) -> Result<bool, String> {
    set_ios_status_bar_hidden_for_platform(hidden)
}

#[tauri::command]
pub fn list_reader_archive_pages(path: String) -> Result<ReaderArchiveManifest, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    list_reader_archive_pages_with_conn(&conn, &path)
}

#[tauri::command]
pub fn prepare_reader_chapter_cache(
    input: PrepareReaderChapterCacheInput,
) -> Result<PreparedReaderChapterCache, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    prepare_reader_chapter_cache_with_conn(&conn, input)
}

#[tauri::command]
pub fn repair_reader_chapter_cache(
    chapter_cache_id: String,
) -> Result<PreparedReaderChapterCache, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    repair_reader_chapter_cache_with_conn(&conn, &chapter_cache_id)
}

#[tauri::command]
pub fn read_cached_reader_page(
    chapter_cache_id: String,
    page_index: i64,
) -> Result<ReaderCachedPageImage, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    read_cached_reader_page_with_root(&conn, &chapter_cache_id, page_index, &reader_cache_root())
}

#[tauri::command]
pub async fn kmoe_login(
    client: State<'_, KmoeHttpClient>,
    input: LoginInput,
) -> Result<String, String> {
    client.login(input).await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn kmoe_fetch_catalog(
    client: State<'_, KmoeHttpClient>,
    query: CatalogQueryInput,
) -> Result<String, String> {
    client
        .fetch_catalog(query)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn kmoe_fetch_cover_image(
    client: State<'_, KmoeHttpClient>,
    url: String,
) -> Result<String, String> {
    client.fetch_cover_image_data_url(&url).await
}

#[tauri::command]
pub async fn kmoe_fetch_comic_detail_html(
    client: State<'_, KmoeHttpClient>,
    comic_id: String,
) -> Result<String, String> {
    client.fetch_detail_html(&comic_id).await
}

#[tauri::command]
pub async fn kmoe_fetch_book_data(
    client: State<'_, KmoeHttpClient>,
    path: String,
) -> Result<String, String> {
    client.fetch_book_data(&path).await
}

#[tauri::command]
pub async fn kmoe_fetch_user_profile_html(
    client: State<'_, KmoeHttpClient>,
) -> Result<String, String> {
    client.fetch_user_profile_html().await
}

#[tauri::command]
pub async fn kmoe_logout(client: State<'_, KmoeHttpClient>) -> Result<String, String> {
    client.logout().await.map_err(|error| error.to_string())
}

fn timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    format!("{seconds}")
}

fn resolve_open_file_target(conn: &rusqlite::Connection, path: &str) -> Result<PathBuf, String> {
    let target = fs_utils::normalize_existing_file(path)?;
    ensure_open_target_allowed(conn, &target)?;
    Ok(target)
}

fn list_reader_archive_pages_with_conn(
    conn: &rusqlite::Connection,
    path: &str,
) -> Result<ReaderArchiveManifest, String> {
    let target = resolve_open_file_target(conn, path)?;
    reader::enumerate_cbz_images(&target).map_err(reader_archive_error_message)
}

fn prepare_reader_chapter_cache_with_conn(
    conn: &rusqlite::Connection,
    input: PrepareReaderChapterCacheInput,
) -> Result<PreparedReaderChapterCache, String> {
    prepare_reader_chapter_cache_with_root(conn, input, &reader_cache_root())
}

fn repair_reader_chapter_cache_with_conn(
    conn: &rusqlite::Connection,
    chapter_cache_id: &str,
) -> Result<PreparedReaderChapterCache, String> {
    repair_reader_chapter_cache_with_root(conn, chapter_cache_id, &reader_cache_root())
}

fn clear_reading_cache_with_root(
    conn: &rusqlite::Connection,
    chapter_ids: Option<&[String]>,
    cache_root: &Path,
) -> Result<CacheStats, String> {
    let targets = reader_cache_clear_targets(conn, chapter_ids)?;
    let cache_dirs = safe_reader_cache_dirs(cache_root, &targets)?;
    db::clear_reading_cache(conn, chapter_ids).map_err(|error| error.to_string())?;
    for dir in cache_dirs {
        match std::fs::remove_dir_all(&dir) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!("failed to remove reading cache directory: {error}"));
            }
        }
    }
    db::cache_stats(conn).map_err(|error| error.to_string())
}

fn delete_local_reading_data_with_root(
    conn: &rusqlite::Connection,
    input: DeleteLocalReadingDataInput,
    cache_root: &Path,
) -> Result<DeleteLocalReadingDataResult, String> {
    let chapter_ids = normalize_optional_ids(input.chapter_ids);
    let comic_ids = normalize_optional_ids(input.comic_ids);
    let volume_ids = normalize_optional_ids(input.volume_ids);
    let include_source_files = input.include_source_files.unwrap_or(false);
    let targets = local_reading_data_cache_targets(
        conn,
        comic_ids.as_deref(),
        volume_ids.as_deref(),
        chapter_ids.as_deref(),
    )?;
    safe_reader_cache_dirs(cache_root, &targets)?;
    let target_chapter_ids = targets
        .iter()
        .map(|chapter| chapter.id.clone())
        .collect::<Vec<_>>();

    let source_files = if include_source_files {
        local_reading_data_source_files(
            conn,
            comic_ids.as_deref(),
            volume_ids.as_deref(),
            &targets,
            chapter_ids.as_deref().is_some(),
        )?
    } else {
        Vec::new()
    };
    let removable_task_ids = if include_source_files {
        removable_reader_source_task_ids(
            conn,
            comic_ids.as_deref(),
            volume_ids.as_deref(),
            &targets,
        )?
    } else {
        Vec::new()
    };

    let mut deleted_file_count = 0usize;
    let mut missing_file_count = 0usize;
    for file in &source_files {
        if is_metadata_only_downloaded_file(file) {
            missing_file_count += 1;
            continue;
        }
        match delete_recorded_reader_source_file(conn, file) {
            Ok(FileDeleteOutcome::Deleted) => deleted_file_count += 1,
            Ok(FileDeleteOutcome::Missing) => missing_file_count += 1,
            Err(error) => return Err(error),
        }
    }

    let cache_stats = if target_chapter_ids.is_empty() {
        db::cache_stats(conn).map_err(|error| error.to_string())?
    } else {
        clear_reading_cache_with_root(conn, Some(&target_chapter_ids), cache_root)?
    };

    let removed_file_ids = source_files
        .iter()
        .map(|file| file.id.clone())
        .collect::<Vec<_>>();
    if !removed_file_ids.is_empty() {
        db::remove_downloaded_files(conn, &removed_file_ids).map_err(|error| error.to_string())?;
    }
    if !removable_task_ids.is_empty() {
        db::remove_download_tasks(conn, &removable_task_ids).map_err(|error| error.to_string())?;
    }

    Ok(DeleteLocalReadingDataResult {
        cache_stats,
        removed_chapter_ids: target_chapter_ids,
        removed_file_ids,
        removed_task_ids: removable_task_ids,
        deleted_file_count,
        missing_file_count,
        tasks: db::list_download_tasks(conn).map_err(|error| error.to_string())?,
        library: db::list_downloaded_files(conn).map_err(|error| error.to_string())?,
    })
}

enum FileDeleteOutcome {
    Deleted,
    Missing,
}

fn normalize_optional_ids(ids: Option<Vec<String>>) -> Option<Vec<String>> {
    ids.map(|values| {
        let mut normalized = values
            .into_iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>();
        normalized.sort();
        normalized.dedup();
        normalized
    })
    .filter(|values| !values.is_empty())
}

fn local_reading_data_cache_targets(
    conn: &rusqlite::Connection,
    comic_ids: Option<&[String]>,
    volume_ids: Option<&[String]>,
    chapter_ids: Option<&[String]>,
) -> Result<Vec<ChapterCache>, String> {
    let comic_set = set_from_slice(comic_ids);
    let volume_set = set_from_slice(volume_ids);
    let chapter_set = set_from_slice(chapter_ids);
    db::list_chapter_cache(conn)
        .map_err(|error| error.to_string())
        .map(|chapters| {
            chapters
                .into_iter()
                .filter(|chapter| {
                    matches!(chapter.cache_kind.as_str(), "reading_cache" | "reading")
                })
                .filter(|chapter| {
                    chapter_set
                        .as_ref()
                        .map(|ids| ids.contains(&chapter.id))
                        .unwrap_or(true)
                })
                .filter(|chapter| {
                    comic_set
                        .as_ref()
                        .map(|ids| ids.contains(&chapter.comic_id))
                        .unwrap_or(true)
                })
                .filter(|chapter| {
                    volume_set
                        .as_ref()
                        .map(|ids| ids.contains(&chapter.volume_id))
                        .unwrap_or(true)
                })
                .collect()
        })
}

fn local_reading_data_source_files(
    conn: &rusqlite::Connection,
    comic_ids: Option<&[String]>,
    volume_ids: Option<&[String]>,
    cache_targets: &[ChapterCache],
    scoped_by_chapter_ids: bool,
) -> Result<Vec<DownloadedFile>, String> {
    let comic_set = set_from_slice(comic_ids);
    let volume_set = set_from_slice(volume_ids);
    let chapter_pairs = cache_targets
        .iter()
        .map(|chapter| (chapter.comic_id.clone(), chapter.volume_id.clone()))
        .collect::<HashSet<_>>();
    db::list_downloaded_files(conn)
        .map_err(|error| error.to_string())
        .map(|files| {
            files
                .into_iter()
                .filter(|file| is_reader_archive_format(&file.format))
                .filter(|file| {
                    comic_set
                        .as_ref()
                        .map(|ids| ids.contains(&file.comic_id))
                        .unwrap_or(true)
                })
                .filter(|file| {
                    volume_set
                        .as_ref()
                        .map(|ids| ids.contains(&file.vol_id))
                        .unwrap_or(true)
                })
                .filter(|file| {
                    if scoped_by_chapter_ids && comic_set.is_none() && volume_set.is_none() {
                        return chapter_pairs
                            .contains(&(file.comic_id.clone(), file.vol_id.clone()));
                    }
                    true
                })
                .collect()
        })
}

fn removable_reader_source_task_ids(
    conn: &rusqlite::Connection,
    comic_ids: Option<&[String]>,
    volume_ids: Option<&[String]>,
    cache_targets: &[ChapterCache],
) -> Result<Vec<String>, String> {
    let comic_set = set_from_slice(comic_ids);
    let volume_set = set_from_slice(volume_ids);
    let target_pairs = cache_targets
        .iter()
        .map(|chapter| (chapter.comic_id.clone(), chapter.volume_id.clone()))
        .collect::<HashSet<_>>();
    let tasks = db::list_download_tasks(conn).map_err(|error| error.to_string())?;
    let matching = tasks
        .into_iter()
        .filter(|task| is_reader_archive_format(&task.format))
        .filter(|task| {
            comic_set
                .as_ref()
                .map(|ids| ids.contains(&task.comic_id))
                .unwrap_or(true)
        })
        .filter(|task| {
            volume_set
                .as_ref()
                .map(|ids| ids.contains(&task.vol_id))
                .unwrap_or(true)
        })
        .filter(|task| {
            if comic_set.is_none() && volume_set.is_none() && !target_pairs.is_empty() {
                return target_pairs.contains(&(task.comic_id.clone(), task.vol_id.clone()));
            }
            true
        })
        .collect::<Vec<_>>();

    if let Some(active) = matching.iter().find(|task| {
        matches!(
            task.status.as_str(),
            "authorizing" | "downloading" | "verifying"
        )
    }) {
        return Err(format!(
            "cannot delete local reading data while task {} is {}",
            active.id, active.status
        ));
    }

    let mut ids = matching
        .into_iter()
        .filter(|task| matches!(task.status.as_str(), "completed" | "failed" | "cancelled"))
        .map(|task| task.id)
        .collect::<Vec<_>>();
    ids.sort();
    ids.dedup();
    Ok(ids)
}

fn delete_recorded_reader_source_file(
    conn: &rusqlite::Connection,
    file: &DownloadedFile,
) -> Result<FileDeleteOutcome, String> {
    let target = fs_utils::normalize_user_path(&file.local_path)?;
    if !target.exists() {
        return Ok(FileDeleteOutcome::Missing);
    }
    if !target.is_file() {
        return Err("registered local reading file is not a file".to_string());
    }
    ensure_open_target_allowed(conn, &target)?;
    match std::fs::remove_file(&target) {
        Ok(()) => Ok(FileDeleteOutcome::Deleted),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(FileDeleteOutcome::Missing)
        }
        Err(error) => Err(format!("failed to delete local reading file: {error}")),
    }
}

fn set_from_slice(values: Option<&[String]>) -> Option<HashSet<String>> {
    values.map(|items| items.iter().cloned().collect::<HashSet<_>>())
}

fn is_metadata_only_downloaded_file(file: &DownloadedFile) -> bool {
    file.local_path.starts_with("Imported metadata only/")
}

fn reader_cache_clear_targets(
    conn: &rusqlite::Connection,
    chapter_ids: Option<&[String]>,
) -> Result<Vec<ChapterCache>, String> {
    let requested = chapter_ids.map(|ids| ids.iter().cloned().collect::<HashSet<_>>());
    db::list_chapter_cache(conn)
        .map_err(|error| error.to_string())
        .map(|chapters| {
            chapters
                .into_iter()
                .filter(|chapter| {
                    matches!(chapter.cache_kind.as_str(), "reading_cache" | "reading")
                })
                .filter(|chapter| {
                    requested
                        .as_ref()
                        .map(|ids| ids.contains(&chapter.id))
                        .unwrap_or(true)
                })
                .collect()
        })
}

fn safe_reader_cache_dirs(
    cache_root: &Path,
    chapters: &[ChapterCache],
) -> Result<Vec<PathBuf>, String> {
    if chapters.is_empty() {
        return Ok(Vec::new());
    }
    std::fs::create_dir_all(cache_root)
        .map_err(|error| format!("failed to create reader cache root: {error}"))?;
    let canonical_root = canonicalize_existing_path(cache_root, "reader cache root")?;
    let mut dirs = Vec::new();
    for chapter in chapters {
        let cache_dir = chapter.cache_dir.trim();
        if cache_dir.is_empty() {
            continue;
        }
        let path = fs_utils::normalize_user_path(cache_dir)?;
        if !path.exists() {
            continue;
        }
        if !path.is_dir() {
            return Err("registered reading cache path is not a directory".to_string());
        }
        let canonical_dir = canonicalize_existing_path(&path, "reader cache directory")?;
        if canonical_dir == canonical_root || !canonical_dir.starts_with(&canonical_root) {
            return Err(
                "registered reading cache directory is outside the reader cache root".to_string(),
            );
        }
        dirs.push(canonical_dir);
    }
    dirs.sort();
    dirs.dedup();
    Ok(dirs)
}

fn repair_reader_chapter_cache_with_root(
    conn: &rusqlite::Connection,
    chapter_cache_id: &str,
    cache_root: &Path,
) -> Result<PreparedReaderChapterCache, String> {
    let chapter = db::list_chapter_cache(conn)
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|chapter| chapter.id == chapter_cache_id)
        .ok_or_else(|| "章节缓存不存在，请从资料库重新准备阅读缓存。".to_string())?;

    if !matches!(chapter.cache_kind.as_str(), "reading_cache" | "reading") {
        return Err("该记录不是可修复的阅读缓存。".to_string());
    }
    if !is_reader_archive_format(&chapter.format) {
        return Err("当前阅读缓存不是 EPUB 或源图 ZIP 格式，无法重新解包。".to_string());
    }

    let source_file = find_reader_repair_source_archive(conn, &chapter)?;
    let archive_path = resolve_reader_repair_archive_path(conn, &source_file)?;
    let input = PrepareReaderChapterCacheInput {
        archive_path: archive_path.to_string_lossy().to_string(),
        comic_id: chapter.comic_id,
        comic_title: chapter.comic_title,
        volume_id: chapter.volume_id,
        volume_title: chapter.volume_title,
        source_task_id: source_file.task_id.or(chapter.source_task_id),
        format: Some(source_file.format.clone()),
        policy: chapter.policy,
    };
    prepare_reader_chapter_cache_with_root(conn, input, cache_root)
}

fn prepare_reader_chapter_cache_with_root(
    conn: &rusqlite::Connection,
    input: PrepareReaderChapterCacheInput,
    cache_root: &Path,
) -> Result<PreparedReaderChapterCache, String> {
    let target = resolve_open_file_target(conn, &input.archive_path)?;
    let format = normalize_reader_archive_format(input.format.as_deref(), &target)?;
    let cache_dir =
        reader_chapter_cache_dir(cache_root, &input.comic_id, &input.volume_id, &format);
    let extracted = reader::extract_cbz_images_to_dir(&target, &cache_dir)
        .map_err(reader_archive_error_message)?;
    let now = timestamp();
    let chapter_id = reader_chapter_cache_id(&input.comic_id, &input.volume_id, &format);
    let size_bytes = i64::try_from(extracted.total_size_bytes).unwrap_or(i64::MAX);
    let page_count = i64::try_from(extracted.manifest.page_count).unwrap_or(i64::MAX);
    let chapter = ChapterCache {
        id: chapter_id.clone(),
        comic_id: input.comic_id.clone(),
        comic_title: input.comic_title.clone(),
        volume_id: input.volume_id.clone(),
        volume_title: input.volume_title.clone(),
        format,
        cache_kind: "reading_cache".to_string(),
        source_task_id: input.source_task_id.clone(),
        cache_dir: cache_dir.to_string_lossy().to_string(),
        size_bytes,
        page_count: Some(page_count),
        status: "ready".to_string(),
        policy: Some(input.policy.unwrap_or_else(|| "balanced".to_string())),
        last_accessed_at: now.clone(),
        created_at: now.clone(),
        updated_at: now.clone(),
        expires_at: None,
    };
    let pages = extracted
        .pages
        .iter()
        .map(|page| PageCache {
            id: format!("{}:page:{:05}", chapter_id, page.entry.index + 1),
            chapter_cache_id: chapter_id.clone(),
            comic_id: input.comic_id.clone(),
            volume_id: input.volume_id.clone(),
            page_index: i64::try_from(page.entry.index).unwrap_or(i64::MAX),
            file_path: page.file_path.clone(),
            width: None,
            height: None,
            size_bytes: Some(i64::try_from(page.size_bytes).unwrap_or(i64::MAX)),
            created_at: now.clone(),
            last_accessed_at: now.clone(),
        })
        .collect::<Vec<_>>();

    db::save_chapter_cache(
        conn,
        &SaveChapterCacheInput {
            chapter: chapter.clone(),
            pages,
        },
    )
    .map_err(|error| error.to_string())?;

    let saved_chapter = find_saved_chapter_cache(conn, &chapter)?
        .ok_or_else(|| "章节缓存记录保存失败，请稍后重试。".to_string())?;
    let saved_pages = db::list_page_cache_for_chapter(conn, &saved_chapter.id)
        .map_err(|error| error.to_string())?;

    Ok(PreparedReaderChapterCache {
        chapter: saved_chapter,
        pages: saved_pages,
        manifest: extracted.manifest,
    })
}

fn find_saved_chapter_cache(
    conn: &rusqlite::Connection,
    chapter: &ChapterCache,
) -> Result<Option<ChapterCache>, String> {
    Ok(db::list_chapter_cache(conn)
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|item| {
            item.id == chapter.id
                || (item.comic_id == chapter.comic_id
                    && item.volume_id == chapter.volume_id
                    && item.format == chapter.format
                    && item.cache_kind == chapter.cache_kind)
        }))
}

fn find_reader_repair_source_archive(
    conn: &rusqlite::Connection,
    chapter: &ChapterCache,
) -> Result<DownloadedFile, String> {
    let files = db::list_downloaded_files(conn).map_err(|error| error.to_string())?;
    let candidates = files
        .into_iter()
        .filter(|file| {
            file.comic_id == chapter.comic_id
                && file.vol_id == chapter.volume_id
                && file.format == chapter.format
                && is_reader_archive_format(&file.format)
        })
        .collect::<Vec<_>>();
    let source = chapter
        .source_task_id
        .as_deref()
        .and_then(|task_id| {
            candidates
                .iter()
                .find(|file| file.task_id.as_deref() == Some(task_id))
        })
        .or_else(|| candidates.first())
        .cloned();

    source.ok_or_else(|| {
        "本地资料库没有可重新解包的 EPUB 或源图 ZIP 文件，请重新下载或重新绑定本机文件。"
            .to_string()
    })
}

fn resolve_reader_repair_archive_path(
    conn: &rusqlite::Connection,
    file: &DownloadedFile,
) -> Result<PathBuf, String> {
    if !is_reader_archive_format(&file.format) {
        return Err("只能从 EPUB 或源图 ZIP 文件重新准备阅读缓存。".to_string());
    }
    if is_metadata_only_library_path(&file.local_path) {
        return Err(
            "本地 EPUB/源图 ZIP 只有迁移元数据，请先在资料库重新绑定本机文件。".to_string(),
        );
    }
    let target = resolve_open_file_target(conn, &file.local_path).map_err(|_| {
        "本地 EPUB/源图 ZIP 文件不存在或无法访问，请重新下载或重新绑定本机文件。".to_string()
    })?;
    normalize_reader_archive_format(Some(&file.format), &target)?;
    Ok(target)
}

fn is_metadata_only_library_path(path: &str) -> bool {
    path.starts_with("Imported metadata only/")
}

fn reader_cache_root() -> PathBuf {
    fs_utils::app_data_dir().join("ReadingCache")
}

fn canonical_reader_cache_root(cache_root: &Path) -> Result<PathBuf, String> {
    std::fs::create_dir_all(cache_root)
        .map_err(|error| format!("failed to create reader cache root: {error}"))?;
    canonicalize_existing_path(cache_root, "reader cache root")
}

fn validate_chapter_cache_under_root(
    input: &SaveChapterCacheInput,
    cache_root: &Path,
) -> Result<(), String> {
    let canonical_root = canonical_reader_cache_root(cache_root)?;
    let cache_dir = fs_utils::normalize_existing_path(&input.chapter.cache_dir)?;
    if !cache_dir.is_dir() {
        return Err("registered reading cache path is not a directory".to_string());
    }
    let canonical_cache_dir = canonicalize_existing_path(&cache_dir, "reader cache directory")?;
    if canonical_cache_dir != canonical_root && !canonical_cache_dir.starts_with(&canonical_root) {
        return Err("reading cache directory is outside the app reader cache root".to_string());
    }
    for page in &input.pages {
        let page_path = fs_utils::normalize_existing_file(&page.file_path)?;
        let canonical_page_path = canonicalize_existing_path(&page_path, "reader page")?;
        if canonical_page_path != canonical_cache_dir
            && !canonical_page_path.starts_with(&canonical_cache_dir)
        {
            return Err(
                "cached page is outside the registered reading cache directory".to_string(),
            );
        }
    }
    Ok(())
}

fn reader_chapter_cache_dir(
    cache_root: &Path,
    comic_id: &str,
    volume_id: &str,
    format: &str,
) -> PathBuf {
    cache_root
        .join(fs_utils::sanitize_filename(comic_id))
        .join(fs_utils::sanitize_filename(volume_id))
        .join(fs_utils::sanitize_filename(format))
}

fn reader_chapter_cache_id(comic_id: &str, volume_id: &str, format: &str) -> String {
    format!("reader-cache:{comic_id}:{volume_id}:{format}")
}

fn is_reader_archive_format(format: &str) -> bool {
    matches!(format, "source_zip" | "epub")
}

fn normalize_reader_archive_format(format: Option<&str>, target: &Path) -> Result<String, String> {
    let extension = target
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    let inferred = match extension.as_deref() {
        Some("zip" | "cbz") => Some("source_zip"),
        Some("epub") => Some("epub"),
        _ => None,
    };
    let requested = format.filter(|value| !value.trim().is_empty());
    let normalized = requested
        .or(inferred)
        .ok_or_else(|| "本地阅读文件格式不支持，请使用 .epub、.zip 或 .cbz 文件。".to_string())?;
    if !is_reader_archive_format(normalized) {
        return Err("本地阅读文件格式不支持，请使用 EPUB 或源图 ZIP。".to_string());
    }
    match (normalized, extension.as_deref()) {
        ("source_zip", Some("zip" | "cbz")) => Ok("source_zip".to_string()),
        ("epub", Some("epub")) => Ok("epub".to_string()),
        ("source_zip", _) => Err("源图阅读文件必须是 .zip 或 .cbz。".to_string()),
        ("epub", _) => Err("EPUB 阅读文件必须是 .epub。".to_string()),
        _ => Err("本地阅读文件格式不支持。".to_string()),
    }
}

fn reader_archive_error_message(error: reader::ReaderArchiveError) -> String {
    match error {
        reader::ReaderArchiveError::NoSupportedImages => {
            "压缩包里没有可阅读的图片页面。".to_string()
        }
        reader::ReaderArchiveError::TooManyPages { .. }
        | reader::ReaderArchiveError::EntryTooLarge { .. }
        | reader::ReaderArchiveError::ArchiveTooLarge { .. } => {
            "压缩包过大，已停止准备阅读缓存。请拆分章节或释放空间后再试。".to_string()
        }
        reader::ReaderArchiveError::UnsafeArchivePath
        | reader::ReaderArchiveError::UnsafeEntryPath { .. } => {
            "压缩包路径包含不安全内容，已阻止读取。".to_string()
        }
        reader::ReaderArchiveError::NotAFile => "阅读文件不存在或不是文件。".to_string(),
        reader::ReaderArchiveError::OpenArchive(_) | reader::ReaderArchiveError::ReadArchive(_) => {
            "无法读取漫画压缩包，请重新下载或重新导入。".to_string()
        }
        reader::ReaderArchiveError::CachePathIsFile
        | reader::ReaderArchiveError::ClearCacheDir(_)
        | reader::ReaderArchiveError::CreateCacheDir(_)
        | reader::ReaderArchiveError::CreatePageFile(_)
        | reader::ReaderArchiveError::WritePageFile(_) => {
            "无法准备阅读缓存，请检查本机存储权限和剩余空间。".to_string()
        }
    }
}

#[cfg(test)]
fn read_cached_reader_page_with_conn(
    conn: &rusqlite::Connection,
    chapter_cache_id: &str,
    page_index: i64,
) -> Result<ReaderCachedPageImage, String> {
    read_cached_reader_page_inner(conn, chapter_cache_id, page_index, None)
}

fn read_cached_reader_page_with_root(
    conn: &rusqlite::Connection,
    chapter_cache_id: &str,
    page_index: i64,
    cache_root: &Path,
) -> Result<ReaderCachedPageImage, String> {
    read_cached_reader_page_inner(conn, chapter_cache_id, page_index, Some(cache_root))
}

fn read_cached_reader_page_inner(
    conn: &rusqlite::Connection,
    chapter_cache_id: &str,
    page_index: i64,
    cache_root: Option<&Path>,
) -> Result<ReaderCachedPageImage, String> {
    if page_index < 0 {
        return Err("page index must be zero or greater".to_string());
    }
    let chapter = db::list_chapter_cache(conn)
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|chapter| chapter.id == chapter_cache_id)
        .ok_or_else(|| "章节缓存不存在，请重新准备阅读缓存。".to_string())?;
    if !matches!(chapter.cache_kind.as_str(), "reading_cache" | "reading") {
        return Err("该记录不是可阅读缓存。".to_string());
    }
    let page = db::list_page_cache_for_chapter(conn, chapter_cache_id)
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|page| page.page_index == page_index)
        .ok_or_else(|| "缓存页面不存在，请重新准备阅读缓存。".to_string())?;

    let cache_dir = fs_utils::normalize_existing_path(&chapter.cache_dir)?;
    if !cache_dir.is_dir() {
        return Err("registered reading cache path is not a directory".to_string());
    }
    let page_path = fs_utils::normalize_existing_file(&page.file_path)?;
    let canonical_cache_dir = canonicalize_existing_path(&cache_dir, "reader cache directory")?;
    let canonical_page_path = canonicalize_existing_path(&page_path, "reader page")?;
    if let Some(cache_root) = cache_root {
        let canonical_root = canonical_reader_cache_root(cache_root)?;
        if canonical_cache_dir != canonical_root
            && !canonical_cache_dir.starts_with(&canonical_root)
        {
            return Err(
                "registered reading cache path is outside the app reader cache root".to_string(),
            );
        }
    }
    if canonical_page_path != canonical_cache_dir
        && !canonical_page_path.starts_with(&canonical_cache_dir)
    {
        return Err("cached page is outside the registered reading cache directory".to_string());
    }
    let metadata = std::fs::metadata(&canonical_page_path)
        .map_err(|error| format!("failed to read cached page metadata: {error}"))?;
    if metadata.len() > MAX_READER_PAGE_BYTES {
        return Err(format!(
            "cached page is too large to render safely: {} bytes",
            metadata.len()
        ));
    }
    let mime_type = reader_page_mime_type(&canonical_page_path)
        .ok_or_else(|| "缓存页面格式不受支持，请重新准备阅读缓存。".to_string())?;
    let bytes = std::fs::read(&canonical_page_path)
        .map_err(|error| format!("failed to read cached page: {error}"))?;
    let encoded = BASE64_STANDARD.encode(&bytes);
    let file_name = canonical_page_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("page")
        .to_string();

    Ok(ReaderCachedPageImage {
        chapter_cache_id: chapter.id,
        comic_id: chapter.comic_id,
        volume_id: chapter.volume_id,
        page_index: page.page_index,
        file_name,
        mime_type: mime_type.to_string(),
        size_bytes: i64::try_from(metadata.len()).unwrap_or(i64::MAX),
        data_url: format!("data:{mime_type};base64,{encoded}"),
    })
}

fn reader_page_mime_type(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("jpg" | "jpeg") => Some("image/jpeg"),
        Some("png") => Some("image/png"),
        Some("webp") => Some("image/webp"),
        Some("gif") => Some("image/gif"),
        Some("bmp") => Some("image/bmp"),
        Some("avif") => Some("image/avif"),
        _ => None,
    }
}

fn resolve_reveal_target(conn: &rusqlite::Connection, path: &str) -> Result<PathBuf, String> {
    let target = fs_utils::normalize_existing_path(path)?;
    ensure_open_target_allowed(conn, &target)?;
    Ok(target)
}

fn ensure_open_target_allowed(conn: &rusqlite::Connection, target: &Path) -> Result<(), String> {
    let canonical_target = canonicalize_existing_path(target, "path")?;
    let download_dir = get_download_dir_from_conn(conn)?;
    if is_under_download_root(&canonical_target, &download_dir)? {
        return Ok(());
    }
    if matches_recorded_local_path(conn, &canonical_target)? {
        return Ok(());
    }
    Err("path is outside Kmoe download records and download directory".to_string())
}

fn get_download_dir_from_conn(conn: &rusqlite::Connection) -> Result<String, String> {
    if is_ios_runtime() {
        return Ok(mobile_download_dir());
    }
    db::get_setting(conn, "download_dir")
        .map_err(|error| error.to_string())
        .map(|value| value.unwrap_or_else(fs_utils::default_download_dir))
}

fn is_under_download_root(canonical_target: &Path, download_dir: &str) -> Result<bool, String> {
    let root = normalize_download_dir_for_platform(Some(download_dir.to_string()))?;
    let canonical_root = match std::fs::canonicalize(&root) {
        Ok(path) => path,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(format!("failed to resolve download directory: {error}")),
    };
    Ok(canonical_target == canonical_root || canonical_target.starts_with(&canonical_root))
}

fn matches_recorded_local_path(
    conn: &rusqlite::Connection,
    canonical_target: &Path,
) -> Result<bool, String> {
    let tasks = db::list_download_tasks(conn).map_err(|error| error.to_string())?;
    if tasks.iter().any(|task| {
        task.status == "completed"
            && task
                .local_path
                .as_deref()
                .map(|path| recorded_path_matches(path, canonical_target))
                .unwrap_or(false)
    }) {
        return Ok(true);
    }

    let files = db::list_downloaded_files(conn).map_err(|error| error.to_string())?;
    Ok(files
        .iter()
        .any(|file| recorded_path_matches(&file.local_path, canonical_target)))
}

fn recorded_path_matches(recorded_path: &str, canonical_target: &Path) -> bool {
    let Ok(path) = fs_utils::normalize_user_path(recorded_path) else {
        return false;
    };
    std::fs::canonicalize(path)
        .map(|path| path == canonical_target)
        .unwrap_or(false)
}

fn canonicalize_existing_path(path: &Path, label: &str) -> Result<PathBuf, String> {
    std::fs::canonicalize(path).map_err(|error| format!("failed to resolve {label}: {error}"))
}

fn open_path(target: &Path, reveal: bool) -> Result<(), String> {
    if is_ios_runtime() {
        return share_file_with_system_sheet(target);
    }
    let spec = open_command_spec(target, reveal, std::env::consts::OS);
    let command_result = Command::new(&spec.program).args(&spec.args).status();

    match command_result {
        Ok(status) if status.success() => Ok(()),
        Ok(status) => Err(format!("open command exited with status {status}")),
        Err(error) => Err(format!("failed to open path: {error}")),
    }
}

fn list_download_tasks_with_conn(
    conn: &rusqlite::Connection,
    recover_interrupted: Option<bool>,
    queue_running: bool,
) -> rusqlite::Result<Vec<DownloadTask>> {
    if recover_interrupted.unwrap_or(true) && !queue_running {
        db::recover_interrupted_tasks(conn, &timestamp())?;
    }
    db::list_download_tasks(conn)
}

fn is_ios_runtime() -> bool {
    matches!(std::env::consts::OS, "ios")
}

fn normalize_download_dir_for_platform(input: Option<String>) -> Result<String, String> {
    if is_ios_runtime() {
        return Ok(mobile_download_dir());
    }
    fs_utils::normalize_download_dir(input)
}

fn ensure_download_dir_for_platform(input: Option<String>) -> Result<PathBuf, String> {
    if is_ios_runtime() {
        let path = PathBuf::from(mobile_download_dir());
        std::fs::create_dir_all(&path)
            .map_err(|error| format!("failed to create mobile app download directory: {error}"))?;
        return Ok(path);
    }

    match input {
        Some(path) if !path.trim().is_empty() => fs_utils::ensure_download_dir(&path),
        _ => fs_utils::ensure_download_dir(&fs_utils::default_download_dir()),
    }
}

fn mobile_download_dir() -> String {
    mobile_download_dir_from_app_data_dir(&fs_utils::app_data_dir())
}

fn mobile_download_dir_from_app_data_dir(app_data_dir: &Path) -> String {
    app_data_dir
        .join("Downloads")
        .join("Kmoe")
        .to_string_lossy()
        .to_string()
}

#[cfg(target_os = "ios")]
fn share_file_with_system_sheet(target: &Path) -> Result<(), String> {
    ios_share::present_file_share_sheet(target)
}

#[cfg(not(target_os = "ios"))]
fn share_file_with_system_sheet(_target: &Path) -> Result<(), String> {
    Err("系统分享只在 iPhone/iPad 客户端中可用。".to_string())
}

#[cfg(target_os = "ios")]
fn set_ios_status_bar_hidden_for_platform(hidden: bool) -> Result<bool, String> {
    ios_share::set_status_bar_hidden(hidden)?;
    Ok(true)
}

#[cfg(not(target_os = "ios"))]
fn set_ios_status_bar_hidden_for_platform(_hidden: bool) -> Result<bool, String> {
    Ok(false)
}

#[cfg(target_os = "ios")]
mod ios_share {
    use std::ffi::{c_char, c_void, CString};
    use std::path::Path;
    use std::ptr;

    type Id = *mut c_void;
    type Sel = *mut c_void;

    #[link(name = "objc")]
    extern "C" {
        fn objc_getClass(name: *const c_char) -> Id;
        fn sel_registerName(name: *const c_char) -> Sel;
        fn objc_msgSend();
    }

    #[link(name = "System")]
    extern "C" {
        static mut _dispatch_main_q: c_void;
        fn dispatch_sync_f(queue: Id, context: *mut c_void, work: extern "C" fn(*mut c_void));
        fn pthread_main_np() -> i32;
    }

    struct ShareContext {
        path: CString,
        result: Option<Result<(), String>>,
    }

    struct StatusBarContext {
        hidden: bool,
        result: Option<Result<(), String>>,
    }

    pub fn set_status_bar_hidden(hidden: bool) -> Result<(), String> {
        let mut context = Box::new(StatusBarContext {
            hidden,
            result: None,
        });
        let context_ptr = context.as_mut() as *mut StatusBarContext as *mut c_void;

        unsafe {
            if pthread_main_np() != 0 {
                set_status_bar_hidden_work(context_ptr);
            } else {
                dispatch_sync_f(
                    &raw mut _dispatch_main_q as Id,
                    context_ptr,
                    set_status_bar_hidden_work,
                );
            }
        }

        context
            .result
            .take()
            .unwrap_or_else(|| Err("无法切换 iOS 状态栏。".to_string()))
    }

    pub fn present_file_share_sheet(target: &Path) -> Result<(), String> {
        let path = CString::new(target.to_string_lossy().as_bytes())
            .map_err(|_| "文件路径包含无效字符，无法导出。".to_string())?;
        let mut context = Box::new(ShareContext { path, result: None });
        let context_ptr = context.as_mut() as *mut ShareContext as *mut c_void;

        unsafe {
            if pthread_main_np() != 0 {
                present_share_sheet(context_ptr);
            } else {
                dispatch_sync_f(
                    &raw mut _dispatch_main_q as Id,
                    context_ptr,
                    present_share_sheet,
                );
            }
        }

        context
            .result
            .take()
            .unwrap_or_else(|| Err("无法打开 iOS 分享表。".to_string()))
    }

    extern "C" fn set_status_bar_hidden_work(context: *mut c_void) {
        let context = unsafe { &mut *(context as *mut StatusBarContext) };
        context.result = Some(unsafe { set_status_bar_hidden_inner(context.hidden) });
    }

    extern "C" fn present_share_sheet(context: *mut c_void) {
        let context = unsafe { &mut *(context as *mut ShareContext) };
        context.result = Some(unsafe { present_share_sheet_inner(&context.path) });
    }

    unsafe fn set_status_bar_hidden_inner(hidden: bool) -> Result<(), String> {
        let app = msg_id(class("UIApplication")?, "sharedApplication");
        if app.is_null() {
            return Err("无法访问 iOS 应用状态栏。".to_string());
        }
        msg_void_bool(app, "setStatusBarHidden:", hidden);
        Ok(())
    }

    unsafe fn present_share_sheet_inner(path: &CString) -> Result<(), String> {
        let ns_string = msg_id_ptr(class("NSString")?, "stringWithUTF8String:", path.as_ptr());
        if ns_string.is_null() {
            return Err("无法读取要导出的文件路径。".to_string());
        }

        let file_url = msg_id_id(class("NSURL")?, "fileURLWithPath:", ns_string);
        if file_url.is_null() {
            return Err("无法创建文件分享 URL。".to_string());
        }

        let activity_items = msg_id_id(class("NSArray")?, "arrayWithObject:", file_url);
        if activity_items.is_null() {
            return Err("无法准备分享项目。".to_string());
        }

        let activity_controller = msg_id_id_id(
            msg_id(class("UIActivityViewController")?, "alloc"),
            "initWithActivityItems:applicationActivities:",
            activity_items,
            ptr::null_mut(),
        );
        if activity_controller.is_null() {
            return Err("无法创建 iOS 分享表。".to_string());
        }

        let presenter = visible_view_controller()?;
        let popover = msg_id(activity_controller, "popoverPresentationController");
        if !popover.is_null() {
            let view = msg_id(presenter, "view");
            if !view.is_null() {
                msg_void_id(popover, "setSourceView:", view);
                msg_void_usize(popover, "setPermittedArrowDirections:", 0);
            }
        }

        msg_void_id_bool_id(
            presenter,
            "presentViewController:animated:completion:",
            activity_controller,
            true,
            ptr::null_mut(),
        );
        Ok(())
    }

    unsafe fn visible_view_controller() -> Result<Id, String> {
        let app = msg_id(class("UIApplication")?, "sharedApplication");
        if app.is_null() {
            return Err("无法访问 iOS 应用窗口。".to_string());
        }

        let mut window = msg_id(app, "keyWindow");
        if window.is_null() {
            let windows = msg_id(app, "windows");
            if !windows.is_null() {
                window = msg_id(windows, "firstObject");
            }
        }
        if window.is_null() {
            return Err("没有可用于展示分享表的窗口。".to_string());
        }

        let mut controller = msg_id(window, "rootViewController");
        if controller.is_null() {
            return Err("没有可用于展示分享表的视图。".to_string());
        }

        loop {
            let presented = msg_id(controller, "presentedViewController");
            if presented.is_null() {
                break;
            }
            controller = presented;
        }

        Ok(controller)
    }

    unsafe fn class(name: &str) -> Result<Id, String> {
        let name = CString::new(name).map_err(|_| "invalid Objective-C class name".to_string())?;
        let class = objc_getClass(name.as_ptr());
        if class.is_null() {
            return Err("iOS 分享组件不可用。".to_string());
        }
        Ok(class)
    }

    unsafe fn selector(name: &str) -> Sel {
        let name = CString::new(name).expect("selector name must not contain NUL");
        sel_registerName(name.as_ptr())
    }

    unsafe fn msg_id(receiver: Id, selector_name: &str) -> Id {
        let send: unsafe extern "C" fn(Id, Sel) -> Id =
            std::mem::transmute(objc_msgSend as *const ());
        send(receiver, selector(selector_name))
    }

    unsafe fn msg_id_ptr(receiver: Id, selector_name: &str, value: *const c_char) -> Id {
        let send: unsafe extern "C" fn(Id, Sel, *const c_char) -> Id =
            std::mem::transmute(objc_msgSend as *const ());
        send(receiver, selector(selector_name), value)
    }

    unsafe fn msg_id_id(receiver: Id, selector_name: &str, value: Id) -> Id {
        let send: unsafe extern "C" fn(Id, Sel, Id) -> Id =
            std::mem::transmute(objc_msgSend as *const ());
        send(receiver, selector(selector_name), value)
    }

    unsafe fn msg_id_id_id(receiver: Id, selector_name: &str, first: Id, second: Id) -> Id {
        let send: unsafe extern "C" fn(Id, Sel, Id, Id) -> Id =
            std::mem::transmute(objc_msgSend as *const ());
        send(receiver, selector(selector_name), first, second)
    }

    unsafe fn msg_void_id(receiver: Id, selector_name: &str, value: Id) {
        let send: unsafe extern "C" fn(Id, Sel, Id) =
            std::mem::transmute(objc_msgSend as *const ());
        send(receiver, selector(selector_name), value);
    }

    unsafe fn msg_void_usize(receiver: Id, selector_name: &str, value: usize) {
        let send: unsafe extern "C" fn(Id, Sel, usize) =
            std::mem::transmute(objc_msgSend as *const ());
        send(receiver, selector(selector_name), value);
    }

    unsafe fn msg_void_bool(receiver: Id, selector_name: &str, value: bool) {
        let send: unsafe extern "C" fn(Id, Sel, bool) =
            std::mem::transmute(objc_msgSend as *const ());
        send(receiver, selector(selector_name), value);
    }

    unsafe fn msg_void_id_bool_id(
        receiver: Id,
        selector_name: &str,
        first: Id,
        second: bool,
        third: Id,
    ) {
        let send: unsafe extern "C" fn(Id, Sel, Id, bool, Id) =
            std::mem::transmute(objc_msgSend as *const ());
        send(receiver, selector(selector_name), first, second, third);
    }
}

fn validate_native_task_shape(task: &DownloadTask) -> Result<(), String> {
    if is_blocking_task_error(task.error_message.as_deref().unwrap_or_default()) {
        return Err("该任务当前不可下载，请查看限制提示。".to_string());
    }
    let mobi_type = match task.format.as_str() {
        "source_zip" => 0,
        "mobi" => 1,
        "epub" => 2,
        _ => return Err("不支持的下载格式。".to_string()),
    };
    http::build_download_authorize_url(&task.comic_id, &task.vol_id, mobi_type, 0)?;
    Ok(())
}

fn preflight_download_queue_with_conn(
    conn: &rusqlite::Connection,
    download_dir: Option<String>,
) -> DownloadPreflight {
    let mut preflight = empty_preflight();

    if is_ios_runtime() {
        push_preflight_check(
            &mut preflight.checks,
            "file-download",
            "前台下载",
            "warn",
            "iPhone/iPad 当前使用前台下载；请保持 App 打开，完成后可导出到分享表或在“文件”App 中查看。",
        );
    } else {
        push_preflight_check(
            &mut preflight.checks,
            "file-download",
            "文件下载",
            "pass",
            "下载已准备好，会处理本地队列中的内容。",
        );
    }

    push_preflight_check(
        &mut preflight.checks,
        "native-env",
        "本机保存",
        "pass",
        "本机保存位置可用，下载任务可以开始。",
    );

    match ensure_download_dir_for_platform(download_dir)
        .map(|path| path.to_string_lossy().to_string())
    {
        Ok(path) => {
            preflight.download_directory = Some(path.clone());
            push_preflight_check(
                &mut preflight.checks,
                "download-dir",
                "下载目录",
                "pass",
                format!("目录可用：{path}"),
            );
        }
        Err(error) => {
            push_preflight_check(
                &mut preflight.checks,
                "download-dir",
                "下载目录",
                "fail",
                error,
            );
        }
    }

    let tasks = match db::list_download_tasks(conn) {
        Ok(tasks) => tasks,
        Err(error) => {
            push_preflight_check(
                &mut preflight.checks,
                "queue-read",
                "读取队列",
                "fail",
                format!("无法读取本地队列：{error}"),
            );
            return finalize_preflight(preflight);
        }
    };
    preflight.queued_count = tasks.iter().filter(|task| task.status == "queued").count();
    preflight.active_count = tasks
        .iter()
        .filter(|task| is_active_status(&task.status))
        .count();

    if preflight.active_count > 0 {
        push_preflight_check(
            &mut preflight.checks,
            "active-task",
            "当前执行",
            "fail",
            format!(
                "检测到 {} 个正在执行的任务；请等待、暂停或取消后再启动新的队列运行。",
                preflight.active_count
            ),
        );
    } else {
        push_preflight_check(
            &mut preflight.checks,
            "active-task",
            "当前执行",
            "pass",
            "没有正在执行的任务。",
        );
    }

    if preflight.queued_count == 0 {
        push_preflight_check(
            &mut preflight.checks,
            "queued-task",
            "等待任务",
            "fail",
            "没有等待下载的任务；请先从详情页把单卷/单话加入本地队列。",
        );
        return finalize_preflight(preflight);
    }

    match db::first_queued_task(conn) {
        Ok(Some(task)) => {
            preflight.first_task_id = Some(task.id.clone());
            preflight.first_task_label = Some(format!(
                "{} / {} / {}",
                task.comic_title,
                task.volume_title,
                task.format.to_uppercase()
            ));
            match validate_native_task_shape(&task) {
                Ok(()) => {
                    push_preflight_check(
                        &mut preflight.checks,
                        "single-item-shape",
                        "首项任务",
                        "pass",
                        format!(
                            "将先处理《{}》的「{}」（{}）。",
                            task.comic_title,
                            task.volume_title,
                            task.format.to_uppercase()
                        ),
                    );
                }
                Err(error) => {
                    push_preflight_check(
                        &mut preflight.checks,
                        "single-item-shape",
                        "首项任务",
                        "fail",
                        error,
                    );
                }
            }
        }
        Ok(None) => {
            push_preflight_check(
                &mut preflight.checks,
                "queued-task",
                "等待任务",
                "fail",
                "队列计数和首项读取不一致；请刷新队列。",
            );
        }
        Err(error) => {
            push_preflight_check(
                &mut preflight.checks,
                "queued-task",
                "等待任务",
                "fail",
                format!("无法读取首个 queued 任务：{error}"),
            );
        }
    }

    push_preflight_check(
        &mut preflight.checks,
        "session",
        "登录会话",
        "warn",
        "请确认已经登录；下载开始时会使用当前会话。",
    );

    finalize_preflight(preflight)
}

fn empty_preflight() -> DownloadPreflight {
    DownloadPreflight {
        ok: false,
        mode: "real_download".to_string(),
        queued_count: 0,
        active_count: 0,
        download_directory: None,
        first_task_id: None,
        first_task_label: None,
        checks: Vec::new(),
    }
}

fn push_preflight_check(
    checks: &mut Vec<DownloadPreflightCheck>,
    id: impl Into<String>,
    label: impl Into<String>,
    status: impl Into<String>,
    detail: impl Into<String>,
) {
    checks.push(DownloadPreflightCheck {
        id: id.into(),
        label: label.into(),
        status: status.into(),
        detail: detail.into(),
    });
}

fn finalize_preflight(mut preflight: DownloadPreflight) -> DownloadPreflight {
    preflight.ok = preflight
        .checks
        .iter()
        .all(|check| check.status.as_str() != "fail");
    preflight
}

fn is_active_status(status: &str) -> bool {
    matches!(status, "authorizing" | "downloading" | "verifying")
}

fn is_blocking_task_error(message: &str) -> bool {
    let normalized = message.to_lowercase();
    [
        "vip",
        "lv2",
        "lv3",
        "level",
        "quota",
        "permission",
        "insufficient",
        "額度",
        "额度",
        "權限",
        "权限",
        "真實驗證",
        "真实验证",
        "true verification",
        "暫不可下載",
        "暂不可下载",
        "製作中",
        "制作中",
    ]
    .iter()
    .any(|pattern| normalized.contains(pattern))
}

pub fn save_migration_snapshot_to_dir(
    snapshot_json: &str,
    download_dir: &str,
    fallback_timestamp: &str,
) -> Result<String, String> {
    let parsed = validate_migration_snapshot(snapshot_json)?;
    let exported_at = parsed
        .get("exportedAt")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(fallback_timestamp);
    let file_name = format!(
        "kmoe-client-snapshot-{}.json",
        fs_utils::sanitize_filename(exported_at)
    );
    let root = normalize_download_dir_for_platform(Some(download_dir.to_string()))?;
    let snapshot_dir = Path::new(&root).join("Snapshots");
    std::fs::create_dir_all(&snapshot_dir)
        .map_err(|error| format!("failed to create snapshot directory: {error}"))?;
    let path = fs_utils::available_path(&snapshot_dir.join(file_name));
    let mut contents = snapshot_json.trim_end().to_string();
    contents.push('\n');
    std::fs::write(&path, contents)
        .map_err(|error| format!("failed to save migration snapshot: {error}"))?;
    Ok(path.to_string_lossy().to_string())
}

pub fn import_migration_snapshot_json(
    snapshot_json: &str,
    imported_at: &str,
) -> Result<MigrationSnapshotImportResult, String> {
    let conn = db::open_default_connection().map_err(|error| error.to_string())?;
    import_migration_snapshot_into_conn(&conn, snapshot_json, imported_at)
}

pub fn import_migration_snapshot_into_conn(
    conn: &rusqlite::Connection,
    snapshot_json: &str,
    imported_at: &str,
) -> Result<MigrationSnapshotImportResult, String> {
    let parsed = validate_migration_snapshot(snapshot_json)?;
    let mut imported_tasks = 0;
    let mut imported_library = 0;

    for value in parsed
        .get("tasks")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        let task = read_snapshot_task(value, imported_at)?;
        validate_native_task_shape(&task)?;
        if db::insert_download_task_if_absent(&conn, &task).map_err(|error| error.to_string())? {
            imported_tasks += 1;
        }
    }

    for value in parsed
        .get("library")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        let file = read_snapshot_library_file(value, imported_at)?;
        if db::insert_downloaded_file_if_absent(&conn, &file).map_err(|error| error.to_string())? {
            imported_library += 1;
        }
    }

    Ok(MigrationSnapshotImportResult {
        imported_tasks,
        imported_library,
        tasks: db::list_download_tasks(&conn).map_err(|error| error.to_string())?,
        library: db::list_downloaded_files(&conn).map_err(|error| error.to_string())?,
    })
}

pub fn link_downloaded_file_into_conn(
    conn: &rusqlite::Connection,
    mut file: DownloadedFile,
    local_path: &str,
    linked_at: &str,
) -> Result<Vec<DownloadedFile>, String> {
    let target = fs_utils::normalize_existing_file(local_path)?;
    validate_relink_extension(&target, &file.format)?;
    let size_bytes = std::fs::metadata(&target)
        .ok()
        .and_then(|metadata| i64::try_from(metadata.len()).ok())
        .or(file.size_bytes);
    file.id = read_non_empty_string(
        &file.id,
        &format!("file-{}-{}-{}", file.comic_id, file.vol_id, file.format),
    );
    file.local_path = target.to_string_lossy().to_string();
    file.size_bytes = size_bytes;
    file.downloaded_at = linked_at.to_string();
    db::insert_downloaded_file(conn, &file).map_err(|error| error.to_string())?;
    db::list_downloaded_files(conn).map_err(|error| error.to_string())
}

fn validate_relink_extension(target: &Path, format: &str) -> Result<(), String> {
    let expected = match format {
        "mobi" => "mobi",
        "epub" => "epub",
        "source_zip" => "zip",
        _ => return Err(format!("unsupported library format: {format}")),
    };
    let actual = target
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    if actual.as_deref() != Some(expected) {
        return Err(format!(
            "local file extension must match format {format}; expected .{expected}"
        ));
    }
    Ok(())
}

fn validate_migration_snapshot(snapshot_json: &str) -> Result<Value, String> {
    let lowered = snapshot_json.to_ascii_lowercase();
    let forbidden = [
        "getdownurl.php".to_string(),
        format!("set-{}:", "cookie"),
        format!("authorization: {}", "bearer"),
        format!("cookie.{}", "txt"),
        format!("cookies.{}", "txt"),
        format!("{}=", "session"),
        format!("{}=", "token"),
        format!("{}=", "password"),
    ];
    if forbidden.iter().any(|pattern| lowered.contains(pattern)) {
        return Err(
            "migration snapshot contains sensitive or temporary authorization data".to_string(),
        );
    }

    let parsed: Value = serde_json::from_str(snapshot_json)
        .map_err(|error| format!("invalid migration snapshot JSON: {error}"))?;
    if parsed.get("version").and_then(Value::as_i64) != Some(1) {
        return Err("unsupported migration snapshot version".to_string());
    }

    let safety = parsed
        .get("safety")
        .and_then(Value::as_object)
        .ok_or_else(|| "migration snapshot is missing safety metadata".to_string())?;
    if !is_valid_snapshot_safety_metadata(safety) {
        return Err("migration snapshot safety metadata is not redacted".to_string());
    }

    if contains_forbidden_snapshot_key(&parsed) {
        return Err("migration snapshot contains local path or credential fields".to_string());
    }

    Ok(parsed)
}

fn is_valid_snapshot_safety_metadata(safety: &serde_json::Map<String, Value>) -> bool {
    safety.get("runtimeSettings").and_then(Value::as_str) == Some("not_exported")
        && safety.get("authorizationUrls").and_then(Value::as_str) == Some("omitted")
        && safety.get("localPaths").and_then(Value::as_str) == Some("redacted")
}

fn read_snapshot_task(value: Value, imported_at: &str) -> Result<DownloadTask, String> {
    let mut task: DownloadTask = serde_json::from_value(value)
        .map_err(|error| format!("invalid migration snapshot task: {error}"))?;
    task.id = read_non_empty_string(
        &task.id,
        &format!("{}-{}-{}", task.comic_id, task.vol_id, task.format),
    );
    task.comic_id = read_non_empty_string(&task.comic_id, "unknown");
    task.comic_title = read_non_empty_string(&task.comic_title, "Unknown Comic");
    task.vol_id = read_non_empty_string(&task.vol_id, "unknown");
    task.volume_title = read_non_empty_string(&task.volume_title, "Unknown Volume");
    task.format = match task.format.as_str() {
        "mobi" | "epub" | "source_zip" => task.format,
        _ => "mobi".to_string(),
    };
    task.status = match task.status.as_str() {
        "completed" | "cancelled" => task.status,
        _ => "queued".to_string(),
    };
    task.progress = if task.status == "completed" {
        100.0
    } else {
        0.0
    };
    task.downloaded_bytes = if task.progress >= 100.0 {
        task.downloaded_bytes.max(0)
    } else {
        0
    };
    task.total_bytes = task.total_bytes.map(|value| value.max(0));
    task.retry_count = task.retry_count.clamp(0, db::MAX_RETRY_COUNT);
    if !matches!(task.status.as_str(), "completed" | "cancelled") {
        task.error_message =
            Some("Imported from migration snapshot; task needs authorization.".to_string());
    }
    task.local_path = None;
    task.created_at = read_non_empty_string(&task.created_at, imported_at);
    task.updated_at = imported_at.to_string();
    Ok(task)
}

fn read_snapshot_library_file(value: Value, imported_at: &str) -> Result<DownloadedFile, String> {
    let object = value
        .as_object()
        .ok_or_else(|| "invalid migration snapshot library item".to_string())?;
    let format = match read_json_string(object.get("format"), "mobi").as_str() {
        "mobi" => "mobi".to_string(),
        "epub" => "epub".to_string(),
        "source_zip" => "source_zip".to_string(),
        _ => "mobi".to_string(),
    };
    let comic_id = read_json_string(object.get("comicId"), "unknown");
    let vol_id = read_json_string(object.get("volId"), "unknown");
    let comic_title = read_json_string(object.get("comicTitle"), "Unknown Comic");
    let volume_title = read_json_string(object.get("volumeTitle"), "Unknown Volume");
    let extension = match format.as_str() {
        "source_zip" => "zip".to_string(),
        value => value.to_string(),
    };
    Ok(DownloadedFile {
        id: read_json_string(
            object.get("id"),
            &format!("imported-{comic_id}-{vol_id}-{format}"),
        ),
        task_id: object
            .get("taskId")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(str::to_string),
        comic_id,
        comic_title: comic_title.clone(),
        vol_id,
        volume_title: volume_title.clone(),
        format,
        local_path: format!(
            "Imported metadata only/{} - {}.{extension}",
            fs_utils::sanitize_filename(&comic_title),
            fs_utils::sanitize_filename(&volume_title)
        ),
        size_bytes: object
            .get("sizeBytes")
            .and_then(Value::as_i64)
            .map(|value| value.max(0)),
        downloaded_at: read_json_string(object.get("downloadedAt"), imported_at),
    })
}

fn read_json_string(value: Option<&Value>, fallback: &str) -> String {
    value
        .and_then(Value::as_str)
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

fn read_non_empty_string(value: &str, fallback: &str) -> String {
    if value.trim().is_empty() {
        fallback.to_string()
    } else {
        value.trim().to_string()
    }
}

fn contains_forbidden_snapshot_key(value: &Value) -> bool {
    contains_forbidden_snapshot_key_in(value, None)
}

fn contains_forbidden_snapshot_key_in(value: &Value, parent_key: Option<&str>) -> bool {
    match value {
        Value::Object(object) => object.iter().any(|(key, value)| {
            let normalized = normalize_snapshot_key(key);
            let allowed_safety_metadata = parent_key == Some("safety")
                && ((normalized == "localpaths" && value.as_str() == Some("redacted"))
                    || (normalized == "authorizationurls" && value.as_str() == Some("omitted")));
            (!allowed_safety_metadata && is_forbidden_snapshot_key(&normalized))
                || contains_forbidden_snapshot_key_in(value, Some(&normalized))
        }),
        Value::Array(values) => values
            .iter()
            .any(|value| contains_forbidden_snapshot_key_in(value, parent_key)),
        _ => false,
    }
}

fn normalize_snapshot_key(key: &str) -> String {
    key.chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn is_forbidden_snapshot_key(normalized: &str) -> bool {
    matches!(
        normalized,
        "localpath"
            | "localpaths"
            | "authorizationurl"
            | "authorizationurls"
            | "downloadurl"
            | "downloadurls"
            | "session"
            | "sessions"
            | "token"
            | "tokens"
            | "password"
            | "passwords"
            | "cookie"
            | "cookies"
            | "setcookie"
    )
}

#[cfg(test)]
#[path = "commands_snapshot_tests.rs"]
mod snapshot_tests;
