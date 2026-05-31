use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use kmoe_app::models::{
    ChapterCache, DownloadTask, LoginInput, PageCache, ReadingHistoryEntry, ReadingProgress,
    SaveChapterCacheInput, SaveReadingProgressInput,
};
use kmoe_app::web_adapter::KmoeHttpClient;
use kmoe_app::{db, queue, reader};

const CONFIRMATION: &str = "I_UNDERSTAND_THIS_MAY_USE_QUOTA";

#[derive(Debug, Clone)]
struct Candidate {
    comic_id: String,
    comic_title: String,
    vol_id: String,
    volume_title: String,
    format: String,
    declared_size_bytes: Option<i64>,
    proxy_size_bytes: Option<i64>,
}

#[derive(Debug, Clone)]
struct ReaderVerification {
    page_count: usize,
    first_page_bytes: u64,
    forward_page_bytes: u64,
    back_page_bytes: u64,
    continue_page_index: i64,
    history_events: usize,
    cache_cleanup: &'static str,
}

#[derive(Debug, Clone)]
struct CandidateVerification {
    bytes: u64,
    reader_summary: ReaderVerification,
}

#[tokio::main]
async fn main() -> Result<(), String> {
    require_confirmation()?;
    let email = read_env("KMOE_VERIFY_EMAIL")?;
    let password = read_env("KMOE_VERIFY_PASSWORD")?;
    let comic_ids =
        std::env::var("KMOE_VERIFY_COMIC_IDS").unwrap_or_else(|_| "53339,14140,10180".to_string());
    let max_mb = std::env::var("KMOE_VERIFY_MAX_MB")
        .ok()
        .and_then(|value| value.parse::<f64>().ok())
        .unwrap_or(120.0);
    let verify_format = std::env::var("KMOE_VERIFY_FORMAT")
        .unwrap_or_else(|_| "source_zip".to_string())
        .trim()
        .to_string();
    if !matches!(verify_format.as_str(), "source_zip" | "mobi" | "epub") {
        return Err("KMOE_VERIFY_FORMAT must be source_zip, mobi, or epub".to_string());
    }
    let allow_unknown_source_zip =
        std::env::var("KMOE_VERIFY_ALLOW_UNKNOWN_SOURCE_ZIP").as_deref() == Ok("1");
    let max_candidate_attempts = std::env::var("KMOE_VERIFY_MAX_CANDIDATE_ATTEMPTS")
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|value| *value > 0)
        .unwrap_or_else(|| if verify_format == "source_zip" { 6 } else { 3 });

    let client = KmoeHttpClient::new().map_err(|error| error.to_string())?;
    let login_body = client
        .login(LoginInput {
            email,
            password,
            remember: Some(false),
        })
        .await
        .map_err(|error| error.to_string())?;
    if !login_succeeded(&login_body) {
        return Err("login failed or session was not accepted by Kmoe".to_string());
    }
    let profile_html = client.fetch_user_profile_html().await?;
    if !profile_authenticated(&profile_html) {
        return Err(
            "login marker was returned, but authenticated profile was not available".to_string(),
        );
    }

    let mut candidates = Vec::new();
    for comic_id in comic_ids
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let html = client.fetch_detail_html(comic_id).await?;
        let comic_title = extract_title(&html).unwrap_or_else(|| format!("Comic {comic_id}"));
        let book_data_path = extract_book_data_path(&html)
            .ok_or_else(|| format!("book_data path not found for comic {comic_id}"))?;
        let book_data = client.fetch_book_data(&book_data_path).await?;
        candidates.extend(parse_candidates(
            comic_id,
            &comic_title,
            &book_data,
            &verify_format,
            allow_unknown_source_zip,
        ));
    }

    let max_bytes = mb_to_bytes(max_mb);
    let mut candidates = candidates
        .into_iter()
        .filter(|candidate| {
            candidate
                .estimated_size_bytes()
                .is_some_and(|size| size <= max_bytes)
        })
        .collect::<Vec<_>>();
    candidates.sort_by_key(|candidate| candidate.estimated_size_bytes().unwrap_or(i64::MAX));
    if candidates.is_empty() {
        return Err(if allow_unknown_source_zip {
            format!("no {verify_format} candidate found below {max_mb} MB")
        } else {
            format!(
                "no {verify_format} candidate with declared size found below {max_mb} MB; set KMOE_VERIFY_ALLOW_UNKNOWN_SOURCE_ZIP=1 to use doc-size proxy rows for source_zip"
            )
        });
    }

    let attempt_count = candidates.len().min(max_candidate_attempts);
    let mut failures = Vec::new();
    for (index, selected) in candidates.into_iter().take(attempt_count).enumerate() {
        match verify_candidate(&client, &selected, index + 1).await {
            Ok(verification) => {
                println!(
                    "real_download_verification=ok comic_id={} vol_id={} format={} bytes={} library_records=1 reader_pages={} first_page_bytes={} forward_page_bytes={} back_page_bytes={} continue_page_index={} history_events={} cache_cleanup={} attempted_candidates={} failed_candidates={} local_paths=redacted",
                    selected.comic_id,
                    selected.vol_id,
                    selected.format,
                    verification.bytes,
                    verification.reader_summary.page_count,
                    verification.reader_summary.first_page_bytes,
                    verification.reader_summary.forward_page_bytes,
                    verification.reader_summary.back_page_bytes,
                    verification.reader_summary.continue_page_index,
                    verification.reader_summary.history_events,
                    verification.reader_summary.cache_cleanup,
                    index + 1,
                    failures.len()
                );
                return Ok(());
            }
            Err(error) => failures.push(redact_runtime_details(&error)),
        }
    }

    Err(format!(
        "no {verify_format} candidate completed after {} attempt(s); last_error={}",
        failures.len(),
        failures
            .last()
            .cloned()
            .unwrap_or_else(|| "none".to_string())
    ))
}

impl Candidate {
    fn estimated_size_bytes(&self) -> Option<i64> {
        self.declared_size_bytes.or(self.proxy_size_bytes)
    }
}

fn require_confirmation() -> Result<(), String> {
    match std::env::var("KMOE_REAL_DOWNLOAD_VERIFY").as_deref() {
        Ok(CONFIRMATION) => Ok(()),
        _ => Err(format!(
            "set KMOE_REAL_DOWNLOAD_VERIFY={CONFIRMATION} to run a real one-file download"
        )),
    }
}

fn read_env(name: &str) -> Result<String, String> {
    std::env::var(name)
        .map(|value| value.trim().to_string())
        .ok()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("{name} is required"))
}

fn login_succeeded(body: &str) -> bool {
    let compact: String = body.chars().filter(|ch| !ch.is_whitespace()).collect();
    let success_marker = compact.contains("do_call_action")
        || compact.contains("location.href")
        || compact.contains("display_codeinfo(\"m100\"")
        || compact.contains("display_codeinfo('m100'")
        || compact.contains("parent.display_codeinfo(\"m100\"")
        || compact.contains("parent.display_codeinfo('m100'");
    success_marker
        && !body.contains("e400")
        && !body.contains("e401")
        && !body.to_ascii_lowercase().contains("forbidden")
}

fn profile_authenticated(body: &str) -> bool {
    body.contains("KMOE ID")
        || body.contains("登錄郵箱")
        || body.contains("登录邮箱")
        || body.to_ascii_lowercase().contains("logout")
}

fn extract_title(html: &str) -> Option<String> {
    let marker = "text_bglight_big";
    let marker_index = html.find(marker)?;
    let after_marker = &html[marker_index..];
    let tag_end = after_marker.find('>')?;
    let after_tag = &after_marker[tag_end + 1..];
    let end = after_tag.find('<')?;
    Some(strip_entities(&after_tag[..end]).trim().to_string()).filter(|value| !value.is_empty())
}

fn extract_book_data_path(html: &str) -> Option<String> {
    let marker = "/book_data.php?h=";
    let start = html.find(marker)?;
    let tail = &html[start..];
    let end = tail
        .char_indices()
        .find(|(_, ch)| matches!(ch, '"' | '\'' | '<' | ')' | ' ' | '\r' | '\n'))
        .map(|(index, _)| index)
        .unwrap_or(tail.len());
    Some(tail[..end].replace("&amp;", "&"))
}

fn parse_candidates(
    comic_id: &str,
    comic_title: &str,
    book_data: &str,
    verify_format: &str,
    allow_unknown_source_zip: bool,
) -> Vec<Candidate> {
    extract_volinfo_payloads(book_data)
        .into_iter()
        .flat_map(|payload| {
            candidates_from_volinfo(
                comic_id,
                comic_title,
                &payload,
                verify_format,
                allow_unknown_source_zip,
            )
        })
        .collect()
}

fn extract_volinfo_payloads(input: &str) -> Vec<String> {
    let mut payloads = Vec::new();
    let mut remaining = input;
    while let Some(index) = remaining.find("volinfo=") {
        let after = &remaining[index + "volinfo=".len()..];
        let end = after
            .char_indices()
            .find(|(_, ch)| matches!(ch, '"' | '\'' | '\r' | '\n' | '<' | ')'))
            .map(|(index, _)| index)
            .unwrap_or(after.len());
        let payload = after[..end].trim();
        if !payload.is_empty() {
            payloads.push(payload.to_string());
        }
        remaining = &after[end.min(after.len())..];
    }
    payloads
}

fn candidates_from_volinfo(
    comic_id: &str,
    comic_title: &str,
    payload: &str,
    verify_format: &str,
    allow_unknown_source_zip: bool,
) -> Vec<Candidate> {
    let fields: Vec<_> = payload.split(',').map(str::trim).collect();
    let vol_id = fields.first().copied().unwrap_or_default();
    if !vol_id.chars().all(|ch| ch.is_ascii_alphanumeric()) {
        return Vec::new();
    }
    let volume_title = fields
        .get(5)
        .copied()
        .filter(|value| !value.is_empty())
        .unwrap_or(vol_id);
    let mut candidates = Vec::new();
    match verify_format {
        "source_zip" => {
            let declared_size_bytes = fields.get(8).and_then(|value| parse_mb(value));
            let proxy_size_bytes = smallest_proxy_size_bytes(&fields);
            if declared_size_bytes.is_some()
                || (allow_unknown_source_zip && proxy_size_bytes.is_some())
            {
                candidates.push(Candidate {
                    comic_id: comic_id.to_string(),
                    comic_title: comic_title.to_string(),
                    vol_id: vol_id.to_string(),
                    volume_title: volume_title.to_string(),
                    format: "source_zip".to_string(),
                    declared_size_bytes,
                    proxy_size_bytes,
                });
            }
        }
        "mobi" => {
            if let Some(declared_size_bytes) = fields.get(9).and_then(|value| parse_mb(value)) {
                candidates.push(Candidate {
                    comic_id: comic_id.to_string(),
                    comic_title: comic_title.to_string(),
                    vol_id: vol_id.to_string(),
                    volume_title: volume_title.to_string(),
                    format: "mobi".to_string(),
                    declared_size_bytes: Some(declared_size_bytes),
                    proxy_size_bytes: None,
                });
            }
        }
        "epub" => {
            if let Some(declared_size_bytes) = fields.get(11).and_then(|value| parse_mb(value)) {
                candidates.push(Candidate {
                    comic_id: comic_id.to_string(),
                    comic_title: comic_title.to_string(),
                    vol_id: vol_id.to_string(),
                    volume_title: volume_title.to_string(),
                    format: "epub".to_string(),
                    declared_size_bytes: Some(declared_size_bytes),
                    proxy_size_bytes: None,
                });
            }
        }
        _ => {}
    }
    candidates
}

fn smallest_proxy_size_bytes(fields: &[&str]) -> Option<i64> {
    [9_usize, 10, 11]
        .into_iter()
        .filter_map(|index| fields.get(index).and_then(|value| parse_mb(value)))
        .min()
}

fn parse_mb(value: &str) -> Option<i64> {
    let mb = value.parse::<f64>().ok()?;
    if mb > 0.0 {
        Some(mb_to_bytes(mb))
    } else {
        None
    }
}

fn mb_to_bytes(value: f64) -> i64 {
    (value * 1024.0 * 1024.0).round() as i64
}

fn make_task(candidate: &Candidate) -> DownloadTask {
    let now = timestamp();
    DownloadTask {
        id: format!(
            "real-verify-{}-{}-{}",
            candidate.comic_id, candidate.vol_id, candidate.format
        ),
        comic_id: candidate.comic_id.clone(),
        comic_title: candidate.comic_title.clone(),
        vol_id: candidate.vol_id.clone(),
        volume_title: candidate.volume_title.clone(),
        format: candidate.format.clone(),
        status: "queued".to_string(),
        progress: 0.0,
        downloaded_bytes: 0,
        total_bytes: candidate.declared_size_bytes,
        retry_count: 0,
        error_message: None,
        local_path: None,
        created_at: now.clone(),
        updated_at: now,
    }
}

async fn verify_candidate(
    client: &KmoeHttpClient,
    selected: &Candidate,
    attempt_index: usize,
) -> Result<CandidateVerification, String> {
    let root =
        default_download_root().join(format!("real-download-{}-{}", timestamp(), attempt_index));
    let db_path = root.join("queue.sqlite3");
    let download_dir = root.join("files");
    std::fs::create_dir_all(&root).map_err(|error| error.to_string())?;

    let task = make_task(selected);
    let conn = db::open_connection(db_path.clone()).map_err(|error| error.to_string())?;
    db::insert_download_task_if_absent(&conn, &task).map_err(|error| error.to_string())?;
    drop(conn);

    let processed = queue::process_download_queue_at(
        Some(db_path.clone()),
        client,
        Some(download_dir.to_string_lossy().to_string()),
    )
    .await?;
    if processed != 1 {
        return Err(format!("expected one processed task, got {processed}"));
    }

    let conn = db::open_connection(db_path.clone()).map_err(|error| error.to_string())?;
    let completed = db::get_download_task(&conn, &task.id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "completed task missing from sqlite".to_string())?;
    if completed.status != "completed" {
        return Err(format!(
            "download did not complete: status={} error={}",
            completed.status,
            completed.error_message.unwrap_or_default()
        ));
    }
    let local_path = completed
        .local_path
        .clone()
        .ok_or_else(|| "completed task did not store a local path".to_string())?;
    let metadata = std::fs::metadata(&local_path).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() == 0 {
        return Err("downloaded file is missing or empty".to_string());
    }

    let files = db::list_downloaded_files(&conn).map_err(|error| error.to_string())?;
    if files.len() != 1 || files[0].local_path != local_path {
        return Err(format!("library record mismatch: {} records", files.len()));
    }

    let reader_summary = if is_reader_archive_format(&selected.format) {
        verify_reader_cache_cycle(
            &conn,
            selected,
            &completed.id,
            Path::new(&local_path),
            &root.join("reader-cache"),
        )?
    } else {
        ReaderVerification {
            page_count: 0,
            first_page_bytes: 0,
            forward_page_bytes: 0,
            back_page_bytes: 0,
            continue_page_index: -1,
            history_events: 0,
            cache_cleanup: "not_applicable",
        }
    };
    verify_cancel_retry_state(&conn, selected, &local_path)?;
    maybe_verify_open_and_reveal(Path::new(&local_path))?;

    Ok(CandidateVerification {
        bytes: metadata.len(),
        reader_summary,
    })
}

fn verify_reader_cache_cycle(
    conn: &rusqlite::Connection,
    candidate: &Candidate,
    task_id: &str,
    archive_path: &Path,
    cache_root: &Path,
) -> Result<ReaderVerification, String> {
    let cache_dir = cache_root
        .join(&candidate.comic_id)
        .join(&candidate.vol_id)
        .join(&candidate.format);
    let extracted = reader::extract_cbz_images_to_dir(archive_path, &cache_dir)
        .map_err(|error| format!("reader cache preparation failed: {error}"))?;
    if extracted.pages.is_empty() {
        return Err("reader cache preparation produced no pages".to_string());
    }

    let now = timestamp();
    let chapter_id = format!(
        "reader-cache:{}:{}:{}",
        candidate.comic_id, candidate.vol_id, candidate.format
    );
    let pages = extracted
        .pages
        .iter()
        .map(|page| PageCache {
            id: format!("{}:page:{:05}", chapter_id, page.entry.index + 1),
            chapter_cache_id: chapter_id.clone(),
            comic_id: candidate.comic_id.clone(),
            volume_id: candidate.vol_id.clone(),
            page_index: i64::try_from(page.entry.index).unwrap_or(i64::MAX),
            file_path: page.file_path.clone(),
            width: None,
            height: None,
            size_bytes: Some(i64::try_from(page.size_bytes).unwrap_or(i64::MAX)),
            created_at: now.clone(),
            last_accessed_at: now.clone(),
        })
        .collect::<Vec<_>>();
    let chapter = ChapterCache {
        id: chapter_id.clone(),
        comic_id: candidate.comic_id.clone(),
        comic_title: candidate.comic_title.clone(),
        volume_id: candidate.vol_id.clone(),
        volume_title: candidate.volume_title.clone(),
        format: candidate.format.clone(),
        cache_kind: "reading_cache".to_string(),
        source_task_id: Some(task_id.to_string()),
        cache_dir: cache_dir.to_string_lossy().to_string(),
        size_bytes: i64::try_from(extracted.total_size_bytes).unwrap_or(i64::MAX),
        page_count: Some(i64::try_from(extracted.manifest.page_count).unwrap_or(i64::MAX)),
        status: "ready".to_string(),
        policy: Some("balanced".to_string()),
        last_accessed_at: now.clone(),
        created_at: now.clone(),
        updated_at: now.clone(),
        expires_at: None,
    };
    db::save_chapter_cache(conn, &SaveChapterCacheInput { chapter, pages })
        .map_err(|error| error.to_string())?;

    let saved_pages =
        db::list_page_cache_for_chapter(conn, &chapter_id).map_err(|error| error.to_string())?;
    if saved_pages.len() != extracted.manifest.page_count {
        return Err(format!(
            "reader page cache mismatch: saved={} manifest={}",
            saved_pages.len(),
            extracted.manifest.page_count
        ));
    }
    let first_page = saved_pages
        .first()
        .ok_or_else(|| "reader cache has no first page".to_string())?;
    let first_page_bytes = std::fs::metadata(&first_page.file_path)
        .map_err(|error| error.to_string())?
        .len();
    if first_page_bytes == 0 {
        return Err("reader first page is empty".to_string());
    }

    let progress_check =
        verify_reader_page_turn_and_continue_progress(conn, candidate, &saved_pages)?;
    db::clear_reading_cache(conn, Some(std::slice::from_ref(&chapter_id)))
        .map_err(|error| error.to_string())?;
    if db::list_page_cache_for_chapter(conn, &chapter_id)
        .map_err(|error| error.to_string())?
        .is_empty()
        && db::list_downloaded_files(conn)
            .map_err(|error| error.to_string())?
            .iter()
            .any(|file| {
                file.comic_id == candidate.comic_id
                    && file.vol_id == candidate.vol_id
                    && file.format == candidate.format.as_str()
                    && Path::new(&file.local_path).is_file()
            })
    {
        let persisted_progress =
            db::get_reading_progress(conn, &candidate.comic_id, &candidate.vol_id)
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "reading progress disappeared after cache cleanup".to_string())?;
        if persisted_progress.page_index != progress_check.continue_page_index {
            return Err("cache cleanup changed the continue-reading progress anchor".to_string());
        }
        let _ = std::fs::remove_dir_all(&cache_dir);
        Ok(ReaderVerification {
            page_count: extracted.manifest.page_count,
            first_page_bytes,
            forward_page_bytes: progress_check.forward_page_bytes,
            back_page_bytes: progress_check.back_page_bytes,
            continue_page_index: progress_check.continue_page_index,
            history_events: progress_check.history_events,
            cache_cleanup: "preserved_download",
        })
    } else {
        Err("reader cache cleanup did not preserve the permanent Reader archive record".to_string())
    }
}

fn is_reader_archive_format(format: &str) -> bool {
    matches!(format, "source_zip" | "epub")
}

struct ReaderProgressCheck {
    forward_page_bytes: u64,
    back_page_bytes: u64,
    continue_page_index: i64,
    history_events: usize,
}

fn verify_reader_page_turn_and_continue_progress(
    conn: &rusqlite::Connection,
    candidate: &Candidate,
    saved_pages: &[PageCache],
) -> Result<ReaderProgressCheck, String> {
    if saved_pages.len() < 2 {
        return Err("reader verification needs at least two pages for page-turn proof".to_string());
    }
    let first_page = saved_pages
        .iter()
        .find(|page| page.page_index == 0)
        .ok_or_else(|| "reader cache has no page 0 for back-navigation proof".to_string())?;
    let forward_page = saved_pages
        .iter()
        .find(|page| page.page_index == 1)
        .ok_or_else(|| "reader cache has no page 1 for forward-navigation proof".to_string())?;
    let forward_page_bytes = std::fs::metadata(&forward_page.file_path)
        .map_err(|error| error.to_string())?
        .len();
    if forward_page_bytes == 0 {
        return Err("reader forward page is empty".to_string());
    }
    let back_page_bytes = std::fs::metadata(&first_page.file_path)
        .map_err(|error| error.to_string())?
        .len();
    if back_page_bytes == 0 {
        return Err("reader back-navigation page is empty".to_string());
    }
    let page_count = saved_pages.len();
    save_reader_progress_event(conn, candidate, page_count, 0, "open")?;
    save_reader_progress_event(conn, candidate, page_count, 1, "page_change")?;
    let page_count_i64 = i64::try_from(page_count).unwrap_or(i64::MAX);
    let saved = db::get_reading_progress(conn, &candidate.comic_id, &candidate.vol_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "reading progress did not persist".to_string())?;
    if saved.page_index != 1
        || saved.page_count != Some(page_count_i64)
        || saved.finished
        || saved.progress_percent <= 0.0
    {
        return Err("continue-reading progress round trip mismatch".to_string());
    }
    let history_events = count_reader_history_events(conn, candidate)?;
    if history_events < 2 {
        return Err("reader history did not record open and page_change events".to_string());
    }
    Ok(ReaderProgressCheck {
        forward_page_bytes,
        back_page_bytes,
        continue_page_index: saved.page_index,
        history_events,
    })
}

fn save_reader_progress_event(
    conn: &rusqlite::Connection,
    candidate: &Candidate,
    page_count: usize,
    page_index: i64,
    event: &str,
) -> Result<(), String> {
    let now = timestamp();
    let page_count_i64 = i64::try_from(page_count).unwrap_or(i64::MAX);
    let progress_percent = if page_count > 0 {
        ((page_index + 1) as f64 / page_count as f64) * 100.0
    } else {
        0.0
    };
    db::save_reading_progress(
        conn,
        &SaveReadingProgressInput {
            progress: ReadingProgress {
                id: format!("{}-{}", candidate.comic_id, candidate.vol_id),
                comic_id: candidate.comic_id.clone(),
                comic_title: candidate.comic_title.clone(),
                volume_id: candidate.vol_id.clone(),
                volume_title: candidate.volume_title.clone(),
                page_index,
                page_count: Some(page_count_i64),
                progress_percent,
                last_read_at: now.clone(),
                finished: false,
                reading_mode: "paged".to_string(),
                reading_direction: "rtl".to_string(),
                page_layout: "single".to_string(),
                zoom: None,
                rotation: None,
                crop_json: None,
                spread_overrides_json: None,
                updated_at: now.clone(),
            },
            history: Some(ReadingHistoryEntry {
                id: format!(
                    "history-{}-{}-{}-{}",
                    candidate.comic_id, candidate.vol_id, event, now
                ),
                comic_id: candidate.comic_id.clone(),
                comic_title: candidate.comic_title.clone(),
                volume_id: candidate.vol_id.clone(),
                volume_title: candidate.volume_title.clone(),
                page_index,
                progress_percent,
                event: event.to_string(),
                read_at: now,
                duration_seconds: None,
            }),
        },
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn count_reader_history_events(
    conn: &rusqlite::Connection,
    candidate: &Candidate,
) -> Result<usize, String> {
    let mut stmt = conn
        .prepare(
            "SELECT COUNT(*) FROM reading_history
             WHERE comic_id = ?1
               AND volume_id = ?2
               AND event IN ('open', 'page_change')",
        )
        .map_err(|error| error.to_string())?;
    let count: i64 = stmt
        .query_row([&candidate.comic_id, &candidate.vol_id], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    usize::try_from(count).map_err(|error| error.to_string())
}

fn verify_cancel_retry_state(
    conn: &rusqlite::Connection,
    candidate: &Candidate,
    completed_path: &str,
) -> Result<(), String> {
    let mut cancel_task = make_task(candidate);
    cancel_task.id = format!("{}-cancel-retry", cancel_task.id);
    cancel_task.created_at = format!("{}1", timestamp());
    cancel_task.updated_at = cancel_task.created_at.clone();
    db::insert_download_task_if_absent(conn, &cancel_task).map_err(|error| error.to_string())?;
    db::cancel_download_task(conn, &cancel_task.id, &timestamp())?;
    let retried = db::retry_download_task(conn, &cancel_task.id, &timestamp())?;
    if retried.status != "queued" || retried.retry_count != 1 {
        return Err("cancel/retry state check failed".to_string());
    }
    if !Path::new(completed_path).is_file() {
        return Err("completed file disappeared during cancel/retry state check".to_string());
    }
    Ok(())
}

fn maybe_verify_open_and_reveal(path: &Path) -> Result<(), String> {
    if std::env::var("KMOE_VERIFY_OPEN_FILE").as_deref() != Ok("1") {
        return Ok(());
    }
    let open_status = if cfg!(target_os = "macos") {
        Command::new("open").arg(path).status()
    } else {
        return Ok(());
    }
    .map_err(|error| format!("failed to open downloaded file: {error}"))?;
    if !open_status.success() {
        return Err(format!("open file command failed with {open_status}"));
    }

    let reveal_status = Command::new("open")
        .arg("-R")
        .arg(path)
        .status()
        .map_err(|error| format!("failed to reveal downloaded file: {error}"))?;
    if !reveal_status.success() {
        return Err(format!("reveal file command failed with {reveal_status}"));
    }
    Ok(())
}

fn default_download_root() -> PathBuf {
    std::env::var("KMOE_VERIFY_DOWNLOAD_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            std::env::var("HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|_| std::env::temp_dir())
                .join("Downloads")
                .join("Kmoe")
                .join("Verification")
        })
}

fn strip_entities(input: &str) -> String {
    input
        .replace("&amp;", "&")
        .replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

fn redact_runtime_details(input: &str) -> String {
    input
        .split_whitespace()
        .map(|part| {
            if part.contains("://") || part.starts_with('/') || part.starts_with("~/") {
                "[redacted]"
            } else {
                part
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}
