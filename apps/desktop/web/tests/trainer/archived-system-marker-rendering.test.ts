// SPDX-License-Identifier: GPL-3.0-only

import type { AggregatedBarItem } from "../../src/domains/chart/replayAggregation";
import type { ReplayBar } from "../../src/domains/trainer/trainerTypes";
import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_TRADING_SETTINGS } from "../../src/domains/trainer/defaultTradingSettings";
import {
  SYSTEM_NOTE_GROUP,
  SYSTEM_POSITION_OVERLAY_ID,
  SYSTEM_TRADE_GROUP,
} from "../../src/domains/chart/overlays/constants";
import { createSystemMarkerRenderer } from "../../src/domains/chart/systemMarkerRendering";
import { buildReplayNotesMarkerRenderVersion } from "../../src/app-shell/runtime/trainer-runtime/useRuntimeTrainerChartEffects";
import type { Fill, SessionSnapshot } from "../../src/domains/training/types";

const ts = "2024-01-02T09:30:00.000Z";
const timestamp = Date.parse(ts);

const makeFill = (overrides: Partial<Fill>): Fill => ({
  id: "fill",
  order_id: "order",
  session_id: "session",
  instrument_id: "instrument",
  symbol: "TEST",
  side: "BUY",
  fill_index: 0,
  fill_time: ts,
  fill_price: 10,
  fill_qty: 1,
  contract_multiplier: 1,
  fee: 0,
  tax: 0,
  slippage: 0,
  created_at: ts,
  ...overrides,
});

const sourceBars: ReplayBar[] = [
  {
    ts,
    open: 10,
    high: 13,
    low: 9,
    close: 12,
    volume: 1000,
    startRawIndex: 0,
    endRawIndex: 0,
  },
];

const visibleItems: AggregatedBarItem[] = [
  {
    bucketStartMs: timestamp,
    startRawIndex: 0,
    endRawIndex: 0,
    ts,
    open: 10,
    high: 13,
    low: 9,
    close: 12,
    volume: 1000,
  },
];

const snapshot: SessionSnapshot = {
  session: {
    id: "session",
    user_id: "user",
    instrument_id: "instrument",
    samplePoolId: "pool",
    sourceTimeframe: "1m",
    timeframe: "1m",
    minimumBaseTimeframe: "1m",
    start_index: 0,
    entry_index: 0,
    history_bars: 0,
    cursor_index: 0,
    autoplay_interval_ms: 0,
    is_paused: 1,
    created_at: ts,
    symbol: "TEST",
  },
  accounts: [],
  positions: [
    {
      sessionId: "session",
      instrumentId: "instrument",
      symbol: "TEST",
      qty: 1,
      avgCost: 10,
      realizedPnl: 0,
      unrealizedPnl: 2,
      totalPnl: 2,
      markPrice: 12,
    },
  ],
  fills: [
    makeFill({ id: "buy-fill", side: "BUY", fill_price: 10 }),
    makeFill({ id: "sell-fill", side: "SELL", fill_price: 12 }),
  ],
  sessionTradingSettings: {
    ...DEFAULT_TRADING_SETTINGS,
    tradeAmountIncludesFees: true,
  },
  drawings: [],
};

const createFakeChart = () => {
  let overlays: any[] = [];
  const chart = {
    getOverlays: (filter?: { id?: string; groupId?: string }) =>
      overlays.filter((overlay) => {
        if (filter?.id && overlay.id !== filter.id) {
          return false;
        }
        if (filter?.groupId && overlay.groupId !== filter.groupId) {
          return false;
        }
        return true;
      }),
    createOverlay: (overlay: any) => {
      overlays.push(overlay);
      return overlay.id;
    },
    overrideOverlay: (overlay: any) => {
      overlays = overlays.map((current) =>
        current.id === overlay.id ? { ...current, ...overlay } : current,
      );
      return true;
    },
    removeOverlay: (filter?: { id?: string; groupId?: string }) => {
      overlays = overlays.filter((overlay) => {
        if (filter?.id) {
          return overlay.id !== filter.id;
        }
        if (filter?.groupId) {
          return overlay.groupId !== filter.groupId;
        }
        return true;
      });
      return true;
    },
    getVisibleRange: () => ({ from: 0, to: 0, realFrom: 0, realTo: 0 }),
    getBarSpace: () => ({ bar: 12, gapBar: 2 }),
    getSize: () => ({ width: 800, height: 320 }),
    convertToPixel: (point: { timestamp: number; value: number }) => ({
      x: point.timestamp === timestamp ? 120 : 160,
      y: 320 - point.value,
    }),
  };
  return {
    chart,
    overlays: () => overlays,
  };
};

test("archived system marker renderer creates trade markers and position line from snapshot truth", () => {
  const fake = createFakeChart();
  const renderer = createSystemMarkerRenderer({
    tradeMarkerDensityRatio: 0.01,
    resolveTradeAmountIncludesFees: (item) =>
      item.sessionTradingSettings?.tradeAmountIncludesFees === true,
    replayNotes: [],
    formatMoney: (value, digits = 2) => value.toFixed(digits),
    tt: (key) => key,
    ttf: (key, values = []) => `${key}:${values.join(",")}`,
    caches: {
      visibleBarCountCache: new WeakMap(),
      compactStateCache: new WeakMap(),
    },
  });

  renderer(
    fake.chart as any,
    [{ timestamp, open: 10, high: 13, low: 9, close: 12, volume: 1000 }],
    snapshot,
    sourceBars,
    visibleItems,
    {
      displayPeriod: "1m",
      baseDisplayPeriod: "1m",
      chartViewportWidthPx: 800,
    },
  );

  const tradeOverlays = fake.chart.getOverlays({ groupId: SYSTEM_TRADE_GROUP });
  assert.equal(tradeOverlays.length, 2);
  assert.deepEqual(
    tradeOverlays.map((overlay) => overlay.extendData.side).sort(),
    ["BUY", "SELL"],
  );
  assert.ok(fake.chart.getOverlays({ id: SYSTEM_POSITION_OVERLAY_ID })[0]);
});

test("archived note snapshot trade markers render all rebased window fills", () => {
  const fake = createFakeChart();
  const renderer = createSystemMarkerRenderer({
    tradeMarkerDensityRatio: 0.01,
    resolveTradeAmountIncludesFees: (item) =>
      item.sessionTradingSettings?.tradeAmountIncludesFees === true,
    replayNotes: [],
    formatMoney: (value, digits = 2) => value.toFixed(digits),
    tt: (key) => key,
    ttf: (key, values = []) => `${key}:${values.join(",")}`,
    caches: {
      visibleBarCountCache: new WeakMap(),
      compactStateCache: new WeakMap(),
    },
  });
  const windowTs = "2024-01-02T09:31:00.000Z";
  const windowTimestamp = Date.parse(windowTs);
  const rebasedSnapshot: SessionSnapshot = {
    ...snapshot,
    fills: [
      makeFill({
        id: "window-buy-fill",
        side: "BUY",
        fill_index: 0,
        fill_time: windowTs,
        fill_price: 10,
      }),
      makeFill({
        id: "window-sell-fill",
        side: "SELL",
        fill_index: 20,
        fill_time: windowTs,
        fill_price: 12,
      }),
    ],
    fillsTotal: 502,
    residentFillsStartIndex: 500,
  };
  const windowSourceBars = Array.from({ length: 21 }, (_, index) => ({
    ...sourceBars[0],
    ts: index === 0 || index === 20 ? windowTs : `2024-01-02T10:${String(index).padStart(2, "0")}:00.000Z`,
    startRawIndex: index,
    endRawIndex: index,
  })) as ReplayBar[];
  const windowVisibleItems: AggregatedBarItem[] = [
    {
      ...visibleItems[0],
      bucketStartMs: windowTimestamp,
      startRawIndex: 0,
      endRawIndex: 0,
      ts: windowTs,
    },
    {
      ...visibleItems[0],
      bucketStartMs: windowTimestamp + 20_000,
      startRawIndex: 20,
      endRawIndex: 20,
      ts: windowTs,
    },
  ];

  renderer(
    fake.chart as any,
    [
      { timestamp: windowTimestamp, open: 10, high: 13, low: 9, close: 12, volume: 1000 },
      { timestamp: windowTimestamp + 20_000, open: 10, high: 13, low: 9, close: 12, volume: 1000 },
    ],
    rebasedSnapshot,
    windowSourceBars,
    windowVisibleItems,
    {
      displayPeriod: "1m",
      baseDisplayPeriod: "1m",
      chartViewportWidthPx: 800,
    },
  );

  const tradeOverlays = fake.chart.getOverlays({ groupId: SYSTEM_TRADE_GROUP });
  assert.equal(tradeOverlays.length, 2);
  assert.deepEqual(
    tradeOverlays.map((overlay) => overlay.extendData.compactLabel).sort(),
    ["B501", "S502"],
  );
});

test("system note markers render only current session notes", () => {
  const fake = createFakeChart();
  const openedNoteIds: string[] = [];
  const renderer = createSystemMarkerRenderer({
    tradeMarkerDensityRatio: 0.01,
    resolveTradeAmountIncludesFees: (item) =>
      item.sessionTradingSettings?.tradeAmountIncludesFees === true,
    replayNotes: [
      {
        id: "note-current",
        title: "Current note",
        type: "FREE_REPLAY",
        trainingProjectId: "session",
        hasContextReplay: true,
        contextExpiredAt: null,
        contextSessionId: null,
        contextCursorIndex: 0,
        updatedAt: "2024-01-02T10:00:00.000Z",
      } as never,
      {
        id: "note-other",
        title: "Other note",
        type: "FREE_REPLAY",
        trainingProjectId: "other-session",
        hasContextReplay: true,
        contextExpiredAt: null,
        contextSessionId: "other-session",
        contextCursorIndex: 0,
        updatedAt: "2024-01-02T11:00:00.000Z",
      } as never,
    ],
    isReplaySnapshotNote: (note) => note.type === "FREE_REPLAY" || note.type === "CHALLENGE",
    openReplayNoteFromMarker: (noteId) => {
      openedNoteIds.push(noteId);
    },
    formatMoney: (value, digits = 2) => value.toFixed(digits),
    tt: (key) => key,
    ttf: (key, values = []) => `${key}:${values.join(",")}`,
    caches: {
      visibleBarCountCache: new WeakMap(),
      compactStateCache: new WeakMap(),
    },
  });

  renderer(
    fake.chart as any,
    [{ timestamp, open: 10, high: 13, low: 9, close: 12, volume: 1000 }],
    snapshot,
    sourceBars,
    visibleItems,
    {
      trainingProjectId: "session",
      displayPeriod: "1m",
      baseDisplayPeriod: "1m",
      chartViewportWidthPx: 800,
    },
  );

  const noteOverlays = fake.chart.getOverlays({ groupId: SYSTEM_NOTE_GROUP });
  assert.equal(noteOverlays.length, 1);
  assert.equal(noteOverlays[0]?.id, "note-marker-1704187800000-note-current");
  noteOverlays[0]?.onClick?.();
  assert.deepEqual(openedNoteIds, ["note-current"]);
});

test("system note marker render version is scoped to current session bindings", () => {
  const baseNote = {
    id: "note-current",
    title: "Current note",
    type: "FREE_REPLAY",
    trainingProjectId: "session",
    hasContextReplay: true,
    contextExpiredAt: null,
    contextSessionId: null,
    contextCursorIndex: 0,
    updatedAt: "2024-01-02T10:00:00.000Z",
  };
  const unrelatedNote = {
    id: "note-other",
    title: "Other note",
    type: "FREE_REPLAY",
    trainingProjectId: "other-session",
    hasContextReplay: true,
    contextExpiredAt: null,
    contextSessionId: "other-session",
    contextCursorIndex: 0,
    updatedAt: "2024-01-02T11:00:00.000Z",
  };
  const currentVersion = buildReplayNotesMarkerRenderVersion({
    replayNotes: [baseNote, unrelatedNote],
    currentSessionId: "session",
    currentTrainingProjectId: "session",
  });
  const movedVersion = buildReplayNotesMarkerRenderVersion({
    replayNotes: [
      {
        ...baseNote,
        contextCursorIndex: 1,
      },
      unrelatedNote,
    ],
    currentSessionId: "session",
    currentTrainingProjectId: "session",
  });
  const unrelatedChangedVersion = buildReplayNotesMarkerRenderVersion({
    replayNotes: [
      baseNote,
      {
        ...unrelatedNote,
        title: "Changed outside current session",
        updatedAt: "2024-01-02T12:00:00.000Z",
      },
    ],
    currentSessionId: "session",
    currentTrainingProjectId: "session",
  });

  assert.notEqual(currentVersion, movedVersion);
  assert.equal(currentVersion, unrelatedChangedVersion);
});
