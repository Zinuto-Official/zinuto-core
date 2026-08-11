// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLocalDataSourceDiagnostics,
  createEmptyLocalDataSourceDiagnostics,
} from "../../src/application/dataSource/sourceDiagnostics.js";
import {
  buildLocalDataSourceDiagnosticsCache,
  parseCachedLocalDataSourceDiagnostics,
  parseCachedLocalDataSourceSymbolDiagnostics,
} from "../../src/application/dataSource/sourceDiagnosticsCache.js";
import type { MarketSymbolDiagnosticsSnapshot } from "../../src/infrastructure/db/marketDatabase.js";
import type { LocalDataSourceDiagnosticProfile } from "../../src/application/dataSource/types.js";

const profile = (
  assetClass: LocalDataSourceDiagnosticProfile["assetClass"],
): LocalDataSourceDiagnosticProfile => ({
  assetClass,
  marketPresetId:
    assetClass === "FOREX"
      ? "FOREX_STANDARD_LOT"
      : assetClass === "CRYPTO"
        ? "CRYPTO_SPOT"
        : assetClass === "FUTURES"
          ? "FUTURES_COMMODITY"
          : "US_STOCK",
  profileOrigin: "INFERRED",
});

const emptySnapshot = (
  overrides: Partial<MarketSymbolDiagnosticsSnapshot> = {},
): MarketSymbolDiagnosticsSnapshot => ({
  totalBars: 300,
  volatilityPercent: 1.25,
  highPrice: 120,
  lowPrice: 80,
  invalidOhlcItems: [],
  duplicateTimestampItems: [],
  timeOrderItems: [],
  gaps: [],
  extremePriceSpikeItems: [],
  ...overrides,
});

test("source diagnostics returns a building empty source summary", () => {
  const result = createEmptyLocalDataSourceDiagnostics(
    "source-1",
    "1d",
    profile("STOCK"),
    "BUILDING",
    4,
  );

  assert.equal(result.sourceId, "source-1");
  assert.equal(result.status, "BUILDING");
  assert.equal(result.profile.assetClass, "STOCK");
  assert.equal(result.totalSymbols, 4);
  assert.equal(result.summary.totalIssues, 0);
  assert.deepEqual(result.items, []);
});

test("source diagnostics keeps clean symbols in the scanned summary", () => {
  const result = buildLocalDataSourceDiagnostics({
    sourceId: "source-clean",
    baseTimeframe: "1m",
    profile: profile("STOCK"),
    instruments: [{ instrumentId: "instrument-clean", symbol: "CLEAN" }],
    snapshotsByInstrumentId: new Map([["instrument-clean", emptySnapshot()]]),
  });

  assert.equal(result.status, "READY");
  assert.equal(result.totalSymbols, 1);
  assert.equal(result.scannedSymbols, 1);
  assert.equal(result.affectedSymbols, 0);
  assert.equal(result.totalIssues, 0);
  assert.equal(result.summary.totalIssues, 0);
  assert.deepEqual(result.items, []);
  assert.deepEqual(
    result.symbols.map((symbol) => [symbol.symbol, symbol.issueCount]),
    [["CLEAN", 0]],
  );
});

test("low-noise diagnostics only report time integrity and extreme anomaly issues", () => {
  const result = buildLocalDataSourceDiagnostics({
    sourceId: "source-universal",
    baseTimeframe: "1m",
    profile: profile("STOCK"),
    instruments: [{ instrumentId: "instrument-a", symbol: "AAA" }],
    snapshotsByInstrumentId: new Map([
      [
        "instrument-a",
        emptySnapshot({
          totalBars: 10,
          invalidOhlcItems: [
            { rawIndex: 1, ts: "2025-01-02T00:00:00.000Z", count: 1 },
          ],
          duplicateTimestampItems: [
            {
              rawIndex: 2,
              ts: "2025-01-03T00:00:00.000Z",
              duplicateCount: 2,
            },
          ],
          timeOrderItems: [
            {
              rawIndex: 3,
              ts: "2025-01-02T00:00:00.000Z",
              previousTs: "2025-01-03T00:00:00.000Z",
            },
          ],
          gaps: [
            {
              rawIndex: 4,
              missingBars: 2,
              missingStartTs: "2025-01-05T09:31:00.000Z",
              missingEndTs: "2025-01-05T09:32:00.000Z",
              deltaMs: 180000,
              baseIntervalMs: 60000,
              repeatCount: 1,
              repeatRatio: 0.01,
            },
          ],
          extremePriceSpikeItems: [
            {
              rawIndex: 7,
              ts: "2025-01-09T00:00:00.000Z",
              closeChangeRatio: 0.08,
              amplitudeRatio: 0.22,
              zScore: 12,
              multiple: 11,
            },
          ],
        }),
      ],
    ]),
  });

  assert.deepEqual(
    result.items.map((item) => item.code).sort(),
    [
      "DATA_GAP",
      "DUPLICATE_TIMESTAMP",
      "EXTREME_PRICE_SPIKE",
      "INVALID_OHLC",
      "TIME_ORDER_BREAK",
    ].sort(),
  );
  assert.equal(result.summary.criticalIssues, 4);
  assert.equal(result.summary.warningIssues, 1);
  assert.deepEqual(result.summary.byCategory, {
    TIME_INTEGRITY: 3,
    EXTREME_ANOMALY: 2,
  });
});

test("source diagnostics paginates filtered items while summary stays global", () => {
  const result = buildLocalDataSourceDiagnostics({
    sourceId: "source-paged",
    baseTimeframe: "1m",
    profile: profile("STOCK"),
    instruments: [{ instrumentId: "instrument-a", symbol: "AAA" }],
    snapshotsByInstrumentId: new Map([
      [
        "instrument-a",
        emptySnapshot({
          invalidOhlcItems: [
            { rawIndex: 1, ts: "2025-01-02T00:00:00.000Z", count: 1 },
          ],
          duplicateTimestampItems: [
            {
              rawIndex: 2,
              ts: "2025-01-03T00:00:00.000Z",
              duplicateCount: 2,
            },
          ],
          gaps: [
            {
              rawIndex: 4,
              missingBars: 2,
              missingStartTs: "2025-01-05T09:31:00.000Z",
              missingEndTs: "2025-01-05T09:32:00.000Z",
              deltaMs: 180000,
              baseIntervalMs: 60000,
              repeatCount: 1,
              repeatRatio: 0.01,
            },
          ],
        }),
      ],
    ]),
    query: { category: "TIME_INTEGRITY", limit: 1 },
  });

  assert.equal(result.summary.totalIssues, 3);
  assert.equal(result.totalIssues, 3);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.category, "TIME_INTEGRITY");
  assert.equal(result.nextCursor, "1");
});

test("stock daily holidays and repeated intraday breaks are not treated as gaps", () => {
  const result = buildLocalDataSourceDiagnostics({
    sourceId: "stock-source",
    baseTimeframe: "1m",
    profile: profile("STOCK"),
    instruments: [{ instrumentId: "instrument-a", symbol: "AAA" }],
    snapshotsByInstrumentId: new Map([
      [
        "instrument-a",
        emptySnapshot({
          gaps: [
            {
              rawIndex: 4,
              missingBars: 60,
              missingStartTs: "2025-01-02T03:30:00.000Z",
              missingEndTs: "2025-01-02T04:29:00.000Z",
              deltaMs: 3660000,
              baseIntervalMs: 60000,
              repeatCount: 10,
              repeatRatio: 0.004,
            },
            {
              rawIndex: 8,
              missingBars: 1080,
              missingStartTs: "2025-01-02T06:01:00.000Z",
              missingEndTs: "2025-01-03T00:00:00.000Z",
              deltaMs: 64860000,
              baseIntervalMs: 60000,
              repeatCount: 1,
              repeatRatio: 0.0004,
            },
          ],
        }),
      ],
    ]),
  });

  assert.deepEqual(result.items, []);
});

test("same-session missing bars are still reported", () => {
  const result = buildLocalDataSourceDiagnostics({
    sourceId: "stock-source",
    baseTimeframe: "1m",
    profile: profile("STOCK"),
    instruments: [{ instrumentId: "instrument-a", symbol: "AAA" }],
    snapshotsByInstrumentId: new Map([
      [
        "instrument-a",
        emptySnapshot({
          gaps: [
            {
              rawIndex: 10,
              missingBars: 3,
              missingStartTs: "2025-01-03T02:14:00.000Z",
              missingEndTs: "2025-01-03T02:16:00.000Z",
              deltaMs: 240000,
              baseIntervalMs: 60000,
              repeatCount: 2,
              repeatRatio: 0.5,
            },
            {
              rawIndex: 20,
              missingBars: 3,
              missingStartTs: "2025-01-03T05:44:00.000Z",
              missingEndTs: "2025-01-03T05:46:00.000Z",
              deltaMs: 240000,
              baseIntervalMs: 60000,
              repeatCount: 2,
              repeatRatio: 0.5,
            },
          ],
        }),
      ],
    ]),
  });

  assert.deepEqual(
    result.items.map((item) => item.code),
    ["DATA_GAP", "DATA_GAP"],
  );
  assert.equal(result.items[0]?.category, "TIME_INTEGRITY");
});

test("source diagnostics reports timeframe-misaligned bars as time integrity warnings", () => {
  const result = buildLocalDataSourceDiagnostics({
    sourceId: "stock-source",
    baseTimeframe: "1h",
    profile: profile("STOCK"),
    instruments: [{ instrumentId: "instrument-a", symbol: "AAA" }],
    snapshotsByInstrumentId: new Map([
      [
        "instrument-a",
        emptySnapshot({
          timeframeMisalignedItems: [
            {
              rawIndex: 12,
              ts: "2025-01-03T04:10:00.000Z",
              count: 1,
            },
          ],
        }),
      ],
    ]),
  });

  assert.deepEqual(result.items.map((item) => item.code), [
    "TIMEFRAME_MISALIGNED_BAR",
  ]);
  assert.equal(result.items[0]?.category, "TIME_INTEGRITY");
  assert.equal(result.items[0]?.severity, "WARNING");
});

test("forex tolerates weekend gaps and reports weekday gaps", () => {
  const result = buildLocalDataSourceDiagnostics({
    sourceId: "forex-source",
    baseTimeframe: "1d",
    profile: profile("FOREX"),
    instruments: [{ instrumentId: "instrument-eurusd", symbol: "EURUSD" }],
    snapshotsByInstrumentId: new Map([
      [
        "instrument-eurusd",
        emptySnapshot({
          gaps: [
            {
              rawIndex: 4,
              missingBars: 2,
              missingStartTs: "2025-01-04T00:00:00.000Z",
              missingEndTs: "2025-01-05T00:00:00.000Z",
              deltaMs: 259200000,
              baseIntervalMs: 86400000,
              repeatCount: 1,
              repeatRatio: 0.01,
            },
            {
              rawIndex: 8,
              missingBars: 3,
              missingStartTs: "2025-01-07T00:00:00.000Z",
              missingEndTs: "2025-01-09T00:00:00.000Z",
              deltaMs: 345600000,
              baseIntervalMs: 86400000,
              repeatCount: 1,
              repeatRatio: 0.01,
            },
          ],
        }),
      ],
    ]),
  });

  assert.deepEqual(result.items.map((item) => item.code), ["DATA_GAP"]);
});

test("isolated price spikes are reported as extreme anomalies", () => {
  const result = buildLocalDataSourceDiagnostics({
    sourceId: "spike-source",
    baseTimeframe: "1d",
    profile: profile("STOCK"),
    instruments: [{ instrumentId: "instrument-a", symbol: "AAA" }],
    snapshotsByInstrumentId: new Map([
      [
        "instrument-a",
        emptySnapshot({
          extremePriceSpikeItems: [
            {
              rawIndex: 5,
              ts: "2025-01-05T00:00:00.000Z",
              closeChangeRatio: 0.15,
              amplitudeRatio: 0.18,
              zScore: 15,
              multiple: 12,
            },
          ],
        }),
      ],
    ]),
  });

  assert.deepEqual(result.items.map((item) => [item.category, item.code]), [
    ["EXTREME_ANOMALY", "EXTREME_PRICE_SPIKE"],
  ]);
});

test("source diagnostics cache builds source and symbol payloads once", async () => {
  const snapshotCalls: string[] = [];
  const result = await buildLocalDataSourceDiagnosticsCache({
    sourceId: "source-cache",
    baseTimeframe: "1m",
    profile: profile("STOCK"),
    generatedAt: "2026-01-01T00:00:00.000Z",
    instruments: [
      { instrumentId: "instrument-a", symbol: "aaa" },
      { instrumentId: "instrument-b", symbol: "BBB" },
    ],
    loadSnapshot: async (instrumentId) => {
      snapshotCalls.push(instrumentId);
      return emptySnapshot(
        instrumentId === "instrument-a"
          ? {
              gaps: [
                {
                  rawIndex: 12,
                  missingBars: 3,
                  missingStartTs: "2025-01-01T09:31:00.000Z",
                  missingEndTs: "2025-01-01T09:33:00.000Z",
                  deltaMs: 240000,
                  baseIntervalMs: 60000,
                  repeatCount: 1,
                  repeatRatio: 0.001,
                },
              ],
            }
          : {},
      );
    },
  });

  assert.deepEqual(snapshotCalls, ["instrument-a", "instrument-b"]);
  assert.equal(result.sourceDiagnostics.sourceId, "source-cache");
  assert.equal(result.sourceDiagnostics.baseTimeframe, "1m");
  assert.equal(result.sourceDiagnostics.generatedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(result.sourceDiagnostics.totalSymbols, 2);
  assert.equal(result.sourceDiagnostics.totalIssues, 1);
  assert.deepEqual(
    result.symbolDiagnostics.map((item) => [
      item.instrumentId,
      item.symbol,
      item.diagnostics.baseTimeframe,
      item.diagnostics.profile.assetClass,
    ]),
    [
      ["instrument-a", "AAA", "1m", "STOCK"],
      ["instrument-b", "BBB", "1m", "STOCK"],
    ],
  );
});

test("source diagnostics cache forwards cancellation and stops sequential reads", async () => {
  const controller = new AbortController();
  const abortReason = new Error("SOURCE_DIAGNOSTICS_TEST_ABORTED");
  let firstReadStarted: () => void = () => undefined;
  const firstRead = new Promise<void>((resolve) => {
    firstReadStarted = resolve;
  });
  const snapshotCalls: string[] = [];
  const task = buildLocalDataSourceDiagnosticsCache({
    sourceId: "source-cancel",
    baseTimeframe: "1m",
    profile: profile("STOCK"),
    generatedAt: "2026-01-01T00:00:00.000Z",
    instruments: [
      { instrumentId: "instrument-a", symbol: "AAA" },
      { instrumentId: "instrument-b", symbol: "BBB" },
    ],
    signal: controller.signal,
    loadSnapshot: async (instrumentId, _baseTimeframe, options) => {
      snapshotCalls.push(instrumentId);
      assert.equal(options?.signal, controller.signal);
      firstReadStarted();
      return new Promise<never>((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () => reject(options.signal?.reason),
          { once: true },
        );
        if (options?.signal?.aborted) {
          reject(options.signal.reason);
          return;
        }
      });
    },
  });

  await firstRead;
  controller.abort(abortReason);
  await assert.rejects(task, (error: unknown) => error === abortReason);
  assert.deepEqual(snapshotCalls, ["instrument-a"]);
});

test("source diagnostics cache parser rejects mismatched cached payloads", () => {
  const diagnostics = createEmptyLocalDataSourceDiagnostics(
    "source-a",
    "1d",
    profile("STOCK"),
    "READY",
  );
  assert.deepEqual(
    parseCachedLocalDataSourceDiagnostics(
      JSON.stringify(diagnostics),
      "source-a",
      "1d",
    ),
    diagnostics,
  );
  assert.equal(
    parseCachedLocalDataSourceDiagnostics(
      JSON.stringify(diagnostics),
      "source-b",
      "1d",
    ),
    null,
  );
  assert.equal(
    parseCachedLocalDataSourceSymbolDiagnostics(
      JSON.stringify({
        symbol: "AAA",
        baseTimeframe: "1d",
        diagnosticRulesVersion: diagnostics.diagnosticRulesVersion,
        status: "READY",
        generatedAt: null,
        profile: profile("STOCK"),
        health: { score: 100, severity: "INFO", affectedSymbols: 0 },
        totalBars: 0,
        summary: diagnostics.summary,
        items: [],
      }),
      "BBB",
      "1d",
    ),
    null,
  );
});
