// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import {
  api,
  toBackendErrorMessage,
  type ApiLocalDataImportJob,
} from '@/api';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import type { CsvImportCardState } from '@/domains/data-import/useCsvImportController';
import {
  LOCAL_DATA_IMPORT_JOB_CLIENT_DEADLINE_MS,
  hasLocalDataImportJobExceededClientDeadline,
  isActiveImportJobStatus,
  waitForImportJobPollTick,
  buildImportCardPatchFromJob,
} from '@/domains/data-import/csvImportJobHelpers';

type UseCsvImportJobMonitorParams = {
  appIsMountedRef: MutableRefObject<boolean>;
  csvImportCardStates: CsvImportCardState[];
  finalizeImportJob: (card: CsvImportCardState, jobDetail: ApiLocalDataImportJob) => Promise<void>;
  patchCsvImportCardState: (id: string, patch: Partial<CsvImportCardState>) => void;
  markCsvImportBatchFinished: () => void;
  resolveUnknownErrorMessage: (error: unknown, fallback: string) => string;
  tt: (key: AppTextKey) => string;
  setError: (message: string) => void;
};

export const useCsvImportJobMonitor = ({
  appIsMountedRef,
  csvImportCardStates,
  finalizeImportJob,
  patchCsvImportCardState,
  markCsvImportBatchFinished,
  resolveUnknownErrorMessage,
  tt,
  setError,
}: UseCsvImportJobMonitorParams) => {
  const monitoredImportJobIdsRef = useRef(new Set<string>());
  const finalizedImportJobIdsRef = useRef(new Set<string>());

  const patchImportCardFromJob = useCallback(
    (cardId: string, job: ApiLocalDataImportJob, fallbackTotalFiles: number) => {
      if (!cardId || !appIsMountedRef.current) {
        return;
      }
      patchCsvImportCardState(
        cardId,
        buildImportCardPatchFromJob(
          job,
          fallbackTotalFiles
        )
      );
    },
    [appIsMountedRef, patchCsvImportCardState]
  );

  const monitorCsvImportJob = useCallback(
    async (card: CsvImportCardState) => {
      const jobId = String(card.jobId || '').trim();
      if (!jobId || finalizedImportJobIdsRef.current.has(jobId)) {
        return;
      }
      const pollAbortController = new AbortController();
      const monitorStartedAtMs = Date.now();
      let shouldReleaseImportSlot = true;
      try {
        let jobDetail = await api.getLocalDataImportJob(jobId, {
          signal: pollAbortController.signal
        });
        while (isActiveImportJobStatus(jobDetail.status)) {
          if (!appIsMountedRef.current) {
            shouldReleaseImportSlot = false;
            return;
          }
          if (
            hasLocalDataImportJobExceededClientDeadline({
              job: jobDetail,
              monitorStartedAtMs,
            })
          ) {
            await api
              .controlLocalDataImportJob(jobId, 'CANCEL', {
                signal: pollAbortController.signal,
                timeoutMs: 5_000,
              })
              .catch(() => undefined);
            throw new Error(
              toBackendErrorMessage(
                'LOCAL_DATA_IMPORT_JOB_TIMEOUT',
                { timeoutMs: LOCAL_DATA_IMPORT_JOB_CLIENT_DEADLINE_MS },
                408,
              ),
            );
          }
          patchImportCardFromJob(card.id, jobDetail, card.totalFiles);
          await waitForImportJobPollTick(jobDetail.phaseFacts.pollDelayMs, pollAbortController.signal);
          jobDetail = await api.getLocalDataImportJob(jobId, {
            signal: pollAbortController.signal
          });
        }
        if (finalizedImportJobIdsRef.current.has(jobId)) {
          return;
        }
        finalizedImportJobIdsRef.current.add(jobId);
        patchImportCardFromJob(card.id, jobDetail, card.totalFiles);
        await finalizeImportJob(
          {
            ...card,
            sourceId: jobDetail.sourceId || card.sourceId
          },
          jobDetail
        );
      } catch (err) {
        if (!appIsMountedRef.current || pollAbortController.signal.aborted) {
          shouldReleaseImportSlot = false;
          return;
        }
        finalizedImportJobIdsRef.current.add(jobId);
        const message = resolveUnknownErrorMessage(err, tt('appText.import'));
        setError(message);
        patchCsvImportCardState(card.id, {
          phase: 'FAILED',
          isPaused: false,
          cancelRequested: false,
          errorMessage: message
        });
      } finally {
        pollAbortController.abort();
        monitoredImportJobIdsRef.current.delete(jobId);
        if (shouldReleaseImportSlot) {
          markCsvImportBatchFinished();
        }
      }
    },
    [
      appIsMountedRef,
      finalizeImportJob,
      markCsvImportBatchFinished,
      patchCsvImportCardState,
      patchImportCardFromJob,
      resolveUnknownErrorMessage,
      setError,
      tt
    ]
  );

  useEffect(() => {
    csvImportCardStates.forEach((card) => {
      const jobId = String(card.jobId || '').trim();
      if (!jobId || card.phase === 'DONE' || card.phase === 'FAILED') {
        return;
      }
      if (monitoredImportJobIdsRef.current.has(jobId) || finalizedImportJobIdsRef.current.has(jobId)) {
        return;
      }
      monitoredImportJobIdsRef.current.add(jobId);
      void monitorCsvImportJob(card);
    });
  }, [csvImportCardStates, monitorCsvImportJob]);

  return {
    monitorCsvImportJob,
    monitoredImportJobIdsRef,
  };
};
