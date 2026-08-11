// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useMemo, useRef } from 'react';
import { toTimeZoneDateKey } from '@zinuto/shared/timezone';
import type { Fill, SessionSnapshot } from '@/domains/training/types';

const MAX_RECENT_TRADE_LOG_ROWS = 20;

export type TradeLogRow = {
  fill: Fill;
  sequence: string;
};

type SameDayBoughtQtyPoint = {
  fillIndex: number;
  cumulativeQty: number;
};

export type TrainerFillDerivedSnapshot = {
  sessionId: string;
  fillCount: number;
  residentFillsStartIndex: number;
  lastFillId: string;
  buyCount: number;
  sellCount: number;
  totalFees: number;
  totalTaxes: number;
  totalSlippage: number;
  totalTradingCost: number;
  tradeLogRows: TradeLogRow[];
  sameDayBoughtQtyTimelineByTradeDay: Map<string, SameDayBoughtQtyPoint[]>;
};

type UseTrainerFillDerivedStateBars = Array<{
  ts: string;
}>;

const createEmptyTrainerFillDerivedSnapshot = (
  sessionId = '',
): TrainerFillDerivedSnapshot => ({
  sessionId,
  fillCount: 0,
  residentFillsStartIndex: 0,
  lastFillId: '',
  buyCount: 0,
  sellCount: 0,
  totalFees: 0,
  totalTaxes: 0,
  totalSlippage: 0,
  totalTradingCost: 0,
  tradeLogRows: [],
  sameDayBoughtQtyTimelineByTradeDay: new Map(),
});

const normalizeFillTradingCostComponents = (fill: Fill) => {
  const fee = Number(fill.fee);
  const tax = Number(fill.tax);
  const slippage = Number(fill.slippage);
  return (
    {
      fee: Number.isFinite(fee) ? fee : 0,
      tax: Number.isFinite(tax) ? tax : 0,
      slippage: Number.isFinite(slippage) ? slippage : 0,
    }
  );
};

const appendSameDayBoughtQtyPoint = (
  timelineByTradeDay: Map<string, SameDayBoughtQtyPoint[]>,
  fill: Fill,
  timeZone?: string | null,
): void => {
  if (fill.side !== 'BUY') {
    return;
  }
  const tradeDay = toTimeZoneDateKey(fill.fill_time ?? '', timeZone ?? undefined);
  if (!tradeDay) {
    return;
  }
  const qty = Number(fill.fill_qty);
  if (!Number.isFinite(qty) || qty <= 0) {
    return;
  }
  const fillIndex = Math.max(0, Math.floor(Number(fill.fill_index) || 0));
  const existingEntries = timelineByTradeDay.get(tradeDay);
  const nextEntries = existingEntries ? existingEntries.slice() : [];
  const previousCumulativeQty =
    nextEntries.length > 0
      ? Number(nextEntries[nextEntries.length - 1]?.cumulativeQty ?? 0)
      : 0;
  nextEntries.push({
    fillIndex,
    cumulativeQty: previousCumulativeQty + qty,
  });
  timelineByTradeDay.set(tradeDay, nextEntries);
};

const appendFillToDerivedSnapshot = (
  derivedSnapshot: TrainerFillDerivedSnapshot,
  fill: Fill,
  tradeSequence: number,
  timeZone?: string | null,
): void => {
  if (fill.side === 'BUY') {
    derivedSnapshot.buyCount += 1;
  } else if (fill.side === 'SELL') {
    derivedSnapshot.sellCount += 1;
  }

  const tradingCost = normalizeFillTradingCostComponents(fill);
  derivedSnapshot.totalFees += tradingCost.fee;
  derivedSnapshot.totalTaxes += tradingCost.tax;
  derivedSnapshot.totalSlippage += tradingCost.slippage;
  derivedSnapshot.totalTradingCost +=
    tradingCost.fee + tradingCost.tax + tradingCost.slippage;

  derivedSnapshot.tradeLogRows.unshift({
    fill,
    sequence: `${fill.side === 'BUY' ? 'B' : 'S'}${Math.max(1, tradeSequence)}`,
  });
  if (derivedSnapshot.tradeLogRows.length > MAX_RECENT_TRADE_LOG_ROWS) {
    derivedSnapshot.tradeLogRows.length = MAX_RECENT_TRADE_LOG_ROWS;
  }

  appendSameDayBoughtQtyPoint(
    derivedSnapshot.sameDayBoughtQtyTimelineByTradeDay,
    fill,
    timeZone,
  );
};

const canAppendToPreviousDerivedSnapshot = (
  previous: TrainerFillDerivedSnapshot | null,
  {
    sessionId,
    fills,
    residentFillsStartIndex,
  }: {
  sessionId: string;
  fills: Fill[];
  residentFillsStartIndex: number;
  },
): previous is TrainerFillDerivedSnapshot => {
  if (!previous || previous.sessionId !== sessionId) {
    return false;
  }
  const residentEndIndex = residentFillsStartIndex + fills.length;
  if (
    previous.fillCount < residentFillsStartIndex ||
    previous.fillCount > residentEndIndex
  ) {
    return false;
  }
  if (previous.fillCount <= 0) {
    return true;
  }
  if (previous.fillCount === residentFillsStartIndex) {
    return true;
  }
  const previousLastLocalIndex =
    previous.fillCount - residentFillsStartIndex - 1;
  const previousLastFill = fills[previousLastLocalIndex];
  return String(previousLastFill?.id ?? '') === previous.lastFillId;
};

export const buildTrainerFillDerivedSnapshot = ({
  sessionId,
  fills,
  residentFillsStartIndex,
  timeZone,
  previous,
}: {
  sessionId: string;
  fills: Fill[];
  residentFillsStartIndex?: number;
  timeZone?: string | null;
  previous?: TrainerFillDerivedSnapshot | null;
}): TrainerFillDerivedSnapshot => {
  const normalizedSessionId = String(sessionId || '').trim();
  const normalizedFills = Array.isArray(fills) ? fills : [];
  const normalizedResidentStartIndex = Math.max(
    0,
    Math.floor(Number(residentFillsStartIndex) || 0),
  );
  if (!normalizedSessionId || normalizedFills.length === 0) {
    return createEmptyTrainerFillDerivedSnapshot(normalizedSessionId);
  }
  const residentEndIndex =
    normalizedResidentStartIndex + normalizedFills.length;

  const previousSnapshot = previous ?? null;
  const canAppend = canAppendToPreviousDerivedSnapshot(previousSnapshot, {
    sessionId: normalizedSessionId,
    fills: normalizedFills,
    residentFillsStartIndex: normalizedResidentStartIndex,
  });

  if (canAppend && previousSnapshot.fillCount === residentEndIndex) {
    return previousSnapshot;
  }

  let nextSnapshot = createEmptyTrainerFillDerivedSnapshot(
    normalizedSessionId,
  );
  let appendStartIndex = 0;
  if (canAppend) {
    nextSnapshot = {
      sessionId: normalizedSessionId,
      fillCount: previousSnapshot.fillCount,
      residentFillsStartIndex: normalizedResidentStartIndex,
      lastFillId: previousSnapshot.lastFillId,
      buyCount: previousSnapshot.buyCount,
      sellCount: previousSnapshot.sellCount,
      totalFees: previousSnapshot.totalFees,
      totalTaxes: previousSnapshot.totalTaxes,
      totalSlippage: previousSnapshot.totalSlippage,
      totalTradingCost: previousSnapshot.totalTradingCost,
      tradeLogRows: previousSnapshot.tradeLogRows.slice(),
      sameDayBoughtQtyTimelineByTradeDay: new Map(
        previousSnapshot.sameDayBoughtQtyTimelineByTradeDay,
      ),
    };
    appendStartIndex = Math.max(
      0,
      previousSnapshot.fillCount - normalizedResidentStartIndex,
    );
  }

  for (
    let fillIndex = appendStartIndex;
    fillIndex < normalizedFills.length;
    fillIndex += 1
  ) {
    appendFillToDerivedSnapshot(
      nextSnapshot,
      normalizedFills[fillIndex],
      normalizedResidentStartIndex + fillIndex + 1,
      timeZone,
    );
  }

  nextSnapshot.fillCount = residentEndIndex;
  nextSnapshot.residentFillsStartIndex = normalizedResidentStartIndex;
  nextSnapshot.lastFillId = String(
    normalizedFills[normalizedFills.length - 1]?.id ?? '',
  );
  return nextSnapshot;
};

export const resolveSameDayBoughtQtyFromDerivedSnapshot = ({
  derivedSnapshot,
  tradeDay,
  fillIndex,
}: {
  derivedSnapshot: TrainerFillDerivedSnapshot;
  tradeDay: string;
  fillIndex: number;
}): number => {
  const normalizedTradeDay = String(tradeDay || '').trim();
  if (!normalizedTradeDay) {
    return 0;
  }
  const entries =
    derivedSnapshot.sameDayBoughtQtyTimelineByTradeDay.get(
      normalizedTradeDay,
    ) ?? [];
  if (!entries.length) {
    return 0;
  }

  const normalizedFillIndex = Math.max(
    0,
    Math.floor(Number(fillIndex) || 0),
  );
  let low = 0;
  let high = entries.length - 1;
  let resolvedQty = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const point = entries[middle];
    if (!point || point.fillIndex > normalizedFillIndex) {
      high = middle - 1;
      continue;
    }
    resolvedQty = Number(point.cumulativeQty) || 0;
    low = middle + 1;
  }
  return Math.max(0, resolvedQty);
};

export type TrainerFillDerivedState = TrainerFillDerivedSnapshot & {
  getSameDayBoughtQtyAtFillIndex: (fillIndex: number) => number;
};

export const useTrainerFillDerivedState = (
  snapshot: Pick<
    SessionSnapshot,
    'session' | 'fills' | 'residentFillsStartIndex'
  > | null,
  bars: UseTrainerFillDerivedStateBars,
): TrainerFillDerivedState => {
  const cacheRef = useRef<TrainerFillDerivedSnapshot>(
    createEmptyTrainerFillDerivedSnapshot(),
  );

  const derivedSnapshot = useMemo(() => {
    const nextSnapshot = buildTrainerFillDerivedSnapshot({
      sessionId: snapshot?.session.id ?? '',
      fills: snapshot?.fills ?? [],
      residentFillsStartIndex: snapshot?.residentFillsStartIndex,
      timeZone: snapshot?.session.timeZone,
      previous: cacheRef.current,
    });
    cacheRef.current = nextSnapshot;
    return nextSnapshot;
  }, [
    snapshot?.fills,
    snapshot?.residentFillsStartIndex,
    snapshot?.session.id,
    snapshot?.session.timeZone,
  ]);

  const getSameDayBoughtQtyAtFillIndex = useCallback(
    (fillIndex: number): number => {
      if (!bars.length) {
        return 0;
      }
      const normalizedFillIndex = Math.max(
        0,
        Math.min(Math.floor(Number(fillIndex) || 0), bars.length - 1),
      );
      const tradeDay = toTimeZoneDateKey(
        bars[normalizedFillIndex]?.ts ?? '',
        snapshot?.session.timeZone ?? undefined,
      );
      return resolveSameDayBoughtQtyFromDerivedSnapshot({
        derivedSnapshot,
        tradeDay,
        fillIndex: normalizedFillIndex,
      });
    },
    [bars, derivedSnapshot, snapshot?.session.timeZone],
  );

  return useMemo(
    () => ({
      ...derivedSnapshot,
      getSameDayBoughtQtyAtFillIndex,
    }),
    [derivedSnapshot, getSameDayBoughtQtyAtFillIndex],
  );
};
