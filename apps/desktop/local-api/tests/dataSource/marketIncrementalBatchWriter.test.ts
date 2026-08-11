// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-market-incremental-batch-"),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const {
  appendEdgeBarsForInstrumentsFromCsvFilesBatch,
  closeMarketDatabase,
  getMarketBarCount,
  getMarketBarsByInstrumentId,
  replaceMarketBarsForInstrument,
  replaceMarketBarsForInstrumentFromCsvFile,
} = await import("../../src/infrastructure/db/marketDatabase.js");

test.after(async () => {
  await closeMarketDatabase();
  delete process.env.ZINUTO_DATA_DIR;
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

const CSV_MAPPING = {
  timestampMode: "SINGLE" as const,
  date: "date",
  time: "",
  open: "open",
  high: "high",
  low: "low",
  close: "close",
  volume: "volume",
};

const writeCsvRows = async (
  filePath: string,
  rows: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>,
): Promise<void> => {
  await fs.promises.writeFile(
    filePath,
    [
      "date,open,high,low,close,volume",
      ...rows.map((row) =>
        [
          row.date,
          row.open,
          row.high,
          row.low,
          row.close,
          row.volume,
        ].join(","),
      ),
    ].join("\n") + "\n",
    "utf8",
  );
};

test("incremental CSV batch appends multiple instruments in one writer call", async (t) => {
  const tempCsvDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "zinuto-market-incremental-batch-csv-"),
  );
  t.after(async () => {
    await fs.promises.rm(tempCsvDir, { recursive: true, force: true });
  });
  const aaplAppendPath = path.join(tempCsvDir, "AAPL_append.csv");
  const msftAppendPath = path.join(tempCsvDir, "MSFT_append.csv");
  await replaceMarketBarsForInstrument("batch-aapl", "AAPL", [
    {
      ts: "2024-01-01T00:00:00.000Z",
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
      volume: 100,
    },
    {
      ts: "2024-01-02T00:00:00.000Z",
      open: 2,
      high: 3,
      low: 1,
      close: 2.5,
      volume: 200,
    },
  ]);
  await writeCsvRows(aaplAppendPath, [
    { date: "2024-01-03", open: 3, high: 4, low: 2, close: 3.5, volume: 300 },
    { date: "2024-01-04", open: 4, high: 5, low: 3, close: 4.5, volume: 400 },
  ]);
  await writeCsvRows(msftAppendPath, [
    { date: "2024-02-01", open: 10, high: 11, low: 9, close: 10.5, volume: 500 },
  ]);

  const results = await appendEdgeBarsForInstrumentsFromCsvFilesBatch([
    {
      instrumentId: "batch-aapl",
      symbol: "AAPL",
      filePath: aaplAppendPath,
      mapping: CSV_MAPPING,
      timezone: "Etc/UTC",
    },
    {
      instrumentId: "batch-msft",
      symbol: "MSFT",
      filePath: msftAppendPath,
      mapping: CSV_MAPPING,
      timezone: "Etc/UTC",
    },
  ]);

  const aaplResult = results.find((result) => result.instrumentId === "batch-aapl");
  const msftResult = results.find((result) => result.instrumentId === "batch-msft");
  assert.equal(aaplResult?.prependedRows, 0);
  assert.equal(aaplResult?.appendedRows, 2);
  assert.equal(msftResult?.appendedRows, 1);
  assert.equal(await getMarketBarCount("batch-aapl"), 4);
  assert.equal(await getMarketBarCount("batch-msft"), 1);
  assert.deepEqual(
    (await getMarketBarsByInstrumentId("batch-aapl")).map((bar) => bar.close),
    [1.5, 2.5, 3.5, 4.5],
  );
  assert.deepEqual(
    (await getMarketBarsByInstrumentId("batch-msft")).map((bar) => bar.close),
    [10.5],
  );
});

test("market CSV writers read exact file paths whose final segment ends in whitespace", async (t) => {
  const parentDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "zinuto-market-whitespace-path-"),
  );
  const spacedDir = path.join(parentDir, "staged folder ");
  await fs.promises.mkdir(spacedDir);
  t.after(async () => {
    await fs.promises.rm(parentDir, { recursive: true, force: true });
  });
  const fullPath = path.join(spacedDir, " AAPL.csv ");
  const appendPath = path.join(spacedDir, " AAPL-append.csv ");
  await writeCsvRows(fullPath, [
    { date: "2024-01-01", open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
  ]);
  await writeCsvRows(appendPath, [
    { date: "2024-01-02", open: 2, high: 3, low: 1, close: 2.5, volume: 200 },
  ]);

  const full = await replaceMarketBarsForInstrumentFromCsvFile(
    "whitespace-path-aapl",
    "AAPL",
    fullPath,
    CSV_MAPPING,
    "Etc/UTC",
    "csv",
  );
  const [incremental] = await appendEdgeBarsForInstrumentsFromCsvFilesBatch([{
    instrumentId: "whitespace-path-aapl",
    symbol: "AAPL",
    filePath: appendPath,
    mapping: CSV_MAPPING,
    timezone: "Etc/UTC",
    inputFormat: "csv",
  }]);

  assert.equal(full.importedRows, 1);
  assert.equal(incremental?.filePath, appendPath);
  assert.equal(incremental?.appendedRows, 1);
  assert.equal(await getMarketBarCount("whitespace-path-aapl"), 2);
});
