use crate::models::{ChapterCache, DownloadTask, PageCache, ReadingProgress, Shelf, ShelfItem};

pub(super) fn read_download_task(row: &rusqlite::Row<'_>) -> rusqlite::Result<DownloadTask> {
    Ok(DownloadTask {
        id: row.get(0)?,
        comic_id: row.get(1)?,
        comic_title: row.get(2)?,
        vol_id: row.get(3)?,
        volume_title: row.get(4)?,
        format: row.get(5)?,
        status: row.get(6)?,
        progress: row.get(7)?,
        downloaded_bytes: row.get(8)?,
        total_bytes: row.get(9)?,
        retry_count: row.get(10)?,
        error_message: row.get(11)?,
        local_path: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

pub(super) fn priority_queue_created_at(updated_at: &str) -> String {
    let seconds = updated_at.parse::<u64>().unwrap_or_default();
    format!("!{:020}", u64::MAX.saturating_sub(seconds))
}

pub(super) fn read_shelf(row: &rusqlite::Row<'_>) -> rusqlite::Result<Shelf> {
    Ok(Shelf {
        id: row.get(0)?,
        name: row.get(1)?,
        kind: row.get(2)?,
        sort_order: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        archived_at: row.get(6)?,
    })
}

pub(super) fn read_shelf_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<ShelfItem> {
    Ok(ShelfItem {
        id: row.get(0)?,
        shelf_id: row.get(1)?,
        comic_id: row.get(2)?,
        comic_title: row.get(3)?,
        comic_url: row.get(4)?,
        cover_url: row.get(5)?,
        comic_status: row.get(6)?,
        latest_volume: row.get(7)?,
        last_read_volume_id: row.get(8)?,
        last_read_label: row.get(9)?,
        unread_count: row.get(10)?,
        cached: row.get(11)?,
        archived: row.get(12)?,
        added_at: row.get(13)?,
        updated_at: row.get(14)?,
        last_read_at: row.get(15)?,
        last_update_at: row.get(16)?,
    })
}

pub(super) fn read_reading_progress(row: &rusqlite::Row<'_>) -> rusqlite::Result<ReadingProgress> {
    Ok(ReadingProgress {
        id: row.get(0)?,
        comic_id: row.get(1)?,
        comic_title: row.get(2)?,
        volume_id: row.get(3)?,
        volume_title: row.get(4)?,
        page_index: row.get(5)?,
        page_count: row.get(6)?,
        progress_percent: row.get(7)?,
        last_read_at: row.get(8)?,
        finished: row.get(9)?,
        reading_mode: row.get(10)?,
        reading_direction: row.get(11)?,
        page_layout: row.get(12)?,
        zoom: row.get(13)?,
        rotation: row.get(14)?,
        crop_json: row.get(15)?,
        spread_overrides_json: row.get(16)?,
        updated_at: row.get(17)?,
    })
}

pub(super) fn read_chapter_cache(row: &rusqlite::Row<'_>) -> rusqlite::Result<ChapterCache> {
    Ok(ChapterCache {
        id: row.get(0)?,
        comic_id: row.get(1)?,
        comic_title: row.get(2)?,
        volume_id: row.get(3)?,
        volume_title: row.get(4)?,
        format: row.get(5)?,
        cache_kind: row.get(6)?,
        source_task_id: row.get(7)?,
        cache_dir: row.get(8)?,
        size_bytes: row.get(9)?,
        page_count: row.get(10)?,
        status: row.get(11)?,
        policy: row.get(12)?,
        last_accessed_at: row.get(13)?,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
        expires_at: row.get(16)?,
    })
}

pub(super) fn read_page_cache(row: &rusqlite::Row<'_>) -> rusqlite::Result<PageCache> {
    Ok(PageCache {
        id: row.get(0)?,
        chapter_cache_id: row.get(1)?,
        comic_id: row.get(2)?,
        volume_id: row.get(3)?,
        page_index: row.get(4)?,
        file_path: row.get(5)?,
        width: row.get(6)?,
        height: row.get(7)?,
        size_bytes: row.get(8)?,
        created_at: row.get(9)?,
        last_accessed_at: row.get(10)?,
    })
}
