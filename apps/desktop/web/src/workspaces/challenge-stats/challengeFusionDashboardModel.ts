// SPDX-License-Identifier: GPL-3.0-only

import { formatMoney, formatMoneyFixed } from "@/ui/formatting/format";
import {
  getSpecialTrainingPageContent,
  type AppUiLanguage,
} from "@/ui/config/uiConfig";
import { formatCountWithUnitText } from "@/ui/formatting/i18nDisplay";
import type {
  ApiChallengeStatsProjectDetail,
  ApiTrainingStatsReport,
} from "@/api";
import type { HistoryReplayChartViewProps } from "@/domains/chart/HistoryReplayChart";
import { parseTimestampMs, shiftMarketDateKey, toMarketDateKey } from "@zinuto/shared/marketTime";

export type ChallengeSessionItem = ApiTrainingStatsReport["recentSessions"][number];
export type HistoryReplayProject = NonNullable<HistoryReplayChartViewProps["project"]>;
export type HistoryReplayData = NonNullable<HistoryReplayProject["replay"]>;
export type HistoryReplayExtremeLabels = {
  mfeLabel: string;
  maeLabel: string;
};
export type SessionWindowPreset = "RECENT_10" | "RECENT_50" | "ALL";
export type FastDirectionSelection = "LONG" | "SHORT" | "OBSERVE";
export type RiskBehaviorType = "CUT_LOSS" | "ADD_POSITION" | "FREEZE";
export type ReviewGrade = "S" | "A" | "F";
export type MetricTone = "accent" | "positive" | "warning" | "danger" | "neutral";
export type ResultTone = "positive" | "accent" | "danger" | "neutral";
export type SummaryChipTone =
  | "accent"
  | "buy"
  | "sell"
  | "positive"
  | "warning"
  | "danger"
  | "neutral";

export type MetricCardModel = {
  id: string;
  label: string;
  value: string;
  subtitle: string;
  tone: MetricTone;
  isPending?: boolean;
};

export type FastSessionMetric = {
  kind: "fast";
  id: string;
  session: ChallengeSessionItem;
  createdAtLabel: string;
  decisionSeconds: number;
  selection: FastDirectionSelection;
  actual: FastDirectionSelection;
  correct: boolean;
  timedOut: boolean;
  edgeRatio: number;
  opportunityEdgeRatio: number;
  performanceRate: number;
  reviewGrade: ReviewGrade;
  detail: ApiChallengeStatsProjectDetail | undefined;
};

export type RiskSessionMetric = {
  kind: "risk";
  id: string;
  session: ChallengeSessionItem;
  createdAtLabel: string;
  survived: boolean;
  comeback: boolean;
  alphaRatio: number | null;
  returnRate: number;
  firstActionBars: number;
  behavior: RiskBehaviorType;
  reviewGrade: ReviewGrade;
  curvePoints: Array<[number, number]>;
  detail: ApiChallengeStatsProjectDetail | undefined;
};

export type RiskCurveAxisSource = {
  curvePoints: Array<[number, number]>;
};

export type RiskCurveAxisExtents = {
  maxX: number;
  labelDigits: number;
};

export type SessionRowModel = FastSessionMetric | RiskSessionMetric;

export const SESSION_WINDOW_PRESETS: readonly SessionWindowPreset[] = [
  "RECENT_10",
  "RECENT_50",
  "ALL",
];
export const FAST_EDGE_S_THRESHOLD = 1.5;
export const FAST_DECISION_MAX_SECONDS = 20;
export const RISK_CURVE_MAX_SERIES = 10;

export const resolveFastBiasLabel = (
  content: ReturnType<typeof getSpecialTrainingPageContent>,
  directionalTotal: number,
  skew: number,
): string => {
  if (directionalTotal <= 0) {
    return content.challengeDashboardFastBiasBalancedLabel;
  }
  if (skew >= 0.45) {
    return content.challengeDashboardFastBiasSevereLongLabel;
  }
  if (skew >= 0.15) {
    return content.challengeDashboardFastBiasLongLabel;
  }
  if (skew <= -0.45) {
    return content.challengeDashboardFastBiasSevereShortLabel;
  }
  if (skew <= -0.15) {
    return content.challengeDashboardFastBiasShortLabel;
  }
  return content.challengeDashboardFastBiasBalancedLabel;
};

export const formatTemplate = (
  template: string,
  values: Array<string | number>,
): string =>
  String(template || "").replace(/\{(\d+)\}/g, (_token, indexText) => {
    const index = Number(indexText);
    const value = values[index];
    return value === undefined || value === null ? "" : String(value);
  });

export const clampNumber = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const toRecordOrNull = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const average = (values: number[]): number => {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (!filtered.length) {
    return 0;
  }
  return filtered.reduce((sum, current) => sum + current, 0) / filtered.length;
};

const resolveNiceAxisStep = (rawStep: number): number => {
  const normalized = Math.max(Number.EPSILON, Math.abs(rawStep));
  const exponent = Math.floor(Math.log10(normalized));
  const magnitude = 10 ** exponent;
  const fraction = normalized / magnitude;
  const niceFraction =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;

  return niceFraction * magnitude;
};

const resolveRiskCurveXAxisMax = (xValues: number[]): number => {
  const dataMaxX = xValues.reduce(
    (max, value) => (Number.isFinite(value) ? Math.max(max, value) : max),
    0,
  );
  if (dataMaxX <= 0) {
    return 1;
  }
  const step = resolveNiceAxisStep(dataMaxX / 4);
  return Math.max(dataMaxX, snapAxisValue(dataMaxX, step, "up"));
};

const resolveAxisLabelDigits = (step: number): number => {
  if (step < 0.1) {
    return 2;
  }
  if (step < 1) {
    return 1;
  }
  return 0;
};

export const resolveRiskCurveAxisExtents = (
  riskCurveSeries: ReadonlyArray<RiskCurveAxisSource>,
): RiskCurveAxisExtents => {
  const points = riskCurveSeries.flatMap((session) => session.curvePoints);
  const yValues = points
    .map((point) => Number(point[1]))
    .filter((value) => Number.isFinite(value));
  const xValues = points
    .map((point) => Math.max(0, Number(point[0])))
    .filter((value) => Number.isFinite(value));
  if (!yValues.length) {
    return {
      maxX: 1,
      labelDigits: 0,
    };
  }

  const dataMin = Math.min(...yValues);
  const dataMax = Math.max(...yValues);
  const span = Math.max(dataMax - dataMin, 0.1);
  const step = resolveNiceAxisStep(span / 5);
  return {
    maxX: resolveRiskCurveXAxisMax(xValues),
    labelDigits: resolveAxisLabelDigits(step),
  };
};

export const snapAxisValue = (value: number, step: number, direction: "up" | "down"): number => {
  if (!Number.isFinite(value) || step <= 0) {
    return value;
  }
  const scaled =
    direction === "up" ? Math.ceil(value / step) : Math.floor(value / step);
  return scaled * step;
};

export const formatPercentText = (
  value: number,
  digits = 0,
  percentSymbol = "%",
): string =>
  `${formatMoney(Math.max(0, value) * 100, digits)}${percentSymbol}`;

export const formatSignedPercentText = (
  value: number,
  digits = 1,
  percentSymbol = "%",
): string => {
  const safe = Number.isFinite(value) ? value : 0;
  const sign = safe > 0 ? "+" : safe < 0 ? "-" : "";
  return `${sign}${formatMoney(Math.abs(safe) * 100, digits)}${percentSymbol}`;
};

export const formatSecondsText = (
  language: AppUiLanguage,
  value: number,
  secondUnitLabel: string,
): string =>
  formatCountWithUnitText(
    language,
    formatMoney(Math.max(0, value), 1),
    secondUnitLabel,
  );

export const formatBarsValue = (value: number): string =>
  formatMoney(Math.max(0, value), value >= 10 ? 0 : 1);

export const formatEdgeRatioText = (
  value: number,
  multiplierSuffix = "x",
  infinityValue = "∞",
): string => {
  if (!Number.isFinite(value) || value >= 999) {
    return infinityValue;
  }
  return `${formatMoney(Math.max(0, value), 2)}${multiplierSuffix}`;
};

export const parseDateFromSession = (session: ChallengeSessionItem): string =>
  toMarketDateKey(session.createdAt || "") || "";

export const parseSessionTimestamp = (session: ChallengeSessionItem): number => {
  const created = parseTimestampMs((session.createdAt || "").trim());
  return Number.isFinite(created) ? created : 0;
};

export const sortSessionsByRecent = (
  sessions: readonly ChallengeSessionItem[],
): ChallengeSessionItem[] =>
  [...sessions].sort((left, right) => {
    const leftTs = parseSessionTimestamp(left);
    const rightTs = parseSessionTimestamp(right);
    if (rightTs !== leftTs) {
      return rightTs - leftTs;
    }
    return right.id.localeCompare(left.id, "en");
  });

export const resolveRangeSessions = (
  sessions: readonly ChallengeSessionItem[],
  preset: SessionWindowPreset,
): ChallengeSessionItem[] => {
  if (preset === "RECENT_10") {
    return sessions.slice(0, 10);
  }
  if (preset === "RECENT_50") {
    return sessions.slice(0, 50);
  }
  return [...sessions];
};

export const formatBattleTimestampLabel = (
  session: ChallengeSessionItem,
  content: ReturnType<typeof getSpecialTrainingPageContent>,
  emptyPlaceholder = "--",
): string => {
  const timestamp = parseSessionTimestamp(session);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return parseDateFromSession(session) || emptyPlaceholder;
  }
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const timeText = `${hours}:${minutes}`;
  const todayKey = toMarketDateKey(Date.now());
  const sessionKey = toMarketDateKey(timestamp);
  if (todayKey && sessionKey && sessionKey === todayKey) {
    return `${content.challengeBattleTimeTodayLabel} ${timeText}`;
  }
  if (todayKey && sessionKey && sessionKey === shiftMarketDateKey(todayKey, -1)) {
    return `${content.challengeBattleTimeYesterdayLabel} ${timeText}`;
  }
  const dateText = sessionKey || parseDateFromSession(session) || emptyPlaceholder;
  return `${dateText} ${timeText}`;
};

const formatExtremeReplayTagText = (
  label: string,
  sign: "+" | "-",
  ratio: unknown,
): string => {
  const normalizedLabel = String(label ?? "").trim();
  const normalizedRatio = Math.max(0, toFiniteNumber(ratio, 0));
  return `${normalizedLabel} ${sign}${formatMoneyFixed(
    normalizedRatio * 100,
    2,
  )}%`.trim();
};

export const resolveHistoryReplayProject = (
  session: ChallengeSessionItem,
  detail: ApiChallengeStatsProjectDetail | undefined,
  labels: HistoryReplayExtremeLabels,
): HistoryReplayChartViewProps["project"] => {
  if (!detail || !detail.replay || typeof detail.replay !== "object") {
    return null;
  }
  const replay = detail.replay as HistoryReplayData;
  const replayRecord = toRecordOrNull(replay);
  const specialTraining = toRecordOrNull(replayRecord?.specialTraining);
  const fastDecisionExtremeRay = toRecordOrNull(
    specialTraining?.fastDecisionExtremeRay,
  );
  const relabeledReplay =
    specialTraining && fastDecisionExtremeRay
      ? ({
          ...replayRecord,
          specialTraining: {
            ...specialTraining,
            fastDecisionExtremeRay: {
              ...fastDecisionExtremeRay,
              profitTagText: formatExtremeReplayTagText(
                labels.mfeLabel,
                "+",
                fastDecisionExtremeRay.profitRatio,
              ),
              drawdownTagText: formatExtremeReplayTagText(
                labels.maeLabel,
                "-",
                fastDecisionExtremeRay.drawdownRatio,
              ),
            },
          },
        } as HistoryReplayData)
      : replay;
  return {
    id: session.id,
    symbol: session.symbol,
    replay: relabeledReplay,
  };
};
