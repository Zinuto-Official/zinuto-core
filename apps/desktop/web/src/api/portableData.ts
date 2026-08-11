// SPDX-License-Identifier: GPL-3.0-only

import type { ApiRequestOptions, ApiRequester } from "@/api/requesterTypes";

export type PortableExportDomain =
  | "SETTINGS"
  | "CUSTOM_INDICATORS"
  | "NOTES"
  | "TRAINING_HISTORY"
  | "SPECIAL_TRAINING_HISTORY"
  | "MARKET_DATA";

export type PortableSnapshotPolicy = "EVIDENCE_ONLY";
export type PortableImportConflictMode =
  | "MERGE_KEEP_LOCAL"
  | "REPLACE_DOMAIN";
export type PortableImportSettingsConflictMode =
  | "KEEP_LOCAL"
  | "REPLACE_TARGET";
export type ReplayAvailability =
  | "READY"
  | "SOURCE_CHANGED"
  | "SOURCE_MISSING"
  | "SNAPSHOT_ONLY";

export type PortableDateRangeFilter = {
  from: string | null;
  to: string | null;
};

export type PortableDomainPreview = {
  domain: PortableExportDomain;
  itemCount: number;
  estimatedBytes: number;
  includesEvidenceSnapshots: boolean;
  needsRebindAfterImport: boolean;
};

export type PortableMarketSourcePreview = {
  sourceId: string;
  sourceName: string;
  assetClass: string;
  marketPresetId: string;
  baseTimeframe: string;
  timeZone: string;
  symbolCount: number;
  barCount: number;
  estimatedBytes: number;
  linkedTrainingProjectCount: number;
  linkedSpecialTrainingQuestionCount: number;
};

export type PortableExportPreview = {
  domains: PortableDomainPreview[];
  marketSources: PortableMarketSourcePreview[];
  totalItems: number;
  estimatedBytes: number;
  snapshotPolicy: PortableSnapshotPolicy;
  dateRange: PortableDateRangeFilter;
};

export type PortableExportManifest = {
  schemaVersion: 2;
  exportId: string;
  exportedAt: string;
  appBuildVersion: string;
  selectedDomains: PortableExportDomain[];
  selectedMarketSourceIds: string[];
  dateRange: PortableDateRangeFilter;
  snapshotPolicy: PortableSnapshotPolicy;
  countsByDomain: Record<PortableExportDomain, number>;
  payloadBytes: number;
  marketDataIncluded: boolean;
};

export type PortableExportResult = {
  outputPath: string;
  manifest: PortableExportManifest;
  fileBytes: number;
};

export type PortableImportPreviewDomain = PortableDomainPreview & {
  conflictCount: number;
};

export type PortableImportPreview = {
  manifest: PortableExportManifest;
  domains: PortableImportPreviewDomain[];
  marketSources: PortableMarketSourcePreview[];
  totalItems: number;
  payloadBytes: number;
  fullRestoreCounts: {
    trainingProjects: number;
    specialTrainingQuestions: number;
  };
  snapshotOnlyCounts: {
    trainingProjects: number;
    specialTrainingQuestions: number;
  };
  previewGeneration: string;
};

export type PortableImportResult = {
  manifest: PortableExportManifest;
  importedCountByDomain: Partial<Record<PortableExportDomain, number>>;
  skippedCountByDomain: Partial<Record<PortableExportDomain, number>>;
  conflictCountByDomain: Partial<Record<PortableExportDomain, number>>;
  remappedIds: {
    notes: number;
    trainingProjects: number;
    specialTrainingSessions: number;
    specialTrainingQuestions: number;
  };
  rebind: {
    trainingProjectRefsUpdated: number;
    specialTrainingQuestionsUpdated: number;
  };
  marketImport: {
    importedSources: number;
    reusedSources: number;
    importedInstruments: number;
    importedBars: number;
    pendingRebindSourceIds: string[];
  };
};
export const createPortableDataApi = (request: ApiRequester) => ({
  previewPortableExport: (
      payload: {
        domains?: PortableExportDomain[];
        marketSourceIds?: string[];
        dateRange?: Partial<PortableDateRangeFilter> | null;
      },
      options?: ApiRequestOptions,
    ) =>
      request<PortableExportPreview>("/api/v1/system/portable-export/preview", {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
        ...options,
      }),
    executePortableExport: (
      payload: {
        outputPath: string;
        domains?: PortableExportDomain[];
        marketSourceIds?: string[];
        dateRange?: Partial<PortableDateRangeFilter> | null;
        snapshotPolicy?: PortableSnapshotPolicy;
        appBuildVersion?: string | null;
        legalConfirmedForMarketData?: boolean;
      },
      options?: ApiRequestOptions,
    ) =>
      request<PortableExportResult>("/api/v1/system/portable-export", {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
        ...options,
      }),
    inspectPortableImportPackage: (
      payload: {
        inputPath: string;
      },
      options?: ApiRequestOptions,
    ) =>
      request<PortableImportPreview>("/api/v1/system/portable-import/inspect", {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
        ...options,
      }),
    executePortableImport: (
      payload: {
        inputPath: string;
        previewGeneration: string;
        domains?: PortableExportDomain[];
        conflictMode?: PortableImportConflictMode;
        settingsConflictMode?: PortableImportSettingsConflictMode;
        legalConfirmedForMarketData?: boolean;
      },
      options?: ApiRequestOptions,
    ) =>
      request<PortableImportResult>("/api/v1/system/portable-import", {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
        ...options,
      })
});
