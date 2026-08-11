// SPDX-License-Identifier: GPL-3.0-only

import type { OhlcvBar } from "../../domain/models.js";
import type { OperatorSummary } from "@zinuto/shared/operatorSummary";
import { appError } from "../../kernel/appError.js";
import {
  normalizeSpecialTrainingRiskTradeStep,
} from "@zinuto/shared/domain-calculations/special-training-risk";
import {
  buildSpecialTrainingOrderEstimate,
  buildSpecialTrainingOrderQuoteForDraft,
  executeSpecialTrainingTradeAction,
  normalizeSpecialTrainingOrderInputMode,
  normalizeSpecialTrainingOrderInputValue,
  normalizeSpecialTrainingOrderPriceMode,
  RISK_ORDER_BLOCK_REASON_MESSAGE,
} from "../specialTraining/riskOrderQuote.js";
import {
  applyRuntimeRiskMetrics,
  buildRiskRuntimeMetrics,
  calculateTotalAsset,
} from "../specialTraining/riskRuntime.js";
import {
  buildRiskActionState,
  buildUnavailableRiskActionState,
  cloneRiskQuestionDraftSnapshot,
  getOrCreateRiskQuestionDraft,
  recordRiskQuestionUndoEntry,
  restoreRiskQuestionUndoEntry,
} from "../specialTraining/challengeRiskRuntime.js";
import {
  buildQuestionFromSlot,
  markQuestionLedgerSettled,
} from "../specialTraining/questionBank.js";
import {
  assertSpecialTrainingPoolScopeAccess,
  resolveChallengeBankFromPayload,
} from "../specialTraining/bankAccess.js";
import {
  getSpecialTrainingHistorySessionSummaryById,
  persistSpecialTrainingHistorySession,
} from "../ports/infrastructure/db/specialTraining/historyStore.js";
import {
  summarizeSpecialTrainingSession,
  type SpecialTrainingPersistedSessionSummary,
} from "../../domain/specialTraining/sessionSummary.js";
import {
  settleFastDecisionQuestion,
  settleRiskDisciplineQuestion,
} from "../specialTraining/settlement.js";
import {
  applySpecialTrainingChallengeActivity,
  buildFastDecisionTimerSnapshot,
  settleSpecialTrainingFastDecisionTimer,
} from "./challengeActivityRuntime.js";
import {
  challengeStore,
  cleanupExpiredChallenges,
  deleteChallengeRuntimeState,
  downgradePersistedChallengeState,
  type SpecialTrainingChallengeQuestionAssignment,
  type SpecialTrainingChallengeState,
} from './challengeRuntimeRegistry.js';
import { startSpecialTrainingChallengeCore } from './challengeStart.js';
import {
  clamp,
  clampSeconds,
  toFiniteNumber,
} from './challengeNumberSemantics.js';
export { stopSpecialTrainingChallengeRuntime } from './challengeRuntimeRegistry.js';
import type {
  DiscardSpecialTrainingChallengeResult,
  SettleSpecialTrainingQuestionPayload,
  SpecialTrainingChallengeActivityResult,
  SpecialTrainingChallengeCommandResult,
  SpecialTrainingChallengeProgress,
  SpecialTrainingChallengeRuntime,
  SpecialTrainingFastDecisionChoice,
  SpecialTrainingFastDecisionStrictnessLevel,
  SpecialTrainingOrderInputMode,
  SpecialTrainingOrderPriceMode,
  SpecialTrainingOrderQuote,
  SpecialTrainingOrderQuotePayload,
  SpecialTrainingPublicQuestion,
  SpecialTrainingQuestionState,
  SpecialTrainingSettlementResult,
  SpecialTrainingTradeAction,
  StartSpecialTrainingChallengePayload,
  StartSpecialTrainingChallengeResult,
} from "../../domain/specialTraining/contracts.js";
export type SpecialTrainingFastDecisionQuestionSnapshot = {
  challengeId: string;
  modeId: "fast-decision-training";
  questionCount: number;
  questionIndex: number | null;
  questionId: string | null;
  symbol: string | null;
  timeframe: "1m" | "5m" | "1h" | "1d" | null;
  bars: OhlcvBar[];
  startIndex: number | null;
  endIndex: number | null;
  minTradeStep: number | null;
  decisionSecondsLimit: number;
  strictnessLevel: SpecialTrainingFastDecisionStrictnessLevel;
  dominanceRatio: number;
};

export const startSpecialTrainingChallengeWithAccess = async (
  payload: StartSpecialTrainingChallengePayload,
): Promise<StartSpecialTrainingChallengeResult> => {
  const sourceTag =
    payload.sourceTag === "SYSTEM_DEV_SIMULATION" ? payload.sourceTag : "";
  const bank = resolveChallengeBankFromPayload(payload, sourceTag);
  if (sourceTag !== "SYSTEM_DEV_SIMULATION") {
    await assertSpecialTrainingPoolScopeAccess([...bank.scope.poolIds]);
  }
  return startSpecialTrainingChallenge(payload);
};

const toPublicQuestion = (
  question: SpecialTrainingQuestionState | null,
): SpecialTrainingPublicQuestion | null => {
  if (!question) {
    return null;
  }
  return {
    id: question.id,
    instrumentId: question.instrumentId,
    samplePoolId: question.samplePoolId,
    barsVersionToken: question.barsVersionToken,
    symbol: question.symbol,
    timeframe: question.timeframe,
    targetTimeframe: question.targetTimeframe,
    effectiveTimeframe: question.effectiveTimeframe,
    minimumBaseTimeframe: question.minimumBaseTimeframe,
    sourceTimeframe: question.sourceTimeframe,
    bars: question.bars,
    startIndex: question.startIndex,
    endIndex: question.endIndex,
    minTradeStep: question.minTradeStep,
    requestedMinimumBaseTimeframe: question.minimumBaseTimeframe,
  };
};

const buildChallengeSummaryEntries = (
  challenge: SpecialTrainingChallengeState,
) =>
  challenge.questionIdsInOrder.flatMap((questionId) => {
    const question = challenge.questionsById.get(questionId);
    const entry = challenge.settledEntriesByQuestionId.get(questionId);
    if (!question || !entry) {
      return [];
    }
    return [
      {
        question,
        payload: entry.payload,
        result: entry.result,
      },
    ];
  });

const buildChallengeSessionSummary = (
  challenge: SpecialTrainingChallengeState,
): SpecialTrainingPersistedSessionSummary | null => {
  if (challenge.completedSessionSummary) {
    return challenge.completedSessionSummary;
  }
  const entries = buildChallengeSummaryEntries(challenge);
  if (!entries.length) {
    return null;
  }
  return summarizeSpecialTrainingSession(challenge.modeId, entries);
};

const buildChallengeProgressSnapshot = (
  challenge: SpecialTrainingChallengeState,
): SpecialTrainingChallengeProgress => {
  const settledCount = resolveChallengeSettledCount(challenge);
  const { questionIndex, questionId, assignment, question } =
    resolveCurrentChallengeQuestionMeta(challenge);
  const latestQuestionId =
    settledCount > 0
      ? challenge.questionIdsInOrder[settledCount - 1] ?? null
      : null;
  const latestSettlement = latestQuestionId
    ? challenge.settledEntriesByQuestionId.get(latestQuestionId)?.result ?? null
    : null;
  return {
    challengeId: challenge.id,
    modeId: challenge.modeId,
    questionCount: challenge.questionCount,
    settledCount,
    currentQuestionIndex: questionIndex,
    currentQuestionId: question?.id ?? questionId,
    currentQuestionSymbol: question?.symbol ?? assignment?.slot.symbol ?? null,
    latestSettlementQuestionId: latestQuestionId,
    latestSettlement:
      latestQuestionId && latestSettlement
        ? {
            questionId: latestQuestionId,
            passed: latestSettlement.passed,
            score: latestSettlement.score,
            totalPnl: latestSettlement.totalPnl,
            finalTotalAsset: latestSettlement.finalTotalAsset,
            maxDrawdownRatio: latestSettlement.maxDrawdownRatio,
            grade: latestSettlement.grade,
            feedbackCodes: [...latestSettlement.feedbackCodes],
            fastReview: latestSettlement.fastReview ?? null,
            directionResult: latestSettlement.directionResult,
          }
        : null,
    finishedSessionId: challenge.historySessionId,
    sessionSummary: buildChallengeSessionSummary(challenge),
  };
};

const buildChallengeRuntimeSnapshot = async (
  challenge: SpecialTrainingChallengeState,
  options: {
    questionId?: string | null;
    questionIndex?: number | null;
    materializeQuestion?: boolean;
  } = {},
): Promise<SpecialTrainingChallengeRuntime> => {
  const progress = buildChallengeProgressSnapshot(challenge);
  const normalizedOverrideQuestionId = String(options.questionId ?? "").trim();
  const resolvedMeta = normalizedOverrideQuestionId
    ? {
        questionIndex:
          options.questionIndex ??
          Math.max(
            0,
            challenge.questionIdsInOrder.findIndex(
              (questionId) => questionId === normalizedOverrideQuestionId,
            ),
          ),
        questionId: normalizedOverrideQuestionId,
        assignment:
          challenge.questionAssignmentsById.get(normalizedOverrideQuestionId) ??
          null,
        question:
          challenge.questionsById.get(normalizedOverrideQuestionId) ?? null,
      }
    : resolveCurrentChallengeQuestionMeta(challenge);
  const questionIndex = resolvedMeta.questionIndex;
  const question =
    resolvedMeta.questionId && options.materializeQuestion !== false
      ? await materializeChallengeQuestion(challenge, resolvedMeta.questionId)
      : resolvedMeta.question;
  if (!question) {
    return {
      challengeId: challenge.id,
      modeId: challenge.modeId,
      activityPaused: challenge.activityPaused,
      questionCount: challenge.questionCount,
      settledCount: progress.settledCount,
      currentQuestionIndex: questionIndex,
      currentQuestionId: resolvedMeta.questionId,
      question: null,
      cursorIndex: null,
      questionStartIndex: null,
      questionEndIndex: null,
      tradeRuntime: null,
      riskBaseline: null,
      riskMetrics: null,
      fastDecisionTimer: null,
      tradeActions: [],
      currentPrice: null,
      currentTotalAsset: null,
      floatingPnl: null,
      remainingActionableBars: 0,
      buyEstimate: null,
      sellEstimate: null,
      actionState:
        challenge.modeId === "risk-discipline-training"
          ? buildUnavailableRiskActionState("NO_ACTIVE_QUESTION")
          : null,
      sessionSummary: progress.sessionSummary,
    };
  }

  if (challenge.modeId !== "risk-discipline-training") {
    return {
      challengeId: challenge.id,
      modeId: challenge.modeId,
      activityPaused: challenge.activityPaused,
      questionCount: challenge.questionCount,
      settledCount: progress.settledCount,
      currentQuestionIndex: questionIndex,
      currentQuestionId: question.id,
      question: toPublicQuestion(question),
      cursorIndex: question.startIndex,
      questionStartIndex: question.startIndex,
      questionEndIndex: question.endIndex,
      tradeRuntime: null,
      riskBaseline: null,
      riskMetrics: null,
      fastDecisionTimer: buildFastDecisionTimerSnapshot(challenge, question.id),
      tradeActions: [],
      currentPrice: toFiniteNumber(question.bars[question.startIndex]?.close) || null,
      currentTotalAsset: null,
      floatingPnl: null,
      remainingActionableBars: Math.max(0, question.endIndex - question.startIndex),
      buyEstimate: null,
      sellEstimate: null,
      actionState: null,
      sessionSummary: progress.sessionSummary,
    };
  }

  const draft = getOrCreateRiskQuestionDraft(challenge, question);
  const currentPrice = toFiniteNumber(question.bars[draft.cursorIndex]?.close);
  const currentTotalAsset =
    Number.isFinite(currentPrice) && currentPrice > 0
      ? calculateTotalAsset(draft.runtime, currentPrice)
      : calculateTotalAsset(draft.runtime, draft.runtime.entryPrice);
  const floatingPnl =
    Number.isFinite(currentPrice) &&
    currentPrice > 0 &&
    Number.isFinite(draft.runtime.entryPrice)
      ? (currentPrice - draft.runtime.entryPrice) * draft.runtime.positionQty
      : 0;
  const tradeStep = normalizeSpecialTrainingRiskTradeStep(question.minTradeStep);
  const buyEstimate = buildSpecialTrainingOrderEstimate({
    side: "BUY",
    runtime: draft.runtime,
    order: {
      inputMode: "RATIO",
      ratioInput: "25",
    },
    price: currentPrice,
    tradeStep,
    maxOperations: challenge.maxOperations,
    maxEntries: challenge.maxEntries,
  });
  const sellEstimate = buildSpecialTrainingOrderEstimate({
    side: "SELL",
    runtime: draft.runtime,
    order: {
      inputMode: "RATIO",
      ratioInput: "100",
    },
    price: currentPrice,
    tradeStep,
    maxOperations: challenge.maxOperations,
    maxEntries: challenge.maxEntries,
  });
  const runtimeBuyEstimate = {
    qty: buyEstimate.qty > 0 ? buyEstimate.qty : null,
    cashEffect: buyEstimate.cashEffect > 0 ? buyEstimate.cashEffect : null,
  };
  const runtimeSellEstimate = {
    qty: sellEstimate.qty > 0 ? sellEstimate.qty : null,
    cashEffect: sellEstimate.cashEffect > 0 ? sellEstimate.cashEffect : null,
  };
  const actionState = buildRiskActionState({
    challenge,
    question,
    draft,
    buyEstimate: runtimeBuyEstimate,
    sellEstimate: runtimeSellEstimate,
    currentPrice,
  });
  const riskMetrics = buildRiskRuntimeMetrics({
    runtime: draft.runtime,
    riskBaseline: draft.riskBaseline,
    currentPrice: Number.isFinite(currentPrice) ? currentPrice : null,
    currentTotalAsset: Number.isFinite(currentTotalAsset)
      ? currentTotalAsset
      : null,
    floatingPnl: Number.isFinite(floatingPnl) ? floatingPnl : null,
    cursorIndex: draft.cursorIndex,
    questionStartIndex: question.startIndex,
    questionEndIndex: question.endIndex,
  });
  return {
    challengeId: challenge.id,
    modeId: challenge.modeId,
    activityPaused: challenge.activityPaused,
    questionCount: challenge.questionCount,
    settledCount: progress.settledCount,
    currentQuestionIndex: questionIndex,
    currentQuestionId: question.id,
    question: toPublicQuestion(question),
    cursorIndex: draft.cursorIndex,
    questionStartIndex: question.startIndex,
    questionEndIndex: question.endIndex,
    tradeRuntime: draft.runtime,
    riskBaseline: draft.riskBaseline,
    riskMetrics,
    fastDecisionTimer: null,
    tradeActions: [...draft.tradeActions],
    currentPrice: Number.isFinite(currentPrice) ? currentPrice : null,
    currentTotalAsset: Number.isFinite(currentTotalAsset) ? currentTotalAsset : null,
    floatingPnl: Number.isFinite(floatingPnl) ? floatingPnl : null,
    remainingActionableBars: Math.max(0, question.endIndex - draft.cursorIndex),
    buyEstimate: runtimeBuyEstimate,
    sellEstimate: runtimeSellEstimate,
    actionState,
    sessionSummary: progress.sessionSummary,
  };
};

const resolveChallenge = (
  challengeId: string,
): SpecialTrainingChallengeState => {
  cleanupExpiredChallenges();

  const normalizedChallengeId = String(challengeId || "").trim();
  if (!normalizedChallengeId) {
    throw appError("SPECIAL_TRAINING_CHALLENGE_NOT_FOUND");
  }

  const challenge = challengeStore.get(normalizedChallengeId);
  if (!challenge || challenge.expiresAtMs <= Date.now()) {
    if (challenge) {
      deleteChallengeRuntimeState(normalizedChallengeId, challenge);
    } else {
      challengeStore.delete(normalizedChallengeId);
    }
    throw appError("SPECIAL_TRAINING_CHALLENGE_NOT_FOUND");
  }

  return challenge;
};

export const discardSpecialTrainingChallenge = (
  challengeId: string,
): DiscardSpecialTrainingChallengeResult => {
  cleanupExpiredChallenges();

  const normalizedChallengeId = String(challengeId || "").trim();
  if (!normalizedChallengeId) {
    return {
      challengeId: normalizedChallengeId,
      deleted: false,
      releasedQuestionLedgerRows: 0,
    };
  }

  const challenge = challengeStore.get(normalizedChallengeId);
  if (!challenge || challenge.expiresAtMs <= Date.now()) {
    if (challenge) {
      deleteChallengeRuntimeState(normalizedChallengeId, challenge);
    } else {
      challengeStore.delete(normalizedChallengeId);
    }
    return {
      challengeId: normalizedChallengeId,
      deleted: false,
      releasedQuestionLedgerRows: 0,
    };
  }

  if (challenge.historySessionId) {
    return {
      challengeId: normalizedChallengeId,
      deleted: false,
      releasedQuestionLedgerRows: 0,
    };
  }

  const { releasedQuestionLedgerRows } =
    deleteChallengeRuntimeState(normalizedChallengeId, challenge);

  return {
    challengeId: normalizedChallengeId,
    deleted: true,
    releasedQuestionLedgerRows,
  };
};

const resolveChallengeSettledCount = (
  challenge: SpecialTrainingChallengeState,
): number => challenge.settledEntriesByQuestionId.size;

const resolveCurrentChallengeQuestionMeta = (
  challenge: SpecialTrainingChallengeState,
): {
  questionIndex: number | null;
  questionId: string | null;
  assignment: SpecialTrainingChallengeQuestionAssignment | null;
  question: SpecialTrainingQuestionState | null;
} => {
  const settledCount = resolveChallengeSettledCount(challenge);
  if (settledCount >= challenge.questionIdsInOrder.length) {
    return {
      questionIndex: null,
      questionId: null,
      assignment: null,
      question: null,
    };
  }
  const questionId = challenge.questionIdsInOrder[settledCount] ?? null;
  return {
    questionIndex: questionId ? settledCount : null,
    questionId,
    assignment: questionId
      ? challenge.questionAssignmentsById.get(questionId) ?? null
      : null,
    question: questionId ? challenge.questionsById.get(questionId) ?? null : null,
  };
};

const materializeChallengeQuestion = async (
  challenge: SpecialTrainingChallengeState,
  questionId: string,
): Promise<SpecialTrainingQuestionState> => {
  const normalizedQuestionId = String(questionId || "").trim();
  const cached = challenge.questionsById.get(normalizedQuestionId);
  if (cached) {
    return cached;
  }
  const assignment = challenge.questionAssignmentsById.get(normalizedQuestionId);
  if (!assignment) {
    throw appError("SPECIAL_TRAINING_QUESTION_NOT_FOUND");
  }
  const question = await buildQuestionFromSlot(
    challenge.scopeState,
    assignment.slot,
    assignment.ledgerId,
    assignment.questionId,
  );
  challenge.questionsById.set(question.id, question);
  return question;
};

const resolveCurrentChallengeQuestion = async (
  challenge: SpecialTrainingChallengeState,
): Promise<{
  questionIndex: number | null;
  question: SpecialTrainingQuestionState | null;
}> => {
  const current = resolveCurrentChallengeQuestionMeta(challenge);
  if (!current.questionId) {
    return {
      questionIndex: current.questionIndex,
      question: null,
    };
  }
  return {
    questionIndex: current.questionIndex,
    question: await materializeChallengeQuestion(challenge, current.questionId),
  };
};

export const getSpecialTrainingChallengeProgress = (
  challengeId: string,
): SpecialTrainingChallengeProgress => {
  const challenge = resolveChallenge(challengeId);
  return buildChallengeProgressSnapshot(challenge);
};

export const getSpecialTrainingFastDecisionQuestionSnapshot = async (
  challengeId: string,
): Promise<SpecialTrainingFastDecisionQuestionSnapshot> => {
  const challenge = resolveChallenge(challengeId);
  if (challenge.modeId !== "fast-decision-training") {
    throw appError("SPECIAL_TRAINING_MODE_INVALID");
  }
  const { questionIndex, question } =
    await resolveCurrentChallengeQuestion(challenge);
  return {
    challengeId: challenge.id,
    modeId: "fast-decision-training",
    questionCount: challenge.questionCount,
    questionIndex,
    questionId: question?.id ?? null,
    symbol: question?.symbol ?? null,
    timeframe:
      question?.timeframe === "1m" ||
      question?.timeframe === "5m" ||
      question?.timeframe === "1h" ||
      question?.timeframe === "1d"
        ? question.timeframe
        : null,
    bars: question?.bars ?? [],
    startIndex: question ? question.startIndex : null,
    endIndex: question ? question.endIndex : null,
    minTradeStep: question ? question.minTradeStep : null,
    decisionSecondsLimit: challenge.decisionSecondsLimit,
    strictnessLevel: challenge.fastDecisionStrictnessLevel,
    dominanceRatio: challenge.fastDecisionDominanceRatio,
  };
};

export const getSpecialTrainingChallengeRuntime = async (
  challengeId: string,
): Promise<SpecialTrainingChallengeRuntime> => {
  const challenge = resolveChallenge(challengeId);
  return buildChallengeRuntimeSnapshot(challenge);
};

export const setSpecialTrainingChallengeActivity = async (
  challengeId: string,
  paused: boolean,
): Promise<SpecialTrainingChallengeActivityResult> => {
  const challenge = resolveChallenge(challengeId);
  const nextPaused = Boolean(paused);
  applySpecialTrainingChallengeActivity(challenge, nextPaused);
  const runtime = await buildChallengeRuntimeSnapshot(challenge);
  return {
    challengeId: challenge.id,
    paused: challenge.activityPaused,
    runtime,
  };
};

export const getSpecialTrainingChallengeOrderQuote = async (
  challengeId: string,
  payload: SpecialTrainingOrderQuotePayload,
): Promise<SpecialTrainingOrderQuote> => {
  const challenge = resolveChallenge(challengeId);
  if (challenge.modeId !== "risk-discipline-training") {
    throw appError("SPECIAL_TRAINING_MODE_INVALID");
  }
  const { question } = await resolveCurrentChallengeQuestion(challenge);
  if (!question) {
    throw appError("SPECIAL_TRAINING_QUESTION_NOT_FOUND");
  }
  const draft = getOrCreateRiskQuestionDraft(challenge, question);
  return buildSpecialTrainingOrderQuoteForDraft({
    challenge,
    question,
    draft,
    payload,
  });
};

export const executeSpecialTrainingChallengeAction = async (
  challengeId: string,
  payload: {
    action:
      | "BUY"
      | "SELL"
      | "BUY_AND_ADVANCE"
      | "SELL_AND_ADVANCE"
      | "NEXT_BAR"
      | "UNDO";
    inputMode?: SpecialTrainingOrderInputMode;
    lotInput?: string | number | null;
    amountInput?: string | number | null;
    ratioInput?: string | number | null;
    priceMode?: SpecialTrainingOrderPriceMode;
    nextOpenDelayBars?: number;
  },
): Promise<SpecialTrainingChallengeCommandResult> => {
  const challenge = resolveChallenge(challengeId);
  if (challenge.modeId !== "risk-discipline-training") {
    throw appError("SPECIAL_TRAINING_MODE_INVALID");
  }
  const { questionIndex, question } =
    await resolveCurrentChallengeQuestion(challenge);
  if (!question) {
    throw appError("SPECIAL_TRAINING_QUESTION_NOT_FOUND");
  }
  const draft = getOrCreateRiskQuestionDraft(challenge, question);
  const action = payload.action;
  const snapshotBeforeAction = cloneRiskQuestionDraftSnapshot(draft);

  if (action === "UNDO") {
    const restored = restoreRiskQuestionUndoEntry(draft);
    if (!restored.restored) {
      throw appError("INVALID_PARAMS");
    }
  } else if (
    action === "BUY" ||
    action === "SELL" ||
    action === "BUY_AND_ADVANCE" ||
    action === "SELL_AND_ADVANCE"
  ) {
    const tradeType =
      action === "BUY" || action === "BUY_AND_ADVANCE" ? "BUY" : "SELL";
    const orderInputMode = normalizeSpecialTrainingOrderInputMode(payload.inputMode);
    const orderPriceMode = normalizeSpecialTrainingOrderPriceMode(payload.priceMode);
    const quote = buildSpecialTrainingOrderQuoteForDraft({
      challenge,
      question,
      draft,
      payload: {
        side: tradeType,
        inputMode: orderInputMode,
        lotInput: payload.lotInput,
        amountInput: payload.amountInput,
        ratioInput:
          payload.ratioInput ??
          (tradeType === "BUY" ? "25" : "100"),
        priceMode: orderPriceMode,
        nextOpenDelayBars: payload.nextOpenDelayBars,
      },
    });
    if (quote.blockedReasonCode || quote.estimate.qty <= 0) {
      throw appError("ORDER_BLOCKED", {
        blockedReasonCode: quote.blockedReasonCode ?? "QUANTITY_ZERO",
        blockedReason:
          quote.blockedReason ??
          RISK_ORDER_BLOCK_REASON_MESSAGE.QUANTITY_ZERO,
      });
    }
    const executionPrice = quote.executionPlan?.fillPrice ?? quote.estimate.price;
    const executionBarIndex = quote.executionPlan?.fillRawIndex ?? draft.cursorIndex;
    const normalizedAction: SpecialTrainingTradeAction = {
      type: tradeType,
      barIndex: executionBarIndex,
      inputMode: orderInputMode,
      priceMode: quote.priceMode,
      lotInput: normalizeSpecialTrainingOrderInputValue(payload.lotInput),
      amountInput: normalizeSpecialTrainingOrderInputValue(payload.amountInput),
      ratioInput: normalizeSpecialTrainingOrderInputValue(
        payload.ratioInput ?? (tradeType === "BUY" ? "25" : "100"),
      ),
      quantity: quote.estimate.qty,
      executionPrice,
      cashEffect: quote.estimate.cashEffect,
    };
    const nextRuntime = applyRuntimeRiskMetrics(
      executeSpecialTrainingTradeAction({
        runtime: draft.runtime,
        action: normalizedAction,
        markPrice: executionPrice,
        tradeStep: question.minTradeStep,
        maxOperations: challenge.maxOperations,
        maxEntries: challenge.maxEntries,
      }),
      executionPrice,
    );
    const tradeChanged =
      nextRuntime.usedOperations !== draft.runtime.usedOperations ||
      nextRuntime.positionQty !== draft.runtime.positionQty ||
      nextRuntime.cashBalance !== draft.runtime.cashBalance ||
      !Object.is(nextRuntime.entryPrice, draft.runtime.entryPrice);
    if (tradeChanged) {
      draft.runtime = nextRuntime;
      draft.tradeActions = [...draft.tradeActions, normalizedAction];
    }
    if (tradeChanged) {
      const shouldEnterNextState =
        action === "BUY_AND_ADVANCE" ||
        action === "SELL_AND_ADVANCE" ||
        quote.priceMode === "NEXT_OPEN";
      if (shouldEnterNextState && draft.cursorIndex < question.endIndex) {
        draft.cursorIndex =
          quote.priceMode === "NEXT_OPEN"
            ? clamp(executionBarIndex, question.startIndex, question.endIndex)
            : Math.min(question.endIndex, draft.cursorIndex + 1);
        const nextPrice = toFiniteNumber(question.bars[draft.cursorIndex]?.close);
        draft.runtime = applyRuntimeRiskMetrics(draft.runtime, nextPrice);
      }
      if (action === "BUY_AND_ADVANCE" || action === "SELL_AND_ADVANCE") {
        recordRiskQuestionUndoEntry(draft, action, snapshotBeforeAction);
      }
    }
  } else if (action === "NEXT_BAR" && draft.cursorIndex < question.endIndex) {
    draft.cursorIndex = Math.min(question.endIndex, draft.cursorIndex + 1);
    const nextPrice = toFiniteNumber(question.bars[draft.cursorIndex]?.close);
    draft.runtime = applyRuntimeRiskMetrics(draft.runtime, nextPrice);
    recordRiskQuestionUndoEntry(draft, "NEXT_BAR", snapshotBeforeAction);
  }

  let settlement: SpecialTrainingSettlementResult | null = null;
  if (
    draft.cursorIndex >= question.endIndex ||
    (challenge.maxOperations > 0 && draft.runtime.usedOperations >= challenge.maxOperations)
  ) {
    settlement = await settleSpecialTrainingQuestion(challenge.id, question.id, {
      cursorIndex: draft.cursorIndex,
      tradeActions: draft.tradeActions,
    });
    draft.undoEntries = [];
  }

  const progress = buildChallengeProgressSnapshot(challenge);
  return {
    runtime: await buildChallengeRuntimeSnapshot(
      challenge,
      settlement
        ? { questionId: question.id, questionIndex }
        : undefined,
    ),
    progress,
    settlement,
  };
};

export const submitSpecialTrainingChallengeDecision = async (
  challengeId: string,
  payload: {
    selection: SpecialTrainingFastDecisionChoice;
    decisionSecondsUsed?: number;
    timedOut?: boolean;
  },
): Promise<SpecialTrainingChallengeCommandResult> => {
  const challenge = resolveChallenge(challengeId);
  if (challenge.modeId !== "fast-decision-training") {
    throw appError("SPECIAL_TRAINING_MODE_INVALID");
  }
  const { questionIndex, question } = await resolveCurrentChallengeQuestion(challenge);
  if (!question) {
    throw appError("SPECIAL_TRAINING_QUESTION_NOT_FOUND");
  }
  const timer = buildFastDecisionTimerSnapshot(challenge, question.id);
  const elapsedSeconds =
    timer?.elapsedSeconds ??
    clampSeconds(
      toFiniteNumber(payload.decisionSecondsUsed),
      challenge.decisionSecondsLimit,
    );
  const settlement = await settleSpecialTrainingQuestion(challenge.id, question.id, {
    fastDecision: {
      selection: payload.selection,
      decisionSecondsUsed: elapsedSeconds,
      timedOut: Boolean(payload.timedOut) || Boolean(timer?.timedOut),
    },
  });
  const progress = buildChallengeProgressSnapshot(challenge);
  return {
    runtime: await buildChallengeRuntimeSnapshot(challenge, {
      questionId: question.id,
      questionIndex,
    }),
    progress,
    settlement,
  };
};

export const startSpecialTrainingChallenge = async (
  payload: StartSpecialTrainingChallengePayload,
): Promise<StartSpecialTrainingChallengeResult> =>
  startSpecialTrainingChallengeCore(payload, {
    buildRuntimeSnapshot: buildChallengeRuntimeSnapshot,
    buildProgressSnapshot: buildChallengeProgressSnapshot,
  });

export {
  previewSpecialTrainingQuestionBank,
  previewSpecialTrainingQuestionBankDraft,
  previewSpecialTrainingQuestionBankWithAccess,
  resetSpecialTrainingQuestionBank,
} from './challengeBankPreviewOperations.js';

export const settleSpecialTrainingQuestion = async (
  challengeId: string,
  questionId: string,
  payload: SettleSpecialTrainingQuestionPayload,
  options?: {
    settledAt?: string;
    operatorSummary?: OperatorSummary | null;
  },
): Promise<SpecialTrainingSettlementResult> => {
  const challenge = resolveChallenge(challengeId);

  const normalizedQuestionId = String(questionId || "").trim();
  if (!normalizedQuestionId) {
    throw appError("SPECIAL_TRAINING_QUESTION_NOT_FOUND");
  }

  const cachedSettlement = challenge.settledByQuestionId.get(normalizedQuestionId);
  if (cachedSettlement) {
    const sessionSummary = buildChallengeSessionSummary(challenge);
    const completedCount =
      sessionSummary?.completedCount ?? challenge.settledEntriesByQuestionId.size;
    return {
      ...cachedSettlement,
      sessionCompletion: {
        completed: completedCount >= challenge.questionCount,
        completedCount,
        questionCount: challenge.questionCount,
        finishedSessionId: challenge.historySessionId,
      },
      sessionSummary,
    };
  }

  const question = await materializeChallengeQuestion(
    challenge,
    normalizedQuestionId,
  );

  const abandoned = Boolean(payload.abandoned);
  const settledAt = String(options?.settledAt || "").trim() || new Date().toISOString();

  settleSpecialTrainingFastDecisionTimer(challenge, normalizedQuestionId);

  let result: SpecialTrainingSettlementResult;
  switch (challenge.modeId) {
    case "fast-decision-training":
      result = settleFastDecisionQuestion(question, payload, abandoned, {
        maxOperations: challenge.maxOperations,
        horizonBars: challenge.horizonBars,
        decisionSecondsLimit: challenge.decisionSecondsLimit,
        strictnessLevel: challenge.fastDecisionStrictnessLevel,
        dominanceRatio: challenge.fastDecisionDominanceRatio,
      });
      break;
    case "risk-discipline-training":
      result = settleRiskDisciplineQuestion(question, payload, abandoned, {
        maxOperations: challenge.maxOperations,
        maxEntries: challenge.maxEntries,
      });
      break;
    default:
      throw appError("SPECIAL_TRAINING_MODE_INVALID");
  }

  markQuestionLedgerSettled(question, result, abandoned, settledAt);
  challenge.settledEntriesByQuestionId.set(normalizedQuestionId, {
    result,
    payload: {
      abandoned,
      cursorIndex: payload.cursorIndex,
      decisionSecondsUsed: payload.decisionSecondsUsed,
      fastDecision: payload.fastDecision,
      tradeActions: Array.isArray(payload.tradeActions)
        ? payload.tradeActions
        : [],
    },
    abandoned,
    settledAt,
  });
  if (
    challenge.historySessionId === null &&
    challenge.settledEntriesByQuestionId.size >= challenge.questionCount
  ) {
    const completedSessionSummary = buildChallengeSessionSummary(challenge);
    challenge.historySessionId = persistSpecialTrainingHistorySession({
      challengeId: challenge.id,
      bankId: challenge.bankId,
      bankName: challenge.bankName,
      modeId: challenge.modeId,
      questionCount: challenge.questionCount,
      horizonBars: challenge.horizonBars,
      maxOperations: challenge.maxOperations,
      maxEntries: challenge.maxEntries,
      decisionSecondsLimit: challenge.decisionSecondsLimit,
      fastDecisionStrictnessLevel: challenge.fastDecisionStrictnessLevel,
      fastDecisionDominanceRatio: challenge.fastDecisionDominanceRatio,
      createdAtMs: challenge.createdAtMs,
      timeframe: challenge.timeframe,
      sourceTag: challenge.sourceTag,
      simulationBatchId: challenge.simulationBatchId,
      enabledInstrumentIds: challenge.enabledInstrumentIds,
      questionIds: challenge.questionIdsInOrder,
      questionsById: challenge.questionsById,
      settledEntriesByQuestionId: challenge.settledEntriesByQuestionId,
      operatorSummary: options?.operatorSummary ?? null,
    });
    const persistedSession = getSpecialTrainingHistorySessionSummaryById(
      challenge.historySessionId,
    );
    challenge.completedSessionSummary =
      persistedSession?.sessionSummary ?? completedSessionSummary;
    downgradePersistedChallengeState(challenge);
  }
  const sessionSummary = buildChallengeSessionSummary(challenge);
  const completedCount =
    sessionSummary?.completedCount ?? challenge.settledEntriesByQuestionId.size;
  const settlementWithSessionSummary: SpecialTrainingSettlementResult = {
    ...result,
    sessionCompletion: {
      completed: completedCount >= challenge.questionCount,
      completedCount,
      questionCount: challenge.questionCount,
      finishedSessionId: challenge.historySessionId,
    },
    sessionSummary,
  };
  challenge.settledByQuestionId.set(normalizedQuestionId, settlementWithSessionSummary);
  return settlementWithSessionSummary;
};
