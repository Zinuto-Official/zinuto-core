// SPDX-License-Identifier: GPL-3.0-only

use std::{collections::HashMap, path::PathBuf};

use tauri::{AppHandle, DragDropEvent, Emitter};

const NATIVE_DRAG_DROP_EVENT: &str = "zinuto-native-drag-drop";
const NATIVE_DRAG_DROP_MAX_PATHS: usize = 5_000;
const NATIVE_DRAG_DROP_MAX_PATH_CHARS: usize = 4_096;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeDragDropPayload {
    event_type: String,
    paths: Vec<String>,
}

fn normalize_drag_drop_paths(paths: &[PathBuf]) -> Result<Vec<String>, String> {
    if paths.len() > NATIVE_DRAG_DROP_MAX_PATHS {
        return Err("NATIVE_DRAG_DROP_TOO_MANY_PATHS".to_string());
    }
    let mut normalized_paths = Vec::with_capacity(paths.len());
    for path in paths {
        // A path that is not valid UTF-8 must be rejected explicitly instead
        // of being lossily rewritten; leading/trailing whitespace is part of
        // the real file name and is preserved.
        let raw_path = path
            .clone()
            .into_os_string()
            .into_string()
            .map_err(|_| "NATIVE_DRAG_DROP_INVALID_PATH".to_string())?;
        if raw_path.is_empty() {
            continue;
        }
        if raw_path.chars().count() > NATIVE_DRAG_DROP_MAX_PATH_CHARS {
            return Err("NATIVE_DRAG_DROP_PATH_TOO_LONG".to_string());
        }
        normalized_paths.push(raw_path);
    }
    Ok(normalized_paths)
}

pub struct DragDropManager {
    latest_drag_paths_by_window: HashMap<String, Vec<String>>,
}

fn rejected_drag_paths(label: &str, error: String) -> Vec<String> {
    // Rejected drags clear any cached paths and report an empty payload
    // instead of silently emitting lossy or truncated paths.
    eprintln!("[zinuto] native drag-drop rejected for window={label}: {error}");
    Vec::new()
}

impl DragDropManager {
    pub fn new() -> Self {
        Self {
            latest_drag_paths_by_window: HashMap::new(),
        }
    }

    pub fn handle_event(&mut self, app: &AppHandle, label: String, drag_event: DragDropEvent) {
        match drag_event {
            DragDropEvent::Enter { paths, .. } => {
                let normalized_paths = match normalize_drag_drop_paths(paths.as_slice()) {
                    Ok(value) => value,
                    Err(error) => {
                        self.latest_drag_paths_by_window.remove(label.as_str());
                        rejected_drag_paths(label.as_str(), error)
                    }
                };
                if !normalized_paths.is_empty() {
                    self.latest_drag_paths_by_window
                        .insert(label.clone(), normalized_paths.clone());
                }
                let payload = NativeDragDropPayload {
                    event_type: "enter".to_string(),
                    paths: normalized_paths,
                };
                #[cfg(debug_assertions)]
                eprintln!(
                    "[zinuto] native drag-drop enter window={label}, paths={}",
                    payload.paths.len()
                );
                let _ = app.emit_to(label.as_str(), NATIVE_DRAG_DROP_EVENT, payload);
            }
            DragDropEvent::Over { .. } => {
                let payload = NativeDragDropPayload {
                    event_type: "over".to_string(),
                    paths: Vec::new(),
                };
                let _ = app.emit_to(label.as_str(), NATIVE_DRAG_DROP_EVENT, payload);
            }
            DragDropEvent::Drop { paths, .. } => {
                let mut normalized_paths = match normalize_drag_drop_paths(paths.as_slice()) {
                    Ok(value) => value,
                    Err(error) => {
                        self.latest_drag_paths_by_window.remove(label.as_str());
                        rejected_drag_paths(label.as_str(), error)
                    }
                };
                if normalized_paths.is_empty() {
                    if let Some(cached_paths) = self.latest_drag_paths_by_window.get(label.as_str())
                    {
                        normalized_paths = cached_paths.clone();
                    }
                } else {
                    self.latest_drag_paths_by_window
                        .insert(label.clone(), normalized_paths.clone());
                }
                let payload = NativeDragDropPayload {
                    event_type: "drop".to_string(),
                    paths: normalized_paths,
                };
                #[cfg(debug_assertions)]
                eprintln!(
                    "[zinuto] native drag-drop drop window={label}, paths={}",
                    payload.paths.len()
                );
                let _ = app.emit_to(label.as_str(), NATIVE_DRAG_DROP_EVENT, payload);
                self.latest_drag_paths_by_window.remove(label.as_str());
            }
            DragDropEvent::Leave => {
                self.latest_drag_paths_by_window.remove(label.as_str());
                let payload = NativeDragDropPayload {
                    event_type: "leave".to_string(),
                    paths: Vec::new(),
                };
                let _ = app.emit_to(label.as_str(), NATIVE_DRAG_DROP_EVENT, payload);
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_spaces_are_preserved_without_trimming() {
        let paths = vec![PathBuf::from(" /tmp/ leading-and-trailing .csv ")];
        assert_eq!(
            normalize_drag_drop_paths(&paths),
            Ok(vec![" /tmp/ leading-and-trailing .csv ".to_string()]),
        );
    }

    #[test]
    fn empty_paths_are_skipped() {
        let paths = vec![PathBuf::from("")];
        assert_eq!(normalize_drag_drop_paths(&paths), Ok(Vec::new()));
    }

    #[test]
    fn too_many_paths_is_an_explicit_error() {
        let paths: Vec<PathBuf> = (0..=NATIVE_DRAG_DROP_MAX_PATHS)
            .map(|index| PathBuf::from(format!("/tmp/{index}")))
            .collect();
        assert_eq!(
            normalize_drag_drop_paths(&paths),
            Err("NATIVE_DRAG_DROP_TOO_MANY_PATHS".to_string()),
        );
    }

    #[cfg(unix)]
    #[test]
    fn non_utf8_path_is_rejected_explicitly() {
        use std::ffi::OsString;
        use std::os::unix::ffi::OsStringExt;

        let paths = vec![PathBuf::from(OsString::from_vec(vec![
            b'/'.to_owned(),
            0xFF,
            0xFE,
            b'.'.to_owned(),
            b'c'.to_owned(),
            b's'.to_owned(),
            b'v'.to_owned(),
        ]))];
        assert_eq!(
            normalize_drag_drop_paths(&paths),
            Err("NATIVE_DRAG_DROP_INVALID_PATH".to_string()),
        );
    }
}
