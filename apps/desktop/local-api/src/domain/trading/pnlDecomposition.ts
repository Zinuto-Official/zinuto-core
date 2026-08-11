// SPDX-License-Identifier: GPL-3.0-only

import type { TradingSettings } from '@zinuto/shared/trading';

type TradingExecutionSettings = TradingSettings;

const POSITION_EPSILON = 1e-8;

export const shouldRealizeCoveredShort = (
  positionCostMode: TradingExecutionSettings['positionCostMode'],
  nextQty: number
): boolean => !(positionCostMode === 'DILUTED' && nextQty < -POSITION_EPSILON);

export const shouldRealizeClosedLong = (
  positionCostMode: TradingExecutionSettings['positionCostMode'],
  nextQty: number
): boolean => !(positionCostMode === 'DILUTED' && nextQty > POSITION_EPSILON);
