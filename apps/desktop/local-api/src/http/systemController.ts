// SPDX-License-Identifier: GPL-3.0-only

import type { Request, Response } from 'express';
import type { SystemStorageCategoryKey } from '@zinuto/shared/systemStorageCategories';
import {
  appPreferencesDataPoolRemovedSymbolsSchema,
  appPreferencesUiSettingsSchema,
  historyRetentionPolicyUpdateSchema,
  systemDevSimulationCancelSchema,
  systemDevSimulationStartSchema,
} from './apiSchemas.js';
import { ok } from './response.js';
import { parseRouteId } from './routeParams.js';
import {
  getResetAllStoredDataJob,
  startResetAllStoredDataJob,
} from '../application/trading/resetService.js';
import {
  getSystemStorageUsage,
  getWorkspaceSystemStorageUsage,
} from '../application/systemStorageService.js';
import {
  cancelSystemDevSimulationJob,
  cleanupSystemDevSimulationData,
  getLatestSystemDevSimulationCleanupJob,
  getLatestSystemDevSimulationJob,
  getSystemDevSimulationCapabilities,
  getSystemDevSimulationCleanupJob,
  getSystemDevSimulationJob,
  startSystemDevSimulationCleanupJob,
  startSystemDevSimulationJob,
} from '../application/systemDevSimulationService.js';
import {
  getAppPreferences,
  setAppUiSettings,
  setDataPoolRemovedSymbolsBySourceId,
} from '../application/appPreferencesService.js';
import {
  getHistoryRetentionJob,
  getHistoryRetentionPolicy,
  getLatestHistoryRetentionJob,
  previewHistoryRetentionPolicy,
  startHistoryRetentionJob,
  updateHistoryRetentionPolicy,
} from '../application/historyRetentionService.js';
import {
  executePortableExport,
  executePortableImport,
  inspectPortableImportPackage,
  previewPortableExport,
} from '../application/portableDataService.js';
import { getDesktopLegalDocument } from '../application/legalDocumentsService.js';
import { exportLocalImportMockSampleArchive } from '../application/localImportMockSampleExportService.js';

type PortableDomain =
  | 'SETTINGS'
  | 'CUSTOM_INDICATORS'
  | 'NOTES'
  | 'TRAINING_HISTORY'
  | 'SPECIAL_TRAINING_HISTORY'
  | 'MARKET_DATA';

const getObjectPayload = (body: unknown): Record<string, unknown> =>
  body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};

const parsePortableDomains = (
  payload: Record<string, unknown>,
): PortableDomain[] | undefined =>
  Array.isArray(payload.domains) ? (payload.domains as PortableDomain[]) : undefined;

const parseMarketSourceIds = (
  payload: Record<string, unknown>,
): string[] | undefined =>
  Array.isArray(payload.marketSourceIds)
    ? (payload.marketSourceIds as string[])
    : undefined;

const parsePortableDateRange = (
  payload: Record<string, unknown>,
): { from?: string | null; to?: string | null } | undefined =>
  payload.dateRange && typeof payload.dateRange === 'object'
    ? (payload.dateRange as { from?: string | null; to?: string | null })
    : undefined;

export const getSystemStorageUsageController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const forceRefresh = String(req.query.refresh ?? '').trim() === '1';
  res.json(
    ok(
      await (forceRefresh
        ? getSystemStorageUsage()
        : getWorkspaceSystemStorageUsage()),
    ),
  );
};

export const getSystemStorageSummaryController = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const { getWorkspaceSystemStorageUsage: getUsage } = await import(
    '../application/systemStorageService.js'
  );
  const { buildStorageSummaryReadModel } = await import(
    '../application/storageSummaryReadModel.js'
  );
  const usage = await getUsage();
  const categories = usage.categories;
  const storageUsageRows: Array<{
    key: SystemStorageCategoryKey;
    bytes: number;
  }> = [
    { key: 'training', bytes: categories.trainingDataBytes },
    { key: 'replayNotes', bytes: categories.replayNotesBytes },
    { key: 'marketData', bytes: categories.marketDataBytes },
    { key: 'systemSettings', bytes: categories.systemSettingsBytes },
    { key: 'stats', bytes: categories.statsDataBytes },
    { key: 'other', bytes: categories.otherBytes },
  ];
  res.json(ok(buildStorageSummaryReadModel({ storageUsageRows, systemStorageUsage: usage })));
};

export const getDesktopLegalDocumentController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  res.json(
    ok(
      await getDesktopLegalDocument({
        documentKey: req.params.documentKey,
        locale: req.query.locale,
      }),
    ),
  );
};

export const getHistoryRetentionPolicyController = (
  _req: Request,
  res: Response,
): void => {
  res.json(ok(getHistoryRetentionPolicy()));
};

export const updateHistoryRetentionPolicyController = (
  req: Request,
  res: Response,
): void => {
  const payload = historyRetentionPolicyUpdateSchema.parse(req.body ?? {});
  res.json(ok(updateHistoryRetentionPolicy(payload)));
};

export const previewHistoryRetentionPolicyController = (
  req: Request,
  res: Response,
): void => {
  const payload = historyRetentionPolicyUpdateSchema.parse(req.body ?? {});
  res.json(ok(previewHistoryRetentionPolicy(payload)));
};

export const startHistoryRetentionJobController = (
  _req: Request,
  res: Response,
): void => {
  res.json(ok(startHistoryRetentionJob()));
};

export const getLatestHistoryRetentionJobController = (
  _req: Request,
  res: Response,
): void => {
  res.json(ok(getLatestHistoryRetentionJob()));
};

export const getHistoryRetentionJobController = (
  req: Request,
  res: Response,
): void => {
  res.json(ok(getHistoryRetentionJob(parseRouteId(req.params.jobId))));
};

export const getAppPreferencesController = (
  _req: Request,
  res: Response,
): void => {
  res.json(ok(getAppPreferences()));
};

export const setAppUiSettingsController = (
  req: Request,
  res: Response,
): void => {
  const payload = appPreferencesUiSettingsSchema.parse(req.body ?? {});
  res.json(
    ok({
      uiSettings: setAppUiSettings(payload.uiSettings),
    }),
  );
};

export const setDataPoolRemovedSymbolsController = (
  req: Request,
  res: Response,
): void => {
  const payload = appPreferencesDataPoolRemovedSymbolsSchema.parse(
    req.body ?? {},
  );
  res.json(
    ok({
      dataPoolRemovedSymbolsBySourceId: setDataPoolRemovedSymbolsBySourceId(
        payload.dataPoolRemovedSymbolsBySourceId,
      ),
    }),
  );
};

export const startResetAllStoredDataJobController = (
  _req: Request,
  res: Response,
): void => {
  res.json(ok(startResetAllStoredDataJob()));
};

export const getResetAllStoredDataJobController = (
  req: Request,
  res: Response,
): void => {
  res.json(ok(getResetAllStoredDataJob(parseRouteId(req.params.jobId))));
};

export const previewPortableExportController = (
  req: Request,
  res: Response,
): void => {
  const payload = getObjectPayload(req.body);
  res.json(
    ok(
      previewPortableExport({
        domains: parsePortableDomains(payload),
        marketSourceIds: parseMarketSourceIds(payload),
        dateRange: parsePortableDateRange(payload),
      }),
    ),
  );
};

export const executePortableExportController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = getObjectPayload(req.body);
  res.json(
    ok(
      await executePortableExport({
        outputPath: String(payload.outputPath ?? '').trim(),
        domains: parsePortableDomains(payload),
        marketSourceIds: parseMarketSourceIds(payload),
        dateRange: parsePortableDateRange(payload),
        snapshotPolicy:
          payload.snapshotPolicy === 'EVIDENCE_ONLY'
            ? 'EVIDENCE_ONLY'
            : undefined,
        appBuildVersion: String(payload.appBuildVersion ?? '').trim() || undefined,
        legalConfirmedForMarketData: Boolean(payload.legalConfirmedForMarketData),
      }),
    ),
  );
};

export const exportLocalImportMockSampleController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = getObjectPayload(req.body);
  res.json(
    ok(
      await exportLocalImportMockSampleArchive({
        outputPath: String(payload.outputPath ?? '').trim(),
      }),
    ),
  );
};

export const inspectPortableImportPackageController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = getObjectPayload(req.body);
  res.json(
    ok(
      await inspectPortableImportPackage({
        inputPath: String(payload.inputPath ?? '').trim(),
      }),
    ),
  );
};

export const executePortableImportController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = getObjectPayload(req.body);
  res.json(
    ok(
      await executePortableImport({
        inputPath: String(payload.inputPath ?? '').trim(),
        previewGeneration: String(payload.previewGeneration ?? '').trim(),
        domains: parsePortableDomains(payload),
        conflictMode:
          payload.conflictMode === 'REPLACE_DOMAIN'
            ? 'REPLACE_DOMAIN'
            : 'MERGE_KEEP_LOCAL',
        settingsConflictMode:
          payload.settingsConflictMode === 'REPLACE_TARGET'
            ? 'REPLACE_TARGET'
            : 'KEEP_LOCAL',
        legalConfirmedForMarketData: Boolean(payload.legalConfirmedForMarketData),
      }, { requirePreviewGeneration: true }),
    ),
  );
};

export const startSystemDevSimulationJobController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = systemDevSimulationStartSchema.parse(req.body ?? {});
  res.json(ok(await startSystemDevSimulationJob(payload)));
};

export const getSystemDevSimulationCapabilitiesController = (
  _req: Request,
  res: Response,
): void => {
  res.json(ok(getSystemDevSimulationCapabilities()));
};

export const cancelSystemDevSimulationJobController = (
  req: Request,
  res: Response,
): void => {
  const payload = systemDevSimulationCancelSchema.parse(req.body ?? {});
  res.json(ok(cancelSystemDevSimulationJob(payload.jobId)));
};

export const cleanupSystemDevSimulationDataController = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await cleanupSystemDevSimulationData()));
};

export const startSystemDevSimulationCleanupJobController = (
  _req: Request,
  res: Response,
): void => {
  res.json(ok(startSystemDevSimulationCleanupJob()));
};

export const getLatestSystemDevSimulationCleanupJobController = (
  _req: Request,
  res: Response,
): void => {
  res.json(ok(getLatestSystemDevSimulationCleanupJob()));
};

export const getSystemDevSimulationCleanupJobController = (
  req: Request,
  res: Response,
): void => {
  res.json(ok(getSystemDevSimulationCleanupJob(parseRouteId(req.params.jobId))));
};

export const getLatestSystemDevSimulationJobController = (
  _req: Request,
  res: Response,
): void => {
  res.json(ok(getLatestSystemDevSimulationJob()));
};

export const getSystemDevSimulationJobController = (
  req: Request,
  res: Response,
): void => {
  res.json(ok(getSystemDevSimulationJob(parseRouteId(req.params.jobId))));
};
