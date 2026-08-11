// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from "react";
import {
  DEFAULT_SIGNAL_BOTTOM_INDICATOR,
  DEFAULT_SIGNAL_TOP_INDICATOR,
  INDICATOR_NONE_VALUE,
  isIndicatorNone,
  normalizeIndicatorCalcParams,
  resolveMainNativeIndicatorState,
  resolveSignalIndicatorState,
  type SignalIndicatorName,
} from "@/domains/indicators";
import type {
  HistorySubIndicatorOverride,
  ReplayArchiveData,
} from "@/domains/chart/HistoryReplayChartTypes";

export const useHistoryReplayIndicatorState = ({
  suppressNativeIndicators,
  chartIndicators,
  historySubIndicatorOverride,
}: {
  suppressNativeIndicators: boolean;
  chartIndicators: ReplayArchiveData["chartIndicators"];
  historySubIndicatorOverride: HistorySubIndicatorOverride | null;
}) => {
  const historyMainIndicator = useMemo<SignalIndicatorName>(
    () =>
      suppressNativeIndicators
        ? INDICATOR_NONE_VALUE
        : resolveMainNativeIndicatorState(chartIndicators?.mainNativeIndicator),
    [chartIndicators?.mainNativeIndicator, suppressNativeIndicators],
  );
  const historyMainIndicatorParams = useMemo(
    () =>
      normalizeIndicatorCalcParams(chartIndicators?.mainNativeIndicatorParams),
    [chartIndicators?.mainNativeIndicatorParams],
  );
  const archivedHistoryTopIndicator = useMemo<SignalIndicatorName>(
    () =>
      suppressNativeIndicators
        ? INDICATOR_NONE_VALUE
        : resolveSignalIndicatorState(
            chartIndicators?.signalTopIndicator,
            DEFAULT_SIGNAL_TOP_INDICATOR,
          ),
    [chartIndicators?.signalTopIndicator, suppressNativeIndicators],
  );
  const archivedHistoryTopIndicatorParams = useMemo(
    () =>
      normalizeIndicatorCalcParams(chartIndicators?.signalTopIndicatorParams),
    [chartIndicators?.signalTopIndicatorParams],
  );
  const archivedHistoryBottomIndicator = useMemo<SignalIndicatorName>(
    () =>
      suppressNativeIndicators
        ? INDICATOR_NONE_VALUE
        : resolveSignalIndicatorState(
            chartIndicators?.signalBottomIndicator,
            DEFAULT_SIGNAL_BOTTOM_INDICATOR,
          ),
    [chartIndicators?.signalBottomIndicator, suppressNativeIndicators],
  );
  const archivedHistoryBottomIndicatorParams = useMemo(
    () =>
      normalizeIndicatorCalcParams(
        chartIndicators?.signalBottomIndicatorParams,
      ),
    [chartIndicators?.signalBottomIndicatorParams],
  );
  const activeOverride = suppressNativeIndicators
    ? null
    : historySubIndicatorOverride;
  const historyTopIndicator =
    activeOverride?.signalTopIndicator ?? archivedHistoryTopIndicator;
  const historyTopIndicatorParams =
    activeOverride?.signalTopIndicatorParams ??
    archivedHistoryTopIndicatorParams;
  const historyBottomIndicator =
    activeOverride?.signalBottomIndicator ?? archivedHistoryBottomIndicator;
  const historyBottomIndicatorParams =
    activeOverride?.signalBottomIndicatorParams ??
    archivedHistoryBottomIndicatorParams;
  const hasTopSubIndicator = !isIndicatorNone(historyTopIndicator);
  const hasBottomSubIndicator = !isIndicatorNone(historyBottomIndicator);

  return {
    archivedHistoryBottomIndicator,
    archivedHistoryBottomIndicatorParams,
    archivedHistorySignalConfigKey: [
      archivedHistoryTopIndicator,
      archivedHistoryTopIndicatorParams.join(","),
      archivedHistoryBottomIndicator,
      archivedHistoryBottomIndicatorParams.join(","),
    ].join("|"),
    archivedHistoryTopIndicator,
    archivedHistoryTopIndicatorParams,
    hasAnySubIndicator: hasTopSubIndicator || hasBottomSubIndicator,
    hasBottomSubIndicator,
    hasTopSubIndicator,
    historyBottomIndicator,
    historyBottomIndicatorParams,
    historyMainIndicator,
    historyMainIndicatorParams,
    historyTopIndicator,
    historyTopIndicatorParams,
  };
};
