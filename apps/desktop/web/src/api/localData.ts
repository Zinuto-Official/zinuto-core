// SPDX-License-Identifier: GPL-3.0-only

import type { ApiRequestOptions, ApiRequester } from "@/api/requesterTypes";
import { DESKTOP_LOCAL_API_ROUTES } from "@zinuto/shared/contracts-desktop/http-api";
import { buildHttpApiRoute } from "@zinuto/shared/httpApiRouteBuilder";
import {
  type ApiLocalDataImportJob,
  type ApiLocalDataSourceDiagnosticProfile,
  type ApiLocalDataSourceDiagnosticsRequestOptions,
  type ApiLocalDataSourceSummary,
  type ApiTradingCalendarConfig,
  type CsvFieldMapping,
} from "@/api/localDataTypes";
import {
  normalizeLocalDataImportDraftValidation,
  normalizeLocalDataImportPreviewJob,
  normalizeLocalDataSourceDiagnostics,
  normalizeLocalDataSourceSymbolDiagnostics,
  normalizeLocalDataSyncPreview,
  normalizeLocalDataSyncQuickCheck,
} from "@/api/localDataNormalization";

export type * from "@/api/localDataTypes";
export { normalizeApiTradingCalendarConfig } from "@/api/localDataNormalization";

export const createLocalDataApi = (request: ApiRequester) => ({
  startLocalDataImportJobByPaths: (
    payload: {
      previewToken: string;
      previewPlanId: string;
      mapping?: CsvFieldMapping;
      userOverrides?: {
        sourceName?: string;
        sourceFolder?: string;
        sourceFolderBookmarkId?: string;
        timeZone?: string;
        timeZoneOrigin?:
          "PRESET_DEFAULT" | "INFERRED_DEFAULT" | "USER_SELECTED";
        tradingCalendar?: ApiTradingCalendarConfig;
      };
    },
    options?: ApiRequestOptions,
  ) =>
    request<ApiLocalDataImportJob>(
      DESKTOP_LOCAL_API_ROUTES.dataSourcesImportFromPaths,
      {
        method: "POST",
        body: JSON.stringify({
          previewToken: payload.previewToken,
          previewPlanId: payload.previewPlanId,
          mapping: payload.mapping,
          userOverrides: payload.userOverrides,
        }),
        ...options,
      },
    ),
  startLocalDataFullReimportJobByPaths: (
    sourceId: string,
    payload: {
      previewToken: string;
      previewPlanId: string;
      mapping?: CsvFieldMapping;
      userOverrides?: {
        sourceName?: string;
        sourceFolder?: string;
        sourceFolderBookmarkId?: string;
        timeZone?: string;
        timeZoneOrigin?:
          "PRESET_DEFAULT" | "INFERRED_DEFAULT" | "USER_SELECTED";
        tradingCalendar?: ApiTradingCalendarConfig;
        allowExistingSourceTimeZoneChange?: boolean;
      };
    },
    options?: ApiRequestOptions,
  ) =>
    request<ApiLocalDataImportJob>(
      buildHttpApiRoute(
        DESKTOP_LOCAL_API_ROUTES.dataSourcesSourceIdFullReimportFromPaths,
        {
          sourceId,
        },
      ),
      {
        method: "POST",
        body: JSON.stringify({
          previewToken: payload.previewToken,
          previewPlanId: payload.previewPlanId,
          mapping: payload.mapping,
          userOverrides: payload.userOverrides,
        }),
        ...options,
      },
    ),
  startLocalDataIncrementalUpdateJobByPaths: (
    sourceId: string,
    payload: {
      previewToken: string;
      previewPlanId: string;
      mapping?: CsvFieldMapping;
      userOverrides?: {
        sourceName?: string;
        sourceFolder?: string;
        sourceFolderBookmarkId?: string;
        sourceFolderUsageMode?: "BOUND_SOURCE" | "ONE_OFF";
      };
    },
    options?: ApiRequestOptions,
  ) =>
    request<ApiLocalDataImportJob>(
      buildHttpApiRoute(
        DESKTOP_LOCAL_API_ROUTES.dataSourcesSourceIdIncrementalUpdateFromPaths,
        {
          sourceId,
        },
      ),
      {
        method: "POST",
        body: JSON.stringify({
          previewToken: payload.previewToken,
          previewPlanId: payload.previewPlanId,
          mapping: payload.mapping,
          userOverrides: payload.userOverrides,
        }),
        ...options,
      },
    ),
  startLocalDataImportPreviewJobByPath: async (
    folderPath: string,
    payload: {
      sourceFolderName?: string;
      sourceId?: string;
      locale?: string;
    } = {},
    options?: ApiRequestOptions,
  ) =>
    normalizeLocalDataImportPreviewJob(
      await request<unknown>(
        DESKTOP_LOCAL_API_ROUTES.dataSourcesImportPreviewFromPath,
        {
          method: "POST",
          body: JSON.stringify({
            folderPath,
            sourceFolderName: payload.sourceFolderName,
            sourceId: payload.sourceId,
            locale: payload.locale,
          }),
          ...options,
        },
      ),
    ),
  getLocalDataImportPreviewJob: async (
    jobId: string,
    options?: ApiRequestOptions,
  ) =>
    normalizeLocalDataImportPreviewJob(
      await request<unknown>(
        buildHttpApiRoute(
          DESKTOP_LOCAL_API_ROUTES.dataSourcesImportPreviewJobsJobId,
          {
            jobId,
          },
        ),
        {
          method: "GET",
          ...options,
        },
      ),
    ),
  discardLocalDataImportPreview: async (
    previewToken: string,
    options?: ApiRequestOptions,
  ) =>
    request<{ discarded: boolean }>(
      DESKTOP_LOCAL_API_ROUTES.dataSourcesImportPreviewDiscard,
      {
        method: "POST",
        body: JSON.stringify({
          previewToken,
        }),
        ...options,
      },
    ),
  validateLocalDataImportDraft: async (
    payload: {
      previewToken: string;
      mapping: CsvFieldMapping;
      planDrafts?: Array<{
        previewPlanId: string;
        tradingCalendar: ApiTradingCalendarConfig;
      }>;
      planning?: {
        importEntryMode?: "GENERAL" | "FULL_REIMPORT";
        fullReimportTargetSourceId?: string;
        importTimeZone?: string;
        importTimeZoneMode?: "AUTO" | "MANUAL";
        timeZoneConfirmed?: boolean;
        timeZoneConfidence?: "HIGH" | "MEDIUM" | "LOW";
        suggestedTimeZone?: string;
        suggestedTimeZoneReason?:
          | "PRESET_DEFAULT"
          | "RULE_INFERRED"
          | "TIMESTAMP_INFERRED"
          | "EXISTING_SOURCE"
          | "SYSTEM_FALLBACK";
        scopeStrategy?: "FLAT" | "WITH_PARENT";
        tradingCalendar?: ApiTradingCalendarConfig;
        tradingCalendarTouched?: boolean;
        repairWarningCount?: number;
        locale?: string;
        planOverrides?: Array<{
          previewPlanId: string;
          targetSourceId?: string;
          sourceTouched?: boolean;
          poolName?: string;
          nameTouched?: boolean;
        }>;
      };
    },
    options?: ApiRequestOptions,
  ) =>
    normalizeLocalDataImportDraftValidation(
      await request<unknown>(
        DESKTOP_LOCAL_API_ROUTES.dataSourcesImportPreviewValidate,
        {
          method: "POST",
          body: JSON.stringify({
            previewToken: payload.previewToken,
            mapping: payload.mapping,
            planDrafts: payload.planDrafts,
            planning: payload.planning,
          }),
          ...options,
        },
      ),
      "draftValidation",
    ),
  previewLocalDataSourceSyncByPaths: async (
    sourceId: string,
    payload: {
      previewToken: string;
      sourceFolder?: string;
      sourceFolderUsageMode: "BOUND_SOURCE" | "ONE_OFF";
    },
    options?: ApiRequestOptions,
  ) =>
    normalizeLocalDataSyncPreview(
      await request<unknown>(
        buildHttpApiRoute(
          DESKTOP_LOCAL_API_ROUTES.dataSourcesSourceIdSyncPreviewFromPaths,
          {
            sourceId,
          },
        ),
        {
          method: "POST",
          body: JSON.stringify({
            previewToken: payload.previewToken,
            sourceFolder: payload.sourceFolder,
            sourceFolderUsageMode: payload.sourceFolderUsageMode,
          }),
          ...options,
        },
      ),
    ),
  quickCheckLocalDataSourceSyncByMetadata: async (
    sourceId: string,
    payload: {
      sourceFolder?: string;
      files: Array<{
        relativePath: string;
        originalname?: string;
        size: number;
        mtimeMs: number;
        fingerprint?: string;
      }>;
    },
    options?: ApiRequestOptions,
  ) =>
    normalizeLocalDataSyncQuickCheck(
      await request<unknown>(
        buildHttpApiRoute(
          DESKTOP_LOCAL_API_ROUTES.dataSourcesSourceIdSyncQuickCheckFromMetadata,
          {
            sourceId,
          },
        ),
        {
          method: "POST",
          body: JSON.stringify({
            sourceFolder: payload.sourceFolder,
            files: payload.files,
          }),
          ...options,
        },
      ),
    ),
  getLocalDataImportJob: (jobId: string, options?: ApiRequestOptions) =>
    request<ApiLocalDataImportJob>(
      buildHttpApiRoute(DESKTOP_LOCAL_API_ROUTES.dataSourcesImportJobsJobId, {
        jobId,
      }),
      options,
    ),
  controlLocalDataImportJob: (
    jobId: string,
    action: "PAUSE" | "RESUME" | "CANCEL",
    options?: ApiRequestOptions,
  ) =>
    request<ApiLocalDataImportJob>(
      buildHttpApiRoute(
        DESKTOP_LOCAL_API_ROUTES.dataSourcesImportJobsJobIdControl,
        {
          jobId,
        },
      ),
      {
        method: "POST",
        body: JSON.stringify({ action }),
        ...options,
      },
    ),
  listLocalDataSources: (options?: ApiRequestOptions) =>
    request<ApiLocalDataSourceSummary[]>(
      DESKTOP_LOCAL_API_ROUTES.dataSources,
      options,
    ),
  getDataSourceMaintenanceAvailability: (options?: ApiRequestOptions) =>
    request<{
      actions: Array<{
        id: string;
        enabled: boolean;
        reasonCode: string | null;
        sourceId?: string;
      }>;
      hasAnySource: boolean;
      hasReadySource: boolean;
      hasImportingSource: boolean;
      hasFailedSource: boolean;
      hasRebindRequiredSource: boolean;
      hasLockedSource: boolean;
    }>(
      `${DESKTOP_LOCAL_API_ROUTES.dataSources}/maintenance-availability`,
      options,
    ),
  getLocalDataSourceDiagnostics: (
    sourceId: string,
    options?: ApiLocalDataSourceDiagnosticsRequestOptions,
  ) => {
    const query = new URLSearchParams();
    if (options?.limit !== undefined) {
      query.set("limit", String(Math.max(1, Math.floor(options.limit))));
    }
    if (options?.cursor) {
      query.set("cursor", options.cursor);
    }
    if (options?.category) {
      query.set("category", options.category);
    }
    if (options?.severity) {
      query.set("severity", options.severity);
    }
    const queryText = query.toString();
    const diagnosticsPath = buildHttpApiRoute(
      DESKTOP_LOCAL_API_ROUTES.dataSourcesSourceIdDiagnostics,
      { sourceId },
    );
    return request<unknown>(
      queryText ? diagnosticsPath + "?" + queryText : diagnosticsPath,
      {
        signal: options?.signal,
        timeoutMs: options?.timeoutMs,
      },
    ).then(normalizeLocalDataSourceDiagnostics);
  },
  updateLocalDataSourceDiagnosticProfile: (
    sourceId: string,
    profile: Pick<
      ApiLocalDataSourceDiagnosticProfile,
      "assetClass" | "marketPresetId"
    >,
    options?: ApiRequestOptions,
  ) =>
    request<unknown>(
      buildHttpApiRoute(
        DESKTOP_LOCAL_API_ROUTES.dataSourcesSourceIdDiagnosticProfile,
        {
          sourceId,
        },
      ),
      {
        method: "PUT",
        body: JSON.stringify(profile),
        ...options,
      },
    ).then(normalizeLocalDataSourceDiagnostics),
  updateLocalDataSourceTradingCalendar: (
    sourceId: string,
    tradingCalendar: ApiTradingCalendarConfig,
    options?: ApiRequestOptions,
  ) =>
    request<ApiLocalDataSourceSummary>(
      buildHttpApiRoute(
        DESKTOP_LOCAL_API_ROUTES.dataSourcesSourceIdTradingCalendar,
        {
          sourceId,
        },
      ),
      {
        method: "PUT",
        body: JSON.stringify({ tradingCalendar }),
        ...options,
      },
    ),
  getLocalDataSourceSymbolDiagnostics: (
    sourceId: string,
    symbol: string,
    options?: ApiRequestOptions,
  ) =>
    request<unknown>(
      buildHttpApiRoute(
        DESKTOP_LOCAL_API_ROUTES.dataSourcesSourceIdSymbolsSymbolDiagnostics,
        {
          sourceId,
          symbol,
        },
      ),
      options,
    ).then(normalizeLocalDataSourceSymbolDiagnostics),
  clearLocalDataSources: (options?: ApiRequestOptions) =>
    request<{
      deletedSourceFiles: number;
      deletedImportJobs: number;
      deletedSources: number;
      deletedInstruments: number;
      clearedAt: string;
    }>(DESKTOP_LOCAL_API_ROUTES.dataSourcesClearAll, {
      method: "POST",
      ...options,
    }),
  deleteLocalDataSource: (sourceId: string, options?: ApiRequestOptions) =>
    request<{
      sourceId: string;
      deletedSourceFiles: number;
      deletedImportJobs: number;
      deletedSources: number;
      deletedInstruments: number;
      clearedAt: string;
    }>(
      buildHttpApiRoute(DESKTOP_LOCAL_API_ROUTES.dataSourcesSourceId, {
        sourceId,
      }),
      {
        method: "DELETE",
        ...options,
      },
    ),
  removeLocalDataSourceSymbols: (
    sourceId: string,
    symbols: string[],
    options?: ApiRequestOptions,
  ) =>
    request<{
      sourceId: string;
      requestedSymbols: string[];
      removedSymbols: string[];
      skippedSymbols: string[];
      deletedSourceFiles: number;
      deletedInstruments: number;
      summary: {
        symbolCount: number;
        barCount: number;
        timeStartTs: string | null;
        timeEndTs: string | null;
        storageBytes: number;
        totalFiles: number;
        importedFiles: number;
        failedFiles: number;
      };
      updatedAt: string;
    }>(
      buildHttpApiRoute(
        DESKTOP_LOCAL_API_ROUTES.dataSourcesSourceIdSymbolsRemove,
        {
          sourceId,
        },
      ),
      {
        method: "POST",
        body: JSON.stringify({ symbols }),
        ...options,
      },
    ),
});
