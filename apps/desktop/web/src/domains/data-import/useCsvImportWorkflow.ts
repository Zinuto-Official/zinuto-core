// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
  api,
  type ApiLocalDataImportJob,
} from '@/api';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import type { BaseTimeframe } from '@/domains/chart/chartPeriods';
import type { CsvFieldMapping } from '@/domains/data-import/csvHelpers';
import type { CsvImportCardState } from '@/domains/data-import/useCsvImportController';
import {
  buildImportCardPatchFromJob,
  type CustomSamplePool,
  type ImportCsvOptions,
} from '@/domains/data-import/csvImportJobHelpers';
import { useCsvImportJobFinalization } from '@/domains/data-import/useCsvImportJobFinalization';
import { useCsvImportJobMonitor } from '@/domains/data-import/useCsvImportJobMonitor';
import { normalizeNativeImportDirectoryPath } from '@/domains/data-import/nativeImportHelpers';

type UseCsvImportWorkflowParams = {
  appIsMountedRef: MutableRefObject<boolean>;
  csvImportCardStates: CsvImportCardState[];
  customSamplePoolsCount: number;
  sanitizeSamplePoolName: (name: string, fallbackName: string) => string;
  resolveLocalDataImportJobErrorMessage: (
    rawErrorMessage: unknown,
    structuredError?: unknown,
  ) => string;
  resolveUnknownErrorMessage: (error: unknown, fallback: string) => string;
  waitForNextAnimationFrame: () => Promise<void>;
  formatStorageBytes: (value: number) => string;
  getBaseTimeframeLabels: () => Record<BaseTimeframe, string>;
  formatMoney: (value: number, fractionDigits?: number) => string;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values?: Array<unknown>) => string;
  setError: (message: string) => void;
  setHint: (message: string) => void;
  patchCsvImportCardState: (id: string, patch: Partial<CsvImportCardState>) => void;
  clearCsvImportCardState: (id?: string) => void;
  markCsvImportBatchStarted: () => void;
  markCsvImportBatchFinished: () => void;
  syncCustomSamplePoolsFromDataSources: () => Promise<CustomSamplePool[]>;
  refreshInstruments: () => Promise<unknown>;
  setCustomSamplePools: Dispatch<SetStateAction<CustomSamplePool[]>>;
  setLotSizeByPool: Dispatch<SetStateAction<Record<string, number>>>;
  setIncludeSystemDefaultPool: Dispatch<SetStateAction<boolean>>;
  setActiveSamplePoolId: Dispatch<SetStateAction<string>>;
};

export { type CustomSamplePool, type ImportCsvOptions } from '@/domains/data-import/csvImportJobHelpers';

export const useCsvImportWorkflow = ({
  appIsMountedRef,
  csvImportCardStates,
  customSamplePoolsCount,
  sanitizeSamplePoolName,
  resolveLocalDataImportJobErrorMessage,
  resolveUnknownErrorMessage,
  waitForNextAnimationFrame,
  formatStorageBytes,
  getBaseTimeframeLabels,
  formatMoney,
  tt,
  ttf,
  setError,
  setHint,
  patchCsvImportCardState,
  clearCsvImportCardState,
  markCsvImportBatchStarted,
  markCsvImportBatchFinished,
  syncCustomSamplePoolsFromDataSources,
  refreshInstruments,
  setCustomSamplePools,
  setActiveSamplePoolId
}: UseCsvImportWorkflowParams) => {
  const { finalizeImportJob } = useCsvImportJobFinalization({
    appIsMountedRef,
    resolveLocalDataImportJobErrorMessage,
    formatStorageBytes,
    getBaseTimeframeLabels,
    formatMoney,
    tt,
    ttf,
    setHint,
    patchCsvImportCardState,
    clearCsvImportCardState,
    syncCustomSamplePoolsFromDataSources,
    refreshInstruments,
    setCustomSamplePools,
    setActiveSamplePoolId,
  });

  const { monitorCsvImportJob, monitoredImportJobIdsRef } = useCsvImportJobMonitor({
    appIsMountedRef,
    csvImportCardStates,
    finalizeImportJob,
    patchCsvImportCardState,
    markCsvImportBatchFinished,
    resolveUnknownErrorMessage,
    tt,
    setError,
  });

  const importCsv = useCallback(
    async (
      previewToken: string,
      previewPlanId: string,
      sourceFileCount: number,
      folderName: string,
      folderPath: string,
      csvFieldMapping: CsvFieldMapping | undefined,
      baseTimeframe: BaseTimeframe,
      importCardId = '',
      options?: ImportCsvOptions
    ): Promise<ApiLocalDataImportJob | null> => {
      const importMode =
        options?.mode === 'INCREMENTAL_UPDATE'
          ? 'INCREMENTAL_UPDATE'
          : options?.mode === 'FULL_REIMPORT'
            ? 'FULL_REIMPORT'
          : options?.mode === 'BATCH'
            ? 'BATCH'
            : 'DEFAULT';
      const isIncrementalUpdate = importMode === 'INCREMENTAL_UPDATE';
      const isFullReimport = importMode === 'FULL_REIMPORT';
      const isBatchMode = importMode === 'BATCH' || isFullReimport || isIncrementalUpdate;
      const sourceIdForSync = String(options?.sourceId || '').trim();
      const sourceFolderForImport =
        normalizeNativeImportDirectoryPath(options?.sourceFolder || '') ||
        normalizeNativeImportDirectoryPath(folderPath || '');
      const sourceFolderBookmarkId = String(options?.sourceFolderBookmarkId || '').trim();
      const sourceFolderUsageMode =
        options?.sourceFolderUsageMode === 'ONE_OFF' ? 'ONE_OFF' : 'BOUND_SOURCE';
      const sourceTimeZone = String(options?.timeZone || '').trim();
      const normalizedPreviewToken = String(previewToken || '').trim();
      const normalizedPreviewPlanId = String(previewPlanId || '').trim();
      const normalizedSourceFileCount = Math.max(0, Math.floor(Number(sourceFileCount) || 0));
      if (!normalizedPreviewToken || !normalizedPreviewPlanId) {
        return null;
      }

      const updateImportCard = (patch: Partial<CsvImportCardState>) => {
        if (!importCardId || !appIsMountedRef.current) {
          return;
        }
        patchCsvImportCardState(importCardId, patch);
      };
      setError('');
      if (!isBatchMode) {
        setHint(tt('appText.systemProcessingWait'));
      }
      try {
        const defaultPoolName = folderName ? folderName.trim() : ttf('appText.samplePoolValue0', [customSamplePoolsCount + 1]);
        const nextPoolName = sanitizeSamplePoolName(defaultPoolName, ttf('appText.samplePoolValue0', [customSamplePoolsCount + 1]));
        const nextPoolSourceFolder = sourceFolderForImport || folderName || '';
        updateImportCard({
          jobId: '',
          poolName: nextPoolName,
          sourceFolder: nextPoolSourceFolder,
          baseTimeframe,
          phase: 'UPLOADING',
          progressPercent: 1,
          importProgressPercent: 1,
          compactProgressPercent: 0,
          compactProgressDisplayPercent: 0,
          compactBeforeBytes: 0,
          compactAfterBytes: 0,
          compactReclaimedBytes: 0,
          compactAfterDisplayBytes: 0,
          compactReclaimedDisplayBytes: 0,
          shouldShowCompactProgress: false,
          doneFiles: 0,
          totalFiles: normalizedSourceFileCount,
          importedRows: 0,
          skippedRows: 0,
          totalRows: 0,
          isPaused: false,
          cancelRequested: false,
          errorMessage: ''
        });
        await waitForNextAnimationFrame();
        const tradingCalendar = options?.tradingCalendar;
        let job: ApiLocalDataImportJob;
        if (isIncrementalUpdate) {
          job = await api.startLocalDataIncrementalUpdateJobByPaths(sourceIdForSync, {
            previewToken: normalizedPreviewToken,
            previewPlanId: normalizedPreviewPlanId,
            mapping: csvFieldMapping,
            userOverrides: {
              sourceName: nextPoolName,
              sourceFolder: sourceFolderForImport || undefined,
              sourceFolderBookmarkId: sourceFolderBookmarkId || undefined,
              sourceFolderUsageMode,
            }
          });
        } else {
          if (!tradingCalendar) {
            throw new Error(tt('appText.tradingCalendarRequired'));
          }
          job = isFullReimport
            ? await api.startLocalDataFullReimportJobByPaths(sourceIdForSync, {
                previewToken: normalizedPreviewToken,
                previewPlanId: normalizedPreviewPlanId,
                mapping: csvFieldMapping,
                userOverrides: {
                  sourceName: nextPoolName,
                  sourceFolder: sourceFolderForImport || undefined,
                  sourceFolderBookmarkId: sourceFolderBookmarkId || undefined,
                  timeZone: sourceTimeZone,
                  timeZoneOrigin: options?.timeZoneOrigin,
                  tradingCalendar,
                  allowExistingSourceTimeZoneChange:
                    options?.allowExistingSourceTimeZoneChange,
                }
              })
            : await api.startLocalDataImportJobByPaths({
                previewToken: normalizedPreviewToken,
                previewPlanId: normalizedPreviewPlanId,
                mapping: csvFieldMapping,
                userOverrides: {
                  sourceName: nextPoolName,
                  sourceFolder: sourceFolderForImport || undefined,
                  sourceFolderBookmarkId: sourceFolderBookmarkId || undefined,
                  timeZone: sourceTimeZone,
                  timeZoneOrigin: options?.timeZoneOrigin,
                  tradingCalendar,
                }
              });
        }
        markCsvImportBatchStarted();
        updateImportCard(
          buildImportCardPatchFromJob(
            job,
            normalizedSourceFileCount
          )
        );
        if (
          job.status !== 'QUEUED' && job.status !== 'RUNNING' &&
          !monitoredImportJobIdsRef.current.has(job.id)
        ) {
          monitoredImportJobIdsRef.current.add(job.id);
          void monitorCsvImportJob({
            id: importCardId,
            jobId: job.id,
            sourceId: job.sourceId,
            poolName: nextPoolName,
            sourceFolder: nextPoolSourceFolder,
            baseTimeframe,
            phase: job.phaseFacts.cardPhase,
            progressPercent: Math.max(0, Math.min(100, Number(job.progressPercent) || 0)),
            progressTargetPercent: Math.max(0, Math.min(100, Number(job.progressPercent) || 0)),
            importProgressPercent: Math.max(0, Math.min(100, Number(job.phaseFacts.importProgressPercent) || 0)),
            compactProgressPercent: Math.max(0, Math.min(100, Number(job.compactProgressPercent) || 0)),
            compactProgressTargetPercent: Math.max(0, Math.min(100, Number(job.compactProgressPercent) || 0)),
            compactProgressDisplayPercent: Math.max(0, Math.min(100, Number(job.phaseFacts.compactProgressDisplayPercent) || 0)),
            compactBeforeBytes: Math.max(0, Number(job.compactBeforeBytes) || 0),
            compactAfterBytes: Math.max(0, Number(job.compactAfterBytes) || 0),
            compactReclaimedBytes: Math.max(0, Number(job.compactReclaimedBytes) || 0),
            compactAfterDisplayBytes: Math.max(0, Number(job.phaseFacts.compactAfterDisplayBytes) || 0),
            compactReclaimedDisplayBytes: Math.max(0, Number(job.phaseFacts.compactReclaimedDisplayBytes) || 0),
            shouldShowCompactProgress: job.phaseFacts.shouldShowCompactProgress === true,
            doneFiles: Math.max(0, Number(job.doneFiles) || 0),
            totalFiles: Math.max(0, Number(job.totalFiles) || normalizedSourceFileCount),
            importedRows: Math.max(0, Number(job.importedRows) || 0),
            skippedRows: Math.max(0, Number(job.skippedRows) || 0),
            totalRows: Math.max(0, Number(job.totalRows) || 0),
            isPaused: Boolean(job.isPaused),
            cancelRequested: Boolean(job.cancelRequested),
            errorMessage: ''
          });
        }
        setHint(tt('appText.systemProcessingWait'));
        return job;
      } catch (err) {
        const message = resolveUnknownErrorMessage(err, tt('appText.readFolder'));
        setError(message);
        updateImportCard({
          phase: 'FAILED',
          isPaused: false,
          errorMessage: message
        });
        return null;
      }
    },
    [
      appIsMountedRef,
      customSamplePoolsCount,
      markCsvImportBatchStarted,
      monitorCsvImportJob,
      monitoredImportJobIdsRef,
      patchCsvImportCardState,
      resolveUnknownErrorMessage,
      sanitizeSamplePoolName,
      setError,
      setHint,
      tt,
      ttf,
      waitForNextAnimationFrame
    ]
  );

  return {
    importCsv
  };
};
