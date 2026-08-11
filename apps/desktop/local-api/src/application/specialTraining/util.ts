// SPDX-License-Identifier: GPL-3.0-only

export const randomInt = (min: number, max: number): number => {
  if (max <= min) {
    return min;
  }
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const toFiniteNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
};
