// SPDX-License-Identifier: GPL-3.0-only

import type { SystemDevSimulationRandom } from "../../domain/systemDevSimulation/random.js";

const FALLBACK_TIMELINE_START_MS = Date.UTC(2024, 0, 1, 9, 30, 0, 0);

const normalizeEpochMs = (value: unknown): number => {
  const parsed =
    typeof value === "string" && value.trim()
      ? Date.parse(value)
      : Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : FALLBACK_TIMELINE_START_MS;
};

const toIso = (epochMs: number): string => new Date(epochMs).toISOString();

const normalizePositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(1, Math.floor(parsed))
    : fallback;
};

export type SystemDevSimulationTimeline = {
  startIso: string;
  currentIso: () => string;
  advanceMilliseconds: (minMs: number, maxMs?: number) => string;
  advanceSeconds: (minSeconds: number, maxSeconds?: number) => string;
  advanceMinutes: (minMinutes: number, maxMinutes?: number) => string;
};

export const createSystemDevSimulationTimeline = (input: {
  startIso: string;
  random: SystemDevSimulationRandom;
}): SystemDevSimulationTimeline => {
  let cursorMs = normalizeEpochMs(input.startIso);
  const random = input.random;

  const advanceMilliseconds = (minMs: number, maxMs = minMs): string => {
    const safeMin = normalizePositiveInt(Math.min(minMs, maxMs), 1);
    const safeMax = Math.max(
      safeMin,
      normalizePositiveInt(Math.max(minMs, maxMs), safeMin),
    );
    cursorMs += random.int(safeMin, safeMax);
    return toIso(cursorMs);
  };

  return {
    startIso: toIso(cursorMs),
    currentIso: () => toIso(cursorMs),
    advanceMilliseconds,
    advanceSeconds: (minSeconds: number, maxSeconds = minSeconds) =>
      advanceMilliseconds(minSeconds * 1000, maxSeconds * 1000),
    advanceMinutes: (minMinutes: number, maxMinutes = minMinutes) =>
      advanceMilliseconds(minMinutes * 60_000, maxMinutes * 60_000),
  };
};
