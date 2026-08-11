// SPDX-License-Identifier: GPL-3.0-only

import { createHash } from 'node:crypto';
import { DEFAULT_TIME_ZONE, normalizeTimeZone } from '@zinuto/shared/timezone';
import {
  normalizeSpecialTrainingBaseTimeframe,
  type SpecialTrainingBaseTimeframe,
} from '../../domain/specialTraining/timeframeSemantics.js';
import { toFiniteNumber } from './util.js';
import {
  getQuestionScopeIndexRow,
  writeQuestionScopeIndexRow,
} from '../ports/infrastructure/db/specialTraining/questionBankStore.js';
import type {
  SpecialTrainingModeId,
  SpecialTrainingQuestionScopeState,
  SpecialTrainingQuestionSlotRange,
} from '../../domain/specialTraining/contracts.js';
import {
  QUESTION_SCOPE_INDEX_SCHEMA_VERSION,
  collectUniqueSortedTimeframes,
  normalizeQuestionHorizonBars,
  type InstrumentQuestionMeta,
} from './questionScopeSemantics.js';

export const resolveQuestionScopeHash = (
  modeId: SpecialTrainingModeId,
  bankId: string,
  targetTimeframe: SpecialTrainingBaseTimeframe,
  horizonBars: number,
  instrumentsWithBars: Array<{
    instrumentId: string;
    samplePoolId: string;
    symbol: string;
    sourceTimeframe: SpecialTrainingBaseTimeframe;
    effectiveTimeframe: SpecialTrainingBaseTimeframe;
    barsVersionToken: string;
    slotCount: number;
    minTradeStep: number;
    timeZone: string;
  }>,
): string => {
  const sorted = [...instrumentsWithBars].sort((left, right) =>
    left.instrumentId.localeCompare(right.instrumentId),
  );
  const payload: string[] = [
    modeId,
    `bank${bankId}`,
    `target${targetTimeframe}`,
    `h${horizonBars}`,
    ...sorted.map(
      (item) =>
        `${item.samplePoolId}:${item.instrumentId}:${item.symbol}:${item.sourceTimeframe}:${item.effectiveTimeframe}:${item.slotCount}:${item.barsVersionToken}:step${item.minTradeStep}:tz${item.timeZone}`,
    ),
  ];
  return createHash("sha256").update(payload.join("|")).digest("hex");
};

export const resolveSlotIdentityKey = (input: {
  instrumentId?: string | null;
  symbol?: string | null;
}): string =>
  String(input.instrumentId ?? "").trim() ||
  String(input.symbol ?? "").trim().toUpperCase();

export const resolveSlotKey = (identityKey: string, slotIndex: number): string =>
  `${identityKey}::${slotIndex}`;

export const normalizeEnabledInstrumentIds = (instrumentIds: string[]): string[] =>
  Array.from(
    new Set(
      instrumentIds
        .map((instrumentId) => String(instrumentId || "").trim())
        .filter((instrumentId) => instrumentId.length > 0),
    ),
  );

export const normalizeEnabledSymbols = (symbols: string[]): string[] =>
  Array.from(
    new Set(
      symbols
        .map((symbol) =>
          String(symbol || "")
            .trim()
            .toUpperCase(),
        )
        .filter((symbol) => symbol.length > 0),
    ),
  );

export const normalizeSelectedPoolIds = (poolIds: string[]): string[] =>
  Array.from(
    new Set(
      poolIds
        .map((poolId) =>
          String(poolId || "")
            .trim(),
        )
        .filter((poolId) => poolId.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right));

export type SerializedQuestionScopePayload = {
  schemaVersion?: unknown;
  bankId?: unknown;
  modeId?: unknown;
  poolCount?: unknown;
  horizonBars?: unknown;
  targetTimeframe?: unknown;
  minimumBaseTimeframe?: unknown;
  sourceTimeframes?: unknown;
  effectiveTimeframes?: unknown;
  timeframe?: unknown;
  scopeHash?: unknown;
  normalizedSymbolsWithBars?: unknown;
  instrumentIdsWithBars?: unknown;
  slotRanges?: unknown;
  totalQuestionCount?: unknown;
};

export const normalizeStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => String(item ?? "").trim())
        .filter((item) => item.length > 0)
    : [];

export const normalizeTimeframeArray = (
  value: unknown,
): SpecialTrainingBaseTimeframe[] =>
  collectUniqueSortedTimeframes(
    normalizeStringArray(value)
      .map((item) => normalizeSpecialTrainingBaseTimeframe(item))
      .filter((item): item is SpecialTrainingBaseTimeframe => Boolean(item)),
  );

export const normalizeSerializedSlotRange = (
  raw: unknown,
): SpecialTrainingQuestionSlotRange | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const instrumentId = String(row.instrumentId ?? "").trim();
  const samplePoolId = String(row.samplePoolId ?? "").trim();
  const symbol = String(row.symbol ?? "")
    .trim()
    .toUpperCase();
  const targetTimeframe = normalizeSpecialTrainingBaseTimeframe(
    row.targetTimeframe,
  );
  const minimumBaseTimeframe = normalizeSpecialTrainingBaseTimeframe(
    row.minimumBaseTimeframe,
  );
  const sourceTimeframe = normalizeSpecialTrainingBaseTimeframe(
    row.sourceTimeframe,
  );
  const effectiveTimeframe = normalizeSpecialTrainingBaseTimeframe(
    row.effectiveTimeframe,
  );
  if (
    !instrumentId ||
    !samplePoolId ||
    !symbol ||
    !targetTimeframe ||
    !minimumBaseTimeframe ||
    !sourceTimeframe ||
    !effectiveTimeframe
  ) {
    return null;
  }
  const slotStartIndex = Math.max(
    0,
    Math.floor(toFiniteNumber(row.slotStartIndex) || 0),
  );
  const slotCount = Math.max(
    0,
    Math.floor(toFiniteNumber(row.slotCount) || 0),
  );
  if (slotCount <= 0) {
    return null;
  }
  return {
    instrumentId,
    samplePoolId,
    symbol,
    slotStartIndex,
    slotCount,
    totalEffectiveBars: Math.max(
      0,
      Math.floor(toFiniteNumber(row.totalEffectiveBars) || 0),
    ),
    effectiveSlotStrideBars: Math.max(
      1,
      Math.floor(toFiniteNumber(row.effectiveSlotStrideBars) || 1),
    ),
    startIndex: Math.max(0, Math.floor(toFiniteNumber(row.startIndex) || 0)),
    endIndex: Math.max(0, Math.floor(toFiniteNumber(row.endIndex) || 0)),
    targetTimeframe,
    minimumBaseTimeframe,
    sourceTimeframe,
    effectiveTimeframe,
    sourceBarsPerEffectiveBar: Math.max(
      1,
      Math.floor(toFiniteNumber(row.sourceBarsPerEffectiveBar) || 1),
    ),
    timeZone: normalizeTimeZone(row.timeZone, DEFAULT_TIME_ZONE),
    effectiveWindowBarCount: Math.max(
      1,
      Math.floor(toFiniteNumber(row.effectiveWindowBarCount) || 1),
    ),
    sourceBarCount: Math.max(
      0,
      Math.floor(toFiniteNumber(row.sourceBarCount) || 0),
    ),
    barsVersionToken: String(row.barsVersionToken ?? "").trim(),
    minTradeStep: Math.max(
      0.00000001,
      toFiniteNumber(row.minTradeStep) || 1,
    ),
  };
};

export const serializeQuestionScopeState = (
  scopeState: SpecialTrainingQuestionScopeState,
): string =>
  JSON.stringify({
    schemaVersion: QUESTION_SCOPE_INDEX_SCHEMA_VERSION,
    bankId: scopeState.bankId,
    modeId: scopeState.modeId,
    poolCount: scopeState.poolCount,
    horizonBars: scopeState.horizonBars,
    targetTimeframe: scopeState.targetTimeframe,
    minimumBaseTimeframe: scopeState.minimumBaseTimeframe,
    sourceTimeframes: scopeState.sourceTimeframes,
    effectiveTimeframes: scopeState.effectiveTimeframes,
    timeframe: scopeState.timeframe,
    scopeHash: scopeState.scopeHash,
    normalizedSymbolsWithBars: scopeState.normalizedSymbolsWithBars,
    instrumentIdsWithBars: scopeState.instrumentIdsWithBars,
    slotRanges: scopeState.slotRanges,
    totalQuestionCount: scopeState.totalQuestionCount,
  } satisfies SerializedQuestionScopePayload);

export const deserializeQuestionScopeState = (input: {
  payloadJson: unknown;
  bankId: string;
  bankName: string;
  modeId: SpecialTrainingModeId;
  poolCount: number;
  horizonBars: number;
  targetTimeframe: SpecialTrainingBaseTimeframe;
}): SpecialTrainingQuestionScopeState | null => {
  try {
    const payload = JSON.parse(
      String(input.payloadJson ?? "{}"),
    ) as SerializedQuestionScopePayload;
    if (payload.schemaVersion !== QUESTION_SCOPE_INDEX_SCHEMA_VERSION) {
      return null;
    }
    if (payload.bankId !== input.bankId || payload.modeId !== input.modeId) {
      return null;
    }
    const targetTimeframe = normalizeSpecialTrainingBaseTimeframe(
      payload.targetTimeframe,
    );
    const minimumBaseTimeframe = normalizeSpecialTrainingBaseTimeframe(
      payload.minimumBaseTimeframe,
    );
    if (
      targetTimeframe !== input.targetTimeframe ||
      minimumBaseTimeframe !== input.targetTimeframe
    ) {
      return null;
    }
    const slotRanges = Array.isArray(payload.slotRanges)
      ? payload.slotRanges
          .map((item) => normalizeSerializedSlotRange(item))
          .filter(
            (item): item is SpecialTrainingQuestionSlotRange => Boolean(item),
          )
      : [];
    const scopeHash = String(payload.scopeHash ?? "").trim();
    const sourceTimeframes = normalizeTimeframeArray(payload.sourceTimeframes);
    const effectiveTimeframes = normalizeTimeframeArray(
      payload.effectiveTimeframes,
    );
    const timeframe =
      normalizeSpecialTrainingBaseTimeframe(payload.timeframe) ??
      input.targetTimeframe;
    if (!scopeHash) {
      return null;
    }
    return {
      bankId: input.bankId,
      bankName: input.bankName,
      modeId: input.modeId,
      poolCount: input.poolCount,
      horizonBars: input.horizonBars,
      targetTimeframe: input.targetTimeframe,
      minimumBaseTimeframe: input.targetTimeframe,
      sourceTimeframes,
      effectiveTimeframes,
      timeframe,
      scopeHash,
      normalizedSymbolsWithBars: normalizeStringArray(
        payload.normalizedSymbolsWithBars,
      ).sort((left, right) => left.localeCompare(right)),
      instrumentIdsWithBars: normalizeStringArray(
        payload.instrumentIdsWithBars,
      ),
      slotRanges,
      slotRangesByInstrumentId: new Map(
        slotRanges.map((range) => [range.instrumentId, range]),
      ),
      totalQuestionCount: Math.max(
        0,
        Math.floor(toFiniteNumber(payload.totalQuestionCount) || 0),
      ),
    };
  } catch {
    return null;
  }
};

export const resolveQuestionScopeDefinitionHash = (input: {
  modeId: SpecialTrainingModeId;
  bankId: string;
  targetTimeframe: SpecialTrainingBaseTimeframe;
  horizonBars: number;
  instrumentIds: string[];
  metaByInstrumentId: Map<string, InstrumentQuestionMeta>;
}): string => {
  const parts = [
    QUESTION_SCOPE_INDEX_SCHEMA_VERSION,
    `mode:${input.modeId}`,
    `bank:${input.bankId}`,
    `target:${input.targetTimeframe}`,
    `horizon:${normalizeQuestionHorizonBars(input.horizonBars)}`,
    ...input.instrumentIds
      .map((instrumentId) => input.metaByInstrumentId.get(instrumentId))
      .filter((meta): meta is InstrumentQuestionMeta => Boolean(meta))
      .map(
        (meta) =>
          [
            meta.samplePoolId,
            meta.instrumentId,
            meta.symbol,
            meta.market,
            meta.sourceTimeframe,
            meta.timeZone,
            Math.max(0, Math.floor(toFiniteNumber(meta.barCount) || 0)),
            String(meta.barsVersionToken ?? "").trim(),
            Math.max(0.00000001, toFiniteNumber(meta.minTradeStep) || 1),
          ].join(":"),
      ),
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
};

export const readCachedQuestionScopeState = (input: {
  definitionHash: string;
  bankId: string;
  bankName: string;
  modeId: SpecialTrainingModeId;
  poolCount: number;
  horizonBars: number;
  targetTimeframe: SpecialTrainingBaseTimeframe;
}): SpecialTrainingQuestionScopeState | null => {
  const row = getQuestionScopeIndexRow(input.definitionHash);
  if (!row) {
    return null;
  }
  return deserializeQuestionScopeState({
    payloadJson: row.payload_json,
    bankId: input.bankId,
    bankName: input.bankName,
    modeId: input.modeId,
    poolCount: input.poolCount,
    horizonBars: input.horizonBars,
    targetTimeframe: input.targetTimeframe,
  });
};

export const writeCachedQuestionScopeState = (input: {
  definitionHash: string;
  scopeState: SpecialTrainingQuestionScopeState;
}): void => {
  const now = new Date().toISOString();
  writeQuestionScopeIndexRow({
    definitionHash: input.definitionHash,
    bankId: input.scopeState.bankId,
    modeId: input.scopeState.modeId,
    targetTimeframe: input.scopeState.targetTimeframe,
    horizonBars: input.scopeState.horizonBars,
    scopeHash: input.scopeState.scopeHash,
    totalQuestionCount: input.scopeState.totalQuestionCount,
    payloadJson: serializeQuestionScopeState(input.scopeState),
    timestamp: now,
  });
};

export const applyQuestionScopeRequestFields = (
  scopeState: SpecialTrainingQuestionScopeState,
  input: {
    bankName: string;
    poolCount: number;
  },
): SpecialTrainingQuestionScopeState => ({
  ...scopeState,
  bankName: input.bankName,
  poolCount: input.poolCount,
});
