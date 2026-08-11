// SPDX-License-Identifier: GPL-3.0-only

use super::{string_len, NATIVE_BRIDGE_REQUEST_ID_MAX_CHARS};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

pub(super) const CSV_FOLDER_STAGING_CANCELLED: &str = "CSV_FOLDER_STAGING_CANCELLED";
const CSV_FOLDER_STAGING_REQUEST_PREFIX: &str = "csv-stage-";
const MAX_CANCELLATION_REGISTRY_ENTRIES: usize = 128;

#[derive(Default)]
pub(super) struct CsvFolderStagingCancellationToken {
    cancelled: AtomicBool,
}

impl CsvFolderStagingCancellationToken {
    pub(super) fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    pub(super) fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    pub(super) fn check(&self) -> Result<(), String> {
        if self.is_cancelled() {
            Err(CSV_FOLDER_STAGING_CANCELLED.to_string())
        } else {
            Ok(())
        }
    }
}

struct CancellationRegistryEntry {
    token: Arc<CsvFolderStagingCancellationToken>,
    active: bool,
}

type CancellationRegistry = HashMap<String, CancellationRegistryEntry>;

fn cancellation_registry() -> &'static Mutex<CancellationRegistry> {
    static REGISTRY: OnceLock<Mutex<CancellationRegistry>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn make_room_for_registry_entry(registry: &mut CancellationRegistry) -> bool {
    if registry.len() < MAX_CANCELLATION_REGISTRY_ENTRIES {
        return true;
    }
    if let Some(pending_request_id) = registry
        .iter()
        .find_map(|(id, entry)| (!entry.active).then(|| id.clone()))
    {
        registry.remove(&pending_request_id);
    }
    registry.len() < MAX_CANCELLATION_REGISTRY_ENTRIES
}

fn is_valid_cancellation_request_id(value: &str) -> bool {
    if value.is_empty() || string_len(value) > NATIVE_BRIDGE_REQUEST_ID_MAX_CHARS {
        return false;
    }
    let Some(suffix) = value.strip_prefix(CSV_FOLDER_STAGING_REQUEST_PREFIX) else {
        return false;
    };
    let mut parts = suffix.split('-');
    (0..2).all(|_| {
        parts
            .next()
            .map(|part| {
                !part.is_empty()
                    && part
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || byte.is_ascii_lowercase())
            })
            .unwrap_or(false)
    }) && parts.next().is_none()
}

pub(super) fn normalize_cancellation_request_id(
    value: Option<String>,
) -> Result<Option<String>, String> {
    match value {
        None => Ok(None),
        Some(raw_value) if is_valid_cancellation_request_id(&raw_value) => Ok(Some(raw_value)),
        Some(_) => Err("INVALID_PARAMS".to_string()),
    }
}

pub(super) struct CsvFolderStagingCancellationRegistration {
    request_id: String,
    token: Arc<CsvFolderStagingCancellationToken>,
}

impl CsvFolderStagingCancellationRegistration {
    pub(super) fn token(&self) -> Arc<CsvFolderStagingCancellationToken> {
        Arc::clone(&self.token)
    }
}

impl Drop for CsvFolderStagingCancellationRegistration {
    fn drop(&mut self) {
        if let Ok(mut registry) = cancellation_registry().lock() {
            let should_remove = registry
                .get(&self.request_id)
                .map(|registered| registered.active && Arc::ptr_eq(&registered.token, &self.token))
                .unwrap_or(false);
            if should_remove {
                registry.remove(&self.request_id);
            }
        }
    }
}

pub(super) fn register_cancellation_request(
    request_id: Option<String>,
) -> Result<Option<CsvFolderStagingCancellationRegistration>, String> {
    let Some(request_id) = normalize_cancellation_request_id(request_id)? else {
        return Ok(None);
    };
    let token = Arc::new(CsvFolderStagingCancellationToken::default());
    let mut registry = cancellation_registry()
        .lock()
        .map_err(|_| "CSV_STAGE_BRIDGE_FAILED".to_string())?;
    let token = match registry.get_mut(&request_id) {
        Some(entry) if entry.active => return Err("INVALID_PARAMS".to_string()),
        Some(entry) => {
            entry.active = true;
            Arc::clone(&entry.token)
        }
        None => {
            if !make_room_for_registry_entry(&mut registry) {
                return Err("CSV_STAGE_BRIDGE_FAILED".to_string());
            }
            registry.insert(
                request_id.clone(),
                CancellationRegistryEntry {
                    token: Arc::clone(&token),
                    active: true,
                },
            );
            token
        }
    };
    Ok(Some(CsvFolderStagingCancellationRegistration {
        request_id,
        token,
    }))
}

pub(super) fn cancel_staging_request(request_id: String) -> Result<(), String> {
    let Some(request_id) = normalize_cancellation_request_id(Some(request_id))? else {
        return Err("INVALID_PARAMS".to_string());
    };
    let mut registry = cancellation_registry()
        .lock()
        .map_err(|_| "CSV_STAGE_BRIDGE_FAILED".to_string())?;
    if let Some(entry) = registry.get(&request_id) {
        entry.token.cancel();
        return Ok(());
    }
    if make_room_for_registry_entry(&mut registry) {
        let token = Arc::new(CsvFolderStagingCancellationToken::default());
        token.cancel();
        registry.insert(
            request_id,
            CancellationRegistryEntry {
                token,
                active: false,
            },
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancellation_request_ids_require_the_internal_generated_shape() {
        for value in [
            "",
            " csv-stage-abc-1",
            "csv-stage-abc-1 ",
            "csv-stage-ABC-1",
            "csv-stage-abc",
            "csv-stage-abc-1-extra",
            "other-abc-1",
        ] {
            assert_eq!(
                normalize_cancellation_request_id(Some(value.to_string())),
                Err("INVALID_PARAMS".to_string()),
            );
        }
        assert_eq!(
            normalize_cancellation_request_id(Some("csv-stage-abc123-9".to_string())),
            Ok(Some("csv-stage-abc123-9".to_string())),
        );
    }

    #[test]
    fn cancellation_registry_cancels_only_the_matching_active_request() {
        let registration = register_cancellation_request(Some("csv-stage-registry-1".to_string()))
            .expect("request should register")
            .expect("registration should exist");
        let token = registration.token();

        cancel_staging_request("csv-stage-unrelated-2".to_string())
            .expect("unknown request cancellation is idempotent");
        assert!(!token.is_cancelled());

        cancel_staging_request("csv-stage-registry-1".to_string())
            .expect("active request should cancel");
        assert!(token.is_cancelled());

        drop(registration);
        cancel_staging_request("csv-stage-registry-1".to_string())
            .expect("completed request cancellation is idempotent");
    }

    #[test]
    fn cancellation_that_arrives_before_registration_is_not_lost() {
        let request_id = "csv-stage-before-3".to_string();
        cancel_staging_request(request_id.clone()).expect("early cancellation should register");
        let registration = register_cancellation_request(Some(request_id))
            .expect("request should register")
            .expect("registration should exist");

        assert!(registration.token().is_cancelled());
    }

    #[test]
    fn cancellation_registry_capacity_evicts_only_pending_entries() {
        let mut pending_registry = CancellationRegistry::new();
        for index in 0..MAX_CANCELLATION_REGISTRY_ENTRIES {
            pending_registry.insert(
                format!("csv-stage-pending-{index}"),
                CancellationRegistryEntry {
                    token: Arc::new(CsvFolderStagingCancellationToken::default()),
                    active: false,
                },
            );
        }
        assert!(make_room_for_registry_entry(&mut pending_registry));
        assert_eq!(
            pending_registry.len(),
            MAX_CANCELLATION_REGISTRY_ENTRIES - 1
        );

        let mut active_registry = CancellationRegistry::new();
        for index in 0..MAX_CANCELLATION_REGISTRY_ENTRIES {
            active_registry.insert(
                format!("csv-stage-active-{index}"),
                CancellationRegistryEntry {
                    token: Arc::new(CsvFolderStagingCancellationToken::default()),
                    active: true,
                },
            );
        }
        assert!(!make_room_for_registry_entry(&mut active_registry));
        assert_eq!(active_registry.len(), MAX_CANCELLATION_REGISTRY_ENTRIES);
    }
}
