// SPDX-License-Identifier: GPL-3.0-only

import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import type {
  CsvFieldKey,
  CsvFieldMapping,
  CsvTimestampMode,
} from "@/domains/data-import/csvHelpers";
import type { BaseTimeframe } from "@/domains/chart/chartPeriods";
import type {
  CsvImportActionStartResult,
  CsvImportEntryMode,
  CsvPoolNamingStrategy,
} from "@/app-shell/appCsvImportContracts";
import type {
  ApiLocalDataImportDraftValidation,
  ApiTradingCalendarConfig,
  ApiTradingCalendarSuggestion,
} from "@/api";

export type PendingCsvFolderImportView = {
  importEntryMode: CsvImportEntryMode;
  folderName: string;
  folderPath: string;
  marketDataAcquisitionMetadata: {
    schemaVersion: 1;
    connectorId: "akshare" | "ccxt";
    adjustment: "none" | "qfq" | "hfq" | null;
    sourceSymbols: string[];
    importSymbols: string[];
  } | null;
  sourceFolderPath: string;
  previewToken: string;
  planSummaries: Array<{
    id: string;
    strategy: "FLAT" | "WITH_PARENT";
    baseTimeframe: BaseTimeframe;
    topLevelSubfolder: string;
    symbolCount: number;
    fileCount: number;
  }>;
  headers: string[];
  mapping: CsvFieldMapping;
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
  timeZoneSuggestion: {
    confidence: "HIGH" | "MEDIUM" | "LOW";
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
  draftValidation: ApiLocalDataImportDraftValidation | null;
  mappingProfile: {
    canonicalSchemaKey: string;
    priceFamily: "RAW" | "ADJUSTED" | "GENERIC";
    confidence: "HIGH" | "MEDIUM" | "LOW";
    score: number;
    conflicts: string[];
  };
  fieldDiagnostics: Array<{
    field: CsvFieldKey;
    status: "MATCHED" | "MISSING" | "CONFLICT";
    selectedHeader: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    reason: string;
    candidates: Array<{
      header: string;
      score: number;
      reason: string;
      family: "RAW" | "ADJUSTED" | "GENERIC";
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
};

export type MaybePromise<T = void> = T | Promise<T>;

export type PendingPoolNameDraft = {
  value: string;
  committedValue: string;
  dirty: boolean;
};

export type ConfirmPendingCsvImportOptions = {
  poolNameByPreviewPlanId?: Record<string, string>;
};

export type AppCsvMappingModalProps = {
  presentation?: "dialog" | "window";
  pendingImport: PendingCsvFolderImportView | null;
  pendingFieldMapping: CsvFieldMapping | null;
  pendingPlanConfigRows: CsvImportPlanConfigRow[];
  pendingImportTimeZone: string;
  pendingImportTimeZoneMode: "AUTO" | "MANUAL";
  pendingImportTimeZoneConfirmed: boolean;
  pendingImportScopeStrategy: CsvPoolNamingStrategy;
  importReadinessSummaryText: string;
  availableTimeZones: string[];
  isPreparingCsvImportPreview: boolean;
  csvFieldLabels: Record<CsvFieldKey, string>;
  baseTimeframeLabels: Record<BaseTimeframe, string>;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values?: Array<unknown>) => string;
  onPendingImportTimeZoneChange: (timeZone: string) => void;
  onConfirmPendingImportTimeZone: () => void;
  onResetPendingImportTimeZoneRecommendation: () => void;
  onPendingImportTradingCalendarChange: (
    calendar: ApiTradingCalendarConfig,
  ) => void;
  onResetPendingImportTradingCalendarRecommendation: () => void;
  onPendingImportScopeStrategyChange: (strategy: CsvPoolNamingStrategy) => void;
  onUpdatePendingCsvTimestampMode: (mode: CsvTimestampMode) => void;
  onUpdatePendingCsvMapping: (field: CsvFieldKey, value: string) => void;
  onPendingPlanPoolNameChange: (
    planId: string,
    poolName: string,
  ) => MaybePromise;
  onPendingPlanSourceIdChange: (planId: string, sourceId: string) => void;
  onCancelPendingCsvImport: () => void;
  onConfirmPendingCsvImport: (
    options?: ConfirmPendingCsvImportOptions,
  ) => MaybePromise<CsvImportActionStartResult | void>;
  defaultAdvancedOpen?: boolean;
};

export type AppCsvMappingModalContentProps = AppCsvMappingModalProps & {
  pendingImport: PendingCsvFolderImportView;
};

export type CsvImportPlanConfigRow = {
  id: string;
  previewPlanId: string;
  strategy: "FLAT" | "WITH_PARENT";
  topLevelSubfolder: string;
  poolName: string;
  autoGeneratedPoolName: string;
  sourceId: string;
  targetSourceId: string;
  targetSourceOptions: Array<{
    sourceId: string;
    sourceName: string;
  }>;
  hasExistingTargetOptions: boolean;
  symbolCount: number;
  fileCount: number;
  baseTimeframe: BaseTimeframe;
  effectiveTimeZone: string;
  effectiveTimeZoneOrigin:
    "PRESET_DEFAULT" | "INFERRED_DEFAULT" | "USER_SELECTED";
  effectiveTimeZoneSource:
    "NEW_SOURCE_PENDING_IMPORT" | "EXISTING_SOURCE" | "FULL_REIMPORT";
  targetSourceTimeZone: string | null;
  targetSourceTimeZoneOrigin:
    | "PRESET_DEFAULT"
    | "PRESET_DEFAULT"
    | "INFERRED_DEFAULT"
    | "USER_SELECTED"
    | null;
  tradingCalendar: ApiTradingCalendarConfig;
  targetSourceTradingCalendar: ApiTradingCalendarConfig | null;
  willUpdateExistingSourceTimeZone: boolean;
  willUpdateExistingSourceTradingCalendar: boolean;
};
