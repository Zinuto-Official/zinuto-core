// SPDX-License-Identifier: GPL-3.0-only

use super::CsvFolderStageMode;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const CSV_FOLDER_STAGING_PROGRESS_EVENT: &str = "zinuto://csv-folder-staging-progress";
const CSV_FOLDER_STAGING_PROGRESS_MIN_INTERVAL_MS: u64 = 125;
const CSV_FOLDER_STAGING_PROGRESS_MIN_PERCENT_DELTA: f64 = 1.0;

#[derive(Clone, Copy, Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub(super) enum CsvFolderStagingProgressPhase {
    Discovering,
    Copying,
    Digesting,
    Done,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CsvFolderStagingProgressPayload {
    progress_request_id: String,
    stage_mode: CsvFolderStageMode,
    phase: CsvFolderStagingProgressPhase,
    processed_files: usize,
    total_files: Option<usize>,
    processed_bytes: u64,
    total_bytes: Option<u64>,
    progress_percent: Option<f64>,
}

#[derive(Clone, Copy)]
struct CsvFolderStagingProgressSnapshot {
    phase: CsvFolderStagingProgressPhase,
    progress_percent: Option<f64>,
    processed_files: usize,
    processed_bytes: u64,
}

#[derive(Default)]
struct CsvFolderStagingProgressCoalescer {
    last_emitted_at: Option<Instant>,
    last_emitted: Option<CsvFolderStagingProgressSnapshot>,
}

pub(super) struct CsvFolderStagingProgressEmitter<'a> {
    app: &'a AppHandle,
    progress_request_id: Option<&'a str>,
    stage_mode: CsvFolderStageMode,
    coalescer: CsvFolderStagingProgressCoalescer,
}

impl CsvFolderStagingProgressCoalescer {
    fn should_emit(&self, now: Instant, next: CsvFolderStagingProgressSnapshot) -> bool {
        let Some(last) = self.last_emitted else {
            return true;
        };
        if next.phase == CsvFolderStagingProgressPhase::Done {
            return true;
        }
        if next.phase != last.phase {
            return true;
        }
        match (last.progress_percent, next.progress_percent) {
            (None, Some(_)) => return true,
            (Some(last_percent), Some(next_percent))
                if (next_percent - last_percent).abs()
                    >= CSV_FOLDER_STAGING_PROGRESS_MIN_PERCENT_DELTA =>
            {
                return true;
            }
            _ => {}
        }
        if last.processed_files == next.processed_files
            && last.processed_bytes == next.processed_bytes
        {
            return false;
        }
        self.last_emitted_at
            .map(|last_at| {
                now.duration_since(last_at)
                    >= Duration::from_millis(CSV_FOLDER_STAGING_PROGRESS_MIN_INTERVAL_MS)
            })
            .unwrap_or(true)
    }

    fn record(&mut self, now: Instant, snapshot: CsvFolderStagingProgressSnapshot) {
        self.last_emitted_at = Some(now);
        self.last_emitted = Some(snapshot);
    }
}

impl<'a> CsvFolderStagingProgressEmitter<'a> {
    pub(super) fn new(
        app: &'a AppHandle,
        progress_request_id: Option<&'a str>,
        stage_mode: CsvFolderStageMode,
    ) -> Self {
        Self {
            app,
            progress_request_id,
            stage_mode,
            coalescer: CsvFolderStagingProgressCoalescer::default(),
        }
    }

    pub(super) fn emit(
        &mut self,
        phase: CsvFolderStagingProgressPhase,
        processed_files: usize,
        total_files: Option<usize>,
        processed_bytes: u64,
        total_bytes: Option<u64>,
    ) {
        if self.progress_request_id.is_none() {
            return;
        }
        let progress_percent =
            calculate_progress_percent(processed_files, total_files, processed_bytes, total_bytes);
        let snapshot = CsvFolderStagingProgressSnapshot {
            phase,
            progress_percent,
            processed_files,
            processed_bytes,
        };
        let now = Instant::now();
        if !self.coalescer.should_emit(now, snapshot) {
            return;
        }
        let request_id = self
            .progress_request_id
            .expect("progress request id was checked before emitting");
        let payload = CsvFolderStagingProgressPayload {
            progress_request_id: request_id.to_string(),
            stage_mode: self.stage_mode,
            phase,
            processed_files,
            total_files,
            processed_bytes,
            total_bytes,
            progress_percent,
        };
        let _ = self.app.emit(CSV_FOLDER_STAGING_PROGRESS_EVENT, payload);
        self.coalescer.record(now, snapshot);
    }
}

fn calculate_progress_percent(
    processed_files: usize,
    total_files: Option<usize>,
    processed_bytes: u64,
    total_bytes: Option<u64>,
) -> Option<f64> {
    if let Some(total_bytes_value) = total_bytes.filter(|value| *value > 0) {
        return Some(
            ((processed_bytes as f64 / total_bytes_value as f64) * 100.0).clamp(0.0, 100.0),
        );
    }
    if let Some(total_files_value) = total_files.filter(|value| *value > 0) {
        return Some(
            ((processed_files as f64 / total_files_value as f64) * 100.0).clamp(0.0, 100.0),
        );
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(
        phase: CsvFolderStagingProgressPhase,
        progress_percent: Option<f64>,
        processed_files: usize,
        processed_bytes: u64,
    ) -> CsvFolderStagingProgressSnapshot {
        CsvFolderStagingProgressSnapshot {
            phase,
            progress_percent,
            processed_files,
            processed_bytes,
        }
    }

    #[test]
    fn csv_folder_staging_progress_coalescer_keeps_required_updates_without_file_storms() {
        let mut coalescer = CsvFolderStagingProgressCoalescer::default();
        let start = Instant::now();
        let mut emitted = 0;

        for index in 0..100 {
            let next = snapshot(
                CsvFolderStagingProgressPhase::Discovering,
                Some(index as f64 * 0.01),
                index,
                index as u64,
            );
            if coalescer.should_emit(start, next) {
                emitted += 1;
                coalescer.record(start, next);
            }
        }

        assert_eq!(emitted, 1);

        let meaningful_percent = snapshot(
            CsvFolderStagingProgressPhase::Discovering,
            Some(1.0),
            100,
            100,
        );
        assert!(coalescer.should_emit(start, meaningful_percent));
        coalescer.record(start, meaningful_percent);

        let immediate_count_only = snapshot(
            CsvFolderStagingProgressPhase::Discovering,
            Some(1.2),
            101,
            101,
        );
        assert!(!coalescer.should_emit(start, immediate_count_only));

        let interval_count_only = snapshot(
            CsvFolderStagingProgressPhase::Discovering,
            Some(1.2),
            101,
            101,
        );
        assert!(coalescer.should_emit(
            start + Duration::from_millis(CSV_FOLDER_STAGING_PROGRESS_MIN_INTERVAL_MS),
            interval_count_only,
        ));
        coalescer.record(
            start + Duration::from_millis(CSV_FOLDER_STAGING_PROGRESS_MIN_INTERVAL_MS),
            interval_count_only,
        );

        let stage_change = snapshot(CsvFolderStagingProgressPhase::Copying, Some(0.0), 0, 0);
        assert!(coalescer.should_emit(start, stage_change));
        coalescer.record(start, stage_change);

        let done = snapshot(CsvFolderStagingProgressPhase::Done, Some(100.0), 100, 100);
        assert!(coalescer.should_emit(start, done));
    }
}
