// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { parseTimestampMsInTimeZone } from "@zinuto/shared/timezone";

import {
  generateSystemSeedBars,
  getSystemSeedManifestSummaries,
  getSystemSeedStorageEstimate,
  getSystemSeedStorageEstimatesByPoolId,
  listSystemSeedInstruments,
  listSystemSeedSymbols,
  resolveSystemSeedBaseTimeframe,
  resolveSystemSeedInstrumentMetadata,
  resolveSystemSeedPoolBaseTimeframe,
  SYSTEM_BARS_SEED_VERSION,
  SYSTEM_FX_1M_2025Q1_MARKET_PRESET_ID,
  SYSTEM_FX_1M_2025Q1_MIN_TRADE_STEP,
  SYSTEM_FX_1M_2025Q1_POOL_ID,
  SYSTEM_FX_1M_2025Q1_SEED_VERSION,
  SYSTEM_FX_1M_2025Q1_SOURCE_NAME,
  SYSTEM_FX_1M_2025Q1_TIMESTAMP_TIME_ZONE,
  SYSTEM_FX_1M_2025Q1_TIME_ZONE,
  SYSTEM_SEED_MARKET_PRESET_ID,
  SYSTEM_SEED_MIN_TRADE_STEP,
  SYSTEM_SEED_SOURCE_NAME,
  SYSTEM_SEED_TIME_ZONE,
  SYSTEM_WIKI_EOD_POOL_ID,
  SYSTEM_WIKI_EOD_SEED_VERSION,
} from "../../src/infrastructure/db/systemSeedBars.js";

type Manifest = {
  version: string;
  sourceName: string;
  timeZone: string;
  timestampTimeZone?: string;
  baseTimeframe: "1m" | "1d";
  marketPresetId: string;
  assetClass: "STOCK" | "FOREX";
  minTradeStep: number;
  selectedSymbolCount: number;
  totalRows: number;
  storageEstimate: {
    rawCsvBytes: number;
    compressedAssetBytes: number;
    seededDuckDbBytes: number;
  };
  droppedRows: Array<{
    symbol: string;
    lineNumber: number;
    date?: string;
    datetime?: string;
    reason: string;
  }>;
  symbols: Array<{
    symbol: string;
    fileName: string;
    rowCount: number;
    firstDate: string;
    lastDate: string;
    compressedBytes: number;
    sha256: string;
  }>;
};

const assetBaseRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/infrastructure/assets/system-market-seed",
);
const wikiAssetRoot = path.join(assetBaseRoot, "wiki-eod-100");
const fxAssetRoot = path.join(assetBaseRoot, "histdata-fx-1m-2025q1");
const wikiManifest = JSON.parse(
  fs.readFileSync(path.join(wikiAssetRoot, "manifest.json"), "utf8"),
) as Manifest;
const fxManifest = JSON.parse(
  fs.readFileSync(path.join(fxAssetRoot, "manifest.json"), "utf8"),
) as Manifest;

const tempDbDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-system-seed-"),
);
process.env.ZINUTO_DB_PATH = path.join(tempDbDir, "zinuto.db");

const { db } = await import("../../src/infrastructure/db/database.js");
const { getBarsByInstrumentIdRange, listInstruments } = await import("../../src/application/trading/sessionService.js");
const { getBarsByInstrumentIdRange: getCoreBarsByInstrumentIdRange } = await import(
  "../../src/application/trading/core.js",
);
const { getMarketBarCount, replaceMarketBarsForInstrument } = await import(
  "../../src/infrastructure/db/marketDatabase.js"
);

test.after(async () => {
  db.close();
  delete process.env.ZINUTO_DB_PATH;
  await fs.promises.rm(tempDbDir, { recursive: true, force: true });
});

const validateManifestAssets = ({
  manifest,
  assetRoot,
  header,
  timestampPattern,
}: {
  manifest: Manifest;
  assetRoot: string;
  header: string;
  timestampPattern: RegExp;
}) => {
  for (const symbolEntry of manifest.symbols) {
    const filePath = path.join(assetRoot, symbolEntry.fileName);
    const compressed = fs.readFileSync(filePath);
    assert.equal(compressed.byteLength, symbolEntry.compressedBytes);
    assert.equal(
      crypto.createHash("sha256").update(compressed).digest("hex"),
      symbolEntry.sha256,
    );

    const lines = zlib.gunzipSync(compressed).toString("utf8").trim().split(/\r?\n/);
    assert.equal(lines[0], header);
    assert.equal(lines.length - 1, symbolEntry.rowCount);

    let previousTimestamp = "";
    const seenTimestamps = new Set<string>();
    for (const [index, line] of lines.slice(1).entries()) {
      const [timestamp, openRaw, highRaw, lowRaw, closeRaw, volumeRaw] = line.split(",");
      assert.match(timestamp ?? "", timestampPattern);
      assert.equal(seenTimestamps.has(timestamp ?? ""), false, `${symbolEntry.symbol}:${timestamp}`);
      assert.equal(previousTimestamp === "" || previousTimestamp < (timestamp ?? ""), true);
      seenTimestamps.add(timestamp ?? "");
      previousTimestamp = timestamp ?? "";

      const open = Number(openRaw);
      const high = Number(highRaw);
      const low = Number(lowRaw);
      const close = Number(closeRaw);
      const volume = Number(volumeRaw);
      assert.equal(Number.isFinite(open) && open > 0, true);
      assert.equal(Number.isFinite(high) && high > 0, true);
      assert.equal(Number.isFinite(low) && low > 0, true);
      assert.equal(Number.isFinite(close) && close > 0, true);
      assert.equal(Number.isFinite(volume) && volume >= 0, true);
      assert.equal(high >= Math.max(open, low, close), true, `${symbolEntry.symbol}:${index}`);
      assert.equal(low <= Math.min(open, high, close), true, `${symbolEntry.symbol}:${index}`);
    }
  }
};

test("system seed asset manifests and compressed CSV files are valid", () => {
  assert.equal(
    SYSTEM_BARS_SEED_VERSION,
    "2026-07-30-v3-system-market-seed-wiki-eod-100-fx-1m-fixed-est",
  );

  assert.equal(wikiManifest.version, SYSTEM_WIKI_EOD_SEED_VERSION);
  assert.equal(wikiManifest.sourceName, SYSTEM_SEED_SOURCE_NAME);
  assert.equal(wikiManifest.timeZone, SYSTEM_SEED_TIME_ZONE);
  assert.equal(wikiManifest.baseTimeframe, "1d");
  assert.equal(wikiManifest.marketPresetId, SYSTEM_SEED_MARKET_PRESET_ID);
  assert.equal(wikiManifest.minTradeStep, SYSTEM_SEED_MIN_TRADE_STEP);
  assert.equal(wikiManifest.selectedSymbolCount, 100);
  assert.equal(wikiManifest.totalRows, 815_637);
  assert.equal(wikiManifest.droppedRows.length, 14);
  assert.deepEqual(wikiManifest.storageEstimate, {
    rawCsvBytes: 67_144_474,
    compressedAssetBytes: 19_384_143,
    seededDuckDbBytes: 72_626_176,
  });

  assert.equal(fxManifest.version, SYSTEM_FX_1M_2025Q1_SEED_VERSION);
  assert.equal(fxManifest.sourceName, SYSTEM_FX_1M_2025Q1_SOURCE_NAME);
  assert.equal(fxManifest.timeZone, SYSTEM_FX_1M_2025Q1_TIME_ZONE);
  assert.equal(SYSTEM_FX_1M_2025Q1_TIME_ZONE, "America/New_York");
  assert.equal(
    fxManifest.timestampTimeZone,
    SYSTEM_FX_1M_2025Q1_TIMESTAMP_TIME_ZONE,
  );
  assert.equal(SYSTEM_FX_1M_2025Q1_TIMESTAMP_TIME_ZONE, "Etc/GMT+5");
  assert.equal(fxManifest.baseTimeframe, "1m");
  assert.equal(fxManifest.marketPresetId, SYSTEM_FX_1M_2025Q1_MARKET_PRESET_ID);
  assert.equal(fxManifest.assetClass, "FOREX");
  assert.equal(fxManifest.minTradeStep, SYSTEM_FX_1M_2025Q1_MIN_TRADE_STEP);
  assert.equal(fxManifest.selectedSymbolCount, 13);
  assert.equal(fxManifest.totalRows, 1_154_459);
  assert.equal(fxManifest.droppedRows.length, 0);
  assert.deepEqual(fxManifest.storageEstimate, {
    rawCsvBytes: 55_695_985,
    compressedAssetBytes: 10_447_456,
    seededDuckDbBytes: 70_791_168,
  });

  validateManifestAssets({
    manifest: wikiManifest,
    assetRoot: wikiAssetRoot,
    header: "date,adj_open,adj_high,adj_low,adj_close,adj_volume",
    timestampPattern: /^\d{4}-\d{2}-\d{2}$/,
  });
  validateManifestAssets({
    manifest: fxManifest,
    assetRoot: fxAssetRoot,
    header: "datetime,open,high,low,close,volume",
    timestampPattern: /^\d{14}$/,
  });
});

test("system seed helpers expose WIKI daily and FX 1m universes", () => {
  const summaries = getSystemSeedManifestSummaries();
  const storageEstimate = getSystemSeedStorageEstimate();
  const storageByPoolId = getSystemSeedStorageEstimatesByPoolId();
  const seedInstruments = listSystemSeedInstruments();
  const symbols = listSystemSeedSymbols();

  assert.deepEqual(
    summaries.map((summary) => summary.poolId),
    [SYSTEM_WIKI_EOD_POOL_ID, SYSTEM_FX_1M_2025Q1_POOL_ID],
  );
  assert.deepEqual(storageByPoolId[SYSTEM_WIKI_EOD_POOL_ID], wikiManifest.storageEstimate);
  assert.deepEqual(storageByPoolId[SYSTEM_FX_1M_2025Q1_POOL_ID], fxManifest.storageEstimate);
  assert.deepEqual(storageEstimate, {
    rawCsvBytes: 122_840_459,
    compressedAssetBytes: 29_831_599,
    seededDuckDbBytes: 143_417_344,
  });

  assert.equal(seedInstruments.length, 113);
  assert.equal(symbols.length, 113);
  assert.equal(new Set(seedInstruments.map((item) => `${item.baseTimeframe}:${item.symbol}`)).size, 113);
  assert.equal(symbols.includes("AAPL"), true);
  assert.equal(symbols.includes("YHOO"), true);
  assert.equal(symbols.includes("EURUSD"), true);
  assert.equal(symbols.includes("GBPCHF"), true);
  assert.equal(symbols.includes("ZINUTO.CN"), false);
  assert.equal(resolveSystemSeedBaseTimeframe("AAPL"), "1d");
  assert.equal(resolveSystemSeedBaseTimeframe("EURUSD"), "1m");
  assert.equal(resolveSystemSeedBaseTimeframe("ZINUTO.CN"), null);
  assert.equal(resolveSystemSeedPoolBaseTimeframe(SYSTEM_WIKI_EOD_POOL_ID), "1d");
  assert.equal(
    resolveSystemSeedPoolBaseTimeframe(SYSTEM_FX_1M_2025Q1_POOL_ID),
    "1m",
  );
  assert.equal(resolveSystemSeedPoolBaseTimeframe("__missing_system_pool__"), null);

  const aaplBars = generateSystemSeedBars("AAPL", "1d");
  assert.equal(aaplBars.length, 9_400);
  assert.equal(aaplBars[0]?.ts, "1980-12-12T05:00:00.000Z");
  assert.equal(aaplBars.at(-1)?.ts, "2018-03-27T04:00:00.000Z");

  const eurUsdBars = generateSystemSeedBars("EURUSD", "1m");
  assert.equal(eurUsdBars.length, 89_013);
  assert.equal(eurUsdBars[0]?.ts, "2025-01-02T05:00:00.000Z");
  assert.equal(eurUsdBars.at(-1)?.ts, "2025-03-31T04:59:00.000Z");
  assert.equal(
    new Date(
      parseTimestampMsInTimeZone(
        "20250310000000",
        SYSTEM_FX_1M_2025Q1_TIMESTAMP_TIME_ZONE,
      ),
    ).toISOString(),
    "2025-03-10T05:00:00.000Z",
  );
  assert.equal(generateSystemSeedBars("ZINOUSD.PERP").length, 0);
});

test("system market metadata sync deletes stale synthetic instruments without boot-time full hydration", async () => {
  const staleRows = [
    {
      id: "stale-system-zinuto-cn",
      symbol: "ZINUTO.CN",
      timeframe: "1d",
    },
    {
      id: "stale-system-zinousd-perp",
      symbol: "ZINOUSD.PERP",
      timeframe: "1m",
    },
    {
      id: "stale-system-aapl-1m",
      symbol: "AAPL",
      timeframe: "1m",
    },
  ];
  const insertStale = db.prepare(
    `INSERT INTO instruments (id,symbol,base_timeframe,name,market,time_zone,min_trade_step,bar_count,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  );
  for (const row of staleRows) {
    insertStale.run(
      row.id,
      row.symbol,
      row.timeframe,
      row.symbol,
      "SYSTEM",
      "Asia/Shanghai",
      100,
      1,
      "2026-04-27T00:00:00.000Z",
    );
  }
  await replaceMarketBarsForInstrument(staleRows[1].id, staleRows[1].symbol, [
    {
      ts: "2024-01-02T01:30:00.000Z",
      open: 1,
      high: 2,
      low: 1,
      close: 2,
      volume: 100,
    },
  ]);
  assert.equal(await getMarketBarCount(staleRows[1].id), 1);

  const instruments = await listInstruments();
  const systemInstruments = instruments.filter((item) => item.scopeKind === "SYSTEM");
  const expectedByKey = new Map(
    listSystemSeedInstruments().map((item) => [`${item.baseTimeframe}:${item.symbol}`, item]),
  );

  assert.equal(systemInstruments.length, 113);
  assert.equal(systemInstruments.some((item) => item.symbol === "ZINUTO.CN"), false);
  assert.equal(systemInstruments.some((item) => item.symbol === "ZINOUSD.PERP"), false);
  assert.equal(systemInstruments.some((item) => item.symbol === "AAPL" && item.baseTimeframe === "1m"), false);
  assert.equal(await getMarketBarCount(staleRows[1].id), 0);
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS count FROM instruments WHERE symbol IN ('ZINUTO.CN','ZINOUSD.PERP') OR (symbol = 'AAPL' AND base_timeframe = '1m')").get() as { count: number }).count,
    0,
  );

  for (const instrument of systemInstruments) {
    const expected = expectedByKey.get(`${instrument.baseTimeframe}:${instrument.symbol}`);
    assert.ok(expected, `${instrument.baseTimeframe}:${instrument.symbol}`);
    assert.equal(instrument.timeZone, expected.timeZone);
    assert.equal(instrument.marketPresetId, expected.marketPresetId);
    assert.equal(instrument.minTradeStep, expected.minTradeStep);
    assert.equal(instrument.sourceId, null);
    assert.equal(instrument.name, expected.name);
    assert.ok(instrument.barCount > 0);
    const expectedMetadata = resolveSystemSeedInstrumentMetadata(
      instrument.symbol,
      instrument.baseTimeframe,
    );
    assert.ok(expectedMetadata, `${instrument.baseTimeframe}:${instrument.symbol}:metadata`);
    assert.equal(instrument.timeStartTs, expectedMetadata.timeStartTs);
    assert.equal(instrument.timeEndTs, expectedMetadata.timeEndTs);
  }

  const aapl = systemInstruments.find((item) => item.symbol === "AAPL" && item.baseTimeframe === "1d");
  const eurUsd = systemInstruments.find((item) => item.symbol === "EURUSD" && item.baseTimeframe === "1m");
  assert.ok(aapl);
  assert.ok(eurUsd);
  assert.equal(await getMarketBarCount(aapl.id), 0);
  assert.equal(await getMarketBarCount(eurUsd.id), 0);

  const aaplBars = await getBarsByInstrumentIdRange(aapl.id, 0, 5);
  assert.equal(aaplBars.bars.length, 5);
  assert.equal(await getMarketBarCount(aapl.id), 9_400);
  assert.equal(await getMarketBarCount(eurUsd.id), 0);
});

test("instrument catalog reads do not reconcile every local market row", async () => {
  const instrumentId = "catalog-read-local-instrument";
  const sourceId = "catalog-read-local-source";
  db.prepare(
    `INSERT INTO local_data_sources (
      id,name,time_zone,base_timeframe,field_mapping_json,trading_calendar_json,status,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    sourceId,
    "Catalog read source",
    "Asia/Shanghai",
    "1d",
    "{}",
    '{"tradingDays":[1,2,3,4,5],"sessions":[{"startMinute":0,"endMinute":1440,"crossesMidnight":false}]}',
    "READY",
    "2026-07-31T00:00:00.000Z",
    "2026-07-31T00:00:00.000Z",
  );
  db.prepare(
    `INSERT INTO instruments (id,source_id,symbol,base_timeframe,name,market,time_zone,min_trade_step,bar_count,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    instrumentId,
    sourceId,
    "CATALOG.READ.LOCAL",
    "1d",
    "Catalog read local",
    "LOCAL",
    "Asia/Shanghai",
    1,
    0,
    "2026-07-31T00:00:00.000Z",
  );
  await replaceMarketBarsForInstrument(instrumentId, "CATALOG.READ.LOCAL", [
    {
      ts: "2026-01-02T00:00:00.000Z",
      open: 1,
      high: 2,
      low: 1,
      close: 2,
      volume: 100,
    },
  ]);
  db.prepare("UPDATE instruments SET bar_count = 0 WHERE id = ?").run(instrumentId);

  const catalog = await listInstruments({ query: "CATALOG.READ.LOCAL" });
  assert.equal(catalog[0]?.barCount, 0);
  assert.equal(
    (db.prepare("SELECT bar_count AS barCount FROM instruments WHERE id = ?").get(instrumentId) as {
      barCount: number;
    }).barCount,
    0,
  );

  const frame = await getCoreBarsByInstrumentIdRange(instrumentId, 0, 10);
  assert.equal(frame.total, 1);
  assert.equal(frame.bars.length, 1);
  assert.equal(
    (db.prepare("SELECT bar_count AS barCount FROM instruments WHERE id = ?").get(instrumentId) as {
      barCount: number;
    }).barCount,
    1,
  );
});
