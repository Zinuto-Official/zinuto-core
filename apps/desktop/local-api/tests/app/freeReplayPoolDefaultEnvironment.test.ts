// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDbDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-free-replay-pool-defaults-"),
);
process.env.ZINUTO_DB_PATH = path.join(tempDbDir, "zinuto.db");

const { db } = await import("../../src/infrastructure/db/database.js");
const {
  listFreeReplayPoolDefaultEnvironments,
  setFreeReplayPoolDefaultEnvironment,
} = await import(
  "../../src/application/trading/freeReplayPoolDefaultEnvironmentService.js"
);

test.after(async () => {
  await fs.promises.rm(tempDbDir, { recursive: true, force: true });
});

test("free replay pool default environment persists by pool id", () => {
  db.prepare("DELETE FROM user_app_preferences").run();

  assert.deepEqual(listFreeReplayPoolDefaultEnvironments(), {});

  const updated = setFreeReplayPoolDefaultEnvironment(" pool-local-1 ", {
    assetClass: "FOREX",
    marketPresetId: "FOREX_STANDARD_LOT",
  });

  assert.deepEqual(updated, {
    "pool-local-1": {
      assetClass: "FOREX",
      marketPresetId: "FOREX_STANDARD_LOT",
    },
  });
  assert.deepEqual(listFreeReplayPoolDefaultEnvironments(), updated);
});
