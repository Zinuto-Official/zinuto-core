// SPDX-License-Identifier: GPL-3.0-only

import { DEFAULT_TRADING_SETTINGS } from "@/domains/trainer/defaultTradingSettings";
import type { ApiBacktestResultDetail } from "@/api";
import type { BaseTimeframe, DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { HistoryReplayChartViewProps } from "@/domains/chart/HistoryReplayChart";
import type { Fill, SessionSnapshot, TradingSettings } from "@/domains/training/types";

type BacktestReplayProject = NonNullable<HistoryReplayChartViewProps["project"]>;
type BacktestReplayData = NonNullable<BacktestReplayProject["replay"]>;

const normalizeBaseTimeframe = (value: unknown): BaseTimeframe => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "1m" || normalized === "5m" || normalized === "1h" || normalized === "1d") {
    return normalized;
  }
  return "1d";
};

const readPositiveNumber = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const buildBacktestTradingSettings = (detail: ApiBacktestResultDetail): TradingSettings => {
  const sourceSettings = detail.batch.config.tradingSettings ?? {};
  const initialSecuritiesBalance = readPositiveNumber(
    detail.batch.config.initialCapital,
    DEFAULT_TRADING_SETTINGS.initialSecuritiesBalance,
  );
  const contractMultiplier = readPositiveNumber(
    sourceSettings.contractMultiplier,
    DEFAULT_TRADING_SETTINGS.contractMultiplier,
  );
  return {
    ...DEFAULT_TRADING_SETTINGS,
    ...sourceSettings,
    initialSecuritiesBalance,
    contractMultiplier,
  } as TradingSettings;
};

const buildBacktestReplayFills = (
  detail: ApiBacktestResultDetail,
  contractMultiplier: number,
): Fill[] =>
  detail.fills.map((fill) => ({
    id: fill.id,
    order_id: fill.orderId,
    session_id: detail.result.id,
    instrument_id: fill.instrumentId,
    symbol: fill.symbol,
    side: fill.side,
    fill_index: fill.fillIndex,
    fill_time: fill.fillTime,
    fill_price: fill.price,
    fill_qty: fill.qty,
    contract_multiplier: contractMultiplier,
    fee: fill.fee,
    tax: fill.tax,
    slippage: fill.slippage,
    created_at: fill.createdAt,
  }));

export const buildBacktestReplayProject = (
  detail: ApiBacktestResultDetail,
): BacktestReplayProject => {
  const baseTimeframe = normalizeBaseTimeframe(detail.result.timeframe);
  const displayPeriod: DisplayPeriodKey = baseTimeframe;
  const bars = detail.bars.map((bar) => ({
    ts: bar.ts,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  }));
  const tradingSettings = buildBacktestTradingSettings(detail);
  const cursorIndex = Math.max(0, bars.length - 1);
  const createdAt = detail.result.createdAt || detail.batch.createdAt || new Date(0).toISOString();
  const snapshot: SessionSnapshot = {
    session: {
      id: detail.result.id,
      user_id: "backtest",
      instrument_id: detail.result.instrumentId,
      instrumentId: detail.result.instrumentId,
      samplePoolId: detail.batch.config.samplePoolIds?.[0] ?? "backtest",
      sourceTimeframe: baseTimeframe,
      timeframe: baseTimeframe,
      minimumBaseTimeframe: baseTimeframe,
      start_index: 0,
      entry_index: 0,
      history_bars: bars.length,
      cursor_index: cursorIndex,
      autoplay_interval_ms: 0,
      is_paused: 1,
      created_at: createdAt,
      symbol: detail.result.symbol,
      instrumentName: detail.result.symbol,
    },
    accounts: [{
      id: `${detail.result.id}-account`,
      user_id: "backtest",
      kind: "SECURITIES",
      balance: tradingSettings.initialSecuritiesBalance,
      currency: "USD",
    }],
    sessionTradingSettings: tradingSettings,
    positions: [],
    fills: buildBacktestReplayFills(detail, tradingSettings.contractMultiplier),
    drawings: [],
    fillsTotal: detail.fills.length,
    residentFillsStartIndex: 0,
  };
  const replay: BacktestReplayData = {
    bars,
    previewBars: bars,
    barWindow: {
      startRawIndex: 0,
      endRawIndex: cursorIndex,
      totalBars: bars.length,
      hasBackward: false,
      hasForward: false,
      limited: false,
    },
    snapshot,
    baseTimeframe,
    displayPeriod,
  };
  return {
    id: `backtest-${detail.result.id}`,
    symbol: detail.result.symbol,
    replay,
  };
};
