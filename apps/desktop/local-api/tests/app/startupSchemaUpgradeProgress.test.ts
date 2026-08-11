// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { startStartupSchemaUpgradeProgress } from "../../src/infrastructure/db/database/startupSchemaUpgradeProgress.js";

test("startup schema upgrade progress is owned, phase-aware, and removed on completion", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "zinuto-startup-schema-progress-"),
  );
  const progressPath = path.join(tempDir, "startup-progress.json");
  const previousPath = process.env.ZINUTO_BACKEND_STARTUP_PROGRESS_PATH;
  const previousBuildId = process.env.ZINUTO_BACKEND_BUILD_ID;
  process.env.ZINUTO_BACKEND_STARTUP_PROGRESS_PATH = progressPath;
  process.env.ZINUTO_BACKEND_BUILD_ID = "progress-test-build";

  try {
    const progress = startStartupSchemaUpgradeProgress();
    const initial = JSON.parse(fs.readFileSync(progressPath, "utf8")) as {
      schemaVersion: number;
      pid: number;
      runtimeBuildId: string;
      stage: string;
      startedAtMs: number;
      stageStartedAtMs: number;
      updatedAtMs: number;
    };
    assert.equal(initial.schemaVersion, 2);
    assert.equal(initial.pid, process.pid);
    assert.equal(initial.runtimeBuildId, "progress-test-build");
    assert.equal(initial.stage, "CORE_SCHEMA");

    progress.update("MARKET_COPYING");
    const copying = JSON.parse(fs.readFileSync(progressPath, "utf8")) as {
      stage: string;
      startedAtMs: number;
      stageStartedAtMs: number;
      updatedAtMs: number;
    };
    assert.equal(copying.stage, "MARKET_COPYING");
    assert.equal(copying.startedAtMs, initial.startedAtMs);
    assert.ok(copying.stageStartedAtMs >= initial.stageStartedAtMs);
    assert.ok(copying.updatedAtMs >= initial.updatedAtMs);

    progress.close();
    assert.equal(fs.existsSync(progressPath), false);
  } finally {
    if (previousPath === undefined) {
      delete process.env.ZINUTO_BACKEND_STARTUP_PROGRESS_PATH;
    } else {
      process.env.ZINUTO_BACKEND_STARTUP_PROGRESS_PATH = previousPath;
    }
    if (previousBuildId === undefined) {
      delete process.env.ZINUTO_BACKEND_BUILD_ID;
    } else {
      process.env.ZINUTO_BACKEND_BUILD_ID = previousBuildId;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
