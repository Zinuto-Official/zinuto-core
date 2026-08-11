// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_GROUP,
} from "../../src/app-shell/trainerChartOverlayConstants";
import {
  removeAllSpecialTrainingOverlays,
  renderDecisionBoundaryOverlays,
  renderRiskDisciplineGuideOverlays,
  renderTradeMarkerOverlays,
} from "../../src/app-shell/trainerChartSpecialOverlayHelpers";
import type { AggregatedBarLike } from "../../src/app-shell/trainerChartOverlayTypes";
import { DEFAULT_TRADE_COLOR_THEME } from "../../src/ui/theme/visualColors";

const visibleItems: AggregatedBarLike[] = [
  {
    bucketStartMs: 1_700_000_000_000,
    startRawIndex: 0,
    endRawIndex: 0,
    close: 11,
  },
  {
    bucketStartMs: 1_700_000_060_000,
    startRawIndex: 1,
    endRawIndex: 1,
    close: 12,
  },
];

const createFakeChart = () => {
  const overlays: any[] = [];
  const calls = {
    createPayloads: [] as any[],
    removePayloads: [] as any[],
  };
  const chart = {
    createOverlay: (payload: any) => {
      calls.createPayloads.push(payload);
      const payloads = Array.isArray(payload) ? payload : [payload];
      overlays.push(...payloads);
      return Array.isArray(payload)
        ? payloads.map((item) => item.id ?? null)
        : (payload.id ?? null);
    },
    removeOverlay: (payload: any) => {
      calls.removePayloads.push(payload);
      return true;
    },
    getBarSpace: () => ({ bar: 10, gapBar: 2 }),
    getSize: () => ({ width: 800, height: 320 }),
    convertToPixel: (point: { timestamp: number; value: number }) => ({
      x: point.timestamp === visibleItems[0]?.bucketStartMs ? 120 : 180,
      y: 320 - Number(point.value),
    }),
  };
  return {
    calls,
    chart: chart as any,
    overlays: () => overlays,
  };
};

test("special training trade markers are sent to klinecharts as one batched overlay create", () => {
  const fake = createFakeChart();

  renderTradeMarkerOverlays(
    fake.chart,
    { clientWidth: 800 } as HTMLDivElement,
    [
      { rawIndex: 0, side: "BUY", price: 10, label: "B1" },
      { rawIndex: 1, side: "SELL", price: 12, label: "S1" },
    ],
    visibleItems,
    1,
    0.01,
    "1m",
    "1m",
  );

  assert.equal(fake.calls.createPayloads.length, 1);
  assert.equal(Array.isArray(fake.calls.createPayloads[0]), true);
  assert.equal(fake.overlays().length, 2);
});

test("special training decision boundary overlays are created in one update pass", () => {
  const fake = createFakeChart();

  renderDecisionBoundaryOverlays(
    fake.chart,
    visibleItems,
    1,
    0,
    { selection: "LONG", label: "B1", displayText: "B1" },
    {
      profitPrice: 13,
      drawdownPrice: 9,
      baselinePrice: 11,
      profitRatio: 0.1,
      drawdownRatio: -0.05,
      profitTagText: "+10%",
      drawdownTagText: "-5%",
    },
    "dark",
    "RED_UP_GREEN_DOWN",
    DEFAULT_TRADE_COLOR_THEME,
  );

  assert.equal(fake.calls.createPayloads.length, 1);
  assert.equal(Array.isArray(fake.calls.createPayloads[0]), true);
  assert.ok(fake.overlays().length >= 5);
  assert.equal(
    fake.overlays().every(
      (overlay) =>
        overlay.groupId === SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_GROUP,
    ),
    true,
  );
});

test("special training risk guide overlays are created in one update pass", () => {
  const fake = createFakeChart();

  renderRiskDisciplineGuideOverlays(
    fake.chart,
    visibleItems,
    {
      baselinePrice: 10.5,
      currentCostPrice: 11.25,
      baselineTagText: "baseline",
      currentCostTagText: "cost",
    },
    "dark",
    DEFAULT_TRADE_COLOR_THEME,
  );

  assert.equal(fake.calls.createPayloads.length, 1);
  assert.equal(Array.isArray(fake.calls.createPayloads[0]), true);
  assert.equal(fake.overlays().length, 4);
});

test("special training overlay cleanup uses one group removal", () => {
  const fake = createFakeChart();

  removeAllSpecialTrainingOverlays(fake.chart);

  assert.deepEqual(fake.calls.removePayloads, [
    { groupId: SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_GROUP },
  ]);
});
