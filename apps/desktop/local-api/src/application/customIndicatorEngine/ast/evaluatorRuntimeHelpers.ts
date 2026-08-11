// SPDX-License-Identifier: GPL-3.0-only

import { parseTimestampMs, toMarketDateParts } from "@zinuto/shared/marketTime";
import type { AstExecutionContext, AstExecutionLimits } from "./types.js";

const DEFAULT_EXECUTION_LIMITS: AstExecutionLimits = {
  maxStatements: 800,
  maxOperations: 2_000_000,
};

export const toPositiveInt = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const rounded = Math.floor(numeric);
  return rounded > 0 ? rounded : fallback;
};

export const resolveExecutionLimits = (
  context: AstExecutionContext,
): AstExecutionLimits => ({
  maxStatements: toPositiveInt(
    context.limits?.maxStatements,
    DEFAULT_EXECUTION_LIMITS.maxStatements,
  ),
  maxOperations: toPositiveInt(
    context.limits?.maxOperations,
    DEFAULT_EXECUTION_LIMITS.maxOperations,
  ),
});

const resolveBarTimestampMs = (
  raw: number | string,
  fallback: number,
): number => {
  const parsed = parseTimestampMs(raw);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
};

const resolveInferredPeriodMinutes = (diffs: number[]): number => {
  if (!diffs.length) {
    return 1;
  }
  diffs.sort((left, right) => left - right);
  const middle = Math.floor(diffs.length / 2);
  const median =
    diffs.length % 2 === 0
      ? Math.round((diffs[middle - 1] + diffs[middle]) / 2)
      : diffs[middle];
  return Math.max(1, median);
};

const resolveWeekOfYear = (
  year: number,
  month: number,
  day: number,
): number => {
  const utc = new Date(Date.UTC(year, month - 1, day));
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const diffDays = Math.floor(
    (utc.getTime() - yearStart.getTime()) / 86_400_000,
  );
  return Math.max(1, Math.ceil((diffDays + 1) / 7));
};

export const buildRuntimeMetaSeries = (bars: AstExecutionContext["bars"]) => {
  const length = bars.length;
  const date = new Array<number>(length).fill(Number.NaN);
  const time = new Array<number>(length).fill(Number.NaN);
  const time2 = new Array<number>(length).fill(Number.NaN);
  const year = new Array<number>(length).fill(Number.NaN);
  const month = new Array<number>(length).fill(Number.NaN);
  const day = new Array<number>(length).fill(Number.NaN);
  const hour = new Array<number>(length).fill(Number.NaN);
  const minute = new Array<number>(length).fill(Number.NaN);
  const second = new Array<number>(length).fill(Number.NaN);
  const weekday = new Array<number>(length).fill(Number.NaN);
  const weekOfYear = new Array<number>(length).fill(Number.NaN);
  const period = new Array<number>(length).fill(1);
  const fromOpen = new Array<number>(length).fill(Number.NaN);
  const totalFzNum = new Array<number>(length).fill(Number.NaN);
  const currBarsCount = new Array<number>(length).fill(0);
  const totalBarsCount = new Array<number>(length).fill(length);
  const isLastBar = new Array<boolean>(length).fill(false);
  const totalVol = new Array<number>(length).fill(Number.NaN);
  const totalAmount = new Array<number>(length).fill(Number.NaN);
  const trueSeries = new Array<boolean>(length).fill(true);
  const falseSeries = new Array<boolean>(length).fill(false);

  const periodDiffs: number[] = [];
  let previousTimestamp = Number.NaN;
  let dayStartTimestamp = Number.NaN;
  let dayKey = "";
  let dayVol = 0;
  let dayAmount = 0;
  const dayMaxFromOpen = new Map<string, number>();
  const dayByIndex = new Array<string>(length).fill("");

  for (let index = 0; index < length; index += 1) {
    const fallback =
      index > 0
        ? resolveBarTimestampMs(
            bars[index - 1]?.time ?? Date.now(),
            Date.now(),
          ) + 60_000
        : Date.now();
    const timestamp = resolveBarTimestampMs(
      bars[index]?.time ?? fallback,
      fallback,
    );
    if (Number.isFinite(previousTimestamp)) {
      const deltaMin = Math.round((timestamp - previousTimestamp) / 60_000);
      if (deltaMin > 0 && deltaMin <= 24 * 60) {
        periodDiffs.push(deltaMin);
      }
    }
    previousTimestamp = timestamp;
    const dateParts = toMarketDateParts(timestamp);
    if (!dateParts) {
      continue;
    }
    const y = dateParts.year;
    const m = dateParts.month;
    const d = dateParts.day;
    const hh = dateParts.hour;
    const mm = dateParts.minute;
    const ss = dateParts.second;
    const currentDayKey = `${String(y)}-${String(m)}-${String(d)}`;

    if (currentDayKey !== dayKey) {
      dayKey = currentDayKey;
      dayStartTimestamp = timestamp;
      dayVol = 0;
      dayAmount = 0;
    }

    dayByIndex[index] = currentDayKey;
    date[index] = y * 10_000 + m * 100 + d;
    time[index] = hh * 100 + mm;
    time2[index] = hh * 10_000 + mm * 100 + ss;
    year[index] = y;
    month[index] = m;
    day[index] = d;
    hour[index] = hh;
    minute[index] = mm;
    second[index] = ss;
    weekday[index] = dateParts.weekday;
    weekOfYear[index] = resolveWeekOfYear(y, m, d);
    fromOpen[index] = Math.max(
      0,
      Math.floor((timestamp - dayStartTimestamp) / 60_000),
    );
    dayMaxFromOpen.set(
      currentDayKey,
      Math.max(dayMaxFromOpen.get(currentDayKey) ?? 0, fromOpen[index] ?? 0),
    );
    const currentVol = Number(bars[index]?.volume);
    if (Number.isFinite(currentVol)) {
      dayVol += currentVol;
    }
    const rawAmount = Number((bars[index] as { amount?: unknown })?.amount);
    const fallbackAmount =
      Number(bars[index]?.close) * Number(bars[index]?.volume);
    const currentAmount = Number.isFinite(rawAmount)
      ? rawAmount
      : Number.isFinite(fallbackAmount)
        ? fallbackAmount
        : Number.NaN;
    if (Number.isFinite(currentAmount)) {
      dayAmount += currentAmount;
    }
    totalVol[index] = dayVol;
    totalAmount[index] = dayAmount;
    currBarsCount[index] = length - index;
    isLastBar[index] = index === length - 1;
  }

  const inferredPeriodMinutes = resolveInferredPeriodMinutes(periodDiffs);
  period.fill(inferredPeriodMinutes);
  for (let index = 0; index < length; index += 1) {
    const key = dayByIndex[index];
    const maxFromOpen = dayMaxFromOpen.get(key);
    if (Number.isFinite(maxFromOpen)) {
      totalFzNum[index] = (maxFromOpen as number) + inferredPeriodMinutes;
      continue;
    }
    totalFzNum[index] = Number.NaN;
  }

  return {
    DATE: date,
    TIME: time,
    TIME2: time2,
    YEAR: year,
    MONTH: month,
    DAY: day,
    HOUR: hour,
    MINUTE: minute,
    SECOND: second,
    WEEKDAY: weekday,
    WEEKOFYEAR: weekOfYear,
    PERIOD: period,
    FROMOPEN: fromOpen,
    TOTALFZNUM: totalFzNum,
    CURRBARSCOUNT: currBarsCount,
    TOTALBARSCOUNT: totalBarsCount,
    ISLASTBAR: isLastBar,
    TOTALVOL: totalVol,
    TOTALAMOUNT: totalAmount,
    TRUE: trueSeries,
    FALSE: falseSeries,
    NULL: Number.NaN,
    DRAWNULL: Number.NaN,
  } as const;
};
