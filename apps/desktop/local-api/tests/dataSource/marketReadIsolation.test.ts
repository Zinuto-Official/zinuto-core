// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-market-read-isolation-"),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const [
  {
    closeMarketDatabase,
    getMarketBarCount,
    getMarketBarsByInstrumentId,
    replaceMarketBarsForInstrument,
    replaceMarketBarsForInstrumentsFromCsvFilesBatch,
  },
  { invalidateMarketReadCaches },
  { marketDatabaseHarness },
] = await Promise.all([
  import("../../src/infrastructure/db/marketDatabase.js"),
  import("../../src/infrastructure/db/marketReadCache.js"),
  import("../support/marketDatabaseHarness.js"),
]);

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

test.after(async () => {
  await closeMarketDatabase();
  delete process.env.ZINUTO_DATA_DIR;
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

test("market bar count reads do not wait behind the market write lock queue", async () => {
  const instrumentId = "read-isolation-aapl";
  await replaceMarketBarsForInstrument(instrumentId, "AAPL", [
    {
      ts: "2026-01-01T00:00:00.000Z",
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 1000,
    },
    {
      ts: "2026-01-02T00:00:00.000Z",
      open: 101,
      high: 102,
      low: 100,
      close: 101.5,
      volume: 1100,
    },
    {
      ts: "2026-01-03T00:00:00.000Z",
      open: 102,
      high: 103,
      low: 101,
      close: 102.5,
      volume: 1200,
    },
  ]);
  invalidateMarketReadCaches(instrumentId);

  let releaseWriteLock = (): void => undefined;
  let resolveWriteLockStarted = (): void => undefined;
  const writeLockStarted = new Promise<void>((resolve) => {
    resolveWriteLockStarted = resolve;
  });
  const writeLockReleased = new Promise<void>((resolve) => {
    releaseWriteLock = resolve;
  });
  const writeLockPromise = marketDatabaseHarness.withWriteLock(
    async () => {
      resolveWriteLockStarted();
      await writeLockReleased;
    },
  );

  await writeLockStarted;
  try {
    const result = await Promise.race([
      getMarketBarCount(instrumentId),
      delay(250).then(() => -1),
    ]);
    assert.equal(result, 3);
  } finally {
    releaseWriteLock();
    await writeLockPromise;
  }
});

test("market write lock prioritizes interactive waiters between bulk writes", async () => {
  const events: string[] = [];
  let releaseActiveWrite = (): void => undefined;
  let resolveActiveWriteStarted = (): void => undefined;
  const activeWriteStarted = new Promise<void>((resolve) => {
    resolveActiveWriteStarted = resolve;
  });
  const activeWriteReleased = new Promise<void>((resolve) => {
    releaseActiveWrite = resolve;
  });
  const activeWrite = marketDatabaseHarness.withWriteLock(async () => {
    events.push("active-bulk");
    resolveActiveWriteStarted();
    await activeWriteReleased;
  });

  await activeWriteStarted;
  const queuedBulk = marketDatabaseHarness.withWriteLock(async () => {
    events.push("queued-bulk");
  });
  const queuedInteractive = marketDatabaseHarness.withWriteLock(
    async () => {
      events.push("queued-interactive");
    },
    { priority: "interactive" },
  );

  releaseActiveWrite();
  await Promise.all([activeWrite, queuedBulk, queuedInteractive]);

  assert.deepEqual(events, [
    "active-bulk",
    "queued-interactive",
    "queued-bulk",
  ]);
});

test("aborting a queued market write removes it without releasing an active lock early", async () => {
  let releaseActiveWrite = (): void => undefined;
  let resolveActiveWriteStarted = (): void => undefined;
  const activeWriteStarted = new Promise<void>((resolve) => {
    resolveActiveWriteStarted = resolve;
  });
  const activeWriteReleased = new Promise<void>((resolve) => {
    releaseActiveWrite = resolve;
  });
  const activeWrite = marketDatabaseHarness.withWriteLock(async () => {
    resolveActiveWriteStarted();
    await activeWriteReleased;
  });
  await activeWriteStarted;

  const controller = new AbortController();
  const timeoutError = Object.assign(new Error("LOCAL_DATA_IMPORT_JOB_TIMEOUT"), {
    code: "LOCAL_DATA_IMPORT_JOB_TIMEOUT",
  });
  let queuedTaskRan = false;
  const queuedWrite = marketDatabaseHarness.withWriteLock(
    async () => {
      queuedTaskRan = true;
    },
    { signal: controller.signal },
  );
  const queuedRejection = assert.rejects(
    queuedWrite,
    (error) => error === timeoutError,
  );
  controller.abort(timeoutError);
  await queuedRejection;
  assert.equal(queuedTaskRan, false);

  releaseActiveWrite();
  await activeWrite;
  await marketDatabaseHarness.withWriteLock(async () => undefined);
  assert.equal(queuedTaskRan, false);
});

test("homogeneous CSV batch import writes multiple files through grouped staging", async () => {
  const importRoot = await fs.promises.mkdtemp(
    path.join(tempDataDir, "homogeneous-csv-import-"),
  );
  const aaplPath = path.join(importRoot, "AAPL.csv");
  const msftPath = path.join(importRoot, "MSFT.csv");
  await Promise.all([
    fs.promises.writeFile(
      aaplPath,
      [
        "date,open,high,low,close,volume",
        "2026-02-01,10,11,9,10.5,100",
        "2026-02-02,11,12,10,11.5,110",
      ].join("\n"),
    ),
    fs.promises.writeFile(
      msftPath,
      [
        "date,open,high,low,close,volume",
        "2026-02-01,20,21,19,20.5,200",
        "2026-02-02,21,22,20,21.5,210",
      ].join("\n"),
    ),
  ]);

  const mapping = {
    timestampMode: "SINGLE" as const,
    date: "date",
    time: "",
    open: "open",
    high: "high",
    low: "low",
    close: "close",
    volume: "volume",
  };
  const results = await replaceMarketBarsForInstrumentsFromCsvFilesBatch([
    {
      instrumentId: "group-import-aapl",
      symbol: "AAPL",
      filePath: aaplPath,
      mapping,
      timezone: "UTC",
      inputFormat: "csv",
    },
    {
      instrumentId: "group-import-msft",
      symbol: "MSFT",
      filePath: msftPath,
      mapping,
      timezone: "UTC",
      inputFormat: "csv",
    },
  ]);

  assert.deepEqual(
    results.map((item) => [item.instrumentId, item.importedRows, item.skippedRows]),
    [
      ["group-import-aapl", 2, 0],
      ["group-import-msft", 2, 0],
    ],
  );
  const aaplBars = await getMarketBarsByInstrumentId("group-import-aapl");
  const msftBars = await getMarketBarsByInstrumentId("group-import-msft");
  assert.equal(aaplBars.length, 2);
  assert.equal(msftBars.length, 2);
  assert.equal(aaplBars[0]?.close, 10.5);
  assert.equal(msftBars[1]?.volume, 210);
});
