// SPDX-License-Identifier: GPL-3.0-only

import { POSITION_EPSILON } from './orderSizing.js';

export const resolveLongFinancingPrincipal = (cashBalance: unknown): number => {
  const cash = Number(cashBalance);
  if (!Number.isFinite(cash) || cash >= -POSITION_EPSILON) {
    return 0;
  }
  return Math.abs(cash);
};
