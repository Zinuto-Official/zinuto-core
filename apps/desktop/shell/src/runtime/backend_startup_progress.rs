// SPDX-License-Identifier: GPL-3.0-only

use std::fs;
use std::path::Path;

use serde::Deserialize;

const STARTUP_PROGRESS_SCHEMA_VERSION: u8 = 2;
const STARTUP_PROGRESS_MAX_BYTES: u64 = 16 * 1024;
const STARTUP_PROGRESS_FUTURE_TOLERANCE_MS: u64 = 5_000;
const MARKET_PROGRESS_STALE_AFTER_MS: u64 = 5_000;
const CORE_SCHEMA_UPGRADE_MAX_AGE_MS: u64 = 15 * 60 * 1_000;
const MARKET_SCHEMA_UPGRADE_MAX_AGE_MS: u64 = 24 * 60 * 60 * 1_000;
const RESET_RECOVERY_MAX_AGE_MS: u64 = 15 * 60 * 1_000;
const SEED_RECONCILE_MAX_AGE_MS: u64 = 15 * 60 * 1_000;
const RUNTIME_BOOTSTRAP_MAX_AGE_MS: u64 = 5 * 60 * 1_000;
pub(crate) const STARTUP_SCHEMA_UPGRADE_HARD_MAX_AGE_MS: u64 = MARKET_SCHEMA_UPGRADE_MAX_AGE_MS;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackendStartupProgressRecord {
    schema_version: u8,
    pid: u32,
    parent_pid: Option<u32>,
    runtime_build_id: String,
    stage: String,
    started_at_ms: u64,
    stage_started_at_ms: u64,
    updated_at_ms: u64,
}

#[derive(Clone)]
pub(crate) struct ActiveBackendStartupProgress {
    stage: String,
}

impl ActiveBackendStartupProgress {
    pub(crate) fn stage(&self) -> &str {
        self.stage.as_str()
    }
}

fn is_known_stage(stage: &str) -> bool {
    matches!(
        stage,
        "CORE_SCHEMA"
            | "MARKET_PROBING"
            | "MARKET_COPYING"
            | "MARKET_VALIDATING"
            | "MARKET_SWITCHING"
            | "RESET_RECOVERY"
            | "SEED_RECONCILE"
            | "RUNTIME_BOOTSTRAP"
    )
}

fn elapsed_ms(now_ms: u64, earlier_ms: u64) -> Option<u64> {
    if earlier_ms > now_ms.saturating_add(STARTUP_PROGRESS_FUTURE_TOLERANCE_MS) {
        return None;
    }
    Some(now_ms.saturating_sub(earlier_ms))
}

fn max_stage_age_ms(stage: &str) -> u64 {
    match stage {
        "CORE_SCHEMA" => CORE_SCHEMA_UPGRADE_MAX_AGE_MS,
        "RESET_RECOVERY" => RESET_RECOVERY_MAX_AGE_MS,
        "SEED_RECONCILE" => SEED_RECONCILE_MAX_AGE_MS,
        "RUNTIME_BOOTSTRAP" => RUNTIME_BOOTSTRAP_MAX_AGE_MS,
        _ => MARKET_SCHEMA_UPGRADE_MAX_AGE_MS,
    }
}

fn validate_progress_record(
    record: BackendStartupProgressRecord,
    expected_pid: u32,
    expected_parent_pid: u32,
    expected_runtime_build_id: &str,
    now_ms: u64,
) -> Option<ActiveBackendStartupProgress> {
    if record.schema_version != STARTUP_PROGRESS_SCHEMA_VERSION
        || record.pid != expected_pid
        || record.parent_pid != Some(expected_parent_pid)
        || record.runtime_build_id != expected_runtime_build_id
        || !is_known_stage(record.stage.as_str())
        || record.stage_started_at_ms < record.started_at_ms
        || record.updated_at_ms < record.stage_started_at_ms
    {
        return None;
    }
    let total_age_ms = elapsed_ms(now_ms, record.started_at_ms)?;
    let stage_age_ms = elapsed_ms(now_ms, record.stage_started_at_ms)?;
    let heartbeat_age_ms = elapsed_ms(now_ms, record.updated_at_ms)?;
    if total_age_ms > STARTUP_SCHEMA_UPGRADE_HARD_MAX_AGE_MS
        || stage_age_ms > max_stage_age_ms(record.stage.as_str())
    {
        return None;
    }
    // SQLite's VACUUM/check/recovery and seed reconciliation can synchronously
    // block Node's timer. Each remains bounded by its stage deadline. Market
    // work uses async DuckDB calls, so it must keep a fresh heartbeat.
    if !matches!(
        record.stage.as_str(),
        "CORE_SCHEMA" | "RESET_RECOVERY" | "SEED_RECONCILE"
    ) && heartbeat_age_ms > MARKET_PROGRESS_STALE_AFTER_MS
    {
        return None;
    }
    Some(ActiveBackendStartupProgress {
        stage: record.stage,
    })
}

pub(crate) fn read_active_backend_startup_progress(
    progress_path: &Path,
    expected_pid: u32,
    expected_parent_pid: u32,
    expected_runtime_build_id: &str,
    now_ms: u64,
) -> Option<ActiveBackendStartupProgress> {
    let metadata = fs::metadata(progress_path).ok()?;
    if !metadata.is_file() || metadata.len() > STARTUP_PROGRESS_MAX_BYTES {
        return None;
    }
    let raw = fs::read_to_string(progress_path).ok()?;
    let record = serde_json::from_str::<BackendStartupProgressRecord>(&raw).ok()?;
    validate_progress_record(
        record,
        expected_pid,
        expected_parent_pid,
        expected_runtime_build_id,
        now_ms,
    )
}

#[cfg(test)]
mod tests {
    use super::{validate_progress_record, BackendStartupProgressRecord};

    fn record(stage: &str, started_at_ms: u64, updated_at_ms: u64) -> BackendStartupProgressRecord {
        BackendStartupProgressRecord {
            schema_version: 2,
            pid: 42,
            parent_pid: Some(41),
            runtime_build_id: "build-a".to_string(),
            stage: stage.to_string(),
            started_at_ms,
            stage_started_at_ms: started_at_ms,
            updated_at_ms,
        }
    }

    #[test]
    fn accepts_fresh_owned_market_progress() {
        let progress = validate_progress_record(
            record("MARKET_COPYING", 1_000, 9_000),
            42,
            41,
            "build-a",
            10_000,
        )
        .expect("fresh progress");
        assert_eq!(progress.stage(), "MARKET_COPYING");
    }

    #[test]
    fn rejects_stale_market_or_wrong_owner_progress() {
        assert!(validate_progress_record(
            record("MARKET_COPYING", 1_000, 2_000),
            42,
            41,
            "build-a",
            10_000,
        )
        .is_none());
        assert!(validate_progress_record(
            record("MARKET_COPYING", 1_000, 9_000),
            99,
            41,
            "build-a",
            10_000,
        )
        .is_none());
    }

    #[test]
    fn allows_synchronous_core_work_until_the_bounded_hard_limit() {
        assert!(validate_progress_record(
            record("CORE_SCHEMA", 1_000, 1_000),
            42,
            41,
            "build-a",
            600_000,
        )
        .is_some());
        assert!(validate_progress_record(
            record("CORE_SCHEMA", 1_000, 1_000),
            42,
            41,
            "build-a",
            1_000 + 15 * 60 * 1_000 + 1,
        )
        .is_none());
    }

    #[test]
    fn allows_large_live_market_upgrades_beyond_the_core_deadline() {
        let sixteen_minutes_ms = 16 * 60 * 1_000;
        assert!(validate_progress_record(
            record("MARKET_COPYING", 1_000, 1_000 + sixteen_minutes_ms - 1_000,),
            42,
            41,
            "build-a",
            1_000 + sixteen_minutes_ms,
        )
        .is_some());

        let beyond_market_limit_ms = 24 * 60 * 60 * 1_000 + 1;
        assert!(validate_progress_record(
            record("MARKET_COPYING", 1_000, 1_000 + beyond_market_limit_ms,),
            42,
            41,
            "build-a",
            1_000 + beyond_market_limit_ms,
        )
        .is_none());
    }

    #[test]
    fn synchronous_reset_recovery_is_bounded_without_a_heartbeat() {
        assert!(validate_progress_record(
            record("RESET_RECOVERY", 1_000, 2_000),
            42,
            41,
            "build-a",
            120_000,
        )
        .is_some());
        assert!(validate_progress_record(
            record("RESET_RECOVERY", 1_000, 2_000),
            42,
            41,
            "build-a",
            1_000 + 15 * 60 * 1_000 + 1,
        )
        .is_none());
    }

    #[test]
    fn runtime_bootstrap_requires_a_fresh_heartbeat() {
        assert!(validate_progress_record(
            record("RUNTIME_BOOTSTRAP", 1_000, 2_000),
            42,
            41,
            "build-a",
            20_000,
        )
        .is_none());
    }

    #[test]
    fn rejects_unknown_stages_and_future_timestamps() {
        assert!(validate_progress_record(
            record("UNKNOWN", 1_000, 1_000),
            42,
            41,
            "build-a",
            2_000,
        )
        .is_none());
        assert!(validate_progress_record(
            record("CORE_SCHEMA", 20_000, 20_000),
            42,
            41,
            "build-a",
            10_000,
        )
        .is_none());
    }
}
