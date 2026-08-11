// SPDX-License-Identifier: GPL-3.0-only

import type { OperatorSummary } from '@zinuto/shared/operatorSummary';
import type {
  SpecialTrainingModeId,
  SpecialTrainingQuestionState,
  SpecialTrainingSettlementResult,
  SpecialTrainingTradeAction,
} from './contracts.js';
import type { SpecialTrainingPersistedSessionSummary } from './sessionSummary.js';
import type { SpecialTrainingBaseTimeframe } from './timeframeSemantics.js';

export type ReplayHydrationStatus =
  | 'READY'
  | 'SOURCE_CHANGED'
  | 'SOURCE_MISSING'
  | 'SNAPSHOT_ONLY'
  | 'EXPIRED';

export type SpecialTrainingHistorySessionSummary = {
  id: string;
  challengeId: string;
  bankId: string;
  bankName: string;
  modeId: SpecialTrainingModeId;
  sourceTag: string;
  timeframe: string;
  effectiveTimeframe: SpecialTrainingBaseTimeframe | null;
  minimumBaseTimeframe: SpecialTrainingBaseTimeframe | null;
  sourceTimeframe: SpecialTrainingBaseTimeframe | null;
  questionCount: number;
  completedQuestionCount: number;
  passedQuestionCount: number;
  failedQuestionCount: number;
  missedQuestionCount: number;
  timedOutQuestionCount: number;
  decisionSecondsTotal: number;
  decisionSecondsAverage: number;
  maxConsecutivePasses: number;
  createdAt: string;
  finishedAt: string;
  updatedAt: string;
  config: Record<string, unknown>;
  sessionSummary: SpecialTrainingPersistedSessionSummary | null;
  operatorSummary: OperatorSummary;
};

export type SpecialTrainingHistoryQuestionSummary = {
  id: string;
  sessionId: string;
  questionOrder: number;
  symbol: string;
  timeframe: string;
  baseTimeframe: '1m' | '5m' | '1h' | '1d' | null;
  effectiveTimeframe: '1m' | '5m' | '1h' | '1d' | null;
  minimumBaseTimeframe: '1m' | '5m' | '1h' | '1d' | null;
  sourceTimeframe: '1m' | '5m' | '1h' | '1d' | null;
  startIndex: number;
  endIndex: number;
  minTradeStep: number;
  settlementStatus: 'SETTLED' | 'ABANDONED';
  score: number;
  passed: boolean;
  totalPnl: number;
  finalTotalAsset: number;
  usedOperations: number;
  maxOperations: number;
  maxDrawdownRatio: number;
  performanceRate?: number;
  grade: string;
  createdAt: string;
  settledAt: string;
  updatedAt: string;
};

export type SpecialTrainingHistoryQuestionDetail = SpecialTrainingHistoryQuestionSummary & {
  cursorIndex: number | null;
  revealEndIndex: number | null;
  decisionSelection: string | null;
  decisionActual: string | null;
  decisionCorrect: boolean | null;
  decisionTimedOut: boolean | null;
  decisionSecondsUsed: number | null;
  strictnessLevel: string | null;
  dominanceRatio: number | null;
  selectedMfeRatio: number | null;
  selectedMaeRatio: number | null;
  selectedMfeMaeRatio: number | null;
  opportunityDirection: string | null;
  opportunityMfeRatio: number | null;
  opportunityMaeRatio: number | null;
  opportunityMfeMaeRatio: number | null;
  longMfeRatio: number | null;
  longMaeRatio: number | null;
  recoveryRate: number | null;
  alpha: number | null;
  captureRate: number | null;
  feedbackCodes: string[];
  riskReview: SpecialTrainingSettlementResult['riskReview'] | null;
  fastReview: SpecialTrainingSettlementResult['fastReview'] | null;
  tradeActions: SpecialTrainingTradeAction[];
  bars: SpecialTrainingQuestionState['bars'];
  replayHydrationStatus?: ReplayHydrationStatus;
  detailExpiredAt?: string | null;
};

export type SpecialTrainingHistorySessionDetail =
  SpecialTrainingHistorySessionSummary & {
    questions: SpecialTrainingHistoryQuestionSummary[];
  };

export type SpecialTrainingHistoryModeCount = {
  modeId: SpecialTrainingModeId;
  sessionCount: number;
};
