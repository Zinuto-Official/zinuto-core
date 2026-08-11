// SPDX-License-Identifier: GPL-3.0-only

import type { DataSourceSyncMonitorStateById, DataSourceSyncPrefsById, DataTaskOperationProgress, PendingLocalDataSourceSyncPreview } from "@/domains/data-import/dataSourceTypes";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  type ApiLocalDataSourceSummary,
  type CsvFolderStagingProgress,
} from '@/api';
import type {
  CustomSamplePool
} from "@/frontend-kernel/appTypes";
import {
  createDefaultDataSourceSyncMonitorEntry,
  createEmptyDataSourceSyncSymbolLimit,
  getDataSourceSyncPreference,
  mergeDataSourceSyncMonitorEntry,
  sanitizeDataSourceSyncMonitorStateById,
} from '@/app-shell/dataSourceSyncMonitor';
import { resolveDataSourceSyncQuickCheckWithSelectiveDigest } from '@/app-shell/dataSourceSyncQuickCheck';
import type { WorkspacePage } from '@/frontend-kernel/workspacePageModel';
import {
  normalizeNativeImportDirectoryPath,
  stageCsvFolderForImport,
} from '@/domains/data-import/nativeImportHelpers';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import type { CsvImportCardState } from '@/domains/data-import/useCsvImportController';
import { getCurrentUiLanguage } from '@/frontend-kernel/i18n/localeState';
import { formatMessage } from '@zinuto/shared/i18n';

const DATA_SYNC_SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const DATA_SYNC_USER_CHECK_MIN_VISIBLE_MS = 1_500;

type UseDataSourceSyncMonitorControllerArgs = {
  activePage: WorkspacePage;
  customSamplePools: CustomSamplePool[];
  localDataSourceSummaries: ApiLocalDataSourceSummary[];
  csvImportCardStates: CsvImportCardState[];
  dataSourceSyncPrefsById: DataSourceSyncPrefsById;
  isClearingLocalDataSources: boolean;
  deletingSamplePoolId: string;
  isPreparingCsvImportPreview: boolean;
  isCsvImporting: boolean;
  tt: (key: AppTextKey) => string;
  setError: (message: string) => void;
  resolveUnknownErrorMessage: (error: unknown, fallbackMessage: string) => string;
  prepareLocalDataSourceSyncPreview: (
    poolId: string,
    options?: {
      hasLocalSymbolRemoval?: boolean;
      removedSymbolCount?: number;
      poolName?: string;
      sourceFolderUsageMode?: 'BOUND_SOURCE' | 'ONE_OFF';
      onOperationProgress?: (progress: DataTaskOperationProgress) => void;
    },
  ) => Promise<PendingLocalDataSourceSyncPreview | null>;
  runConfirmedLocalDataSourceSync: (
    previewState: PendingLocalDataSourceSyncPreview,
  ) => Promise<{
    completed: boolean;
    importedRows: number;
    ignoredRows: number;
    ignoredOnly: boolean;
  }>;
};

type RunQuickCheckOptions = {
  allowAutoSync?: boolean;
  trigger?: 'BACKGROUND' | 'USER';
};

type RunQuickCheckSweepOptions = {
  force?: boolean;
  trigger?: 'BACKGROUND' | 'USER';
};

const isActiveImportCard = (card: CsvImportCardState): boolean =>
  card.phase === 'UPLOADING' ||
  card.phase === 'IMPORTING' ||
  card.phase === 'FINALIZING';

const resolveSyncMonitorFailureMessage = (): string =>
  formatMessage(getCurrentUiLanguage(), 'common.status.requestFailed');

const clampProgressPercent = (value: unknown): number | null => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }
  return Math.max(0, Math.min(100, numericValue));
};

const resolveStagingProgressPercent = (
  progress: CsvFolderStagingProgress,
): number | null => {
  if (progress.phase === 'DONE') {
    return 100;
  }
  if (!progress.totalFiles && !progress.totalBytes) {
    return null;
  }
  return clampProgressPercent(progress.progressPercent);
};

const waitForMinimumVisibleDuration = async (
  startedAt: number,
  minimumDurationMs: number,
): Promise<void> => {
  const remainingDurationMs = Math.max(
    0,
    minimumDurationMs - (Date.now() - startedAt),
  );
  if (remainingDurationMs <= 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, remainingDurationMs);
  });
};

export const useDataSourceSyncMonitorController = ({
  activePage,
  customSamplePools,
  localDataSourceSummaries,
  csvImportCardStates,
  dataSourceSyncPrefsById,
  isClearingLocalDataSources,
  deletingSamplePoolId,
  isPreparingCsvImportPreview,
  isCsvImporting,
  tt,
  setError,
  resolveUnknownErrorMessage,
  prepareLocalDataSourceSyncPreview,
  runConfirmedLocalDataSourceSync,
}: UseDataSourceSyncMonitorControllerArgs) => {
  const [dataSourceSyncMonitorStateById, setDataSourceSyncMonitorStateById] =
    useState<DataSourceSyncMonitorStateById>({});
  const isSweepRunningRef = useRef(false);
  const lastSweepStartedAtRef = useRef(0);
  const runDataSourceSyncQuickCheckSweepRef = useRef<
    ((options?: RunQuickCheckSweepOptions) => Promise<void>) | null
  >(null);
  const activatedSweepKeyRef = useRef('');
  const previousActiveImportSourceIdsRef = useRef<string>('');
  const lastReportedBlockingErrorBySourceIdRef = useRef<Record<string, string>>(
    {},
  );

  const eligiblePoolIds = useMemo(
    () =>
      customSamplePools
        .map((pool) => String(pool.id || '').trim())
        .filter(Boolean),
    [customSamplePools],
  );
  const eligiblePoolIdsSignature = useMemo(
    () => eligiblePoolIds.join('||'),
    [eligiblePoolIds],
  );

  const setMonitorEntry = useCallback(
    (
      sourceId: string,
      patch:
        | Partial<NonNullable<DataSourceSyncMonitorStateById[string]>>
        | ((
            current: NonNullable<DataSourceSyncMonitorStateById[string]>,
          ) => Partial<NonNullable<DataSourceSyncMonitorStateById[string]>>),
    ) => {
      const normalizedSourceId = String(sourceId || '').trim();
      if (!normalizedSourceId) {
        return;
      }
      setDataSourceSyncMonitorStateById((current) => {
        const nextPatch =
          typeof patch === 'function'
            ? patch(
                current[normalizedSourceId] ??
                  createDefaultDataSourceSyncMonitorEntry({
                    sourceId: normalizedSourceId,
                    mode: getDataSourceSyncPreference(
                      normalizedSourceId,
                      dataSourceSyncPrefsById,
                    ).mode,
                  }),
              )
            : patch;
        return {
          ...current,
          [normalizedSourceId]: mergeDataSourceSyncMonitorEntry(
            current[normalizedSourceId],
            {
              sourceId: normalizedSourceId,
              mode: getDataSourceSyncPreference(
                normalizedSourceId,
                dataSourceSyncPrefsById,
              ).mode,
              ...nextPatch,
            },
          ),
        };
      });
    },
    [dataSourceSyncPrefsById],
  );

  useEffect(() => {
    setDataSourceSyncMonitorStateById((current) =>
      sanitizeDataSourceSyncMonitorStateById(
        current,
        eligiblePoolIds,
        dataSourceSyncPrefsById,
      ),
    );
  }, [dataSourceSyncPrefsById, eligiblePoolIds]);

  const reportBlockingSyncError = useCallback(
    (sourceId: string, message: string) => {
      const normalizedSourceId = String(sourceId || '').trim();
      const normalizedMessage = String(message || '').trim();
      if (!normalizedSourceId || !normalizedMessage) {
        return;
      }
      if (
        lastReportedBlockingErrorBySourceIdRef.current[normalizedSourceId] ===
        normalizedMessage
      ) {
        return;
      }
      lastReportedBlockingErrorBySourceIdRef.current[normalizedSourceId] =
        normalizedMessage;
      setError(normalizedMessage);
    },
    [setError],
  );

  const clearBlockingSyncError = useCallback((sourceId: string) => {
    const normalizedSourceId = String(sourceId || '').trim();
    if (!normalizedSourceId) {
      return;
    }
    delete lastReportedBlockingErrorBySourceIdRef.current[normalizedSourceId];
  }, []);

  const createCheckingOperationProgress = useCallback(
    (progress?: CsvFolderStagingProgress): DataTaskOperationProgress => ({
      label: tt('appText.checking'),
      progressPercent: progress ? resolveStagingProgressPercent(progress) : null,
      active: true,
      tone: 'checking',
    }),
    [tt],
  );

  const createSyncPreviewOperationProgress = useCallback(
    (progressPercent: number | null = null): DataTaskOperationProgress => ({
      label: tt('appText.syncPreviewChecking'),
      progressPercent,
      active: true,
      tone: 'checking',
    }),
    [tt],
  );

  const createSyncingOperationProgress = useCallback(
    (): DataTaskOperationProgress => ({
      label: tt('appText.syncing'),
      progressPercent: null,
      active: true,
      tone: 'syncing',
    }),
    [tt],
  );

  const runDataSourceSyncQuickCheck = useCallback(
    async (
      sourceId: string,
      options?: RunQuickCheckOptions,
    ): Promise<void> => {
      const normalizedSourceId = String(sourceId || '').trim();
      if (!normalizedSourceId) {
        return;
      }
      if (
        isClearingLocalDataSources ||
        Boolean(deletingSamplePoolId) ||
        isPreparingCsvImportPreview
      ) {
        return;
      }

      const sourceSummary =
        localDataSourceSummaries.find(
          (item) => String(item.id || '').trim() === normalizedSourceId,
        ) ?? null;
      const pool =
        customSamplePools.find(
          (item) => String(item.id || '').trim() === normalizedSourceId,
        ) ?? null;
      const activeImportCard =
        csvImportCardStates.find(
          (card) => String(card.sourceId || '').trim() === normalizedSourceId,
        ) ?? null;
      const pref = getDataSourceSyncPreference(
        normalizedSourceId,
        dataSourceSyncPrefsById,
      );
      if (pref.mode === 'MANUAL' && options?.trigger !== 'USER') {
        return;
      }
      if (!sourceSummary || !pool) {
        const message = resolveSyncMonitorFailureMessage();
        setMonitorEntry(normalizedSourceId, {
          status: 'ERROR',
          quickCheckStatus: 'UNABLE_TO_CHECK',
          reasonCode: 'LOCAL_DATA_SOURCE_NOT_FOUND',
          lastError: message,
          symbolLimit: createEmptyDataSourceSyncSymbolLimit(),
          autoSyncArmed: false,
          operationProgress: null,
        });
        reportBlockingSyncError(normalizedSourceId, message);
        return;
      }
      if (
        sourceSummary.requiresSourceFolderRebind ||
        sourceSummary.sourceLocked ||
        sourceSummary.status !== 'READY' ||
        (activeImportCard ? isActiveImportCard(activeImportCard) : false)
      ) {
        return;
      }

      const checkingStartedAt = Date.now();
      setMonitorEntry(normalizedSourceId, {
        status: 'CHECKING',
        quickCheckStatus: null,
        reasonCode: '',
        estimatedChangedFiles: 0,
        estimatedChangedSymbols: 0,
        missingSymbolsRetained: [],
        changedSymbols: [],
        invalidFiles: 0,
        symbolLimit: createEmptyDataSourceSyncSymbolLimit(),
        lastError: null,
        autoSyncArmed: false,
        operationProgress: createCheckingOperationProgress(),
      });

      try {
        const quickCheck = await resolveDataSourceSyncQuickCheckWithSelectiveDigest({
          sourceId: normalizedSourceId,
          sourceFolder: normalizeNativeImportDirectoryPath(
            pool.sourceFolder || '',
          ),
          sourceFolderBookmarkId: String(sourceSummary.sourceFolderBookmarkId || '').trim(),
          tt,
          stageFolderForImport: stageCsvFolderForImport,
          quickCheckByMetadata: api.quickCheckLocalDataSourceSyncByMetadata,
          onProgress: (progress) => {
            setMonitorEntry(normalizedSourceId, {
              status: 'CHECKING',
              operationProgress: createCheckingOperationProgress(progress),
            });
          },
        });

        if (
          quickCheck.status === 'NO_CHANGES' &&
          options?.trigger === 'USER'
        ) {
          await waitForMinimumVisibleDuration(
            checkingStartedAt,
            DATA_SYNC_USER_CHECK_MIN_VISIBLE_MS,
          );
        }

        setMonitorEntry(normalizedSourceId, {
          status:
            quickCheck.status === 'NO_CHANGES'
              ? 'CLEAN'
              : quickCheck.status === 'POTENTIAL_CHANGES'
                ? 'DIRTY'
                : 'ERROR',
          quickCheckStatus: quickCheck.status,
          reasonCode: quickCheck.reasonCode,
          checkedAt: quickCheck.checkedAt || null,
          estimatedChangedFiles: quickCheck.estimatedChangedFiles,
          estimatedChangedSymbols: quickCheck.estimatedChangedSymbols,
          missingSymbolsRetained: quickCheck.missingSymbolsRetained,
          changedSymbols: quickCheck.changedSymbols,
          invalidFiles: quickCheck.invalidFiles,
          symbolLimit: quickCheck.symbolLimit,
          lastError: null,
          autoSyncArmed:
            quickCheck.status === 'POTENTIAL_CHANGES' &&
            pref.mode === 'AUTO' &&
            Boolean(options?.allowAutoSync),
          operationProgress: null,
        });
        clearBlockingSyncError(normalizedSourceId);

        if (
          quickCheck.status !== 'POTENTIAL_CHANGES' ||
          pref.mode !== 'AUTO' ||
          !options?.allowAutoSync ||
          isCsvImporting
        ) {
          return;
        }

        setMonitorEntry(normalizedSourceId, {
          operationProgress: createSyncPreviewOperationProgress(),
        });
        const previewState = await prepareLocalDataSourceSyncPreview(
          normalizedSourceId,
          {
            poolName: pool.name,
            sourceFolderUsageMode: 'BOUND_SOURCE',
            onOperationProgress: (progress) => {
              setMonitorEntry(normalizedSourceId, {
                operationProgress: progress,
              });
            },
          },
        );
        if (!previewState) {
          const message = resolveSyncMonitorFailureMessage();
          setMonitorEntry(normalizedSourceId, {
            status: 'ERROR',
            quickCheckStatus: quickCheck.status,
            reasonCode: 'SYNC_AUTO_PREVIEW_FAILED',
            lastError: message,
            autoSyncArmed: false,
            operationProgress: null,
          });
          reportBlockingSyncError(normalizedSourceId, message);
          return;
        }
        if (
          previewState.requiresScopeConfirmation ||
          !previewState.selectedPreviewPlanId
        ) {
          setMonitorEntry(normalizedSourceId, {
            status: 'NEEDS_CONFIRMATION',
            quickCheckStatus: quickCheck.status,
            reasonCode: 'SYNC_AUTO_CONFIRMATION_REQUIRED',
            autoSyncArmed: false,
            operationProgress: null,
          });
          return;
        }
        if (previewState.changeSummary.changedFiles <= 0) {
          setMonitorEntry(normalizedSourceId, {
            status: 'NEEDS_CONFIRMATION',
            quickCheckStatus: quickCheck.status,
            reasonCode: 'SYNC_AUTO_NO_INCREMENTAL_WORK',
            autoSyncArmed: false,
            operationProgress: null,
          });
          return;
        }

        setMonitorEntry(normalizedSourceId, {
          status: 'SYNCING',
          quickCheckStatus: quickCheck.status,
          reasonCode: 'SYNC_AUTO_RUNNING',
          autoSyncArmed: true,
          operationProgress: createSyncingOperationProgress(),
        });
        const syncResult = await runConfirmedLocalDataSourceSync(previewState);
        if (!syncResult.completed) {
          const message = resolveSyncMonitorFailureMessage();
          setMonitorEntry(normalizedSourceId, {
            status: 'NEEDS_CONFIRMATION',
            quickCheckStatus: quickCheck.status,
            reasonCode: 'SYNC_AUTO_INCOMPLETE',
            lastError: message,
            autoSyncArmed: false,
            operationProgress: null,
          });
          reportBlockingSyncError(normalizedSourceId, message);
          return;
        }
        if (syncResult.ignoredOnly) {
          setMonitorEntry(normalizedSourceId, {
            status: 'NEEDS_CONFIRMATION',
            quickCheckStatus: quickCheck.status,
            reasonCode: 'SYNC_AUTO_IGNORED_ONLY',
            checkedAt: new Date().toISOString(),
            autoSyncArmed: false,
            operationProgress: null,
          });
          return;
        }
        setMonitorEntry(normalizedSourceId, {
          status: 'CLEAN',
          quickCheckStatus: 'NO_CHANGES',
          reasonCode: 'SYNC_AUTO_COMPLETED',
          checkedAt: new Date().toISOString(),
          estimatedChangedFiles: 0,
          estimatedChangedSymbols: 0,
          missingSymbolsRetained: [],
          changedSymbols: [],
          invalidFiles: 0,
          symbolLimit: createEmptyDataSourceSyncSymbolLimit(),
          lastError: null,
          autoSyncArmed: false,
          operationProgress: null,
        });
        clearBlockingSyncError(normalizedSourceId);
      } catch (error) {
        const message = resolveUnknownErrorMessage(
          error,
          resolveSyncMonitorFailureMessage(),
        );
        setMonitorEntry(normalizedSourceId, {
          status: 'ERROR',
          quickCheckStatus: 'UNABLE_TO_CHECK',
          reasonCode: 'SYNC_QUICK_CHECK_FAILED',
          lastError: message,
          symbolLimit: createEmptyDataSourceSyncSymbolLimit(),
          autoSyncArmed: false,
          operationProgress: null,
        });
        reportBlockingSyncError(normalizedSourceId, message);
      }
    },
    [
      csvImportCardStates,
      createCheckingOperationProgress,
      createSyncPreviewOperationProgress,
      createSyncingOperationProgress,
      customSamplePools,
      dataSourceSyncPrefsById,
      deletingSamplePoolId,
      isClearingLocalDataSources,
      isCsvImporting,
      isPreparingCsvImportPreview,
      localDataSourceSummaries,
      prepareLocalDataSourceSyncPreview,
      clearBlockingSyncError,
      reportBlockingSyncError,
      resolveUnknownErrorMessage,
      runConfirmedLocalDataSourceSync,
      setError,
      setMonitorEntry,
      tt,
    ],
  );

  const runDataSourceSyncQuickCheckSweep = useCallback(
    async (options?: RunQuickCheckSweepOptions) => {
      if (activePage !== 'DATA') {
        return;
      }
      if (
        isSweepRunningRef.current ||
        isClearingLocalDataSources ||
        Boolean(deletingSamplePoolId) ||
        isPreparingCsvImportPreview
      ) {
        return;
      }
      const now = Date.now();
      if (
        !options?.force &&
        now - lastSweepStartedAtRef.current < DATA_SYNC_SWEEP_INTERVAL_MS
      ) {
        return;
      }
      isSweepRunningRef.current = true;
      lastSweepStartedAtRef.current = now;
      try {
        const trigger = options?.trigger ?? 'BACKGROUND';
        for (const sourceId of eligiblePoolIds) {
          // Keep the sweep intentionally serial to avoid spiking filesystem work.
          // eslint-disable-next-line no-await-in-loop
          await runDataSourceSyncQuickCheck(sourceId, {
            allowAutoSync: true,
            trigger,
          });
        }
      } finally {
        isSweepRunningRef.current = false;
      }
    },
    [
      activePage,
      deletingSamplePoolId,
      eligiblePoolIds,
      isClearingLocalDataSources,
      isPreparingCsvImportPreview,
      runDataSourceSyncQuickCheck,
    ],
  );

  useEffect(() => {
    runDataSourceSyncQuickCheckSweepRef.current = runDataSourceSyncQuickCheckSweep;
  }, [runDataSourceSyncQuickCheckSweep]);

  useEffect(() => {
    if (activePage !== 'DATA') {
      activatedSweepKeyRef.current = '';
      return;
    }
    const nextSweepKey = `${activePage}:${eligiblePoolIdsSignature}`;
    if (activatedSweepKeyRef.current !== nextSweepKey) {
      activatedSweepKeyRef.current = nextSweepKey;
      void runDataSourceSyncQuickCheckSweepRef.current?.({ force: true });
    }
    const timerId = window.setInterval(() => {
      void runDataSourceSyncQuickCheckSweepRef.current?.();
    }, DATA_SYNC_SWEEP_INTERVAL_MS);
    return () => {
      window.clearInterval(timerId);
    };
  }, [activePage, eligiblePoolIdsSignature]);

  useEffect(() => {
    const activeSourceIds = Array.from(
      new Set(
        csvImportCardStates
          .filter((card) => isActiveImportCard(card))
          .map((card) => String(card.sourceId || '').trim())
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right, 'en'));
    const nextActiveSourceIdsJson = JSON.stringify(activeSourceIds);
    const previousActiveSourceIds = new Set<string>(
      previousActiveImportSourceIdsRef.current
        ? (JSON.parse(previousActiveImportSourceIdsRef.current) as string[])
        : [],
    );
    const activeSourceIdSet = new Set(activeSourceIds);
    const settledImportSourceIds = Array.from(previousActiveSourceIds).filter(
      (sourceId) => !activeSourceIdSet.has(sourceId),
    );
    setDataSourceSyncMonitorStateById((current) => {
      let changed = false;
      let next = current;
      activeSourceIds.forEach((sourceId) => {
        const merged = mergeDataSourceSyncMonitorEntry(current[sourceId], {
          sourceId,
          mode: getDataSourceSyncPreference(sourceId, dataSourceSyncPrefsById).mode,
          status: 'SYNCING',
          autoSyncArmed: false,
          operationProgress: null,
        });
        if (current[sourceId] !== merged) {
          next = { ...next, [sourceId]: merged };
          changed = true;
        }
      });
      settledImportSourceIds.forEach((sourceId) => {
        const entry = next[sourceId];
        if (
          entry?.status !== 'SYNCING' ||
          entry.operationProgress?.active
        ) {
          return;
        }
        const merged = mergeDataSourceSyncMonitorEntry(entry, {
          sourceId,
          mode: getDataSourceSyncPreference(sourceId, dataSourceSyncPrefsById).mode,
          status: 'IDLE',
          autoSyncArmed: false,
          operationProgress: null,
        });
        if (entry !== merged) {
          next = { ...next, [sourceId]: merged };
          changed = true;
        }
      });
      return changed ? next : current;
    });
    if (
      previousActiveImportSourceIdsRef.current &&
      previousActiveImportSourceIdsRef.current !== nextActiveSourceIdsJson &&
      activePage === 'DATA'
    ) {
      void runDataSourceSyncQuickCheckSweep({ force: true });
    }
    previousActiveImportSourceIdsRef.current = nextActiveSourceIdsJson;
  }, [
    activePage,
    csvImportCardStates,
    dataSourceSyncPrefsById,
    runDataSourceSyncQuickCheckSweep,
  ]);

  return {
    dataSourceSyncMonitorStateById,
    runDataSourceSyncQuickCheck,
    runDataSourceSyncQuickCheckSweep,
  };
};
