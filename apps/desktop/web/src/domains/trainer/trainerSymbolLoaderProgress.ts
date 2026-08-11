// SPDX-License-Identifier: GPL-3.0-only

import {
  resolveReplayBarDisplayIndex,
  resolveReplayBarLocalIndexForRawIndex,
} from "@/domains/trainer/marketFrameStore";
import { logTrainerPerf } from "@/domains/trainer/trainerPerfTrace";
import type {
  BaseTimeframe,
  DisplayPeriodKey,
  ReplayBar,
} from "@/domains/trainer/trainerTypes";

const TRAINER_LAUNCH_METRIC_PREFIX = "trainer-launch";

type TrainerLaunchMetricTracker = {
  mark: (stage: string) => string | null;
  measure: (
    stage: string,
    startMark: string | null,
    endMark: string | null,
  ) => void;
  setValue: (key: string, value: unknown) => void;
  flush: () => void;
  cleanup: () => void;
};

export const createTrainerLaunchMetricTracker = (
  requestVersion: number,
): TrainerLaunchMetricTracker => {
  const markNames = new Set<string>();
  const measureNames = new Set<string>();
  const metricValues: Record<string, unknown> = {
    requestVersion,
  };
  const buildMetricName = (stage: string) =>
    `${TRAINER_LAUNCH_METRIC_PREFIX}:${requestVersion}:${stage}`;
  return {
    mark(stage) {
      if (typeof performance === "undefined") {
        return null;
      }
      const metricName = buildMetricName(stage);
      performance.mark(metricName);
      markNames.add(metricName);
      return metricName;
    },
    measure(stage, startMark, endMark) {
      if (typeof performance === "undefined" || !startMark || !endMark) {
        return;
      }
      const measureName = buildMetricName(stage);
      try {
        performance.measure(measureName, startMark, endMark);
        measureNames.add(measureName);
        const entries = performance.getEntriesByName(measureName, "measure");
        const latestEntry = entries[entries.length - 1];
        metricValues[stage] =
          Math.round(Math.max(0, latestEntry?.duration ?? 0) * 100) / 100;
      } catch {
        // Ignore repeated or invalid mark combinations in production runtime.
      }
    },
    setValue(key, value) {
      metricValues[key] = value;
    },
    flush() {
      logTrainerPerf("launch", metricValues);
    },
    cleanup() {
      if (typeof performance === "undefined") {
        return;
      }
      for (const measureName of measureNames) {
        performance.clearMeasures(measureName);
      }
      for (const markName of markNames) {
        performance.clearMarks(markName);
      }
      measureNames.clear();
      markNames.clear();
    },
  };
};

export const waitForNextAnimationFrame = async (): Promise<void> => {
  if (typeof window === "undefined") {
    return;
  }
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
};

export const toBaseTimeframe = (
  value: unknown,
  fallback: BaseTimeframe = "1d",
): BaseTimeframe => {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "1m" ||
    normalized === "5m" ||
    normalized === "1h" ||
    normalized === "1d"
  ) {
    return normalized;
  }
  return fallback;
};

export const toDisplayPeriod = (
  value: unknown,
  fallback: DisplayPeriodKey,
): DisplayPeriodKey => {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "1m" ||
    normalized === "5m" ||
    normalized === "1h" ||
    normalized === "1d" ||
    normalized === "1w" ||
    normalized === "1month" ||
    normalized === "1year"
  ) {
    return normalized;
  }
  return fallback;
};

export const resolveDisplayProgressBetweenRawIndexes = ({
  bars,
  offset,
  total,
  startRawIndex,
  cursorRawIndex,
}: {
  bars: ReplayBar[];
  offset: number;
  total: number;
  startRawIndex: number;
  cursorRawIndex: number;
}): { consumed: number; future: number } => {
  const startLocalIndex = resolveReplayBarLocalIndexForRawIndex(
    bars,
    startRawIndex,
  );
  const cursorLocalIndex = resolveReplayBarLocalIndexForRawIndex(
    bars,
    cursorRawIndex,
  );
  const startDisplayIndex =
    startLocalIndex >= 0
      ? resolveReplayBarDisplayIndex(bars[startLocalIndex], startLocalIndex, offset)
      : Math.max(0, startRawIndex);
  const cursorDisplayIndex =
    cursorLocalIndex >= 0
      ? resolveReplayBarDisplayIndex(bars[cursorLocalIndex], cursorLocalIndex, offset)
      : Math.max(startDisplayIndex, cursorRawIndex);
  return {
    consumed: Math.max(1, cursorDisplayIndex - startDisplayIndex + 1),
    future: Math.max(0, total - cursorDisplayIndex - 1),
  };
};
