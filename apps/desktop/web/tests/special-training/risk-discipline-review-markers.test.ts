// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFastDecisionSparklineOption,
} from "../../src/workspaces/special-training/charts/specialTrainingChartOptions";
import { buildRiskDisciplineSessionReviewItems } from "../../src/workspaces/special-training/view-models/specialTrainingSessionReviewItemsViewModel";
import type { Bar } from "../../src/domains/training/types";

const labels = {
  settlementPassLabel: "Pass",
  settlementFailLabel: "Fail",
  challengeBattleTagRiskRescueLabel: "Rescue",
  challengeBattleTagRiskOvertradeLabel: "Overtrade",
  challengeBattleResultGradeTemplate: "Grade {0}",
  challengeDashboardRiskContextTemplate: "{0} / {1}",
  challengeDashboardRiskFirstActionBarsTemplate: "{0} bars",
  metricAlphaLabel: "Alpha",
  statusFloatingLabel: "Pnl",
  sessionSettlementReviewQuestionTemplate: "Question {0}",
  riskDisciplineBaselineGuideTagLabel: "Baseline",
  riskDisciplineCostGuideTagLabel: "Cost",
};

const bars: Bar[] = [
  { ts: "0", open: 100, high: 112, low: 88, close: 100, volume: 0 },
  { ts: "1", open: 101, high: 120, low: 82, close: 101, volume: 0 },
  { ts: "2", open: 103, high: 130, low: 92, close: 104, volume: 0 },
  { ts: "3", open: 100, high: 128, low: 89, close: 98, volume: 0 },
  { ts: "4", open: 101, high: 118, low: 94, close: 102, volume: 0 },
];

test("risk discipline review markers snap to the sparkline close series", () => {
  const [item] = buildRiskDisciplineSessionReviewItems({
    view: "SETTLEMENT",
    sessionSettlements: [
      {
        questionId: "question-1",
        startIndex: 1,
        settleToIndex: 4,
        passed: true,
        totalPnl: 12,
        finalTotalAsset: 10012,
        grade: "B",
        alpha: 0.12,
        maxDrawdownRatio: 0.01,
        riskReview: null,
        fastReview: null,
        directionResult: null,
        tradeActions: [
          {
            type: "BUY",
            barIndex: 2,
            inputMode: "RATIO",
            priceMode: "CUR_CLOSE",
            ratioInput: "50",
            quantity: 0,
            executionPrice: 0,
            cashEffect: 0,
          },
          {
            type: "SELL",
            barIndex: 3,
            inputMode: "RATIO",
            priceMode: "CUR_CLOSE",
            ratioInput: "50",
            quantity: 0,
            executionPrice: 0,
            cashEffect: 0,
          },
        ],
      } as any,
    ],
    questions: [
      {
        id: "question-1",
        symbol: "TEST",
        startIndex: 1,
        endIndex: 4,
        bars,
      } as any,
    ],
    basePeriod: "1d",
    labels,
    riskBehaviorLabelMap: {
      CUT_LOSS: "Cut loss",
      ADD_POSITION: "Add",
      FREEZE: "Freeze",
    },
    textDoubleDash: "--",
    resolveQuestionEffectiveTrainingTimeframe: () => "1d",
    resolveRiskDisciplineFirstAction: () => ({
      behavior: "ADD_POSITION",
      barsSinceStart: 1,
    }),
  });

  assert.ok(item);
  assert.deepEqual(item.sparkline, [100, 101, 104, 98, 102]);
  assert.deepEqual(item.tradeMarkers, [
    { side: "BUY", offset: 2, value: 104 },
    { side: "SELL", offset: 3, value: 98 },
  ]);

  const option = buildFastDecisionSparklineOption(
    item.sparkline,
    "#0a84ff",
    item.sparklineDecisionBoundaryOffset,
    "#ffffff",
    8,
    8,
    {
      tradeMarkers: item.tradeMarkers,
      buyMarkerColor: "#35c2ff",
      sellMarkerColor: "#ffac1c",
      pinDecisionMarkerToRatio: 0.25,
    },
  );

  assert.ok(option);
  const [series] = option.series as Array<{
    data: Array<[number, number]>;
    markPoint?: { data?: Array<{ name: string; coord: [number, number] }> };
  }>;
  const yByX = new Map(series.data.map(([x, y]) => [x, y]));
  for (const marker of series.markPoint?.data ?? []) {
    if (!marker.name.startsWith("buy-") && !marker.name.startsWith("sell-")) {
      continue;
    }
    assert.equal(marker.coord[1], yByX.get(marker.coord[0]));
  }
});
