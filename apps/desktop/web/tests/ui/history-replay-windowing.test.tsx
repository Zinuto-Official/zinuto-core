// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  HISTORY_REPLAY_MAX_WINDOW_BARS,
  constrainReplayArchiveRecordForFrontend,
} from "../../src/api/history";

const readSource = (relativeUrl: string): string =>
  readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), "utf8");

const createReplayBars = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    ts: new Date(Date.UTC(2024, 0, 1 + index)).toISOString(),
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100.5 + index,
    volume: 1000 + index,
  }));

test("frontend API constrains oversized replay bars to a bounded window", () => {
  const sourceBars = createReplayBars(HISTORY_REPLAY_MAX_WINDOW_BARS + 25);
  const constrained = constrainReplayArchiveRecordForFrontend({
    bars: sourceBars,
    snapshot: {
      session: {
        id: "session-1",
        start_index: 0,
        entry_index: 10,
        cursor_index: sourceBars.length - 1,
      },
      fills: [
        { side: "BUY", fill_index: 5 },
        { side: "SELL", fill_index: sourceBars.length - 2 },
      ],
      cashAdjustments: [
        { kind: "FEE", bar_index: 8, amount: -1 },
        { kind: "FUNDING", barIndex: sourceBars.length - 1, amount: -2 },
      ],
    },
  }) as {
    bars: typeof sourceBars;
    barWindow?: {
      limited?: boolean;
      startRawIndex?: number;
    };
    snapshot: {
      session: { cursor_index: number };
      fills: Array<Record<string, unknown>>;
      cashAdjustments: Array<Record<string, unknown>>;
    };
  };

  assert.equal(constrained.bars.length, HISTORY_REPLAY_MAX_WINDOW_BARS);
  assert.equal(constrained.bars[0], sourceBars[25]);
  assert.equal(constrained.barWindow?.limited, true);
  assert.equal(constrained.barWindow?.startRawIndex, 25);
  assert.equal(
    constrained.snapshot.session.cursor_index,
    HISTORY_REPLAY_MAX_WINDOW_BARS - 1,
  );
  assert.deepEqual(constrained.snapshot.fills, [
    { side: "SELL", fill_index: HISTORY_REPLAY_MAX_WINDOW_BARS - 2 },
  ]);
  assert.deepEqual(constrained.snapshot.cashAdjustments, [
    {
      kind: "FUNDING",
      barIndex: HISTORY_REPLAY_MAX_WINDOW_BARS - 1,
      bar_index: HISTORY_REPLAY_MAX_WINDOW_BARS - 1,
      amount: -2,
    },
  ]);
});

test("HistoryReplayChart aggregates and loads only the bounded replay window", () => {
  const chartSource = readSource(
    "../../src/domains/chart/HistoryReplayChart.tsx",
  );
  const replayMemoStart = chartSource.indexOf("const replay = useMemo");
  const replayBarsStart = chartSource.indexOf("const replayBars = useMemo");
  const aggregateStart = chartSource.indexOf("const replayVisibleItems = useMemo");
  const aggregateEnd = chartSource.indexOf("const historyTooltipSymbol", aggregateStart);
  const dataLoaderStart = chartSource.indexOf("chart.setDataLoader({");
  const dataLoaderEnd = chartSource.indexOf("const handleCrosshair", dataLoaderStart);

  assert.ok(replayMemoStart >= 0);
  assert.ok(replayBarsStart > replayMemoStart);
  assert.ok(aggregateEnd > aggregateStart);
  assert.ok(dataLoaderEnd > dataLoaderStart);

  const replayMemoSource = chartSource.slice(replayMemoStart, replayBarsStart);
  const aggregateSource = chartSource.slice(aggregateStart, aggregateEnd);
  const dataLoaderSource = chartSource.slice(dataLoaderStart, dataLoaderEnd);

  assert.match(replayMemoSource, /constrainReplayArchiveRecordForFrontend/);
  assert.doesNotMatch(replayMemoSource, /projectReplay\.bars/);
  assert.match(aggregateSource, /aggregateBarsByPeriod\(replayBars/);
  assert.doesNotMatch(aggregateSource, /projectReplay|project\?\.replay/);
  assert.match(dataLoaderSource, /historyReplayDataWindowRef\.current/);
  assert.match(dataLoaderSource, /callback\(currentWindow\.klineData, loadMoreState\)/);
  assert.doesNotMatch(dataLoaderSource, /callback\(chartDataRef\.current/);
});

test("HistoryReplayChart keeps replay price axis auto-scaled", () => {
  const chartSource = readSource(
    "../../src/domains/chart/HistoryReplayChart.tsx",
  );
  const paneSyncSource = readSource(
    "../../src/domains/chart/useHistoryReplayPaneSynchronization.ts",
  );
  const helperSourceFile = readSource(
    "../../src/domains/chart/historyReplayChartRuntimeHelpers.ts",
  );
  const helperStart = helperSourceFile.indexOf(
    "export const applyHistoryCandlePaneAxisOptions",
  );
  const helperEnd = helperSourceFile.indexOf(
    "const resolveVisibleRangeBarCount",
    helperStart,
  );
  assert.ok(helperStart >= 0);
  assert.ok(helperEnd > helperStart);

  const helperSource = helperSourceFile.slice(helperStart, helperEnd);
  assert.match(helperSource, /chart\.setPaneOptions\(\{/);
  assert.match(helperSource, /id:\s*INDICATOR_PANES\.candle/);
  assert.match(helperSource, /name:\s*'normal'/);
  assert.match(helperSource, /scrollZoomEnabled:\s*false/);

  const adjustStart = chartSource.indexOf("const adjustPaneHeights = useCallback");
  const adjustEnd = chartSource.indexOf(
    "const applyMaxOffsetRightDistance",
    adjustStart,
  );
  const initStart = chartSource.indexOf("const chart = init(dom");
  const initEnd = chartSource.indexOf("chart.setDataLoader({", initStart);
  const renderableGateStart = chartSource.indexOf(
    "return whenElementRenderable(dom",
    initEnd,
  );
  const periodStart = chartSource.indexOf(
    "chart.setPeriod(bindings.toKlinePeriod(historyDisplayPeriod))",
  );
  const paneSyncPeriodStart = paneSyncSource.indexOf(
    "chart.setPeriod(bindings.toKlinePeriod(historyDisplayPeriod))",
  );
  const paneSyncPeriodEnd = paneSyncSource.indexOf(
    "}, [bindings, chartReadyVersion",
    paneSyncPeriodStart,
  );
  const resetDataStart = chartSource.indexOf("if (shouldResetData) {");
  const resetDataEnd = chartSource.indexOf(
    "lastViewportKeyRef.current",
    resetDataStart,
  );
  const stableLayoutStart = chartSource.indexOf(
    "const applyStableLayout = () => {",
  );
  const stableLayoutEnd = chartSource.indexOf(
    "const resizeObserverHandle = attachStableElementResizeObserver",
    stableLayoutStart,
  );
  const chartDataEffectStart = chartSource.indexOf(
    "const nextDataSignature = JSON.stringify",
  );
  const chartDataEffectEnd = chartSource.indexOf(
    "}, [",
    chartDataEffectStart,
  );

  const guardRanges: Array<[string, number, number]> = [
    [chartSource, adjustStart, adjustEnd],
    [chartSource, initStart, initEnd],
    [paneSyncSource, paneSyncPeriodStart, paneSyncPeriodEnd],
    [chartSource, resetDataStart, resetDataEnd],
    [chartSource, stableLayoutStart, stableLayoutEnd],
  ];

  assert.equal(periodStart, -1);
  for (const [source, start, end] of guardRanges) {
    assert.ok(start >= 0);
    assert.ok(end > start);
    assert.match(
      source.slice(start, end),
      /applyHistoryCandlePaneAxisOptions\(chart\)/,
    );
  }

  assert.ok(renderableGateStart > initEnd);
  assert.match(
    chartSource.slice(renderableGateStart, renderableGateStart + 140),
    /whenElementRenderable\(dom, \(\) => runHistoryChartInit\(dom\)\)/,
  );

  assert.ok(chartDataEffectStart >= 0);
  assert.ok(chartDataEffectEnd > chartDataEffectStart);
  const chartDataEffectSource = chartSource.slice(
    chartDataEffectStart,
    chartDataEffectEnd,
  );
  assert.match(
    chartDataEffectSource,
    /resizeObserverHandleRef\.current\?\.force\(\)/,
  );
  assert.doesNotMatch(chartDataEffectSource, /chart\.resize\(\)/);
  assert.doesNotMatch(chartDataEffectSource, /setTimeout/);
});

test("replay notes build context from bounded preview bars", () => {
  const domainSource = readSource(
    "../../src/app-shell/useReplayNotesDomainController.tsx",
  );
  const metricsSource = readSource("../../src/app-shell/useReplayNoteContextModel.ts");
  const buildContextStart = metricsSource.indexOf(
    "const buildTrainingRecordContextReplay",
  );
  const buildContextEnd = metricsSource.indexOf(
    "const readFastDecisionTitleSignals",
    buildContextStart,
  );
  assert.ok(buildContextEnd > buildContextStart);

  const buildContextSource = metricsSource.slice(buildContextStart, buildContextEnd);
  assert.match(buildContextSource, /buildBoundedReplayBarsSnapshotWindow\(bars, snapshot\)/);
  assert.match(buildContextSource, /barWindow: replayBase\.window/);
  assert.doesNotMatch(buildContextSource, /buildReplaySnapshot\(bars, snapshot\)/);
  assert.match(metricsSource, /resolveReplayContextPreviewBars/);
  assert.match(metricsSource, /normalizeReplayContextPreviewArchive/);
  assert.match(domainSource, /buildTrainingRecordContextReplay: metrics\.buildTrainingRecordContextReplay/);
});
