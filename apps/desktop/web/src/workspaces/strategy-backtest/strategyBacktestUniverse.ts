// SPDX-License-Identifier: GPL-3.0-only

export type StrategyBacktestUniversePool =
  | {
      instruments?: readonly {
        instrumentId?: unknown;
        symbol?: unknown;
      }[];
    }
  | null
  | undefined;

export type StrategyBacktestUniverse = {
  instrumentIds: string[];
  symbols: string[];
};

export const resolveStrategyBacktestUniverse = (
  pool: StrategyBacktestUniversePool,
): StrategyBacktestUniverse => {
  const byInstrumentId = new Map<string, string>();
  (pool?.instruments ?? []).forEach((instrument) => {
    const instrumentId = String(instrument.instrumentId ?? "").trim();
    const symbol = String(instrument.symbol ?? "")
      .trim()
      .toUpperCase();
    if (!instrumentId || !symbol || byInstrumentId.has(instrumentId)) {
      return;
    }
    byInstrumentId.set(instrumentId, symbol);
  });

  return {
    instrumentIds: Array.from(byInstrumentId.keys()),
    symbols: Array.from(byInstrumentId.values()),
  };
};

export const resolveStrategyBacktestPoolSelection = (
  pools: readonly StrategyBacktestSamplePool[],
  selectedPoolId: string,
) => {
  const selectedPool =
    pools.find((pool) => pool.id === selectedPoolId) ?? pools[0] ?? null;
  return {
    selectedPool,
    selectedPoolUniverse: resolveStrategyBacktestUniverse(selectedPool),
  };
};
import type { StrategyBacktestSamplePool } from "@/workspaces/strategy-backtest/strategyBacktestTypes";
