// SPDX-License-Identifier: GPL-3.0-only

export const resolveDetachedLowerRatio = (
  indicatorCount: number,
  requestedRatio?: number,
): number => {
  if (indicatorCount <= 0) {
    return 0;
  }
  const requested = Number(requestedRatio);
  if (Number.isFinite(requested)) {
    return Math.min(0.45, Math.max(0.12, requested));
  }
  return indicatorCount === 1 ? 0.2 : indicatorCount === 2 ? 0.32 : 0.42;
};
