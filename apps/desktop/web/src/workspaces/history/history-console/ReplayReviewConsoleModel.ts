// SPDX-License-Identifier: GPL-3.0-only

import type { ArchivedReplayData } from "@/domains/history/replayArchiveTypes";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type {
  ApiTrainingReviewDiagnosticsPayload,
  ApiTrainingReviewReportPayload,
} from "@/api";
import { formatNumber } from "@zinuto/shared/i18n";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import {
  getGlobalTypographyFontFamily,
} from "@/frontend-kernel/typography";
import type {
  HistoryProjectLike,
  LoadMoreHistoryProjects,
} from "@/domains/history/historyTypes";
import type {
  HistoryReplayChartBindings,
  HistoryReplayChartViewProps,
} from "@/domains/chart/HistoryReplayChart";
import type { PriceColorMode } from "@/domains/chart/display";
import type { TradeColorThemeToken } from "@/ui/theme/visualColors";
import type {
  ReplayReviewSessionMetric,
  ReplayReviewWindow,
} from "@/workspaces/history/history-console/types";

export type ReplayReviewConsoleHistoryDeps = {
  samplePoolAllId: string;
  trainingProjects: Array<HistoryProjectLike & { replay?: unknown }>;
  historyProjectsNextCursor: string | null;
  isHistoryProjectsLoading: boolean;
  isHistoryProjectsLoadingMore: boolean;
  loadMoreTrainingProjects: LoadMoreHistoryProjects;
  editingProjectId: string;
  editingProjectName: string;
  startRenameTrainingProject: (project: HistoryProjectLike) => void;
  saveRenameTrainingProject: () => void;
  cancelRenameTrainingProject: () => void;
  setEditingProjectName: (value: string) => void;
  deleteTrainingProject: (projectId: string) => void;
  deleteTrainingProjects: (projectIds: string[]) => void;
  clearAllTrainingProjects: () => void;
  effectiveThemeMode: "light" | "dark";
  showGlobalDecimals: boolean;
  priceColorMode: PriceColorMode;
  tradeColorTheme: TradeColorThemeToken;
  trainerDisplayPeriod: DisplayPeriodKey;
  trainerPeriodOptionsByBase: HistoryReplayChartViewProps["trainerPeriodOptionsByBase"];
  historyReplayChartBindings: HistoryReplayChartBindings;
  chartRenderMode: NonNullable<HistoryReplayChartViewProps["chartRenderMode"]>;
  setChartRenderMode: NonNullable<
    HistoryReplayChartViewProps["onChartRenderModeChange"]
  >;
  showChartSettingsModal: boolean;
  openChartSettingsModal: () => void;
  setTrainerDisplayPeriod: (period: DisplayPeriodKey) => void;
  createSystemMarkers: HistoryReplayChartViewProps["createSystemMarkers"];
  createHistoryReviewReplayNote: (payload: {
    trainingProjectId: string;
    contextReplay: ArchivedReplayData;
    contextDisplayPeriod?: DisplayPeriodKey;
  }) => void;
  formatMoney: (value: number, digits?: number) => string;
  formatRatio: (value: number) => string;
  withCountUnit: (value: string, unit: string) => string;
};

export type ReplayReviewConsolePageProps = {
  history: ReplayReviewConsoleHistoryDeps;
  isActive?: boolean;
  ui: UiLabelEntry;
  language: AppUiLanguage;
  onError?: (message: string) => void;
};

export type ReviewConsolePageTab = "OVERVIEW" | "BEHAVIOR" | "ARCHIVE";
export type ToneKind = "up" | "down" | "flat";
export type ReviewWindowSlice = {
  currentSessionsDesc: ReplayReviewSessionMetric[];
  previousSessionsDesc: ReplayReviewSessionMetric[];
  canCompare: boolean;
};

export type KpiCardViewModel = {
  key: string;
  label: string;
  labelTooltip?: string;
  value: string;
  tone: ToneKind;
  deltaText: string;
};

export type ReviewHeroMetrics = ApiTrainingReviewReportPayload["heroMetrics"];
export type ReviewDiagnosticsPayload = ApiTrainingReviewDiagnosticsPayload;
export type ReviewEnvironmentMatrixRow =
  ReviewDiagnosticsPayload["environmentMatrix"][number];
export type ReviewArchiveFinancialDetail =
  ReviewDiagnosticsPayload["archiveFinancialDetailsById"][string];
export type ReviewCapitalDisciplinePayload = ReviewDiagnosticsPayload["capitalDiscipline"];
export type ReviewContext = ReviewEnvironmentMatrixRow["context"];

export const REPLAY_REVIEW_DAY_MS = 24 * 60 * 60 * 1000;
export const DIAGNOSTIC_MONO_FONT_FAMILY = (): string =>
  getGlobalTypographyFontFamily("mono");
export const EMPTY_REVIEW_VALUE = "--";

export const resolveReplayReviewTimeWindowRangeMs = (
  window: ReplayReviewWindow,
): number | null => {
  if (window === "LAST_7D") {
    return 7 * REPLAY_REVIEW_DAY_MS;
  }
  if (window === "LAST_30D") {
    return 30 * REPLAY_REVIEW_DAY_MS;
  }
  return null;
};

export const resolveStableReplayReviewWindowAnchorMs = (nowMs = Date.now()): number => {
  const dayBucket = Math.floor(Math.max(0, nowMs) / REPLAY_REVIEW_DAY_MS);
  return dayBucket * REPLAY_REVIEW_DAY_MS + REPLAY_REVIEW_DAY_MS - 1;
};

export const normalizeNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const average = (values: number[]): number | null => {
  if (!values.length) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

export const resolvePnlTone = (value: number): ToneKind => {
  if (value > 1e-9) {
    return "up";
  }
  if (value < -1e-9) {
    return "down";
  }
  return "flat";
};

export const sortSessionsAscending = (
  sessions: ReplayReviewSessionMetric[],
): ReplayReviewSessionMetric[] =>
  [...sessions].sort(
    (left, right) => left.projectTs - right.projectTs || left.id.localeCompare(right.id),
  );

export const formatCompactDateTime = (value: string): string => {
  const raw = String(value || "").trim();
  if (!raw) {
    return EMPTY_REVIEW_VALUE;
  }
  if (raw.length >= 16 && raw.includes("T")) {
    return `${raw.slice(5, 10)} ${raw.slice(11, 16)}`;
  }
  if (raw.length >= 16) {
    return raw.slice(0, 16);
  }
  if (raw.length >= 10) {
    return raw.slice(0, 10);
  }
  return raw;
};

export const formatTooltipDateTime = (value: string): string => {
  const raw = String(value || "").trim();
  if (!raw) {
    return EMPTY_REVIEW_VALUE;
  }
  if (raw.length >= 16 && raw.includes("T")) {
    return `${raw.slice(0, 10)} ${raw.slice(11, 16)}`;
  }
  if (raw.length >= 16) {
    return raw.slice(0, 16);
  }
  return raw;
};

export const formatSignedMoney = (
  value: number,
  formatMoney: ReplayReviewConsoleHistoryDeps["formatMoney"],
): string => {
  const normalized = normalizeNumber(value);
  if (normalized > 0) {
    return `+${formatMoney(normalized)}`;
  }
  if (normalized < 0) {
    return `-${formatMoney(Math.abs(normalized))}`;
  }
  return formatMoney(0);
};

export const formatSignedRatio = (
  value: number,
  formatRatio: ReplayReviewConsoleHistoryDeps["formatRatio"],
): string => {
  const normalized = normalizeNumber(value);
  if (normalized > 0) {
    return `+${formatRatio(normalized)}`;
  }
  if (normalized < 0) {
    return `-${formatRatio(Math.abs(normalized))}`;
  }
  return formatRatio(0);
};

export const formatDiagnosticNumber = (
  language: AppUiLanguage,
  value: number,
  digits = 0,
): string =>
  formatNumber(language, Math.max(0, normalizeNumber(value)), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export const formatSignedDiagnosticNumber = (
  language: AppUiLanguage,
  value: number,
  digits = 0,
): string => {
  const normalized = normalizeNumber(value);
  const rendered = formatNumber(language, Math.abs(normalized), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (normalized > 0) {
    return `+${rendered}`;
  }
  if (normalized < 0) {
    return `-${rendered}`;
  }
  return rendered;
};

export const withAlpha = (color: string, alpha: number): string => {
  const normalizedAlpha = clamp(alpha, 0, 1);
  const rgbMatch = color.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)/i,
  );
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
  }
  const hexMatch = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (!hexMatch) {
    return color;
  }
  const normalizedHex =
    hexMatch[1].length === 3
      ? hexMatch[1]
          .split("")
          .map((token) => `${token}${token}`)
          .join("")
      : hexMatch[1];
  const r = Number.parseInt(normalizedHex.slice(0, 2), 16);
  const g = Number.parseInt(normalizedHex.slice(2, 4), 16);
  const b = Number.parseInt(normalizedHex.slice(4, 6), 16);
  if (![r, g, b].every((value) => Number.isFinite(value))) {
    return color;
  }
  return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
};
