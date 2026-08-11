// SPDX-License-Identifier: GPL-3.0-only

import {
  DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID,
} from "@zinuto/shared/trading";
import { appError } from "../../../kernel/appError.js";
import {
  createSystemDevSimulationBacktestBatch,
  runBacktestBatchNow,
} from "../../backtest/backtestService.js";
import type { BacktestConfig } from "../../backtest/types.js";
import {
  SYSTEM_DEV_SIMULATION_BACKTEST_ID_PREFIX,
} from "../../ports/infrastructure/db/systemDevSimulation/cleanupStore.js";
import { throwIfSystemDevSimulationTaskAborted } from "../taskExecutionState.js";
import {
  buildRealisticBacktestName,
  resolveRealisticBacktestStyle,
} from "../presentation.js";
import type { SystemDevSimulationCopyLanguage } from "@zinuto/shared/systemDevSimulationCopy";
import type {
  SystemDevSimulationEnabledInstrument,
  SystemDevSimulationEnabledPool,
} from "../../../domain/systemDevSimulation/sharedDomain.js";

type RealisticBacktestStyle = ReturnType<typeof resolveRealisticBacktestStyle>;

type BacktestStrategyDefinition = Pick<
  BacktestConfig,
  "strategySource" | "signalRules" | "orderSizing"
>;

const output = (key: string) => ({ kind: "OUTPUT" as const, key });

const BACKTEST_STRATEGIES = {
  TREND: {
    strategySource: "FAST: EMA(CLOSE, 8);\nSLOW: EMA(CLOSE, 21);",
    signalRules: {
      buy: {
        connector: "AND" as const,
        conditions: [{ left: output("FAST"), operator: "CROSS_ABOVE" as const, right: output("SLOW") }],
      },
      sell: {
        connector: "AND" as const,
        conditions: [{ left: output("FAST"), operator: "CROSS_BELOW" as const, right: output("SLOW") }],
      },
    },
    orderSizing: { mode: "EQUITY_PERCENT" as const, value: 40 },
  },
  PULLBACK: {
    strategySource: "FAST: EMA(CLOSE, 5);\nSLOW: EMA(CLOSE, 13);",
    signalRules: {
      buy: {
        connector: "AND" as const,
        conditions: [{ left: output("FAST"), operator: "CROSS_ABOVE" as const, right: output("SLOW") }],
      },
      sell: {
        connector: "AND" as const,
        conditions: [{ left: output("FAST"), operator: "CROSS_BELOW" as const, right: output("SLOW") }],
      },
    },
    orderSizing: { mode: "EQUITY_PERCENT" as const, value: 32 },
  },
  REVERSAL: {
    strategySource: "FAST: EMA(CLOSE, 13);\nSLOW: EMA(CLOSE, 34);",
    signalRules: {
      buy: {
        connector: "AND" as const,
        conditions: [{ left: output("FAST"), operator: "CROSS_ABOVE" as const, right: output("SLOW") }],
      },
      sell: {
        connector: "AND" as const,
        conditions: [{ left: output("FAST"), operator: "CROSS_BELOW" as const, right: output("SLOW") }],
      },
    },
    orderSizing: { mode: "EQUITY_PERCENT" as const, value: 28 },
  },
} as const satisfies Record<RealisticBacktestStyle, BacktestStrategyDefinition>;

const flattenInstruments = (
  pools: readonly SystemDevSimulationEnabledPool[],
): SystemDevSimulationEnabledInstrument[] =>
  pools.flatMap((pool) => pool.instruments ?? []);

const resolveInstrument = (
  pools: readonly SystemDevSimulationEnabledPool[],
  index: number,
): SystemDevSimulationEnabledInstrument => {
  const instruments = flattenInstruments(pools);
  const instrument = instruments[index % Math.max(1, instruments.length)];
  if (!instrument) {
    throw appError("SYSTEM_DEV_SIMULATION_INVALID", { reason: "NO_BACKTEST_INSTRUMENT" });
  }
  return instrument;
};

const buildConfig = (
  instrument: SystemDevSimulationEnabledInstrument,
  name: string,
  style: RealisticBacktestStyle,
): BacktestConfig => ({
  name,
  ...BACKTEST_STRATEGIES[style],
  instrumentIds: [instrument.instrumentId],
  startIndex: 0,
  endIndex: Math.max(55, Math.min(220, instrument.barCount - 1)),
  initialCapital: 50_000,
  priceMode: "NEXT_OPEN",
  signalExecutionMode: "NEXT_OPEN",
  tradingSettings: {
    ...DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID[
      instrument.marketPresetId
    ],
    initialSecuritiesBalance: 50_000,
    tradeSettlementMode: "T0",
    freeReplayEndSettlementMode: "FORCE_CLOSE",
    positionCostMode: "DILUTED",
    tradeAmountIncludesFees: false,
  },
});

export const createSystemDevSimulationRealBacktests = async (input: {
  batchId: string;
  seed: string;
  count: number;
  startIndex?: number;
  pools: readonly SystemDevSimulationEnabledPool[];
  language: SystemDevSimulationCopyLanguage;
  signal?: AbortSignal;
  onCreated?: (count: number) => void;
}): Promise<number> => {
  const total = Math.max(0, Math.floor(Number(input.count) || 0));
  const startIndex = Math.max(0, Math.floor(Number(input.startIndex) || 0));
  for (let index = 0; index < total; index += 1) {
    throwIfSystemDevSimulationTaskAborted(input.signal);
    const sequenceIndex = startIndex + index;
    const instrument = resolveInstrument(input.pools, sequenceIndex);
    const style = resolveRealisticBacktestStyle(sequenceIndex);
    const id = `${SYSTEM_DEV_SIMULATION_BACKTEST_ID_PREFIX}${input.batchId}:real:${sequenceIndex + 1}`;
    const name = buildRealisticBacktestName({
      language: input.language,
      symbol: instrument.symbol,
      timeframe: instrument.baseTimeframe,
      style,
    });
    const batch = createSystemDevSimulationBacktestBatch({
      id,
      name,
      config: buildConfig(instrument, name, style),
    });
    const completed = await runBacktestBatchNow(batch.id);
    if (completed.status !== "SUCCEEDED") {
      throw appError("SYSTEM_DEV_SIMULATION_INVALID", { reason: "REAL_BACKTEST_FAILED" });
    }
    input.onCreated?.(index + 1);
  }
  return total;
};
