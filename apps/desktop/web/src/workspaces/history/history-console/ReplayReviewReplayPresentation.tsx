// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo, useRef, useState } from "react";
import type { ArchivedReplayData } from "@/domains/history/replayArchiveTypes";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import { api, type ApiTrainingProject } from "@/api";
import { SurfaceCard } from "@/ui/primitives/surface-card";
import { formatMessage } from "@zinuto/shared/i18n";
import {
  isDisplayPeriodKey,
  type AppUiLanguage,
} from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import { VendorIcon } from "@/assets/graphics";
import { formatDotJoinedText } from "@/ui/formatting/i18nDisplay";
import {
  HistoryReplayChartView,
  type HistoryReplayChartViewProps,
} from "@/domains/chart/HistoryReplayChart";
import { resolveReplayDisplayPeriod } from "@/domains/chart/replayDisplayPeriod";
import { useReplayReviewConsoleModel } from "@/workspaces/history/history-console/useReplayReviewConsoleModel";
import type { ReplayReviewSessionMetric } from "@/workspaces/history/history-console/types";
import {
  formatDiagnosticNumber,
  formatSignedMoney,
  formatSignedRatio,
  formatTooltipDateTime,
  resolvePnlTone,
  type ReplayReviewConsoleHistoryDeps,
} from "@/workspaces/history/history-console/ReplayReviewConsoleModel";

export const ReplayDialogContent = ({
  activeReplayProject,
  isLoading,
  history,
  ui,
  language,
  open,
  onOpenChange,
}: {
  activeReplayProject: ReturnType<
    typeof useReplayReviewConsoleModel
  >["activeReplayProject"];
  isLoading: boolean;
  history: ReplayReviewConsoleHistoryDeps;
  ui: UiLabelEntry;
  language: AppUiLanguage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const replayWindowOpenedRef = useRef(false);
  const replayWindowRevisionRef = useRef(0);
  const replayProject: NonNullable<HistoryReplayChartViewProps["project"]> | null =
    activeReplayProject
      ? {
          id: activeReplayProject.project.id,
          symbol: activeReplayProject.project.symbol,
          replay: activeReplayProject.detail.replay as NonNullable<
            HistoryReplayChartViewProps["project"]
          >["replay"],
        }
      : null;
  const initialReplayDisplayPeriod = useMemo<DisplayPeriodKey>(
    () =>
      resolveReplayDisplayPeriod({
        replay: replayProject?.replay,
        baseTimeframe: activeReplayProject?.project.baseTimeframe,
      }),
    [activeReplayProject?.project.baseTimeframe, replayProject?.replay],
  );
  const [replayDisplayPeriod, setReplayDisplayPeriod] =
    useState<DisplayPeriodKey>(initialReplayDisplayPeriod);

  useEffect(() => {
    setReplayDisplayPeriod(initialReplayDisplayPeriod);
  }, [activeReplayProject?.project.id, initialReplayDisplayPeriod]);

  const sessionMetric = activeReplayProject
    ? {
        totalPnl: activeReplayProject.project.totalPnl,
        totalTrades: activeReplayProject.project.totalTrades,
        drawdown: activeReplayProject.project.summary?.maxDrawdownRate ?? 0,
        returnRate: activeReplayProject.project.profitRate,
      }
    : null;

  const dialogMeta = activeReplayProject
    ? formatDotJoinedText(language, [
        activeReplayProject.project.symbol,
        activeReplayProject.project.baseTimeframe,
        formatTooltipDateTime(
          activeReplayProject.project.createdAt || activeReplayProject.project.updatedAt,
        ),
      ])
    : "";

  const replayWindowInput = useMemo(() => {
    if (!open || isLoading || !activeReplayProject || !replayProject) {
      return null;
    }
    return {
      kind: "FREE_REPLAY_REPLAY" as const,
      title: activeReplayProject.project.name || ui.historyReplayAction,
      payload: {
        title: activeReplayProject.project.name || ui.historyReplayAction,
        meta: dialogMeta,
        project: replayProject,
        displayPeriod: replayDisplayPeriod,
        trainerPeriodOptionsByBase: history.trainerPeriodOptionsByBase,
        initialDisplayPeriod: initialReplayDisplayPeriod,
        chartRenderMode: history.chartRenderMode,
        showVolumePane: true,
        metrics: [
          {
            label: ui.metricTotalPnl,
            value: formatSignedMoney(sessionMetric?.totalPnl ?? 0, history.formatMoney),
            tone: resolvePnlTone(sessionMetric?.totalPnl ?? 0),
          },
          {
            label: ui.metricTotalTrades,
            value: formatDiagnosticNumber(
              language,
              sessionMetric?.totalTrades ?? 0,
              0,
            ),
          },
          {
            label: ui.metricTotalReturnRate,
            value: formatSignedRatio(
              sessionMetric?.returnRate ?? 0,
              history.formatRatio,
            ),
            tone: resolvePnlTone(sessionMetric?.returnRate ?? 0),
          },
          {
            label: ui.metricMaxDrawdown,
            value: history.formatRatio(sessionMetric?.drawdown ?? 0),
            tone: "down" as const,
          },
        ],
        noteAction: replayProject.replay
          ? {
              trainingProjectId: activeReplayProject.project.id,
              contextReplay: replayProject.replay,
              label: formatMessage(
                language,
                "uiLabels.ui.commandCenterRecentNoteLabel",
              ),
            }
          : undefined,
      },
    };
  }, [
    activeReplayProject,
    dialogMeta,
    history.chartRenderMode,
    history.formatMoney,
    history.formatRatio,
    history.trainerPeriodOptionsByBase,
    initialReplayDisplayPeriod,
    isLoading,
    language,
    open,
    replayProject,
    replayDisplayPeriod,
    sessionMetric?.drawdown,
    sessionMetric?.returnRate,
    sessionMetric?.totalPnl,
    sessionMetric?.totalTrades,
    ui.historyReplayAction,
    ui.metricMaxDrawdown,
    ui.metricTotalPnl,
    ui.metricTotalReturnRate,
    ui.metricTotalTrades,
  ]);

  useEffect(() => {
    if (!replayWindowInput) {
      replayWindowOpenedRef.current = false;
      replayWindowRevisionRef.current = 0;
      return;
    }
    if (replayWindowOpenedRef.current) {
      void api
        .publishDesktopSecondaryWindowState(replayWindowInput)
        .then((state) => {
          replayWindowRevisionRef.current = state.revision;
        })
        .catch(() => {
          replayWindowOpenedRef.current = false;
          replayWindowRevisionRef.current = 0;
        });
      return;
    }
    replayWindowOpenedRef.current = true;
    void api
      .openDesktopSecondaryWindow(replayWindowInput)
      .then((state) => {
        replayWindowRevisionRef.current = state.revision;
      })
      .catch(() => {
        replayWindowOpenedRef.current = false;
        replayWindowRevisionRef.current = 0;
      });
  }, [replayWindowInput]);

  useEffect(
    () =>
      api.subscribeDesktopSecondaryWindowActions((message) => {
        if (message.kind !== "FREE_REPLAY_REPLAY") {
          return;
        }
        if (
          !api.isCurrentDesktopSecondaryWindowAction(
            message,
            replayWindowRevisionRef.current,
          )
        ) {
          return;
        }
        if (message.action === "WINDOW_CLOSED") {
          replayWindowOpenedRef.current = false;
          replayWindowRevisionRef.current = 0;
          onOpenChange(false);
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
          if (isDisplayPeriodKey(period)) {
            history.setTrainerDisplayPeriod(period);
            setReplayDisplayPeriod(period);
          }
          return;
        }
        if (message.action === "SET_CHART_RENDER_MODE") {
          const mode = String(payload.mode || "").trim();
          if (mode) {
            history.setChartRenderMode(
              mode as Parameters<typeof history.setChartRenderMode>[0],
            );
          }
          return;
        }
        if (message.action === "CREATE_REPLAY_NOTE") {
          const trainingProjectId = String(payload.trainingProjectId || "").trim();
          if (trainingProjectId && payload.contextReplay) {
            history.createHistoryReviewReplayNote({
              trainingProjectId,
              contextReplay: payload.contextReplay as ArchivedReplayData,
              contextDisplayPeriod:
                (payload.contextDisplayPeriod as DisplayPeriodKey | undefined) ??
                replayDisplayPeriod,
            });
          }
          onOpenChange(false);
        }
      }),
    [
      history,
      onOpenChange,
      replayDisplayPeriod,
    ],
  );

  return null;
};

export const ArchiveReplayDrawerPreview = ({
  session,
  history,
  ui,
  language,
}: {
  session: ReplayReviewSessionMetric;
  history: ReplayReviewConsoleHistoryDeps;
  ui: UiLabelEntry;
  language: AppUiLanguage;
}) => {
  const projectId = session.project.id;
  const [resolvedDetail, setResolvedDetail] = useState<ApiTrainingProject | null>(
    session.detail,
  );
  const [isReplayDetailLoading, setIsReplayDetailLoading] = useState(false);

  useEffect(() => {
    setResolvedDetail(session.detail);
  }, [projectId, session.detail]);

  const resolvedReplay =
    session.detail?.replay ??
    resolvedDetail?.replay ??
    session.project.replay;
  const hasResolvedReplay = Boolean(resolvedReplay);

  useEffect(() => {
    if (hasResolvedReplay) {
      setIsReplayDetailLoading(false);
      return;
    }
    if (!projectId) {
      setResolvedDetail(null);
      setIsReplayDetailLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsReplayDetailLoading(true);
    void api
      .getTrainingProject(projectId, {
        signal: controller.signal,
      })
      .then((detail) => {
        if (controller.signal.aborted) {
          return;
        }
        setResolvedDetail(detail);
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }
        setResolvedDetail(null);
      })
      .finally(() => {
        if (controller.signal.aborted) {
          return;
        }
        setIsReplayDetailLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [hasResolvedReplay, projectId]);

  const replayProject: NonNullable<HistoryReplayChartViewProps["project"]> | null =
    resolvedReplay
      ? {
          id: session.project.id,
          symbol: session.project.symbol,
          replay: resolvedReplay as NonNullable<
            HistoryReplayChartViewProps["project"]
          >["replay"],
        }
      : null;
  const initialReplayDisplayPeriod = useMemo<DisplayPeriodKey>(
    () =>
      resolveReplayDisplayPeriod({
        replay: replayProject?.replay,
        baseTimeframe: session.project.baseTimeframe,
      }),
    [replayProject?.replay, session.project.baseTimeframe],
  );
  const [displayPeriod, setDisplayPeriod] =
    useState<DisplayPeriodKey>(initialReplayDisplayPeriod);

  useEffect(() => {
    setDisplayPeriod(initialReplayDisplayPeriod);
  }, [initialReplayDisplayPeriod, projectId]);

  if (isReplayDetailLoading && !replayProject?.replay) {
    return (
      <SurfaceCard className="rounded-xl p-0">
        <div className="flex min-h-[320px] items-center justify-center gap-2 px-4 py-5 text-r2 text-[color:var(--text-subtle)]">
          <VendorIcon name="loaderCircle" className="size-5 animate-spin" />
          {ui.statsLoading}
        </div>
      </SurfaceCard>
    );
  }

  if (!replayProject?.replay) {
    return (
      <SurfaceCard className="rounded-xl p-0">
        <div className="flex min-h-[320px] items-center justify-center px-4 py-5 text-r2 text-[color:var(--text-subtle)]">
          {ui.statsNoData}
        </div>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard className="overflow-hidden rounded-xl p-0">
      <div className="h-[360px] min-h-[320px] w-full">
        <HistoryReplayChartView
          project={replayProject}
          themeMode={history.effectiveThemeMode}
          showGlobalDecimals={history.showGlobalDecimals}
          priceColorMode={history.priceColorMode}
          tradeColorTheme={history.tradeColorTheme}
          language={language}
          displayPeriod={displayPeriod}
          trainerPeriodOptionsByBase={history.trainerPeriodOptionsByBase}
          bindings={history.historyReplayChartBindings}
          initialDisplayPeriod={initialReplayDisplayPeriod}
          createSystemMarkers={history.createSystemMarkers}
          chartRenderMode={history.chartRenderMode}
          onChartRenderModeChange={history.setChartRenderMode}
          onDisplayPeriodChange={(period) => {
            setDisplayPeriod(period);
            history.setTrainerDisplayPeriod(period);
          }}
          showChartRenderModeSwitch
          showIndicatorButton
          isChartSettingsActive={history.showChartSettingsModal}
          onOpenChartSettings={history.openChartSettingsModal}
          showVolumePane
        />
      </div>
    </SurfaceCard>
  );
};
