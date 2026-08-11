// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createApiError } from "../../src/api/error";
import type { HistoryReplayChartViewProps } from "../../src/domains/chart/HistoryReplayChart";
import {
  REPLAY_NOTE_SNAPSHOT_RECENT_CACHE_LIMIT,
  buildRetainedReplayNoteSnapshotIds,
  promoteRecentReplayNoteSnapshotId,
  resolveReplayNoteSnapshotHydrationStatus,
  resolveReplayNoteSnapshotRetryDelayMs,
  shouldHydrateActiveReplayNoteSnapshot,
  shouldRetryReplayNoteSnapshotHydration,
} from "../../src/app-shell/useReplayNotesDomainController";
import {
  areReplayNoteSnapshotChartPropsEqual,
  buildReplayNoteSnapshotProjectSignature,
  type ReplayNoteSnapshotChartProps,
} from "../../src/workspaces/notes/replayNoteSnapshotPreviewModel";
import { isReplayNoteDetailReady } from "../../src/workspaces/notes/useReplayNotes";

const createSystemMarkers: HistoryReplayChartViewProps["createSystemMarkers"] =
  () => undefined;
const onChartRenderModeChange: NonNullable<
  HistoryReplayChartViewProps["onChartRenderModeChange"]
> = () => undefined;
const onDisplayPeriodChange: NonNullable<
  ReplayNoteSnapshotChartProps["onDisplayPeriodChange"]
> = () => undefined;
const trainerPeriodOptionsByBase =
  {
    "1d": ["1d", "1w"],
  } as HistoryReplayChartViewProps["trainerPeriodOptionsByBase"];
const bindings = {} as HistoryReplayChartViewProps["bindings"];

const createProject = (
  overrides: Partial<NonNullable<HistoryReplayChartViewProps["project"]>> = {},
): HistoryReplayChartViewProps["project"] => ({
  id: "note-context-1",
  symbol: "AAPL",
  replay: {
    baseTimeframe: "1d",
    bars: [
      {
        ts: "2024-01-02T00:00:00.000Z",
        open: 10,
        high: 12,
        low: 9,
        close: 11,
        volume: 100,
      },
      {
        ts: "2024-01-03T00:00:00.000Z",
        open: 11,
        high: 14,
        low: 10,
        close: 13,
        volume: 120,
      },
    ],
    snapshot: {
      session: {
        id: "session-1",
        instrument_id: "instrument-1",
        cursor_index: 1,
        start_index: 0,
        entry_index: 0,
      },
      fills: [],
      positions: [],
      accounts: [],
      drawings: [],
    } as never,
  },
  ...overrides,
});

const project = createProject();
const baseProps: ReplayNoteSnapshotChartProps = {
  noteId: "note-1",
  noteType: "FREE_REPLAY",
  contextReplay: project?.replay,
  project,
  themeMode: "light",
  priceColorMode: "RED_UP_GREEN_DOWN",
  createSystemMarkers,
  language: "en",
  chartRenderMode: "CANDLE",
  onChartRenderModeChange,
  trainerPeriodOptionsByBase,
  bindings,
  initialDisplayPeriod: "1d",
  displayPeriod: "1d",
  onDisplayPeriodChange,
  hideLastPriceLine: false,
};

const createReplayNote = (overrides: Record<string, unknown> = {}) => ({
  id: "note-1",
  title: "Replay note",
  type: "FREE_REPLAY",
  contentDocument: {
    schemaVersion: 1,
    blocks: [],
  },
  contentLoaded: true,
  trainingProjectId: "project-1",
  hasContextReplay: true,
  contextExpiredAt: null,
  contextSessionId: "session-1",
  contextCursorIndex: 1,
  contextReplay: null,
  createdAt: "2024-01-03T00:00:00.000Z",
  updatedAt: "2024-01-03T00:00:00.000Z",
  ...overrides,
});

test("replay note snapshot chart comparator ignores non-chart note edits", () => {
  const previous = {
    ...baseProps,
    updatedAt: "2024-01-02T00:00:00.000Z",
    colorTokens: ["amber"],
    attachments: [],
  } as ReplayNoteSnapshotChartProps;
  const next = {
    ...baseProps,
    updatedAt: "2024-01-02T00:00:01.000Z",
    colorTokens: ["green"],
    attachments: [{ id: "attachment-1" }],
    contentDocument: { version: 1, blocks: [] },
  } as ReplayNoteSnapshotChartProps;

  assert.equal(areReplayNoteSnapshotChartPropsEqual(previous, next), true);
});

test("notes page snapshot hydration retries transient failures and resolves ready state", () => {
  const loadingNote = createReplayNote();
  const readyNote = createReplayNote({
    contextReplay: project?.replay,
  });

  assert.equal(isReplayNoteDetailReady(loadingNote as never), false);
  assert.equal(
    resolveReplayNoteSnapshotHydrationStatus(loadingNote as never, {
      status: "loading",
      retryCount: 0,
    }),
    "loading",
  );
  assert.equal(
    shouldRetryReplayNoteSnapshotHydration({
      error: createApiError("bridge failed", "BACKEND_HTTP_REQUEST_FAILED"),
      retryCount: 0,
    }),
    true,
  );
  assert.equal(resolveReplayNoteSnapshotRetryDelayMs(0), 400);
  assert.equal(resolveReplayNoteSnapshotRetryDelayMs(1), 1200);
  assert.equal(
    resolveReplayNoteSnapshotHydrationStatus(loadingNote as never, {
      status: "error",
      retryCount: 2,
    }),
    "error",
  );
  assert.equal(isReplayNoteDetailReady(readyNote as never), true);
  assert.equal(
    resolveReplayNoteSnapshotHydrationStatus(readyNote as never, {
      status: "error",
      retryCount: 2,
    }),
    "ready",
  );
});

test("notes page snapshot hydration does not lock aborted requests into error", () => {
  const loadingNote = createReplayNote();

  assert.equal(
    shouldRetryReplayNoteSnapshotHydration({
      error: createApiError("not found", "REPLAY_NOTE_NOT_FOUND"),
      retryCount: 0,
    }),
    false,
  );
  assert.equal(
    resolveReplayNoteSnapshotHydrationStatus(loadingNote as never, {
      status: "idle",
      retryCount: 0,
    }),
    "loading",
  );
});

test("active replay note snapshot editor reuses hydration state instead of spinning forever", () => {
  const loadingNote = createReplayNote();
  const readyNote = createReplayNote({
    contextReplay: project?.replay,
  });

  assert.equal(
    shouldHydrateActiveReplayNoteSnapshot(loadingNote as never),
    true,
  );
  assert.equal(
    shouldHydrateActiveReplayNoteSnapshot(loadingNote as never, {
      status: "loading",
      retryCount: 0,
    }),
    false,
  );
  assert.equal(
    shouldHydrateActiveReplayNoteSnapshot(loadingNote as never, {
      status: "error",
      retryCount: 2,
    }),
    false,
  );
  assert.equal(
    shouldHydrateActiveReplayNoteSnapshot(readyNote as never),
    false,
  );
  assert.equal(
    shouldHydrateActiveReplayNoteSnapshot(
      createReplayNote({ contextExpiredAt: "2024-01-04T00:00:00.000Z" }) as never,
    ),
    false,
  );
});

test("recent snapshot cache keeps pinned notes and caps warm history to six entries", () => {
  const recent = ["note-6", "note-5", "note-4", "note-3", "note-2", "note-1"];

  assert.equal(REPLAY_NOTE_SNAPSHOT_RECENT_CACHE_LIMIT, 6);
  assert.deepEqual(
    buildRetainedReplayNoteSnapshotIds({
      selectedNoteId: "selected",
      activeNoteId: "active",
      recentNoteIds: recent,
    }),
    ["selected", "active", "note-6", "note-5", "note-4", "note-3"],
  );
  assert.deepEqual(
    promoteRecentReplayNoteSnapshotId(recent, "note-3"),
    ["note-3", "note-6", "note-5", "note-4", "note-2", "note-1"],
  );
});

test("replay note snapshot chart comparator updates only for chart inputs", () => {
  assert.equal(
    areReplayNoteSnapshotChartPropsEqual(baseProps, {
      ...baseProps,
      contextReplay: { ...project?.replay },
    }),
    false,
  );
  assert.equal(
    areReplayNoteSnapshotChartPropsEqual(baseProps, {
      ...baseProps,
      project: createProject(),
    }),
    false,
  );
  assert.equal(
    areReplayNoteSnapshotChartPropsEqual(baseProps, {
      ...baseProps,
      displayPeriod: "1w",
    }),
    false,
  );
  assert.equal(
    areReplayNoteSnapshotChartPropsEqual(baseProps, {
      ...baseProps,
      chartRenderMode: "LINE",
    }),
    false,
  );
});

test("replay note snapshot project signature survives secondary payload clones", () => {
  const clonedProject = structuredClone(project);

  assert.equal(
    buildReplayNoteSnapshotProjectSignature(project),
    buildReplayNoteSnapshotProjectSignature(clonedProject),
  );
  assert.notEqual(
    buildReplayNoteSnapshotProjectSignature(project),
    buildReplayNoteSnapshotProjectSignature(
      createProject({
        replay: {
          ...project?.replay,
          snapshot: {
            ...project?.replay?.snapshot,
            session: {
              ...project?.replay?.snapshot?.session,
              cursor_index: 0,
            },
          } as never,
        },
      }),
    ),
  );
});

test("replay note snapshot project signature changes when marker data changes", () => {
  const withBuyFill = createProject({
    replay: {
      ...project?.replay,
      snapshot: {
        ...project?.replay?.snapshot,
        fills: [
          {
            id: "fill-1",
            side: "BUY",
            fill_index: 1,
            fill_price: 10,
            fill_qty: 2,
            contract_multiplier: 1,
            created_at: "2024-01-03T00:00:00.000Z",
          },
        ],
        positions: [
          {
            symbol: "AAPL",
            qty: 2,
            avgCost: 10,
            markPrice: 13,
          },
        ],
      } as never,
    },
  });
  const withSellFill = createProject({
    replay: {
      ...project?.replay,
      snapshot: {
        ...project?.replay?.snapshot,
        fills: [
          {
            id: "fill-1",
            side: "SELL",
            fill_index: 1,
            fill_price: 12,
            fill_qty: 2,
            contract_multiplier: 1,
            created_at: "2024-01-03T00:00:00.000Z",
          },
        ],
        positions: [
          {
            symbol: "AAPL",
            qty: 0,
            avgCost: 0,
            markPrice: 12,
          },
        ],
      } as never,
    },
  });

  assert.notEqual(
    buildReplayNoteSnapshotProjectSignature(withBuyFill),
    buildReplayNoteSnapshotProjectSignature(withSellFill),
  );
});

test("replay note snapshot rendering is isolated from note collection churn", () => {
  const runtimeSource = readFileSync(
    fileURLToPath(
      new URL(
        "../../src/app-shell/runtime/runtimeReplayNoteEditorHost.ts",
        import.meta.url,
      ),
    ),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const routeSource = readFileSync(
    fileURLToPath(
      new URL(
        "../../src/app-shell/secondaryWindows/routes/secondaryNoteEditorRoute.tsx",
        import.meta.url,
      ),
    ),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const chartSource = [
    "../../src/domains/chart/HistoryReplayChart.tsx",
    "../../src/domains/chart/useHistoryReplayArchivedOverlays.ts",
  ]
    .map((sourceFile) =>
      readFileSync(fileURLToPath(new URL(sourceFile, import.meta.url)), "utf8"),
    )
    .join("\n")
    .replace(/\r\n/g, "\n");
  const domainSource = readFileSync(
    fileURLToPath(
      new URL(
        "../../src/app-shell/useReplayNotesDomainController.tsx",
        import.meta.url,
      ),
    ),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const hydrationSource = readFileSync(
    fileURLToPath(
      new URL(
        "../../src/app-shell/useReplayNoteSnapshotHydration.ts",
        import.meta.url,
      ),
    ),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const renderStart = runtimeSource.indexOf(
    "const renderTrainingNoteSnapshot = useCallback(",
  );
  const renderEnd = runtimeSource.indexOf("useEffect(() =>", renderStart);
  const renderSource = runtimeSource.slice(renderStart, renderEnd);
  const renderDepsStart = renderSource.lastIndexOf("[");
  const renderDepsSource = renderSource.slice(renderDepsStart);
  const syncEffectStart = routeSource.indexOf(
    "if (snapshotKind === \"PLACEHOLDER\")",
  );
  const chartInitEffectStart = chartSource.indexOf(
    "useEffect(() => {\n    bindings.registerCustomOverlays();",
  );
  const syncEffectEnd = routeSource.indexOf("if (!payload)", syncEffectStart);
  const syncEffectSource = routeSource.slice(syncEffectStart, syncEffectEnd);
  const chartInitEffectEnd = chartSource.indexOf(
    "  useEffect(() => {\n    const chart = chartRef.current;\n    if (!chart) {\n      return;\n    }\n    chart.setLocale",
    chartInitEffectStart,
  );
  const chartDataEffectStart = chartSource.indexOf(
    "const nextDataSignature = JSON.stringify",
  );
  const chartDataEffectEnd = chartSource.indexOf("  }, [", chartDataEffectStart);
  const chartDataEffectSource = chartSource.slice(
    chartDataEffectStart,
    chartDataEffectEnd,
  );
  const chartInitEffectSource = chartSource.slice(
    chartInitEffectStart,
    chartInitEffectEnd,
  );

  assert.ok(renderStart >= 0);
  assert.ok(renderEnd > renderStart);
  assert.match(renderSource, /replayNotesRef\.current\.find/);
  assert.match(renderSource, /replayNoteSnapshotFallbackViewRef\.current/);
  assert.match(runtimeSource, /buildReplayNoteSnapshotProjectSignature\(project\)/);
  assert.match(runtimeSource, /!isActiveNote/);
  assert.match(renderSource, /mode:\s*"loading"/);
  assert.match(renderSource, /mode:\s*"error"/);
  assert.doesNotMatch(renderDepsSource, /\breplayNotes,\s*\n/);
  assert.match(renderSource, /createElement\(\s*ReplayNoteSnapshotChart,/);
  assert.match(renderSource, /retryReplayNoteSnapshotDetail\(note\.id\)/);
  assert.match(
    renderSource,
    /onDisplayPeriodChange:\s*updateReplayNoteContextDisplayPeriod/,
  );
  assert.doesNotMatch(renderSource, /onDisplayPeriodChange=\{\(period\)/);
  assert.match(routeSource, /stableProjectRef/);
  assert.match(routeSource, /stableProjectRef\.current\.noteId !== activeNoteId/);
  assert.match(routeSource, /stableProjectRef\.current\?\.noteId === activeNoteId/);
  assert.match(routeSource, /payload\.snapshot\?\.kind === "LOADING"/);
  assert.match(routeSource, /emit\("RETRY_SNAPSHOT"/);
  assert.match(routeSource, /<ReplayNoteSnapshotChart/);
  assert.doesNotMatch(routeSource, /<HistoryReplayChartView(?:\s|>)/);
  assert.match(syncEffectSource, /if \(snapshotKind === "PLACEHOLDER"\)/);
  assert.doesNotMatch(syncEffectSource, /if \(snapshotKind !== "CHART"\)/);
  assert.match(chartInitEffectSource, /refreshArchivedOverlaysRef\.current\(\)/);
  assert.match(chartInitEffectSource, /attachStableElementResizeObserver\(dom, applyStableLayout\)/);
  assert.match(chartInitEffectSource, /whenElementRenderable\(dom, \(\) => runHistoryChartInit\(dom\)\)/);
  assert.doesNotMatch(chartInitEffectSource, /const scheduleResize = \(\) => \{/);
  assert.doesNotMatch(chartInitEffectSource, /new ResizeObserver\(/);
  assert.doesNotMatch(
    chartInitEffectSource,
    /detachResizeObservers\.push\(bindings\.attachElementResizeObserver/,
  );
  assert.doesNotMatch(chartInitEffectSource, /project\?\.id/);
  assert.doesNotMatch(chartInitEffectSource, /replaySnapshot/);
  assert.match(chartSource, /const refreshArchivedOverlays = useCallback\(/);
  assert.match(chartSource, /buildReplaySystemMarkerSignature/);
  assert.match(chartDataEffectSource, /replaySystemMarkerSignature/);
  assert.match(chartDataEffectSource, /scrollHistoryChartToCursorIndex\(chart, replaySnapshotSession\.cursor_index\)/);
  assert.match(chartDataEffectSource, /resizeObserverHandleRef\.current\?\.force\(\)/);
  assert.doesNotMatch(chartDataEffectSource, /chart\.resize\(\)/);
  assert.doesNotMatch(chartDataEffectSource, /setTimeout/);
  assert.match(
    chartDataEffectSource,
    /const hasReplaySnapshot = Boolean\(/,
  );
  assert.match(domainSource, /useReplayNoteSnapshotHydration/);
  assert.match(hydrationSource, /buildRetainedReplayNoteSnapshotIds/);
  assert.match(hydrationSource, /promoteRecentReplayNoteSnapshotId/);
  assert.match(hydrationSource, /REPLAY_NOTE_SNAPSHOT_RECENT_CACHE_LIMIT/);
  assert.match(hydrationSource, /shouldHydrateActiveReplayNoteSnapshot/);
  assert.match(hydrationSource, /hydrateReplayNoteSnapshotDetail\(activeTrainingRecordNote\.id, 0\)/);
  assert.doesNotMatch(hydrationSource, /void ensureReplayNoteDetail\(activeTrainingRecordNote\.id\)/);
  assert.doesNotMatch(hydrationSource, /const retainedNoteIds = new Set<string>\(\);/);
});

test("history replay chart guards malformed archived snapshot sessions", () => {
  const chartSource = readFileSync(
    fileURLToPath(
      new URL("../../src/domains/chart/HistoryReplayChart.tsx", import.meta.url),
    ),
    "utf8",
  );

  assert.match(chartSource, /resolveReplaySnapshotSession/);
  assert.doesNotMatch(chartSource, /replaySnapshot\??\.session\./);
  assert.match(chartSource, /replaySnapshotSession\?\.cursor_index/);
});
