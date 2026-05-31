pub mod commands;
pub mod db;
pub mod downloader;
pub mod fs_utils;
pub mod http;
pub mod models;
pub mod queue;
pub mod reader;
pub mod web_adapter;

#[cfg(not(mobile))]
use tauri::Manager;

#[cfg(not(mobile))]
fn ensure_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Regular)?;

    if let Some(window) = app.get_webview_window("main") {
        window.show()?;
        window.unminimize()?;
        window.center()?;
        window.set_focus()?;
        return Ok(());
    }

    if let Some(window_config) = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")
        .cloned()
    {
        let window = tauri::WebviewWindowBuilder::from_config(app, &window_config)?.build()?;
        window.show()?;
        window.unminimize()?;
        window.center()?;
        window.set_focus()?;
        return Ok(());
    }

    let window =
        tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
            .title("Kmoe Client")
            .inner_size(1280.0, 820.0)
            .min_inner_size(900.0, 640.0)
            .center()
            .visible(true)
            .focused(true)
            .build()?;
    window.show()?;
    window.unminimize()?;
    window.set_focus()?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(web_adapter::KmoeHttpClient::new().expect("failed to create Kmoe HTTP client"))
        .invoke_handler(tauri::generate_handler![
            commands::get_app_config,
            commands::set_download_dir,
            commands::get_download_dir,
            commands::enqueue_download_tasks,
            commands::list_download_tasks,
            commands::list_downloaded_files,
            commands::link_downloaded_file,
            commands::start_download_queue,
            commands::preflight_download_queue,
            commands::pause_download_task,
            commands::resume_download_task,
            commands::cancel_download_task,
            commands::retry_download_task,
            commands::prioritize_download_task,
            commands::open_file,
            commands::reveal_in_folder,
            commands::clear_queue,
            commands::save_migration_snapshot,
            commands::import_migration_snapshot,
            commands::list_shelves,
            commands::upsert_shelf,
            commands::list_shelf_items,
            commands::upsert_shelf_item,
            commands::remove_shelf_items,
            commands::get_reading_progress,
            commands::list_reading_progress,
            commands::save_reading_progress,
            commands::save_chapter_cache,
            commands::list_chapter_cache,
            commands::list_cached_chapter_pages,
            commands::get_cache_stats,
            commands::clear_reading_cache,
            commands::list_reader_archive_pages,
            commands::prepare_reader_chapter_cache,
            commands::repair_reader_chapter_cache,
            commands::read_cached_reader_page,
            commands::kmoe_login,
            commands::kmoe_fetch_catalog,
            commands::kmoe_fetch_cover_image,
            commands::kmoe_fetch_comic_detail_html,
            commands::kmoe_fetch_book_data,
            commands::kmoe_fetch_user_profile_html,
            commands::kmoe_logout
        ])
        .setup(|app| {
            #[cfg(not(mobile))]
            ensure_main_window(app.handle())?;
            #[cfg(mobile)]
            let _ = app;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Kmoe Client");

    #[cfg(not(mobile))]
    app.run(|app_handle, event| {
        if let tauri::RunEvent::Ready = event {
            if let Err(error) = ensure_main_window(app_handle) {
                eprintln!("failed to show Kmoe Client main window: {error}");
            }
        }

        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen {
            has_visible_windows,
            ..
        } = event
        {
            if !has_visible_windows {
                if let Err(error) = ensure_main_window(app_handle) {
                    eprintln!("failed to reopen Kmoe Client main window: {error}");
                }
            }
        }
    });

    #[cfg(mobile)]
    app.run(|_, _| {});
}
