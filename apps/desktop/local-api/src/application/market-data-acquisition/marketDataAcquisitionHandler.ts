// SPDX-License-Identifier: GPL-3.0-only

import path from 'node:path';

import { dynamicAppError } from '../../kernel/appError.js';
import {
  AcquisitionRuntimeError,
  type AcquisitionRequest,
} from './marketDataAcquisitionTypes.js';
import {
  createMarketDataAcquisitionService,
  type MarketDataAcquisitionService,
} from './marketDataAcquisitionService.js';

let servicePromise: Promise<MarketDataAcquisitionService> | null = null;

const resolveService = async (): Promise<MarketDataAcquisitionService> => {
  if (!servicePromise) {
    servicePromise = (async () => {
      const [{ STORAGE_LAYOUT }, { resolveBackendAppContext }] = await Promise.all([
        import('../ports/infrastructure/db/database.js'),
        import('../ports/runtime/compositionRoot.js'),
      ]);
      const context = resolveBackendAppContext();
      return createMarketDataAcquisitionService({
        stagingRoot: path.join(
          STORAGE_LAYOUT.tempDir,
          'market-data-acquisition',
        ),
        createId: context.ports.idGenerator.createId,
        now: context.ports.clock.now,
      });
    })();
  }
  return servicePromise;
};

const appErrorStatus = (code: string): number => {
  if (code === 'ACQUISITION_JOB_NOT_FOUND') return 404;
  if (code === 'ACQUISITION_JOB_ACTIVE') return 409;
  if (code === 'ACQUISITION_CONNECTOR_UNAVAILABLE') return 503;
  if (code.endsWith('_UPSTREAM_FAILED')) return 502;
  return 400;
};

const translateRuntimeError = (error: unknown): never => {
  if (error instanceof AcquisitionRuntimeError) {
    throw dynamicAppError(error.code, error.args, appErrorStatus(error.code));
  }
  throw error;
};

export const listMarketDataAcquisitionConnectors = async () =>
  (await resolveService()).listConnectors();

export const listAkshareAcquisitionInstruments = async () => {
  try {
    return await (await resolveService()).listAkshareAcquisitionInstruments();
  } catch (error) {
    return translateRuntimeError(error);
  }
};

export const listCcxtAcquisitionMarkets = async (
  exchangeId: 'binance' | 'okx',
  query: string,
) => {
  try {
    return await (await resolveService()).listCcxtMarkets(exchangeId, query);
  } catch (error) {
    return translateRuntimeError(error);
  }
};

export const startMarketDataAcquisitionJob = async (request: AcquisitionRequest) => {
  try {
    return await (await resolveService()).createJob(request);
  } catch (error) {
    return translateRuntimeError(error);
  }
};

export const getMarketDataAcquisitionJob = async (jobId: string) => {
  try {
    return (await resolveService()).getJob(jobId);
  } catch (error) {
    return translateRuntimeError(error);
  }
};

export const cancelMarketDataAcquisitionJob = async (jobId: string) => {
  try {
    return (await resolveService()).cancelJob(jobId);
  } catch (error) {
    return translateRuntimeError(error);
  }
};

export const discardMarketDataAcquisitionJob = async (jobId: string) => {
  try {
    return await (await resolveService()).discardJob(jobId);
  } catch (error) {
    return translateRuntimeError(error);
  }
};

export const startMarketDataAcquisitionRuntime = async (): Promise<void> => {
  await (await resolveService()).start();
};

export const stopMarketDataAcquisitionRuntime = async (): Promise<void> => {
  if (!servicePromise) return;
  await (await servicePromise).stop();
};
