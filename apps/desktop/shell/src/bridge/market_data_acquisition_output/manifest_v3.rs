// SPDX-License-Identifier: GPL-3.0-only

use super::{
    acquisition_job_token, string_len, validate_manifest_file_list, validate_output_timestamp,
    validate_text_field, AcquisitionAdjustment, AcquisitionManifestFile, AcquisitionTimeframe,
    ValidatedAcquisitionManifest, MAX_OUTPUT_FOLDER_NAME_CHARS, MAX_SYMBOLS, OUTPUT_FOLDER_PREFIX,
};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct AcquisitionManifestV3 {
    schema_version: u32,
    job_id: String,
    output_folder_name: String,
    created_at: String,
    request: AcquisitionManifestRequestV3,
    time_zone: String,
    source_results: Vec<AcquisitionSourceResultV3>,
    file_count: usize,
    total_bytes: u64,
    files: Vec<AcquisitionManifestFile>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct AcquisitionManifestRequestV3 {
    market_id: String,
    source_plan_id: String,
    symbols: Vec<String>,
    timeframe: AcquisitionTimeframe,
    start_at: String,
    end_at: String,
    adjustment: Option<AcquisitionAdjustment>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct AcquisitionSourceResultV3 {
    symbol: String,
    source_symbol: String,
    final_source: AcquisitionSourceAttemptV3,
    attempts: Vec<AcquisitionSourceAttemptV3>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct AcquisitionSourceAttemptV3 {
    provider_id: AcquisitionProviderIdV3,
    provider_version: String,
    upstream_id: String,
    status: AcquisitionSourceAttemptStatusV3,
    error_code: Option<String>,
}

#[derive(Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum AcquisitionProviderIdV3 {
    Akshare,
    Ccxt,
    Financedatareader,
}

#[derive(Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub(super) enum AcquisitionSourceAttemptStatusV3 {
    Succeeded,
    Failed,
    Skipped,
}

fn validate_output_folder_name_v3(value: &str, market_id: &str, job_id: &str) -> bool {
    if string_len(value) > MAX_OUTPUT_FOLDER_NAME_CHARS
        || value.contains('/')
        || value.contains('\\')
        || value == "."
        || value == ".."
    {
        return false;
    }
    let expected_prefix = format!("{OUTPUT_FOLDER_PREFIX}{market_id}-");
    let Some(remainder) = value.strip_prefix(&expected_prefix) else {
        return false;
    };
    let expected_job_token = acquisition_job_token(job_id);
    if expected_job_token.len() != 8 {
        return false;
    }
    let expected_suffix = format!("-{expected_job_token}");
    let Some(timestamp) = remainder.strip_suffix(&expected_suffix) else {
        return false;
    };
    validate_output_timestamp(timestamp)
}

fn is_safe_market_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    (2..=64).contains(&bytes.len())
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_uppercase() || *byte == b'_')
}

fn is_safe_source_code(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .as_bytes()
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn validate_source_attempt(attempt: &AcquisitionSourceAttemptV3) -> bool {
    validate_text_field(&attempt.provider_version, 64)
        && is_safe_source_code(&attempt.upstream_id)
        && match (&attempt.status, &attempt.error_code) {
            (AcquisitionSourceAttemptStatusV3::Succeeded, None) => true,
            (AcquisitionSourceAttemptStatusV3::Succeeded, Some(_)) => false,
            (_, None) => false,
            (_, Some(code)) => is_safe_source_code(code),
        }
}

pub(super) fn validate_manifest_v3(
    raw_manifest: &[u8],
    expected_job_id: &str,
) -> Result<ValidatedAcquisitionManifest, String> {
    let manifest: AcquisitionManifestV3 = serde_json::from_slice(raw_manifest)
        .map_err(|_| "MARKET_DATA_ACQUISITION_MANIFEST_INVALID".to_string())?;
    if manifest.schema_version != 3
        || manifest.job_id != expected_job_id
        || !validate_text_field(&manifest.created_at, 64)
        || !is_safe_market_id(&manifest.request.market_id)
        || !validate_text_field(&manifest.request.source_plan_id, 128)
        || !validate_text_field(&manifest.time_zone, 64)
        || !validate_output_folder_name_v3(
            &manifest.output_folder_name,
            &manifest.request.market_id,
            expected_job_id,
        )
        || !validate_text_field(&manifest.request.start_at, 64)
        || !validate_text_field(&manifest.request.end_at, 64)
        || manifest.request.symbols.is_empty()
        || manifest.request.symbols.len() > MAX_SYMBOLS
        || manifest
            .request
            .symbols
            .iter()
            .any(|symbol| !validate_text_field(symbol, 128))
    {
        return Err("MARKET_DATA_ACQUISITION_MANIFEST_INVALID".to_string());
    }
    if manifest.source_results.len() != manifest.request.symbols.len()
        || manifest
            .source_results
            .iter()
            .enumerate()
            .any(|(index, result)| {
                result.symbol != manifest.request.symbols[index]
                    || !validate_text_field(&result.source_symbol, 128)
                    || result.final_source.status != AcquisitionSourceAttemptStatusV3::Succeeded
                    || !validate_source_attempt(&result.final_source)
                    || result.attempts.is_empty()
                    || result.attempts.len() > 3
                    || result
                        .attempts
                        .iter()
                        .any(|attempt| !validate_source_attempt(attempt))
                    || !result.attempts.iter().any(|attempt| {
                        attempt.status == AcquisitionSourceAttemptStatusV3::Succeeded
                            && attempt.provider_id == result.final_source.provider_id
                            && attempt.provider_version == result.final_source.provider_version
                            && attempt.upstream_id == result.final_source.upstream_id
                    })
            })
    {
        return Err("MARKET_DATA_ACQUISITION_MANIFEST_INVALID".to_string());
    }
    let _ = (manifest.request.timeframe, manifest.request.adjustment);
    validate_manifest_file_list(manifest.file_count, manifest.total_bytes, &manifest.files)?;
    Ok(ValidatedAcquisitionManifest {
        output_folder_name: manifest.output_folder_name,
        files: manifest.files,
        total_bytes: manifest.total_bytes,
    })
}
