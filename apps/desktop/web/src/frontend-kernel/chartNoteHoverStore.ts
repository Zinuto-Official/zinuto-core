// SPDX-License-Identifier: GPL-3.0-only

import { useSyncExternalStore } from "react";

export type ChartNoteHover = {
  title: string;
  pageX: number;
  pageY: number;
} | null;

type ChartNoteHoverListener = () => void;

const chartNoteHoverListeners = new Set<ChartNoteHoverListener>();

let currentChartNoteHover: ChartNoteHover = null;

export const getCurrentChartNoteHover = (): ChartNoteHover =>
  currentChartNoteHover;

export const publishChartNoteHover = (hover: ChartNoteHover): void => {
  const current = currentChartNoteHover;
  if (hover && current) {
    if (
      current.title === hover.title &&
      current.pageX === hover.pageX &&
      current.pageY === hover.pageY
    ) {
      return;
    }
  } else if (!hover && !current) {
    return;
  }
  currentChartNoteHover = hover;
  chartNoteHoverListeners.forEach((listener) => {
    listener();
  });
};

export const clearChartNoteHover = (): void => {
  publishChartNoteHover(null);
};

export const subscribeChartNoteHover = (
  listener: ChartNoteHoverListener,
): (() => void) => {
  chartNoteHoverListeners.add(listener);
  return () => {
    chartNoteHoverListeners.delete(listener);
  };
};

export const useChartNoteHover = (): ChartNoteHover =>
  useSyncExternalStore(
    subscribeChartNoteHover,
    getCurrentChartNoteHover,
    getCurrentChartNoteHover,
  );
