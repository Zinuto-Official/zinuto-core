// SPDX-License-Identifier: GPL-3.0-only

import type { z } from 'zod';
import type {
  desktopBacktestBatchSchema,
  desktopBacktestBarSchema,
  desktopBacktestConfigSchema,
  desktopBacktestEquityPointSchema,
  desktopBacktestFillSchema,
  desktopBacktestResultListItemSchema,
  desktopBacktestResultSummarySchema,
} from '@zinuto/shared/contracts-desktop/api';
import type { OhlcvBar, PriceMode, Side } from '../../domain/models.js';
import type { TradingSettings } from '../../domain/trading/types.js';

export type BacktestBatchStatus =
  | 'DRAFT'
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED';

type BacktestConfigContract = z.infer<typeof desktopBacktestConfigSchema>;
export type BacktestConfig = Omit<BacktestConfigContract, 'tradingSettings'> & {
  tradingSettings: TradingSettings;
};
type BacktestBatchContract = z.infer<typeof desktopBacktestBatchSchema>;
export type BacktestBatch = Omit<BacktestBatchContract, 'config'> & {
  config: BacktestConfig;
};
export type BacktestBar = z.infer<typeof desktopBacktestBarSchema>;
export type BacktestResultListItem = z.infer<typeof desktopBacktestResultListItemSchema>;
export type BacktestResultSummary = z.infer<typeof desktopBacktestResultSummarySchema>;
export type BacktestFill = z.infer<typeof desktopBacktestFillSchema>;
export type BacktestEquityPoint = z.infer<typeof desktopBacktestEquityPointSchema>;

export type BacktestInstrumentCandidate = {
  instrumentId: string;
  sourceId: string | null;
  symbol: string;
  baseTimeframe: string;
  name: string | null;
  market: string | null;
  barCount: number;
  timeZone: string | null;
  barsVersionToken: string | null;
};

export type BacktestSignal = {
  barIndex: number;
  buy: boolean;
  sell: boolean;
  short: boolean;
  cover: boolean;
};

export type BacktestConflict = {
  barIndex: number;
  code: string;
};

export type BacktestEngineFill = Omit<BacktestFill, 'id' | 'batchId' | 'resultId' | 'createdAt'> & {
  id?: string;
  batchId?: string;
  resultId?: string;
  createdAt?: string;
};

export type BacktestEngineEquityPoint = Omit<BacktestEquityPoint, 'id' | 'batchId' | 'resultId'> & {
  id?: string;
  batchId?: string;
  resultId?: string;
};

export type BacktestInstrumentRunResult = {
  instrument: BacktestInstrumentCandidate;
  result: Omit<BacktestResultSummary, 'id' | 'batchId' | 'createdAt' | 'updatedAt'>;
  fills: BacktestEngineFill[];
  equityCurve: BacktestEngineEquityPoint[];
  conflicts: BacktestConflict[];
};

export type BacktestReferenceEngineInput = {
  config: BacktestConfig;
  instrument: BacktestInstrumentCandidate;
  bars: OhlcvBar[];
  signals: BacktestSignal[];
  priceMode: PriceMode;
};

export type BacktestPlannedAction = {
  side: Side;
  rawSignal: 'BUY' | 'SELL' | 'SHORT' | 'COVER';
  barIndex: number;
  fillIndex: number;
};
