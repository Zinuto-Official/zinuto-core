// SPDX-License-Identifier: GPL-3.0-only

import path from 'node:path';

import {
  desktopMarketDataAcquisitionJobCreateRequestSchema,
  desktopMarketDataAcquisitionMarketJobCreateRequestSchema,
  type DesktopAkshareAcquisitionInstrumentCatalog,
  type DesktopCcxtAcquisitionMarketCatalog,
  type DesktopMarketDataAcquisitionCatalog,
  type DesktopMarketDataAcquisitionInstrumentCatalog,
  type DesktopMarketDataAcquisitionMarketId,
  type DesktopMarketDataAcquisitionSourcePlanId,
} from '@zinuto/shared/contracts-desktop/api';

import {
  createAkshareSidecarAdapter,
  type AkshareAcquisitionAdapter,
} from './akshareSidecarAdapter.js';
import { AKSHARE_INDEX_ACQUISITION_INSTRUMENTS } from './akshareIndexCatalog.js';
import {
  validateAcquisitionStagingWithImportPreview,
  validateMarketAcquisitionStagingWithImportPreview,
} from './acquisitionImportValidation.js';
import {
  discardAcquisitionStaging,
  normalizeAndValidateAcquisitionBars,
  prepareAcquisitionStaging,
} from './acquisitionStaging.js';
import { createCcxtAcquisitionAdapter } from './ccxtAcquisitionAdapter.js';
import { createFinanceDataReaderSidecarAdapter } from './financeDataReaderSidecarAdapter.js';
import {
  AKSHARE_VERSION,
  CCXT_VERSION,
} from './marketDataConnectorVersions.generated.js';
import {
  createMarketAcquisitionCatalogCache,
  type MarketAcquisitionCatalogCacheInstrument,
} from './marketAcquisitionCatalogCache.js';
import {
  createMemoryAcquisitionJobStore,
  listMarketJobSummaries,
  restoreMarketAcquisitionJobs,
  serializeMarketJob,
  type AcquisitionJobStore,
} from '../ports/infrastructure/db/marketDataAcquisitionJobStore.js';
import {
  buildMarketAcquisitionCatalog,
  marketAcquisitionConnectorFingerprint,
  marketAcquisitionPresets,
  normalizeMarketAcquisitionCatalogRows,
  normalizeMarketAcquisitionSymbol,
  resolveMarketAcquisitionMarket,
  resolveMarketAcquisitionSourcePlan,
} from './marketAcquisitionCatalog.js';
import { createMarketAcquisitionJobRunner } from './marketDataAcquisitionMarketRuntime.js';
import {
  AcquisitionRuntimeError,
  type AcquisitionConnectorAdapter,
  type AcquisitionConnectorCatalog,
  type AcquisitionJob,
  type AcquisitionRequest,
  type CanonicalMarketBar,
  type CcxtAcquisitionAdapter,
  type FinanceDataReaderAcquisitionAdapter,
  type MarketAcquisitionJob,
  type MarketAcquisitionRequest,
} from './marketDataAcquisitionTypes.js';

const MAX_RETAINED_JOBS = 20;

type AkshareAdapterDependency =
  AcquisitionConnectorAdapter | AkshareAcquisitionAdapter;

type ServiceDependencies = {
  stagingRoot: string;
  catalogCacheDir?: string;
  createId: () => string;
  now: () => Date;
  akshareAdapter?: AkshareAdapterDependency;
  ccxtAdapter?: CcxtAcquisitionAdapter;
  financeDataReaderAdapter?: FinanceDataReaderAcquisitionAdapter;
  validateStaging?: typeof validateAcquisitionStagingWithImportPreview;
  validateMarketStaging?: typeof validateMarketAcquisitionStagingWithImportPreview;
  jobStore?: AcquisitionJobStore;
};

const cloneJob = (job: AcquisitionJob): AcquisitionJob => structuredClone(job);
const cloneMarketJob = (job: MarketAcquisitionJob): MarketAcquisitionJob =>
  structuredClone(job);

const supportsAkshareInstrumentCatalog = (
  adapter: AkshareAdapterDependency,
): adapter is AkshareAcquisitionAdapter =>
  adapter.id === 'akshare' &&
  'listInstruments' in adapter &&
  typeof adapter.listInstruments === 'function';

const connectorCatalog = (
  akshareAvailable: boolean,
  ccxtAvailable: boolean,
): AcquisitionConnectorCatalog => ({
  connectors: [
    {
      id: 'akshare',
      version: AKSHARE_VERSION,
      market: 'A_SHARE',
      available: akshareAvailable,
      unavailabilityCode: akshareAvailable
        ? null
        : 'AKSHARE_RUNTIME_UNAVAILABLE',
      supportedTimeframes: ['1m', '5m', '1h', '1d'],
      datasets: [
        'stock_zh_a_hist',
        'stock_zh_a_hist_min_em',
        'index_zh_a_hist',
      ],
      exchanges: [],
      terms: {
        projects: [
          {
            id: 'akshare',
            name: 'AKShare',
            url: 'https://github.com/akfamily/akshare',
            infoUrl: 'https://akshare.akfamily.xyz/introduction.html',
            version: AKSHARE_VERSION,
            license: 'MIT',
          },
        ],
        upstreams: [
          {
            id: 'eastmoney',
            upstreamName: 'Eastmoney',
            termsUrl: 'https://about.eastmoney.com/home/protocol',
            docsUrl: 'https://akshare.akfamily.xyz/data/stock/stock.html',
            termsRevision: 'eastmoney-terms-2025-07-18',
          },
        ],
      },
    },
    {
      id: 'ccxt',
      version: CCXT_VERSION,
      market: 'CRYPTO_SPOT',
      available: ccxtAvailable,
      unavailabilityCode: ccxtAvailable ? null : 'CCXT_RUNTIME_UNAVAILABLE',
      supportedTimeframes: ['1m', '5m', '1h', '1d'],
      datasets: [],
      exchanges: ['binance', 'okx'],
      terms: {
        projects: [
          {
            id: 'ccxt',
            name: 'CCXT',
            url: 'https://github.com/ccxt/ccxt',
            infoUrl: 'https://github.com/ccxt/ccxt/wiki/manual',
            version: CCXT_VERSION,
            license: 'MIT',
          },
        ],
        upstreams: [
          {
            id: 'binance',
            upstreamName: 'Binance Spot public market data',
            termsUrl: 'https://www.binance.com/en/terms',
            docsUrl:
              'https://developers.binance.com/en/docs/products/spot/rest-api',
            termsRevision: 'binance-terms-reviewed-2026-07-19',
          },
          {
            id: 'okx',
            upstreamName: 'OKX Spot public market data',
            termsUrl: 'https://www.okx.com/help/terms-of-service',
            docsUrl: 'https://www.okx.com/docs-v5/en/',
            termsRevision: 'okx-terms-2026-04-21',
          },
        ],
      },
    },
  ],
});

const normalizeRequest = (input: unknown): AcquisitionRequest => {
  const parsed =
    desktopMarketDataAcquisitionJobCreateRequestSchema.parse(input);
  if (parsed.connectorId === 'ccxt') {
    return {
      ...parsed,
      symbols: parsed.symbols.map((symbol) => symbol.toUpperCase()),
    };
  }
  return parsed;
};

const normalizeMarketRequest = (input: unknown): MarketAcquisitionRequest => {
  const parsed =
    desktopMarketDataAcquisitionMarketJobCreateRequestSchema.parse(input);
  return {
    ...parsed,
    adjustment:
      parsed.marketId === 'CN_A_SHARE' && parsed.adjustment === null
        ? 'none'
        : parsed.adjustment,
    symbols: parsed.symbols.map((symbol) =>
      normalizeMarketAcquisitionSymbol({ marketId: parsed.marketId, symbol }),
    ),
  };
};

const sanitizeJobError = (error: unknown): AcquisitionJob['error'] => {
  if (error instanceof AcquisitionRuntimeError) {
    return { code: error.code, args: error.args };
  }
  return {
    code: 'ACQUISITION_FAILED',
    args: {
      runtimeErrorType: error instanceof Error ? error.name : typeof error,
    },
  };
};

export const createMarketDataAcquisitionService = ({
  stagingRoot,
  catalogCacheDir = path.join(stagingRoot, '.catalog-v2'),
  createId,
  now,
  akshareAdapter = createAkshareSidecarAdapter(),
  ccxtAdapter = createCcxtAcquisitionAdapter(),
  financeDataReaderAdapter = createFinanceDataReaderSidecarAdapter(),
  validateStaging = validateAcquisitionStagingWithImportPreview,
  validateMarketStaging = validateMarketAcquisitionStagingWithImportPreview,
  jobStore = createMemoryAcquisitionJobStore(),
}: ServiceDependencies) => {
  const jobs = new Map<string, AcquisitionJob>();
  const marketJobs = new Map<string, MarketAcquisitionJob>();
  const abortControllers = new Map<string, AbortController>();
  let activeJobId: string | null = null;
  let runningPromise: Promise<void> | null = null;
  let initialized = false;
  const catalogCache = createMarketAcquisitionCatalogCache({
    cacheDir: catalogCacheDir,
    now,
  });

  const ensureInitialized = async (): Promise<void> => {
    if (initialized) return;
    await restoreMarketAcquisitionJobs({
      stagingRoot,
      jobStore,
      limit: MAX_RETAINED_JOBS,
      marketJobs,
      discardStaging: discardAcquisitionStaging,
      preserveEntryNames: [path.basename(catalogCacheDir)],
      nowIso: () => now().toISOString(),
    });
    initialized = true;
  };

  const updateJob = (
    job: AcquisitionJob,
    update: Partial<AcquisitionJob>,
  ): void => {
    Object.assign(job, update, { updatedAt: now().toISOString() });
  };

  const updateMarketJob = (
    job: MarketAcquisitionJob,
    update: Partial<MarketAcquisitionJob>,
  ): void => {
    Object.assign(job, update, { updatedAt: now().toISOString() });
    jobStore.upsert(serializeMarketJob(job));
  };

  const pruneJobs = async (): Promise<void> => {
    if (jobs.size < MAX_RETAINED_JOBS) return;
    const terminal = [...jobs.values()]
      .filter((job) => job.id !== activeJobId)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
    while (jobs.size >= MAX_RETAINED_JOBS && terminal.length > 0) {
      const removed = terminal.shift();
      if (removed) {
        await discardAcquisitionStaging(stagingRoot, removed.id);
        jobs.delete(removed.id);
      }
    }
  };

  const pruneMarketJobs = async (): Promise<void> => {
    for (const prunedId of jobStore.prune(MAX_RETAINED_JOBS)) {
      marketJobs.delete(prunedId);
      await discardAcquisitionStaging(stagingRoot, prunedId).catch(
        () => undefined,
      );
    }
    if (marketJobs.size < MAX_RETAINED_JOBS) return;
    // Ready-to-save jobs are excluded so a pending save never loses its
    // staging to a retention sweep.
    const terminal = [...marketJobs.values()]
      .filter(
        (job) => job.id !== activeJobId && job.status !== 'READY_TO_SAVE',
      )
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
    while (marketJobs.size >= MAX_RETAINED_JOBS && terminal.length > 0) {
      const removed = terminal.shift();
      if (removed) {
        await discardAcquisitionStaging(stagingRoot, removed.id);
        marketJobs.delete(removed.id);
      }
    }
  };

  const resolveAdapter = (
    request: AcquisitionRequest,
  ): AcquisitionConnectorAdapter =>
    request.connectorId === 'akshare' ? akshareAdapter : ccxtAdapter;

  const currentMarketCatalog = (): DesktopMarketDataAcquisitionCatalog =>
    buildMarketAcquisitionCatalog({
      akshareAvailable: akshareAdapter.isAvailable(),
      ccxtAvailable: ccxtAdapter.isAvailable(),
      financeDataReaderAvailable: financeDataReaderAdapter.isAvailable(),
    });

  const runMarketJob = createMarketAcquisitionJobRunner({
    stagingRoot,
    marketJobs,
    abortControllers,
    currentMarketCatalog,
    updateMarketJob,
    clearActiveJob: (jobId) => {
      if (activeJobId === jobId) activeJobId = null;
    },
    akshareAdapter,
    ccxtAdapter,
    financeDataReaderAdapter,
    validateMarketStaging,
    sanitizeJobError,
  });

  const paginateMarketInstruments = ({
    marketId,
    instruments,
    cursor,
    cachedAt,
    cacheState,
  }: {
    marketId: DesktopMarketDataAcquisitionMarketId;
    instruments: DesktopMarketDataAcquisitionInstrumentCatalog['instruments'];
    cursor: string;
    cachedAt: string | null;
    cacheState: DesktopMarketDataAcquisitionInstrumentCatalog['cacheState'];
  }): DesktopMarketDataAcquisitionInstrumentCatalog => {
    const offset = /^\d+$/u.test(cursor) ? Number(cursor) : 0;
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > instruments.length
    ) {
      throw new AcquisitionRuntimeError('ACQUISITION_PAGE_LIMIT_EXCEEDED');
    }
    const pageSize = 100;
    const page = instruments.slice(offset, offset + pageSize);
    const nextOffset = offset + page.length;
    return {
      marketId,
      instruments: page,
      nextCursor: nextOffset < instruments.length ? String(nextOffset) : null,
      cachedAt,
      cacheState,
    };
  };

  const loadDynamicMarketCatalog = async ({
    marketId,
    sourcePlanId,
    forceRefresh,
  }: {
    marketId: DesktopMarketDataAcquisitionMarketId;
    sourcePlanId: DesktopMarketDataAcquisitionSourcePlanId;
    forceRefresh: boolean;
  }) => {
    const catalog = currentMarketCatalog();
    const selectedMarket = resolveMarketAcquisitionMarket(catalog, marketId);
    const selectedPlan = resolveMarketAcquisitionSourcePlan(
      selectedMarket,
      sourcePlanId,
    );
    if (!selectedPlan.available) {
      throw new AcquisitionRuntimeError('ACQUISITION_MARKET_UNAVAILABLE', {
        marketId,
        sourcePlanId,
      });
    }
    return catalogCache.readOrLoad({
      marketId,
      sourcePlanId,
      connectorFingerprint: marketAcquisitionConnectorFingerprint(
        selectedPlan.providerChain,
      ),
      forceRefresh,
      load: async () => {
        if (selectedPlan.id === 'CN_A_SHARE_SMART') {
          if (
            !akshareAdapter.isAvailable() ||
            !supportsAkshareInstrumentCatalog(akshareAdapter)
          ) {
            throw new AcquisitionRuntimeError('AKSHARE_RUNTIME_UNAVAILABLE');
          }
          return normalizeMarketAcquisitionCatalogRows({
            marketId,
            rows: [
              ...(await akshareAdapter.listInstruments()),
              ...AKSHARE_INDEX_ACQUISITION_INSTRUMENTS,
            ],
          });
        }
        if (
          selectedPlan.id === 'CCXT_BINANCE_SMART' ||
          selectedPlan.id === 'CCXT_OKX_SMART'
        ) {
          const exchangeId =
            selectedPlan.id === 'CCXT_BINANCE_SMART' ? 'binance' : 'okx';
          const result = await ccxtAdapter.listMarkets(exchangeId, '', {
            forceRefresh,
          });
          return normalizeMarketAcquisitionCatalogRows({
            marketId,
            rows: result.markets.map((item) => ({
              symbol: item.symbol,
              name: `${item.base}/${item.quote}`,
              exchangeId,
            })),
          });
        }
        if (!financeDataReaderAdapter.isAvailable()) {
          throw new AcquisitionRuntimeError(
            'FINANCEDATAREADER_RUNTIME_UNAVAILABLE',
          );
        }
        return normalizeMarketAcquisitionCatalogRows({
          marketId,
          rows: await financeDataReaderAdapter.listInstruments({
            marketId,
            query: '',
          }),
        });
      },
    });
  };

  const listMarketInstruments = async ({
    marketId,
    sourcePlanId,
    query,
    cursor,
    refresh,
  }: {
    marketId: DesktopMarketDataAcquisitionMarketId;
    sourcePlanId: DesktopMarketDataAcquisitionSourcePlanId | null;
    query: string;
    cursor: string;
    refresh?: boolean;
  }): Promise<DesktopMarketDataAcquisitionInstrumentCatalog> => {
    const catalog = currentMarketCatalog();
    const selectedMarket = resolveMarketAcquisitionMarket(catalog, marketId);
    const selectedPlan = sourcePlanId
      ? resolveMarketAcquisitionSourcePlan(selectedMarket, sourcePlanId)
      : (selectedMarket.sourcePlans.find((plan) => plan.available) ??
        selectedMarket.sourcePlans[0]!);
    if (!selectedPlan.available) {
      throw new AcquisitionRuntimeError('ACQUISITION_MARKET_UNAVAILABLE', {
        marketId,
        sourcePlanId: selectedPlan.id,
      });
    }
    const normalizedQuery = query.trim().toUpperCase();
    const matchesQuery = (symbol: string, name: string): boolean =>
      !normalizedQuery ||
      symbol.toUpperCase().includes(normalizedQuery) ||
      name.toUpperCase().includes(normalizedQuery);
    const rankQueryMatch = (symbol: string, name: string): number => {
      if (!normalizedQuery) return 0;
      const normalizedSymbol = symbol.toUpperCase();
      const normalizedName = name.toUpperCase();
      if (normalizedSymbol === normalizedQuery) return 0;
      if (normalizedSymbol.startsWith(normalizedQuery)) return 1;
      if (normalizedName === normalizedQuery) return 2;
      if (normalizedName.startsWith(normalizedQuery)) return 3;
      return 4;
    };
    const asCatalog = ({
      rows,
      cachedAt,
      cacheState,
    }: {
      rows: readonly MarketAcquisitionCatalogCacheInstrument[];
      cachedAt: string | null;
      cacheState: DesktopMarketDataAcquisitionInstrumentCatalog['cacheState'];
    }) =>
      paginateMarketInstruments({
        marketId,
        instruments: rows
          .filter((row) => matchesQuery(row.symbol, row.name))
          .sort(
            (left, right) =>
              rankQueryMatch(left.symbol, left.name) -
                rankQueryMatch(right.symbol, right.name) ||
              left.symbol.localeCompare(right.symbol),
          )
          .map((row) => ({
            symbol: row.symbol,
            name: row.name,
            marketId,
            sourceSymbol: row.symbol,
            exchangeId: row.exchangeId,
            sourcePlanIds: [selectedPlan.id],
          })),
        cursor,
        cachedAt,
        cacheState,
      });

    if (selectedMarket.instrumentDiscovery === 'PRESET') {
      return paginateMarketInstruments({
        marketId,
        instruments: marketAcquisitionPresets(marketId)
          .filter(
            (item) =>
              item.sourcePlanIds.includes(selectedPlan.id) &&
              matchesQuery(item.symbol, item.name),
          )
          .sort(
            (left, right) =>
              rankQueryMatch(left.symbol, left.name) -
                rankQueryMatch(right.symbol, right.name) ||
              left.symbol.localeCompare(right.symbol),
          ),
        cursor,
        cachedAt: null,
        cacheState: 'BUNDLED',
      });
    }
    const result = await loadDynamicMarketCatalog({
      marketId,
      sourcePlanId: selectedPlan.id,
      forceRefresh: refresh ?? false,
    });
    return asCatalog({
      rows: result.instruments,
      cachedAt: result.cachedAt,
      cacheState: result.cacheState,
    });
  };

  const runJob = async (jobId: string): Promise<void> => {
    const job = jobs.get(jobId);
    const controller = abortControllers.get(jobId);
    if (!job || !controller || job.status === 'CANCELED') return;
    const adapter = resolveAdapter(job.request);
    const rowsBySymbol = new Map<string, CanonicalMarketBar[]>();
    let mergedDuplicates = 0;
    try {
      updateJob(job, {
        status: 'RUNNING',
        progress: { ...job.progress, stage: 'CONNECTING' },
      });
      for (const symbol of job.request.symbols) {
        updateJob(job, {
          progress: { ...job.progress, stage: 'DOWNLOADING' },
        });
        const rows = await adapter.fetchSymbol({
          jobId,
          request: job.request,
          symbol,
          signal: controller.signal,
          onRetryWait: ({ attempt, retryAfterMs }) => {
            updateJob(job, {
              progress: {
                ...job.progress,
                stage: 'RETRY_WAIT',
                retryAttempt: attempt,
                retryAfterMs,
              },
            });
          },
          onRetryResume: () => {
            updateJob(job, {
              progress: {
                ...job.progress,
                stage: 'DOWNLOADING',
                retryAfterMs: 0,
              },
            });
          },
        });
        updateJob(job, {
          progress: { ...job.progress, stage: 'NORMALIZING' },
        });
        const normalized = normalizeAndValidateAcquisitionBars({
          request: job.request,
          rows,
        });
        rowsBySymbol.set(symbol, normalized.rows);
        mergedDuplicates += normalized.mergedDuplicates;
        updateJob(job, {
          progress: {
            ...job.progress,
            stage: 'DOWNLOADING',
            completedSymbols: job.progress.completedSymbols + 1,
          },
        });
      }
      updateJob(job, {
        progress: { ...job.progress, stage: 'VALIDATING' },
      });
      const staging = await prepareAcquisitionStaging({
        stagingRoot,
        jobId,
        request: job.request,
        createdAt: job.createdAt,
        rowsBySymbol,
        mergedDuplicateBars: mergedDuplicates,
      });
      await validateStaging({
        payloadRoot: path.join(stagingRoot, jobId, 'payload'),
        outputFolderName: staging.outputFolderName,
        request: job.request,
        jobId,
      });
      if (controller.signal.aborted) {
        await discardAcquisitionStaging(stagingRoot, jobId);
        updateJob(job, { status: 'CANCELED', staging: null });
        return;
      }
      updateJob(job, {
        status: 'READY_TO_SAVE',
        progress: { ...job.progress, stage: 'READY_TO_SAVE' },
        staging,
        error: null,
      });
    } catch (error) {
      await discardAcquisitionStaging(stagingRoot, jobId).catch(
        () => undefined,
      );
      if (
        controller.signal.aborted ||
        (error instanceof AcquisitionRuntimeError &&
          error.code === 'ACQUISITION_CANCELED')
      ) {
        updateJob(job, { status: 'CANCELED', staging: null, error: null });
      } else {
        updateJob(job, {
          status: 'FAILED',
          staging: null,
          error: sanitizeJobError(error),
        });
      }
    } finally {
      await adapter.finishJob?.(jobId).catch(() => undefined);
      abortControllers.delete(jobId);
      if (activeJobId === jobId) activeJobId = null;
    }
  };

  return {
    async start(): Promise<void> {
      await ensureInitialized();
    },
    listConnectors(): AcquisitionConnectorCatalog {
      return connectorCatalog(
        akshareAdapter.isAvailable(),
        ccxtAdapter.isAvailable(),
      );
    },
    listAcquisitionCatalog(): DesktopMarketDataAcquisitionCatalog {
      return currentMarketCatalog();
    },
    async listAcquisitionMarketInstruments(input: {
      marketId: DesktopMarketDataAcquisitionMarketId;
      sourcePlanId: DesktopMarketDataAcquisitionSourcePlanId | null;
      query: string;
      cursor: string;
      refresh?: boolean;
    }): Promise<DesktopMarketDataAcquisitionInstrumentCatalog> {
      return listMarketInstruments(input);
    },
    async listAkshareAcquisitionInstruments(): Promise<DesktopAkshareAcquisitionInstrumentCatalog> {
      const result = await loadDynamicMarketCatalog({
        marketId: 'CN_A_SHARE',
        sourcePlanId: 'CN_A_SHARE_SMART',
        forceRefresh: false,
      });
      return {
        cachedAt: result.cachedAt,
        instruments: result.instruments.map((instrument) => {
          if (
            instrument.exchangeId !== 'SH' &&
            instrument.exchangeId !== 'SZ' &&
            instrument.exchangeId !== 'BJ'
          ) {
            throw new AcquisitionRuntimeError('ACQUISITION_INSTRUMENT_CATALOG_INVALID', {
              marketId: 'CN_A_SHARE',
            });
          }
          return {
            ...instrument,
            exchangeId: instrument.exchangeId,
            kind: instrument.symbol.startsWith('INDEX-') ? 'INDEX' : 'A_SHARE',
          };
        }),
      };
    },
    async listCcxtMarkets(
      exchangeId: 'binance' | 'okx',
      query: string,
    ): Promise<DesktopCcxtAcquisitionMarketCatalog> {
      const sourcePlanId =
        exchangeId === 'binance' ? 'CCXT_BINANCE_SMART' : 'CCXT_OKX_SMART';
      const result = await loadDynamicMarketCatalog({
        marketId: 'CRYPTO_SPOT',
        sourcePlanId,
        forceRefresh: false,
      });
      const normalizedQuery = query.trim().toUpperCase();
      return {
        exchangeId,
        cachedAt: result.cachedAt,
        markets: result.instruments
          .filter((instrument) =>
            !normalizedQuery ||
            instrument.symbol.includes(normalizedQuery) ||
            instrument.name.toUpperCase().includes(normalizedQuery),
          )
          .slice(0, 500)
          .map((instrument) => {
            const [base, quote] = instrument.symbol.split('/');
            return {
              symbol: instrument.symbol,
              base: base ?? instrument.symbol,
              quote: quote ?? '',
              active: true,
            };
          }),
      };
    },
    async createJob(input: unknown): Promise<AcquisitionJob> {
      await ensureInitialized();
      const request = normalizeRequest(input);
      if (activeJobId) {
        throw new AcquisitionRuntimeError('ACQUISITION_JOB_ACTIVE', {
          activeJobId,
        });
      }
      const adapter = resolveAdapter(request);
      if (!adapter.isAvailable()) {
        throw new AcquisitionRuntimeError('ACQUISITION_CONNECTOR_UNAVAILABLE', {
          connectorId: request.connectorId,
        });
      }
      const id = createId();
      activeJobId = id;
      try {
        await pruneJobs();
        const createdAt = now().toISOString();
        const job: AcquisitionJob = {
          id,
          status: 'QUEUED',
          connectorId: request.connectorId,
          request,
          progress: {
            stage: 'QUEUED',
            completedSymbols: 0,
            totalSymbols: request.symbols.length,
            retryAttempt: 0,
            retryAfterMs: 0,
          },
          staging: null,
          error: null,
          createdAt,
          updatedAt: createdAt,
        };
        jobs.set(id, job);
        abortControllers.set(id, new AbortController());
        queueMicrotask(() => {
          runningPromise = runJob(id).finally(() => {
            runningPromise = null;
          });
        });
        return cloneJob(job);
      } catch (error) {
        if (activeJobId === id) activeJobId = null;
        throw error;
      }
    },
    async createMarketJob(input: unknown): Promise<MarketAcquisitionJob> {
      await ensureInitialized();
      const request = normalizeMarketRequest(input);
      const catalog = currentMarketCatalog();
      const selectedMarket = resolveMarketAcquisitionMarket(
        catalog,
        request.marketId,
      );
      const selectedPlan = resolveMarketAcquisitionSourcePlan(
        selectedMarket,
        request.sourcePlanId,
      );
      if (!selectedPlan.available) {
        throw new AcquisitionRuntimeError('ACQUISITION_MARKET_UNAVAILABLE', {
          marketId: request.marketId,
          sourcePlanId: request.sourcePlanId,
        });
      }
      if (!selectedMarket.supportedTimeframes.includes(request.timeframe)) {
        throw new AcquisitionRuntimeError('ACQUISITION_TIMEFRAME_UNSUPPORTED', {
          marketId: request.marketId,
          timeframe: request.timeframe,
        });
      }
      if (
        (request.adjustment !== null &&
          !selectedMarket.adjustmentOptions.includes(request.adjustment)) ||
        (request.marketId === 'CN_A_SHARE' && request.adjustment === null)
      ) {
        throw new AcquisitionRuntimeError('ACQUISITION_SYMBOL_INVALID', {
          marketId: request.marketId,
          field: 'adjustment',
        });
      }
      if (
        request.marketId === 'CN_A_SHARE' &&
        request.symbols.some((symbol) => /^INDEX-[0-9]{6}$/u.test(symbol))
      ) {
        if (request.timeframe !== '1d') {
          throw new AcquisitionRuntimeError('ACQUISITION_TIMEFRAME_UNSUPPORTED', {
            marketId: request.marketId,
            timeframe: request.timeframe,
          });
        }
        if (request.adjustment !== 'none') {
          throw new AcquisitionRuntimeError('ACQUISITION_SYMBOL_INVALID', {
            marketId: request.marketId,
            field: 'adjustment',
          });
        }
      }
      if (activeJobId) {
        throw new AcquisitionRuntimeError('ACQUISITION_JOB_ACTIVE', {
          activeJobId,
        });
      }
      const id = createId();
      activeJobId = id;
      try {
        await pruneMarketJobs();
        const createdAt = now().toISOString();
        const job: MarketAcquisitionJob = {
          id,
          status: 'QUEUED',
          request,
          progress: {
            stage: 'QUEUED',
            completedSymbols: 0,
            totalSymbols: request.symbols.length,
            retryAttempt: 0,
            retryAfterMs: 0,
          },
          sourceResults: [],
          staging: null,
          error: null,
          createdAt,
          updatedAt: createdAt,
        };
        marketJobs.set(id, job);
        abortControllers.set(id, new AbortController());
        jobStore.upsert(serializeMarketJob(job));
        queueMicrotask(() => {
          runningPromise = runMarketJob(id).finally(() => {
            runningPromise = null;
          });
        });
        return cloneMarketJob(job);
      } catch (error) {
        if (activeJobId === id) activeJobId = null;
        throw error;
      }
    },
    getJob(jobId: string): AcquisitionJob {
      const job = jobs.get(jobId);
      if (!job) {
        throw new AcquisitionRuntimeError('ACQUISITION_JOB_NOT_FOUND', {
          jobId,
        });
      }
      return cloneJob(job);
    },
    cancelJob(jobId: string): AcquisitionJob {
      const job = jobs.get(jobId);
      if (!job) {
        throw new AcquisitionRuntimeError('ACQUISITION_JOB_NOT_FOUND', {
          jobId,
        });
      }
      if (job.status === 'QUEUED' || job.status === 'RUNNING') {
        updateJob(job, { status: 'CANCELED', staging: null, error: null });
        abortControllers.get(jobId)?.abort();
      }
      return cloneJob(job);
    },
    async discardJob(jobId: string): Promise<{ discarded: true }> {
      await ensureInitialized();
      const job = jobs.get(jobId);
      if (!job) {
        throw new AcquisitionRuntimeError('ACQUISITION_JOB_NOT_FOUND', {
          jobId,
        });
      }
      if (job.status === 'QUEUED' || job.status === 'RUNNING') {
        throw new AcquisitionRuntimeError('ACQUISITION_JOB_ACTIVE', {
          activeJobId: jobId,
        });
      }
      await discardAcquisitionStaging(stagingRoot, jobId);
      jobs.delete(jobId);
      return { discarded: true };
    },
    getMarketJob(jobId: string): MarketAcquisitionJob {
      const job = marketJobs.get(jobId);
      if (!job) {
        throw new AcquisitionRuntimeError('ACQUISITION_JOB_NOT_FOUND', {
          jobId,
        });
      }
      return cloneMarketJob(job);
    },
    listMarketJobs() {
      return listMarketJobSummaries({
        jobStore,
        limit: MAX_RETAINED_JOBS,
      });
    },
    cancelMarketJob(jobId: string): MarketAcquisitionJob {
      const job = marketJobs.get(jobId);
      if (!job) {
        throw new AcquisitionRuntimeError('ACQUISITION_JOB_NOT_FOUND', {
          jobId,
        });
      }
      if (job.status === 'QUEUED' || job.status === 'RUNNING') {
        updateMarketJob(job, {
          status: 'CANCELED',
          staging: null,
          error: null,
        });
        abortControllers.get(jobId)?.abort();
      }
      return cloneMarketJob(job);
    },
    async discardMarketJob(jobId: string): Promise<{ discarded: true }> {
      await ensureInitialized();
      const job = marketJobs.get(jobId);
      if (!job) {
        throw new AcquisitionRuntimeError('ACQUISITION_JOB_NOT_FOUND', {
          jobId,
        });
      }
      if (job.status === 'QUEUED' || job.status === 'RUNNING') {
        throw new AcquisitionRuntimeError('ACQUISITION_JOB_ACTIVE', {
          activeJobId: jobId,
        });
      }
      await discardAcquisitionStaging(stagingRoot, jobId);
      marketJobs.delete(jobId);
      jobStore.remove(jobId);
      return { discarded: true };
    },
    async stop(): Promise<void> {
      if (activeJobId) {
        abortControllers.get(activeJobId)?.abort();
      }
      await runningPromise?.catch(() => undefined);
    },
  };
};

export type MarketDataAcquisitionService = ReturnType<
  typeof createMarketDataAcquisitionService
>;
