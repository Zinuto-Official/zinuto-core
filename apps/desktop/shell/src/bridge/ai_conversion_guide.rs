// SPDX-License-Identifier: GPL-3.0-only

use super::{bridge_command_error, BridgeCommandError};
use tauri::WebviewWindow;
use tauri_plugin_dialog::DialogExt;

const MAX_GUIDE_CONTENT_CHARS: usize = 65_536;
const GUIDE_FILE_NAME_PREFIX: &str = "zinuto-indicator-ai-guide-";
const GUIDE_FILE_NAME_SUFFIX: &str = ".txt";

pub(crate) const AI_CONVERSION_GUIDE_SAVE_RESULT_SAVED: &str = "SAVED";
pub(crate) const AI_CONVERSION_GUIDE_SAVE_RESULT_CANCELLED: &str = "CANCELLED";

fn guide_file_name(language: &str) -> Option<String> {
    match language {
        "en" | "zh-CN" | "ja" | "ko" | "es" => Some(format!(
            "{GUIDE_FILE_NAME_PREFIX}{language}{GUIDE_FILE_NAME_SUFFIX}"
        )),
        _ => None,
    }
}

fn is_valid_guide_content(content: &str) -> bool {
    !content.is_empty() && content.chars().count() <= MAX_GUIDE_CONTENT_CHARS
}

pub(crate) fn save_custom_indicator_ai_conversion_guide(
    window: WebviewWindow,
    language: String,
    content: String,
) -> Result<&'static str, BridgeCommandError> {
    let Some(file_name) = guide_file_name(&language) else {
        return Err(bridge_command_error("INVALID_PARAMS"));
    };
    if !is_valid_guide_content(&content) {
        return Err(bridge_command_error("INVALID_PARAMS"));
    }

    let Some(selected_path) = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_file_name(file_name)
        .add_filter("TXT", &["txt"])
        .blocking_save_file()
    else {
        return Ok(AI_CONVERSION_GUIDE_SAVE_RESULT_CANCELLED);
    };
    let path = selected_path
        .into_path()
        .map_err(|_| bridge_command_error("CUSTOM_INDICATOR_AI_GUIDE_SAVE_FAILED"))?;

    std::fs::write(path, content)
        .map_err(|_| bridge_command_error("CUSTOM_INDICATOR_AI_GUIDE_SAVE_FAILED"))?;
    Ok(AI_CONVERSION_GUIDE_SAVE_RESULT_SAVED)
}

#[cfg(test)]
mod tests {
    use super::{guide_file_name, is_valid_guide_content, MAX_GUIDE_CONTENT_CHARS};

    #[test]
    fn guide_file_name_only_accepts_supported_ui_languages() {
        assert_eq!(
            guide_file_name("zh-CN").as_deref(),
            Some("zinuto-indicator-ai-guide-zh-CN.txt")
        );
        assert_eq!(guide_file_name("fr"), None);
    }

    #[test]
    fn guide_content_requires_bounded_non_empty_text() {
        assert!(is_valid_guide_content("函数百科"));
        assert!(!is_valid_guide_content(""));
        assert!(!is_valid_guide_content(
            &"x".repeat(MAX_GUIDE_CONTENT_CHARS + 1)
        ));
    }
}
