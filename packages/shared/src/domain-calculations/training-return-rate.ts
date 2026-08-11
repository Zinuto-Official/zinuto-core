// SPDX-License-Identifier: GPL-3.0-only

export const resolveUnifiedReturnRate = (
  initialTotal: number,
  totalPnl: number,
  equityReturnRate: number,
  assetReturnRate: number,
  fallbackRate: number,
): number => {
  if (initialTotal > 0) {
    const derivedRate = totalPnl / initialTotal;
    if (Number.isFinite(derivedRate)) {
      return derivedRate;
    }
  }
  if (Number.isFinite(equityReturnRate)) {
    return equityReturnRate;
  }
  if (Number.isFinite(assetReturnRate)) {
    return assetReturnRate;
  }
  if (Number.isFinite(fallbackRate)) {
    return fallbackRate;
  }
  return 0;
};
