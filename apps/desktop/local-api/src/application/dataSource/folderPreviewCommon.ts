// SPDX-License-Identifier: GPL-3.0-only

import { IMPORT_LIMITS } from '@zinuto/shared/input-limits';
import { normalizeProgressPercent } from './importProgress.js';
import { resolveImportWireRelativePath } from '../../domain/dataSource/importPathSemantics.js';
import { appError } from '../../kernel/appError.js';
import type { SupportedBaseTimeframe } from './supportedFileFormats.js';
import { runtimeLimits } from '../../kernel/runtimeLimits.js';

export type FolderPreviewProgress = {
  stage:
    | 'SCANNING_FILES'
    | 'READING_HEADERS'
    | 'DETECTING_TIMEFRAMES'
    | 'BUILDING_PLAN'
    | 'CHECKING_QUALITY'
    | 'DONE';
  progressPercent: number;
  processedFiles: number;
  totalFiles: number;
};

export type FolderPreviewProgressReporter = (progress: FolderPreviewProgress) => void;

const TIMEFRAME_ORDER: SupportedBaseTimeframe[] = ['1m', '5m', '1h', '1d'];

const normalizeFolderPreviewProgress = (
  progress: FolderPreviewProgress,
): FolderPreviewProgress => ({
  stage: progress.stage,
  progressPercent: normalizeProgressPercent(progress.progressPercent),
  processedFiles: Math.max(0, Math.floor(Number(progress.processedFiles) || 0)),
  totalFiles: Math.max(0, Math.floor(Number(progress.totalFiles) || 0)),
});

export const emitPreviewProgress = (
  reporter: FolderPreviewProgressReporter | undefined,
  progress: FolderPreviewProgress
): void => {
  if (!reporter) {
    return;
  }
  reporter(normalizeFolderPreviewProgress(progress));
};

export const toRelativePath = (rootPath: string, absolutePath: string): string =>
  resolveImportWireRelativePath(rootPath, absolutePath);

export const throwImportLimitExceeded = (limit: string, max: number): never => {
  throw appError('LOCAL_DATA_IMPORT_LIMIT_EXCEEDED', { limit, max });
};

export const assertImportPathWithinLimits = (input: {
  absolutePath: string;
  relativePath: string;
  fileName: string;
  depth: number;
}): void => {
  if (input.absolutePath.length > IMPORT_LIMITS.maxPathChars) {
    throwImportLimitExceeded('path', IMPORT_LIMITS.maxPathChars);
  }
  if (input.relativePath.length > IMPORT_LIMITS.maxRelativePathChars) {
    throwImportLimitExceeded('relativePath', IMPORT_LIMITS.maxRelativePathChars);
  }
  if (input.fileName.length > IMPORT_LIMITS.maxFileNameChars) {
    throwImportLimitExceeded('fileName', IMPORT_LIMITS.maxFileNameChars);
  }
  if (input.depth > runtimeLimits.uploadMaxDepth) {
    throwImportLimitExceeded('depth', runtimeLimits.uploadMaxDepth);
  }
};

export const compareTimeframe = (left: SupportedBaseTimeframe, right: SupportedBaseTimeframe): number =>
  TIMEFRAME_ORDER.indexOf(left) - TIMEFRAME_ORDER.indexOf(right);
