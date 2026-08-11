// SPDX-License-Identifier: GPL-3.0-only

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const toFiniteNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
};

export const clampSeconds = (value: number, secondsLimit: number): number =>
  clamp(
    Math.ceil(Number.isFinite(value) ? value : secondsLimit),
    0,
    Math.max(0, Math.floor(secondsLimit)),
  );
