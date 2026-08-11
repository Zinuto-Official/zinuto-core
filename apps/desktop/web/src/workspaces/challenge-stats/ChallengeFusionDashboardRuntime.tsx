// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/ui/primitives/button";
import { SelectField } from "@/ui/primitives/select-field";
import { useI18n } from "@/frontend-kernel/i18n";
import { AppIcon } from "@/assets/graphics";
import { useArmedAction } from "@/ui/hooks/useArmedAction";
import {
  getSpecialTrainingPageContent,
  type SpecialTrainingModeId,
} from "@/ui/config/uiConfig";
import {
  type ApiChallengeStatsProjectDetail,
  type ApiChallengeStatsDashboardFastSessionRow,
  type ApiChallengeStatsDashboardRiskSessionRow,
  isCurrentDesktopSecondaryWindowAction,
} from "@/api";
import { formatDotJoinedText } from "@/ui/formatting/i18nDisplay";
import { formatMoney } from "@/ui/formatting/format";
import { EChartSurface } from "@/workspaces/challenge-stats/charts/echartSurface";
import {
  CHALLENGE_STATS_DEFAULT_MODE_ID,
  resolveChallengeStatsDashboardFamilyByModeId,
} from "@/workspaces/challenge-stats/challengeStatsModeRegistry";
import { resolveChallengeStatsMetricReadinessForDashboard } from "@/workspaces/challenge-stats/challengeStatsReadModelFacts";
import {
  resolveChallengeStatsDashboardSnapshot,
} from "@/workspaces/challenge-stats/challengeStatsDashboardSnapshot";
import {
  SessionWindowPreset,
  FastDirectionSelection,
  RiskBehaviorType,
  ResultTone,
  MetricCardModel,
  FastSessionMetric,
  RiskSessionMetric,
  SessionRowModel,
  SESSION_WINDOW_PRESETS,
  FAST_DECISION_MAX_SECONDS,
  resolveFastBiasLabel,
  formatTemplate,
  clampNumber,
  formatPercentText,
  formatSignedPercentText,
  formatSecondsText,
  formatBarsValue,
  parseDateFromSession,
  sortSessionsByRecent,
  resolveRangeSessions,
  formatBattleTimestampLabel,
  resolveHistoryReplayProject,
} from "@/workspaces/challenge-stats/challengeFusionDashboardModel";
import { useChallengeFusionChartOptions } from "@/workspaces/challenge-stats/useChallengeFusionChartOptions";
import { useChallengeFusionDialogSummaryChips } from "@/workspaces/challenge-stats/useChallengeFusionDialogSummaryChips";
import {
  ChallengeMetricCard,
  formatSampleProgress,
  GRADE_LABELS,
  resolveReportChallengeModeId,
  type ChallengeFusionDashboardProps,
} from "@/workspaces/challenge-stats/ChallengeFusionDashboardContracts";
export type {
  ChallengeFusionDashboardChartBindings,
} from "@/workspaces/challenge-stats/ChallengeFusionDashboardContracts";
import {
  PlainTabBar,
  WorkspaceFrameShell,
  WorkspacePageShell,
  WorkspaceTopBar,
} from "@/ui/components";

export const ChallengeFusionDashboard = ({
  isActive = true,
  language,
  ui,
  report,
  readModelFacts,
  isLoading,
  filters: _filters,
  setFilters: _setFilters,
  setPendingFilters: _setPendingFilters,
  challengeModes,
  activeChallengeModeId,
  onSelectChallengeMode,
  onRefresh,
  onClearHistory,
  isClearingHistory = false,
  resolvedFilterSamplePools: _resolvedFilterSamplePools,
  prefetchedChallengeDetailsById = {},
  onLoadChallengeDetail,
  chartBindings,
  desktopSecondaryWindows,
  onError,
}: ChallengeFusionDashboardProps) => {
  const { t } = useI18n();
  const emptyPlaceholder = t("common.placeholder.none");
  const percentSymbol = t("common.symbol.percent");
  const [rangePreset, setRangePreset] =
    useState<SessionWindowPreset>("RECENT_10");
  const [openedSessionId, setOpenedSessionId] = useState("");
  const clearHistoryActionKey = "clear-history" as const;
  const { buildBlurClearHandler, clearArmedAction, isActionArmed, setArmedKey } =
    useArmedAction<typeof clearHistoryActionKey>();

  const content = useMemo(() => getSpecialTrainingPageContent(language), [language]);
  const selectedMode =
    challengeModes.find((mode) => mode.id === activeChallengeModeId) ??
    challengeModes[0] ??
    null;
  const selectedModeId =
    selectedMode?.id ?? activeChallengeModeId ?? CHALLENGE_STATS_DEFAULT_MODE_ID;
  const reportModeId = resolveReportChallengeModeId(report);
  const isModeSwitchPending =
    isLoading && reportModeId !== null && reportModeId !== selectedModeId;
  const activeModeId = isModeSwitchPending ? reportModeId : selectedModeId;
  const activeMode =
    challengeModes.find((mode) => mode.id === activeModeId) ??
    selectedMode ??
    null;
  const activeDashboardFamily =
    resolveChallengeStatsDashboardFamilyByModeId(activeModeId);
  const isRiskMode = activeDashboardFamily === "RISK_DISCIPLINE";
  const dashboardSnapshot = useMemo(
    () =>
      resolveChallengeStatsDashboardSnapshot({
        report,
        readModelFacts,
      }),
    [readModelFacts, report],
  );
  const dashboardInsights = dashboardSnapshot.dashboardInsights;
  const fastDashboardInsights =
    dashboardInsights?.fast?.[rangePreset] ?? dashboardInsights?.fast?.ALL;

  const loadProjectDetail = useCallback(
    async (sessionId: string) => {
      const normalizedId = String(sessionId || "").trim();
      if (!normalizedId) {
        return;
      }
      if (prefetchedChallengeDetailsById[normalizedId] || !onLoadChallengeDetail) {
        return;
      }
      try {
        await onLoadChallengeDetail(normalizedId);
      } catch {
        // Keep the current view responsive even if detail hydration fails.
      }
    },
    [onLoadChallengeDetail, prefetchedChallengeDetailsById],
  );

  const resolveSessionDetail = useCallback(
    (sessionId: string): ApiChallengeStatsProjectDetail | undefined => {
      const normalizedId = String(sessionId || "").trim();
      if (!normalizedId) {
        return undefined;
      }
      return prefetchedChallengeDetailsById[normalizedId];
    },
    [prefetchedChallengeDetailsById],
  );

  const dashboardRows = dashboardSnapshot.dashboardRows;
  const sourceRecentSessions = dashboardSnapshot.recentSessions;
  const sortedSessions = useMemo(
    () => sortSessionsByRecent(sourceRecentSessions),
    [sourceRecentSessions],
  );
  const recentSessionById = useMemo(
    () =>
      new Map(
        sortedSessions.map((session) => [session.id, session] as const),
      ),
    [sortedSessions],
  );
  const windowSessions = useMemo(
    () => resolveRangeSessions(sortedSessions, rangePreset),
    [rangePreset, sortedSessions],
  );
  const windowSessionIdSet = useMemo(
    () => new Set(windowSessions.map((session) => session.id)),
    [windowSessions],
  );
  const windowDashboardRows = useMemo(
    () =>
      windowSessionIdSet.size > 0
        ? dashboardRows.filter((row) => windowSessionIdSet.has(row.id))
        : [],
    [dashboardRows, windowSessionIdSet],
  );

  useEffect(() => {
    setOpenedSessionId("");
  }, [activeChallengeModeId, rangePreset]);

  useEffect(() => {
    if (!openedSessionId || prefetchedChallengeDetailsById[openedSessionId]) {
      return;
    }
    void loadProjectDetail(openedSessionId);
  }, [loadProjectDetail, openedSessionId, prefetchedChallengeDetailsById]);

  const fastSessions = useMemo<FastSessionMetric[]>(() => {
    const backendRows = windowDashboardRows.filter(
      (row): row is ApiChallengeStatsDashboardFastSessionRow =>
        row.kind === "fast",
    );
    return backendRows
      .map((row) => {
        const session = recentSessionById.get(row.id);
        if (!session) {
          return null;
        }
        return {
          kind: "fast",
          id: row.id,
          session,
          createdAtLabel: parseDateFromSession(session),
          decisionSeconds: clampNumber(
            row.decisionSeconds,
            0,
            FAST_DECISION_MAX_SECONDS,
          ),
          selection: row.selection,
          actual: row.actual,
          correct: row.correct,
          timedOut: row.timedOut,
          edgeRatio: row.edgeRatio,
          opportunityEdgeRatio: row.opportunityEdgeRatio,
          performanceRate: row.performanceRate,
          reviewGrade: row.reviewGrade,
          detail: resolveSessionDetail(row.id),
        } satisfies FastSessionMetric;
      })
      .filter((row): row is FastSessionMetric => row !== null);
  }, [
    recentSessionById,
    resolveSessionDetail,
    windowDashboardRows,
  ]);

  const riskSessions = useMemo<RiskSessionMetric[]>(() => {
    const backendRows = windowDashboardRows.filter(
      (row): row is ApiChallengeStatsDashboardRiskSessionRow =>
        row.kind === "risk",
    );
    return backendRows
      .map((row) => {
        const session = recentSessionById.get(row.id);
        if (!session) {
          return null;
        }
        return {
          kind: "risk",
          id: row.id,
          session,
          createdAtLabel: parseDateFromSession(session),
          survived: row.survived,
          comeback: row.comeback,
          alphaRatio: row.alphaRatio,
          returnRate: row.returnRate,
          firstActionBars: row.firstActionBars,
          behavior: row.behavior,
          reviewGrade: row.reviewGrade,
          curvePoints: row.curvePoints,
          detail: resolveSessionDetail(row.id),
        } satisfies RiskSessionMetric;
      })
      .filter((row): row is RiskSessionMetric => row !== null);
  }, [
    recentSessionById,
    resolveSessionDetail,
    windowDashboardRows,
  ]);

  const activeMetricReadiness = resolveChallengeStatsMetricReadinessForDashboard({
    facts: dashboardSnapshot.source === "readModel" ? readModelFacts ?? null : null,
    dashboardInsights,
    family: activeDashboardFamily,
    preset: rangePreset,
  });
  const sessionRows: SessionRowModel[] = isRiskMode ? riskSessions : fastSessions;
  const sampleCount = activeMetricReadiness?.sampleCount ?? 0;
  const minimumSampleCount =
    activeMetricReadiness?.minimumSampleCount ?? Math.max(1, sampleCount);
  const hasEnoughSamples = activeMetricReadiness?.enabled === true;
  const isUnderSampled = !hasEnoughSamples;
  const sampleProgressValue = formatSampleProgress(
    sampleCount,
    minimumSampleCount,
  );
  const selectionLabelMap: Record<FastDirectionSelection, string> = {
    LONG: content.decisionDirectionUpLabel,
    SHORT: content.decisionDirectionDownLabel,
    OBSERVE: content.decisionDirectionRangeLabel,
  };
  const behaviorLabelMap: Record<RiskBehaviorType, string> = {
    CUT_LOSS: content.challengeDashboardRiskBehaviorCutLabel,
    ADD_POSITION: content.challengeDashboardRiskBehaviorAddLabel,
    FREEZE: content.challengeDashboardRiskBehaviorFreezeLabel,
  };
  const fastBiasStats = useMemo(() => {
    const directionalTotal =
      fastDashboardInsights && fastDashboardInsights.sampleCount > 0
        ? fastDashboardInsights.longCount + fastDashboardInsights.shortCount
        : 0;
    const longShare =
      directionalTotal > 0 && fastDashboardInsights
        ? fastDashboardInsights.longCount / directionalTotal
        : 0;
    const shortShare =
      directionalTotal > 0 && fastDashboardInsights
        ? fastDashboardInsights.shortCount / directionalTotal
        : 0;
    const skew =
      directionalTotal > 0 && fastDashboardInsights
        ? (fastDashboardInsights.longCount - fastDashboardInsights.shortCount) /
          directionalTotal
        : 0;
    return {
      longCount: fastDashboardInsights?.longCount ?? 0,
      shortCount: fastDashboardInsights?.shortCount ?? 0,
      observeCount: fastDashboardInsights?.observeCount ?? 0,
      longWinRate: fastDashboardInsights?.longWinRate ?? 0,
      shortWinRate: fastDashboardInsights?.shortWinRate ?? 0,
      longShare,
      shortShare,
      label: resolveFastBiasLabel(content, directionalTotal, skew),
    };
  }, [content, fastDashboardInsights]);

  const fastMetricCards = useMemo<MetricCardModel[]>(() => {
    if (!hasEnoughSamples || !fastDashboardInsights) {
      return [
        {
          id: "fast-win-rate",
          label: content.challengeStatsFastWinRateLabel,
          value: sampleProgressValue,
          subtitle: content.challengeDashboardEmptyTitle,
          tone: "accent",
          isPending: true,
        },
        {
          id: "fast-speed",
          label: content.challengeStatsFastAvgDecisionSecondsLabel,
          value: sampleProgressValue,
          subtitle: content.challengeDashboardEmptyTitle,
          tone: "neutral",
          isPending: true,
        },
        {
          id: "fast-bias",
          label: content.challengeDashboardFastBiasImbalanceLabel,
          value: sampleProgressValue,
          subtitle: content.challengeDashboardEmptyTitle,
          tone: "neutral",
          isPending: true,
        },
      ];
    }
    return [
      {
        id: "fast-win-rate",
        label: content.challengeStatsFastWinRateLabel,
        value: formatPercentText(fastDashboardInsights.winRate, 0),
        subtitle: activeMode?.summary || "",
        tone: "accent",
      },
      {
        id: "fast-speed",
        label: content.challengeStatsFastAvgDecisionSecondsLabel,
        value: formatSecondsText(
          language,
          fastDashboardInsights.avgDecisionSeconds,
          content.fastArenaSecondUnitLabel,
        ),
        subtitle: formatTemplate(
          content.challengeDashboardFastSpeedPercentileTemplate,
          [
            formatMoney(
              Math.max(0, fastDashboardInsights.slowerPercentile * 100),
              0,
            ),
          ],
        ),
        tone: "neutral",
      },
      {
        id: "fast-bias",
        label: content.challengeDashboardFastBiasImbalanceLabel,
        value: fastBiasStats.label,
        subtitle: formatTemplate(content.challengeDashboardFastBiasVsTemplate, [
          formatPercentText(fastBiasStats.longShare, 0),
          formatPercentText(fastBiasStats.shortShare, 0),
        ]),
        tone: "neutral",
      },
    ];
  }, [
    activeMode?.summary,
    content,
    fastBiasStats.label,
    fastBiasStats.longShare,
    fastBiasStats.shortShare,
    fastDashboardInsights,
    hasEnoughSamples,
    language,
    sampleProgressValue,
  ]);

  const riskMetricCards = useMemo<MetricCardModel[]>(() => {
    const riskDashboardInsights =
      dashboardInsights?.risk?.[rangePreset] ?? dashboardInsights?.risk?.ALL;
    if (!hasEnoughSamples || !riskDashboardInsights) {
      return [
        {
          id: "risk-survival",
          label: content.challengeStatsRiskSurvivalRateLabel,
          value: sampleProgressValue,
          subtitle: content.challengeDashboardEmptyTitle,
          tone: "accent",
          isPending: true,
        },
        {
          id: "risk-comeback",
          label: content.challengeDashboardRiskComebackRateLabel,
          value: sampleProgressValue,
          subtitle: content.challengeDashboardEmptyTitle,
          tone: "accent",
          isPending: true,
        },
        {
          id: "risk-first-action",
          label: content.challengeDashboardRiskFirstActionBarsLabel,
          value: sampleProgressValue,
          subtitle: content.challengeDashboardEmptyTitle,
          tone: "neutral",
          isPending: true,
        },
      ];
    }
    return [
      {
        id: "risk-survival",
        label: content.challengeStatsRiskSurvivalRateLabel,
        value: formatPercentText(riskDashboardInsights.survivalRate, 0),
        subtitle: activeMode?.summary || "",
        tone: "accent",
      },
      {
        id: "risk-comeback",
        label: content.challengeDashboardRiskComebackRateLabel,
        value: formatPercentText(riskDashboardInsights.comebackRate, 0),
        subtitle: content.challengeDashboardRiskComebackSubtitle,
        tone: "accent",
      },
      {
        id: "risk-first-action",
        label: content.challengeDashboardRiskFirstActionBarsLabel,
        value: formatTemplate(content.challengeDashboardRiskFirstActionBarsTemplate, [
          formatBarsValue(riskDashboardInsights.averageFirstActionBars),
        ]),
        subtitle: content.challengeDashboardRiskFirstActionSubtitle,
        tone: "neutral",
      },
    ];
  }, [
    activeMode?.summary,
    content,
    dashboardInsights?.risk,
    hasEnoughSamples,
    rangePreset,
    sampleProgressValue,
  ]);

  const metricCards = isRiskMode ? riskMetricCards : fastMetricCards;
  const {
    fastBiasOption,
    fastScatterOption,
    riskBehaviorOption,
    riskCurveOption,
  } = useChallengeFusionChartOptions({
    content,
    dashboardInsights,
    fastBiasStats,
    fastSessions,
    isRiskMode,
    language,
    percentSymbol,
    rangePreset,
    riskSessions,
    executionEdgeRatioLabel: ui.metricExecutionEdgeRatio,
  });

  const primaryChartTitle = isRiskMode
    ? content.challengeDashboardRiskDeepWaterTitle
    : content.challengeMacroFastSpeedScatterTitle;
  const secondaryChartTitle = isRiskMode
    ? content.challengeDashboardRiskBehaviorTitle
    : content.challengeMacroFastBiasTitle;

  const selectedSession = useMemo(
    () => sessionRows.find((session) => session.id === openedSessionId) ?? null,
    [openedSessionId, sessionRows],
  );
  const selectedDetail = useMemo(
    () => resolveSessionDetail(openedSessionId),
    [openedSessionId, resolveSessionDetail],
  );

  const handleOpenSession = useCallback((sessionId: string) => {
    setOpenedSessionId(sessionId);
  }, []);
  const statsReplayWindowOpenedRef = useRef(false);
  const statsReplayWindowRevisionRef = useRef(0);

  useEffect(() => {
    if (
      openedSessionId &&
      selectedDetail &&
      (selectedDetail.detailExpiredAt ||
        selectedDetail.replayHydrationStatus === "EXPIRED")
    ) {
      onError?.(t("appText.historyDetailExpired"));
      setOpenedSessionId("");
    }
  }, [onError, openedSessionId, selectedDetail, t]);

  const modeTabOptions = useMemo(
    () =>
      challengeModes.map((mode) => ({
        key: mode.id,
        label: mode.title,
      })),
    [challengeModes],
  );

  const currentPresetOptions = useMemo(
    () => [
      {
        value: SESSION_WINDOW_PRESETS[0],
        label: content.challengeDashboardRecent10Label,
      },
      {
        value: SESSION_WINDOW_PRESETS[1],
        label: content.challengeDashboardRecent50Label,
      },
      {
        value: SESSION_WINDOW_PRESETS[2],
        label: ui.statsQuickAll,
      },
    ],
    [
      content.challengeDashboardRecent10Label,
      content.challengeDashboardRecent50Label,
      ui.statsQuickAll,
    ],
  );

  const dialogSummaryChips = useChallengeFusionDialogSummaryChips({
    behaviorLabelMap,
    content,
    emptyPlaceholder,
    language,
    selectedSession,
    selectionLabelMap,
    ui,
  });

  const hasChallengeHistory = dashboardSnapshot.clearHistoryEnabled;
  const isRefreshing = isLoading && report !== null;

  const statsReplayWindowInput = useMemo(() => {
    if (!openedSessionId || !selectedSession || !chartBindings) {
      return null;
    }
    const project = resolveHistoryReplayProject(
      selectedSession.session,
      selectedDetail,
      {
        mfeLabel: content.fastArenaMfeTagLabel,
        maeLabel: content.fastArenaMaeTagLabel,
      },
    );
    if (!project) {
      return null;
    }
    const meta = formatDotJoinedText(language, [
      selectedSession.session.symbol || emptyPlaceholder,
      selectedSession.session.baseTimeframe || emptyPlaceholder,
      selectedSession.createdAtLabel || selectedSession.session.createdAt,
    ]);
    return {
      kind: "CHALLENGE_STATS_REPLAY" as const,
      title: ui.statsSingleReport,
      payload: {
        title: ui.statsSingleReport,
        meta,
        project,
        displayPeriod: chartBindings.trainerDisplayPeriod,
        trainerPeriodOptionsByBase: chartBindings.trainerPeriodOptionsByBase,
        chartRenderMode: chartBindings.chartRenderMode,
        showVolumePane: true,
        metrics: dialogSummaryChips.map((chip) => ({
          label: chip.label,
          value: chip.value,
          tone: chip.replayTone,
        })),
      },
    };
  }, [
    chartBindings,
    content.fastArenaMaeTagLabel,
    content.fastArenaMfeTagLabel,
    dialogSummaryChips,
    emptyPlaceholder,
    language,
    openedSessionId,
    selectedDetail,
    selectedSession,
    ui.statsSingleReport,
  ]);

  useEffect(() => {
    if (!statsReplayWindowInput) {
      statsReplayWindowOpenedRef.current = false;
      statsReplayWindowRevisionRef.current = 0;
      return;
    }
    if (statsReplayWindowOpenedRef.current) {
      void desktopSecondaryWindows
        .publish(statsReplayWindowInput)
        .then((state) => {
          statsReplayWindowRevisionRef.current = state.revision;
        })
        .catch(() => {
          statsReplayWindowOpenedRef.current = false;
          statsReplayWindowRevisionRef.current = 0;
        });
      return;
    }
    statsReplayWindowOpenedRef.current = true;
    void desktopSecondaryWindows
      .open(statsReplayWindowInput)
      .then((state) => {
        statsReplayWindowRevisionRef.current = state.revision;
      })
      .catch(() => {
        statsReplayWindowOpenedRef.current = false;
        statsReplayWindowRevisionRef.current = 0;
      });
  }, [desktopSecondaryWindows, statsReplayWindowInput]);

  useEffect(
    () =>
      desktopSecondaryWindows.subscribeActions((message) => {
        if (message.kind !== "CHALLENGE_STATS_REPLAY") {
          return;
        }
        if (
          !isCurrentDesktopSecondaryWindowAction(
            message,
            statsReplayWindowRevisionRef.current,
          )
        ) {
          return;
        }
        if (message.action === "WINDOW_CLOSED") {
          statsReplayWindowOpenedRef.current = false;
          statsReplayWindowRevisionRef.current = 0;
          setOpenedSessionId("");
          return;
        }
        const payload =
          message.payload &&
          typeof message.payload === "object" &&
          !Array.isArray(message.payload)
            ? (message.payload as Record<string, unknown>)
            : {};
        if (message.action === "SET_DISPLAY_PERIOD") {
          const period = String(payload.period || "").trim();
          if (period && chartBindings) {
            chartBindings.setTrainerDisplayPeriod(
              period as Parameters<typeof chartBindings.setTrainerDisplayPeriod>[0],
            );
          }
          return;
        }
        if (message.action === "SET_CHART_RENDER_MODE") {
          const mode = String(payload.mode || "").trim();
          if (mode && chartBindings) {
            chartBindings.setChartRenderMode(
              mode as Parameters<typeof chartBindings.setChartRenderMode>[0],
            );
          }
        }
      }),
    [chartBindings, desktopSecondaryWindows],
  );

  const handleConfirmClearHistory = useCallback(() => {
    if (isClearingHistory) {
      return;
    }
    clearArmedAction();
    void onClearHistory(activeMode?.id).then(() => {
      onRefresh();
    }).catch(() => undefined);
  }, [activeMode?.id, clearArmedAction, isClearingHistory, onClearHistory, onRefresh]);

  return (
    <WorkspacePageShell
      template="overview"
      className={`settings-page special-training-page challenge-fusion-page workspace-page--section-surface-only ${
        isRiskMode ? "is-risk-mode" : "is-fast-mode"
      }${isUnderSampled ? " is-under-sampled" : ""}`}
      bodyClassName="special-training-body"
    >
      <WorkspaceFrameShell
        className="special-training-stage challenge-fusion-shell"
      >
          <div
            className="challenge-fusion-shell-content"
            aria-busy={isRefreshing ? "true" : undefined}
          >
            <WorkspaceTopBar
              className="challenge-fusion-topbar challenge-fusion-topbar--flat"
              railClassName="challenge-fusion-tab-rail-wrap"
              toolsClassName="challenge-fusion-tools-row"
              rail={
                <PlainTabBar
                  value={
                    selectedModeId ??
                    challengeModes[0]?.id ??
                    CHALLENGE_STATS_DEFAULT_MODE_ID
                  }
                  items={modeTabOptions}
                  onChange={(value) =>
                    onSelectChallengeMode(value as SpecialTrainingModeId)
                  }
                  ariaLabel={ui.navChallengeStats}
                  className="challenge-fusion-tab-rail"
                  itemClassName="challenge-fusion-tab-rail-item"
                />
              }
              tools={
                <div className="challenge-fusion-slim-controls-tray challenge-fusion-tools-tray">
                  <SelectField
                    value={rangePreset}
                    onValueChange={(nextValue) =>
                      setRangePreset(nextValue as SessionWindowPreset)
                    }
                    aria-label={ui.reviewAggregationRange}
                    options={currentPresetOptions}
                  />
                </div>
              }
            />

            <section className="challenge-fusion-insight card">
              <div className="challenge-fusion-metrics-grid">
                {metricCards.map((item) => (
                  <ChallengeMetricCard key={item.id} item={item} />
                ))}
              </div>

              {hasEnoughSamples ? (
                <div className="challenge-fusion-charts-grid">
                  <article className="challenge-fusion-chart-card">
                    <header className="challenge-fusion-chart-head">
                      <div>
                        <h3 data-i18n-slot="cardTitle" data-i18n-critical="true">
                          {primaryChartTitle}
                        </h3>
                      </div>
                    </header>
                    <EChartSurface isActive={isActive}
                      option={isRiskMode ? riskCurveOption : fastScatterOption}
                      className="challenge-fusion-chart-surface"
                      onPointClick={
                        isRiskMode
                          ? undefined
                          : (dataIndex) => {
                              const point = fastSessions[dataIndex];
                              if (point) {
                                handleOpenSession(point.id);
                              }
                            }
                      }
                    />
                  </article>

                  <article className="challenge-fusion-chart-card">
                    <header className="challenge-fusion-chart-head">
                      <div>
                        <h3 data-i18n-slot="cardTitle" data-i18n-critical="true">
                          {secondaryChartTitle}
                        </h3>
                      </div>
                    </header>
                    <EChartSurface isActive={isActive}
                      option={isRiskMode ? riskBehaviorOption : fastBiasOption}
                      className="challenge-fusion-chart-surface"
                    />
                  </article>
                </div>
              ) : null}
            </section>

            <section className="challenge-fusion-table card">
              <header className="challenge-fusion-table-head">
                <div className="challenge-fusion-table-head-main">
                  <div className="challenge-fusion-table-head-title">
                    <h3 data-i18n-slot="cardTitle" data-i18n-critical="true">
                      {ui.statsTrainings}
                    </h3>
                    <span>{formatMoney(sessionRows.length, 0)}</span>
                  </div>
                  {hasChallengeHistory ? (
                    <div
                      className="challenge-fusion-table-head-actions"
                      onBlurCapture={buildBlurClearHandler(clearHistoryActionKey)}
                    >
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={
                          isModeSwitchPending ||
                          !hasChallengeHistory ||
                          isClearingHistory
                        }
                        onClick={() => {
                          if (
                            isModeSwitchPending ||
                            !hasChallengeHistory ||
                            isClearingHistory
                          ) {
                            return;
                          }
                          if (isActionArmed(clearHistoryActionKey)) {
                            handleConfirmClearHistory();
                            return;
                          }
                          setArmedKey(clearHistoryActionKey);
                        }}
                      >
                        <AppIcon name="actionDelete" className="size-4" />
                        {content.challengeDashboardClearHistoryActionLabel}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </header>

              {isLoading && !report ? (
                <div className="challenge-fusion-table-empty">{ui.statsLoading}</div>
              ) : null}

              {!isLoading && sessionRows.length === 0 ? (
                <div className="challenge-fusion-table-empty is-compact">
                  {ui.statsNoData}
                </div>
              ) : null}

              {sessionRows.length > 0 ? (
                <div className="challenge-fusion-table-wrap">
                  <div className="challenge-fusion-table-header-row">
                    <span>{ui.reviewHistoryTrainingDate}</span>
                    <span>{ui.symbol}</span>
                    <span>{content.challengeDashboardTableContextColumnLabel}</span>
                    <span>{content.challengeDashboardTableResultColumnLabel}</span>
                    <span>{content.challengeDashboardTablePerformanceColumnLabel}</span>
                    <span className="challenge-fusion-table-action-heading">
                      {content.challengeDashboardReplayActionLabel}
                    </span>
                  </div>

                  <div className="challenge-fusion-table-body">
                    {sessionRows.map((row) => {
                      const resultTone: ResultTone =
                        row.reviewGrade === "S"
                          ? "accent"
                          : row.reviewGrade === "A"
                            ? "neutral"
                            : "danger";
                      const performanceToneClass =
                        row.kind === "fast"
                          ? row.performanceRate > 0
                            ? "is-profit"
                            : row.performanceRate < 0
                              ? "is-loss"
                              : "is-neutral"
                          : row.returnRate > 0
                            ? "is-profit"
                            : row.returnRate < 0
                              ? "is-loss"
                              : "is-neutral";
                      const contextLabel =
                        row.kind === "fast"
                          ? formatTemplate(content.challengeDashboardFastContextTemplate, [
                              formatMoney(row.decisionSeconds, 1),
                              selectionLabelMap[row.selection],
                            ])
                          : formatTemplate(content.challengeDashboardRiskContextTemplate, [
                              formatTemplate(
                                content.challengeDashboardRiskFirstActionBarsTemplate,
                                [formatBarsValue(row.firstActionBars)],
                              ),
                              behaviorLabelMap[row.behavior],
                            ]);
                      const performanceLabel =
                        row.kind === "fast"
                          ? formatSignedPercentText(row.performanceRate, 1)
                          : formatSignedPercentText(row.returnRate, 1);
                      return (
                        <div key={row.id} className="challenge-fusion-table-row">
                          <span className="challenge-fusion-table-time">
                            {formatBattleTimestampLabel(row.session, content)}
                          </span>
                          <span className="challenge-fusion-table-symbol">
                            <strong>{row.session.symbol || emptyPlaceholder}</strong>
                            <em>{row.session.baseTimeframe || emptyPlaceholder}</em>
                          </span>
                          <span className="challenge-fusion-table-context">
                            {contextLabel}
                          </span>
                          <span className="challenge-fusion-table-pill-wrap">
                            <span
                              className={`challenge-fusion-table-pill is-${resultTone}`}
                            >
                              {row.reviewGrade === "S"
                                  ? GRADE_LABELS.S
                                  : row.reviewGrade === "A"
                                    ? GRADE_LABELS.A
                                    : GRADE_LABELS.F}
                            </span>
                          </span>
                          <span className="challenge-fusion-table-pill-wrap">
                            <span
                              className={`challenge-fusion-table-pill ${performanceToneClass}`}
                            >
                              {performanceLabel}
                            </span>
                          </span>
                          <span className="challenge-fusion-table-action-cell">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenSession(row.id)}
                            >
                              <AppIcon name="actionFastForward" />
                              {content.challengeDashboardReplayActionLabel}
                            </Button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </section>
          </div>
      </WorkspaceFrameShell>

    </WorkspacePageShell>
  );
};
