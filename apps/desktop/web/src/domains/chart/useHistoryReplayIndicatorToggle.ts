// SPDX-License-Identifier: GPL-3.0-only

import { useCallback } from "react";
import {
  isSameNumericArray,
  resolveSubIndicatorToggleState,
  type SignalIndicatorName,
} from "@/domains/indicators";
import type { HistorySubIndicatorOverride } from "@/domains/chart/HistoryReplayChartTypes";

export const useHistoryReplayIndicatorToggle = ({
  showSubIndicators,
  historyTopIndicator,
  historyTopIndicatorParams,
  historyBottomIndicator,
  historyBottomIndicatorParams,
  archivedHistoryTopIndicator,
  archivedHistoryTopIndicatorParams,
  archivedHistoryBottomIndicator,
  archivedHistoryBottomIndicatorParams,
  setShowSubIndicators,
  setHistorySubIndicatorOverride,
}: {
  showSubIndicators: boolean;
  historyTopIndicator: SignalIndicatorName;
  historyTopIndicatorParams: number[];
  historyBottomIndicator: SignalIndicatorName;
  historyBottomIndicatorParams: number[];
  archivedHistoryTopIndicator: SignalIndicatorName;
  archivedHistoryTopIndicatorParams: number[];
  archivedHistoryBottomIndicator: SignalIndicatorName;
  archivedHistoryBottomIndicatorParams: number[];
  setShowSubIndicators: (value: boolean) => void;
  setHistorySubIndicatorOverride: (
    value: HistorySubIndicatorOverride | null,
  ) => void;
}) =>
  useCallback(() => {
    const next = resolveSubIndicatorToggleState({
      showSubIndicators,
      signalTopIndicator: historyTopIndicator,
      signalTopIndicatorParams: historyTopIndicatorParams,
      signalBottomIndicator: historyBottomIndicator,
      signalBottomIndicatorParams: historyBottomIndicatorParams,
    });
    setShowSubIndicators(next.showSubIndicators);

    const matchesArchived =
      next.signalTopIndicator === archivedHistoryTopIndicator &&
      isSameNumericArray(
        next.signalTopIndicatorParams,
        archivedHistoryTopIndicatorParams,
      ) &&
      next.signalBottomIndicator === archivedHistoryBottomIndicator &&
      isSameNumericArray(
        next.signalBottomIndicatorParams,
        archivedHistoryBottomIndicatorParams,
      );
    setHistorySubIndicatorOverride(
      matchesArchived
        ? null
        : {
            signalTopIndicator: next.signalTopIndicator,
            signalTopIndicatorParams: next.signalTopIndicatorParams,
            signalBottomIndicator: next.signalBottomIndicator,
            signalBottomIndicatorParams: next.signalBottomIndicatorParams,
          },
    );
  }, [
    archivedHistoryBottomIndicator,
    archivedHistoryBottomIndicatorParams,
    archivedHistoryTopIndicator,
    archivedHistoryTopIndicatorParams,
    historyBottomIndicator,
    historyBottomIndicatorParams,
    historyTopIndicator,
    historyTopIndicatorParams,
    setHistorySubIndicatorOverride,
    setShowSubIndicators,
    showSubIndicators,
  ]);
