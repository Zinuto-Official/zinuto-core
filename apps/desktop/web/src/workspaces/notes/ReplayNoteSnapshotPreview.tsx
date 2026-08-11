// SPDX-License-Identifier: GPL-3.0-only

import { memo, useCallback } from "react";
import { Button } from "@/ui/primitives/button";
import { HistoryReplayChartView } from "@/domains/chart/HistoryReplayChart";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import { VendorIcon } from "@/assets/graphics";
import {
  areReplayNoteSnapshotChartPropsEqual,
  type ReplayNoteSnapshotChartProps,
} from "@/workspaces/notes/replayNoteSnapshotPreviewModel";

const ReplayNoteSnapshotLoadingBlock = ({
  className,
}: {
  className?: string;
}) => (
  <div
    className={`replay-note-snapshot-loading-block ${className ?? ""}`.trim()}
    aria-hidden="true"
  />
);

const ReplayNoteSnapshotLoadingShell = () => (
  <div className="replay-note-snapshot-loading-shell" aria-hidden="true">
    <div className="replay-note-snapshot-loading-toolbar">
      <ReplayNoteSnapshotLoadingBlock className="is-toolbar-origin" />
      <ReplayNoteSnapshotLoadingBlock className="is-toolbar-controls" />
    </div>
    <ReplayNoteSnapshotLoadingBlock className="is-chart" />
    <div className="replay-note-snapshot-loading-metrics">
      <ReplayNoteSnapshotLoadingBlock className="is-metric" />
      <ReplayNoteSnapshotLoadingBlock className="is-metric" />
      <ReplayNoteSnapshotLoadingBlock className="is-metric is-short" />
    </div>
  </div>
);

const ReplayNoteSnapshotChartView = ({
  noteId,
  project,
  themeMode,
  showGlobalDecimals,
  priceColorMode,
  tradeColorTheme,
  createSystemMarkers,
  language,
  chartRenderMode,
  onChartRenderModeChange,
  trainerPeriodOptionsByBase,
  bindings,
  initialDisplayPeriod,
  displayPeriod,
  onDisplayPeriodChange,
  chartBodyVisible = true,
  toolbarLeadingContent,
  hideLastPriceLine = false,
  emptyLabel = "",
  overlay = null,
}: ReplayNoteSnapshotChartProps) => {
  const handleDisplayPeriodChange = useCallback(
    (period: DisplayPeriodKey) => {
      onDisplayPeriodChange?.(noteId, period);
    },
    [noteId, onDisplayPeriodChange],
  );
  const hasChart = Boolean(project);

  return (
    <div
      className="replay-note-training-snapshot-node"
      data-chart-body-visible={chartBodyVisible ? "true" : "false"}
      data-overlay-mode={overlay?.mode ?? undefined}
    >
      <div className="replay-note-training-snapshot-node-inner">
        <div className="training-note-snapshot-chart-block">
          {hasChart ? (
            <HistoryReplayChartView
              project={project}
              themeMode={themeMode}
              showGlobalDecimals={showGlobalDecimals}
              priceColorMode={priceColorMode}
              tradeColorTheme={tradeColorTheme}
              createSystemMarkers={createSystemMarkers}
              language={language}
              chartRenderMode={chartRenderMode}
              onChartRenderModeChange={onChartRenderModeChange}
              trainerPeriodOptionsByBase={trainerPeriodOptionsByBase}
              bindings={bindings}
              initialDisplayPeriod={initialDisplayPeriod}
              displayPeriod={displayPeriod}
              onDisplayPeriodChange={
                onDisplayPeriodChange ? handleDisplayPeriodChange : undefined
              }
              toolbarLeadingContent={toolbarLeadingContent}
              hideLastPriceLine={hideLastPriceLine}
              showIndicatorButton={false}
              showSubIndicatorToggle
              defaultShowSubIndicators={false}
            />
          ) : overlay?.mode === "loading" ? (
            <ReplayNoteSnapshotLoadingShell />
          ) : (
            <div className="empty-text history-preview-empty history-preview-watermark">
              {emptyLabel}
            </div>
          )}
          {overlay ? (
            <div
              className={`replay-note-snapshot-status-overlay is-${overlay.mode}`}
              role={overlay.mode === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              <div className="replay-note-snapshot-status-overlay-backdrop" />
              <div className="replay-note-snapshot-status-card">
                <div className="replay-note-snapshot-status-icon-wrap">
                  <VendorIcon
                    name={
                      overlay.mode === "error" ? "circleAlert" : "loaderCircle"
                    }
                    className={`size-4 ${
                      overlay.mode === "loading" ? "animate-spin" : ""
                    }`.trim()}
                  />
                </div>
                <div className="replay-note-snapshot-status-copy">
                  <strong>{overlay.heading}</strong>
                  {overlay.mode === "loading" && overlay.body ? (
                    <span>{overlay.body}</span>
                  ) : null}
                </div>
                {overlay.mode === "error" && overlay.onRetry ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="replay-note-snapshot-status-action"
                    onClick={overlay.onRetry}
                  >
                    {overlay.retryLabel ?? overlay.heading}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export const ReplayNoteSnapshotChart = memo(
  ReplayNoteSnapshotChartView,
  areReplayNoteSnapshotChartPropsEqual,
);
