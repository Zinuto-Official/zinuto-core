// SPDX-License-Identifier: GPL-3.0-only

use std::fs;
use std::path::PathBuf;

fn shell_path(relative: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(relative)
}

fn lines(source: &str) -> usize {
    source.trim_end().lines().count()
}

#[test]
fn hs_core_017_keeps_csv_file_ownership_below_ceiling_with_optional_metadata_seam() {
    let owner_path = shell_path("src/bridge/csv_folder_staging/files.rs");
    let owner = fs::read_to_string(&owner_path).expect("files.rs should be readable");
    assert!(
        lines(&owner) <= 1000,
        "files.rs has {} lines",
        lines(&owner)
    );
    assert!(owner.contains("mod optional_metadata;"));
    assert!(owner.contains("copy_optional_source_metadata_snapshot"));

    let seam_path = shell_path("src/bridge/csv_folder_staging/files/optional_metadata.rs");
    let seam = fs::read_to_string(&seam_path).expect("optional metadata seam should be readable");
    assert!(
        lines(&seam) <= 1000,
        "optional_metadata.rs has {} lines",
        lines(&seam)
    );
    assert!(seam.contains("pub(super) fn copy_optional_source_metadata_snapshot"));
    assert!(!seam.contains("mod files"));
}
