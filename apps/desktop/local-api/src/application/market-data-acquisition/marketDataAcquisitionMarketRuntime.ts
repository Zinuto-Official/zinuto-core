// SPDX-License-Identifier: GPL-3.0-only

import path from 'node:path';

import type {
  DesktopMarketDataAcquisitionCatalog,
  DesktopMarketDataAcquisitionSourceAttempt,
} from '@zinuto/shared/contracts-desktop/api';

import type { AkshareAcquisitionAdapter } from './akshareSidecarAdapter.js';
import { validateMarketAcquisitionStagingWithImportPreview } from './acquisitionImportValidation.js';
import {
  discardAcquisitionStaging,
  normalizeAndValidateMarketAcquisitionBars,
  prepareMarketAcquisitionStaging,
} from './acquisitionStaging.js';
import {
  AKSHARE_VERSION,
  CCXT_VERSION,
  FINANCE_DATA_READER_VERSION,
} from './marketDataConnectorVersions.generated.js';
import {
  isFinanceDataReaderCryptoSymbol,
  resolveMarketAcquisitionMarket,
  resolveMarketAcquisitionSourcePlan,
} from './marketAcquisitionCatalog.js';
import {
  AcquisitionRuntimeError,
  type AcquisitionConnectorAdapter,
  type AcquisitionFetchInput,
  type AcquisitionJob,
  type CanonicalMarketBar,
  type CcxtAcquisitionAdapter,
  type FinanceDataReaderAcquisitionAdapter,
  type MarketAcquisitionJob,
} from './marketDataAcquisitionTypes.js';

type AkshareAdapterDependency =
  | AcquisitionConnectorAdapter
  | AkshareAcquisitionAdapter;

type MarketRuntimeDependencies = {
  stagingRoot: string;
  marketJobs: Map<string, MarketAcquisitionJob>;
  abortControllers: Map<string, AbortController>;
  currentMarketCatalog: () => DesktopMarketDataAcquisitionCatalog;
  updateMarketJob: (
    job: MarketAcquisitionJob,
    update: Partial<MarketAcquisitionJob>,
  ) => void;
  clearActiveJob: (jobId: string) => void;
  akshareAdapter: AkshareAdapterDependency;
  ccxtAdapter: CcxtAcquisitionAdapter;
  financeDataReaderAdapter: FinanceDataReaderAcquisitionAdapter;
  validateMarketStaging: typeof validateMarketAcquisitionStagingWithImportPreview;
  sanitizeJobError: (error: unknown) => AcquisitionJob['error'];
};

const sourceAttempt = ({
  providerId,
  providerVersion,
  upstreamId,
  status,
  errorCode,
}: DesktopMarketDataAcquisitionSourceAttempt): DesktopMarketDataAcquisitionSourceAttempt => ({
  providerId,
  providerVersion,
  upstreamId,
  status,
  errorCode,
});

const sourceFailure = (
  providerId: DesktopMarketDataAcquisitionSourceAttempt['providerId'],
  providerVersion: string,
  upstreamId: string,
  error: unknown,
): DesktopMarketDataAcquisitionSourceAttempt =>
  sourceAttempt({
    providerId,
    providerVersion,
    upstreamId,
    status: 'FAILED',
    errorCode: error instanceof AcquisitionRuntimeError
      ? error.code
      : 'ACQUISITION_FAILED',
  });

const sourceSuccess = (
  providerId: DesktopMarketDataAcquisitionSourceAttempt['providerId'],
  providerVersion: string,
  upstreamId: string,
): DesktopMarketDataAcquisitionSourceAttempt =>
  sourceAttempt({
    providerId,
    providerVersion,
    upstreamId,
    status: 'SUCCEEDED',
    errorCode: null,
  });

const sourceSkipped = (
  providerId: DesktopMarketDataAcquisitionSourceAttempt['providerId'],
  providerVersion: string,
  upstreamId: string,
  errorCode: string,
): DesktopMarketDataAcquisitionSourceAttempt =>
  sourceAttempt({
    providerId,
    providerVersion,
    upstreamId,
    status: 'SKIPPED',
    errorCode,
  });

export const createMarketAcquisitionJobRunner = ({
  stagingRoot,
  marketJobs,
  abortControllers,
  currentMarketCatalog,
  updateMarketJob,
  clearActiveJob,
  akshareAdapter,
  ccxtAdapter,
  financeDataReaderAdapter,
  validateMarketStaging,
  sanitizeJobError,
}: MarketRuntimeDependencies) => async (jobId: string): Promise<void> => {
  const job = marketJobs.get(jobId);
  const controller = abortControllers.get(jobId);
  if (!job || !controller || job.status === 'CANCELED') return;
  const catalog = currentMarketCatalog();
  const selectedMarket = resolveMarketAcquisitionMarket(catalog, job.request.marketId);
  const selectedPlan = resolveMarketAcquisitionSourcePlan(
    selectedMarket,
    job.request.sourcePlanId,
  );
  const rowsBySymbol = new Map<string, CanonicalMarketBar[]>();
  const sourceResults: MarketAcquisitionJob['sourceResults'] = [];
  let mergedDuplicates = 0;

  const fetchFdr = async (
    symbol: string,
    attempts: DesktopMarketDataAcquisitionSourceAttempt[],
  ): Promise<{ rows: CanonicalMarketBar[]; mergedDuplicates: number } | null> => {
    if (!financeDataReaderAdapter.isAvailable()) {
      attempts.push(sourceSkipped(
        'financedatareader',
        FINANCE_DATA_READER_VERSION,
        'finance-datareader-dispatch',
        'FINANCEDATAREADER_RUNTIME_UNAVAILABLE',
      ));
      return null;
    }
    try {
      const result = await financeDataReaderAdapter.fetchSymbol({
        jobId,
        marketId: job.request.marketId,
        sourcePlanId: job.request.sourcePlanId,
        symbol,
        sourceSymbol: symbol,
        timeframe: '1d',
        startAt: job.request.startAt,
        endAt: job.request.endAt,
        signal: controller.signal,
      });
      const normalized = normalizeAndValidateMarketAcquisitionBars({
        request: job.request,
        timeZone: selectedMarket.timeZone,
        rows: result.rows,
      });
      attempts.push(sourceSuccess(
        'financedatareader',
        FINANCE_DATA_READER_VERSION,
        result.upstreamId,
      ));
      return normalized;
    } catch (error) {
      attempts.push(sourceFailure(
        'financedatareader',
        FINANCE_DATA_READER_VERSION,
        'finance-datareader-dispatch',
        error,
      ));
      throw error;
    }
  };

  const resolveSymbol = async (symbol: string): Promise<{
    rows: CanonicalMarketBar[] | null;
    mergedDuplicates: number;
    sourceResult: MarketAcquisitionJob['sourceResults'][number];
    error: unknown | null;
  }> => {
    const attempts: DesktopMarketDataAcquisitionSourceAttempt[] = [];
    const failed = (error: unknown) => ({
      rows: null,
      mergedDuplicates: 0,
      sourceResult: {
        symbol,
        sourceSymbol: symbol,
        finalSource: null,
        attempts,
      },
      error,
    });
    const succeeded = (rows: CanonicalMarketBar[], merged: number) => ({
      rows,
      mergedDuplicates: merged,
      sourceResult: {
        symbol,
        sourceSymbol: symbol,
        finalSource: attempts.at(-1) ?? null,
        attempts,
      },
      error: null,
    });

    if (selectedPlan.id === 'CN_A_SHARE_SMART') {
      const adjustment = job.request.adjustment;
      const isIndex = /^INDEX-[0-9]{6}$/u.test(symbol);
      if (adjustment !== 'none' && adjustment !== 'qfq' && adjustment !== 'hfq') {
        return failed(new AcquisitionRuntimeError('ACQUISITION_SYMBOL_INVALID', {
          marketId: job.request.marketId,
        }));
      }
      if (isIndex && (job.request.timeframe !== '1d' || adjustment !== 'none')) {
        return failed(new AcquisitionRuntimeError('ACQUISITION_TIMEFRAME_UNSUPPORTED', {
          marketId: job.request.marketId,
          symbol,
        }));
      }
      const dataset = isIndex
        ? 'index_zh_a_hist'
        : job.request.timeframe === '1d'
          ? 'stock_zh_a_hist'
          : 'stock_zh_a_hist_min_em';
      try {
        if (!akshareAdapter.isAvailable()) {
          throw new AcquisitionRuntimeError('AKSHARE_RUNTIME_UNAVAILABLE');
        }
        const akshareInput: AcquisitionFetchInput = {
          jobId,
          request: {
            connectorId: 'akshare',
            dataset,
            symbols: [symbol],
            timeframe: job.request.timeframe,
            startAt: job.request.startAt,
            endAt: job.request.endAt,
            adjustment,
          },
          symbol,
          signal: controller.signal,
          onRetryWait: ({ attempt, retryAfterMs }) => {
            updateMarketJob(job, {
              progress: {
                ...job.progress,
                stage: 'RETRY_WAIT',
                retryAttempt: attempt,
                retryAfterMs,
              },
            });
          },
          onRetryResume: () => {
            updateMarketJob(job, {
              progress: {
                ...job.progress,
                stage: 'DOWNLOADING',
                retryAfterMs: 0,
              },
            });
          },
        };
        const akshareResult =
          'fetchSymbolWithProvenance' in akshareAdapter &&
          typeof akshareAdapter.fetchSymbolWithProvenance === 'function'
            ? await akshareAdapter.fetchSymbolWithProvenance(akshareInput)
            : {
                rows: await akshareAdapter.fetchSymbol(akshareInput),
                upstreamId: 'eastmoney' as const,
              };
        const normalizedRows = normalizeAndValidateMarketAcquisitionBars({
          request: job.request,
          timeZone: selectedMarket.timeZone,
          rows: akshareResult.rows,
        });
        attempts.push(sourceSuccess(
          'akshare',
          `akshare-${AKSHARE_VERSION}`,
          akshareResult.upstreamId,
        ));
        return succeeded(normalizedRows.rows, normalizedRows.mergedDuplicates);
      } catch (akshareError) {
        attempts.push(sourceFailure(
          'akshare',
          `akshare-${AKSHARE_VERSION}`,
          'eastmoney',
          akshareError,
        ));
        // The FDR retry is deliberately scoped to an entire, unadjusted
        // daily symbol. Minute/hour and adjusted requests retain their
        // original failure rather than silently changing semantics.
        if (isIndex || job.request.timeframe !== '1d' || adjustment !== 'none') {
          return failed(akshareError);
        }
        try {
          const fetched = await fetchFdr(symbol, attempts);
          if (!fetched) return failed(akshareError);
          return succeeded(fetched.rows, fetched.mergedDuplicates);
        } catch (fdrError) {
          return failed(new AcquisitionRuntimeError('ACQUISITION_FALLBACK_EXHAUSTED', {
            marketId: job.request.marketId,
            symbol,
            primaryErrorCode: akshareError instanceof AcquisitionRuntimeError
              ? akshareError.code
              : 'ACQUISITION_FAILED',
            fallbackErrorCode: fdrError instanceof AcquisitionRuntimeError
              ? fdrError.code
              : 'ACQUISITION_FAILED',
          }));
        }
      }
    }

    if (
      selectedPlan.id === 'CCXT_BINANCE_SMART' ||
      selectedPlan.id === 'CCXT_OKX_SMART'
    ) {
      const exchangeId = selectedPlan.id === 'CCXT_BINANCE_SMART' ? 'binance' : 'okx';
      try {
        if (!ccxtAdapter.isAvailable()) {
          throw new AcquisitionRuntimeError('ACQUISITION_CONNECTOR_UNAVAILABLE', {
            connectorId: 'ccxt',
          });
        }
        const rows = await ccxtAdapter.fetchSymbol({
          jobId,
          request: {
            connectorId: 'ccxt',
            exchangeId,
            marketType: 'spot',
            symbols: [symbol],
            timeframe: job.request.timeframe,
            startAt: job.request.startAt,
            endAt: job.request.endAt,
          },
          symbol,
          signal: controller.signal,
        });
        const normalizedRows = normalizeAndValidateMarketAcquisitionBars({
          request: job.request,
          timeZone: selectedMarket.timeZone,
          rows,
        });
        attempts.push(sourceSuccess('ccxt', CCXT_VERSION, exchangeId));
        return succeeded(normalizedRows.rows, normalizedRows.mergedDuplicates);
      } catch (ccxtError) {
        attempts.push(sourceFailure('ccxt', CCXT_VERSION, exchangeId, ccxtError));
        if (job.request.timeframe !== '1d' || !isFinanceDataReaderCryptoSymbol(symbol)) {
          if (job.request.timeframe === '1d') {
            attempts.push(sourceSkipped(
              'financedatareader',
              FINANCE_DATA_READER_VERSION,
              'finance-datareader-dispatch',
              'FINANCEDATAREADER_SYMBOL_UNAVAILABLE',
            ));
          }
          return failed(ccxtError);
        }
        try {
          const fetched = await fetchFdr(symbol, attempts);
          if (!fetched) return failed(ccxtError);
          return succeeded(fetched.rows, fetched.mergedDuplicates);
        } catch (fdrError) {
          return failed(new AcquisitionRuntimeError('ACQUISITION_FALLBACK_EXHAUSTED', {
            marketId: job.request.marketId,
            symbol,
            primaryErrorCode: ccxtError instanceof AcquisitionRuntimeError
              ? ccxtError.code
              : 'ACQUISITION_FAILED',
            fallbackErrorCode: fdrError instanceof AcquisitionRuntimeError
              ? fdrError.code
              : 'ACQUISITION_FAILED',
          }));
        }
      }
    }

    try {
      const fetched = await fetchFdr(symbol, attempts);
      if (!fetched) {
        return failed(new AcquisitionRuntimeError('FINANCEDATAREADER_RUNTIME_UNAVAILABLE'));
      }
      return succeeded(fetched.rows, fetched.mergedDuplicates);
    } catch (error) {
      return failed(error);
    }
  };

  try {
    updateMarketJob(job, {
      status: 'RUNNING',
      progress: { ...job.progress, stage: 'CONNECTING' },
    });
    for (const symbol of job.request.symbols) {
      updateMarketJob(job, {
        progress: { ...job.progress, stage: 'DOWNLOADING' },
      });
      const resolved = await resolveSymbol(symbol);
      sourceResults.push(resolved.sourceResult);
      updateMarketJob(job, { sourceResults: structuredClone(sourceResults) });
      if (resolved.error || !resolved.rows) {
        const error = resolved.error ?? new AcquisitionRuntimeError('ACQUISITION_NO_DATA');
        if (error instanceof AcquisitionRuntimeError) {
          throw new AcquisitionRuntimeError(error.code, { ...error.args, symbol });
        }
        throw error;
      }
      rowsBySymbol.set(symbol, resolved.rows);
      mergedDuplicates += resolved.mergedDuplicates;
      updateMarketJob(job, {
        progress: {
          ...job.progress,
          stage: 'DOWNLOADING',
          completedSymbols: job.progress.completedSymbols + 1,
        },
      });
    }
    updateMarketJob(job, {
      progress: { ...job.progress, stage: 'VALIDATING' },
    });
    const staging = await prepareMarketAcquisitionStaging({
      stagingRoot,
      jobId,
      request: job.request,
      createdAt: job.createdAt,
      timeZone: selectedMarket.timeZone,
      rowsBySymbol,
      sourceResults,
      mergedDuplicateBars: mergedDuplicates,
    });
    await validateMarketStaging({
      payloadRoot: path.join(stagingRoot, jobId, 'payload'),
      outputFolderName: staging.outputFolderName,
      request: job.request,
      timeZone: selectedMarket.timeZone,
      sourceResults,
      jobId,
    });
    if (controller.signal.aborted) {
      await discardAcquisitionStaging(stagingRoot, jobId);
      updateMarketJob(job, { status: 'CANCELED', staging: null });
      return;
    }
    updateMarketJob(job, {
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
      updateMarketJob(job, { status: 'CANCELED', staging: null, error: null });
    } else {
      updateMarketJob(job, {
        status: 'FAILED',
        staging: null,
        error: sanitizeJobError(error),
      });
    }
  } finally {
    await Promise.all([
      akshareAdapter.finishJob?.(jobId),
      ccxtAdapter.finishJob?.(jobId),
    ].map((operation) => operation?.catch(() => undefined))).catch(() => undefined);
    abortControllers.delete(jobId);
    clearActiveJob(jobId);
  }
};
