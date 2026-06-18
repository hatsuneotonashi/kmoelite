use std::path::{Path, PathBuf};

pub const APP_IDENTIFIER: &str = "moe.kzo.client";

pub fn app_data_dir() -> PathBuf {
    if let Ok(path) = std::env::var("KMOE_CLIENT_APP_DATA_DIR") {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(expand_user_path(trimmed));
        }
    }

    platform_app_data_dir().join(APP_IDENTIFIER)
}

pub fn default_download_dir() -> String {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    Path::new(&home)
        .join("Downloads")
        .join("Kmoe")
        .to_string_lossy()
        .to_string()
}

pub fn sanitize_filename(input: &str) -> String {
    let mut output = input
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            ch if ch.is_control() => '_',
            ch => ch,
        })
        .collect::<String>()
        .trim()
        .trim_end_matches('.')
        .to_string();
    if output.is_empty() {
        output = "untitled".to_string();
    }
    let truncated = output.chars().take(180).collect::<String>();
    let mut output = if truncated.trim().trim_end_matches('.').is_empty() {
        "untitled".to_string()
    } else {
        truncated
    };
    let stem = output
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    if is_windows_reserved_stem(&stem) {
        output = format!("_{output}");
    }
    output
}

pub fn normalize_user_path(input: &str) -> Result<PathBuf, String> {
    if input.trim().is_empty() {
        return Err("path is empty".to_string());
    }
    let path = PathBuf::from(expand_user_path(input.trim()));
    if path
        .components()
        .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return Err("path traversal is not allowed".to_string());
    }
    Ok(path)
}

pub fn normalize_download_dir(input: Option<String>) -> Result<String, String> {
    match input {
        Some(value) if !value.trim().is_empty() => {
            Ok(normalize_user_path(&value)?.to_string_lossy().to_string())
        }
        _ => Ok(default_download_dir()),
    }
}

pub fn ensure_download_dir(input: &str) -> Result<PathBuf, String> {
    let path = normalize_user_path(input)?;
    if path.exists() && !path.is_dir() {
        return Err("download path exists but is not a directory".to_string());
    }
    std::fs::create_dir_all(&path)
        .map_err(|error| format!("failed to create download directory: {error}"))?;
    Ok(path)
}

pub fn normalize_existing_path(input: &str) -> Result<PathBuf, String> {
    let path = normalize_user_path(input)?;
    if !path.exists() {
        return Err("path does not exist".to_string());
    }
    Ok(path)
}

pub fn normalize_existing_file(input: &str) -> Result<PathBuf, String> {
    let path = normalize_existing_path(input)?;
    if !path.is_file() {
        return Err("path is not a file".to_string());
    }
    Ok(path)
}

pub fn available_path(path: &Path) -> PathBuf {
    available_path_with_guard(path, |_| false)
}

pub fn available_download_paths(final_path: &Path, part_extension: &str) -> (PathBuf, PathBuf) {
    let final_path = available_path_with_guard(final_path, |candidate| {
        candidate.with_extension(part_extension).exists()
    });
    let part_path = final_path.with_extension(part_extension);
    (final_path, part_path)
}

fn expand_user_path(input: &str) -> String {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    if input == "~" {
        return home;
    }
    if let Some(rest) = input.strip_prefix("~/") {
        return Path::new(&home).join(rest).to_string_lossy().to_string();
    }
    if let Some(rest) = input.strip_prefix("%USERPROFILE%\\") {
        if !home.is_empty() {
            return Path::new(&home).join(rest).to_string_lossy().to_string();
        }
    }
    input.to_string()
}

fn platform_app_data_dir() -> PathBuf {
    platform_app_data_dir_for(
        std::env::consts::OS,
        home_dir(),
        std::env::var("APPDATA").ok().map(PathBuf::from),
        std::env::var("XDG_DATA_HOME").ok().map(PathBuf::from),
    )
}

fn platform_app_data_dir_for(
    os: &str,
    home: PathBuf,
    appdata: Option<PathBuf>,
    xdg_data_home: Option<PathBuf>,
) -> PathBuf {
    match os {
        "macos" | "ios" => home.join("Library").join("Application Support"),
        "android" => PathBuf::from("/data/data")
            .join(APP_IDENTIFIER)
            .join("files"),
        "windows" => appdata.unwrap_or_else(|| home.join("AppData").join("Roaming")),
        _ => xdg_data_home.unwrap_or_else(|| home.join(".local").join("share")),
    }
}

fn home_dir() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn available_path_with_guard<F>(path: &Path, guard: F) -> PathBuf
where
    F: Fn(&Path) -> bool,
{
    if !path.exists() && !guard(path) {
        return path.to_path_buf();
    }

    let parent = path.parent().unwrap_or_else(|| Path::new(""));
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("untitled");
    let extension = path.extension().and_then(|value| value.to_str());

    for suffix in 1..10_000 {
        let filename = match extension {
            Some(extension) if !extension.is_empty() => format!("{stem} ({suffix}).{extension}"),
            _ => format!("{stem} ({suffix})"),
        };
        let candidate = parent.join(filename);
        if !candidate.exists() && !guard(&candidate) {
            return candidate;
        }
    }

    path.to_path_buf()
}

fn is_windows_reserved_stem(stem: &str) -> bool {
    matches!(
        stem,
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn slash_path(path: &Path) -> String {
        path.to_string_lossy().replace('\\', "/")
    }

    #[test]
    fn sanitizes_windows_reserved_and_empty_names() {
        assert_eq!(sanitize_filename("CON.txt"), "_CON.txt");
        assert_eq!(sanitize_filename("nul"), "_nul");
        assert_eq!(sanitize_filename("..."), "untitled");
        assert_eq!(sanitize_filename("a/b:c*d?e"), "a_b_c_d_e");
    }

    #[test]
    fn expands_home_and_rejects_traversal() {
        let home = home_dir();
        let normalized = normalize_user_path("~/Downloads/Kmoe").expect("home path normalizes");
        assert!(normalized.starts_with(home));
        assert!(normalize_user_path("../secret").is_err());
    }

    #[test]
    fn app_data_dir_uses_platform_state_location() {
        if std::env::var("KMOE_CLIENT_APP_DATA_DIR").is_ok() {
            return;
        }
        let path = app_data_dir();
        assert!(path.ends_with(APP_IDENTIFIER));
        if cfg!(target_os = "macos") {
            assert!(path
                .to_string_lossy()
                .contains("Library/Application Support"));
        }
    }

    #[test]
    fn ios_app_data_dir_uses_private_application_support() {
        let home = PathBuf::from("/var/mobile/Containers/Data/Application/Example");
        let path = platform_app_data_dir_for("ios", home.clone(), None, None).join(APP_IDENTIFIER);

        assert_eq!(
            path,
            home.join("Library")
                .join("Application Support")
                .join(APP_IDENTIFIER)
        );
        assert!(
            !path.to_string_lossy().contains(".local/share"),
            "iOS app data must not use Linux-style fallback paths"
        );
    }

    #[test]
    fn android_app_data_dir_uses_private_files_root() {
        let path = platform_app_data_dir_for("android", PathBuf::from("."), None, None)
            .join(APP_IDENTIFIER);

        assert_eq!(
            path,
            PathBuf::from("/data/data")
                .join(APP_IDENTIFIER)
                .join("files")
                .join(APP_IDENTIFIER)
        );
        assert!(
            !path.to_string_lossy().contains(".local/share"),
            "Android app data must not use Linux-style fallback paths"
        );
        assert!(slash_path(&path).starts_with("/data/data/"));
        #[cfg(not(windows))]
        assert!(path.is_absolute());
    }

    #[test]
    fn validates_existing_paths_and_files() {
        let root = std::env::temp_dir().join(format!("kmoe-fs-{}", timestamp()));
        let file = root.join("marker.txt");
        std::fs::create_dir_all(&root).expect("temp dir creates");
        std::fs::write(&file, "marker").expect("file writes");

        assert_eq!(
            normalize_existing_path(file.to_str().unwrap()).unwrap(),
            file
        );
        assert_eq!(
            normalize_existing_file(file.to_str().unwrap()).unwrap(),
            file
        );
        assert!(normalize_existing_file(root.to_str().unwrap()).is_err());
        assert!(normalize_existing_path(root.join("missing.txt").to_str().unwrap()).is_err());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn ensure_download_dir_creates_directories_and_rejects_files() {
        let root = std::env::temp_dir().join(format!("kmoe-fs-download-dir-{}", timestamp()));
        let nested = root.join("Downloads").join("Kmoe");
        let ensured = ensure_download_dir(nested.to_str().unwrap()).expect("download dir creates");
        assert_eq!(ensured, nested);
        assert!(nested.is_dir());

        let file = root.join("not-a-directory");
        std::fs::write(&file, "marker").expect("marker writes");
        assert!(ensure_download_dir(file.to_str().unwrap())
            .expect_err("existing files cannot be download directories")
            .contains("not a directory"));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn picks_non_overwriting_paths_for_existing_final_or_part_files() {
        let root = std::env::temp_dir().join(format!("kmoe-fs-unique-{}", timestamp()));
        std::fs::create_dir_all(&root).expect("temp dir creates");
        let final_path = root.join("comic.mobi");
        let part_path = root.join("comic (1).mobi.part");
        std::fs::write(&final_path, "existing").expect("final writes");
        std::fs::write(&part_path, "partial").expect("part writes");

        assert_eq!(available_path(&final_path), root.join("comic (1).mobi"));
        let (next_final, next_part) = available_download_paths(&final_path, "mobi.part");
        assert_eq!(next_final, root.join("comic (2).mobi"));
        assert_eq!(next_part, root.join("comic (2).mobi.part"));

        let _ = std::fs::remove_dir_all(root);
    }

    fn timestamp() -> String {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos().to_string())
            .unwrap_or_else(|_| "0".to_string())
    }
}
