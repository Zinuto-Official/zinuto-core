// SPDX-License-Identifier: GPL-3.0-only

import type { ApiRequestOptions, ApiRequester } from "@/api/requesterTypes";
import {
  normalizeDesktopLegalDocumentLocale,
  type DesktopLegalDocumentResponse,
  type DesktopLocalLegalDocumentKey,
} from "@zinuto/shared/desktopLegalDocuments";
import type {
  DesktopLocalImportMockSampleExportResult,
  DesktopResetAllDataJob,
  DesktopResetAllDataModuleProgress,
  DesktopResetAllDataResult,
  DesktopStartupLocalDataReinitializeResult,
  DesktopSystemStartupStatus,
} from "@zinuto/shared/contracts-desktop/api";
import type { SystemStorageCategoryKey } from "@zinuto/shared/systemStorageCategories";

export type ApiDesktopLegalDocument = DesktopLegalDocumentResponse;

export type ApiAppPreferences = {
  uiSettings: Record<string, unknown>;
  dataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
};

export type ApiResetAllStoredDataResult = DesktopResetAllDataResult;

export type ApiResetAllStoredDataModuleProgress = DesktopResetAllDataModuleProgress;

export type ApiResetAllStoredDataJob = DesktopResetAllDataJob;

export type ApiStartupLocalDataReinitializeResult =
  DesktopStartupLocalDataReinitializeResult;

export type ApiLocalImportMockSampleExportResult =
  DesktopLocalImportMockSampleExportResult;

export type ApiHistoryRetentionWindow =
  | "ONE_MONTH"
  | "SIX_MONTHS"
  | "ONE_YEAR"
  | "THREE_YEARS"
  | "FOREVER";

export type ApiHistoryRetentionTargets = {
  freeReplayDetails: boolean;
  challengeDetails: boolean;
  noteText: boolean;
};

export type ApiHistoryRetentionPolicy = {
  retentionWindow: ApiHistoryRetentionWindow;
  targets: ApiHistoryRetentionTargets;
  updatedAt: string;
  lastAppliedAt: string | null;
};

export type ApiHistoryRetentionImpact = {
  rows: number;
  bytes: number;
};

export type ApiHistoryRetentionImpactSummary = {
  freeReplayDetails: ApiHistoryRetentionImpact;
  challengeDetails: ApiHistoryRetentionImpact;
  noteText: ApiHistoryRetentionImpact;
  totalRows: number;
  totalBytes: number;
};

export type ApiHistoryRetentionPreview = {
  policy: ApiHistoryRetentionPolicy;
  cutoffAt: string | null;
  estimated: ApiHistoryRetentionImpactSummary;
  measuredAt: string;
};

export type ApiHistoryRetentionJob = {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED";
  stage:
    | "QUEUED"
    | "PREVIEWING"
    | "FREE_REPLAY"
    | "CHALLENGE"
    | "NOTES"
    | "FINALIZING"
    | "DONE";
  progressPercent: number;
  startedAt: string | null;
  finishedAt: string | null;
  errorCode: string | null;
  errorArgs: Record<string, unknown> | null;
  result: (ApiHistoryRetentionPreview & {
    deleted: ApiHistoryRetentionImpactSummary;
    appliedAt: string;
    storageReclaimedBytes: number;
  }) | null;
};

export type ApiSystemDevSimulationJob = {
  id: string;
  profileId: "REALISTIC" | "STRESS";
  status: "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED" | "INTERRUPTED";
  progressPercent: number;
  phase:
    | "CALIBRATING"
    | "FREE_REPLAY"
    | "FAST_DECISION"
    | "RISK_DISCIPLINE"
    | "CUSTOM_INDICATORS"
    | "REAL_BACKTEST"
    | "DESKTOP_MUTABLE"
    | "VERIFYING"
    | "DONE";
  startedAt: string | null;
  finishedAt: string | null;
  freeReplayCompleted: number;
  freeReplayTarget: number;
  fastDecisionCompleted: number;
  fastDecisionTarget: number;
  riskDisciplineCompleted: number;
  riskDisciplineTarget: number;
  totalTarget: number;
  currentMessage: string;
  errorMessage: string | null;
  errorCode: string | null;
  errorArgs: Record<string, unknown> | null;
  effectivePlan: {
    specVersion: number;
    profileId: "REALISTIC" | "STRESS";
    enabledPairCount: number;
    calibrated: boolean;
    budget: {
      targetDurationMs: number | null;
      hardLimitMs: number | null;
      projectedDurationMs: number | null;
      calibrationTargets: {
        freeReplayTarget: number;
        fastDecisionTarget: number;
        riskDisciplineTarget: number;
        independentCustomNotes: number;
        customIndicatorProfiles: number;
        realBacktestBatches: number;
      } | null;
    };
    targets: {
      freeReplayTarget: number;
      fastDecisionTarget: number;
      riskDisciplineTarget: number;
      independentCustomNotes: number;
      customIndicatorProfiles: number;
      realBacktestBatches: number;
    };
    runtime: {
      freeReplayConcurrency: number;
      challengeConcurrency: number;
      customNoteConcurrency: number;
      barCacheMaxSeries: number;
    };
    notePolicy: {
      freeReplayForceCreateUntil: number;
      freeReplayCreateProbability: number;
      challengeForceCreateUntil: number;
      challengeCreateProbability: number;
      maxTagCount: number;
    };
  } | null;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  throughput: {
    completedItems: number;
    itemsPerMinute: number;
  };
  createdCounts: {
    trainingProjects: number;
    replayNotes: number;
    independentCustomNotes: number;
    specialTrainingSessions: number;
    specialTrainingQuestions: number;
    specialTrainingBanks: number;
    questionLedger: number;
    customIndicatorProfiles: number;
    realBacktestBatches: number;
    desktopMutableRuns: number;
  };
  currentWorkload: {
    phase:
      | "CALIBRATING"
      | "FREE_REPLAY"
      | "FAST_DECISION"
      | "RISK_DISCIPLINE"
      | "CUSTOM_INDICATORS"
      | "REAL_BACKTEST"
      | "DESKTOP_MUTABLE"
      | "VERIFYING"
      | "DONE";
    workload:
      | "FREE_REPLAY"
      | "FAST_DECISION"
      | "RISK_DISCIPLINE"
      | "CUSTOM_NOTE"
      | "CUSTOM_INDICATORS"
      | "REAL_BACKTEST"
      | "DESKTOP_MUTABLE"
      | "VERIFYING";
    index: number | null;
    current: number;
    target: number;
    startedAt: string;
    updatedAt: string;
  } | null;
  canCancel: boolean;
  cancelRequested: boolean;
  metrics: {
    retryCount: number;
    phaseElapsedMs: number;
    verificationStatus: "PENDING" | "SUCCESS" | "FAILED";
    workloadAverageMs: {
      freeReplayAverageMs: number | null;
      fastDecisionAverageMs: number | null;
      riskDisciplineAverageMs: number | null;
      customNoteAverageMs: number | null;
    };
  };
};

export type ApiSystemDevSimulationCapabilities = {
  specVersion: number;
  defaultProfileId: "REALISTIC" | "STRESS";
  dataAvailability: {
    ready: boolean;
    localReadySourceCount: number;
    localEligibleInstrumentCount: number;
    systemEligibleInstrumentCount: number;
    selectedInstrumentCount: number;
    selectedLocalInstrumentCount: number;
    selectedSystemInstrumentCount: number;
    willUseSystemFallback: boolean;
    sourceStrategy: "NONE" | "LOCAL_READY" | "SYSTEM_FALLBACK_ONLY";
  };
  profiles: Array<{
    profileId: "REALISTIC" | "STRESS";
    available: boolean;
    devOnly: boolean;
    reasonCode: "AVAILABLE" | "DEV_ONLY_DISABLED" | null;
    defaultTargets: {
      freeReplayTarget: number;
      fastDecisionTarget: number;
      riskDisciplineTarget: number;
      independentCustomNotes: number;
      customIndicatorProfiles: number;
      realBacktestBatches: number;
    };
  }>;
};

export type ApiSystemDevSimulationCleanupResult = {
  deletedTrainingProjects: number;
  deletedReplayNotes: number;
  deletedQuestionLedger: number;
  deletedSpecialTrainingBanks: number;
  deletedSpecialTrainingHistoryQuestions: number;
  deletedSpecialTrainingHistorySessions: number;
  deletedCustomIndicatorProfiles: number;
  deletedBacktestBatches: number;
};

export type ApiSystemDevSimulationCleanupJob = {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED";
  stage:
    | "QUEUED"
    | "COLLECTING"
    | "REPLAY_NOTES"
    | "QUESTION_LEDGER"
    | "SPECIAL_TRAINING_HISTORY"
    | "TRAINING_PROJECTS"
    | "CUSTOM_INDICATORS"
    | "BACKTESTS"
    | "FINALIZING"
    | "DONE";
  progressPercent: number;
  startedAt: string | null;
  finishedAt: string | null;
  errorCode: string | null;
  errorArgs: Record<string, unknown> | null;
  result: ApiSystemDevSimulationCleanupResult | null;
};

export type ApiSystemStorageUsage = {
  measuredAt: string;
  source: "DBSTAT" | "ROW_COUNT_ESTIMATE" | "PHYSICAL_FALLBACK";
  measurementState?: {
    status: "WARMING" | "FRESH" | "STALE";
    lastGoodAt: string | null;
    refreshPending: boolean;
    nextRetryAt: string | null;
  };
  categories: {
    trainingDataBytes: number;
    replayNotesBytes: number;
    marketDataBytes: number;
    systemSettingsBytes: number;
    statsDataBytes: number;
    otherBytes: number;
  };
  systemPoolStorageBytesById?: Record<string, number>;
  marketDataSummary?: {
    hasContent: boolean;
    instrumentCount: number;
    barCount: number;
    reclaimableBytes: number;
  };
  logicalTotalBytes: number;
  physicalBreakdown?: {
    system: {
      dbBytes: number;
      walBytes: number;
      shmBytes: number;
      totalBytes: number;
    };
    market: {
      dbBytes: number;
      walBytes: number;
      shmBytes: number;
      totalBytes: number;
    };
  };
  physicalFootprint: {
    dbBytes: number;
    walBytes: number;
    shmBytes: number;
    totalBytes: number;
  };
  physicalTotalBytes: number;
  storageLayout?: {
    coreBytes: number;
    marketBytes: number;
    cacheBytes: number;
    tempBytes: number;
    paths: {
      coreDir: string;
      marketDir: string;
      cacheDir: string;
      tempDir: string;
    };
  };
};

export type ApiSystemStorageSummary = {
  rows: Array<{
    key: SystemStorageCategoryKey;
    bytes: number;
    percent: number;
    progressPercent: number;
    sortOrder: number;
  }>;
  totalBytes: number;
  marketContentCounts: { instrumentCount: number; barCount: number };
  measurementState: NonNullable<ApiSystemStorageUsage["measurementState"]>;
};

export type ApiSystemSecurityIntegrity = {
  runtimeIntegrityStatus: "MANIFEST_DIGESTED" | "UNVERIFIED" | "FAILED";
  runtimeManifestDigest: string;
};

export type ApiSystemStartupStatus = DesktopSystemStartupStatus;

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const toTrimmedString = (value: unknown): string => String(value ?? "").trim();

const normalizeStringArrayRecord = (
  value: unknown,
  options?: { uppercaseValues?: boolean },
): Record<string, string[]> => {
  const record = toRecord(value);
  if (!record) {
    return {};
  }
  const normalized: Record<string, string[]> = {};
  Object.entries(record).forEach(([rawKey, rawValue]) => {
    const key = toTrimmedString(rawKey);
    if (!key || !Array.isArray(rawValue)) {
      return;
    }
    const values = Array.from(
      new Set(
        rawValue
          .map((item) => {
            const base = toTrimmedString(item);
            if (!base) {
              return "";
            }
            return options?.uppercaseValues ? base.toUpperCase() : base;
          })
          .filter((item) => item.length > 0),
      ),
    ).sort((left, right) => left.localeCompare(right, "en"));
    if (!values.length) {
      return;
    }
    normalized[key] = values;
  });
  return normalized;
};

const normalizeAppPreferences = (value: unknown): ApiAppPreferences => {
  const record = toRecord(value) ?? {};
  const uiSettings = toRecord(record.uiSettings) ?? {};
  return {
    uiSettings,
    dataPoolRemovedSymbolsBySourceId: normalizeStringArrayRecord(
      record.dataPoolRemovedSymbolsBySourceId,
      { uppercaseValues: true },
    ),
  };
};

const SYSTEM_DEV_SIMULATION_CLEANUP_TIMEOUT_MS = 10 * 60_000;

export const createSystemApi = (request: ApiRequester) => ({
  getAppPreferences: async (options?: ApiRequestOptions) =>
      normalizeAppPreferences(
        await request<unknown>("/api/v1/system/app-preferences", options),
      ),
    updateAppUiSettings: async (
      uiSettings: Record<string, unknown>,
      options?: ApiRequestOptions,
    ) =>
      toRecord(
        toRecord(
          await request<unknown>("/api/v1/system/app-preferences/ui-settings", {
            method: "PUT",
            body: JSON.stringify({ uiSettings: toRecord(uiSettings) ?? {} }),
            ...options,
          }),
        )?.uiSettings,
      ) ?? {},
    updateDataPoolRemovedSymbolsBySourceId: async (
      dataPoolRemovedSymbolsBySourceId: Record<string, string[]>,
      options?: ApiRequestOptions,
    ) =>
      normalizeStringArrayRecord(
        toRecord(
          await request<unknown>(
            "/api/v1/system/app-preferences/data-pool-removed-symbols",
            {
              method: "PUT",
              body: JSON.stringify({
                dataPoolRemovedSymbolsBySourceId: normalizeStringArrayRecord(
                  dataPoolRemovedSymbolsBySourceId,
                  { uppercaseValues: true },
                ),
              }),
              ...options,
            },
          ),
        )?.dataPoolRemovedSymbolsBySourceId,
        { uppercaseValues: true },
      ),
    // Canonical export for /api/v1/system/reset-all-data/start. The former
    // duplicate "resetAllStoredData" export was removed; use this one.
    startResetAllStoredDataJob: () =>
      request<ApiResetAllStoredDataJob>("/api/v1/system/reset-all-data/start", {
        method: "POST",
      }),
    exportLocalImportMockSampleArchive: (
      payload: {
        outputPath: string;
      },
      options?: ApiRequestOptions,
    ) =>
      request<ApiLocalImportMockSampleExportResult>(
        "/api/v1/system/local-import-mock-sample/export",
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
      ),
    reinitializeStartupLocalData: (options?: ApiRequestOptions) =>
      request<ApiStartupLocalDataReinitializeResult>(
        "/api/v1/system/startup-local-data/reinitialize",
        {
          method: "POST",
          body: JSON.stringify({
            confirmation: "REINITIALIZE_LOCAL_DATA",
          }),
          ...options,
        },
      ),
    getHistoryRetentionPolicy: (options?: ApiRequestOptions) =>
      request<ApiHistoryRetentionPolicy>(
        "/api/v1/system/history-retention",
        options,
      ),
    updateHistoryRetentionPolicy: (
      payload: {
        retentionWindow?: ApiHistoryRetentionWindow;
        targets?: Partial<ApiHistoryRetentionTargets>;
      },
      options?: ApiRequestOptions,
    ) =>
      request<ApiHistoryRetentionPolicy>("/api/v1/system/history-retention", {
        method: "PUT",
        body: JSON.stringify(payload),
        ...options,
      }),
    previewHistoryRetentionPolicy: (
      payload?: {
        retentionWindow?: ApiHistoryRetentionWindow;
        targets?: Partial<ApiHistoryRetentionTargets>;
      },
      options?: ApiRequestOptions,
    ) =>
      request<ApiHistoryRetentionPreview>(
        "/api/v1/system/history-retention/preview",
        {
          method: "POST",
          body: JSON.stringify(payload ?? {}),
          ...options,
        },
      ),
    startHistoryRetentionJob: (options?: ApiRequestOptions) =>
      request<ApiHistoryRetentionJob>(
        "/api/v1/system/history-retention/jobs/start",
        {
          method: "POST",
          ...options,
        },
      ),
    getLatestHistoryRetentionJob: (options?: ApiRequestOptions) =>
      request<ApiHistoryRetentionJob | null>(
        "/api/v1/system/history-retention/jobs/latest",
        options,
      ),
    getHistoryRetentionJob: (jobId: string, options?: ApiRequestOptions) =>
      request<ApiHistoryRetentionJob>(
        `/api/v1/system/history-retention/jobs/${encodeURIComponent(jobId)}`,
        options,
      ),
    startSystemDevSimulationJob: (
      payload: {
        profileId: "REALISTIC" | "STRESS";
        repeatMode: "REPLACE" | "APPEND";
        seed: string;
        targets: {
          freeReplayTarget: number;
          fastDecisionTarget: number;
          riskDisciplineTarget: number;
          independentCustomNotes: number;
          customIndicatorProfiles: number;
          realBacktestBatches: number;
        };
      },
      options?: ApiRequestOptions,
    ) =>
      request<ApiSystemDevSimulationJob>("/api/v1/system/dev-simulation/start", {
        method: "POST",
        body: JSON.stringify(payload),
        ...options,
      }),
    getSystemDevSimulationCapabilities: (options?: ApiRequestOptions) =>
      request<ApiSystemDevSimulationCapabilities>(
        "/api/v1/system/dev-simulation/capabilities",
        options,
      ),
    cancelSystemDevSimulationJob: (
      payload?: {
        jobId?: string;
      },
      options?: ApiRequestOptions,
    ) =>
      request<ApiSystemDevSimulationJob>("/api/v1/system/dev-simulation/cancel", {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
        ...options,
      }),
    cleanupSystemDevSimulationData: (options?: ApiRequestOptions) =>
      request<ApiSystemDevSimulationCleanupResult>(
        "/api/v1/system/dev-simulation/cleanup",
        {
          method: "POST",
          timeoutMs: SYSTEM_DEV_SIMULATION_CLEANUP_TIMEOUT_MS,
          ...options,
        },
      ),
    startSystemDevSimulationCleanupJob: (options?: ApiRequestOptions) =>
      request<ApiSystemDevSimulationCleanupJob>(
        "/api/v1/system/dev-simulation/cleanup/start",
        {
          method: "POST",
          ...options,
        },
      ),
    getLatestSystemDevSimulationCleanupJob: (options?: ApiRequestOptions) =>
      request<ApiSystemDevSimulationCleanupJob | null>(
        "/api/v1/system/dev-simulation/cleanup/latest-job",
        options,
      ),
    getSystemDevSimulationCleanupJob: (
      jobId: string,
      options?: ApiRequestOptions,
    ) =>
      request<ApiSystemDevSimulationCleanupJob>(
        `/api/v1/system/dev-simulation/cleanup/jobs/${encodeURIComponent(jobId)}`,
        options,
      ),
    getLatestSystemDevSimulationJob: (options?: ApiRequestOptions) =>
      request<ApiSystemDevSimulationJob | null>(
        "/api/v1/system/dev-simulation/latest-job",
        options,
      ),
    getResetAllStoredDataJob: (jobId: string, options?: ApiRequestOptions) =>
      request<ApiResetAllStoredDataJob>(
        `/api/v1/system/reset-all-data/jobs/${encodeURIComponent(jobId)}`,
        options,
      ),
    getDesktopLegalDocument: (
      documentKey: DesktopLocalLegalDocumentKey,
      locale: string,
      options?: ApiRequestOptions,
    ) =>
      request<ApiDesktopLegalDocument>(
        `/api/v1/system/legal-documents/${encodeURIComponent(documentKey)}?locale=${encodeURIComponent(
          normalizeDesktopLegalDocumentLocale(locale),
        )}`,
        options,
      ),
    getSystemDevSimulationJob: (jobId: string, options?: ApiRequestOptions) =>
      request<ApiSystemDevSimulationJob>(
        `/api/v1/system/dev-simulation/jobs/${encodeURIComponent(jobId)}`,
        options,
      ),
    getSystemStorageUsage: (
      options?: ApiRequestOptions & { forceRefresh?: boolean },
    ) =>
      request<ApiSystemStorageUsage>(
        options?.forceRefresh
          ? "/api/v1/system/storage-usage?refresh=1"
          : "/api/v1/system/storage-usage",
        { signal: options?.signal, timeoutMs: options?.timeoutMs },
      ),
    getSystemStorageSummary: (options?: ApiRequestOptions) =>
      request<ApiSystemStorageSummary>("/api/v1/system/storage-summary", options),
    getSystemStartupStatus: (options?: ApiRequestOptions) =>
      request<ApiSystemStartupStatus>("/api/v1/system/startup-status", options)
});
