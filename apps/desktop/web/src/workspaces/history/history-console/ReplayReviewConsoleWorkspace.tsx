// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useState } from "react";
import { HISTORY_PROJECT_PAGE_SIZE } from "@/frontend-kernel/runtimeConstants";
import { Button } from "@/ui/primitives/button";
import { InlineFeedback } from "@/ui/primitives/inline-feedback";
import { SelectField } from "@/ui/primitives/select-field";
import { SurfaceCard } from "@/ui/primitives/surface-card";
import { formatMessage } from "@zinuto/shared/i18n";
import { getTradingSettingsText } from "@/ui/config/uiConfig";
import { AppIcon } from "@/assets/graphics";
import { EChartSurface } from "@/workspaces/challenge-stats/charts/echartSurface";
import {
  ReplayReviewArchiveSection,
} from "@/workspaces/history/history-console/ReplayReviewArchiveSection";
import { ReplayReviewTrendCard } from "@/workspaces/history/history-console/ReplayReviewTrendCard";
import { PlainTabBar } from "@/ui/components/PlainTabBar";
import {
  WorkspaceFrameShell,
  WorkspacePageShell,
  WorkspaceTopBar,
} from "@/ui/components";
import { useReplayReviewConsoleModel } from "@/workspaces/history/history-console/useReplayReviewConsoleModel";
import { useReplayReviewArchiveRows } from "@/workspaces/history/history-console/useReplayReviewArchiveRows";
import { useReplayReviewArchiveDetailWindow } from "@/workspaces/history/history-console/useReplayReviewArchiveDetailWindow";
import { useReplayReviewWindowState } from "@/workspaces/history/history-console/useReplayReviewWindowState";
import { useReplayReviewConsoleBundle } from "@/workspaces/history/history-console/useReplayReviewConsoleBundle";
import { useHistoryReviewReadModelActions } from "@/workspaces/history/history-console/useHistoryReviewReadModelActions";
import { EMPTY_MARGIN_SAFETY_VIEW_MODEL } from "@/workspaces/history/history-console/marginSafetyModel";
import type {
  ReplayReviewProject,
  ReplayReviewWindow,
} from "@/workspaces/history/history-console/types";
import { useDesktopHelpContextReporter } from "@/domains/desktop-help/DesktopHelpContext";

import {
  BehaviorCompactMetric,
  DiagnosticPendingIndicator,
  MarginWorstSessionList,
  MarginZoneDistribution,
  OverviewKpiCard,
  ReplayDialogContent,
  ReplayReviewArchiveSkeleton,
  ReplayReviewBehaviorSkeleton,
  ReplayReviewOverviewSkeleton,
  buildMarginSafetyOption,
  buildOverviewCards,
  buildReviewWindowSlice,
  formatDiagnosticNumber,
  formatSignedRatio,
  resolveMarginSafetyTone,
  resolvePnlTone,
  resolveReviewArchiveEnvironmentLine,
  resolveReviewEnvironmentLabel,
  sortSessionsAscending,
  type ReplayReviewConsolePageProps,
  type ReviewCapitalDisciplinePayload,
  type ReviewConsolePageTab,
  type ReviewEnvironmentMatrixRow,
} from "@/workspaces/history/history-console/ReplayReviewConsoleHelpers";
import { formatReplayRatioMultiplier } from "@/workspaces/history/history-console/replayRatioPresentation";
import { isTableRowSelectionActivationKey } from "@/ui/a11y/tableRowSelection";

export type { ReplayReviewConsoleHistoryDeps } from "@/workspaces/history/history-console/ReplayReviewConsoleHelpers";

export const ReplayReviewConsolePage = ({
  history,
  isActive = true,
  ui,
  language,
  onError,
}: ReplayReviewConsolePageProps) => {
  const tradingSettingsText = getTradingSettingsText(language);
  const [activePageTab, setActivePageTab] =
    useState<ReviewConsolePageTab>("OVERVIEW");
  useDesktopHelpContextReporter({
    active: isActive,
    contextId:
      activePageTab === "OVERVIEW"
        ? "HISTORY_OVERVIEW"
        : activePageTab === "BEHAVIOR"
          ? "HISTORY_BEHAVIOR"
          : "HISTORY_ARCHIVE",
    workspace: "HISTORY",
  });
  const {
    reviewDisplayLimit,
    reviewWindow,
    reviewWindowAnchorMs,
    reviewWindowOptions,
    setReviewDisplayLimit,
    setReviewWindow,
  } = useReplayReviewWindowState({ isActive, ui });
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<string[]>([]);
  const [linkedEnvironmentKey, setLinkedEnvironmentKey] = useState("");
  const [linkedRepresentativeIds, setLinkedRepresentativeIds] = useState<
    string[]
  >([]);
  const model = useReplayReviewConsoleModel({
    language,
    ui,
    samplePoolAllId: history.samplePoolAllId,
    trainingProjects: history.trainingProjects as ReplayReviewProject[],
    historyProjectsNextCursor: history.historyProjectsNextCursor,
    isHistoryProjectsLoading: history.isHistoryProjectsLoading,
    isHistoryProjectsLoadingMore: history.isHistoryProjectsLoadingMore,
    loadMoreTrainingProjects: history.loadMoreTrainingProjects,
    reviewWindow,
    reviewDisplayLimit,
    reviewWindowAnchorMs,
    onError,
  });

  const pageTabOptions = useMemo(
    () => [
      {
        key: "OVERVIEW" as const,
        label: ui.reviewConsoleTabOverview,
      },
      {
        key: "BEHAVIOR" as const,
        label: ui.reviewConsoleTabBehavior,
      },
      {
        key: "ARCHIVE" as const,
        label: ui.reviewConsoleTabArchive,
      },
    ],
    [ui],
  );

  const visibleSessionsDesc = model.visibleSessionMetrics;
  const windowCandidateSessionsDesc = model.windowCandidateSessionMetrics;
  const reviewSlice = useMemo(
    () =>
      buildReviewWindowSlice({
        candidateSessionsDesc: windowCandidateSessionsDesc,
        currentSessionsDesc: visibleSessionsDesc,
        window: reviewWindow,
        anchorMs: reviewWindowAnchorMs,
      }),
    [
      reviewWindow,
      reviewWindowAnchorMs,
      visibleSessionsDesc,
      windowCandidateSessionsDesc,
    ],
  );
  const currentSessionsDesc = reviewSlice.currentSessionsDesc;
  const diagnostics = model.reviewDiagnostics;
  const isInitialSkeleton = model.loadingState === "INITIAL_SKELETON";
  const pendingSections = model.activeTabPendingSections;
  const loadingAnnouncement = formatMessage(language, "common.status.loading");
  const environmentMatrixRows = diagnostics?.environmentMatrix ?? [];
  const archiveFinancialDetailsById =
    diagnostics?.archiveFinancialDetailsById ?? {};
  const capitalDiscipline: ReviewCapitalDisciplinePayload =
    diagnostics?.capitalDiscipline ?? {
      enabled: false,
      dangerSessionRate: 0,
      breachCount: 0,
      p70: 0,
      p85: 0,
      p100: 0,
      representativeProjectIds: [],
    };
  const marginSafetyViewModel =
    diagnostics?.marginSafety ?? EMPTY_MARGIN_SAFETY_VIEW_MODEL;
  const exitDiscipline = diagnostics?.exitDiscipline ?? {
    avgLossCutDelayBars: 0,
    dangerDelaySessionRate: 0,
    representativeProjectIds: [],
  };
  const currentSessionIdSet = useMemo(
    () => new Set(currentSessionsDesc.map((session) => session.id)),
    [currentSessionsDesc],
  );

  useEffect(() => {
    if (!linkedEnvironmentKey) {
      return;
    }
    if (
      environmentMatrixRows.some(
        (row) => row.environmentKey === linkedEnvironmentKey,
      )
    ) {
      return;
    }
    setLinkedEnvironmentKey("");
  }, [environmentMatrixRows, linkedEnvironmentKey]);

  useEffect(() => {
    setLinkedRepresentativeIds((current) => {
      const next = current.filter((projectId) =>
        currentSessionIdSet.has(projectId),
      );
      return next.length === current.length ? current : next;
    });
  }, [currentSessionIdSet]);

  const linkedSessionsDesc = useMemo(
    () =>
      linkedEnvironmentKey
        ? currentSessionsDesc.filter(
            (session) => session.environment.key === linkedEnvironmentKey,
          )
        : currentSessionsDesc,
    [currentSessionsDesc, linkedEnvironmentKey],
  );
  const linkedTrendProjectIds = useMemo(
    () =>
      linkedEnvironmentKey
        ? linkedSessionsDesc.map((session) => session.id).filter(Boolean)
        : [],
    [linkedEnvironmentKey, linkedSessionsDesc],
  );
  const linkedTrendBundle = useReplayReviewConsoleBundle({
    projectIds: linkedTrendProjectIds,
    window: "ALL",
    enabled: linkedEnvironmentKey !== "" && linkedTrendProjectIds.length > 0,
    onError,
  });
  const trendReport = linkedEnvironmentKey
    ? (linkedTrendBundle.bundle?.report ?? null)
    : model.reviewReport;
  const linkedSessionsAsc = useMemo(
    () => sortSessionsAscending(linkedSessionsDesc),
    [linkedSessionsDesc],
  );
  const linkedRepresentativeIdSet = useMemo(
    () => new Set(linkedRepresentativeIds),
    [linkedRepresentativeIds],
  );

  const toggleEnvironmentFocus = useCallback(
    (row: ReviewEnvironmentMatrixRow) => {
      setLinkedEnvironmentKey((current) =>
        current === row.environmentKey ? "" : row.environmentKey,
      );
      setLinkedRepresentativeIds(() =>
        linkedEnvironmentKey === row.environmentKey
          ? []
          : row.representativeProjectIds,
      );
    },
    [linkedEnvironmentKey],
  );

  const overviewCards = useMemo(
    () =>
      buildOverviewCards({
        slice: reviewSlice,
        history,
        ui,
        language,
        currentMetrics: model.reviewReport?.heroMetrics ?? null,
        previousMetrics: model.previousReviewReport?.heroMetrics ?? null,
      }),
    [
      history,
      language,
      model.previousReviewReport?.heroMetrics,
      model.reviewReport?.heroMetrics,
      reviewSlice,
      ui,
    ],
  );

  const marginSafetySummary = useMemo(
    () =>
      formatMessage(language, "uiLabels.ui.reviewMarginSafetySummaryTemplate", {
        totalCount: formatDiagnosticNumber(
          language,
          marginSafetyViewModel.sessionSafetyPoints.length,
          0,
        ),
        dangerCount: formatDiagnosticNumber(
          language,
          marginSafetyViewModel.dangerSessionCount,
          0,
        ),
        breachCount: formatDiagnosticNumber(
          language,
          marginSafetyViewModel.breachSessionCount,
          0,
        ),
        minBuffer: formatSignedRatio(
          marginSafetyViewModel.minSafetyBufferRate,
          history.formatRatio,
        ),
      }),
    [
      history,
      language,
      marginSafetyViewModel.breachSessionCount,
      marginSafetyViewModel.dangerSessionCount,
      marginSafetyViewModel.dangerSessionShare,
      marginSafetyViewModel.minSafetyBufferRate,
      marginSafetyViewModel.sessionSafetyPoints.length,
    ],
  );

  const marginSafetyOption = useMemo(
    () =>
      buildMarginSafetyOption({
        marginSafetyViewModel,
        history,
        language,
        ui,
      }),
    [history, language, marginSafetyViewModel, ui],
  );
  const hasMarginSafetyData =
    capitalDiscipline.enabled &&
    marginSafetyViewModel.sessionSafetyPoints.length > 0;
  const hasExitDisciplineData =
    diagnostics !== null && currentSessionsDesc.length > 0;

  const { archiveRows, archiveSectionLabels, archiveSessionById } =
    useReplayReviewArchiveRows({
      archiveFinancialDetailsById,
      history,
      language,
      linkedRepresentativeIdSet,
      linkedSessionsDesc,
      tradingSettingsText,
      ui,
    });
  const { openArchiveDetailWindow, renderArchiveDetailPreview } =
    useReplayReviewArchiveDetailWindow({
      archiveSessionById,
      history,
      isActive,
      language,
      onError,
      ui,
    });

  const archiveSessionsDesc = linkedSessionsDesc;
  const historyReadModelActions = useHistoryReviewReadModelActions(
    true,
    `${history.trainingProjects.length}:${history.historyProjectsNextCursor ?? ""}`,
  );
  const archiveSessionIdSet = useMemo(
    () => new Set(archiveSessionsDesc.map((session) => session.id)),
    [archiveSessionsDesc],
  );
  const canLoadMoreReviewArchive =
    historyReadModelActions.loadMoreArchive.enabled &&
    reviewWindow === "ALL" &&
    (Boolean(history.historyProjectsNextCursor) ||
      history.trainingProjects.length > reviewDisplayLimit);
  const loadMoreReviewArchive = useCallback(() => {
    const shouldRequestNextPage =
      history.trainingProjects.length <= reviewDisplayLimit &&
      Boolean(history.historyProjectsNextCursor) &&
      !history.isHistoryProjectsLoading &&
      !history.isHistoryProjectsLoadingMore;
    setReviewDisplayLimit((current) => current + HISTORY_PROJECT_PAGE_SIZE);
    if (!shouldRequestNextPage) {
      return;
    }
    void history.loadMoreTrainingProjects();
  }, [history, reviewDisplayLimit]);

  useEffect(() => {
    setSelectedArchiveIds((current) => {
      const next = current.filter((projectId) =>
        archiveSessionIdSet.has(projectId),
      );
      return next.length === current.length ? current : next;
    });
  }, [archiveSessionIdSet]);

  const deleteArchiveRows = useCallback(
    (projectIds: string[]) => {
      if (!historyReadModelActions.deleteSelectedProjects.enabled) {
        return;
      }
      const normalizedProjectIds = Array.from(
        new Set(
          projectIds
            .map((projectId) => String(projectId || "").trim())
            .filter(Boolean),
        ),
      );
      if (!normalizedProjectIds.length) {
        return;
      }
      const deletedIdSet = new Set(normalizedProjectIds);
      setSelectedArchiveIds((previous) =>
        previous.filter((projectId) => !deletedIdSet.has(projectId)),
      );
      if (normalizedProjectIds.length === 1) {
        history.deleteTrainingProject(normalizedProjectIds[0]!);
        return;
      }
      history.deleteTrainingProjects(normalizedProjectIds);
    },
    [history, historyReadModelActions.deleteSelectedProjects.enabled],
  );

  const startRenameArchiveRow = useCallback(
    (projectId: string) => {
      const project = history.trainingProjects.find(
        (item) => item.id === projectId,
      );
      if (!project) {
        return;
      }
      history.startRenameTrainingProject(project);
    },
    [history],
  );

  return (
    <WorkspacePageShell
      template="split-detail"
      className="diagnostic-center-page workspace-page--section-surface-only"
      bodyClassName="diagnostic-center-page-body"
      data-review-tab={activePageTab}
    >
      <WorkspaceFrameShell className="diagnostic-console-shell diagnostic-console-layout">
        <WorkspaceTopBar
          className="diagnostic-console-topbar diagnostic-console-topbar--flat"
          railClassName="diagnostic-console-tab-rail-wrap"
          toolsClassName="diagnostic-console-tools-row"
          data-i18n-slot="reviewHeader"
          data-i18n-critical="true"
          rail={
            <PlainTabBar
              value={activePageTab}
              items={pageTabOptions}
              onChange={setActivePageTab}
              ariaLabel={ui.navHistory}
              className="diagnostic-console-tab-rail"
              itemClassName="diagnostic-console-tab-rail-item"
            />
          }
          tools={
            <div className="diagnostic-console-slim-controls-tray diagnostic-console-tools-tray">
              <SelectField
                value={reviewWindow}
                onValueChange={(nextValue) =>
                  setReviewWindow(nextValue as ReplayReviewWindow)
                }
                aria-label={ui.reviewAggregationRange}
                options={reviewWindowOptions}
              />
            </div>
          }
        />

        {model.loadingState !== "READY" ? (
          <div className="sr-only" role="status" aria-live="polite">
            {loadingAnnouncement}
          </div>
        ) : null}

        {model.isHistoryPaginationStalled ? (
          <div className="diagnostic-console-pagination-recovery">
            <InlineFeedback
              feedback={{
                id: 1,
                tone: "error",
                message: formatMessage(language, "common.status.loadFailed"),
                autoHideMs: null,
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="xs"
              loading={history.isHistoryProjectsLoadingMore}
              loadingLabel={formatMessage(language, "appText.retry")}
              onClick={model.retryHistoryPagination}
            >
              {formatMessage(language, "appText.retry")}
            </Button>
          </div>
        ) : null}

        <div className="diagnostic-console-content">
          {activePageTab === "OVERVIEW" ? (
            isInitialSkeleton ? (
              <ReplayReviewOverviewSkeleton />
            ) : (
              <div className="diagnostic-console-panel diagnostic-console-panel--overview">
                <section className="diagnostic-console-section diagnostic-console-section--overview-kpis">
                  <div className="diagnostic-console-kpi-grid">
                    {overviewCards.map((card) => (
                      <OverviewKpiCard
                        key={card.key}
                        card={card}
                        isPending={pendingSections.overviewKpis}
                      />
                    ))}
                  </div>
                </section>

                <section className="diagnostic-console-section diagnostic-console-overview-main-grid">
                  <SurfaceCard className="diagnostic-console-chart-card diagnostic-console-overview-grid-card diagnostic-console-arena-card">
                    <div className="diagnostic-console-chart-head">
                      <div>
                        <h3 data-i18n-critical="true">
                          {ui.reviewAssetMatrixTitle}
                        </h3>
                      </div>
                      {pendingSections.overviewMatrix ? (
                        <DiagnosticPendingIndicator />
                      ) : null}
                    </div>
                    <div className="diagnostic-console-environment-table-wrap">
                      {environmentMatrixRows.length ? (
                        <table className="diagnostic-console-environment-table">
                          <colgroup>
                            <col className="diagnostic-console-environment-col diagnostic-console-environment-col--environment" />
                            <col className="diagnostic-console-environment-col diagnostic-console-environment-col--count" />
                            <col className="diagnostic-console-environment-col diagnostic-console-environment-col--metric" />
                            <col className="diagnostic-console-environment-col diagnostic-console-environment-col--metric" />
                            <col className="diagnostic-console-environment-col diagnostic-console-environment-col--metric" />
                          </colgroup>
                          <thead>
                            <tr>
                              <th className="diagnostic-console-environment-table-head diagnostic-console-environment-table-head--label">
                                {ui.reviewEnvironmentColumn}
                              </th>
                              <th className="diagnostic-console-environment-table-head diagnostic-console-environment-table-head--metric">
                                {ui.statsTrainings}
                              </th>
                              <th className="diagnostic-console-environment-table-head diagnostic-console-environment-table-head--metric">
                                {ui.reviewAvgRoiPerSession}
                              </th>
                              <th className="diagnostic-console-environment-table-head diagnostic-console-environment-table-head--metric">
                                {ui.metricProfitLossRatio}
                              </th>
                              <th className="diagnostic-console-environment-table-head diagnostic-console-environment-table-head--metric">
                                {ui.metricMaxDrawdown}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {environmentMatrixRows.map((row) => {
                              const isFocused =
                                linkedEnvironmentKey === row.environmentKey;
                              return (
                                <tr
                                  key={row.environmentKey}
                                  className={`diagnostic-console-environment-row ${
                                    isFocused ? "is-linked" : ""
                                  } diagnostic-console-environment-row--${
                                    row.sampleAdequacy === "SUFFICIENT"
                                      ? resolvePnlTone(row.expectancy)
                                      : "flat"
                                  }`}
                                  tabIndex={0}
                                  aria-selected={isFocused}
                                  onClick={() => toggleEnvironmentFocus(row)}
                                  onKeyDown={(event) => {
                                    if (
                                      !isTableRowSelectionActivationKey(
                                        event.key,
                                      )
                                    ) {
                                      return;
                                    }
                                    event.preventDefault();
                                    toggleEnvironmentFocus(row);
                                  }}
                                >
                                  <td>
                                    <div className="diagnostic-console-stack-cell">
                                      <strong>
                                        {resolveReviewEnvironmentLabel({
                                          context: row.context,
                                          language,
                                          tradingSettingsText,
                                        })}
                                      </strong>
                                      <span className="diagnostic-console-archive-meta-text">
                                        {resolveReviewArchiveEnvironmentLine({
                                          context: row.context,
                                          ui,
                                          language,
                                          tradingSettingsText,
                                        })}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="diagnostic-console-environment-metric-cell">
                                    <span className="diagnostic-console-environment-metric-value diagnostic-console-environment-metric-value--muted">
                                      {formatDiagnosticNumber(
                                        language,
                                        row.sessionCount,
                                        0,
                                      )}
                                    </span>
                                  </td>
                                  <td className="diagnostic-console-environment-metric-cell">
                                    <span
                                      className={`diagnostic-console-environment-metric-value tone-${resolvePnlTone(
                                        row.expectancy,
                                      )}`}
                                    >
                                      {formatSignedRatio(
                                        row.expectancy,
                                        history.formatRatio,
                                      )}
                                    </span>
                                  </td>
                                  <td className="diagnostic-console-environment-metric-cell">
                                    <span className="diagnostic-console-environment-metric-value">
                                      {formatReplayRatioMultiplier(
                                        row.profitLossRatio,
                                        row.profitLossRatioState,
                                        formatMessage(
                                          language,
                                          "common.metric.notAvailable",
                                        ),
                                      )}
                                    </span>
                                  </td>
                                  <td className="diagnostic-console-environment-metric-cell">
                                    <span
                                      className={`diagnostic-console-environment-metric-value tone-${
                                        row.maxDrawdownRate >= 0.22
                                          ? "down"
                                          : "flat"
                                      }`}
                                    >
                                      {history.formatRatio(row.maxDrawdownRate)}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <div className="diagnostic-console-empty-inline">
                          {ui.statsNoData}
                        </div>
                      )}
                    </div>
                  </SurfaceCard>

                  <SurfaceCard className="diagnostic-console-chart-card diagnostic-console-overview-grid-card diagnostic-console-chart-card-main">
                    <ReplayReviewTrendCard
                      sessionsAsc={linkedSessionsAsc}
                      highlightedSessionIds={linkedRepresentativeIds}
                      trendFacts={trendReport?.trendFacts ?? null}
                      ui={ui}
                      formatRatio={history.formatRatio}
                      onOpenSession={model.openReplayProject}
                      statusAdornment={
                        pendingSections.overviewTrend ||
                        linkedTrendBundle.isLoading ? (
                          <DiagnosticPendingIndicator />
                        ) : undefined
                      }
                    />
                  </SurfaceCard>
                </section>
              </div>
            )
          ) : null}

          {activePageTab === "BEHAVIOR" ? (
            isInitialSkeleton ? (
              <ReplayReviewBehaviorSkeleton />
            ) : (
              <div className="diagnostic-console-panel diagnostic-console-panel--behavior">
                <SurfaceCard className="diagnostic-console-chart-card diagnostic-console-behavior-card diagnostic-console-behavior-card--margin diagnostic-console-behavior-card--margin-full">
                  <div className="diagnostic-console-chart-head">
                    <div className="diagnostic-console-card-title">
                      <AppIcon
                        name="navStats"
                        className="diagnostic-console-card-title-icon"
                      />
                      <div>
                        <h3 data-i18n-critical="true">
                          {hasMarginSafetyData
                            ? ui.reviewMarginUtilizationTitle
                            : ui.reviewBehaviorExitDiscipline}
                        </h3>
                      </div>
                    </div>
                    {pendingSections.behaviorMargin ? (
                      <DiagnosticPendingIndicator />
                    ) : null}
                  </div>
                  {hasMarginSafetyData ? (
                    <div className="diagnostic-console-margin-layout">
                      <div className="diagnostic-console-margin-insight-panel">
                        <div className="diagnostic-console-inline-metric-strip diagnostic-console-inline-metric-strip--margin-full">
                          <BehaviorCompactMetric
                            label={ui.reviewBehaviorDangerPositionRateLabel}
                            labelTooltip={
                              ui.reviewBehaviorDangerPositionRateTooltip
                            }
                            value={history.formatRatio(
                              marginSafetyViewModel.dangerSessionShare,
                            )}
                            tone={
                              marginSafetyViewModel.dangerSessionShare >= 0.35
                                ? "down"
                                : "flat"
                            }
                          />
                          <BehaviorCompactMetric
                            label={ui.reviewMarginWarnLabel}
                            labelTooltip={ui.reviewMarginWarnTooltip}
                            value={formatSignedRatio(
                              marginSafetyViewModel.minSafetyBufferRate,
                              history.formatRatio,
                            )}
                            tone={resolveMarginSafetyTone(
                              marginSafetyViewModel.minSafetyBufferRate,
                            )}
                          />
                          <BehaviorCompactMetric
                            label={ui.reviewMarginBreachLabel}
                            labelTooltip={ui.reviewMarginBreachTooltip}
                            value={formatDiagnosticNumber(
                              language,
                              marginSafetyViewModel.breachSessionCount,
                              0,
                            )}
                            tone={
                              marginSafetyViewModel.breachSessionCount > 0
                                ? "down"
                                : "flat"
                            }
                          />
                        </div>
                        <div className="diagnostic-console-margin-summary">
                          <p>{marginSafetySummary}</p>
                        </div>
                        <MarginZoneDistribution
                          viewModel={marginSafetyViewModel}
                          ui={ui}
                          history={history}
                          language={language}
                        />
                        <MarginWorstSessionList
                          points={marginSafetyViewModel.worstSessionPoints}
                          ui={ui}
                          history={history}
                          onOpenSession={model.openReplayProject}
                        />
                      </div>
                      <div className="diagnostic-console-margin-chart-panel">
                        <EChartSurface
                          option={marginSafetyOption}
                          className="diagnostic-console-chart diagnostic-console-chart-short diagnostic-console-chart-short--behavior-margin-full"
                          onPointClick={(dataIndex) => {
                            const point =
                              marginSafetyViewModel.sessionSafetyPoints[
                                dataIndex
                              ];
                            if (!point) {
                              return;
                            }
                            model.openReplayProject(point.sessionId);
                          }}
                        />
                      </div>
                    </div>
                  ) : hasExitDisciplineData ? (
                    <div className="diagnostic-console-margin-layout">
                      <div className="diagnostic-console-margin-insight-panel">
                        <div className="diagnostic-console-inline-metric-strip diagnostic-console-inline-metric-strip--margin-full">
                          <BehaviorCompactMetric
                            label={ui.reviewBehaviorAvgLossDelayLabel}
                            value={`${formatDiagnosticNumber(
                              language,
                              exitDiscipline.avgLossCutDelayBars,
                              1,
                            )} ${ui.statsUnitBars}`}
                            tone={
                              exitDiscipline.avgLossCutDelayBars >= 3
                                ? "down"
                                : "flat"
                            }
                          />
                          <BehaviorCompactMetric
                            label={ui.reviewBehaviorDangerDelayRateLabel}
                            value={history.formatRatio(
                              exitDiscipline.dangerDelaySessionRate,
                            )}
                            tone={
                              exitDiscipline.dangerDelaySessionRate >= 0.25
                                ? "down"
                                : "flat"
                            }
                          />
                        </div>
                        <div className="diagnostic-console-margin-summary">
                          <p>{ui.reviewBehaviorExitDisciplineSubtitle}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="diagnostic-console-empty-state">
                      <span>{ui.statsNoData}</span>
                    </div>
                  )}
                </SurfaceCard>
              </div>
            )
          ) : null}

          {activePageTab === "ARCHIVE" ? (
            isInitialSkeleton ? (
              <ReplayReviewArchiveSkeleton />
            ) : (
              <div className="diagnostic-console-panel diagnostic-console-panel--archive">
                <section className="diagnostic-console-logs diagnostic-console-table-panel">
                  <ReplayReviewArchiveSection
                    rows={archiveRows}
                    labels={archiveSectionLabels}
                    selectedRowIds={selectedArchiveIds}
                    onSelectedRowIdsChange={setSelectedArchiveIds}
                    onDeleteRows={deleteArchiveRows}
                    onDeleteAll={() => {
                      setSelectedArchiveIds([]);
                      history.clearAllTrainingProjects();
                    }}
                    canDeleteAll={
                      historyReadModelActions.deleteAllProjects.enabled
                    }
                    editingRowId={history.editingProjectId}
                    editingRowName={history.editingProjectName}
                    onStartRenameRow={startRenameArchiveRow}
                    onEditingRowNameChange={history.setEditingProjectName}
                    onSaveRenameRow={history.saveRenameTrainingProject}
                    onCancelRenameRow={history.cancelRenameTrainingProject}
                    detailMode="window"
                    renderDetailPreview={renderArchiveDetailPreview}
                    onOpenDetailWindow={(row) => {
                      void openArchiveDetailWindow(row);
                    }}
                    canLoadMore={canLoadMoreReviewArchive}
                    isLoadingMore={history.isHistoryProjectsLoadingMore}
                    onLoadMore={loadMoreReviewArchive}
                    statusAdornment={
                      pendingSections.archiveTable ? (
                        <DiagnosticPendingIndicator />
                      ) : undefined
                    }
                  />
                </section>
              </div>
            )
          ) : null}
        </div>
      </WorkspaceFrameShell>

      <ReplayDialogContent
        activeReplayProject={model.activeReplayProject}
        isLoading={model.isActiveReplayLoading}
        history={history}
        ui={ui}
        language={language}
        open={Boolean(model.activeReplayProjectId)}
        onOpenChange={(open) => {
          if (!open) {
            model.closeReplayProject();
          }
        }}
      />
    </WorkspacePageShell>
  );
};
