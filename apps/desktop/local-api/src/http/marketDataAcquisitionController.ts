// SPDX-License-Identifier: GPL-3.0-only

import type { Request, Response } from 'express';

import {
  cancelMarketDataAcquisitionJob,
  discardMarketDataAcquisitionJob,
  getMarketDataAcquisitionJob,
  listAkshareAcquisitionInstruments,
  listCcxtAcquisitionMarkets,
  listMarketDataAcquisitionConnectors,
  startMarketDataAcquisitionJob,
} from '../application/market-data-acquisition/marketDataAcquisitionHandler.js';
import {
  ccxtAcquisitionMarketQuerySchema,
  marketDataAcquisitionJobCreateSchema,
} from './apiSchemas.js';
import { ok } from './response.js';
import { parseRouteId } from './routeParams.js';

export const listMarketDataAcquisitionConnectorsController = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await listMarketDataAcquisitionConnectors()));
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

export const getMarketDataAcquisitionJobController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await getMarketDataAcquisitionJob(parseRouteId(req.params.jobId))));
};

export const cancelMarketDataAcquisitionJobController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await cancelMarketDataAcquisitionJob(parseRouteId(req.params.jobId))));
};

export const discardMarketDataAcquisitionJobController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await discardMarketDataAcquisitionJob(parseRouteId(req.params.jobId))));
};
