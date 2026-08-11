// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from '@zinuto/shared/timeframe';
import { toBackendErrorMessage, type ApiLocalDataImportPreviewJob, type CsvFolderStagingProgress } from '@/api';
import type {
  CsvImportPreviewProgressStage,
  CsvImportPreviewProgressState,
} from '@/domains/data-import/useCsvImportController';
import type { PendingCsvFolderImport } from '@/domains/data-import/dataSourceTypes';
import type { PendingCsvImportTargetSourceOption } from '@/app-shell/appCsvImportContracts';
import { normalizeNativeImportRelativePath } from '@/domains/data-import/nativeImportHelpers';

const BASE_TIMEFRAME_ORDER: readonly BaseTimeframe[] = ['1m', '5m', '1h', '1d'];

export const resolvePreviewJobErrorMessage = (
  job: ApiLocalDataImportPreviewJob,
  fallbackErrorMessage: string,
): string => {
  const errorCode = String(job.errorCode || job.errorMessage || '').trim();
  return errorCode
    ? toBackendErrorMessage(errorCode, job.errorArgs ?? undefined, 400)
    : fallbackErrorMessage;
};

const resolveCsvFolderStagingProgressStage = (
  progress: CsvFolderStagingProgress,
): CsvImportPreviewProgressStage => {
  if (progress.phase === 'COPYING') {
    return 'STAGING_COPYING';
  }
  if (progress.phase === 'DIGESTING') {
    return 'STAGING_DIGESTING';
  }
  if (progress.phase === 'DONE') {
    return 'SCANNING_FILES';
  }
  return 'STAGING_DISCOVERING';
};

export const toCsvFolderStagingPreviewProgressPatch = (
  progress: CsvFolderStagingProgress,
): Partial<CsvImportPreviewProgressState> => ({
  stage: resolveCsvFolderStagingProgressStage(progress),
  progressPercent: progress.totalFiles || progress.totalBytes ? progress.progressPercent : null,
  processedFiles: progress.processedFiles,
  totalFiles: progress.totalFiles ?? 0,
  processedBytes: progress.processedBytes,
  totalBytes: progress.totalBytes ?? 0,
});

type RequestAnimationFrameScheduler = (callback: FrameRequestCallback) => number;
type CancelAnimationFrameScheduler = (handle: number) => void;

export const createCsvFolderStagingProgressRafBuffer = (
  applyPatch: (patch: Partial<CsvImportPreviewProgressState>) => void,
  requestFrame: RequestAnimationFrameScheduler,
  cancelFrame: CancelAnimationFrameScheduler,
) => {
  let pendingPatch: Partial<CsvImportPreviewProgressState> | null = null;
  let frameHandle: number | null = null;

  const flush = () => {
    frameHandle = null;
    const nextPatch = pendingPatch;
    pendingPatch = null;
    if (nextPatch) {
      applyPatch(nextPatch);
    }
  };

  return {
    push(progress: CsvFolderStagingProgress) {
      pendingPatch = toCsvFolderStagingPreviewProgressPatch(progress);
      if (progress.phase === 'DONE') {
        if (frameHandle !== null) {
          cancelFrame(frameHandle);
        }
        flush();
        return;
      }
      if (frameHandle === null) {
        frameHandle = requestFrame(flush);
      }
    },
    cancel() {
      if (frameHandle !== null) {
        cancelFrame(frameHandle);
        frameHandle = null;
      }
      pendingPatch = null;
    },
    flush,
  };
};

export const normalizeDetectedTimeframes = (
  input: unknown,
  fallback: BaseTimeframe,
): BaseTimeframe[] =>
  Array.isArray(input)
    ? Array.from(
        new Set(
          input
            .map((item) => String(item || '').trim())
            .filter((item): item is BaseTimeframe =>
              BASE_TIMEFRAME_ORDER.includes(item as BaseTimeframe),
            ),
        ),
      ).sort(
        (left, right) =>
          BASE_TIMEFRAME_ORDER.indexOf(left) -
          BASE_TIMEFRAME_ORDER.indexOf(right),
      )
    : [fallback];

export const resolveFullReimportPreviewPlan = (
  confirmableImportPlans: NonNullable<PendingCsvFolderImport>['confirmableImportPlans'],
  targetSource: PendingCsvImportTargetSourceOption,
) => {
  const candidatePlans = confirmableImportPlans.filter(
    (plan) =>
      plan.baseTimeframe === targetSource.baseTimeframe &&
      Math.max(0, Number(plan.fileCount) || 0) > 0,
  );
  if (!candidatePlans.length) {
    return null;
  }
  const configuredScopeStrategy =
    targetSource.importScopeStrategy === 'WITH_PARENT'
      ? 'WITH_PARENT'
      : 'FLAT';
  const configuredTopLevelSubfolder = normalizeNativeImportRelativePath(
    targetSource.importScopeTopLevelSubfolder || '',
  );
  const exactMatchedPlan = configuredScopeStrategy
    ? candidatePlans.find(
        (plan) =>
          plan.strategy === configuredScopeStrategy &&
          normalizeNativeImportRelativePath(plan.topLevelSubfolder || '') ===
            configuredTopLevelSubfolder,
      ) ?? null
    : null;
  return exactMatchedPlan;
};
