// SPDX-License-Identifier: GPL-3.0-only

import type { AggregatedBarItem } from "@/domains/chart/replayAggregation";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { ReplayBar } from "@/domains/trainer/trainerTypes";
import { useMemo } from 'react';
import { useTrainerWorkspaceViewModel } from '@/workspaces';
import { useSelectedBarChange } from '@/app-shell/useSelectedBarChange';
import { useTradeLogModel } from '@/app-shell/useTradeLogModel';
import type { SessionSnapshot, TradingSettings } from '@/domains/training/types';
import type { BaseTimeframe } from '@zinuto/shared/timeframe';
import type { TrainerFillDerivedSnapshot } from '@/domains/trainer/trainerFillDerivedState';
import { resolveReplayBarLocalIndexForRawIndex } from '@/domains/trainer/marketFrameStore';

type UseTrainerComputedViewModelsArgs = {
  bars: ReplayBar[];
  barsOffset: number;
  barsTotal: number;
  snapshot: SessionSnapshot | null;
  fillDerivedState: TrainerFillDerivedSnapshot | null;
  selectedSymbol: string;
  baseTimeframe: BaseTimeframe;
  instrumentMetaMap: Map<string, { barCount: number }>;
  selectedDataIndex: number | null;
  trainerDisplayPeriod: DisplayPeriodKey;
  getCachedTrainerAggregatedBars: (
    period: DisplayPeriodKey,
    startRawIndex: number,
    endRawIndex: number
  ) => AggregatedBarItem[];
  tradingSettings: Pick<
    TradingSettings,
    'initialSecuritiesBalance' | 'allowLongMarginTrading' | 'allowShortSelling' | 'contractMultiplier'
  >;
  uiRemainingLabel: string;
  uiKlineUnitLabel: string;
  formatMoney: (value: number, digits?: number) => string;
  language: string;
};

export const useTrainerComputedViewModels = ({
  bars,
  barsOffset,
  barsTotal,
  snapshot,
  fillDerivedState,
  selectedSymbol,
  baseTimeframe,
  instrumentMetaMap,
  selectedDataIndex,
  trainerDisplayPeriod,
  getCachedTrainerAggregatedBars,
  tradingSettings,
  uiRemainingLabel,
  uiKlineUnitLabel,
  formatMoney,
  language
}: UseTrainerComputedViewModelsArgs) => {
  const currentPosition = useMemo(() => {
    if (!snapshot) {
      return null;
    }
    return snapshot.positions.find((item) => item.symbol === snapshot.session.symbol) ?? null;
  }, [snapshot]);

  const currentBar = useMemo(() => {
    if (!snapshot || !bars.length) {
      return null;
    }
    const idx = resolveReplayBarLocalIndexForRawIndex(
      bars,
      snapshot.session.cursor_index,
    );
    return bars[idx] ?? null;
  }, [bars, snapshot]);

  const { tradeLogRows, tradeLogSideStats } = useTradeLogModel(fillDerivedState);
  void tradingSettings;

  const selectedBarChange = useSelectedBarChange({
    bars,
    snapshot,
    selectedDataIndex,
    trainerDisplayPeriod,
    getCachedTrainerAggregatedBars
  });

  const trainerWorkspaceViewModel = useTrainerWorkspaceViewModel({
    bars,
    barsOffset,
    barsTotal,
    snapshot,
    selectedSymbol,
    baseTimeframe,
    instrumentMetaMap,
    uiRemainingLabel,
    uiKlineUnitLabel,
    formatMoney,
    language
  });

  return {
    currentPosition,
    currentBar,
    tradeLogRows,
    tradeLogSideStats,
    selectedBarChange,
    ...trainerWorkspaceViewModel
  };
};
