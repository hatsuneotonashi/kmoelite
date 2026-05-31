use super::*;

#[test]
fn persists_tasks_settings_and_downloaded_files() {
    let conn = Connection::open_in_memory().expect("memory db opens");
    init_schema(&conn).expect("schema initializes");
    let task = sample_task("queued");

    upsert_download_task(&conn, &task).expect("task inserts");
    set_setting(&conn, "download_dir", "/tmp/Kmoe", "101").expect("setting inserts");
    let tasks = list_download_tasks(&conn).expect("tasks list");

    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0].id, "53339-3089-mobi");
    assert_eq!(
        get_setting(&conn, "download_dir").unwrap().unwrap(),
        "/tmp/Kmoe"
    );
    delete_setting(&conn, "download_dir").expect("setting deletes");
    assert!(get_setting(&conn, "download_dir").unwrap().is_none());
    set_setting(&conn, "download_dir", "/tmp/Kmoe", "102").expect("setting reinserts");

    let first = first_queued_task(&conn)
        .expect("query succeeds")
        .expect("queued task exists");
    assert_eq!(first.vol_id, "3089");

    let mut completed = task.clone();
    completed.status = "completed".to_string();
    completed.progress = 100.0;
    completed.downloaded_bytes = 2048;
    completed.local_path = Some("/tmp/Kmoe/file.mobi".to_string());
    completed.updated_at = "102".to_string();
    upsert_download_task(&conn, &completed).expect("status updates");
    assert!(first_queued_task(&conn).unwrap().is_none());

    let file = DownloadedFile {
        id: "file-53339-3089-mobi".to_string(),
        task_id: Some(task.id),
        comic_id: "53339".to_string(),
        comic_title: "尖帽子的魔法工房".to_string(),
        vol_id: "3089".to_string(),
        volume_title: "話 089-095".to_string(),
        format: "mobi".to_string(),
        local_path: "/tmp/Kmoe/file.mobi".to_string(),
        size_bytes: Some(2048),
        downloaded_at: "103".to_string(),
    };
    insert_downloaded_file(&conn, &file).expect("file inserts");
    assert!(!insert_downloaded_file_if_absent(&conn, &file).expect("duplicate file is skipped"));
    assert_eq!(list_downloaded_files(&conn).unwrap().len(), 1);

    clear_unfinished_tasks(&conn).expect("clear queue succeeds");
    assert_eq!(list_downloaded_files(&conn).unwrap().len(), 1);
}

#[test]
fn default_database_path_lives_under_app_data() {
    let root = std::env::temp_dir().join(format!("kmoe-app-data-{}", timestamp()));
    assert_eq!(
        database_path_in_app_data_dir(&root),
        root.join(SQLITE_FILENAME)
    );
    assert!(!database_path_in_app_data_dir(&root).ends_with(".kmoe-client.sqlite3"));
}

#[test]
fn open_connection_creates_parent_directories() {
    let root = std::env::temp_dir().join(format!("kmoe-db-parent-{}", timestamp()));
    let db_path = root.join("nested").join(SQLITE_FILENAME);

    let conn = open_connection(db_path.clone()).expect("db opens under nested app data");
    init_schema(&conn).expect("schema remains initialized");
    drop(conn);

    assert!(db_path.exists());
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn schema_includes_shelves_reading_progress_and_cache_tables() {
    let conn = Connection::open_in_memory().expect("memory db opens");
    init_schema(&conn).expect("schema initializes");

    let tables = schema_names(&conn, "table");
    for table in [
        "shelves",
        "shelf_items",
        "reading_progress",
        "reading_history",
        "chapter_cache",
        "page_cache",
        "cache_policy",
    ] {
        assert!(tables.contains(&table.to_string()), "{table} table exists");
    }
    assert!(
        table_columns(&conn, "shelf_items").contains(&"comic_status".to_string()),
        "shelf_items comic_status column exists"
    );
    assert!(
        table_columns(&conn, "reading_progress").contains(&"rotation".to_string()),
        "reading_progress rotation column exists"
    );

    let indexes = schema_names(&conn, "index");
    for index in [
        "idx_shelf_items_shelf_updated",
        "idx_shelf_items_comic",
        "idx_reading_progress_last_read",
        "idx_reading_history_comic_read_at",
        "idx_chapter_cache_accessed",
        "idx_chapter_cache_status",
        "idx_page_cache_chapter_page",
    ] {
        assert!(indexes.contains(&index.to_string()), "{index} index exists");
    }
}

#[test]
fn init_schema_migrates_existing_reading_progress_columns() {
    let conn = Connection::open_in_memory().expect("memory db opens");
    conn.execute_batch(
        r#"
            CREATE TABLE reading_progress (
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
              crop_json TEXT,
              updated_at TEXT NOT NULL,
              UNIQUE (comic_id, volume_id)
            );
            "#,
    )
    .expect("old reading_progress schema creates");

    init_schema(&conn).expect("schema migrates");

    assert!(
        table_columns(&conn, "reading_progress").contains(&"rotation".to_string()),
        "existing reading_progress table gains rotation"
    );
    assert!(
        table_columns(&conn, "reading_progress").contains(&"spread_overrides_json".to_string()),
        "existing reading_progress table gains spread_overrides_json"
    );
}

#[test]
fn init_schema_migrates_existing_shelf_items_comic_status_column() {
    let conn = Connection::open_in_memory().expect("memory db opens");
    conn.execute_batch(
        r#"
            CREATE TABLE shelf_items (
              id TEXT PRIMARY KEY,
              shelf_id TEXT NOT NULL,
              comic_id TEXT NOT NULL,
              comic_title TEXT NOT NULL,
              comic_url TEXT,
              cover_url TEXT,
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
              UNIQUE (shelf_id, comic_id)
            );
            "#,
    )
    .expect("old shelf_items schema creates");

    init_schema(&conn).expect("schema migrates");

    assert!(
        table_columns(&conn, "shelf_items").contains(&"comic_status".to_string()),
        "existing shelf_items table gains comic_status"
    );
}

#[test]
fn shelf_reading_and_cache_rows_accept_core_reader_state() {
    let conn = Connection::open_in_memory().expect("memory db opens");
    init_schema(&conn).expect("schema initializes");

    conn.execute(
        r#"
            INSERT INTO shelves (id, name, kind, sort_order, created_at, updated_at)
            VALUES ('default', '书架', 'default', 0, '100', '100')
            "#,
        [],
    )
    .expect("shelf inserts");
    conn.execute(
        r#"
            INSERT INTO shelf_items (
              id, shelf_id, comic_id, comic_title, latest_volume, last_read_volume_id,
              last_read_label, unread_count, cached, added_at, updated_at, last_read_at
            ) VALUES (
              'default-53339', 'default', '53339', '尖帽子的魔法工房', '話 095',
              '3089', '继续读第 095 话 / 第 12 页', 2, 1, '100', '101', '101'
            )
            "#,
        [],
    )
    .expect("shelf item inserts");
    assert!(
        conn.execute(
            r#"
                INSERT INTO shelf_items (id, shelf_id, comic_id, comic_title, added_at, updated_at)
                VALUES ('duplicate-53339', 'default', '53339', '重复漫画', '102', '102')
                "#,
            [],
        )
        .is_err(),
        "one comic cannot be duplicated inside the same shelf"
    );

    conn.execute(
        r#"
            INSERT INTO reading_progress (
              id, comic_id, comic_title, volume_id, volume_title, page_index, page_count,
              progress_percent, last_read_at, finished, reading_mode, reading_direction,
              page_layout, zoom, rotation, crop_json, updated_at
            ) VALUES (
              '53339-3089', '53339', '尖帽子的魔法工房', '3089', '話 089-095',
              12, 180, 6.67, '103', 0, 'paged', 'rtl', 'single', 1.25,
              90, '{"crop":"fit"}', '103'
            )
            "#,
        [],
    )
    .expect("reading progress inserts");
    conn.execute(
        r#"
            INSERT INTO reading_history (
              id, comic_id, comic_title, volume_id, volume_title, page_index,
              progress_percent, event, read_at, duration_seconds
            ) VALUES (
              'history-1', '53339', '尖帽子的魔法工房', '3089', '話 089-095',
              12, 6.67, 'read', '103', 45
            )
            "#,
        [],
    )
    .expect("reading history inserts");

    conn.execute(
        r#"
            INSERT INTO chapter_cache (
              id, comic_id, comic_title, volume_id, volume_title, format, cache_kind,
              source_task_id, cache_dir, size_bytes, page_count, status, policy,
              last_accessed_at, created_at, updated_at
            ) VALUES (
              'cache-53339-3089-cbz', '53339', '尖帽子的魔法工房', '3089',
              '話 089-095', 'source_zip', 'reading', 'task-1',
              '/Users/example/Library/Application Support/Kmoe Client/Cache/53339/3089',
              4096, 180, 'ready', 'balanced', '104', '103', '104'
            )
            "#,
        [],
    )
    .expect("chapter cache inserts");
    conn.execute(
        r#"
            INSERT INTO page_cache (
              id, chapter_cache_id, comic_id, volume_id, page_index, file_path,
              width, height, size_bytes, created_at, last_accessed_at
            ) VALUES (
              'page-1', 'cache-53339-3089-cbz', '53339', '3089', 0,
              '/Users/example/Library/Application Support/Kmoe Client/Cache/53339/3089/0001.jpg',
              1400, 2000, 1024, '103', '104'
            )
            "#,
        [],
    )
    .expect("page cache inserts");
    conn.execute(
        r#"
            INSERT INTO cache_policy (
              id, mode, keep_previous_chapters, keep_next_chapters, max_recent_chapters,
              wifi_prefetch, low_power_reduce_prefetch, max_cache_bytes, updated_at
            ) VALUES ('default', 'balanced', 1, 1, 3, 1, 1, 536870912, '104')
            "#,
        [],
    )
    .expect("cache policy inserts");

    let unread_count: i64 = conn
        .query_row(
            "SELECT unread_count FROM shelf_items WHERE id = 'default-53339'",
            [],
            |row| row.get(0),
        )
        .expect("shelf item reads");
    assert_eq!(unread_count, 2);

    let progress: f64 = conn
        .query_row(
            "SELECT progress_percent FROM reading_progress WHERE id = '53339-3089'",
            [],
            |row| row.get(0),
        )
        .expect("reading progress reads");
    assert!((progress - 6.67).abs() < f64::EPSILON);
}

#[test]
fn shelf_progress_and_cache_crud_round_trips_command_models() {
    let conn = Connection::open_in_memory().expect("memory db opens");
    init_schema(&conn).expect("schema initializes");

    let shelf = Shelf {
        id: "default".to_string(),
        name: "书架".to_string(),
        kind: "default".to_string(),
        sort_order: 0,
        created_at: "100".to_string(),
        updated_at: "100".to_string(),
        archived_at: None,
    };
    upsert_shelf(&conn, &shelf).expect("shelf upserts");
    assert_eq!(list_shelves(&conn).unwrap()[0].name, "书架");

    let item = ShelfItem {
        id: "default-53339".to_string(),
        shelf_id: "default".to_string(),
        comic_id: "53339".to_string(),
        comic_title: "尖帽子的魔法工房".to_string(),
        comic_url: Some("/c/53339.htm".to_string()),
        cover_url: None,
        comic_status: Some("連載".to_string()),
        latest_volume: Some("話 095".to_string()),
        last_read_volume_id: Some("3089".to_string()),
        last_read_label: Some("继续读 話 089-095 · 第 12 页".to_string()),
        unread_count: 2,
        cached: true,
        archived: false,
        added_at: "100".to_string(),
        updated_at: "101".to_string(),
        last_read_at: Some("101".to_string()),
        last_update_at: Some("102".to_string()),
    };
    upsert_shelf_item(&conn, &item).expect("shelf item upserts");
    let saved_item = list_shelf_items(&conn).unwrap().remove(0);
    assert_eq!(saved_item.comic_id, "53339");
    assert_eq!(saved_item.comic_status.as_deref(), Some("連載"));

    let input = SaveReadingProgressInput {
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
            crop_json: Some(r#"{"mode":"auto"}"#.to_string()),
            spread_overrides_json: Some(r#"{"1":"force_double"}"#.to_string()),
            updated_at: "103".to_string(),
        },
        history: Some(ReadingHistoryEntry {
            id: "history-53339-3089-103".to_string(),
            comic_id: "53339".to_string(),
            comic_title: "尖帽子的魔法工房".to_string(),
            volume_id: "3089".to_string(),
            volume_title: "話 089-095".to_string(),
            page_index: 12,
            progress_percent: 6.67,
            event: "page_change".to_string(),
            read_at: "103".to_string(),
            duration_seconds: Some(45),
        }),
    };
    save_reading_progress(&conn, &input).expect("reading progress saves");
    assert_eq!(
        get_reading_progress(&conn, "53339", "3089")
            .unwrap()
            .unwrap()
            .reading_direction,
        "rtl"
    );
    assert_eq!(
        get_reading_progress(&conn, "53339", "3089")
            .unwrap()
            .unwrap()
            .rotation,
        Some(90)
    );
    assert_eq!(
        get_reading_progress(&conn, "53339", "3089")
            .unwrap()
            .unwrap()
            .spread_overrides_json
            .as_deref(),
        Some(r#"{"1":"force_double"}"#)
    );
    assert_eq!(list_reading_progress(&conn).unwrap().len(), 1);

    let cache_input = SaveChapterCacheInput {
        chapter: ChapterCache {
            id: "cache-53339-3089".to_string(),
            comic_id: "53339".to_string(),
            comic_title: "尖帽子的魔法工房".to_string(),
            volume_id: "3089".to_string(),
            volume_title: "話 089-095".to_string(),
            format: "source_zip".to_string(),
            cache_kind: "reading_cache".to_string(),
            source_task_id: Some("task-53339".to_string()),
            cache_dir: "/tmp/Kmoe/Cache/53339/3089".to_string(),
            size_bytes: 4096,
            page_count: Some(2),
            status: "ready".to_string(),
            policy: Some("balanced".to_string()),
            last_accessed_at: "104".to_string(),
            created_at: "103".to_string(),
            updated_at: "104".to_string(),
            expires_at: None,
        },
        pages: vec![
            PageCache {
                id: "page-1".to_string(),
                chapter_cache_id: "cache-53339-3089".to_string(),
                comic_id: "53339".to_string(),
                volume_id: "3089".to_string(),
                page_index: 1,
                file_path: "/tmp/Kmoe/Cache/53339/3089/0002.jpg".to_string(),
                width: Some(1400),
                height: Some(2000),
                size_bytes: Some(1024),
                created_at: "104".to_string(),
                last_accessed_at: "104".to_string(),
            },
            PageCache {
                id: "page-0".to_string(),
                chapter_cache_id: "cache-53339-3089".to_string(),
                comic_id: "53339".to_string(),
                volume_id: "3089".to_string(),
                page_index: 0,
                file_path: "/tmp/Kmoe/Cache/53339/3089/0001.jpg".to_string(),
                width: Some(1400),
                height: Some(2000),
                size_bytes: Some(1024),
                created_at: "104".to_string(),
                last_accessed_at: "104".to_string(),
            },
        ],
    };
    save_chapter_cache(&conn, &cache_input).expect("chapter cache saves");
    assert_eq!(list_chapter_cache(&conn).unwrap().len(), 1);
    assert_eq!(
        list_page_cache_for_chapter(&conn, "cache-53339-3089")
            .unwrap()
            .iter()
            .map(|page| page.page_index)
            .collect::<Vec<_>>(),
        vec![0, 1]
    );

    let updated_cache_input = SaveChapterCacheInput {
        chapter: ChapterCache {
            id: "cache-53339-3089-new-id".to_string(),
            size_bytes: 8192,
            page_count: Some(1),
            updated_at: "105".to_string(),
            ..cache_input.chapter.clone()
        },
        pages: vec![PageCache {
            id: "page-updated-0".to_string(),
            chapter_cache_id: "cache-53339-3089-new-id".to_string(),
            comic_id: "53339".to_string(),
            volume_id: "3089".to_string(),
            page_index: 0,
            file_path: "/tmp/Kmoe/Cache/53339/3089/0001-updated.jpg".to_string(),
            width: Some(1500),
            height: Some(2100),
            size_bytes: Some(2048),
            created_at: "105".to_string(),
            last_accessed_at: "105".to_string(),
        }],
    };
    save_chapter_cache(&conn, &updated_cache_input)
        .expect("chapter cache updates existing unique record");
    let chapters = list_chapter_cache(&conn).unwrap();
    assert_eq!(chapters.len(), 1);
    assert_eq!(chapters[0].id, "cache-53339-3089");
    assert_eq!(chapters[0].size_bytes, 8192);
    let updated_pages = list_page_cache_for_chapter(&conn, "cache-53339-3089").unwrap();
    assert_eq!(updated_pages.len(), 1);
    assert_eq!(
        updated_pages[0].file_path,
        "/tmp/Kmoe/Cache/53339/3089/0001-updated.jpg"
    );
    assert_eq!(
        cache_stats(&conn).unwrap(),
        CacheStats {
            total_bytes: 8192,
            permanent_download_bytes: 0,
            reading_cache_bytes: 8192,
            metadata_cache_bytes: 0,
            chapter_count: 1,
            page_count: 1,
        }
    );

    assert_eq!(
        clear_reading_cache(&conn, Some(&["cache-53339-3089".to_string()])).unwrap(),
        1
    );
    assert_eq!(cache_stats(&conn).unwrap().chapter_count, 0);

    remove_shelf_items(&conn, &["53339".to_string()]).expect("shelf item removes");
    assert!(list_shelf_items(&conn).unwrap().is_empty());
}

#[test]
fn inserts_download_tasks_without_overwriting_existing_rows() {
    let conn = Connection::open_in_memory().expect("memory db opens");
    init_schema(&conn).expect("schema initializes");
    let mut completed = sample_task("completed");
    completed.progress = 100.0;
    completed.local_path = Some("/tmp/Kmoe/original.mobi".to_string());
    upsert_download_task(&conn, &completed).expect("completed task inserts");

    let queued_duplicate = sample_task("queued");
    let inserted =
        insert_download_task_if_absent(&conn, &queued_duplicate).expect("duplicate skipped");
    assert!(!inserted);

    let task = get_download_task(&conn, &completed.id)
        .expect("task query succeeds")
        .expect("task exists");
    assert_eq!(task.status, "completed");
    assert_eq!(task.progress, 100.0);
    assert_eq!(task.local_path.as_deref(), Some("/tmp/Kmoe/original.mobi"));
}

#[test]
fn first_queued_task_has_deterministic_single_item_order() {
    let conn = Connection::open_in_memory().expect("memory db opens");
    init_schema(&conn).expect("schema initializes");
    let mut later_id = sample_task_with_id("queued-b", "queued");
    later_id.created_at = "100".to_string();
    let mut earlier_id = sample_task_with_id("queued-a", "queued");
    earlier_id.created_at = "100".to_string();

    upsert_download_task(&conn, &later_id).expect("later id task inserts");
    upsert_download_task(&conn, &earlier_id).expect("earlier id task inserts");

    let first = first_queued_task(&conn)
        .expect("query succeeds")
        .expect("queued task exists");
    assert_eq!(first.id, "queued-a");
}

#[test]
fn claim_next_queued_task_marks_one_ordered_task_authorizing() {
    let conn = Connection::open_in_memory().expect("memory db opens");
    init_schema(&conn).expect("schema initializes");
    let mut later = sample_task_with_id("queued-b", "queued");
    later.created_at = "101".to_string();
    let mut earlier = sample_task_with_id("queued-a", "queued");
    earlier.created_at = "100".to_string();
    earlier.progress = 80.0;
    earlier.downloaded_bytes = 1024;
    earlier.error_message = Some("stale restart state".to_string());
    earlier.local_path = Some("/tmp/stale.mobi".to_string());

    upsert_download_task(&conn, &later).expect("later task inserts");
    upsert_download_task(&conn, &earlier).expect("earlier task inserts");

    let claimed = claim_next_queued_task(&conn, "200")
        .expect("claim succeeds")
        .expect("queued task is claimed");
    assert_eq!(claimed.id, "queued-a");
    assert_eq!(claimed.status, "authorizing");
    assert_eq!(claimed.progress, 4.0);
    assert_eq!(claimed.downloaded_bytes, 0);
    assert!(claimed.error_message.is_none());
    assert!(claimed.local_path.is_none());
    assert_eq!(claimed.updated_at, "200");

    let next = first_queued_task(&conn)
        .expect("next query succeeds")
        .expect("one queued task remains");
    assert_eq!(next.id, "queued-b");

    let claimed_again = claim_next_queued_task(&conn, "201")
        .expect("second claim succeeds")
        .expect("second queued task is claimed");
    assert_eq!(claimed_again.id, "queued-b");
    assert!(claim_next_queued_task(&conn, "202")
        .expect("empty claim succeeds")
        .is_none());
}

#[test]
fn prioritizes_queued_task_as_next_claimed_item() {
    let conn = Connection::open_in_memory().expect("memory db opens");
    init_schema(&conn).expect("schema initializes");
    let mut older = sample_task_with_id("queued-a", "queued");
    older.created_at = "100".to_string();
    let mut target = sample_task_with_id("queued-b", "queued");
    target.created_at = "101".to_string();

    upsert_download_task(&conn, &older).expect("older task inserts");
    upsert_download_task(&conn, &target).expect("target task inserts");

    let prioritized = prioritize_download_task(&conn, "queued-b", "200").expect("task prioritizes");
    assert_eq!(prioritized.id, "queued-b");
    assert!(prioritized.created_at.starts_with('!'));
    assert_eq!(prioritized.updated_at, "200");

    let first = first_queued_task(&conn)
        .expect("query succeeds")
        .expect("queued task exists");
    assert_eq!(first.id, "queued-b");

    let claimed = claim_next_queued_task(&conn, "201")
        .expect("claim succeeds")
        .expect("queued task is claimed");
    assert_eq!(claimed.id, "queued-b");
}

#[test]
fn prioritizing_non_queued_task_is_rejected() {
    let conn = Connection::open_in_memory().expect("memory db opens");
    init_schema(&conn).expect("schema initializes");
    let active = sample_task_with_id("active", "downloading");

    upsert_download_task(&conn, &active).expect("active task inserts");

    assert!(prioritize_download_task(&conn, "active", "200")
        .expect_err("active tasks cannot be reordered")
        .contains("cannot prioritize"));
}

#[test]
fn guarded_task_update_preserves_pause_and_cancel_commands() {
    let conn = Connection::open_in_memory().expect("memory db opens");
    init_schema(&conn).expect("schema initializes");
    let paused = sample_task_with_id("paused-active", "paused");
    upsert_download_task(&conn, &paused).expect("paused task inserts");

    let mut stale_downloader_update = paused.clone();
    stale_downloader_update.status = "downloading".to_string();
    stale_downloader_update.progress = 80.0;
    stale_downloader_update.downloaded_bytes = 1024;

    assert!(
        !update_download_task_unless_controlled(&conn, &stale_downloader_update)
            .expect("guarded update succeeds")
    );
    let current = get_download_task(&conn, "paused-active")
        .expect("task query succeeds")
        .expect("task exists");
    assert_eq!(current.status, "paused");
    assert_eq!(current.progress, 0.0);

    let cancelled = sample_task_with_id("cancelled-active", "cancelled");
    upsert_download_task(&conn, &cancelled).expect("cancelled task inserts");
    let mut stale_completion = cancelled.clone();
    stale_completion.status = "completed".to_string();
    stale_completion.progress = 100.0;
    stale_completion.local_path = Some("/tmp/finished.mobi".to_string());

    assert!(
        !update_download_task_unless_controlled(&conn, &stale_completion)
            .expect("guarded completion succeeds")
    );
    let current = get_download_task(&conn, "cancelled-active")
        .expect("task query succeeds")
        .expect("task exists");
    assert_eq!(current.status, "cancelled");
    assert!(current.local_path.is_none());
}

#[test]
fn native_task_actions_enforce_state_and_retry_rules() {
    let conn = Connection::open_in_memory().expect("memory db opens");
    init_schema(&conn).expect("schema initializes");

    let mut active = sample_task_with_id("active", "downloading");
    active.progress = 50.0;
    active.downloaded_bytes = 1024;
    upsert_download_task(&conn, &active).expect("active task inserts");
    let paused = pause_download_task(&conn, "active", "201").expect("active task pauses");
    assert_eq!(paused.status, "paused");
    assert_eq!(paused.progress, 50.0);

    let resumed = resume_download_task(&conn, "active", "202").expect("paused task resumes");
    assert_eq!(resumed.status, "queued");
    assert_eq!(resumed.progress, 0.0);
    assert_eq!(resumed.downloaded_bytes, 0);
    assert_eq!(
        resumed.error_message.as_deref(),
        Some(RESUME_REAUTH_MESSAGE)
    );

    let mut failed = sample_task_with_id("failed-retry", "failed");
    failed.retry_count = 2;
    failed.error_message = Some("network timeout".to_string());
    upsert_download_task(&conn, &failed).expect("failed task inserts");
    let retried = retry_download_task(&conn, "failed-retry", "203").expect("failed task retries");
    assert_eq!(retried.status, "queued");
    assert_eq!(retried.retry_count, 3);
    assert!(retried.error_message.is_none());

    let mut policy = sample_task_with_id("policy", "failed");
    policy.error_message = Some("VIP only".to_string());
    upsert_download_task(&conn, &policy).expect("policy task inserts");
    assert!(retry_download_task(&conn, "policy", "204")
        .expect_err("policy failures are blocked")
        .contains("policy"));

    let mut verification = sample_task_with_id("verification", "failed");
    verification.error_message = Some("true verification required".to_string());
    upsert_download_task(&conn, &verification).expect("verification task inserts");
    assert!(retry_download_task(&conn, "verification", "204")
        .expect_err("verification failures are blocked")
        .contains("policy"));

    let mut unavailable = sample_task_with_id("unavailable", "failed");
    unavailable.error_message = Some("制作中，暫不可下載".to_string());
    upsert_download_task(&conn, &unavailable).expect("unavailable task inserts");
    assert!(retry_download_task(&conn, "unavailable", "204")
        .expect_err("unavailable failures are blocked")
        .contains("policy"));

    let mut exhausted = sample_task_with_id("exhausted", "failed");
    exhausted.retry_count = MAX_RETRY_COUNT;
    upsert_download_task(&conn, &exhausted).expect("exhausted task inserts");
    assert!(retry_download_task(&conn, "exhausted", "205")
        .expect_err("retry cap is enforced")
        .contains("retry limit"));

    let completed = sample_task_with_id("completed", "completed");
    upsert_download_task(&conn, &completed).expect("completed task inserts");
    assert!(cancel_download_task(&conn, "completed", "206")
        .expect_err("completed task cannot cancel")
        .contains("cannot cancel"));
}

#[test]
fn recovers_interrupted_tasks_after_restart() {
    let conn = Connection::open_in_memory().expect("memory db opens");
    init_schema(&conn).expect("schema initializes");

    for status in [
        "authorizing",
        "downloading",
        "verifying",
        "paused",
        "failed",
        "completed",
    ] {
        upsert_download_task(&conn, &sample_task_with_id(status, status)).expect("task inserts");
    }

    let recovered = recover_interrupted_tasks(&conn, "200").expect("tasks recover");
    assert_eq!(recovered, 3);

    let tasks = list_download_tasks(&conn).expect("tasks list");
    for task in tasks {
        match task.id.as_str() {
            "authorizing" | "downloading" | "verifying" => {
                assert_eq!(task.status, "queued");
                assert_eq!(task.progress, 0.0);
                assert_eq!(task.downloaded_bytes, 0);
                assert_eq!(task.error_message.as_deref(), Some(RESTART_REAUTH_MESSAGE));
                assert!(task.local_path.is_none());
                assert_eq!(task.updated_at, "200");
            }
            "paused" => assert_eq!(task.status, "paused"),
            "failed" => assert_eq!(task.status, "failed"),
            "completed" => assert_eq!(task.status, "completed"),
            other => panic!("unexpected task {other}"),
        }
    }
}

fn sample_task(status: &str) -> DownloadTask {
    sample_task_with_id("53339-3089-mobi", status)
}

fn sample_task_with_id(id: &str, status: &str) -> DownloadTask {
    DownloadTask {
        id: id.to_string(),
        comic_id: "53339".to_string(),
        comic_title: "尖帽子的魔法工房".to_string(),
        vol_id: "3089".to_string(),
        volume_title: "話 089-095".to_string(),
        format: "mobi".to_string(),
        status: status.to_string(),
        progress: 0.0,
        downloaded_bytes: 0,
        total_bytes: Some(2048),
        retry_count: 0,
        error_message: None,
        local_path: None,
        created_at: "100".to_string(),
        updated_at: "100".to_string(),
    }
}

fn schema_names(conn: &Connection, schema_type: &str) -> Vec<String> {
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type = ?1")
        .expect("schema query prepares");
    stmt.query_map([schema_type], |row| row.get::<_, String>(0))
        .expect("schema query runs")
        .map(|row| row.expect("schema name reads"))
        .collect()
}

fn table_columns(conn: &Connection, table: &str) -> Vec<String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .expect("table info query prepares");
    stmt.query_map([], |row| row.get::<_, String>(1))
        .expect("table info query runs")
        .map(|row| row.expect("column name reads"))
        .collect()
}

fn timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos().to_string())
        .unwrap_or_else(|_| "0".to_string())
}
