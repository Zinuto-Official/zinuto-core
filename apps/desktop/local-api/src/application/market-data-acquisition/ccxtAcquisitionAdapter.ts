// SPDX-License-Identifier: GPL-3.0-only

import {
  AcquisitionRuntimeError,
  throwIfAcquisitionCanceled,
  type AcquisitionFetchInput,
  type CanonicalMarketBar,
  type CcxtAcquisitionAdapter,
  type CcxtAcquisitionMarket,
} from './marketDataAcquisitionTypes.js';

const FETCH_LIMIT = 500;
const MAX_PAGES = 500;
const MAX_ROWS_PER_SYMBOL = 250_000;
const REQUEST_TIMEOUT_MS = 20_000;
const MARKET_CACHE_TTL_MS = 15 * 60_000;
const MAX_MARKET_RESULTS = 500;
const RETRY_DELAYS_MS = [250, 750, 2_000] as const;
const POPULAR_MARKET_ORDER = [
  'BTC/USDT',
  'ETH/USDT',
  'SOL/USDT',
  'BNB/USDT',
  'XRP/USDT',
  'DOGE/USDT',
  'BTC/USDC',
  'ETH/USDC',
] as const;
const POPULAR_MARKET_RANK = new Map<string, number>(
  POPULAR_MARKET_ORDER.map((symbol, index) => [symbol, index]),
);

type CcxtOhlcv = [number, number, number, number, number, number, ...unknown[]];
type CcxtMarket = {
  symbol?: string;
  base?: string;
  quote?: string;
  spot?: boolean;
  active?: boolean;
};
type CcxtExchange = {
  has: Record<string, unknown>;
  timeframes?: Record<string, unknown>;
  loadMarkets(): Promise<Record<string, CcxtMarket>>;
  market(symbol: string): CcxtMarket;
  fetchOHLCV(
    symbol: string,
    timeframe: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>,
  ): Promise<CcxtOhlcv[]>;
  close?(): Promise<void>;
};

type CcxtExchangeConstructor = new (options: Record<string, unknown>) => CcxtExchange;
type CcxtExchangeFactory = (
  exchangeId: 'binance' | 'okx',
) => Promise<CcxtExchange>;
type CcxtMarketCacheEntry = {
  markets: CcxtAcquisitionMarket[];
  cachedAt: string;
  expiresAt: number;
};

const timeframeMilliseconds = {
  '1m': 60_000,
  '5m': 300_000,
  '1h': 3_600_000,
  '1d': 86_400_000,
} as const;

const defaultExchangeFactory: CcxtExchangeFactory = async (exchangeId) => {
  const module = await import('ccxt');
  const Constructor = module[exchangeId] as unknown as CcxtExchangeConstructor;
  if (typeof Constructor !== 'function') {
    throw new AcquisitionRuntimeError('CCXT_EXCHANGE_UNAVAILABLE', { exchangeId });
  }
  return new Constructor({
    enableRateLimit: true,
    timeout: REQUEST_TIMEOUT_MS,
    options: { defaultType: 'spot' },
  });
};

const isTransientError = (error: unknown): boolean => {
  const name = error instanceof Error ? error.name : '';
  const text = error instanceof Error ? error.message : String(error ?? '');
  return /NetworkError|RequestTimeout|RateLimitExceeded|ExchangeNotAvailable/u.test(name) ||
    /(?:^|\D)(?:429|5\d\d)(?:\D|$)|timed?\s*out|network|temporar/iu.test(text);
};

const waitForRetry = async (delayMs: number, signal: AbortSignal): Promise<void> => {
  throwIfAcquisitionCanceled(signal);
  await new Promise<void>((resolve, reject) => {
    const complete = () => {
      signal.removeEventListener('abort', cancel);
      resolve();
    };
    const timer = setTimeout(complete, delayMs);
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      reject(new AcquisitionRuntimeError('ACQUISITION_CANCELED'));
    };
    signal.addEventListener('abort', cancel, { once: true });
    timer.unref?.();
  });
};

const withTransientRetry = async <T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
  callbacks: Pick<AcquisitionFetchInput, 'onRetryWait' | 'onRetryResume'> = {},
  retryDelaysMs: readonly number[] = RETRY_DELAYS_MS,
  wait: (delayMs: number, signal: AbortSignal) => Promise<void> = waitForRetry,
): Promise<T> => {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    throwIfAcquisitionCanceled(signal);
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientError(error) || attempt === retryDelaysMs.length) {
        break;
      }
      const retryAfterMs = retryDelaysMs[attempt]!;
      callbacks.onRetryWait?.({ attempt: attempt + 1, retryAfterMs });
      await wait(retryAfterMs, signal);
      callbacks.onRetryResume?.();
    }
  }
  throw new AcquisitionRuntimeError('CCXT_UPSTREAM_FAILED', {
    upstreamErrorType: lastError instanceof Error ? lastError.name : typeof lastError,
  });
};

const toCanonicalBar = (row: CcxtOhlcv): CanonicalMarketBar => {
  if (!Array.isArray(row) || row.length < 6) {
    throw new AcquisitionRuntimeError('CCXT_UPSTREAM_SCHEMA_INVALID');
  }
  const [timestamp, open, high, low, close, volume] = row.map(Number);
  if ([timestamp, open, high, low, close, volume].some((value) => !Number.isFinite(value))) {
    throw new AcquisitionRuntimeError('CCXT_UPSTREAM_SCHEMA_INVALID');
  }
  return {
    timestamp: new Date(timestamp!).toISOString(),
    open: open!,
    high: high!,
    low: low!,
    close: close!,
    volume: volume!,
  };
};

export const createCcxtAcquisitionAdapter = ({
  exchangeFactory = defaultExchangeFactory,
  now = () => Date.now(),
  retryDelaysMs = RETRY_DELAYS_MS,
  wait = waitForRetry,
}: {
  exchangeFactory?: CcxtExchangeFactory;
  now?: () => number;
  retryDelaysMs?: readonly number[];
  wait?: (delayMs: number, signal: AbortSignal) => Promise<void>;
} = {}): CcxtAcquisitionAdapter => {
  const exchangesByJobId = new Map<string, CcxtExchange>();
  const marketCache = new Map<'binance' | 'okx', CcxtMarketCacheEntry>();
  const marketLoadsInFlight = new Map<
    'binance' | 'okx',
    Promise<CcxtMarketCacheEntry>
  >();
  let marketLoadTail: Promise<void> = Promise.resolve();

  const loadMarketCatalog = (
    exchangeId: 'binance' | 'okx',
  ): Promise<CcxtMarketCacheEntry> => {
    const cached = marketCache.get(exchangeId);
    if (cached && cached.expiresAt > now()) {
      return Promise.resolve(cached);
    }
    const existingLoad = marketLoadsInFlight.get(exchangeId);
    if (existingLoad) return existingLoad;

    const load = marketLoadTail.then(async () => {
      const loadStartedAt = now();
      const refreshed = marketCache.get(exchangeId);
      if (refreshed && refreshed.expiresAt > loadStartedAt) {
        return refreshed;
      }
      const exchange = await exchangeFactory(exchangeId);
      try {
        const loaded = await withTransientRetry(
          () => exchange.loadMarkets(),
          new AbortController().signal,
          {},
          retryDelaysMs,
          wait,
        );
        const unique = new Map<string, CcxtAcquisitionMarket>();
        for (const market of Object.values(loaded)) {
          if (
            market.spot !== true ||
            market.active === false ||
            typeof market.symbol !== 'string' ||
            typeof market.base !== 'string' ||
            typeof market.quote !== 'string'
          ) {
            continue;
          }
          const symbol = market.symbol.toUpperCase();
          if (!/^[A-Z0-9._-]+\/[A-Z0-9._-]+$/u.test(symbol)) {
            continue;
          }
          unique.set(symbol, {
            symbol,
            base: market.base.toUpperCase(),
            quote: market.quote.toUpperCase(),
            active: true,
          });
        }
        const result = {
          markets: [...unique.values()].sort((left, right) => {
            const leftRank = POPULAR_MARKET_RANK.get(left.symbol) ?? Number.MAX_SAFE_INTEGER;
            const rightRank = POPULAR_MARKET_RANK.get(right.symbol) ?? Number.MAX_SAFE_INTEGER;
            return leftRank - rightRank || left.symbol.localeCompare(right.symbol);
          }),
          cachedAt: new Date(loadStartedAt).toISOString(),
          expiresAt: loadStartedAt + MARKET_CACHE_TTL_MS,
        } satisfies CcxtMarketCacheEntry;
        marketCache.set(exchangeId, result);
        return result;
      } finally {
        await exchange.close?.().catch(() => undefined);
      }
    });
    marketLoadsInFlight.set(exchangeId, load);
    marketLoadTail = load.then(
      () => undefined,
      () => undefined,
    );
    void load.then(
      () => {
        if (marketLoadsInFlight.get(exchangeId) === load) {
          marketLoadsInFlight.delete(exchangeId);
        }
      },
      () => {
        if (marketLoadsInFlight.get(exchangeId) === load) {
          marketLoadsInFlight.delete(exchangeId);
        }
      },
    );
    return load;
  };

  return {
    id: 'ccxt',
    isAvailable: () => true,
    async listMarkets(exchangeId, query) {
      const cached = await loadMarketCatalog(exchangeId);
      const normalizedQuery = query.trim().toUpperCase();
      return {
        markets: cached.markets
          .filter((market) =>
            !normalizedQuery ||
            market.symbol.includes(normalizedQuery) ||
            market.base.includes(normalizedQuery) ||
            market.quote.includes(normalizedQuery),
          )
          .slice(0, MAX_MARKET_RESULTS),
        cachedAt: cached.cachedAt,
      };
    },
    async fetchSymbol(input: AcquisitionFetchInput): Promise<CanonicalMarketBar[]> {
      if (input.request.connectorId !== 'ccxt') {
        throw new AcquisitionRuntimeError('ACQUISITION_CONNECTOR_REQUEST_MISMATCH');
      }
      const symbol = input.symbol.toUpperCase();
      let exchange = exchangesByJobId.get(input.jobId);
      if (!exchange) {
        exchange = await exchangeFactory(input.request.exchangeId);
        exchangesByJobId.set(input.jobId, exchange);
        await withTransientRetry(
          () => exchange!.loadMarkets(),
          input.signal,
          input,
          retryDelaysMs,
          wait,
        );
      }
      if (exchange.has.fetchOHLCV !== true) {
        throw new AcquisitionRuntimeError('CCXT_OHLCV_UNAVAILABLE', {
          exchangeId: input.request.exchangeId,
        });
      }
      if (!exchange.timeframes?.[input.request.timeframe]) {
        throw new AcquisitionRuntimeError('CCXT_TIMEFRAME_UNAVAILABLE', {
          exchangeId: input.request.exchangeId,
          timeframe: input.request.timeframe,
        });
      }
      let market: CcxtMarket;
      try {
        market = exchange.market(symbol);
      } catch {
        throw new AcquisitionRuntimeError('CCXT_SYMBOL_UNAVAILABLE', { symbol });
      }
      if (market.spot !== true || market.active === false) {
        throw new AcquisitionRuntimeError('CCXT_SPOT_SYMBOL_UNAVAILABLE', { symbol });
      }

      const startAtMs = Date.parse(input.request.startAt);
      const endAtMs = Date.parse(input.request.endAt);
      const intervalMs = timeframeMilliseconds[input.request.timeframe];
      const closedBeforeMs = now() - intervalMs;
      const rows: CanonicalMarketBar[] = [];
      let cursor = startAtMs;
      let pages = 0;
      const closeOnCancel = () => {
        void exchange?.close?.().catch(() => undefined);
      };
      input.signal.addEventListener('abort', closeOnCancel, { once: true });
      try {
        while (cursor <= endAtMs && pages < MAX_PAGES) {
          throwIfAcquisitionCanceled(input.signal);
          const page = await withTransientRetry(
            () =>
              exchange!.fetchOHLCV(
                symbol,
                input.request.timeframe,
                cursor,
                FETCH_LIMIT,
                {},
              ),
            input.signal,
            input,
            retryDelaysMs,
            wait,
          );
          pages += 1;
          if (!Array.isArray(page) || page.length === 0) {
            break;
          }
          let lastTimestamp = -1;
          for (const rawRow of page) {
            const bar = toCanonicalBar(rawRow);
            const timestamp = Date.parse(bar.timestamp);
            if (!Number.isFinite(timestamp)) {
              throw new AcquisitionRuntimeError('CCXT_UPSTREAM_SCHEMA_INVALID');
            }
            lastTimestamp = Math.max(lastTimestamp, timestamp);
            if (
              timestamp >= startAtMs &&
              timestamp <= endAtMs &&
              timestamp <= closedBeforeMs
            ) {
              rows.push(bar);
            }
          }
          if (rows.length > MAX_ROWS_PER_SYMBOL) {
            throw new AcquisitionRuntimeError('ACQUISITION_ROW_LIMIT_EXCEEDED', {
              maxRows: MAX_ROWS_PER_SYMBOL,
            });
          }
          const nextCursor = lastTimestamp + intervalMs;
          if (lastTimestamp < 0 || nextCursor <= cursor || lastTimestamp >= endAtMs) {
            break;
          }
          cursor = nextCursor;
        }
        if (pages >= MAX_PAGES && cursor <= endAtMs) {
          throw new AcquisitionRuntimeError('ACQUISITION_PAGE_LIMIT_EXCEEDED', {
            maxPages: MAX_PAGES,
          });
        }
        return rows;
      } finally {
        input.signal.removeEventListener('abort', closeOnCancel);
      }
    },
    async finishJob(jobId: string): Promise<void> {
      const exchange = exchangesByJobId.get(jobId);
      exchangesByJobId.delete(jobId);
      await exchange?.close?.().catch(() => undefined);
    },
  };
};
