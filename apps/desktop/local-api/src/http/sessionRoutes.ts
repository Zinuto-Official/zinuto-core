// SPDX-License-Identifier: GPL-3.0-only

import { Router } from 'express';
import {
  cleanupStaleSessionsController,
  createSessionBootstrapController,
  createSessionController,
  executeSessionActionController,
  getBarsFrameController,
  getBarsRangeController,
  getLatestResumableSessionController,
  getPortfolioSummaryController,
  getSessionBootstrapController,
  getSessionOrderQuoteController,
  getSessionOrderEstimationReadModelController,
  getSessionSnapshotController,
  getTradingSettingsController,
  listInstrumentsController,
  setSessionPlaybackController,
  setTradingSettingsController,
  updateSessionTradingSettingsController,
} from './sessionController.js';

export const sessionRouter = Router();

sessionRouter.get('/market/instruments', listInstrumentsController);
sessionRouter.get('/market/instruments/:instrumentId/bars/range', getBarsRangeController);
sessionRouter.get('/market/instruments/:instrumentId/bars/frame', getBarsFrameController);
sessionRouter.get('/training/free-replay/settings/trading', getTradingSettingsController);
sessionRouter.put('/training/free-replay/settings/trading', setTradingSettingsController);
sessionRouter.get('/training/free-replay/portfolio/summary', getPortfolioSummaryController);
sessionRouter.post('/training/free-replay/sessions', createSessionController);
sessionRouter.post('/training/free-replay/sessions/bootstrap', createSessionBootstrapController);
sessionRouter.post('/training/free-replay/sessions/cleanup-stale', cleanupStaleSessionsController);
sessionRouter.get('/training/free-replay/sessions/resumable/latest', getLatestResumableSessionController);
sessionRouter.get('/training/free-replay/sessions/:id/bootstrap', getSessionBootstrapController);
sessionRouter.get('/training/free-replay/sessions/:id/snapshot', getSessionSnapshotController);
sessionRouter.put('/training/free-replay/sessions/:id/trading-settings', updateSessionTradingSettingsController);
sessionRouter.post('/training/free-replay/sessions/:id/actions', executeSessionActionController);
sessionRouter.post('/training/free-replay/sessions/:id/playback', setSessionPlaybackController);
sessionRouter.post('/training/free-replay/sessions/:id/order/quote', getSessionOrderQuoteController);
sessionRouter.post('/training/free-replay/sessions/:id/order/estimation-read-model', getSessionOrderEstimationReadModelController);
