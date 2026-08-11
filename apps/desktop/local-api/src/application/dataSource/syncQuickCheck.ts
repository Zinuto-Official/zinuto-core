// SPDX-License-Identifier: GPL-3.0-only

import {
  createEmptySymbolLimitSummary,
  filterSymbolsForSourceSymbolAccess,
  selectCandidatesForSourceSymbolAccess,
} from './symbolLimit.js';
import {
  convertNativeImportPathToWirePath,
  preserveImportWireRelativePath,
  resolveImportWireTopLevelSubfolder,
} from '../../domain/dataSource/importPathSemantics.js';
import type {
  LocalDataImportScopeStrategy,
  LocalDataSourceStatus,
  LocalDataSyncQuickCheck,
  LocalDataSyncQuickCheckFileMetadata,
} from './types.js';
import {
  classifyImportedFileContentVersion,
  extractImportFileFingerprintDigest,
} from './importedFileVersion.js';

type ExistingImportedFileMetaRow = {
  symbol: string;
  fileName?: string | null;
  filePath?: string | null;
  fileSize: number | null;
  fileMtimeMs: number | null;
  fileFingerprint?: string | null;
};

type SyncQuickCheckSource = {
  id: string;
  name: string;
  sourceFolder: string;
  status: LocalDataSourceStatus;
  baseTimeframe: '1m' | '5m' | '1h' | '1d';
  importScopeStrategy: LocalDataImportScopeStrategy | null;
  importScopeTopLevelSubfolder: string;
};

type BuildLocalDataSourceSyncQuickCheckArgs = {
  source: SyncQuickCheckSource | null;
  sourceFolder?: string;
  files: LocalDataSyncQuickCheckFileMetadata[];
  latestImportedFileMetaBySource: ExistingImportedFileMetaRow[];
  symbolLimitContext?: {
    maxSymbols: number | null;
    unlockedSymbols: string[] | null;
  };
  parseSymbolFromFileName: (fileName: string) => string;
  checkedAt: string;
};

const normalizeImportScopeStrategy = (
  value: unknown,
  fallback: LocalDataImportScopeStrategy | null = null,
): LocalDataImportScopeStrategy | null =>
  value === 'WITH_PARENT' || value === 'FLAT' ? value : fallback;

const normalizeNonNegativeInt = (value: unknown): number =>
  Math.max(0, Math.floor(Number(value) || 0));

const normalizeFileMtimeMs = (value: unknown): number =>
  Math.max(0, Math.floor(Number(value) || 0));

const preserveNonWhitespaceText = (value: unknown): string => {
  const raw = String(value ?? '');
  return raw.trim() ? raw : '';
};

const preserveRelativePath = preserveImportWireRelativePath;

const resolveTopLevelSubfolder = (relativePathRaw: string): string => {
  if (!preserveRelativePath(relativePathRaw).includes('/')) {
    return '';
  }
  return resolveImportWireTopLevelSubfolder(relativePathRaw);
};

const toComparableRelativePath = (value: string): string =>
  preserveRelativePath(value);

const buildSourceFileIdentityKey = (input: {
  filePath?: unknown;
  fileName?: unknown;
  symbol?: unknown;
}): string =>
  preserveNonWhitespaceText(input.fileName)
  || convertNativeImportPathToWirePath(preserveNonWhitespaceText(input.filePath))
  || String(input.symbol ?? '').trim().toUpperCase();

export const buildLocalDataSourceSyncQuickCheck = ({
  source,
  sourceFolder = '',
  files,
  latestImportedFileMetaBySource,
  symbolLimitContext,
  parseSymbolFromFileName,
  checkedAt,
}: BuildLocalDataSourceSyncQuickCheckArgs): LocalDataSyncQuickCheck => {
  const normalizedSourceFolder =
    preserveNonWhitespaceText(sourceFolder) ||
    preserveNonWhitespaceText(source?.sourceFolder);
  const emptySymbolLimit = createEmptySymbolLimitSummary(
    symbolLimitContext?.maxSymbols,
  );
  if (!source) {
    return {
      sourceId: '',
      sourceName: '',
      sourceFolder: normalizedSourceFolder,
      baseTimeframe: '1d',
      status: 'UNABLE_TO_CHECK',
      reasonCode: 'LOCAL_DATA_SOURCE_NOT_FOUND',
      checkedAt,
      estimatedChangedFiles: 0,
      estimatedChangedSymbols: 0,
      detectedFiles: 0,
      trackedFiles: 0,
      changedSymbols: [],
      changedRelativePaths: [],
      fingerprintRequiredRelativePaths: [],
      missingSymbolsRetained: [],
      snapshotSymbols: [],
      invalidFiles: 0,
      symbolLimit: emptySymbolLimit,
    };
  }

  if (source.status !== 'READY') {
    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceFolder: normalizedSourceFolder,
      baseTimeframe: source.baseTimeframe,
      status: 'UNABLE_TO_CHECK',
      reasonCode: 'LOCAL_DATA_SOURCE_NOT_READY',
      checkedAt,
      estimatedChangedFiles: 0,
      estimatedChangedSymbols: 0,
      detectedFiles: 0,
      trackedFiles: latestImportedFileMetaBySource.length,
      changedSymbols: [],
      changedRelativePaths: [],
      fingerprintRequiredRelativePaths: [],
      missingSymbolsRetained: [],
      snapshotSymbols: [],
      invalidFiles: 0,
      symbolLimit: emptySymbolLimit,
    };
  }

  if (!Array.isArray(files) || files.length <= 0) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceFolder: normalizedSourceFolder,
      baseTimeframe: source.baseTimeframe,
      status: 'UNABLE_TO_CHECK',
      reasonCode: 'SYNC_QUICK_CHECK_METADATA_MISSING',
      checkedAt,
      estimatedChangedFiles: 0,
      estimatedChangedSymbols: 0,
      detectedFiles: 0,
      trackedFiles: latestImportedFileMetaBySource.length,
      changedSymbols: [],
      changedRelativePaths: [],
      fingerprintRequiredRelativePaths: [],
      missingSymbolsRetained: [],
      snapshotSymbols: [],
      invalidFiles: 0,
      symbolLimit: emptySymbolLimit,
    };
  }

  const configuredScopeStrategy = normalizeImportScopeStrategy(
    source.importScopeStrategy,
    'FLAT',
  );
  const configuredTopLevelSubfolder = preserveRelativePath(
    source.importScopeTopLevelSubfolder || '',
  );
  const scannedFiles = [...files]
    .map((file) => ({
      relativePath: toComparableRelativePath(file.relativePath),
      originalname:
        preserveNonWhitespaceText(file.originalname) ||
        toComparableRelativePath(file.relativePath),
      size: normalizeNonNegativeInt(file.size),
      mtimeMs: normalizeFileMtimeMs(file.mtimeMs),
      fingerprint: extractImportFileFingerprintDigest(file.fingerprint),
    }))
    .filter((file) => Boolean(file.relativePath || file.originalname))
    .sort((left, right) =>
      (left.relativePath || left.originalname).localeCompare(
        right.relativePath || right.originalname,
        'en',
      ),
    );

  const scopedFiles = scannedFiles.filter((file) => {
    if (configuredScopeStrategy !== 'WITH_PARENT') {
      return true;
    }
    return (
      resolveTopLevelSubfolder(file.relativePath || file.originalname) ===
      configuredTopLevelSubfolder
    );
  });

  let invalidFiles = 0;
  const latestImportedFileMetaByFileIdentity = new Map<string, ExistingImportedFileMetaRow>();
  const latestImportedFileMetaBySymbol = new Map<string, ExistingImportedFileMetaRow>();
  latestImportedFileMetaBySource.forEach((item) => {
    const fileIdentityKey = buildSourceFileIdentityKey(item);
    const symbol = String(item.symbol || '').trim().toUpperCase();
    if (fileIdentityKey && !latestImportedFileMetaByFileIdentity.has(fileIdentityKey)) {
      latestImportedFileMetaByFileIdentity.set(fileIdentityKey, item);
    }
    if (symbol && !latestImportedFileMetaBySymbol.has(symbol)) {
      latestImportedFileMetaBySymbol.set(symbol, item);
    }
  });

  const candidateFiles: Array<{
    symbol: string;
    relativePath: string;
    size: number;
    mtimeMs: number;
    fingerprint: string;
    fileIdentityKey: string;
  }> = [];
  scopedFiles.forEach((file) => {
    let symbol = '';
    try {
      symbol = parseSymbolFromFileName(file.relativePath || file.originalname);
    } catch {
      invalidFiles += 1;
      return;
    }
    const fileIdentityKey = buildSourceFileIdentityKey({
      filePath: file.relativePath,
      fileName: file.originalname,
      symbol,
    });
    if (!symbol || !fileIdentityKey) {
      return;
    }
    candidateFiles.push({
      symbol,
      relativePath: file.relativePath || file.originalname,
      size: file.size,
      mtimeMs: file.mtimeMs,
      fingerprint: file.fingerprint,
      fileIdentityKey,
    });
  });

  const candidateSymbols = Array.from(
    new Set(candidateFiles.map((file) => file.symbol)),
  ).sort((left, right) => left.localeCompare(right, 'en'));
  const trackedSymbols = Array.from(new Set(latestImportedFileMetaBySource.map((item) => String(item.symbol || '').trim().toUpperCase()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, 'en'),
  );
  const fingerprintRequiredCandidateByPath = new Map<string, typeof candidateFiles[number]>();
  const exactChangedCandidateByPath = new Map<string, typeof candidateFiles[number]>();
  candidateFiles.forEach((candidate) => {
    const existing =
      latestImportedFileMetaByFileIdentity.get(candidate.fileIdentityKey) ??
      latestImportedFileMetaBySymbol.get(candidate.symbol);
    if (!existing) {
      exactChangedCandidateByPath.set(candidate.relativePath, candidate);
      return;
    }
    const version = classifyImportedFileContentVersion({
      incomingSize: candidate.size,
      incomingFingerprint: candidate.fingerprint,
      existingSize: existing.fileSize,
      existingFingerprint: existing.fileFingerprint,
    });
    if (version === 'CHANGED') {
      exactChangedCandidateByPath.set(candidate.relativePath, candidate);
      return;
    }
    if (version === 'FINGERPRINT_REQUIRED') {
      fingerprintRequiredCandidateByPath.set(candidate.relativePath, candidate);
    }
  });
  const exactChangedCandidates = Array.from(
    exactChangedCandidateByPath.values(),
  ).sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en'));
  const fingerprintRequiredCandidates = Array.from(
    fingerprintRequiredCandidateByPath.values(),
  ).sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en'));
  const selectedPotentialChanges = selectCandidatesForSourceSymbolAccess(
    [...exactChangedCandidates, ...fingerprintRequiredCandidates],
    symbolLimitContext?.maxSymbols,
    symbolLimitContext?.unlockedSymbols,
  );
  const selectedRelativePathSet = new Set(
    selectedPotentialChanges.candidates.map((candidate) => candidate.relativePath),
  );
  const selectedExactChangedCandidates = exactChangedCandidates.filter((candidate) =>
    selectedRelativePathSet.has(candidate.relativePath),
  );
  const selectedFingerprintRequiredCandidates = fingerprintRequiredCandidates.filter((candidate) =>
    selectedRelativePathSet.has(candidate.relativePath),
  );
  const changedSymbolSet = new Set(
    selectedExactChangedCandidates.map((candidate) => candidate.symbol),
  );
  const changedSymbols = Array.from(changedSymbolSet.values()).sort((left, right) =>
    left.localeCompare(right, 'en'),
  );
  const changedRelativePaths = selectedExactChangedCandidates.map(
    (candidate) => candidate.relativePath,
  );
  const fingerprintRequiredRelativePaths = selectedFingerprintRequiredCandidates.map(
    (candidate) => candidate.relativePath,
  );
  const candidateSymbolSet = new Set(candidateSymbols);
  const missingSymbolsRetained = filterSymbolsForSourceSymbolAccess({
    symbols: trackedSymbols.filter((symbol) => !candidateSymbolSet.has(symbol)),
    maxSymbolsRaw: symbolLimitContext?.maxSymbols,
    unlockedSourceSymbolsRaw: symbolLimitContext?.unlockedSymbols,
  });
  const estimatedChangedSymbols = new Set(
    selectedPotentialChanges.candidates.map((candidate) => candidate.symbol),
  ).size;
  const estimatedChangedFiles =
    changedRelativePaths.length +
    fingerprintRequiredRelativePaths.length;

  const noChanges =
    changedSymbols.length === 0 &&
    fingerprintRequiredRelativePaths.length === 0 &&
    invalidFiles === 0;
  const unableToCheck = invalidFiles > 0 && estimatedChangedFiles === 0;

  const reasonCode = unableToCheck
    ? 'SYNC_QUICK_CHECK_INVALID_FILES'
    : noChanges
      ? 'NO_CHANGES'
    : invalidFiles > 0
      ? 'SYNC_QUICK_CHECK_INVALID_FILES'
      : changedRelativePaths.length > 0
        ? 'SYNC_QUICK_CHECK_POTENTIAL_CHANGES'
        : fingerprintRequiredRelativePaths.length > 0
          ? 'SYNC_QUICK_CHECK_FINGERPRINT_REQUIRED'
          : candidateSymbols.length === 0
        ? 'SYNC_QUICK_CHECK_SCOPE_EMPTY'
        : 'SYNC_QUICK_CHECK_POTENTIAL_CHANGES';

  return {
    sourceId: source.id,
    sourceName: source.name,
    sourceFolder: normalizedSourceFolder,
    baseTimeframe: source.baseTimeframe,
    status: unableToCheck
      ? 'UNABLE_TO_CHECK'
      : noChanges
        ? 'NO_CHANGES'
        : 'POTENTIAL_CHANGES',
    reasonCode,
    checkedAt,
    estimatedChangedFiles,
    estimatedChangedSymbols,
    detectedFiles: candidateFiles.length,
    trackedFiles: latestImportedFileMetaBySource.length,
    changedSymbols,
    changedRelativePaths,
    fingerprintRequiredRelativePaths,
    missingSymbolsRetained,
    snapshotSymbols: candidateSymbols,
    invalidFiles,
    symbolLimit: selectedPotentialChanges.symbolLimit,
  };
};
