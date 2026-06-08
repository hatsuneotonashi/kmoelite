use super::*;
use crate::models::ReadingHistoryEntry;

#[test]
fn native_task_shape_rejects_restricted_policy_rows() {
    let mut task = sample_download_task();
    assert!(validate_native_task_shape(&task).is_ok());

    task.error_message = Some("VIP only".to_string());
    assert!(validate_native_task_shape(&task).is_err());

    task.error_message = Some("需要通過真實驗證後才可下載".to_string());
    assert!(validate_native_task_shape(&task).is_err());
}

#[test]
fn app_config_serializes_download_directory_for_frontend_settings() {
    let value = serde_json::to_value(AppConfig {
        concurrency: 1,
        download_dir: "/tmp/Kmoe".to_string(),
    })
    .expect("config serializes");

    assert_eq!(
        value.get("downloadDirectory").and_then(Value::as_str),
        Some("/tmp/Kmoe")
    );
    assert!(value.get("mode").is_none());
    assert!(value.get("liveKmoe").is_none());
    assert!(value.get("adminActions").is_none());
    assert!(value.get("realDownload").is_none());
    assert!(value.get("realDownloadEnvEnabled").is_none());
    assert!(value.get("downloadDir").is_none());
}

#[test]
fn mobile_download_dir_uses_app_private_downloads_root() {
    let app_data = Path::new("/app/container/Library/Application Support/moe.kzo.client");
    let path = mobile_download_dir_from_app_data_dir(app_data);

    assert_eq!(
        path,
        "/app/container/Library/Application Support/moe.kzo.client/Downloads/Kmoe"
    );
    assert!(!path.contains("/Documents/"));
}

#[test]
fn preflight_reports_real_download_readiness_without_authorizing() {
    let conn = rusqlite::Connection::open_in_memory().expect("memory db opens");
    db::init_schema(&conn).expect("schema initializes");
    db::upsert_download_task(&conn, &sample_download_task()).expect("task inserts");
    let root = std::env::temp_dir().join(format!("kmoe-preflight-{}", timestamp()));

    let preflight =
        preflight_download_queue_with_conn(&conn, Some(root.to_string_lossy().to_string()));

    assert!(preflight.ok);
    assert_eq!(preflight.mode, "real_download");
    assert_eq!(preflight.queued_count, 1);
    assert_eq!(preflight.active_count, 0);
    assert!(preflight
        .checks
        .iter()
        .any(|check| check.id == "native-env" && check.status == "pass"));
    assert!(preflight
        .checks
        .iter()
        .any(|check| check.id == "single-item-shape" && check.status == "pass"));
    assert!(preflight
        .first_task_label
        .as_deref()
        .unwrap_or_default()
        .contains("MOBI"));

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn preflight_reports_readiness_only_when_a_queued_task_exists() {
    let conn = rusqlite::Connection::open_in_memory().expect("memory db opens");
    db::init_schema(&conn).expect("schema initializes");
    let root = std::env::temp_dir().join(format!("kmoe-preflight-dry-{}", timestamp()));

    let empty = preflight_download_queue_with_conn(&conn, Some(root.to_string_lossy().to_string()));
    assert!(!empty.ok);
    assert!(empty
        .checks
        .iter()
        .any(|check| check.id == "queued-task" && check.status == "fail"));

    db::upsert_download_task(&conn, &sample_download_task()).expect("task inserts");
    let ready = preflight_download_queue_with_conn(&conn, Some(root.to_string_lossy().to_string()));
    assert!(ready.ok);
    assert_eq!(ready.mode, "real_download");
    assert_eq!(ready.queued_count, 1);
    assert!(ready
        .checks
        .iter()
        .any(|check| check.id == "file-download" && check.status == "pass"));

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn list_download_tasks_does_not_recover_active_tasks_while_queue_runs() {
    let conn = rusqlite::Connection::open_in_memory().expect("memory db opens");
    db::init_schema(&conn).expect("schema initializes");
    let mut active = sample_download_task();
    active.status = "downloading".to_string();
    active.progress = 42.0;
    active.downloaded_bytes = 1024;
    db::upsert_download_task(&conn, &active).expect("task inserts");

    let running =
        list_download_tasks_with_conn(&conn, Some(true), true).expect("running list succeeds");
    assert_eq!(running[0].status, "downloading");
    assert_eq!(running[0].progress, 42.0);

    let recovered = list_download_tasks_with_conn(&conn, Some(true), false)
        .expect("restart recovery list succeeds");
    assert_eq!(recovered[0].status, "queued");
    assert_eq!(recovered[0].progress, 0.0);
    assert_eq!(
        recovered[0].error_message.as_deref(),
        Some(db::RESTART_REAUTH_MESSAGE)
    );
}

#[test]
fn saves_safe_migration_snapshot_without_overwriting_existing_files() {
    let root = std::env::temp_dir().join(format!("kmoe-snapshot-{}", timestamp()));
    let snapshot = safe_snapshot_json("2026-05-21T04:30:00/Asia:Shanghai");

    let first = save_migration_snapshot_to_dir(&snapshot, root.to_str().unwrap(), "fallback")
        .expect("first snapshot saves");
    let second = save_migration_snapshot_to_dir(&snapshot, root.to_str().unwrap(), "fallback")
        .expect("second snapshot saves");

    assert!(
        first.ends_with("Snapshots/kmoe-client-snapshot-2026-05-21T04_30_00_Asia_Shanghai.json")
    );
    assert!(second
        .ends_with("Snapshots/kmoe-client-snapshot-2026-05-21T04_30_00_Asia_Shanghai (1).json"));
    assert!(std::fs::read_to_string(&first).unwrap().ends_with('\n'));
    assert!(std::fs::read_to_string(&second)
        .unwrap()
        .contains("\"localPaths\":\"redacted\""));

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn rejects_sensitive_or_unredacted_migration_snapshots() {
    let guarded_url = format!(
        r#"{{"version":1,"url":"https://example.invalid/{}?b=1"}}"#,
        "getdownurl.php"
    );
    assert!(validate_migration_snapshot(&guarded_url).is_err());
    assert!(validate_migration_snapshot(r#"{"version":1,"safety":{"runtimeSettings":"not_exported","authorizationUrls":"omitted","localPaths":"redacted"},"tasks":[{"localPath":"/Users/a/file.mobi"}]}"#).is_err());
    assert!(validate_migration_snapshot(r#"{"version":1,"safety":{"runtimeSettings":"not_exported","authorizationUrls":"omitted","localPaths":"redacted"},"tasks":[{"local_path":"/Users/a/file.mobi"}]}"#).is_err());
    assert!(validate_migration_snapshot(r#"{"version":1,"safety":{"runtimeSettings":"not_exported","authorizationUrls":"omitted","localPaths":"redacted"},"support":{"download_urls":["/later"]}}"#).is_err());
    assert!(validate_migration_snapshot(r#"{"version":1,"safety":{"runtimeSettings":"exported","authorizationUrls":"omitted","localPaths":"redacted"}}"#).is_err());
}

#[test]
fn imports_safe_migration_snapshot_into_native_sqlite() {
    let conn = rusqlite::Connection::open_in_memory().expect("memory db opens");
    db::init_schema(&conn).expect("schema initializes");
    let snapshot = r#"{"version":1,"exportedAt":"2026-05-21T04:30:00Z","safety":{"runtimeSettings":"not_exported","authorizationUrls":"omitted","localPaths":"redacted"},"settings":{"concurrency":1,"preferredFormat":"mobi"},"tasks":[{"id":"53339-3089-mobi","comicId":"53339","comicTitle":"尖帽子的魔法工房","volId":"3089","volumeTitle":"話 089-095","format":"mobi","status":"downloading","progress":64,"downloadedBytes":100,"totalBytes":200,"retryCount":1,"createdAt":"100","updatedAt":"101"}],"library":[{"id":"file-53339-3089-mobi","taskId":"53339-3089-mobi","comicId":"53339","comicTitle":"尖帽子的魔法工房","volId":"3089","volumeTitle":"話 089-095","format":"mobi","sizeBytes":200,"downloadedAt":"102"}]}"#;

    let imported =
        import_migration_snapshot_into_conn(&conn, snapshot, "200").expect("snapshot imports");
    assert_eq!(imported.imported_tasks, 1);
    assert_eq!(imported.imported_library, 1);
    assert_eq!(imported.tasks.len(), 1);
    assert_eq!(imported.tasks[0].status, "queued");
    assert!(imported.tasks[0].local_path.is_none());
    assert_eq!(imported.library.len(), 1);
    assert!(imported.library[0]
        .local_path
        .starts_with("Imported metadata only/"));

    let imported_again = import_migration_snapshot_into_conn(&conn, snapshot, "201")
        .expect("duplicate import succeeds");
    assert_eq!(imported_again.imported_tasks, 0);
    assert_eq!(imported_again.imported_library, 0);
    assert_eq!(imported_again.tasks.len(), 1);
    assert_eq!(imported_again.library.len(), 1);
}

#[test]
fn relinks_imported_library_metadata_to_existing_file() {
    let conn = rusqlite::Connection::open_in_memory().expect("memory db opens");
    db::init_schema(&conn).expect("schema initializes");
    let root = std::env::temp_dir().join(format!("kmoe-relink-{}", timestamp()));
    let file_path = root.join("local.mobi");
    std::fs::create_dir_all(&root).expect("temp dir creates");
    std::fs::write(&file_path, "local mobi marker").expect("local file writes");

    let file = DownloadedFile {
        id: "file-53339-3089-mobi".to_string(),
        task_id: Some("53339-3089-mobi".to_string()),
        comic_id: "53339".to_string(),
        comic_title: "尖帽子的魔法工房".to_string(),
        vol_id: "3089".to_string(),
        volume_title: "話 089-095".to_string(),
        format: "mobi".to_string(),
        local_path: "Imported metadata only/尖帽子的魔法工房 - 話 089-095.mobi".to_string(),
        size_bytes: Some(200),
        downloaded_at: "102".to_string(),
    };

    let library = link_downloaded_file_into_conn(&conn, file, file_path.to_str().unwrap(), "300")
        .expect("metadata relinks");
    assert_eq!(library.len(), 1);
    assert_eq!(
        library[0].local_path,
        file_path.to_string_lossy().to_string()
    );
    assert_eq!(library[0].size_bytes, Some(17));
    assert_eq!(library[0].downloaded_at, "300");

    let missing = root.join("missing.mobi");
    let err =
        link_downloaded_file_into_conn(&conn, library[0].clone(), missing.to_str().unwrap(), "301")
            .expect_err("missing files are rejected");
    assert!(err.contains("path does not exist"));

    let wrong_extension = root.join("local.epub");
    std::fs::write(&wrong_extension, "wrong extension").expect("wrong file writes");
    let err = link_downloaded_file_into_conn(
        &conn,
        library[0].clone(),
        wrong_extension.to_str().unwrap(),
        "302",
    )
    .expect_err("format mismatches are rejected");
    assert!(err.contains("expected .mobi"));

    let source_zip = DownloadedFile {
        id: "file-53339-zip".to_string(),
        task_id: None,
        comic_id: "53339".to_string(),
        comic_title: "尖帽子的魔法工房".to_string(),
        vol_id: "source".to_string(),
        volume_title: "Source".to_string(),
        format: "source_zip".to_string(),
        local_path: "Imported metadata only/source.zip".to_string(),
        size_bytes: None,
        downloaded_at: "102".to_string(),
    };
    let zip_path = root.join("source.ZIP");
    std::fs::write(&zip_path, "zip marker").expect("zip file writes");
    let linked_zip =
        link_downloaded_file_into_conn(&conn, source_zip, zip_path.to_str().unwrap(), "303")
            .expect("source zip accepts zip extension");
    assert!(linked_zip
        .iter()
        .any(|item| item.format == "source_zip" && item.local_path.ends_with("source.ZIP")));

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn open_and_reveal_targets_are_limited_to_records_or_download_root() {
    let conn = rusqlite::Connection::open_in_memory().expect("memory db opens");
    db::init_schema(&conn).expect("schema initializes");
    let root = std::env::temp_dir().join(format!("kmoe-open-guard-{}", timestamp()));
    let download_root = root.join("downloads");
    let comic_dir = download_root.join("Comic");
    let outside_root = root.join("outside");
    let root_file = comic_dir.join("inside.mobi");
    let library_file = outside_root.join("library.epub");
    let task_file = outside_root.join("task.mobi");
    let blocked_file = outside_root.join("blocked.mobi");
    std::fs::create_dir_all(&comic_dir).expect("download dir creates");
    std::fs::create_dir_all(&outside_root).expect("outside dir creates");
    std::fs::write(&root_file, "root file").expect("root file writes");
    std::fs::write(&library_file, "library file").expect("library file writes");
    std::fs::write(&task_file, "task file").expect("task file writes");
    std::fs::write(&blocked_file, "blocked file").expect("blocked file writes");

    db::set_setting(
        &conn,
        "download_dir",
        &download_root.to_string_lossy(),
        "100",
    )
    .expect("download dir setting persists");

    let mut task = sample_download_task();
    task.status = "completed".to_string();
    task.progress = 100.0;
    task.local_path = Some(task_file.to_string_lossy().to_string());
    db::upsert_download_task(&conn, &task).expect("completed task inserts");

    db::insert_downloaded_file(
        &conn,
        &DownloadedFile {
            id: "file-library".to_string(),
            task_id: None,
            comic_id: "53339".to_string(),
            comic_title: "尖帽子的魔法工房".to_string(),
            vol_id: "3089".to_string(),
            volume_title: "話 089-095".to_string(),
            format: "epub".to_string(),
            local_path: library_file.to_string_lossy().to_string(),
            size_bytes: Some(12),
            downloaded_at: "101".to_string(),
        },
    )
    .expect("library record inserts");

    assert_eq!(
        resolve_open_file_target(&conn, root_file.to_str().unwrap()).unwrap(),
        root_file
    );
    assert_eq!(
        resolve_open_file_target(&conn, library_file.to_str().unwrap()).unwrap(),
        library_file
    );
    assert_eq!(
        resolve_open_file_target(&conn, task_file.to_str().unwrap()).unwrap(),
        task_file
    );
    assert_eq!(
        resolve_reveal_target(&conn, download_root.to_str().unwrap()).unwrap(),
        download_root
    );

    assert!(
        resolve_open_file_target(&conn, blocked_file.to_str().unwrap())
            .expect_err("arbitrary files outside records/root are blocked")
            .contains("outside Kmoe download records")
    );
    assert!(resolve_reveal_target(&conn, outside_root.to_str().unwrap())
        .expect_err("arbitrary directories outside root are blocked")
        .contains("outside Kmoe download records"));

    #[cfg(unix)]
    {
        let symlink_path = download_root.join("escape.mobi");
        std::os::unix::fs::symlink(&blocked_file, &symlink_path).expect("symlink creates");
        assert!(
            resolve_open_file_target(&conn, symlink_path.to_str().unwrap())
                .expect_err("symlinks that leave the root are blocked")
                .contains("outside Kmoe download records")
        );
    }

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn reader_archive_manifest_is_limited_to_allowed_local_files() {
    let conn = rusqlite::Connection::open_in_memory().expect("memory db opens");
    db::init_schema(&conn).expect("schema initializes");
    let root = std::env::temp_dir().join(format!("kmoe-reader-manifest-{}", timestamp()));
    let download_root = root.join("downloads");
    let outside_root = root.join("outside");
    let archive_path = download_root.join("Comic").join("chapter.cbz");
    let blocked_archive_path = outside_root.join("blocked.cbz");
    std::fs::create_dir_all(archive_path.parent().unwrap()).expect("download dir creates");
    std::fs::create_dir_all(&outside_root).expect("outside dir creates");
    write_reader_test_archive(
        &archive_path,
        &[
            ("pages/page10.jpg", &[10][..]),
            ("pages/page2.jpg", &[2][..]),
            ("pages/readme.txt", b"ignored"),
        ],
    );
    write_reader_test_archive(&blocked_archive_path, &[("page1.jpg", &[1][..])]);

    db::set_setting(
        &conn,
        "download_dir",
        &download_root.to_string_lossy(),
        "100",
    )
    .expect("download dir setting persists");

    let manifest = list_reader_archive_pages_with_conn(&conn, archive_path.to_str().unwrap())
        .expect("allowed archive manifests");
    assert_eq!(manifest.file_name, "chapter.cbz");
    assert_eq!(manifest.page_count, 2);
    assert_eq!(
        manifest
            .pages
            .iter()
            .map(|page| page.normalized_path.as_str())
            .collect::<Vec<_>>(),
        vec!["pages/page2.jpg", "pages/page10.jpg"]
    );
    assert!(
        list_reader_archive_pages_with_conn(&conn, blocked_archive_path.to_str().unwrap())
            .expect_err("arbitrary archives outside records/root are blocked")
            .contains("outside Kmoe download records")
    );

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn prepares_reader_cache_from_allowed_archive_and_replaces_stale_pages() {
    let conn = rusqlite::Connection::open_in_memory().expect("memory db opens");
    db::init_schema(&conn).expect("schema initializes");
    let root = std::env::temp_dir().join(format!("kmoe-reader-cache-prep-{}", timestamp()));
    let download_root = root.join("downloads");
    let cache_root = root.join("cache");
    let archive_path = download_root.join("Comic").join("chapter.cbz");
    std::fs::create_dir_all(archive_path.parent().unwrap()).expect("download dir creates");
    write_reader_test_archive(
        &archive_path,
        &[
            ("pages/page10.jpg", &[10][..]),
            ("pages/page2.jpg", &[2][..]),
            ("pages/readme.txt", b"ignored"),
        ],
    );
    db::set_setting(
        &conn,
        "download_dir",
        &download_root.to_string_lossy(),
        "100",
    )
    .expect("download dir setting persists");

    let input = PrepareReaderChapterCacheInput {
        archive_path: archive_path.to_string_lossy().to_string(),
        comic_id: "53339".to_string(),
        comic_title: "尖帽子的魔法工房".to_string(),
        volume_id: "3089".to_string(),
        volume_title: "話 089-095".to_string(),
        source_task_id: Some("task-source-zip".to_string()),
        format: Some("source_zip".to_string()),
        policy: Some("balanced".to_string()),
    };
    let prepared = prepare_reader_chapter_cache_with_root(&conn, input.clone(), &cache_root)
        .expect("reader cache prepares");

    assert_eq!(prepared.manifest.page_count, 2);
    assert_eq!(prepared.chapter.comic_id, "53339");
    assert_eq!(prepared.chapter.volume_id, "3089");
    assert_eq!(prepared.chapter.format, "source_zip");
    assert_eq!(prepared.chapter.cache_kind, "reading_cache");
    assert_eq!(prepared.chapter.policy.as_deref(), Some("balanced"));
    assert_eq!(prepared.chapter.size_bytes, 2);
    assert_eq!(prepared.pages.len(), 2);
    assert_eq!(
        prepared
            .pages
            .iter()
            .map(|page| page.page_index)
            .collect::<Vec<_>>(),
        vec![0, 1]
    );
    assert_eq!(
        prepared
            .pages
            .iter()
            .map(|page| {
                Path::new(&page.file_path)
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .to_string()
            })
            .collect::<Vec<_>>(),
        vec!["00001.jpg", "00002.jpg"]
    );
    assert_eq!(
        std::fs::read(Path::new(&prepared.pages[0].file_path)).unwrap(),
        vec![2]
    );
    assert_eq!(
        std::fs::read(Path::new(&prepared.pages[1].file_path)).unwrap(),
        vec![10]
    );
    let image = read_cached_reader_page_with_conn(&conn, &prepared.chapter.id, 0)
        .expect("prepared page reads through safe image command");
    assert_eq!(image.chapter_cache_id, prepared.chapter.id);
    assert_eq!(image.page_index, 0);
    assert_eq!(image.file_name, "00001.jpg");
    assert_eq!(image.mime_type, "image/jpeg");
    assert_eq!(image.size_bytes, 1);
    assert_eq!(image.data_url, "data:image/jpeg;base64,Ag==");

    write_reader_test_archive(&archive_path, &[("pages/page1.png", &[1, 1][..])]);
    let replaced = prepare_reader_chapter_cache_with_root(&conn, input, &cache_root)
        .expect("reader cache replaces previous extraction");
    assert_eq!(replaced.manifest.page_count, 1);
    assert_eq!(replaced.pages.len(), 1);
    assert_eq!(replaced.chapter.id, prepared.chapter.id);
    assert_eq!(replaced.chapter.size_bytes, 2);
    assert_eq!(
        Path::new(&replaced.pages[0].file_path)
            .file_name()
            .unwrap()
            .to_string_lossy(),
        "00001.png"
    );
    assert!(!Path::new(&prepared.pages[1].file_path).exists());
    assert_eq!(
        db::list_page_cache_for_chapter(&conn, &replaced.chapter.id)
            .unwrap()
            .len(),
        1
    );

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn prepares_reader_cache_from_epub_archive() {
    let conn = rusqlite::Connection::open_in_memory().expect("memory db opens");
    db::init_schema(&conn).expect("schema initializes");
    let root = std::env::temp_dir().join(format!("kmoe-reader-cache-epub-{}", timestamp()));
    let download_root = root.join("downloads");
    let cache_root = root.join("cache");
    let archive_path = download_root.join("Comic").join("chapter.epub");
    std::fs::create_dir_all(archive_path.parent().unwrap()).expect("download dir creates");
    write_reader_test_archive(
        &archive_path,
        &[
            ("OEBPS/Images/page2.jpg", &[2][..]),
            ("OEBPS/Images/page1.jpg", &[1][..]),
            ("OEBPS/content.opf", b"ignored metadata"),
        ],
    );
    db::set_setting(
        &conn,
        "download_dir",
        &download_root.to_string_lossy(),
        "100",
    )
    .expect("download dir setting persists");

    let prepared = prepare_reader_chapter_cache_with_root(
        &conn,
        PrepareReaderChapterCacheInput {
            archive_path: archive_path.to_string_lossy().to_string(),
            comic_id: "53339".to_string(),
            comic_title: "尖帽子的魔法工房".to_string(),
            volume_id: "3089".to_string(),
            volume_title: "話 089-095".to_string(),
            source_task_id: Some("task-epub".to_string()),
            format: Some("epub".to_string()),
            policy: Some("balanced".to_string()),
        },
        &cache_root,
    )
    .expect("epub reader cache prepares");

    assert_eq!(prepared.manifest.page_count, 2);
    assert_eq!(prepared.chapter.format, "epub");
    assert_eq!(prepared.chapter.id, "reader-cache:53339:3089:epub");
    assert!(prepared.chapter.cache_dir.ends_with("/53339/3089/epub"));
    assert_eq!(
        prepared
            .pages
            .iter()
            .map(|page| Path::new(&page.file_path)
                .file_name()
                .unwrap()
                .to_string_lossy()
                .to_string())
            .collect::<Vec<_>>(),
        vec!["00001.jpg", "00002.jpg"]
    );

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn clear_reading_cache_removes_registered_reader_cache_dirs_safely() {
    let conn = rusqlite::Connection::open_in_memory().expect("memory db opens");
    db::init_schema(&conn).expect("schema initializes");
    let root = std::env::temp_dir().join(format!("kmoe-reader-cache-clear-{}", timestamp()));
    let download_root = root.join("downloads");
    let cache_root = root.join("cache");
    let archive_path = download_root.join("Comic").join("chapter.cbz");
    std::fs::create_dir_all(archive_path.parent().unwrap()).expect("download dir creates");
    write_reader_test_archive(&archive_path, &[("page1.jpg", &[1][..])]);
    db::set_setting(
        &conn,
        "download_dir",
        &download_root.to_string_lossy(),
        "100",
    )
    .expect("download dir setting persists");

    let prepared = prepare_reader_chapter_cache_with_root(
        &conn,
        PrepareReaderChapterCacheInput {
            archive_path: archive_path.to_string_lossy().to_string(),
            comic_id: "53339".to_string(),
            comic_title: "尖帽子的魔法工房".to_string(),
            volume_id: "3089".to_string(),
            volume_title: "話 089-095".to_string(),
            source_task_id: Some("task-source-zip".to_string()),
            format: Some("source_zip".to_string()),
            policy: Some("balanced".to_string()),
        },
        &cache_root,
    )
    .expect("reader cache prepares");
    let cache_dir = PathBuf::from(prepared.chapter.cache_dir.clone());
    assert!(cache_dir.exists());

    let ids = vec![prepared.chapter.id.clone()];
    let stats = clear_reading_cache_with_root(&conn, Some(&ids), &cache_root)
        .expect("reading cache clears");

    assert_eq!(stats.reading_cache_bytes, 0);
    assert_eq!(stats.page_count, 0);
    assert!(!cache_dir.exists());
    assert!(db::list_chapter_cache(&conn).unwrap().is_empty());

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn clear_reading_cache_rejects_registered_dirs_outside_cache_root() {
    let conn = rusqlite::Connection::open_in_memory().expect("memory db opens");
    db::init_schema(&conn).expect("schema initializes");
    let root = std::env::temp_dir().join(format!("kmoe-reader-cache-clear-guard-{}", timestamp()));
    let cache_root = root.join("cache");
    let outside_dir = root.join("outside");
    std::fs::create_dir_all(&outside_dir).expect("outside dir creates");
    db::save_chapter_cache(
        &conn,
        &SaveChapterCacheInput {
            chapter: ChapterCache {
                id: "cache-outside".to_string(),
                comic_id: "53339".to_string(),
                comic_title: "尖帽子的魔法工房".to_string(),
                volume_id: "unsafe".to_string(),
                volume_title: "Unsafe".to_string(),
                format: "source_zip".to_string(),
                cache_kind: "reading_cache".to_string(),
                source_task_id: None,
                cache_dir: outside_dir.to_string_lossy().to_string(),
                size_bytes: 1,
                page_count: Some(1),
                status: "ready".to_string(),
                policy: Some("balanced".to_string()),
                last_accessed_at: "100".to_string(),
                created_at: "100".to_string(),
                updated_at: "100".to_string(),
                expires_at: None,
            },
            pages: Vec::new(),
        },
    )
    .expect("unsafe cache row saves for guard test");

    let ids = vec!["cache-outside".to_string()];
    let error = clear_reading_cache_with_root(&conn, Some(&ids), &cache_root)
        .expect_err("outside cache dirs are rejected");

    assert!(error.contains("outside the reader cache root"));
    assert!(outside_dir.exists());
    assert_eq!(db::list_chapter_cache(&conn).unwrap().len(), 1);

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn delete_local_reading_data_removes_reader_cache_and_source_archive_but_preserves_history() {
    let conn = rusqlite::Connection::open_in_memory().expect("memory db opens");
    db::init_schema(&conn).expect("schema initializes");
    let root = std::env::temp_dir().join(format!("kmoe-local-reading-delete-{}", timestamp()));
    let download_root = root.join("downloads");
    let cache_root = root.join("cache");
    let archive_path = download_root.join("Comic").join("chapter.zip");
    std::fs::create_dir_all(archive_path.parent().unwrap()).expect("download dir creates");
    write_reader_test_archive(&archive_path, &[("page1.jpg", &[1][..])]);
    db::set_setting(
        &conn,
        "download_dir",
        &download_root.to_string_lossy(),
        "100",
    )
    .expect("download dir setting persists");
    db::upsert_download_task(&conn, &sample_source_zip_task("completed", &archive_path))
        .expect("source task inserts");
    db::insert_downloaded_file(&conn, &sample_source_zip_file(&archive_path))
        .expect("source file inserts");
    db::upsert_shelf(
        &conn,
        &Shelf {
            id: "default".to_string(),
            name: "书架".to_string(),
            kind: "default".to_string(),
            sort_order: 0,
            created_at: "100".to_string(),
            updated_at: "100".to_string(),
            archived_at: None,
        },
    )
    .expect("shelf inserts");
    db::upsert_shelf_item(
        &conn,
        &ShelfItem {
            id: "default-53339".to_string(),
            shelf_id: "default".to_string(),
            comic_id: "53339".to_string(),
            comic_title: "尖帽子的魔法工房".to_string(),
            comic_url: Some("/c/53339.htm".to_string()),
            cover_url: None,
            comic_status: Some("連載".to_string()),
            latest_volume: Some("話 095".to_string()),
            last_read_volume_id: Some("3089".to_string()),
            last_read_label: Some("继续读 話 089-095".to_string()),
            unread_count: 0,
            cached: true,
            archived: false,
            added_at: "100".to_string(),
            updated_at: "100".to_string(),
            last_read_at: Some("100".to_string()),
            last_update_at: None,
        },
    )
    .expect("shelf item inserts");
    db::save_reading_progress(
        &conn,
        &SaveReadingProgressInput {
            progress: sample_reading_progress(),
            history: Some(ReadingHistoryEntry {
                id: "history-53339-3089-100".to_string(),
                comic_id: "53339".to_string(),
                comic_title: "尖帽子的魔法工房".to_string(),
                volume_id: "3089".to_string(),
                volume_title: "話 089-095".to_string(),
                page_index: 1,
                progress_percent: 50.0,
                event: "page_change".to_string(),
                read_at: "100".to_string(),
                duration_seconds: None,
            }),
        },
    )
    .expect("progress inserts");

    let prepared = prepare_reader_chapter_cache_with_root(
        &conn,
        PrepareReaderChapterCacheInput {
            archive_path: archive_path.to_string_lossy().to_string(),
            comic_id: "53339".to_string(),
            comic_title: "尖帽子的魔法工房".to_string(),
            volume_id: "3089".to_string(),
            volume_title: "話 089-095".to_string(),
            source_task_id: Some("task-source-zip".to_string()),
            format: Some("source_zip".to_string()),
            policy: Some("balanced".to_string()),
        },
        &cache_root,
    )
    .expect("reader cache prepares");
    let cache_dir = PathBuf::from(prepared.chapter.cache_dir.clone());
    assert!(archive_path.exists());
    assert!(cache_dir.exists());

    let result = delete_local_reading_data_with_root(
        &conn,
        DeleteLocalReadingDataInput {
            comic_ids: Some(vec!["53339".to_string()]),
            volume_ids: Some(vec!["3089".to_string()]),
            chapter_ids: None,
            include_source_files: Some(true),
        },
        &cache_root,
    )
    .expect("local reading data deletes");

    assert_eq!(result.removed_chapter_ids, vec![prepared.chapter.id]);
    assert_eq!(result.removed_file_ids, vec!["file-source".to_string()]);
    assert_eq!(result.removed_task_ids, vec!["task-source-zip".to_string()]);
    assert_eq!(result.deleted_file_count, 1);
    assert!(!archive_path.exists());
    assert!(!cache_dir.exists());
    assert!(db::list_chapter_cache(&conn).unwrap().is_empty());
    assert!(db::list_downloaded_files(&conn).unwrap().is_empty());
    assert!(db::list_download_tasks(&conn).unwrap().is_empty());
    assert_eq!(db::list_shelf_items(&conn).unwrap().len(), 1);
    assert!(db::get_reading_progress(&conn, "53339", "3089")
        .unwrap()
        .is_some());

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn delete_local_reading_data_rejects_active_source_task_without_removing_files() {
    let conn = rusqlite::Connection::open_in_memory().expect("memory db opens");
    db::init_schema(&conn).expect("schema initializes");
    let root = std::env::temp_dir().join(format!("kmoe-local-reading-active-{}", timestamp()));
    let download_root = root.join("downloads");
    let cache_root = root.join("cache");
    let archive_path = download_root.join("Comic").join("chapter.zip");
    std::fs::create_dir_all(archive_path.parent().unwrap()).expect("download dir creates");
    write_reader_test_archive(&archive_path, &[("page1.jpg", &[1][..])]);
    db::set_setting(
        &conn,
        "download_dir",
        &download_root.to_string_lossy(),
        "100",
    )
    .expect("download dir setting persists");
    db::upsert_download_task(&conn, &sample_source_zip_task("downloading", &archive_path))
        .expect("active task inserts");
    db::insert_downloaded_file(&conn, &sample_source_zip_file(&archive_path))
        .expect("source file inserts");
    let prepared = prepare_reader_chapter_cache_with_root(
        &conn,
        PrepareReaderChapterCacheInput {
            archive_path: archive_path.to_string_lossy().to_string(),
            comic_id: "53339".to_string(),
            comic_title: "尖帽子的魔法工房".to_string(),
            volume_id: "3089".to_string(),
            volume_title: "話 089-095".to_string(),
            source_task_id: Some("task-source-zip".to_string()),
            format: Some("source_zip".to_string()),
            policy: Some("balanced".to_string()),
        },
        &cache_root,
    )
    .expect("reader cache prepares");
    let cache_dir = PathBuf::from(prepared.chapter.cache_dir.clone());

    let error = delete_local_reading_data_with_root(
        &conn,
        DeleteLocalReadingDataInput {
            comic_ids: Some(vec!["53339".to_string()]),
            volume_ids: Some(vec!["3089".to_string()]),
            chapter_ids: None,
            include_source_files: Some(true),
        },
        &cache_root,
    )
    .expect_err("active source task blocks deletion");

    assert!(error.contains("cannot delete local reading data while task"));
    assert!(archive_path.exists());
    assert!(cache_dir.exists());
    assert_eq!(db::list_chapter_cache(&conn).unwrap().len(), 1);
    assert_eq!(db::list_downloaded_files(&conn).unwrap().len(), 1);
    assert_eq!(db::list_download_tasks(&conn).unwrap().len(), 1);

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn repairs_reader_cache_from_trusted_downloaded_source_archive() {
    let conn = rusqlite::Connection::open_in_memory().expect("memory db opens");
    db::init_schema(&conn).expect("schema initializes");
    let root = std::env::temp_dir().join(format!("kmoe-reader-repair-{}", timestamp()));
    let archive_path = root.join("library").join("chapter.cbz");
    let cache_root = root.join("cache");
    std::fs::create_dir_all(archive_path.parent().unwrap()).expect("library dir creates");
    write_reader_test_archive(
        &archive_path,
        &[("pages/page3.jpg", &[3][..]), ("pages/page1.jpg", &[1][..])],
    );

    db::insert_downloaded_file(
        &conn,
        &DownloadedFile {
            id: "file-53339-3089-source".to_string(),
            task_id: Some("task-53339-source".to_string()),
            comic_id: "53339".to_string(),
            comic_title: "尖帽子的魔法工房".to_string(),
            vol_id: "3089".to_string(),
            volume_title: "話 089-095".to_string(),
            format: "source_zip".to_string(),
            local_path: archive_path.to_string_lossy().to_string(),
            size_bytes: None,
            downloaded_at: "120".to_string(),
        },
    )
    .expect("source archive record inserts");

    let chapter_id = "cache-53339-3089".to_string();
    db::save_chapter_cache(
        &conn,
        &SaveChapterCacheInput {
            chapter: ChapterCache {
                id: chapter_id.clone(),
                comic_id: "53339".to_string(),
                comic_title: "尖帽子的魔法工房".to_string(),
                volume_id: "3089".to_string(),
                volume_title: "話 089-095".to_string(),
                format: "source_zip".to_string(),
                cache_kind: "reading_cache".to_string(),
                source_task_id: Some("task-53339-source".to_string()),
                cache_dir: cache_root.join("stale").to_string_lossy().to_string(),
                size_bytes: 0,
                page_count: Some(0),
                status: "failed".to_string(),
                policy: Some("comfort".to_string()),
                last_accessed_at: "100".to_string(),
                created_at: "100".to_string(),
                updated_at: "100".to_string(),
                expires_at: None,
            },
            pages: vec![],
        },
    )
    .expect("stale cache row saves");

    let repaired = repair_reader_chapter_cache_with_root(&conn, &chapter_id, &cache_root)
        .expect("reader cache repairs from trusted source archive");

    assert_eq!(repaired.chapter.id, chapter_id);
    assert_eq!(
        repaired.chapter.source_task_id.as_deref(),
        Some("task-53339-source")
    );
    assert_eq!(repaired.chapter.status, "ready");
    assert_eq!(repaired.chapter.policy.as_deref(), Some("comfort"));
    assert_eq!(repaired.pages.len(), 2);
    assert_eq!(
        std::fs::read(Path::new(&repaired.pages[0].file_path)).unwrap(),
        vec![1]
    );
    assert_eq!(
        std::fs::read(Path::new(&repaired.pages[1].file_path)).unwrap(),
        vec![3]
    );

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn reader_cache_repair_rejects_missing_metadata_only_or_non_source_records() {
    let conn = rusqlite::Connection::open_in_memory().expect("memory db opens");
    db::init_schema(&conn).expect("schema initializes");
    let root = std::env::temp_dir().join(format!("kmoe-reader-repair-guard-{}", timestamp()));
    let cache_root = root.join("cache");
    let chapter = ChapterCache {
        id: "cache-53339-3089".to_string(),
        comic_id: "53339".to_string(),
        comic_title: "尖帽子的魔法工房".to_string(),
        volume_id: "3089".to_string(),
        volume_title: "話 089-095".to_string(),
        format: "source_zip".to_string(),
        cache_kind: "reading_cache".to_string(),
        source_task_id: Some("task-53339-source".to_string()),
        cache_dir: cache_root.join("stale").to_string_lossy().to_string(),
        size_bytes: 0,
        page_count: Some(0),
        status: "failed".to_string(),
        policy: Some("balanced".to_string()),
        last_accessed_at: "100".to_string(),
        created_at: "100".to_string(),
        updated_at: "100".to_string(),
        expires_at: None,
    };
    db::save_chapter_cache(
        &conn,
        &SaveChapterCacheInput {
            chapter: chapter.clone(),
            pages: vec![],
        },
    )
    .expect("stale cache row saves");

    let missing = repair_reader_chapter_cache_with_root(&conn, &chapter.id, &cache_root)
        .expect_err("repair needs a source zip library file");
    assert!(missing.contains("源图 ZIP"));

    db::insert_downloaded_file(
        &conn,
        &DownloadedFile {
            id: "file-53339-3089-mobi".to_string(),
            task_id: Some("task-53339-source".to_string()),
            comic_id: "53339".to_string(),
            comic_title: "尖帽子的魔法工房".to_string(),
            vol_id: "3089".to_string(),
            volume_title: "話 089-095".to_string(),
            format: "mobi".to_string(),
            local_path: "/tmp/chapter.mobi".to_string(),
            size_bytes: None,
            downloaded_at: "110".to_string(),
        },
    )
    .expect("mobi record inserts");
    let non_source = repair_reader_chapter_cache_with_root(&conn, &chapter.id, &cache_root)
        .expect_err("repair cannot use non-source library records");
    assert!(non_source.contains("源图 ZIP"));

    db::insert_downloaded_file(
        &conn,
        &DownloadedFile {
            id: "file-53339-3089-source".to_string(),
            task_id: Some("task-53339-source".to_string()),
            comic_id: "53339".to_string(),
            comic_title: "尖帽子的魔法工房".to_string(),
            vol_id: "3089".to_string(),
            volume_title: "話 089-095".to_string(),
            format: "source_zip".to_string(),
            local_path: "Imported metadata only/chapter.zip".to_string(),
            size_bytes: None,
            downloaded_at: "120".to_string(),
        },
    )
    .expect("metadata-only source record inserts");
    let metadata_only = repair_reader_chapter_cache_with_root(&conn, &chapter.id, &cache_root)
        .expect_err("metadata-only records cannot repair reading cache");
    assert!(metadata_only.contains("重新绑定"));

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn cached_reader_page_read_rejects_unregistered_or_escaped_files() {
    let conn = rusqlite::Connection::open_in_memory().expect("memory db opens");
    db::init_schema(&conn).expect("schema initializes");
    let root = std::env::temp_dir().join(format!("kmoe-reader-page-guard-{}", timestamp()));
    let cache_dir = root.join("cache");
    let outside_dir = root.join("outside");
    let outside_file = outside_dir.join("page.jpg");
    std::fs::create_dir_all(&cache_dir).expect("cache dir creates");
    std::fs::create_dir_all(&outside_dir).expect("outside dir creates");
    std::fs::write(&outside_file, &[1]).expect("outside page writes");
    let input = SaveChapterCacheInput {
        chapter: ChapterCache {
            id: "cache-escape".to_string(),
            comic_id: "53339".to_string(),
            comic_title: "尖帽子的魔法工房".to_string(),
            volume_id: "3089".to_string(),
            volume_title: "話 089-095".to_string(),
            format: "source_zip".to_string(),
            cache_kind: "reading_cache".to_string(),
            source_task_id: None,
            cache_dir: cache_dir.to_string_lossy().to_string(),
            size_bytes: 1,
            page_count: Some(1),
            status: "ready".to_string(),
            policy: Some("balanced".to_string()),
            last_accessed_at: "100".to_string(),
            created_at: "100".to_string(),
            updated_at: "100".to_string(),
            expires_at: None,
        },
        pages: vec![PageCache {
            id: "page-escape".to_string(),
            chapter_cache_id: "cache-escape".to_string(),
            comic_id: "53339".to_string(),
            volume_id: "3089".to_string(),
            page_index: 0,
            file_path: outside_file.to_string_lossy().to_string(),
            width: None,
            height: None,
            size_bytes: Some(1),
            created_at: "100".to_string(),
            last_accessed_at: "100".to_string(),
        }],
    };
    db::save_chapter_cache(&conn, &input).expect("escaped cache row saves for guard test");

    assert!(read_cached_reader_page_with_conn(&conn, "cache-escape", 0)
        .expect_err("cached pages cannot escape their chapter cache dir")
        .contains("outside the registered reading cache"));
    assert!(read_cached_reader_page_with_conn(&conn, "cache-escape", -1)
        .expect_err("negative page index is rejected")
        .contains("zero or greater"));
    assert!(read_cached_reader_page_with_conn(&conn, "missing-cache", 0)
        .expect_err("missing cache id is rejected")
        .contains("不存在"));

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn public_reader_cache_guard_rejects_registered_cache_outside_app_root() {
    let conn = rusqlite::Connection::open_in_memory().expect("memory db opens");
    db::init_schema(&conn).expect("schema initializes");
    let root = std::env::temp_dir().join(format!("kmoe-reader-root-guard-{}", timestamp()));
    let app_cache_root = root.join("allowed");
    let outside_cache_dir = root.join("outside");
    let page_file = outside_cache_dir.join("page.jpg");
    std::fs::create_dir_all(&outside_cache_dir).expect("outside cache creates");
    std::fs::write(&page_file, &[1]).expect("outside page writes");
    let input = SaveChapterCacheInput {
        chapter: ChapterCache {
            id: "cache-outside-root".to_string(),
            comic_id: "53339".to_string(),
            comic_title: "尖帽子的魔法工房".to_string(),
            volume_id: "3089".to_string(),
            volume_title: "話 089-095".to_string(),
            format: "source_zip".to_string(),
            cache_kind: "reading_cache".to_string(),
            source_task_id: None,
            cache_dir: outside_cache_dir.to_string_lossy().to_string(),
            size_bytes: 1,
            page_count: Some(1),
            status: "ready".to_string(),
            policy: Some("balanced".to_string()),
            last_accessed_at: "100".to_string(),
            created_at: "100".to_string(),
            updated_at: "100".to_string(),
            expires_at: None,
        },
        pages: vec![PageCache {
            id: "page-outside-root".to_string(),
            chapter_cache_id: "cache-outside-root".to_string(),
            comic_id: "53339".to_string(),
            volume_id: "3089".to_string(),
            page_index: 0,
            file_path: page_file.to_string_lossy().to_string(),
            width: None,
            height: None,
            size_bytes: Some(1),
            created_at: "100".to_string(),
            last_accessed_at: "100".to_string(),
        }],
    };

    assert!(validate_chapter_cache_under_root(&input, &app_cache_root)
        .expect_err("public save cannot register pages outside app reader cache root")
        .contains("outside the app reader cache root"));
    db::save_chapter_cache(&conn, &input).expect("direct db save keeps legacy rows testable");
    assert!(
        read_cached_reader_page_with_root(&conn, "cache-outside-root", 0, &app_cache_root)
            .expect_err("public read cannot expose cache outside app reader cache root")
            .contains("outside the app reader cache root")
    );

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn prepare_reader_cache_rejects_untrusted_or_unsafe_archives_without_db_rows() {
    let conn = rusqlite::Connection::open_in_memory().expect("memory db opens");
    db::init_schema(&conn).expect("schema initializes");
    let root = std::env::temp_dir().join(format!("kmoe-reader-cache-guard-{}", timestamp()));
    let download_root = root.join("downloads");
    let outside_root = root.join("outside");
    let unsafe_archive = download_root.join("Comic").join("unsafe.cbz");
    let outside_archive = outside_root.join("outside.cbz");
    std::fs::create_dir_all(unsafe_archive.parent().unwrap()).expect("download dir creates");
    std::fs::create_dir_all(&outside_root).expect("outside dir creates");
    write_reader_test_archive(&unsafe_archive, &[("../evil.jpg", &[1][..])]);
    write_reader_test_archive(&outside_archive, &[("page1.jpg", &[1][..])]);
    db::set_setting(
        &conn,
        "download_dir",
        &download_root.to_string_lossy(),
        "100",
    )
    .expect("download dir setting persists");

    let unsafe_input = PrepareReaderChapterCacheInput {
        archive_path: unsafe_archive.to_string_lossy().to_string(),
        comic_id: "53339".to_string(),
        comic_title: "尖帽子的魔法工房".to_string(),
        volume_id: "unsafe".to_string(),
        volume_title: "Unsafe".to_string(),
        source_task_id: None,
        format: Some("source_zip".to_string()),
        policy: None,
    };
    assert!(
        prepare_reader_chapter_cache_with_root(&conn, unsafe_input, &root.join("cache"))
            .expect_err("unsafe archive entries are rejected")
            .contains("不安全")
    );
    assert!(db::list_chapter_cache(&conn).unwrap().is_empty());
    assert!(db::list_page_cache_for_chapter(
        &conn,
        &reader_chapter_cache_id("53339", "unsafe", "source_zip")
    )
    .unwrap()
    .is_empty());

    let outside_input = PrepareReaderChapterCacheInput {
        archive_path: outside_archive.to_string_lossy().to_string(),
        comic_id: "53339".to_string(),
        comic_title: "尖帽子的魔法工房".to_string(),
        volume_id: "outside".to_string(),
        volume_title: "Outside".to_string(),
        source_task_id: None,
        format: Some("source_zip".to_string()),
        policy: None,
    };
    assert!(
        prepare_reader_chapter_cache_with_root(&conn, outside_input, &root.join("cache"))
            .expect_err("outside archives are blocked by open guard")
            .contains("outside Kmoe download records")
    );
    assert!(db::list_chapter_cache(&conn).unwrap().is_empty());

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn builds_platform_open_and_reveal_commands_without_invoking_them() {
    let root = std::env::temp_dir().join(format!("kmoe-open-spec-{}", timestamp()));
    let file_path = root.join("comic.mobi");
    std::fs::create_dir_all(&root).expect("temp dir creates");
    std::fs::write(&file_path, "marker").expect("file writes");

    let windows_file_reveal = open_command_spec(&file_path, true, "windows");
    assert_eq!(windows_file_reveal.program, "explorer");
    assert_eq!(
        windows_file_reveal.args,
        vec![format!("/select,{}", file_path.to_string_lossy())]
    );

    let windows_dir_reveal = open_command_spec(&root, true, "windows");
    assert_eq!(windows_dir_reveal.program, "explorer");
    assert_eq!(
        windows_dir_reveal.args,
        vec![root.to_string_lossy().to_string()]
    );

    let mac_file_reveal = open_command_spec(&file_path, true, "macos");
    assert_eq!(
        mac_file_reveal,
        OpenCommandSpec {
            program: "open".to_string(),
            args: vec!["-R".to_string(), file_path.to_string_lossy().to_string()]
        }
    );

    let linux_file_reveal = open_command_spec(&file_path, true, "linux");
    assert_eq!(linux_file_reveal.program, "xdg-open");
    assert_eq!(
        linux_file_reveal.args,
        vec![root.to_string_lossy().to_string()]
    );

    let linux_dir_reveal = open_command_spec(&root, true, "linux");
    assert_eq!(linux_dir_reveal.program, "xdg-open");
    assert_eq!(
        linux_dir_reveal.args,
        vec![root.to_string_lossy().to_string()]
    );

    let _ = std::fs::remove_dir_all(root);
}

fn write_reader_test_archive(path: &Path, entries: &[(&str, &[u8])]) {
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    let file = std::fs::File::create(path).expect("archive file creates");
    let mut writer = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default();
    for (name, bytes) in entries {
        writer
            .start_file(*name, options)
            .expect("archive entry starts");
        writer.write_all(bytes).expect("archive entry writes");
    }
    writer.finish().expect("archive finalizes");
}

fn safe_snapshot_json(exported_at: &str) -> String {
    format!(
        r#"{{"version":1,"exportedAt":"{exported_at}","safety":{{"runtimeSettings":"not_exported","authorizationUrls":"omitted","localPaths":"redacted"}},"settings":{{"concurrency":1,"preferredFormat":"mobi"}},"tasks":[],"library":[]}}"#
    )
}

fn sample_source_zip_task(status: &str, archive_path: &Path) -> DownloadTask {
    let mut task = sample_download_task();
    task.id = "task-source-zip".to_string();
    task.format = "source_zip".to_string();
    task.status = status.to_string();
    task.progress = if status == "completed" { 100.0 } else { 42.0 };
    task.downloaded_bytes = if status == "completed" { 200 } else { 84 };
    task.local_path = Some(archive_path.to_string_lossy().to_string());
    task
}

fn sample_source_zip_file(archive_path: &Path) -> DownloadedFile {
    DownloadedFile {
        id: "file-source".to_string(),
        task_id: Some("task-source-zip".to_string()),
        comic_id: "53339".to_string(),
        comic_title: "尖帽子的魔法工房".to_string(),
        vol_id: "3089".to_string(),
        volume_title: "話 089-095".to_string(),
        format: "source_zip".to_string(),
        local_path: archive_path.to_string_lossy().to_string(),
        size_bytes: Some(200),
        downloaded_at: "100".to_string(),
    }
}

fn sample_reading_progress() -> ReadingProgress {
    ReadingProgress {
        id: "53339-3089".to_string(),
        comic_id: "53339".to_string(),
        comic_title: "尖帽子的魔法工房".to_string(),
        volume_id: "3089".to_string(),
        volume_title: "話 089-095".to_string(),
        page_index: 1,
        page_count: Some(2),
        progress_percent: 50.0,
        last_read_at: "100".to_string(),
        finished: false,
        reading_mode: "paged".to_string(),
        reading_direction: "rtl".to_string(),
        page_layout: "single".to_string(),
        zoom: Some(1.0),
        rotation: Some(0),
        crop_json: None,
        spread_overrides_json: None,
        updated_at: "100".to_string(),
    }
}

fn sample_download_task() -> DownloadTask {
    DownloadTask {
        id: "53339-3089-mobi".to_string(),
        comic_id: "53339".to_string(),
        comic_title: "尖帽子的魔法工房".to_string(),
        vol_id: "3089".to_string(),
        volume_title: "話 089-095".to_string(),
        format: "mobi".to_string(),
        status: "queued".to_string(),
        progress: 0.0,
        downloaded_bytes: 0,
        total_bytes: Some(200),
        retry_count: 0,
        error_message: None,
        local_path: None,
        created_at: "100".to_string(),
        updated_at: "100".to_string(),
    }
}
