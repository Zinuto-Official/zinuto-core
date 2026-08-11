// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs/promises';
import path from 'node:path';

import {
  desktopMarketDataAcquisitionJobCreateRequestSchema,
  type DesktopAkshareAcquisitionInstrumentCatalog,
  type DesktopCcxtAcquisitionMarketCatalog,
} from '@zinuto/shared/contracts-desktop/api';

import {
  createAkshareSidecarAdapter,
  type AkshareAcquisitionAdapter,
} from './akshareSidecarAdapter.js';
import { AKSHARE_INDEX_ACQUISITION_INSTRUMENTS } from './akshareIndexCatalog.js';
import { validateAcquisitionStagingWithImportPreview } from './acquisitionImportValidation.js';
import {
  discardAcquisitionStaging,
  normalizeAndValidateAcquisitionBars,
  prepareAcquisitionStaging,
} from './acquisitionStaging.js';
import { createCcxtAcquisitionAdapter } from './ccxtAcquisitionAdapter.js';
import {
  AcquisitionRuntimeError,
  type AcquisitionConnectorAdapter,
  type AcquisitionConnectorCatalog,
  type AcquisitionJob,
  type AcquisitionRequest,
  type CanonicalMarketBar,
  type CcxtAcquisitionAdapter,
} from './marketDataAcquisitionTypes.js';

const MAX_RETAINED_JOBS = 20;
const AKSHARE_INSTRUMENT_CACHE_TTL_MS = 15 * 60 * 1_000;

type AkshareAdapterDependency =
  | AcquisitionConnectorAdapter
  | AkshareAcquisitionAdapter;

type ServiceDependencies = {
  stagingRoot: string;
  createId: () => string;
  now: () => Date;
  akshareAdapter?: AkshareAdapterDependency;
  ccxtAdapter?: CcxtAcquisitionAdapter;
  validateStaging?: typeof validateAcquisitionStagingWithImportPreview;
};

const cloneJob = (job: AcquisitionJob): AcquisitionJob => structuredClone(job);

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
      version: 'aktools-0.0.91+akshare-1.18.64',
      market: 'A_SHARE',
      available: akshareAvailable,
      unavailabilityCode: akshareAvailable ? null : 'AKSHARE_RUNTIME_UNAVAILABLE',
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
            id: 'aktools',
            name: 'AKTools',
            url: 'https://github.com/akfamily/aktools',
            infoUrl: 'https://github.com/akfamily/aktools',
            version: '0.0.91',
            license: 'MIT',
          },
          {
            id: 'akshare',
            name: 'AKShare',
            url: 'https://github.com/akfamily/akshare',
            infoUrl: 'https://akshare.akfamily.xyz/introduction.html',
            version: '1.18.64',
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
      version: '4.5.71',
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
            version: '4.5.71',
            license: 'MIT',
          },
        ],
        upstreams: [
          {
            id: 'binance',
            upstreamName: 'Binance Spot public market data',
            termsUrl: 'https://www.binance.com/en/terms',
            docsUrl: 'https://developers.binance.com/en/docs/products/spot/rest-api',
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
  const parsed = desktopMarketDataAcquisitionJobCreateRequestSchema.parse(input);
  if (parsed.connectorId === 'ccxt') {
    return {
      ...parsed,
      symbols: parsed.symbols.map((symbol) => symbol.toUpperCase()),
    };
  }
  return parsed;
};

const sanitizeJobError = (error: unknown): AcquisitionJob['error'] => {
  if (error instanceof AcquisitionRuntimeError) {
    return { code: error.code, args: error.args };
  }
  return {
    code: 'ACQUISITION_FAILED',
    args: { runtimeErrorType: error instanceof Error ? error.name : typeof error },
  };
};

export const createMarketDataAcquisitionService = ({
  stagingRoot,
  createId,
  now,
  akshareAdapter = createAkshareSidecarAdapter(),
  ccxtAdapter = createCcxtAcquisitionAdapter(),
  validateStaging = validateAcquisitionStagingWithImportPreview,
}: ServiceDependencies) => {
  const jobs = new Map<string, AcquisitionJob>();
  const abortControllers = new Map<string, AbortController>();
  let activeJobId: string | null = null;
  let runningPromise: Promise<void> | null = null;
  let initialized = false;
  let akshareInstrumentCache: (DesktopAkshareAcquisitionInstrumentCatalog & {
    expiresAtMs: number;
  }) | null = null;
  let akshareInstrumentLoad: Promise<DesktopAkshareAcquisitionInstrumentCatalog> | null =
    null;

  const ensureInitialized = async (): Promise<void> => {
    if (initialized) return;
    await fs.rm(stagingRoot, { recursive: true, force: true });
    await fs.mkdir(stagingRoot, { recursive: true, mode: 0o700 });
    initialized = true;
  };

  const updateJob = (
    job: AcquisitionJob,
    update: Partial<AcquisitionJob>,
  ): void => {
    Object.assign(job, update, { updatedAt: now().toISOString() });
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

  const resolveAdapter = (request: AcquisitionRequest): AcquisitionConnectorAdapter =>
    request.connectorId === 'akshare' ? akshareAdapter : ccxtAdapter;

  const runJob = async (jobId: string): Promise<void> => {
    const job = jobs.get(jobId);
    const controller = abortControllers.get(jobId);
    if (!job || !controller || job.status === 'CANCELED') return;
    const adapter = resolveAdapter(job.request);
    const rowsBySymbol = new Map<string, CanonicalMarketBar[]>();
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
        rowsBySymbol.set(
          symbol,
          normalizeAndValidateAcquisitionBars({ request: job.request, rows }),
        );
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
      await discardAcquisitionStaging(stagingRoot, jobId).catch(() => undefined);
      if (
        controller.signal.aborted ||
        (error instanceof AcquisitionRuntimeError && error.code === 'ACQUISITION_CANCELED')
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
      return connectorCatalog(akshareAdapter.isAvailable(), ccxtAdapter.isAvailable());
    },
    async listAkshareAcquisitionInstruments(): Promise<DesktopAkshareAcquisitionInstrumentCatalog> {
      if (!akshareAdapter.isAvailable()) {
        throw new AcquisitionRuntimeError('ACQUISITION_CONNECTOR_UNAVAILABLE', {
          connectorId: 'akshare',
        });
      }
      if (!supportsAkshareInstrumentCatalog(akshareAdapter)) {
        throw new AcquisitionRuntimeError('AKSHARE_RUNTIME_UNAVAILABLE');
      }
      const currentTimeMs = now().getTime();
      if (
        akshareInstrumentCache &&
        currentTimeMs < akshareInstrumentCache.expiresAtMs
      ) {
        return {
          instruments: structuredClone(akshareInstrumentCache.instruments),
          cachedAt: akshareInstrumentCache.cachedAt,
        };
      }
      if (!akshareInstrumentLoad) {
        akshareInstrumentLoad = (async () => {
          const aShares = await akshareAdapter.listInstruments();
          const instruments = [
            ...aShares,
            ...AKSHARE_INDEX_ACQUISITION_INSTRUMENTS,
          ];
          const cachedAtDate = now();
          const cachedAt = cachedAtDate.toISOString();
          akshareInstrumentCache = {
            instruments,
            cachedAt,
            expiresAtMs:
              cachedAtDate.getTime() + AKSHARE_INSTRUMENT_CACHE_TTL_MS,
          };
          return { instruments: structuredClone(instruments), cachedAt };
        })().finally(() => {
          akshareInstrumentLoad = null;
        });
      }
      return structuredClone(await akshareInstrumentLoad);
    },
    async listCcxtMarkets(
      exchangeId: 'binance' | 'okx',
      query: string,
    ): Promise<DesktopCcxtAcquisitionMarketCatalog> {
      const result = await ccxtAdapter.listMarkets(exchangeId, query);
      return { exchangeId, ...result };
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
    getJob(jobId: string): AcquisitionJob {
      const job = jobs.get(jobId);
      if (!job) {
        throw new AcquisitionRuntimeError('ACQUISITION_JOB_NOT_FOUND', { jobId });
      }
      return cloneJob(job);
    },
    cancelJob(jobId: string): AcquisitionJob {
      const job = jobs.get(jobId);
      if (!job) {
        throw new AcquisitionRuntimeError('ACQUISITION_JOB_NOT_FOUND', { jobId });
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
        throw new AcquisitionRuntimeError('ACQUISITION_JOB_NOT_FOUND', { jobId });
      }
      if (job.status === 'QUEUED' || job.status === 'RUNNING') {
        throw new AcquisitionRuntimeError('ACQUISITION_JOB_ACTIVE', { activeJobId: jobId });
      }
      await discardAcquisitionStaging(stagingRoot, jobId);
      jobs.delete(jobId);
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
