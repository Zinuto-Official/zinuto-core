// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type { PendingCsvFolderImport } from "@/domains/data-import/dataSourceTypes";
import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
  api,
  type ApiLocalDataImportJob,
  type ApiLocalDataSourceSummary,
} from '@/api';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import {
  LOCAL_POOL_CLEAR_PROGRESS_MIN_MS,
  waitForDuration,
  waitForNextAnimationFrame,
  waitForPercentReach
} from '@/frontend-kernel/runtimeConstants';
import type {
  CustomSamplePool
} from "@/frontend-kernel/appTypes";
import {
  SAMPLE_POOL_ALL_ID,
  SAMPLE_POOL_UNKNOWN_ID,
  SAMPLE_POOL_UNKNOWN_NAME,
  getBuiltInSamplePools,
} from '@/domains/trainer/samplePools';
import { type BuiltInTradingMarketPresetId, type TradingCustomFeeTemplateMeta, type TradingMarketPresetValues } from '@/domains/trainer/tradingMarketPresets';
import type { WorkspacePage } from '@/frontend-kernel/workspacePageModel';
import type { CsvFieldMapping } from '@/domains/data-import/csvHelpers';
import type { CsvImportCardState } from '@/domains/data-import/useCsvImportController';
import type { PendingCsvPlanOverride } from '@/app-shell/appCsvImportContracts';
import type { DataConfigPoolOrderByBase } from '@/app-shell/appRootDataConfigUtils';
import type { DestructiveDataChangeFinalizer } from '@/domains/data-import/destructiveDataChangeTypes';
import {
  buildDefaultSystemPoolTradingBindingById,
  type SystemPoolTradingBindingById
} from '@/app-shell/appRootPoolTradingBinding';
import { useDataSourceSyncPreviewActions } from '@/app-shell/useDataSourceSyncPreviewActions';
import { useDataSourceSymbolActions } from '@/app-shell/useDataSourceSymbolActions';
import { getCurrentUiLanguage } from '@/frontend-kernel/i18n/localeState';
import { formatMessage } from '@zinuto/shared/i18n';

const resolveMaintenanceFollowUpFailureMessage = (): string =>
  formatMessage(getCurrentUiLanguage(), 'common.status.requestFailed');

type CsvImportCardControlAction = '' | 'PAUSE' | 'RESUME' | 'CANCEL';

type ImportCsvFn = (
  previewToken: string,
  previewPlanId: string,
  fileCount: number,
  poolName: string,
  sourceFolder: string,
  mapping: CsvFieldMapping,
  baseTimeframe: BaseTimeframe,
  importCardId: string,
  options?: {
    mode?: 'BATCH' | 'INCREMENTAL_UPDATE';
    sourceId?: string;
    sourceFolder?: string;
    sourceFolderBookmarkId?: string;
    sourceFolderUsageMode?: 'BOUND_SOURCE' | 'ONE_OFF';
    importScopeStrategy?: 'FLAT' | 'WITH_PARENT' | null;
    importScopeTopLevelSubfolder?: string;
  }
) => Promise<ApiLocalDataImportJob | null>;

type UseAppDataSourceMaintenanceActionsArgs = {
  language: string;
  appIsMountedRef: MutableRefObject<boolean>;
  clearingLocalDataSourcesProgressPercentRef: MutableRefObject<number>;
  isClearingLocalDataSources: boolean;
  deletingSamplePoolId: string;
  isPreparingCsvImportPreview: boolean;
  isCsvImporting: boolean;
  activeSamplePoolId: string;
  customSamplePools: CustomSamplePool[];
  localDataSourceSummaries: ApiLocalDataSourceSummary[];
  csvImportCardStates: CsvImportCardState[];
  importCsv: ImportCsvFn;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, replacements: Array<string | number>) => string;
  resolveUnknownErrorMessage: (error: unknown, fallbackMessage: string) => string;
  resolveSourceFolderBookmarkIdBySourceId: (sourceId: string) => string;
  resolveSamplePoolDisplayName: (poolId: string, fallbackName?: string) => string;
  finalizeDestructiveDataChange: DestructiveDataChangeFinalizer;
  loadSymbol: (
    symbol: string,
    options?: {
      forceNewSession?: boolean;
      cleanupStaleSessions?: boolean;
      poolId?: string;
      poolName?: string;
    }
  ) => Promise<unknown>;
  clearCsvImportCardState: (id?: string) => void;
  patchCsvImportCardState: (id: string, patch: Partial<CsvImportCardState>) => void;
  setError: (value: string) => void;
  setHint: (value: string) => void;
  setIsClearingLocalDataSources: (value: boolean) => void;
  setClearingLocalDataSourcesProgressPercent: (value: number) => void;
  setClearingLocalDataSourcesProgressTargetPercent: (value: number) => void;
  setReplayUnavailableMessage: (value: string) => void;
  setEditingSamplePoolId: (value: string) => void;
  setEditingSamplePoolName: (value: string) => void;
  setPendingCsvFolderImport: Dispatch<SetStateAction<PendingCsvFolderImport | null>>;
  setPendingCsvFieldMapping: Dispatch<SetStateAction<CsvFieldMapping | null>>;
  setPendingCsvPoolNamingStrategy: (value: 'FLAT' | 'WITH_PARENT') => void;
  setPendingCsvPlanOverrides: Dispatch<SetStateAction<Record<string, PendingCsvPlanOverride>>>;
  setCsvImportCardControlAction: (value: CsvImportCardControlAction) => void;
  setCsvImportCardStates: Dispatch<SetStateAction<CsvImportCardState[]>>;
  setLotSizeByPool: Dispatch<SetStateAction<Record<string, number>>>;
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
  setCurrentTrainingPoolMeta: (value: { id: string; name: string }) => void;
  setCurrentTrainingBaseTimeframe: (value: BaseTimeframe) => void;
  setActivePage: (value: WorkspacePage) => void;
};

export const useAppDataSourceMaintenanceActions = ({
  language,
  appIsMountedRef,
  clearingLocalDataSourcesProgressPercentRef,
  isClearingLocalDataSources,
  deletingSamplePoolId,
  isPreparingCsvImportPreview,
  isCsvImporting,
  activeSamplePoolId,
  customSamplePools,
  localDataSourceSummaries,
  csvImportCardStates,
  importCsv,
  tt,
  ttf,
  resolveUnknownErrorMessage,
  resolveSourceFolderBookmarkIdBySourceId,
  resolveSamplePoolDisplayName,
  finalizeDestructiveDataChange,
  loadSymbol,
  clearCsvImportCardState,
  patchCsvImportCardState,
  setError,
  setHint,
  setIsClearingLocalDataSources,
  setClearingLocalDataSourcesProgressPercent,
  setClearingLocalDataSourcesProgressTargetPercent,
  setReplayUnavailableMessage,
  setEditingSamplePoolId,
  setEditingSamplePoolName,
  setPendingCsvFolderImport,
  setPendingCsvFieldMapping,
  setPendingCsvPoolNamingStrategy,
  setPendingCsvPlanOverrides,
  setCsvImportCardControlAction,
  setCsvImportCardStates,
  setLotSizeByPool,
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
  setCurrentTrainingPoolMeta,
  setCurrentTrainingBaseTimeframe,
  setActivePage
}: UseAppDataSourceMaintenanceActionsArgs) => {
  const clearSelectedFolder = useCallback(async () => {
    if (isClearingLocalDataSources || deletingSamplePoolId || isPreparingCsvImportPreview || isCsvImporting) {
      return;
    }
    const progressStartAt = performance.now();
    setError('');
    setIsClearingLocalDataSources(true);
    setClearingLocalDataSourcesProgressPercent(0);
    setClearingLocalDataSourcesProgressTargetPercent(92);
    let clearSuccess = false;
    let followUpSyncFailed = false;
    try {
      await waitForNextAnimationFrame();
      await api.clearLocalDataSources();
      clearSuccess = true;
      setClearingLocalDataSourcesProgressTargetPercent(100);
      setReplayUnavailableMessage('');
      setEditingSamplePoolId('');
      setEditingSamplePoolName('');
      setPendingCsvFolderImport(null);
      setPendingCsvFieldMapping(null);
      setPendingCsvPoolNamingStrategy('FLAT');
      setPendingCsvPlanOverrides({});
      clearCsvImportCardState();
      setCsvImportCardControlAction('');
      setLotSizeByPool((current) => {
        const next: Record<string, number> = {};
        getBuiltInSamplePools().forEach((pool) => {
          const raw = current[pool.id];
          const normalized = Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : pool.lotSize;
          next[pool.id] = normalized;
        });
        return next;
      });
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
      setCurrentTrainingPoolMeta({ id: SAMPLE_POOL_UNKNOWN_ID, name: SAMPLE_POOL_UNKNOWN_NAME() });
      setCurrentTrainingBaseTimeframe('1d');
      const followUpResult = await finalizeDestructiveDataChange({
        clearRemovedSymbols: true,
        refreshDataSources: true,
        resetAutoplay: true,
      });
      followUpSyncFailed = followUpResult.failed;
      setHint(tt('appText.customSamplePoolCleared'));
      if (followUpSyncFailed) {
        setError(resolveMaintenanceFollowUpFailureMessage());
      }
    } catch (err) {
      if (appIsMountedRef.current) {
        const message = resolveUnknownErrorMessage(err, tt('appText.request'));
        setError(message);
      }
    } finally {
      const progressElapsed = performance.now() - progressStartAt;
      const minimumWaitMs = LOCAL_POOL_CLEAR_PROGRESS_MIN_MS - progressElapsed;
      if (clearSuccess) {
        await Promise.all([
          waitForDuration(minimumWaitMs),
          waitForPercentReach(() => clearingLocalDataSourcesProgressPercentRef.current, 100, 2000)
        ]);
      } else {
        await waitForDuration(minimumWaitMs);
      }
      if (appIsMountedRef.current) {
        if (!clearSuccess) {
          setClearingLocalDataSourcesProgressPercent(0);
          setClearingLocalDataSourcesProgressTargetPercent(0);
        }
        window.setTimeout(() => {
          if (!appIsMountedRef.current) {
            return;
          }
          setIsClearingLocalDataSources(false);
          setClearingLocalDataSourcesProgressPercent(0);
          setClearingLocalDataSourcesProgressTargetPercent(0);
        }, clearSuccess ? 180 : 80);
      }
    }
  }, [
    appIsMountedRef,
    clearCsvImportCardState,
    clearingLocalDataSourcesProgressPercentRef,
    deletingSamplePoolId,
    finalizeDestructiveDataChange,
    isClearingLocalDataSources,
    isCsvImporting,
    isPreparingCsvImportPreview,
    resolveUnknownErrorMessage,
    setActiveSamplePoolId,
    setClearingLocalDataSourcesProgressPercent,
    setClearingLocalDataSourcesProgressTargetPercent,
    setCsvImportCardControlAction,
    setCurrentTrainingBaseTimeframe,
    setCurrentTrainingPoolMeta,
    setCustomSamplePools,
    setDataConfigPoolOrderByBase,
    setEditingSamplePoolId,
    setEditingSamplePoolName,
    setError,
    setHiddenBuiltInTradingMarketPresetIds,
    setHint,
    setHistorySamplePoolFilter,
    setIncludeSystemDefaultPool,
    setIsClearingLocalDataSources,
    setLocalDataSourceSummaries,
    setLotSizeByPool,
    setPendingCsvFieldMapping,
    setPendingCsvFolderImport,
    setPendingCsvPlanOverrides,
    setPendingCsvPoolNamingStrategy,
    setReplayUnavailableMessage,
    setSystemPoolNameOverrides,
    setSystemPoolTradingBindingById,
    setTradingMarketPresetCustomTemplates,
    setTradingMarketPresetValuesByKey,
    tt
  ]);

  const syncPreviewActions = useDataSourceSyncPreviewActions({
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
  });

  const symbolActions = useDataSourceSymbolActions({
    appIsMountedRef,
    isClearingLocalDataSources,
    deletingSamplePoolId,
    isPreparingCsvImportPreview,
    activeSamplePoolId,
    customSamplePools,
    localDataSourceSummaries,
    csvImportCardStates,
    tt,
    resolveUnknownErrorMessage,
    resolveSamplePoolDisplayName,
    finalizeDestructiveDataChange,
    loadSymbol,
    setError,
    setHint,
    setActiveSamplePoolId,
    setActivePage,
  });

  return {
    clearSelectedFolder,
    pendingLocalDataSourceSyncPreview: syncPreviewActions.pendingLocalDataSourceSyncPreview,
    preparingLocalDataSourceSyncPreview: syncPreviewActions.preparingLocalDataSourceSyncPreview,
    dismissLocalDataSourceSyncPreview: syncPreviewActions.dismissLocalDataSourceSyncPreview,
    selectLocalDataSourceSyncPreviewPlan: syncPreviewActions.selectLocalDataSourceSyncPreviewPlan,
    confirmLocalDataSourceSyncPreview: syncPreviewActions.confirmLocalDataSourceSyncPreview,
    prepareLocalDataSourceSyncPreview: syncPreviewActions.prepareLocalDataSourceSyncPreview,
    runConfirmedLocalDataSourceSync: syncPreviewActions.runConfirmedLocalDataSourceSync,
    syncSamplePoolWithSourceFolder: syncPreviewActions.syncSamplePoolWithSourceFolder,
    removeSymbolsFromSamplePool: symbolActions.removeSymbolsFromSamplePool,
    fetchDetailSymbolBarsRange: symbolActions.fetchDetailSymbolBarsRange,
    fetchDetailSymbolDiagnostics: symbolActions.fetchDetailSymbolDiagnostics,
    startTrainingWithSymbol: symbolActions.startTrainingWithSymbol,
  };
};
