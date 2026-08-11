// SPDX-License-Identifier: GPL-3.0-only

import type { StrategyBacktestSamplePool } from "@/workspaces/strategy-backtest/strategyBacktestTypes";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}/;
const DATE_INPUT_RE = /^\d{4}-\d{2}-\d{2}$/;

const toDateKey = (value: string | null | undefined): string => {
  const normalized = String(value || "").trim();
  const match = normalized.match(DATE_KEY_RE);
  return match?.[0] ?? "";
};

const toStartMs = (dateKey: string): number =>
  Date.parse(`${dateKey}T00:00:00.000Z`);

const toEndMs = (dateKey: string): number =>
  Date.parse(`${dateKey}T23:59:59.999Z`);

export const isValidStrategyBacktestDateInput = (value: string): boolean => {
  if (!value) {
    return true;
  }
  if (!DATE_INPUT_RE.test(value)) {
    return false;
  }
  const parsedMs = toStartMs(value);
  return (
    Number.isFinite(parsedMs) &&
    new Date(parsedMs).toISOString().slice(0, 10) === value
  );
};

export type StrategyBacktestDatasetRange = {
  startDate: string;
  endDate: string;
  instruments: Array<{
    startMs: number;
    endMs: number;
    barCount: number;
  }>;
};

export const resolveStrategyBacktestDatasetRange = (
  pool: StrategyBacktestSamplePool | null,
): StrategyBacktestDatasetRange | null => {
  const instruments = (pool?.instruments ?? [])
    .map((instrument) => {
      const startDate = toDateKey(instrument.timeStartTs);
      const endDate = toDateKey(instrument.timeEndTs);
      const startMs = startDate ? toStartMs(startDate) : Number.NaN;
      const endMs = endDate ? toEndMs(endDate) : Number.NaN;
      return {
        startDate,
        endDate,
        startMs,
        endMs,
        barCount: Math.max(0, Math.floor(Number(instrument.barCount) || 0)),
      };
    })
    .filter(
      (instrument) =>
        instrument.startDate &&
        instrument.endDate &&
        Number.isFinite(instrument.startMs) &&
        Number.isFinite(instrument.endMs) &&
        instrument.endMs >= instrument.startMs &&
        instrument.barCount > 0,
    );
  if (!instruments.length) {
    return null;
  }
  return {
    startDate: instruments.reduce(
      (earliest, instrument) =>
        instrument.startDate < earliest ? instrument.startDate : earliest,
      instruments[0].startDate,
    ),
    endDate: instruments.reduce(
      (latest, instrument) =>
        instrument.endDate > latest ? instrument.endDate : latest,
      instruments[0].endDate,
    ),
    instruments: instruments.map(({ startMs, endMs, barCount }) => ({
      startMs,
      endMs,
      barCount,
    })),
  };
};

export const resolveStrategyBacktestVisibleBarCount = ({
  range,
  startDate,
  endDate,
}: {
  range: StrategyBacktestDatasetRange | null;
  startDate: string;
  endDate: string;
}): number => {
  if (!range || !startDate || !endDate || endDate < startDate) {
    return 0;
  }
  const selectedStartMs = toStartMs(startDate);
  const selectedEndMs = toEndMs(endDate);
  return range.instruments.reduce((largestCount, instrument) => {
    const overlapStartMs = Math.max(selectedStartMs, instrument.startMs);
    const overlapEndMs = Math.min(selectedEndMs, instrument.endMs);
    if (overlapEndMs < overlapStartMs) {
      return largestCount;
    }
    if (
      overlapStartMs <= instrument.startMs &&
      overlapEndMs >= instrument.endMs
    ) {
      return Math.max(largestCount, instrument.barCount);
    }
    const totalSpanMs = Math.max(1, instrument.endMs - instrument.startMs);
    const overlapRatio = (overlapEndMs - overlapStartMs) / totalSpanMs;
    const estimatedCount = Math.max(
      1,
      Math.round(Math.max(0, instrument.barCount - 1) * overlapRatio) + 1,
    );
    return Math.max(largestCount, estimatedCount);
  }, 0);
};
