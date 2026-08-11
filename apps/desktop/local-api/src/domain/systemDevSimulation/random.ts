// SPDX-License-Identifier: GPL-3.0-only

export type SystemDevSimulationRandom = {
  seed: string;
  next: () => number;
  int: (min: number, max: number) => number;
  float: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  shuffle: <T>(items: readonly T[]) => T[];
  fork: (suffix: string) => SystemDevSimulationRandom;
};

const hashSeed = (seedText: string): number => {
  let hash = 2166136261;
  for (const char of seedText) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createSeededRandomCore = (seedText: string): (() => number) => {
  let state = hashSeed(seedText) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export const createSystemDevSimulationRandom = (
  seedText: string,
): SystemDevSimulationRandom => {
  const seed = String(seedText ?? "").trim() || "system-dev-simulation";
  const next = createSeededRandomCore(seed);
  const random: SystemDevSimulationRandom = {
    seed,
    next,
    int: (min: number, max: number) => {
      const safeMin = Math.ceil(Math.min(min, max));
      const safeMax = Math.floor(Math.max(min, max));
      return (
        safeMin +
        Math.floor(next() * Math.max(1, safeMax - safeMin + 1))
      );
    },
    float: (min: number, max: number) => {
      const safeMin = Math.min(min, max);
      const safeMax = Math.max(min, max);
      return safeMin + next() * (safeMax - safeMin);
    },
    pick: <T>(items: readonly T[]): T => {
      if (!items.length) {
        throw new Error("SYSTEM_DEV_SIMULATION_RANDOM_PICK_EMPTY");
      }
      return items[Math.floor(next() * items.length)] as T;
    },
    shuffle: <T>(items: readonly T[]): T[] => {
      const shuffled = [...items];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(next() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [
          shuffled[swapIndex]!,
          shuffled[index]!,
        ];
      }
      return shuffled;
    },
    fork: (suffix: string) =>
      createSystemDevSimulationRandom(`${seed}:${String(suffix ?? "").trim()}`),
  };
  return random;
};
