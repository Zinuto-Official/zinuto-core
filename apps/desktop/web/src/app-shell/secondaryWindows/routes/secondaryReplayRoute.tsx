// SPDX-License-Identifier: GPL-3.0-only

import "@/styles/popup-replay.css";

import {
  useEffect,
  useState,
  type ComponentProps,
} from "react";
import { Button } from "@/ui/primitives/button";
import {
  closeCurrentDesktopSecondaryWindow,
  sendDesktopSecondaryWindowRouteAction,
} from "@/app-shell/secondaryWindows/desktopSecondaryWindowBridge";
import { useHistoryReplayChartBindings } from "@/domains/chart/useHistoryReplayChartBindings";
import { useArchivedSystemMarkerRenderer } from "@/domains/chart/useArchivedSystemMarkerRenderer";
import { useLocalizedDisplayTextModel } from "@/app-shell/useLocalizedDisplayTextModel";
import {
  HistoryReplayChartView,
  HistoryReplayChartViewProps,
} from "@/domains/chart/HistoryReplayChart";
import { AppResetSummaryPanel } from "@/app-shell/AppResetSummaryDialog";
import { AppIcon } from "@/assets/graphics/AppIcons";
import { CurveSparkline } from "@/assets/graphics/CurveSparkline";
import { tt, ttf } from "@/frontend-kernel/i18n/messageRuntime";
import type { TrainingSummary } from "@/domains/training/types";
import {
  SecondaryWindowRoutePlaceholder,
  type SecondaryWindowRouteProps,
} from "@/app-shell/secondaryWindows/routes/secondaryWindowRouteTypes";
import type { ReplayContextMetricTone } from "@/frontend-kernel/replayContext";

type ReplayChartSecondaryMetric = {
  label: string;
  value: string;
  tone?: ReplayContextMetricTone;
};

type ReplayChartSecondaryBadge = {
  label: string;
  tone?: "default" | "secondary" | "outline" | "destructive";
};

type ReplayChartSecondaryPayload = {
  title: string;
  meta?: string;
  project: HistoryReplayChartViewProps["project"];
  displayPeriod?: HistoryReplayChartViewProps["displayPeriod"];
  trainerPeriodOptionsByBase: HistoryReplayChartViewProps["trainerPeriodOptionsByBase"];
  initialDisplayPeriod?: HistoryReplayChartViewProps["initialDisplayPeriod"];
  chartRenderMode?: HistoryReplayChartViewProps["chartRenderMode"];
  metrics?: ReplayChartSecondaryMetric[];
  badges?: ReplayChartSecondaryBadge[];
  noteAction?: {
    trainingProjectId: string;
    contextReplay: unknown;
    label: string;
  };
  showVolumePane?: boolean;
  hideLastPriceLine?: boolean;
};

const isReplayChartSecondaryPayload = (
  value: unknown,
): value is ReplayChartSecondaryPayload =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Boolean((value as ReplayChartSecondaryPayload).project);

type SettlementDetailPayload = {
  title: string;
  description: string;
  summary: TrainingSummary;
  replayMetrics: {
    initialCapital: number;
    finalEquity: number;
    equityReturnRate: number;
    equityCurve: ComponentProps<typeof CurveSparkline>["points"];
  };
  baseTimeframe: ComponentProps<typeof CurveSparkline>["baseTimeframe"];
  language: ComponentProps<typeof CurveSparkline>["language"];
  themeMode: ComponentProps<typeof CurveSparkline>["themeMode"];
  createHistoryReviewNoteLabel?: string;
  canCreateHistoryReviewNote?: boolean;
  isActionBlocked?: boolean;
};

const isSettlementDetailPayload = (
  value: unknown,
): value is SettlementDetailPayload =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Boolean((value as SettlementDetailPayload).summary) &&
  Boolean((value as SettlementDetailPayload).replayMetrics);

const ReplayChartSecondaryWindow = ({
  state,
  language,
  themeMode,
  showGlobalDecimals,
  priceColorMode,
  tradeColorTheme,
}: SecondaryWindowRouteProps) => {
  const bindings = useHistoryReplayChartBindings();
  const createSystemMarkers = useArchivedSystemMarkerRenderer(language);
  const [displayPeriod, setDisplayPeriod] =
    useState<HistoryReplayChartViewProps["displayPeriod"]>(undefined);
  const [chartRenderMode, setChartRenderMode] =
    useState<HistoryReplayChartViewProps["chartRenderMode"]>(undefined);

  useEffect(() => {
    if (!isReplayChartSecondaryPayload(state.payload)) {
      return;
    }
    setDisplayPeriod(state.payload.displayPeriod);
    setChartRenderMode(state.payload.chartRenderMode);
  }, [state.revision, state.payload]);

  if (!isReplayChartSecondaryPayload(state.payload)) {
    return <SecondaryWindowRoutePlaceholder state={state} />;
  }

  const payload = state.payload;
  const emit = (action: string, nextPayload?: unknown) => {
    void sendDesktopSecondaryWindowRouteAction(state, action, nextPayload).catch(
      () => undefined,
    );
  };

  return (
    <section className="desktop-secondary-window-panel desktop-secondary-window-replay">
      <header className="desktop-secondary-window-replay-header">
        <div className="desktop-secondary-window-replay-title-block">
          <h1>{payload.title}</h1>
          {payload.meta ? <p>{payload.meta}</p> : null}
          {payload.badges?.length ? (
            <div className="desktop-secondary-window-replay-badges">
              {payload.badges.map((badge, index) => (
                <span
                  key={`${badge.label}-${index}`}
                  className={`desktop-secondary-window-replay-badge is-${badge.tone ?? "outline"}`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {payload.noteAction ? (
          <Button
            type="button"
            size="sm"
            className="desktop-secondary-window-replay-note-action"
            onClick={() => {
              emit("CREATE_REPLAY_NOTE", {
                ...payload.noteAction,
                contextDisplayPeriod: displayPeriod,
              });
              void closeCurrentDesktopSecondaryWindow();
            }}
          >
            <AppIcon name="actionAdd" />
            <span>{payload.noteAction.label}</span>
          </Button>
        ) : null}
      </header>
      <div className="desktop-secondary-window-replay-body">
        <div className="desktop-secondary-window-replay-chart">
          <HistoryReplayChartView
            project={payload.project}
            themeMode={themeMode}
            showGlobalDecimals={showGlobalDecimals}
            priceColorMode={priceColorMode}
            tradeColorTheme={tradeColorTheme}
            language={language}
            displayPeriod={displayPeriod}
            trainerPeriodOptionsByBase={payload.trainerPeriodOptionsByBase}
            bindings={bindings}
            initialDisplayPeriod={payload.initialDisplayPeriod}
            createSystemMarkers={createSystemMarkers}
            chartRenderMode={chartRenderMode}
            onChartRenderModeChange={(mode) => {
              setChartRenderMode(mode);
              emit("SET_CHART_RENDER_MODE", { mode });
            }}
            onDisplayPeriodChange={(period) => {
              setDisplayPeriod(period);
              emit("SET_DISPLAY_PERIOD", { period });
            }}
            showChartRenderModeSwitch
            showIndicatorButton
            showVolumePane={payload.showVolumePane}
            hideLastPriceLine={payload.hideLastPriceLine}
          />
        </div>
        {payload.metrics?.length ? (
          <aside className="desktop-secondary-window-replay-metrics">
            {payload.metrics.map((metric, index) => (
              <div
                key={`${metric.label}-${index}`}
                className={`desktop-secondary-window-replay-metric tone-${metric.tone ?? "flat"}`}
              >
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </aside>
        ) : null}
      </div>
    </section>
  );
};

const SettlementDetailSecondaryWindow = ({
  state,
  language,
  themeMode,
}: SecondaryWindowRouteProps) => {
  const displayText = useLocalizedDisplayTextModel(language);

  if (!isSettlementDetailPayload(state.payload)) {
    return <SecondaryWindowRoutePlaceholder state={state} />;
  }

  const payload = state.payload;
  const emit = (action: string) => {
    void sendDesktopSecondaryWindowRouteAction(state, action).catch(
      () => undefined,
    );
  };

  return (
    <section className="desktop-secondary-window-panel desktop-secondary-window-settlement training-summary-dialog">
      <AppResetSummaryPanel
        title={payload.title}
        description={payload.description}
        summary={payload.summary}
        replayMetrics={payload.replayMetrics}
        withCountUnit={displayText.withCountUnit}
        withBuySellCount={displayText.withBuySellCount}
        curveContent={
          <CurveSparkline
            points={payload.replayMetrics.equityCurve}
            className="equity"
            initialCapital={payload.replayMetrics.initialCapital}
            baseTimeframe={payload.baseTimeframe}
            language={payload.language}
            themeMode={payload.themeMode || themeMode}
          />
        }
        onClose={() => {
          emit("CLOSE");
          void closeCurrentDesktopSecondaryWindow();
        }}
        onConfirm={() => {
          emit("CONFIRM");
          void closeCurrentDesktopSecondaryWindow();
        }}
        onCreateHistoryReviewNote={() => emit("CREATE_HISTORY_REVIEW_NOTE")}
        createHistoryReviewNoteLabel={payload.createHistoryReviewNoteLabel}
        isCreateHistoryReviewNoteDisabled={!payload.canCreateHistoryReviewNote}
        isActionBlocked={Boolean(payload.isActionBlocked)}
        tt={tt}
        ttf={ttf}
      />
    </section>
  );
};

const SecondaryReplayRoute = (props: SecondaryWindowRouteProps) => {
  if (props.kind === "FREE_REPLAY_SETTLEMENT_DETAIL") {
    return <SettlementDetailSecondaryWindow {...props} />;
  }

  return <ReplayChartSecondaryWindow {...props} />;
};

export default SecondaryReplayRoute;
