// SPDX-License-Identifier: GPL-3.0-only

import { appError } from '../../kernel/appError.js';
import {
  assertSpecialTrainingPoolScopeAccess,
  requireSpecialTrainingBank,
} from './bankAccess.js';
import {
  listSpecialTrainingInstrumentIdsByPoolScope,
  resolveSpecialTrainingBankScopeSummary,
  validateSpecialTrainingBankDraft,
} from './banks.js';
import type {
  SpecialTrainingBankScopeSummary,
  SpecialTrainingQuestionBankDraftPreviewPayload,
  SpecialTrainingQuestionBankPreviewPayload,
  SpecialTrainingQuestionBankResetPayload,
  SpecialTrainingQuestionBankSummary,
} from '../../domain/specialTraining/contracts.js';
import {
  readUsedSlotCount,
  resetModeQuestionBankLedger,
  resolveModeHorizonBars,
  resolveQuestionBankSummary,
  resolveQuestionBankSummaryStateFromMeta,
} from './questionBank.js';

type QuestionBankPreviewHooks = {
  beforePreview?: () => void;
};

export const shouldRestartSpecialTrainingScope = (input: {
  requestedQuestionCount: number;
  totalQuestionCount: number;
  remainingQuestionCount: number;
  usedQuestionCount: number;
  alreadyRestarted: boolean;
}): boolean => {
  if (input.alreadyRestarted) {
    return false;
  }
  if (input.remainingQuestionCount >= input.requestedQuestionCount) {
    return false;
  }
  if (input.usedQuestionCount <= 0) {
    return false;
  }
  if (input.totalQuestionCount < input.requestedQuestionCount) {
    return false;
  }
  return true;
};

const normalizeRequestedQuestionCount = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.max(1, Math.floor(numeric));
};

const normalizeCount = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
};

const normalizeScopeHash = (value: unknown): string =>
  String(value ?? '').trim();

const buildQuestionBankRuntimeFacts = (input: {
  reason: 'preview' | 'reset';
  modeId: SpecialTrainingQuestionBankSummary['modeId'];
  status: SpecialTrainingQuestionBankSummary['status'];
  scopeHash: string;
  poolCount: number;
  instrumentCount: number;
  symbolCount: number;
  totalQuestionCount: number;
  completedQuestionCount: number;
  availableQuestionCount: number;
  requestedQuestionCount?: number;
  previousSummary?: SpecialTrainingQuestionBankPreviewPayload['previousSummary'];
  activeSession?: SpecialTrainingQuestionBankPreviewPayload['activeSession'];
}): Pick<
  SpecialTrainingQuestionBankSummary,
  'capacity' | 'actionAvailability' | 'runtimeState'
> => {
  const requestedQuestionCount = normalizeRequestedQuestionCount(
    input.requestedQuestionCount,
  );
  const totalQuestionCount = normalizeCount(input.totalQuestionCount);
  const completedQuestionCount = normalizeCount(input.completedQuestionCount);
  const availableQuestionCount = normalizeCount(input.availableQuestionCount);
  const hasCapacityForRun =
    totalQuestionCount > 0 && totalQuestionCount >= requestedQuestionCount;
  const willRestartQuestionScope =
    hasCapacityForRun &&
    shouldRestartSpecialTrainingScope({
      requestedQuestionCount,
      totalQuestionCount,
      remainingQuestionCount: availableQuestionCount,
      usedQuestionCount: completedQuestionCount,
      alreadyRestarted: false,
    });
  const hasProgress = completedQuestionCount > 0;
  const previous = input.previousSummary ?? null;
  const previousScopeHash = normalizeScopeHash(previous?.scopeHash);
  const scopeChanged =
    input.reason === 'preview' &&
    previousScopeHash.length > 0 &&
    input.scopeHash.length > 0 &&
    previousScopeHash !== input.scopeHash;
  const significantScopeChange =
    normalizeCount(previous?.poolCount) !== normalizeCount(input.poolCount) ||
    normalizeCount(previous?.instrumentCount) !==
      normalizeCount(input.instrumentCount) ||
    normalizeCount(previous?.symbolCount) !== normalizeCount(input.symbolCount) ||
    normalizeCount(previous?.totalQuestionCount) !== totalQuestionCount;
  const shouldAppendOldProgressNotice =
    scopeChanged && normalizeCount(previous?.completedQuestionCount) > 0;
  const activeSession = input.activeSession ?? null;
  const activeSessionScopeHash = normalizeScopeHash(activeSession?.scopeHash);
  const sessionUsesOldSnapshot =
    Boolean(activeSession?.hasLiveChallengeSession) &&
    activeSession?.modeId === input.modeId &&
    activeSessionScopeHash.length > 0 &&
    input.scopeHash.length > 0 &&
    activeSessionScopeHash !== input.scopeHash;
  const runtimeStatus = scopeChanged ? 'AUTO_SWITCHED' : input.status;
  const noticeKind =
    input.reason === 'reset'
      ? 'RESET_DONE'
      : scopeChanged
        ? significantScopeChange
          ? 'AUTO_SWITCHED_RANGE'
          : 'AUTO_SWITCHED_REVISION'
        : null;
  const noticeReasonCode =
    noticeKind === 'RESET_DONE'
      ? 'QUESTION_BANK_RESET_DONE'
      : noticeKind === 'AUTO_SWITCHED_RANGE'
        ? 'QUESTION_BANK_SCOPE_RANGE_CHANGED'
        : noticeKind === 'AUTO_SWITCHED_REVISION'
          ? 'QUESTION_BANK_SCOPE_REVISION_CHANGED'
          : null;

  return {
    capacity: {
      requestedQuestionCount,
      hasCapacityForRun,
      willRestartQuestionScope,
      totalQuestionCount,
      availableQuestionCount,
    },
    actionAvailability: {
      start: {
        enabled: hasCapacityForRun,
        reasonCode:
          hasCapacityForRun
            ? null
            : totalQuestionCount <= 0
              ? 'QUESTION_BANK_EMPTY'
              : 'QUESTION_BANK_INSUFFICIENT',
        hasCapacityForRun,
        willRestartQuestionScope,
      },
      reset: {
        enabled: hasProgress,
        reasonCode: hasProgress ? null : 'QUESTION_BANK_HAS_NO_PROGRESS',
        hasProgress,
      },
    },
    runtimeState: {
      status: runtimeStatus,
      noticeKind,
      noticeReasonCode,
      shouldAppendOldProgressNotice,
      sessionUsesOldSnapshot,
    },
  };
};

const buildQuestionBankSummaryFromScopeState = (
  scopeState: Awaited<ReturnType<typeof resolveQuestionBankSummaryStateFromMeta>>,
  options: {
    reason: 'preview' | 'reset';
    questionCount?: number;
    previousSummary?: SpecialTrainingQuestionBankPreviewPayload['previousSummary'];
    activeSession?: SpecialTrainingQuestionBankPreviewPayload['activeSession'];
  },
): SpecialTrainingQuestionBankSummary => {
  const completedQuestionCount = readUsedSlotCount(
    scopeState.modeId,
    scopeState.scopeHash,
    scopeState.timeframe,
  );
  const shouldExposeRestartedCycle = shouldRestartSpecialTrainingScope({
    requestedQuestionCount: 1,
    totalQuestionCount: scopeState.totalQuestionCount,
    remainingQuestionCount: Math.max(
      0,
      scopeState.totalQuestionCount - completedQuestionCount,
    ),
    usedQuestionCount: completedQuestionCount,
    alreadyRestarted: false,
  });
  const now = Date.now();
  const summary = resolveQuestionBankSummary(
    scopeState.bankId,
    scopeState.bankName,
    scopeState.modeId,
    scopeState.poolCount,
    scopeState.instrumentIdsWithBars.length,
    scopeState.targetTimeframe,
    scopeState.effectiveTimeframe,
    scopeState.effectiveTimeframes,
    scopeState.minimumBaseTimeframe,
    scopeState.sourceTimeframe,
    scopeState.sourceTimeframes,
    scopeState.scopeHash,
    scopeState.normalizedSymbolsWithBars,
    scopeState.totalQuestionCount,
    shouldExposeRestartedCycle ? 0 : completedQuestionCount,
    now,
    null,
  );
  return {
    ...summary,
    ...buildQuestionBankRuntimeFacts({
      reason: options.reason,
      modeId: summary.modeId,
      status: summary.status,
      scopeHash: summary.scopeHash,
      poolCount: summary.poolCount,
      instrumentCount: summary.instrumentCount,
      symbolCount: summary.symbolCount,
      totalQuestionCount: summary.totalQuestionCount,
      completedQuestionCount: summary.completedQuestionCount,
      availableQuestionCount: summary.availableQuestionCount,
      requestedQuestionCount: options.questionCount,
      previousSummary: options.previousSummary,
      activeSession: options.activeSession,
    }),
  };
};

export const previewSpecialTrainingQuestionBank = async (
  payload: SpecialTrainingQuestionBankPreviewPayload,
  hooks: QuestionBankPreviewHooks = {},
): Promise<SpecialTrainingQuestionBankSummary> => {
  hooks.beforePreview?.();

  const bank = requireSpecialTrainingBank(payload.bankId);
  const modeId = payload.modeId;
  const horizonBars = resolveModeHorizonBars(modeId, payload.horizonBars);
  const selectedPoolIds = [...bank.scope.poolIds];
  const enabledInstrumentIds =
    listSpecialTrainingInstrumentIdsByPoolScope(selectedPoolIds);
  if (!enabledInstrumentIds.length) {
    throw appError('SPECIAL_TRAINING_SYMBOLS_REQUIRED');
  }

  const scopeState = await resolveQuestionBankSummaryStateFromMeta(
    modeId,
    bank.id,
    bank.name,
    selectedPoolIds.length,
    enabledInstrumentIds,
    horizonBars,
    bank.targetTimeframe,
  );
  return buildQuestionBankSummaryFromScopeState(scopeState, {
    reason: 'preview',
    questionCount: payload.questionCount,
    previousSummary: payload.previousSummary,
    activeSession: payload.activeSession,
  });
};

export const previewSpecialTrainingQuestionBankWithAccess = async (
  payload: SpecialTrainingQuestionBankPreviewPayload,
  hooks: QuestionBankPreviewHooks = {},
): Promise<SpecialTrainingQuestionBankSummary> => {
  const bank = requireSpecialTrainingBank(payload.bankId);
  await assertSpecialTrainingPoolScopeAccess([...bank.scope.poolIds]);
  return previewSpecialTrainingQuestionBank(payload, hooks);
};

export const previewSpecialTrainingQuestionBankDraft = async (
  payload: SpecialTrainingQuestionBankDraftPreviewPayload,
  hooks: QuestionBankPreviewHooks = {},
): Promise<SpecialTrainingBankScopeSummary> => {
  hooks.beforePreview?.();
  const draft = validateSpecialTrainingBankDraft({
    assetClass: payload.assetClass,
    targetTimeframe: payload.targetTimeframe,
    poolIds: payload.poolIds,
  });
  return resolveSpecialTrainingBankScopeSummary({
    targetTimeframe: draft.targetTimeframe,
    poolIds: draft.scope.poolIds,
  });
};

export const previewSpecialTrainingQuestionBankDraftWithAccess = async (
  payload: SpecialTrainingQuestionBankDraftPreviewPayload,
): Promise<SpecialTrainingBankScopeSummary> => {
  const draft = validateSpecialTrainingBankDraft({
    assetClass: payload.assetClass,
    targetTimeframe: payload.targetTimeframe,
    poolIds: payload.poolIds,
  });
  await assertSpecialTrainingPoolScopeAccess(draft.scope.poolIds);
  return resolveSpecialTrainingBankScopeSummary({
    targetTimeframe: draft.targetTimeframe,
    poolIds: draft.scope.poolIds,
  });
};

export const resetSpecialTrainingQuestionBank = async (
  payload: SpecialTrainingQuestionBankResetPayload,
): Promise<SpecialTrainingQuestionBankSummary> => {
  // Resolve and authorize the current scope before touching the ledger. This
  // keeps an invalidated bank's questions and progress intact for repair.
  const summary = await previewSpecialTrainingQuestionBank(payload);
  resetModeQuestionBankLedger(payload.bankId, payload.modeId);
  const resetStatus: SpecialTrainingQuestionBankSummary['status'] =
    summary.totalQuestionCount <= 0 ? 'EMPTY' : 'READY_FRESH';
  const resetSummary = {
    ...summary,
    status: resetStatus,
    completedQuestionCount: 0,
    remainingQuestionCount: summary.totalQuestionCount,
    availableQuestionCount: summary.totalQuestionCount,
    builtQuestionCount: 0,
    updatedAt: new Date().toISOString(),
  };
  return {
    ...resetSummary,
    ...buildQuestionBankRuntimeFacts({
      reason: 'reset',
      modeId: resetSummary.modeId,
      status: resetSummary.status,
      scopeHash: resetSummary.scopeHash,
      poolCount: resetSummary.poolCount,
      instrumentCount: resetSummary.instrumentCount,
      symbolCount: resetSummary.symbolCount,
      totalQuestionCount: resetSummary.totalQuestionCount,
      completedQuestionCount: resetSummary.completedQuestionCount,
      availableQuestionCount: resetSummary.availableQuestionCount,
      requestedQuestionCount: payload.questionCount,
      activeSession: payload.activeSession,
    }),
  };
};
