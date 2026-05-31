use std::time::Instant;
use tokio::time::Duration;

use crate::fs_utils;
use crate::models::{DownloadTask, DownloadedFile};
use crate::web_adapter::KmoeHttpClient;

const DOWNLOAD_AUTHORIZATION_LINES: [u8; 2] = [0, 1];
const MIN_REAL_PROGRESS_UPDATE_INTERVAL: Duration = Duration::from_millis(350);
const MIN_REAL_PROGRESS_UPDATE_BYTES: i64 = 512 * 1024;
const ERROR_DOWNLOAD_FAILED: &str = "下载失败，请稍后重试。";
const ERROR_CREATE_DOWNLOAD_DIR: &str = "无法创建下载目录，请检查保存位置权限。";
const ERROR_FINALIZE_DOWNLOAD: &str = "无法保存下载文件，请检查保存位置权限。";
const ERROR_EMPTY_DOWNLOAD: &str = "下载文件为空，请重新尝试。";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DownloadDirective {
    Continue,
    Pause,
    Cancel,
}

pub async fn real_download(
    client: &KmoeHttpClient,
    task: DownloadTask,
    download_dir: Option<String>,
) -> (DownloadTask, Option<DownloadedFile>) {
    real_download_with_updates(client, task, download_dir, |_| {}).await
}

pub async fn real_download_with_updates<F>(
    client: &KmoeHttpClient,
    task: DownloadTask,
    download_dir: Option<String>,
    mut on_update: F,
) -> (DownloadTask, Option<DownloadedFile>)
where
    F: FnMut(&DownloadTask),
{
    real_download_with_control(client, task, download_dir, |task| {
        on_update(task);
        DownloadDirective::Continue
    })
    .await
}

pub async fn real_download_with_control<F>(
    client: &KmoeHttpClient,
    mut task: DownloadTask,
    download_dir: Option<String>,
    mut on_update: F,
) -> (DownloadTask, Option<DownloadedFile>)
where
    F: FnMut(&DownloadTask) -> DownloadDirective,
{
    task.status = "authorizing".to_string();
    task.updated_at = timestamp();
    if apply_update(&mut task, &mut on_update) {
        return (task, None);
    }
    let base_dir = fs_utils::normalize_download_dir(download_dir)
        .unwrap_or_else(|_| fs_utils::default_download_dir());
    let comic_dir =
        std::path::Path::new(&base_dir).join(fs_utils::sanitize_filename(&task.comic_title));
    let file_extension = extension_for_format(&task.format);
    let filename = fs_utils::sanitize_filename(&format!(
        "{} - {}.{}",
        task.comic_title, task.volume_title, file_extension
    ));
    let (final_path, part_path) = fs_utils::available_download_paths(
        &comic_dir.join(filename),
        &format!("{file_extension}.part"),
    );

    if std::fs::create_dir_all(&comic_dir).is_err() {
        task.status = "failed".to_string();
        task.error_message = Some(ERROR_CREATE_DOWNLOAD_DIR.to_string());
        task.updated_at = timestamp();
        let _ = apply_update(&mut task, &mut on_update);
        return (task, None);
    }

    let mut last_error: Option<String> = None;
    let mut completed_transfer = None;
    for (attempt_index, line) in download_authorization_lines().iter().copied().enumerate() {
        if attempt_index > 0 {
            task.status = "authorizing".to_string();
            task.progress = 0.0;
            task.downloaded_bytes = 0;
            task.updated_at = timestamp();
            if apply_update(&mut task, &mut on_update) {
                cleanup_part_file(&part_path);
                return (task, None);
            }
        }

        let authorized_url = match client
            .authorize_single_download(&task.comic_id, &task.vol_id, &task.format, line)
            .await
        {
            Ok(url) => url,
            Err(error) => {
                last_error = Some(error);
                continue;
            }
        };

        task.status = "downloading".to_string();
        task.updated_at = timestamp();
        if apply_update(&mut task, &mut on_update) {
            cleanup_part_file(&part_path);
            return (task, None);
        }

        let mut stopped_by_control = DownloadDirective::Continue;
        let task_format = task.format.clone();
        let mut last_progress_update_at = Instant::now();
        let mut last_progress_update_bytes = task.downloaded_bytes;
        match client
            .download_authorized_to_file_with_progress(
                &authorized_url,
                &part_path,
                &task_format,
                |downloaded, total| {
                    task.downloaded_bytes = downloaded;
                    task.total_bytes = total.or(task.total_bytes);
                    if let Some(total_bytes) = task.total_bytes.filter(|value| *value > 0) {
                        task.progress =
                            ((downloaded as f64 / total_bytes as f64) * 100.0).clamp(1.0, 99.0);
                    }
                    let should_update = should_persist_real_progress(
                        downloaded,
                        total,
                        last_progress_update_bytes,
                        last_progress_update_at,
                    );
                    if should_update {
                        task.updated_at = timestamp();
                        last_progress_update_at = Instant::now();
                        last_progress_update_bytes = downloaded;
                        stopped_by_control = on_update(&task);
                        stopped_by_control != DownloadDirective::Continue
                    } else {
                        false
                    }
                },
            )
            .await
        {
            Ok(transfer) => {
                completed_transfer = Some(transfer);
                break;
            }
            Err(error) => {
                cleanup_part_file(&part_path);
                if apply_directive(&mut task, stopped_by_control) {
                    return (task, None);
                }
                last_error = Some(error);
            }
        }
    }
    let transfer = match completed_transfer {
        Some(transfer) => transfer,
        None => {
            task.status = "failed".to_string();
            task.error_message =
                Some(last_error.unwrap_or_else(|| ERROR_DOWNLOAD_FAILED.to_string()));
            task.updated_at = timestamp();
            let _ = apply_update(&mut task, &mut on_update);
            return (task, None);
        }
    };

    if apply_update(&mut task, &mut on_update) {
        cleanup_part_file(&part_path);
        return (task, None);
    }
    task.status = "verifying".to_string();
    task.updated_at = timestamp();
    if apply_update(&mut task, &mut on_update) {
        cleanup_part_file(&part_path);
        return (task, None);
    }

    if std::fs::rename(&part_path, &final_path).is_err() {
        cleanup_part_file(&part_path);
        task.status = "failed".to_string();
        task.error_message = Some(ERROR_FINALIZE_DOWNLOAD.to_string());
        task.updated_at = timestamp();
        let _ = apply_update(&mut task, &mut on_update);
        return (task, None);
    }

    if transfer.downloaded_bytes == 0 {
        cleanup_part_file(&final_path);
        task.status = "failed".to_string();
        task.error_message = Some(ERROR_EMPTY_DOWNLOAD.to_string());
        task.updated_at = timestamp();
        let _ = apply_update(&mut task, &mut on_update);
        return (task, None);
    }

    task.status = "completed".to_string();
    task.progress = 100.0;
    task.downloaded_bytes = transfer.downloaded_bytes;
    task.total_bytes = transfer.content_length.or(Some(transfer.downloaded_bytes));
    task.local_path = Some(final_path.to_string_lossy().to_string());
    task.updated_at = timestamp();
    if apply_update(&mut task, &mut on_update) {
        cleanup_part_file(&final_path);
        return (task, None);
    }

    let file = DownloadedFile {
        id: format!("file-{}", task.id),
        task_id: Some(task.id.clone()),
        comic_id: task.comic_id.clone(),
        comic_title: task.comic_title.clone(),
        vol_id: task.vol_id.clone(),
        volume_title: task.volume_title.clone(),
        format: task.format.clone(),
        local_path: task.local_path.clone().unwrap_or_default(),
        size_bytes: task.total_bytes,
        downloaded_at: task.updated_at.clone(),
    };
    (task, Some(file))
}

fn should_persist_real_progress(
    downloaded: i64,
    total: Option<i64>,
    last_downloaded: i64,
    last_updated_at: Instant,
) -> bool {
    let byte_delta = downloaded.saturating_sub(last_downloaded);
    let reached_end = total.is_some_and(|total_bytes| total_bytes > 0 && downloaded >= total_bytes);
    reached_end
        || byte_delta >= MIN_REAL_PROGRESS_UPDATE_BYTES
        || last_updated_at.elapsed() >= MIN_REAL_PROGRESS_UPDATE_INTERVAL
}

fn apply_update<F>(task: &mut DownloadTask, on_update: &mut F) -> bool
where
    F: FnMut(&DownloadTask) -> DownloadDirective,
{
    let directive = on_update(task);
    apply_directive(task, directive)
}

fn apply_directive(task: &mut DownloadTask, directive: DownloadDirective) -> bool {
    match directive {
        DownloadDirective::Continue => false,
        DownloadDirective::Pause => {
            task.status = "paused".to_string();
            task.local_path = None;
            task.updated_at = timestamp();
            true
        }
        DownloadDirective::Cancel => {
            task.status = "cancelled".to_string();
            task.local_path = None;
            task.updated_at = timestamp();
            true
        }
    }
}

fn extension_for_format(format: &str) -> &str {
    match format {
        "source_zip" => "zip",
        "mobi" => "mobi",
        "epub" => "epub",
        _ => format,
    }
}

fn download_authorization_lines() -> &'static [u8] {
    &DOWNLOAD_AUTHORIZATION_LINES
}

fn cleanup_part_file(part_path: &std::path::Path) {
    let _ = std::fs::remove_file(part_path);
}

fn timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    seconds.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration as StdDuration, Instant as StdInstant};

    #[test]
    fn real_download_progress_updates_are_rate_limited() {
        let recent = StdInstant::now();
        assert!(!should_persist_real_progress(
            128 * 1024,
            Some(1024 * 1024),
            0,
            recent
        ));
        assert!(should_persist_real_progress(
            640 * 1024,
            Some(1024 * 1024),
            0,
            recent
        ));
        assert!(should_persist_real_progress(
            128 * 1024,
            Some(1024 * 1024),
            0,
            StdInstant::now() - StdDuration::from_millis(450)
        ));
        assert!(should_persist_real_progress(
            1024 * 1024,
            Some(1024 * 1024),
            640 * 1024,
            recent
        ));
    }

    #[test]
    fn real_download_filename_extension_matches_download_format() {
        assert_eq!(extension_for_format("mobi"), "mobi");
        assert_eq!(extension_for_format("epub"), "epub");
        assert_eq!(extension_for_format("source_zip"), "zip");
    }

    #[test]
    fn real_download_tries_both_single_item_authorization_lines() {
        assert_eq!(download_authorization_lines(), &[0, 1]);
    }

    #[test]
    fn cleanup_part_file_removes_only_existing_file() {
        let root = std::env::temp_dir().join(format!("kmoe-part-cleanup-{}", timestamp()));
        std::fs::create_dir_all(&root).expect("temp dir creates");
        let part = root.join("comic.mobi.part");
        std::fs::write(&part, "partial").expect("part writes");

        cleanup_part_file(&part);
        cleanup_part_file(&part);

        assert!(!part.exists());
        let _ = std::fs::remove_dir_all(root);
    }
}
