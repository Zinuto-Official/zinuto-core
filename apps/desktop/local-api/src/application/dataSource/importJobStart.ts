// SPDX-License-Identifier: GPL-3.0-only

import { appError } from '../../kernel/appError.js';
import type { QueuedImportFile, QueuedImportJob } from './importJobExecutor.js';
import type {
  LocalDataSourceDiagnosticProfile,
  LocalDataImportJobDetail,
  LocalDataImportSymbolLimit,
  StartLocalDataImportInput
} from './types.js';
import { normalizeLocalDataSourceDiagnosticProfile } from './diagnosticProfile.js';
import { IMPORT_LIMITS, INPUT_LIMITS } from '@zinuto/shared/input-limits';
import {
  normalizeTimeZone,
  normalizeTimeZoneOrigin,
  type TimeZoneOrigin
} from '@zinuto/shared/timezone';
import {
  assertTradingCalendarConfig,
  parseStoredTradingCalendarConfig,
  serializeTradingCalendarConfig,
} from '@zinuto/shared/tradingCalendar';
import type { LocalDataImportScopeStrategy } from './types.js';
import {
  isTradingCalendarValidForLocalDataImport,
  normalizeTradingCalendarForLocalDataImport,
} from './importDraftValidation.js';

type ExistingSourceImportConfig = {
  id: string;
  name: string;
  sourceFolder: string;
  sourceFolderBookmarkId: string;
  importScopeStrategy: LocalDataImportScopeStrategy | null;
  importScopeTopLevelSubfolder: string;
  timeZone: string;
  timeZoneOrigin: TimeZoneOrigin;
  tradingCalendarJson: string;
  diagnosticAssetClass: string | null;
  diagnosticMarketPresetId: string | null;
  diagnosticProfileOrigin: string | null;
};

type StartImportLocalDataJobDeps = {
  normalizeSourceName: (rawName: string) => string;
  nowIso: () => string;
  createId: () => string;
  normalizeFileSize: (size: unknown) => number;
  assertManagedImportTempPath: (filePath: string) => void;
  parseSymbolFromFileName: (fileName: string) => string;
  isSystemResetRunning: () => boolean;
  getSourceImportConfigById: (sourceId: string) => ExistingSourceImportConfig | undefined;
  countActiveJobsBySource: (sourceId: string) => number;
  listImportedSymbolsBySource: (sourceId: string) => Array<{ symbol: string }>;
  withTransaction: (runner: () => void) => void;
  insertSource: (payload: {
    sourceId: string;
    sourceName: string;
    sourceFolder: string;
    sourceFolderBookmarkId: string;
    importScopeStrategy: LocalDataImportScopeStrategy | null;
    importScopeTopLevelSubfolder: string;
    timeZone: string;
    timeZoneOrigin: TimeZoneOrigin;
    baseTimeframe: '1m' | '5m' | '1h' | '1d';
    diagnosticProfile: LocalDataSourceDiagnosticProfile;
    mappingJson: string;
    tradingCalendarJson: string;
    totalFiles: number;
    lastJobId: string;
    createdAt: string;
  }) => void;
  updateSourceForSyncImport: (payload: {
    sourceId: string;
    sourceName: string;
    sourceFolder: string;
    sourceFolderBookmarkId: string;
    importScopeStrategy: LocalDataImportScopeStrategy | null;
    importScopeTopLevelSubfolder: string;
    timeZone: string;
    timeZoneOrigin: TimeZoneOrigin;
    baseTimeframe: '1m' | '5m' | '1h' | '1d';
    diagnosticProfile: LocalDataSourceDiagnosticProfile;
    mappingJson: string;
    tradingCalendarJson: string;
    totalFiles: number;
    lastJobId: string;
    updatedAt: string;
  }) => boolean;
  updateSourceForIncrementalImport: (payload: {
    sourceId: string;
    sourceFolder?: string;
    sourceFolderBookmarkId?: string;
    lastJobId: string;
    updatedAt: string;
  }) => boolean;
  insertJob: (payload: {
    jobId: string;
    sourceId: string;
    sourceName: string;
    timeZone: string;
    baseTimeframe: '1m' | '5m' | '1h' | '1d';
    jobMode: 'FULL_IMPORT' | 'INCREMENTAL_UPDATE';
    totalFiles: number;
    symbolLimitJson: string;
    createdAt: string;
  }) => void;
  insertFile: (payload: {
    fileRowId: string;
    sourceId: string;
    jobId: string;
    symbol: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    fileMtimeMs: number;
    fileFingerprint: string;
    createdAt: string;
  }) => void;
  ensureImportJobControlState: (jobId: string) => void;
  assertMutationAccessForSource: (sourceIdRaw?: string) => void;
  assertImportQueueCapacity: () => void;
  enqueueImportJob: (job: QueuedImportJob) => void;
  toJobDetail: (jobId: string) => LocalDataImportJobDetail;
};

const normalizeDistinctSymbols = (symbols: string[]): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];
  symbols.forEach((rawSymbol) => {
    const symbol = String(rawSymbol ?? '').trim().toUpperCase();
    if (!symbol || seen.has(symbol)) {
      return;
    }
    seen.add(symbol);
    output.push(symbol);
  });
  return output;
};

const preserveNonWhitespaceText = (value: unknown): string => {
  const raw = String(value ?? '');
  return raw.trim() ? raw : '';
};

const normalizeImportScopeStrategy = (
  value: unknown,
  fallback: LocalDataImportScopeStrategy | null = null
): LocalDataImportScopeStrategy | null => {
  if (value === 'FLAT' || value === 'WITH_PARENT') {
    return value;
  }
  return fallback;
};

const normalizeSymbolLimit = (
  value: StartLocalDataImportInput['symbolLimit'],
): LocalDataImportSymbolLimit => {
  const selectedSymbols = normalizeDistinctSymbols(
    Array.isArray(value?.selectedSymbols) ? value.selectedSymbols : [],
  );
  return {
    limitApplied: false,
    maxSymbols: null,
    selectedSymbols,
    skippedSymbols: [],
    skippedSymbolCount: 0,
    reason: null,
  };
};

export const startLocalDataImportJobCore = (
  input: StartLocalDataImportInput,
  deps: StartImportLocalDataJobDeps
): LocalDataImportJobDetail => {
  if (deps.isSystemResetRunning()) {
    throw appError('SYSTEM_RESET_IN_PROGRESS');
  }
  const normalizedFiles = Array.isArray(input.files) ? input.files : [];
  if (!normalizedFiles.length && !String(input.sourceId ?? '').trim()) {
    throw appError('UPLOAD_FILES_REQUIRED');
  }
  if (normalizedFiles.length > IMPORT_LIMITS.maxFiles) {
    throw appError('LOCAL_DATA_IMPORT_LIMIT_EXCEEDED', { limit: 'files', max: IMPORT_LIMITS.maxFiles });
  }

  const normalizedSourceId = String(input.sourceId ?? '').trim();
  const existingSource = normalizedSourceId ? deps.getSourceImportConfigById(normalizedSourceId) : undefined;
  if (normalizedSourceId && !existingSource) {
    throw appError('LOCAL_DATA_SOURCE_NOT_FOUND', { sourceId: normalizedSourceId }, 404);
  }
  const jobMode = input.jobMode === 'INCREMENTAL_UPDATE' ? 'INCREMENTAL_UPDATE' : 'FULL_IMPORT';
  const sourceFolderUsageMode = input.sourceFolderUsageMode === 'ONE_OFF' ? 'ONE_OFF' : 'BOUND_SOURCE';
  if (jobMode === 'INCREMENTAL_UPDATE' && !existingSource) {
    throw appError('LOCAL_DATA_SOURCE_NOT_FOUND', { sourceId: normalizedSourceId }, 404);
  }
  if (existingSource) {
    const activeJobs = Number(deps.countActiveJobsBySource(existingSource.id));
    if (Number.isFinite(activeJobs) && activeJobs > 0) {
      throw appError('LOCAL_DATA_IMPORT_JOB_ACTIVE');
    }
  }

  const sourceName = deps.normalizeSourceName(input.sourceName || existingSource?.name || '');
  const sourceFolder =
    preserveNonWhitespaceText(input.sourceFolder) ||
    preserveNonWhitespaceText(existingSource?.sourceFolder);
  const sourceFolderBookmarkId =
    String(input.sourceFolderBookmarkId ?? '').trim() || String(existingSource?.sourceFolderBookmarkId ?? '').trim();
  if (sourceFolder.length > INPUT_LIMITS.pathChars) {
    throw appError('LOCAL_DATA_IMPORT_LIMIT_EXCEEDED', { limit: 'path', max: INPUT_LIMITS.pathChars });
  }
  if (sourceFolderBookmarkId.length > INPUT_LIMITS.bookmarkChars) {
    throw appError('LOCAL_DATA_IMPORT_LIMIT_EXCEEDED', { limit: 'bookmark', max: INPUT_LIMITS.bookmarkChars });
  }
  const importScopeStrategy = normalizeImportScopeStrategy(
    input.importScopeStrategy,
    normalizeImportScopeStrategy(existingSource?.importScopeStrategy, null)
  );
  const importScopeTopLevelSubfolder =
    preserveNonWhitespaceText(input.importScopeTopLevelSubfolder) ||
    preserveNonWhitespaceText(existingSource?.importScopeTopLevelSubfolder);
  if (importScopeTopLevelSubfolder.length > INPUT_LIMITS.relativePathChars) {
    throw appError('LOCAL_DATA_IMPORT_LIMIT_EXCEEDED', { limit: 'relativePath', max: INPUT_LIMITS.relativePathChars });
  }
  const timeZone =
    jobMode === 'INCREMENTAL_UPDATE'
      ? normalizeTimeZone(existingSource?.timeZone)
      : normalizeTimeZone(input.timeZone ?? existingSource?.timeZone);
  const existingSourceTimeZone = normalizeTimeZone(existingSource?.timeZone);
  const allowExistingSourceTimeZoneChange =
    Boolean(input.allowExistingSourceTimeZoneChange) && jobMode !== 'INCREMENTAL_UPDATE';
  if (
    existingSource &&
    jobMode !== 'INCREMENTAL_UPDATE' &&
    timeZone !== existingSourceTimeZone &&
    !allowExistingSourceTimeZoneChange
  ) {
    throw appError('LOCAL_DATA_SOURCE_TIMEZONE_REIMPORT_REQUIRED');
  }
  const timeZoneOrigin =
    jobMode === 'INCREMENTAL_UPDATE'
      ? normalizeTimeZoneOrigin(existingSource?.timeZoneOrigin, 'PRESET_DEFAULT')
      : normalizeTimeZoneOrigin(
          input.timeZoneOrigin ?? existingSource?.timeZoneOrigin,
          'PRESET_DEFAULT'
        );
  const baseTimeframe = input.baseTimeframe;
  const existingDiagnosticProfile = existingSource
    ? normalizeLocalDataSourceDiagnosticProfile({
        assetClass: existingSource.diagnosticAssetClass as LocalDataSourceDiagnosticProfile['assetClass'],
        marketPresetId: existingSource.diagnosticMarketPresetId ?? undefined,
        profileOrigin: existingSource.diagnosticProfileOrigin as LocalDataSourceDiagnosticProfile['profileOrigin'],
      })
    : null;
  const diagnosticProfile =
    jobMode === 'INCREMENTAL_UPDATE' && existingDiagnosticProfile
      ? existingDiagnosticProfile
      : normalizeLocalDataSourceDiagnosticProfile(
          input.diagnosticProfile ?? existingDiagnosticProfile,
        );
  const existingTradingCalendar = existingSource
    ? parseStoredTradingCalendarConfig(existingSource.tradingCalendarJson)
    : null;
  let tradingCalendar =
    jobMode === 'INCREMENTAL_UPDATE'
      ? existingTradingCalendar
      : (() => {
          try {
            return assertTradingCalendarConfig(input.tradingCalendar);
          } catch {
            throw appError('LOCAL_DATA_TRADING_CALENDAR_INVALID');
          }
        })();
  if (!tradingCalendar) {
    throw appError('LOCAL_DATA_TRADING_CALENDAR_INVALID');
  }
  if (!isTradingCalendarValidForLocalDataImport(tradingCalendar, input.baseTimeframe)) {
    throw appError('LOCAL_DATA_TRADING_CALENDAR_INVALID');
  }
  tradingCalendar = normalizeTradingCalendarForLocalDataImport(
    tradingCalendar,
    input.baseTimeframe,
  );
  const mapping = input.mapping;
  const snapshotSymbols = normalizeDistinctSymbols(
    (Array.isArray(input.snapshotSymbols) ? input.snapshotSymbols : []).map((symbol) => String(symbol ?? '').trim().toUpperCase())
  );
  const sourceTotalFiles = Math.max(
    0,
    Math.floor(Number(input.sourceTotalFiles ?? normalizedFiles.length) || 0),
    snapshotSymbols.length,
    normalizedFiles.length
  );
  if (sourceTotalFiles > IMPORT_LIMITS.maxFiles) {
    throw appError('LOCAL_DATA_IMPORT_LIMIT_EXCEEDED', { limit: 'files', max: IMPORT_LIMITS.maxFiles });
  }
  const createdAt = deps.nowIso();
  const sourceId = existingSource?.id ?? deps.createId();
  const jobId = deps.createId();
  const symbolLimit = normalizeSymbolLimit(input.symbolLimit);
  const queuedFiles: QueuedImportFile[] = [];
  const queuedSymbols = new Set<string>();
  const tempDirPaths = Array.from(
    new Set(
      (Array.isArray(input.tempDirPaths) ? input.tempDirPaths : [])
        .map((item) => String(item || '').trim())
        .filter((item) => Boolean(item))
    )
  );
  const existingImportedSymbols = existingSource
    ? normalizeDistinctSymbols(
        deps
          .listImportedSymbolsBySource(existingSource.id)
          .map((item) => String(item.symbol ?? '').trim().toUpperCase())
      )
    : [];

  deps.assertImportQueueCapacity();

  deps.withTransaction(() => {
    deps.assertMutationAccessForSource(existingSource ? sourceId : undefined);
    const mappingJson = JSON.stringify(mapping);
    const tradingCalendarJson = serializeTradingCalendarConfig(tradingCalendar);
    if (existingSource) {
      let sourceMutationAcquired = false;
      if (jobMode === 'INCREMENTAL_UPDATE') {
        sourceMutationAcquired = deps.updateSourceForIncrementalImport({
          sourceId,
          sourceFolder: sourceFolderUsageMode === 'BOUND_SOURCE' ? sourceFolder : undefined,
          sourceFolderBookmarkId:
            sourceFolderUsageMode === 'BOUND_SOURCE' ? sourceFolderBookmarkId : undefined,
          lastJobId: jobId,
          updatedAt: createdAt
        });
      } else {
        sourceMutationAcquired = deps.updateSourceForSyncImport({
          sourceId,
          sourceName,
          sourceFolder,
          sourceFolderBookmarkId,
          importScopeStrategy,
          importScopeTopLevelSubfolder:
            importScopeStrategy === 'WITH_PARENT' ? importScopeTopLevelSubfolder : '',
          timeZone,
          timeZoneOrigin,
          baseTimeframe,
          diagnosticProfile,
          mappingJson,
          tradingCalendarJson,
          totalFiles: sourceTotalFiles,
          lastJobId: jobId,
          updatedAt: createdAt
        });
      }
      if (!sourceMutationAcquired) {
        throw appError(
          'LOCAL_DATA_SOURCE_MUTATION_IN_PROGRESS',
          { sourceId },
          409,
        );
      }
    } else {
      deps.insertSource({
        sourceId,
        sourceName,
        sourceFolder,
        sourceFolderBookmarkId,
        importScopeStrategy,
        importScopeTopLevelSubfolder:
          importScopeStrategy === 'WITH_PARENT' ? importScopeTopLevelSubfolder : '',
        timeZone,
        timeZoneOrigin,
        baseTimeframe,
        diagnosticProfile,
        mappingJson,
        tradingCalendarJson,
        totalFiles: sourceTotalFiles,
        lastJobId: jobId,
        createdAt
      });
    }
    deps.insertJob({
      jobId,
      sourceId,
      sourceName,
      timeZone,
      baseTimeframe,
      jobMode,
      totalFiles: normalizedFiles.length,
      symbolLimitJson: JSON.stringify(symbolLimit),
      createdAt
    });

    let totalBytes = 0;
    for (const file of normalizedFiles) {
      const fileName = preserveNonWhitespaceText(file.originalname);
      const filePath = preserveNonWhitespaceText(file.path);
      if (!fileName || !filePath) {
        throw appError('CSV_FILE_MISSING', { filePath });
      }
      if (fileName.length > INPUT_LIMITS.relativePathChars || filePath.length > INPUT_LIMITS.pathChars) {
        throw appError('LOCAL_DATA_IMPORT_LIMIT_EXCEEDED', { limit: 'path', max: INPUT_LIMITS.pathChars });
      }
      deps.assertManagedImportTempPath(filePath);
      const symbol = String(file.symbol ?? '').trim().toUpperCase() || deps.parseSymbolFromFileName(fileName);
      if (symbol.length > INPUT_LIMITS.symbolChars) {
        throw appError('CSV_FILENAME_INVALID', { fileName });
      }
      const fileSize = deps.normalizeFileSize(file.size);
      if (fileSize > IMPORT_LIMITS.maxSingleFileBytes) {
        throw appError('LOCAL_DATA_IMPORT_LIMIT_EXCEEDED', { limit: 'singleFileBytes', max: IMPORT_LIMITS.maxSingleFileBytes });
      }
      totalBytes += fileSize;
      if (totalBytes > IMPORT_LIMITS.maxTotalBytes) {
        throw appError('LOCAL_DATA_IMPORT_LIMIT_EXCEEDED', { limit: 'totalBytes', max: IMPORT_LIMITS.maxTotalBytes });
      }
      const fileMtimeMs = Math.max(0, Math.floor(Number(file.mtimeMs ?? 0) || 0));
      const fileFingerprint = String(file.fingerprint ?? '').trim();
      const fileRowId = deps.createId();
      if (queuedSymbols.has(symbol)) {
        throw appError('LOCAL_DATA_IMPORT_DUPLICATE_SYMBOL_IN_POOL', {
          symbol,
          fileName,
        });
      }
      queuedSymbols.add(symbol);
      deps.insertFile({
        fileRowId,
        sourceId,
        jobId,
        symbol,
        fileName,
        filePath,
        fileSize,
        fileMtimeMs,
        fileFingerprint,
        createdAt
      });

      queuedFiles.push({
        fileRowId,
        fileName,
        filePath,
        fileSize,
        symbol,
        mapping: file.mapping ? { ...file.mapping } : undefined
      });
    }
  });

  const snapshotSymbolSet = new Set(snapshotSymbols.length ? snapshotSymbols : Array.from(queuedSymbols));
  const obsoleteSymbols = existingSource ? existingImportedSymbols.filter((symbol) => !snapshotSymbolSet.has(symbol)) : [];
  const changedSymbols = Array.from(queuedSymbols);

  deps.ensureImportJobControlState(jobId);
  deps.enqueueImportJob({
    sourceId,
    sourceName,
    baseTimeframe,
    jobMode,
    sourceFolderUsageMode,
    timezone: timeZone,
    jobId,
    sourceTotalFiles,
    tempDirPaths,
    mapping,
    files: queuedFiles,
    existingImportedSymbols,
    replaceExistingSource: Boolean(existingSource),
    changedSymbols,
    obsoleteSymbols
  });

  return deps.toJobDetail(jobId);
};
