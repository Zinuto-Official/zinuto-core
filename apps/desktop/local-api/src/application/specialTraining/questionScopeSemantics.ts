// SPDX-License-Identifier: GPL-3.0-only

import type { OhlcvBar } from '../../domain/models.js';
import {
  SYSTEM_FX_1M_2025Q1_POOL_ID,
  SYSTEM_WIKI_EOD_POOL_ID,
  resolveSystemSeedDisplayBarCount,
} from '../ports/infrastructure/db/systemSeedBars.js';
import {
  getMarketBarCount,
  getMarketTimelineTotalDisplay,
  type MarketDisplayBar,
} from '../ports/infrastructure/db/marketDatabase.js';
import { appError } from '../../kernel/appError.js';
import { runtimeLimits } from '../../kernel/runtimeLimits.js';
import { parseTimestampMs } from '@zinuto/shared/marketTime';
import { DEFAULT_TIME_ZONE, normalizeTimeZone } from '@zinuto/shared/timezone';
import {
  resolveSpecialTrainingDecisionSecondsLimit,
  resolveSpecialTrainingDefaultMaxEntries,
  resolveSpecialTrainingDefaultMaxOperations,
  resolveSpecialTrainingHorizonBars,
  resolveSpecialTrainingLookbackBars,
  supportsSpecialTrainingFastDecisionStrictness,
} from '@zinuto/shared/specialTrainingModes';
import {
  FAST_DECISION_DEFAULT_STRICTNESS_LEVEL,
  resolveFastDecisionStrictnessLevel,
} from '@zinuto/shared/domain-calculations/fast-decision';
import {
  SLOT_STRIDE_DIVISOR,
  SPECIAL_TRAINING_TIMEFRAME,
} from '../../domain/specialTraining/constants.js';
import {
  compareSpecialTrainingBaseTimeframe,
  normalizeSpecialTrainingBaseTimeframe,
  resolveEffectiveTrainingTimeframe,
  type SpecialTrainingBaseTimeframe,
} from '../../domain/specialTraining/timeframeSemantics.js';
import { clamp, toFiniteNumber } from './util.js';
import {
  listInstrumentQuestionMetaRowsByIds,
  type InstrumentQuestionMetaRow,
} from '../ports/infrastructure/db/specialTraining/questionBankStore.js';
import type {
  SpecialTrainingFastDecisionStrictnessLevel,
  SpecialTrainingModeId,
  SpecialTrainingQuestionScopeState,
  SpecialTrainingQuestionSlotRange,
} from '../../domain/specialTraining/contracts.js';

export type QuestionScopeMarketReader = {
  getMarketBarCount: typeof getMarketBarCount;
  getMarketTimelineTotalDisplay: typeof getMarketTimelineTotalDisplay;
};

export const DEFAULT_QUESTION_SCOPE_MARKET_READER: QuestionScopeMarketReader = {
  getMarketBarCount,
  getMarketTimelineTotalDisplay,
};
export const normalizeBars = (bars: OhlcvBar[]): OhlcvBar[] =>
  bars
    .map((bar) => {
      const ts = String(bar.ts || "").trim();
      const open = toFiniteNumber(bar.open);
      const high = toFiniteNumber(bar.high);
      const low = toFiniteNumber(bar.low);
      const close = toFiniteNumber(bar.close);
      const volume = toFiniteNumber(bar.volume);
      if (!ts || !Number.isFinite(parseTimestampMs(ts))) {
        return null;
      }
      if (
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
      ) {
        return null;
      }
      return {
        ts,
        open,
        high,
        low,
        close,
        volume: Number.isFinite(volume) ? volume : 0,
      } satisfies OhlcvBar;
    })
    .filter((bar): bar is OhlcvBar => Boolean(bar));

export const resolveModeHorizonBars = (
  modeId: SpecialTrainingModeId,
  overrideValue?: number,
): number => resolveSpecialTrainingHorizonBars(modeId, overrideValue);

export const normalizeQuestionHorizonBars = (horizonBars: number): number =>
  Math.max(1, Math.floor(toFiniteNumber(horizonBars) || 0));
export const QUESTION_SCOPE_INDEX_SCHEMA_VERSION = "special-training-question-scope-index-v2";
export const QUESTION_DRAW_PERMUTATION_SCHEMA_VERSION = "special-training-question-draw-permutation-v1";
export const QUESTION_SCOPE_MARKET_METADATA_CONCURRENCY = Math.max(
  1,
  Math.min(2, runtimeLimits.marketReadConnectionPoolSize),
);
export const SYSTEM_SAMPLE_POOL_IDS = new Set<string>([
  SYSTEM_FX_1M_2025Q1_POOL_ID,
  SYSTEM_WIKI_EOD_POOL_ID,
]);
export const questionScopeBuildPromises = new Map<
  string,
  Promise<SpecialTrainingQuestionScopeState>
>();
export const questionScopeMarketMetadataWaiters: Array<() => void> = [];
let activeQuestionScopeMarketMetadataReads = 0;

export const acquireQuestionScopeMarketMetadataSlot = async (): Promise<() => void> =>
  new Promise((resolve) => {
    const grantSlot = (): void => {
      activeQuestionScopeMarketMetadataReads += 1;
      let released = false;
      resolve(() => {
        if (released) {
          return;
        }
        released = true;
        activeQuestionScopeMarketMetadataReads = Math.max(
          0,
          activeQuestionScopeMarketMetadataReads - 1,
        );
        questionScopeMarketMetadataWaiters.shift()?.();
      });
    };

    if (
      activeQuestionScopeMarketMetadataReads <
      QUESTION_SCOPE_MARKET_METADATA_CONCURRENCY
    ) {
      grantSlot();
      return;
    }
    questionScopeMarketMetadataWaiters.push(grantSlot);
  });

export const runQuestionScopeMarketMetadataTask = async <T>(
  task: () => Promise<T>,
): Promise<T> => {
  const release = await acquireQuestionScopeMarketMetadataSlot();
  try {
    return await task();
  } finally {
    release();
  }
};

export const mapQuestionScopeMarketMetadataTasks = async <TInput, TOutput>(
  items: readonly TInput[],
  mapper: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> =>
  Promise.all(
    items.map((item, index) =>
      runQuestionScopeMarketMetadataTask(() => mapper(item, index)),
    ),
  );

export const resolveModeLookbackBars = (modeId: SpecialTrainingModeId): number =>
  resolveSpecialTrainingLookbackBars(modeId);

export const resolveDefaultModeMaxOperations = (
  modeId: SpecialTrainingModeId,
): number => resolveSpecialTrainingDefaultMaxOperations(modeId);

export const resolveModeMaxOperations = (
  modeId: SpecialTrainingModeId,
  overrideValue?: number,
): number => {
  void overrideValue;
  return resolveDefaultModeMaxOperations(modeId);
};

export const resolveModeMaxEntries = (
  modeId: SpecialTrainingModeId,
): number => resolveSpecialTrainingDefaultMaxEntries(modeId);

export const resolveModeDecisionSecondsLimit = (
  modeId: SpecialTrainingModeId,
  overrideValue?: number,
): number => resolveSpecialTrainingDecisionSecondsLimit(modeId, overrideValue);

export const resolveModeFastDecisionStrictnessLevel = (
  modeId: SpecialTrainingModeId,
  overrideValue?: unknown,
): SpecialTrainingFastDecisionStrictnessLevel => {
  if (!supportsSpecialTrainingFastDecisionStrictness(modeId)) {
    return FAST_DECISION_DEFAULT_STRICTNESS_LEVEL as SpecialTrainingFastDecisionStrictnessLevel;
  }
  return resolveFastDecisionStrictnessLevel(
    overrideValue,
  ) as SpecialTrainingFastDecisionStrictnessLevel;
};

export const resolveModeWindowBarCount = (
  modeId: SpecialTrainingModeId,
  horizonBars: number,
): number => {
  const normalizedHorizonBars = normalizeQuestionHorizonBars(horizonBars);
  const lookbackBars = resolveModeLookbackBars(modeId);
  return Math.max(
    lookbackBars + normalizedHorizonBars,
    lookbackBars + 1,
  );
};

export const resolveModeSlotStrideBars = (windowBarCount: number): number =>
  Math.max(1, Math.floor(Math.max(2, windowBarCount) / SLOT_STRIDE_DIVISOR));

export const resolveAvailableQuestionWindowSemantics = (
  timeframeSemantics: InstrumentQuestionTimeframeSemantics,
  totalEffectiveBars: number,
  horizonBars: number,
): InstrumentQuestionTimeframeSemantics | null => {
  const normalizedTotalEffectiveBars = Math.max(
    0,
    Math.floor(toFiniteNumber(totalEffectiveBars) || 0),
  );
  const normalizedHorizonBars = Math.max(
    1,
    normalizeQuestionHorizonBars(horizonBars),
  );
  const minimumWindowBarCount = normalizedHorizonBars + 1;
  if (normalizedTotalEffectiveBars < minimumWindowBarCount) {
    return null;
  }

  const effectiveWindowBarCount = Math.min(
    timeframeSemantics.effectiveWindowBarCount,
    normalizedTotalEffectiveBars,
  );
  const effectiveLookbackBars = Math.max(
    1,
    effectiveWindowBarCount - normalizedHorizonBars,
  );
  const effectiveSlotStrideBars = resolveModeSlotStrideBars(
    effectiveWindowBarCount,
  );

  return {
    ...timeframeSemantics,
    effectiveLookbackBars,
    effectiveWindowBarCount,
    effectiveSlotStrideBars,
    lookbackBars: effectiveLookbackBars,
    windowBarCount: effectiveWindowBarCount,
    slotStrideBars: effectiveSlotStrideBars,
  };
};

export const resolveMinimumBaseTimeframe = (
  value: unknown,
): SpecialTrainingBaseTimeframe =>
  normalizeSpecialTrainingBaseTimeframe(value) ??
  normalizeSpecialTrainingBaseTimeframe(SPECIAL_TRAINING_TIMEFRAME) ??
  "1d";

export type InstrumentQuestionTimeframeSemantics = {
  targetTimeframe: SpecialTrainingBaseTimeframe;
  minimumBaseTimeframe: SpecialTrainingBaseTimeframe;
  sourceTimeframe: SpecialTrainingBaseTimeframe;
  effectiveTimeframe: SpecialTrainingBaseTimeframe;
  effectiveLookbackBars: number;
  effectiveWindowBarCount: number;
  effectiveSlotStrideBars: number;
  lookbackBars: number;
  windowBarCount: number;
  slotStrideBars: number;
};

export const resolveInstrumentTimeframeSemantics = (input: {
  modeId: SpecialTrainingModeId;
  sourceTimeframe: SpecialTrainingBaseTimeframe;
  horizonBars: number;
  minimumBaseTimeframe?: unknown;
}): InstrumentQuestionTimeframeSemantics => {
  const targetTimeframe = resolveMinimumBaseTimeframe(
    input.minimumBaseTimeframe,
  );
  const sourceTimeframe = input.sourceTimeframe;
  if (
    compareSpecialTrainingBaseTimeframe(sourceTimeframe, targetTimeframe) > 0
  ) {
    throw appError("SPECIAL_TRAINING_BANK_TARGET_TIMEFRAME_INVALID", {
      sourceTimeframe,
      targetTimeframe,
    });
  }
  const effectiveTimeframe = resolveEffectiveTrainingTimeframe(
    sourceTimeframe,
    targetTimeframe,
  );
  const effectiveLookbackBars = resolveModeLookbackBars(input.modeId);
  const effectiveWindowBarCount = resolveModeWindowBarCount(
    input.modeId,
    input.horizonBars,
  );
  const effectiveSlotStrideBars = resolveModeSlotStrideBars(
    effectiveWindowBarCount,
  );
  return {
    targetTimeframe,
    minimumBaseTimeframe: targetTimeframe,
    sourceTimeframe,
    effectiveTimeframe,
    effectiveLookbackBars,
    effectiveWindowBarCount,
    effectiveSlotStrideBars,
    lookbackBars: effectiveLookbackBars,
    windowBarCount: effectiveWindowBarCount,
    slotStrideBars: effectiveSlotStrideBars,
  };
};

export const collectUniqueSortedTimeframes = (
  values: Iterable<SpecialTrainingBaseTimeframe>,
): SpecialTrainingBaseTimeframe[] =>
  Array.from(new Set(values)).sort((left, right) =>
    compareSpecialTrainingBaseTimeframe(left, right),
  );

export const resolveQuestionSlotCount = (
  totalEffectiveBars: number,
  timeframeSemantics: InstrumentQuestionTimeframeSemantics,
): number => {
  const normalizedTotalEffectiveBars = Math.max(
    0,
    Math.floor(toFiniteNumber(totalEffectiveBars) || 0),
  );
  const maxEffectiveWindowStartIndex =
    normalizedTotalEffectiveBars -
    timeframeSemantics.effectiveWindowBarCount;
  if (!normalizedTotalEffectiveBars || maxEffectiveWindowStartIndex < 0) {
    return 0;
  }
  return (
    Math.floor(
      maxEffectiveWindowStartIndex /
        Math.max(1, timeframeSemantics.effectiveSlotStrideBars),
    ) + 1
  );
};

export const mapDisplayBarToQuestionBar = (bar: MarketDisplayBar): OhlcvBar => ({
  ts: new Date(
    Math.max(0, Math.floor(toFiniteNumber(bar.bucketStartMs) || 0)),
  ).toISOString(),
  open: toFiniteNumber(bar.open),
  high: toFiniteNumber(bar.high),
  low: toFiniteNumber(bar.low),
  close: toFiniteNumber(bar.close),
  volume: toFiniteNumber(bar.volume),
});

export const resolveActualSourceBarCount = async (
  meta: InstrumentQuestionMeta,
  marketReader: QuestionScopeMarketReader,
): Promise<number> => {
  const normalizedInstrumentId = String(meta.instrumentId || "").trim();
  if (!normalizedInstrumentId) {
    return 0;
  }
  if (meta.market !== "SYSTEM") {
    return Math.max(
      0,
      Math.floor(
        toFiniteNumber(await marketReader.getMarketBarCount(normalizedInstrumentId)) || 0,
      ),
    );
  }
  return Math.max(0, Math.floor(toFiniteNumber(meta.barCount) || 0));
};

export const buildQuestionSlotRangeForInstrumentMeta = async (input: {
  modeId: SpecialTrainingModeId;
  meta: InstrumentQuestionMeta;
  horizonBars: number;
  minimumBaseTimeframe: SpecialTrainingBaseTimeframe;
  startingSlotIndex: number;
  marketReader: QuestionScopeMarketReader;
}): Promise<SpecialTrainingQuestionSlotRange | null> => {
  const actualSourceBarCount = Math.max(
    0,
    Math.floor(
      toFiniteNumber(
        await resolveActualSourceBarCount(input.meta, input.marketReader),
      ) || 0,
    ),
  );
  if (actualSourceBarCount <= 0) {
    return null;
  }
  const barsVersionToken = resolveInstrumentBarsVersionToken(
    input.meta,
    actualSourceBarCount,
  );
  const minTradeStep = Math.max(
    0.00000001,
    toFiniteNumber(input.meta.minTradeStep) || 1,
  );
  const horizonBars = normalizeQuestionHorizonBars(input.horizonBars);
  const timeframeSemantics = resolveInstrumentTimeframeSemantics({
    modeId: input.modeId,
    sourceTimeframe: input.meta.sourceTimeframe,
    horizonBars,
    minimumBaseTimeframe: input.minimumBaseTimeframe,
  });
  const systemSeedEffectiveBarCount =
    input.meta.market === "SYSTEM" &&
    timeframeSemantics.sourceTimeframe !== timeframeSemantics.effectiveTimeframe
      ? resolveSystemSeedDisplayBarCount(
          input.meta.symbol,
          input.meta.sourceTimeframe,
          timeframeSemantics.effectiveTimeframe,
          input.meta.timeZone,
        )
      : null;
  const totalEffectiveBars =
    timeframeSemantics.sourceTimeframe === timeframeSemantics.effectiveTimeframe
      ? actualSourceBarCount
      : systemSeedEffectiveBarCount ??
        (await input.marketReader.getMarketTimelineTotalDisplay({
          instrumentId: input.meta.instrumentId,
          versionToken: barsVersionToken,
          baseTimeframe: input.meta.sourceTimeframe,
          timeZone: input.meta.timeZone,
          displayPeriod: timeframeSemantics.effectiveTimeframe,
        }));
  const availableTimeframeSemantics = resolveAvailableQuestionWindowSemantics(
    timeframeSemantics,
    totalEffectiveBars,
    horizonBars,
  );
  if (!availableTimeframeSemantics) {
    return null;
  }
  const slotCount = resolveQuestionSlotCount(
    totalEffectiveBars,
    availableTimeframeSemantics,
  );
  if (slotCount <= 0) {
    return null;
  }
  const startIndex = Math.max(
    0,
    availableTimeframeSemantics.effectiveLookbackBars - 1,
  );
  const endIndex = clamp(
    startIndex + horizonBars,
    startIndex,
    availableTimeframeSemantics.effectiveWindowBarCount - 1,
  );
  if (endIndex <= startIndex) {
    return null;
  }

  return {
    instrumentId: input.meta.instrumentId,
    samplePoolId: input.meta.samplePoolId,
    symbol: input.meta.symbol,
    slotStartIndex: Math.max(
      0,
      Math.floor(toFiniteNumber(input.startingSlotIndex) || 0),
    ),
    slotCount,
    totalEffectiveBars,
    effectiveSlotStrideBars:
      availableTimeframeSemantics.effectiveSlotStrideBars,
    startIndex,
    endIndex,
    targetTimeframe: availableTimeframeSemantics.targetTimeframe,
    minimumBaseTimeframe: availableTimeframeSemantics.minimumBaseTimeframe,
    sourceTimeframe: availableTimeframeSemantics.sourceTimeframe,
    effectiveTimeframe: availableTimeframeSemantics.effectiveTimeframe,
    sourceBarsPerEffectiveBar:
      availableTimeframeSemantics.sourceTimeframe ===
      availableTimeframeSemantics.effectiveTimeframe
        ? 1
        : Math.max(
            1,
            Math.round(actualSourceBarCount / Math.max(1, totalEffectiveBars)),
          ),
    timeZone: normalizeTimeZone(input.meta.timeZone),
    effectiveWindowBarCount:
      availableTimeframeSemantics.effectiveWindowBarCount,
    sourceBarCount: actualSourceBarCount,
    barsVersionToken,
    minTradeStep,
  };
};

export type InstrumentQuestionMeta = {
  instrumentId: string;
  samplePoolId: string;
  symbol: string;
  market: "LOCAL" | "SYSTEM" | string;
  sourceTimeframe: SpecialTrainingBaseTimeframe;
  timeZone: string;
  barCount: number;
  timeStartTs: string | null;
  timeEndTs: string | null;
  barsVersionToken: string;
  minTradeStep: number;
};

export const resolveInstrumentSamplePoolId = (
  market: string,
  sourceId: unknown,
  sourceTimeframe: SpecialTrainingBaseTimeframe,
): string => {
  const normalizedSourceId = String(sourceId ?? "").trim();
  if (market === "LOCAL") {
    return normalizedSourceId;
  }
  return sourceTimeframe === "1m"
    ? SYSTEM_FX_1M_2025Q1_POOL_ID
    : SYSTEM_WIKI_EOD_POOL_ID;
};

export const readInstrumentQuestionMetaByIds = (
  instrumentIds: string[],
): Map<string, InstrumentQuestionMeta> => {
  const normalizedInstrumentIds = Array.from(
    new Set(
      instrumentIds
        .map((item) => String(item ?? "").trim())
        .filter((item) => Boolean(item)),
    ),
  );
  const metaByInstrumentId = new Map<string, InstrumentQuestionMeta>();
  if (!normalizedInstrumentIds.length) {
    return metaByInstrumentId;
  }

  listInstrumentQuestionMetaRowsByIds(normalizedInstrumentIds).forEach(
    (row: InstrumentQuestionMetaRow) => {
      const instrumentId = String(row.instrumentId ?? "").trim();
      const symbol = String(row.symbol ?? "")
        .trim()
        .toUpperCase();
      const sourceTimeframe = normalizeSpecialTrainingBaseTimeframe(
        row.baseTimeframe,
      );
      if (!instrumentId || !symbol || !sourceTimeframe) {
        return;
      }
      const market = String(row.market ?? "")
        .trim()
        .toUpperCase();
      const rawTimeZone =
        market === "LOCAL"
          ? row.sourceTimeZone ?? row.instrumentTimeZone
          : row.instrumentTimeZone ?? row.sourceTimeZone;
      metaByInstrumentId.set(instrumentId, {
        instrumentId,
        samplePoolId: resolveInstrumentSamplePoolId(
          market,
          row.sourceId,
          sourceTimeframe,
        ),
        symbol,
        market,
        sourceTimeframe,
        timeZone: normalizeTimeZone(rawTimeZone, DEFAULT_TIME_ZONE),
        barCount: Math.max(0, Math.floor(toFiniteNumber(row.barCount) || 0)),
        timeStartTs:
          typeof row.timeStartTs === "string" && row.timeStartTs.trim()
            ? row.timeStartTs
            : null,
        timeEndTs:
          typeof row.timeEndTs === "string" && row.timeEndTs.trim()
            ? row.timeEndTs
            : null,
        barsVersionToken: String(row.barsVersionToken ?? "").trim(),
        minTradeStep: Math.max(
          0.00000001,
          toFiniteNumber(row.minTradeStep) || 1,
        ),
      });
    },
  );

  return metaByInstrumentId;
};
export const resolveInstrumentBarsVersionToken = (
  meta: InstrumentQuestionMeta,
  sourceBarCount: number,
): string =>
  String(meta.barsVersionToken ?? "").trim() ||
  [
    "market-frame",
    String(meta.instrumentId || "").trim(),
    meta.sourceTimeframe,
    Math.max(0, Math.floor(toFiniteNumber(sourceBarCount) || 0)),
  ].join(":");
