// SPDX-License-Identifier: GPL-3.0-only

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildImportFieldMappingProfile,
  type ImportRuleMappingProfile
} from '@zinuto/shared/importRules';
import { formatMessage, type MessageId } from '@zinuto/shared/i18n';
import { INPUT_LIMITS } from '@zinuto/shared/input-limits';
import { inferTradingCalendarFromTimestamps } from '@zinuto/shared/tradingCalendar';
import type { TimeZoneSuggestionReason } from '@zinuto/shared/timezone';
import type { CsvFieldMapping } from '../../domain/dataSource/csvFieldMappingTypes.js';
import {
  CSV_HEADER_MIN_FIELDS,
  CSV_PREVIEW_MAX_SAMPLED_FILES,
  detectBaseTimeframeFromTimestamps
} from './csvPreviewUtils.js';
import { normalizeFileSize, normalizeProgressPercent } from './importProgress.js';
import { appError } from '../../kernel/appError.js';
import type { SupportedBaseTimeframe, SupportedImportFileFormat } from './supportedFileFormats.js';
import {
  resolveTimeframeFromPathHints
} from './supportedFileFormats.js';
import {
  inferFreeReplayEnvironmentSuggestion,
  type FreeReplayEnvironmentSuggestion
} from './freeReplayEnvironmentSuggestion.js';
import { inferImportTimeZone } from './importTimeZoneInference.js';
import {
  readTabularHeadersFromPath,
  readTabularPreviewRowsFromPath,
  readTabularTimestampSamplesFromPath
} from './tabularFileUtils.js';
import type { PreviewImportPlanRecord } from '../ports/infrastructure/db/dataSource/previewSessionStore.js';
import { runtimeLimits } from '../../kernel/runtimeLimits.js';
import { readAbortReason, throwIfOperationAborted } from './operationAbort.js';
import {
  readMarketDataAcquisitionSourceMetadata,
  type MarketDataAcquisitionSourceMetadata,
} from './marketDataAcquisitionSourceMetadata.js';
import {
  compareTimeframe,
  emitPreviewProgress,
} from './folderPreviewCommon.js';
import {
  buildPlanRecords,
  scanImportFilesRecursively,
} from './folderPreviewPlanning.js';
import {
  assertCsvFileUsesSingleSymbol,
  assertPreviewRowsUseSingleSymbol,
  buildPreviewQualityDiagnostics,
  buildTimeZoneSuggestion,
  collectPreviewTimeZoneRawSamples,
  hasPreviewSymbolColumn,
  toApiFieldDiagnostics,
  toApiMappingProfile,
} from './folderPreviewQualityAnalysis.js';
import type {
  LocalDataImportFieldDiagnostic,
  LocalDataImportMappingProfile,
  LocalDataImportRepairSummary,
  LocalDataImportSchemaDiagnostics,
  LocalDataImportTradingCalendarSuggestion,
  LocalDataImportTimeZoneSuggestion
} from './types.js';

type PreviewImportPlanStrategy = 'FLAT' | 'WITH_PARENT';

export type PreviewImportPlanSummary = {
  id: string;
  strategy: PreviewImportPlanStrategy;
  baseTimeframe: SupportedBaseTimeframe;
  topLevelSubfolder: string;
  symbolCount: number;
  fileCount: number;
};

export type ConfirmableImportPlan = PreviewImportPlanSummary & {
  previewPlanId: string;
  defaultPoolName: string;
};

export type PreviewInvalidFileSample = {
  relativePath: string;
  reason: string;
};

export type PreviewLocalDataImportFolderResult = {
  folderName: string;
  folderPath: string;
  marketDataAcquisitionMetadata: MarketDataAcquisitionSourceMetadata | null;
  suggestedFreeReplayEnvironment: FreeReplayEnvironmentSuggestion | null;
  suggestedTimeZone: string;
  suggestedTimeZoneReason: TimeZoneSuggestionReason;
  timeZoneSuggestion: LocalDataImportTimeZoneSuggestion;
  tradingCalendarSuggestion: LocalDataImportTradingCalendarSuggestion;
  headers: string[];
  defaultMapping: CsvFieldMapping;
  mappingProfile: LocalDataImportMappingProfile;
  fieldDiagnostics: LocalDataImportFieldDiagnostic[];
  repairSummary: LocalDataImportRepairSummary;
  schemaDiagnostics: LocalDataImportSchemaDiagnostics;
  detectedTimeframe: SupportedBaseTimeframe;
  detectedTimeframes: SupportedBaseTimeframe[];
  validSymbolCount: number;
  totalFiles: number;
  validFiles: number;
  invalidFiles: number;
  invalidFileSamples: PreviewInvalidFileSample[];
  planSummaries: PreviewImportPlanSummary[];
  confirmableImportPlans: ConfirmableImportPlan[];
  plans: PreviewImportPlanRecord[];
  sampledFileNames: string[];
  skippedNestedCount: number;
};

export type PreviewLocalDataImportFolderProgressStage =
  | 'SCANNING_FILES'
  | 'READING_HEADERS'
  | 'DETECTING_TIMEFRAMES'
  | 'BUILDING_PLAN'
  | 'CHECKING_QUALITY'
  | 'DONE';

export type PreviewLocalDataImportFolderProgress = {
  stage: PreviewLocalDataImportFolderProgressStage;
  progressPercent: number;
  processedFiles: number;
  totalFiles: number;
};

export type PreviewLocalDataImportFolderProgressReporter = (
  progress: PreviewLocalDataImportFolderProgress
) => void;

type PreviewLocalDataImportFolderDeps = {
  normalizeImportFilePath: (input: string) => string;
  assertManagedImportTempPath: (filePath: string) => void;
  parseSymbolFromFileName: (fileName: string) => string;
  createId: () => string;
};

type ScannedImportFile = {
  originalname: string;
  path: string;
  size: number;
  mtimeMs: number;
  fingerprint: string;
  symbol: string;
  relativePath: string;
  fileFormat: SupportedImportFileFormat;
};

type ValidatedImportFile = ScannedImportFile & {
  detectedTimeframe: SupportedBaseTimeframe;
  headers: string[];
  mapping: CsvFieldMapping;
  mappingProfile: ImportRuleMappingProfile;
};

type InvalidImportFile = PreviewInvalidFileSample;

type HeaderValidationResult =
  | {
      status: 'header';
      file: ScannedImportFile;
      headers: string[];
      mappingProfile: ImportRuleMappingProfile;
    }
  | {
      status: 'invalid';
      invalid: InvalidImportFile;
    };

type ValidFileCandidate = {
  file: ScannedImportFile;
  headers: string[];
  mapping: CsvFieldMapping;
  mappingProfile: ImportRuleMappingProfile;
  pathHintTimeframe: SupportedBaseTimeframe | null;
};

const PREVIEW_SCAN_PARALLEL_FILES = Math.max(1, Math.min(6, runtimeLimits.importParallelFiles));
const PREVIEW_INVALID_SAMPLE_LIMIT = 12;
const PREVIEW_QUALITY_SAMPLE_FILE_LIMIT = 6;
const IMPORT_PLAN_TIMEFRAME_MESSAGE_IDS: Record<SupportedBaseTimeframe, MessageId> = {
  '1m': 'uiConfig.displayPeriod.1m',
  '5m': 'uiConfig.displayPeriod.5m',
  '1h': 'uiConfig.displayPeriod.1h',
  '1d': 'uiConfig.displayPeriod.1d',
};
const PREVIEW_STRATEGY_ORDER: PreviewImportPlanStrategy[] = ['FLAT', 'WITH_PARENT'];
export const PREVIEW_PROGRESS_COMMIT_MIN_INTERVAL_MS = 125;
const PREVIEW_PROGRESS_COMMIT_MIN_PERCENT_DELTA = 1;

export type PreviewProgressCommitState = {
  lastCommittedAtMs: number | null;
  lastProgress: PreviewLocalDataImportFolderProgress | null;
};

export const normalizePreviewLocalDataImportFolderProgress = (
  progress: PreviewLocalDataImportFolderProgress
): PreviewLocalDataImportFolderProgress => ({
  stage: progress.stage,
  progressPercent: normalizeProgressPercent(progress.progressPercent),
  processedFiles: Math.max(0, Math.floor(Number(progress.processedFiles) || 0)),
  totalFiles: Math.max(0, Math.floor(Number(progress.totalFiles) || 0))
});

export const shouldCommitPreviewProgressUpdate = (
  state: PreviewProgressCommitState,
  progressRaw: PreviewLocalDataImportFolderProgress,
  nowMs: number,
): boolean => {
  const progress = normalizePreviewLocalDataImportFolderProgress(progressRaw);
  const last = state.lastProgress;
  if (!last) {
    return true;
  }
  if (progress.stage === 'DONE') {
    return true;
  }
  if (progress.stage !== last.stage) {
    return true;
  }
  if (Math.abs(progress.progressPercent - last.progressPercent) >= PREVIEW_PROGRESS_COMMIT_MIN_PERCENT_DELTA) {
    return true;
  }
  if (
    progress.processedFiles === last.processedFiles &&
    progress.totalFiles === last.totalFiles
  ) {
    return false;
  }
  if (state.lastCommittedAtMs === null) {
    return true;
  }
  return nowMs - state.lastCommittedAtMs >= PREVIEW_PROGRESS_COMMIT_MIN_INTERVAL_MS;
};

const comparePreviewStrategy = (
  left: PreviewImportPlanStrategy,
  right: PreviewImportPlanStrategy
): number => PREVIEW_STRATEGY_ORDER.indexOf(left) - PREVIEW_STRATEGY_ORDER.indexOf(right);

const normalizePreviewPoolNameSegment = (input: string): string =>
  String(input || '')
    .trim()
    .replace(/[/\\]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

const trimSamplePoolName = (input: string): string =>
  String(input || '')
    .trim()
    .slice(0, INPUT_LIMITS.samplePoolNameChars)
    .trim();

const buildConfirmablePlanDefaultPoolName = (
  folderName: string,
  plan: PreviewImportPlanSummary,
  locale: string,
): string => {
  const basePrefix =
    normalizePreviewPoolNameSegment(folderName) ||
    normalizePreviewPoolNameSegment(formatMessage(locale, 'app.samplePool.unnamed'));
  const timeframeLabel =
    normalizePreviewPoolNameSegment(
      formatMessage(locale, IMPORT_PLAN_TIMEFRAME_MESSAGE_IDS[plan.baseTimeframe]),
    ) || plan.baseTimeframe;
  const topLevelSubfolder = normalizePreviewPoolNameSegment(plan.topLevelSubfolder);
  const suffix =
    plan.strategy === 'WITH_PARENT' && topLevelSubfolder
      ? `${topLevelSubfolder}-${timeframeLabel}`
      : timeframeLabel;
  const boundedSuffix = suffix.slice(-INPUT_LIMITS.samplePoolNameChars);
  const prefixLimit = Math.max(
    0,
    INPUT_LIMITS.samplePoolNameChars - boundedSuffix.length - 1,
  );
  const boundedPrefix = basePrefix.slice(0, prefixLimit);
  return trimSamplePoolName(
    normalizePreviewPoolNameSegment(
      boundedPrefix ? `${boundedPrefix}-${boundedSuffix}` : boundedSuffix,
    ) || timeframeLabel,
  );
};

const mapWithConcurrencyLimit = async <T, R>(
  items: T[],
  concurrencyLimitRaw: number,
  mapper: (item: T, index: number) => Promise<R>,
  onItemComplete?: (item: T, index: number) => void,
  signal?: AbortSignal,
): Promise<R[]> => {
  const concurrencyLimit = Math.max(1, Math.floor(Number(concurrencyLimitRaw) || 0));
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrencyLimit, items.length) }, async () => {
    while (true) {
      throwIfOperationAborted(signal);
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      try {
        results[index] = await mapper(items[index], index);
      } finally {
        onItemComplete?.(items[index], index);
      }
    }
  });
  const workerSettlements = await Promise.allSettled(workers);
  const failedWorker = workerSettlements.find(
    (settlement): settlement is PromiseRejectedResult => settlement.status === 'rejected'
  );
  if (signal?.aborted) {
    throw readAbortReason(signal);
  }
  if (failedWorker) {
    throw failedWorker.reason;
  }
  return results;
};

const readPreviewFileStat = async (filePath: string) => {
  try {
    return await fs.stat(filePath);
  } catch {
    throw appError('CSV_FILE_MISSING', { filePath });
  }
};

const capturePreviewFileSnapshot = async (
  file: ScannedImportFile,
  signal?: AbortSignal,
): Promise<ScannedImportFile> => {
  throwIfOperationAborted(signal);
  const beforeStat = await readPreviewFileStat(file.path);
  const beforeSize = normalizeFileSize(beforeStat.size);
  const beforeMtimeMs = Math.max(0, Math.floor(Number(beforeStat.mtimeMs) || 0));
  if (
    !beforeStat.isFile() ||
    beforeSize !== file.size ||
    beforeMtimeMs !== file.mtimeMs
  ) {
    throw appError('LOCAL_DATA_IMPORT_PREVIEW_EXPIRED', { filePath: file.path });
  }

  const hash = createHash('sha256');
  const reader = createReadStream(file.path);
  try {
    for await (const chunk of reader) {
      throwIfOperationAborted(signal);
      hash.update(chunk);
    }
  } catch (error) {
    if (signal?.aborted) {
      throw readAbortReason(signal);
    }
    const code = String((error as { code?: unknown } | null)?.code || '').trim();
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw appError('CSV_FILE_MISSING', { filePath: file.path });
    }
    throw error;
  } finally {
    reader.destroy();
  }

  const afterStat = await readPreviewFileStat(file.path);
  const afterSize = normalizeFileSize(afterStat.size);
  const afterMtimeMs = Math.max(0, Math.floor(Number(afterStat.mtimeMs) || 0));
  if (
    !afterStat.isFile() ||
    afterSize !== beforeSize ||
    afterMtimeMs !== beforeMtimeMs
  ) {
    throw appError('LOCAL_DATA_IMPORT_PREVIEW_EXPIRED', { filePath: file.path });
  }
  return {
    ...file,
    size: afterSize,
    mtimeMs: afterMtimeMs,
    fingerprint: `sha256:${hash.digest('hex').toLowerCase()}`,
  };
};

export const previewLocalDataImportFolderCore = async (
  folderPathRaw: string,
  deps: PreviewLocalDataImportFolderDeps,
  options?: {
    existingSourceTimeZone?: string;
    locale?: string;
    sourceFolderName?: string;
    onProgress?: PreviewLocalDataImportFolderProgressReporter;
    signal?: AbortSignal;
  }
): Promise<PreviewLocalDataImportFolderResult> => {
  const signal = options?.signal;
  const progressReporter: PreviewLocalDataImportFolderProgressReporter = (progress) => {
    throwIfOperationAborted(signal);
    options?.onProgress?.(progress);
  };
  throwIfOperationAborted(signal);
  const locale = String(options?.locale || '').trim();
  const normalizedFolderPath = deps.normalizeImportFilePath(folderPathRaw);
  if (!normalizedFolderPath) {
    throw appError('INVALID_PARAMS');
  }
  deps.assertManagedImportTempPath(normalizedFolderPath);

  let folderStat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    folderStat = await fs.stat(normalizedFolderPath);
    throwIfOperationAborted(signal);
  } catch (error) {
    if (signal?.aborted) {
      throw readAbortReason(signal);
    }
    throw appError('CSV_FILE_MISSING', { filePath: normalizedFolderPath });
  }
  if (!folderStat.isDirectory()) {
    throw appError('CSV_FILE_MISSING', { filePath: normalizedFolderPath });
  }

  const marketDataAcquisitionMetadata =
    await readMarketDataAcquisitionSourceMetadata(normalizedFolderPath);
  throwIfOperationAborted(signal);

  emitPreviewProgress(progressReporter, {
    stage: 'SCANNING_FILES',
    progressPercent: 0,
    processedFiles: 0,
    totalFiles: 0
  });
  const scannedFiles = await scanImportFilesRecursively(
    normalizedFolderPath,
    deps,
    progressReporter,
    signal,
  );
  const files = await mapWithConcurrencyLimit(
    scannedFiles,
    PREVIEW_SCAN_PARALLEL_FILES,
    (file) => capturePreviewFileSnapshot(file, signal),
    undefined,
    signal,
  );
  emitPreviewProgress(progressReporter, {
    stage: 'SCANNING_FILES',
    progressPercent: files.length ? 10 : 0,
    processedFiles: files.length,
    totalFiles: files.length
  });

  if (!files.length) {
    throw appError('CSV_FOLDER_NO_FILES', { folderPath: normalizedFolderPath });
  }

  const importFormatSet = new Set(files.map((file) => file.fileFormat));
  if (importFormatSet.size > 1) {
    throw appError('CSV_IMPORT_FORMAT_INCONSISTENT', {
      formats: Array.from(importFormatSet.values()).join('/')
    });
  }

  const sampledFileNames = files
    .slice(0, Math.min(CSV_PREVIEW_MAX_SAMPLED_FILES, files.length))
    .map((file) => file.originalname);
  const suggestedFreeReplayEnvironment = inferFreeReplayEnvironmentSuggestion({
    folderName: path.basename(normalizedFolderPath) || normalizedFolderPath,
    folderPath: normalizedFolderPath,
    files: files.map((file) => ({
      originalname: file.originalname,
      relativePath: file.relativePath,
      symbol: file.symbol
    }))
  });

  let processedHeaderFiles = 0;
  emitPreviewProgress(progressReporter, {
    stage: 'READING_HEADERS',
    progressPercent: 10,
    processedFiles: processedHeaderFiles,
    totalFiles: files.length
  });
  const headerValidationResults = await mapWithConcurrencyLimit(
    files,
    PREVIEW_SCAN_PARALLEL_FILES,
    async (file): Promise<HeaderValidationResult> => {
      const relativePath = file.relativePath || file.originalname;
      if (!file.symbol) {
        return {
          status: 'invalid',
          invalid: {
            relativePath,
            reason: 'CSV_FILENAME_INVALID'
          }
        };
      }
      try {
        const { headers } = await readTabularHeadersFromPath(file.path, appError, signal);
        return {
          status: 'header',
          file,
          headers,
          mappingProfile: buildImportFieldMappingProfile(headers)
        };
      } catch (error) {
        if (signal?.aborted) {
          throw readAbortReason(signal);
        }
        return {
          status: 'invalid',
          invalid: {
            relativePath,
            reason: 'CSV_HEADER_READ_FAILED'
          }
        };
      }
    },
    () => {
      processedHeaderFiles += 1;
      emitPreviewProgress(progressReporter, {
        stage: 'READING_HEADERS',
        progressPercent: 10 + (processedHeaderFiles / files.length) * 35,
        processedFiles: processedHeaderFiles,
        totalFiles: files.length
      });
    },
    signal,
  );

  const firstHeaderResult =
    headerValidationResults.find(
      (item): item is Extract<HeaderValidationResult, { status: 'header' }> =>
        item.status === 'header' && item.headers.length >= CSV_HEADER_MIN_FIELDS
    ) ?? null;

  if (!firstHeaderResult) {
    throw appError('CSV_HEADER_READ_FAILED', { filePath: files[0]?.path ?? normalizedFolderPath });
  }

  const primaryHeaderResult =
    headerValidationResults.find(
      (item): item is Extract<HeaderValidationResult, { status: 'header' }> =>
        item.status === 'header' &&
        item.headers.length >= CSV_HEADER_MIN_FIELDS &&
        item.mappingProfile.isImportable
    ) ?? null;

  if (!primaryHeaderResult) {
    throw appError('CSV_HEADER_SCHEMA_INCONSISTENT');
  }

  const firstHeader = primaryHeaderResult.headers;
  const primaryProfile = primaryHeaderResult.mappingProfile;
  const defaultMapping = primaryProfile.mapping;
  const primaryCanonicalSchemaKey = primaryProfile.canonicalSchemaKey;
  const validFileCandidates: ValidFileCandidate[] = [];
  const invalidFiles: InvalidImportFile[] = [];
  const inconsistentFiles: LocalDataImportSchemaDiagnostics['inconsistentFiles'] = [];
  const importableSchemaKeys = new Set<string>();
  headerValidationResults.forEach((item) => {
    if (item.status === 'invalid') {
      invalidFiles.push(item.invalid);
      return;
    }
    const relativePath = item.file.relativePath || item.file.originalname;
    if (item.headers.length < CSV_HEADER_MIN_FIELDS) {
      invalidFiles.push({
        relativePath,
        reason: 'CSV_HEADER_READ_FAILED'
      });
      return;
    }
    const profile = item.mappingProfile;
    if (profile.isImportable) {
      importableSchemaKeys.add(profile.canonicalSchemaKey);
    }
    if (!profile.isImportable) {
      invalidFiles.push({
        relativePath,
        reason: 'CSV_HEADER_SCHEMA_INCONSISTENT'
      });
      inconsistentFiles.push({
        relativePath,
        reason: profile.conflicts[0] ?? 'CSV_HEADER_SCHEMA_INCONSISTENT',
        canonicalSchemaKey: profile.canonicalSchemaKey,
        conflicts: [...profile.conflicts]
      });
      return;
    }
    if (profile.canonicalSchemaKey !== primaryCanonicalSchemaKey) {
      invalidFiles.push({
        relativePath,
        reason: 'CSV_HEADER_SCHEMA_INCONSISTENT'
      });
      inconsistentFiles.push({
        relativePath,
        reason: 'CANONICAL_SCHEMA_MISMATCH',
        canonicalSchemaKey: profile.canonicalSchemaKey,
        conflicts: [...profile.conflicts]
      });
      return;
    }
    validFileCandidates.push({
      file: item.file,
      headers: item.headers,
      mapping: profile.mapping,
      mappingProfile: profile,
      pathHintTimeframe: resolveTimeframeFromPathHints(relativePath)
    });
  });

  if (!validFileCandidates.length) {
    throw appError('CSV_HEADER_SCHEMA_INCONSISTENT');
  }

  let processedTimeframeFiles = 0;
  emitPreviewProgress(progressReporter, {
    stage: 'DETECTING_TIMEFRAMES',
    progressPercent: 45,
    processedFiles: processedTimeframeFiles,
    totalFiles: validFileCandidates.length
  });
  const detectedCandidates = await mapWithConcurrencyLimit(
    validFileCandidates,
    PREVIEW_SCAN_PARALLEL_FILES,
    async (
      item,
    ): Promise<{
      relativePath: string;
      pathHintTimeframe: SupportedBaseTimeframe | null;
      detectedTimeframe: SupportedBaseTimeframe | null;
      hasDataRows: boolean;
      hasParseableTimestamp: boolean;
    }> => {
      const relativePath = item.file.relativePath || item.file.originalname;
      try {
        const [timestampSamples, previewRows] = await Promise.all([
          readTabularTimestampSamplesFromPath(
            item.file.path,
            item.mapping,
            96,
            'Etc/UTC',
            signal,
          ),
          readTabularPreviewRowsFromPath(item.file.path, undefined, signal),
          item.file.fileFormat === 'csv' && hasPreviewSymbolColumn(item.headers)
            ? assertCsvFileUsesSingleSymbol(item.file.path, signal)
            : Promise.resolve(),
        ]);
        if (item.file.fileFormat !== 'csv') {
          assertPreviewRowsUseSingleSymbol(
            relativePath,
            previewRows.headers,
            previewRows.rows,
          );
        }
        const detectedFromData = detectBaseTimeframeFromTimestamps(
          timestampSamples.map((sample) => sample.parsedMs),
        );
        const acquisitionTimeframeHint =
          marketDataAcquisitionMetadata &&
          marketDataAcquisitionMetadata.schemaVersion !== 1 &&
          marketDataAcquisitionMetadata.importSymbols.includes(item.file.symbol)
            ? marketDataAcquisitionMetadata.timeframe
            : null;
        return {
          relativePath,
          pathHintTimeframe: item.pathHintTimeframe,
          detectedTimeframe:
            detectedFromData ??
            item.pathHintTimeframe ??
            acquisitionTimeframeHint,
          hasDataRows: previewRows.rows.length > 0,
          hasParseableTimestamp: timestampSamples.length > 0,
        };
      } catch (error) {
        if (signal?.aborted) {
          throw readAbortReason(signal);
        }
        if (
          String((error as { code?: unknown } | null)?.code || '') ===
          'CSV_SYMBOL_COLUMN_MIXED'
        ) {
          throw error;
        }
        return {
          relativePath,
          pathHintTimeframe: item.pathHintTimeframe,
          detectedTimeframe: null,
          hasDataRows: true,
          hasParseableTimestamp: false,
        };
      }
    },
    () => {
      processedTimeframeFiles += 1;
      emitPreviewProgress(progressReporter, {
        stage: 'DETECTING_TIMEFRAMES',
        progressPercent: 45 + (processedTimeframeFiles / validFileCandidates.length) * 25,
        processedFiles: processedTimeframeFiles,
        totalFiles: validFileCandidates.length
      });
    },
    signal,
  );
  const detectedTimeframeByPath = new Map<string, SupportedBaseTimeframe>();
  detectedCandidates.forEach((item) => {
    if (!item.hasDataRows) {
      invalidFiles.push({
        relativePath: item.relativePath,
        reason: 'CSV_NO_VALID_BARS',
      });
      return;
    }
    if (!item.hasParseableTimestamp) {
      invalidFiles.push({
        relativePath: item.relativePath,
        reason: 'CSV_TIMEFRAME_INVALID',
      });
      return;
    }
    if (!item.detectedTimeframe) {
      invalidFiles.push({
        relativePath: item.relativePath,
        reason: 'CSV_TIMEFRAME_INVALID',
      });
      return;
    }
    detectedTimeframeByPath.set(item.relativePath, item.detectedTimeframe);
  });

  const validFiles: ValidatedImportFile[] = validFileCandidates
    .map((item) => {
      const relativePath = item.file.relativePath || item.file.originalname;
      const detectedTimeframe = detectedTimeframeByPath.get(relativePath);
      if (!detectedTimeframe) {
        return null;
      }
      return {
        ...item.file,
        detectedTimeframe,
        headers: item.headers,
        mapping: item.mapping,
        mappingProfile: item.mappingProfile,
      };
    })
    .filter((item): item is ValidatedImportFile => item !== null);
  const detectedTimeframes = Array.from(
    new Set(validFiles.map((file) => file.detectedTimeframe)),
  ).sort(compareTimeframe);
  const resolvedFolderTimeframe = detectedTimeframes[0] ?? null;

  if (!resolvedFolderTimeframe) {
    const noValidBarsFile = invalidFiles.find(
      (item) => item.reason === 'CSV_NO_VALID_BARS',
    )?.relativePath;
    if (noValidBarsFile) {
      throw appError('CSV_NO_VALID_BARS', { fileName: noValidBarsFile });
    }
    const unresolvedCandidate =
      invalidFiles.find((item) => item.reason === 'CSV_TIMEFRAME_INVALID')
        ?.relativePath ||
      validFileCandidates[0]?.file.relativePath ||
      validFileCandidates[0]?.file.originalname ||
      "";
    throw appError("CSV_TIMEFRAME_INVALID", { value: unresolvedCandidate });
  }
  const folderName =
    String(options?.sourceFolderName || '').trim() ||
    path.basename(normalizedFolderPath) ||
    normalizedFolderPath;
  emitPreviewProgress(progressReporter, {
    stage: 'BUILDING_PLAN',
    progressPercent: 72,
    processedFiles: 0,
    totalFiles: validFiles.length
  });
  const withParentPlans = buildPlanRecords(validFiles, 'WITH_PARENT', deps.createId);
  let flatPlans: PreviewImportPlanRecord[] = [];
  let flatDuplicateError: unknown = null;
  try {
    flatPlans = buildPlanRecords(validFiles, 'FLAT', deps.createId);
  } catch (error) {
    if (
      String((error as { code?: unknown } | null)?.code || '') !==
      'LOCAL_DATA_IMPORT_DUPLICATE_SYMBOL_IN_POOL'
    ) {
      throw error;
    }
    flatDuplicateError = error;
  }
  if (!flatPlans.length && !withParentPlans.length && flatDuplicateError) {
    throw flatDuplicateError;
  }
  const plans = [
    ...flatPlans,
    ...withParentPlans,
  ].sort((left, right) => {
    const strategyOrder = comparePreviewStrategy(left.strategy, right.strategy);
    if (strategyOrder !== 0) {
      return strategyOrder;
    }
    const timeframeOrder = compareTimeframe(left.baseTimeframe, right.baseTimeframe);
    if (timeframeOrder !== 0) {
      return timeframeOrder;
    }
    return left.topLevelSubfolder.localeCompare(right.topLevelSubfolder, 'en');
  });
  const planSummaries = plans.map((plan) => ({
    id: plan.id,
    strategy: plan.strategy,
    baseTimeframe: plan.baseTimeframe,
    topLevelSubfolder: plan.topLevelSubfolder,
    symbolCount: plan.symbolCount,
    fileCount: plan.fileCount
  }));
  const confirmableImportPlans = planSummaries.map((plan) => ({
    ...plan,
    previewPlanId: plan.id,
    defaultPoolName: buildConfirmablePlanDefaultPoolName(folderName, plan, locale),
  }));
  const validSymbolSet = new Set<string>();
  validFiles.forEach((file) => {
    if (file.symbol) {
      validSymbolSet.add(file.symbol);
    }
  });
  const validSymbols = Array.from(validSymbolSet).sort();
  const metadataImportSymbols = marketDataAcquisitionMetadata
    ? [...marketDataAcquisitionMetadata.importSymbols].sort()
    : [];
  const verifiedMarketDataAcquisitionMetadata =
    marketDataAcquisitionMetadata &&
    invalidFiles.length === 0 &&
    validFiles.length === files.length &&
    validFiles.length === marketDataAcquisitionMetadata.importSymbols.length &&
    detectedTimeframes.length === 1 &&
    (marketDataAcquisitionMetadata.schemaVersion === 1 ||
      detectedTimeframes[0] === marketDataAcquisitionMetadata.timeframe) &&
    JSON.stringify(validSymbols) === JSON.stringify(metadataImportSymbols)
      ? marketDataAcquisitionMetadata
      : null;
  const qualitySampleFileCount = Math.min(validFiles.length, PREVIEW_QUALITY_SAMPLE_FILE_LIMIT);
  const qualityProgressTotal = qualitySampleFileCount * 2;
  let qualityProgressDone = 0;
  const reportQualityProgress = (): void => {
    emitPreviewProgress(progressReporter, {
      stage: 'CHECKING_QUALITY',
      progressPercent:
        qualityProgressTotal > 0
          ? 80 + (qualityProgressDone / qualityProgressTotal) * 18
          : 98,
      processedFiles: qualityProgressDone,
      totalFiles: qualityProgressTotal
    });
  };
  emitPreviewProgress(progressReporter, {
    stage: 'CHECKING_QUALITY',
    progressPercent: 80,
    processedFiles: 0,
    totalFiles: qualityProgressTotal
  });
  const timeZoneRawSamples = await collectPreviewTimeZoneRawSamples(validFiles, () => {
    qualityProgressDone += 1;
    reportQualityProgress();
  }, signal);
  // A v3 acquisition notice is accepted only after its listed files, symbols,
  // and timeframe all match the staged payload. At that point its market
  // timezone is more precise than generic timestamp heuristics (which cannot
  // reliably infer an exchange zone from daily bars with an ISO offset).
  // Preserve an explicit existing-source zone when this is a reimport.
  const verifiedAcquisitionTimeZone =
    verifiedMarketDataAcquisitionMetadata?.schemaVersion === 3
      ? verifiedMarketDataAcquisitionMetadata.timeZone === 'UTC'
        ? 'Etc/UTC'
        : verifiedMarketDataAcquisitionMetadata.timeZone
      : undefined;
  const inferredTimeZone = inferImportTimeZone({
    folderName,
    folderPath: normalizedFolderPath,
    files: files.map((file) => ({
      originalname: file.originalname,
      relativePath: file.relativePath,
      symbol: file.symbol
    })),
    freeReplayEnvironmentSuggestion: suggestedFreeReplayEnvironment,
    existingSourceTimeZone:
      options?.existingSourceTimeZone || verifiedAcquisitionTimeZone,
    timestampSamples: timeZoneRawSamples
  });
  const qualityDiagnostics = await buildPreviewQualityDiagnostics(
    validFiles,
    inferredTimeZone.timeZone,
    () => {
      qualityProgressDone += 1;
      reportQualityProgress();
    },
    signal,
  );
  const timeZoneSuggestion = buildTimeZoneSuggestion(
    inferredTimeZone,
    qualityDiagnostics.timeZoneSamples
  );
  const tradingCalendarSuggestion = inferTradingCalendarFromTimestamps({
    timestampsMs: qualityDiagnostics.tradingCalendarTimestampSamples,
    timeZone: inferredTimeZone.timeZone,
    baseTimeframe: resolvedFolderTimeframe,
    assetClass: suggestedFreeReplayEnvironment?.assetClass ?? null,
    marketPresetId: suggestedFreeReplayEnvironment?.marketPresetId ?? null,
    parseableTimestampRowCount:
      qualityDiagnostics.tradingCalendarParseableTimestampRowCount,
    sampledFileCount: qualityDiagnostics.tradingCalendarSampledFileCount,
    validFileCount: validFiles.length
  });
  const schemaDiagnostics: LocalDataImportSchemaDiagnostics = {
    canonicalSchemaKey: primaryCanonicalSchemaKey,
    validSchemaCount: importableSchemaKeys.size,
    inconsistentFiles: inconsistentFiles.slice(0, PREVIEW_INVALID_SAMPLE_LIMIT)
  };

  emitPreviewProgress(progressReporter, {
    stage: 'DONE',
    progressPercent: 100,
    processedFiles: files.length,
    totalFiles: files.length
  });

  return {
    folderName,
    folderPath: normalizedFolderPath,
    marketDataAcquisitionMetadata: verifiedMarketDataAcquisitionMetadata,
    suggestedFreeReplayEnvironment,
    suggestedTimeZone: inferredTimeZone.timeZone,
    suggestedTimeZoneReason: inferredTimeZone.reason,
    timeZoneSuggestion,
    tradingCalendarSuggestion,
    headers: firstHeader,
    defaultMapping,
    mappingProfile: toApiMappingProfile(primaryProfile),
    fieldDiagnostics: toApiFieldDiagnostics(primaryProfile),
    repairSummary: qualityDiagnostics.repairSummary,
    schemaDiagnostics,
    detectedTimeframe: resolvedFolderTimeframe,
    detectedTimeframes,
    validSymbolCount: validSymbolSet.size,
    totalFiles: files.length,
    validFiles: validFiles.length,
    invalidFiles: invalidFiles.length,
    invalidFileSamples: invalidFiles.slice(0, PREVIEW_INVALID_SAMPLE_LIMIT),
    planSummaries,
    confirmableImportPlans,
    plans,
    sampledFileNames,
    skippedNestedCount: 0
  };
};
