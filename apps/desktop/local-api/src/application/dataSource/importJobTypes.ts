// SPDX-License-Identifier: GPL-3.0-only

import type {
  CsvBatchImportFileResult,
  CsvImportProgressEvent,
} from "./tabularImport.js";
import type { CsvFieldMapping } from "../../domain/dataSource/csvFieldMappingTypes.js";
import type {
  LocalDataImportJobMode,
  LocalDataSourceFolderUsageMode,
} from "./types.js";

export type QueuedImportFile = {
  fileRowId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  symbol: string;
  mapping?: CsvFieldMapping;
};

export type QueuedImportJob = {
  sourceId: string;
  sourceName: string;
  baseTimeframe: "1m" | "5m" | "1h" | "1d";
  jobMode: LocalDataImportJobMode;
  sourceFolderUsageMode: LocalDataSourceFolderUsageMode;
  timezone: string;
  jobId: string;
  sourceTotalFiles?: number;
  tempDirPaths?: string[];
  mapping: CsvFieldMapping;
  files: QueuedImportFile[];
  existingImportedSymbols?: string[];
  replaceExistingSource?: boolean;
  changedSymbols?: string[];
  obsoleteSymbols?: string[];
};

type RunStatement = {
  run: (...args: unknown[]) => unknown;
};

type AllStatement = {
  all: (...args: unknown[]) => unknown[];
};

type JobControlGateState = "CONTINUE" | "CANCELED";

export type ProcessImportJobDeps = {
  nowIso: () => string;
  fileStatusImporting: string;
  fileStatusImported: string;
  fileStatusFailed: string;
  resolveRuntimeImportParallelFiles: () => number;
  resolveImportInitialBatchFiles: (runtimeParallelFiles: number) => number;
  normalizeImportFilePath: (filePath: string) => string | null;
  removeImportTempFilesByPath: (filePaths: string[]) => Promise<void>;
  removeImportTempDirsByPath: (dirPaths: string[]) => Promise<void>;
  updateSourceStatusStmt: RunStatement;
  updateJobRunningStmt: RunStatement;
  ensureImportJobControlState: (jobId: string) => void;
  getImportJobAbortSignal: (jobId: string) => AbortSignal;
  abortImportJob: (jobId: string, reason: unknown) => void;
  importJobExecutionDeadlineMs: number;
  calculateRunningImportProgressPercent: (
    doneFiles: number,
    totalFiles: number,
    hasStartedImporting: boolean,
  ) => number;
  updateJobProgressStmt: RunStatement;
  importCsvFilesBatchedWithProgress: (
    files: ImportCsvInputFileLike[],
    mapping: CsvFieldMapping,
    timezone: string,
    onProgress: (event: CsvImportProgressEvent) => void,
    options: {
      batchSize: number;
      baseTimeframe: "1m" | "5m" | "1h" | "1d";
      sourceId: string;
      signal?: AbortSignal;
    },
  ) => Promise<CsvBatchImportFileResult[]>;
  importCsvFilesIncrementalWithProgress: (
    files: ImportCsvInputFileLike[],
    mapping: CsvFieldMapping,
    timezone: string,
    onProgress: (event: CsvImportProgressEvent) => void,
    options: {
      batchSize: number;
      baseTimeframe: "1m" | "5m" | "1h" | "1d";
      sourceId: string;
      signal?: AbortSignal;
    },
  ) => Promise<CsvBatchImportFileResult[]>;
  readImportJobControlState: (jobId: string) => {
    paused: boolean;
    cancelRequested: boolean;
  };
  createCanceledImportError: () => Error;
  isCanceledImportError: (error: unknown) => boolean;
  updateFileImportingStmt: RunStatement;
  updateFileProgressStmt: RunStatement;
  updateFileImportedStmt: RunStatement;
  updateFileFailedStmt: RunStatement;
  updateFileFailureDetails: (input: {
    fileRowId: string;
    errorCode: string;
    causeJson: string;
    detailsJson: string;
    diagnosticsJson: string;
    updatedAt: string;
  }) => void;
  waitForJobControlRelease: (
    jobId: string,
    signal?: AbortSignal,
  ) => Promise<JobControlGateState>;
  resolveImportBatchSize: (
    files: QueuedImportFile[],
    runtimeParallelLimit: number,
  ) => number;
  listImportedSymbolsBySourceStmt: AllStatement;
  summarizeSourceBars: (sourceId: string) => Promise<{
    symbolCount: number;
    barCount: number;
    startTs: string | null;
    endTs: string | null;
  }>;
  estimateSourceStorageBytesFromCurrentMarket: (
    barCount: number,
    compactAfterBytes?: number,
  ) => Promise<number>;
  calculateFileBasedProgressPercent: (
    doneFiles: number,
    totalFiles: number,
  ) => number;
  updateSourceFinalStmt: RunStatement;
  beforePublishTerminalJob?: () => void;
  updateJobFinalStmt: RunStatement;
  updateJobFailureDetails: (input: {
    jobId: string;
    errorCode: string | null;
    causeJson: string | null;
    detailsJson: string | null;
    failureSummaryJson: string | null;
    updatedAt: string;
  }) => void;
  checkpointMarketStorage: () => Promise<void>;
  clearImportJobControlState: (jobId: string) => void;
  updateJobCompactingProgressStmt: RunStatement;
  importCompactProgressBasePercent: number;
  normalizeCompactProgressPercent: (progressPercent: number) => number;
  normalizeProgressPercent: (progressPercent: number) => number;
  getMarketStorageFootprint: () => Promise<{
    dbBytes: number;
    totalBytes: number;
  }>;
  toSafeStorageBytes: (storageBytes: number) => number;
  updateJobCompactionBaselineStmt: RunStatement;
  countActiveJobs: () => number;
  runMarketMaintenance: (options: {
    deepCompactMode: "always";
    skipVacuumIfLowFragmentation: boolean;
    onProgress: (progress: {
      compactProgressPercent: number;
      progressPercent: number;
    }) => void;
  }) => Promise<{
    footprintBefore: { dbBytes: number; totalBytes: number };
    footprintAfter: { dbBytes: number; totalBytes: number };
    reclaimedBytes: number;
  }>;
  resolveOverallProgressFromMaintenancePercent: (
    maintenanceProgressPercent: number,
  ) => number;
  updateJobCompactionResultStmt: RunStatement;
  updateSourceStorageBytesStmt: RunStatement;
  onImportJobSucceeded?: (payload: {
    jobId: string;
    sourceId: string;
    baseTimeframe: "1m" | "5m" | "1h" | "1d";
    sourceSummary: {
      symbolCount: number;
      barCount: number;
    };
    sourceStorageBytes: number;
    occurredAt: string;
  }) => void | Promise<void>;
  refreshImportedInstrumentDerivedData?: (
    instrumentIds: string[],
  ) => Promise<void>;
  enqueueImportedInstrumentTimelinePrewarm?: (instrumentIds: string[]) => void;
  deleteSourceFilesBySourceSymbolExceptJob: (
    sourceId: string,
    symbol: string,
    currentJobId: string,
  ) => number;
  deleteSourceFilesBySourceSymbol: (sourceId: string, symbol: string) => number;
  getLocalInstrumentBySymbol: (
    sourceId: string,
    symbol: string,
    baseTimeframe: "1m" | "5m" | "1h" | "1d",
  ) => { id: string } | undefined;
  removeMarketInstrumentData: (instrumentId: string) => Promise<void>;
  deleteInstrumentById: (instrumentId: string) => number;
  pruneImportJobHistoryForSource?: (sourceId: string) => void;
  logImportPerformance?: (payload: {
    jobId: string;
    sourceId: string;
    sourceName: string;
    baseTimeframe: "1m" | "5m" | "1h" | "1d";
    outcome: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED" | "CANCELED";
    durationMs: number;
    scanningMs: number;
    importingMs: number;
    finalizingMs: number;
    doneFiles: number;
    totalFiles: number;
    successfulFiles: number;
    errorFiles: number;
    totalRows: number;
    importedRows: number;
    skippedRows: number;
    importBatchCount: number;
    avgBatchSize: number;
    minBatchSize: number;
    maxBatchSize: number;
    avgRuntimeParallelFiles: number;
    minRuntimeParallelFiles: number;
    maxRuntimeParallelFiles: number;
  }) => void;
};

export type ImportCsvInputFileLike = {
  originalname: string;
  path: string;
  mapping?: CsvFieldMapping;
};
