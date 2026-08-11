// SPDX-License-Identifier: GPL-3.0-only

import type { Request, Response } from 'express';
import {
  clearLocalDataSourcesAndMarketData,
  controlLocalDataImportJob,
  discardLocalDataImportPreview,
  getLocalDataSourceDiagnostics,
  getLocalDataSourceSymbolDiagnostics,
  getLocalDataImportJob,
  getLocalDataImportPreviewJob,
  listLocalDataSources,
  previewLocalDataSourceSync,
  quickCheckLocalDataSourceSync,
  removeLocalDataSource,
  removeSymbolsFromLocalDataSource,
  startLocalDataFullReimportJobFromPreviewPlan,
  startLocalDataImportJobFromPreviewPlan,
  startLocalDataImportPreviewJob,
  startLocalDataIncrementalUpdateJobFromPreviewPlan,
  updateLocalDataSourceDiagnosticProfile,
  updateLocalDataSourceTradingCalendar,
  validateLocalDataImportDraft,
} from '../application/dataSourceService.js';
import {
  localDataFullReimportByPathSchema,
  localDataImportByPathSchema,
  localDataImportControlSchema,
  localDataImportDraftValidationSchema,
  localDataImportPreviewByPathSchema,
  localDataImportPreviewDiscardSchema,
  localDataIncrementalUpdateByPathSchema,
  localDataSourceDiagnosticProfileUpdateSchema,
  localDataSourceDiagnosticsQuerySchema,
  localDataSourceRemoveSymbolsSchema,
  localDataSourceTradingCalendarUpdateSchema,
  localDataSyncPreviewByPathSchema,
  localDataSyncQuickCheckByMetadataSchema,
} from './apiSchemas.js';
import { ok } from './response.js';
import { parseRouteId, parseRouteSymbol } from './routeParams.js';

export const startLocalDataImportFromPathsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = localDataImportByPathSchema.parse(req.body ?? {});
  const job = await startLocalDataImportJobFromPreviewPlan({
    previewToken: payload.previewToken,
    previewPlanId: payload.previewPlanId,
    mapping: payload.mapping,
    userOverrides: payload.userOverrides,
  });
  res.json(ok(job));
};

export const startLocalDataFullReimportFromPathsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const sourceId = parseRouteId(req.params.sourceId);
  const payload = localDataFullReimportByPathSchema.parse(req.body ?? {});
  const job = await startLocalDataFullReimportJobFromPreviewPlan({
    sourceId,
    previewToken: payload.previewToken,
    previewPlanId: payload.previewPlanId,
    mapping: payload.mapping,
    userOverrides: payload.userOverrides,
  });
  res.json(ok(job));
};

export const startLocalDataIncrementalUpdateFromPathsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const sourceId = parseRouteId(req.params.sourceId);
  const payload = localDataIncrementalUpdateByPathSchema.parse(req.body ?? {});
  const job = await startLocalDataIncrementalUpdateJobFromPreviewPlan({
    sourceId,
    previewToken: payload.previewToken,
    previewPlanId: payload.previewPlanId,
    mapping: payload.mapping,
    userOverrides: payload.userOverrides,
  });
  res.json(ok(job));
};

export const startLocalDataImportPreviewController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = localDataImportPreviewByPathSchema.parse(req.body ?? {});
  res.json(
    ok(
      await startLocalDataImportPreviewJob(
        payload.folderPath,
        payload.sourceId,
        payload.locale,
        payload.sourceFolderName,
      ),
    ),
  );
};

export const getLocalDataImportPreviewJobController = (
  req: Request,
  res: Response,
): void => {
  res.json(ok(getLocalDataImportPreviewJob(parseRouteId(req.params.jobId))));
};

export const discardLocalDataImportPreviewController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = localDataImportPreviewDiscardSchema.parse(req.body ?? {});
  await discardLocalDataImportPreview(payload.previewToken);
  res.json(ok({ discarded: true }));
};

export const validateLocalDataImportDraftController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = localDataImportDraftValidationSchema.parse(req.body ?? {});
  res.json(ok(await validateLocalDataImportDraft(payload)));
};

export const previewLocalDataSourceSyncController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const sourceId = parseRouteId(req.params.sourceId);
  const payload = localDataSyncPreviewByPathSchema.parse(req.body ?? {});
  res.json(
    ok(
      await previewLocalDataSourceSync({
        sourceId,
        previewToken: payload.previewToken,
        sourceFolder: payload.sourceFolder,
        sourceFolderUsageMode: payload.sourceFolderUsageMode,
      }),
    ),
  );
};

export const quickCheckLocalDataSourceSyncController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const sourceId = parseRouteId(req.params.sourceId);
  const payload = localDataSyncQuickCheckByMetadataSchema.parse(req.body ?? {});
  res.json(
    ok(
      await quickCheckLocalDataSourceSync({
        sourceId,
        sourceFolder: payload.sourceFolder,
        files: payload.files,
      }),
    ),
  );
};

export const getLocalDataImportJobController = (
  req: Request,
  res: Response,
): void => {
  res.json(ok(getLocalDataImportJob(parseRouteId(req.params.jobId))));
};

export const controlLocalDataImportJobController = (
  req: Request,
  res: Response,
): void => {
  const payload = localDataImportControlSchema.parse(req.body ?? {});
  res.json(ok(controlLocalDataImportJob(parseRouteId(req.params.jobId), payload.action)));
};

export const listLocalDataSourcesController = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await listLocalDataSources()));
};

export const getLocalDataSourceDiagnosticsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const sourceId = parseRouteId(req.params.sourceId);
  const query = localDataSourceDiagnosticsQuerySchema.parse(req.query ?? {});
  res.json(ok(await getLocalDataSourceDiagnostics(sourceId, query)));
};

export const updateLocalDataSourceDiagnosticProfileController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const sourceId = parseRouteId(req.params.sourceId);
  const payload = localDataSourceDiagnosticProfileUpdateSchema.parse(req.body ?? {});
  res.json(ok(await updateLocalDataSourceDiagnosticProfile(sourceId, payload)));
};

export const updateLocalDataSourceTradingCalendarController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const sourceId = parseRouteId(req.params.sourceId);
  const payload = localDataSourceTradingCalendarUpdateSchema.parse(req.body ?? {});
  res.json(ok(await updateLocalDataSourceTradingCalendar(sourceId, payload.tradingCalendar)));
};

export const getLocalDataSourceSymbolDiagnosticsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const sourceId = parseRouteId(req.params.sourceId);
  const symbol = parseRouteSymbol(req.params.symbol);
  res.json(ok(await getLocalDataSourceSymbolDiagnostics(sourceId, symbol)));
};

export const removeLocalDataSourceController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const sourceId = parseRouteId(req.params.sourceId);
  res.json(ok(await removeLocalDataSource(sourceId)));
};

export const removeSymbolsFromLocalDataSourceController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const sourceId = parseRouteId(req.params.sourceId);
  const payload = localDataSourceRemoveSymbolsSchema.parse(req.body ?? {});
  res.json(ok(await removeSymbolsFromLocalDataSource(sourceId, payload.symbols)));
};

export const clearLocalDataSourcesAndMarketDataController = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await clearLocalDataSourcesAndMarketData()));
};

export const getDataSourceMaintenanceAvailabilityController = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const { buildDataSourceMaintenanceAvailability } = await import(
    '../application/dataSourceMaintenanceReadModel.js'
  );
  const sources = await listLocalDataSources();
  res.json(ok(buildDataSourceMaintenanceAvailability({ sources })));
};
