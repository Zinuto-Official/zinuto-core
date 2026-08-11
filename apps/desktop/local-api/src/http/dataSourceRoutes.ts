// SPDX-License-Identifier: GPL-3.0-only

import { Router } from 'express';
import {
  clearLocalDataSourcesAndMarketDataController,
  controlLocalDataImportJobController,
  discardLocalDataImportPreviewController,
  getDataSourceMaintenanceAvailabilityController,
  getLocalDataImportJobController,
  getLocalDataImportPreviewJobController,
  getLocalDataSourceDiagnosticsController,
  getLocalDataSourceSymbolDiagnosticsController,
  listLocalDataSourcesController,
  previewLocalDataSourceSyncController,
  quickCheckLocalDataSourceSyncController,
  removeLocalDataSourceController,
  removeSymbolsFromLocalDataSourceController,
  startLocalDataFullReimportFromPathsController,
  startLocalDataImportFromPathsController,
  startLocalDataImportPreviewController,
  startLocalDataIncrementalUpdateFromPathsController,
  updateLocalDataSourceDiagnosticProfileController,
  updateLocalDataSourceTradingCalendarController,
  validateLocalDataImportDraftController,
} from './dataSourceController.js';

export const dataSourceRouter = Router();

dataSourceRouter.post('/data-sources/import/from-paths', startLocalDataImportFromPathsController);
dataSourceRouter.post('/data-sources/:sourceId/full-reimport/from-paths', startLocalDataFullReimportFromPathsController);
dataSourceRouter.post('/data-sources/:sourceId/incremental-update/from-paths', startLocalDataIncrementalUpdateFromPathsController);
dataSourceRouter.post('/data-sources/import/preview/from-path', startLocalDataImportPreviewController);
dataSourceRouter.get('/data-sources/import/preview-jobs/:jobId', getLocalDataImportPreviewJobController);
dataSourceRouter.post('/data-sources/import/preview/discard', discardLocalDataImportPreviewController);
dataSourceRouter.post('/data-sources/import/preview/validate', validateLocalDataImportDraftController);
dataSourceRouter.post('/data-sources/:sourceId/sync-preview/from-paths', previewLocalDataSourceSyncController);
dataSourceRouter.post('/data-sources/:sourceId/sync-quick-check/from-metadata', quickCheckLocalDataSourceSyncController);
dataSourceRouter.get('/data-sources/import-jobs/:jobId', getLocalDataImportJobController);
dataSourceRouter.post('/data-sources/import-jobs/:jobId/control', controlLocalDataImportJobController);
dataSourceRouter.get('/data-sources', listLocalDataSourcesController);
dataSourceRouter.get('/data-sources/maintenance-availability', getDataSourceMaintenanceAvailabilityController);
dataSourceRouter.get('/data-sources/:sourceId/diagnostics', getLocalDataSourceDiagnosticsController);
dataSourceRouter.put('/data-sources/:sourceId/diagnostic-profile', updateLocalDataSourceDiagnosticProfileController);
dataSourceRouter.put('/data-sources/:sourceId/trading-calendar', updateLocalDataSourceTradingCalendarController);
dataSourceRouter.get('/data-sources/:sourceId/symbols/:symbol/diagnostics', getLocalDataSourceSymbolDiagnosticsController);
dataSourceRouter.delete('/data-sources/:sourceId', removeLocalDataSourceController);
dataSourceRouter.post('/data-sources/:sourceId/symbols/remove', removeSymbolsFromLocalDataSourceController);
dataSourceRouter.post('/data-sources/clear-all', clearLocalDataSourcesAndMarketDataController);
