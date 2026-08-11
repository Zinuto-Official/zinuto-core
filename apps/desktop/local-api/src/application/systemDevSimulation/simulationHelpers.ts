// SPDX-License-Identifier: GPL-3.0-only

import { runtimeLimits } from "../../kernel/runtimeLimits.js";
import { isAppError } from "../../kernel/appError.js";
import {
  EPSILON,
  randomInt,
  randomFloat,
  type SupportedBaseTimeframe,
} from "../../domain/systemDevSimulation/sharedDomain.js";
import { createSystemDevSimulationRandom } from "../../domain/systemDevSimulation/random.js";
import { executeSessionAction } from "../trading/core.js";
import {
  FREE_REPLAY_SCENARIO_ARCHETYPES,
  type FreeReplayScenarioArchetype,
} from "./freeReplayNoteTask.js";
import {
  buildFreeReplayArchetypeSequence,
} from "./planning.js";
import {
  SYSTEM_DEV_SIMULATION_FREE_REPLAY_INPUT_MODES,
  SYSTEM_DEV_SIMULATION_FREE_REPLAY_PRICE_MODES,
  SYSTEM_DEV_SIMULATION_TRAINING_TAGS,
  resolveSystemDevSimulationEffectivePlan,
  type SystemDevSimulationEffectivePlan,
  type SystemDevSimulationFreeReplayInputMode,
  type SystemDevSimulationFreeReplayPriceMode,
} from "@zinuto/shared/systemDevSimulationProfiles";
import {
  REPLAY_NOTE_COLOR_TOKENS,
  type ReplayNoteColorToken,
} from "@zinuto/shared/replayNoteColors";
import {
  REPLAY_DRAW_TOOL_VISIBLE_NAMES,
  isReplayVisibleDrawToolName,
  type ReplayVisibleDrawToolName,
} from "@zinuto/shared/replayDrawingTools";
import type { SystemDevSimulationFreeReplayPlanItem } from "./freeReplayPlan.js";

// --- Free replay scenario helpers ---

export const resolveFreeReplayScenario = (
  index: number,
  effectivePlan: SystemDevSimulationEffectivePlan | null,
) =>
  buildFreeReplayArchetypeSequence(
    effectivePlan ??
      resolveSystemDevSimulationEffectivePlan({
        profileId: "REALISTIC",
        enabledPairCount: 1,
      }),
    index + 1,
  )[index] ?? FREE_REPLAY_SCENARIO_ARCHETYPES[0];

export const FREE_REPLAY_DRAWING_TOOLS_BY_SCENARIO: Record<
  FreeReplayScenarioArchetype,
  readonly ReplayVisibleDrawToolName[]
> = {
  TREND_CONTINUATION: ["rayLine", "straightLine", "parallelStraightLine"],
  FALSE_BREAKOUT: ["horizontalSegment", "priceLine", "simpleAnnotation"],
  RANGE_ROTATION: [
    "horizontalStraightLine",
    "horizontalRayLine",
    "priceChannelLine",
  ],
  MEAN_REVERSION: ["horizontalSegment", "fibonacciLine", "simpleAnnotation"],
  SHORT_OPPORTUNITY: ["rayLine", "priceLine", "segment"],
  SCALE_IN_OUT: ["segment", "parallelStraightLine", "priceChannelLine"],
  WATCH_ONLY: ["horizontalStraightLine", "simpleAnnotation"],
  FORCED_EXIT: ["priceLine", "segment", "simpleAnnotation"],
};

export const normalizeSimulationDrawingTools = (
  rawTools: readonly string[] | undefined,
): ReplayVisibleDrawToolName[] => {
  const source = rawTools?.length ? rawTools : REPLAY_DRAW_TOOL_VISIBLE_NAMES;
  const seen = new Set<string>();
  const tools: ReplayVisibleDrawToolName[] = [];
  for (const tool of source) {
    if (!isReplayVisibleDrawToolName(tool) || seen.has(tool)) {
      continue;
    }
    seen.add(tool);
    tools.push(tool);
  }
  return tools.length ? tools : [...REPLAY_DRAW_TOOL_VISIBLE_NAMES];
};

export const resolveFreeReplayDrawingTools = (input: {
  archetype: FreeReplayScenarioArchetype;
  itemIndex: number;
  effectivePlan: SystemDevSimulationEffectivePlan;
  random: ReturnType<typeof createSystemDevSimulationRandom>;
}): ReplayVisibleDrawToolName[] => {
  const coverageTools = normalizeSimulationDrawingTools(
    input.effectivePlan.coverage.drawingTools,
  );
  const mandatoryTool =
    coverageTools[Math.abs(Math.floor(input.itemIndex)) % coverageTools.length];
  const scenarioTools = FREE_REPLAY_DRAWING_TOOLS_BY_SCENARIO[input.archetype];
  const allowEmptyWatchOnly =
    input.archetype === "WATCH_ONLY" &&
    input.itemIndex >= coverageTools.length &&
    input.random.next() < 0.45;
  if (allowEmptyWatchOnly) {
    return [];
  }

  const merged: ReplayVisibleDrawToolName[] = [];
  const pushTool = (tool: ReplayVisibleDrawToolName | undefined) => {
    if (tool && !merged.includes(tool)) {
      merged.push(tool);
    }
  };
  pushTool(mandatoryTool);
  scenarioTools.forEach(pushTool);
  input.random.shuffle(coverageTools).forEach(pushTool);

  const maxCount =
    input.archetype === "WATCH_ONLY"
      ? randomInt(1, 2, input.random)
      : randomInt(2, 4, input.random);
  return merged.slice(0, Math.min(4, maxCount));
};

export const resolveFreeReplayLoopBudget = (
  baseTimeframe: SupportedBaseTimeframe,
  archetype: FreeReplayScenarioArchetype,
  random: ReturnType<typeof createSystemDevSimulationRandom>,
): number => {
  if (archetype === "WATCH_ONLY") {
    return baseTimeframe === "1m" ? 16 : 8;
  }
  if (archetype === "SCALE_IN_OUT") {
    return baseTimeframe === "1m" ? 26 : baseTimeframe === "1d" ? 12 : 18;
  }
  if (baseTimeframe === "1m") {
    return randomInt(12, 28, random);
  }
  if (baseTimeframe === "5m") {
    return randomInt(10, 22, random);
  }
  if (baseTimeframe === "1h") {
    return randomInt(8, 18, random);
  }
  return randomInt(6, 14, random);
};

export const resolveFreeReplayStepRange = (
  baseTimeframe: SupportedBaseTimeframe,
  archetype: FreeReplayScenarioArchetype,
): { min: number; max: number } => {
  if (archetype === "WATCH_ONLY") {
    return baseTimeframe === "1m" ? { min: 6, max: 24 } : { min: 2, max: 8 };
  }
  if (archetype === "FORCED_EXIT") {
    return baseTimeframe === "1m" ? { min: 1, max: 6 } : { min: 1, max: 3 };
  }
  if (baseTimeframe === "1m") {
    return { min: 1, max: 18 };
  }
  if (baseTimeframe === "5m") {
    return { min: 1, max: 12 };
  }
  if (baseTimeframe === "1h") {
    return { min: 1, max: 8 };
  }
  return { min: 1, max: 5 };
};

export const resolveHumanReplayAnchorIndex = (
  totalBarCount: number,
  baseTimeframe: SupportedBaseTimeframe,
  random: ReturnType<typeof createSystemDevSimulationRandom>,
): number => {
  const barCount = Math.max(0, Math.floor(Number(totalBarCount) || 0));
  const maxIndex = Math.max(0, barCount - 2);
  if (maxIndex <= 0) {
    return 0;
  }
  const preferredHistory =
    baseTimeframe === "1m" ? 180 : baseTimeframe === "5m" ? 120 : 80;
  const preferredFuture =
    baseTimeframe === "1m" ? 180 : baseTimeframe === "5m" ? 96 : 48;
  const minAnchor = Math.min(
    maxIndex,
    Math.max(4, Math.min(preferredHistory, Math.floor(barCount * 0.28))),
  );
  const maxAnchor = Math.max(
    minAnchor,
    Math.min(
      maxIndex,
      barCount -
        2 -
        Math.max(6, Math.min(preferredFuture, Math.floor(barCount * 0.32))),
    ),
  );
  return randomInt(minAnchor, maxAnchor, random);
};

export const SYSTEM_DEV_SIMULATION_ARCHIVE_FUTURE_BAR_RESERVE = 5_000;

export const SYSTEM_DEV_SIMULATION_ARCHIVE_HISTORY_BARS: Record<
  SupportedBaseTimeframe,
  number
> = {
  "1m": 1_440,
  "5m": 576,
  "1h": 240,
  "1d": 260,
};

export const resolveFreeReplayArchiveStartIndex = (
  anchorIndex: number,
  baseTimeframe: SupportedBaseTimeframe,
): number => {
  const safeAnchorIndex = Math.max(
    0,
    Math.floor(Number.isFinite(anchorIndex) ? anchorIndex : 0),
  );
  const configuredHistoryBars =
    SYSTEM_DEV_SIMULATION_ARCHIVE_HISTORY_BARS[baseTimeframe] ?? 260;
  const maxHistoryBars = Math.max(
    1,
    Math.floor(runtimeLimits.barsRangeLimitMax) -
      SYSTEM_DEV_SIMULATION_ARCHIVE_FUTURE_BAR_RESERVE,
  );
  const boundedHistoryBars = Math.max(
    1,
    Math.min(configuredHistoryBars, maxHistoryBars),
  );
  return Math.max(0, safeAnchorIndex - boundedHistoryBars + 1);
};

export const resolveFreeReplayObservationBars = (
  baseTimeframe: SupportedBaseTimeframe,
  archetype: FreeReplayScenarioArchetype,
  random: ReturnType<typeof createSystemDevSimulationRandom>,
): number => {
  if (archetype === "WATCH_ONLY") {
    return baseTimeframe === "1m" ? randomInt(12, 36, random) : randomInt(4, 14, random);
  }
  if (baseTimeframe === "1m") {
    return randomInt(8, 24, random);
  }
  if (baseTimeframe === "5m") {
    return randomInt(6, 18, random);
  }
  if (baseTimeframe === "1h") {
    return randomInt(4, 12, random);
  }
  return randomInt(3, 8, random);
};

export const pickCoverageValue = <T>(
  values: readonly T[] | undefined,
  fallback: readonly T[],
  index: number,
): T => {
  const source = values?.length ? values : fallback;
  return source[Math.abs(Math.floor(index)) % source.length] as T;
};

export const resolveFreeReplayInputMode = (
  itemIndex: number,
  effectivePlan: SystemDevSimulationEffectivePlan,
): SystemDevSimulationFreeReplayInputMode =>
  pickCoverageValue(
    effectivePlan.coverage.freeReplayInputModes,
    SYSTEM_DEV_SIMULATION_FREE_REPLAY_INPUT_MODES,
    itemIndex,
  );

export const resolveFreeReplayPriceMode = (
  itemIndex: number,
  effectivePlan: SystemDevSimulationEffectivePlan,
): SystemDevSimulationFreeReplayPriceMode =>
  pickCoverageValue(
    effectivePlan.coverage.freeReplayPriceModes,
    SYSTEM_DEV_SIMULATION_FREE_REPLAY_PRICE_MODES,
    itemIndex,
  );

export const resolveFreeReplayTrainingTag = (
  itemIndex: number,
  effectivePlan: SystemDevSimulationEffectivePlan,
): string =>
  pickCoverageValue(
    effectivePlan.coverage.trainingTags,
    SYSTEM_DEV_SIMULATION_TRAINING_TAGS,
    itemIndex,
  );

export const resolveFreeReplayRequiredColor = (
  itemIndex: number,
  effectivePlan: SystemDevSimulationEffectivePlan,
): ReplayNoteColorToken =>
  pickCoverageValue(
    effectivePlan.coverage.noteColorTokens,
    REPLAY_NOTE_COLOR_TOKENS,
    itemIndex,
  );

// --- Order execution helpers ---

export type SimulationOrderAttemptResult = {
  placed: boolean;
  rejectionCode: string | null;
};

export const resolveExpectedSimulationOrderRejectionCode = (
  error: unknown,
): string | null => {
  if (!isAppError(error)) {
    return null;
  }
  if (
    error.code === "ORDER_BLOCKED" &&
    typeof error.args?.blockedReasonCode === "string" &&
    error.args.blockedReasonCode.length > 0
  ) {
    return `ORDER_BLOCKED:${error.args.blockedReasonCode}`;
  }
  if (
    error.code === "SHORT_MARGIN_INSUFFICIENT" ||
    error.code === "ACCOUNT_BALANCE_INSUFFICIENT" ||
    error.code === "SHORT_SELLING_DISABLED" ||
    error.code === "LONG_MARGIN_TRADING_DISABLED" ||
    error.code === "MARGIN_MAINTENANCE_INSUFFICIENT" ||
    error.code === "INSUFFICIENT_FUNDS" ||
    error.code === "INVALID_ORDER_QTY" ||
    error.code === "UNDO_EMPTY"
  ) {
    return error.code;
  }
  return null;
};

export const buildSimulationOrderSizingPayload = (params: {
  inputMode: SystemDevSimulationFreeReplayInputMode;
  assetClass: SystemDevSimulationFreeReplayPlanItem["assetClass"];
  qty: number;
  minTradeStep: number;
  currentClose: number;
  contractMultiplier: number;
  random: ReturnType<typeof createSystemDevSimulationRandom>;
  itemIndex: number;
  loopIndex: number;
}): {
  inputMode: SystemDevSimulationFreeReplayInputMode;
  lotInput?: number | null;
  amountInput?: number | null;
  ratioInput?: number | null;
} => {
  if (params.inputMode === "AMOUNT") {
    return {
      inputMode: params.inputMode,
      lotInput: null,
      amountInput: Number(
        (
          Math.max(EPSILON, params.qty) *
          Math.max(EPSILON, params.currentClose) *
          Math.max(EPSILON, params.contractMultiplier) *
          randomFloat(1.04, 1.18, params.random)
        ).toFixed(2),
      ),
      ratioInput: null,
    };
  }
  if (params.inputMode === "RATIO") {
    const ratioBuckets = [10, 25, 50, 100] as const;
    return {
      inputMode: params.inputMode,
      lotInput: null,
      amountInput: null,
      ratioInput:
        ratioBuckets[
          Math.abs(Math.floor(params.itemIndex + params.loopIndex)) %
            ratioBuckets.length
        ],
    };
  }
  return {
    inputMode: params.inputMode,
    lotInput:
      params.assetClass === "CRYPTO"
        ? params.qty
        : Math.max(
            1,
            Math.floor(
              params.qty /
                Math.max(EPSILON, Number(params.minTradeStep) || 1) +
                EPSILON,
            ),
          ),
    amountInput: null,
    ratioInput: null,
  };
};

export const tryPlaceSimulationOrder = async (
  sessionId: string,
  payload: {
    side: "BUY" | "SELL";
    qty: number;
    inputMode: SystemDevSimulationFreeReplayInputMode;
    assetClass: SystemDevSimulationFreeReplayPlanItem["assetClass"];
    minTradeStep: number;
    currentClose: number;
    contractMultiplier: number;
    random: ReturnType<typeof createSystemDevSimulationRandom>;
    itemIndex: number;
    loopIndex: number;
    occurredAt: string;
    undoOccurredAt?: string;
    priceMode?: "CUR_CLOSE" | "NEXT_OPEN";
    autoStep?: boolean;
    undoAfterFill?: boolean;
  },
): Promise<SimulationOrderAttemptResult> => {
  if (!(payload.qty > EPSILON)) {
    return { placed: false, rejectionCode: "SIMULATION_QTY_ZERO" };
  }
  try {
    const sizing = buildSimulationOrderSizingPayload({
      inputMode: payload.inputMode,
      assetClass: payload.assetClass,
      qty: payload.qty,
      minTradeStep: payload.minTradeStep,
      currentClose: payload.currentClose,
      contractMultiplier: payload.contractMultiplier,
      random: payload.random,
      itemIndex: payload.itemIndex,
      loopIndex: payload.loopIndex,
    });
    const actionPayload = {
      action: payload.side,
      inputMode: sizing.inputMode,
      lotInput: sizing.lotInput,
      amountInput: sizing.amountInput,
      ratioInput: sizing.ratioInput,
      priceMode: payload.priceMode ?? "CUR_CLOSE",
      occurredAt: payload.occurredAt,
    } as const;
    if (payload.undoAfterFill) {
      await executeSessionAction(sessionId, actionPayload);
      await executeSessionAction(sessionId, {
        action: "UNDO",
        occurredAt: payload.undoOccurredAt ?? payload.occurredAt,
      });
      return { placed: true, rejectionCode: null };
    }
    await executeSessionAction(sessionId, actionPayload);
    return { placed: true, rejectionCode: null };
  } catch (error) {
    const rejectionCode = resolveExpectedSimulationOrderRejectionCode(error);
    if (rejectionCode) {
      return { placed: false, rejectionCode };
    }
    throw error;
  }
};

export const resolveFreeReplayOrderExecution = (
  itemIndex: number,
  loopIndex: number,
  effectivePlan: SystemDevSimulationEffectivePlan,
): Pick<
  Parameters<typeof tryPlaceSimulationOrder>[1],
  "priceMode" | "autoStep" | "undoAfterFill"
> => {
  const coverageBucket = Math.abs(Math.floor(itemIndex)) % 4;
  const priceMode = resolveFreeReplayPriceMode(itemIndex, effectivePlan);
  if (coverageBucket === 1) {
    return {
      priceMode,
      autoStep: true,
      undoAfterFill: false,
    };
  }
  if (coverageBucket === 2) {
    return {
      priceMode,
      autoStep: false,
      undoAfterFill: loopIndex % 4 === 0,
    };
  }
  if (coverageBucket === 3) {
    return {
      priceMode,
      autoStep: false,
      undoAfterFill: false,
    };
  }
  return {
    priceMode,
    autoStep: false,
    undoAfterFill: false,
  };
};

// --- General helpers ---

export const withRetry = async <T>(
  task: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  const { MAX_ITEM_ATTEMPTS } = await import("../../domain/systemDevSimulation/sharedDomain.js");
  const { throwIfSystemDevSimulationTaskAborted } = await import("./taskExecutionState.js");
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_ITEM_ATTEMPTS; attempt += 1) {
    throwIfSystemDevSimulationTaskAborted(signal);
    try {
      return await task();
    } catch (error) {
      lastError = error;
      throwIfSystemDevSimulationTaskAborted(signal);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("SYSTEM_DEV_SIMULATION_FAILED");
};

export const runPool = async (
  total: number,
  concurrency: number,
  worker: (index: number) => Promise<void>,
): Promise<void> => {
  const { yieldToEventLoop } = await import("../../domain/systemDevSimulation/sharedDomain.js");
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const current = cursor;
      cursor += 1;
      if (current >= total) {
        return;
      }
      await worker(current);
      await yieldToEventLoop();
    }
  });
  await Promise.all(workers);
};
