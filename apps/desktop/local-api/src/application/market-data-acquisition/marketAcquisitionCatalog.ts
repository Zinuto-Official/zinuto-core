// SPDX-License-Identifier: GPL-3.0-only

import type {
  DesktopMarketDataAcquisitionCatalog,
  DesktopMarketDataAcquisitionInstrument,
  DesktopMarketDataAcquisitionMarket,
  DesktopMarketDataAcquisitionMarketId,
  DesktopMarketDataAcquisitionSourcePlanId,
} from '@zinuto/shared/contracts-desktop/api';

import { AcquisitionRuntimeError } from './marketDataAcquisitionTypes.js';
import {
  AKSHARE_VERSION,
  CCXT_VERSION,
  FINANCE_DATA_READER_VERSION,
} from './marketDataConnectorVersions.generated.js';

type ProviderAvailability = {
  akshareAvailable: boolean;
  ccxtAvailable: boolean;
  financeDataReaderAvailable: boolean;
};

type SourcePlan = DesktopMarketDataAcquisitionMarket['sourcePlans'][number];
export type MarketAcquisitionCatalogRow = {
  symbol: string;
  name: string;
  exchangeId: string | null;
};
type MarketDefinition = Omit<
  DesktopMarketDataAcquisitionMarket,
  'adjustmentOptions'
> & {
  adjustmentOptions?: DesktopMarketDataAcquisitionMarket['adjustmentOptions'];
};

const fdrPlan = (
  id: Exclude<
    DesktopMarketDataAcquisitionSourcePlanId,
    'CN_A_SHARE_SMART' | 'CCXT_BINANCE_SMART' | 'CCXT_OKX_SMART'
  >,
  available: boolean,
): SourcePlan => ({
  id,
  providerChain: ['financedatareader'],
  fallbackPolicy: 'NONE',
  available,
});

const aSharePlan = ({
  akshareAvailable,
}: ProviderAvailability): SourcePlan => ({
  id: 'CN_A_SHARE_SMART',
  providerChain: ['akshare', 'financedatareader'],
  fallbackPolicy: 'WHOLE_INSTRUMENT_DAILY_UNADJUSTED_ONLY',
  // AkShare remains a valid primary path when FDR is not packaged. The
  // catalog describes the fallback chain, while job provenance shows whether
  // the fallback was actually available and used.
  available: akshareAvailable,
});

const ccxtPlan = (
  id: 'CCXT_BINANCE_SMART' | 'CCXT_OKX_SMART',
  ccxtAvailable: boolean,
): SourcePlan => ({
  id,
  providerChain: ['ccxt', 'financedatareader'],
  fallbackPolicy: 'WHOLE_INSTRUMENT_DAILY_ONLY',
  available: ccxtAvailable,
});

const market = ({
  id,
  assetClassId,
  timeZone,
  supportedTimeframes,
  adjustmentOptions = [],
  instrumentDiscovery,
  sourcePlans,
}: MarketDefinition): DesktopMarketDataAcquisitionMarket => ({
  id,
  assetClassId,
  timeZone,
  supportedTimeframes,
  adjustmentOptions,
  instrumentDiscovery,
  sourcePlans,
});

export const buildMarketAcquisitionCatalog = (
  availability: ProviderAvailability,
): DesktopMarketDataAcquisitionCatalog => {
  const { akshareAvailable, ccxtAvailable, financeDataReaderAvailable } =
    availability;
  const markets: DesktopMarketDataAcquisitionMarket[] = [
    market({
      id: 'CN_A_SHARE',
      assetClassId: 'STOCKS_AND_INDICES',
      timeZone: 'Asia/Shanghai',
      supportedTimeframes: ['1m', '5m', '1h', '1d'],
      adjustmentOptions: ['none', 'qfq', 'hfq'],
      instrumentDiscovery: 'CATALOG',
      sourcePlans: [aSharePlan(availability)],
    }),
    market({
      id: 'HK_STOCKS',
      assetClassId: 'STOCKS_AND_INDICES',
      timeZone: 'Asia/Hong_Kong',
      supportedTimeframes: ['1d'],
      instrumentDiscovery: 'CATALOG',
      sourcePlans: [fdrPlan('FDR_HKEX', financeDataReaderAvailable)],
    }),
    market({
      id: 'KR_STOCKS',
      assetClassId: 'STOCKS_AND_INDICES',
      timeZone: 'Asia/Seoul',
      supportedTimeframes: ['1d'],
      instrumentDiscovery: 'CATALOG',
      sourcePlans: [fdrPlan('FDR_KRX', financeDataReaderAvailable)],
    }),
    market({
      id: 'US_STOCKS',
      assetClassId: 'STOCKS_AND_INDICES',
      timeZone: 'America/New_York',
      supportedTimeframes: ['1d'],
      instrumentDiscovery: 'CATALOG',
      sourcePlans: [fdrPlan('FDR_US_STOCKS', financeDataReaderAvailable)],
    }),
    market({
      id: 'JP_STOCKS',
      assetClassId: 'STOCKS_AND_INDICES',
      timeZone: 'Asia/Tokyo',
      supportedTimeframes: ['1d'],
      instrumentDiscovery: 'CATALOG',
      sourcePlans: [fdrPlan('FDR_TSE', financeDataReaderAvailable)],
    }),
    market({
      id: 'VN_STOCKS',
      assetClassId: 'STOCKS_AND_INDICES',
      timeZone: 'Asia/Ho_Chi_Minh',
      supportedTimeframes: ['1d'],
      instrumentDiscovery: 'CATALOG',
      sourcePlans: [fdrPlan('FDR_HOSE', financeDataReaderAvailable)],
    }),
    market({
      id: 'GLOBAL_INDICES',
      assetClassId: 'STOCKS_AND_INDICES',
      timeZone: 'UTC',
      supportedTimeframes: ['1d'],
      instrumentDiscovery: 'PRESET',
      sourcePlans: [fdrPlan('FDR_GLOBAL_INDICES', financeDataReaderAvailable)],
    }),
    market({
      id: 'FOREX',
      assetClassId: 'FOREX',
      timeZone: 'UTC',
      supportedTimeframes: ['1d'],
      instrumentDiscovery: 'PRESET',
      sourcePlans: [fdrPlan('FDR_FOREX', financeDataReaderAvailable)],
    }),
    market({
      id: 'COMMODITY_FUTURES',
      assetClassId: 'COMMODITIES_AND_RATES',
      timeZone: 'America/New_York',
      supportedTimeframes: ['1d'],
      instrumentDiscovery: 'PRESET',
      sourcePlans: [
        fdrPlan('FDR_COMMODITY_FUTURES', financeDataReaderAvailable),
      ],
    }),
    market({
      id: 'RATE_FUTURES',
      assetClassId: 'COMMODITIES_AND_RATES',
      timeZone: 'America/New_York',
      supportedTimeframes: ['1d'],
      instrumentDiscovery: 'PRESET',
      sourcePlans: [fdrPlan('FDR_RATE_FUTURES', financeDataReaderAvailable)],
    }),
    market({
      id: 'CRYPTO_SPOT',
      assetClassId: 'CRYPTO',
      timeZone: 'UTC',
      supportedTimeframes: ['1m', '5m', '1h', '1d'],
      instrumentDiscovery: 'CATALOG',
      sourcePlans: [
        ccxtPlan('CCXT_BINANCE_SMART', ccxtAvailable),
        ccxtPlan('CCXT_OKX_SMART', ccxtAvailable),
      ],
    }),
  ];
  return {
    providers: [
      {
        id: 'akshare',
        name: 'AKShare',
        version: AKSHARE_VERSION,
        license: 'MIT',
        projectUrl: 'https://github.com/akfamily/akshare',
        docsUrl: 'https://akshare.akfamily.xyz/introduction.html',
        termsUrl: 'https://about.eastmoney.com/home/protocol',
        termsRevision: 'eastmoney-terms-2025-07-18',
        available: akshareAvailable,
        unavailabilityCode: akshareAvailable
          ? null
          : 'AKSHARE_RUNTIME_UNAVAILABLE',
      },
      {
        id: 'ccxt',
        name: 'CCXT',
        version: CCXT_VERSION,
        license: 'MIT',
        projectUrl: 'https://github.com/ccxt/ccxt',
        docsUrl: 'https://github.com/ccxt/ccxt/wiki/manual',
        termsUrl: 'https://www.binance.com/en/terms',
        termsRevision: 'binance-terms-reviewed-2026-07-19',
        available: ccxtAvailable,
        unavailabilityCode: ccxtAvailable ? null : 'CCXT_RUNTIME_UNAVAILABLE',
      },
      {
        id: 'financedatareader',
        name: 'FinanceDataReader',
        version: FINANCE_DATA_READER_VERSION,
        license: 'MIT',
        projectUrl: 'https://github.com/FinanceData/FinanceDataReader',
        docsUrl: 'https://github.com/FinanceData/FinanceDataReader',
        termsUrl: 'https://finance.yahoo.com/legal/terms.html',
        termsRevision: 'finance-datareader-upstream-review-2026-08-14',
        available: financeDataReaderAvailable,
        unavailabilityCode: financeDataReaderAvailable
          ? null
          : 'FINANCEDATAREADER_RUNTIME_UNAVAILABLE',
      },
    ],
    assetClasses: [
      {
        id: 'STOCKS_AND_INDICES',
        marketIds: [
          'CN_A_SHARE',
          'HK_STOCKS',
          'KR_STOCKS',
          'US_STOCKS',
          'JP_STOCKS',
          'VN_STOCKS',
          'GLOBAL_INDICES',
        ],
      },
      { id: 'FOREX', marketIds: ['FOREX'] },
      {
        id: 'COMMODITIES_AND_RATES',
        marketIds: ['COMMODITY_FUTURES', 'RATE_FUTURES'],
      },
      { id: 'CRYPTO', marketIds: ['CRYPTO_SPOT'] },
    ],
    markets,
  };
};

export const resolveMarketAcquisitionMarket = (
  catalog: DesktopMarketDataAcquisitionCatalog,
  marketId: DesktopMarketDataAcquisitionMarketId,
): DesktopMarketDataAcquisitionMarket => {
  const selectedMarket = catalog.markets.find((entry) => entry.id === marketId);
  if (!selectedMarket) {
    throw new AcquisitionRuntimeError('ACQUISITION_MARKET_UNAVAILABLE', {
      marketId,
    });
  }
  return selectedMarket;
};

export const resolveMarketAcquisitionSourcePlan = (
  market: DesktopMarketDataAcquisitionMarket,
  sourcePlanId: DesktopMarketDataAcquisitionSourcePlanId,
): SourcePlan => {
  const sourcePlan = market.sourcePlans.find(
    (entry) => entry.id === sourcePlanId,
  );
  if (!sourcePlan) {
    throw new AcquisitionRuntimeError('ACQUISITION_SOURCE_PLAN_INVALID', {
      marketId: market.id,
      sourcePlanId,
    });
  }
  return sourcePlan;
};

const preset = (
  marketId: DesktopMarketDataAcquisitionMarketId,
  sourcePlanId: DesktopMarketDataAcquisitionSourcePlanId,
  symbol: string,
  name: string,
): DesktopMarketDataAcquisitionInstrument => ({
  symbol,
  name,
  marketId,
  sourceSymbol: symbol,
  exchangeId: null,
  sourcePlanIds: [sourcePlanId],
});

export const marketAcquisitionPresets = (
  marketId: DesktopMarketDataAcquisitionMarketId,
): DesktopMarketDataAcquisitionInstrument[] => {
  switch (marketId) {
    case 'GLOBAL_INDICES':
      return [
        preset(marketId, 'FDR_GLOBAL_INDICES', '^GSPC', 'S&P 500'),
        preset(marketId, 'FDR_GLOBAL_INDICES', '^IXIC', 'NASDAQ Composite'),
        preset(
          marketId,
          'FDR_GLOBAL_INDICES',
          '^DJI',
          'Dow Jones Industrial Average',
        ),
        preset(marketId, 'FDR_GLOBAL_INDICES', '^N225', 'Nikkei 225'),
        preset(marketId, 'FDR_GLOBAL_INDICES', '^HSI', 'Hang Seng Index'),
        preset(marketId, 'FDR_GLOBAL_INDICES', 'KS11', 'KOSPI'),
      ];
    case 'FOREX':
      return [
        preset(marketId, 'FDR_FOREX', 'USD/KRW', 'US Dollar / Korean Won'),
        preset(marketId, 'FDR_FOREX', 'USD/JPY', 'US Dollar / Japanese Yen'),
        preset(marketId, 'FDR_FOREX', 'EUR/USD', 'Euro / US Dollar'),
        preset(marketId, 'FDR_FOREX', 'USD/CNY', 'US Dollar / Chinese Yuan'),
      ];
    case 'COMMODITY_FUTURES':
      return [
        preset(marketId, 'FDR_COMMODITY_FUTURES', 'GC=F', 'Gold futures'),
        preset(marketId, 'FDR_COMMODITY_FUTURES', 'SI=F', 'Silver futures'),
        preset(marketId, 'FDR_COMMODITY_FUTURES', 'CL=F', 'Crude oil futures'),
        preset(
          marketId,
          'FDR_COMMODITY_FUTURES',
          'NG=F',
          'Natural gas futures',
        ),
      ];
    case 'RATE_FUTURES':
      return [
        preset(
          marketId,
          'FDR_RATE_FUTURES',
          'ZB=F',
          'US Treasury Bond futures',
        ),
        preset(
          marketId,
          'FDR_RATE_FUTURES',
          'ZN=F',
          '10-Year Treasury Note futures',
        ),
        preset(
          marketId,
          'FDR_RATE_FUTURES',
          'ZF=F',
          '5-Year Treasury Note futures',
        ),
      ];
    default:
      return [];
  }
};

export const isFinanceDataReaderCryptoSymbol = (symbol: string): boolean =>
  ['BTC/USD', 'ETH/USD', 'BTC/KRW', 'ETH/KRW'].includes(symbol.toUpperCase());

const symbolPatterns: Record<DesktopMarketDataAcquisitionMarketId, RegExp> = {
  // The AKShare source plan also retains the curated, namespaced mainland
  // index presets. The namespace prevents an index such as 000001 from
  // colliding with the A-share that has the same six-digit code.
  CN_A_SHARE: /^(?:[0-9]{6}|INDEX-[0-9]{6})$/u,
  HK_STOCKS: /^(?:[0-9]{1,5}|[0-9]{4}\.HK)$/u,
  KR_STOCKS: /^[0-9]{6}$/u,
  US_STOCKS: /^[A-Z0-9.-]{1,15}$/u,
  JP_STOCKS: /^(?:[0-9]{4}|[0-9]{4}\.T)$/u,
  VN_STOCKS: /^[A-Z0-9.-]{1,16}$/u,
  GLOBAL_INDICES: /^[A-Z0-9^.-]{1,16}$/u,
  FOREX: /^[A-Z]{3}\/[A-Z]{3}$/u,
  COMMODITY_FUTURES: /^[A-Z0-9^.-]{1,16}=F$/u,
  RATE_FUTURES: /^[A-Z0-9^.-]{1,16}=F$/u,
  CRYPTO_SPOT: /^[A-Z0-9._-]+\/[A-Z0-9._-]+$/u,
};

export const normalizeMarketAcquisitionSymbol = ({
  marketId,
  symbol,
}: {
  marketId: DesktopMarketDataAcquisitionMarketId;
  symbol: string;
}): string => {
  const normalized = symbol.trim().toUpperCase();
  if (!symbolPatterns[marketId].test(normalized)) {
    throw new AcquisitionRuntimeError('ACQUISITION_SYMBOL_INVALID', {
      marketId,
      symbol: symbol.trim().slice(0, 64),
    });
  }
  return normalized;
};

export const normalizeMarketAcquisitionCatalogRows = ({
  marketId,
  rows,
}: {
  marketId: DesktopMarketDataAcquisitionMarketId;
  rows: readonly MarketAcquisitionCatalogRow[];
}): MarketAcquisitionCatalogRow[] => {
  const normalized = new Map<string, MarketAcquisitionCatalogRow>();
  for (const row of rows) {
    let symbol: string;
    try {
      symbol = normalizeMarketAcquisitionSymbol({
        marketId,
        symbol: row.symbol,
      });
    } catch (error) {
      if (error instanceof AcquisitionRuntimeError) continue;
      throw error;
    }
    const name = row.name.trim();
    const exchangeId = row.exchangeId?.trim() || null;
    if (
      !name ||
      name.length > 128 ||
      name.includes('\uFFFD') ||
      (exchangeId && exchangeId.length > 64)
    ) {
      continue;
    }
    if (
      marketId === 'CN_A_SHARE' &&
      exchangeId !== 'SH' &&
      exchangeId !== 'SZ' &&
      exchangeId !== 'BJ'
    ) {
      continue;
    }
    if (!normalized.has(symbol)) {
      normalized.set(symbol, { symbol, name, exchangeId });
    }
  }
  if (normalized.size === 0) {
    throw new AcquisitionRuntimeError('ACQUISITION_INSTRUMENT_CATALOG_EMPTY', {
      marketId,
    });
  }
  return [...normalized.values()];
};

export const marketAcquisitionConnectorFingerprint = (
  providerChain: ReadonlyArray<SourcePlan['providerChain'][number]>,
): string =>
  providerChain
    .map((providerId) => {
      if (providerId === 'akshare') {
        return `akshare:${AKSHARE_VERSION}`;
      }
      if (providerId === 'ccxt') return `ccxt:${CCXT_VERSION}`;
      return `financedatareader:${FINANCE_DATA_READER_VERSION}`;
    })
    .join('|');
