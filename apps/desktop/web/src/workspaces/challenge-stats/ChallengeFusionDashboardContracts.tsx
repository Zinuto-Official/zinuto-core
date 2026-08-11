// SPDX-License-Identifier: GPL-3.0-only

import type { Dispatch, SetStateAction } from "react";
import { useI18n } from "@/frontend-kernel/i18n";
import type {
  AppUiLanguage,
  SpecialTrainingModeId,
} from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import type {
  ApiChallengeStatsProjectDetail,
  ApiTrainingStatsReport,
  DesktopSecondaryWindowActionPayload,
  DesktopSecondaryWindowStatePayload,
  OpenDesktopSecondaryWindowInput,
} from "@/api";
import type { StatsFilterState } from "@/workspaces/challenge-stats/statsFilters";
import type {
  HistoryReplayChartBindings,
  HistoryReplayChartViewProps,
} from "@/domains/chart/HistoryReplayChart";
import type { ReplayContextMetricTone } from "@/frontend-kernel/replayContext";
import { resolveChallengeStatsModeIdByTag } from "@/workspaces/challenge-stats/challengeStatsModeRegistry";
import type { ChallengeStatsReadModelFacts } from "@/workspaces/challenge-stats/challengeStatsReadModelFacts";
import type {
  FastDirectionSelection,
  MetricCardModel,
  RiskBehaviorType,
} from "@/workspaces/challenge-stats/challengeFusionDashboardModel";

export type ChallengeFusionDashboardChartBindings = {
  themeMode: HistoryReplayChartViewProps["themeMode"];
  showGlobalDecimals: NonNullable<HistoryReplayChartViewProps["showGlobalDecimals"]>;
  priceColorMode: HistoryReplayChartViewProps["priceColorMode"];
  tradeColorTheme: NonNullable<HistoryReplayChartViewProps["tradeColorTheme"]>;
  trainerDisplayPeriod: NonNullable<HistoryReplayChartViewProps["displayPeriod"]>;
  trainerPeriodOptionsByBase: HistoryReplayChartViewProps["trainerPeriodOptionsByBase"];
  historyReplayChartBindings: HistoryReplayChartBindings;
  chartRenderMode: NonNullable<HistoryReplayChartViewProps["chartRenderMode"]>;
  setChartRenderMode: NonNullable<
    HistoryReplayChartViewProps["onChartRenderModeChange"]
  >;
  showChartSettingsModal: boolean;
  openChartSettingsModal: () => void;
  setTrainerDisplayPeriod: (
    period: NonNullable<HistoryReplayChartViewProps["displayPeriod"]>,
  ) => void;
  createSystemMarkers: HistoryReplayChartViewProps["createSystemMarkers"];
};

export type ChallengeFusionDashboardSecondaryWindows = {
  open: (
    input: OpenDesktopSecondaryWindowInput,
  ) => Promise<DesktopSecondaryWindowStatePayload>;
  publish: (
    input: OpenDesktopSecondaryWindowInput,
  ) => Promise<DesktopSecondaryWindowStatePayload>;
  subscribeActions: (
    handler: (message: DesktopSecondaryWindowActionPayload) => void,
  ) => () => void;
};

export type ChallengeModeMeta = {
  id: SpecialTrainingModeId;
  title: string;
  summary: string;
};
export type ChallengeFusionDashboardProps = {
  isActive?: boolean;
  language: AppUiLanguage;
  ui: UiLabelEntry;
  report: ApiTrainingStatsReport | null;
  readModelFacts?: ChallengeStatsReadModelFacts | null;
  isLoading: boolean;
  filters: StatsFilterState;
  setFilters: Dispatch<SetStateAction<StatsFilterState>>;
  setPendingFilters: Dispatch<SetStateAction<StatsFilterState>>;
  challengeModes: ChallengeModeMeta[];
  activeChallengeModeId: SpecialTrainingModeId | null;
  onSelectChallengeMode: (modeId: SpecialTrainingModeId) => void;
  onRefresh: () => void;
  onClearHistory: (
    modeId?: SpecialTrainingModeId,
  ) => Promise<{
    deletedSessionRows: number;
    deletedQuestionRows: number;
  }>;
  isClearingHistory?: boolean;
  resolvedFilterSamplePools: Array<{ id: string; name: string; count: number }>;
  prefetchedChallengeDetailsById?: Record<string, ApiChallengeStatsProjectDetail>;
  onLoadChallengeDetail?: (
    sessionId: string,
  ) => Promise<ApiChallengeStatsProjectDetail | null>;
  chartBindings: ChallengeFusionDashboardChartBindings | null;
  desktopSecondaryWindows: ChallengeFusionDashboardSecondaryWindows;
  onError?: (message: string) => void;
};

type MetricCardProps = {
  item: MetricCardModel;
};

export const GRADE_LABELS = {
  S: "S",
  A: "A",
  F: "F",
} as const;

export const resolveReportChallengeModeId = (
  report: ApiTrainingStatsReport | null,
): SpecialTrainingModeId | null => {
  if (!report) {
    return null;
  }
  const rawModeId =
    "modeId" in report ? String(report.modeId || "").trim() : "";
  if (
    rawModeId === "fast-decision-training" ||
    rawModeId === "risk-discipline-training"
  ) {
    return rawModeId;
  }
  return resolveChallengeStatsModeIdByTag(report.filtersApplied.tag);
};

export const formatSampleProgress = (count: number, minimum: number): string => {
  const normalizedMinimum = Math.max(1, Math.floor(Number(minimum) || 1));
  return `${Math.max(0, Math.min(count, normalizedMinimum))}/${normalizedMinimum}`;
};

export const resolveChallengeReplayPriceTone = (
  value: number | null | undefined,
): ReplayContextMetricTone => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) {
    return "flat";
  }
  return numeric > 0 ? "up" : "down";
};

export const resolveChallengeReplaySelectionTone = (
  selection: FastDirectionSelection,
): ReplayContextMetricTone =>
  selection === "LONG" ? "buy" : selection === "SHORT" ? "sell" : "flat";

export const resolveChallengeReplayBehaviorTone = (
  behavior: RiskBehaviorType,
): ReplayContextMetricTone =>
  behavior === "ADD_POSITION"
    ? "buy"
    : behavior === "CUT_LOSS"
      ? "sell"
      : "flat";

export const ChallengeMetricCard = ({ item }: MetricCardProps) => {
  const { t } = useI18n();
  const emptyPlaceholder = t("common.placeholder.none");
  const isPending = item.isPending || item.value === emptyPlaceholder;
  return (
    <article
      className={`challenge-fusion-metric-card is-${item.tone}${
        isPending ? " is-pending" : ""
      }`}
    >
      <span
        className="challenge-fusion-metric-card-label"
        data-i18n-slot="metricLabel"
        data-i18n-critical="true"
      >
        {item.label}
      </span>
      <strong
        className={`challenge-fusion-metric-card-value${
          isPending ? " is-placeholder" : ""
        }`}
        data-i18n-slot="metricValue"
        data-i18n-critical="true"
      >
        {item.value}
      </strong>
      {item.subtitle ? (
        <span
          className="challenge-fusion-metric-card-subtitle"
          data-i18n-slot="metricSubtitle"
        >
          {item.subtitle}
        </span>
      ) : null}
    </article>
  );
};
