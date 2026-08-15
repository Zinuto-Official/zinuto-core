// SPDX-License-Identifier: GPL-3.0-only

use super::*;
use serde_json::json;

struct TestDirectory(PathBuf);

impl TestDirectory {
    fn new(label: &str) -> Self {
        let sequence = PARTIAL_DIRECTORY_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "zinuto-acquisition-native-test-{label}-{}-{sequence}",
            std::process::id()
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

fn prepare_job(
    root: &Path,
    job_id: &str,
    data_contents: &[u8],
    data_relative_path: &str,
) -> (PathBuf, String, String) {
    let job_dir = root.join("temp").join(STAGING_DIRECTORY_NAME).join(job_id);
    let payload_dir = job_dir.join(PAYLOAD_DIRECTORY_NAME);
    fs::create_dir_all(&payload_dir).expect("payload directory should be created");
    fs::write(payload_dir.join(data_relative_path), data_contents)
        .expect("data fixture should be written");
    let source_notice = b"source notice";
    fs::write(payload_dir.join("SOURCE.md"), source_notice)
        .expect("source notice should be written");
    let output_folder_name = format!(
        "Zinuto-Data-akshare-20260719-120000-{}",
        acquisition_job_token(job_id)
    );
    let total_bytes = data_contents.len() as u64 + source_notice.len() as u64;
    let manifest = json!({
        "schemaVersion": 1,
        "jobId": job_id,
        "connectorId": "akshare",
        "outputFolderName": output_folder_name,
        "createdAt": "2026-07-19T12:00:00Z",
        "request": {
            "market": "A_SHARE",
            "timeframe": "1d",
            "startAt": "2026-01-01",
            "endAt": "2026-07-19",
            "adjustment": "none",
            "exchangeId": null,
            "symbols": ["000001"]
        },
        "fileCount": 2,
        "totalBytes": total_bytes,
        "files": [
            {
                "relativePath": data_relative_path,
                "kind": "DATA",
                "bytes": data_contents.len(),
                "sha256": sha256_hex(data_contents)
            },
            {
                "relativePath": "SOURCE.md",
                "kind": "SOURCE_NOTICE",
                "bytes": source_notice.len(),
                "sha256": sha256_hex(source_notice)
            }
        ]
    });
    let raw_manifest = serde_json::to_vec(&manifest).expect("manifest should serialize");
    fs::write(job_dir.join(MANIFEST_FILE_NAME), &raw_manifest).expect("manifest should be written");
    (payload_dir, sha256_hex(&raw_manifest), output_folder_name)
}

#[test]
fn writable_folder_probe_cleans_up_after_itself() {
    let root = TestDirectory::new("write-probe");
    verify_acquisition_destination_is_writable(root.path())
        .expect("writable destination should pass the probe");
    assert_eq!(
        fs::read_dir(root.path())
            .expect("destination should remain readable")
            .count(),
        0
    );
}

#[test]
fn residue_sweep_deletes_only_exact_owned_name_and_type_pairs() {
    let root = TestDirectory::new("residue-sweep");
    let owned_partial = root
        .path()
        .join(".zinuto-acquisition-job-1234-1750000000000-1.partial");
    let legal_partial = root.path().join("project.partial");
    let vague_partial = root.path().join("anything.partial");
    let owned_probe = root
        .path()
        .join(".zinuto-acquisition-write-probe-123-1750000000000-2");
    let probe_as_directory = root
        .path()
        .join(".zinuto-acquisition-write-probe-123-1750000000000-3");
    let partial_as_file = root
        .path()
        .join(".zinuto-acquisition-job-1234-1750000000000-4.partial");

    for directory in [
        &owned_partial,
        &legal_partial,
        &vague_partial,
        &probe_as_directory,
    ] {
        fs::create_dir(directory).expect("create directory fixture");
        fs::write(directory.join("sentinel"), b"keep-or-owned").expect("write sentinel");
    }
    fs::write(&owned_probe, b"owned probe").expect("write probe fixture");
    fs::write(&partial_as_file, b"wrong type").expect("write wrong-type fixture");

    sweep_stale_acquisition_residue_in_destination(root.path(), |_| true);

    assert!(!owned_partial.exists());
    assert!(!owned_probe.exists());
    assert!(legal_partial.join("sentinel").is_file());
    assert!(vague_partial.join("sentinel").is_file());
    assert!(probe_as_directory.join("sentinel").is_file());
    assert_eq!(
        fs::read(partial_as_file).expect("wrong type survives"),
        b"wrong type"
    );
}

#[cfg(unix)]
#[test]
fn residue_sweep_never_follows_a_symlink() {
    let root = TestDirectory::new("residue-symlink");
    let target = root.path().join("target");
    let link = root
        .path()
        .join(".zinuto-acquisition-job-1234-1750000000000-1.partial");
    fs::create_dir(&target).expect("create target fixture");
    fs::write(target.join("sentinel"), b"keep").expect("write target sentinel");
    std::os::unix::fs::symlink(&target, &link).expect("create symlink fixture");

    sweep_stale_acquisition_residue_in_destination(root.path(), |_| true);

    assert!(fs::symlink_metadata(&link).is_ok());
    assert_eq!(
        fs::read(target.join("sentinel")).expect("target survives"),
        b"keep"
    );
}

fn rewrite_manifest(payload_dir: &Path, mutate: impl FnOnce(&mut serde_json::Value)) -> String {
    let manifest_path = payload_dir
        .parent()
        .expect("payload should have a job parent")
        .join(MANIFEST_FILE_NAME);
    let mut manifest: serde_json::Value = serde_json::from_slice(
        &fs::read(&manifest_path).expect("manifest fixture should be readable"),
    )
    .expect("manifest fixture should parse");
    mutate(&mut manifest);
    let raw = serde_json::to_vec(&manifest).expect("manifest fixture should serialize");
    fs::write(&manifest_path, &raw).expect("manifest fixture should be rewritten");
    sha256_hex(&raw)
}

#[test]
fn publishes_verified_output_with_an_atomic_final_directory() {
    let root = TestDirectory::new("publish");
    let destination = root.path().join("destination");
    fs::create_dir(&destination).expect("destination should be created");
    let job_id = "job-1234567890";
    let (_, manifest_hash, output_folder_name) =
        prepare_job(root.path(), job_id, b"datetime,open\n", "000001.csv");

    let published =
        publish_market_data_output(root.path(), &destination, job_id, &manifest_hash, |_path| {
            Ok(Some("bookmark-test".to_string()))
        })
        .expect("validated output should publish");

    assert_eq!(published.copied_files, 2);
    assert_eq!(
        published.source_folder_bookmark_id.as_deref(),
        Some("bookmark-test")
    );
    assert_eq!(
        published.final_path,
        fs::canonicalize(&destination)
            .expect("destination should canonicalize")
            .join(output_folder_name)
    );
    assert!(published.final_path.join("000001.csv").is_file());
    assert!(published.final_path.join("SOURCE.md").is_file());
    assert!(!fs::read_dir(&destination)
        .expect("destination should remain readable")
        .filter_map(Result::ok)
        .any(|entry| entry.file_name().to_string_lossy().ends_with(".partial")));
}

#[test]
fn rejects_manifest_path_traversal_before_publication() {
    let raw = serde_json::to_vec(&json!({
        "schemaVersion": 1,
        "jobId": "job-1234567890",
        "connectorId": "akshare",
        "outputFolderName": "Zinuto-Data-akshare-20260719-120000-job-1234",
        "createdAt": "2026-07-19T12:00:00Z",
        "request": {
            "market": "A_SHARE", "timeframe": "1d", "startAt": "2026-01-01",
            "endAt": "2026-07-19", "adjustment": "none", "exchangeId": null,
            "symbols": ["000001"]
        },
        "fileCount": 2,
        "totalBytes": 2,
        "files": [
            {"relativePath": "../escape.csv", "kind": "DATA", "bytes": 1, "sha256": "a".repeat(64)},
            {"relativePath": "SOURCE.md", "kind": "SOURCE_NOTICE", "bytes": 1, "sha256": "b".repeat(64)}
        ]
    }))
    .expect("manifest should serialize");
    assert_eq!(
        validate_manifest(&raw, "job-1234567890").err().as_deref(),
        Some("MARKET_DATA_ACQUISITION_MANIFEST_INVALID")
    );
}

#[test]
fn rejects_tampered_file_and_removes_partial_output() {
    let root = TestDirectory::new("tamper");
    let destination = root.path().join("destination");
    fs::create_dir(&destination).expect("destination should be created");
    let job_id = "job-2234567890";
    let (payload_dir, manifest_hash, output_folder_name) =
        prepare_job(root.path(), job_id, b"original", "000001.csv");
    fs::write(payload_dir.join("000001.csv"), b"tampered").expect("fixture should be tampered");

    let error =
        publish_market_data_output(root.path(), &destination, job_id, &manifest_hash, |_path| {
            Ok(None)
        })
        .err()
        .expect("tampered file should fail");
    assert_eq!(error, "MARKET_DATA_ACQUISITION_FILE_HASH_MISMATCH");
    assert!(!destination.join(output_folder_name).exists());
    assert_eq!(
        fs::read_dir(&destination)
            .expect("destination should remain readable")
            .count(),
        0
    );
}

#[test]
fn rejects_size_mismatch_and_removes_partial_output() {
    let root = TestDirectory::new("size-mismatch");
    let destination = root.path().join("destination");
    fs::create_dir(&destination).expect("destination should be created");
    let job_id = "job-6234567890";
    let (payload_dir, manifest_hash, output_folder_name) =
        prepare_job(root.path(), job_id, b"original", "000001.csv");
    fs::write(payload_dir.join("000001.csv"), b"short").expect("fixture should be shortened");

    assert_eq!(
        publish_market_data_output(root.path(), &destination, job_id, &manifest_hash, |_path| {
            Ok(None)
        },)
        .err()
        .as_deref(),
        Some("MARKET_DATA_ACQUISITION_FILE_SIZE_MISMATCH")
    );
    assert!(!destination.join(output_folder_name).exists());
    assert_eq!(
        fs::read_dir(&destination)
            .expect("destination should remain readable")
            .count(),
        0
    );
}

#[test]
fn rejects_manifest_file_count_mismatch() {
    let root = TestDirectory::new("count-mismatch");
    let destination = root.path().join("destination");
    fs::create_dir(&destination).expect("destination should be created");
    let job_id = "job-7234567890";
    let (payload_dir, _, _) = prepare_job(root.path(), job_id, b"valid", "000001.csv");
    let manifest_hash = rewrite_manifest(&payload_dir, |manifest| {
        manifest["fileCount"] = serde_json::Value::from(3);
    });

    assert_eq!(
        publish_market_data_output(root.path(), &destination, job_id, &manifest_hash, |_path| {
            Ok(None)
        },)
        .err()
        .as_deref(),
        Some("MARKET_DATA_ACQUISITION_MANIFEST_INVALID")
    );
    assert_eq!(
        fs::read_dir(&destination)
            .expect("destination should remain readable")
            .count(),
        0
    );
}

#[test]
fn rejects_an_unlisted_payload_file() {
    let root = TestDirectory::new("extra-entry");
    let destination = root.path().join("destination");
    fs::create_dir(&destination).expect("destination should be created");
    let job_id = "job-3234567890";
    let (payload_dir, manifest_hash, _) = prepare_job(root.path(), job_id, b"valid", "000001.csv");
    fs::write(payload_dir.join("extra.csv"), b"extra").expect("extra fixture should be written");

    assert_eq!(
        publish_market_data_output(root.path(), &destination, job_id, &manifest_hash, |_path| {
            Ok(None)
        },)
        .err()
        .as_deref(),
        Some("MARKET_DATA_ACQUISITION_STAGING_UNEXPECTED_ENTRY")
    );
}

#[cfg(unix)]
#[test]
fn rejects_symbolic_links_in_payload() {
    use std::os::unix::fs::symlink;

    let root = TestDirectory::new("symlink");
    let destination = root.path().join("destination");
    fs::create_dir(&destination).expect("destination should be created");
    let job_id = "job-4234567890";
    let (payload_dir, manifest_hash, _) = prepare_job(root.path(), job_id, b"valid", "000001.csv");
    fs::remove_file(payload_dir.join("000001.csv")).expect("fixture should be removed");
    let external = root.path().join("external.csv");
    fs::write(&external, b"valid").expect("external fixture should be written");
    symlink(&external, payload_dir.join("000001.csv")).expect("symlink should be created");

    assert_eq!(
        publish_market_data_output(root.path(), &destination, job_id, &manifest_hash, |_path| {
            Ok(None)
        },)
        .err()
        .as_deref(),
        Some("MARKET_DATA_ACQUISITION_STAGING_UNSAFE")
    );
}

#[test]
fn removes_final_directory_if_read_authorization_cannot_be_created() {
    let root = TestDirectory::new("bookmark-failure");
    let destination = root.path().join("destination");
    fs::create_dir(&destination).expect("destination should be created");
    let job_id = "job-5234567890";
    let (_, manifest_hash, output_folder_name) =
        prepare_job(root.path(), job_id, b"valid", "000001.csv");

    let error =
        publish_market_data_output(root.path(), &destination, job_id, &manifest_hash, |_path| {
            Err("READ_AUTH_FAILED".to_string())
        })
        .err()
        .expect("read authorization failure should fail publication");
    assert_eq!(error, "READ_AUTH_FAILED");
    assert!(!destination.join(output_folder_name).exists());
}

#[test]
fn never_overwrites_an_existing_final_directory() {
    let root = TestDirectory::new("collision");
    let destination = root.path().join("destination");
    fs::create_dir(&destination).expect("destination should be created");
    let job_id = "job-8234567890";
    let (_, manifest_hash, output_folder_name) =
        prepare_job(root.path(), job_id, b"valid", "000001.csv");
    let existing = destination.join(&output_folder_name);
    fs::create_dir(&existing).expect("existing output should be created");
    fs::write(existing.join("keep.txt"), b"keep")
        .expect("existing output marker should be written");

    assert_eq!(
        publish_market_data_output(root.path(), &destination, job_id, &manifest_hash, |_path| {
            Ok(None)
        },)
        .err()
        .as_deref(),
        Some("MARKET_DATA_ACQUISITION_OUTPUT_ALREADY_EXISTS")
    );
    assert_eq!(
        fs::read(existing.join("keep.txt")).expect("marker should remain"),
        b"keep"
    );
}

fn prepare_v3_job(
    root: &Path,
    job_id: &str,
    data_contents: &[u8],
    data_relative_path: &str,
    market_id: &str,
    symbols: &[&str],
) -> (PathBuf, String, String) {
    let job_dir = root.join("temp").join(STAGING_DIRECTORY_NAME).join(job_id);
    let payload_dir = job_dir.join(PAYLOAD_DIRECTORY_NAME);
    fs::create_dir_all(&payload_dir).expect("payload directory should be created");
    fs::write(payload_dir.join(data_relative_path), data_contents)
        .expect("data fixture should be written");
    let source_notice = b"source notice";
    fs::write(payload_dir.join("SOURCE.md"), source_notice)
        .expect("source notice should be written");
    let output_folder_name = format!(
        "Zinuto-Data-{market_id}-20260719-120000-{}",
        acquisition_job_token(job_id)
    );
    let total_bytes = data_contents.len() as u64 + source_notice.len() as u64;
    let attempts = json!([{
        "providerId": "akshare",
        "providerVersion": "akshare-1.17.51",
        "upstreamId": "eastmoney",
        "status": "SUCCEEDED",
        "errorCode": null
    }]);
    let source_results: Vec<serde_json::Value> = symbols
        .iter()
        .map(|symbol| {
            json!({
                "symbol": symbol,
                "sourceSymbol": symbol,
                "finalSource": attempts[0],
                "attempts": attempts
            })
        })
        .collect();
    let manifest = json!({
        "schemaVersion": 3,
        "jobId": job_id,
        "outputFolderName": output_folder_name,
        "createdAt": "2026-07-19T12:00:00Z",
        "request": {
            "marketId": market_id,
            "sourcePlanId": "CN_A_SHARE_SMART",
            "symbols": symbols,
            "timeframe": "1d",
            "startAt": "2026-01-01T00:00:00+08:00",
            "endAt": "2026-07-19T23:59:59+08:00",
            "adjustment": "none"
        },
        "timeZone": "Asia/Shanghai",
        "sourceResults": source_results,
        "fileCount": 2,
        "totalBytes": total_bytes,
        "files": [
            {
                "relativePath": data_relative_path,
                "kind": "DATA",
                "bytes": data_contents.len(),
                "sha256": sha256_hex(data_contents)
            },
            {
                "relativePath": "SOURCE.md",
                "kind": "SOURCE_NOTICE",
                "bytes": source_notice.len(),
                "sha256": sha256_hex(source_notice)
            }
        ]
    });
    let raw_manifest = serde_json::to_vec(&manifest).expect("manifest should serialize");
    fs::write(job_dir.join(MANIFEST_FILE_NAME), &raw_manifest).expect("manifest should be written");
    (payload_dir, sha256_hex(&raw_manifest), output_folder_name)
}

#[test]
fn publishes_verified_v3_market_output() {
    let root = TestDirectory::new("publish-v3");
    let destination = root.path().join("destination");
    fs::create_dir(&destination).expect("destination should be created");
    let job_id = "job-9234567890";
    let (_, manifest_hash, output_folder_name) = prepare_v3_job(
        root.path(),
        job_id,
        b"datetime,open\n",
        "000001.csv",
        "CN_A_SHARE",
        &["000001"],
    );

    let published =
        publish_market_data_output(root.path(), &destination, job_id, &manifest_hash, |_path| {
            Ok(Some("bookmark-v3".to_string()))
        })
        .expect("validated v3 output should publish");

    assert_eq!(published.copied_files, 2);
    assert_eq!(
        published.source_folder_bookmark_id.as_deref(),
        Some("bookmark-v3")
    );
    assert_eq!(
        published.final_path,
        fs::canonicalize(&destination)
            .expect("destination should canonicalize")
            .join(output_folder_name)
    );
    assert!(published.final_path.join("000001.csv").is_file());
    assert!(published.final_path.join("SOURCE.md").is_file());
}

#[test]
fn rejects_v3_manifest_with_unknown_fields() {
    let root = TestDirectory::new("v3-unknown");
    let job_id = "job-1334567890";
    let (payload_dir, _, _) = prepare_v3_job(
        root.path(),
        job_id,
        b"valid",
        "000001.csv",
        "CN_A_SHARE",
        &["000001"],
    );
    let manifest_hash = rewrite_manifest(&payload_dir, |manifest| {
        manifest["extraField"] = serde_json::Value::from("unexpected");
    });
    let destination = root.path().join("destination");
    fs::create_dir(&destination).expect("destination should be created");

    assert_eq!(
        publish_market_data_output(root.path(), &destination, job_id, &manifest_hash, |_path| {
            Ok(None)
        },)
        .err()
        .as_deref(),
        Some("MARKET_DATA_ACQUISITION_MANIFEST_INVALID")
    );
}

#[test]
fn rejects_v3_manifest_with_unsupported_schema_version() {
    let root = TestDirectory::new("v3-schema-version");
    let job_id = "job-1434567890";
    let (payload_dir, _, _) = prepare_v3_job(
        root.path(),
        job_id,
        b"valid",
        "000001.csv",
        "CN_A_SHARE",
        &["000001"],
    );
    let manifest_hash = rewrite_manifest(&payload_dir, |manifest| {
        manifest["schemaVersion"] = serde_json::Value::from(2);
    });
    let destination = root.path().join("destination");
    fs::create_dir(&destination).expect("destination should be created");

    assert_eq!(
        publish_market_data_output(root.path(), &destination, job_id, &manifest_hash, |_path| {
            Ok(None)
        },)
        .err()
        .as_deref(),
        Some("MARKET_DATA_ACQUISITION_MANIFEST_INVALID")
    );
}

#[test]
fn rejects_v3_manifest_whose_output_folder_matches_a_different_market() {
    let root = TestDirectory::new("v3-folder-market");
    let job_id = "job-1534567890";
    let (payload_dir, _, _) = prepare_v3_job(
        root.path(),
        job_id,
        b"valid",
        "000001.csv",
        "CN_A_SHARE",
        &["000001"],
    );
    let manifest_hash = rewrite_manifest(&payload_dir, |manifest| {
        manifest["outputFolderName"] = serde_json::Value::from(format!(
            "Zinuto-Data-HK_STOCKS-20260719-120000-{}",
            acquisition_job_token(job_id)
        ));
    });
    let destination = root.path().join("destination");
    fs::create_dir(&destination).expect("destination should be created");

    assert_eq!(
        publish_market_data_output(root.path(), &destination, job_id, &manifest_hash, |_path| {
            Ok(None)
        },)
        .err()
        .as_deref(),
        Some("MARKET_DATA_ACQUISITION_MANIFEST_INVALID")
    );
}

#[test]
fn rejects_v3_manifest_with_a_failed_final_source() {
    let root = TestDirectory::new("v3-failed-source");
    let job_id = "job-1634567890";
    let (payload_dir, _, _) = prepare_v3_job(
        root.path(),
        job_id,
        b"valid",
        "000001.csv",
        "CN_A_SHARE",
        &["000001"],
    );
    let manifest_hash = rewrite_manifest(&payload_dir, |manifest| {
        manifest["sourceResults"][0]["finalSource"]["status"] = serde_json::Value::from("FAILED");
        manifest["sourceResults"][0]["finalSource"]["errorCode"] =
            serde_json::Value::from("AKSHARE_UPSTREAM_FAILED");
    });
    let destination = root.path().join("destination");
    fs::create_dir(&destination).expect("destination should be created");

    assert_eq!(
        publish_market_data_output(root.path(), &destination, job_id, &manifest_hash, |_path| {
            Ok(None)
        },)
        .err()
        .as_deref(),
        Some("MARKET_DATA_ACQUISITION_MANIFEST_INVALID")
    );
}

#[test]
fn rejects_v3_manifest_whose_source_results_mismatch_the_symbols() {
    let root = TestDirectory::new("v3-symbol-mismatch");
    let job_id = "job-1734567890";
    let (payload_dir, _, _) = prepare_v3_job(
        root.path(),
        job_id,
        b"valid",
        "000001.csv",
        "CN_A_SHARE",
        &["000001"],
    );
    let manifest_hash = rewrite_manifest(&payload_dir, |manifest| {
        manifest["request"]["symbols"][0] = serde_json::Value::from("000002");
    });
    let destination = root.path().join("destination");
    fs::create_dir(&destination).expect("destination should be created");

    assert_eq!(
        publish_market_data_output(root.path(), &destination, job_id, &manifest_hash, |_path| {
            Ok(None)
        },)
        .err()
        .as_deref(),
        Some("MARKET_DATA_ACQUISITION_MANIFEST_INVALID")
    );
}

#[test]
fn rejects_tampered_v3_file_and_removes_partial_output() {
    let root = TestDirectory::new("v3-tamper");
    let destination = root.path().join("destination");
    fs::create_dir(&destination).expect("destination should be created");
    let job_id = "job-1834567890";
    let (payload_dir, manifest_hash, output_folder_name) = prepare_v3_job(
        root.path(),
        job_id,
        b"original",
        "000001.csv",
        "CN_A_SHARE",
        &["000001"],
    );
    fs::write(payload_dir.join("000001.csv"), b"tampered").expect("fixture should be tampered");

    assert_eq!(
        publish_market_data_output(root.path(), &destination, job_id, &manifest_hash, |_path| {
            Ok(None)
        },)
        .err()
        .as_deref(),
        Some("MARKET_DATA_ACQUISITION_FILE_HASH_MISMATCH")
    );
    assert!(!destination.join(output_folder_name).exists());
    assert_eq!(
        fs::read_dir(&destination)
            .expect("destination should remain readable")
            .count(),
        0
    );
}
