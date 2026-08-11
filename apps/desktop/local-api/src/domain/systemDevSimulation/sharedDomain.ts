// SPDX-License-Identifier: GPL-3.0-only

import type { OhlcvBar } from "../models.js";
import type { TradingSettings } from "../trading/types.js";
import type {
  BuiltInTradingMarketPresetId,
  TradingAssetClass,
} from "@zinuto/shared/trading";
import type {
  LocalizedMessageToken,
  MessageId,
  MessagePrimitive,
  MessageValues,
} from "@zinuto/shared/i18n";
import { DEFAULT_SIMULATION_REPLAY_NOTE_TITLE_PREFIXES } from "@zinuto/shared/simulationArtifactIdentity";
import {
  REPLAY_DRAW_TOOL_MIN_POINT_COUNT_BY_NAME,
  REPLAY_DRAW_TOOL_VISIBLE_NAMES,
  isReplayVisibleDrawToolName,
  type ReplayVisibleDrawToolName,
} from "@zinuto/shared/replayDrawingTools";
import {
  formatCopyTemplate,
  type SystemDevSimulationCopy,
} from "@zinuto/shared/systemDevSimulationCopy";
import type {
  ReplayNoteBlockV1,
  ReplayNoteDocumentV1,
} from "@zinuto/shared/replayNoteDocument";
import type {
  SpecialTrainingFastDecisionChoice,
  SpecialTrainingLedgerSourceTag,
  SpecialTrainingModeId,
  SpecialTrainingSettlementResult,
  SpecialTrainingTradeAction,
} from "../specialTraining/contracts.js";
import type { SystemDevSimulationRandom } from "./random.js";
import {
  countSystemDevSimulationEnabledPairs,
  resolveSystemDevSimulationProfileTargets,
  type SystemDevSimulationProfileId,
  type SystemDevSimulationProfileTargets,
} from "@zinuto/shared/systemDevSimulationProfiles";

export type SupportedBaseTimeframe = "1m" | "5m" | "1h" | "1d";
export type SystemDevSimulationInstrumentSourceKind = "LOCAL" | "SYSTEM";
export type SystemDevSimulationEnabledInstrument = {
  instrumentId: string;
  symbol: string;
  baseTimeframe: SupportedBaseTimeframe;
  barCount: number;
  assetClass: TradingAssetClass;
  marketPresetId: BuiltInTradingMarketPresetId;
  sourceKind: SystemDevSimulationInstrumentSourceKind;
  sourceId: string;
  sourceName: string;
};
export type SystemDevSimulationEnabledPool = {
  id: string;
  name: string;
  assetClass: TradingAssetClass;
  baseTimeframe: SupportedBaseTimeframe;
  symbols: string[];
  instruments?: SystemDevSimulationEnabledInstrument[];
};
export type DisplayPeriodKey =
  "1m" | "5m" | "1h" | "1d" | "1w" | "1month" | "1year";

export type ReplayCurvePoint = {
  ts: string;
  value: number;
};

export type ReplayArchive = {
  bars: OhlcvBar[];
  snapshot: {
    session: {
      id: string;
      symbol: string;
      created_at: string;
      entry_index: number;
      cursor_index: number;
    };
    sessionTradingSettings?: Partial<TradingSettings>;
    positions?: Array<{
      qty?: number;
      avgCost?: number;
      unrealizedPnl?: number;
      realizedPnl?: number;
      totalPnl?: number;
      markPrice?: number;
    }>;
    fills?: Array<{
      side?: "BUY" | "SELL";
      fill_index?: number;
      fill_time?: string;
      fill_price?: number;
      fill_qty?: number;
      contract_multiplier?: number;
      fee?: number;
      tax?: number;
      slippage?: number;
    }>;
    cashAdjustments?: Array<{ amount?: unknown }>;
    longFinancingChargesTotal?: number;
    shortBorrowChargesTotal?: number;
  };
  drawings?: unknown[];
  equityCurve?: ReplayCurvePoint[];
  drawdownCurve?: ReplayCurvePoint[];
  finalEquity?: number;
  equityReturnRate?: number;
  chartIndicators?: Record<string, unknown>;
  noteSummary?: {
    chips?: Array<{
      label: string;
      value: string;
      tone?: "neutral" | "positive" | "warning" | "danger";
    }>;
  };
  baseTimeframe?: SupportedBaseTimeframe;
};

export const FREE_REPLAY_TARGET = 5000;
export const FAST_DECISION_TARGET = 1000;
export const RISK_DISCIPLINE_TARGET = 1000;
export const CHALLENGE_CONCURRENCY = 2;
export const MAX_ITEM_ATTEMPTS = 8;
export const SIMULATION_NOTE_PROBABILITY = 0.7;
export const DEFAULT_SYSTEM_DEV_SIMULATION_TOTAL_TARGET =
  FREE_REPLAY_TARGET + FAST_DECISION_TARGET + RISK_DISCIPLINE_TARGET;
export const FREE_REPLAY_SESSION_NAME_PREFIX = "SIM-FR";
export const FREE_REPLAY_NOTE_PREFIX =
  DEFAULT_SIMULATION_REPLAY_NOTE_TITLE_PREFIXES[0];
export const CHALLENGE_NOTE_PREFIX =
  DEFAULT_SIMULATION_REPLAY_NOTE_TITLE_PREFIXES[1];
export const CUSTOM_NOTE_PREFIX =
  DEFAULT_SIMULATION_REPLAY_NOTE_TITLE_PREFIXES[2];
export const DEV_SIMULATION_LEDGER_SOURCE_TAG: SpecialTrainingLedgerSourceTag =
  "SYSTEM_DEV_SIMULATION";
export const DEFAULT_INITIAL_CAPITAL = 100000;
export const SYSTEM_DEV_SIMULATION_META_KEY =
  "system_dev_simulation_last_job_v1";
export const SYSTEM_DEV_SIMULATION_INTERRUPTED_ERROR_CODE =
  "SYSTEM_DEV_SIMULATION_INTERRUPTED";

import {
  DISPLAY_PERIODS_BY_BASE,
  EPSILON,
  buildNarrative,
  clamp,
  nowIso,
  pickOne,
  randomFloat,
  randomInt,
  systemDevSimulationMathRandomAdapter,
} from "./simulationRandomUtilities.js";

export {
  EPSILON,
  FAST_DECISION_HORIZONS,
  FAST_DECISION_QUESTION_COUNTS,
  FAST_DECISION_SECONDS,
  FAST_DECISION_STRICTNESS,
  RISK_HORIZONS,
  RISK_QUESTION_COUNTS,
  SIMULATION_LOOKBACK_DAYS,
  buildNarrative,
  clamp,
  floorToStep,
  formatDateRange,
  normalizeUpperSymbols,
  nowIso,
  pickOne,
  randomCreatedAt,
  randomFloat,
  randomInt,
  resolveAnchorIndexFromDate,
  resolveBarsBaseTimeframe,
  resolveBarsToNextTradeDay,
  shiftIso,
  yieldToEventLoop,
} from "./simulationRandomUtilities.js";

export type SystemDevSimulationJobMessageTokenKey = keyof Pick<
  SystemDevSimulationCopy["jobMessages"],
  | "queued"
  | "preparing"
  | "resuming"
  | "freeReplayProgress"
  | "fastDecisionProgress"
  | "riskDisciplineProgress"
  | "completed"
  | "failed"
  | "interrupted"
>;

const SYSTEM_DEV_SIMULATION_JOB_MESSAGE_TOKEN_IDS: Record<
  SystemDevSimulationJobMessageTokenKey,
  string
> = {
  queued: "SYSTEM_DEV_SIMULATION_JOB_MESSAGE_QUEUED",
  preparing: "SYSTEM_DEV_SIMULATION_JOB_MESSAGE_PREPARING",
  resuming: "SYSTEM_DEV_SIMULATION_JOB_MESSAGE_RESUMING",
  freeReplayProgress: "SYSTEM_DEV_SIMULATION_JOB_MESSAGE_FREE_REPLAY_PROGRESS",
  fastDecisionProgress:
    "SYSTEM_DEV_SIMULATION_JOB_MESSAGE_FAST_DECISION_PROGRESS",
  riskDisciplineProgress:
    "SYSTEM_DEV_SIMULATION_JOB_MESSAGE_RISK_DISCIPLINE_PROGRESS",
  completed: "SYSTEM_DEV_SIMULATION_JOB_MESSAGE_COMPLETED",
  failed: "SYSTEM_DEV_SIMULATION_JOB_MESSAGE_FAILED",
  interrupted: "SYSTEM_DEV_SIMULATION_JOB_MESSAGE_INTERRUPTED",
};

const isLocalizedTokenPrimitive = (value: unknown): value is MessagePrimitive =>
  value == null ||
  value instanceof Date ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

const normalizeLocalizedTokenValues = (
  values: Record<string, unknown> | null | undefined,
): MessageValues | undefined => {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return undefined;
  }
  const normalizedEntries = Object.entries(values).filter(
    ([key, value]) => key.trim() && isLocalizedTokenPrimitive(value),
  );
  if (!normalizedEntries.length) {
    return undefined;
  }
  return Object.fromEntries(normalizedEntries) as MessageValues;
};

const toLocalizedMessageId = (id: string): MessageId => id as MessageId;

export const buildSystemDevSimulationJobMessageToken = (
  key: SystemDevSimulationJobMessageTokenKey,
  fallback: string,
  values?: Record<string, unknown> | null,
): LocalizedMessageToken => {
  const normalizedValues = normalizeLocalizedTokenValues(values);
  return {
    id: toLocalizedMessageId(SYSTEM_DEV_SIMULATION_JOB_MESSAGE_TOKEN_IDS[key]),
    fallback: String(fallback ?? "").trim(),
    ...(normalizedValues ? { values: normalizedValues } : {}),
  };
};

export const resolveSystemDevSimulationTotalTarget = (
  targets:
    | number
    | Pick<
        SystemDevSimulationProfileTargets,
        "freeReplayTarget" | "fastDecisionTarget" | "riskDisciplineTarget"
      >,
): number =>
  typeof targets === "number"
    ? Math.max(FREE_REPLAY_TARGET, Math.floor(Number(targets) || 0)) +
      FAST_DECISION_TARGET +
      RISK_DISCIPLINE_TARGET
    : Math.max(0, Math.floor(Number(targets.freeReplayTarget) || 0)) +
      Math.max(0, Math.floor(Number(targets.fastDecisionTarget) || 0)) +
      Math.max(0, Math.floor(Number(targets.riskDisciplineTarget) || 0));

export const resolveSystemDevSimulationTargetsForPools = (
  profileId: SystemDevSimulationProfileId,
  pools: readonly SystemDevSimulationEnabledPool[],
): SystemDevSimulationProfileTargets =>
  resolveSystemDevSimulationProfileTargets(
    profileId,
    countSystemDevSimulationEnabledPairs(pools),
  );

export type SpecialTrainingReplayNoteType = "CHALLENGE";

export type SimulationReplayNoteType = "FREE_REPLAY" | "CHALLENGE" | "CUSTOM";

export const SIMULATION_REPLAY_NOTE_TYPES: readonly SimulationReplayNoteType[] =
  ["FREE_REPLAY", "CHALLENGE", "CUSTOM"] as const;

export const resolveSpecialTrainingReplayNoteType = (
  _modeId: SpecialTrainingModeId,
): SpecialTrainingReplayNoteType => "CHALLENGE";

export const resolveSpecialTrainingReviewNotePrefix = (
  _modeId: SpecialTrainingModeId,
): string => CHALLENGE_NOTE_PREFIX;

export { buildTrainingSummaryFromReplay } from "./simulationTrainingSummary.js";

type SimulationDrawingPoint = {
  timestamp: number;
  value: number;
  dataIndex: number;
};

const normalizeDrawingTools = (
  drawingTools?: readonly string[],
  options: { fallbackToAll?: boolean } = {},
): ReplayVisibleDrawToolName[] => {
  const source =
    drawingTools === undefined
      ? options.fallbackToAll === false
        ? []
        : REPLAY_DRAW_TOOL_VISIBLE_NAMES
      : drawingTools;
  const seen = new Set<string>();
  const normalized: ReplayVisibleDrawToolName[] = [];
  for (const tool of source) {
    if (!isReplayVisibleDrawToolName(tool) || seen.has(tool)) {
      continue;
    }
    seen.add(tool);
    normalized.push(tool);
  }
  return normalized.length || options.fallbackToAll === false
    ? normalized
    : [...REPLAY_DRAW_TOOL_VISIBLE_NAMES];
};

const resolveDrawingBarIndex = (
  bars: OhlcvBar[],
  ratio: number,
  rng: SystemDevSimulationRandom,
): number => {
  const maxIndex = Math.max(0, bars.length - 1);
  const center = clamp(Math.round(maxIndex * ratio), 0, maxIndex);
  const jitter = Math.max(0, Math.floor(maxIndex * 0.04));
  return clamp(randomInt(center - jitter, center + jitter, rng), 0, maxIndex);
};

const resolveDrawingValue = (
  bar: OhlcvBar | undefined,
  fallback: number,
  offsetRatio = 0,
): number => {
  const close = Number(bar?.close);
  const high = Number(bar?.high);
  const low = Number(bar?.low);
  const base = Number.isFinite(close) && close > 0 ? close : fallback;
  const span =
    Number.isFinite(high) && Number.isFinite(low) && high > low
      ? high - low
      : Math.max(0.01, Math.abs(base) * 0.02);
  return Number((base + span * offsetRatio).toFixed(6));
};

const buildDrawingPoint = (
  bars: OhlcvBar[],
  index: number,
  value: number,
): SimulationDrawingPoint => {
  const safeIndex = clamp(index, 0, Math.max(0, bars.length - 1));
  const bar = bars[safeIndex] ?? bars[0];
  const parsed = Date.parse(String(bar?.ts ?? ""));
  return {
    timestamp: Number.isFinite(parsed)
      ? parsed
      : Date.UTC(2024, 0, 1, 9, 30, 0, 0) + safeIndex * 60_000,
    value,
    dataIndex: safeIndex,
  };
};

const buildDrawingPointsForTool = (
  toolName: ReplayVisibleDrawToolName,
  bars: OhlcvBar[],
  rng: SystemDevSimulationRandom,
): SimulationDrawingPoint[] => {
  const leftIndex = resolveDrawingBarIndex(bars, 0.2, rng);
  const midIndex = resolveDrawingBarIndex(bars, 0.5, rng);
  const rightIndex = resolveDrawingBarIndex(bars, 0.82, rng);
  const fallbackBar = bars[midIndex] ?? bars[0];
  const fallbackValue =
    Number(fallbackBar?.close) || Number(fallbackBar?.open) || 1;
  const leftValue = resolveDrawingValue(bars[leftIndex], fallbackValue, -0.5);
  const midValue = resolveDrawingValue(bars[midIndex], fallbackValue, 0.2);
  const rightValue = resolveDrawingValue(bars[rightIndex], fallbackValue, 0.65);
  const horizontalValue = resolveDrawingValue(
    bars[midIndex],
    fallbackValue,
    0.85,
  );
  const lowerHorizontalValue = resolveDrawingValue(
    bars[midIndex],
    fallbackValue,
    -0.75,
  );
  const point = (index: number, value: number) =>
    buildDrawingPoint(bars, index, value);

  switch (toolName) {
    case "horizontalStraightLine":
    case "horizontalRayLine":
    case "priceLine":
      return [point(midIndex, horizontalValue)];
    case "verticalStraightLine":
    case "simpleAnnotation":
      return [point(midIndex, midValue)];
    case "horizontalSegment":
      return [
        point(leftIndex, lowerHorizontalValue),
        point(rightIndex, lowerHorizontalValue),
      ];
    case "parallelStraightLine":
    case "priceChannelLine":
      return [
        point(leftIndex, leftValue),
        point(midIndex, midValue),
        point(rightIndex, rightValue),
      ];
    case "segment":
    case "rayLine":
    case "straightLine":
    case "fibonacciLine":
    default:
      return [point(leftIndex, leftValue), point(rightIndex, rightValue)];
  }
};

export const buildSimulationDrawings = (
  bars: OhlcvBar[],
  options: {
    rng?: SystemDevSimulationRandom;
    sourcePeriod?: DisplayPeriodKey;
    drawingTools?: readonly string[];
    maxDrawings?: number;
    allowEmpty?: boolean;
  } = {},
): unknown[] => {
  const rng = options.rng ?? systemDevSimulationMathRandomAdapter;
  if (!bars.length) {
    return [];
  }
  const hasExplicitTools = options.drawingTools !== undefined;
  const normalizedTools = normalizeDrawingTools(options.drawingTools, {
    fallbackToAll: !hasExplicitTools,
  });
  if (!normalizedTools.length) {
    return [];
  }
  const maxDrawings =
    options.maxDrawings === undefined
      ? hasExplicitTools
        ? normalizedTools.length
        : 3
      : Math.max(0, Math.floor(Number(options.maxDrawings) || 0));
  const cappedMaxDrawings = Math.min(4, maxDrawings, normalizedTools.length);
  if (cappedMaxDrawings <= 0 || (options.allowEmpty && rng.next() < 0.18)) {
    return [];
  }
  const selectedTools = hasExplicitTools
    ? normalizedTools.slice(0, cappedMaxDrawings)
    : rng
        .shuffle(normalizedTools)
        .slice(0, randomInt(1, cappedMaxDrawings, rng));
  return selectedTools.map((toolName, index) => {
    const points = buildDrawingPointsForTool(toolName, bars, rng);
    const minPointCount = REPLAY_DRAW_TOOL_MIN_POINT_COUNT_BY_NAME[toolName];
    const lastPoint = points[points.length - 1] ?? points[0];
    while (lastPoint && points.length < minPointCount) {
      points.push(lastPoint);
    }
    const hue = Math.round((index * 37 + rng.int(0, 24)) % 360);
    return {
      name: toolName,
      points,
      sourcePeriod: options.sourcePeriod,
      visible: index % 6 !== 4,
      lock: index % 5 === 3,
      zLevel: 10 + index,
      styles: {
        line: {
          color: `hsl(${hue}, 72%, 42%)`,
          size: index % 3 === 0 ? 2 : 1,
          style: index % 4 === 0 ? "dashed" : "solid",
        },
        text: {
          color: `hsl(${hue}, 72%, 34%)`,
          size: 12,
        },
      },
      extendData:
        toolName === "simpleAnnotation" ? { align: "center" } : undefined,
    };
  });
};

export const buildChartIndicators = (): Record<string, unknown> => ({
  signalTopIndicator: "MACD",
  signalTopIndicatorParams: [],
  signalBottomIndicator: "RSI",
  signalBottomIndicatorParams: [],
});

export const pickDisplayPeriod = (
  baseTimeframe: SupportedBaseTimeframe,
  rng: SystemDevSimulationRandom = systemDevSimulationMathRandomAdapter,
): DisplayPeriodKey => pickOne(DISPLAY_PERIODS_BY_BASE[baseTimeframe], rng);

export const randomSessionName = (
  titleTemplate: string,
  symbol: string,
  index: number,
  createdAt: string,
): string =>
  formatCopyTemplate(titleTemplate, [
    String(index + 1).padStart(4, "0"),
    symbol,
    createdAt.slice(0, 10),
  ]);

export const randomNoteTitle = (
  titleTemplate: string,
  symbol: string,
  index: number,
): string =>
  formatCopyTemplate(titleTemplate, [
    String(index + 1).padStart(4, "0"),
    symbol,
  ]);

export const shouldGenerateSimulationNote = (
  forceCoverage: boolean,
  rng: SystemDevSimulationRandom = systemDevSimulationMathRandomAdapter,
): boolean => forceCoverage || rng.next() < SIMULATION_NOTE_PROBABILITY;

export const resolveSessionPosition = (snapshot: {
  positions?: Array<{
    symbol?: string;
    qty?: number;
    avgCost?: number;
    markPrice?: number;
  }>;
  session: {
    symbol: string;
  };
}): { qty: number; avgCost: number; markPrice: number } | null => {
  const target = Array.isArray(snapshot.positions)
    ? (snapshot.positions.find(
        (item) =>
          String(item?.symbol || "")
            .trim()
            .toUpperCase() ===
          String(snapshot.session.symbol || "")
            .trim()
            .toUpperCase(),
      ) ?? null)
    : null;
  if (!target) {
    return null;
  }
  const qty = Number(target.qty);
  const avgCost = Number(target.avgCost);
  const markPrice = Number(target.markPrice);
  if (
    !Number.isFinite(qty) ||
    Math.abs(qty) <= EPSILON ||
    !Number.isFinite(avgCost) ||
    avgCost <= 0 ||
    !Number.isFinite(markPrice) ||
    markPrice <= 0
  ) {
    return null;
  }
  return { qty, avgCost, markPrice };
};

export const buildChallengeSummaryChips = (
  modeId: SpecialTrainingModeId,
  settlement: SpecialTrainingSettlementResult,
  copy: Pick<
    SystemDevSimulationCopy,
    "fastDecisionChoices" | "summaryLabels" | "units"
  >,
): Array<{
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "warning" | "danger";
}> => {
  const chips: Array<{
    label: string;
    value: string;
    tone?: "neutral" | "positive" | "warning" | "danger";
  }> = [];
  const pushChip = (
    label: string,
    value: string,
    tone?: "neutral" | "positive" | "warning" | "danger",
  ) => {
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      return;
    }
    chips.push({ label, value: normalizedValue, tone });
  };

  pushChip(
    copy.summaryLabels.maxDrawdown,
    `${(settlement.maxDrawdownRatio * 100).toFixed(2)}%`,
    "warning",
  );
  if (modeId === "fast-decision-training" && settlement.directionResult) {
    pushChip(
      copy.summaryLabels.decision,
      copy.fastDecisionChoices[settlement.directionResult.selection],
      settlement.directionResult.correct ? "positive" : "neutral",
    );
    pushChip(
      copy.summaryLabels.actual,
      copy.fastDecisionChoices[settlement.directionResult.actual],
      settlement.directionResult.correct ? "positive" : "danger",
    );
    pushChip(
      copy.summaryLabels.edgeRatio,
      settlement.directionResult.selectedMfeMaeRatio >= 999
        ? copy.summaryLabels.infinity
        : settlement.directionResult.selectedMfeMaeRatio.toFixed(2),
      settlement.directionResult.correct ? "positive" : "neutral",
    );
    pushChip(
      copy.summaryLabels.decisionTime,
      `${settlement.directionResult.decisionSecondsUsed.toFixed(0)}${copy.units.secondsShort}`,
    );
  } else {
    pushChip(
      copy.summaryLabels.totalAsset,
      settlement.finalTotalAsset.toFixed(2),
      settlement.totalPnl >= 0 ? "positive" : "danger",
    );
    pushChip(
      copy.summaryLabels.totalPnl,
      settlement.totalPnl.toFixed(2),
      settlement.totalPnl >= 0 ? "positive" : "danger",
    );
    if (settlement.recoveryRate !== null) {
      pushChip(
        copy.summaryLabels.recovery,
        `${(settlement.recoveryRate * 100).toFixed(2)}%`,
        settlement.recoveryRate >= 0 ? "positive" : "danger",
      );
    }
    if (settlement.alpha !== null) {
      pushChip(
        copy.summaryLabels.alpha,
        `${(settlement.alpha * 100).toFixed(2)}%`,
        settlement.alpha >= 0 ? "positive" : "danger",
      );
    }
    if (settlement.captureRate !== null) {
      pushChip(
        copy.summaryLabels.capture,
        `${(settlement.captureRate * 100).toFixed(2)}%`,
        settlement.captureRate >= 0 ? "positive" : "danger",
      );
    }
    if (settlement.grade) {
      pushChip(
        copy.summaryLabels.grade,
        settlement.grade,
        settlement.passed ? "positive" : "warning",
      );
    }
  }
  return chips.slice(0, 8);
};

const buildChallengeTradeFills = (
  questionBars: OhlcvBar[],
  tradeActions: SpecialTrainingTradeAction[],
  bindingId: string,
  sessionId: string,
  symbol: string,
) =>
  tradeActions.map((action, index) => {
    const rawIndex = clamp(
      Math.floor(Number(action.barIndex) || 0),
      0,
      Math.max(0, questionBars.length - 1),
    );
    const bar = questionBars[rawIndex] ?? questionBars[questionBars.length - 1];
    const price = Number(bar?.close) || Number(bar?.open) || 0;
    const fillTime = String(bar?.ts || nowIso());
    return {
      id: `${bindingId}-fill-${index}`,
      order_id: `${bindingId}-order-${index}`,
      session_id: sessionId,
      instrument_id: bindingId,
      symbol,
      side: action.type,
      fill_index: rawIndex,
      fill_time: fillTime,
      fill_price: price,
      fill_qty: 1,
      contract_multiplier: 1,
      fee: 0,
      tax: 0,
      slippage: 0,
      created_at: fillTime,
    };
  });

const buildChallengeEquityCurve = ({
  visibleBars,
  settlement,
  initialCapital,
  finalEquity,
  firstTs,
  lastTs,
}: {
  visibleBars: OhlcvBar[];
  settlement: SpecialTrainingSettlementResult;
  initialCapital: number;
  finalEquity: number;
  firstTs: string;
  lastTs: string;
}): Array<{ ts: string; value: number }> => {
  const curve = [
    { ts: firstTs, value: initialCapital },
    { ts: lastTs, value: finalEquity },
  ];
  const userCurve = settlement.riskReview?.equityCurves?.user;
  if (!Array.isArray(userCurve) || userCurve.length < 2) {
    return curve;
  }
  const sampledPoints = userCurve
    .map((point) => {
      const barIndex = clamp(
        Math.floor(Number(point.barIndex) || 0),
        0,
        Math.max(0, visibleBars.length - 1),
      );
      const ts = String(visibleBars[barIndex]?.ts || "");
      const value = Number(point.asset);
      if (!ts || !Number.isFinite(value)) {
        return null;
      }
      return { ts, value };
    })
    .filter((point): point is { ts: string; value: number } => point !== null)
    .filter((point) => point.ts !== firstTs && point.ts !== lastTs);
  return [...curve, ...sampledPoints].sort((left, right) =>
    left.ts.localeCompare(right.ts),
  );
};

export const buildChallengeReplay = (
  modeId: SpecialTrainingModeId,
  challengeId: string,
  question: {
    id: string;
    symbol: string;
    timeframe: string;
    bars: OhlcvBar[];
    startIndex: number;
    endIndex: number;
  },
  settlement: SpecialTrainingSettlementResult,
  tradeActions: SpecialTrainingTradeAction[],
  createdAt: string,
  summaryChips: Array<{
    label: string;
    value: string;
    tone?: "neutral" | "positive" | "warning" | "danger";
  }>,
  options: {
    rng?: SystemDevSimulationRandom;
    drawingTools?: readonly string[];
    maxDrawings?: number;
  } = {},
): ReplayArchive => {
  const safeCursorIndex =
    modeId === "fast-decision-training"
      ? clamp(
          Number(settlement.directionResult?.revealEndIndex) ||
            question.endIndex,
          0,
          Math.max(0, question.bars.length - 1),
        )
      : clamp(question.endIndex, 0, Math.max(0, question.bars.length - 1));
  const visibleBars = question.bars.slice(0, safeCursorIndex + 1);
  const bindingId = `special-training:${modeId}:${challengeId}`;
  const sessionId = `special-training:${question.id}`;
  const fills =
    modeId === "risk-discipline-training"
      ? buildChallengeTradeFills(
          visibleBars,
          tradeActions,
          bindingId,
          sessionId,
          question.symbol,
        )
      : [];
  const initialCapital = DEFAULT_INITIAL_CAPITAL;
  const finalEquity = Number.isFinite(Number(settlement.finalTotalAsset))
    ? Number(settlement.finalTotalAsset)
    : initialCapital;
  const lastTs = String(visibleBars[visibleBars.length - 1]?.ts || createdAt);
  const firstTs = String(visibleBars[0]?.ts || createdAt);
  return {
    bars: visibleBars,
    snapshot: {
      session: {
        id: sessionId,
        symbol: question.symbol,
        created_at: createdAt,
        entry_index: clamp(
          question.startIndex,
          0,
          Math.max(0, visibleBars.length - 1),
        ),
        cursor_index: Math.max(0, visibleBars.length - 1),
      },
      sessionTradingSettings: {
        initialSecuritiesBalance: initialCapital,
        contractMultiplier: 1,
        allowShortSelling: false,
      },
      positions: [],
      fills,
      longFinancingChargesTotal: 0,
      shortBorrowChargesTotal: 0,
    },
    drawings: buildSimulationDrawings(visibleBars, {
      rng: options.rng,
      sourcePeriod: question.timeframe as DisplayPeriodKey,
      drawingTools: options.drawingTools,
      maxDrawings: options.maxDrawings ?? 3,
      allowEmpty: true,
    }),
    equityCurve: buildChallengeEquityCurve({
      visibleBars,
      settlement,
      initialCapital,
      finalEquity,
      firstTs,
      lastTs,
    }),
    drawdownCurve: [
      { ts: firstTs, value: 0 },
      {
        ts: lastTs,
        value:
          initialCapital *
          Math.max(0, Number(settlement.maxDrawdownRatio) || 0),
      },
    ],
    finalEquity,
    equityReturnRate: (finalEquity - initialCapital) / initialCapital,
    chartIndicators: buildChartIndicators(),
    noteSummary: {
      chips: summaryChips,
    },
    baseTimeframe:
      question.timeframe === "1m" ||
      question.timeframe === "5m" ||
      question.timeframe === "1h" ||
      question.timeframe === "1d"
        ? question.timeframe
        : "1d",
  };
};

const textBlock = (
  blockKind: "PARAGRAPH" | "H2",
  text: string,
): ReplayNoteBlockV1 => ({
  blockKind,
  children: text
    ? [
        {
          inlineKind: "TEXT",
          text,
        },
      ]
    : [],
});

const textListBlock = (
  blockKind: "BULLET_LIST" | "ORDERED_LIST",
  items: string[],
): ReplayNoteBlockV1 => ({
  blockKind,
  items: items.map((text) =>
    text
      ? [
          {
            inlineKind: "TEXT",
            text,
          },
        ]
      : [],
  ),
});

export const buildChallengeNoteDocument = (
  modeId: SpecialTrainingModeId,
  symbol: string,
  settlement: SpecialTrainingSettlementResult,
  summaryChips: Array<{ label: string; value: string }>,
  copy: Pick<
    SystemDevSimulationCopy,
    "challengeNote" | "noteSeeds" | "narrativeSegments"
  >,
): ReplayNoteDocumentV1 => {
  const challengeTitle =
    modeId === "fast-decision-training"
      ? copy.challengeNote.fastDecisionTitle
      : copy.challengeNote.riskDisciplineTitle;
  const resultText = settlement.passed
    ? copy.challengeNote.passed
    : copy.challengeNote.failed;
  return {
    schemaVersion: 1,
    blocks: [
      textBlock("H2", challengeTitle),
      textListBlock("BULLET_LIST", [
        `${copy.challengeNote.symbol} ${symbol}`,
        `${copy.challengeNote.result} ${resultText}`,
      ]),
      textBlock("H2", copy.challengeNote.settlementSummary),
      textListBlock(
        "BULLET_LIST",
        summaryChips.map((chip) => `${chip.label} ${chip.value}`),
      ),
      textBlock("H2", copy.challengeNote.notes),
      textBlock(
        "PARAGRAPH",
        buildNarrative(
          copy.noteSeeds.challengeNote,
          copy.narrativeSegments,
          120,
        ),
      ),
    ],
  };
};

export const buildFastDecisionPayload = (
  decisionSecondsLimit: number,
  rng: SystemDevSimulationRandom = systemDevSimulationMathRandomAdapter,
  selectionOverride?: SpecialTrainingFastDecisionChoice,
): {
  selection: SpecialTrainingFastDecisionChoice;
  decisionSecondsUsed: number;
  timedOut?: boolean;
} => {
  const selection =
    selectionOverride ??
    pickOne<SpecialTrainingFastDecisionChoice>(
      ["LONG", "SHORT", "OBSERVE"],
      rng,
    );
  const timedOut = rng.next() < 0.12;
  return {
    selection: timedOut ? "OBSERVE" : selection,
    decisionSecondsUsed: timedOut
      ? decisionSecondsLimit
      : Number(
          randomFloat(1, Math.max(1, decisionSecondsLimit - 1), rng).toFixed(2),
        ),
    timedOut,
  };
};
