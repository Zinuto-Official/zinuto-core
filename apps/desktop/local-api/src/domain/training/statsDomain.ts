// SPDX-License-Identifier: GPL-3.0-only

import { parseTimestampMs, toMarketDateKey, toMarketDateParts } from '@zinuto/shared/marketTime';
import type { OperatorSummary } from '@zinuto/shared/operatorSummary';

export type ProfitabilityFilter = 'ALL' | 'PROFIT' | 'LOSS';

export type TrainingStatsFilters = {
  from?: string;
  to?: string;
  samplePoolId?: string;
  symbol?: string;
  timeframe?: string;
  tag?: string;
  profitability?: ProfitabilityFilter;
  comparePoolA?: string;
  comparePoolB?: string;
};

export type TrainingProjectRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  symbol: string;
  sample_pool_id: string;
  sample_pool_name: string;
  base_timeframe: string;
  training_date_range: string;
  initial_total: number;
  total_pnl: number;
  profit_rate: number;
  duration_days: number;
  total_trades: number;
  final_equity: number;
  equity_return_rate: number;
  summary_json: string;
  operator_summary_json?: string | null;
};

export type ReplayFill = {
  side: 'BUY' | 'SELL';
  fill_index: number;
  fill_time: string;
  fill_price: number;
  fill_qty: number;
  contract_multiplier: number;
  fee: number;
  tax: number;
  slippage: number;
};

export type ReplayPayload = {
  baseTimeframe?: string;
  snapshot?: {
    fills?: ReplayFill[];
  };
  tradeRounds?: unknown[];
};

export type ClosedTradeRecord = {
  direction: 'LONG' | 'SHORT';
  pnl: number;
  returnRate: number;
  holdBars: number;
  closeAt: string;
  closeIndex: number;
};

export type ReplayTradeRound = {
  direction: 'LONG' | 'SHORT';
  pnl: number;
  returnRate: number;
  holdBars: number;
  closeAt: string;
  closeIndex: number;
};

export type SessionTradeAnalytics = {
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;
  profitTradeTotal: number;
  lossTradeTotal: number;
  totalTradePnl: number;
  averageHoldBars: number;
  averageTakeProfitRate: number;
  averageStopLossRate: number;
  addPositionCount: number;
  reducePositionCount: number;
  fullPositionCount: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  totalSlippage: number;
  totalFeesFromFills: number;
  records: ClosedTradeRecord[];
};

export type DirectionalTradeStats = {
  longClosedTrades: number;
  longWinningTrades: number;
};

export type SessionAnalytics = {
  id: string;
  name: string;
  createdAt: string;
  symbol: string;
  samplePoolId: string;
  samplePoolName: string;
  baseTimeframe: string;
  trainingDateRange: string;
  initialTotal: number;
  totalPnl: number;
  profitRate: number;
  durationDays: number;
  totalTrades: number;
  finalEquity: number;
  maxDrawdownRate: number;
  tradingCost: number;
  decisionSecondsUsed: number;
  decisionCount: number;
  tags: string[];
  operatorSummary: OperatorSummary;
  trade: SessionTradeAnalytics;
};

export type TrainingStatsSessionFactRow = {
  project_id: string;
  name: string;
  created_at: string;
  symbol: string;
  sample_pool_id: string;
  sample_pool_name: string;
  base_timeframe: string;
  training_date_range: string;
  initial_total: number;
  total_pnl: number;
  profit_rate: number;
  duration_days: number;
  total_trades: number;
  final_equity: number;
  max_drawdown_rate: number;
  trading_cost: number;
  decision_seconds_used: number;
  decision_count: number;
  tags_json: string;
  closed_trades: number;
  winning_trades: number;
  losing_trades: number;
  long_closed_trades: number;
  long_winning_trades: number;
  profit_trade_total: number;
  loss_trade_total: number;
  average_hold_bars: number;
  average_take_profit_rate: number;
  average_stop_loss_rate: number;
  add_position_count: number;
  reduce_position_count: number;
  full_position_count: number;
  max_consecutive_wins: number;
  max_consecutive_losses: number;
  total_slippage: number;
  total_fees_from_fills: number;
  market_preset_id: string;
  asset_class: string;
  trade_settlement_mode: string;
  allow_long_margin_trading: number;
  allow_short_selling: number;
  leverage_multiple: number;
  uses_maker_taker: number;
  funding_rate: number;
  gross_pnl: number;
  fee_and_tax_cost: number;
  borrow_cost: number;
  decision_average_seconds: number;
  trade_win_rate: number;
  session_profit_factor: number | null;
  expectancy_per_trade: number;
  net_profit_retention_rate: number;
  peak_maintenance_utilization_rate: number;
  margin_min_buffer_rate: number;
  trend_aligned: number;
  critical_failure: number;
  loss_cut_delay_bars_total: number;
  loss_cut_delay_bars_count: number;
};

export type TrainingStatsMonthlyAggregateRow = {
  period: string;
  session_count: number;
  win_count: number;
  total_pnl: number;
  total_initial: number;
  max_drawdown_rate: number;
};

export type TrainingStatsPoolAggregateRow = {
  sample_pool_id: string;
  sample_pool_name: string;
  session_count: number;
  win_count: number;
  total_pnl: number;
  total_initial: number;
  total_trades: number;
  hold_bars_sum: number;
  hold_bars_count: number;
};

export type TrainingStatsSymbolAggregateRow = {
  symbol: string;
  session_count: number;
  best_return: number;
  worst_return: number;
  return_rate_sum: number;
};

export type TrainingStatsTimeframeAggregateRow = {
  timeframe: string;
  session_count: number;
  win_count: number;
  return_rate_sum: number;
  max_drawdown_rate: number;
  total_trades: number;
};

type BucketAggregate = {
  period: string;
  sessionCount: number;
  winCount: number;
  totalPnl: number;
  totalInitial: number;
  maxDrawdownRate: number;
};

type SubsetMetrics = {
  sessionCount: number;
  returnRate: number;
  winRate: number;
  profitLossRatio: number;
  maxDrawdownRate: number;
  avgHoldBars: number;
  tradeFrequency: number;
};

export const normalizeNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const normalizeIsoDate = (value: string, isEnd: boolean): string | null => {
  const text = (value || '').trim();
  if (!text) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const dateKey = toMarketDateKey(text);
    if (!dateKey) {
      return null;
    }
    const dayStart = parseTimestampMs(dateKey);
    if (!Number.isFinite(dayStart)) {
      return null;
    }
    const resolved = isEnd ? dayStart + 86_400_000 - 1 : dayStart;
    return new Date(resolved).toISOString();
  }
  const parsed = parseTimestampMs(text);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString();
};

export const normalizeTimeframe = (value: string): string => {
  const normalized = (value || '').trim().toLowerCase();
  return normalized || 'unknown';
};

export const extractTags = (name: string): string[] => {
  const text = String(name || '').trim();
  if (!text) {
    return [];
  }
  const set = new Set<string>();
  const matches = text.matchAll(/#([\p{L}\p{N}_-]{1,32})/gu);
  for (const match of matches) {
    const tag = (match[1] || '').trim().toLowerCase();
    if (tag) {
      set.add(tag);
    }
  }
  return Array.from(set);
};

export const parseTagsJson = (raw: string): string[] => {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
      .filter((item): item is string => Boolean(item));
  } catch {
    return [];
  }
};

export const parseReplayFills = (replay: ReplayPayload | null): ReplayFill[] => {
  if (!replay?.snapshot?.fills || !Array.isArray(replay.snapshot.fills)) {
    return [];
  }
  return replay.snapshot.fills
    .map((fill) => {
      const side = fill.side === 'BUY' || fill.side === 'SELL' ? fill.side : null;
      if (!side) {
        return null;
      }
      const qty = normalizeNumber(fill.fill_qty);
      if (qty <= 0) {
        return null;
      }
      return {
        side,
        fill_index: Math.max(0, Math.floor(normalizeNumber(fill.fill_index))),
        fill_time: typeof fill.fill_time === 'string' && fill.fill_time.trim() ? fill.fill_time : '',
        fill_price: Math.max(0, normalizeNumber(fill.fill_price)),
        fill_qty: qty,
        contract_multiplier: Math.max(Number.EPSILON, normalizeNumber(fill.contract_multiplier, 1)),
        fee: Math.max(0, normalizeNumber(fill.fee)),
        tax: Math.max(0, normalizeNumber(fill.tax)),
        slippage: Math.max(0, normalizeNumber(fill.slippage))
      } satisfies ReplayFill;
    })
    .filter((item): item is ReplayFill => Boolean(item))
    .sort((a, b) => {
      if (a.fill_index !== b.fill_index) {
        return a.fill_index - b.fill_index;
      }
      if (a.fill_time !== b.fill_time) {
        return a.fill_time.localeCompare(b.fill_time);
      }
      // Stable sort preserves the persisted sequence for same-bar reversals.
      return 0;
    });
};

export const parseReplayTradeRoundRecords = (replay: ReplayPayload | null): ClosedTradeRecord[] => {
  const rawRounds = Array.isArray(replay?.tradeRounds) ? replay.tradeRounds : [];
  if (!rawRounds.length) {
    return [];
  }
  return rawRounds
    .map((item) => {
      if (Array.isArray(item) && item.length >= 13) {
        const direction: 'LONG' | 'SHORT' = Math.floor(normalizeNumber(item[0], 1)) === -1 ? 'SHORT' : 'LONG';
        const entryIndex = Math.max(0, Math.floor(normalizeNumber(item[1])));
        const closeIndex = Math.max(entryIndex, Math.floor(normalizeNumber(item[2])));
        const pnl = normalizeNumber(item[7], Number.NaN);
        if (!Number.isFinite(pnl)) {
          return null;
        }
        const returnRate = normalizeNumber(item[8]);
        const closeAt = typeof item[14] === 'string' ? item[14] : typeof item[13] === 'string' ? item[13] : '';
        return {
          direction,
          pnl,
          returnRate: Number.isFinite(returnRate) ? returnRate : 0,
          holdBars: Math.max(0, closeIndex - entryIndex),
          closeAt,
          closeIndex
        } satisfies ClosedTradeRecord;
      }
      if (!item || typeof item !== 'object') {
        return null;
      }
      const source = item as Record<string, unknown>;
      const direction = source.direction === 'SHORT' ? 'SHORT' : source.direction === 'LONG' ? 'LONG' : null;
      if (!direction) {
        return null;
      }
      const pnl = normalizeNumber(source.pnl, Number.NaN);
      if (!Number.isFinite(pnl)) {
        return null;
      }
      const returnRate = normalizeNumber(source.returnRate);
      const holdBars = Math.max(0, normalizeNumber(source.holdBars));
      const closeIndex = Math.max(0, Math.floor(normalizeNumber(source.closeIndex)));
      const closeAt = typeof source.closeTime === 'string' ? source.closeTime : '';
      return {
        direction,
        pnl,
        returnRate: Number.isFinite(returnRate) ? returnRate : 0,
        holdBars: Number.isFinite(holdBars) ? holdBars : 0,
        closeAt,
        closeIndex
      } satisfies ClosedTradeRecord;
    })
    .filter((item): item is ClosedTradeRecord => Boolean(item))
    .sort((left, right) => {
      if (left.closeIndex !== right.closeIndex) {
        return left.closeIndex - right.closeIndex;
      }
      return left.closeAt.localeCompare(right.closeAt);
    });
};

export const calcSessionTradeAnalytics = (fills: ReplayFill[], initialAsset: number): SessionTradeAnalytics => {
  type OpenLot = {
    qty: number;
    price: number;
    entryIndex: number;
    entryFeePerShare: number;
    contractMultiplier: number;
  };
  const openLongLots: OpenLot[] = [];
  const openShortLots: OpenLot[] = [];
  const records: ClosedTradeRecord[] = [];
  let addPositionCount = 0;
  let reducePositionCount = 0;
  let fullPositionCount = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let totalSlippage = 0;
  let totalFeesFromFills = 0;
  let positionQty = 0;
  const POSITION_EPSILON = 1e-9;
  const orderedFills = fills
    .map((fill, sourceSequence) => ({ fill, sourceSequence }))
    .sort((left, right) => {
      if (left.fill.fill_index !== right.fill.fill_index) {
        return left.fill.fill_index - right.fill.fill_index;
      }
      if (left.fill.fill_time !== right.fill.fill_time) {
        return left.fill.fill_time.localeCompare(right.fill.fill_time);
      }
      return left.sourceSequence - right.sourceSequence;
    })
    .map((item) => item.fill);

  for (const fill of orderedFills) {
    const qty = Math.max(0, normalizeNumber(fill.fill_qty));
    const price = Math.max(0, normalizeNumber(fill.fill_price));
    const contractMultiplier = Math.max(Number.EPSILON, normalizeNumber(fill.contract_multiplier, 1));
    const fee = Math.max(0, normalizeNumber(fill.fee));
    const tax = Math.max(0, normalizeNumber(fill.tax));
    const slippage = Math.max(0, normalizeNumber(fill.slippage));
    const tradeCost = fee + tax + slippage;
    totalSlippage += slippage;
    totalFeesFromFills += fee + tax;
    if (qty <= 0) {
      continue;
    }
    const feePerShare = qty > 0 ? tradeCost / qty : 0;
    const prevQty = positionQty;
    const nextQty = fill.side === 'BUY' ? prevQty + qty : prevQty - qty;
    const prevAbs = Math.abs(prevQty);
    const nextAbs = Math.abs(nextQty);
    const sameDirection = prevQty * nextQty > 0;

    if (prevAbs > POSITION_EPSILON) {
      if (sameDirection && nextAbs > prevAbs + POSITION_EPSILON) {
        addPositionCount += 1;
      } else if (sameDirection && nextAbs < prevAbs - POSITION_EPSILON) {
        reducePositionCount += 1;
      } else if (!sameDirection && nextAbs > POSITION_EPSILON) {
        reducePositionCount += 1;
        addPositionCount += 1;
      } else if (nextAbs <= POSITION_EPSILON) {
        reducePositionCount += 1;
      }
    }

    const notional = price * qty * contractMultiplier;
    const isPositionExpansion = nextAbs > prevAbs + POSITION_EPSILON;
    if (isPositionExpansion && initialAsset > 0 && notional >= initialAsset * 0.95) {
      fullPositionCount += 1;
    }

    if (fill.side === 'BUY') {
      let remaining = qty;
      while (remaining > POSITION_EPSILON && openShortLots.length) {
        const lot = openShortLots[0];
        const matchedQty = Math.min(remaining, lot.qty);
        const entryNotional = lot.price * matchedQty * lot.contractMultiplier;
        const exitNotional = price * matchedQty * contractMultiplier;
        const grossPnl = entryNotional - exitNotional;
        const netPnl = grossPnl - (lot.entryFeePerShare + feePerShare) * matchedQty;
        // Net trade return over gross entry notional; leverage/margin capital
        // is not available at lot level and is deliberately not imputed.
        const returnRate = entryNotional > 0 ? netPnl / entryNotional : 0;
        records.push({
          direction: 'SHORT',
          pnl: netPnl,
          returnRate,
          holdBars: Math.max(0, fill.fill_index - lot.entryIndex),
          closeAt: fill.fill_time,
          closeIndex: fill.fill_index
        });
        lot.qty -= matchedQty;
        remaining -= matchedQty;
        if (lot.qty <= POSITION_EPSILON) {
          openShortLots.shift();
        }
      }
      if (remaining > POSITION_EPSILON) {
        openLongLots.push({
          qty: remaining,
          price,
          entryIndex: fill.fill_index,
          entryFeePerShare: feePerShare,
          contractMultiplier
        });
      }
    } else {
      let remaining = qty;
      while (remaining > POSITION_EPSILON && openLongLots.length) {
        const lot = openLongLots[0];
        const matchedQty = Math.min(remaining, lot.qty);
        const entryNotional = lot.price * matchedQty * lot.contractMultiplier;
        const exitNotional = price * matchedQty * contractMultiplier;
        const grossPnl = exitNotional - entryNotional;
        const netPnl = grossPnl - (lot.entryFeePerShare + feePerShare) * matchedQty;
        const returnRate = entryNotional > 0 ? netPnl / entryNotional : 0;
        records.push({
          direction: 'LONG',
          pnl: netPnl,
          returnRate,
          holdBars: Math.max(0, fill.fill_index - lot.entryIndex),
          closeAt: fill.fill_time,
          closeIndex: fill.fill_index
        });
        lot.qty -= matchedQty;
        remaining -= matchedQty;
        if (lot.qty <= POSITION_EPSILON) {
          openLongLots.shift();
        }
      }
      if (remaining > POSITION_EPSILON) {
        openShortLots.push({
          qty: remaining,
          price,
          entryIndex: fill.fill_index,
          entryFeePerShare: feePerShare,
          contractMultiplier
        });
      }
    }

    positionQty = nextQty;
  }

  records.sort((a, b) => {
    if (a.closeIndex !== b.closeIndex) {
      return a.closeIndex - b.closeIndex;
    }
    return a.closeAt.localeCompare(b.closeAt);
  });

  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  let profitTradeTotal = 0;
  let lossTradeTotal = 0;
  let holdBarsSum = 0;
  let takeProfitRateSum = 0;
  let stopLossRateSum = 0;
  let takeProfitCount = 0;
  let stopLossCount = 0;

  for (const record of records) {
    holdBarsSum += record.holdBars;
    if (record.pnl > 0) {
      winningTrades += 1;
      profitTradeTotal += record.pnl;
      takeProfitRateSum += record.returnRate;
      takeProfitCount += 1;
      currentWinStreak += 1;
      currentLossStreak = 0;
      maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWinStreak);
      continue;
    }
    if (record.pnl < 0) {
      losingTrades += 1;
      lossTradeTotal += record.pnl;
      stopLossRateSum += Math.abs(record.returnRate);
      stopLossCount += 1;
      currentLossStreak += 1;
      currentWinStreak = 0;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
      continue;
    }
    currentWinStreak = 0;
    currentLossStreak = 0;
  }

  const closedTrades = records.length;
  const totalTradePnl = profitTradeTotal + lossTradeTotal;

  return {
    closedTrades,
    winningTrades,
    losingTrades,
    profitTradeTotal,
    lossTradeTotal,
    totalTradePnl,
    averageHoldBars: closedTrades > 0 ? holdBarsSum / closedTrades : 0,
    averageTakeProfitRate: takeProfitCount > 0 ? takeProfitRateSum / takeProfitCount : 0,
    averageStopLossRate: stopLossCount > 0 ? stopLossRateSum / stopLossCount : 0,
    addPositionCount,
    reducePositionCount,
    fullPositionCount,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    totalSlippage,
    totalFeesFromFills,
    records
  };
};

export const calcLongTradeStatsFromRecords = (
  records: ClosedTradeRecord[],
): DirectionalTradeStats => {
  let longClosedTrades = 0;
  let longWinningTrades = 0;
  for (const record of records) {
    if (record.direction !== 'LONG') {
      continue;
    }
    longClosedTrades += 1;
    if (record.pnl > 0) {
      longWinningTrades += 1;
    }
  }
  return {
    longClosedTrades,
    longWinningTrades,
  };
};

export const monthKeyFromIso = (iso: string): string => {
  const parts = toMarketDateParts(iso);
  if (!parts) {
    return '';
  }
  const year = parts.year;
  const month = String(parts.month).padStart(2, '0');
  return `${year}-${month}`;
};

export const dayKeyFromIso = (iso: string): string => {
  return toMarketDateKey(iso);
};

export const weekKeyFromIso = (iso: string): string => {
  const parts = toMarketDateParts(iso);
  if (!parts) {
    return '';
  }
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

const toBucketArray = (map: Map<string, BucketAggregate>) =>
  Array.from(map.values())
    .filter((item) => item.period)
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((item) => ({
      period: item.period,
      sessionCount: item.sessionCount,
      totalPnl: item.totalPnl,
      winRate: item.sessionCount > 0 ? item.winCount / item.sessionCount : 0,
      maxDrawdownRate: item.maxDrawdownRate,
      totalReturnRate: item.totalInitial > 0 ? item.totalPnl / item.totalInitial : 0
    }));

export const aggregateByPeriod = (
  sessions: SessionAnalytics[],
  keyGetter: (iso: string) => string
): Array<{
  period: string;
  sessionCount: number;
  totalPnl: number;
  winRate: number;
  maxDrawdownRate: number;
  totalReturnRate: number;
}> => {
  const map = new Map<string, BucketAggregate>();
  for (const session of sessions) {
    const key = keyGetter(session.createdAt);
    if (!key) {
      continue;
    }
    const current = map.get(key) ?? {
      period: key,
      sessionCount: 0,
      winCount: 0,
      totalPnl: 0,
      totalInitial: 0,
      maxDrawdownRate: 0
    };
    current.sessionCount += 1;
    if (session.totalPnl > 0) {
      current.winCount += 1;
    }
    current.totalPnl += session.totalPnl;
    current.totalInitial += Math.max(0, session.initialTotal);
    current.maxDrawdownRate = Math.max(current.maxDrawdownRate, Math.max(0, session.maxDrawdownRate));
    map.set(key, current);
  }
  return toBucketArray(map);
};

export const resolvePreviousMonthKey = (monthKey: string): string => {
  const parts = monthKey.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return '';
  }
  const date = new Date(Date.UTC(year, month - 1, 1));
  date.setUTCMonth(date.getUTCMonth() - 1);
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${nextYear}-${nextMonth}`;
};

const calcSubsetMetrics = (sessions: SessionAnalytics[]): SubsetMetrics => {
  const sessionCount = sessions.length;
  if (!sessionCount) {
    return {
      sessionCount: 0,
      returnRate: 0,
      winRate: 0,
      profitLossRatio: 0,
      maxDrawdownRate: 0,
      avgHoldBars: 0,
      tradeFrequency: 0
    };
  }

  let totalPnl = 0;
  let totalInitial = 0;
  let winCount = 0;
  let maxDrawdownRate = 0;
  let totalTrades = 0;
  let holdBarsSum = 0;
  let holdBarsCount = 0;
  let profitTradeTotal = 0;
  let lossTradeTotal = 0;
  let winningTrades = 0;
  let losingTrades = 0;

  for (const session of sessions) {
    totalPnl += session.totalPnl;
    totalInitial += Math.max(0, session.initialTotal);
    totalTrades += Math.max(0, session.totalTrades);
    if (session.totalPnl > 0) {
      winCount += 1;
    }
    maxDrawdownRate = Math.max(maxDrawdownRate, Math.max(0, session.maxDrawdownRate));
    holdBarsSum += session.trade.averageHoldBars * session.trade.closedTrades;
    holdBarsCount += session.trade.closedTrades;
    profitTradeTotal += session.trade.profitTradeTotal;
    lossTradeTotal += session.trade.lossTradeTotal;
    winningTrades += session.trade.winningTrades;
    losingTrades += session.trade.losingTrades;
  }

  const avgProfitTrade = winningTrades > 0 ? profitTradeTotal / winningTrades : 0;
  const avgLossTrade = losingTrades > 0 ? Math.abs(lossTradeTotal / losingTrades) : 0;
  const profitLossRatio = avgLossTrade > 1e-9 ? avgProfitTrade / avgLossTrade : 0;

  return {
    sessionCount,
    returnRate: totalInitial > 0 ? totalPnl / totalInitial : 0,
    winRate: winCount / sessionCount,
    profitLossRatio,
    maxDrawdownRate,
    avgHoldBars: holdBarsCount > 0 ? holdBarsSum / holdBarsCount : 0,
    tradeFrequency: totalTrades / sessionCount
  };
};

export const createComparison = (
  leftLabel: string,
  rightLabel: string,
  leftSessions: SessionAnalytics[],
  rightSessions: SessionAnalytics[]
) => {
  const left = calcSubsetMetrics(leftSessions);
  const right = calcSubsetMetrics(rightSessions);
  return {
    leftLabel,
    rightLabel,
    left,
    right,
    delta: {
      returnRate: left.returnRate - right.returnRate,
      winRate: left.winRate - right.winRate,
      profitLossRatio: left.profitLossRatio - right.profitLossRatio,
      maxDrawdownRate: left.maxDrawdownRate - right.maxDrawdownRate,
      avgHoldBars: left.avgHoldBars - right.avgHoldBars,
      tradeFrequency: left.tradeFrequency - right.tradeFrequency
    }
  };
};
