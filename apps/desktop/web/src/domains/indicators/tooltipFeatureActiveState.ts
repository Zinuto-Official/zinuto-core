// SPDX-License-Identifier: GPL-3.0-only

import type { Chart } from "klinecharts";

const UPDATE_LEVEL_OVERLAY = 1;

type InternalTooltipView = {
  _activeFeatureInfo?: unknown;
};

type InternalMainWidget = {
  _tooltipView?: InternalTooltipView;
};

type InternalDrawPane = {
  getId?: () => string;
  getMainWidget?: () => InternalMainWidget | null;
};

type InternalChart = Chart & {
  getDrawPaneById?: (paneId: string) => InternalDrawPane | null;
  getDrawPanes?: () => InternalDrawPane[];
  updatePane?: (level: number, paneId?: string) => void;
};

const clearPaneTooltipFeatureActiveState = (
  pane: InternalDrawPane | null | undefined,
): boolean => {
  const tooltipView = pane?.getMainWidget?.()?._tooltipView;
  if (!tooltipView || tooltipView._activeFeatureInfo == null) {
    return false;
  }
  tooltipView._activeFeatureInfo = null;
  return true;
};

export const clearIndicatorTooltipFeatureActiveState = (
  chart: Chart,
  paneId?: string | null,
): void => {
  // klinecharts keeps tooltip features active after click until the next pointer move.
  // Clear that internal flag directly so hover feedback stays intact without leaving a stuck highlight.
  const internalChart = chart as InternalChart;
  if (paneId && typeof internalChart.getDrawPaneById === "function") {
    const targetPane = internalChart.getDrawPaneById(paneId);
    if (clearPaneTooltipFeatureActiveState(targetPane)) {
      internalChart.updatePane?.(UPDATE_LEVEL_OVERLAY, paneId);
      return;
    }
  }

  if (typeof internalChart.getDrawPanes !== "function") {
    return;
  }

  const panes = internalChart.getDrawPanes();
  let cleared = false;
  panes.forEach((pane) => {
    if (clearPaneTooltipFeatureActiveState(pane)) {
      cleared = true;
    }
  });
  if (cleared) {
    internalChart.updatePane?.(UPDATE_LEVEL_OVERLAY);
  }
};
