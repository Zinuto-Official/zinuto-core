// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from 'react';
import type {
  TradeLogRow,
  TrainerFillDerivedSnapshot,
} from '@/domains/trainer/trainerFillDerivedState';

type TradeLogSideStats = {
  buyCount: number;
  sellCount: number;
};

const EMPTY_TRADE_LOG_ROWS: TradeLogRow[] = [];

export const useTradeLogModel = (
  fillDerivedState: TrainerFillDerivedSnapshot | null
): { tradeLogRows: TradeLogRow[]; tradeLogSideStats: TradeLogSideStats } => {
  const tradeLogSideStats = useMemo(
    () => ({
      buyCount: fillDerivedState?.buyCount ?? 0,
      sellCount: fillDerivedState?.sellCount ?? 0
    }),
    [fillDerivedState?.buyCount, fillDerivedState?.sellCount]
  );

  return {
    tradeLogRows: fillDerivedState?.tradeLogRows ?? EMPTY_TRADE_LOG_ROWS,
    tradeLogSideStats
  };
};
