// SPDX-License-Identifier: GPL-3.0-only

import type { OrderSide } from "./trading.js";

export type ReplaySide = OrderSide;

export type ReplayBarLike = {
  ts: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
};

export type ReplayFillLike = {
  side?: unknown;
  fill_index?: unknown;
  fill_time?: unknown;
  created_at?: unknown;
  fill_price?: unknown;
  fill_qty?: unknown;
  contract_multiplier?: unknown;
  fee?: unknown;
  tax?: unknown;
  slippage?: unknown;
  symbol?: unknown;
};

export type ReplayCashAdjustmentLike = {
  bar_index?: unknown;
  barIndex?: unknown;
  amount?: unknown;
  ts?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
  kind?: unknown;
};

export type CompactReplayFill = {
  id: string;
  order_id: string;
  session_id: string;
  instrument_id: string;
  symbol: string;
  side: ReplaySide;
  fill_index: number;
  fill_time: string;
  fill_price: number;
  fill_qty: number;
  contract_multiplier: number;
  fee: number;
  tax: number;
  slippage: number;
  created_at: string;
};

export type ReplayCurvePoint = {
  ts: string;
  value: number;
};

export type ReplayTradeRound = {
  id: string;
  direction: "LONG" | "SHORT";
  entryIndex: number;
  closeIndex: number;
  entryTime: string;
  closeTime: string;
  holdBars: number;
  quantity: number;
  entryAvgPrice: number;
  exitAvgPrice: number;
  grossPnl: number;
  pnl: number;
  returnRate: number;
  mfeRate: number;
  maeRate: number;
  entryCost: number;
  exitCost: number;
};

export type ReplayEquityMetrics = {
  equityCurve: ReplayCurvePoint[];
  drawdownCurve: ReplayCurvePoint[];
  finalEquity: number;
  equityReturnRate: number;
};

export type CompactReplayOptions = {
  fallbackSymbol?: string;
  fallbackCreatedAt?: string;
  nonNegativeCosts?: boolean;
};

export type ReplaySnapshotSessionLike = Record<string, unknown> & {
  start_index?: unknown;
  entry_index?: unknown;
  cursor_index?: unknown;
  symbol?: unknown;
  created_at?: unknown;
};

export type ReplaySnapshotLike = Record<string, unknown> & {
  session: ReplaySnapshotSessionLike;
  fills?: readonly ReplayFillLike[] | null;
  cashAdjustments?: readonly ReplayCashAdjustmentLike[] | null;
  longFinancingChargesTotal?: unknown;
  shortBorrowChargesTotal?: unknown;
};

export type ReplaySnapshotArchiveWindow<
  TBar extends ReplayBarLike,
  TSnapshot extends ReplaySnapshotLike,
> = {
  bars: TBar[];
  snapshot: TSnapshot;
};

export type ReplayTitleMetrics = {
  profitLossRatio: number | null;
  winRate: number | null;
};

export type ReplayRatioState = "FINITE" | "POSITIVE_INFINITY" | "NOT_AVAILABLE";

export type ReplayProfitFactor = {
  value: number | null;
  state: ReplayRatioState;
  grossProfit: number;
  grossLoss: number;
};

export const deriveReplayProfitFactor = (
  profitTradeTotal: unknown,
  lossTradeTotal: unknown,
  epsilon = 1e-9,
): ReplayProfitFactor => {
  const rawProfit = Number(profitTradeTotal);
  const rawLoss = Number(lossTradeTotal);
  const grossProfit = Number.isFinite(rawProfit) ? Math.max(0, rawProfit) : 0;
  const grossLoss = Number.isFinite(rawLoss) ? Math.abs(rawLoss) : 0;
  const normalizedEpsilon =
    Number.isFinite(epsilon) && epsilon > 0 ? epsilon : 1e-9;
  if (grossLoss > normalizedEpsilon) {
    return {
      value: grossProfit / grossLoss,
      state: "FINITE",
      grossProfit,
      grossLoss,
    };
  }
  if (grossProfit > normalizedEpsilon) {
    return {
      value: null,
      state: "POSITIVE_INFINITY",
      grossProfit,
      grossLoss,
    };
  }
  return {
    value: null,
    state: "NOT_AVAILABLE",
    grossProfit,
    grossLoss,
  };
};

export type FastDecisionReplayTitleMetrics = {
  advantageRatio: string | null;
  winRate: number | null;
};

export type RiskDisciplineReplayTitleMetrics = {
  grade: string | null;
  recoveryRate: number | null;
};

import {
  clamp,
  normalizeText,
  toFiniteNumber,
  type NormalizedReplayFillForTradeRound,
  type OpenTradeRound,
} from "./replayArchive.js";

export {
  buildReplayEquityMetrics,
  buildReplaySnapshotArchiveWindow,
  calculateReplayEquityMetrics,
  compactReplayFillsForArchive,
  compactReplaySnapshotForArchive,
  resolveReplaySnapshotCashAdjustments,
} from "./replayArchive.js";

export const calcMaxDrawdownRateFromEquityCurve = (
  curve: readonly ReplayCurvePoint[],
): number => {
  if (!Array.isArray(curve) || curve.length <= 1) {
    return 0;
  }
  let peak = Number.NEGATIVE_INFINITY;
  let maxDrawdownRate = 0;
  for (const point of curve) {
    const value = Number(point?.value);
    if (!Number.isFinite(value)) {
      continue;
    }
    if (value > peak) {
      peak = value;
      continue;
    }
    if (peak > 0) {
      const drawdownRate = Math.max(0, (peak - value) / peak);
      if (drawdownRate > maxDrawdownRate) {
        maxDrawdownRate = drawdownRate;
      }
    }
  }
  return Math.max(0, maxDrawdownRate);
};

export const getReplayProjectDrawdownRate = (project: {
  replay?: { equityCurve?: readonly ReplayCurvePoint[] | null } | null;
  summary?: { maxDrawdownRate?: unknown } | null;
}): number => {
  const curve = project.replay?.equityCurve;
  if (Array.isArray(curve) && curve.length > 1) {
    return calcMaxDrawdownRateFromEquityCurve(curve);
  }
  const raw = Number(project.summary?.maxDrawdownRate ?? 0);
  return Number.isFinite(raw) ? Math.max(0, Math.abs(raw)) : 0;
};

const normalizeReplayFillForTradeRound = (
  fill: ReplayFillLike,
): NormalizedReplayFillForTradeRound | null => {
  const side = fill?.side === "BUY" || fill?.side === "SELL" ? fill.side : null;
  if (!side) {
    return null;
  }
  const qty = toFiniteNumber(fill?.fill_qty, 0);
  const price = toFiniteNumber(fill?.fill_price, 0);
  if (qty <= 0 || price <= 0) {
    return null;
  }
  return {
    side,
    fillIndex: Math.max(0, Math.floor(toFiniteNumber(fill?.fill_index, 0))),
    fillTime: normalizeText(fill?.fill_time),
    createdAt: normalizeText(fill?.created_at),
    qty,
    price,
    contractMultiplier: Math.max(
      Number.EPSILON,
      toFiniteNumber(fill?.contract_multiplier, 1),
    ),
    fee: toFiniteNumber(fill?.fee, 0),
    tax: toFiniteNumber(fill?.tax, 0),
    slippage: toFiniteNumber(fill?.slippage, 0),
  };
};

const normalizeBarHigh = (bar: ReplayBarLike | null | undefined): number => {
  const values = [bar?.high, bar?.open, bar?.close, bar?.low]
    .map((value) => toFiniteNumber(value, Number.NaN))
    .filter((value) => Number.isFinite(value));
  if (!values.length) {
    return Number.NaN;
  }
  return Math.max(...values);
};

const normalizeBarLow = (bar: ReplayBarLike | null | undefined): number => {
  const values = [bar?.low, bar?.open, bar?.close, bar?.high]
    .map((value) => toFiniteNumber(value, Number.NaN))
    .filter((value) => Number.isFinite(value));
  if (!values.length) {
    return Number.NaN;
  }
  return Math.min(...values);
};

const resolveFillSortKey = (
  fill: NormalizedReplayFillForTradeRound,
): string => {
  const fillTime = normalizeText(fill?.fillTime);
  if (fillTime) {
    return fillTime;
  }
  return normalizeText(fill?.createdAt);
};

const sortTradeRoundFills = (
  left: NormalizedReplayFillForTradeRound,
  right: NormalizedReplayFillForTradeRound,
): number => {
  if (left.fillIndex !== right.fillIndex) {
    return left.fillIndex - right.fillIndex;
  }
  const leftKey = resolveFillSortKey(left);
  const rightKey = resolveFillSortKey(right);
  if (leftKey !== rightKey) {
    return leftKey.localeCompare(rightKey);
  }
  // Array#sort is stable. Equal execution coordinates must retain the
  // persisted sequence because a same-bar reversal is order-sensitive.
  return 0;
};

const createOpenTradeRound = (
  direction: "LONG" | "SHORT",
  fill: NormalizedReplayFillForTradeRound,
): OpenTradeRound => {
  const time = fill.fillTime || fill.createdAt || "";
  return {
    direction,
    entryIndex: fill.fillIndex,
    closeIndex: fill.fillIndex,
    entryTime: time,
    closeTime: time,
    entryQty: 0,
    entryPriceWeight: 0,
    entryNotional: 0,
    entryCost: 0,
    exitQty: 0,
    exitPriceWeight: 0,
    exitNotional: 0,
    exitCost: 0,
  };
};

const buildRoundPriceMetrics = (
  direction: "LONG" | "SHORT",
  entryPrice: number,
  exitPrice: number,
  bars: readonly ReplayBarLike[],
  entryIndex: number,
  closeIndex: number,
): { mfeRate: number; maeRate: number } => {
  if (
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0 ||
    !Array.isArray(bars) ||
    !bars.length
  ) {
    return { mfeRate: 0, maeRate: 0 };
  }
  const start = clamp(
    Math.floor(toFiniteNumber(entryIndex, 0)),
    0,
    bars.length - 1,
  );
  const end = clamp(
    Math.floor(toFiniteNumber(closeIndex, start)),
    start,
    bars.length - 1,
  );
  const priceMatches = (left: number, right: unknown): boolean => {
    const normalizedRight = toFiniteNumber(right, Number.NaN);
    if (!Number.isFinite(normalizedRight)) {
      return false;
    }
    return (
      Math.abs(left - normalizedRight) <=
      Math.max(1e-8, Math.abs(normalizedRight) * 1e-8)
    );
  };
  const entryBar = bars[start] ?? null;
  const exitBar = bars[end] ?? null;
  const entryAtOpen =
    priceMatches(entryPrice, entryBar?.open) &&
    !priceMatches(entryPrice, entryBar?.close);
  const exitAtClose =
    priceMatches(exitPrice, exitBar?.close) &&
    !priceMatches(exitPrice, exitBar?.open);
  // Only include a boundary bar when the fill proves the position existed
  // throughout that bar. Ambiguous fills are excluded conservatively so
  // pre-entry and post-exit extremes cannot leak into MFE/MAE.
  const exposedStart = entryAtOpen ? start : start + 1;
  const exposedEnd = exitAtClose ? end : end - 1;
  if (exposedStart > exposedEnd) {
    return { mfeRate: 0, maeRate: 0 };
  }
  let favorable = entryPrice;
  let adverse = entryPrice;
  for (let index = exposedStart; index <= exposedEnd; index += 1) {
    const bar = bars[index] ?? null;
    const barHigh = normalizeBarHigh(bar);
    const barLow = normalizeBarLow(bar);
    if (!Number.isFinite(barHigh) || !Number.isFinite(barLow)) {
      continue;
    }
    if (direction === "LONG") {
      favorable = Math.max(favorable, barHigh);
      adverse = Math.min(adverse, barLow);
    } else {
      favorable = Math.min(favorable, barLow);
      adverse = Math.max(adverse, barHigh);
    }
  }
  if (direction === "LONG") {
    return {
      mfeRate: Math.max(0, (favorable - entryPrice) / entryPrice),
      maeRate: Math.max(0, (entryPrice - adverse) / entryPrice),
    };
  }
  return {
    mfeRate: Math.max(0, (entryPrice - favorable) / entryPrice),
    maeRate: Math.max(0, (adverse - entryPrice) / entryPrice),
  };
};

const finalizeTradeRound = (
  round: OpenTradeRound | null,
  sequence: number,
  bars: readonly ReplayBarLike[],
): ReplayTradeRound | null => {
  const EPSILON = 1e-9;
  if (!round || round.entryQty <= EPSILON || round.exitQty <= EPSILON) {
    return null;
  }
  const direction = round.direction === "SHORT" ? "SHORT" : "LONG";
  const entryAvgPrice = round.entryPriceWeight / round.entryQty;
  const exitAvgPrice = round.exitPriceWeight / round.exitQty;
  if (
    !Number.isFinite(entryAvgPrice) ||
    entryAvgPrice <= 0 ||
    !Number.isFinite(exitAvgPrice) ||
    exitAvgPrice <= 0
  ) {
    return null;
  }
  const grossPnl =
    direction === "LONG"
      ? round.exitNotional - round.entryNotional
      : round.entryNotional - round.exitNotional;
  const entryCost = toFiniteNumber(round.entryCost, 0);
  const exitCost = toFiniteNumber(round.exitCost, 0);
  const pnl = grossPnl - entryCost - exitCost;
  // Round return is net P&L over gross entry notional. It intentionally does
  // not amplify returns by leverage or an unavailable margin-capital estimate.
  const returnRate = round.entryNotional > 0 ? pnl / round.entryNotional : 0;
  const holdBars = Math.max(0, Math.floor(round.closeIndex - round.entryIndex));
  const { mfeRate, maeRate } = buildRoundPriceMetrics(
    direction,
    entryAvgPrice,
    exitAvgPrice,
    bars,
    round.entryIndex,
    round.closeIndex,
  );

  return {
    id: `round-${Math.max(1, sequence)}`,
    direction,
    entryIndex: Math.max(0, Math.floor(round.entryIndex)),
    closeIndex: Math.max(0, Math.floor(round.closeIndex)),
    entryTime: normalizeText(round.entryTime),
    closeTime: normalizeText(round.closeTime),
    holdBars,
    quantity: Math.max(0, toFiniteNumber(round.entryQty, 0)),
    entryAvgPrice,
    exitAvgPrice,
    grossPnl: toFiniteNumber(grossPnl, 0),
    pnl: toFiniteNumber(pnl, 0),
    returnRate: Number.isFinite(returnRate) ? returnRate : 0,
    mfeRate: Math.max(0, toFiniteNumber(mfeRate, 0)),
    maeRate: Math.max(0, toFiniteNumber(maeRate, 0)),
    entryCost: Math.max(0, entryCost),
    exitCost: Math.max(0, exitCost),
  };
};

const appendEntrySegmentToRound = (
  round: OpenTradeRound,
  fill: NormalizedReplayFillForTradeRound,
  qty: number,
): void => {
  const segmentQty = Math.max(0, qty);
  if (!segmentQty) {
    return;
  }
  const ratio = segmentQty / Math.max(segmentQty, fill.qty);
  const segmentFee = fill.fee * ratio;
  const segmentTax = fill.tax * ratio;
  const segmentSlippage = fill.slippage * ratio;
  if (round.entryQty <= 0) {
    round.entryIndex = fill.fillIndex;
    round.entryTime = fill.fillTime || fill.createdAt || "";
  }
  round.entryQty += segmentQty;
  round.entryPriceWeight += fill.price * segmentQty;
  round.entryNotional += fill.price * segmentQty * fill.contractMultiplier;
  round.entryCost += segmentFee + segmentTax + segmentSlippage;
};

const appendExitSegmentToRound = (
  round: OpenTradeRound,
  fill: NormalizedReplayFillForTradeRound,
  qty: number,
): void => {
  const segmentQty = Math.max(0, qty);
  if (!segmentQty) {
    return;
  }
  const ratio = segmentQty / Math.max(segmentQty, fill.qty);
  const segmentFee = fill.fee * ratio;
  const segmentTax = fill.tax * ratio;
  const segmentSlippage = fill.slippage * ratio;
  round.closeIndex = fill.fillIndex;
  round.closeTime = fill.fillTime || fill.createdAt || "";
  round.exitQty += segmentQty;
  round.exitPriceWeight += fill.price * segmentQty;
  round.exitNotional += fill.price * segmentQty * fill.contractMultiplier;
  round.exitCost += segmentFee + segmentTax + segmentSlippage;
};

export const deriveReplayTradeRounds = (input: {
  bars: readonly ReplayBarLike[];
  fills: readonly ReplayFillLike[];
}): ReplayTradeRound[] => {
  const bars = Array.isArray(input?.bars) ? input.bars : [];
  const fills = (Array.isArray(input?.fills) ? input.fills : [])
    .map((fill) => normalizeReplayFillForTradeRound(fill))
    .filter((fill): fill is NormalizedReplayFillForTradeRound => fill !== null)
    .sort(sortTradeRoundFills);
  if (!fills.length) {
    return [];
  }

  const EPSILON = 1e-9;
  const rounds: ReplayTradeRound[] = [];
  let openRound: OpenTradeRound | null = null;
  let roundSequence = 0;
  let positionQty = 0;

  const closeRound = (): void => {
    if (!openRound) {
      return;
    }
    const finalized = finalizeTradeRound(openRound, roundSequence + 1, bars);
    openRound = null;
    if (!finalized) {
      return;
    }
    roundSequence += 1;
    rounds.push(finalized);
  };

  const ensureOpenRound = (
    direction: "LONG" | "SHORT",
    fill: NormalizedReplayFillForTradeRound,
  ): OpenTradeRound => {
    if (openRound && openRound.direction === direction) {
      return openRound;
    }
    openRound = createOpenTradeRound(direction, fill);
    return openRound;
  };

  for (const fill of fills) {
    let remainingQty = fill.qty;
    while (remainingQty > EPSILON) {
      if (fill.side === "BUY") {
        if (positionQty < -EPSILON) {
          const closeQty = Math.min(remainingQty, Math.abs(positionQty));
          const round = ensureOpenRound("SHORT", fill);
          appendExitSegmentToRound(round, fill, closeQty);
          positionQty += closeQty;
          remainingQty -= closeQty;
          if (Math.abs(positionQty) <= EPSILON) {
            positionQty = 0;
            closeRound();
          }
          continue;
        }
        const round = ensureOpenRound("LONG", fill);
        appendEntrySegmentToRound(round, fill, remainingQty);
        positionQty += remainingQty;
        remainingQty = 0;
        continue;
      }

      if (positionQty > EPSILON) {
        const closeQty = Math.min(remainingQty, positionQty);
        const round = ensureOpenRound("LONG", fill);
        appendExitSegmentToRound(round, fill, closeQty);
        positionQty -= closeQty;
        remainingQty -= closeQty;
        if (Math.abs(positionQty) <= EPSILON) {
          positionQty = 0;
          closeRound();
        }
        continue;
      }
      const round = ensureOpenRound("SHORT", fill);
      appendEntrySegmentToRound(round, fill, remainingQty);
      positionQty -= remainingQty;
      remainingQty = 0;
    }
  }

  // Flush any exposure still open when the session ends into a final trade
  // round, marked at the last bar close (or the last fill price when no bar
  // is available). Without this the round is dropped even though the position
  // generated holding P&L until the end of the session.
  const finalOpenRound = openRound as OpenTradeRound | null;
  if (finalOpenRound && Math.abs(positionQty) > EPSILON) {
    const lastBar = bars[bars.length - 1] ?? null;
    const lastFill = fills[fills.length - 1] ?? null;
    const lastBarIndex = Math.max(0, bars.length - 1);
    const markPrice = toFiniteNumber(
      lastBar?.close,
      toFiniteNumber(lastFill?.price, 0),
    );
    if (Number.isFinite(markPrice) && markPrice > 0) {
      const exitQty = Math.abs(positionQty);
      const exitFill: NormalizedReplayFillForTradeRound = {
        side: positionQty > 0 ? "SELL" : "BUY",
        fillIndex: lastBarIndex,
        fillTime:
          normalizeText(lastBar?.ts) || normalizeText(lastFill?.fillTime),
        createdAt: normalizeText(lastFill?.createdAt),
        qty: exitQty,
        price: markPrice,
        contractMultiplier:
          finalOpenRound.entryQty > 0
            ? finalOpenRound.entryNotional / finalOpenRound.entryPriceWeight
            : 1,
        fee: 0,
        tax: 0,
        slippage: 0,
      };
      appendExitSegmentToRound(finalOpenRound, exitFill, exitQty);
      closeRound();
    }
  }

  return rounds;
};

const resolveArchiveTradeRounds = (
  archive: { tradeRounds?: unknown } | null | undefined,
): Array<Record<string, unknown>> =>
  archive && typeof archive === "object" && Array.isArray(archive.tradeRounds)
    ? (archive.tradeRounds as Array<Record<string, unknown>>)
    : [];

export const deriveHistoryReplayTitleMetrics = (
  archive: { tradeRounds?: unknown } | null | undefined,
): ReplayTitleMetrics => {
  const tradeRounds = resolveArchiveTradeRounds(archive);
  if (!tradeRounds.length) {
    return {
      profitLossRatio: null,
      winRate: null,
    };
  }
  let totalPositive = 0;
  let totalNegativeAbs = 0;
  let wins = 0;
  let counted = 0;
  tradeRounds.forEach((round) => {
    const pnl = Number(round.pnl ?? round.grossPnl ?? 0);
    if (!Number.isFinite(pnl)) {
      return;
    }
    counted += 1;
    if (pnl > 0) {
      wins += 1;
      totalPositive += pnl;
    } else if (pnl < 0) {
      totalNegativeAbs += Math.abs(pnl);
    }
  });
  return {
    profitLossRatio:
      totalPositive > 0 && totalNegativeAbs > 0
        ? totalPositive / totalNegativeAbs
        : totalPositive > 0 && totalNegativeAbs === 0
          ? 999
          : 0,
    winRate: counted > 0 ? wins / counted : null,
  };
};

const extractReplaySummaryChipValue = (
  archive: { noteSummary?: unknown } | null | undefined,
  matchers: readonly string[],
): { value: string; tone?: string } | null => {
  const noteSummary =
    archive?.noteSummary &&
    typeof archive.noteSummary === "object" &&
    !Array.isArray(archive.noteSummary)
      ? (archive.noteSummary as { chips?: unknown[] })
      : null;
  const rawChips =
    noteSummary && Array.isArray(noteSummary.chips) ? noteSummary.chips : [];
  const normalizedMatchers = matchers.map((item) =>
    String(item ?? "")
      .trim()
      .toLowerCase(),
  );
  for (const chip of rawChips) {
    const chipRecord =
      chip && typeof chip === "object" && !Array.isArray(chip)
        ? (chip as Record<string, unknown>)
        : null;
    const label = String(chipRecord?.label ?? "")
      .trim()
      .toLowerCase();
    if (!label) {
      continue;
    }
    if (
      !normalizedMatchers.some((matcher) => matcher && label.includes(matcher))
    ) {
      continue;
    }
    return {
      value: String(chipRecord?.value ?? "").trim(),
      tone: typeof chipRecord?.tone === "string" ? chipRecord.tone : undefined,
    };
  }
  return null;
};

export const deriveFastDecisionReplayTitleMetrics = (
  archive: { noteSummary?: unknown } | null | undefined,
  matchers: {
    advantageRatio: readonly string[];
    judgement: readonly string[];
    actual: readonly string[];
  },
): FastDecisionReplayTitleMetrics => {
  const advantage = extractReplaySummaryChipValue(
    archive,
    matchers.advantageRatio,
  );
  const judgement = extractReplaySummaryChipValue(archive, matchers.judgement);
  const actual = extractReplaySummaryChipValue(archive, matchers.actual);
  const positiveTone =
    judgement?.tone === "positive" || actual?.tone === "positive";
  const hasDecisionSignal = Boolean(judgement || actual);
  return {
    advantageRatio: advantage?.value || null,
    winRate: hasDecisionSignal ? (positiveTone ? 1 : 0) : null,
  };
};

export const deriveRiskDisciplineReplayTitleMetrics = (
  archive: { noteSummary?: unknown } | null | undefined,
  matchers: {
    grade: readonly string[];
    recoveryRate: readonly string[];
  },
): RiskDisciplineReplayTitleMetrics => {
  const grade = extractReplaySummaryChipValue(archive, matchers.grade);
  const recovery = extractReplaySummaryChipValue(
    archive,
    matchers.recoveryRate,
  );
  const recoveryValue = String(recovery?.value ?? "").trim();
  const recoveryRate = recoveryValue.endsWith("%")
    ? Number(recoveryValue.slice(0, -1)) / 100
    : Number.NaN;
  return {
    grade: grade?.value || null,
    recoveryRate: Number.isFinite(recoveryRate) ? recoveryRate : null,
  };
};
