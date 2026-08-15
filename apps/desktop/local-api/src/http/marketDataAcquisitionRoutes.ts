// SPDX-License-Identifier: GPL-3.0-only

import { Router } from 'express';

import {
  cancelMarketDataAcquisitionJobController,
  cancelMarketDataAcquisitionMarketJobController,
  discardMarketDataAcquisitionJobController,
  discardMarketDataAcquisitionMarketJobController,
  getMarketDataAcquisitionJobController,
  getMarketDataAcquisitionMarketJobController,
  listAkshareAcquisitionInstrumentsController,
  listCcxtAcquisitionMarketsController,
  listMarketDataAcquisitionCatalogController,
  listMarketDataAcquisitionConnectorsController,
  listMarketDataAcquisitionMarketInstrumentsController,
  listMarketDataAcquisitionMarketJobsController,
  startMarketDataAcquisitionJobController,
  startMarketDataAcquisitionMarketJobController,
} from './marketDataAcquisitionController.js';

export const marketDataAcquisitionRouter = Router();

marketDataAcquisitionRouter.get(
  '/data-sources/acquisition-connectors',
  listMarketDataAcquisitionConnectorsController,
);
marketDataAcquisitionRouter.get(
  '/data-sources/acquisition-catalog',
  listMarketDataAcquisitionCatalogController,
);
marketDataAcquisitionRouter.get(
  '/data-sources/acquisition-markets/:marketId/instruments',
  listMarketDataAcquisitionMarketInstrumentsController,
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
marketDataAcquisitionRouter.post(
  '/data-sources/acquisition-market-jobs',
  startMarketDataAcquisitionMarketJobController,
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
marketDataAcquisitionRouter.get(
  '/data-sources/acquisition-market-jobs',
  listMarketDataAcquisitionMarketJobsController,
);
marketDataAcquisitionRouter.get(
  '/data-sources/acquisition-market-jobs/:jobId',
  getMarketDataAcquisitionMarketJobController,
);
marketDataAcquisitionRouter.post(
  '/data-sources/acquisition-market-jobs/:jobId/cancel',
  cancelMarketDataAcquisitionMarketJobController,
);
marketDataAcquisitionRouter.delete(
  '/data-sources/acquisition-market-jobs/:jobId',
  discardMarketDataAcquisitionMarketJobController,
);
