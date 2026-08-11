// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type { Bar } from "@/domains/training/types";
import { resolveBarsBaseTimeframe } from "@/domains/data-import/baseTimeframeInference";

const SPECIAL_TRAINING_BASE_TIMEFRAME_ORDER: readonly BaseTimeframe[] = [
  "1m",
  "5m",
  "1h",
  "1d",
];

type BaseTimeframeRecord = Record<string, unknown>;

const asRecord = (value: unknown): BaseTimeframeRecord | null =>
  value && typeof value === "object" ? (value as BaseTimeframeRecord) : null;

export const normalizeSpecialTrainingBaseTimeframe = (
  value: unknown,
): BaseTimeframe | null => {
  if (value === "1m" || value === "5m" || value === "1h" || value === "1d") {
    return value;
  }
  return null;
};

export const compareSpecialTrainingBaseTimeframes = (
  left: BaseTimeframe,
  right: BaseTimeframe,
): number =>
  SPECIAL_TRAINING_BASE_TIMEFRAME_ORDER.indexOf(left) -
  SPECIAL_TRAINING_BASE_TIMEFRAME_ORDER.indexOf(right);

export const resolveHighestSpecialTrainingBaseTimeframe = (
  values: readonly BaseTimeframe[],
): BaseTimeframe | null =>
  values.reduce<BaseTimeframe | null>((highest, value) => {
    if (!highest) {
      return value;
    }
    return compareSpecialTrainingBaseTimeframes(value, highest) > 0
      ? value
      : highest;
  }, null);

export const resolveSelectableMinimumBaseTimeframes = ({
  selectedPoolBaseTimeframes,
  hardMinimumBaseTimeframe,
}: {
  selectedPoolBaseTimeframes: readonly BaseTimeframe[];
  hardMinimumBaseTimeframe: BaseTimeframe;
}): BaseTimeframe[] => {
  const selectedPoolConstraint =
    resolveHighestSpecialTrainingBaseTimeframe(selectedPoolBaseTimeframes);
  const effectiveLowerBound =
    selectedPoolConstraint &&
    compareSpecialTrainingBaseTimeframes(
      selectedPoolConstraint,
      hardMinimumBaseTimeframe,
    ) > 0
      ? selectedPoolConstraint
      : hardMinimumBaseTimeframe;
  return SPECIAL_TRAINING_BASE_TIMEFRAME_ORDER.filter(
    (timeframe) =>
      compareSpecialTrainingBaseTimeframes(timeframe, effectiveLowerBound) >= 0,
  );
};

export const clampSpecialTrainingMinimumBaseTimeframe = ({
  requestedMinimumBaseTimeframe,
  selectedPoolBaseTimeframes,
  hardMinimumBaseTimeframe,
}: {
  requestedMinimumBaseTimeframe: BaseTimeframe | null | undefined;
  selectedPoolBaseTimeframes: readonly BaseTimeframe[];
  hardMinimumBaseTimeframe: BaseTimeframe;
}): BaseTimeframe => {
  const selectable = resolveSelectableMinimumBaseTimeframes({
    selectedPoolBaseTimeframes,
    hardMinimumBaseTimeframe,
  });
  const normalizedRequested =
    normalizeSpecialTrainingBaseTimeframe(requestedMinimumBaseTimeframe);
  if (
    normalizedRequested &&
    selectable.includes(normalizedRequested)
  ) {
    return normalizedRequested;
  }
  return selectable[0] ?? hardMinimumBaseTimeframe;
};

export const resolveSpecialTrainingMinimumBaseTimeframeFromValue = (
  value: unknown,
): BaseTimeframe | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return (
    normalizeSpecialTrainingBaseTimeframe(record.minimumBaseTimeframe) ??
    normalizeSpecialTrainingBaseTimeframe(record.requestedMinimumBaseTimeframe) ??
    normalizeSpecialTrainingBaseTimeframe(record.minimumTrainingTimeframe)
  );
};

export const resolveSpecialTrainingEffectiveTimeframeFromValue = (
  value: unknown,
): BaseTimeframe | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return (
    normalizeSpecialTrainingBaseTimeframe(record.effectiveTrainingTimeframe) ??
    normalizeSpecialTrainingBaseTimeframe(record.effectiveTimeframe) ??
    normalizeSpecialTrainingBaseTimeframe(record.trainingTimeframe) ??
    normalizeSpecialTrainingBaseTimeframe(record.timeframe)
  );
};

export const resolveSpecialTrainingQuestionEffectiveTimeframe = ({
  question,
  bars,
  fallbackTrainingTimeframe = null,
  fallbackBaseTimeframe = null,
}: {
  question: unknown;
  bars?: Bar[] | null;
  fallbackTrainingTimeframe?: BaseTimeframe | null;
  fallbackBaseTimeframe?: BaseTimeframe | null;
}): BaseTimeframe | null =>
  resolveSpecialTrainingEffectiveTimeframeFromValue(question) ??
  fallbackTrainingTimeframe ??
  resolveSpecialTrainingMinimumBaseTimeframeFromValue(question) ??
  fallbackBaseTimeframe ??
  resolveBarsBaseTimeframe(Array.isArray(bars) ? bars : []);
