// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type { PendingCsvFolderImport } from "@/domains/data-import/dataSourceTypes";
import { useCallback, useRef, type MutableRefObject } from 'react';
import {
  api,
} from '@/api';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import {
  resolveDraftValidationErrorMessage,
} from '@/app-shell/usePendingCsvDraftValidation';
import { waitForNextAnimationFrame } from '@/frontend-kernel/runtimeConstants';
import {
  type CsvImportPlanConfigRow,
  type ConfirmPendingCsvImportOptions,
} from '@/app-shell/AppCsvMappingModal';
import {
  type CsvImportActionStartResult,
  type CsvImportEntryMode,
} from '@/app-shell/appCsvImportContracts';
import {
  type CsvFieldMapping,
} from '@/domains/data-import/csvHelpers';
import {
  normalizeTimeZone,
} from '@zinuto/shared/timezone';
import type {
  CsvImportCardState,
} from '@/domains/data-import/useCsvImportController';
import { normalizeNativeImportDirectoryPath } from '@/domains/data-import/nativeImportHelpers';

type CsvImportCardControlAction = '' | 'PAUSE' | 'RESUME' | 'CANCEL';

type ImportCsvRunner = (
  previewToken: string,
  previewPlanId: string,
  sourceFileCount: number,
  folderName: string,
  folderPath: string,
  csvFieldMapping: CsvFieldMapping | undefined,
  baseTimeframe: BaseTimeframe,
  importCardId?: string,
  options?: Record<string, unknown>
) => Promise<unknown>;

type UseAppCsvImportConfirmActionsParams = {
  appIsMountedRef: MutableRefObject<boolean>;
  isPreparingCsvImportPreview: boolean;
  pendingCsvFolderImport: PendingCsvFolderImport | null;
  pendingCsvFieldMapping: CsvFieldMapping | null;
  pendingCsvImportTimeZone: string;
  pendingCsvImportTimeZoneMode: string;
  pendingCsvPlanConfigRows: CsvImportPlanConfigRow[];
  csvImportCardStates: CsvImportCardState[];
  csvImportCardControlAction: CsvImportCardControlAction;
  importCsv: ImportCsvRunner;
  resolveImportBatchWorkerCount: (groupCount: number) => number;
  resolveUnknownErrorMessage: (error: unknown, fallback: string) => string;
  sanitizeSamplePoolName: (name: string, fallbackName: string) => string;
  patchCsvImportCardState: (id: string, patch: Partial<CsvImportCardState>) => void;
  setCsvImportCardStates: React.Dispatch<React.SetStateAction<CsvImportCardState[]>>;
  setCsvImportCardControlAction: React.Dispatch<React.SetStateAction<CsvImportCardControlAction>>;
  setError: (message: string) => void;
  setHint: (message: string) => void;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values: Array<string | number>) => string;
  resetPendingCsvImportState: () => void;
  discardCsvImportPreviewToken: (token: string) => Promise<void>;
};

export const useAppCsvImportConfirmActions = ({
  appIsMountedRef,
  isPreparingCsvImportPreview,
  pendingCsvFolderImport,
  pendingCsvFieldMapping,
  pendingCsvImportTimeZone,
  pendingCsvImportTimeZoneMode,
  pendingCsvPlanConfigRows,
  csvImportCardStates,
  csvImportCardControlAction,
  importCsv,
  resolveImportBatchWorkerCount,
  resolveUnknownErrorMessage,
  sanitizeSamplePoolName,
  patchCsvImportCardState,
  setCsvImportCardStates,
  setCsvImportCardControlAction,
  setError,
  setHint,
  tt,
  ttf,
  resetPendingCsvImportState,
  discardCsvImportPreviewToken,
}: UseAppCsvImportConfirmActionsParams) => {
  const confirmedPreviewTokenRef = useRef('');
  const confirmPendingCsvImport = useCallback((
    options?: ConfirmPendingCsvImportOptions,
  ): CsvImportActionStartResult => {
    const reject = (
      code: Extract<CsvImportActionStartResult, { accepted: false }>['code'],
      reason: string,
    ): CsvImportActionStartResult => {
      setError(reason);
      return { accepted: false, code, reason };
    };
    if (isPreparingCsvImportPreview) {
      return reject('IMPORT_BLOCKED', tt('appText.systemProcessingWait'));
    }
    if (!pendingCsvFolderImport || !pendingCsvFieldMapping) {
      return reject(
        'CONFIGURATION_EXPIRED',
        tt('appText.importConfigurationExpiredRescanFolder'),
      );
    }
    const poolNameByPreviewPlanId = options?.poolNameByPreviewPlanId ?? {};
    const draftValidation = pendingCsvFolderImport.draftValidation;
    if (!draftValidation) {
      return reject('VALIDATION_FAILED', tt('appText.importPreviewFailed'));
    }
    if (!draftValidation.confirm.enabled) {
      return reject(
        'VALIDATION_FAILED',
        resolveDraftValidationErrorMessage(draftValidation, tt, ttf),
      );
    }
    const nextMapping: CsvFieldMapping | undefined = pendingCsvFieldMapping ? { ...pendingCsvFieldMapping } : undefined;
    const nextImport = pendingCsvFolderImport;
    const pendingCsvImportEntryMode: CsvImportEntryMode =
      nextImport.importEntryMode === 'FULL_REIMPORT'
        ? 'FULL_REIMPORT'
        : 'GENERAL';
    const nextImportPreviewToken = String(nextImport.previewToken || '').trim();
    if (!nextImportPreviewToken) {
      return reject(
        'CONFIGURATION_EXPIRED',
        tt('appText.importConfigurationExpiredRescanFolder'),
      );
    }
    const nextPoolPlans = pendingCsvPlanConfigRows
      .map((planRow) => {
        const hasPoolNameOverride = Object.prototype.hasOwnProperty.call(
          poolNameByPreviewPlanId,
          String(planRow.previewPlanId || '').trim(),
        );
        const poolName = hasPoolNameOverride
          ? String(poolNameByPreviewPlanId[String(planRow.previewPlanId || '').trim()] ?? '')
          : String(planRow.poolName || '');
        return {
          ...planRow,
          poolName: sanitizeSamplePoolName(poolName, planRow.autoGeneratedPoolName),
          baseTimeframe: planRow.baseTimeframe,
          timeZone: normalizeTimeZone(
            planRow.effectiveTimeZone || pendingCsvImportTimeZone,
          ),
          timeZoneOrigin: planRow.effectiveTimeZoneOrigin,
          tradingCalendar: planRow.tradingCalendar
        };
      })
      .filter(
        (
          planRow
        ): planRow is CsvImportPlanConfigRow & {
          sourceId: string;
          poolName: string;
          timeZone: string;
          timeZoneOrigin: 'PRESET_DEFAULT' | 'INFERRED_DEFAULT' | 'USER_SELECTED';
          tradingCalendar: unknown;
        } => Boolean(planRow && planRow.fileCount > 0 && planRow.symbolCount > 0)
      );
    if (!nextPoolPlans.length) {
      const message = tt('appText.validSymbolFilenameFound');
      return reject('VALIDATION_FAILED', message);
    }
    const selectedSourceFolderPath = normalizeNativeImportDirectoryPath(
      nextImport.sourceFolderPath || nextImport.folderPath || '',
    );
    if (!selectedSourceFolderPath) {
      return reject('INVALID_FOLDER', tt('appText.readFolder'));
    }
    if (confirmedPreviewTokenRef.current === nextImportPreviewToken) {
      return { accepted: true };
    }
    confirmedPreviewTokenRef.current = nextImportPreviewToken;
    const nextPoolSourceFolder =
      normalizeNativeImportDirectoryPath(nextImport.sourceFolderPath || '') ||
      nextImport.folderName ||
      '';
    const importBatchSeed = Date.now();
    const nextImportCards = nextPoolPlans.map((poolPlan, index) => ({
      id: `csv-import-${importBatchSeed}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      jobId: '',
      sourceId: poolPlan.sourceId,
      poolName: poolPlan.poolName,
      sourceFolder: nextPoolSourceFolder,
      baseTimeframe: poolPlan.baseTimeframe,
      phase: 'UPLOADING' as const,
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
      totalFiles: Math.max(1, poolPlan.fileCount),
      importedRows: 0,
      skippedRows: 0,
      totalRows: 0,
      isPaused: false,
      cancelRequested: false,
      errorMessage: ''
    }));
    const perfSessionId = `zinuto-import-confirm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const perfMarkNames = new Set<string>();
    const perfMeasureNames = new Set<string>();
    const buildPerfEntryName = (label: string) => `${perfSessionId}:${label}`;
    const markPerf = (label: string) => {
      if (typeof performance?.mark !== 'function') {
        return;
      }
      const markName = buildPerfEntryName(label);
      try {
        performance.mark(markName);
        perfMarkNames.add(markName);
      } catch {
        // ignore mark failures
      }
    };
    const measurePerf = (label: string, startLabel: string, endLabel: string) => {
      if (typeof performance?.measure !== 'function') {
        return;
      }
      const measureName = buildPerfEntryName(label);
      try {
        performance.measure(
          measureName,
          buildPerfEntryName(startLabel),
          buildPerfEntryName(endLabel),
        );
        perfMeasureNames.add(measureName);
      } catch {
        // ignore measure failures
      }
    };
    const cleanupPerf = () => {
      if (typeof performance === 'undefined') {
        return;
      }
      for (const measureName of perfMeasureNames) {
        performance.clearMeasures(measureName);
      }
      for (const markName of perfMarkNames) {
        performance.clearMarks(markName);
      }
      perfMeasureNames.clear();
      perfMarkNames.clear();
    };
    markPerf('confirm-start');
    markPerf('pre-card-append');
    setCsvImportCardStates((current) => [...current, ...nextImportCards]);
    markPerf('post-card-append');
    measurePerf('card-append', 'pre-card-append', 'post-card-append');
    resetPendingCsvImportState();
    setCsvImportCardControlAction('');
    setHint(tt('appText.systemProcessingWait'));
    void (async () => {
      const failedGroups: string[] = [];
      let dispatchedGroups = 0;
      let firstJobDispatched = false;
      try {
        await waitForNextAnimationFrame();
        const queuedGroups = nextPoolPlans.map((poolPlan, groupIndex) => ({
          poolPlan,
          importCardId: nextImportCards[groupIndex]?.id ?? ''
        })).map((queuedGroup) => {
          const matchedPlan =
            nextImport.confirmableImportPlans.find(
              (plan) =>
                String(plan.previewPlanId || '').trim() ===
                String(queuedGroup.poolPlan.previewPlanId || '').trim()
            ) ?? null;
          if (!matchedPlan) {
            throw new Error(
              pendingCsvImportEntryMode === 'FULL_REIMPORT'
                ? tt('appText.selectedFolderDoesMatchTargetDataSourceTimeframe')
                : tt('appText.readFolder')
            );
          }
          return {
            poolPlan: {
              ...queuedGroup.poolPlan,
              fileCount: matchedPlan.fileCount,
              symbolCount: matchedPlan.symbolCount,
            },
            importCardId: queuedGroup.importCardId,
            previewToken: nextImportPreviewToken,
            sourceFolderPath:
              normalizeNativeImportDirectoryPath(
                selectedSourceFolderPath ||
                  nextImport.sourceFolderPath ||
                  nextImport.folderPath ||
                  '',
              ) || selectedSourceFolderPath,
            sourceFolderBookmarkId:
              String(
                nextImport.sourceFolderBookmarkId || ''
              ).trim() || undefined,
          };
        });
        markPerf('worker-dispatch-start');
        const maxParallelWorkers = resolveImportBatchWorkerCount(queuedGroups.length);
        let importCursor = 0;

        const runImportWorker = async (): Promise<void> => {
          while (true) {
            const nextIndex = importCursor;
            importCursor += 1;
            const nextQueuedGroup = queuedGroups[nextIndex];
            if (!nextQueuedGroup) {
              return;
            }
            const { poolPlan, importCardId } = nextQueuedGroup;
            if (!importCardId) {
              failedGroups.push(poolPlan.poolName);
              continue;
            }
            try {
              const isFirstJob = !firstJobDispatched;
              if (isFirstJob) {
                firstJobDispatched = true;
                markPerf('first-job-start');
              }
              const importSucceeded = await importCsv(
                nextQueuedGroup.previewToken,
                poolPlan.previewPlanId,
                poolPlan.fileCount,
                poolPlan.poolName,
                nextQueuedGroup.sourceFolderPath,
                nextMapping,
                poolPlan.baseTimeframe,
                importCardId,
                {
                  mode:
                    pendingCsvImportEntryMode === 'FULL_REIMPORT'
                      ? 'FULL_REIMPORT'
                      : 'BATCH',
                  sourceId: poolPlan.sourceId,
                  sourceFolder: nextQueuedGroup.sourceFolderPath,
                  sourceFolderBookmarkId: nextQueuedGroup.sourceFolderBookmarkId,
                  importScopeStrategy: poolPlan.strategy,
                  importScopeTopLevelSubfolder: poolPlan.topLevelSubfolder,
                  timeZone: poolPlan.timeZone,
                  timeZoneOrigin: poolPlan.timeZoneOrigin,
                  tradingCalendar: poolPlan.tradingCalendar,
                  allowExistingSourceTimeZoneChange:
                    pendingCsvImportEntryMode === 'FULL_REIMPORT' &&
                    Boolean(poolPlan.sourceId) &&
                    poolPlan.timeZone !==
                      normalizeTimeZone(poolPlan.targetSourceTimeZone),
                }
              );
              if (isFirstJob) {
                markPerf('first-job-queued');
                measurePerf('first-job-startup', 'first-job-start', 'first-job-queued');
              }
              if (importSucceeded) {
                dispatchedGroups += 1;
              } else {
                failedGroups.push(poolPlan.poolName);
              }
            } catch (err) {
              failedGroups.push(poolPlan.poolName);
              const message = resolveUnknownErrorMessage(err, tt('appText.import'));
              setError(message);
              patchCsvImportCardState(importCardId, {
                phase: 'FAILED',
                isPaused: false,
                errorMessage: message
              });
            }
          }
        };

        await Promise.all(Array.from({ length: maxParallelWorkers }, () => runImportWorker()));
        markPerf('worker-dispatch-finish');
        measurePerf('worker-runtime', 'worker-dispatch-start', 'worker-dispatch-finish');

        if (failedGroups.length > 0) {
          setHint(tt('appText.import'));
        } else if (dispatchedGroups > 0) {
          setHint(tt('appText.systemProcessingWait'));
        }
      } catch (err) {
        const message = resolveUnknownErrorMessage(err, tt('appText.import'));
        setError(message);
      } finally {
        void discardCsvImportPreviewToken(nextImportPreviewToken);
        if (failedGroups.length > 0 && failedGroups.length === nextPoolPlans.length) {
          setError(tt('appText.import'));
        }
        markPerf('confirm-finish');
        measurePerf('confirm-total', 'confirm-start', 'confirm-finish');
        cleanupPerf();
      }
    })();
    return { accepted: true };
  }, [
    appIsMountedRef,
    csvImportCardControlAction,
    importCsv,
    isPreparingCsvImportPreview,
    patchCsvImportCardState,
    pendingCsvFieldMapping,
    pendingCsvFolderImport,
    pendingCsvImportTimeZone,
    pendingCsvImportTimeZoneMode,
    pendingCsvPlanConfigRows,
    resetPendingCsvImportState,
    resolveImportBatchWorkerCount,
    resolveUnknownErrorMessage,
    sanitizeSamplePoolName,
    setCsvImportCardControlAction,
    setCsvImportCardStates,
    setError,
    setHint,
    discardCsvImportPreviewToken,
    tt,
    ttf
  ]);

  const controlCsvImportCardJob = useCallback(
    async (cardId: string, action: 'PAUSE' | 'RESUME' | 'CANCEL') => {
      if (csvImportCardControlAction) {
        return;
      }
      const normalizedCardId = String(cardId || '').trim();
      if (!normalizedCardId) {
        return;
      }
      const current = csvImportCardStates.find((card) => card.id === normalizedCardId) ?? null;
      const jobId = current?.jobId?.trim() ?? '';
      if (!jobId || !current?.id) {
        return;
      }
      setCsvImportCardControlAction(action);
      try {
        const detail = await api.controlLocalDataImportJob(jobId, action);
        if (!appIsMountedRef.current) {
          return;
        }
        patchCsvImportCardState(cardId, {
          phase: detail.phaseFacts.cardPhase,
          progressPercent: Math.max(0, Math.min(100, Number(detail.progressPercent) || 0)),
          importProgressPercent: Math.max(0, Math.min(100, Number(detail.phaseFacts.importProgressPercent) || 0)),
          compactProgressPercent: Math.max(0, Math.min(100, Number(detail.compactProgressPercent) || 0)),
          compactProgressDisplayPercent: Math.max(0, Math.min(100, Number(detail.phaseFacts.compactProgressDisplayPercent) || 0)),
          compactBeforeBytes: Math.max(0, Number(detail.compactBeforeBytes) || 0),
          compactAfterBytes: Math.max(0, Number(detail.compactAfterBytes) || 0),
          compactReclaimedBytes: Math.max(0, Number(detail.compactReclaimedBytes) || 0),
          compactAfterDisplayBytes: Math.max(0, Number(detail.phaseFacts.compactAfterDisplayBytes) || 0),
          compactReclaimedDisplayBytes: Math.max(0, Number(detail.phaseFacts.compactReclaimedDisplayBytes) || 0),
          shouldShowCompactProgress: detail.phaseFacts.shouldShowCompactProgress === true,
          doneFiles: Math.max(0, Number(detail.doneFiles) || 0),
          totalFiles: Math.max(0, Number(detail.totalFiles) || 0),
          importedRows: Math.max(0, Number(detail.importedRows) || 0),
          skippedRows: Math.max(0, Number(detail.skippedRows) || 0),
          totalRows: Math.max(0, Number(detail.totalRows) || 0),
          isPaused: Boolean(detail.isPaused),
          cancelRequested: Boolean(detail.cancelRequested)
        });
        if (action === 'CANCEL') {
          setHint(tt('appText.requestCanceled'));
        }
      } catch (err) {
        if (!appIsMountedRef.current) {
          return;
        }
        const message = resolveUnknownErrorMessage(err, tt('appText.import'));
        setError(message);
      } finally {
        if (appIsMountedRef.current) {
          setCsvImportCardControlAction('');
        }
      }
    },
    [
      appIsMountedRef,
      csvImportCardControlAction,
      csvImportCardStates,
      patchCsvImportCardState,
      resolveUnknownErrorMessage,
      setCsvImportCardControlAction,
      setError,
      setHint,
      tt
    ]
  );

  return {
    confirmPendingCsvImport,
    controlCsvImportCardJob,
  };
};
