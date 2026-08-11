// SPDX-License-Identifier: GPL-3.0-only

import { resolveFastDecisionDominanceRatio } from '@zinuto/shared/domain-calculations/fast-decision';
import { isSpecialTrainingQuestionCountAllowed } from '@zinuto/shared/specialTrainingModes';
import { appError, isAppError } from '../../kernel/appError.js';
import { createId } from '../../kernel/id.js';
import { CHALLENGE_TTL_MS } from '../../domain/specialTraining/constants.js';
import {
  buildQuestionFromSlot,
  normalizeEnabledInstrumentIds,
  readUsedSlotCount,
  releaseQuestionSlotReservations,
  reserveNextQuestionSlots,
  resolveModeDecisionSecondsLimit,
  resolveModeFastDecisionStrictnessLevel,
  resolveModeHorizonBars,
  resolveModeMaxEntries,
  resolveModeMaxOperations,
  resolveQuestionScopeState,
  resolveSlotIdentityKey,
  resolveSlotKey as resolveQuestionBankSlotKey,
  restartQuestionScopeLedger,
} from '../specialTraining/questionBank.js';
import { releaseExpiredAssignedQuestionLedgerRows } from '../ports/infrastructure/db/specialTraining/questionLedgerStore.js';
import { listSpecialTrainingInstrumentIdsByPoolScope } from '../specialTraining/banks.js';
import { resolveChallengeBankFromPayload } from '../specialTraining/bankAccess.js';
import { shouldRestartSpecialTrainingScope } from '../specialTraining/questionBankPreview.js';
import {
  challengeStore,
  cleanupExpiredChallenges,
  type SpecialTrainingChallengeQuestionAssignment,
  type SpecialTrainingChallengeState,
} from './challengeRuntimeRegistry.js';
import type {
  SpecialTrainingChallengeProgress,
  SpecialTrainingChallengeRuntime,
  SpecialTrainingQuestionSlot,
  SpecialTrainingQuestionState,
  SpecialTrainingScopeRestartSignal,
  StartSpecialTrainingChallengePayload,
  StartSpecialTrainingChallengeResult,
} from '../../domain/specialTraining/contracts.js';
import { toFiniteNumber } from './challengeNumberSemantics.js';

type StartSpecialTrainingChallengeInternalPayload =
  StartSpecialTrainingChallengePayload & {
    resolvedInstrumentIds?: string[];
  };

const INITIAL_CHALLENGE_QUESTION_PREFETCH_COUNT = 2;

export const startSpecialTrainingChallengeCore = async (
  payload:
    | StartSpecialTrainingChallengePayload
    | StartSpecialTrainingChallengeInternalPayload,
  deps: {
    buildRuntimeSnapshot: (
      challenge: SpecialTrainingChallengeState,
    ) => Promise<SpecialTrainingChallengeRuntime>;
    buildProgressSnapshot: (
      challenge: SpecialTrainingChallengeState,
    ) => SpecialTrainingChallengeProgress;
  },
): Promise<StartSpecialTrainingChallengeResult> => {
  cleanupExpiredChallenges();
  releaseExpiredAssignedQuestionLedgerRows();

  const modeId = payload.modeId;
  const questionCount = Math.floor(toFiniteNumber(payload.questionCount) || 5);
  const horizonBars = resolveModeHorizonBars(modeId, payload.horizonBars);
  const maxOperations = resolveModeMaxOperations(modeId, payload.maxOperations);
  const maxEntries = resolveModeMaxEntries(modeId);
  const decisionSecondsLimit = resolveModeDecisionSecondsLimit(
    modeId,
    payload.decisionSecondsLimit,
  );
  const fastDecisionStrictnessLevel = resolveModeFastDecisionStrictnessLevel(
    modeId,
    payload.fastDecisionStrictnessLevel,
  );
  const fastDecisionDominanceRatio = resolveFastDecisionDominanceRatio({
    strictnessLevel: fastDecisionStrictnessLevel,
  });
  const sourceTag =
    payload.sourceTag === "SYSTEM_DEV_SIMULATION" ? payload.sourceTag : "";
  const bank = resolveChallengeBankFromPayload(payload, sourceTag);
  const selectedPoolIds = [...bank.scope.poolIds];
  const enabledInstrumentIds =
    sourceTag === "SYSTEM_DEV_SIMULATION"
      ? normalizeEnabledInstrumentIds(
          (payload as StartSpecialTrainingChallengeInternalPayload)
            .resolvedInstrumentIds ?? [],
        )
      : listSpecialTrainingInstrumentIdsByPoolScope(selectedPoolIds);
  const simulationBatchId = String(payload.simulationBatchId ?? "").trim() || null;

  if (!isSpecialTrainingQuestionCountAllowed(questionCount)) {
    throw appError("SPECIAL_TRAINING_QUESTION_COUNT_INVALID", {
      value: questionCount,
    });
  }

  if (!enabledInstrumentIds.length) {
    throw appError("SPECIAL_TRAINING_SYMBOLS_REQUIRED");
  }

  let scopeState = await resolveQuestionScopeState(
    modeId,
    bank.id,
    bank.name,
    selectedPoolIds.length,
    enabledInstrumentIds,
    horizonBars,
    bank.targetTimeframe,
  );
  if (!scopeState.normalizedSymbolsWithBars.length) {
    throw appError("SPECIAL_TRAINING_SYMBOLS_NO_DATA");
  }

  let selectedSlots: SpecialTrainingQuestionSlot[] = [];
  let slotLedgerIdByKey: Map<string, string> | null = null;
  let remainingCount = 0;
  let usedCount = 0;
  let reserveAttempt = 0;
  let scopeRestart: SpecialTrainingScopeRestartSignal | null = null;
  let questionAssignments: SpecialTrainingChallengeQuestionAssignment[] = [];
  let firstQuestion: SpecialTrainingQuestionState | null = null;
  let prefetchedQuestionsById = new Map<string, SpecialTrainingQuestionState>();

  while (reserveAttempt < 6) {
    reserveAttempt += 1;
    usedCount = readUsedSlotCount(
      modeId,
      scopeState.scopeHash,
      scopeState.timeframe,
    );
    remainingCount = Math.max(0, scopeState.totalQuestionCount - usedCount);
    if (remainingCount < questionCount) {
      if (
        shouldRestartSpecialTrainingScope({
          requestedQuestionCount: questionCount,
          totalQuestionCount: scopeState.totalQuestionCount,
          remainingQuestionCount: remainingCount,
          usedQuestionCount: usedCount,
          alreadyRestarted: Boolean(scopeRestart),
        })
      ) {
        const restartedAt = new Date().toISOString();
        const restartResult = restartQuestionScopeLedger(
          modeId,
          scopeState.scopeHash,
          scopeState.timeframe,
        );
        scopeRestart = {
          reason: "SCOPE_EXHAUSTED",
          bankId: bank.id,
          bankName: bank.name,
          modeId,
          scopeHash: scopeState.scopeHash,
          timeframe: scopeState.timeframe,
          targetTimeframe: scopeState.targetTimeframe,
          effectiveTimeframe:
            scopeState.effectiveTimeframes.length === 1
              ? scopeState.effectiveTimeframes[0]!
              : scopeState.minimumBaseTimeframe,
          minimumBaseTimeframe: scopeState.minimumBaseTimeframe,
          sourceTimeframe:
            scopeState.sourceTimeframes.length === 1
              ? scopeState.sourceTimeframes[0]!
              : scopeState.minimumBaseTimeframe,
          requestedQuestionCount: questionCount,
          totalQuestionCount: scopeState.totalQuestionCount,
          previousUsedQuestionCount: restartResult.usedCountBeforeRestart,
          deletedLedgerCount: restartResult.deletedCount,
          restartedAt,
        };
        continue;
      }
      break;
    }
    try {
      const reservation = reserveNextQuestionSlots(
        bank.id,
        bank.name,
        scopeState,
        questionCount,
        sourceTag,
        simulationBatchId,
      );
      selectedSlots = reservation.slots;
      slotLedgerIdByKey = reservation.slotLedgerIdByKey;
      usedCount = reservation.usedCountBeforeReserve;
      remainingCount = reservation.remainingCountBeforeReserve;
      if (selectedSlots.length < questionCount) {
        slotLedgerIdByKey = null;
        selectedSlots = [];
        break;
      }
    } catch (error) {
      if (
        !(
          isAppError(error) &&
          error.code === "SPECIAL_TRAINING_QUESTION_GENERATION_FAILED"
        )
      ) {
        throw error;
      }
      slotLedgerIdByKey = null;
      selectedSlots = [];
      questionAssignments = [];
      firstQuestion = null;
      prefetchedQuestionsById = new Map();
      continue;
    }

    try {
      const nextAssignments = selectedSlots.map((slot) => {
        const slotKey = resolveQuestionBankSlotKey(
          resolveSlotIdentityKey({
            instrumentId: slot.instrumentId,
            symbol: slot.symbol,
          }),
          slot.slotIndex,
        );
        const ledgerId = slotLedgerIdByKey?.get(slotKey) ?? "";
        if (!ledgerId) {
          throw appError("SPECIAL_TRAINING_QUESTION_GENERATION_FAILED", {
            modeId,
            reason: "LEDGER_ID_MISSING",
          });
        }
        return {
          questionId: createId(),
          slot,
          ledgerId,
        } satisfies SpecialTrainingChallengeQuestionAssignment;
      });
      const nextPrefetchedQuestionsById = new Map<
        string,
        SpecialTrainingQuestionState
      >();
      for (const assignment of nextAssignments.slice(
        0,
        INITIAL_CHALLENGE_QUESTION_PREFETCH_COUNT,
      )) {
        const question = await buildQuestionFromSlot(
          scopeState,
          assignment.slot,
          assignment.ledgerId,
          assignment.questionId,
        );
        nextPrefetchedQuestionsById.set(question.id, question);
      }
      const firstAssignment = nextAssignments[0] ?? null;
      const nextFirstQuestion = firstAssignment
        ? nextPrefetchedQuestionsById.get(firstAssignment.questionId) ?? null
        : null;
      if (!firstAssignment || !nextFirstQuestion) {
        throw appError("SPECIAL_TRAINING_QUESTION_GENERATION_FAILED", {
          modeId,
          reason: "SLOT_MISSING",
        });
      }
      firstQuestion = nextFirstQuestion;
      prefetchedQuestionsById = nextPrefetchedQuestionsById;
      questionAssignments = nextAssignments;
      break;
    } catch (error) {
      const reservedLedgerIds = slotLedgerIdByKey
        ? Array.from(slotLedgerIdByKey.values())
        : [];
      releaseQuestionSlotReservations(
        reservedLedgerIds,
      );
      slotLedgerIdByKey = null;
      selectedSlots = [];
      questionAssignments = [];
      firstQuestion = null;
      prefetchedQuestionsById = new Map();
      if (
        !(
          isAppError(error) &&
          error.code === "SPECIAL_TRAINING_QUESTION_GENERATION_FAILED"
        )
      ) {
        throw error;
      }
      if (String(error.args?.reason ?? "").trim() === "SLOT_WINDOW_MISSING") {
        scopeState = await resolveQuestionScopeState(
          modeId,
          bank.id,
          bank.name,
          selectedPoolIds.length,
          enabledInstrumentIds,
          horizonBars,
          bank.targetTimeframe,
        );
      }
    }
  }

  if (
    !slotLedgerIdByKey ||
    selectedSlots.length < questionCount ||
    questionAssignments.length < questionCount ||
    !firstQuestion
  ) {
    throw appError("SPECIAL_TRAINING_QUESTION_GENERATION_FAILED", {
      modeId,
      requested: questionCount,
      generated: Math.max(0, Math.floor(remainingCount)),
      total: scopeState.totalQuestionCount,
      used: Math.max(0, Math.floor(usedCount)),
      scopeRestarted: scopeRestart ? 1 : 0,
    });
  }

  const challengeId = createId();
  const createdAtMs = Date.now();
  const expiresAtMs = createdAtMs + CHALLENGE_TTL_MS;

  const challenge: SpecialTrainingChallengeState = {
    id: challengeId,
    bankId: bank.id,
    bankName: bank.name,
    modeId,
    activityPaused: false,
    targetTimeframe: scopeState.targetTimeframe,
    timeframe: scopeState.timeframe,
    minimumBaseTimeframe: scopeState.minimumBaseTimeframe,
    sourceTimeframe:
      scopeState.sourceTimeframes.length === 1
        ? scopeState.sourceTimeframes[0]!
        : scopeState.minimumBaseTimeframe,
    sourceTag,
    simulationBatchId,
    enabledInstrumentIds: [...enabledInstrumentIds],
    questionCount,
    horizonBars,
    maxOperations,
    maxEntries,
    decisionSecondsLimit,
    fastDecisionStrictnessLevel,
    fastDecisionDominanceRatio,
    createdAtMs,
    expiresAtMs,
    scopeState,
    questionIdsInOrder: questionAssignments.map(
      (assignment) => assignment.questionId,
    ),
    questionAssignmentsById: new Map(
      questionAssignments.map((assignment) => [
        assignment.questionId,
        assignment,
      ]),
    ),
    questionsById: prefetchedQuestionsById,
    settledByQuestionId: new Map(),
    settledEntriesByQuestionId: new Map(),
    draftsByQuestionId: new Map(),
    fastDecisionTimersByQuestionId: new Map(),
    historySessionId: null,
    completedSessionSummary: null,
  };

  challengeStore.set(challengeId, challenge);

  const singleEffectiveTimeframe =
    scopeState.effectiveTimeframes.length === 1
      ? scopeState.effectiveTimeframes[0] ?? undefined
      : undefined;
  const singleSourceTimeframe =
    scopeState.sourceTimeframes.length === 1
      ? scopeState.sourceTimeframes[0] ?? undefined
      : undefined;
  const runtime = await deps.buildRuntimeSnapshot(challenge);
  const progress = deps.buildProgressSnapshot(challenge);

  return {
    challengeId,
    bankId: bank.id,
    bankName: bank.name,
    modeId,
    scopeHash: scopeState.scopeHash,
    questionCount,
    createdAt: new Date(createdAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    targetTimeframe: scopeState.targetTimeframe,
    ...(singleEffectiveTimeframe
      ? { effectiveTimeframe: singleEffectiveTimeframe }
      : {}),
    minimumBaseTimeframe: scopeState.minimumBaseTimeframe,
    ...(singleSourceTimeframe ? { sourceTimeframe: singleSourceTimeframe } : {}),
    runtime,
    progress,
    scopeRestart,
  };
};
