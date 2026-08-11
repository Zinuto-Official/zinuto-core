// SPDX-License-Identifier: GPL-3.0-only

import type { CsvFieldMapping } from '../../domain/dataSource/csvFieldMappingTypes.js';
import type { TimeZoneOrigin, TimeZoneSuggestionReason } from '@zinuto/shared/timezone';
import type { TradingAssetClass } from '@zinuto/shared/trading';
import type {
  TradingCalendarConfig,
  TradingCalendarSuggestion,
} from '@zinuto/shared/tradingCalendar';
import type {
  LocalDataImportJobPhaseFacts,
  LocalDataImportOutcomeInsight,
} from './importJobFacts.js';

export type LocalDataSourceStatus = 'IMPORTING' | 'READY' | 'FAILED';
export const LOCAL_DATA_SOURCE_IMPORTING_LOCK_REASON = 'LOCAL_DATA_SOURCE_IMPORTING' as const;
export const LOCAL_DATA_SOURCE_FAILED_LOCK_REASON = 'LOCAL_DATA_SOURCE_IMPORT_FAILED' as const;
export const LOCAL_DATA_SOURCE_MUTATION_LOCK_REASON =
  'LOCAL_DATA_SOURCE_MUTATION_IN_PROGRESS' as const;
export type LocalDataImportJobStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCESS'
  | 'PARTIAL_SUCCESS'
  | 'FAILED'
  | 'CANCELED';
export type LocalDataImportJobStage = 'QUEUED' | 'SCANNING' | 'IMPORTING' | 'FINALIZING' | 'DONE';
export type LocalDataImportJobControlAction = 'PAUSE' | 'RESUME' | 'CANCEL';
export type LocalDataImportJobMode = 'FULL_IMPORT' | 'INCREMENTAL_UPDATE';
export type LocalDataSourceFolderUsageMode = 'BOUND_SOURCE' | 'ONE_OFF';
export type LocalDataImportScopeStrategy = 'FLAT' | 'WITH_PARENT';

export type LocalDataImportOutcomeSummary = {
  noChanges: boolean;
  addedSymbols: string[];
  updatedSymbols: string[];
  unchangedFiles: number;
  prependedRows: number;
  appendedRows: number;
  overlapRowsIgnored: number;
  internalRangeRowsIgnored: number;
  conflictRowsIgnored: number;
  qualityWarnings: {
    filesWithSkippedRows: number;
    invalidRequiredRowsSkipped: number;
    invalidOhlcRowsSkipped: number;
    duplicateConflictRowsSkipped: number;
    duplicateIdenticalRowsDeduped: number;
  };
};

export type LocalDataSourceInstrumentSummary = {
  samplePoolId: string;
  instrumentId: string;
  symbol: string;
  displayLabel: string;
  baseTimeframe: '1m' | '5m' | '1h' | '1d';
  sourceTimeframe: '1m' | '5m' | '1h' | '1d';
  scopeKind: 'SYSTEM' | 'LOCAL';
  sourceId: string | null;
  sourceName: string | null;
  barCount: number;
  timeStartTs: string | null;
  timeEndTs: string | null;
};

export type LocalDataSourceSummary = {
  id: string;
  samplePoolId: string;
  name: string;
  sourceFolder: string;
  sourceFolderBookmarkId: string;
  importScopeStrategy: LocalDataImportScopeStrategy | null;
  importScopeTopLevelSubfolder: string;
  timeZone: string;
  timeZoneOrigin: TimeZoneOrigin;
  baseTimeframe: '1m' | '5m' | '1h' | '1d';
  tradingCalendar: TradingCalendarConfig;
  diagnosticProfile: LocalDataSourceDiagnosticProfile;
  fieldMapping: CsvFieldMapping;
  symbols: string[];
  instruments: LocalDataSourceInstrumentSummary[];
  status: LocalDataSourceStatus;
  symbolCount: number;
  barCount: number;
  symbolStats: Array<{
    instrumentId: string;
    symbol: string;
    displayLabel: string;
    barCount: number;
    timeStartTs: string | null;
    timeEndTs: string | null;
  }>;
  timeStartTs: string | null;
  timeEndTs: string | null;
  totalFiles: number;
  importedFiles: number;
  failedFiles: number;
  requiresSourceFolderRebind: boolean;
  sourceLocked: boolean;
  unlockedSymbols: string[];
  lockedSymbols: string[];
  lockedSymbolCount: number;
  lockReason: string | null;
  storageBytes: number;
  createdAt: string;
  updatedAt: string;
  lastJob: {
    id: string;
    status: LocalDataImportJobStatus;
    stage: LocalDataImportJobStage;
    progressPercent: number;
    compactProgressPercent: number;
    compactBeforeBytes: number;
    compactAfterBytes: number;
    compactReclaimedBytes: number;
    doneFiles: number;
    totalFiles: number;
    errorFiles: number;
    startedAt: string | null;
    finishedAt: string | null;
  } | null;
};

export type LocalDataSourceDiagnosticProfileOrigin =
  | 'SYSTEM'
  | 'INFERRED'
  | 'USER';

export type LocalDataSourceDiagnosticProfile = {
  assetClass: TradingAssetClass;
  marketPresetId: string;
  profileOrigin: LocalDataSourceDiagnosticProfileOrigin;
};

export type LocalDataSourceDiagnosticStatus =
  | 'READY'
  | 'BUILDING'
  | 'FAILED';

export type LocalDataSourceDiagnosticCategory =
  | 'TIME_INTEGRITY'
  | 'EXTREME_ANOMALY';

export type LocalDataSourceDiagnosticSeverity =
  | 'INFO'
  | 'WARNING'
  | 'CRITICAL';

export type LocalDataSourceDiagnosticCode =
  | 'INVALID_OHLC'
  | 'DUPLICATE_TIMESTAMP'
  | 'TIME_ORDER_BREAK'
  | 'DATA_GAP'
  | 'OUT_OF_SESSION_BAR'
  | 'TIMEFRAME_MISALIGNED_BAR'
  | 'EXTREME_PRICE_SPIKE';

export type LocalDataSourceDiagnosticsIssue = {
  id: string;
  instrumentId: string;
  symbol: string;
  category: LocalDataSourceDiagnosticCategory;
  code: LocalDataSourceDiagnosticCode;
  severity: LocalDataSourceDiagnosticSeverity;
  dateLabel: string;
  focusBarIndex: number;
  focusStartTs: string | null;
  focusEndTs: string | null;
  missingBars: number;
  ratio: number;
  volumeRatio: number;
  closeChangeRatio: number;
  amplitudeRatio: number;
  zScore: number;
  multiple: number;
  count: number;
};

export type LocalDataSourceDiagnosticsSymbolSummary = {
  instrumentId: string;
  symbol: string;
  totalBars: number;
  issueCount: number;
  criticalIssues: number;
  warningIssues: number;
  infoIssues: number;
  healthScore: number;
  volatilityPercent: number;
  highPrice: number;
  lowPrice: number;
  timeStartTs: string | null;
  timeEndTs: string | null;
};

export type LocalDataSourceDiagnostics = {
  sourceId: string;
  baseTimeframe: '1m' | '5m' | '1h' | '1d';
  diagnosticRulesVersion: string;
  status: LocalDataSourceDiagnosticStatus;
  generatedAt: string | null;
  profile: LocalDataSourceDiagnosticProfile;
  health: {
    score: number;
    severity: LocalDataSourceDiagnosticSeverity;
    affectedSymbols: number;
  };
  totalSymbols: number;
  scannedSymbols: number;
  affectedSymbols: number;
  totalIssues: number;
  summary: {
    totalIssues: number;
    criticalIssues: number;
    warningIssues: number;
    infoIssues: number;
    byCategory: Record<LocalDataSourceDiagnosticCategory, number>;
  };
  symbols: LocalDataSourceDiagnosticsSymbolSummary[];
  items: LocalDataSourceDiagnosticsIssue[];
  nextCursor: string | null;
};

export type LocalDataSourceSymbolDiagnostics = {
  symbol: string;
  baseTimeframe: LocalDataSourceDiagnostics['baseTimeframe'];
  diagnosticRulesVersion: string;
  status: LocalDataSourceDiagnosticStatus;
  generatedAt: string | null;
  profile: LocalDataSourceDiagnosticProfile;
  health: LocalDataSourceDiagnostics['health'];
  totalBars: number;
  summary: LocalDataSourceDiagnostics['summary'];
  items: LocalDataSourceDiagnosticsIssue[];
};

export type LocalDataImportSymbolLimit = {
  limitApplied: boolean;
  maxSymbols: number | null;
  selectedSymbols: string[];
  skippedSymbols: string[];
  skippedSymbolCount: number;
  reason: null;
};

export type LocalDataImportJobDetail = {
  id: string;
  sourceId: string;
  sourceName: string;
  timeZone: string;
  baseTimeframe: '1m' | '5m' | '1h' | '1d';
  jobMode: LocalDataImportJobMode;
  status: LocalDataImportJobStatus;
  stage: LocalDataImportJobStage;
  progressPercent: number;
  compactProgressPercent: number;
  compactBeforeBytes: number;
  compactAfterBytes: number;
  compactReclaimedBytes: number;
  totalFiles: number;
  doneFiles: number;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errorFiles: number;
  currentFileName: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  cause: {
    code: string;
    stage: string;
  } | null;
  details: Record<string, string | number | boolean | null> | null;
  failureSummary: {
    totalFailedFiles: number;
    primaryCode: string | null;
    items: Array<{
      code: string;
      stage: string;
      fileName: string | null;
      count: number;
    }>;
  } | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  isPaused: boolean;
  cancelRequested: boolean;
  outcomeSummary: LocalDataImportOutcomeSummary | null;
  outcomeInsight: LocalDataImportOutcomeInsight | null;
  phaseFacts: LocalDataImportJobPhaseFacts;
  symbolLimit: LocalDataImportSymbolLimit;
  failedFiles: Array<{
    id: string;
    fileName: string;
    symbol: string;
    rowsTotal: number;
    rowsImported: number;
    rowsSkipped: number;
    errorMessage: string;
    errorCode: string;
    cause: {
      code: string;
      stage: string;
    };
    details: Record<string, string | number | boolean | null>;
    diagnostics: Array<{
      code: string;
      severity: 'INFO' | 'WARNING' | 'ERROR';
      stage: string;
      fileName: string | null;
      relativePath: string | null;
      format: string | null;
      field: string | null;
      rowNumber: number | null;
      rawValue: string | null;
      expected: string | null;
      actual: string | number | boolean | null;
      samples: Array<Record<string, string | number | boolean | null>>;
    }>;
    updatedAt: string;
  }>;
};

export type StartLocalDataImportInput = {
  sourceId?: string;
  sourceName: string;
  sourceFolder?: string;
  sourceFolderBookmarkId?: string;
  importScopeStrategy?: LocalDataImportScopeStrategy | null;
  importScopeTopLevelSubfolder?: string;
  sourceFolderUsageMode?: LocalDataSourceFolderUsageMode;
  timeZone?: string;
  timeZoneOrigin?: TimeZoneOrigin;
  allowExistingSourceTimeZoneChange?: boolean;
  baseTimeframe: '1m' | '5m' | '1h' | '1d';
  tradingCalendar?: TradingCalendarConfig;
  diagnosticProfile?: LocalDataSourceDiagnosticProfile;
  jobMode?: LocalDataImportJobMode;
  mapping: CsvFieldMapping;
  tempDirPaths?: string[];
  files: Array<{
    originalname: string;
    path: string;
    size: number;
    symbol?: string;
    mtimeMs?: number;
    fingerprint?: string;
    mapping?: CsvFieldMapping;
  }>;
  snapshotSymbols?: string[];
  sourceTotalFiles?: number;
  symbolLimit?: LocalDataImportSymbolLimit;
};

export type StartLocalDataImportUserOverrides = {
  sourceName: string;
  sourceFolder?: string;
  sourceFolderBookmarkId?: string;
  timeZone?: string;
  timeZoneOrigin?: TimeZoneOrigin;
  tradingCalendar?: TradingCalendarConfig;
};

export type StartLocalDataImportByPreviewPlanInput = {
  previewToken: string;
  previewPlanId: string;
  mapping?: CsvFieldMapping;
  userOverrides?: Partial<StartLocalDataImportUserOverrides>;
};

export type StartLocalDataFullReimportByPreviewPlanInput = {
  sourceId: string;
  previewToken: string;
  previewPlanId: string;
  mapping?: CsvFieldMapping;
  userOverrides?: Partial<StartLocalDataImportUserOverrides> & {
    allowExistingSourceTimeZoneChange?: boolean;
  };
};

export type StartLocalDataIncrementalUpdateByPreviewPlanInput = {
  sourceId: string;
  previewToken: string;
  previewPlanId: string;
  mapping?: CsvFieldMapping;
  userOverrides?: {
    sourceName?: string;
    sourceFolder?: string;
    sourceFolderBookmarkId?: string;
    sourceFolderUsageMode?: LocalDataSourceFolderUsageMode;
  };
};

export type PreviewLocalDataImportFolderTimeZoneSuggestion = {
  timeZone: string;
  reason: TimeZoneSuggestionReason;
};

export type LocalDataImportFieldDiagnostic = {
  field: 'date' | 'time' | 'open' | 'high' | 'low' | 'close' | 'volume';
  status: 'MATCHED' | 'MISSING' | 'CONFLICT';
  selectedHeader: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  candidates: Array<{
    header: string;
    score: number;
    reason: string;
    family: 'RAW' | 'ADJUSTED' | 'GENERIC';
  }>;
};

export type LocalDataImportRepairSummary = {
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

export type LocalDataImportMappingProfile = {
  canonicalSchemaKey: string;
  priceFamily: 'RAW' | 'ADJUSTED' | 'GENERIC';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  score: number;
  conflicts: string[];
};

export type LocalDataImportTimeZoneSuggestion = {
  timeZone: string;
  reason: TimeZoneSuggestionReason;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
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

export type LocalDataImportTradingCalendarSuggestion =
  TradingCalendarSuggestion;

export type LocalDataImportSchemaDiagnostics = {
  canonicalSchemaKey: string;
  validSchemaCount: number;
  inconsistentFiles: Array<{
    relativePath: string;
    reason: string;
    canonicalSchemaKey: string;
    conflicts: string[];
  }>;
};

export type LocalDataSyncPreviewScopeCandidate = {
  previewPlanId: string;
  strategy: LocalDataImportScopeStrategy;
  topLevelSubfolder: string;
  symbolCount: number;
  fileCount: number;
};

export type LocalDataSyncQuickCheckStatus =
  | 'NO_CHANGES'
  | 'POTENTIAL_CHANGES'
  | 'UNABLE_TO_CHECK';

export type LocalDataSyncQuickCheckFileMetadata = {
  relativePath: string;
  originalname?: string;
  size: number;
  mtimeMs: number;
  fingerprint?: string;
};

export type LocalDataSyncQuickCheck = {
  sourceId: string;
  sourceName: string;
  sourceFolder: string;
  baseTimeframe: '1m' | '5m' | '1h' | '1d';
  status: LocalDataSyncQuickCheckStatus;
  reasonCode: string;
  checkedAt: string;
  estimatedChangedFiles: number;
  estimatedChangedSymbols: number;
  detectedFiles: number;
  trackedFiles: number;
  changedSymbols: string[];
  changedRelativePaths: string[];
  fingerprintRequiredRelativePaths: string[];
  missingSymbolsRetained: string[];
  snapshotSymbols: string[];
  invalidFiles: number;
  symbolLimit: LocalDataImportSymbolLimit;
};

export type LocalDataSyncPreview = {
  sourceId: string;
  sourceName: string;
  sourceFolder: string;
  sourceFolderUsageMode: LocalDataSourceFolderUsageMode;
  baseTimeframe: '1m' | '5m' | '1h' | '1d';
  timeZone: string;
  timeZoneOrigin: TimeZoneOrigin;
  importScopeStrategy: LocalDataImportScopeStrategy | null;
  importScopeTopLevelSubfolder: string;
  matchedPreviewPlanId: string | null;
  scopeCandidates: LocalDataSyncPreviewScopeCandidate[];
  requiresScopeConfirmation: boolean;
  changeSummary: {
    changedFiles: number;
    unchangedFiles: number;
    addedSymbols: string[];
    updatedSymbols: string[];
    missingSymbolsRetained: string[];
    symbolLimit: LocalDataImportSymbolLimit;
  };
};
