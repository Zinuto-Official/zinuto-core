// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { isSameNumericArray, type SignalIndicatorName } from '@/domains/indicators/core';

type ChartSettingsParamBaseline = {
  mainIndicator: string;
  mainParams: number[];
  topIndicator: SignalIndicatorName;
  topParams: number[];
  bottomIndicator: SignalIndicatorName;
  bottomParams: number[];
};

type NumericArraySetter = Dispatch<SetStateAction<number[]>>;

type UseChartIndicatorSettingsBaselineArgs = {
  showChartSettingsModal: boolean;
  mainNativeIndicator: string;
  mainNativeIndicatorParams: number[];
  signalTopIndicator: SignalIndicatorName;
  signalTopIndicatorParams: number[];
  signalBottomIndicator: SignalIndicatorName;
  signalBottomIndicatorParams: number[];
  setMainNativeIndicatorParams: NumericArraySetter;
  setSignalTopIndicatorParams: NumericArraySetter;
  setSignalBottomIndicatorParams: NumericArraySetter;
};

export const useChartIndicatorSettingsBaseline = ({
  showChartSettingsModal,
  mainNativeIndicator,
  mainNativeIndicatorParams,
  signalTopIndicator,
  signalTopIndicatorParams,
  signalBottomIndicator,
  signalBottomIndicatorParams,
  setMainNativeIndicatorParams,
  setSignalTopIndicatorParams,
  setSignalBottomIndicatorParams
}: UseChartIndicatorSettingsBaselineArgs) => {
  const [chartSettingsParamBaseline, setChartSettingsParamBaseline] = useState<ChartSettingsParamBaseline>({
    mainIndicator: mainNativeIndicator,
    mainParams: [...mainNativeIndicatorParams],
    topIndicator: signalTopIndicator,
    topParams: [...signalTopIndicatorParams],
    bottomIndicator: signalBottomIndicator,
    bottomParams: [...signalBottomIndicatorParams]
  });
  const previousMainIndicatorRef = useRef<string | null>(null);
  const previousTopIndicatorRef = useRef<string | null>(null);
  const previousBottomIndicatorRef = useRef<string | null>(null);
  const chartSettingsModalWasOpenRef = useRef(false);

  useEffect(() => {
    const wasOpen = chartSettingsModalWasOpenRef.current;
    if (showChartSettingsModal && !wasOpen) {
      setChartSettingsParamBaseline({
        mainIndicator: mainNativeIndicator,
        mainParams: [...mainNativeIndicatorParams],
        topIndicator: signalTopIndicator,
        topParams: [...signalTopIndicatorParams],
        bottomIndicator: signalBottomIndicator,
        bottomParams: [...signalBottomIndicatorParams]
      });
    }
    chartSettingsModalWasOpenRef.current = showChartSettingsModal;
  }, [
    mainNativeIndicator,
    mainNativeIndicatorParams,
    showChartSettingsModal,
    signalBottomIndicator,
    signalBottomIndicatorParams,
    signalTopIndicator,
    signalTopIndicatorParams
  ]);

  useEffect(() => {
    const previous = previousMainIndicatorRef.current;
    previousMainIndicatorRef.current = mainNativeIndicator;
    if (previous === null || previous === mainNativeIndicator) {
      return;
    }
    setMainNativeIndicatorParams([]);
  }, [mainNativeIndicator, setMainNativeIndicatorParams]);

  useEffect(() => {
    const previous = previousTopIndicatorRef.current;
    previousTopIndicatorRef.current = signalTopIndicator;
    if (previous === null || previous === signalTopIndicator) {
      return;
    }
    setSignalTopIndicatorParams([]);
  }, [setSignalTopIndicatorParams, signalTopIndicator]);

  useEffect(() => {
    const previous = previousBottomIndicatorRef.current;
    previousBottomIndicatorRef.current = signalBottomIndicator;
    if (previous === null || previous === signalBottomIndicator) {
      return;
    }
    setSignalBottomIndicatorParams([]);
  }, [setSignalBottomIndicatorParams, signalBottomIndicator]);

  const mainIndicatorParamChanged = useMemo(
    () =>
      showChartSettingsModal &&
      mainNativeIndicator === chartSettingsParamBaseline.mainIndicator &&
      !isSameNumericArray(mainNativeIndicatorParams, chartSettingsParamBaseline.mainParams),
    [
      chartSettingsParamBaseline.mainIndicator,
      chartSettingsParamBaseline.mainParams,
      mainNativeIndicator,
      mainNativeIndicatorParams,
      showChartSettingsModal
    ]
  );
  const topIndicatorParamChanged = useMemo(
    () =>
      showChartSettingsModal &&
      signalTopIndicator === chartSettingsParamBaseline.topIndicator &&
      !isSameNumericArray(signalTopIndicatorParams, chartSettingsParamBaseline.topParams),
    [
      chartSettingsParamBaseline.topIndicator,
      chartSettingsParamBaseline.topParams,
      showChartSettingsModal,
      signalTopIndicator,
      signalTopIndicatorParams
    ]
  );
  const bottomIndicatorParamChanged = useMemo(
    () =>
      showChartSettingsModal &&
      signalBottomIndicator === chartSettingsParamBaseline.bottomIndicator &&
      !isSameNumericArray(signalBottomIndicatorParams, chartSettingsParamBaseline.bottomParams),
    [
      chartSettingsParamBaseline.bottomIndicator,
      chartSettingsParamBaseline.bottomParams,
      showChartSettingsModal,
      signalBottomIndicator,
      signalBottomIndicatorParams
    ]
  );

  const resetMainIndicatorParams = useCallback(() => {
    setMainNativeIndicatorParams([...chartSettingsParamBaseline.mainParams]);
  }, [chartSettingsParamBaseline.mainParams, setMainNativeIndicatorParams]);

  const resetTopIndicatorParams = useCallback(() => {
    setSignalTopIndicatorParams([...chartSettingsParamBaseline.topParams]);
  }, [chartSettingsParamBaseline.topParams, setSignalTopIndicatorParams]);

  const resetBottomIndicatorParams = useCallback(() => {
    setSignalBottomIndicatorParams([...chartSettingsParamBaseline.bottomParams]);
  }, [chartSettingsParamBaseline.bottomParams, setSignalBottomIndicatorParams]);

  return {
    mainIndicatorParamChanged,
    topIndicatorParamChanged,
    bottomIndicatorParamChanged,
    resetMainIndicatorParams,
    resetTopIndicatorParams,
    resetBottomIndicatorParams
  };
};
