// SPDX-License-Identifier: GPL-3.0-only

import type {
  CompactReplayFill,
  CompactReplayOptions,
  ReplayBarLike,
  ReplayCashAdjustmentLike,
  ReplayCurvePoint,
  ReplayEquityMetrics,
  ReplayFillLike,
  ReplaySide,
  ReplaySnapshotArchiveWindow,
  ReplaySnapshotLike,
} from "./replay.js";

type NormalizedReplayFillInput = {
  side: ReplaySide;
  fillIndex: number;
  symbol: string;
  qty: number;
  price: number;
  contractMultiplier: number;
  fee: number;
  tax: number;
  slippage: number;
  fillTime: string;
  createdAt: string;
};

type ReplayFillAggregate = NormalizedReplayFillInput & {
  weightedPrice: number;
  fallbackPrice: number;
};

type NormalizedReplayFillForEquity = {
  side: ReplaySide;
  fillIndex: number;
  price: number;
  qty: number;
  contractMultiplier: number;
  fee: number;
  tax: number;
  slippage: number;
  fillTime: string;
  createdAt: string;
};

type NormalizedReplayCashAdjustmentForEquity = {
  barIndex: number;
  amount: number;
  ts: string;
  createdAt: string;
  sequence: number;
};

export type NormalizedReplayFillForTradeRound = NormalizedReplayFillForEquity;

export type OpenTradeRound = {
  direction: "LONG" | "SHORT";
  entryIndex: number;
  closeIndex: number;
  entryTime: string;
  closeTime: string;
  entryQty: number;
  entryPriceWeight: number;
  entryNotional: number;
  entryCost: number;
  exitQty: number;
  exitPriceWeight: number;
  exitNotional: number;
  exitCost: number;
};

export const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const normalizeCostValue = (
  value: unknown,
  useNonNegativeCosts: boolean,
): number => {
  const number = toFiniteNumber(value, 0);
  return useNonNegativeCosts ? Math.max(0, number) : number;
};

const normalizeReplayFillInput = (
  value: ReplayFillLike,
  fallbackSymbol: string,
  fallbackCreatedAt: string,
  useNonNegativeCosts: boolean,
): NormalizedReplayFillInput | null => {
  const side =
    value?.side === "BUY" || value?.side === "SELL" ? value.side : null;
  if (!side) {
    return null;
  }
  const fillIndex = Math.max(
    0,
    Math.floor(toFiniteNumber(value?.fill_index, 0)),
  );
  const qty = toFiniteNumber(value?.fill_qty, 0);
  if (qty <= 0) {
    return null;
  }
  const price = Math.max(0, toFiniteNumber(value?.fill_price, 0));
  const contractMultiplier = Math.max(
    Number.EPSILON,
    toFiniteNumber(value?.contract_multiplier, 1),
  );
  const fee = normalizeCostValue(value?.fee, useNonNegativeCosts);
  const tax = normalizeCostValue(value?.tax, useNonNegativeCosts);
  const slippage = normalizeCostValue(value?.slippage, useNonNegativeCosts);
  const symbol = (normalizeText(value?.symbol) || fallbackSymbol).toUpperCase();
  const fillTime = normalizeText(value?.fill_time) || fallbackCreatedAt;
  const createdAt = normalizeText(value?.created_at) || fallbackCreatedAt;
  return {
    side,
    fillIndex,
    symbol,
    qty,
    price,
    contractMultiplier,
    fee,
    tax,
    slippage,
    fillTime,
    createdAt,
  };
};

export const compactReplayFillsForArchive = (
  fills: readonly ReplayFillLike[] | null | undefined,
  options: CompactReplayOptions = {},
): CompactReplayFill[] => {
  const fillList = Array.isArray(fills) ? fills : [];
  const fallbackSymbol = normalizeText(options.fallbackSymbol).toUpperCase();
  const fallbackCreatedAt =
    normalizeText(options.fallbackCreatedAt) || new Date().toISOString();
  const useNonNegativeCosts = options.nonNegativeCosts !== false;
  const normalizedFills = fillList
    .map((fill, sourceSequence) => ({
      sourceSequence,
      fill: normalizeReplayFillInput(
        fill,
        fallbackSymbol,
        fallbackCreatedAt,
        useNonNegativeCosts,
      ),
    }))
    .filter(
      (
        item,
      ): item is {
        sourceSequence: number;
        fill: NormalizedReplayFillInput;
      } => item.fill !== null,
    )
    .sort((left, right) => {
      if (left.fill.fillIndex !== right.fill.fillIndex) {
        return left.fill.fillIndex - right.fill.fillIndex;
      }
      if (left.fill.fillTime !== right.fill.fillTime) {
        return left.fill.fillTime.localeCompare(right.fill.fillTime);
      }
      if (left.fill.createdAt !== right.fill.createdAt) {
        return left.fill.createdAt.localeCompare(right.fill.createdAt);
      }
      return left.sourceSequence - right.sourceSequence;
    });
  const fillBuckets: ReplayFillAggregate[] = [];

  normalizedFills.forEach(({ fill: normalized }) => {
    // Merge with any earlier bucket sharing the same execution coordinates.
    // A buy-sell-buy reversal at one bar index must aggregate both buys into
    // a single bucket instead of only merging with the last bucket.
    const existing = fillBuckets.find(
      (bucket) =>
        bucket.fillIndex === normalized.fillIndex &&
        bucket.side === normalized.side &&
        bucket.contractMultiplier === normalized.contractMultiplier,
    );
    if (existing) {
      existing.qty += normalized.qty;
      existing.weightedPrice += normalized.price * normalized.qty;
      if (normalized.price > 0) {
        existing.fallbackPrice = normalized.price;
      }
      existing.fee += normalized.fee;
      existing.tax += normalized.tax;
      existing.slippage += normalized.slippage;
      if (normalized.fillTime.localeCompare(existing.fillTime) > 0) {
        existing.fillTime = normalized.fillTime;
      }
      if (normalized.createdAt.localeCompare(existing.createdAt) > 0) {
        existing.createdAt = normalized.createdAt;
      }
      return;
    }
    fillBuckets.push({
      ...normalized,
      weightedPrice: normalized.price * normalized.qty,
      fallbackPrice: normalized.price,
    });
  });

  return fillBuckets.map((item, sequence) => {
    const averagePrice =
      item.qty > 0 ? item.weightedPrice / item.qty : item.fallbackPrice;
    const normalizedPrice =
      Number.isFinite(averagePrice) && averagePrice > 0 ? averagePrice : 0;
    return {
      id: `agg-${item.fillIndex}-${sequence}-${item.side}-${item.contractMultiplier}`,
      order_id: "",
      session_id: "",
      instrument_id: "",
      symbol: item.symbol,
      side: item.side,
      fill_index: item.fillIndex,
      fill_time: item.fillTime,
      fill_price: normalizedPrice,
      fill_qty: item.qty,
      contract_multiplier: item.contractMultiplier,
      fee: item.fee,
      tax: item.tax,
      slippage: item.slippage,
      created_at: item.createdAt,
    };
  });
};

const normalizeReplayFillForEquity = (
  fill: ReplayFillLike,
): NormalizedReplayFillForEquity => {
  const side: ReplaySide = fill?.side === "BUY" ? "BUY" : "SELL";
  if (fill?.side !== "BUY" && fill?.side !== "SELL") {
    throw new Error("REPLAY_FILL_SIDE_INVALID");
  }
  return {
    side,
    fillIndex: Math.max(0, Math.floor(toFiniteNumber(fill?.fill_index, 0))),
    price: toFiniteNumber(fill?.fill_price, 0),
    qty: toFiniteNumber(fill?.fill_qty, 0),
    contractMultiplier: Math.max(
      Number.EPSILON,
      toFiniteNumber(fill?.contract_multiplier, 1),
    ),
    fee: toFiniteNumber(fill?.fee, 0),
    tax: toFiniteNumber(fill?.tax, 0),
    slippage: toFiniteNumber(fill?.slippage, 0),
    fillTime: normalizeText(fill?.fill_time),
    createdAt: normalizeText(fill?.created_at),
  };
};

const normalizeReplayCashAdjustmentForEquity = (
  adjustment: ReplayCashAdjustmentLike,
  sequence: number,
): NormalizedReplayCashAdjustmentForEquity | null => {
  const barIndexRaw =
    adjustment?.bar_index ?? adjustment?.barIndex ?? Number.NaN;
  const barIndex = Math.max(
    0,
    Math.floor(toFiniteNumber(barIndexRaw, Number.NaN)),
  );
  const amount = toFiniteNumber(adjustment?.amount, Number.NaN);
  if (!Number.isFinite(barIndex) || !Number.isFinite(amount)) {
    return null;
  }
  return {
    barIndex,
    amount,
    ts: normalizeText(adjustment?.ts),
    createdAt: normalizeText(adjustment?.created_at ?? adjustment?.createdAt),
    sequence,
  };
};

const applyReplayFillToEquityState = (
  fill: NormalizedReplayFillForEquity,
  state: { cash: number; markExposureQty: number },
): void => {
  const gross = fill.price * fill.qty * fill.contractMultiplier;
  const tradingCost = fill.fee + fill.tax + fill.slippage;
  if (fill.side === "BUY") {
    state.markExposureQty += fill.qty * fill.contractMultiplier;
    state.cash -= gross + tradingCost;
  } else {
    state.markExposureQty -= fill.qty * fill.contractMultiplier;
    state.cash += gross - tradingCost;
  }
};

export const calculateReplayEquityMetrics = (input: {
  initialCapital: number;
  bars: readonly ReplayBarLike[];
  fills: readonly ReplayFillLike[];
  cashAdjustments?: readonly ReplayCashAdjustmentLike[];
  entryIndex: number;
}): ReplayEquityMetrics => {
  const bars = Array.isArray(input?.bars) ? input.bars : [];
  const safeInitial = Math.max(0, toFiniteNumber(input?.initialCapital, 0));
  if (!bars.length) {
    return {
      equityCurve: [],
      drawdownCurve: [],
      finalEquity: safeInitial,
      equityReturnRate: 0,
    };
  }

  const fills = (Array.isArray(input?.fills) ? input.fills : [])
    .map((fill) => normalizeReplayFillForEquity(fill))
    .sort((left, right) => {
      if (left.fillIndex !== right.fillIndex) {
        return left.fillIndex - right.fillIndex;
      }
      if (left.fillTime !== right.fillTime) {
        return left.fillTime.localeCompare(right.fillTime);
      }
      return left.createdAt.localeCompare(right.createdAt);
    });
  const cashAdjustments = (
    Array.isArray(input?.cashAdjustments) ? input.cashAdjustments : []
  )
    .map((adjustment, index) =>
      normalizeReplayCashAdjustmentForEquity(adjustment, index),
    )
    .filter(
      (adjustment): adjustment is NormalizedReplayCashAdjustmentForEquity =>
        Boolean(adjustment),
    )
    .sort((left, right) => {
      if (left.barIndex !== right.barIndex) {
        return left.barIndex - right.barIndex;
      }
      if (left.ts !== right.ts) {
        return left.ts.localeCompare(right.ts);
      }
      if (left.createdAt !== right.createdAt) {
        return left.createdAt.localeCompare(right.createdAt);
      }
      return left.sequence - right.sequence;
    });

  const state = {
    cash: safeInitial,
    markExposureQty: 0,
  };
  let fillPtr = 0;
  let adjustmentPtr = 0;
  const startIndex = clamp(
    Math.floor(toFiniteNumber(input?.entryIndex, 0)),
    0,
    bars.length - 1,
  );

  while (fillPtr < fills.length && fills[fillPtr].fillIndex < startIndex) {
    applyReplayFillToEquityState(fills[fillPtr], state);
    fillPtr += 1;
  }
  while (
    adjustmentPtr < cashAdjustments.length &&
    cashAdjustments[adjustmentPtr].barIndex < startIndex
  ) {
    state.cash -= cashAdjustments[adjustmentPtr].amount;
    adjustmentPtr += 1;
  }

  let peak =
    state.cash +
    state.markExposureQty * toFiniteNumber(bars[startIndex]?.close, 0);
  const equityCurve: ReplayCurvePoint[] = [];
  const drawdownCurve: ReplayCurvePoint[] = [];

  for (let index = startIndex; index < bars.length; index += 1) {
    while (fillPtr < fills.length && fills[fillPtr].fillIndex === index) {
      applyReplayFillToEquityState(fills[fillPtr], state);
      fillPtr += 1;
    }
    while (
      adjustmentPtr < cashAdjustments.length &&
      cashAdjustments[adjustmentPtr].barIndex === index
    ) {
      state.cash -= cashAdjustments[adjustmentPtr].amount;
      adjustmentPtr += 1;
    }
    const bar = bars[index];
    const equity =
      state.cash + state.markExposureQty * toFiniteNumber(bar?.close, 0);
    if (equity > peak) {
      peak = equity;
    }
    const drawdown = Math.max(0, peak - equity);
    const ts = typeof bar?.ts === "string" ? bar.ts : "";
    equityCurve.push({ ts, value: equity });
    drawdownCurve.push({ ts, value: drawdown });
  }

  const finalEquity = equityCurve.length
    ? equityCurve[equityCurve.length - 1].value
    : safeInitial;
  return {
    equityCurve,
    drawdownCurve,
    finalEquity,
    equityReturnRate:
      safeInitial > 0 ? (finalEquity - safeInitial) / safeInitial : 0,
  };
};

export const resolveReplaySnapshotCashAdjustments = (
  snapshot: ReplaySnapshotLike,
): ReplayCashAdjustmentLike[] => {
  if (
    Array.isArray(snapshot.cashAdjustments) &&
    snapshot.cashAdjustments.length
  ) {
    return [...snapshot.cashAdjustments];
  }
  const cursorIndex = Math.max(
    0,
    Math.floor(toFiniteNumber(snapshot.session?.cursor_index, 0)),
  );
  const longFinancingAmount = toFiniteNumber(
    snapshot.longFinancingChargesTotal,
    0,
  );
  const shortBorrowAmount = toFiniteNumber(snapshot.shortBorrowChargesTotal, 0);
  const adjustments: ReplayCashAdjustmentLike[] = [];
  if (Math.abs(longFinancingAmount) > 1e-9) {
    adjustments.push({
      kind: "LONG_FINANCING",
      bar_index: cursorIndex,
      amount: longFinancingAmount,
    });
  }
  if (Math.abs(shortBorrowAmount) > 1e-9) {
    adjustments.push({
      kind: "SHORT_BORROW",
      bar_index: cursorIndex,
      amount: shortBorrowAmount,
    });
  }
  return adjustments;
};

export const buildReplaySnapshotArchiveWindow = <
  TBar extends ReplayBarLike,
  TSnapshot extends ReplaySnapshotLike,
>(
  bars: readonly TBar[],
  snapshot: TSnapshot,
): ReplaySnapshotArchiveWindow<TBar, TSnapshot> | null => {
  if (!Array.isArray(bars) || !bars.length) {
    return null;
  }
  const maxIndex = clamp(
    toFiniteNumber(snapshot.session?.cursor_index, 0),
    0,
    bars.length - 1,
  );
  const startIndex = clamp(
    toFiniteNumber(snapshot.session?.start_index, 0),
    0,
    maxIndex,
  );
  const nextBars = bars.slice(startIndex, maxIndex + 1);
  if (!nextBars.length) {
    return null;
  }

  const entryIndex = clamp(
    toFiniteNumber(snapshot.session?.entry_index, 0) - startIndex,
    0,
    nextBars.length - 1,
  );
  const nextSession = {
    ...snapshot.session,
    start_index: 0,
    entry_index: entryIndex,
    cursor_index: nextBars.length - 1,
  };
  const nextFills = (Array.isArray(snapshot.fills) ? snapshot.fills : [])
    .filter((fill) => {
      const fillIndex = Math.floor(toFiniteNumber(fill.fill_index, Number.NaN));
      return (
        Number.isFinite(fillIndex) &&
        fillIndex >= startIndex &&
        fillIndex <= maxIndex
      );
    })
    .map((fill) => ({
      ...fill,
      fill_index:
        Math.floor(toFiniteNumber(fill.fill_index, Number.NaN)) - startIndex,
    }));
  const nextCashAdjustments = resolveReplaySnapshotCashAdjustments(snapshot)
    .filter((adjustment) => {
      const barIndex = Math.floor(
        toFiniteNumber(adjustment.bar_index ?? adjustment.barIndex, Number.NaN),
      );
      return (
        Number.isFinite(barIndex) &&
        barIndex >= startIndex &&
        barIndex <= maxIndex
      );
    })
    .map((adjustment) => {
      const nextIndex =
        Math.floor(
          toFiniteNumber(
            adjustment.bar_index ?? adjustment.barIndex,
            Number.NaN,
          ),
        ) - startIndex;
      return {
        ...adjustment,
        bar_index: nextIndex,
        barIndex: nextIndex,
      };
    });

  return {
    bars: nextBars,
    snapshot: {
      ...snapshot,
      session: nextSession,
      fills: nextFills,
      cashAdjustments: nextCashAdjustments,
    },
  };
};

export const compactReplaySnapshotForArchive = <
  TSnapshot extends ReplaySnapshotLike,
>(
  snapshot: TSnapshot,
): TSnapshot & {
  fills: CompactReplayFill[];
  cashAdjustments: ReplayCashAdjustmentLike[];
  fillsTotal: number;
  nextFillCursor: null;
  drawings: [];
} => {
  const fallbackSymbol = normalizeText(snapshot.session?.symbol).toUpperCase();
  const fallbackCreatedAt =
    normalizeText(snapshot.session?.created_at) || new Date().toISOString();
  const compactFills = compactReplayFillsForArchive(snapshot.fills ?? [], {
    fallbackSymbol,
    fallbackCreatedAt,
    nonNegativeCosts: false,
  });

  return {
    ...snapshot,
    fills: compactFills,
    cashAdjustments: resolveReplaySnapshotCashAdjustments(snapshot),
    fillsTotal: compactFills.length,
    nextFillCursor: null,
    drawings: [],
  };
};

export const buildReplayEquityMetrics = (
  initialCapital: number,
  bars: readonly ReplayBarLike[],
  snapshot: ReplaySnapshotLike,
): ReplayEquityMetrics =>
  calculateReplayEquityMetrics({
    initialCapital,
    bars,
    fills: snapshot.fills ?? [],
    cashAdjustments: resolveReplaySnapshotCashAdjustments(snapshot),
    entryIndex: clamp(
      toFiniteNumber(snapshot.session?.entry_index, 0),
      0,
      Math.max(0, bars.length - 1),
    ),
  });
