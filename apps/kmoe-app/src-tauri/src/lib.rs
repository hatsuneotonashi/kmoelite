pub mod commands;
pub mod db;
pub mod downloader;
pub mod fs_utils;
pub mod http;
pub mod models;
pub mod queue;
pub mod reader;
pub mod web_adapter;

use std::sync::Mutex;
use tauri::{Emitter, Manager};

struct PendingDeepLinkRoute(Mutex<Option<String>>);

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
            .title("kmoelite")
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

fn route_from_deep_link(raw_url: &str) -> Option<String> {
    let rest = raw_url.strip_prefix("kmoelite://comic")?;
    let comic_id = if let Some(rest) = rest.strip_prefix('/') {
        rest.split(['?', '/', '#']).next().unwrap_or_default()
    } else if let Some(query) = rest.strip_prefix('?') {
        query
            .split('&')
            .filter_map(|pair| pair.split_once('='))
            .find_map(|(key, value)| (key == "id").then_some(value))
            .unwrap_or_default()
    } else {
        ""
    };

    if is_safe_comic_id(comic_id) {
        Some(format!("/comic/{comic_id}"))
    } else {
        None
    }
}

#[cfg(debug_assertions)]
fn route_from_smoke_comic_id(raw_comic_id: &str) -> Option<String> {
    let comic_id = raw_comic_id.trim();
    if is_safe_comic_id(comic_id) {
        Some(format!("/comic/{comic_id}"))
    } else {
        None
    }
}

#[cfg(debug_assertions)]
fn route_from_smoke_launch() -> Option<String> {
    std::env::args()
        .find_map(|arg| {
            arg.strip_prefix("--kmoelite-smoke-comic-id=")
                .and_then(route_from_smoke_comic_id)
        })
        .or_else(|| {
            std::env::var("KMOELITE_SMOKE_COMIC_ID")
                .ok()
                .and_then(|comic_id| route_from_smoke_comic_id(&comic_id))
        })
}

fn is_safe_comic_id(comic_id: &str) -> bool {
    !comic_id.is_empty()
        && comic_id.len() <= 80
        && comic_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn open_deep_link_route<R: tauri::Runtime>(app: &tauri::AppHandle<R>, route: &str) {
    if let Ok(mut pending_route) = app.state::<PendingDeepLinkRoute>().0.lock() {
        *pending_route = Some(route.to_string());
    }
    let Some(window) = app.get_webview_window("main") else {
        eprintln!("failed to open deep link route: main webview window is unavailable");
        return;
    };
    if let Err(error) = window.emit("kmoelite-deep-link-route", route) {
        eprintln!("failed to emit deep link route: {error}");
    }
    let Ok(route_json) = serde_json::to_string(route) else {
        eprintln!("failed to open deep link route: route serialization failed");
        return;
    };
    let script = format!(
        r#"(() => {{
  const route = {route_json};
  if (window.location.pathname !== route) {{
    window.history.pushState({{}}, "", route);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }}
}})();"#
    );
    if let Err(error) = window.eval(script) {
        eprintln!("failed to open deep link route: {error}");
    }
}

#[tauri::command]
fn get_pending_deep_link_route(state: tauri::State<'_, PendingDeepLinkRoute>) -> Option<String> {
    state
        .0
        .lock()
        .ok()
        .and_then(|mut pending_route| pending_route.take())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(PendingDeepLinkRoute(Mutex::new(None)))
        .manage(web_adapter::KmoeHttpClient::new().expect("failed to create Kmoe HTTP client"))
        .invoke_handler(tauri::generate_handler![
            get_pending_deep_link_route,
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
            commands::delete_local_reading_data,
            commands::set_ios_status_bar_hidden,
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
            #[cfg(debug_assertions)]
            if let Some(route) = route_from_smoke_launch() {
                open_deep_link_route(app.handle(), &route);
            }
            #[cfg(mobile)]
            let _ = app;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building kmoelite");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Opened { urls } = &event {
            if let Some(route) = urls
                .iter()
                .find_map(|url| route_from_deep_link(url.as_str()))
            {
                open_deep_link_route(app_handle, &route);
            }
        }

        #[cfg(not(mobile))]
        if let tauri::RunEvent::Ready = event {
            if let Err(error) = ensure_main_window(app_handle) {
                eprintln!("failed to show kmoelite main window: {error}");
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
                    eprintln!("failed to reopen kmoelite main window: {error}");
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{route_from_deep_link, route_from_smoke_comic_id};

    #[test]
    fn accepts_safe_comic_deep_links() {
        assert_eq!(
            route_from_deep_link("kmoelite://comic/10817"),
            Some("/comic/10817".to_string())
        );
        assert_eq!(
            route_from_deep_link("kmoelite://comic?id=made-in-abyss_01"),
            Some("/comic/made-in-abyss_01".to_string())
        );
    }

    #[test]
    fn rejects_non_comic_or_unsafe_deep_links() {
        assert_eq!(route_from_deep_link("https://kxo.moe/comic/10817"), None);
        assert_eq!(route_from_deep_link("kmoelite://comic/../Settings"), None);
        assert_eq!(route_from_deep_link("kmoelite://comic/%2Fsettings"), None);
        assert_eq!(
            route_from_deep_link(&format!("kmoelite://comic/{}", "a".repeat(81))),
            None
        );
    }

    #[test]
    fn accepts_only_safe_smoke_comic_ids() {
        assert_eq!(
            route_from_smoke_comic_id(" 10817 "),
            Some("/comic/10817".to_string())
        );
        assert_eq!(route_from_smoke_comic_id("../Settings"), None);
        assert_eq!(route_from_smoke_comic_id("%2Fsettings"), None);
        assert_eq!(route_from_smoke_comic_id(&"a".repeat(81)), None);
    }
}
