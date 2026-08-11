// SPDX-License-Identifier: GPL-3.0-only

use std::time::{Duration, Instant};

const LATCHED_FAILURE_RETRY_COOLDOWN: Duration = Duration::from_secs(30);

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct BackendStartupFailure {
    pub(crate) runtime_build_id: String,
    pub(crate) stage: String,
    pub(crate) error_code: String,
    pub(crate) error_message: String,
    retry_after: Option<Instant>,
}

#[derive(Debug, Default)]
pub(crate) struct BackendStartupCircuit {
    failure: Option<BackendStartupFailure>,
}

impl BackendStartupCircuit {
    pub(crate) fn blocking_failure(
        &mut self,
        runtime_build_id: &str,
        now: Instant,
    ) -> Option<BackendStartupFailure> {
        let failure = self.failure.as_ref()?;

        if failure.runtime_build_id != runtime_build_id {
            self.failure = None;
            return None;
        }

        if failure
            .retry_after
            .map(|retry_after| now >= retry_after)
            .unwrap_or(false)
        {
            self.failure = None;
            return None;
        }

        self.failure.clone()
    }

    pub(crate) fn record_latched_failure(
        &mut self,
        runtime_build_id: &str,
        stage: &str,
        error_code: &str,
        error_message: &str,
    ) -> BackendStartupFailure {
        self.record_failure(
            runtime_build_id,
            stage,
            error_code,
            error_message,
            Some(Instant::now() + LATCHED_FAILURE_RETRY_COOLDOWN),
        )
    }

    pub(crate) fn record_cooldown_failure(
        &mut self,
        runtime_build_id: &str,
        stage: &str,
        error_code: &str,
        error_message: &str,
        now: Instant,
        cooldown: Duration,
    ) -> BackendStartupFailure {
        self.record_failure(
            runtime_build_id,
            stage,
            error_code,
            error_message,
            Some(now + cooldown),
        )
    }

    pub(crate) fn record_success(&mut self, runtime_build_id: &str) {
        if self
            .failure
            .as_ref()
            .map(|failure| failure.runtime_build_id == runtime_build_id)
            .unwrap_or(false)
        {
            self.failure = None;
        }
    }

    fn record_failure(
        &mut self,
        runtime_build_id: &str,
        stage: &str,
        error_code: &str,
        error_message: &str,
        retry_after: Option<Instant>,
    ) -> BackendStartupFailure {
        let failure = BackendStartupFailure {
            runtime_build_id: runtime_build_id.to_string(),
            stage: stage.to_string(),
            error_code: error_code.to_string(),
            error_message: error_message.to_string(),
            retry_after,
        };
        self.failure = Some(failure.clone());
        failure
    }
}

#[cfg(test)]
mod tests {
    use super::BackendStartupCircuit;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Barrier, Mutex};
    use std::thread;
    use std::time::{Duration, Instant};

    #[test]
    fn latched_failure_allows_a_bounded_retry_for_the_same_build() {
        let now = Instant::now();
        let mut circuit = BackendStartupCircuit::default();
        circuit.record_latched_failure(
            "build-a",
            "health",
            "BACKEND_RUNTIME_EXITED_DURING_STARTUP",
            "Backend runtime exited during startup (exitCode=1)",
        );

        let first = circuit
            .blocking_failure("build-a", now)
            .expect("same build must be blocked");
        let later = circuit
            .blocking_failure("build-a", now + Duration::from_secs(29))
            .expect("failure must remain blocked during the cooldown");

        assert_eq!(first, later);
        assert_eq!(later.error_code, "BACKEND_RUNTIME_EXITED_DURING_STARTUP");
        assert!(circuit
            .blocking_failure("build-a", now + Duration::from_secs(31))
            .is_none());
    }

    #[test]
    fn build_change_clears_a_latched_failure() {
        let now = Instant::now();
        let mut circuit = BackendStartupCircuit::default();
        circuit.record_latched_failure(
            "build-a",
            "health",
            "BACKEND_RUNTIME_EXITED_DURING_STARTUP",
            "Backend runtime exited during startup (exitCode=1)",
        );

        assert!(circuit.blocking_failure("build-b", now).is_none());
        assert!(circuit.blocking_failure("build-a", now).is_none());
    }

    #[test]
    fn cooldown_failure_allows_one_new_attempt_after_the_deadline() {
        let now = Instant::now();
        let cooldown = Duration::from_secs(10);
        let mut circuit = BackendStartupCircuit::default();
        circuit.record_cooldown_failure(
            "build-a",
            "health",
            "BACKEND_RUNTIME_STARTUP_TIMEOUT",
            "Backend runtime did not become healthy before the startup deadline",
            now,
            cooldown,
        );

        assert!(circuit
            .blocking_failure("build-a", now + cooldown - Duration::from_millis(1))
            .is_some());
        assert!(circuit
            .blocking_failure("build-a", now + cooldown)
            .is_none());
        assert!(circuit
            .blocking_failure("build-a", now + cooldown)
            .is_none());
    }

    #[test]
    fn successful_start_clears_failure_for_that_build() {
        let now = Instant::now();
        let mut circuit = BackendStartupCircuit::default();
        circuit.record_latched_failure(
            "build-a",
            "spawn",
            "BACKEND_RUNTIME_SPAWN_FAILED",
            "Backend runtime process could not be started",
        );

        circuit.record_success("build-a");

        assert!(circuit.blocking_failure("build-a", now).is_none());
    }

    #[test]
    fn serialized_concurrent_requests_attempt_a_failed_build_only_once() {
        const REQUEST_COUNT: usize = 24;
        let startup_gate = Arc::new(Mutex::new(()));
        let circuit = Arc::new(Mutex::new(BackendStartupCircuit::default()));
        let attempts = Arc::new(AtomicUsize::new(0));
        let barrier = Arc::new(Barrier::new(REQUEST_COUNT));
        let mut workers = Vec::with_capacity(REQUEST_COUNT);

        for _ in 0..REQUEST_COUNT {
            let startup_gate = Arc::clone(&startup_gate);
            let circuit = Arc::clone(&circuit);
            let attempts = Arc::clone(&attempts);
            let barrier = Arc::clone(&barrier);
            workers.push(thread::spawn(move || {
                barrier.wait();
                let _startup_guard = startup_gate.lock().expect("lock startup gate");
                let mut circuit = circuit.lock().expect("lock startup circuit");
                if circuit
                    .blocking_failure("build-a", Instant::now())
                    .is_some()
                {
                    return;
                }
                attempts.fetch_add(1, Ordering::SeqCst);
                circuit.record_latched_failure(
                    "build-a",
                    "health",
                    "BACKEND_RUNTIME_EXITED_DURING_STARTUP",
                    "Backend runtime exited during startup (exitCode=1)",
                );
            }));
        }

        for worker in workers {
            worker.join().expect("join startup request");
        }

        assert_eq!(attempts.load(Ordering::SeqCst), 1);
    }
}
