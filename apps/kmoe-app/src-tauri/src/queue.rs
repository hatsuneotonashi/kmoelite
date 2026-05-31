use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard, OnceLock},
};

use crate::downloader::DownloadDirective;
use crate::models::{DownloadTask, DownloadedFile};
use crate::web_adapter::KmoeHttpClient;
use crate::{db, downloader, http};

pub async fn process_download_queue(
    client: &KmoeHttpClient,
    download_dir: Option<String>,
) -> Result<usize, String> {
    process_download_queue_at(None, client, download_dir).await
}

pub async fn process_download_queue_at(
    db_path: Option<PathBuf>,
    client: &KmoeHttpClient,
    download_dir: Option<String>,
) -> Result<usize, String> {
    process_queue_at(db_path, client, download_dir).await
}

async fn process_queue_at(
    db_path: Option<PathBuf>,
    client: &KmoeHttpClient,
    download_dir: Option<String>,
) -> Result<usize, String> {
    let Some(_guard) = QueueRunGuard::try_acquire(db_path.as_deref()) else {
        return Ok(0);
    };
    let mut processed = 0;
    {
        let conn = open_queue_connection(db_path.as_deref())?;
        db::recover_interrupted_tasks(&conn, &timestamp()).map_err(|error| error.to_string())?;
    }

    loop {
        let task = {
            let conn = open_queue_connection(db_path.as_deref())?;
            db::claim_next_queued_task(&conn, &timestamp()).map_err(|error| error.to_string())?
        };
        let Some(task) = task else {
            break;
        };

        if let Err(error) = validate_single_item_task(&task) {
            persist_claimed_task_failure(db_path.as_deref(), task, &error)?;
            return Err(error);
        }

        let mut persist_error = None;
        let mut persist_update = |task: &DownloadTask| -> DownloadDirective {
            if persist_error.is_some() {
                return DownloadDirective::Cancel;
            }
            match persist_task_update(db_path.as_deref(), task) {
                Ok(directive) => directive,
                Err(error) => {
                    persist_error = Some(error);
                    DownloadDirective::Cancel
                }
            }
        };
        let (completed, file) = downloader::real_download_with_control(
            client,
            task,
            download_dir.clone(),
            &mut persist_update,
        )
        .await;
        if let Some(error) = persist_error {
            return Err(error);
        }
        persist_finished_task(db_path.as_deref(), &completed, file.as_ref())?;

        processed += 1;
    }

    Ok(processed)
}

pub fn is_download_queue_running(db_path: Option<&Path>) -> bool {
    let key = queue_lock_key(db_path);
    lock_running_queue_keys().contains(&key)
}

fn timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn open_queue_connection(db_path: Option<&Path>) -> Result<rusqlite::Connection, String> {
    match db_path {
        Some(path) => db::open_connection(path.to_path_buf()).map_err(|error| error.to_string()),
        None => db::open_default_connection().map_err(|error| error.to_string()),
    }
}

fn persist_task_update(
    db_path: Option<&Path>,
    task: &DownloadTask,
) -> Result<DownloadDirective, String> {
    let conn = open_queue_connection(db_path)?;
    if db::update_download_task_unless_controlled(&conn, task).map_err(|error| error.to_string())? {
        return Ok(DownloadDirective::Continue);
    }
    match db::get_download_task(&conn, &task.id).map_err(|error| error.to_string())? {
        Some(current) if current.status == "paused" => Ok(DownloadDirective::Pause),
        Some(current) if current.status == "cancelled" => Ok(DownloadDirective::Cancel),
        Some(current) => Err(format!(
            "download task update was rejected while status is {}",
            current.status
        )),
        None => Err(format!("download task disappeared: {}", task.id)),
    }
}

fn persist_finished_task(
    db_path: Option<&Path>,
    completed: &DownloadTask,
    file: Option<&DownloadedFile>,
) -> Result<(), String> {
    let conn = open_queue_connection(db_path)?;
    if !db::update_download_task_unless_controlled(&conn, completed)
        .map_err(|error| error.to_string())?
    {
        match db::get_download_task(&conn, &completed.id).map_err(|error| error.to_string())? {
            Some(current) if matches!(current.status.as_str(), "paused" | "cancelled") => {
                return Ok(());
            }
            Some(current) => {
                return Err(format!(
                    "finished download update was rejected while status is {}",
                    current.status
                ));
            }
            None => return Err(format!("download task disappeared: {}", completed.id)),
        }
    }
    if completed.status == "completed" {
        if let Some(file) = file {
            db::insert_downloaded_file(&conn, file).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn persist_claimed_task_failure(
    db_path: Option<&Path>,
    mut task: DownloadTask,
    error: &str,
) -> Result<(), String> {
    task.status = "failed".to_string();
    task.progress = 0.0;
    task.downloaded_bytes = 0;
    task.error_message = Some(error.to_string());
    task.local_path = None;
    task.updated_at = timestamp();
    let conn = open_queue_connection(db_path)?;
    let _ = db::update_download_task_unless_controlled(&conn, &task)
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn validate_single_item_task(task: &DownloadTask) -> Result<(), String> {
    let mobi_type = match task.format.as_str() {
        "source_zip" => 0,
        "mobi" => 1,
        "epub" => 2,
        _ => return Err("invalid download format".to_string()),
    };
    http::build_download_authorize_url(&task.comic_id, &task.vol_id, mobi_type, 0)?;
    Ok(())
}

struct QueueRunGuard {
    key: String,
}

impl QueueRunGuard {
    fn try_acquire(db_path: Option<&Path>) -> Option<Self> {
        let key = queue_lock_key(db_path);
        let mut running = lock_running_queue_keys();
        if !running.insert(key.clone()) {
            return None;
        }
        Some(Self { key })
    }
}

impl Drop for QueueRunGuard {
    fn drop(&mut self) {
        lock_running_queue_keys().remove(&self.key);
    }
}

fn running_queue_keys() -> &'static Mutex<HashSet<String>> {
    static RUNNING_QUEUES: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    RUNNING_QUEUES.get_or_init(|| Mutex::new(HashSet::new()))
}

fn lock_running_queue_keys() -> MutexGuard<'static, HashSet<String>> {
    running_queue_keys()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn queue_lock_key(db_path: Option<&Path>) -> String {
    let path = db_path
        .map(Path::to_path_buf)
        .unwrap_or_else(db::default_database_path);
    let absolute = if path.is_absolute() {
        path
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(path)
    };
    absolute.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn invalid_batch_like_task_stops_before_writing_files() {
        let root = std::env::temp_dir().join(format!("kmoe-queue-invalid-{}", timestamp()));
        let db_path = root.join("queue.sqlite3");
        let download_root = root.join("downloads");
        std::fs::create_dir_all(&root).expect("temp dir creates");
        let conn = db::open_connection(db_path.clone()).expect("db opens");
        let task = sample_task("task-1", "3089,3090", "batch-like", "100");
        db::upsert_download_task(&conn, &task).expect("task inserts");
        drop(conn);

        let client = KmoeHttpClient::new().expect("http client initializes");
        let error = process_download_queue_at(
            Some(db_path.clone()),
            &client,
            Some(download_root.to_string_lossy().to_string()),
        )
        .await
        .expect_err("batch-like vol id is rejected");

        assert!(error.contains("invalid vol id"));
        let conn = db::open_connection(db_path).expect("db reopens");
        let task = db::get_download_task(&conn, "task-1")
            .expect("task reads")
            .expect("task exists");
        assert_eq!(task.status, "failed");
        assert!(task
            .error_message
            .unwrap_or_default()
            .contains("invalid vol id"));
        assert_eq!(db::list_downloaded_files(&conn).unwrap().len(), 0);
        assert!(!download_root.exists());
        let _ = std::fs::remove_dir_all(root);
    }

    fn sample_task(id: &str, vol_id: &str, volume_title: &str, created_at: &str) -> DownloadTask {
        DownloadTask {
            id: id.to_string(),
            comic_id: "53339".to_string(),
            comic_title: "尖帽子的魔法工房".to_string(),
            vol_id: vol_id.to_string(),
            volume_title: volume_title.to_string(),
            format: "mobi".to_string(),
            status: "queued".to_string(),
            progress: 0.0,
            downloaded_bytes: 0,
            total_bytes: Some(2048),
            retry_count: 0,
            error_message: None,
            local_path: None,
            created_at: created_at.to_string(),
            updated_at: created_at.to_string(),
        }
    }

    fn timestamp() -> String {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos().to_string())
            .unwrap_or_else(|_| "0".to_string())
    }
}
