// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import type { FastDecisionCapitalReview } from "@zinuto/shared/domain-calculations/fast-decision-capital-review";
import { buildFastDecisionCapitalCurveOption } from "../../src/workspaces/special-training/charts/specialTrainingChartOptions";
import { resolveFastDecisionCapitalCurveLayout } from "../../src/workspaces/special-training/fastDecisionCapitalChartLayout";

const buildReview = (assets: number[]): FastDecisionCapitalReview => {
  const initialAsset = assets[0] ?? 10000;
  const finalAsset = assets.at(-1) ?? initialAsset;

  return {
    initialAsset,
    finalAsset,
    totalPnl: finalAsset - initialAsset,
    returnRate: initialAsset > 0 ? (finalAsset - initialAsset) / initialAsset : 0,
    maxDrawdownRate: 0,
    maxDrawdownAmount: 0,
    curve: assets.map((asset, index) => ({
      orderIndex: index,
      barIndex: index,
      step: index === 0 ? "ENTRY" : "CLOSE",
      ts: String(index),
      price: asset,
      asset,
    })),
    anchors: [],
    referenceCurve: null,
    referenceDirection: null,
    model: {
      kind: "NOTIONAL_CAPITAL_V1",
      initialAsset,
      leverageMultiplier: 1,
      feeRate: 0,
      slippageRate: 0,
      shortSimulation: "MIRRORED",
      affectsScoring: false,
    },
  };
};

test("fast decision capital chart y axis follows the visible capital range", () => {
  const layout = resolveFastDecisionCapitalCurveLayout(
    buildReview([10000, 10035, 9988, 10110, 10160, 10235, 10294]),
  );

  assert.ok(layout);
  assert.ok(layout.minY <= 9988);
  assert.ok(layout.maxY >= 10294);
  assert.ok(layout.maxY - layout.minY <= 600);
  assert.ok(layout.minY > 9900);
  assert.ok(layout.maxY < 10400);
});

test("fast decision capital chart keeps flat moves readable without fixed padding", () => {
  const layout = resolveFastDecisionCapitalCurveLayout(
    buildReview([10000, 10001, 10002]),
  );

  assert.ok(layout);
  assert.ok(layout.minY < 10000);
  assert.ok(layout.maxY > 10002);
  assert.ok(layout.maxY - layout.minY <= 60);
});

test("fast decision capital chart exposes adaptive axes and flat area fill", () => {
  const option = buildFastDecisionCapitalCurveOption({
    review: buildReview([10000, 10035, 9988, 10110, 10160, 10235, 10294]),
    lineColor: "#21a67a",
    areaColor: "#e64f5f",
    flatColor: "#d5dde8",
    finalColor: "#d99a2b",
    anchorItems: [],
  });

  assert.ok(option);
  const grid = option.grid as Record<string, unknown>;
  const xAxis = option.xAxis as Record<string, unknown>;
  const yAxis = option.yAxis as Record<string, unknown>;
  const series = option.series as Array<Record<string, unknown>>;
  const mainSeries = series[1] as { areaStyle?: { color?: unknown } };

  assert.equal(grid.containLabel, false);
  assert.equal(grid.left, 8);
  assert.equal(grid.bottom, 18);
  assert.equal(xAxis.interval, 2);
  assert.equal("interval" in yAxis, false);
  assert.equal(yAxis.splitNumber, 4);
  assert.equal(yAxis.scale, true);
  assert.deepEqual(yAxis.axisLine, { show: false });
  assert.deepEqual(yAxis.axisTick, { show: false });
  assert.deepEqual(
    (yAxis.axisLabel as Record<string, unknown>).inside,
    true,
  );
  assert.deepEqual(
    (yAxis.axisLabel as Record<string, unknown>).showMinLabel,
    false,
  );
  assert.deepEqual(
    (yAxis.axisLabel as Record<string, unknown>).verticalAlign,
    "top",
  );
  assert.deepEqual(xAxis.splitLine, { show: false });
  assert.deepEqual((yAxis.splitLine as Record<string, unknown>).show, true);
  assert.equal(typeof mainSeries.areaStyle?.color, "string");
});
