// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TRADING_CALENDAR_CONFIG,
  serializeTradingCalendarConfig,
} from "@zinuto/shared/tradingCalendar";
import { listLocalDataSourcesCore, type SourceListRow } from "../../src/application/dataSource/sourceQuery.js";

const DEFAULT_TRADING_CALENDAR_JSON = serializeTradingCalendarConfig(
  DEFAULT_TRADING_CALENDAR_CONFIG,
);

const buildRow = (
  overrides: Partial<SourceListRow> = {},
): SourceListRow => ({
  id: "source-1",
  name: "Test Source",
  sourceFolder: "/tmp/source",
  sourceFolderBookmarkId: "bookmark-1",
  importScopeStrategy: "FLAT",
  importScopeTopLevelSubfolder: null,
  timeZone: "Asia/Shanghai",
  timeZoneOrigin: "PRESET_DEFAULT",
  baseTimeframe: "1d",
  diagnosticAssetClass: "STOCK",
  diagnosticMarketPresetId: "A_SHARE",
  diagnosticProfileOrigin: "INFERRED",
  fieldMappingJson: "{}",
  tradingCalendarJson: DEFAULT_TRADING_CALENDAR_JSON,
  status: "READY",
  symbolCount: 1,
  barCount: 10,
  storageBytes: 10,
  timeStartTs: null,
  timeEndTs: null,
  totalFiles: 1,
  importedFiles: 1,
  failedFiles: 0,
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  lastJobId: null,
  lastJobStatus: null,
  lastJobStage: null,
  lastJobProgressPercent: null,
  lastJobCompactProgressPercent: null,
  lastJobCompactBeforeBytes: null,
  lastJobCompactAfterBytes: null,
  lastJobCompactReclaimedBytes: null,
  lastJobDoneFiles: null,
  lastJobTotalFiles: null,
  lastJobErrorFiles: null,
  lastJobStartedAt: null,
  lastJobFinishedAt: null,
  ...overrides,
});

const createDeps = (
  row: SourceListRow,
  importedInstruments = [
    {
      sourceId: row.id,
      instrumentId: "instrument-1",
      symbol: "000001",
      baseTimeframe: "1d" as const,
      barCount: 10,
      timeStartTs: null,
      timeEndTs: null,
      sourceIdForInstrument: row.id,
      sourceName: row.name,
    },
  ],
  latestFileRows: Array<{
    sourceId: string;
    instrumentId?: string | null;
    symbol: string;
    fileName?: string | null;
    filePath?: string | null;
    status: "QUEUED" | "IMPORTING" | "IMPORTED" | "FAILED";
    rowsImported: number;
  }> = [],
) => ({
  listSourcesRows: () => [row],
  listLatestSourceFileRows: () => latestFileRows,
  listAllImportedSourceInstruments: () => importedInstruments,
  getMarketStorageFootprint: async () => ({
    dbBytes: 0,
    totalBytes: 0,
  }),
  updateSourceStorageBytes: () => undefined,
  updateSourceProjectionSummary: () => undefined,
  parseStoredFieldMappingJson: () => ({}),
  normalizeProgressPercent: (value: number) => value,
  normalizeCompactProgressPercent: (value: number) => value,
  normalizeCount: (value: unknown) => Number(value ?? 0),
  toSafeStorageBytes: (value: unknown) => Number(value ?? 0),
  nowIso: () => "2026-04-01T00:00:00.000Z",
});

test("listLocalDataSourcesCore marks imported sources without source folders for rebind", async () => {
  const [summary] = await listLocalDataSourcesCore(
    createDeps(
      buildRow({
        sourceFolder: "",
        sourceFolderBookmarkId: "",
      }),
    ),
  );

  assert.ok(summary);
  assert.equal(summary.requiresSourceFolderRebind, true);
});

test("listLocalDataSourcesCore marks macOS imported sources without bookmarks for rebind", async () => {
  const [summary] = await listLocalDataSourcesCore(
    createDeps(
      buildRow({
        sourceFolderBookmarkId: "",
      }),
    ),
  );

  assert.ok(summary);
  assert.equal(
    summary.requiresSourceFolderRebind,
    process.platform === "darwin",
  );
});

test("listLocalDataSourcesCore keeps imported sources ready when folder and bookmark are present", async () => {
  const [summary] = await listLocalDataSourcesCore(createDeps(buildRow()));

  assert.ok(summary);
  assert.equal(summary.requiresSourceFolderRebind, false);
});

test("listLocalDataSourcesCore treats a legacy blank deletion state as idle", () => {
  const [summary] = listLocalDataSourcesCore(
    createDeps(buildRow({ deletionState: "" })),
  );

  assert.ok(summary);
  assert.equal(summary.sourceLocked, false);
  assert.deepEqual(summary.unlockedSymbols, ["000001"]);
});

test("listLocalDataSourcesCore locks importing sources for operational reads", async () => {
  const [summary] = await listLocalDataSourcesCore(
    createDeps(
      buildRow({
        status: "IMPORTING",
      }),
      [
        {
          sourceId: "source-1",
          instrumentId: "instrument-aapl",
          symbol: "AAPL",
          baseTimeframe: "1d" as const,
          barCount: 2,
          timeStartTs: "2024-01-01T00:00:00.000Z",
          timeEndTs: "2024-01-02T00:00:00.000Z",
          sourceIdForInstrument: "source-1",
          sourceName: "Test Source",
        },
      ],
    ),
  );

  assert.ok(summary);
  assert.equal(summary.sourceLocked, true);
  assert.equal(summary.lockReason, "LOCAL_DATA_SOURCE_IMPORTING");
  assert.deepEqual(summary.unlockedSymbols, []);
  assert.deepEqual(summary.lockedSymbols, ["AAPL"]);
  assert.equal(summary.lockedSymbolCount, 1);
});

test("listLocalDataSourcesCore locks failed sources until a repair import succeeds", () => {
  const [summary] = listLocalDataSourcesCore(
    createDeps(buildRow({ status: "FAILED" })),
  );

  assert.ok(summary);
  assert.equal(summary.sourceLocked, true);
  assert.equal(summary.lockReason, "LOCAL_DATA_SOURCE_IMPORT_FAILED");
  assert.deepEqual(summary.unlockedSymbols, []);
  assert.deepEqual(summary.lockedSymbols, ["000001"]);
});

test("listLocalDataSourcesCore locks a READY source while symbol mutation owns it", () => {
  const [summary] = listLocalDataSourcesCore(
    createDeps(
      buildRow({
        status: "READY",
        deletionState: "MUTATING_SYMBOLS",
      }),
    ),
  );

  assert.ok(summary);
  assert.equal(summary.sourceLocked, true);
  assert.equal(summary.lockReason, "LOCAL_DATA_SOURCE_MUTATION_IN_PROGRESS");
  assert.deepEqual(summary.unlockedSymbols, []);
  assert.deepEqual(summary.lockedSymbols, ["000001"]);
});

test("listLocalDataSourcesCore derives source and symbol ranges from imported instruments", async () => {
  const [summary] = await listLocalDataSourcesCore(
    createDeps(
      buildRow({
        barCount: 999,
        timeStartTs: "2099-01-01T00:00:00.000Z",
        timeEndTs: "2099-12-31T00:00:00.000Z",
      }),
      [
        {
          sourceId: "source-1",
          instrumentId: "instrument-bbb",
          symbol: "BBB",
          baseTimeframe: "1d" as const,
          barCount: 2,
          timeStartTs: "2024-02-01T00:00:00.000Z",
          timeEndTs: "2024-02-03T00:00:00.000Z",
          sourceIdForInstrument: "source-1",
          sourceName: "Test Source",
        },
        {
          sourceId: "source-1",
          instrumentId: "instrument-aaa",
          symbol: "AAA",
          baseTimeframe: "1d" as const,
          barCount: 5,
          timeStartTs: "2024-01-05T00:00:00.000Z",
          timeEndTs: "2024-03-10T00:00:00.000Z",
          sourceIdForInstrument: "source-1",
          sourceName: "Test Source",
        },
      ],
    ),
  );

  assert.ok(summary);
  assert.equal(summary.barCount, 7);
  assert.equal(summary.timeStartTs, "2024-01-05T00:00:00.000Z");
  assert.equal(summary.timeEndTs, "2024-03-10T00:00:00.000Z");
  assert.deepEqual(summary.symbols, ["AAA", "BBB"]);
  assert.deepEqual(
    summary.symbolStats.map((item) => [
      item.symbol,
      item.barCount,
      item.timeStartTs,
      item.timeEndTs,
    ]),
    [
      ["AAA", 5, "2024-01-05T00:00:00.000Z", "2024-03-10T00:00:00.000Z"],
      ["BBB", 2, "2024-02-01T00:00:00.000Z", "2024-02-03T00:00:00.000Z"],
    ],
  );
});

test("listLocalDataSourcesCore excludes failed files from trainable source instruments", async () => {
  const [summary] = await listLocalDataSourcesCore(
    createDeps(
      buildRow({
        totalFiles: 2,
        importedFiles: 1,
        failedFiles: 1,
      }),
      [
        {
          sourceId: "source-1",
          instrumentId: "instrument-aapl",
          symbol: "AAPL",
          baseTimeframe: "1d" as const,
          barCount: 2,
          timeStartTs: "2024-01-01T00:00:00.000Z",
          timeEndTs: "2024-01-02T00:00:00.000Z",
          sourceIdForInstrument: "source-1",
          sourceName: "Test Source",
        },
      ],
      [
        {
          sourceId: "source-1",
          instrumentId: "instrument-aapl",
          symbol: "AAPL",
          status: "IMPORTED",
          rowsImported: 2,
        },
        {
          sourceId: "source-1",
          instrumentId: null,
          symbol: "MSFT",
          status: "FAILED",
          rowsImported: 0,
        },
      ],
    ),
  );

  assert.ok(summary);
  assert.equal(summary.totalFiles, 2);
  assert.equal(summary.importedFiles, 1);
  assert.equal(summary.failedFiles, 1);
  assert.deepEqual(summary.symbols, ["AAPL"]);
  assert.deepEqual(
    summary.instruments.map((instrument) => instrument.symbol),
    ["AAPL"],
  );
});
