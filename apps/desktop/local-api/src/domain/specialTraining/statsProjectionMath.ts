// SPDX-License-Identifier: GPL-3.0-only

export const clampNonNegativeInteger = (value: unknown): number => {
  const numeric = Math.floor(Number(value) || 0);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return numeric;
};

export const clampNonNegativeNumber = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return numeric;
};
