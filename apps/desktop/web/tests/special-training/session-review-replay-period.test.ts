// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import type { Bar } from "../../src/domains/training/types";
import {
  buildSpecialTrainingSessionReviewReplayProject,
  resolveSpecialTrainingSessionReviewReplayDisplayPeriod,
} from "../../src/workspaces/special-training/view-models/specialTrainingSessionReviewReplayProjectViewModel";

const minuteBars: Bar[] = [
  {
    ts: "2026-06-05T09:00:00.000Z",
    open: 1.9678,
    high: 1.9698,
    low: 1.9633,
    close: 1.9642,
    volume: 0,
  },
  {
    ts: "2026-06-05T09:01:00.000Z",
    open: 1.9642,
    high: 1.9655,
    low: 1.9628,
    close: 1.9639,
    volume: 0,
  },
];

const makeFastReviewItem = () =>
  ({
    kind: "fast",
    id: "fast-gbpaud-1",
    questionId: "fast-gbpaud-1",
    questionLabel: "Question 1",
    symbol: "GBPAUD",
    timeframeLabel: "1m",
    baseTimeframe: "1m",
    bars: minuteBars,
    startIndex: 0,
    revealEndIndex: 1,
    fastReview: null,
    specialTraining: null,
  }) as any;

const makeRiskReviewItem = () =>
  ({
    ...makeFastReviewItem(),
    kind: "risk",
    id: "risk-gbpaud-1",
    questionId: "risk-gbpaud-1",
    settleToIndex: 1,
    riskReview: null,
  }) as any;

test("special training review replay starts from the question timeframe", () => {
  const reviewItem = makeFastReviewItem();
  const project = buildSpecialTrainingSessionReviewReplayProject({
    selectedSessionReviewIndex: 0,
    selectedSessionReviewItem: reviewItem,
    sessionSettlements: [{ finalTotalAsset: 10000 } as any],
  });

  assert.equal(project?.replay.baseTimeframe, "1m");
  assert.equal(project?.replay.displayPeriod, "1m");
  assert.equal(project?.replay.snapshot.session.sourceTimeframe, "1m");
  assert.equal(project?.replay.snapshot.session.timeframe, "1m");
  assert.equal(project?.replay.snapshot.session.minimumBaseTimeframe, "1m");
  assert.equal(
    resolveSpecialTrainingSessionReviewReplayDisplayPeriod({
      selectedSessionReviewItem: reviewItem,
      sessionReviewReplayProject: project,
      fallback: "1d",
    }),
    "1m",
  );
});

test("special training review replay keeps secondary-window period overrides local", () => {
  const reviewItem = makeFastReviewItem();
  const project = buildSpecialTrainingSessionReviewReplayProject({
    selectedSessionReviewIndex: 0,
    selectedSessionReviewItem: reviewItem,
    sessionSettlements: [{ finalTotalAsset: 10000 } as any],
  });

  assert.equal(
    resolveSpecialTrainingSessionReviewReplayDisplayPeriod({
      selectedSessionReviewItem: reviewItem,
      sessionReviewReplayProject: project,
      preferredDisplayPeriod: "5m",
      fallback: "1d",
    }),
    "5m",
  );
  assert.equal(
    resolveSpecialTrainingSessionReviewReplayDisplayPeriod({
      selectedSessionReviewItem: reviewItem,
      sessionReviewReplayProject: project,
      preferredDisplayPeriod: "2h",
      fallback: "1d",
    }),
    "1m",
  );
});

test("special training review replay preserves a valid fill at bar zero", () => {
  const project = buildSpecialTrainingSessionReviewReplayProject({
    selectedSessionReviewIndex: 0,
    selectedSessionReviewItem: makeRiskReviewItem(),
    sessionSettlements: [
      {
        finalTotalAsset: 10010,
        tradeActions: [
          {
            type: "BUY",
            barIndex: 0,
            quantity: 1,
            executionPrice: minuteBars[0].close,
            inputMode: "LOT",
            priceMode: "CUR_CLOSE",
          },
        ],
      } as any,
    ],
  });

  assert.equal(project?.replay.snapshot.fills.length, 1);
  assert.equal(project?.replay.snapshot.fills[0]?.fill_index, 0);
});
