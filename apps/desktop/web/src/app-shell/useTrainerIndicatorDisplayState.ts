// SPDX-License-Identifier: GPL-3.0-only

import { useState } from 'react';
import type { UiSettings } from '@/frontend-kernel/appTypes';
import {
  normalizeTradeMarkerDensityRatio
} from '@/domains/chart/overlays/tradeMarkerDensityRules';
import {
  DEFAULT_SIGNAL_BOTTOM_INDICATOR,
  DEFAULT_SIGNAL_TOP_INDICATOR,
  normalizeIndicatorCalcParams,
  resolveMainNativeIndicatorState,
  resolveSignalIndicatorState,
  type SignalIndicatorName
} from '@/domains/indicators/core';

type UseTrainerIndicatorDisplayStateArgs = {
  persistedUi: UiSettings;
};

export const useTrainerIndicatorDisplayState = ({
  persistedUi
}: UseTrainerIndicatorDisplayStateArgs) => {
  const [mainNativeIndicator, setMainNativeIndicator] = useState<string>(() =>
    resolveMainNativeIndicatorState(persistedUi.mainNativeIndicator)
  );
  const [mainNativeIndicatorParams, setMainNativeIndicatorParams] = useState<number[]>(() =>
    normalizeIndicatorCalcParams(persistedUi.mainNativeIndicatorParams)
  );
  const [signalTopIndicator, setSignalTopIndicator] = useState<SignalIndicatorName>(() =>
    resolveSignalIndicatorState(persistedUi.signalTopIndicator, DEFAULT_SIGNAL_TOP_INDICATOR)
  );
  const [signalTopIndicatorParams, setSignalTopIndicatorParams] = useState<number[]>(() =>
    normalizeIndicatorCalcParams(persistedUi.signalTopIndicatorParams)
  );
  const [signalBottomIndicator, setSignalBottomIndicator] = useState<SignalIndicatorName>(() =>
    resolveSignalIndicatorState(persistedUi.signalBottomIndicator, DEFAULT_SIGNAL_BOTTOM_INDICATOR)
  );
  const [signalBottomIndicatorParams, setSignalBottomIndicatorParams] = useState<number[]>(() =>
    normalizeIndicatorCalcParams(persistedUi.signalBottomIndicatorParams)
  );
  const [showTrainerSubIndicators, setShowTrainerSubIndicators] = useState(true);
  const [tradeMarkerDensityRatio, setTradeMarkerDensityRatio] = useState(
    normalizeTradeMarkerDensityRatio(persistedUi.tradeMarkerDensityRatio)
  );
  const [selectedDataIndex, setSelectedDataIndex] = useState<number | null>(null);
  const [chartReady, setChartReady] = useState(false);

  return {
    mainNativeIndicator,
    setMainNativeIndicator,
    mainNativeIndicatorParams,
    setMainNativeIndicatorParams,
    signalTopIndicator,
    setSignalTopIndicator,
    signalTopIndicatorParams,
    setSignalTopIndicatorParams,
    signalBottomIndicator,
    setSignalBottomIndicator,
    signalBottomIndicatorParams,
    setSignalBottomIndicatorParams,
    showTrainerSubIndicators,
    setShowTrainerSubIndicators,
    tradeMarkerDensityRatio,
    setTradeMarkerDensityRatio,
    selectedDataIndex,
    setSelectedDataIndex,
    chartReady,
    setChartReady
  };
};
