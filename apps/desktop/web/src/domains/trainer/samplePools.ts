// SPDX-License-Identifier: GPL-3.0-only

import { tt } from '@/frontend-kernel/i18n/messageRuntime';
import type { BaseTimeframe } from '@/domains/trainer/trainerTypes';

const SYSTEM_DAILY_DEFAULT_SYMBOLS = [
  'AAPL',
  'MSFT',
  'AMZN',
  'GOOGL',
  'GOOG',
  'FB',
  'BRK_B',
  'JPM',
  'JNJ',
  'XOM',
  'WMT',
  'BAC',
  'PG',
  'V',
  'MA',
  'UNH',
  'HD',
  'DIS',
  'INTC',
  'CSCO',
  'PFE',
  'KO',
  'PEP',
  'MRK',
  'T',
  'VZ',
  'CVX',
  'ORCL',
  'IBM',
  'MCD',
  'NKE',
  'BA',
  'GE',
  'MMM',
  'CAT',
  'GS',
  'MS',
  'C',
  'WFC',
  'AXP',
  'COST',
  'SBUX',
  'NFLX',
  'NVDA',
  'ADBE',
  'CRM',
  'PYPL',
  'QCOM',
  'TXN',
  'AVGO',
  'AMAT',
  'AMD',
  'MU',
  'GILD',
  'AMGN',
  'BIIB',
  'CELG',
  'REGN',
  'ISRG',
  'MDT',
  'ABBV',
  'ABT',
  'BMY',
  'LLY',
  'UPS',
  'FDX',
  'UTX',
  'HON',
  'LMT',
  'RTN',
  'NOC',
  'MO',
  'PM',
  'CL',
  'KMB',
  'TGT',
  'LOW',
  'CVS',
  'WBA',
  'BK',
  'BLK',
  'SPG',
  'O',
  'VLO',
  'COP',
  'SLB',
  'EOG',
  'NEE',
  'DUK',
  'SO',
  'AEP',
  'MDLZ',
  'KHC',
  'GM',
  'F',
  'TSLA',
  'EBAY',
  'YHOO',
  'AIG',
  'MET',
] as const;

const SYSTEM_FX_1M_2025Q1_SYMBOLS = [
  'AUDCAD',
  'AUDJPY',
  'AUDUSD',
  'EURAUD',
  'EURCAD',
  'EURCHF',
  'EURGBP',
  'EURJPY',
  'EURNZD',
  'EURUSD',
  'GBPAUD',
  'GBPCAD',
  'GBPCHF',
] as const;

export const SAMPLE_POOL_ALL_ID = '__sample_pool_all__';
export const SAMPLE_POOL_SYSTEM_ID = '__sample_pool_system__';
export const SAMPLE_POOL_SYSTEM_FX_1M_2025Q1_ID = '__sample_pool_system_fx_1m_2025q1__';
export const SAMPLE_POOL_UNKNOWN_ID = '__sample_pool_unknown__';
export const BUILT_IN_SAMPLE_POOL_IDS = [
  SAMPLE_POOL_SYSTEM_ID,
  SAMPLE_POOL_SYSTEM_FX_1M_2025Q1_ID,
] as const;
export const SYSTEM_DEFAULT_SYMBOLS = [
  ...SYSTEM_DAILY_DEFAULT_SYMBOLS,
  ...SYSTEM_FX_1M_2025Q1_SYMBOLS,
] as const;
export const DEFAULT_POOL_LOT_SIZE = 100;

export type BuiltInSamplePoolConfig = {
  id: string;
  name: string;
  baseTimeframe: BaseTimeframe;
  assetClass: 'STOCK' | 'FUTURES' | 'FOREX' | 'CRYPTO';
  marketPresetId: string;
  timeZone: string;
  symbols: readonly string[];
  lotSize: number;
  sourceFolder: string;
};

export const SAMPLE_POOL_SYSTEM_NAME = (): string => tt('appText.nasdaqWikiEod100');
export const SAMPLE_POOL_SYSTEM_FX_1M_2025Q1_NAME = (): string => tt('appText.builtInFxDataset');
export const SAMPLE_POOL_UNKNOWN_NAME = (): string => tt('appText.samplePoolSpecified');

export const getBuiltInSamplePools = (): BuiltInSamplePoolConfig[] => [
  {
    id: SAMPLE_POOL_SYSTEM_ID,
    name: SAMPLE_POOL_SYSTEM_NAME(),
    baseTimeframe: '1d',
    assetClass: 'STOCK',
    marketPresetId: 'US_STOCK',
    timeZone: 'America/New_York',
    symbols: SYSTEM_DAILY_DEFAULT_SYMBOLS,
    lotSize: 1,
    sourceFolder: tt('appText.systemDefault')
  },
  {
    id: SAMPLE_POOL_SYSTEM_FX_1M_2025Q1_ID,
    name: SAMPLE_POOL_SYSTEM_FX_1M_2025Q1_NAME(),
    baseTimeframe: '1m',
    assetClass: 'FOREX',
    marketPresetId: 'FOREX_STANDARD_LOT',
    timeZone: 'America/New_York',
    symbols: SYSTEM_FX_1M_2025Q1_SYMBOLS,
    lotSize: 1,
    sourceFolder: tt('appText.systemDefault')
  }
];

export const findBuiltInSamplePoolById = (poolId: string): BuiltInSamplePoolConfig | undefined =>
  getBuiltInSamplePools().find((pool) => pool.id === poolId);

export const isBuiltInSamplePoolId = (poolId: string): boolean => Boolean(findBuiltInSamplePoolById(poolId));

export const resolveBuiltInPoolBySymbol = (symbol: string): BuiltInSamplePoolConfig | null => {
  const upper = symbol.trim().toUpperCase();
  if (!upper) {
    return null;
  }
  return getBuiltInSamplePools().find((pool) => pool.symbols.some((item) => item.toUpperCase() === upper)) ?? null;
};
