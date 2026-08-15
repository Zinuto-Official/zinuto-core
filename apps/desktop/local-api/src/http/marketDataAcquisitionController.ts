// SPDX-License-Identifier: GPL-3.0-only

import type { Request, Response } from 'express';

import {
  cancelMarketDataAcquisitionJob,
  cancelMarketDataAcquisitionMarketJob,
  discardMarketDataAcquisitionJob,
  discardMarketDataAcquisitionMarketJob,
  getMarketDataAcquisitionJob,
  getMarketDataAcquisitionMarketJob,
  listAkshareAcquisitionInstruments,
  listCcxtAcquisitionMarkets,
  listMarketDataAcquisitionCatalog,
  listMarketDataAcquisitionConnectors,
  listMarketDataAcquisitionMarketInstruments,
  listMarketDataAcquisitionMarketJobs,
  startMarketDataAcquisitionJob,
  startMarketDataAcquisitionMarketJob,
} from '../application/market-data-acquisition/marketDataAcquisitionHandler.js';
import {
  ccxtAcquisitionMarketQuerySchema,
  marketAcquisitionInstrumentsQuerySchema,
  marketAcquisitionMarketParamsSchema,
  marketDataAcquisitionJobCreateSchema,
  marketDataAcquisitionMarketJobCreateSchema,
} from './apiSchemas.js';
import { ok } from './response.js';
import { parseRouteId } from './routeParams.js';

export const listMarketDataAcquisitionConnectorsController = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await listMarketDataAcquisitionConnectors()));
};

export const listMarketDataAcquisitionCatalogController = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await listMarketDataAcquisitionCatalog()));
};

export const listMarketDataAcquisitionMarketInstrumentsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const params = marketAcquisitionMarketParamsSchema.parse(req.params ?? {});
  const query = marketAcquisitionInstrumentsQuerySchema.parse(req.query ?? {});
  res.json(ok(await listMarketDataAcquisitionMarketInstruments({
    marketId: params.marketId,
    sourcePlanId: query.sourcePlanId ?? null,
    query: query.query,
    cursor: query.cursor,
    refresh: query.refresh,
  })));
};

export const listAkshareAcquisitionInstrumentsController = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await listAkshareAcquisitionInstruments()));
};

export const listCcxtAcquisitionMarketsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const query = ccxtAcquisitionMarketQuerySchema.parse(req.query ?? {});
  res.json(ok(await listCcxtAcquisitionMarkets(query.exchangeId, query.query)));
};

export const startMarketDataAcquisitionJobController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = marketDataAcquisitionJobCreateSchema.parse(req.body ?? {});
  res.json(ok(await startMarketDataAcquisitionJob(payload)));
};

export const startMarketDataAcquisitionMarketJobController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = marketDataAcquisitionMarketJobCreateSchema.parse(req.body ?? {});
  res.json(ok(await startMarketDataAcquisitionMarketJob(payload)));
};

export const getMarketDataAcquisitionJobController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await getMarketDataAcquisitionJob(parseRouteId(req.params.jobId))));
};

export const getMarketDataAcquisitionMarketJobController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await getMarketDataAcquisitionMarketJob(parseRouteId(req.params.jobId))));
};

export const listMarketDataAcquisitionMarketJobsController = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await listMarketDataAcquisitionMarketJobs()));
};

export const cancelMarketDataAcquisitionJobController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await cancelMarketDataAcquisitionJob(parseRouteId(req.params.jobId))));
};

export const cancelMarketDataAcquisitionMarketJobController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await cancelMarketDataAcquisitionMarketJob(parseRouteId(req.params.jobId))));
};

export const discardMarketDataAcquisitionJobController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await discardMarketDataAcquisitionJob(parseRouteId(req.params.jobId))));
};

export const discardMarketDataAcquisitionMarketJobController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await discardMarketDataAcquisitionMarketJob(parseRouteId(req.params.jobId))));
};
