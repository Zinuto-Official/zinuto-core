// SPDX-License-Identifier: GPL-3.0-only

use super::super::cancellation::CSV_FOLDER_STAGING_CANCELLED;
use super::*;
use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};

struct TestDirectory(PathBuf);

impl TestDirectory {
    fn new(label: &str) -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or(0);
        let path = std::env::temp_dir().join(format!(
            "zinuto-shell-test-{}-{}-{}",
            label,
            std::process::id(),
            unique
        ));
        fs::create_dir_all(&path).expect("test directory should be created");
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TestDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn import_entry(path: &Path, relative_path: &str) -> ImportFilePathEntry {
    let metadata = fs::metadata(path).expect("source metadata should exist");
    ImportFilePathEntry {
        relative_path: relative_path.to_string(),
        file_path: path.to_path_buf(),
        size: metadata.len(),
        modified: metadata.modified().ok(),
    }
}

struct CancelAfterFirstDigestRead<'a> {
    cancellation: &'a CsvFolderStagingCancellationToken,
    emitted: bool,
}

impl Read for CancelAfterFirstDigestRead<'_> {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        if self.emitted {
            return Ok(0);
        }
        self.emitted = true;
        buffer[..4].copy_from_slice(b"bars");
        self.cancellation.cancel();
        Ok(4)
    }
}

#[test]
fn cancellable_digest_stops_between_sha256_read_chunks() {
    let cancellation = CsvFolderStagingCancellationToken::default();
    let mut reader = CancelAfterFirstDigestRead {
        cancellation: &cancellation,
        emitted: false,
    };

    assert_eq!(
        build_reader_sha256(&mut reader, Some(&cancellation)),
        Err(CSV_FOLDER_STAGING_CANCELLED.to_string()),
    );
}

#[test]
fn cancellable_discovery_stops_before_processing_later_files() {
    let root = TestDirectory::new("cancel-discovery");
    fs::write(root.path().join("a.csv"), b"a").expect("first fixture should be written");
    fs::write(root.path().join("b.csv"), b"b").expect("second fixture should be written");
    fs::write(root.path().join("c.csv"), b"c").expect("third fixture should be written");
    let cancellation = CsvFolderStagingCancellationToken::default();
    let mut discovered_updates = 0_usize;

    let result = collect_supported_import_files_in_selected_folder_cancellable(
        root.path(),
        &cancellation,
        |_, _| {
            discovered_updates += 1;
            cancellation.cancel();
        },
    );

    assert_eq!(result.err(), Some(CSV_FOLDER_STAGING_CANCELLED.to_string()));
    assert_eq!(discovered_updates, 1);
}

#[test]
fn import_discovery_covers_all_four_supported_extensions() {
    let root = TestDirectory::new("four-formats");
    let nested = root.path().join("nested");
    fs::create_dir(&nested).expect("nested directory should be created");
    fs::write(root.path().join("daily.CSV"), b"csv").expect("csv should be written");
    fs::write(root.path().join("intraday.JSON"), b"json").expect("json should be written");
    fs::write(nested.join("book.XLSX"), b"xlsx").expect("xlsx should be written");
    fs::write(nested.join("bars.PARQUET"), b"parquet").expect("parquet should be written");
    fs::write(root.path().join("ignored.txt"), b"text")
        .expect("unsupported file should be written");

    let mut discovered_updates = Vec::new();
    let collected = collect_supported_import_files_in_selected_folder(
        root.path(),
        |file_count, total_bytes| discovered_updates.push((file_count, total_bytes)),
    )
    .expect("four supported files should be discovered");
    let relative_paths: Vec<&str> = collected
        .files
        .iter()
        .map(|file| file.relative_path.as_str())
        .collect();

    assert_eq!(
        relative_paths,
        vec![
            "daily.CSV",
            "intraday.JSON",
            "nested/bars.PARQUET",
            "nested/book.XLSX"
        ]
    );
    assert_eq!(collected.total_bytes, 3 + 4 + 7 + 4);
    assert_eq!(discovered_updates.len(), 4);

    let metadata = collect_supported_import_file_metadata_in_selected_folder(root.path())
        .expect("metadata discovery should use the same extension set");
    assert_eq!(metadata.total_files, 4);
    assert_eq!(metadata.total_bytes, collected.total_bytes);
    let original_name_by_relative_path: HashMap<String, String> = metadata
        .files
        .into_iter()
        .map(|file| (file.relative_path, file.originalname))
        .collect();
    assert_eq!(
        original_name_by_relative_path.get("nested/bars.PARQUET"),
        Some(&"bars.PARQUET".to_string())
    );
    assert_eq!(
        original_name_by_relative_path.get("nested/book.XLSX"),
        Some(&"book.XLSX".to_string())
    );
}

#[test]
fn import_discovery_preserves_supported_file_names_with_trailing_whitespace() {
    let root = TestDirectory::new("whitespace-extension");
    let file_name = "daily.csv ";
    fs::write(root.path().join(file_name), b"csv").expect("whitespace filename should be written");

    let collected = collect_supported_import_files_in_selected_folder(root.path(), |_, _| {})
        .expect("supported filename should be discovered without rewriting it");

    assert_eq!(collected.files.len(), 1);
    assert_eq!(collected.files[0].relative_path, file_name);
    assert_eq!(
        collected.files[0]
            .file_path
            .file_name()
            .and_then(|value| value.to_str()),
        Some(file_name),
    );
}

#[cfg(unix)]
#[test]
fn import_discovery_and_selection_preserve_literal_backslashes_on_posix() {
    let root = TestDirectory::new("literal-backslash");
    let file_name = "group\\daily.csv";
    fs::write(root.path().join(file_name), b"csv")
        .expect("literal-backslash filename should be written");

    let collected = collect_supported_import_files_in_selected_folder(root.path(), |_, _| {})
        .expect("literal-backslash filename should be discovered exactly");
    assert_eq!(collected.files.len(), 1);
    assert_eq!(collected.files[0].relative_path, file_name);

    assert_eq!(
        normalize_selected_import_relative_path(file_name),
        Some(file_name.to_string()),
    );
    let selected =
        collect_selected_import_files_in_selected_folder(root.path(), &[file_name.to_string()])
            .expect("literal-backslash relative path should resolve exactly");
    assert_eq!(selected.len(), 1);
    assert_eq!(selected[0].0, file_name);
    assert_eq!(
        selected[0].1,
        fs::canonicalize(root.path().join(file_name)).unwrap()
    );
}

#[test]
fn selected_relative_paths_preserve_legal_leading_and_trailing_spaces() {
    let root = TestDirectory::new("spaced-paths");
    let nested = root.path().join(" folder ");
    fs::create_dir(&nested).expect("spaced directory should be created");
    let relative_path = " folder / quote .CSV";
    fs::write(nested.join(" quote .CSV"), b"csv").expect("spaced file should be written");

    assert_eq!(
        normalize_selected_import_relative_path(relative_path),
        Some(relative_path.to_string())
    );
    let selected =
        collect_selected_import_files_in_selected_folder(root.path(), &[relative_path.to_string()])
            .expect("spaced relative path should resolve");
    assert_eq!(selected.len(), 1);
    assert_eq!(selected[0].0, relative_path);
    assert_eq!(selected[0].2.len(), 3);
    assert_eq!(
        normalize_selected_import_relative_path(" leading-and-trailing.csv "),
        Some(" leading-and-trailing.csv ".to_string())
    );

    assert_eq!(
        normalize_selected_import_relative_path("../escape.csv"),
        None
    );
    assert_eq!(normalize_selected_import_relative_path(""), None);
}

#[test]
fn staged_import_file_is_an_independent_snapshot() {
    let root = TestDirectory::new("snapshot");
    let source_path = root.path().join("source.csv");
    let target_path = root.path().join("target.csv");
    fs::write(&source_path, b"before").expect("source should be written");
    let source = import_entry(&source_path, "source.csv");

    let copied_bytes = copy_import_file_snapshot(&source, &target_path)
        .expect("source should be copied into staging");
    assert_eq!(copied_bytes, 6);

    fs::write(&source_path, b"after!").expect("source should remain independently writable");
    assert_eq!(
        fs::read(&target_path).expect("staged copy should remain readable"),
        b"before"
    );
}

#[test]
fn staged_import_file_preserves_the_source_modified_time() {
    let root = TestDirectory::new("snapshot-mtime");
    let source_path = root.path().join("source.parquet");
    let target_path = root.path().join("target.parquet");
    fs::write(&source_path, b"parquet-snapshot").expect("source should be written");
    let expected_modified = UNIX_EPOCH + std::time::Duration::from_secs(1_704_067_200);
    fs::OpenOptions::new()
        .write(true)
        .open(&source_path)
        .expect("source should open")
        .set_times(fs::FileTimes::new().set_modified(expected_modified))
        .expect("source modified time should be set");
    let source = import_entry(&source_path, "source.parquet");

    copy_import_file_snapshot(&source, &target_path).expect("source should be copied into staging");

    let source_modified = fs::metadata(&source_path)
        .and_then(|metadata| metadata.modified())
        .expect("source modified time should exist");
    let target_modified = fs::metadata(&target_path)
        .and_then(|metadata| metadata.modified())
        .expect("target modified time should exist");
    assert_eq!(target_modified, source_modified);
}

#[test]
fn staging_copy_rejects_a_source_changed_after_discovery() {
    let root = TestDirectory::new("changed-source");
    let source_path = root.path().join("source.json");
    let target_path = root.path().join("target.json");
    fs::write(&source_path, b"old").expect("source should be written");
    let source = import_entry(&source_path, "source.json");
    fs::write(&source_path, b"new-content").expect("source should change");

    assert_eq!(
        copy_import_file_snapshot(&source, &target_path),
        Err("CSV_STAGE_COPY_FAILED".to_string())
    );
    assert!(!target_path.exists());
}

#[test]
fn selective_digest_uses_one_verified_file_snapshot() {
    let root = TestDirectory::new("digest-snapshot");
    let source_path = root.path().join("source.json");
    fs::write(&source_path, b"before").expect("source should be written");
    let snapshot = open_import_file_snapshot(&source_path).expect("snapshot should exist");

    let digest = build_import_file_sha256(&source_path, &snapshot)
        .expect("stable source should be digested");
    assert_eq!(digest, format!("{:x}", Sha256::digest(b"before")),);

    fs::write(&source_path, b"after!!").expect("source should change");
    assert_eq!(
        build_import_file_sha256(&source_path, &snapshot),
        Err("CSV_FILE_IMPORT_FAILED".to_string()),
    );
}

#[test]
fn metadata_keeps_the_literal_relative_path_and_uses_only_its_leaf_as_original_name() {
    let long_relative_path = format!(
        "{}/final file.csv ",
        (1..=15)
            .map(|index| format!(" segment-{index:02} "))
            .collect::<Vec<_>>()
            .join("/")
    );
    assert_eq!(
        wire_relative_leaf_name(&long_relative_path),
        "final file.csv ",
    );
    assert_eq!(wire_relative_leaf_name("group\\west/AAPL.csv"), "AAPL.csv",);
    assert_eq!(
        wire_relative_leaf_name("group\\daily.csv"),
        "group\\daily.csv",
    );
}

#[test]
fn optional_source_metadata_is_copied_without_entering_import_discovery() {
    let source = TestDirectory::new("source-metadata-copy-source");
    let staging = TestDirectory::new("source-metadata-copy-staging");
    fs::write(source.path().join("bars.csv"), b"datetime,close\n").unwrap();
    fs::write(source.path().join("SOURCE.md"), b"# Acquisition source\n").unwrap();

    let discovered =
        collect_supported_import_files_in_selected_folder(source.path(), |_, _| {}).unwrap();
    assert_eq!(discovered.files.len(), 1);
    assert_eq!(discovered.total_bytes, 15);
    let metadata_manifest =
        collect_supported_import_file_metadata_in_selected_folder(source.path()).unwrap();
    assert_eq!(metadata_manifest.total_files, 1);
    assert_eq!(metadata_manifest.total_bytes, 15);

    copy_optional_source_metadata_snapshot(source.path(), staging.path());

    assert_eq!(
        fs::read(staging.path().join("SOURCE.md")).unwrap(),
        b"# Acquisition source\n"
    );
}

#[test]
fn oversized_optional_source_metadata_is_ignored() {
    let source = TestDirectory::new("source-metadata-oversized-source");
    let staging = TestDirectory::new("source-metadata-oversized-staging");
    fs::write(
        source.path().join("SOURCE.md"),
        vec![b'x'; OPTIONAL_SOURCE_METADATA_MAX_BYTES as usize + 1],
    )
    .unwrap();

    copy_optional_source_metadata_snapshot(source.path(), staging.path());

    assert!(!staging.path().join("SOURCE.md").exists());
}

#[cfg(unix)]
#[test]
fn symlinked_optional_source_metadata_is_ignored() {
    use std::os::unix::fs::symlink;

    let source = TestDirectory::new("source-metadata-symlink-source");
    let staging = TestDirectory::new("source-metadata-symlink-staging");
    let outside = source.path().join("outside.md");
    fs::write(&outside, b"must not be copied\n").unwrap();
    symlink(&outside, source.path().join("SOURCE.md")).unwrap();

    copy_optional_source_metadata_snapshot(source.path(), staging.path());

    assert!(!staging.path().join("SOURCE.md").exists());
}

#[test]
fn changed_optional_source_metadata_is_ignored() {
    let source = TestDirectory::new("source-metadata-changed-source");
    let staging = TestDirectory::new("source-metadata-changed-staging");
    let source_path = source.path().join("SOURCE.md");
    fs::write(&source_path, b"before\n").unwrap();
    let snapshot = discover_optional_source_metadata_snapshot(source.path()).unwrap();
    fs::write(&source_path, b"after and larger\n").unwrap();
    let target_path = staging.path().join("SOURCE.md");

    assert!(copy_optional_source_metadata_entry(&snapshot, &target_path).is_none());
    assert!(!target_path.exists());
}

#[test]
fn staging_directory_names_are_unique_across_rapid_creation() {
    let root = TestDirectory::new("unique-staging");
    let mut paths = HashSet::new();
    for _ in 0..64 {
        let path = create_csv_staging_dir(root.path())
            .expect("a unique staging directory should be created");
        assert!(paths.insert(path));
    }
    assert_eq!(paths.len(), 64);
}

#[test]
fn discovery_reports_missing_directories_and_files() {
    let root = TestDirectory::new("missing-errors");
    let missing_directory = root.path().join("missing-directory");
    let result = collect_supported_import_files_in_selected_folder(&missing_directory, |_, _| {});
    assert_eq!(result.err().as_deref(), Some("CSV_FILE_MISSING"));

    let missing_file = root.path().join("missing.csv");
    assert_eq!(
        read_regular_import_entry_metadata(&missing_file)
            .err()
            .as_deref(),
        Some("CSV_FILE_MISSING")
    );
}
