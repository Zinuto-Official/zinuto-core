// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe, DisplayPeriodKey } from '@/domains/chart/displayPeriods';

export type { BaseTimeframe, DisplayPeriodKey };

export type ReplayBar = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  displayPeriod?: DisplayPeriodKey | string;
  displayIndex?: number;
  startRawIndex?: number;
  endRawIndex?: number;
};

export type ReplayCurvePoint = {
  ts: string;
  value: number;
};

export type ReplayTradeRound = {
  id: string;
  direction: 'LONG' | 'SHORT';
  entryIndex: number;
  closeIndex: number;
  entryTime: string;
  closeTime: string;
  holdBars: number;
  quantity: number;
  entryAvgPrice: number;
  exitAvgPrice: number;
  grossPnl: number;
  pnl: number;
  returnRate: number;
  mfeRate: number;
  maeRate: number;
  entryCost: number;
  exitCost: number;
};
