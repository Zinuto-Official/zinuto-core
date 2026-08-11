// SPDX-License-Identifier: GPL-3.0-only

use super::{
    IMPORT_MAX_BOOKMARK_ID_CHARS, IMPORT_MAX_DEPTH, IMPORT_MAX_FILES, IMPORT_MAX_FILE_NAME_CHARS,
    IMPORT_MAX_PATH_CHARS, IMPORT_MAX_RELATIVE_PATH_CHARS, IMPORT_MAX_SINGLE_FILE_BYTES,
    IMPORT_MAX_TOTAL_BYTES, NATIVE_BRIDGE_REQUEST_ID_MAX_CHARS,
};

const NATIVE_BRIDGE_CONTRACT: &str =
    include_str!("../../../../../../contracts/native-bridge/native-bridge.v1.json");

#[test]
fn import_limits_match_the_native_bridge_contract() {
    let contract: serde_json::Value =
        serde_json::from_str(NATIVE_BRIDGE_CONTRACT).expect("native bridge contract is JSON");
    let import = &contract["limits"]["import"];
    let strings = &contract["limits"]["stringChars"];

    assert_eq!(import["maxFiles"].as_u64(), Some(IMPORT_MAX_FILES as u64));
    assert_eq!(
        import["maxSingleFileBytes"].as_u64(),
        Some(IMPORT_MAX_SINGLE_FILE_BYTES)
    );
    assert_eq!(
        import["maxTotalBytes"].as_u64(),
        Some(IMPORT_MAX_TOTAL_BYTES)
    );
    assert_eq!(import["maxDepth"].as_u64(), Some(IMPORT_MAX_DEPTH as u64));
    assert_eq!(
        import["maxPathChars"].as_u64(),
        Some(IMPORT_MAX_PATH_CHARS as u64)
    );
    assert_eq!(
        import["maxRelativePathChars"].as_u64(),
        Some(IMPORT_MAX_RELATIVE_PATH_CHARS as u64)
    );
    assert_eq!(
        import["maxFileNameChars"].as_u64(),
        Some(IMPORT_MAX_FILE_NAME_CHARS as u64)
    );
    assert_eq!(
        import["maxSecurityBookmarkChars"].as_u64(),
        Some(IMPORT_MAX_BOOKMARK_ID_CHARS as u64)
    );
    assert_eq!(
        strings["requestId"].as_u64(),
        Some(NATIVE_BRIDGE_REQUEST_ID_MAX_CHARS as u64)
    );
}
