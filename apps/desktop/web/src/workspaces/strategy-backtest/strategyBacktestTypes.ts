// SPDX-License-Identifier: GPL-3.0-only

import type { TradingAssetClassId } from "@/domains/trainer/tradingMarketPresets";

export type StrategyBacktestAssetClass = TradingAssetClassId;

export type StrategyBacktestSamplePool = {
  id: string;
  name: string;
  assetClass: StrategyBacktestAssetClass;
  assetClassLabel: string;
  marketPresetId: string;
  baseTimeframe: "1m" | "5m" | "1h" | "1d";
  symbols: string[];
  instruments: Array<{
    instrumentId: string;
    symbol: string;
    barCount?: number;
    timeStartTs?: string | null;
    timeEndTs?: string | null;
  }>;
};
