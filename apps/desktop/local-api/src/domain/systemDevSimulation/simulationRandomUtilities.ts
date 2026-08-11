// SPDX-License-Identifier: GPL-3.0-only

import type { OhlcvBar } from "../models.js";
import { appError } from "../../kernel/appError.js";
import { parseTimestampMs } from "@zinuto/shared/marketTime";
import { detectBaseTimeframeFromTimestamps } from "@zinuto/shared/timeframe";
import type {
  DisplayPeriodKey,
  SupportedBaseTimeframe,
} from "./sharedDomain.js";
import type { SystemDevSimulationRandom } from "./random.js";

export const SIMULATION_LOOKBACK_DAYS = 370;
export const EPSILON = 1e-8;

export const FAST_DECISION_QUESTION_COUNTS = [5, 10, 15, 20, 30, 50] as const;
export const FAST_DECISION_HORIZONS = [20, 30, 50, 80, 100] as const;
export const FAST_DECISION_SECONDS = [10, 20, 30, 60, 120] as const;
export const FAST_DECISION_STRICTNESS = [
  "LENIENT",
  "STANDARD",
  "STRICT",
] as const;

export const RISK_QUESTION_COUNTS = [5, 10, 15, 20, 30, 50] as const;
export const RISK_HORIZONS = [5, 10, 20, 30, 40, 50, 60, 120, 240] as const;

export const DISPLAY_PERIODS_BY_BASE: Record<
  SupportedBaseTimeframe,
  readonly DisplayPeriodKey[]
> = {
  "1m": ["1m", "5m", "1h", "1d"],
  "5m": ["5m", "1h", "1d", "1w"],
  "1h": ["1h", "1d", "1w", "1month"],
  "1d": ["1d", "1w", "1month", "1year"],
};

export const nowIso = (): string => new Date().toISOString();

export const yieldToEventLoop = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const systemDevSimulationMathRandomAdapter: SystemDevSimulationRandom = {
  seed: "math-random",
  next: () => Math.random(),
  int: (min: number, max: number) => {
    const safeMin = Math.ceil(Math.min(min, max));
    const safeMax = Math.floor(Math.max(min, max));
    return (
      safeMin + Math.floor(Math.random() * Math.max(1, safeMax - safeMin + 1))
    );
  },
  float: (min: number, max: number) => {
    const safeMin = Math.min(min, max);
    const safeMax = Math.max(min, max);
    return safeMin + Math.random() * (safeMax - safeMin);
  },
  pick: <T>(items: readonly T[]): T => {
    if (!items.length) {
      throw appError("SYSTEM_DEV_SIMULATION_INVALID");
    }
    return items[Math.floor(Math.random() * items.length)] as T;
  },
  shuffle: <T>(items: readonly T[]): T[] => {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [
        shuffled[swapIndex]!,
        shuffled[index]!,
      ];
    }
    return shuffled;
  },
  fork: () => systemDevSimulationMathRandomAdapter,
};

export const pickOne = <T>(
  items: readonly T[],
  rng: SystemDevSimulationRandom = systemDevSimulationMathRandomAdapter,
): T => {
  if (!items.length) {
    throw appError("SYSTEM_DEV_SIMULATION_INVALID");
  }
  return rng.pick(items);
};

export const randomInt = (
  min: number,
  max: number,
  rng: SystemDevSimulationRandom = systemDevSimulationMathRandomAdapter,
): number => rng.int(min, max);

export const randomFloat = (
  min: number,
  max: number,
  rng: SystemDevSimulationRandom = systemDevSimulationMathRandomAdapter,
): number => rng.float(min, max);

export const floorToStep = (value: number, step: number): number => {
  const safeStep = Math.max(EPSILON, Number.isFinite(step) ? step : 1);
  const normalized = Math.floor(Math.max(0, value) / safeStep) * safeStep;
  return Number(normalized.toFixed(8));
};

export const normalizeUpperSymbols = (symbols: string[]): string[] =>
  Array.from(
    new Set(
      (Array.isArray(symbols) ? symbols : [])
        .map((symbol) =>
          String(symbol || "")
            .trim()
            .toUpperCase(),
        )
        .filter((symbol) => symbol.length > 0),
    ),
  );

export const formatDateRange = (bars: OhlcvBar[]): string => {
  const first = bars[0]?.ts ? String(bars[0].ts).slice(0, 10) : "";
  const last = bars[bars.length - 1]?.ts
    ? String(bars[bars.length - 1].ts).slice(0, 10)
    : "";
  return first && last ? `${first} ~ ${last}` : first || last || "";
};

export const resolveBarsToNextTradeDay = (
  bars: OhlcvBar[],
  currentIndex: number,
): number => {
  const safeIndex = clamp(currentIndex, 0, Math.max(0, bars.length - 1));
  const currentDay = String(bars[safeIndex]?.ts ?? "").slice(0, 10);
  if (!currentDay) {
    return 0;
  }
  for (let index = safeIndex + 1; index < bars.length; index += 1) {
    const nextDay = String(bars[index]?.ts ?? "").slice(0, 10);
    if (nextDay && nextDay !== currentDay) {
      return index - safeIndex;
    }
  }
  return 0;
};

export const randomCreatedAt = (
  rng: SystemDevSimulationRandom = systemDevSimulationMathRandomAdapter,
): string => {
  const endMs = Date.now();
  const startMs = endMs - SIMULATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  return new Date(randomInt(startMs, endMs, rng)).toISOString();
};

export const shiftIso = (isoText: string, offsetMs: number): string =>
  new Date(new Date(isoText).getTime() + offsetMs).toISOString();

export const buildNarrative = (
  seed: string,
  narrativeSegments: readonly string[],
  minLength = 110,
  rng: SystemDevSimulationRandom = systemDevSimulationMathRandomAdapter,
): string => {
  const safeSegments = narrativeSegments.length ? narrativeSegments : [seed];
  let text = `${seed} `;
  while (text.length < minLength) {
    text += `${pickOne(safeSegments, rng)} `;
  }
  return text.trim();
};

export const resolveBarsBaseTimeframe = (
  bars: OhlcvBar[],
): SupportedBaseTimeframe | null => {
  const timestamps = bars
    .slice(0, Math.min(bars.length, 240))
    .map((bar) => parseTimestampMs(String(bar?.ts ?? "")))
    .filter((value): value is number => Number.isFinite(value));
  const detected = detectBaseTimeframeFromTimestamps(timestamps);
  if (
    detected === "1m" ||
    detected === "5m" ||
    detected === "1h" ||
    detected === "1d"
  ) {
    return detected;
  }
  return null;
};

export const resolveAnchorIndexFromDate = (
  bars: OhlcvBar[],
  createdAt: string,
): number => {
  if (bars.length <= 2) {
    return 0;
  }
  const targetMs = new Date(createdAt).getTime();
  let resolvedIndex = 0;
  for (let index = 0; index < bars.length; index += 1) {
    const currentMs = new Date(String(bars[index]?.ts || "")).getTime();
    if (!Number.isFinite(currentMs) || currentMs > targetMs) {
      break;
    }
    resolvedIndex = index;
  }
  return clamp(resolvedIndex, 0, Math.max(0, bars.length - 2));
};
