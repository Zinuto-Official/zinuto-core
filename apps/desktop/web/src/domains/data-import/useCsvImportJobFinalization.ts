// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
  type ApiLocalDataImportJob,
} from '@/api';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import type { BaseTimeframe } from '@/domains/chart/chartPeriods';
import { buildIncrementalUpdateNotice } from '@/domains/data-import/incrementalUpdateNotice';
import type { CsvImportCardState } from '@/domains/data-import/useCsvImportController';
import {
  resolveImportQualitySkippedRows,
  resolveSymbolLimitSkipHint,
  type CustomSamplePool,
} from '@/domains/data-import/csvImportJobHelpers';
import { settleSuccessfulFullImportFollowUps } from '@/domains/data-import/successfulImportFollowUps';

type UseCsvImportJobFinalizationParams = {
  appIsMountedRef: MutableRefObject<boolean>;
  resolveLocalDataImportJobErrorMessage: (
    rawErrorMessage: unknown,
    structuredError?: unknown,
  ) => string;
  formatStorageBytes: (value: number) => string;
  getBaseTimeframeLabels: () => Record<BaseTimeframe, string>;
  formatMoney: (value: number, fractionDigits?: number) => string;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values?: Array<unknown>) => string;
  setHint: (message: string) => void;
  patchCsvImportCardState: (id: string, patch: Partial<CsvImportCardState>) => void;
  clearCsvImportCardState: (id?: string) => void;
  syncCustomSamplePoolsFromDataSources: () => Promise<CustomSamplePool[]>;
  refreshInstruments: () => Promise<unknown>;
  setCustomSamplePools: Dispatch<SetStateAction<CustomSamplePool[]>>;
  setActiveSamplePoolId: Dispatch<SetStateAction<string>>;
};

export const useCsvImportJobFinalization = ({
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
}: UseCsvImportJobFinalizationParams) => {
  const finishImportCardAsDone = useCallback(
    (cardId: string, options?: { errorMessage?: string }) => {
      if (!cardId || !appIsMountedRef.current) {
        return;
      }
      patchCsvImportCardState(cardId, {
        phase: 'DONE',
        progressPercent: 100,
        compactProgressPercent: 100,
        isPaused: false,
        cancelRequested: false,
        errorMessage: options?.errorMessage ?? ''
      });
    },
    [appIsMountedRef, patchCsvImportCardState]
  );

  const finalizeSuccessfulIncrementalImport = useCallback(
    async (card: CsvImportCardState, jobDetail: ApiLocalDataImportJob) => {
      const followUpResults = await Promise.allSettled([
        syncCustomSamplePoolsFromDataSources(),
        refreshInstruments()
      ]);
      if (!appIsMountedRef.current) {
        return;
      }
      const notice = buildIncrementalUpdateNotice(
        card.poolName,
        jobDetail.outcomeSummary,
        tt,
        ttf,
        {
          outcomeInsight: jobDetail.outcomeInsight,
          missingSymbolsRetained: card.syncMissingSymbolsRetained ?? [],
          failedSymbols: jobDetail.failedFiles.map((item) => item.symbol)
        }
      );
      const clauseDelimiter = tt('appText.message0942');
      const clauseJoiner = clauseDelimiter === ',' ? `${clauseDelimiter} ` : clauseDelimiter;
      const symbolLimitHint = resolveSymbolLimitSkipHint(jobDetail, ttf);
      const followUpErrorMessage = followUpResults.some((result) => result.status === 'rejected')
        ? tt('appText.request')
        : '';
      const hintSegments = [symbolLimitHint].filter((item) => item.trim());
      const followUpHint = hintSegments.length
        ? `${clauseJoiner}${hintSegments.join(clauseJoiner)}`
        : '';
      setHint(followUpHint ? `${notice.hint}${followUpHint}` : notice.hint);
      finishImportCardAsDone(card.id, { errorMessage: followUpErrorMessage });
    },
    [
      appIsMountedRef,
      finishImportCardAsDone,
      refreshInstruments,
      setHint,
      syncCustomSamplePoolsFromDataSources,
      tt,
      ttf
    ]
  );

  const finalizeSuccessfulFullImport = useCallback(
    async (card: CsvImportCardState, jobDetail: ApiLocalDataImportJob) => {
      const sourceIdForSync = String(jobDetail.sourceId || card.sourceId || '').trim();
      const failedSymbols = new Set(
        jobDetail.failedFiles.map((item) => String(item.symbol ?? '').trim().toUpperCase()).filter((item) => Boolean(item))
      );
      const importedFileCount = Math.max(
        0,
        Math.floor(Number(jobDetail.totalFiles) || 0) - Math.floor(Number(jobDetail.errorFiles) || 0)
      );
      const { nextPool, followUpFailed } =
        await settleSuccessfulFullImportFollowUps({
          sourceId: sourceIdForSync,
          syncCustomSamplePoolsFromDataSources,
          refreshInstruments,
        });
      if (!appIsMountedRef.current) {
        return;
      }
      if (nextPool) {
        setCustomSamplePools((current) =>
          current.map((pool) =>
            pool.id === nextPool.id
              ? {
                  ...pool,
                  selected: true,
                  updatedAt: new Date().toISOString()
                }
              : pool
          )
        );
        setActiveSamplePoolId(nextPool.id);
      }

      const folderLabel = card.poolName
        ? `${card.poolName}${tt("appText.message0696")}`
        : '';
      const importFailedHint = failedSymbols.size ? ttf('appText.skippedUnloadableSymbolsValue0', [Array.from(failedSymbols).join(', ')]) : '';
      const clauseDelimiter = tt('appText.message0942');
      const clauseJoiner = clauseDelimiter === ',' ? `${clauseDelimiter} ` : clauseDelimiter;
      const symbolLimitHintText = resolveSymbolLimitSkipHint(jobDetail, ttf);
      const symbolLimitHint = symbolLimitHintText
        ? `${clauseJoiner}${symbolLimitHintText}`
        : '';
      const qualitySkippedRows = resolveImportQualitySkippedRows(jobDetail);
      const qualitySkippedFiles = Math.max(
        qualitySkippedRows > 0 ? 1 : 0,
        0,
        Number(jobDetail.outcomeInsight?.filesWithSkippedRows) || 0
      );
      const importQualityHint = qualitySkippedRows > 0
        ? `${clauseJoiner}${ttf('appText.importSkippedProblemRowsValue0FilesValue1', [
            formatMoney(qualitySkippedRows, 0),
            formatMoney(qualitySkippedFiles, 0)
          ])}`
        : '';
      const compactHint =
        jobDetail.compactBeforeBytes > 0 || jobDetail.compactAfterBytes > 0 || jobDetail.compactReclaimedBytes > 0
          ? `${clauseJoiner}${ttf('appText.compactionResultValue0Value1SavedValue2', [
              formatStorageBytes(Math.max(0, Number(jobDetail.compactBeforeBytes) || 0)),
              formatStorageBytes(Math.max(0, Number(jobDetail.compactAfterBytes) || 0)),
              formatStorageBytes(Math.max(0, Number(jobDetail.compactReclaimedBytes) || 0))
            ])}`
          : '';
      const baseHint = ttf('appText.value0Value1FilesReadSamplePoolContainsValue2Value3', [
        folderLabel,
        formatMoney(Math.max(0, Number(card.totalFiles) || Number(jobDetail.totalFiles) || 0), 0),
        formatMoney(importedFileCount, 0),
        getBaseTimeframeLabels()[card.baseTimeframe]
      ]);

      setHint(`${baseHint}${importFailedHint}${symbolLimitHint}${importQualityHint}${compactHint}`);
      finishImportCardAsDone(card.id, {
        errorMessage: followUpFailed ? tt('appText.request') : '',
      });
    },
    [
      appIsMountedRef,
      finishImportCardAsDone,
      formatMoney,
      formatStorageBytes,
      getBaseTimeframeLabels,
      refreshInstruments,
      setActiveSamplePoolId,
      setCustomSamplePools,
      setHint,
      syncCustomSamplePoolsFromDataSources,
      tt,
      ttf
    ]
  );

  const finalizeImportJob = useCallback(
    async (card: CsvImportCardState, jobDetail: ApiLocalDataImportJob) => {
      if (jobDetail.status === 'CANCELED') {
        clearCsvImportCardState(card.id);
        setHint(tt('appText.requestCanceled'));
        return;
      }
      if (jobDetail.status !== 'SUCCESS' && jobDetail.status !== 'PARTIAL_SUCCESS') {
        throw new Error(resolveLocalDataImportJobErrorMessage(jobDetail.errorMessage, jobDetail));
      }
      if (jobDetail.jobMode === 'INCREMENTAL_UPDATE') {
        await finalizeSuccessfulIncrementalImport(card, jobDetail);
        return;
      }
      await finalizeSuccessfulFullImport(card, jobDetail);
    },
    [
      clearCsvImportCardState,
      finalizeSuccessfulFullImport,
      finalizeSuccessfulIncrementalImport,
      resolveLocalDataImportJobErrorMessage,
      setHint,
      tt
    ]
  );

  return {
    finalizeImportJob,
    finishImportCardAsDone,
  };
};
