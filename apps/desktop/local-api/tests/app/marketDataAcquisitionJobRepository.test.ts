// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { schemaSql } from "../../src/infrastructure/db/database/schemaSql.js";
import { createMarketDataAcquisitionJobRepository } from "../../src/infrastructure/db/marketDataAcquisition/marketDataAcquisitionJobRepository.js";

const row = (overrides = {}) => ({
  id: "job-0001",
  status: "QUEUED",
  requestJson: JSON.stringify({
    marketId: "CN_A_SHARE",
    sourcePlanId: "CN_A_SHARE_SMART",
    symbols: ["000001"],
    timeframe: "1d",
    startAt: "2026-01-01T00:00:00+08:00",
    endAt: "2026-01-02T23:59:59+08:00",
    adjustment: "none",
  }),
  progressJson: JSON.stringify({
    stage: "QUEUED",
    completedSymbols: 0,
    totalSymbols: 1,
    retryAttempt: 0,
    retryAfterMs: 0,
  }),
  sourceResultsJson: "[]",
  stagingJson: null,
  errorJson: null,
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
  finishedAt: null,
  ...overrides,
});

test("the acquisition job repository persists, lists, prunes, and interrupts rows", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "zinuto-acquisition-repository-"),
  );
  try {
    const db = new Database(path.join(dir, "test.db"));
    try {
      db.exec(schemaSql);
      const repository = createMarketDataAcquisitionJobRepository(db);

      repository.upsert(row({ id: "job-0001", status: "READY_TO_SAVE" }));
      repository.upsert(row({ id: "job-0002", status: "RUNNING" }));
      repository.upsert(row({ id: "job-0003", status: "FAILED" }));
      repository.upsert(row({
        id: "job-0004",
        status: "FAILED",
        updatedAt: "2026-07-18T23:59:00.000Z",
      }));

      assert.deepEqual(
        repository.list(10).map((entry) => entry.id),
        ["job-0003", "job-0002", "job-0001", "job-0004"],
      );

      repository.upsert(row({
        id: "job-0002",
        status: "CANCELED",
        updatedAt: "2026-07-19T00:01:00.000Z",
        finishedAt: "2026-07-19T00:01:00.000Z",
        errorJson: null,
      }));
      const updated = repository.list(10).find((entry) => entry.id === "job-0002");
      assert.equal(updated?.status, "CANCELED");
      assert.equal(updated?.finishedAt, "2026-07-19T00:01:00.000Z");

      const interrupted = repository.markRunningInterrupted(
        JSON.stringify({ code: "ACQUISITION_INTERRUPTED", args: {} }),
        "2026-07-19T00:02:00.000Z",
      );
      assert.deepEqual(interrupted, []);
      assert.equal(
        repository.list(10).find((entry) => entry.id === "job-0001")?.status,
        "READY_TO_SAVE",
      );

      const pruned = repository.prune(2);
      assert.deepEqual(pruned, ["job-0004"]);
      assert.deepEqual(
        repository.list(10).map((entry) => entry.id).sort(),
        ["job-0001", "job-0002", "job-0003"].sort(),
      );

      repository.remove("job-0001");
      assert.deepEqual(
        repository.list(10).map((entry) => entry.id).sort(),
        ["job-0002", "job-0003"],
      );
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
