// SPDX-License-Identifier: GPL-3.0-only

import type { OhlcvBar } from "../../domain/models.js";
import {
  getMarketDisplayBarsByIndexRange,
} from "../ports/infrastructure/db/marketDatabase.js";

import { appError } from "../../kernel/appError.js";
import { createId } from "../../kernel/id.js";
import { getBarsByInstrumentIdRange } from "../trading/core.js";
import { SPECIAL_TRAINING_TIMEFRAME } from "../../domain/specialTraining/constants.js";
import {
  type SpecialTrainingBaseTimeframe,
} from "../../domain/specialTraining/timeframeSemantics.js";
import { toFiniteNumber } from "./util.js";
import {
  countQuestionLedgerRows,
  deleteAssignedQuestionLedgerRowsByIds,
  deleteQuestionDrawCursorsByScopeHashes,
  deleteQuestionLedgerRowsForBankMode,
  deleteQuestionLedgerRowsForScope,
  getQuestionDrawCursorRow,
  insertQuestionLedgerReservation,
  listQuestionLedgerSlotRows,
  listQuestionScopeHashesForBankMode,
  markQuestionLedgerSettledRow,
  runQuestionBankMutation,
  updateQuestionDrawCursorCycle,
  upsertQuestionDrawCursor,
  type QuestionLedgerSlotRow,
} from "../ports/infrastructure/db/specialTraining/questionBankStore.js";
import type {
  SpecialTrainingLedgerSourceTag,
  SpecialTrainingModeId,
  SpecialTrainingQuestionBankSummary,
  SpecialTrainingQuestionScopeState,
  SpecialTrainingQuestionSlot,
  SpecialTrainingQuestionSlotRange,
  SpecialTrainingQuestionState,
  SpecialTrainingSettlementResult,
} from "../../domain/specialTraining/contracts.js";

import {
  DEFAULT_QUESTION_SCOPE_MARKET_READER,
  SYSTEM_SAMPLE_POOL_IDS,
  buildQuestionSlotRangeForInstrumentMeta,
  collectUniqueSortedTimeframes,
  mapDisplayBarToQuestionBar,
  mapQuestionScopeMarketMetadataTasks,
  normalizeBars,
  normalizeQuestionHorizonBars,
  questionScopeBuildPromises,
  readInstrumentQuestionMetaByIds,
  resolveMinimumBaseTimeframe,
  type QuestionScopeMarketReader,
} from './questionScopeSemantics.js';
export {
  resolveModeDecisionSecondsLimit,
  resolveModeFastDecisionStrictnessLevel,
  resolveModeHorizonBars,
  resolveModeMaxEntries,
  resolveModeMaxOperations,
} from './questionScopeSemantics.js';

import {
  applyQuestionScopeRequestFields,
  readCachedQuestionScopeState,
  resolveQuestionScopeDefinitionHash,
  resolveQuestionScopeHash,
  resolveSlotIdentityKey,
  resolveSlotKey,
  writeCachedQuestionScopeState,
} from './questionScopeCache.js';
export {
  normalizeEnabledInstrumentIds,
  normalizeEnabledSymbols,
  normalizeSelectedPoolIds,
  resolveSlotIdentityKey,
  resolveSlotKey,
} from './questionScopeCache.js';

export const resolveQuestionScopeState = async (
  modeId: SpecialTrainingModeId,
  bankId: string,
  bankName: string,
  poolCount: number,
  normalizedInstrumentIds: string[],
  horizonBars: number,
  minimumBaseTimeframeInput = SPECIAL_TRAINING_TIMEFRAME,
  marketReader: QuestionScopeMarketReader = DEFAULT_QUESTION_SCOPE_MARKET_READER,
): Promise<SpecialTrainingQuestionScopeState> => {
  const normalizedHorizonBars = normalizeQuestionHorizonBars(horizonBars);
  const minimumBaseTimeframe = resolveMinimumBaseTimeframe(
    minimumBaseTimeframeInput,
  );
  const metaByInstrumentId = readInstrumentQuestionMetaByIds(
    normalizedInstrumentIds,
  );
  const candidateInstrumentIds = normalizedInstrumentIds
    .filter((instrumentId) => Boolean(metaByInstrumentId.get(instrumentId)))
    .sort((left, right) => {
      const leftMeta = metaByInstrumentId.get(left);
      const rightMeta = metaByInstrumentId.get(right);
      const symbolOrder = String(leftMeta?.symbol ?? "").localeCompare(
        String(rightMeta?.symbol ?? ""),
      );
      return symbolOrder !== 0 ? symbolOrder : left.localeCompare(right);
    });
  const definitionHash = resolveQuestionScopeDefinitionHash({
    modeId,
    bankId,
    targetTimeframe: minimumBaseTimeframe,
    horizonBars: normalizedHorizonBars,
    instrumentIds: candidateInstrumentIds,
    metaByInstrumentId,
  });
  const cachedScopeState = readCachedQuestionScopeState({
    definitionHash,
    bankId,
    bankName,
    modeId,
    poolCount,
    horizonBars: normalizedHorizonBars,
    targetTimeframe: minimumBaseTimeframe,
  });
  if (cachedScopeState) {
    return cachedScopeState;
  }

  const existingBuildPromise = questionScopeBuildPromises.get(definitionHash);
  if (existingBuildPromise) {
    return applyQuestionScopeRequestFields(await existingBuildPromise, {
      bankName,
      poolCount,
    });
  }

  const buildPromise = (async (): Promise<SpecialTrainingQuestionScopeState> => {
    const rawSlotRanges = await mapQuestionScopeMarketMetadataTasks(
      candidateInstrumentIds,
      async (instrumentId) => {
        const meta = metaByInstrumentId.get(instrumentId);
        if (!meta) {
          return null;
        }
        return buildQuestionSlotRangeForInstrumentMeta({
          modeId,
          meta,
          horizonBars: normalizedHorizonBars,
          minimumBaseTimeframe,
          startingSlotIndex: 0,
          marketReader,
        });
      },
    );
    const slotRangesByInstrumentId =
      new Map<string, SpecialTrainingQuestionSlotRange>();
    const slotRanges: SpecialTrainingQuestionSlotRange[] = [];
    const instrumentIdsWithBars: string[] = [];
    const normalizedSymbolSet = new Set<string>();
    const sourceTimeframeSet = new Set<SpecialTrainingBaseTimeframe>();
    const effectiveTimeframeSet = new Set<SpecialTrainingBaseTimeframe>();
    let totalQuestionCount = 0;
    let nextSlotIndex = 0;
    const instrumentSignatures: Array<{
      instrumentId: string;
      samplePoolId: string;
      symbol: string;
      sourceTimeframe: SpecialTrainingBaseTimeframe;
      effectiveTimeframe: SpecialTrainingBaseTimeframe;
      barsVersionToken: string;
      slotCount: number;
      minTradeStep: number;
      timeZone: string;
    }> = [];

    for (const rawSlotRange of rawSlotRanges) {
      const slotCount = rawSlotRange?.slotCount ?? 0;
      if (!rawSlotRange || slotCount <= 0) {
        continue;
      }
      const slotRange = {
        ...rawSlotRange,
        slotStartIndex: nextSlotIndex,
      };
      slotRangesByInstrumentId.set(slotRange.instrumentId, slotRange);
      slotRanges.push(slotRange);
      instrumentIdsWithBars.push(slotRange.instrumentId);
      const normalizedSymbol = String(slotRange.symbol || "")
        .trim()
        .toUpperCase();
      if (normalizedSymbol) {
        normalizedSymbolSet.add(normalizedSymbol);
      }
      nextSlotIndex += slotCount;
      totalQuestionCount += slotCount;
      const sourceTimeframe = slotRange.sourceTimeframe;
      const effectiveTimeframe = slotRange.effectiveTimeframe;
      sourceTimeframeSet.add(sourceTimeframe);
      effectiveTimeframeSet.add(effectiveTimeframe);
      instrumentSignatures.push({
        instrumentId: slotRange.instrumentId,
        samplePoolId: slotRange.samplePoolId,
        symbol: slotRange.symbol,
        sourceTimeframe,
        effectiveTimeframe,
        minTradeStep: Math.max(
          0.00000001,
          toFiniteNumber(slotRange.minTradeStep) || 1,
        ),
        barsVersionToken: slotRange.barsVersionToken,
        slotCount,
        timeZone: slotRange.timeZone,
      });
    }

    const sourceTimeframes = collectUniqueSortedTimeframes(sourceTimeframeSet);
    const effectiveTimeframes = collectUniqueSortedTimeframes(
      effectiveTimeframeSet,
    );
    const normalizedSymbolsWithBars = Array.from(normalizedSymbolSet).sort(
      (left, right) => left.localeCompare(right),
    );
    const singleEffectiveTimeframe =
      effectiveTimeframes.length === 1
        ? effectiveTimeframes[0]!
        : minimumBaseTimeframe;

    const scopeState: SpecialTrainingQuestionScopeState = {
      bankId,
      bankName,
      modeId,
      poolCount,
      horizonBars: normalizedHorizonBars,
      targetTimeframe: minimumBaseTimeframe,
      minimumBaseTimeframe,
      sourceTimeframes,
      effectiveTimeframes,
      timeframe: singleEffectiveTimeframe,
      scopeHash: resolveQuestionScopeHash(
        modeId,
        bankId,
        minimumBaseTimeframe,
        normalizedHorizonBars,
        instrumentSignatures,
      ),
      normalizedSymbolsWithBars,
      instrumentIdsWithBars,
      slotRanges,
      slotRangesByInstrumentId,
      totalQuestionCount,
    };
    writeCachedQuestionScopeState({
      definitionHash,
      scopeState,
    });
    return scopeState;
  })();
  questionScopeBuildPromises.set(definitionHash, buildPromise);
  try {
    return applyQuestionScopeRequestFields(await buildPromise, {
      bankName,
      poolCount,
    });
  } finally {
    if (questionScopeBuildPromises.get(definitionHash) === buildPromise) {
      questionScopeBuildPromises.delete(definitionHash);
    }
  }
};

export const resolveQuestionBankSummaryStateFromMeta = async (
  modeId: SpecialTrainingModeId,
  bankId: string,
  bankName: string,
  poolCount: number,
  normalizedInstrumentIds: string[],
  horizonBars: number,
  minimumBaseTimeframeInput = SPECIAL_TRAINING_TIMEFRAME,
  marketReader: QuestionScopeMarketReader = DEFAULT_QUESTION_SCOPE_MARKET_READER,
): Promise<{
  bankId: string;
  bankName: string;
  modeId: SpecialTrainingModeId;
  timeframe: string;
  targetTimeframe: SpecialTrainingBaseTimeframe;
  effectiveTimeframe?: SpecialTrainingBaseTimeframe;
  effectiveTimeframes: SpecialTrainingBaseTimeframe[];
  minimumBaseTimeframe: SpecialTrainingBaseTimeframe;
  sourceTimeframe?: SpecialTrainingBaseTimeframe;
  sourceTimeframes: SpecialTrainingBaseTimeframe[];
  scopeHash: string;
  normalizedSymbolsWithBars: string[];
  instrumentIdsWithBars: string[];
  poolCount: number;
  totalQuestionCount: number;
}> => {
  const scopeState = await resolveQuestionScopeState(
    modeId,
    bankId,
    bankName,
    poolCount,
    normalizedInstrumentIds,
    horizonBars,
    minimumBaseTimeframeInput,
    marketReader,
  );
  return {
    bankId: scopeState.bankId,
    bankName: scopeState.bankName,
    modeId: scopeState.modeId,
    targetTimeframe: scopeState.targetTimeframe,
    timeframe: scopeState.timeframe,
    effectiveTimeframe:
      scopeState.effectiveTimeframes.length === 1
        ? scopeState.effectiveTimeframes[0]!
        : undefined,
    effectiveTimeframes: scopeState.effectiveTimeframes,
    minimumBaseTimeframe: scopeState.minimumBaseTimeframe,
    sourceTimeframe:
      scopeState.sourceTimeframes.length === 1
        ? scopeState.sourceTimeframes[0]!
        : undefined,
    sourceTimeframes: scopeState.sourceTimeframes,
    scopeHash: scopeState.scopeHash,
    normalizedSymbolsWithBars: scopeState.normalizedSymbolsWithBars,
    instrumentIdsWithBars: scopeState.instrumentIdsWithBars,
    poolCount: scopeState.poolCount,
    totalQuestionCount: scopeState.totalQuestionCount,
  };
};

const readQuestionDrawCursorProgress = (
  modeId: SpecialTrainingModeId,
  scopeHash: string,
): {
  cycleIndex: number;
  cursorIndex: number;
  totalQuestionCount: number;
} | null => {
  const row = getQuestionDrawCursorRow(modeId, scopeHash);
  if (!row) {
    return null;
  }
  const totalQuestionCount = Math.max(
    0,
    Math.floor(toFiniteNumber(row.total_question_count) || 0),
  );
  return {
    cycleIndex: Math.max(
      0,
      Math.floor(toFiniteNumber(row.cycle_index) || 0),
    ),
    cursorIndex: Math.min(
      totalQuestionCount,
      Math.max(0, Math.floor(toFiniteNumber(row.cursor_index) || 0)),
    ),
    totalQuestionCount,
  };
};

const deleteQuestionDrawCursorsForScopeHashes = (
  modeId: SpecialTrainingModeId,
  scopeHashes: string[],
): void => {
  const normalizedScopeHashes = Array.from(
    new Set(
      scopeHashes
        .map((scopeHash) => String(scopeHash ?? "").trim())
        .filter((scopeHash) => scopeHash.length > 0),
    ),
  );
  deleteQuestionDrawCursorsByScopeHashes(modeId, normalizedScopeHashes);
};

export const readUsedSlotKeySet = (
  modeId: SpecialTrainingModeId,
  scopeHash: string,
  timeframe: string,
): Set<string> => {
  void timeframe;
  const rows = listQuestionLedgerSlotRows(modeId, scopeHash, 400 * 16);
  return new Set(
    rows
      .map((row: QuestionLedgerSlotRow) => {
        const identityKey = resolveSlotIdentityKey({
          instrumentId: String(row.instrument_id ?? "").trim(),
          symbol: String(row.symbol ?? "").trim().toUpperCase(),
        });
        const slotIndex = Math.floor(toFiniteNumber(row.slot_index));
        if (!identityKey || !Number.isFinite(slotIndex) || slotIndex < 0) {
          return "";
        }
        return resolveSlotKey(identityKey, slotIndex);
      })
      .filter((key) => key.length > 0),
  );
};

export const readUsedSlotCount = (
  modeId: SpecialTrainingModeId,
  scopeHash: string,
  timeframe: string,
): number => {
  void timeframe;
  const cursorProgress = readQuestionDrawCursorProgress(modeId, scopeHash);
  const count = countQuestionLedgerRows(modeId, scopeHash);
  const ledgerCount = Math.max(0, Math.floor(toFiniteNumber(count) || 0));
  if (!cursorProgress) {
    return ledgerCount;
  }
  return Math.min(
    Math.max(0, cursorProgress.totalQuestionCount),
    Math.max(ledgerCount, cursorProgress.cursorIndex),
  );
};

export const restartQuestionScopeLedger = (
  modeId: SpecialTrainingModeId,
  scopeHash: string,
  timeframe: string,
): {
  usedCountBeforeRestart: number;
  deletedCount: number;
} => {
  void timeframe;
  return runQuestionBankMutation(() => {
    const usedCountBeforeRestart = readUsedSlotCount(
      modeId,
      scopeHash,
      timeframe,
    );
    const deletedCount = deleteQuestionLedgerRowsForScope(modeId, scopeHash);
    const cursorProgress = readQuestionDrawCursorProgress(modeId, scopeHash);
    if (cursorProgress) {
      updateQuestionDrawCursorCycle({
        modeId,
        scopeHash,
        cycleIndex: cursorProgress.cycleIndex + 1,
        updatedAt: new Date().toISOString(),
      });
    }
    return {
      usedCountBeforeRestart: Math.max(
        0,
        Math.floor(toFiniteNumber(usedCountBeforeRestart) || 0),
      ),
      deletedCount: Math.max(0, Math.floor(toFiniteNumber(deletedCount) || 0)),
    };
  });
};

export const resetModeQuestionBankLedger = (
  bankId: string,
  modeId: SpecialTrainingModeId,
): number => {
  const normalizedBankId = String(bankId || "").trim();
  return runQuestionBankMutation(() => {
    const scopeHashes = listQuestionScopeHashesForBankMode(
      normalizedBankId,
      modeId,
    );
    deleteQuestionDrawCursorsForScopeHashes(
      modeId,
      scopeHashes,
    );
    const deletedCount = deleteQuestionLedgerRowsForBankMode(
      normalizedBankId,
      modeId,
    );
    return Math.max(0, Math.floor(toFiniteNumber(deletedCount) || 0));
  });
};

export const resolveQuestionBankSummary = (
  bankId: string,
  bankName: string,
  modeId: SpecialTrainingModeId,
  poolCount: number,
  instrumentCount: number,
  targetTimeframe: SpecialTrainingBaseTimeframe,
  effectiveTimeframe: SpecialTrainingBaseTimeframe | undefined,
  effectiveTimeframes: SpecialTrainingBaseTimeframe[],
  minimumBaseTimeframe: SpecialTrainingBaseTimeframe,
  sourceTimeframe: SpecialTrainingBaseTimeframe | undefined,
  sourceTimeframes: SpecialTrainingBaseTimeframe[],
  scopeHash: string,
  normalizedSymbols: string[],
  totalQuestionCount: number,
  completedQuestionCount: number,
  updatedAtMs: number,
  expiresAtMs: number | null,
): SpecialTrainingQuestionBankSummary => {
  const safeTotalQuestionCount = Math.max(
    0,
    Math.floor(toFiniteNumber(totalQuestionCount) || 0),
  );
  const safeCompletedQuestionCount = Math.min(
    safeTotalQuestionCount,
    Math.max(
      0,
      Math.floor(toFiniteNumber(completedQuestionCount) || 0),
    ),
  );
  const safeRemainingQuestionCount = Math.max(
    0,
    safeTotalQuestionCount - safeCompletedQuestionCount,
  );
  const status: SpecialTrainingQuestionBankSummary["status"] =
    safeTotalQuestionCount <= 0
      ? "EMPTY"
      : safeCompletedQuestionCount > 0
        ? "READY_IN_PROGRESS"
        : "READY_FRESH";
  const defaultRequestedQuestionCount = 1;
  const defaultHasCapacityForRun =
    safeTotalQuestionCount >= defaultRequestedQuestionCount &&
    safeTotalQuestionCount > 0;
  const defaultWillRestartQuestionScope =
    defaultHasCapacityForRun &&
    safeRemainingQuestionCount < defaultRequestedQuestionCount &&
    safeCompletedQuestionCount > 0;
  return {
    bankId,
    bankName,
    modeId,
    scopeHash,
    status,
    targetTimeframe,
    effectiveTimeframe,
    effectiveTimeframes,
    minimumBaseTimeframe,
    sourceTimeframe,
    sourceTimeframes,
    poolCount,
    instrumentCount,
    symbolCount: normalizedSymbols.length,
    totalQuestionCount: safeTotalQuestionCount,
    completedQuestionCount: safeCompletedQuestionCount,
    remainingQuestionCount: safeRemainingQuestionCount,
    availableQuestionCount: safeRemainingQuestionCount,
    builtQuestionCount: safeCompletedQuestionCount,
    capacity: {
      requestedQuestionCount: defaultRequestedQuestionCount,
      hasCapacityForRun: defaultHasCapacityForRun,
      willRestartQuestionScope: defaultWillRestartQuestionScope,
      totalQuestionCount: safeTotalQuestionCount,
      availableQuestionCount: safeRemainingQuestionCount,
    },
    actionAvailability: {
      start: {
        enabled: defaultHasCapacityForRun,
        reasonCode:
          defaultHasCapacityForRun
            ? null
            : safeTotalQuestionCount <= 0
              ? "QUESTION_BANK_EMPTY"
              : "QUESTION_BANK_INSUFFICIENT",
        hasCapacityForRun: defaultHasCapacityForRun,
        willRestartQuestionScope: defaultWillRestartQuestionScope,
      },
      reset: {
        enabled: safeCompletedQuestionCount > 0,
        reasonCode:
          safeCompletedQuestionCount > 0
            ? null
            : "QUESTION_BANK_HAS_NO_PROGRESS",
        hasProgress: safeCompletedQuestionCount > 0,
      },
    },
    runtimeState: {
      status,
      noticeKind: null,
      noticeReasonCode: null,
      shouldAppendOldProgressNotice: false,
      sessionUsesOldSnapshot: false,
    },
    updatedAt: new Date(updatedAtMs).toISOString(),
    expiresAt: Number.isFinite(expiresAtMs)
      ? new Date(Number(expiresAtMs)).toISOString()
      : null,
  };
};

import {
  buildSlotFromRange,
  findQuestionSlotRangeByOrdinal,
  resolveDeterministicQuestionSlotOrdinal,
} from './questionSlotPermutation.js';
export {
  buildDeterministicQuestionSlotPermutation,
  resolveDeterministicQuestionSlotOrdinal,
  resolveDisplaySlotByOrdinal,
  selectRemainingQuestionSlots,
  shuffleInPlace,
} from './questionSlotPermutation.js';

export const reserveNextQuestionSlots = (
  bankId: string,
  bankName: string,
  scopeState: SpecialTrainingQuestionScopeState,
  questionCount: number,
  sourceTag: SpecialTrainingLedgerSourceTag = "",
  simulationBatchId?: string | null,
): {
  slots: SpecialTrainingQuestionSlot[];
  slotLedgerIdByKey: Map<string, string>;
  usedCountBeforeReserve: number;
  remainingCountBeforeReserve: number;
} => {
  const requestedCount = Math.max(
    0,
    Math.floor(toFiniteNumber(questionCount) || 0),
  );
  const totalQuestionCount = Math.max(
    0,
    Math.floor(toFiniteNumber(scopeState.totalQuestionCount) || 0),
  );
  if (requestedCount <= 0 || totalQuestionCount <= 0) {
    return {
      slots: [],
      slotLedgerIdByKey: new Map(),
      usedCountBeforeReserve: 0,
      remainingCountBeforeReserve: 0,
    };
  }

  return runQuestionBankMutation(() => {
    const now = new Date().toISOString();
    const normalizedSimulationBatchId =
      typeof simulationBatchId === "string" && simulationBatchId.trim()
        ? simulationBatchId.trim()
        : null;
    const currentCursor = readQuestionDrawCursorProgress(
      scopeState.modeId,
      scopeState.scopeHash,
    );
    const cycleIndex =
      currentCursor && currentCursor.totalQuestionCount === totalQuestionCount
        ? currentCursor.cycleIndex
        : 0;
    const cursorIndex =
      currentCursor && currentCursor.totalQuestionCount === totalQuestionCount
        ? currentCursor.cursorIndex
        : 0;
    const remainingCountBeforeReserve = Math.max(
      0,
      totalQuestionCount - cursorIndex,
    );
    if (remainingCountBeforeReserve < requestedCount) {
      return {
        slots: [],
        slotLedgerIdByKey: new Map<string, string>(),
        usedCountBeforeReserve: cursorIndex,
        remainingCountBeforeReserve,
      };
    }

    const ordinals = Array.from({ length: requestedCount }, (_, index) =>
      resolveDeterministicQuestionSlotOrdinal({
        scopeHash: scopeState.scopeHash,
        cycleIndex,
        position: cursorIndex + index,
        totalQuestionCount,
      }),
    );
    const slots = ordinals.map((ordinal) => {
      const range = findQuestionSlotRangeByOrdinal(scopeState, ordinal);
      return range ? buildSlotFromRange(range, ordinal) : null;
    });
    if (slots.some((slot) => !slot)) {
      throw appError("SPECIAL_TRAINING_QUESTION_GENERATION_FAILED", {
        modeId: scopeState.modeId,
        reason: "SLOT_MISSING",
      });
    }

    const slotLedgerIdByKey = new Map<string, string>();
    for (const slot of slots as SpecialTrainingQuestionSlot[]) {
      const ledgerId = createId();
      const changes = insertQuestionLedgerReservation({
        id: ledgerId,
        bankId,
        bankName,
        modeId: scopeState.modeId,
        scopeHash: scopeState.scopeHash,
        sourceTag,
        simulationBatchId: normalizedSimulationBatchId,
        instrumentId: slot.instrumentId,
        symbol: slot.symbol,
        timeframe: slot.effectiveTimeframe,
        minimumBaseTimeframe: slot.minimumBaseTimeframe,
        sourceTimeframe: slot.sourceTimeframe,
        slotIndex: slot.slotIndex,
        timestamp: now,
      });
      if (changes !== 1) {
        throw appError("SPECIAL_TRAINING_QUESTION_GENERATION_FAILED", {
          modeId: scopeState.modeId,
          reason: "SLOT_CONFLICT",
        });
      }
      slotLedgerIdByKey.set(
        resolveSlotKey(resolveSlotIdentityKey(slot), slot.slotIndex),
        ledgerId,
      );
    }

    upsertQuestionDrawCursor({
      modeId: scopeState.modeId,
      scopeHash: scopeState.scopeHash,
      cycleIndex,
      cursorIndex: cursorIndex + requestedCount,
      totalQuestionCount,
      updatedAt: now,
    });

    return {
      slots: slots as SpecialTrainingQuestionSlot[],
      slotLedgerIdByKey,
      usedCountBeforeReserve: cursorIndex,
      remainingCountBeforeReserve,
    };
  });
};

export const reserveQuestionSlots = (
  bankId: string,
  bankName: string,
  modeId: SpecialTrainingModeId,
  scopeHash: string,
  slots: SpecialTrainingQuestionSlot[],
  sourceTag: SpecialTrainingLedgerSourceTag = "",
  simulationBatchId?: string | null,
): Map<string, string> => {
  const now = new Date().toISOString();
  const normalizedSimulationBatchId =
    typeof simulationBatchId === "string" && simulationBatchId.trim()
      ? simulationBatchId.trim()
      : null;
  const slotLedgerIdByKey = new Map<string, string>();
  runQuestionBankMutation(() => {
    for (const slot of slots) {
      const ledgerId = createId();
      const changes = insertQuestionLedgerReservation({
        id: ledgerId,
        bankId,
        bankName,
        modeId,
        scopeHash,
        sourceTag,
        simulationBatchId: normalizedSimulationBatchId,
        instrumentId: slot.instrumentId,
        symbol: slot.symbol,
        timeframe: slot.effectiveTimeframe,
        minimumBaseTimeframe: slot.minimumBaseTimeframe,
        sourceTimeframe: slot.sourceTimeframe,
        slotIndex: slot.slotIndex,
        timestamp: now,
      });
      if (changes !== 1) {
        throw appError("SPECIAL_TRAINING_QUESTION_GENERATION_FAILED", {
          modeId,
          reason: "SLOT_CONFLICT",
        });
      }
      slotLedgerIdByKey.set(
        resolveSlotKey(resolveSlotIdentityKey(slot), slot.slotIndex),
        ledgerId,
      );
    }
  });
  return slotLedgerIdByKey;
};

export const releaseQuestionSlotReservations = (
  ledgerIds: string[],
): number => {
  const normalizedLedgerIds = Array.from(
    new Set(
      ledgerIds
        .map((ledgerId) => String(ledgerId ?? "").trim())
        .filter((ledgerId) => ledgerId.length > 0),
    ),
  );
  if (!normalizedLedgerIds.length) {
    return 0;
  }

  const deletedCount = deleteAssignedQuestionLedgerRowsByIds(
    normalizedLedgerIds,
  );

  return Math.max(0, Math.floor(toFiniteNumber(deletedCount) || 0));
};

export const buildQuestionFromSlot = async (
  scopeState: SpecialTrainingQuestionScopeState,
  slot: SpecialTrainingQuestionSlot,
  ledgerId: string,
  questionId = createId(),
): Promise<SpecialTrainingQuestionState> => {
  let sourceWindowBarCount = 0;
  let windowBars: OhlcvBar[] = [];
  if (slot.sourceTimeframe === slot.effectiveTimeframe) {
    const sourceWindowBars = normalizeBars(
      (
        await getBarsByInstrumentIdRange(
          slot.instrumentId,
          Math.max(0, slot.windowStartIndex),
          Math.max(1, slot.windowEndIndex - slot.windowStartIndex + 1),
        )
      ).bars,
    );
    sourceWindowBarCount = sourceWindowBars.length;
    windowBars = sourceWindowBars;
  } else {
    if (SYSTEM_SAMPLE_POOL_IDS.has(String(slot.samplePoolId || "").trim())) {
      await getBarsByInstrumentIdRange(slot.instrumentId, 0, 1);
    }
    const displayBars = await getMarketDisplayBarsByIndexRange({
      instrumentId: slot.instrumentId,
      versionToken: slot.barsVersionToken,
      baseTimeframe: slot.sourceTimeframe,
      timeZone: slot.timeZone,
      displayPeriod: slot.effectiveTimeframe,
      offset: Math.max(0, slot.displayStartIndex),
      limit: Math.max(1, slot.effectiveWindowBarCount),
    });
    const firstBar = displayBars[0];
    const lastBar = displayBars.at(-1);
    sourceWindowBarCount =
      firstBar && lastBar
        ? Math.max(
            0,
            Math.floor(toFiniteNumber(lastBar.endRawIndex) || 0) -
              Math.floor(toFiniteNumber(firstBar.startRawIndex) || 0) +
              1,
          )
        : 0;
    windowBars = displayBars.map(mapDisplayBarToQuestionBar);
  }
  if (
    !windowBars.length ||
    windowBars.length < slot.effectiveWindowBarCount ||
    slot.endIndex <= slot.startIndex ||
    slot.endIndex >= windowBars.length
  ) {
    throw appError("SPECIAL_TRAINING_QUESTION_GENERATION_FAILED", {
      modeId: scopeState.modeId,
      reason: "SLOT_WINDOW_MISSING",
    });
  }
  return {
    id: questionId,
    instrumentId: slot.instrumentId,
    samplePoolId: slot.samplePoolId,
    barsVersionToken: slot.barsVersionToken,
    symbol: slot.symbol,
    timeframe: slot.effectiveTimeframe,
    targetTimeframe: slot.targetTimeframe,
    effectiveTimeframe: slot.effectiveTimeframe,
    minimumBaseTimeframe: slot.minimumBaseTimeframe,
    sourceTimeframe: slot.sourceTimeframe,
    sourceBarsPerEffectiveBar: slot.sourceBarsPerEffectiveBar,
    slotIndex: slot.slotIndex,
    scopeHash: scopeState.scopeHash,
    ledgerId,
    bars: windowBars,
    startIndex: slot.startIndex,
    endIndex: slot.endIndex,
    effectiveWindowBarCount: slot.effectiveWindowBarCount,
    sourceWindowBarCount,
    minTradeStep: Math.max(0.00000001, toFiniteNumber(slot.minTradeStep) || 1),
  };
};

export const markQuestionLedgerSettled = (
  question: SpecialTrainingQuestionState,
  result: SpecialTrainingSettlementResult,
  abandoned: boolean,
  settledAt?: string,
): void => {
  const now = String(settledAt || "").trim() || new Date().toISOString();
  const directionResult = result.directionResult;
  markQuestionLedgerSettledRow({
    ledgerId: question.ledgerId,
    status: abandoned ? "ABANDONED" : "SETTLED",
    score: result.score,
    passed: result.passed,
    decisionSelection: directionResult?.selection ?? null,
    decisionActual: directionResult?.actual ?? null,
    decisionCorrect: directionResult ? directionResult.correct : null,
    decisionSecondsUsed: directionResult?.decisionSecondsUsed ?? null,
    decisionMfeMaeRatio: directionResult?.selectedMfeMaeRatio ?? null,
    opportunityDirection: directionResult?.opportunityDirection ?? null,
    opportunityMfeMaeRatio: directionResult?.opportunityMfeMaeRatio ?? null,
    settledAt: now,
  });
};
