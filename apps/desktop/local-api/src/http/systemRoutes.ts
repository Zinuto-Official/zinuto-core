// SPDX-License-Identifier: GPL-3.0-only

import { Router } from 'express';
import {
  cancelSystemDevSimulationJobController,
  cleanupSystemDevSimulationDataController,
  executePortableExportController,
  executePortableImportController,
  exportLocalImportMockSampleController,
  getAppPreferencesController,
  getDesktopLegalDocumentController,
  getHistoryRetentionJobController,
  getHistoryRetentionPolicyController,
  getLatestHistoryRetentionJobController,
  getLatestSystemDevSimulationCleanupJobController,
  getLatestSystemDevSimulationJobController,
  getResetAllStoredDataJobController,
  getSystemDevSimulationCapabilitiesController,
  getSystemDevSimulationCleanupJobController,
  getSystemDevSimulationJobController,
  getSystemStorageUsageController,
  getSystemStorageSummaryController,
  inspectPortableImportPackageController,
  previewHistoryRetentionPolicyController,
  previewPortableExportController,
  setAppUiSettingsController,
  setDataPoolRemovedSymbolsController,
  startHistoryRetentionJobController,
  startResetAllStoredDataJobController,
  startSystemDevSimulationCleanupJobController,
  startSystemDevSimulationJobController,
  updateHistoryRetentionPolicyController,
} from './systemController.js';

export const systemRouter = Router();

systemRouter.get('/system/storage-usage', getSystemStorageUsageController);
systemRouter.get('/system/storage-summary', getSystemStorageSummaryController);
systemRouter.get('/system/legal-documents/:documentKey', getDesktopLegalDocumentController);

systemRouter.get('/system/history-retention', getHistoryRetentionPolicyController);
systemRouter.put('/system/history-retention', updateHistoryRetentionPolicyController);
systemRouter.post('/system/history-retention/preview', previewHistoryRetentionPolicyController);
systemRouter.post('/system/history-retention/jobs/start', startHistoryRetentionJobController);
systemRouter.get('/system/history-retention/jobs/latest', getLatestHistoryRetentionJobController);
systemRouter.get('/system/history-retention/jobs/:jobId', getHistoryRetentionJobController);

systemRouter.get('/system/app-preferences', getAppPreferencesController);
systemRouter.put('/system/app-preferences/ui-settings', setAppUiSettingsController);
systemRouter.put('/system/app-preferences/data-pool-removed-symbols', setDataPoolRemovedSymbolsController);

systemRouter.post('/system/reset-all-data/start', startResetAllStoredDataJobController);
systemRouter.get('/system/reset-all-data/jobs/:jobId', getResetAllStoredDataJobController);

systemRouter.post('/system/portable-export/preview', previewPortableExportController);
systemRouter.post('/system/portable-export', executePortableExportController);
systemRouter.post('/system/local-import-mock-sample/export', exportLocalImportMockSampleController);
systemRouter.post('/system/portable-import/inspect', inspectPortableImportPackageController);
systemRouter.post('/system/portable-import', executePortableImportController);

systemRouter.post('/system/dev-simulation/start', startSystemDevSimulationJobController);
systemRouter.get('/system/dev-simulation/capabilities', getSystemDevSimulationCapabilitiesController);
systemRouter.post('/system/dev-simulation/cancel', cancelSystemDevSimulationJobController);
systemRouter.post('/system/dev-simulation/cleanup', cleanupSystemDevSimulationDataController);
systemRouter.post('/system/dev-simulation/cleanup/start', startSystemDevSimulationCleanupJobController);
systemRouter.get('/system/dev-simulation/cleanup/latest-job', getLatestSystemDevSimulationCleanupJobController);
systemRouter.get('/system/dev-simulation/cleanup/jobs/:jobId', getSystemDevSimulationCleanupJobController);
systemRouter.get('/system/dev-simulation/latest-job', getLatestSystemDevSimulationJobController);
systemRouter.get('/system/dev-simulation/jobs/:jobId', getSystemDevSimulationJobController);
