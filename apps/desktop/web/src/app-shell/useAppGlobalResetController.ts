// SPDX-License-Identifier: GPL-3.0-only

import type { ReplayNote } from "@/domains/notes/replayNoteModel";
import { useCallback, type MutableRefObject } from 'react';
import {
  type ApiLocalDataSourceSummary,
  type ApiResetAllStoredDataModuleProgress,
  api,
  createApiError,
  hasApiErrorCode,
  isRetryableBackendTransportError,
  toBackendErrorMessage,
} from '@/api';
import { type AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import { resetSharedStatsViewCache } from '@/workspaces/challenge-stats/trainingStatsViewCache';
import type {
  CustomSamplePool,
  TrainingProject
} from "@/frontend-kernel/appTypes";
import type { DataConfigPoolOrderByBase } from '@/app-shell/appRootDataConfigUtils';
import {
  buildDefaultSystemPoolTradingBindingById,
  type SystemPoolTradingBindingById
} from '@/app-shell/appRootPoolTradingBinding';
import {
  SAMPLE_POOL_ALL_ID,
  getBuiltInSamplePools
} from '@/domains/trainer/samplePools';
import {
  type BuiltInTradingMarketPresetId,
  type TradingCustomFeeTemplateMeta,
  type TradingMarketPresetValues
} from '@/domains/trainer/tradingMarketPresets';
import type { WorkspacePage } from '@/frontend-kernel/workspacePageModel';
import type { Bar } from '@/domains/training/types';
import type { DestructiveDataChangeFinalizer } from '@/domains/data-import/destructiveDataChangeTypes';
import { waitForPercentReach } from '@/frontend-kernel/runtimeConstants';
import { getCurrentUiLanguage } from '@/frontend-kernel/i18n/localeState';
import { formatMessage } from '@zinuto/shared/i18n';
import { RESET_JOB_POLL_DEADLINE_MS } from './globalResetJobDeadline';

const RESET_JOB_POLL_INTERVAL_MS = 280;
const RESET_JOB_FETCH_TIMEOUT_MS = 15_000;
const resolveResetModuleLabel = (
  moduleKey: ApiResetAllStoredDataModuleProgress['key'],
  tt: (key: AppTextKey) => string,
): string => {
  switch (moduleKey) {
    case 'trainingDataBytes':
      return tt('appText.trainingData');
    case 'replayNotesBytes':
      return tt('appText.notesData');
    case 'statsDataBytes':
      return tt('appText.statsData');
    case 'systemSettingsBytes':
      return tt('appText.system');
    case 'marketDataBytes':
      return tt('appText.lineData');
    default:
      return '';
  }
};

const resolveGlobalResetProgressLabel = (
  modules: ApiResetAllStoredDataModuleProgress[] | null | undefined,
  tt: (key: AppTextKey) => string,
): string => {
  const activeModule = (Array.isArray(modules) ? modules : []).find(
    (module) => module.status === 'RUNNING',
  );
  const activeModuleLabel = activeModule
    ? resolveResetModuleLabel(activeModule.key, tt)
    : '';
  return activeModuleLabel
    ? `${tt('appText.processing')} ${tt('appText.message0664')} ${activeModuleLabel}`
    : tt('appText.processing');
};

const resolveGlobalResetFollowUpFailureMessage = (): string =>
  formatMessage(getCurrentUiLanguage(), 'common.status.requestFailed');

type UseAppGlobalResetControllerParams = {
  isBusy: boolean;
  isPreparingAction: boolean;
  isPlacingOrderRef: MutableRefObject<boolean>;
  appIsMountedRef: MutableRefObject<boolean>;
  isGlobalResetInProgressRef: MutableRefObject<boolean>;
  globalResetProgressHideTimerRef: MutableRefObject<number | null>;
  globalResetProgressPercentRef: MutableRefObject<number>;
  symbolLoadAbortControllerRef: MutableRefObject<AbortController | null>;
  snapshotAbortControllerRef: MutableRefObject<AbortController | null>;
  ensureBarsForwardAbortControllerRef: MutableRefObject<AbortController | null>;
  barsRef: MutableRefObject<Bar[]>;
  barsOffsetRef: MutableRefObject<number>;
  barsTotalRef: MutableRefObject<number>;
  cancelPendingUiSettingsPersist: () => void;
  clearAllReplayNotePendingState: () => void;
  resetNotesPageController: () => void;
  clearLoadedHistoryProjectIds: () => void;
  refreshInstruments: () => Promise<unknown>;
  syncCustomSamplePoolsFromDataSources: () => Promise<unknown>;
  refreshTradingSettings: () => Promise<unknown>;
  refreshSystemStorageUsage: (options?: { silent?: boolean }) => Promise<void>;
  finalizeDestructiveDataChange?: DestructiveDataChangeFinalizer;
  onResetCompleted: () => void;
  formatStorageBytes: (value: number) => string;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, replacements: Array<string | number>) => string;
  setError: (value: string) => void;
  setIsGlobalResetProgressVisible: (value: boolean) => void;
  setGlobalResetProgressLabel: (value: string) => void;
  setGlobalResetProgressPercent: (value: number) => void;
  setGlobalResetProgressTargetPercent: (value: number) => void;
  setGlobalResetModules: (value: ApiResetAllStoredDataModuleProgress[]) => void;
  setIsBusy: (value: boolean) => void;
  setReplayNotes: (value: ReplayNote[]) => void;
  setReplayNotesNextCursor: (value: null) => void;
  setSelectedReplayNoteId: (value: string) => void;
  setActiveTrainingRecordNoteId: (value: string) => void;
  setTrainingProjects: (value: TrainingProject[]) => void;
  setHistoryProjectsNextCursor: (value: null) => void;
  setSelectedHistoryProjectId: (value: string) => void;
  setEditingProjectId: (value: string) => void;
  setEditingProjectName: (value: string) => void;
  setActionDialog: (value: null) => void;
  setOrderEndPrompt: (value: null) => void;
  setSessionId: (value: string) => void;
  setSnapshot: (value: null) => void;
  setSelectedSymbol: (value: string) => void;
  setBars: (value: Bar[]) => void;
  setBarsOffset: (value: number) => void;
  setBarsTotal: (value: number) => void;
  setIncludeSystemDefaultPool: (value: boolean) => void;
  setSystemPoolNameOverrides: (value: Record<string, string>) => void;
  setSystemPoolTradingBindingById: (value: SystemPoolTradingBindingById) => void;
  setDataConfigPoolOrderByBase: (value: DataConfigPoolOrderByBase) => void;
  setHiddenBuiltInTradingMarketPresetIds: (value: BuiltInTradingMarketPresetId[]) => void;
  setTradingMarketPresetCustomTemplates: (value: TradingCustomFeeTemplateMeta[]) => void;
  setTradingMarketPresetValuesByKey: (value: Record<string, TradingMarketPresetValues>) => void;
  setCustomSamplePools: (value: CustomSamplePool[]) => void;
  setLocalDataSourceSummaries: (value: ApiLocalDataSourceSummary[]) => void;
  setActiveSamplePoolId: (value: string) => void;
  setHistorySamplePoolFilter: (value: string) => void;
  setLotSizeByPool: (value: Record<string, number>) => void;
  setDataPoolRemovedSymbolsBySourceId: (value: Record<string, string[]>) => void;
  setReplayUnavailableMessage: (value: string) => void;
  setActivePage: (value: WorkspacePage) => void;
  setHint: (value: string) => void;
};

export const useAppGlobalResetController = ({
  isPreparingAction,
  isPlacingOrderRef,
  appIsMountedRef,
  isGlobalResetInProgressRef,
  globalResetProgressHideTimerRef,
  globalResetProgressPercentRef,
  symbolLoadAbortControllerRef,
  snapshotAbortControllerRef,
  ensureBarsForwardAbortControllerRef,
  barsRef,
  barsOffsetRef,
  barsTotalRef,
  cancelPendingUiSettingsPersist,
  clearAllReplayNotePendingState,
  resetNotesPageController,
  clearLoadedHistoryProjectIds,
  refreshInstruments,
  syncCustomSamplePoolsFromDataSources,
  refreshTradingSettings,
  refreshSystemStorageUsage,
  finalizeDestructiveDataChange,
  onResetCompleted,
  formatStorageBytes,
  tt,
  ttf,
  setError,
  setIsGlobalResetProgressVisible,
  setGlobalResetProgressLabel,
  setGlobalResetProgressPercent,
  setGlobalResetProgressTargetPercent,
  setGlobalResetModules,
  setIsBusy,
  setReplayNotes,
  setReplayNotesNextCursor,
  setSelectedReplayNoteId,
  setActiveTrainingRecordNoteId,
  setTrainingProjects,
  setHistoryProjectsNextCursor,
  setSelectedHistoryProjectId,
  setEditingProjectId,
  setEditingProjectName,
  setActionDialog,
  setOrderEndPrompt,
  setSessionId,
  setSnapshot,
  setSelectedSymbol,
  setBars,
  setBarsOffset,
  setBarsTotal,
  setIncludeSystemDefaultPool,
  setSystemPoolNameOverrides,
  setSystemPoolTradingBindingById,
  setDataConfigPoolOrderByBase,
  setHiddenBuiltInTradingMarketPresetIds,
  setTradingMarketPresetCustomTemplates,
  setTradingMarketPresetValuesByKey,
  setCustomSamplePools,
  setLocalDataSourceSummaries,
  setActiveSamplePoolId,
  setHistorySamplePoolFilter,
  setLotSizeByPool,
  setDataPoolRemovedSymbolsBySourceId,
  setReplayUnavailableMessage,
  setActivePage,
  setHint,
}: UseAppGlobalResetControllerParams) => {
  return useCallback(async () => {
    if (
      isGlobalResetInProgressRef.current ||
      isPreparingAction ||
      isPlacingOrderRef.current
    ) {
      return;
    }
    setError('');
    if (globalResetProgressHideTimerRef.current !== null) {
      window.clearTimeout(globalResetProgressHideTimerRef.current);
      globalResetProgressHideTimerRef.current = null;
    }
    setIsGlobalResetProgressVisible(true);
    setGlobalResetProgressLabel(tt('appText.processing'));
    setGlobalResetProgressPercent(0);
    setGlobalResetProgressTargetPercent(0);
    setGlobalResetModules([]);
    setIsBusy(true);
    isGlobalResetInProgressRef.current = true;
    cancelPendingUiSettingsPersist();
    try {
      const waitForPollTick = async (ms: number) =>
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, ms);
        });
      let resetJob = await api.startResetAllStoredDataJob();
      setGlobalResetProgressLabel(
        resolveGlobalResetProgressLabel(resetJob.modules, tt),
      );
      setGlobalResetModules(
        Array.isArray(resetJob.modules) ? resetJob.modules : [],
      );
      setGlobalResetProgressTargetPercent(
        Math.max(0, Math.min(100, Number(resetJob.progressPercent) || 0)),
      );

      const pollDeadlineAt = Date.now() + RESET_JOB_POLL_DEADLINE_MS;

      while (Date.now() < pollDeadlineAt) {
        if (resetJob.status === 'SUCCESS' || resetJob.status === 'FAILED') {
          break;
        }
        await waitForPollTick(RESET_JOB_POLL_INTERVAL_MS);
        if (!appIsMountedRef.current) {
          return;
        }
        try {
          resetJob = await api.getResetAllStoredDataJob(resetJob.id, {
            timeoutMs: RESET_JOB_FETCH_TIMEOUT_MS,
          });
        } catch (error) {
          if (isRetryableBackendTransportError(error)) {
            continue;
          }
          throw error;
        }
        setGlobalResetModules(
          Array.isArray(resetJob.modules) ? resetJob.modules : [],
        );
        setGlobalResetProgressLabel(
          resolveGlobalResetProgressLabel(resetJob.modules, tt),
        );
        setGlobalResetProgressTargetPercent(
          Math.max(0, Math.min(100, Number(resetJob.progressPercent) || 0)),
        );
      }

      if (resetJob.status === 'FAILED') {
        throw createApiError(
          toBackendErrorMessage(
            resetJob.errorCode,
            resetJob.errorArgs ?? undefined,
            400,
          ),
          resetJob.errorCode,
          resetJob.errorArgs ?? undefined,
          400,
        );
      }

      if (resetJob.status !== 'SUCCESS' || !resetJob.result) {
        const errorArgs = { deadlineMs: RESET_JOB_POLL_DEADLINE_MS };
        throw createApiError(
          toBackendErrorMessage(
            'RESET_ALL_DATA_JOB_DEADLINE_EXCEEDED',
            errorArgs,
            408,
          ),
          'RESET_ALL_DATA_JOB_DEADLINE_EXCEEDED',
          errorArgs,
          408,
        );
      }

      const resetResult = resetJob.result;
      onResetCompleted();
      clearAllReplayNotePendingState();
      resetSharedStatsViewCache();
      resetNotesPageController();
      setReplayNotes([]);
      setReplayNotesNextCursor(null);
      setSelectedReplayNoteId('');
      setActiveTrainingRecordNoteId('');
      clearLoadedHistoryProjectIds();
      setTrainingProjects([]);
      setHistoryProjectsNextCursor(null);
      setSelectedHistoryProjectId('');
      setEditingProjectId('');
      setEditingProjectName('');
      setActionDialog(null);
      setOrderEndPrompt(null);
      symbolLoadAbortControllerRef.current?.abort();
      symbolLoadAbortControllerRef.current = null;
      snapshotAbortControllerRef.current?.abort();
      snapshotAbortControllerRef.current = null;
      ensureBarsForwardAbortControllerRef.current?.abort();
      ensureBarsForwardAbortControllerRef.current = null;
      setSessionId('');
      setSnapshot(null);
      setSelectedSymbol('');
      setBars([]);
      setBarsOffset(0);
      setBarsTotal(0);
      barsRef.current = [];
      barsOffsetRef.current = 0;
      barsTotalRef.current = 0;
      setIncludeSystemDefaultPool(true);
      setSystemPoolNameOverrides({});
      setSystemPoolTradingBindingById(buildDefaultSystemPoolTradingBindingById());
      setDataConfigPoolOrderByBase({});
      setHiddenBuiltInTradingMarketPresetIds([]);
      setTradingMarketPresetCustomTemplates([]);
      setTradingMarketPresetValuesByKey({});
      setCustomSamplePools([]);
      setLocalDataSourceSummaries([]);
      setActiveSamplePoolId(SAMPLE_POOL_ALL_ID);
      setHistorySamplePoolFilter(SAMPLE_POOL_ALL_ID);
      const nextLotSizeByPool: Record<string, number> = {};
      getBuiltInSamplePools().forEach((pool) => {
        nextLotSizeByPool[pool.id] = pool.lotSize;
      });
      setLotSizeByPool(nextLotSizeByPool);
      setDataPoolRemovedSymbolsBySourceId({});
      setReplayUnavailableMessage('');
      setActivePage('SETTINGS');
      const reclaimedBytes = Math.max(
        0,
        Number(resetResult.storageReclaimedBytes ?? 0) + Number(resetResult.marketReclaimedBytes ?? 0)
      );
      const currentBytes = Math.max(
        0,
        Number(resetResult.storageFootprint?.totalBytes ?? 0) + Number(resetResult.marketFootprint?.totalBytes ?? 0)
      );
      const resetMessage = ttf('appText.oneClickResetCompletedValue0StorageSpaceReclaimedValue1', [formatStorageBytes(reclaimedBytes), formatStorageBytes(currentBytes)]);
      const followUpResult = finalizeDestructiveDataChange
        ? await finalizeDestructiveDataChange({
            clearRemovedSymbols: true,
            refreshDataSources: true,
            resetAutoplay: true,
          })
        : {
            failed: (
              await Promise.allSettled([
                refreshInstruments(),
                syncCustomSamplePoolsFromDataSources(),
                refreshTradingSettings(),
                refreshSystemStorageUsage(),
              ])
            ).some((result) => result.status === 'rejected'),
          };
      setGlobalResetModules(Array.isArray(resetJob.modules) ? resetJob.modules : []);
      setGlobalResetProgressLabel(tt('appText.processing'));
      setGlobalResetProgressTargetPercent(100);
      await waitForPercentReach(() => globalResetProgressPercentRef.current, 100, 1000);
      globalResetProgressHideTimerRef.current = window.setTimeout(() => {
        setIsGlobalResetProgressVisible(false);
        setGlobalResetProgressLabel('');
        setGlobalResetProgressPercent(0);
        setGlobalResetProgressTargetPercent(0);
        setGlobalResetModules([]);
        globalResetProgressHideTimerRef.current = null;
      }, 900);
      isGlobalResetInProgressRef.current = false;
      setIsBusy(false);
      setHint(resetMessage);
      if (followUpResult.failed) {
        setError(resolveGlobalResetFollowUpFailureMessage());
      }
    } catch (err) {
      const partialResetFailed = hasApiErrorCode(err, 'RESET_ALL_DATA_PARTIAL_FAILED');
      if (partialResetFailed && appIsMountedRef.current) {
        clearAllReplayNotePendingState();
        resetSharedStatsViewCache();
        resetNotesPageController();
        clearLoadedHistoryProjectIds();
        setReplayNotes([]);
        setReplayNotesNextCursor(null);
        setSelectedReplayNoteId('');
        setActiveTrainingRecordNoteId('');
        setTrainingProjects([]);
        setHistoryProjectsNextCursor(null);
        setSelectedHistoryProjectId('');
        setEditingProjectId('');
        setEditingProjectName('');
        setActionDialog(null);
        setOrderEndPrompt(null);
        await finalizeDestructiveDataChange?.({
          clearRemovedSymbols: true,
          refreshDataSources: true,
          refreshHistory: true,
          resetAutoplay: true,
        });
      }
      isGlobalResetInProgressRef.current = false;
      setError(
        partialResetFailed
          ? tt('appText.dataResetButPageDidnRefreshAutomaticallyRefresh')
          : err instanceof Error && err.message.trim()
          ? err.message.trim()
          : tt('appText.oneClickReset'),
      );
      setIsGlobalResetProgressVisible(false);
      setGlobalResetProgressLabel('');
      setGlobalResetProgressPercent(0);
      setGlobalResetProgressTargetPercent(0);
      setGlobalResetModules([]);
      setIsBusy(false);
    }
  }, [
    appIsMountedRef,
    barsOffsetRef,
    barsRef,
    barsTotalRef,
    cancelPendingUiSettingsPersist,
    clearAllReplayNotePendingState,
    clearLoadedHistoryProjectIds,
    ensureBarsForwardAbortControllerRef,
    finalizeDestructiveDataChange,
    formatStorageBytes,
    globalResetProgressHideTimerRef,
    globalResetProgressPercentRef,
    isGlobalResetInProgressRef,
    isPlacingOrderRef,
    isPreparingAction,
    onResetCompleted,
    refreshInstruments,
    refreshSystemStorageUsage,
    refreshTradingSettings,
    resetNotesPageController,
    setActionDialog,
    setActivePage,
    setActiveSamplePoolId,
    setActiveTrainingRecordNoteId,
    setBars,
    setBarsOffset,
    setBarsTotal,
    setCustomSamplePools,
    setDataPoolRemovedSymbolsBySourceId,
    setDataConfigPoolOrderByBase,
    setEditingProjectId,
    setEditingProjectName,
    setError,
    setGlobalResetModules,
    setGlobalResetProgressLabel,
    setGlobalResetProgressPercent,
    setGlobalResetProgressTargetPercent,
    setHiddenBuiltInTradingMarketPresetIds,
    setHint,
    setHistoryProjectsNextCursor,
    setHistorySamplePoolFilter,
    setIncludeSystemDefaultPool,
    setIsBusy,
    setIsGlobalResetProgressVisible,
    setLocalDataSourceSummaries,
    setLotSizeByPool,
    setOrderEndPrompt,
    setReplayNotes,
    setReplayNotesNextCursor,
    setReplayUnavailableMessage,
    setSelectedHistoryProjectId,
    setSelectedReplayNoteId,
    setSelectedSymbol,
    setSessionId,
    setSnapshot,
    setSystemPoolNameOverrides,
    setSystemPoolTradingBindingById,
    setTradingMarketPresetCustomTemplates,
    setTradingMarketPresetValuesByKey,
    setTrainingProjects,
    snapshotAbortControllerRef,
    symbolLoadAbortControllerRef,
    syncCustomSamplePoolsFromDataSources,
    tt,
    ttf
  ]);
};
