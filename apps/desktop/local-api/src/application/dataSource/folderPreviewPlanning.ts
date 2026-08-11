// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs/promises';
import path from 'node:path';
import { INPUT_LIMITS } from '@zinuto/shared/input-limits';
import { resolveImportWireTopLevelSubfolder } from '../../domain/dataSource/importPathSemantics.js';
import { appError } from '../../kernel/appError.js';
import type { CsvFieldMapping } from '../../domain/dataSource/csvFieldMappingTypes.js';
import type { ImportRuleMappingProfile } from '@zinuto/shared/importRules';
import type { PreviewImportPlanRecord } from '../ports/infrastructure/db/dataSource/previewSessionStore.js';
import { normalizeFileSize } from './importProgress.js';
import { throwIfOperationAborted } from './operationAbort.js';
import {
  isSupportedImportFileName,
  resolveSupportedImportFileFormat,
  type SupportedBaseTimeframe,
  type SupportedImportFileFormat,
} from './supportedFileFormats.js';
import { runtimeLimits } from '../../kernel/runtimeLimits.js';
import {
  assertImportPathWithinLimits,
  compareTimeframe,
  emitPreviewProgress,
  throwImportLimitExceeded,
  toRelativePath,
  type FolderPreviewProgressReporter,
} from './folderPreviewCommon.js';

type PreviewImportPlanStrategy = 'FLAT' | 'WITH_PARENT';

type FolderPreviewDeps = {
  parseSymbolFromFileName: (fileName: string) => string;
};

export type FolderPreviewScannedImportFile = {
  originalname: string;
  path: string;
  size: number;
  mtimeMs: number;
  fingerprint: string;
  symbol: string;
  relativePath: string;
  fileFormat: SupportedImportFileFormat;
};

export type FolderPreviewValidatedImportFile = FolderPreviewScannedImportFile & {
  detectedTimeframe: SupportedBaseTimeframe;
  headers: string[];
  mapping: CsvFieldMapping;
  mappingProfile: ImportRuleMappingProfile;
};

const resolveTopLevelSubfolder = (relativePathRaw: string): string => {
  if (!String(relativePathRaw ?? '').includes('/')) {
    return '';
  }
  return resolveImportWireTopLevelSubfolder(relativePathRaw);
};

export const scanImportFilesRecursively = async (
  rootPath: string,
  deps: FolderPreviewDeps,
  onProgress?: FolderPreviewProgressReporter,
  signal?: AbortSignal,
): Promise<FolderPreviewScannedImportFile[]> => {
  throwIfOperationAborted(signal);
  const files: FolderPreviewScannedImportFile[] = [];
  let totalBytes = 0;

  const visitDirectory = async (directoryPath: string, depth: number): Promise<void> => {
    throwIfOperationAborted(signal);
    if (depth > runtimeLimits.uploadMaxDepth) {
      throwImportLimitExceeded('depth', runtimeLimits.uploadMaxDepth);
    }
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    throwIfOperationAborted(signal);
    const sortedEntries = [...entries].sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of sortedEntries) {
      throwIfOperationAborted(signal);
      const absolutePath = path.resolve(directoryPath, entry.name);
      const relativePathCandidate = toRelativePath(rootPath, absolutePath);
      assertImportPathWithinLimits({
        absolutePath,
        relativePath: relativePathCandidate,
        fileName: entry.name,
        depth,
      });
      if (entry.isDirectory()) {
        await visitDirectory(absolutePath, depth + 1);
        continue;
      }
      if (!entry.isFile() || !isSupportedImportFileName(entry.name)) {
        continue;
      }
      const fileFormat = resolveSupportedImportFileFormat(entry.name);
      if (!fileFormat) {
        continue;
      }
      const stat = await fs.stat(absolutePath);
      throwIfOperationAborted(signal);
      if (stat.size > runtimeLimits.uploadMaxSingleFileBytes) {
        throwImportLimitExceeded('singleFileBytes', runtimeLimits.uploadMaxSingleFileBytes);
      }
      totalBytes += normalizeFileSize(stat.size);
      if (totalBytes > runtimeLimits.uploadMaxTotalBytes) {
        throwImportLimitExceeded('totalBytes', runtimeLimits.uploadMaxTotalBytes);
      }
      if (files.length + 1 > runtimeLimits.uploadMaxFiles) {
        throwImportLimitExceeded('files', runtimeLimits.uploadMaxFiles);
      }
      const relativePath = relativePathCandidate;
      const originalname = relativePath || entry.name;
      let symbol = '';
      try {
        symbol = deps.parseSymbolFromFileName(originalname);
      } catch {
        symbol = '';
      }
      files.push({
        originalname,
        path: absolutePath,
        size: normalizeFileSize(stat.size),
        mtimeMs: Math.max(0, Math.floor(Number(stat.mtimeMs) || 0)),
        fingerprint: '',
        symbol,
        relativePath,
        fileFormat
      });
      emitPreviewProgress(onProgress, {
        stage: 'SCANNING_FILES',
        progressPercent: 0,
        processedFiles: files.length,
        totalFiles: 0
      });
    }
  };

  if (rootPath.length > INPUT_LIMITS.pathChars) {
    throwImportLimitExceeded('path', INPUT_LIMITS.pathChars);
  }
  await visitDirectory(rootPath, 1);
  return files;
};

export const buildPlanRecords = (
  files: FolderPreviewValidatedImportFile[],
  strategy: PreviewImportPlanStrategy,
  createId: () => string
): PreviewImportPlanRecord[] => {
  const grouped = new Map<
    string,
    {
      baseTimeframe: SupportedBaseTimeframe;
      topLevelSubfolder: string;
      files: FolderPreviewValidatedImportFile[];
    }
  >();

  files.forEach((file) => {
    const topLevelSubfolder = strategy === 'WITH_PARENT' ? resolveTopLevelSubfolder(file.relativePath) : '';
    if (strategy === 'WITH_PARENT' && !topLevelSubfolder) {
      return;
    }
    const groupKey = `${file.detectedTimeframe}::${topLevelSubfolder || '.'}`;
    const existing = grouped.get(groupKey);
    if (existing) {
      existing.files.push(file);
      return;
    }
    grouped.set(groupKey, {
      baseTimeframe: file.detectedTimeframe,
      topLevelSubfolder,
      files: [file]
    });
  });

  return Array.from(grouped.values())
    .map((group) => {
      const planFiles = [...group.files].sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath, 'en')
      );
      const firstFileBySymbol = new Map<string, FolderPreviewValidatedImportFile>();
      planFiles.forEach((file) => {
        const symbol = String(file.symbol || '').trim().toUpperCase();
        if (!symbol) {
          return;
        }
        const existing = firstFileBySymbol.get(symbol);
        if (existing) {
          throw appError('LOCAL_DATA_IMPORT_DUPLICATE_SYMBOL_IN_POOL', {
            symbol,
            fileName: file.relativePath || file.originalname,
            duplicateFileName: existing.relativePath || existing.originalname,
          });
        }
        firstFileBySymbol.set(symbol, file);
      });
      const uniqueSymbols = new Set(
        planFiles
          .map((file) => String(file.symbol || '').trim().toUpperCase())
          .filter((symbol) => Boolean(symbol))
      );
      return {
        id: createId(),
        strategy,
        baseTimeframe: group.baseTimeframe,
        topLevelSubfolder: group.topLevelSubfolder,
        symbolCount: uniqueSymbols.size,
        fileCount: planFiles.length,
        files: planFiles
      } satisfies PreviewImportPlanRecord;
    })
    .sort((left, right) => {
      const timeframeOrder = compareTimeframe(left.baseTimeframe, right.baseTimeframe);
      if (timeframeOrder !== 0) {
        return timeframeOrder;
      }
      return left.topLevelSubfolder.localeCompare(right.topLevelSubfolder, 'en');
    });
};
