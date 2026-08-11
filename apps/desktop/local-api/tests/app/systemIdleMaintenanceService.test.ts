// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-idle-maintenance-"),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const marketDbPath = path.join(
  tempDataDir,
  "data",
  "market",
  "zinuto.market.duckdb",
);

const [
  { db },
  { closeMarketDatabase },
  { startSystemIdleMaintenance },
] = await Promise.all([
  import("../../src/infrastructure/db/database.js"),
  import("../../src/infrastructure/db/marketDatabase.js"),
  import("../../src/application/systemIdleMaintenanceService.js"),
]);

test.after(async () => {
  await closeMarketDatabase();
  db.close();
  delete process.env.ZINUTO_DATA_DIR;
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

const DEFAULT_TRADING_CALENDAR_JSON =
  '{"tradingDays":[1,2,3,4,5],"sessions":[{"startMinute":0,"endMinute":1440,"crossesMidnight":false}]}';

const insertLocalMarketContent = (): void => {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO local_data_sources (
      id,name,source_folder,time_zone,base_timeframe,field_mapping_json,trading_calendar_json,status,
      deletion_state,symbol_count,bar_count,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    "source-idle-maintenance-corrupt-market",
    "Corrupt Market",
    "",
    "Asia/Shanghai",
    "1d",
    "{}",
    DEFAULT_TRADING_CALENDAR_JSON,
    "READY",
    "DELETING",
    1,
    1,
    now,
    now,
  );
  db.prepare(
    `INSERT INTO instruments (
      id,source_id,symbol,base_timeframe,name,market,time_zone,min_trade_step,bar_count,
      time_start_ts,time_end_ts,bars_version_token,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    "instrument-idle-maintenance-corrupt-market",
    "source-idle-maintenance-corrupt-market",
    "CORRUPT",
    "1d",
    "Corrupt",
    "LOCAL",
    "Asia/Shanghai",
    1,
    1,
    "2026-05-01T00:00:00.000Z",
    "2026-05-01T00:00:00.000Z",
    "corrupt-market-version",
    now,
  );
};

const insertDeletingLocalDataSource = (sourceId: string): void => {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO local_data_sources (
      id,name,source_folder,time_zone,base_timeframe,field_mapping_json,trading_calendar_json,status,
      deletion_state,symbol_count,bar_count,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    sourceId,
    "Deleting Source",
    "",
    "Asia/Shanghai",
    "1d",
    "{}",
    DEFAULT_TRADING_CALENDAR_JSON,
    "READY",
    "DELETING",
    0,
    0,
    now,
    now,
  );
};

const hasLocalDataSource = (sourceId: string): boolean =>
  Boolean(
    db
      .prepare("SELECT 1 FROM local_data_sources WHERE id = ? LIMIT 1")
      .get(sourceId),
  );

const deleteLocalDataSource = (sourceId: string): void => {
  db.prepare("DELETE FROM local_data_sources WHERE id = ?").run(sourceId);
};

test("automatic idle cycles are limited to passive database maintenance", async () => {
  const serviceSource = await fs.promises.readFile(
    new URL("../../src/application/systemIdleMaintenanceService.ts", import.meta.url),
    "utf8",
  );
  assert.match(serviceSource, /checkpointDatabaseStorage\('PASSIVE'\)/u);
  for (const forbiddenOperation of [
    "applyHistoryRetentionPolicy",
    "runDatabaseMaintenance",
    "runMarketMaintenance",
    "reclaimEmptyMarketStorage",
    "checkpointMarketStorage",
  ]) {
    assert.doesNotMatch(
      serviceSource,
      new RegExp(`\\b${forbiddenOperation}\\b`, "u"),
    );
  }
  assert.doesNotMatch(serviceSource, /\b(?:TRUNCATE|VACUUM|optimize)\b/u);
});

test("idle maintenance logs unexpected run-cycle failures", async () => {
  const previousWarn = console.warn;
  const warnCalls: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    warnCalls.push(args);
  };

  const handle = startSystemIdleMaintenance({
    isApiInteractionIdle: () => true,
    isBacktestRuntimeIdle: () => true,
    isLocalDataImportIdle: () => {
      throw new Error("idle check failed");
    },
  });

  try {
    await handle.triggerNow();
  } finally {
    await handle.stop();
    console.warn = previousWarn;
  }

  assert.ok(
    warnCalls.some((args) =>
      String(args[0] ?? "").includes("[idle-maintenance] run cycle failed"),
    ),
  );
});

test("idle maintenance skips the complete cycle while API interaction is busy", async () => {
  const sourceId = "source-idle-maintenance-api-busy";
  insertDeletingLocalDataSource(sourceId);
  let localDataImportIdleChecks = 0;
  const handle = startSystemIdleMaintenance({
    isApiInteractionIdle: () => false,
    isBacktestRuntimeIdle: () => true,
    isLocalDataImportIdle: () => {
      localDataImportIdleChecks += 1;
      return true;
    },
  });

  try {
    await handle.triggerNow();
    assert.equal(localDataImportIdleChecks, 0);
    assert.equal(hasLocalDataSource(sourceId), true);
    assert.equal(fs.existsSync(marketDbPath), false);
  } finally {
    await handle.stop();
    deleteLocalDataSource(sourceId);
  }
});

test("idle maintenance cancels and awaits automatic retention when API interaction resumes", async () => {
  let retentionStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    retentionStarted = resolve;
  });
  let retentionExited = false;
  const handle = startSystemIdleMaintenance({
    isApiInteractionIdle: () => true,
    isBacktestRuntimeIdle: () => true,
    isLocalDataImportIdle: () => true,
    runAutomaticHistoryRetention: ({ signal }) =>
      new Promise<void>((resolve, reject) => {
        retentionStarted();
        signal.addEventListener(
          "abort",
          () => {
            setTimeout(() => {
              retentionExited = true;
              const error = new Error("cancelled");
              error.name = "AbortError";
              reject(error);
            }, 20);
          },
          { once: true },
        );
        void resolve;
      }),
  });

  const cycle = handle.triggerNow();
  await started;
  await handle.interruptForApiInteraction();
  assert.equal(retentionExited, true);
  await cycle;
  await handle.stop();
});

test("idle maintenance rechecks API idle state before destructive storage stages", async () => {
  const sourceId = "source-idle-maintenance-api-became-busy";
  insertDeletingLocalDataSource(sourceId);
  let apiIdleChecks = 0;
  let localDataImportIdleChecks = 0;
  const handle = startSystemIdleMaintenance({
    isApiInteractionIdle: () => {
      apiIdleChecks += 1;
      return apiIdleChecks < 4;
    },
    isLocalDataImportIdle: () => {
      localDataImportIdleChecks += 1;
      return true;
    },
    isBacktestRuntimeIdle: () => true,
  });

  try {
    await handle.triggerNow();
    assert.equal(apiIdleChecks, 4);
    assert.equal(localDataImportIdleChecks, 3);
    assert.equal(hasLocalDataSource(sourceId), true);
  } finally {
    await handle.stop();
    deleteLocalDataSource(sourceId);
  }
});

test("idle maintenance skips destructive storage work while a backtest is active", async () => {
  const sourceId = "source-idle-maintenance-backtest-busy";
  insertDeletingLocalDataSource(sourceId);
  let backtestIdleChecks = 0;
  const handle = startSystemIdleMaintenance({
    isApiInteractionIdle: () => true,
    isLocalDataImportIdle: () => true,
    isBacktestRuntimeIdle: () => {
      backtestIdleChecks += 1;
      return false;
    },
  });

  try {
    await handle.triggerNow();
    assert.equal(backtestIdleChecks, 1);
    assert.equal(hasLocalDataSource(sourceId), true);
  } finally {
    await handle.stop();
    deleteLocalDataSource(sourceId);
  }
});

test("idle maintenance never escalates a source cleanup failure into global market maintenance", async () => {
  await fs.promises.mkdir(path.dirname(marketDbPath), { recursive: true });
  await fs.promises.writeFile(marketDbPath, "not-a-duckdb-database");
  insertLocalMarketContent();

  const previousWarn = console.warn;
  const warnCalls: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    warnCalls.push(args);
  };

  const handle = startSystemIdleMaintenance({
    isApiInteractionIdle: () => true,
    isLocalDataImportIdle: () => true,
    isBacktestRuntimeIdle: () => true,
  });

  try {
    await handle.triggerNow();
  } finally {
    await handle.stop();
    console.warn = previousWarn;
  }

  assert.ok(
    warnCalls.some((args) =>
      String(args[0] ?? "").includes(
        "[idle-maintenance] source physical deletion cleanup failed",
      ),
    ),
  );
  assert.equal(
    warnCalls.some((args) =>
      String(args[0] ?? "").includes("[idle-maintenance] market checkpoint failed"),
    ),
    false,
  );
  assert.equal(
    warnCalls.some((args) =>
      String(args[0] ?? "").includes("[idle-maintenance] run cycle failed"),
    ),
    false,
  );
  assert.equal(hasLocalDataSource("source-idle-maintenance-corrupt-market"), true);
  deleteLocalDataSource("source-idle-maintenance-corrupt-market");
});
