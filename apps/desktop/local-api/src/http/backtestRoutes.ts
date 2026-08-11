// SPDX-License-Identifier: GPL-3.0-only

import { Router } from 'express';
import {
  cancelBacktestBatchController,
  clearBacktestBatchesController,
  createBacktestBatchController,
  deleteBacktestBatchController,
  getBacktestBatchController,
  getBacktestProgressController,
  getBacktestResultDetailController,
  getBacktestResultsController,
  listBacktestBatchesController,
  runBacktestBatchController,
} from './backtestController.js';

export const backtestRouter = Router();

backtestRouter.post('/backtest/batches', createBacktestBatchController);
backtestRouter.get('/backtest/batches', listBacktestBatchesController);
backtestRouter.delete('/backtest/batches', clearBacktestBatchesController);
backtestRouter.get('/backtest/batches/:id', getBacktestBatchController);
backtestRouter.delete('/backtest/batches/:id', deleteBacktestBatchController);
backtestRouter.post('/backtest/batches/:id/run', runBacktestBatchController);
backtestRouter.post('/backtest/batches/:id/cancel', cancelBacktestBatchController);
backtestRouter.get('/backtest/batches/:id/progress', getBacktestProgressController);
backtestRouter.get('/backtest/batches/:id/results', getBacktestResultsController);
backtestRouter.get('/backtest/batches/:id/results/:symbol/trades', getBacktestResultDetailController);
