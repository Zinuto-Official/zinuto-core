// SPDX-License-Identifier: GPL-3.0-only

import type {
  ApiLocalDataImportDraftValidation,
  ApiLocalDataImportFolderPreview,
  ApiLocalDataImportPlanning,
  ApiLocalDataImportSymbolLimit,
  ApiTradingCalendarConfig,
  ApiTradingCalendarSuggestion,
} from "@/api";
import type { CsvFieldMapping } from "@/domains/data-import/csvHelpers";
import type { BaseTimeframe } from "@zinuto/shared/timeframe";

export type CsvImportRuleConfidence = "HIGH" | "MEDIUM" | "LOW";
export type CsvImportRulePriceFamily = "RAW" | "ADJUSTED" | "GENERIC";
export type CsvImportRuleFieldKey =
  | "date"
  | "time"
  | "open"
  | "high"
  | "low"
  | "close"
  | "volume";

export type PendingCsvFolderImport = {
  importEntryMode: "GENERAL" | "FULL_REIMPORT";
  fullReimportTargetSourceId?: string;
  previewToken: string;
  planSummaries: Array<{
    id: string;
    strategy: "FLAT" | "WITH_PARENT";
    baseTimeframe: BaseTimeframe;
    topLevelSubfolder: string;
    symbolCount: number;
    fileCount: number;
  }>;
  confirmableImportPlans: Array<{
    id: string;
    previewPlanId: string;
    strategy: "FLAT" | "WITH_PARENT";
    baseTimeframe: BaseTimeframe;
    topLevelSubfolder: string;
    defaultPoolName: string;
    symbolCount: number;
    fileCount: number;
  }>;
  sampledFileNames: string[];
  skippedNestedCount: number;
  folderName: string;
  folderPath: string;
  marketDataAcquisitionMetadata: ApiLocalDataImportFolderPreview['marketDataAcquisitionMetadata'];
  sourceFolderPath: string;
  sourceFolderBookmarkId?: string;
  suggestedTimeZone: string;
  suggestedTimeZoneReason:
    | "PRESET_DEFAULT"
    | "RULE_INFERRED"
    | "TIMESTAMP_INFERRED"
    | "EXISTING_SOURCE"
    | "SYSTEM_FALLBACK";
  timeZoneSuggestion: {
    timeZone: string;
    reason:
      | "PRESET_DEFAULT"
      | "RULE_INFERRED"
      | "TIMESTAMP_INFERRED"
      | "EXISTING_SOURCE"
      | "SYSTEM_FALLBACK";
    confidence: CsvImportRuleConfidence;
    reasons: Array<{
      code: string;
      timeZone: string;
      score: number;
    }>;
    samples: Array<{
      raw: string;
      parsedAt: string;
    }>;
  };
  tradingCalendarSuggestion: ApiTradingCalendarSuggestion;
  tradingCalendar: ApiTradingCalendarConfig;
  tradingCalendarTouched?: boolean;
  draftValidation: ApiLocalDataImportDraftValidation | null;
  importPlanning?: ApiLocalDataImportPlanning | null;
  headers: string[];
  mapping: CsvFieldMapping;
  mappingProfile: {
    canonicalSchemaKey: string;
    priceFamily: CsvImportRulePriceFamily;
    confidence: CsvImportRuleConfidence;
    score: number;
    conflicts: string[];
  };
  fieldDiagnostics: Array<{
    field: CsvImportRuleFieldKey;
    status: "MATCHED" | "MISSING" | "CONFLICT";
    selectedHeader: string;
    confidence: CsvImportRuleConfidence;
    reason: string;
    candidates: Array<{
      header: string;
      score: number;
      reason: string;
      family: CsvImportRulePriceFamily;
    }>;
  }>;
  repairSummary: {
    applied: string[];
    warnings: string[];
    sample: {
      checkedRows: number;
      parseableTimestampRows: number;
      validOhlcRows: number;
      duplicateTimestampRows: number;
      conflictingDuplicateTimestampRows: number;
    };
  };
  schemaDiagnostics: {
    canonicalSchemaKey: string;
    validSchemaCount: number;
    inconsistentFiles: Array<{
      relativePath: string;
      reason: string;
      canonicalSchemaKey: string;
      conflicts: string[];
    }>;
  };
  detectedTimeframe: BaseTimeframe;
  detectedTimeframes: BaseTimeframe[];
  validSymbolCount: number;
  totalFiles: number;
  validFiles: number;
  invalidFiles: number;
  invalidFileSamples: Array<{
    relativePath: string;
    reason: string;
  }>;
};

export type PendingLocalDataSourceSyncPreview = {
  sourceId: string;
  poolName: string;
  sourceFolder: string;
  sourceFolderBookmarkId?: string;
  sourceFolderUsageMode: "BOUND_SOURCE" | "ONE_OFF";
  baseTimeframe: BaseTimeframe;
  timeZone: string;
  timeZoneOrigin:
    | "PRESET_DEFAULT"
    | "INFERRED_DEFAULT"
    | "USER_SELECTED";
  importScopeStrategy: "FLAT" | "WITH_PARENT" | null;
  importScopeTopLevelSubfolder: string;
  previewToken: string;
  selectedPreviewPlanId: string;
  requiresScopeConfirmation: boolean;
  scopeCandidates: Array<{
    previewPlanId: string;
    strategy: "FLAT" | "WITH_PARENT";
    topLevelSubfolder: string;
    symbolCount: number;
    fileCount: number;
  }>;
  changeSummary: {
    changedFiles: number;
    unchangedFiles: number;
    addedSymbols: string[];
    updatedSymbols: string[];
    missingSymbolsRetained: string[];
  };
  hasLocalSymbolRemoval: boolean;
  removedSymbolCount: number;
  mapping: CsvFieldMapping;
};

export type DataTaskOperationProgressTone =
  | "checking"
  | "syncing"
  | "danger"
  | "muted";

export type DataTaskOperationProgress = {
  label: string;
  progressPercent: number | null;
  active: boolean;
  tone: DataTaskOperationProgressTone;
};

export type PreparingLocalDataSourceSyncPreview = {
  sourceId: string;
  poolName: string;
  sourceFolderUsageMode: "BOUND_SOURCE" | "ONE_OFF";
  operationProgress: DataTaskOperationProgress | null;
};

export type DataSourceSyncMode = "MANUAL" | "PROMPT" | "AUTO";

export type DataSourceSyncPreference = {
  mode: DataSourceSyncMode;
};

export type DataSourceSyncPrefsById = Record<string, DataSourceSyncPreference>;

export type DataSourceSyncMonitorStatus =
  | "IDLE"
  | "CHECKING"
  | "CLEAN"
  | "DIRTY"
  | "SYNCING"
  | "NEEDS_CONFIRMATION"
  | "ERROR";

export type DataSourceSyncMonitorEntry = {
  sourceId: string;
  status: DataSourceSyncMonitorStatus;
  mode: DataSourceSyncMode;
  quickCheckStatus: "NO_CHANGES" | "POTENTIAL_CHANGES" | "UNABLE_TO_CHECK" | null;
  reasonCode: string;
  checkedAt: string | null;
  estimatedChangedFiles: number;
  estimatedChangedSymbols: number;
  missingSymbolsRetained: string[];
  changedSymbols: string[];
  invalidFiles: number;
  symbolLimit: ApiLocalDataImportSymbolLimit;
  lastError: string | null;
  autoSyncArmed: boolean;
  operationProgress: DataTaskOperationProgress | null;
};

export type DataSourceSyncMonitorStateById = Record<string, DataSourceSyncMonitorEntry>;
