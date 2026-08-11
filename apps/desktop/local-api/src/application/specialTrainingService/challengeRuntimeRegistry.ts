// SPDX-License-Identifier: GPL-3.0-only

import {
  CHALLENGE_SETTLED_CACHE_TTL_MS,
  CHALLENGE_STORE_CLEANUP_INTERVAL_MS,
  MAX_CHALLENGE_STORE_SIZE,
} from '../../domain/specialTraining/constants.js';
import { releaseQuestionSlotReservations } from '../specialTraining/questionBank.js';
import type { RiskQuestionDraftState } from '../specialTraining/challengeRiskRuntime.js';
import type { SpecialTrainingFastDecisionTimerStore } from './challengeActivityRuntime.js';
import type { SpecialTrainingPersistedSessionSummary } from '../../domain/specialTraining/sessionSummary.js';
import type {
  SettleSpecialTrainingQuestionPayload,
  SpecialTrainingFastDecisionStrictnessLevel,
  SpecialTrainingLedgerSourceTag,
  SpecialTrainingModeId,
  SpecialTrainingQuestionScopeState,
  SpecialTrainingQuestionSlot,
  SpecialTrainingQuestionState,
  SpecialTrainingSettlementResult,
} from '../../domain/specialTraining/contracts.js';

export type SpecialTrainingChallengeQuestionAssignment = {
  questionId: string;
  slot: SpecialTrainingQuestionSlot;
  ledgerId: string;
};

export type SpecialTrainingChallengeState = {
  id: string;
  bankId: string;
  bankName: string;
  modeId: SpecialTrainingModeId;
  activityPaused: boolean;
  targetTimeframe: string;
  timeframe: string;
  minimumBaseTimeframe: string;
  sourceTimeframe: string;
  sourceTag: SpecialTrainingLedgerSourceTag;
  simulationBatchId: string | null;
  enabledInstrumentIds: string[];
  questionCount: number;
  horizonBars: number;
  maxOperations: number;
  maxEntries: number;
  decisionSecondsLimit: number;
  fastDecisionStrictnessLevel: SpecialTrainingFastDecisionStrictnessLevel;
  fastDecisionDominanceRatio: number;
  createdAtMs: number;
  expiresAtMs: number;
  scopeState: SpecialTrainingQuestionScopeState;
  questionIdsInOrder: string[];
  questionAssignmentsById: Map<string, SpecialTrainingChallengeQuestionAssignment>;
  questionsById: Map<string, SpecialTrainingQuestionState>;
  settledByQuestionId: Map<string, SpecialTrainingSettlementResult>;
  settledEntriesByQuestionId: Map<
    string,
    {
      result: SpecialTrainingSettlementResult;
      payload: SettleSpecialTrainingQuestionPayload;
      abandoned: boolean;
      settledAt: string;
    }
  >;
  draftsByQuestionId: Map<string, RiskQuestionDraftState>;
  fastDecisionTimersByQuestionId: SpecialTrainingFastDecisionTimerStore;
  historySessionId: string | null;
  completedSessionSummary: SpecialTrainingPersistedSessionSummary | null;
};

export const challengeStore = new Map<string, SpecialTrainingChallengeState>();
let challengeStoreCleanupTimer: NodeJS.Timeout | null = null;

export const downgradePersistedChallengeState = (
  challenge: SpecialTrainingChallengeState,
): void => {
  if (!challenge.historySessionId) {
    return;
  }
  challenge.settledByQuestionId.forEach((result, questionId) => {
    if (!result.riskReview) {
      return;
    }
    challenge.settledByQuestionId.set(questionId, {
      ...result,
      riskReview: {
        ...result.riskReview,
        equityCurves: {
          user: [],
          hold: [],
          hardStop: [],
        },
      },
    });
  });
  challenge.questionsById.clear();
  challenge.expiresAtMs = Math.min(
    challenge.expiresAtMs,
    Date.now() + CHALLENGE_SETTLED_CACHE_TTL_MS,
  );
};

const readChallengeQuestionLedgerIds = (
  challenge: SpecialTrainingChallengeState,
): string[] =>
  Array.from(challenge.questionAssignmentsById.values())
    .map((assignment) => String(assignment.ledgerId || "").trim())
    .filter((ledgerId) => ledgerId.length > 0);

export const deleteChallengeRuntimeState = (
  challengeId: string,
  challenge: SpecialTrainingChallengeState,
): {
  releasedQuestionLedgerRows: number;
} => {
  const releasedQuestionLedgerRows = releaseQuestionSlotReservations(
    readChallengeQuestionLedgerIds(challenge),
  );
  challengeStore.delete(challengeId);
  return {
    releasedQuestionLedgerRows,
  };
};

export const cleanupExpiredChallenges = (): void => {
  const now = Date.now();
  for (const [id, challenge] of challengeStore.entries()) {
    if (challenge.expiresAtMs <= now) {
      deleteChallengeRuntimeState(id, challenge);
    }
  }

  if (challengeStore.size > MAX_CHALLENGE_STORE_SIZE) {
    const sorted = Array.from(challengeStore.values()).sort(
      (left, right) => left.createdAtMs - right.createdAtMs,
    );
    while (challengeStore.size > MAX_CHALLENGE_STORE_SIZE) {
      const oldest = sorted.shift();
      if (!oldest) {
        break;
      }
      downgradePersistedChallengeState(oldest);
      deleteChallengeRuntimeState(oldest.id, oldest);
    }
  }
};

const ensureChallengeStoreCleanupTimer = (): void => {
  if (challengeStoreCleanupTimer) {
    return;
  }
  challengeStoreCleanupTimer = setInterval(() => {
    try {
      cleanupExpiredChallenges();
    } catch (error) {
      console.error("[special-training] challenge cleanup failed", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }, CHALLENGE_STORE_CLEANUP_INTERVAL_MS);
  challengeStoreCleanupTimer.unref?.();
};

export const stopSpecialTrainingChallengeRuntime = (): void => {
  if (!challengeStoreCleanupTimer) {
    return;
  }
  clearInterval(challengeStoreCleanupTimer);
  challengeStoreCleanupTimer = null;
};

ensureChallengeStoreCleanupTimer();
