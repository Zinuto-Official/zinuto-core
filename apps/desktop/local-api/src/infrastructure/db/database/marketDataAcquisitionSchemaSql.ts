// SPDX-License-Identifier: GPL-3.0-only

export const marketDataAcquisitionSchemaSql = `
CREATE TABLE IF NOT EXISTS local_data_acquisition_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('QUEUED','RUNNING','READY_TO_SAVE','FAILED','CANCELED')),
  request_json TEXT NOT NULL,
  progress_json TEXT NOT NULL,
  source_results_json TEXT NOT NULL DEFAULT '[]',
  staging_json TEXT,
  error_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_local_data_acquisition_jobs_updated
  ON local_data_acquisition_jobs(updated_at DESC, id DESC);
`;
