// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useRef, useState } from "react";
import {
  api,
  type ApiLocalDataImportPreviewJob,
  type CsvFolderStagingProgress,
} from '@/api';
import {
  chooseNativeDirectory,
  normalizeNativeImportDirectoryPath,
  normalizeNativeImportRelativePath,
  stageCsvFolderForImport,
} from '@/domains/data-import/nativeImportHelpers';
import {
  buildActiveLocalDataImportSourceIds,
  isLocalDataImportSourceBusy,
} from '@/domains/data-import/importActivity';
import { buildIncrementalUpdateNotice } from '@/domains/data-import/incrementalUpdateNotice';
import type { CsvImportCardState } from '@/domains/data-import/useCsvImportController';
import type {
  DataTaskOperationProgress,
  PendingLocalDataSourceSyncPreview,
  PreparingLocalDataSourceSyncPreview,
} from '@/domains/data-import/dataSourceTypes';
import {
  resolveStagingProgressPercent,
  resolvePreviewJobProgressPercent,
  waitForLocalDataImportPreviewJobResult,
} from '@/app-shell/dataSourceMaintenanceHelpers';
import { mergeSelectiveDigestMetadataFiles } from '@/app-shell/dataSourceSyncQuickCheck';
import type {
  ConfirmedLocalDataSourceSyncResult,
  LocalDataSourceSyncPreviewOptions,
  UseDataSourceSyncPreviewActionsArgs,
} from '@/app-shell/useDataSourceSyncPreviewActions.types';

export const useDataSourceSyncPreviewActions = ({
  language,
  appIsMountedRef,
  isClearingLocalDataSources,
  deletingSamplePoolId,
  isPreparingCsvImportPreview,
  customSamplePools,
  localDataSourceSummaries,
  csvImportCardStates,
  importCsv,
  tt,
  ttf,
  resolveUnknownErrorMessage,
  resolveSourceFolderBookmarkIdBySourceId,
  patchCsvImportCardState,
  setError,
  setHint,
  setCsvImportCardStates,
}: UseDataSourceSyncPreviewActionsArgs) => {
  const [pendingLocalDataSourceSyncPreview, setPendingLocalDataSourceSyncPreview] =
    useState<PendingLocalDataSourceSyncPreview | null>(null);
  const [preparingLocalDataSourceSyncPreview, setPreparingLocalDataSourceSyncPreview] =
    useState<PreparingLocalDataSourceSyncPreview | null>(null);
  const localDataSourceSyncPreviewRequestIdRef = useRef(0);

  const createSyncPreviewOperationProgress = useCallback(
    (progressPercent: number | null = null): DataTaskOperationProgress => ({
      label: tt('appText.syncPreviewChecking'),
      progressPercent,
      active: true,
      tone: 'checking',
    }),
    [tt],
  );

  const createSyncPreviewStagingProgress = useCallback(
    (progress: CsvFolderStagingProgress): DataTaskOperationProgress =>
      createSyncPreviewOperationProgress(resolveStagingProgressPercent(progress)),
    [createSyncPreviewOperationProgress],
  );

  const createSyncPreviewJobProgress = useCallback(
    (job: ApiLocalDataImportPreviewJob): DataTaskOperationProgress =>
      createSyncPreviewOperationProgress(resolvePreviewJobProgressPercent(job)),
    [createSyncPreviewOperationProgress],
  );

  const updatePreparingLocalDataSourceSyncPreviewProgress = useCallback(
    (sourceId: string, progress: DataTaskOperationProgress) => {
      const normalizedSourceId = String(sourceId || '').trim();
      if (!normalizedSourceId) {
        return;
      }
      setPreparingLocalDataSourceSyncPreview((current) =>
        current?.sourceId === normalizedSourceId
          ? {
              ...current,
              operationProgress: progress,
            }
          : current,
      );
    },
    [],
  );

  const chooseIncrementalFolder = useCallback(
    async (defaultPath: string) => {
      const chosenFolder = await chooseNativeDirectory({
        defaultPath,
        tt,
        resolveUnknownErrorMessage
      });
      if (!chosenFolder) {
        return null;
      }
      return {
        folderPath: normalizeNativeImportDirectoryPath(chosenFolder),
        bookmarkId: '',
      };
    },
    [resolveUnknownErrorMessage, tt]
  );

  const dismissLocalDataSourceSyncPreview = useCallback(() => {
    localDataSourceSyncPreviewRequestIdRef.current += 1;
    setPreparingLocalDataSourceSyncPreview(null);
    setPendingLocalDataSourceSyncPreview(null);
  }, []);

  const selectLocalDataSourceSyncPreviewPlan = useCallback(
    (previewPlanId: string) => {
      const normalizedPreviewPlanId = String(previewPlanId || '').trim();
      setPendingLocalDataSourceSyncPreview((current) =>
        current
          ? {
              ...current,
              selectedPreviewPlanId: normalizedPreviewPlanId
            }
          : current
      );
    },
    []
  );

  const runConfirmedLocalDataSourceSync = useCallback(
    async (previewState: PendingLocalDataSourceSyncPreview): Promise<ConfirmedLocalDataSourceSyncResult> => {
      const normalizedPoolId = String(previewState.sourceId || '').trim();
      const selectedCandidate =
        previewState.scopeCandidates.find(
          (candidate) =>
            candidate.previewPlanId === previewState.selectedPreviewPlanId
        ) ?? null;
      const previewPlanId = String(previewState.selectedPreviewPlanId || '').trim();
      if (!normalizedPoolId || !previewPlanId || !selectedCandidate) {
        throw new Error(tt('appText.readFolder'));
      }
      const existingCard = csvImportCardStates.find(
        (card) => String(card.sourceId || '').trim() === normalizedPoolId
      );
      const importCardId =
        String(existingCard?.id || '').trim() || `csv-sync-${normalizedPoolId}`;
      const targetFileCount = Math.max(
        0,
        Number(selectedCandidate?.fileCount) || 0
      );

      try {
        setCsvImportCardStates((current) => {
          const nextCard: CsvImportCardState = {
            id: importCardId,
            jobId: '',
            sourceId: normalizedPoolId,
            poolName: previewState.poolName,
            sourceFolder: previewState.sourceFolder,
            syncMissingSymbolsRetained:
              previewState.changeSummary.missingSymbolsRetained,
            baseTimeframe: previewState.baseTimeframe,
            phase: 'UPLOADING',
            progressPercent: 1,
            progressTargetPercent: 1,
            importProgressPercent: 1,
            compactProgressPercent: 0,
            compactProgressTargetPercent: 0,
            compactProgressDisplayPercent: 0,
            compactBeforeBytes: 0,
            compactAfterBytes: 0,
            compactReclaimedBytes: 0,
            compactAfterDisplayBytes: 0,
            compactReclaimedDisplayBytes: 0,
            shouldShowCompactProgress: false,
            doneFiles: 0,
            totalFiles: targetFileCount,
            importedRows: 0,
            skippedRows: 0,
            totalRows: 0,
            isPaused: false,
            cancelRequested: false,
            errorMessage: ''
          };
          const nextStates = current.filter((card) => {
            const cardSourceId = String(card.sourceId || '').trim();
            if (card.id === importCardId) {
              return false;
            }
            if (cardSourceId && cardSourceId === normalizedPoolId) {
              return false;
            }
            return true;
          });
          nextStates.push(nextCard);
          return nextStates;
        });
        const importResult = await importCsv(
          previewState.previewToken,
          previewPlanId,
          targetFileCount,
          previewState.poolName,
          previewState.sourceFolder,
          previewState.mapping,
          previewState.baseTimeframe,
          importCardId,
          {
            mode: 'INCREMENTAL_UPDATE',
            sourceId: normalizedPoolId,
            sourceFolder: previewState.sourceFolder,
            sourceFolderBookmarkId:
              String(previewState.sourceFolderBookmarkId || '').trim() ||
              undefined,
            sourceFolderUsageMode: previewState.sourceFolderUsageMode,
            importScopeStrategy:
              selectedCandidate?.strategy ??
              previewState.importScopeStrategy ??
              null,
            importScopeTopLevelSubfolder:
              normalizeNativeImportRelativePath(
                selectedCandidate?.topLevelSubfolder || '',
              ) ||
              normalizeNativeImportRelativePath(
                previewState.importScopeTopLevelSubfolder || '',
              )
          }
        );
        if (!importResult) {
          return {
            completed: false,
            importedRows: 0,
            ignoredRows: 0,
            ignoredOnly: false
          };
        }
        setHint(tt('appText.systemProcessingWait'));
        return {
          completed: true,
          importedRows: 0,
          ignoredRows: 0,
          ignoredOnly: false,
        };
      } catch (err) {
        if (!appIsMountedRef.current) {
          return {
            completed: false,
            importedRows: 0,
            ignoredRows: 0,
            ignoredOnly: false
          };
        }
        const message = resolveUnknownErrorMessage(err, tt('appText.readFolder'));
        setError(message);
        patchCsvImportCardState(importCardId, {
          phase: 'FAILED',
          isPaused: false,
          cancelRequested: false,
          errorMessage: message
        });
        return {
          completed: false,
          importedRows: 0,
          ignoredRows: 0,
          ignoredOnly: false
        };
      }
    },
    [
      appIsMountedRef,
      csvImportCardStates,
      importCsv,
      patchCsvImportCardState,
      resolveUnknownErrorMessage,
      setCsvImportCardStates,
      setError,
      setHint,
      tt,
    ]
  );

  const confirmLocalDataSourceSyncPreview = useCallback(async () => {
    if (!pendingLocalDataSourceSyncPreview) {
      return;
    }
    const previewState = pendingLocalDataSourceSyncPreview;
    localDataSourceSyncPreviewRequestIdRef.current += 1;
    setPreparingLocalDataSourceSyncPreview(null);
    setPendingLocalDataSourceSyncPreview(null);
    await runConfirmedLocalDataSourceSync(previewState);
  }, [pendingLocalDataSourceSyncPreview, runConfirmedLocalDataSourceSync]);

  const prepareLocalDataSourceSyncPreview = useCallback(async (
    poolId: string,
    options?: LocalDataSourceSyncPreviewOptions
  ) => {
    const normalizedPoolId = String(poolId || '').trim();
    if (!normalizedPoolId) {
      return null;
    }
    if (
      isClearingLocalDataSources ||
      deletingSamplePoolId ||
      isPreparingCsvImportPreview
    ) {
      return null;
    }
    const targetPool = customSamplePools.find(
      (pool) => String(pool.id || '').trim() === normalizedPoolId
    );
    if (!targetPool) {
      return null;
    }
    const sourceFolderUsageMode =
      options?.sourceFolderUsageMode === 'ONE_OFF' ? 'ONE_OFF' : 'BOUND_SOURCE';
    const sourceFolderPath = normalizeNativeImportDirectoryPath(
      targetPool.sourceFolder || '',
    );
    const previousBookmarkId =
      resolveSourceFolderBookmarkIdBySourceId(normalizedPoolId);
    const targetSourceSummary =
      localDataSourceSummaries.find(
        (item) => String(item.id || '').trim() === normalizedPoolId
      ) ?? null;
    if (
      isLocalDataImportSourceBusy(
        normalizedPoolId,
        buildActiveLocalDataImportSourceIds(csvImportCardStates),
        targetSourceSummary,
      )
    ) {
      return null;
    }
    const previewPoolName =
      String(options?.poolName || targetPool.name || '').trim() ||
      tt('appText.unnamedFolder');
    const emitOperationProgress = (progress: DataTaskOperationProgress) => {
      options?.onOperationProgress?.(progress);
    };
    setError('');
    try {
      let resolvedFolderPath = sourceFolderPath;
      let resolvedBookmarkId = previousBookmarkId;
      let stagedMetadataForQuickCheck:
        | Awaited<ReturnType<typeof stageCsvFolderForImport>>
        | null = null;
      if (sourceFolderUsageMode === 'ONE_OFF') {
        const pickedFolder = await chooseIncrementalFolder(sourceFolderPath);
        if (!pickedFolder) {
          return null;
        }
        resolvedFolderPath = pickedFolder.folderPath;
        resolvedBookmarkId = pickedFolder.bookmarkId;
      } else if (!previousBookmarkId) {
        const pickedFolder = await chooseIncrementalFolder(sourceFolderPath);
        if (!pickedFolder) {
          return null;
        }
        resolvedFolderPath = pickedFolder.folderPath;
        resolvedBookmarkId = pickedFolder.bookmarkId;
      } else if (sourceFolderPath || previousBookmarkId) {
        try {
          stagedMetadataForQuickCheck = await stageCsvFolderForImport(
            sourceFolderPath,
            tt,
            previousBookmarkId,
            {
              mode: 'METADATA_ONLY',
              onProgress: (progress) => {
                emitOperationProgress(createSyncPreviewStagingProgress(progress));
              },
            }
          );
          resolvedFolderPath = normalizeNativeImportDirectoryPath(
            stagedMetadataForQuickCheck.sourceFolderPath || sourceFolderPath || '',
          );
          resolvedBookmarkId = String(
            stagedMetadataForQuickCheck.sourceFolderBookmarkId || previousBookmarkId || ''
          ).trim();
        } catch {
          const pickedFolder = await chooseIncrementalFolder(sourceFolderPath);
          if (!pickedFolder) {
            return null;
          }
          resolvedFolderPath = pickedFolder.folderPath;
          resolvedBookmarkId = pickedFolder.bookmarkId;
        }
      } else {
        const pickedFolder = await chooseIncrementalFolder('');
        if (!pickedFolder) {
          return null;
        }
        resolvedFolderPath = pickedFolder.folderPath;
        resolvedBookmarkId = pickedFolder.bookmarkId;
      }
      const stagedMetadata =
        stagedMetadataForQuickCheck ??
        await stageCsvFolderForImport(
          resolvedFolderPath,
          tt,
          resolvedBookmarkId,
          {
            mode: 'METADATA_ONLY',
            onProgress: (progress) => {
              emitOperationProgress(createSyncPreviewStagingProgress(progress));
            },
          }
        );
      resolvedFolderPath = normalizeNativeImportDirectoryPath(
        stagedMetadata.sourceFolderPath || resolvedFolderPath || '',
      );
      resolvedBookmarkId = String(
        stagedMetadata.sourceFolderBookmarkId || resolvedBookmarkId || ''
      ).trim();
      const metadataFiles = stagedMetadata.metadataManifest?.files ?? [];
      if (!metadataFiles.length) {
        throw new Error(tt('appText.importableFileFoundFolder'));
      }

      let quickCheck = await api.quickCheckLocalDataSourceSyncByMetadata(
        normalizedPoolId,
        {
          sourceFolder: resolvedFolderPath || undefined,
          files: metadataFiles
        }
      );
      if (quickCheck.fingerprintRequiredRelativePaths.length > 0) {
        const digestedFiles = await stageCsvFolderForImport(
          resolvedFolderPath,
          tt,
          resolvedBookmarkId,
          {
            mode: 'SELECTIVE_DIGEST',
            relativePaths: quickCheck.fingerprintRequiredRelativePaths,
            onProgress: (progress) => {
              emitOperationProgress(createSyncPreviewStagingProgress(progress));
            },
          }
        );
        quickCheck = await api.quickCheckLocalDataSourceSyncByMetadata(
          normalizedPoolId,
          {
            sourceFolder: resolvedFolderPath || undefined,
            files: mergeSelectiveDigestMetadataFiles({
              metadataFiles,
              digestedFiles: digestedFiles.metadataManifest?.files ?? [],
              requiredRelativePaths:
                quickCheck.fingerprintRequiredRelativePaths,
            })
          }
        );
      }

      if (
        quickCheck.invalidFiles > 0 &&
        quickCheck.changedRelativePaths.length <= 0
      ) {
        throw new Error(tt('appText.importValidation'));
      }

      if (quickCheck.changedRelativePaths.length <= 0) {
        const notice = buildIncrementalUpdateNotice(
          previewPoolName,
          {
            noChanges: true,
            addedSymbols: [],
            updatedSymbols: [],
            unchangedFiles: Math.max(0, Number(quickCheck.detectedFiles) || 0),
            prependedRows: 0,
            appendedRows: 0,
            overlapRowsIgnored: 0,
            internalRangeRowsIgnored: 0,
            conflictRowsIgnored: 0,
            qualityWarnings: {
              filesWithSkippedRows: 0,
              invalidRequiredRowsSkipped: 0,
              invalidOhlcRowsSkipped: 0,
              duplicateConflictRowsSkipped: 0,
              duplicateIdenticalRowsDeduped: 0
            }
          },
          tt,
          ttf,
          {
            missingSymbolsRetained: quickCheck.missingSymbolsRetained
          }
        );
        setHint(notice.hint);
        return null;
      }

      const stagedFolder = await stageCsvFolderForImport(
        resolvedFolderPath,
        tt,
        resolvedBookmarkId,
        {
          mode: 'SELECTIVE_COPY',
          relativePaths: quickCheck.changedRelativePaths,
          onProgress: (progress) => {
            emitOperationProgress(createSyncPreviewStagingProgress(progress));
          },
        }
      );
      if (!stagedFolder.stagedFolderPath) {
        throw new Error(tt('appText.readFolder'));
      }

      const previewJob = await api.startLocalDataImportPreviewJobByPath(
        stagedFolder.stagedFolderPath,
        {
          sourceFolderName: stagedFolder.sourceFolderName || undefined,
          sourceId: normalizedPoolId,
          locale: language,
        },
      );
      const preview = await waitForLocalDataImportPreviewJobResult(
        previewJob,
        tt('appText.readFolder'),
        (job) => {
          emitOperationProgress(createSyncPreviewJobProgress(job));
        },
      );
      if (!preview.previewToken) {
        throw new Error(tt('appText.importConfigurationExpiredRescanFolder'));
      }
      const syncPreview = await api.previewLocalDataSourceSyncByPaths(
        normalizedPoolId,
        {
          previewToken: preview.previewToken,
          sourceFolder: resolvedFolderPath,
          sourceFolderUsageMode
        }
      );
      const selectedPreviewPlanId = String(
        syncPreview.matchedPreviewPlanId || ''
      ).trim();
      if (!selectedPreviewPlanId) {
        throw new Error(tt('appText.readFolder'));
      }

      return {
        sourceId: normalizedPoolId,
        poolName: previewPoolName,
        sourceFolder: resolvedFolderPath,
        sourceFolderBookmarkId: resolvedBookmarkId || undefined,
        sourceFolderUsageMode,
        baseTimeframe: targetPool.baseTimeframe,
        timeZone: syncPreview.timeZone,
        timeZoneOrigin: syncPreview.timeZoneOrigin,
        importScopeStrategy: syncPreview.importScopeStrategy,
        importScopeTopLevelSubfolder:
          syncPreview.importScopeTopLevelSubfolder,
        previewToken: preview.previewToken,
        selectedPreviewPlanId,
        requiresScopeConfirmation:
          syncPreview.requiresScopeConfirmation,
        scopeCandidates: syncPreview.scopeCandidates,
        changeSummary: syncPreview.changeSummary,
        hasLocalSymbolRemoval: Boolean(options?.hasLocalSymbolRemoval),
        removedSymbolCount: Math.max(
          0,
          Number(options?.removedSymbolCount) || 0
        ),
        mapping: targetPool.csvFieldMapping
      } satisfies PendingLocalDataSourceSyncPreview;
    } catch (err) {
      if (!appIsMountedRef.current) {
        return null;
      }
      const message = resolveUnknownErrorMessage(err, tt('appText.readFolder'));
      setError(message);
      return null;
    }
  }, [
    appIsMountedRef,
    chooseIncrementalFolder,
    createSyncPreviewJobProgress,
    createSyncPreviewStagingProgress,
    customSamplePools,
    deletingSamplePoolId,
    isClearingLocalDataSources,
    isPreparingCsvImportPreview,
    csvImportCardStates,
    language,
    localDataSourceSummaries,
    resolveSourceFolderBookmarkIdBySourceId,
    resolveUnknownErrorMessage,
    setError,
    setHint,
    tt,
    ttf
  ]);

  const syncSamplePoolWithSourceFolder = useCallback(async (
    poolId: string,
    options?: LocalDataSourceSyncPreviewOptions
  ) => {
    const normalizedPoolId = String(poolId || '').trim();
    if (!normalizedPoolId) {
      return;
    }
    if (
      isClearingLocalDataSources ||
      deletingSamplePoolId ||
      isPreparingCsvImportPreview
    ) {
      return;
    }
    if (preparingLocalDataSourceSyncPreview || pendingLocalDataSourceSyncPreview) {
      return;
    }
    const targetPool = customSamplePools.find(
      (pool) => String(pool.id || '').trim() === normalizedPoolId
    );
    if (!targetPool) {
      return;
    }
    const targetSourceSummary =
      localDataSourceSummaries.find(
        (item) => String(item.id || '').trim() === normalizedPoolId
      ) ?? null;
    if (
      isLocalDataImportSourceBusy(
        normalizedPoolId,
        buildActiveLocalDataImportSourceIds(csvImportCardStates),
        targetSourceSummary
      )
    ) {
      return;
    }
    const sourceFolderUsageMode =
      options?.sourceFolderUsageMode === 'ONE_OFF' ? 'ONE_OFF' : 'BOUND_SOURCE';
    const requestId = localDataSourceSyncPreviewRequestIdRef.current + 1;
    localDataSourceSyncPreviewRequestIdRef.current = requestId;
    const initialOperationProgress = createSyncPreviewOperationProgress();
    setPendingLocalDataSourceSyncPreview(null);
    setPreparingLocalDataSourceSyncPreview({
      sourceId: normalizedPoolId,
      poolName:
        String(options?.poolName || targetPool.name || '').trim() ||
        tt('appText.unnamedFolder'),
      sourceFolderUsageMode,
      operationProgress: initialOperationProgress,
    });
    options?.onOperationProgress?.(initialOperationProgress);
    const previewState = await prepareLocalDataSourceSyncPreview(poolId, {
      ...options,
      onOperationProgress: (progress) => {
        updatePreparingLocalDataSourceSyncPreviewProgress(
          normalizedPoolId,
          progress,
        );
        options?.onOperationProgress?.(progress);
      },
    });
    if (
      !appIsMountedRef.current ||
      localDataSourceSyncPreviewRequestIdRef.current !== requestId
    ) {
      return;
    }
    if (!previewState) {
      setPreparingLocalDataSourceSyncPreview(null);
      return;
    }
    setPreparingLocalDataSourceSyncPreview(null);
    await runConfirmedLocalDataSourceSync(previewState);
  }, [
    appIsMountedRef,
    csvImportCardStates,
    createSyncPreviewOperationProgress,
    customSamplePools,
    deletingSamplePoolId,
    isClearingLocalDataSources,
    isPreparingCsvImportPreview,
    localDataSourceSummaries,
    pendingLocalDataSourceSyncPreview,
    prepareLocalDataSourceSyncPreview,
    preparingLocalDataSourceSyncPreview,
    runConfirmedLocalDataSourceSync,
    tt,
    updatePreparingLocalDataSourceSyncPreviewProgress,
  ]);

  return {
    pendingLocalDataSourceSyncPreview,
    preparingLocalDataSourceSyncPreview,
    dismissLocalDataSourceSyncPreview,
    selectLocalDataSourceSyncPreviewPlan,
    confirmLocalDataSourceSyncPreview,
    prepareLocalDataSourceSyncPreview,
    runConfirmedLocalDataSourceSync,
    syncSamplePoolWithSourceFolder,
  };
};
