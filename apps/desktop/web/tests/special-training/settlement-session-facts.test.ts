// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import type {
  ApiSpecialTrainingChallengeCommandResult,
  ApiSpecialTrainingFastDecisionSessionSummary,
  ApiSpecialTrainingSettlement,
} from "../../src/api";
import {
  mergeServerResult,
  readServerSessionFactsFromCommandResult,
} from "../../src/workspaces/special-training/view-models/useSpecialTrainingResultDisplayMaterializer";

const makeServerSettlement = (
  overrides: Partial<ApiSpecialTrainingSettlement> = {},
): ApiSpecialTrainingSettlement => ({
  score: 0,
  passed: false,
  totalPnl: 0,
  finalTotalAsset: 10000,
  feedbackCodes: [],
  usedOperations: 0,
  maxOperations: 0,
  directionResult: null,
  recoveryRate: null,
  alpha: null,
  captureRate: null,
  maxDrawdownRatio: 0,
  grade: "F",
  ...overrides,
});

const makeFastSummary = (
  completedCount: number,
): ApiSpecialTrainingFastDecisionSessionSummary => ({
  version: 1,
  modeId: "fast-decision-training",
  completedCount,
  passCount: 2,
  failCount: Math.max(0, completedCount - 2),
  totalScore: 200,
  averageScore: completedCount > 0 ? 200 / completedCount : 0,
  totalPnl: 508,
  averagePnl: completedCount > 0 ? 508 / completedCount : 0,
  averageMaxDrawdownRatio: 0,
  maxMaxDrawdownRatio: 0,
  gradeCounts: {},
  winRate: completedCount > 0 ? 2 / completedCount : 0,
  averageDecisionSeconds: 1.8,
  maxCorrectStreak: 2,
  missCount: Math.max(0, completedCount - 2),
  missRate: completedCount > 0 ? Math.max(0, completedCount - 2) / completedCount : 0,
  timeoutCount: 0,
  observeMissCount: 0,
  selectionCounts: {
    LONG: completedCount,
    SHORT: 0,
    OBSERVE: 0,
  },
  actualCounts: {
    LONG: 2,
    SHORT: Math.max(0, completedCount - 2),
    OBSERVE: 0,
  },
  capitalSummary: {
    initialAsset: 10000,
    questionCount: completedCount,
    totalInvested: completedCount * 10000,
    aggregateFinalAsset: completedCount * 10000 + 508,
    aggregatePnl: 508,
    aggregateReturnRate:
      completedCount > 0 ? 508 / (completedCount * 10000) : 0,
    positiveCount: 2,
    flatCount: 0,
    negativeCount: Math.max(0, completedCount - 2),
    bestReviewIndex: 4,
    worstReviewIndex: 0,
  },
  presentation: {
    grade: "C",
    gradeTone: "warning",
    commentary: {
      templateCode: "CONTRAST",
      speedCode: "RAPID",
      accuracyCode: "WEAK",
    },
    decisionMetricTone: "warning",
    biasCode: "LONG",
    directionStats: [
      {
        id: "LONG",
        attemptCount: completedCount,
        correctCount: 2,
        wrongCount: Math.max(0, completedCount - 2),
        accuracyRate: completedCount > 0 ? 2 / completedCount : 0,
        tone: "warning",
      },
      {
        id: "SHORT",
        attemptCount: 0,
        correctCount: 0,
        wrongCount: 0,
        accuracyRate: 0,
        tone: "neutral",
      },
      {
        id: "OBSERVE",
        attemptCount: 0,
        correctCount: 0,
        wrongCount: 0,
        accuracyRate: 0,
        tone: "neutral",
      },
    ],
  },
});

const makeCommandResult = (
  summary: ApiSpecialTrainingFastDecisionSessionSummary,
): ApiSpecialTrainingChallengeCommandResult =>
  ({
    runtime: {
      sessionSummary: null,
    },
    progress: {
      sessionSummary: summary,
    },
    settlement: makeServerSettlement(),
  }) as ApiSpecialTrainingChallengeCommandResult;

test("settlement materializer can recover backend session summary from command progress", () => {
  const summary = makeFastSummary(5);
  const merged = mergeServerResult(
    makeServerSettlement(),
    readServerSessionFactsFromCommandResult(makeCommandResult(summary)),
  );

  assert.equal(merged.sessionSummary, summary);
});

test("settlement-owned session summary wins over command progress fallback", () => {
  const settlementSummary = makeFastSummary(5);
  const progressSummary = makeFastSummary(4);
  const merged = mergeServerResult(
    makeServerSettlement({ sessionSummary: settlementSummary }),
    readServerSessionFactsFromCommandResult(makeCommandResult(progressSummary)),
  );

  assert.equal(merged.sessionSummary, settlementSummary);
});
