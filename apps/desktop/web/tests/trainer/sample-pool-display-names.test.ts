// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSystemPoolNameOverride } from "../../src/app-shell/appRootDataConfigUtils";
import {
  buildCustomSamplePoolsFromDataSources,
  normalizeCustomSamplePoolNameOverrides,
} from "../../src/app-shell/appSamplePools";
import {
  formatBuiltInSamplePoolDisplayName,
  resolveBuiltInSamplePoolDisplayMessageId,
} from "../../src/domains/trainer/samplePoolDisplayNames";
import {
  findBuiltInSamplePoolById,
  SAMPLE_POOL_SYSTEM_FX_1M_2025Q1_ID,
  SAMPLE_POOL_SYSTEM_ID,
} from "../../src/domains/trainer/samplePools";

test("built-in sample pool display names resolve ids, system aliases, and source names", () => {
  assert.equal(
    formatBuiltInSamplePoolDisplayName("zh-CN", SAMPLE_POOL_SYSTEM_ID),
    "美股日线内置样本池",
  );
  assert.equal(
    formatBuiltInSamplePoolDisplayName("en", "SYSTEM:1d", "SYSTEM_1D"),
    "Built-in US Stocks Daily Sample Pool",
  );
  assert.equal(
    formatBuiltInSamplePoolDisplayName("zh-CN", "SYSTEM:1m", "SYSTEM_1M"),
    "外汇1分钟内置样本池",
  );
  assert.equal(
    formatBuiltInSamplePoolDisplayName(
      "en",
      SAMPLE_POOL_SYSTEM_FX_1M_2025Q1_ID,
      "HistData FX 1m 2025 Q1",
    ),
    "Built-in FX 1m Sample Pool",
  );
  assert.equal(
    formatBuiltInSamplePoolDisplayName(
      "es",
      "",
      "Nasdaq Data Link WIKI EOD 100",
    ),
    "Pool de muestras incluido de acciones de EE. UU. (diario)",
  );
});

test("built-in HistData FX pool displays the market clock", () => {
  const fxPool = findBuiltInSamplePoolById(
    SAMPLE_POOL_SYSTEM_FX_1M_2025Q1_ID,
  );
  assert.equal(fxPool?.marketPresetId, "FOREX_STANDARD_LOT");
  assert.equal(fxPool?.timeZone, "America/New_York");
});

test("built-in sample pool override normalization drops default and source aliases only", () => {
  assert.equal(
    normalizeSystemPoolNameOverride(
      SAMPLE_POOL_SYSTEM_FX_1M_2025Q1_ID,
      "HistData FX 1m 2025 Q1",
    ),
    "",
  );
  assert.equal(
    normalizeSystemPoolNameOverride(
      SAMPLE_POOL_SYSTEM_ID,
      "美股日线内置样本池",
    ),
    "",
  );
  assert.equal(
    normalizeSystemPoolNameOverride(
      SAMPLE_POOL_SYSTEM_FX_1M_2025Q1_ID,
      "My FX research pool",
    ),
    "My FX research pool",
  );
  assert.equal(
    resolveBuiltInSamplePoolDisplayMessageId("local-pool", "My FX research pool"),
    null,
  );
});

test("custom sample pool name overrides retain valid local names only", () => {
  assert.deepEqual(
    normalizeCustomSamplePoolNameOverrides({
      "source-1": "My research pool",
      [SAMPLE_POOL_SYSTEM_ID]: "Should be ignored",
      "": "Missing id",
      "source-2": "pool-2026-01-abcd",
    }),
    { "source-1": "My research pool" },
  );
});

test("data-source refresh reapplies a custom sample pool name override", () => {
  const source = {
    id: "source-1",
    status: "READY",
    name: "Original import name",
    baseTimeframe: "1d",
    sourceLocked: false,
    unlockedSymbols: [],
    instruments: [
      {
        instrumentId: "instrument-1",
        samplePoolId: "source-1",
        symbol: "AAPL",
        displayLabel: "AAPL",
        sourceTimeframe: "1d",
        barCount: 100,
      },
    ],
    diagnosticProfile: { assetClass: "STOCK", marketPresetId: "US_STOCK" },
    fieldMapping: null,
    sourceFolder: "",
    sourceFolderBookmarkId: "",
    importScopeStrategy: null,
    importScopeTopLevelSubfolder: "",
    lockedSymbols: [],
    lockedSymbolCount: 0,
    lockReason: null,
    totalFiles: 1,
    storageBytes: 1024,
    tradingCalendar: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as Parameters<typeof buildCustomSamplePoolsFromDataSources>[0][number];

  const pools = buildCustomSamplePoolsFromDataSources(
    [source],
    undefined,
    () => "Renamed research",
  );

  assert.equal(pools[0]?.name, "Renamed research");
});

test("custom sample pools use the same ready-and-idle eligibility as local training", () => {
  const source = {
    id: "source-eligibility",
    status: "READY",
    name: "Eligibility source",
    baseTimeframe: "1d",
    sourceLocked: false,
    unlockedSymbols: ["AAPL"],
    instruments: [
      {
        instrumentId: "instrument-eligibility",
        samplePoolId: "source-eligibility",
        symbol: "AAPL",
        displayLabel: "AAPL",
        sourceTimeframe: "1d",
        barCount: 100,
      },
    ],
    diagnosticProfile: { assetClass: "STOCK", marketPresetId: "US_STOCK" },
    fieldMapping: null,
    sourceFolder: "",
    sourceFolderBookmarkId: "",
    importScopeStrategy: null,
    importScopeTopLevelSubfolder: "",
    lockedSymbols: [],
    lockedSymbolCount: 0,
    lockReason: null,
    totalFiles: 1,
    storageBytes: 1024,
    tradingCalendar: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as Parameters<typeof buildCustomSamplePoolsFromDataSources>[0][number];

  const poolCount = (overrides: Record<string, unknown>) =>
    buildCustomSamplePoolsFromDataSources([
      { ...source, ...overrides },
    ]).length;

  assert.equal(poolCount({ status: "READY", sourceLocked: false }), 1);
  // Older rows have no deletion state. The local API exposes them unlocked.
  assert.equal(poolCount({ status: "READY", sourceLocked: false }), 1);
  assert.equal(poolCount({ status: "FAILED", sourceLocked: true }), 0);
  assert.equal(poolCount({ status: "IMPORTING", sourceLocked: true }), 0);
  assert.equal(poolCount({ status: "READY", sourceLocked: true }), 0);
});
