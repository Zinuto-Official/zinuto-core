// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { createDatabaseMaintenanceApi } from "../../src/infrastructure/db/database/maintenance.js";

test("database maintenance sweeps stale duckdb temp artifacts and keeps fresh files", async () => {
  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "zinuto-database-maintenance-"),
  );
  const dbPath = path.join(tempDir, "maintenance.sqlite");
  const duckdbTempDir = path.join(tempDir, "duckdb-tmp");
  await fs.promises.mkdir(duckdbTempDir, { recursive: true });
  const oldArtifactPath = path.join(duckdbTempDir, "duckdb_temp_storage-old.tmp");
  const freshArtifactPath = path.join(duckdbTempDir, "duckdb_temp_storage-fresh.tmp");
  await fs.promises.writeFile(oldArtifactPath, "old-temp");
  await fs.promises.writeFile(freshArtifactPath, "fresh-temp");
  const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await fs.promises.utimes(oldArtifactPath, oldDate, oldDate);

  const sqlite = new Database(dbPath);
  try {
    const maintenance = createDatabaseMaintenanceApi({
      db: sqlite,
      dbFilePath: dbPath,
      duckdbTempDir,
      duckdbTempArtifactMaxAgeMs: 60_000,
    });
    const secondSweep = maintenance.sweepStaleDuckdbTempArtifacts();

    assert.equal(fs.existsSync(oldArtifactPath), false);
    assert.equal(fs.existsSync(freshArtifactPath), true);
    assert.equal(secondSweep.deletedEntries, 0);
  } finally {
    sqlite.close();
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});

test("passive checkpoint does not synchronously sweep duckdb temp artifacts", async () => {
  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "zinuto-passive-checkpoint-"),
  );
  const dbPath = path.join(tempDir, "maintenance.sqlite");
  const duckdbTempDir = path.join(tempDir, "duckdb-tmp");
  await fs.promises.mkdir(duckdbTempDir, { recursive: true });
  const sqlite = new Database(dbPath);
  try {
    const maintenance = createDatabaseMaintenanceApi({
      db: sqlite,
      dbFilePath: dbPath,
      duckdbTempDir,
      duckdbTempArtifactMaxAgeMs: 60_000,
    });
    const artifactPath = path.join(duckdbTempDir, "duckdb_temp_storage-old.tmp");
    await fs.promises.writeFile(artifactPath, "old-temp");
    const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await fs.promises.utimes(artifactPath, oldDate, oldDate);

    maintenance.checkpointDatabaseStorage("PASSIVE");
    assert.equal(fs.existsSync(artifactPath), true);

    maintenance.checkpointDatabaseStorage("TRUNCATE");
    assert.equal(fs.existsSync(artifactPath), false);
  } finally {
    sqlite.close();
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});
