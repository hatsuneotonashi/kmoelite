use std::path::Path;

#[derive(Debug, PartialEq, Eq)]
pub(super) struct OpenCommandSpec {
    pub(super) program: String,
    pub(super) args: Vec<String>,
}

pub(super) fn open_command_spec(target: &Path, reveal: bool, os: &str) -> OpenCommandSpec {
    let target_text = target.to_string_lossy().to_string();
    match os {
        "macos" => {
            let args = if reveal {
                vec!["-R".to_string(), target_text]
            } else {
                vec![target_text]
            };
            OpenCommandSpec {
                program: "open".to_string(),
                args,
            }
        }
        "windows" => {
            if reveal {
                let arg = if target.is_file() {
                    format!("/select,{target_text}")
                } else {
                    target_text
                };
                OpenCommandSpec {
                    program: "explorer".to_string(),
                    args: vec![arg],
                }
            } else {
                OpenCommandSpec {
                    program: "cmd".to_string(),
                    args: vec![
                        "/C".to_string(),
                        "start".to_string(),
                        "".to_string(),
                        target_text,
                    ],
                }
            }
        }
        _ => {
            let target = if reveal && target.is_file() {
                target.parent().unwrap_or_else(|| Path::new("."))
            } else {
                target
            };
            OpenCommandSpec {
                program: "xdg-open".to_string(),
                args: vec![target.to_string_lossy().to_string()],
            }
        }
    }
}
