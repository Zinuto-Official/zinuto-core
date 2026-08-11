// SPDX-License-Identifier: GPL-3.0-only

import {
  MANUAL_ACTION_UNDO_MAX_STEPS,
  peekLatestUndoEntry,
  popLatestUndoEntry,
  pushBoundedUndoEntry,
  type ManualActionUndoEntry,
} from '../../domain/trading/manualUndo.js';
import {
  applyRuntimeRiskMetrics,
  buildRiskRuntimeBaseline,
  createTradeRuntimeState,
} from './riskRuntime.js';
import type {
  SpecialTrainingModeId,
  SpecialTrainingQuestionState,
  SpecialTrainingRiskActionBlockReasonCode,
  SpecialTrainingRiskActionState,
  SpecialTrainingRiskActionStatus,
  SpecialTrainingRiskRuntimeBaseline,
  SpecialTrainingTradeAction,
  SpecialTrainingTradeRuntimeState,
} from '../../domain/specialTraining/contracts.js';

type TradeRuntimeState = SpecialTrainingTradeRuntimeState;

export type RiskQuestionDraftState = {
  cursorIndex: number;
  runtime: TradeRuntimeState;
  riskBaseline: SpecialTrainingRiskRuntimeBaseline | null;
  tradeActions: SpecialTrainingTradeAction[];
  undoEntries: ManualActionUndoEntry<
    'BUY_AND_ADVANCE' | 'SELL_AND_ADVANCE' | 'NEXT_BAR',
    {
      cursorIndex: number;
      runtime: TradeRuntimeState;
      riskBaseline: SpecialTrainingRiskRuntimeBaseline | null;
      tradeActions: SpecialTrainingTradeAction[];
    }
  >[];
};

type RiskQuestionDraftOwner = {
  modeId: SpecialTrainingModeId;
  maxEntries: number;
  draftsByQuestionId: Map<string, RiskQuestionDraftState>;
};

const RISK_ACTION_BLOCK_REASON_MESSAGE: Record<
  SpecialTrainingRiskActionBlockReasonCode,
  string
> = {
  NO_ACTIVE_QUESTION: 'No active question',
  NO_ACTIONABLE_BARS: 'No actionable bars left',
  PRICE_UNAVAILABLE: 'Price unavailable',
  BUYING_POWER_EMPTY: 'Buying power empty',
  POSITION_EMPTY: 'No position to sell',
  ENTRY_LIMIT_REACHED: 'Entry limit reached',
  QUANTITY_ZERO: 'Quantity rounds to zero',
  UNDO_EMPTY: 'Nothing to undo',
};

const toFiniteNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
};

const buildRiskActionStatus = (
  blockedReasonCode: SpecialTrainingRiskActionBlockReasonCode | null,
): SpecialTrainingRiskActionStatus => ({
  allowed: blockedReasonCode === null,
  blockedReasonCode,
  blockedReason:
    blockedReasonCode === null
      ? null
      : RISK_ACTION_BLOCK_REASON_MESSAGE[blockedReasonCode],
});

export const buildUnavailableRiskActionState = (
  blockedReasonCode: SpecialTrainingRiskActionBlockReasonCode,
): SpecialTrainingRiskActionState => ({
  buyAdvance: buildRiskActionStatus(blockedReasonCode),
  sellAdvance: buildRiskActionStatus(blockedReasonCode),
  nextBar: buildRiskActionStatus(blockedReasonCode),
  undo: {
    ...buildRiskActionStatus(blockedReasonCode),
    availableSteps: 0,
    maxSteps: MANUAL_ACTION_UNDO_MAX_STEPS,
    lastUndoableAction: null,
  },
});

export const buildRiskActionState = (input: {
  challenge: Pick<RiskQuestionDraftOwner, 'maxEntries'>;
  question: SpecialTrainingQuestionState;
  draft: RiskQuestionDraftState;
  buyEstimate: {
    qty: number | null;
    cashEffect: number | null;
  };
  sellEstimate: {
    qty: number | null;
    cashEffect: number | null;
  };
  currentPrice: number;
}): SpecialTrainingRiskActionState => {
  const { challenge, question, draft, buyEstimate, sellEstimate, currentPrice } =
    input;
  const latestUndoEntry = peekLatestUndoEntry(draft.undoEntries);
  const noActionableBars = draft.cursorIndex >= question.endIndex;

  let buyBlockedReasonCode: SpecialTrainingRiskActionBlockReasonCode | null =
    null;
  if (noActionableBars) {
    buyBlockedReasonCode = 'NO_ACTIONABLE_BARS';
  } else if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    buyBlockedReasonCode = 'PRICE_UNAVAILABLE';
  } else if (
    draft.runtime.positionQty >= 0 &&
    challenge.maxEntries > 0 &&
    draft.runtime.openCount >= challenge.maxEntries
  ) {
    buyBlockedReasonCode = 'ENTRY_LIMIT_REACHED';
  } else if (
    buyEstimate.qty === null &&
    draft.runtime.positionQty >= 0 &&
    draft.runtime.cashBalance <= 0
  ) {
    buyBlockedReasonCode = 'BUYING_POWER_EMPTY';
  } else if (buyEstimate.qty === null) {
    buyBlockedReasonCode = 'QUANTITY_ZERO';
  }

  let sellBlockedReasonCode: SpecialTrainingRiskActionBlockReasonCode | null =
    null;
  if (noActionableBars) {
    sellBlockedReasonCode = 'NO_ACTIONABLE_BARS';
  } else if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    sellBlockedReasonCode = 'PRICE_UNAVAILABLE';
  } else if (draft.runtime.positionQty <= 0) {
    sellBlockedReasonCode = 'POSITION_EMPTY';
  } else if (sellEstimate.qty === null) {
    sellBlockedReasonCode = 'QUANTITY_ZERO';
  }

  return {
    buyAdvance: buildRiskActionStatus(buyBlockedReasonCode),
    sellAdvance: buildRiskActionStatus(sellBlockedReasonCode),
    nextBar: buildRiskActionStatus(
      noActionableBars ? 'NO_ACTIONABLE_BARS' : null,
    ),
    undo: {
      ...buildRiskActionStatus(
        draft.undoEntries.length > 0 ? null : 'UNDO_EMPTY',
      ),
      availableSteps: draft.undoEntries.length,
      maxSteps: MANUAL_ACTION_UNDO_MAX_STEPS,
      lastUndoableAction: latestUndoEntry?.action ?? null,
    },
  };
};

export const getOrCreateRiskQuestionDraft = (
  challenge: RiskQuestionDraftOwner,
  question: SpecialTrainingQuestionState,
): RiskQuestionDraftState => {
  const existing = challenge.draftsByQuestionId.get(question.id);
  if (existing) {
    return existing;
  }
  const startPrice = toFiniteNumber(question.bars[question.startIndex]?.close);
  let runtime = createTradeRuntimeState(challenge.modeId, question);
  runtime = applyRuntimeRiskMetrics(runtime, startPrice);
  const draft: RiskQuestionDraftState = {
    cursorIndex: question.startIndex,
    runtime,
    riskBaseline:
      challenge.modeId === 'risk-discipline-training'
        ? buildRiskRuntimeBaseline(runtime)
        : null,
    tradeActions: [],
    undoEntries: [],
  };
  challenge.draftsByQuestionId.set(question.id, draft);
  return draft;
};

export const cloneRiskQuestionDraftSnapshot = (
  draft: RiskQuestionDraftState,
) => ({
  cursorIndex: draft.cursorIndex,
  runtime: { ...draft.runtime },
  riskBaseline: draft.riskBaseline ? { ...draft.riskBaseline } : null,
  tradeActions: draft.tradeActions.map((action) => ({ ...action })),
});

export const recordRiskQuestionUndoEntry = (
  draft: RiskQuestionDraftState,
  action: 'BUY_AND_ADVANCE' | 'SELL_AND_ADVANCE' | 'NEXT_BAR',
  snapshot = cloneRiskQuestionDraftSnapshot(draft),
): void => {
  draft.undoEntries = pushBoundedUndoEntry(
    draft.undoEntries,
    {
      action,
      snapshot,
      createdAt: new Date().toISOString(),
    },
    MANUAL_ACTION_UNDO_MAX_STEPS,
  );
};

export const restoreRiskQuestionUndoEntry = (
  draft: RiskQuestionDraftState,
): {
  restored: boolean;
} => {
  const { entry, remainingEntries } = popLatestUndoEntry(draft.undoEntries);
  if (!entry) {
    return { restored: false };
  }
  draft.undoEntries = remainingEntries;
  draft.cursorIndex = entry.snapshot.cursorIndex;
  draft.runtime = { ...entry.snapshot.runtime };
  draft.riskBaseline = entry.snapshot.riskBaseline
    ? { ...entry.snapshot.riskBaseline }
    : null;
  draft.tradeActions = entry.snapshot.tradeActions.map((action) => ({
    ...action,
  }));
  return { restored: true };
};
