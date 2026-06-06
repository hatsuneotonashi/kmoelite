use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub concurrency: u8,
    #[serde(rename = "downloadDirectory")]
    pub download_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadTask {
    pub id: String,
    pub comic_id: String,
    pub comic_title: String,
    pub vol_id: String,
    pub volume_title: String,
    pub format: String,
    pub status: String,
    pub progress: f64,
    pub downloaded_bytes: i64,
    pub total_bytes: Option<i64>,
    pub retry_count: i64,
    pub error_message: Option<String>,
    pub local_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadedFile {
    pub id: String,
    pub task_id: Option<String>,
    pub comic_id: String,
    pub comic_title: String,
    pub vol_id: String,
    pub volume_title: String,
    pub format: String,
    pub local_path: String,
    pub size_bytes: Option<i64>,
    pub downloaded_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteLocalReadingDataInput {
    pub comic_ids: Option<Vec<String>>,
    pub volume_ids: Option<Vec<String>>,
    pub chapter_ids: Option<Vec<String>>,
    pub include_source_files: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteLocalReadingDataResult {
    pub cache_stats: CacheStats,
    pub removed_chapter_ids: Vec<String>,
    pub removed_file_ids: Vec<String>,
    pub removed_task_ids: Vec<String>,
    pub deleted_file_count: usize,
    pub missing_file_count: usize,
    pub tasks: Vec<DownloadTask>,
    pub library: Vec<DownloadedFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shelf {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfItem {
    pub id: String,
    pub shelf_id: String,
    pub comic_id: String,
    pub comic_title: String,
    pub comic_url: Option<String>,
    pub cover_url: Option<String>,
    pub comic_status: Option<String>,
    pub latest_volume: Option<String>,
    pub last_read_volume_id: Option<String>,
    pub last_read_label: Option<String>,
    pub unread_count: i64,
    pub cached: bool,
    pub archived: bool,
    pub added_at: String,
    pub updated_at: String,
    pub last_read_at: Option<String>,
    pub last_update_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingProgress {
    pub id: String,
    pub comic_id: String,
    pub comic_title: String,
    pub volume_id: String,
    pub volume_title: String,
    pub page_index: i64,
    pub page_count: Option<i64>,
    pub progress_percent: f64,
    pub last_read_at: String,
    pub finished: bool,
    pub reading_mode: String,
    pub reading_direction: String,
    pub page_layout: String,
    pub zoom: Option<f64>,
    pub rotation: Option<i64>,
    pub crop_json: Option<String>,
    pub spread_overrides_json: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingHistoryEntry {
    pub id: String,
    pub comic_id: String,
    pub comic_title: String,
    pub volume_id: String,
    pub volume_title: String,
    pub page_index: i64,
    pub progress_percent: f64,
    pub event: String,
    pub read_at: String,
    pub duration_seconds: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterCache {
    pub id: String,
    pub comic_id: String,
    pub comic_title: String,
    pub volume_id: String,
    pub volume_title: String,
    pub format: String,
    pub cache_kind: String,
    pub source_task_id: Option<String>,
    pub cache_dir: String,
    pub size_bytes: i64,
    pub page_count: Option<i64>,
    pub status: String,
    pub policy: Option<String>,
    pub last_accessed_at: String,
    pub created_at: String,
    pub updated_at: String,
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageCache {
    pub id: String,
    pub chapter_cache_id: String,
    pub comic_id: String,
    pub volume_id: String,
    pub page_index: i64,
    pub file_path: String,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub size_bytes: Option<i64>,
    pub created_at: String,
    pub last_accessed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachePolicy {
    pub id: String,
    pub mode: String,
    pub keep_previous_chapters: i64,
    pub keep_next_chapters: i64,
    pub max_recent_chapters: i64,
    pub wifi_prefetch: bool,
    pub low_power_reduce_prefetch: bool,
    pub max_cache_bytes: Option<i64>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CacheStats {
    pub total_bytes: i64,
    pub permanent_download_bytes: i64,
    pub reading_cache_bytes: i64,
    pub metadata_cache_bytes: i64,
    pub chapter_count: i64,
    pub page_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertShelfItemInput {
    pub shelf: Shelf,
    pub item: ShelfItem,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReadingProgressInput {
    pub progress: ReadingProgress,
    pub history: Option<ReadingHistoryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveChapterCacheInput {
    pub chapter: ChapterCache,
    pub pages: Vec<PageCache>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareReaderChapterCacheInput {
    pub archive_path: String,
    pub comic_id: String,
    pub comic_title: String,
    pub volume_id: String,
    pub volume_title: String,
    pub source_task_id: Option<String>,
    pub format: Option<String>,
    pub policy: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedReaderChapterCache {
    pub chapter: ChapterCache,
    pub pages: Vec<PageCache>,
    pub manifest: crate::reader::ReaderArchiveManifest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderCachedPageImage {
    pub chapter_cache_id: String,
    pub comic_id: String,
    pub volume_id: String,
    pub page_index: i64,
    pub file_name: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub data_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationSnapshotImportResult {
    pub imported_tasks: usize,
    pub imported_library: usize,
    pub tasks: Vec<DownloadTask>,
    pub library: Vec<DownloadedFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadPreflightCheck {
    pub id: String,
    pub label: String,
    pub status: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadPreflight {
    pub ok: bool,
    pub mode: String,
    pub queued_count: usize,
    pub active_count: usize,
    pub download_directory: Option<String>,
    pub first_task_id: Option<String>,
    pub first_task_label: Option<String>,
    pub checks: Vec<DownloadPreflightCheck>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginInput {
    pub email: String,
    pub password: String,
    pub remember: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogQueryInput {
    pub keyword: Option<String>,
    pub category: Option<String>,
    pub status: Option<String>,
    pub language: Option<String>,
    pub region: Option<String>,
    pub length: Option<String>,
    pub color: Option<bool>,
    pub hd: Option<bool>,
    pub sort: Option<String>,
    pub page: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reader_models_serialize_with_command_friendly_camel_case() {
        let payload = serde_json::to_value(SaveReadingProgressInput {
            progress: ReadingProgress {
                id: "53339-3089".to_string(),
                comic_id: "53339".to_string(),
                comic_title: "尖帽子的魔法工房".to_string(),
                volume_id: "3089".to_string(),
                volume_title: "話 089-095".to_string(),
                page_index: 12,
                page_count: Some(180),
                progress_percent: 6.67,
                last_read_at: "103".to_string(),
                finished: false,
                reading_mode: "paged".to_string(),
                reading_direction: "rtl".to_string(),
                page_layout: "single".to_string(),
                zoom: Some(1.25),
                rotation: Some(90),
                crop_json: Some(r#"{"crop":"fit"}"#.to_string()),
                spread_overrides_json: Some(r#"{"1":"force_double"}"#.to_string()),
                updated_at: "103".to_string(),
            },
            history: Some(ReadingHistoryEntry {
                id: "history-1".to_string(),
                comic_id: "53339".to_string(),
                comic_title: "尖帽子的魔法工房".to_string(),
                volume_id: "3089".to_string(),
                volume_title: "話 089-095".to_string(),
                page_index: 12,
                progress_percent: 6.67,
                event: "read".to_string(),
                read_at: "103".to_string(),
                duration_seconds: Some(45),
            }),
        })
        .expect("reader progress serializes");

        assert_eq!(payload["progress"]["comicId"], "53339");
        assert_eq!(payload["progress"]["pageIndex"], 12);
        assert_eq!(payload["progress"]["readingDirection"], "rtl");
        assert_eq!(payload["progress"]["rotation"], 90);
        assert_eq!(
            payload["progress"]["spreadOverridesJson"],
            r#"{"1":"force_double"}"#
        );
        assert_eq!(payload["history"]["durationSeconds"], 45);
        assert!(payload["progress"].get("comic_id").is_none());
    }

    #[test]
    fn cache_command_model_groups_chapter_and_pages() {
        let payload = serde_json::to_value(SaveChapterCacheInput {
            chapter: ChapterCache {
                id: "cache-53339-3089-cbz".to_string(),
                comic_id: "53339".to_string(),
                comic_title: "尖帽子的魔法工房".to_string(),
                volume_id: "3089".to_string(),
                volume_title: "話 089-095".to_string(),
                format: "source_zip".to_string(),
                cache_kind: "reading".to_string(),
                source_task_id: Some("task-1".to_string()),
                cache_dir: "/tmp/Kmoe/Cache/53339/3089".to_string(),
                size_bytes: 4096,
                page_count: Some(180),
                status: "ready".to_string(),
                policy: Some("balanced".to_string()),
                last_accessed_at: "104".to_string(),
                created_at: "103".to_string(),
                updated_at: "104".to_string(),
                expires_at: None,
            },
            pages: vec![PageCache {
                id: "page-1".to_string(),
                chapter_cache_id: "cache-53339-3089-cbz".to_string(),
                comic_id: "53339".to_string(),
                volume_id: "3089".to_string(),
                page_index: 0,
                file_path: "/tmp/Kmoe/Cache/53339/3089/0001.jpg".to_string(),
                width: Some(1400),
                height: Some(2000),
                size_bytes: Some(1024),
                created_at: "103".to_string(),
                last_accessed_at: "104".to_string(),
            }],
        })
        .expect("cache payload serializes");

        assert_eq!(payload["chapter"]["cacheKind"], "reading");
        assert_eq!(payload["chapter"]["sourceTaskId"], "task-1");
        assert_eq!(
            payload["pages"][0]["chapterCacheId"],
            "cache-53339-3089-cbz"
        );
        assert_eq!(payload["pages"][0]["pageIndex"], 0);
    }
}
