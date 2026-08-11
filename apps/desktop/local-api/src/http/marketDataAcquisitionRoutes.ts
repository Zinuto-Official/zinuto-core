// SPDX-License-Identifier: GPL-3.0-only

import { Router } from 'express';

import {
  cancelMarketDataAcquisitionJobController,
  discardMarketDataAcquisitionJobController,
  getMarketDataAcquisitionJobController,
  listAkshareAcquisitionInstrumentsController,
  listCcxtAcquisitionMarketsController,
  listMarketDataAcquisitionConnectorsController,
  startMarketDataAcquisitionJobController,
} from './marketDataAcquisitionController.js';

export const marketDataAcquisitionRouter = Router();

marketDataAcquisitionRouter.get(
  '/data-sources/acquisition-connectors',
  listMarketDataAcquisitionConnectorsController,
);
marketDataAcquisitionRouter.get(
  '/data-sources/acquisition-connectors/akshare/instruments',
  listAkshareAcquisitionInstrumentsController,
);
marketDataAcquisitionRouter.get(
  '/data-sources/acquisition-connectors/ccxt/markets',
  listCcxtAcquisitionMarketsController,
);
marketDataAcquisitionRouter.post(
  '/data-sources/acquisition-jobs',
  startMarketDataAcquisitionJobController,
);
marketDataAcquisitionRouter.get(
  '/data-sources/acquisition-jobs/:jobId',
  getMarketDataAcquisitionJobController,
);
marketDataAcquisitionRouter.post(
  '/data-sources/acquisition-jobs/:jobId/cancel',
  cancelMarketDataAcquisitionJobController,
);
marketDataAcquisitionRouter.delete(
  '/data-sources/acquisition-jobs/:jobId',
  discardMarketDataAcquisitionJobController,
);
