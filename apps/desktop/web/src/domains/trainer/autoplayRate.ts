// SPDX-License-Identifier: GPL-3.0-only

export const DEFAULT_AUTOPLAY_BARS_PER_SEC = '3';

const DEFAULT_AUTOPLAY_BARS_PER_SEC_VALUE = Number(DEFAULT_AUTOPLAY_BARS_PER_SEC);

const MIN_AUTOPLAY_INTERVAL_MS = 100;

export const normalizeAutoplayBarsPerSecondValue = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_AUTOPLAY_BARS_PER_SEC_VALUE;
  }
  return value;
};

export const barsPerSecondToIntervalMs = (
  barsPerSecondInput: string,
  parseNumeric: (value: string) => number
): number => {
  const rawBarsPerSecond = parseNumeric(String(barsPerSecondInput || '').trim());
  const normalizedBarsPerSecond = normalizeAutoplayBarsPerSecondValue(rawBarsPerSecond);
  return Math.max(MIN_AUTOPLAY_INTERVAL_MS, Math.floor(1000 / normalizedBarsPerSecond));
};
