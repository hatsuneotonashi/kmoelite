use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{self, Read, Seek, Write};
use std::path::{Component, Path, PathBuf};
use thiserror::Error;
use zip::ZipArchive;

pub const MAX_READER_ARCHIVE_PAGES: usize = 2_000;
pub const MAX_READER_ENTRY_UNCOMPRESSED_BYTES: u64 = 64 * 1024 * 1024;
pub const MAX_READER_ARCHIVE_UNCOMPRESSED_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const MAX_EPUB_TEXT_ENTRY_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Error)]
pub enum ReaderArchiveError {
    #[error("reader archive path cannot contain parent traversal")]
    UnsafeArchivePath,
    #[error("reader archive path must point to an existing file")]
    NotAFile,
    #[error("failed to open reader archive")]
    OpenArchive(#[source] io::Error),
    #[error("failed to read reader archive")]
    ReadArchive(#[source] zip::result::ZipError),
    #[error("reader archive contains an unsafe entry path")]
    UnsafeEntryPath { entry: String },
    #[error("reader archive does not contain supported image pages")]
    NoSupportedImages,
    #[error("reader archive contains too many pages ({count} > {max})")]
    TooManyPages { count: usize, max: usize },
    #[error("reader archive page is too large")]
    EntryTooLarge { entry: String, size: u64, max: u64 },
    #[error("reader archive is too large after extraction")]
    ArchiveTooLarge { size: u64, max: u64 },
    #[error("reader cache path exists but is not a directory")]
    CachePathIsFile,
    #[error("failed to clear reader cache directory")]
    ClearCacheDir(#[source] io::Error),
    #[error("failed to create reader cache directory")]
    CreateCacheDir(#[source] io::Error),
    #[error("failed to create reader page file")]
    CreatePageFile(#[source] io::Error),
    #[error("failed to write reader page file")]
    WritePageFile(#[source] io::Error),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderPageEntry {
    pub index: usize,
    pub archive_index: usize,
    pub name: String,
    pub normalized_path: String,
    pub extension: String,
    pub compressed_size: u64,
    pub uncompressed_size: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderArchiveManifest {
    pub file_name: String,
    pub page_count: usize,
    pub pages: Vec<ReaderPageEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderExtractedPage {
    pub entry: ReaderPageEntry,
    pub file_path: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderExtractedArchive {
    pub manifest: ReaderArchiveManifest,
    pub pages: Vec<ReaderExtractedPage>,
    pub total_size_bytes: u64,
}

pub fn enumerate_cbz_images<P>(archive_path: P) -> Result<ReaderArchiveManifest, ReaderArchiveError>
where
    P: AsRef<Path>,
{
    enumerate_zip_images(archive_path)
}

pub fn enumerate_zip_images<P>(archive_path: P) -> Result<ReaderArchiveManifest, ReaderArchiveError>
where
    P: AsRef<Path>,
{
    let archive_path = archive_path.as_ref();
    validate_archive_path(archive_path)?;

    let file = File::open(archive_path).map_err(ReaderArchiveError::OpenArchive)?;
    let mut archive = ZipArchive::new(file).map_err(ReaderArchiveError::ReadArchive)?;
    let mut pages = Vec::new();

    for archive_index in 0..archive.len() {
        let file = archive
            .by_index(archive_index)
            .map_err(ReaderArchiveError::ReadArchive)?;
        let raw_name = file.name().to_string();
        let Some(normalized_path) = normalize_archive_entry_path(&raw_name)? else {
            continue;
        };
        if !is_supported_image_path(&normalized_path) {
            continue;
        }
        if is_platform_metadata_path(&normalized_path) {
            continue;
        }

        pages.push(ReaderPageEntry {
            index: 0,
            archive_index,
            name: normalized_path
                .rsplit('/')
                .next()
                .unwrap_or(&normalized_path)
                .to_string(),
            extension: file_extension(&normalized_path).unwrap_or_default(),
            normalized_path,
            compressed_size: file.compressed_size(),
            uncompressed_size: file.size(),
        });
    }

    pages.sort_by(|left, right| natural_path_cmp(&left.normalized_path, &right.normalized_path));
    if is_epub_archive(archive_path) {
        pages = order_epub_pages_by_spine(&mut archive, pages);
    }
    for (index, page) in pages.iter_mut().enumerate() {
        page.index = index;
    }

    if pages.is_empty() {
        return Err(ReaderArchiveError::NoSupportedImages);
    }
    enforce_reader_page_limits(&pages)?;

    Ok(ReaderArchiveManifest {
        file_name: archive_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("comic.cbz")
            .to_string(),
        page_count: pages.len(),
        pages,
    })
}

pub fn extract_cbz_images_to_dir<P, Q>(
    archive_path: P,
    cache_dir: Q,
) -> Result<ReaderExtractedArchive, ReaderArchiveError>
where
    P: AsRef<Path>,
    Q: AsRef<Path>,
{
    let archive_path = archive_path.as_ref();
    let cache_dir = cache_dir.as_ref();
    let manifest = enumerate_cbz_images(archive_path)?;
    reset_cache_dir(cache_dir)?;

    let file = File::open(archive_path).map_err(ReaderArchiveError::OpenArchive)?;
    let mut archive = ZipArchive::new(file).map_err(ReaderArchiveError::ReadArchive)?;
    let mut extracted_pages = Vec::new();
    let mut total_size_bytes = 0_u64;

    for page in &manifest.pages {
        let mut source = archive
            .by_index(page.archive_index)
            .map_err(ReaderArchiveError::ReadArchive)?;
        let raw_name = source.name().to_string();
        let normalized_path = normalize_archive_entry_path(&raw_name)?.ok_or_else(|| {
            ReaderArchiveError::UnsafeEntryPath {
                entry: raw_name.clone(),
            }
        })?;
        if normalized_path != page.normalized_path {
            return Err(ReaderArchiveError::UnsafeEntryPath { entry: raw_name });
        }

        let file_path = cache_dir.join(extracted_page_filename(page));
        let mut output = File::create(&file_path).map_err(ReaderArchiveError::CreatePageFile)?;
        let size_bytes = match copy_archive_entry_with_limit(&mut source, &mut output, page) {
            Ok(size_bytes) => size_bytes,
            Err(error) => {
                let _ = fs::remove_file(&file_path);
                return Err(error);
            }
        };
        if let Err(error) = output.flush() {
            let _ = fs::remove_file(&file_path);
            return Err(ReaderArchiveError::WritePageFile(error));
        }
        let size_bytes = output
            .metadata()
            .map(|metadata| metadata.len())
            .unwrap_or(size_bytes);
        total_size_bytes = total_size_bytes.saturating_add(size_bytes);
        if total_size_bytes > MAX_READER_ARCHIVE_UNCOMPRESSED_BYTES {
            let _ = fs::remove_file(&file_path);
            return Err(ReaderArchiveError::ArchiveTooLarge {
                size: total_size_bytes,
                max: MAX_READER_ARCHIVE_UNCOMPRESSED_BYTES,
            });
        }
        extracted_pages.push(ReaderExtractedPage {
            entry: page.clone(),
            file_path: file_path.to_string_lossy().to_string(),
            size_bytes,
        });
    }

    Ok(ReaderExtractedArchive {
        manifest,
        pages: extracted_pages,
        total_size_bytes,
    })
}

#[derive(Debug, Clone)]
struct EpubManifestItem {
    href: String,
    media_type: String,
}

fn order_epub_pages_by_spine<R>(
    archive: &mut ZipArchive<R>,
    pages: Vec<ReaderPageEntry>,
) -> Vec<ReaderPageEntry>
where
    R: Read + Seek,
{
    if pages.len() <= 1 {
        return pages;
    }

    let Some(rootfile_path) = find_epub_rootfile_path(archive) else {
        return pages;
    };
    let Some(opf) = read_zip_text_entry(archive, &rootfile_path, MAX_EPUB_TEXT_ENTRY_BYTES) else {
        return pages;
    };

    let manifest = parse_epub_manifest(&opf);
    if manifest.is_empty() {
        return pages;
    }
    let spine = parse_epub_spine(&opf);
    if spine.is_empty() {
        return pages;
    }

    let page_lookup = build_page_lookup(&pages);
    let opf_base_dir = archive_parent_dir(&rootfile_path);
    let mut ordered = Vec::new();
    let mut seen = HashSet::new();

    for idref in spine {
        let Some(item) = manifest.get(&idref) else {
            continue;
        };
        let Some(item_path) = resolve_archive_href(&opf_base_dir, &item.href) else {
            continue;
        };
        if item.media_type.starts_with("image/") || is_supported_image_path(&item_path) {
            push_epub_page(&item_path, &page_lookup, &mut seen, &mut ordered);
            continue;
        }

        let Some(document) = read_zip_text_entry(archive, &item_path, MAX_EPUB_TEXT_ENTRY_BYTES)
        else {
            continue;
        };
        let document_base_dir = archive_parent_dir(&item_path);
        for href in extract_epub_image_hrefs(&document) {
            if let Some(image_path) = resolve_archive_href(&document_base_dir, &href) {
                push_epub_page(&image_path, &page_lookup, &mut seen, &mut ordered);
            }
        }
    }

    if ordered.is_empty() {
        return pages;
    }

    for page in pages {
        if seen.insert(page.normalized_path.clone()) {
            ordered.push(page);
        }
    }
    ordered
}

fn is_epub_archive(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("epub"))
        .unwrap_or(false)
}

fn find_epub_rootfile_path<R>(archive: &mut ZipArchive<R>) -> Option<String>
where
    R: Read + Seek,
{
    let container =
        read_zip_text_entry(archive, "META-INF/container.xml", MAX_EPUB_TEXT_ENTRY_BYTES)?;
    for tag in find_xml_tags(&container, "rootfile") {
        let value = extract_attr_value(tag, "full-path")?;
        let normalized = normalize_archive_entry_path(&decode_xml_entities(&value)).ok()??;
        return Some(normalized);
    }
    None
}

fn read_zip_text_entry<R>(archive: &mut ZipArchive<R>, path: &str, max_bytes: u64) -> Option<String>
where
    R: Read + Seek,
{
    let file = archive.by_name(path).ok()?;
    if file.size() > max_bytes {
        return None;
    }
    let mut buffer = Vec::new();
    file.take(max_bytes.saturating_add(1))
        .read_to_end(&mut buffer)
        .ok()?;
    if buffer.len() as u64 > max_bytes {
        return None;
    }
    String::from_utf8(buffer).ok()
}

fn parse_epub_manifest(opf: &str) -> HashMap<String, EpubManifestItem> {
    let mut manifest = HashMap::new();
    for tag in find_xml_tags(opf, "item") {
        let Some(id) = extract_attr_value(tag, "id") else {
            continue;
        };
        let Some(href) = extract_attr_value(tag, "href") else {
            continue;
        };
        let media_type = extract_attr_value(tag, "media-type").unwrap_or_default();
        manifest.insert(
            decode_xml_entities(&id),
            EpubManifestItem {
                href: decode_xml_entities(&href),
                media_type: decode_xml_entities(&media_type).to_ascii_lowercase(),
            },
        );
    }
    manifest
}

fn parse_epub_spine(opf: &str) -> Vec<String> {
    find_xml_tags(opf, "itemref")
        .into_iter()
        .filter_map(|tag| extract_attr_value(tag, "idref"))
        .map(|value| decode_xml_entities(&value))
        .collect()
}

fn extract_epub_image_hrefs(document: &str) -> Vec<String> {
    let mut hrefs = Vec::new();
    for tag in find_xml_tags(document, "img")
        .into_iter()
        .chain(find_xml_tags(document, "image"))
    {
        for attr in ["src", "href", "xlink:href"] {
            if let Some(value) = extract_attr_value(tag, attr) {
                hrefs.push(decode_xml_entities(&value));
            }
        }
    }
    hrefs
}

fn build_page_lookup(pages: &[ReaderPageEntry]) -> HashMap<String, ReaderPageEntry> {
    let mut lookup = HashMap::new();
    for page in pages {
        lookup.insert(page.normalized_path.clone(), page.clone());
        lookup.insert(page.normalized_path.to_ascii_lowercase(), page.clone());
    }
    lookup
}

fn push_epub_page(
    path: &str,
    lookup: &HashMap<String, ReaderPageEntry>,
    seen: &mut HashSet<String>,
    ordered: &mut Vec<ReaderPageEntry>,
) {
    let page = lookup
        .get(path)
        .or_else(|| lookup.get(&path.to_ascii_lowercase()));
    if let Some(page) = page {
        if seen.insert(page.normalized_path.clone()) {
            ordered.push(page.clone());
        }
    }
}

fn resolve_archive_href(base_dir: &str, href: &str) -> Option<String> {
    let href = decode_xml_entities(href);
    let href = percent_decode_path(href.split('#').next().unwrap_or("").trim());
    if href.is_empty()
        || href.starts_with("http:")
        || href.starts_with("https:")
        || href.starts_with("data:")
    {
        return None;
    }
    let raw_path = if href.starts_with('/') {
        href.trim_start_matches('/').to_string()
    } else if base_dir.is_empty() {
        href
    } else {
        format!("{base_dir}/{href}")
    };
    normalize_resolved_archive_path(&raw_path)
}

fn archive_parent_dir(path: &str) -> String {
    path.rsplit_once('/')
        .map(|(parent, _)| parent.to_string())
        .unwrap_or_default()
}

fn find_xml_tags<'a>(text: &'a str, tag_name: &str) -> Vec<&'a str> {
    let lower = text.to_ascii_lowercase();
    let needle = format!("<{}", tag_name.to_ascii_lowercase());
    let mut tags = Vec::new();
    let mut offset = 0;
    while let Some(position) = lower[offset..].find(&needle) {
        let start = offset + position;
        let after_name = start + needle.len();
        if lower
            .as_bytes()
            .get(after_name)
            .map(|byte| byte.is_ascii_whitespace() || matches!(*byte, b'/' | b'>'))
            .unwrap_or(false)
        {
            if let Some(end) = lower[after_name..].find('>') {
                tags.push(&text[start..after_name + end + 1]);
                offset = after_name + end + 1;
                continue;
            }
            break;
        }
        offset = after_name;
    }
    tags
}

fn extract_attr_value(tag: &str, attr: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let attr = attr.to_ascii_lowercase();
    let mut offset = 0;
    while let Some(position) = lower[offset..].find(&attr) {
        let start = offset + position;
        let before = start
            .checked_sub(1)
            .and_then(|index| lower.as_bytes().get(index));
        if before.map(|byte| is_xml_name_char(*byte)).unwrap_or(false) {
            offset = start + attr.len();
            continue;
        }
        let mut cursor = start + attr.len();
        while lower
            .as_bytes()
            .get(cursor)
            .map(|byte| byte.is_ascii_whitespace())
            .unwrap_or(false)
        {
            cursor += 1;
        }
        if lower.as_bytes().get(cursor) != Some(&b'=') {
            offset = start + attr.len();
            continue;
        }
        cursor += 1;
        while lower
            .as_bytes()
            .get(cursor)
            .map(|byte| byte.is_ascii_whitespace())
            .unwrap_or(false)
        {
            cursor += 1;
        }
        let quote = *tag.as_bytes().get(cursor)?;
        if quote != b'"' && quote != b'\'' {
            offset = start + attr.len();
            continue;
        }
        let value_start = cursor + 1;
        let value_end = tag.as_bytes()[value_start..]
            .iter()
            .position(|byte| *byte == quote)
            .map(|position| value_start + position)?;
        return Some(tag[value_start..value_end].to_string());
    }
    None
}

fn is_xml_name_char(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || matches!(byte, b':' | b'_' | b'-' | b'.')
}

fn decode_xml_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

fn percent_decode_path(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) =
                (hex_value(bytes[index + 1]), hex_value(bytes[index + 2]))
            {
                output.push(high * 16 + low);
                index += 3;
                continue;
            }
        }
        output.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&output).to_string()
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn normalize_resolved_archive_path(raw_name: &str) -> Option<String> {
    if raw_name.is_empty()
        || raw_name.ends_with('/')
        || raw_name.ends_with('\\')
        || raw_name.contains('\0')
        || raw_name.starts_with('/')
        || raw_name.starts_with('\\')
    {
        return None;
    }

    let unified = raw_name.replace('\\', "/");
    if has_windows_drive_prefix(&unified) {
        return None;
    }

    let mut parts = Vec::new();
    for part in unified.split('/') {
        match part {
            "" | "." => continue,
            ".." => {
                parts.pop()?;
            }
            value => parts.push(value),
        }
    }
    if parts.is_empty() {
        return None;
    }
    Some(parts.join("/"))
}

fn enforce_reader_page_limits(pages: &[ReaderPageEntry]) -> Result<(), ReaderArchiveError> {
    if pages.len() > MAX_READER_ARCHIVE_PAGES {
        return Err(ReaderArchiveError::TooManyPages {
            count: pages.len(),
            max: MAX_READER_ARCHIVE_PAGES,
        });
    }

    let mut total_size = 0_u64;
    for page in pages {
        if page.uncompressed_size > MAX_READER_ENTRY_UNCOMPRESSED_BYTES {
            return Err(ReaderArchiveError::EntryTooLarge {
                entry: page.normalized_path.clone(),
                size: page.uncompressed_size,
                max: MAX_READER_ENTRY_UNCOMPRESSED_BYTES,
            });
        }
        total_size = total_size.saturating_add(page.uncompressed_size);
        if total_size > MAX_READER_ARCHIVE_UNCOMPRESSED_BYTES {
            return Err(ReaderArchiveError::ArchiveTooLarge {
                size: total_size,
                max: MAX_READER_ARCHIVE_UNCOMPRESSED_BYTES,
            });
        }
    }
    Ok(())
}

fn copy_archive_entry_with_limit<R, W>(
    source: &mut R,
    output: &mut W,
    page: &ReaderPageEntry,
) -> Result<u64, ReaderArchiveError>
where
    R: Read,
    W: Write,
{
    copy_archive_entry_with_page_limit(source, output, page, MAX_READER_ENTRY_UNCOMPRESSED_BYTES)
}

fn copy_archive_entry_with_page_limit<R, W>(
    source: &mut R,
    output: &mut W,
    page: &ReaderPageEntry,
    max: u64,
) -> Result<u64, ReaderArchiveError>
where
    R: Read,
    W: Write,
{
    let copied = io::copy(&mut source.take(max.saturating_add(1)), output)
        .map_err(ReaderArchiveError::WritePageFile)?;
    if copied > max {
        return Err(ReaderArchiveError::EntryTooLarge {
            entry: page.normalized_path.clone(),
            size: copied,
            max,
        });
    }
    Ok(copied)
}

fn reset_cache_dir(cache_dir: &Path) -> Result<(), ReaderArchiveError> {
    if cache_dir.exists() {
        if !cache_dir.is_dir() {
            return Err(ReaderArchiveError::CachePathIsFile);
        }
        fs::remove_dir_all(cache_dir).map_err(ReaderArchiveError::ClearCacheDir)?;
    }
    fs::create_dir_all(cache_dir).map_err(ReaderArchiveError::CreateCacheDir)
}

fn extracted_page_filename(page: &ReaderPageEntry) -> PathBuf {
    let extension = if page.extension.is_empty() {
        "jpg"
    } else {
        page.extension.as_str()
    };
    PathBuf::from(format!("{:05}.{extension}", page.index + 1))
}

fn validate_archive_path(path: &Path) -> Result<(), ReaderArchiveError> {
    if path
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(ReaderArchiveError::UnsafeArchivePath);
    }
    if !path.is_file() {
        return Err(ReaderArchiveError::NotAFile);
    }
    Ok(())
}

fn normalize_archive_entry_path(raw_name: &str) -> Result<Option<String>, ReaderArchiveError> {
    if raw_name.is_empty() || raw_name.ends_with('/') || raw_name.ends_with('\\') {
        return Ok(None);
    }
    if raw_name.contains('\0') || raw_name.starts_with('/') || raw_name.starts_with('\\') {
        return Err(ReaderArchiveError::UnsafeEntryPath {
            entry: raw_name.to_string(),
        });
    }

    let unified = raw_name.replace('\\', "/");
    if has_windows_drive_prefix(&unified) {
        return Err(ReaderArchiveError::UnsafeEntryPath {
            entry: raw_name.to_string(),
        });
    }

    let mut parts = Vec::new();
    for part in unified.split('/') {
        match part {
            "" | "." => continue,
            ".." => {
                return Err(ReaderArchiveError::UnsafeEntryPath {
                    entry: raw_name.to_string(),
                })
            }
            value => parts.push(value),
        }
    }

    if parts.is_empty() {
        return Ok(None);
    }
    Ok(Some(parts.join("/")))
}

fn has_windows_drive_prefix(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() >= 2 && bytes[1] == b':' && bytes[0].is_ascii_alphabetic()
}

fn is_platform_metadata_path(path: &str) -> bool {
    path == ".DS_Store"
        || path.starts_with("__MACOSX/")
        || path
            .rsplit('/')
            .next()
            .map(|name| name.starts_with("._"))
            .unwrap_or(false)
}

fn is_supported_image_path(path: &str) -> bool {
    matches!(
        file_extension(path).as_deref(),
        Some("jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp" | "avif")
    )
}

fn file_extension(path: &str) -> Option<String> {
    Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
}

fn natural_path_cmp(left: &str, right: &str) -> Ordering {
    let mut left_iter = NaturalTokens::new(left);
    let mut right_iter = NaturalTokens::new(right);

    loop {
        match (left_iter.next(), right_iter.next()) {
            (Some(NaturalToken::Number(left_number)), Some(NaturalToken::Number(right_number))) => {
                let ordering = compare_numeric_tokens(left_number, right_number);
                if ordering != Ordering::Equal {
                    return ordering;
                }
            }
            (Some(NaturalToken::Text(left_text)), Some(NaturalToken::Text(right_text))) => {
                let ordering = left_text
                    .to_ascii_lowercase()
                    .cmp(&right_text.to_ascii_lowercase());
                if ordering != Ordering::Equal {
                    return ordering;
                }
            }
            (Some(NaturalToken::Number(_)), Some(NaturalToken::Text(_))) => return Ordering::Less,
            (Some(NaturalToken::Text(_)), Some(NaturalToken::Number(_))) => {
                return Ordering::Greater
            }
            (Some(_), None) => return Ordering::Greater,
            (None, Some(_)) => return Ordering::Less,
            (None, None) => return left.cmp(right),
        }
    }
}

fn compare_numeric_tokens(left: &str, right: &str) -> Ordering {
    let left_trimmed = left.trim_start_matches('0');
    let right_trimmed = right.trim_start_matches('0');
    let left_normalized = if left_trimmed.is_empty() {
        "0"
    } else {
        left_trimmed
    };
    let right_normalized = if right_trimmed.is_empty() {
        "0"
    } else {
        right_trimmed
    };

    left_normalized
        .len()
        .cmp(&right_normalized.len())
        .then_with(|| left_normalized.cmp(right_normalized))
        .then_with(|| left.len().cmp(&right.len()))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NaturalToken<'a> {
    Text(&'a str),
    Number(&'a str),
}

struct NaturalTokens<'a> {
    input: &'a str,
    offset: usize,
}

impl<'a> NaturalTokens<'a> {
    fn new(input: &'a str) -> Self {
        Self { input, offset: 0 }
    }
}

impl<'a> Iterator for NaturalTokens<'a> {
    type Item = NaturalToken<'a>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.offset >= self.input.len() {
            return None;
        }

        let start = self.offset;
        let first = self.input[start..].chars().next()?;
        let want_digit = first.is_ascii_digit();
        self.offset += first.len_utf8();

        while self.offset < self.input.len() {
            let next = self.input[self.offset..].chars().next()?;
            if next.is_ascii_digit() != want_digit {
                break;
            }
            self.offset += next.len_utf8();
        }

        let token = &self.input[start..self.offset];
        if want_digit {
            Some(NaturalToken::Number(token))
        } else {
            Some(NaturalToken::Text(token))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::path::PathBuf;
    use zip::write::SimpleFileOptions;

    #[test]
    fn enumerates_images_with_natural_order() {
        let path = temp_archive_path("natural.cbz");
        write_archive(
            &path,
            &[
                ("pages/page10.jpg", &[10][..]),
                ("pages/page2.JPG", &[2][..]),
                ("pages/page001.png", &[1][..]),
                ("pages/page3.webp", &[3][..]),
                ("pages/notes.txt", b"ignored"),
                ("__MACOSX/._page4.jpg", b"ignored"),
            ],
        );

        let manifest = enumerate_cbz_images(&path).expect("archive images enumerate");
        assert!(manifest.file_name.ends_with("natural.cbz"));
        assert_eq!(manifest.page_count, 4);
        assert_eq!(
            manifest
                .pages
                .iter()
                .map(|page| page.normalized_path.as_str())
                .collect::<Vec<_>>(),
            vec![
                "pages/page001.png",
                "pages/page2.JPG",
                "pages/page3.webp",
                "pages/page10.jpg"
            ]
        );
        assert_eq!(
            manifest
                .pages
                .iter()
                .map(|page| page.index)
                .collect::<Vec<_>>(),
            vec![0, 1, 2, 3]
        );
        assert_eq!(manifest.pages[1].extension, "jpg");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn extracts_images_to_cache_dir_with_stable_page_filenames() {
        let path = temp_archive_path("extract.cbz");
        let cache_dir = std::env::temp_dir().join(format!("kmoe-reader-cache-{}", timestamp()));
        std::fs::create_dir_all(&cache_dir).expect("cache dir creates");
        std::fs::write(cache_dir.join("stale.jpg"), b"stale").expect("stale file writes");
        write_archive(
            &path,
            &[
                ("pages/page10.jpg", &[10][..]),
                ("pages/page2.jpg", &[2][..]),
                ("pages/notes.txt", b"ignored"),
            ],
        );

        let extracted =
            extract_cbz_images_to_dir(&path, &cache_dir).expect("archive extracts to cache dir");

        assert_eq!(extracted.manifest.page_count, 2);
        assert_eq!(
            extracted
                .pages
                .iter()
                .map(|page| page.entry.normalized_path.as_str())
                .collect::<Vec<_>>(),
            vec!["pages/page2.jpg", "pages/page10.jpg"]
        );
        assert_eq!(
            extracted
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
        assert_eq!(std::fs::read(cache_dir.join("00001.jpg")).unwrap(), vec![2]);
        assert_eq!(
            std::fs::read(cache_dir.join("00002.jpg")).unwrap(),
            vec![10]
        );
        assert!(!cache_dir.join("stale.jpg").exists());
        assert_eq!(extracted.total_size_bytes, 2);

        let _ = std::fs::remove_file(path);
        let _ = std::fs::remove_dir_all(cache_dir);
    }

    #[test]
    fn enumerates_epub_images_by_spine_document_order_before_natural_name_order() {
        let path = temp_archive_path("spine-order.epub");
        write_archive(
            &path,
            &[
                (
                    "META-INF/container.xml",
                    br#"<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>"#,
                ),
                (
                    "OEBPS/content.opf",
                    br#"<package><manifest>
                        <item id="page-a" href="pages/page-a.xhtml" media-type="application/xhtml+xml"/>
                        <item id="page-b" href="pages/page-b.xhtml" media-type="application/xhtml+xml"/>
                        <item id="image-a" href="images/a-first.jpg" media-type="image/jpeg"/>
                        <item id="image-z" href="images/z-last.jpg" media-type="image/jpeg"/>
                    </manifest><spine>
                        <itemref idref="page-b"/>
                        <itemref idref="page-a"/>
                    </spine></package>"#,
                ),
                (
                    "OEBPS/pages/page-a.xhtml",
                    br#"<html><body><img src="../images/a-first.jpg"/></body></html>"#,
                ),
                (
                    "OEBPS/pages/page-b.xhtml",
                    br#"<html><body><img src="../images/z-last.jpg"/></body></html>"#,
                ),
                ("OEBPS/images/a-first.jpg", &[1][..]),
                ("OEBPS/images/z-last.jpg", &[2][..]),
            ],
        );

        let manifest = enumerate_cbz_images(&path).expect("epub images enumerate");

        assert_eq!(
            manifest
                .pages
                .iter()
                .map(|page| page.normalized_path.as_str())
                .collect::<Vec<_>>(),
            vec!["OEBPS/images/z-last.jpg", "OEBPS/images/a-first.jpg"]
        );
        assert_eq!(
            manifest
                .pages
                .iter()
                .map(|page| page.index)
                .collect::<Vec<_>>(),
            vec![0, 1]
        );

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn rejects_cache_path_that_is_a_file_before_extracting() {
        let path = temp_archive_path("cache-file.cbz");
        let cache_file =
            std::env::temp_dir().join(format!("kmoe-reader-cache-file-{}", timestamp()));
        write_archive(&path, &[("page1.jpg", &[1][..])]);
        std::fs::write(&cache_file, b"not a directory").expect("cache marker file writes");

        let error = extract_cbz_images_to_dir(&path, &cache_file)
            .expect_err("cache path files are rejected");
        assert!(matches!(error, ReaderArchiveError::CachePathIsFile));
        assert_eq!(std::fs::read(&cache_file).unwrap(), b"not a directory");

        let _ = std::fs::remove_file(path);
        let _ = std::fs::remove_file(cache_file);
    }

    #[test]
    fn rejects_archive_entry_traversal() {
        let path = temp_archive_path("traversal.cbz");
        write_archive(&path, &[("../evil.jpg", &[1][..])]);

        let error = enumerate_cbz_images(&path).expect_err("traversal is rejected");
        assert!(matches!(error, ReaderArchiveError::UnsafeEntryPath { .. }));

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn rejects_windows_drive_archive_entries() {
        let path = temp_archive_path("drive.cbz");
        write_archive(&path, &[("C:/Users/me/page.jpg", &[1][..])]);

        let error = enumerate_cbz_images(&path).expect_err("drive prefix is rejected");
        assert!(matches!(error, ReaderArchiveError::UnsafeEntryPath { .. }));

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn returns_error_when_no_supported_images_exist() {
        let path = temp_archive_path("empty.cbz");
        write_archive(&path, &[("notes/readme.txt", b"not an image")]);

        let error = enumerate_cbz_images(&path).expect_err("empty archive is rejected");
        assert!(matches!(error, ReaderArchiveError::NoSupportedImages));

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn rejects_archives_with_too_many_reader_pages() {
        let path = temp_archive_path("too-many-pages.cbz");
        let entries = (0..=MAX_READER_ARCHIVE_PAGES)
            .map(|index| (format!("pages/{index:05}.jpg"), vec![index as u8]))
            .collect::<Vec<_>>();
        let borrowed_entries = entries
            .iter()
            .map(|(name, content)| (name.as_str(), content.as_slice()))
            .collect::<Vec<_>>();
        write_archive(&path, &borrowed_entries);

        let error = enumerate_cbz_images(&path).expect_err("oversized page count is rejected");
        assert!(
            matches!(error, ReaderArchiveError::TooManyPages { count, max }
                if count == MAX_READER_ARCHIVE_PAGES + 1 && max == MAX_READER_ARCHIVE_PAGES
            )
        );

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn rejects_manifest_entries_that_exceed_reader_size_limits() {
        let error = enforce_reader_page_limits(&[manifest_page(
            0,
            MAX_READER_ENTRY_UNCOMPRESSED_BYTES + 1,
        )])
        .expect_err("single huge page is rejected");
        assert!(
            matches!(error, ReaderArchiveError::EntryTooLarge { size, max, .. }
                if size == MAX_READER_ENTRY_UNCOMPRESSED_BYTES + 1 && max == MAX_READER_ENTRY_UNCOMPRESSED_BYTES
            )
        );

        let pages = (0..65)
            .map(|index| manifest_page(index, MAX_READER_ENTRY_UNCOMPRESSED_BYTES))
            .collect::<Vec<_>>();
        let error =
            enforce_reader_page_limits(&pages).expect_err("huge extracted total is rejected");
        assert!(
            matches!(error, ReaderArchiveError::ArchiveTooLarge { size, max }
                if size > MAX_READER_ARCHIVE_UNCOMPRESSED_BYTES && max == MAX_READER_ARCHIVE_UNCOMPRESSED_BYTES
            )
        );
    }

    #[test]
    fn rejects_streamed_entries_that_exceed_reader_copy_limit() {
        let page = manifest_page(0, 4);
        let mut source = std::io::Cursor::new(vec![1, 2, 3, 4]);
        let mut output = Vec::new();

        let error = copy_archive_entry_with_page_limit(&mut source, &mut output, &page, 3)
            .expect_err("streamed entry cannot exceed copy limit");

        assert!(
            matches!(error, ReaderArchiveError::EntryTooLarge { size, max, .. }
                if size == 4 && max == 3
            )
        );
    }

    #[test]
    fn rejects_parent_traversal_in_archive_file_path() {
        let path = PathBuf::from("../comic.cbz");
        let error = enumerate_cbz_images(path).expect_err("input path traversal is rejected");
        assert!(matches!(error, ReaderArchiveError::UnsafeArchivePath));
    }

    fn write_archive(path: &Path, entries: &[(&str, &[u8])]) {
        let file = File::create(path).expect("archive file creates");
        let mut writer = zip::ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for (name, content) in entries {
            writer.start_file(name, options).expect("entry starts");
            writer.write_all(content).expect("entry writes");
        }
        writer.finish().expect("archive finishes");
    }

    fn temp_archive_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("kmoe-reader-{}-{name}", timestamp()))
    }

    fn manifest_page(index: usize, uncompressed_size: u64) -> ReaderPageEntry {
        ReaderPageEntry {
            index,
            archive_index: index,
            name: format!("{index:05}.jpg"),
            normalized_path: format!("pages/{index:05}.jpg"),
            extension: "jpg".to_string(),
            compressed_size: 1,
            uncompressed_size,
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
