// SPDX-License-Identifier: GPL-3.0-only

import type { PendingCsvFolderImport } from "@/domains/data-import/dataSourceTypes";
import { useCallback, useEffect, useMemo, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
  api,
  normalizeApiTradingCalendarConfig,
  type ApiLocalDataSourceSummary,
  type ApiLocalDataImportPreviewJob,
  type CsvFolderStagingProgress,
} from '@/api';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import { reportAppError } from '@/frontend-kernel/errors/appErrorUtils';
import { LOCAL_POOL_IMPORT_PREVIEW_PROGRESS_MIN_MS, waitForNextAnimationFrame } from '@/frontend-kernel/runtimeConstants';
import {
  usePendingCsvDraftValidation,
} from '@/app-shell/usePendingCsvDraftValidation';
import {
  createCsvFolderStagingProgressRafBuffer,
  normalizeDetectedTimeframes,
  resolveFullReimportPreviewPlan,
} from '@/app-shell/csvImportPreviewRuntime';
import type { CsvImportPlanConfigRow } from '@/app-shell/AppCsvMappingModal';
import {
  type CsvImportEntryMode,
  type CsvImportActionStartResult,
  type CsvImportPreparationResult,
  type CsvPoolNamingStrategy,
  type PendingCsvImportTargetSourceOption,
  type PendingCsvPlanOverride,
  resolveCsvImportEntryBlockCode,
} from '@/app-shell/appCsvImportContracts';
import {
  normalizeCsvFieldMapping,
  type CsvFieldMapping,
} from '@/domains/data-import/csvHelpers';
import { normalizeTimeZone, resolveSystemTimeZone } from '@zinuto/shared/timezone';
import {
  chooseNativeDirectory,
  normalizeDroppedImportFolderPath,
  normalizeNativeImportDirectoryPath,
  normalizeNativeImportRelativePath,
  resolveNativeImportDirectoryName,
  stageCsvFolderForImport,
} from '@/domains/data-import/nativeImportHelpers';
import { waitForLocalDataImportPreviewJobResult } from '@/app-shell/dataSourceMaintenanceHelpers';
import type {
  CsvImportPreviewProgressState,
} from '@/domains/data-import/useCsvImportController';

type FinishCsvImportPreviewProgressParams = {
  startAt: number;
  previewReady: boolean;
  minDurationMs: number;
  readyHideDelayMs?: number;
  failHideDelayMs?: number;
};

const throwIfCsvImportPreparationAborted = (signal?: AbortSignal): void => {
  if (!signal?.aborted) {
    return;
  }
  throw (
    signal.reason ??
    new DOMException('CSV_IMPORT_PREPARATION_ABORTED', 'AbortError')
  );
};

const isCsvImportPreparationAbort = (
  error: unknown,
  signal?: AbortSignal,
): boolean =>
  Boolean(signal?.aborted) ||
  (error instanceof DOMException && error.name === 'AbortError');

type UseAppCsvImportPreviewActionsParams = {
  language: string;
  appIsMountedRef: MutableRefObject<boolean>;
  lastCsvImportFolderOpenRef: MutableRefObject<{ path: string; at: number }>;
  isPreparingCsvImportPreview: boolean;
  isClearingLocalDataSources: boolean;
  deletingSamplePoolId: string;
  localDataSourceSummaries: ApiLocalDataSourceSummary[];
  pendingCsvFolderImport: PendingCsvFolderImport | null;
  pendingCsvFieldMapping: CsvFieldMapping | null;
  pendingCsvImportTimeZone: string;
  pendingCsvImportTimeZoneMode: 'AUTO' | 'MANUAL';
  pendingCsvImportTimeZoneConfirmed: boolean;
  pendingCsvPlanOverrides: Record<string, PendingCsvPlanOverride>;
  pendingCsvImportTargetSourceOptions: PendingCsvImportTargetSourceOption[];
  pendingCsvPlanConfigRows: CsvImportPlanConfigRow[];
  beginCsvImportPreviewProgress: () => void;
  updateCsvImportPreviewProgress: (patch: Partial<CsvImportPreviewProgressState>) => void;
  markCsvImportPreviewReady: () => void;
  finishCsvImportPreviewProgress: (params: FinishCsvImportPreviewProgressParams) => Promise<void>;
  resolveUnknownErrorMessage: (error: unknown, fallback: string) => string;
  setPendingCsvImportTimeZone: Dispatch<SetStateAction<string>>;
  setPendingCsvImportTimeZoneMode: Dispatch<SetStateAction<'AUTO' | 'MANUAL'>>;
  setPendingCsvFolderImport: Dispatch<SetStateAction<PendingCsvFolderImport | null>>;
  setPendingCsvFieldMapping: Dispatch<SetStateAction<CsvFieldMapping | null>>;
  setPendingCsvPoolNamingStrategy: Dispatch<SetStateAction<CsvPoolNamingStrategy>>;
  setPendingCsvPlanOverrides: Dispatch<SetStateAction<Record<string, PendingCsvPlanOverride>>>;
  setError: (message: string) => void;
  setHint: (message: string) => void;
  tt: (key: AppTextKey) => string;
  setPendingCsvImportTimeZoneConfirmationKey: Dispatch<SetStateAction<string>>;
};

export {
  createCsvFolderStagingProgressRafBuffer,
  toCsvFolderStagingPreviewProgressPatch,
} from '@/app-shell/csvImportPreviewRuntime';

export const useAppCsvImportPreviewActions = ({
  language,
  appIsMountedRef,
  lastCsvImportFolderOpenRef,
  isPreparingCsvImportPreview,
  isClearingLocalDataSources,
  deletingSamplePoolId,
  localDataSourceSummaries,
  pendingCsvFolderImport,
  pendingCsvFieldMapping,
  pendingCsvImportTimeZone,
  pendingCsvImportTimeZoneMode,
  pendingCsvImportTimeZoneConfirmed,
  pendingCsvPlanOverrides,
  pendingCsvImportTargetSourceOptions,
  pendingCsvPlanConfigRows,
  beginCsvImportPreviewProgress,
  updateCsvImportPreviewProgress,
  markCsvImportPreviewReady,
  finishCsvImportPreviewProgress,
  resolveUnknownErrorMessage,
  setPendingCsvImportTimeZone,
  setPendingCsvImportTimeZoneMode,
  setPendingCsvFolderImport,
  setPendingCsvFieldMapping,
  setPendingCsvPoolNamingStrategy,
  setPendingCsvPlanOverrides,
  setError,
  setHint,
  tt,
  setPendingCsvImportTimeZoneConfirmationKey,
}: UseAppCsvImportPreviewActionsParams) => {
  const discardCsvImportPreviewToken = useCallback(async (previewTokenRaw: string) => {
    const previewToken = String(previewTokenRaw || '').trim();
    if (!previewToken) {
      return;
    }
    try {
      await api.discardLocalDataImportPreview(previewToken);
    } catch {
      // Best-effort cleanup only.
    }
  }, []);

  const resetPendingCsvImportState = useCallback(() => {
    setPendingCsvFolderImport(null);
    setPendingCsvFieldMapping(null);
    setPendingCsvPoolNamingStrategy('FLAT');
    setPendingCsvPlanOverrides({});
    setPendingCsvImportTimeZoneMode('AUTO');
    setPendingCsvImportTimeZone(resolveSystemTimeZone());
    setPendingCsvImportTimeZoneConfirmationKey('');
  }, [
    setPendingCsvFieldMapping,
    setPendingCsvFolderImport,
    setPendingCsvImportTimeZone,
    setPendingCsvImportTimeZoneConfirmationKey,
    setPendingCsvImportTimeZoneMode,
    setPendingCsvPlanOverrides,
    setPendingCsvPoolNamingStrategy
  ]);

  const csvFolderStagingProgressBuffer = useMemo(
    () =>
      createCsvFolderStagingProgressRafBuffer(
        updateCsvImportPreviewProgress,
        window.requestAnimationFrame.bind(window),
        window.cancelAnimationFrame.bind(window),
      ),
    [updateCsvImportPreviewProgress],
  );
  useEffect(
    () => () => {
      csvFolderStagingProgressBuffer.cancel();
    },
    [csvFolderStagingProgressBuffer],
  );
  const previewPollingAbortControllerRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      previewPollingAbortControllerRef.current?.abort(
        new DOMException('LOCAL_DATA_IMPORT_PREVIEW_POLL_DISPOSED', 'AbortError'),
      );
      previewPollingAbortControllerRef.current = null;
    },
    [],
  );

  const applyCsvFolderStagingProgress = useCallback(
    (progress: CsvFolderStagingProgress) => {
      csvFolderStagingProgressBuffer.push(progress);
    },
    [csvFolderStagingProgressBuffer],
  );

  const applyPreviewJobProgress = useCallback(
    (job: { stage: string; progressPercent: number | null; processedFiles: number; totalFiles: number; status: string }) => {
      const hasKnownTotal = Math.max(0, Number(job.totalFiles) || 0) > 0;
      updateCsvImportPreviewProgress({
        stage: job.stage === 'QUEUED' ? 'SCANNING_FILES' : job.stage as CsvImportPreviewProgressState['stage'],
        progressPercent: hasKnownTotal || job.status === 'SUCCESS' ? job.progressPercent : null,
        processedFiles: job.processedFiles,
        totalFiles: job.totalFiles,
        processedBytes: 0,
        totalBytes: 0,
      });
    },
    [updateCsvImportPreviewProgress],
  );

  usePendingCsvDraftValidation({
    appIsMountedRef,
    pendingCsvFieldMapping,
    pendingCsvFolderImport,
    pendingCsvImportTimeZone,
    pendingCsvImportTimeZoneMode,
    pendingCsvImportTimeZoneConfirmed,
    pendingCsvImportScopeStrategy:
      pendingCsvFolderImport?.importPlanning?.scopeStrategy ?? 'FLAT',
    pendingCsvPlanOverrides,
    pendingCsvPlanConfigRows,
    language,
    setPendingCsvFolderImport,
    validateLocalDataImportDraft: api.validateLocalDataImportDraft,
  });

  const markPendingCsvDraftValidationPending = useCallback(() => {
    setPendingCsvFolderImport((current) =>
      current
        ? {
            ...current,
            draftValidation: null,
          }
        : current,
    );
  }, [setPendingCsvFolderImport]);

  const waitForLocalDataImportPreviewJob = useCallback(
    async (
      initialJob: ApiLocalDataImportPreviewJob,
      signal?: AbortSignal,
    ): Promise<ApiLocalDataImportPreviewJob['result']> =>
      waitForLocalDataImportPreviewJobResult(
        initialJob,
        tt('appText.readFolder'),
        applyPreviewJobProgress,
        { signal },
      ),
    [applyPreviewJobProgress, tt],
  );

  const prepareCsvImportFromFolderPath = useCallback(
    async (
      folderPath: string,
      sourceFolderPath = '',
      sourceFolderName = '',
      sourceFolderBookmarkId = '',
      preferredTargetSourceId = '',
      importEntryMode: CsvImportEntryMode = 'GENERAL',
      externalSignal?: AbortSignal,
    ): Promise<CsvImportPreparationResult> => {
      const normalizedFolderPath = normalizeNativeImportDirectoryPath(folderPath);
      if (!normalizedFolderPath) {
        return { ready: false, reason: tt('appText.readFolder') };
      }
      throwIfCsvImportPreparationAborted(externalSignal);
      previewPollingAbortControllerRef.current?.abort(
        new DOMException('LOCAL_DATA_IMPORT_PREVIEW_POLL_REPLACED', 'AbortError'),
      );
      const previewAbortController = new AbortController();
      const abortFromExternalSignal = () => {
        previewAbortController.abort(
          externalSignal?.reason ??
            new DOMException('CSV_IMPORT_PREPARATION_ABORTED', 'AbortError'),
        );
      };
      externalSignal?.addEventListener('abort', abortFromExternalSignal, {
        once: true,
      });
      previewPollingAbortControllerRef.current = previewAbortController;
      const normalizedSourceFolderPath =
        normalizeNativeImportDirectoryPath(sourceFolderPath) || normalizedFolderPath;
      const normalizedSourceFolderName = String(sourceFolderName ?? '').trim();
      const normalizedSourceFolderBookmarkId = String(sourceFolderBookmarkId ?? '').trim();
      const normalizedImportEntryMode: CsvImportEntryMode =
        importEntryMode === 'FULL_REIMPORT'
          ? 'FULL_REIMPORT'
          : 'GENERAL';
      const normalizedPreferredTargetSourceId = String(
        preferredTargetSourceId || '',
      ).trim();
      let previewTokenToDiscard = '';
      setError('');
      try {
        const previewJob = await api.startLocalDataImportPreviewJobByPath(
          normalizedFolderPath,
          {
            sourceFolderName: normalizedSourceFolderName || undefined,
            sourceId: normalizedPreferredTargetSourceId || undefined,
            locale: language,
          },
          { signal: previewAbortController.signal },
        );
        const preview = await waitForLocalDataImportPreviewJob(
          previewJob,
          previewAbortController.signal,
        );
        if (previewAbortController.signal.aborted) {
          throw previewAbortController.signal.reason;
        }
        if (!preview) {
          throw new Error(tt('appText.readFolder'));
        }
        const previewPlanSummaries = Array.isArray(preview.planSummaries)
          ? preview.planSummaries
          : [];
        const confirmableImportPlans = Array.isArray(preview.confirmableImportPlans)
          ? preview.confirmableImportPlans
          : [];
        const effectiveValidFiles = Math.max(0, Number(preview.validFiles) || 0);
        if (!preview.previewToken) {
          throw new Error(tt('appText.importConfigurationExpiredRescanFolder'));
        }
        previewTokenToDiscard = preview.previewToken;
        if (!confirmableImportPlans.length || effectiveValidFiles <= 0) {
          throw new Error(tt('appText.importableFileFoundFolder'));
        }
        const previewHeaders = Array.isArray(preview.headers) ? preview.headers : [];
        if (!previewHeaders.length) {
          throw new Error(tt('appText.readImportFileHeader'));
        }
        const preferredTargetSource = normalizedPreferredTargetSourceId
          ? pendingCsvImportTargetSourceOptions.find(
              (option) => option.sourceId === normalizedPreferredTargetSourceId,
            ) ?? null
          : null;
        const fullReimportTargetSourceSummary =
          normalizedImportEntryMode === 'FULL_REIMPORT' &&
          normalizedPreferredTargetSourceId
            ? localDataSourceSummaries.find(
                (source) =>
                  String(source.id || '').trim() ===
                  normalizedPreferredTargetSourceId,
              ) ?? null
            : null;
        if (
          normalizedImportEntryMode === 'FULL_REIMPORT' &&
          (!preferredTargetSource || !fullReimportTargetSourceSummary)
        ) {
          throw new Error(tt('appText.targetDataSourceUnavailableSoFullReimportContinue'));
        }
        const matchedFullReimportPlan =
          normalizedImportEntryMode === 'FULL_REIMPORT' && preferredTargetSource
            ? resolveFullReimportPreviewPlan(
                confirmableImportPlans,
                preferredTargetSource,
              )
            : null;
        if (
          normalizedImportEntryMode === 'FULL_REIMPORT' &&
          !matchedFullReimportPlan
        ) {
          throw new Error(tt('appText.selectedFolderDoesMatchTargetDataSourceTimeframe'));
        }
        const effectivePreviewPlanSummaries =
          normalizedImportEntryMode === 'FULL_REIMPORT' && matchedFullReimportPlan
            ? [matchedFullReimportPlan]
            : previewPlanSummaries;
        const effectiveConfirmableImportPlans =
          normalizedImportEntryMode === 'FULL_REIMPORT' && matchedFullReimportPlan
            ? [matchedFullReimportPlan]
            : confirmableImportPlans;
        const defaultMapping = normalizeCsvFieldMapping(preview.defaultMapping);
        if (!defaultMapping) {
          throw new Error(tt('appText.importFieldMappingFormatInvalid'));
        }
        const previewDetectedTimeframes = normalizeDetectedTimeframes(
          (preview as { detectedTimeframes?: unknown }).detectedTimeframes,
          preview.detectedTimeframe,
        );
        const previewFolderName =
          normalizedSourceFolderName ||
          preview.folderName ||
          resolveNativeImportDirectoryName(normalizedSourceFolderPath) ||
          resolveNativeImportDirectoryName(preview.folderPath) ||
          tt('appText.unnamedFolder');
        setPendingCsvFolderImport({
          importEntryMode: normalizedImportEntryMode,
          fullReimportTargetSourceId:
            normalizedImportEntryMode === 'FULL_REIMPORT'
              ? normalizedPreferredTargetSourceId
              : undefined,
          previewToken: preview.previewToken,
          planSummaries: effectivePreviewPlanSummaries,
          confirmableImportPlans: effectiveConfirmableImportPlans,
          sampledFileNames: Array.isArray(preview.sampledFileNames)
            ? preview.sampledFileNames
            : [],
          skippedNestedCount: Math.max(0, Number(preview.skippedNestedCount) || 0),
          folderName: previewFolderName,
          folderPath: normalizedSourceFolderPath || preview.folderPath || normalizedFolderPath,
          marketDataAcquisitionMetadata: preview.marketDataAcquisitionMetadata,
          sourceFolderPath: normalizedSourceFolderPath,
          sourceFolderBookmarkId: normalizedSourceFolderBookmarkId || undefined,
          suggestedTimeZone: preview.suggestedTimeZone,
          suggestedTimeZoneReason: preview.suggestedTimeZoneReason,
          timeZoneSuggestion: preview.timeZoneSuggestion,
          tradingCalendarSuggestion: preview.tradingCalendarSuggestion,
          tradingCalendar: normalizeApiTradingCalendarConfig(
            preview.draftValidation.planning.recommendedTradingCalendar ||
              preview.tradingCalendarSuggestion.calendar,
          ),
          tradingCalendarTouched: false,
          draftValidation: preview.draftValidation,
          importPlanning: preview.draftValidation.planning,
          headers: previewHeaders,
          mapping: defaultMapping,
          mappingProfile: preview.mappingProfile,
          fieldDiagnostics: preview.fieldDiagnostics,
          repairSummary: preview.repairSummary,
          schemaDiagnostics: preview.schemaDiagnostics,
          detectedTimeframe: preview.detectedTimeframe,
          detectedTimeframes: previewDetectedTimeframes,
          validSymbolCount: Math.max(0, Number(preview.validSymbolCount) || 0),
          totalFiles: Math.max(0, Number(preview.totalFiles) || 0),
          validFiles: Math.max(0, effectiveValidFiles),
          invalidFiles: Math.max(0, Number(preview.invalidFiles) || 0),
          invalidFileSamples: Array.isArray(preview.invalidFileSamples) ? preview.invalidFileSamples : []
        });
        setPendingCsvFieldMapping(defaultMapping);
        setPendingCsvImportTimeZoneConfirmationKey('');
        setPendingCsvPoolNamingStrategy(
          normalizedImportEntryMode === 'FULL_REIMPORT' && matchedFullReimportPlan
            ? matchedFullReimportPlan.strategy
            : 'FLAT',
        );
        setPendingCsvPlanOverrides(() => {
          if (!normalizedPreferredTargetSourceId) {
            return {};
          }
          if (!preferredTargetSource) {
            return {};
          }
          if (
            normalizedImportEntryMode === 'FULL_REIMPORT' &&
            matchedFullReimportPlan
          ) {
            return {
              [String(matchedFullReimportPlan.id || '').trim()]: {
                targetSourceId: normalizedPreferredTargetSourceId,
                sourceTouched: true,
                poolName: preferredTargetSource.sourceName,
                nameTouched: false,
              },
            };
          }
          const exactMatchedPlan =
            previewPlanSummaries.find(
              (plan) =>
                plan.baseTimeframe === preferredTargetSource.baseTimeframe &&
                preferredTargetSource.importScopeStrategy &&
                plan.strategy === preferredTargetSource.importScopeStrategy &&
                normalizeNativeImportRelativePath(
                  plan.topLevelSubfolder || '',
                ) ===
                  normalizeNativeImportRelativePath(
                    preferredTargetSource.importScopeTopLevelSubfolder,
                  )
            ) ?? null;
          const fallbackMatchedPlan =
            exactMatchedPlan ??
            previewPlanSummaries.find(
              (plan) =>
                plan.baseTimeframe === preferredTargetSource.baseTimeframe
            ) ??
            null;
          if (!fallbackMatchedPlan) {
            return {};
          }
          return {
            [String(fallbackMatchedPlan.id || '').trim()]: {
              targetSourceId: normalizedPreferredTargetSourceId,
              sourceTouched: true,
              poolName: preferredTargetSource.sourceName,
              nameTouched: false
            }
          };
        });
        setPendingCsvImportTimeZoneMode('AUTO');
        setPendingCsvImportTimeZone(
          normalizeTimeZone(
            preview.draftValidation.planning.recommendedTimeZone ||
              preview.suggestedTimeZone ||
              resolveSystemTimeZone()
          )
        );

        previewTokenToDiscard = '';
        return {
          ready: true,
          previewToken: String(preview.previewToken || '').trim(),
        };
      } catch (err) {
        if (previewTokenToDiscard) {
          void discardCsvImportPreviewToken(previewTokenToDiscard);
        }
        if (
          isCsvImportPreparationAbort(err, externalSignal) ||
          previewAbortController.signal.aborted ||
          previewPollingAbortControllerRef.current !== previewAbortController ||
          !appIsMountedRef.current
        ) {
          return { ready: false, canceled: true };
        }
        resetPendingCsvImportState();
        const message = reportAppError(err, {
          fallbackMessage: tt('appText.readFolder'),
          title: tt('appText.import'),
        });
        setError(message);
        return { ready: false, reason: message };
      } finally {
        externalSignal?.removeEventListener('abort', abortFromExternalSignal);
        if (previewPollingAbortControllerRef.current === previewAbortController) {
          previewPollingAbortControllerRef.current = null;
        }
      }
    },
    [
      discardCsvImportPreviewToken,
      appIsMountedRef,
      language,
      localDataSourceSummaries,
      pendingCsvImportTargetSourceOptions,
      resetPendingCsvImportState,
      resolveUnknownErrorMessage,
      setError,
      setPendingCsvFieldMapping,
      setPendingCsvFolderImport,
      setPendingCsvImportTimeZone,
      setPendingCsvImportTimeZoneConfirmationKey,
      setPendingCsvImportTimeZoneMode,
      setPendingCsvPlanOverrides,
      setPendingCsvPoolNamingStrategy,
      tt,
      waitForLocalDataImportPreviewJob,
    ]
  );

  const prepareCsvImportFromSelectedFolderPath = useCallback(
    async (
      selectedFolderPath: string,
      preferredTargetSourceId = '',
      importEntryMode: CsvImportEntryMode = 'GENERAL',
      sourceFolderBookmarkId = '',
      externalSignal?: AbortSignal,
    ): Promise<CsvImportPreparationResult> => {
      const normalizedFolderPath = normalizeNativeImportDirectoryPath(selectedFolderPath);
      if (!normalizedFolderPath) {
        return { ready: false, reason: tt('appText.readFolder') };
      }
      if (isPreparingCsvImportPreview || isClearingLocalDataSources || Boolean(deletingSamplePoolId)) {
        return {
          ready: false,
          reason: tt('appText.systemProcessingWait'),
        };
      }
      const previewStartAt = performance.now();
      beginCsvImportPreviewProgress();
      let previewReady = false;
      let preparationResult: CsvImportPreparationResult = {
        ready: false,
        reason: tt('appText.readFolder'),
      };
      let stagedFolderPathBeforePreview = '';
      let previewStarted = false;
      try {
        throwIfCsvImportPreparationAborted(externalSignal);
        await waitForNextAnimationFrame();
        throwIfCsvImportPreparationAborted(externalSignal);
        const previousPreviewToken = String(
          pendingCsvFolderImport?.previewToken || ''
        ).trim();
        resetPendingCsvImportState();
        if (previousPreviewToken) {
          void discardCsvImportPreviewToken(previousPreviewToken);
        }
        setHint(tt('appText.fullFilePrecheck'));
        const stagedFolder = await stageCsvFolderForImport(
          normalizedFolderPath,
          tt,
          String(sourceFolderBookmarkId || '').trim(),
          {
            mode: 'FULL_COPY',
            onProgress: applyCsvFolderStagingProgress,
            signal: externalSignal,
          }
        );
        stagedFolderPathBeforePreview = stagedFolder.stagedFolderPath;
        throwIfCsvImportPreparationAborted(externalSignal);
        if (!stagedFolder.stagedFolderPath) {
          throw new Error(tt('appText.readFolder'));
        }
        previewStarted = true;
        preparationResult = await prepareCsvImportFromFolderPath(
          stagedFolder.stagedFolderPath,
          normalizeNativeImportDirectoryPath(
            stagedFolder.sourceFolderPath || normalizedFolderPath,
          ) ||
            normalizedFolderPath,
          stagedFolder.sourceFolderName,
          stagedFolder.sourceFolderBookmarkId || '',
          preferredTargetSourceId,
          importEntryMode,
          externalSignal,
        );
        previewReady = preparationResult.ready;
        if (previewReady) {
          markCsvImportPreviewReady();
          setHint('');
        }
      } catch (err) {
        if (isCsvImportPreparationAbort(err, externalSignal)) {
          if (stagedFolderPathBeforePreview && !previewStarted) {
            await api
              .discardCsvFolderStagingNative(stagedFolderPathBeforePreview)
              .catch(() => undefined);
          }
          preparationResult = { ready: false, canceled: true };
          return preparationResult;
        }
        const message = reportAppError(err, {
          fallbackMessage: tt('appText.readFolder'),
          title: tt('appText.import'),
        });
        setError(message);
        preparationResult = { ready: false, reason: message };
      } finally {
        await finishCsvImportPreviewProgress({
          startAt: previewStartAt,
          previewReady,
          minDurationMs: LOCAL_POOL_IMPORT_PREVIEW_PROGRESS_MIN_MS
        });
      }
      return preparationResult;
    },
    [
      applyCsvFolderStagingProgress,
      beginCsvImportPreviewProgress,
      deletingSamplePoolId,
      discardCsvImportPreviewToken,
      finishCsvImportPreviewProgress,
      isClearingLocalDataSources,
      isPreparingCsvImportPreview,
      markCsvImportPreviewReady,
      pendingCsvFolderImport?.previewToken,
      prepareCsvImportFromFolderPath,
      resetPendingCsvImportState,
      resolveUnknownErrorMessage,
      setError,
      setHint,
      tt
    ]
  );

  const openCsvFolderPickerAndPrepareImport = useCallback((options?: {
    preferredTargetSourceId?: string;
    importEntryMode?: CsvImportEntryMode;
  }) => {
    if (isPreparingCsvImportPreview || isClearingLocalDataSources || Boolean(deletingSamplePoolId)) {
      return;
    }
    void (async () => {
      const selectedFolderPath = await chooseNativeDirectory({
        defaultPath: '',
        tt,
        resolveUnknownErrorMessage
      });
      if (!selectedFolderPath) {
        return;
      }
      await prepareCsvImportFromSelectedFolderPath(
        selectedFolderPath,
        String(options?.preferredTargetSourceId || '').trim(),
        options?.importEntryMode === 'FULL_REIMPORT'
          ? 'FULL_REIMPORT'
          : 'GENERAL',
      );
    })().catch((err) => {
      const message = resolveUnknownErrorMessage(err, tt('appText.readFolder'));
      setError(message);
    });
  }, [
    deletingSamplePoolId,
    isClearingLocalDataSources,
    isPreparingCsvImportPreview,
    prepareCsvImportFromSelectedFolderPath,
    resolveUnknownErrorMessage,
    setError,
    tt
  ]);

  const openCsvFolderPathAndPrepareImport = useCallback(
    (
      folderPath: string,
      options?: {
        preferredTargetSourceId?: string;
        importEntryMode?: CsvImportEntryMode;
        sourceFolderBookmarkId?: string;
        signal?: AbortSignal;
      },
    ): CsvImportActionStartResult => {
      const blockCode = resolveCsvImportEntryBlockCode({
        isPreparingCsvImportPreview,
        isClearingLocalDataSources,
        deletingSamplePoolId,
      });
      if (blockCode) {
        return { accepted: false, code: blockCode };
      }
      const normalizedFolderPath = normalizeDroppedImportFolderPath(folderPath);
      if (!normalizedFolderPath) {
        return { accepted: false, code: 'INVALID_FOLDER' };
      }
      const now = Date.now();
      const lastOpen = lastCsvImportFolderOpenRef.current;
      if (lastOpen.path === normalizedFolderPath && now - lastOpen.at < 900) {
        return { accepted: false, code: 'DUPLICATE_REQUEST' };
      }
      lastCsvImportFolderOpenRef.current = { path: normalizedFolderPath, at: now };
      const completion = prepareCsvImportFromSelectedFolderPath(
        normalizedFolderPath,
        String(options?.preferredTargetSourceId || '').trim(),
        options?.importEntryMode === 'FULL_REIMPORT'
          ? 'FULL_REIMPORT'
          : 'GENERAL',
        String(options?.sourceFolderBookmarkId || '').trim(),
        options?.signal,
      );
      return { accepted: true, completion };
    },
    [
      deletingSamplePoolId,
      isClearingLocalDataSources,
      isPreparingCsvImportPreview,
      lastCsvImportFolderOpenRef,
      prepareCsvImportFromSelectedFolderPath
    ]
  );

  const cancelPendingCsvImport = useCallback(() => {
    const previewToken = String(pendingCsvFolderImport?.previewToken || '').trim();
    resetPendingCsvImportState();
    if (previewToken) {
      void discardCsvImportPreviewToken(previewToken);
    }
  }, [
    discardCsvImportPreviewToken,
    pendingCsvFolderImport?.previewToken,
    resetPendingCsvImportState
  ]);

  return {
    prepareCsvImportFromFolderPath,
    prepareCsvImportFromSelectedFolderPath,
    openCsvFolderPickerAndPrepareImport,
    openCsvFolderPathAndPrepareImport,
    cancelPendingCsvImport,
    markPendingCsvDraftValidationPending,
    resetPendingCsvImportState,
    discardCsvImportPreviewToken,
  };
};
