// SPDX-License-Identifier: GPL-3.0-only

import type { Request, Response } from 'express';
import {
  cancelBacktestBatch,
  clearBacktestBatches,
  createBacktestBatch,
  deleteBacktestBatch,
  getBacktestBatch,
  getBacktestProgress,
  getBacktestResultDetail,
  getBacktestResults,
  listBacktestBatches,
  queueBacktestBatchRun,
} from '../application/backtest/backtestService.js';
import { createBacktestBatchSchema, runBacktestBatchSchema } from './apiSchemas.js';
import { ok } from './response.js';
import { parseRouteId, parseRouteSymbol } from './routeParams.js';

export const createBacktestBatchController = (req: Request, res: Response): void => {
  const payload = createBacktestBatchSchema.parse(req.body ?? {});
  res.json(ok(createBacktestBatch(payload)));
};

export const listBacktestBatchesController = (_req: Request, res: Response): void => {
  res.json(ok(listBacktestBatches()));
};

export const clearBacktestBatchesController = (_req: Request, res: Response): void => {
  res.json(ok(clearBacktestBatches()));
};

export const getBacktestBatchController = (req: Request, res: Response): void => {
  const batchId = parseRouteId(req.params.id);
  res.json(ok(getBacktestBatch(batchId)));
};

export const deleteBacktestBatchController = (req: Request, res: Response): void => {
  const batchId = parseRouteId(req.params.id);
  res.json(ok(deleteBacktestBatch(batchId)));
};

export const runBacktestBatchController = (req: Request, res: Response): void => {
  const batchId = parseRouteId(req.params.id);
  const payload = runBacktestBatchSchema.parse(req.body ?? {});
  res.json(ok(queueBacktestBatchRun(batchId, payload)));
};

export const cancelBacktestBatchController = (req: Request, res: Response): void => {
  const batchId = parseRouteId(req.params.id);
  res.json(ok(cancelBacktestBatch(batchId)));
};

export const getBacktestProgressController = (req: Request, res: Response): void => {
  const batchId = parseRouteId(req.params.id);
  res.json(ok(getBacktestProgress(batchId)));
};

export const getBacktestResultsController = (req: Request, res: Response): void => {
  const batchId = parseRouteId(req.params.id);
  res.json(ok(getBacktestResults(batchId)));
};

export const getBacktestResultDetailController = async (req: Request, res: Response): Promise<void> => {
  const batchId = parseRouteId(req.params.id);
  const symbol = parseRouteSymbol(req.params.symbol);
  res.json(ok(await getBacktestResultDetail(batchId, symbol)));
};
