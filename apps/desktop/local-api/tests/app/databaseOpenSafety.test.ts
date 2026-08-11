// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openDatabaseWithoutDestructiveRecovery } from "../../src/infrastructure/db/database/recovery.js";

test("opening an unreadable durable database never deletes or rewrites it", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zinuto-db-open-safety-"));
  const dbPath = path.join(tempDir, "zinuto.db");
  const corruptedBytes = Buffer.from("durable-user-data-that-is-not-sqlite\n");
  fs.writeFileSync(dbPath, corruptedBytes);

  try {
    assert.throws(() => {
      const opened = openDatabaseWithoutDestructiveRecovery(dbPath);
      try {
        opened.prepare("SELECT 1").get();
      } finally {
        opened.close();
      }
    });
    assert.deepEqual(fs.readFileSync(dbPath), corruptedBytes);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
