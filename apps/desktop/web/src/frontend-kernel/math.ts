// SPDX-License-Identifier: GPL-3.0-only

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
