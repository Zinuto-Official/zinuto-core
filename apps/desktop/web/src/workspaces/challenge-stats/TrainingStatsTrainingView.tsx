// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  useMemo,
  useState,
} from "react";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import {
  type ApiTrainingStatsReport,
  type ApiTrainingStatsComparisonMetrics,
} from "@/api";
import {
  formatMoney,
  formatSignedMoney,
} from "@/ui/formatting/format";
import {
  type AppUiLanguage,
} from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import {
  type StatsFilterState,
} from "@/workspaces/challenge-stats/statsFilters";
import {
  buildReportCsv,
  buildSingleSessionCsv,
  downloadCsv,
  exportReportPdf,
} from "@/workspaces/challenge-stats/statsExporters";
import {
  ChallengeFusionDashboard,
  type ChallengeFusionDashboardChartBindings,
} from "@/workspaces/challenge-stats/ChallengeFusionDashboard";
import { toMarketDateKey } from "@zinuto/shared/marketTime";
import {
  useTrainingStatsPageController,
  type TrainingStatsPageViewMode,
} from "@/workspaces/challenge-stats/useTrainingStatsPageController";
import {
  WorkspaceFrameShell,
  WorkspacePageShell,
} from "@/ui/components";
import { useI18n } from "@/frontend-kernel/i18n";
import {
  toDayCountDisplay,
  toDurationText,
  toPercentDisplay,
  toSignedDurationText,
  toSignedNumericText,
  toSignedPercentDisplay,
} from "@/workspaces/challenge-stats/trainingStatsFormatting";
import { TrainingStatsTrainingReportView } from "@/workspaces/challenge-stats/TrainingStatsTrainingReportView";

export type TrainingStatsPageProps = {
  isActive?: boolean;
  language: AppUiLanguage;
  ui: UiLabelEntry;
  tt: (key: AppTextKey) => string;
  viewMode?: TrainingStatsPageViewMode;
  resolveSamplePoolName?: (
    samplePoolId: string,
    fallbackName?: string,
  ) => string;
  challengeInitialProfitability?: StatsFilterState["profitability"];
  challengeChartBindings?: ChallengeFusionDashboardChartBindings | null;
  onError?: (message: string) => void;
};

const TrainingStatsPage = ({
  isActive = true,
  language: _language,
  ui,
  viewMode = "training",
  resolveSamplePoolName,
  challengeInitialProfitability = "ALL",
  challengeChartBindings = null,
  onError,
}: TrainingStatsPageProps) => {
  const { t: translate } = useI18n();
  const emptyPlaceholder = translate("common.placeholder.none");
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const renderCountSuffix = (count: number) =>
    translate("stats.filters.countInParenthesis", { count });

  const sessionOptionSeparator = ` ${translate("common.symbol.middleDot")} `;
  const renderOptionLabelWithCount = useCallback(
    (label: string, count: number) => `${label}${label ? " " : ""}${renderCountSuffix(count)}`,
    [renderCountSuffix],
  );

  const isChallengeView = viewMode === "challenge";
  const isTrainingView = viewMode === "training";
  const {
    pendingFilters,
    setPendingFilters,
    filters,
    setFilters,
    report,
    challengeDetailsById,
    challengeStatsReadModelFacts,
    isLoading,
    isClearingChallengeHistory,
    selectedSessionId,
    setSelectedSessionId,
    fetchReport,
    clearChallengeHistory,
    applyFilters,
    resetFilters,
    applyQuickRange,
    loadTrainingProjectDetail,
    loadChallengeProjectDetail,
    desktopSecondaryWindows,
    challengeModes,
    activeChallengeModeId,
    handleSelectChallengeMode,
    resolvePoolDisplayName,
    resolvedFilterSamplePools,
    normalizedPendingSamplePoolId,
    normalizedPendingComparePoolA,
    normalizedPendingComparePoolB,
  } = useTrainingStatsPageController({
    isActive,
    language: _language,
    ui,
    viewMode,
    challengeInitialProfitability,
    resolveSamplePoolName,
    onError,
  });

  const comparisonCards = useMemo(() => {
    if (!report || !isTrainingView) {
      return [];
    }
    return [
      {
        key: "recent",
        title: ui.statsRecent20VsPrev20,
        data: report.comparisons.recent20VsPrevious20,
      },
      {
        key: "month",
        title: ui.statsCurrentMonthVsPrevMonth,
        data: report.comparisons.monthVsPreviousMonth,
      },
      {
        key: "pool",
        title: ui.statsPoolCompare,
        data: report.comparisons.poolAVsPoolB,
      },
      {
        key: "timeframe",
        title: ui.statsTimeframeCompare,
        data: report.comparisons.dayVsMinute,
      },
    ];
  }, [
    isTrainingView,
    report,
    ui.statsCurrentMonthVsPrevMonth,
    ui.statsPoolCompare,
    ui.statsRecent20VsPrev20,
    ui.statsTimeframeCompare,
  ]);

  const updatePendingFilter = useCallback(
    <K extends keyof StatsFilterState>(key: K, value: StatsFilterState[K]) => {
      setPendingFilters((current) => ({
        ...current,
        [key]: value,
      }));
    },
    [setPendingFilters],
  );

  const comparisonMetrics = useMemo(
    () => [
      {
        key: "returnRate",
        label: ui.metricTotalReturnRate,
        valueOf: (item: ApiTrainingStatsComparisonMetrics) =>
          toPercentDisplay(item.returnRate),
        deltaOf: (
          item: Omit<ApiTrainingStatsComparisonMetrics, "sessionCount">,
        ) => toSignedPercentDisplay(item.returnRate),
        deltaTone: (
          item: Omit<ApiTrainingStatsComparisonMetrics, "sessionCount">,
        ) =>
          item.returnRate > 0
            ? "is-positive"
            : item.returnRate < 0
              ? "is-negative"
              : "is-neutral",
      },
      {
        key: "winRate",
        label: ui.metricWinRate,
        valueOf: (item: ApiTrainingStatsComparisonMetrics) =>
          toPercentDisplay(item.winRate),
        deltaOf: (
          item: Omit<ApiTrainingStatsComparisonMetrics, "sessionCount">,
        ) => toSignedPercentDisplay(item.winRate),
        deltaTone: (
          item: Omit<ApiTrainingStatsComparisonMetrics, "sessionCount">,
        ) =>
          item.winRate > 0
            ? "is-positive"
            : item.winRate < 0
              ? "is-negative"
              : "is-neutral",
      },
      {
        key: "profitLossRatio",
        label: ui.metricProfitLossRatio,
        valueOf: (item: ApiTrainingStatsComparisonMetrics) =>
          formatMoney(item.profitLossRatio, 2),
        deltaOf: (
          item: Omit<ApiTrainingStatsComparisonMetrics, "sessionCount">,
        ) => toSignedNumericText(item.profitLossRatio, 2),
        deltaTone: (
          item: Omit<ApiTrainingStatsComparisonMetrics, "sessionCount">,
        ) =>
          item.profitLossRatio > 0
            ? "is-positive"
            : item.profitLossRatio < 0
              ? "is-negative"
              : "is-neutral",
      },
      {
        key: "maxDrawdownRate",
        label: ui.metricMaxDrawdown,
        valueOf: (item: ApiTrainingStatsComparisonMetrics) =>
          toPercentDisplay(item.maxDrawdownRate),
        deltaOf: (
          item: Omit<ApiTrainingStatsComparisonMetrics, "sessionCount">,
        ) => toSignedPercentDisplay(item.maxDrawdownRate),
        deltaTone: (
          item: Omit<ApiTrainingStatsComparisonMetrics, "sessionCount">,
        ) =>
          item.maxDrawdownRate < 0
            ? "is-positive"
            : item.maxDrawdownRate > 0
              ? "is-negative"
              : "is-neutral",
      },
      {
        key: "avgHoldBars",
        label: ui.metricAvgHold,
        valueOf: (item: ApiTrainingStatsComparisonMetrics) =>
          toDurationText(item.avgHoldBars, ui),
        deltaOf: (
          item: Omit<ApiTrainingStatsComparisonMetrics, "sessionCount">,
        ) => toSignedDurationText(item.avgHoldBars, ui),
        deltaTone: () => "is-neutral",
      },
      {
        key: "tradeFrequency",
        label: ui.statsTradeFrequency,
        valueOf: (item: ApiTrainingStatsComparisonMetrics) =>
          formatMoney(item.tradeFrequency, 2),
        deltaOf: (
          item: Omit<ApiTrainingStatsComparisonMetrics, "sessionCount">,
        ) => toSignedNumericText(item.tradeFrequency, 2),
        deltaTone: () => "is-neutral",
      },
    ],
    [
      ui.metricTotalReturnRate,
      ui.metricWinRate,
      ui.metricProfitLossRatio,
      ui.metricMaxDrawdown,
      ui.metricAvgHold,
      ui.statsTradeFrequency,
      ui,
    ],
  );

  const monthlyTrendCards = useMemo(() => {
    if (!report || !isTrainingView || !Array.isArray(report.monthlyPerformance)) {
      return [];
    }
    const source = report.monthlyPerformance.slice(-18);
    return source.map((item, index) => {
      const prev = source[index - 1] ?? null;
      const delta = prev ? item.totalReturnRate - prev.totalReturnRate : 0;
      const trend: "up" | "down" | "flat" =
        delta > 0 ? "up" : delta < 0 ? "down" : "flat";
      const tone: "profit" | "loss" | "flat" =
        item.totalPnl > 0 ? "profit" : item.totalPnl < 0 ? "loss" : "flat";
      return {
        ...item,
        trend,
        tone,
        delta,
      };
    });
  }, [isTrainingView, report]);

  const monthlyWinRateRows = useMemo(
    () =>
      isTrainingView
        ? (report?.winRateBreakdown?.monthlyWinRate ?? []).slice(-8).reverse()
        : [],
    [isTrainingView, report],
  );

  const pageTitle =
    isChallengeView ? ui.navChallengeStats : ui.statsTitle;
  const pageSubtitle =
    isChallengeView ? ui.navSpecialTraining : ui.statsSubtitle;

  const samplePoolWinRateRows = useMemo(
    () =>
      (isTrainingView
        ? (report?.winRateBreakdown?.samplePoolWinRate ?? [])
        : []
      )
        .slice(0, 8)
        .map((item) => ({
          ...item,
          samplePoolName: resolvePoolDisplayName(
            item.samplePoolId,
            item.samplePoolName,
          ),
        })),
    [isTrainingView, report, resolvePoolDisplayName],
  );

  const resolvedSamplePoolStats = useMemo(
    () =>
      (report?.samplePoolStats ?? []).map((item) => ({
        ...item,
        samplePoolName: resolvePoolDisplayName(
          item.samplePoolId,
          item.samplePoolName,
        ),
      })),
    [report, resolvePoolDisplayName],
  );

  const handleExportReportCsv = useCallback(() => {
    if (!report || !isTrainingView) {
      return;
    }
    try {
      const csv = buildReportCsv(
        report,
        ui,
        _language,
        resolvePoolDisplayName,
      );
      const now = new Date();
      const localTimestamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
        "-",
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0"),
      ].join("");
      downloadCsv(`training-stats-${localTimestamp}.csv`, csv);
    } catch {
      onError?.(ui.statsExportFailed);
    }
  }, [_language, isTrainingView, onError, report, resolvePoolDisplayName, ui]);

  const handleExportReportPdf = useCallback(async () => {
    if (!report || !isTrainingView) {
      return;
    }
    setIsExportingPdf(true);
    const lines = [
      `${ui.metricTotalTrainings}: ${report.overview.totalSessions}`,
      `${ui.metricTotalDays}: ${toDayCountDisplay(report.overview.totalTrainingDays)}`,
      `${ui.metricTotalTrades}: ${report.overview.totalTrades}`,
      `${ui.metricTotalPnl}: ${formatSignedMoney(report.overview.totalPnl)}`,
      `${ui.metricTotalReturnRate}: ${toPercentDisplay(report.overview.totalReturnRate)}`,
      `${ui.metricWinRate}: ${toPercentDisplay(report.overview.winRate)}`,
      `${ui.metricProfitLossRatio}: ${formatMoney(report.overview.profitLossRatio, 2)}`,
      `${ui.metricMaxDrawdown}: ${toPercentDisplay(report.overview.maxDrawdownRate)}`,
      `${ui.metricAvgTradePnl}: ${formatSignedMoney(report.overview.averageTradePnl)}`,
      `${ui.metricAvgHold}: ${toDurationText(report.overview.averageHoldBars, ui)}`,
      "",
      `${ui.statsMonthlyPerformance}:`,
    ];
    report.monthlyPerformance.forEach((item) => {
      lines.push(
        `${item.period} | ${ui.statsTrainings}: ${item.sessionCount} | ${ui.metricTotalPnl}: ${formatSignedMoney(
          item.totalPnl,
        )} | ${ui.metricWinRate}: ${toPercentDisplay(item.winRate)}`,
      );
    });
    try {
      await exportReportPdf(ui.statsTitle, lines, _language);
    } catch {
      onError?.(ui.statsExportFailed);
    } finally {
      setIsExportingPdf(false);
    }
  }, [_language, isTrainingView, onError, report, ui]);

  const isFilterRefreshPending = isLoading && report !== null;

  const handleExportSession = useCallback(
    async (asPdf: boolean) => {
      if (!selectedSessionId) {
        return;
      }
      try {
        const project = await loadTrainingProjectDetail(selectedSessionId);
        const resolvedProjectPoolName = resolvePoolDisplayName(
          project.samplePoolId,
          project.samplePoolName,
        );
        if (asPdf) {
          const lines = [
            `${ui.statsSessionName}: ${project.name}`,
            `${ui.statsSymbol}: ${project.symbol}`,
            `${ui.statsSamplePool}: ${resolvedProjectPoolName}`,
            `${ui.statsTimeframe}: ${project.baseTimeframe}`,
            `${ui.statsDateRange}: ${project.trainingDateRange}`,
            `${ui.metricTotalDays}: ${toDayCountDisplay(project.summary.durationDays)}`,
            `${ui.metricTotalTrades}: ${project.summary.totalTrades}`,
            `${ui.metricTotalPnl}: ${formatSignedMoney(project.summary.totalPnl)}`,
            `${ui.metricTotalReturnRate}: ${toPercentDisplay(project.summary.assetReturnRate)}`,
            `${ui.metricMaxDrawdown}: ${toPercentDisplay(project.summary.maxDrawdownRate)}`,
            `${ui.metricTotalFees}: ${formatMoney(project.summary.tradingCost)}`,
          ];
          await exportReportPdf(
            `${ui.statsSingleReport}-${project.symbol || project.id}`,
            lines,
            _language,
          );
          return;
        }
        const csv = buildSingleSessionCsv(
          {
            ...project,
            samplePoolName: resolvedProjectPoolName,
          },
          ui,
        );
        const timestamp = new Date()
          .toISOString()
          .slice(0, 19)
          .replaceAll(":", "-");
        downloadCsv(`training-session-${timestamp}.csv`, csv);
      } catch (error) {
        void error;
        onError?.(ui.statsExportFailed);
      }
    },
    [_language, loadTrainingProjectDetail, onError, resolvePoolDisplayName, selectedSessionId, ui],
  );
  const sessionOptions = useMemo(
    () =>
      (report?.recentSessions ?? []).map((item) => ({
        value: item.id,
        label: [
          toMarketDateKey(item.createdAt) || item.createdAt,
          item.symbol,
          item.name,
        ].join(sessionOptionSeparator),
      })),
    [report, sessionOptionSeparator],
  );
  const handleExportSessionCsv = useCallback(() => {
    void handleExportSession(false);
  }, [handleExportSession]);
  const handleExportSessionPdf = useCallback(() => {
    void handleExportSession(true);
  }, [handleExportSession]);
  const refreshReport = useCallback(() => {
    void fetchReport(filters, viewMode);
  }, [fetchReport, filters, viewMode]);

  const overviewPrimaryCards = useMemo<
    Array<{
      key: string;
      label: string;
      value: string;
      tone: "profit" | "loss" | "flat" | "risk";
    }>
  >(() => {
    if (!report) {
      return [];
    }
    return [
      {
        key: "pnl",
        label: ui.metricTotalPnl,
        value: formatSignedMoney(report.overview.totalPnl),
        tone:
          report.overview.totalPnl > 0
            ? "profit"
            : report.overview.totalPnl < 0
              ? "loss"
              : "flat",
      },
      {
        key: "return-rate",
        label: ui.metricTotalReturnRate,
        value: toPercentDisplay(report.overview.totalReturnRate),
        tone:
          report.overview.totalReturnRate > 0
            ? "profit"
            : report.overview.totalReturnRate < 0
              ? "loss"
              : "flat",
      },
      {
        key: "drawdown",
        label: ui.metricMaxDrawdown,
        value: toPercentDisplay(report.overview.maxDrawdownRate),
        tone: "risk",
      },
    ];
  }, [
    report,
    ui.metricMaxDrawdown,
    ui.metricTotalPnl,
    ui.metricTotalReturnRate,
  ]);

  const overviewSecondaryCards = useMemo(() => {
    if (!report) {
      return [];
    }
    return [
      {
        key: "sessions",
        label: ui.metricTotalTrainings,
        value: formatMoney(report.overview.totalSessions, 0),
      },
      {
        key: "trades",
        label: ui.metricTotalTrades,
        value: formatMoney(report.overview.totalTrades, 0),
      },
      {
        key: "days",
        label: ui.metricTotalDays,
        value: toDayCountDisplay(report.overview.totalTrainingDays),
      },
      {
        key: "win-rate",
        label: ui.metricWinRate,
        value: toPercentDisplay(report.overview.winRate),
      },
      {
        key: "profit-loss-ratio",
        label: ui.metricProfitLossRatio,
        value: formatMoney(report.overview.profitLossRatio, 2),
      },
      {
        key: "avg-trade-pnl",
        label: ui.metricAvgTradePnl,
        value: formatSignedMoney(report.overview.averageTradePnl),
      },
      {
        key: "avg-hold",
        label: ui.metricAvgHold,
        value: toDurationText(report.overview.averageHoldBars, ui),
      },
    ];
  }, [
    report,
    ui,
    ui.metricAvgHold,
    ui.metricAvgTradePnl,
    ui.metricProfitLossRatio,
    ui.metricTotalDays,
    ui.metricTotalTrades,
    ui.metricTotalTrainings,
    ui.metricWinRate,
  ]);

  if (isChallengeView) {
    return (
      <ChallengeFusionDashboard
        isActive={isActive}
        language={_language}
        ui={ui}
        report={report}
        readModelFacts={challengeStatsReadModelFacts}
        isLoading={isLoading}
        filters={filters}
        setFilters={setFilters}
        setPendingFilters={setPendingFilters}
        challengeModes={challengeModes}
        activeChallengeModeId={activeChallengeModeId}
        onSelectChallengeMode={handleSelectChallengeMode}
        onRefresh={() => void fetchReport(filters, viewMode)}
        onClearHistory={(modeId) => clearChallengeHistory(modeId)}
        isClearingHistory={isClearingChallengeHistory}
        resolvedFilterSamplePools={resolvedFilterSamplePools}
        prefetchedChallengeDetailsById={challengeDetailsById}
        onLoadChallengeDetail={loadChallengeProjectDetail}
        chartBindings={challengeChartBindings}
        desktopSecondaryWindows={desktopSecondaryWindows}
        onError={onError}
      />
    );
  }

  return (
    <WorkspacePageShell
      template="overview"
      className="training-stats-page workspace-page--section-surface-only"
      bodyClassName="training-stats-page-body"
    >
      <WorkspaceFrameShell className="training-stats-shell">
        {isTrainingView ? (
          <TrainingStatsTrainingReportView
            language={_language}
            ui={ui}
            pendingFilters={pendingFilters}
            setPendingFilters={setPendingFilters}
            updatePendingFilter={updatePendingFilter}
            normalizedPendingSamplePoolId={normalizedPendingSamplePoolId}
            normalizedPendingComparePoolA={normalizedPendingComparePoolA}
            normalizedPendingComparePoolB={normalizedPendingComparePoolB}
            resolvedFilterSamplePools={resolvedFilterSamplePools}
            isFilterRefreshPending={isFilterRefreshPending}
            isLoading={isLoading}
            report={report as ApiTrainingStatsReport | null}
            isExportingPdf={isExportingPdf}
            onExportReportCsv={handleExportReportCsv}
            onExportReportPdf={() => void handleExportReportPdf()}
            overviewPrimaryCards={overviewPrimaryCards}
            overviewSecondaryCards={overviewSecondaryCards}
            monthlyWinRateRows={monthlyWinRateRows}
            samplePoolWinRateRows={samplePoolWinRateRows}
            comparisonCards={comparisonCards}
            comparisonMetrics={comparisonMetrics}
            monthlyTrendCards={monthlyTrendCards}
            resolvedSamplePoolStats={resolvedSamplePoolStats}
            selectedSessionId={selectedSessionId}
            setSelectedSessionId={setSelectedSessionId}
            sessionOptions={sessionOptions}
            onExportSessionCsv={handleExportSessionCsv}
            onExportSessionPdf={handleExportSessionPdf}
            onRefreshReport={refreshReport}
            onApplyQuickRange={applyQuickRange}
            onResetFilters={resetFilters}
            onApplyFilters={applyFilters}
            renderOptionLabelWithCount={renderOptionLabelWithCount}
            emptyPlaceholder={emptyPlaceholder}
            pageTitle={pageTitle}
            pageSubtitle={pageSubtitle}
            sessionOptionSeparator={sessionOptionSeparator}
          />
        ) : null}
      </WorkspaceFrameShell>
    </WorkspacePageShell>
  );
};

export default TrainingStatsPage;
