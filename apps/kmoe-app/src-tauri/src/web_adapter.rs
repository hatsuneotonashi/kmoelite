use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use futures_util::StreamExt;
use reqwest::cookie::{CookieStore, Jar};
use reqwest::header::{HeaderMap, ACCEPT, CONTENT_TYPE};
use reqwest::{Client, Url};
use serde_json::Value;
use std::net::IpAddr;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::time::sleep;

use crate::db;
use crate::http;
use crate::models::{CatalogQueryInput, LoginInput};

const DEFAULT_MIN_REQUEST_INTERVAL: Duration = Duration::from_millis(750);
const KMOE_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const KMOE_READ_TIMEOUT: Duration = Duration::from_secs(30);
const KMOE_BROWSER_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 KmoeClient/0.1 Tauri";
const KMOE_SESSION_COOKIE_SETTING_KEY: &str = "kmoe_session_cookie_header";
const MAX_PERSISTED_COOKIE_HEADER_BYTES: usize = 8192;
const ERROR_INVALID_DOWNLOAD_TASK: &str = "下载任务信息无效，请重新选择内容后再试。";
const ERROR_UNSUPPORTED_DOWNLOAD_FORMAT: &str = "不支持的下载格式。";
const ERROR_AUTHORIZE_FAILED: &str = "未能取得可用的下载地址，请确认登录状态和下载权限。";
const ERROR_DOWNLOAD_REJECTED: &str = "站点拒绝了本次下载，请确认登录状态、权限和剩余额度。";
const ERROR_DOWNLOAD_NETWORK: &str = "下载连接中断，请稍后重试。";
const ERROR_DOWNLOAD_NOT_FILE: &str = "下载响应不是文件内容，请确认登录状态和下载权限。";
const ERROR_DOWNLOAD_FORMAT_MISMATCH: &str = "下载内容与所选格式不匹配，文件未保存。";
const ERROR_DOWNLOAD_WRITE: &str = "无法写入下载文件，请检查保存位置权限。";
const ERROR_DOWNLOAD_READ: &str = "无法读取下载内容，请重试。";
const ERROR_DOWNLOAD_INCOMPLETE: &str = "下载传输不完整，请重试。";
const ERROR_DOWNLOAD_TOO_LARGE: &str = "下载文件过大，当前版本无法保存。";
const ERROR_DOWNLOAD_URL_UNSAFE: &str = "下载地址未通过安全校验，请重新发起下载。";
const ERROR_COVER_URL_UNSAFE: &str = "封面地址未通过安全校验。";
const ERROR_COVER_FETCH_FAILED: &str = "封面图片加载失败，请稍后重试。";
const ERROR_COVER_NOT_IMAGE: &str = "封面响应不是受支持的图片。";
const ERROR_COVER_TOO_LARGE: &str = "封面图片过大，已停止加载。";
const MAX_COVER_IMAGE_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DownloadTransfer {
    pub downloaded_bytes: i64,
    pub content_length: Option<i64>,
}

#[derive(Clone)]
pub struct KmoeHttpClient {
    client: Client,
    cookie_jar: Arc<Jar>,
    request_gate: Arc<RequestGate>,
}

impl KmoeHttpClient {
    pub fn new() -> Result<Self, reqwest::Error> {
        Self::new_with_min_request_interval(DEFAULT_MIN_REQUEST_INTERVAL)
    }

    fn new_with_min_request_interval(
        min_request_interval: Duration,
    ) -> Result<Self, reqwest::Error> {
        let jar = Arc::new(Jar::default());
        restore_persisted_session_cookie_header(jar.as_ref());
        let client = Client::builder()
            .cookie_provider(jar.clone())
            .connect_timeout(KMOE_CONNECT_TIMEOUT)
            .read_timeout(KMOE_READ_TIMEOUT)
            .user_agent(KMOE_BROWSER_USER_AGENT)
            .build()?;
        Ok(Self {
            client,
            cookie_jar: jar,
            request_gate: Arc::new(RequestGate::new(min_request_interval)),
        })
    }

    pub async fn login(&self, input: LoginInput) -> Result<String, reqwest::Error> {
        let remember = input.remember.unwrap_or(false);
        let mut form = vec![("email", input.email), ("passwd", input.password)];
        if remember {
            form.push(("keepalive", "on".to_string()));
        }
        self.wait_for_request_slot().await;
        self.client
            .get("https://kxo.moe/login.php")
            .header("referer", "https://kxo.moe/")
            .send()
            .await?
            .bytes()
            .await?;
        self.wait_for_request_slot().await;
        let text = self
            .client
            .post("https://kxo.moe/login_do.php")
            .header("referer", "https://kxo.moe/login.php")
            .form(&form)
            .send()
            .await?
            .text()
            .await?;
        if site_login_success(&text) {
            if remember {
                persist_session_cookie_header(self.cookie_jar.as_ref());
            } else {
                clear_persisted_session_cookie_header();
            }
        } else if remember {
            clear_persisted_session_cookie_header();
        }
        Ok(text)
    }

    pub async fn fetch_catalog(&self, query: CatalogQueryInput) -> Result<String, reqwest::Error> {
        let url = build_catalog_url(query);
        self.wait_for_request_slot().await;
        self.client.get(url).send().await?.text().await
    }

    pub async fn fetch_cover_image_data_url(&self, url: &str) -> Result<String, String> {
        let parsed = assert_safe_cover_image_url(url)?;
        let response = self
            .client
            .get(parsed.clone())
            .header("referer", "https://kxo.moe/")
            .header(
                ACCEPT,
                "image/avif,image/webp,image/apng,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5",
            )
            .send()
            .await
            .map_err(|_| ERROR_COVER_FETCH_FAILED.to_string())?;
        if !response.status().is_success() {
            return Err(ERROR_COVER_FETCH_FAILED.to_string());
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_COVER_IMAGE_BYTES)
        {
            return Err(ERROR_COVER_TOO_LARGE.to_string());
        }

        let mime_type = cover_image_mime_type(response.headers(), &parsed)?;
        let bytes = response
            .bytes()
            .await
            .map_err(|_| ERROR_COVER_FETCH_FAILED.to_string())?;
        if bytes.is_empty() {
            return Err(ERROR_COVER_NOT_IMAGE.to_string());
        }
        if bytes.len() as u64 > MAX_COVER_IMAGE_BYTES {
            return Err(ERROR_COVER_TOO_LARGE.to_string());
        }

        Ok(format!(
            "data:{mime_type};base64,{}",
            BASE64_STANDARD.encode(&bytes)
        ))
    }

    pub async fn fetch_detail_html(&self, comic_id: &str) -> Result<String, String> {
        assert_safe_id(comic_id)?;
        self.wait_for_request_slot().await;
        self.client
            .get(format!("https://kxo.moe/c/{comic_id}.htm"))
            .send()
            .await
            .map_err(|error| error.to_string())?
            .text()
            .await
            .map_err(|error| error.to_string())
    }

    pub async fn fetch_book_data(&self, path: &str) -> Result<String, String> {
        if !path.starts_with("/book_data.php?h=") || path.contains("..") {
            return Err("invalid book_data path".to_string());
        }
        self.wait_for_request_slot().await;
        self.client
            .get(format!("https://kxo.moe{path}"))
            .send()
            .await
            .map_err(|error| error.to_string())?
            .text()
            .await
            .map_err(|error| error.to_string())
    }

    pub async fn fetch_user_profile_html(&self) -> Result<String, String> {
        self.wait_for_request_slot().await;
        self.client
            .get("https://kxo.moe/my.php")
            .header("referer", "https://kxo.moe/")
            .send()
            .await
            .map_err(|error| error.to_string())?
            .text()
            .await
            .map_err(|error| error.to_string())
    }

    pub async fn logout(&self) -> Result<String, reqwest::Error> {
        clear_persisted_session_cookie_header();
        self.wait_for_request_slot().await;
        let text = self
            .client
            .get("https://kxo.moe/logout.php")
            .header("referer", "https://kxo.moe/")
            .send()
            .await?
            .text()
            .await?;
        Ok(text)
    }

    pub async fn authorize_single_download(
        &self,
        book_id: &str,
        vol_id: &str,
        format: &str,
        line: u8,
    ) -> Result<String, String> {
        let mobi_type = match format {
            "source_zip" => 0,
            "mobi" => 1,
            "epub" => 2,
            _ => return Err(ERROR_UNSUPPORTED_DOWNLOAD_FORMAT.to_string()),
        };
        let path = http::build_download_authorize_url(book_id, vol_id, mobi_type, line)
            .map_err(|_| ERROR_INVALID_DOWNLOAD_TASK.to_string())?;
        self.wait_for_request_slot().await;
        let response = self
            .client
            .get(format!("https://kxo.moe{path}"))
            .header("referer", format!("https://kxo.moe/c/{book_id}.htm"))
            .send()
            .await
            .map_err(|_| ERROR_AUTHORIZE_FAILED.to_string())?;
        if !response.status().is_success() {
            return Err(ERROR_AUTHORIZE_FAILED.to_string());
        }
        let body = response
            .text()
            .await
            .map_err(|_| ERROR_AUTHORIZE_FAILED.to_string())?;
        extract_authorized_url(&body).map_err(|_| ERROR_AUTHORIZE_FAILED.to_string())
    }

    pub async fn download_authorized_to_file(
        &self,
        url: &str,
        part_path: &Path,
        format: &str,
    ) -> Result<DownloadTransfer, String> {
        self.download_authorized_to_file_with_progress(url, part_path, format, |_, _| false)
            .await
    }

    pub async fn download_authorized_to_file_with_progress<F>(
        &self,
        url: &str,
        part_path: &Path,
        format: &str,
        mut on_progress: F,
    ) -> Result<DownloadTransfer, String>
    where
        F: FnMut(i64, Option<i64>) -> bool,
    {
        let expected_format = ExpectedDownloadFormat::from_task_format(format)?;
        assert_safe_authorized_url(url).map_err(|_| ERROR_DOWNLOAD_URL_UNSAFE.to_string())?;
        self.wait_for_request_slot().await;
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|_| ERROR_DOWNLOAD_NETWORK.to_string())?;
        assert_safe_final_download_url(response.url())
            .map_err(|_| ERROR_DOWNLOAD_URL_UNSAFE.to_string())?;
        if !response.status().is_success() {
            return Err(ERROR_DOWNLOAD_REJECTED.to_string());
        }
        validate_download_content_type(response.headers(), expected_format)?;
        let content_length = response
            .content_length()
            .map(content_length_to_i64)
            .transpose()?;
        let mut file = tokio::fs::File::create(part_path)
            .await
            .map_err(|_| ERROR_DOWNLOAD_WRITE.to_string())?;
        let mut downloaded_bytes: i64 = 0;
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|_| ERROR_DOWNLOAD_NETWORK.to_string())?;
            file.write_all(&chunk)
                .await
                .map_err(|_| ERROR_DOWNLOAD_WRITE.to_string())?;
            downloaded_bytes = downloaded_bytes
                .checked_add(chunk.len() as i64)
                .ok_or_else(|| ERROR_DOWNLOAD_TOO_LARGE.to_string())?;
            if on_progress(downloaded_bytes, content_length) {
                let _ = file.flush().await;
                return Err("download stopped by local queue control".to_string());
            }
        }
        file.flush()
            .await
            .map_err(|_| ERROR_DOWNLOAD_WRITE.to_string())?;
        validate_downloaded_size(downloaded_bytes, content_length)?;
        validate_downloaded_file_format(part_path, expected_format).await?;
        Ok(DownloadTransfer {
            downloaded_bytes,
            content_length,
        })
    }

    async fn wait_for_request_slot(&self) {
        let delay = self.request_gate.next_delay();
        if !delay.is_zero() {
            sleep(delay).await;
        }
    }
}

fn build_catalog_url(query: CatalogQueryInput) -> Url {
    let mut url = Url::parse("https://kxo.moe/data_list.php").expect("static url is valid");
    {
        let mut pairs = url.query_pairs_mut();
        let keyword = query
            .keyword
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let category = query
            .category
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        if let Some(value) = keyword.or(category) {
            pairs.append_pair("s", value);
        }
        if let Some(value) = query
            .status
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            pairs.append_pair("end", value);
        }
        if let Some(value) = query
            .language
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            pairs.append_pair("lang", value);
        }
        if let Some(value) = query
            .length
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            pairs.append_pair("blen", value);
        }
        if let Some(value) = query
            .region
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            pairs.append_pair("regn", value);
        }
        if let Some(value) = query
            .sort
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            pairs.append_pair("by", value);
        }
        if query.color.unwrap_or(false) {
            pairs.append_pair("color", "1");
        }
        if query.hd.unwrap_or(false) {
            pairs.append_pair("hd", "1");
        }
        pairs.append_pair("p", &query.page.unwrap_or(1).to_string());
    }
    url
}

fn kmoe_root_url() -> Url {
    Url::parse("https://kxo.moe/").expect("static Kmoe root URL is valid")
}

fn site_login_success(text: &str) -> bool {
    (text.contains("do_call_action")
        || text.contains("location.href")
        || text.contains("display_codeinfo( \"m100\"")
        || text.contains("display_codeinfo(\"m100\"")
        || text.contains("display_codeinfo( \"\"")
        || text.contains("display_codeinfo(\"\")"))
        && !text.contains("e400")
        && !text.contains("e401")
        && !text.to_ascii_lowercase().contains("forbidden")
}

fn persist_session_cookie_header(jar: &Jar) {
    if let Ok(conn) = db::open_default_connection() {
        let _ = persist_session_cookie_header_with_conn(&conn, jar);
    }
}

fn persist_session_cookie_header_with_conn(
    conn: &rusqlite::Connection,
    jar: &Jar,
) -> rusqlite::Result<()> {
    if let Some(cookie_header) = session_cookie_header_from_jar(jar) {
        db::set_setting(
            conn,
            KMOE_SESSION_COOKIE_SETTING_KEY,
            &cookie_header,
            &session_timestamp(),
        )
    } else {
        db::delete_setting(conn, KMOE_SESSION_COOKIE_SETTING_KEY)
    }
}

fn restore_persisted_session_cookie_header(jar: &Jar) {
    if let Ok(conn) = db::open_default_connection() {
        let _ = restore_persisted_session_cookie_header_with_conn(&conn, jar);
    }
}

fn restore_persisted_session_cookie_header_with_conn(
    conn: &rusqlite::Connection,
    jar: &Jar,
) -> rusqlite::Result<()> {
    let Some(cookie_header) = db::get_setting(conn, KMOE_SESSION_COOKIE_SETTING_KEY)? else {
        return Ok(());
    };
    restore_session_cookie_header_into_jar(jar, &cookie_header);
    Ok(())
}

fn clear_persisted_session_cookie_header() {
    if let Ok(conn) = db::open_default_connection() {
        let _ = clear_persisted_session_cookie_header_with_conn(&conn);
    }
}

fn clear_persisted_session_cookie_header_with_conn(
    conn: &rusqlite::Connection,
) -> rusqlite::Result<()> {
    db::delete_setting(conn, KMOE_SESSION_COOKIE_SETTING_KEY)
}

fn session_cookie_header_from_jar(jar: &Jar) -> Option<String> {
    let header = jar.cookies(&kmoe_root_url())?;
    sanitize_session_cookie_header(header.to_str().ok()?)
}

fn restore_session_cookie_header_into_jar(jar: &Jar, cookie_header: &str) {
    if let Some(cookie_header) = sanitize_session_cookie_header(cookie_header) {
        let root = kmoe_root_url();
        for cookie_pair in cookie_header.split(';').map(str::trim) {
            if is_safe_cookie_pair(cookie_pair) {
                jar.add_cookie_str(cookie_pair, &root);
            }
        }
    }
}

fn sanitize_session_cookie_header(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_PERSISTED_COOKIE_HEADER_BYTES {
        return None;
    }
    if trimmed
        .chars()
        .any(|ch| ch.is_control() || matches!(ch, '\n' | '\r'))
    {
        return None;
    }
    let cookie_pairs = trimmed
        .split(';')
        .map(str::trim)
        .filter(|pair| is_safe_cookie_pair(pair))
        .collect::<Vec<_>>();
    if cookie_pairs.is_empty() {
        None
    } else {
        Some(cookie_pairs.join("; "))
    }
}

fn is_safe_cookie_pair(value: &str) -> bool {
    if value.is_empty() || value.contains(';') || value.chars().any(char::is_control) {
        return false;
    }
    let Some((name, cookie_value)) = value.split_once('=') else {
        return false;
    };
    let normalized_name = name.trim().to_ascii_lowercase();
    if matches!(
        normalized_name.as_str(),
        "path" | "domain" | "expires" | "max-age" | "samesite" | "secure" | "httponly"
    ) {
        return false;
    }
    !name.trim().is_empty()
        && !cookie_value.trim().is_empty()
        && name
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-' | '.'))
}

fn session_timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    seconds.to_string()
}

struct RequestGate {
    min_request_interval: Duration,
    last_scheduled_at: Mutex<Option<Instant>>,
}

impl RequestGate {
    fn new(min_request_interval: Duration) -> Self {
        Self {
            min_request_interval,
            last_scheduled_at: Mutex::new(None),
        }
    }

    fn next_delay(&self) -> Duration {
        let now = Instant::now();
        let mut last_scheduled_at = self
            .last_scheduled_at
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let next_allowed_at = last_scheduled_at
            .map(|last| last + self.min_request_interval)
            .unwrap_or(now);
        let scheduled_at = if next_allowed_at > now {
            next_allowed_at
        } else {
            now
        };
        *last_scheduled_at = Some(scheduled_at);
        scheduled_at.saturating_duration_since(now)
    }
}

fn assert_safe_id(value: &str) -> Result<(), String> {
    if value.chars().all(|ch| ch.is_ascii_alphanumeric()) {
        Ok(())
    } else {
        Err("invalid comic id".to_string())
    }
}

fn extract_authorized_url(body: &str) -> Result<String, String> {
    let value: Value = serde_json::from_str(body)
        .map_err(|_| "download authorization did not return JSON".to_string())?;
    let url = find_download_url(&value)
        .ok_or_else(|| "download authorization JSON did not contain a usable URL".to_string())?;
    assert_safe_authorized_url(&url)?;
    Ok(url)
}

fn find_download_url(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => normalize_download_url(text),
        Value::Array(items) => items.iter().find_map(find_download_url),
        Value::Object(map) => {
            for key in [
                "url",
                "downurl",
                "downloadUrl",
                "download_url",
                "href",
                "link",
            ] {
                if let Some(url) = map.get(key).and_then(find_download_url) {
                    return Some(url);
                }
            }
            map.values().find_map(find_download_url)
        }
        _ => None,
    }
}

fn normalize_download_url(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.starts_with("https://") {
        Some(trimmed.to_string())
    } else if trimmed.starts_with("//") {
        Some(format!("https:{trimmed}"))
    } else if trimmed.starts_with("/download") || trimmed.starts_with("/down") {
        Some(format!("https://kxo.moe{trimmed}"))
    } else {
        None
    }
}

fn assert_safe_authorized_url(url: &str) -> Result<(), String> {
    let parsed = Url::parse(url).map_err(|_| ERROR_DOWNLOAD_URL_UNSAFE.to_string())?;
    let forbidden_package_query = parsed.query_pairs().any(|(key, value)| {
        key.eq_ignore_ascii_case("batch") || (key.eq_ignore_ascii_case("vip") && value == "9")
    });
    if forbidden_package_query
        || parsed
            .path()
            .to_ascii_lowercase()
            .contains("getdownurl.php")
    {
        return Err(ERROR_DOWNLOAD_URL_UNSAFE.to_string());
    }
    if parsed.scheme() != "https" {
        return Err(ERROR_DOWNLOAD_URL_UNSAFE.to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(ERROR_DOWNLOAD_URL_UNSAFE.to_string());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| ERROR_DOWNLOAD_URL_UNSAFE.to_string())?;
    if host == "localhost" || host.ends_with(".local") {
        return Err(ERROR_DOWNLOAD_URL_UNSAFE.to_string());
    }
    let ip_host = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(address) = ip_host.parse::<IpAddr>() {
        validate_public_ip(address)?;
    }
    validate_kmoe_download_host(host)?;
    Ok(())
}

fn validate_kmoe_download_host(host: &str) -> Result<(), String> {
    let normalized = host.trim_end_matches('.').to_ascii_lowercase();
    let allowed = matches!(
        normalized.as_str(),
        "kxo.moe" | "kmoe.moe" | "kmoe.net" | "kmoe8.com"
    ) || normalized.ends_with(".kxo.moe")
        || normalized.ends_with(".kmoe.moe")
        || normalized.ends_with(".kmoe.net")
        || normalized.ends_with(".kmoe8.com");
    if allowed {
        Ok(())
    } else {
        Err(ERROR_DOWNLOAD_URL_UNSAFE.to_string())
    }
}

fn assert_safe_cover_image_url(url: &str) -> Result<Url, String> {
    let parsed = Url::parse(url).map_err(|_| ERROR_COVER_URL_UNSAFE.to_string())?;
    if parsed.scheme() != "https" {
        return Err(ERROR_COVER_URL_UNSAFE.to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(ERROR_COVER_URL_UNSAFE.to_string());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| ERROR_COVER_URL_UNSAFE.to_string())?
        .trim_end_matches('.')
        .to_ascii_lowercase();
    let allowed = host == "kmimg.mxomo.com"
        || host == "kxo.moe"
        || host.ends_with(".kxo.moe")
        || host == "kxx.moe"
        || host.ends_with(".kxx.moe")
        || host == "kzz.moe"
        || host.ends_with(".kzz.moe")
        || host == "koz.moe"
        || host.ends_with(".koz.moe");
    if !allowed {
        return Err(ERROR_COVER_URL_UNSAFE.to_string());
    }
    Ok(parsed)
}

fn validate_public_ip(address: IpAddr) -> Result<(), String> {
    match address {
        IpAddr::V4(address) => {
            if address.is_loopback()
                || address.is_private()
                || address.is_link_local()
                || address.is_broadcast()
                || address.is_unspecified()
                || address.is_multicast()
            {
                return Err(ERROR_DOWNLOAD_URL_UNSAFE.to_string());
            }
        }
        IpAddr::V6(address) => {
            if address.is_loopback()
                || address.is_unspecified()
                || address.is_multicast()
                || address.is_unique_local()
                || address.is_unicast_link_local()
            {
                return Err(ERROR_DOWNLOAD_URL_UNSAFE.to_string());
            }
        }
    }
    Ok(())
}

fn cover_image_mime_type(headers: &HeaderMap, url: &Url) -> Result<&'static str, String> {
    if let Some(value) = headers.get(CONTENT_TYPE) {
        let content_type = value
            .to_str()
            .map_err(|_| ERROR_COVER_NOT_IMAGE.to_string())?
            .split(';')
            .next()
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase();
        match content_type.as_str() {
            "image/jpeg" | "image/jpg" => return Ok("image/jpeg"),
            "image/png" => return Ok("image/png"),
            "image/webp" => return Ok("image/webp"),
            "image/gif" => return Ok("image/gif"),
            "image/avif" => return Ok("image/avif"),
            _ if content_type.starts_with("image/") => {
                return Err(ERROR_COVER_NOT_IMAGE.to_string())
            }
            "application/octet-stream" | "binary/octet-stream" => {}
            _ if !content_type.is_empty() => return Err(ERROR_COVER_NOT_IMAGE.to_string()),
            _ => {}
        }
    }

    let probe = format!(
        "{}?{}",
        url.path().to_ascii_lowercase(),
        url.query().unwrap_or_default().to_ascii_lowercase()
    );
    if probe.contains(".jpg") || probe.contains(".jpeg") {
        Ok("image/jpeg")
    } else if probe.contains(".png") {
        Ok("image/png")
    } else if probe.contains(".webp") {
        Ok("image/webp")
    } else if probe.contains(".gif") {
        Ok("image/gif")
    } else if probe.contains(".avif") {
        Ok("image/avif")
    } else {
        Err(ERROR_COVER_NOT_IMAGE.to_string())
    }
}

fn content_length_to_i64(value: u64) -> Result<i64, String> {
    i64::try_from(value).map_err(|_| ERROR_DOWNLOAD_TOO_LARGE.to_string())
}

fn validate_downloaded_size(
    downloaded_bytes: i64,
    content_length: Option<i64>,
) -> Result<(), String> {
    if let Some(expected) = content_length {
        if downloaded_bytes != expected {
            return Err(ERROR_DOWNLOAD_INCOMPLETE.to_string());
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ExpectedDownloadFormat {
    Mobi,
    Epub,
    Zip,
}

impl ExpectedDownloadFormat {
    fn from_task_format(format: &str) -> Result<Self, String> {
        match format {
            "mobi" => Ok(Self::Mobi),
            "epub" => Ok(Self::Epub),
            "source_zip" => Ok(Self::Zip),
            _ => Err(ERROR_UNSUPPORTED_DOWNLOAD_FORMAT.to_string()),
        }
    }
}

fn assert_safe_final_download_url(url: &Url) -> Result<(), String> {
    assert_safe_authorized_url(url.as_str())?;
    let normalized_path = url.path().to_ascii_lowercase();
    let is_page_path = normalized_path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .any(|segment| {
            matches!(
                segment,
                "login" | "login.php" | "logout" | "logout.php" | "error" | "error.php" | "my.php"
            )
        });
    if is_page_path {
        return Err(ERROR_DOWNLOAD_URL_UNSAFE.to_string());
    }
    Ok(())
}

fn validate_download_content_type(
    headers: &HeaderMap,
    expected_format: ExpectedDownloadFormat,
) -> Result<(), String> {
    let Some(value) = headers.get(CONTENT_TYPE) else {
        return Ok(());
    };
    let content_type = value
        .to_str()
        .map_err(|_| ERROR_DOWNLOAD_NOT_FILE.to_string())?
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    if content_type.is_empty() {
        return Ok(());
    }
    if is_page_or_error_content_type(&content_type) {
        return Err(ERROR_DOWNLOAD_NOT_FILE.to_string());
    }
    if is_obviously_wrong_binary_content_type(&content_type, expected_format) {
        return Err(ERROR_DOWNLOAD_FORMAT_MISMATCH.to_string());
    }
    Ok(())
}

fn is_page_or_error_content_type(content_type: &str) -> bool {
    content_type.starts_with("text/")
        || matches!(
            content_type,
            "application/json"
                | "application/problem+json"
                | "application/xml"
                | "application/xhtml+xml"
                | "image/svg+xml"
        )
}

fn is_obviously_wrong_binary_content_type(
    content_type: &str,
    _expected_format: ExpectedDownloadFormat,
) -> bool {
    content_type.starts_with("image/")
        || content_type.starts_with("audio/")
        || content_type.starts_with("video/")
}

async fn validate_downloaded_file_format(
    path: &Path,
    expected_format: ExpectedDownloadFormat,
) -> Result<(), String> {
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|_| ERROR_DOWNLOAD_READ.to_string())?;
    let mut signature = [0_u8; 512];
    let read = file
        .read(&mut signature)
        .await
        .map_err(|_| ERROR_DOWNLOAD_READ.to_string())?;
    validate_download_signature(&signature[..read], expected_format)
}

fn validate_download_signature(
    signature: &[u8],
    expected_format: ExpectedDownloadFormat,
) -> Result<(), String> {
    if signature.is_empty() {
        return Err(ERROR_DOWNLOAD_INCOMPLETE.to_string());
    }
    let matches_format = match expected_format {
        ExpectedDownloadFormat::Mobi => has_mobi_magic(signature),
        ExpectedDownloadFormat::Epub | ExpectedDownloadFormat::Zip => has_zip_magic(signature),
    };
    if matches_format {
        Ok(())
    } else if looks_like_error_page(signature) {
        Err(ERROR_DOWNLOAD_NOT_FILE.to_string())
    } else {
        Err(ERROR_DOWNLOAD_FORMAT_MISMATCH.to_string())
    }
}

fn has_zip_magic(signature: &[u8]) -> bool {
    signature.starts_with(b"PK\x03\x04")
        || signature.starts_with(b"PK\x05\x06")
        || signature.starts_with(b"PK\x07\x08")
}

fn has_mobi_magic(signature: &[u8]) -> bool {
    signature
        .get(60..68)
        .is_some_and(|magic| magic == b"BOOKMOBI" || magic == b"TEXtREAd")
}

fn looks_like_error_page(signature: &[u8]) -> bool {
    let prefix = String::from_utf8_lossy(&signature[..signature.len().min(256)]);
    let normalized = prefix.trim_start().to_ascii_lowercase();
    normalized.starts_with("<!doctype html")
        || normalized.starts_with("<html")
        || normalized.starts_with("<script")
        || normalized.starts_with("<?xml")
        || normalized.starts_with('{')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn request_gate_spaces_native_web_requests_without_network() {
        let client =
            KmoeHttpClient::new_with_min_request_interval(Duration::from_millis(25)).unwrap();
        let started_at = Instant::now();

        client.wait_for_request_slot().await;
        client.wait_for_request_slot().await;

        assert!(started_at.elapsed() >= Duration::from_millis(20));
    }

    #[test]
    fn remembered_session_cookie_header_round_trips_through_native_settings() {
        let conn = rusqlite::Connection::open_in_memory().expect("memory db opens");
        db::init_schema(&conn).expect("schema initializes");
        let jar = Jar::default();
        jar.add_cookie_str("kmoe_session=abc123; Path=/; HttpOnly", &kmoe_root_url());
        jar.add_cookie_str("keepalive=yes; Path=/; HttpOnly", &kmoe_root_url());

        persist_session_cookie_header_with_conn(&conn, &jar)
            .expect("session cookie header persists");
        let stored = db::get_setting(&conn, KMOE_SESSION_COOKIE_SETTING_KEY)
            .expect("setting reads")
            .expect("setting exists");
        assert!(stored.contains("kmoe_session=abc123"));
        assert!(stored.contains("keepalive=yes"));

        let restored = Jar::default();
        restore_persisted_session_cookie_header_with_conn(&conn, &restored)
            .expect("session cookie header restores");
        let restored_header =
            session_cookie_header_from_jar(&restored).expect("restored cookie header exists");
        assert!(restored_header.contains("kmoe_session=abc123"));
        assert!(restored_header.contains("keepalive=yes"));

        clear_persisted_session_cookie_header_with_conn(&conn).expect("session clears");
        assert!(db::get_setting(&conn, KMOE_SESSION_COOKIE_SETTING_KEY)
            .expect("setting reads")
            .is_none());
    }

    #[test]
    fn persisted_session_cookie_header_rejects_control_characters_and_attributes() {
        assert_eq!(
            sanitize_session_cookie_header("sid=abc; Path=/; HttpOnly; keepalive=yes"),
            Some("sid=abc; keepalive=yes".to_string())
        );
        assert!(sanitize_session_cookie_header("sid=abc\r\nset-cookie:evil=1").is_none());
        assert!(sanitize_session_cookie_header("Path=/; HttpOnly").is_none());
    }

    #[test]
    fn native_login_success_detection_matches_site_markers() {
        assert!(site_login_success(
            r#"parent.display_codeinfo( "m100", 0 );"#
        ));
        assert!(site_login_success(
            r#"do_call_action(); location.href='/';"#
        ));
        assert!(!site_login_success(
            r#"parent.display_codeinfo( "e400", 0 );"#
        ));
        assert!(!site_login_success("Forbidden"));
    }

    #[test]
    fn authorized_download_url_rejects_package_credentials_and_private_hosts() {
        assert!(assert_safe_authorized_url("https://kxo.moe/down/file.mobi").is_ok());
        assert!(assert_safe_authorized_url("https://download.kxo.moe/file.epub").is_ok());
        assert!(assert_safe_authorized_url("https://cdn.kmoe.moe/file.mobi").is_ok());
        assert!(assert_safe_authorized_url("https://dl.kmoe8.com/file.mobi").is_ok());
        assert!(assert_safe_authorized_url("http://cdn.example.com/file.mobi").is_err());
        assert!(assert_safe_authorized_url("https://user:pass@cdn.example.com/file.mobi").is_err());
        assert!(assert_safe_authorized_url("https://cdn.example.com/file.mobi").is_err());
        assert!(assert_safe_authorized_url("https://kxo.moe.evil.example/file.mobi").is_err());
        assert!(assert_safe_authorized_url("https://127.0.0.1/file.mobi").is_err());
        assert!(assert_safe_authorized_url("https://10.0.0.2/file.mobi").is_err());
        assert!(assert_safe_authorized_url("https://169.254.10.20/file.mobi").is_err());
        assert!(assert_safe_authorized_url("https://[::1]/file.mobi").is_err());
        assert!(assert_safe_authorized_url("https://download.local/file.mobi").is_err());
        let forbidden_authorize_path = format!("{}{}", "https://kxo.moe/", "getdownurl.php?b=1");
        assert!(assert_safe_authorized_url(&forbidden_authorize_path).is_err());
        assert!(assert_safe_authorized_url("https://kxo.moe/file.mobi?vip=9").is_err());
        assert!(assert_safe_authorized_url("https://kxo.moe/file.mobi?VIP=9").is_err());
        assert!(assert_safe_authorized_url("https://kxo.moe/file.mobi?batch=1").is_err());
        assert!(assert_safe_authorized_url("https://kxo.moe/file.mobi?Batch=1").is_err());
        assert!(assert_safe_authorized_url("https://kxo.moe/file.mobi?%62atch=1").is_err());
    }

    #[test]
    fn unsafe_authorized_download_url_errors_do_not_echo_the_url_or_host() {
        let error = assert_safe_authorized_url("https://kxo.moe.evil.example/file.mobi")
            .expect_err("untrusted host is rejected");

        assert_eq!(error, ERROR_DOWNLOAD_URL_UNSAFE);
        assert!(!error.contains("evil.example"));
        assert!(!error.contains("https://"));
    }

    #[test]
    fn cover_image_url_allows_site_cdn_and_rejects_unsafe_hosts() {
        assert!(assert_safe_cover_image_url(
            "https://kmimg.mxomo.com/cover/sigl/a.jpg!cover_l?sign=sample"
        )
        .is_ok());
        assert!(assert_safe_cover_image_url("https://kxo.moe/cover/a.jpg").is_ok());
        assert!(assert_safe_cover_image_url("http://kmimg.mxomo.com/cover/a.jpg").is_err());
        assert!(
            assert_safe_cover_image_url("https://user:pass@kmimg.mxomo.com/cover/a.jpg").is_err()
        );
        assert!(assert_safe_cover_image_url("https://kmimg.mxomo.com.evil/cover/a.jpg").is_err());
        assert!(assert_safe_cover_image_url("https://127.0.0.1/cover/a.jpg").is_err());
    }

    #[test]
    fn cover_image_mime_type_accepts_common_safe_images_only() {
        let mut headers = HeaderMap::new();
        let url = Url::parse("https://kmimg.mxomo.com/cover/a.jpg!cover_l?sign=sample").unwrap();

        headers.insert(CONTENT_TYPE, "image/jpeg; charset=binary".parse().unwrap());
        assert_eq!(cover_image_mime_type(&headers, &url).unwrap(), "image/jpeg");

        headers.insert(CONTENT_TYPE, "image/svg+xml".parse().unwrap());
        assert_eq!(
            cover_image_mime_type(&headers, &url).unwrap_err(),
            ERROR_COVER_NOT_IMAGE
        );

        headers.clear();
        assert_eq!(cover_image_mime_type(&headers, &url).unwrap(), "image/jpeg");
    }

    #[test]
    fn final_redirect_url_rejects_login_and_error_destinations() {
        assert!(assert_safe_final_download_url(
            &Url::parse("https://download.kxo.moe/down/file.epub").unwrap()
        )
        .is_ok());
        assert!(
            assert_safe_final_download_url(&Url::parse("https://kxo.moe/login.php").unwrap())
                .is_err()
        );
        assert!(assert_safe_final_download_url(
            &Url::parse("https://kxo.moe/error/download").unwrap()
        )
        .is_err());
    }

    #[test]
    fn download_content_type_rejects_login_and_error_pages() {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, "text/html; charset=utf-8".parse().unwrap());
        assert_eq!(
            validate_download_content_type(&headers, ExpectedDownloadFormat::Epub).unwrap_err(),
            ERROR_DOWNLOAD_NOT_FILE
        );

        headers.insert(CONTENT_TYPE, "application/json".parse().unwrap());
        assert_eq!(
            validate_download_content_type(&headers, ExpectedDownloadFormat::Mobi).unwrap_err(),
            ERROR_DOWNLOAD_NOT_FILE
        );

        headers.insert(CONTENT_TYPE, "application/octet-stream".parse().unwrap());
        assert!(validate_download_content_type(&headers, ExpectedDownloadFormat::Mobi).is_ok());
        headers.insert(CONTENT_TYPE, "application/epub+zip".parse().unwrap());
        assert!(validate_download_content_type(&headers, ExpectedDownloadFormat::Epub).is_ok());
    }

    #[test]
    fn download_signature_matches_expected_extension_format() {
        let mut mobi = vec![0_u8; 80];
        mobi[60..68].copy_from_slice(b"BOOKMOBI");
        assert!(validate_download_signature(&mobi, ExpectedDownloadFormat::Mobi).is_ok());
        assert!(
            validate_download_signature(b"PK\x03\x04epub", ExpectedDownloadFormat::Epub).is_ok()
        );
        assert!(validate_download_signature(b"PK\x03\x04zip", ExpectedDownloadFormat::Zip).is_ok());

        assert_eq!(
            validate_download_signature(b"PK\x03\x04zip", ExpectedDownloadFormat::Mobi)
                .unwrap_err(),
            ERROR_DOWNLOAD_FORMAT_MISMATCH
        );
        assert_eq!(
            validate_download_signature(
                b"<!doctype html><html></html>",
                ExpectedDownloadFormat::Epub
            )
            .unwrap_err(),
            ERROR_DOWNLOAD_NOT_FILE
        );
    }

    #[test]
    fn download_size_validation_rejects_content_length_mismatches() {
        assert!(validate_downloaded_size(2048, Some(2048)).is_ok());
        assert!(validate_downloaded_size(2048, None).is_ok());
        assert_eq!(
            validate_downloaded_size(1024, Some(2048)).expect_err("size mismatch is rejected"),
            ERROR_DOWNLOAD_INCOMPLETE
        );
        assert!(content_length_to_i64(i64::MAX as u64).is_ok());
        assert!(content_length_to_i64((i64::MAX as u64) + 1).is_err());
    }

    #[test]
    fn catalog_url_uses_site_search_parameter_for_keywords() {
        let url = build_catalog_url(CatalogQueryInput {
            keyword: Some(" 鬼滅之刃 ".to_string()),
            category: Some("魔幻".to_string()),
            status: Some("連載".to_string()),
            language: None,
            region: None,
            length: None,
            color: Some(true),
            hd: Some(false),
            sort: Some("sortpoint".to_string()),
            page: Some(2),
        });

        let pairs: Vec<(String, String)> = url
            .query_pairs()
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect();

        assert!(pairs.contains(&("s".to_string(), "鬼滅之刃".to_string())));
        assert!(!pairs.iter().any(|(key, _)| key == "k"));
        assert!(pairs.contains(&("end".to_string(), "連載".to_string())));
        assert!(pairs.contains(&("color".to_string(), "1".to_string())));
        assert!(pairs.contains(&("p".to_string(), "2".to_string())));
    }
}
