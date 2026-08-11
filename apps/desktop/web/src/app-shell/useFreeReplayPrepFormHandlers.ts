// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type {
  FreeReplayAdvancePeriod,
  FreeReplayAssetClass,
} from '@/domains/trainer/freeReplaySetup';
import type { TradingMarketPresetId } from '@/domains/trainer/tradingMarketPresets';

type FreeReplayMode = 'RANDOM' | 'FOCUSED';
type FreeReplayBlindBoxValue = 'SHOW' | 'HIDE';
type ValueSetter<TValue> = (value: TValue) => void;

type UseFreeReplayPrepFormHandlersArgs = {
  setFreeReplayPrepTouched: Dispatch<SetStateAction<boolean>>;
  markFreeReplayPrepEnvironmentTouched?: () => void;
  setFreeReplayPrepMode: ValueSetter<FreeReplayMode>;
  setFreeReplayPrepBaseTimeframe: ValueSetter<FreeReplayAdvancePeriod>;
  setFreeReplaySelectedPoolId: ValueSetter<string>;
  setFreeReplaySelectedSymbol: ValueSetter<string>;
  setFreeReplayPrepBlindBoxValue: ValueSetter<FreeReplayBlindBoxValue>;
  setFreeReplayPrepEnvironmentAssetClass: ValueSetter<FreeReplayAssetClass>;
  setFreeReplayPrepEnvironmentPresetId: ValueSetter<TradingMarketPresetId>;
  setFreeReplayPrepPersistEnvironmentToPool: ValueSetter<boolean>;
};

export const useFreeReplayPrepFormHandlers = ({
  setFreeReplayPrepTouched,
  markFreeReplayPrepEnvironmentTouched,
  setFreeReplayPrepMode,
  setFreeReplayPrepBaseTimeframe,
  setFreeReplaySelectedPoolId,
  setFreeReplaySelectedSymbol,
  setFreeReplayPrepBlindBoxValue,
  setFreeReplayPrepEnvironmentAssetClass,
  setFreeReplayPrepEnvironmentPresetId,
  setFreeReplayPrepPersistEnvironmentToPool,
}: UseFreeReplayPrepFormHandlersArgs) => {
  const markFreeReplayPrepTouched = useCallback(() => {
    setFreeReplayPrepTouched(true);
  }, [setFreeReplayPrepTouched]);

  const markFreeReplayPrepEnvironmentChanged = useCallback(() => {
    markFreeReplayPrepTouched();
    markFreeReplayPrepEnvironmentTouched?.();
  }, [markFreeReplayPrepEnvironmentTouched, markFreeReplayPrepTouched]);

  const handleFreeReplayPrepEnvironmentAssetClassChange = useCallback(
    (value: FreeReplayAssetClass) => {
      markFreeReplayPrepEnvironmentChanged();
      setFreeReplayPrepEnvironmentAssetClass(value);
    },
    [
      markFreeReplayPrepEnvironmentChanged,
      setFreeReplayPrepEnvironmentAssetClass,
    ],
  );

  const handleFreeReplayPrepEnvironmentPresetChange = useCallback(
    (value: TradingMarketPresetId) => {
      markFreeReplayPrepEnvironmentChanged();
      setFreeReplayPrepEnvironmentPresetId(value);
    },
    [
      markFreeReplayPrepEnvironmentChanged,
      setFreeReplayPrepEnvironmentPresetId,
    ],
  );

  const handleFreeReplayPrepPersistEnvironmentToPoolChange = useCallback(
    (value: boolean) => {
      markFreeReplayPrepEnvironmentChanged();
      setFreeReplayPrepPersistEnvironmentToPool(value);
    },
    [
      markFreeReplayPrepEnvironmentChanged,
      setFreeReplayPrepPersistEnvironmentToPool,
    ],
  );

  const handleFreeReplayPrepModeChange = useCallback(
    (value: FreeReplayMode) => {
      markFreeReplayPrepTouched();
      setFreeReplayPrepMode(value);
    },
    [markFreeReplayPrepTouched, setFreeReplayPrepMode],
  );

  const handleFreeReplayPrepBaseTimeframeChange = useCallback(
    (value: FreeReplayAdvancePeriod) => {
      markFreeReplayPrepTouched();
      setFreeReplayPrepBaseTimeframe(value);
    },
    [markFreeReplayPrepTouched, setFreeReplayPrepBaseTimeframe],
  );

  const handleFreeReplayPrepSamplePoolChange = useCallback(
    (value: string) => {
      markFreeReplayPrepTouched();
      setFreeReplaySelectedPoolId(value);
    },
    [markFreeReplayPrepTouched, setFreeReplaySelectedPoolId],
  );

  const handleFreeReplayPrepSymbolChange = useCallback(
    (value: string) => {
      markFreeReplayPrepTouched();
      setFreeReplaySelectedSymbol(value);
    },
    [markFreeReplayPrepTouched, setFreeReplaySelectedSymbol],
  );

  const handleFreeReplayPrepBlindBoxChange = useCallback(
    (value: FreeReplayBlindBoxValue) => {
      markFreeReplayPrepTouched();
      setFreeReplayPrepBlindBoxValue(value);
    },
    [markFreeReplayPrepTouched, setFreeReplayPrepBlindBoxValue],
  );

  return {
    handleFreeReplayPrepEnvironmentAssetClassChange,
    handleFreeReplayPrepEnvironmentPresetChange,
    handleFreeReplayPrepPersistEnvironmentToPoolChange,
    handleFreeReplayPrepModeChange,
    handleFreeReplayPrepBaseTimeframeChange,
    handleFreeReplayPrepMinimumBaseTimeframeChange:
      handleFreeReplayPrepBaseTimeframeChange,
    handleFreeReplayPrepSamplePoolChange,
    handleFreeReplayPrepSymbolChange,
    handleFreeReplayPrepBlindBoxChange,
  };
};
