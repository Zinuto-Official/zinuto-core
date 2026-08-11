// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import {
  api,
} from "@/api";
import { formatMoney } from "@/ui/formatting/format";
import { useAppSamplePoolManagement } from "@/app-shell/useAppSamplePoolManagement";
import { useDestructiveDataChangeFinalizer } from "@/app-shell/useDestructiveDataChangeFinalizer";
import {
  isTrainerHydrationPending,
} from "@/domains/trainer/trainerHydration";
import {
  endTrainerPerfSpan,
} from "@/domains/trainer/trainerPerfTrace";
import {
  type UiSettings
} from "@/frontend-kernel/appTypes";
import { clamp } from "@/frontend-kernel/math";
import { formatStorageBytes } from "@/frontend-kernel/uiOptions";
import {
  waitForDuration,
  waitForNextAnimationFrame,
  waitForPercentReach,
} from "@/frontend-kernel/runtimeConstants";
import { resolveUnknownErrorMessage } from "@/frontend-kernel/errors/appErrorUtils";
import {
  DEFAULT_TRAINER_PERIOD_OPTIONS_BY_BASE,
  DEFAULT_TRAINER_DISPLAY_PERIOD_BY_BASE,
} from "@/domains/chart/chartPeriods";
import { sanitizeSamplePoolName } from "@/app-shell/appSamplePools";
import {
  resolvePoolTradingBindingByPoolId,
} from "@/app-shell/appRootPoolTradingBinding";
import {
  SAMPLE_POOL_ALL_ID,
  SAMPLE_POOL_SYSTEM_ID,
  SAMPLE_POOL_UNKNOWN_ID,
  SAMPLE_POOL_UNKNOWN_NAME,
  findBuiltInSamplePoolById,
  getBuiltInSamplePools,
  isBuiltInSamplePoolId,
} from "@/domains/trainer/samplePools";
import {
  type TradingAssetClassId,
} from "@/domains/trainer/tradingMarketPresets";
import { useTrainerCustomPoolManager } from "@/domains/trainer/useTrainerCustomPoolManager";
import { useTrainerPeriodOptionsController } from "@/domains/trainer/useTrainerPeriodOptionsController";
import { useTrainerPoolSelectionController } from "@/domains/trainer/useTrainerPoolSelectionController";
import { useTrainerSamplePoolModel } from "@/domains/trainer/useTrainerSamplePoolModel";
import { useDataConfigWorkspaceViewModel } from "@/workspaces";
import type { useRuntimeStartupState } from "@/app-shell/runtime/runtimeStartupState";
import type { useRuntimeStartupHistoryState } from "@/app-shell/runtime/runtimeStartupHistoryState";
import type { useRuntimeStartupPersistence } from "@/app-shell/runtime/runtimeStartupPersistence";
import type { useRuntimeTrainerChartSession } from "@/app-shell/runtime/runtimeTrainerChartSession";
import type { useRuntimeTrainerMarketSettings } from "@/app-shell/runtime/runtimeTrainerMarketSettings";
type RuntimeHookScope = AppRootRuntimeProps & ReturnType<typeof useRuntimeStartupState> & ReturnType<typeof useRuntimeStartupHistoryState> & ReturnType<typeof useRuntimeStartupPersistence> & ReturnType<typeof useRuntimeTrainerChartSession> & ReturnType<typeof useRuntimeTrainerMarketSettings> & Record<string, unknown>;

export type AppRootRuntimeProps = {
  initialUiSettings: UiSettings;
  initialDataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
  canPersistUiSettings: boolean;
};





export const useRuntimeTrainerPoolChartPipeline = (scope: RuntimeHookScope) => {
  const { activePage, activeSamplePoolId, appIsMountedRef, autoSyncSymbolKeyRef, bars, barsOffsetRef, barsRef, barsTotalRef, barsTsMsRef, csvImportCardStates, currentTrainingBaseTimeframe, customSamplePools, dataConfigPoolOrderByBase, deletingSamplePoolId, deletingSamplePoolProgressPercent, deletingSamplePoolProgressTargetPercent, editingSamplePoolId, editingSamplePoolName, effectiveTrainingBaseTimeframe, ensureBarsBackwardAbortControllerRef, ensureBarsForwardAbortControllerRef, includeSystemDefaultPool, instruments, isBusy, isClearingLocalDataSources, isCsvImporting, isPreparingCsvImportPreview, language, loadSymbol, localDataSourceSummaries, manualPoolSwitchLoadingRef, manualPoolSwitchTokenRef, refreshInstruments, refreshLatestResumableTrainerSession, refreshSystemStorageUsage, refreshTradingSettings, replayUnavailableMessage, resolveSamplePoolDisplayName, selectedInstrumentId, selectedSymbol, sessionId, setActionDialog, setActiveSamplePoolId, setBars, setBarsOffset, setBarsTotal, setCsvImportCardStates, setCurrentTrainingBaseTimeframe, setCurrentTrainingPoolMeta, setCustomPoolNameOverrides, setCustomSamplePools, setDataConfigPoolOrderByBase, setDataPoolRemovedSymbolsBySourceId, setDeletingSamplePoolId, setDeletingSamplePoolProgressPercent, setDeletingSamplePoolProgressTargetPercent, setEditingSamplePoolId, setEditingSamplePoolName, setError, setHint, setIncludeSystemDefaultPool, setIsAutoplay, setLotSizeByPool, setOrderEndPrompt, setReplayUnavailableMessage, setSelectedInstrumentId, setSelectedSymbol, setSessionId, setSnapshot, setSystemPoolNameOverrides, setTrainerDisplayPeriod, setTrainerHydrationState, snapshot, snapshotAbortControllerRef, snapshotRef, snapshotRequestVersionRef, specialTrainingChartBaseTimeframe, symbolLoadAbortControllerRef, symbolLoadRequestVersionRef, syncActiveTrainingRuntime, syncCustomSamplePoolsFromDataSources, systemPoolNameOverrides, systemPoolTradingBindingById, systemStorageUsage, tradingAssetClass, tradingMarketPresetCustomTemplates, tradingMarketPresetKey, tradingSettingsText, trainerDisplayPeriod, trainerHydrationState, tt, ttf, ui } = scope;
const {
    instrumentMetaMap,
    allCustomPoolSymbols,
    selectedCustomSamplePools,
    visibleCustomPoolSymbolsMap,
    visibleCustomPoolInstrumentOptionsMap,
    selectedCustomPoolSymbolsMap,
    selectedCustomPoolInstrumentOptionsMap,
    availableBuiltInPoolSymbolsById,
    availableBuiltInPoolInstrumentOptionsById,
    visibleBuiltInPoolSymbolsById,
    visibleSystemDailyPoolSymbols,
    combinedEnabledPoolSymbols,
    combinedEnabledPoolInstrumentOptions,
    resolveSamplePoolBaseTimeframe,
    trainerSamplePoolOptions,
    randomSymbolPool,
    activeSamplePoolBaseTimeframe,
  } = useTrainerSamplePoolModel({
    instruments,
    customSamplePools,
    localDataSourceSummaries,
    includeSystemDefaultPool,
    activeSamplePoolId,
    samplePoolAllId: SAMPLE_POOL_ALL_ID,
    samplePoolSystemId: SAMPLE_POOL_SYSTEM_ID,
    dataConfigPoolOrderByBase,
    resolveSamplePoolDisplayName,
    findBuiltInSamplePoolById,
    getBuiltInSamplePools,
    isBuiltInSamplePoolId,
  });
  const instrumentBarCountBySymbol = useMemo<Record<string, number>>(() => {
    const bySymbol: Record<string, number> = {};
    instrumentMetaMap.forEach((meta, symbol) => {
      bySymbol[symbol] = Math.max(0, Number(meta.barCount) || 0);
    });
    return bySymbol;
  }, [instrumentMetaMap]);
  const instrumentQuestionBankRevisionById = useMemo(() => {
    const byId = new Map<string, string>();
    instruments.forEach((instrument) => {
      const instrumentId = String(instrument.id || "").trim();
      if (!instrumentId) {
        return;
      }
      const revisionToken =
        String(instrument.barsVersionToken || "").trim() ||
        `bars:${Math.max(0, Number(instrument.barCount) || 0)}`;
      byId.set(instrumentId, revisionToken);
    });
    return byId;
  }, [instruments]);
  const enabledSpecialTrainingSamplePools = useMemo(() => {
    const normalizePoolInstruments = (
      entries: Array<{
        instrumentId: string;
        symbol: string;
        barCount: number;
        timeStartTs?: string | null;
        timeEndTs?: string | null;
      }>,
    ): Array<{
      instrumentId: string;
      symbol: string;
      barCount: number;
      timeStartTs: string | null;
      timeEndTs: string | null;
    }> =>
      Array.from(
        new Map(
          entries
            .map((entry) => ({
              instrumentId: String(entry.instrumentId || "").trim(),
              symbol: String(entry.symbol || "").trim().toUpperCase(),
              barCount: Math.max(0, Number(entry.barCount) || 0),
              timeStartTs: String(entry.timeStartTs || "").trim() || null,
              timeEndTs: String(entry.timeEndTs || "").trim() || null,
            }))
            .filter(
              (entry) =>
                entry.instrumentId.length > 0 && entry.symbol.length > 0,
            )
            .map((entry) => [entry.instrumentId, entry] as const),
        ).values(),
      );
    const pools: Array<{
      id: string;
      name: string;
      assetClass: TradingAssetClassId;
      assetClassLabel: string;
      marketPresetId: string;
      baseTimeframe: BaseTimeframe;
      symbols: string[];
      instruments: Array<{
        instrumentId: string;
        symbol: string;
        barCount: number;
        timeStartTs: string | null;
        timeEndTs: string | null;
      }>;
      questionBankRevisionToken: string;
    }> = [];

    getBuiltInSamplePools().forEach((pool) => {
      const instruments = normalizePoolInstruments(
        (availableBuiltInPoolInstrumentOptionsById.get(pool.id) ?? []).map(
          (entry) => ({
            instrumentId: entry.instrumentId,
            symbol: entry.symbol,
            barCount: entry.barCount,
            timeStartTs: entry.timeStartTs,
            timeEndTs: entry.timeEndTs,
          }),
        ),
      );
      if (!instruments.length) {
        return;
      }
      const symbols = Array.from(
        new Set(instruments.map((entry) => entry.symbol)),
      ).sort((left, right) => left.localeCompare(right));
      const binding = resolvePoolTradingBindingByPoolId({
        poolId: pool.id,
        fallbackAssetClass: tradingAssetClass,
        fallbackMarketPresetId: tradingMarketPresetKey,
        customSamplePools,
        systemPoolTradingBindingById,
        tradingMarketPresetCustomTemplates,
      });
      pools.push({
        id: pool.id,
        name: resolveSamplePoolDisplayName(pool.id, pool.name),
        assetClass: binding.assetClass,
        assetClassLabel: tradingSettingsText.assetClassLabels[binding.assetClass],
        marketPresetId: binding.marketPresetId,
        baseTimeframe: pool.baseTimeframe,
        symbols,
        instruments,
        questionBankRevisionToken: [
          `pool:${pool.id}`,
          `tf:${pool.baseTimeframe}`,
          ...instruments
            .slice()
            .sort((left, right) =>
              left.instrumentId.localeCompare(right.instrumentId),
            )
            .map(
              (entry) =>
                `${entry.instrumentId}:${entry.symbol}:${
                  instrumentQuestionBankRevisionById.get(entry.instrumentId) ||
                  "missing"
                }`,
            ),
        ].join("|"),
      });
    });

    selectedCustomSamplePools.forEach((pool) => {
      const instruments = normalizePoolInstruments(
        (selectedCustomPoolInstrumentOptionsMap.get(pool.id) ?? []).map(
          (entry) => ({
            instrumentId: entry.instrumentId,
            symbol: entry.symbol,
            barCount: entry.barCount,
            timeStartTs: entry.timeStartTs,
            timeEndTs: entry.timeEndTs,
          }),
        ),
      );
      if (!instruments.length) {
        return;
      }
      const symbols = Array.from(
        new Set(instruments.map((entry) => entry.symbol)),
      ).sort((left, right) => left.localeCompare(right));
      const binding = resolvePoolTradingBindingByPoolId({
        poolId: pool.id,
        fallbackAssetClass: tradingAssetClass,
        fallbackMarketPresetId: tradingMarketPresetKey,
        customSamplePools,
        systemPoolTradingBindingById,
        tradingMarketPresetCustomTemplates,
      });
      pools.push({
        id: pool.id,
        name: resolveSamplePoolDisplayName(pool.id, pool.name),
        assetClass: binding.assetClass,
        assetClassLabel: tradingSettingsText.assetClassLabels[binding.assetClass],
        marketPresetId: binding.marketPresetId,
        baseTimeframe: pool.baseTimeframe,
        symbols,
        instruments,
        questionBankRevisionToken: [
          `pool:${pool.id}`,
          `tf:${pool.baseTimeframe}`,
          ...instruments
            .slice()
            .sort((left, right) =>
              left.instrumentId.localeCompare(right.instrumentId),
            )
            .map(
              (entry) =>
                `${entry.instrumentId}:${entry.symbol}:${
                  instrumentQuestionBankRevisionById.get(entry.instrumentId) ||
                  "missing"
                }`,
            ),
        ].join("|"),
      });
    });

    return pools;
  }, [
    availableBuiltInPoolInstrumentOptionsById,
    customSamplePools,
    resolvePoolTradingBindingByPoolId,
    resolveSamplePoolDisplayName,
    selectedCustomSamplePools,
    instrumentQuestionBankRevisionById,
    selectedCustomPoolInstrumentOptionsMap,
    systemPoolTradingBindingById,
    tradingAssetClass,
    tradingMarketPresetCustomTemplates,
    tradingMarketPresetKey,
    tradingSettingsText.assetClassLabels,
  ]);
  const { trainerBaseTimeframe, trainerPeriodOptions } = useTrainerPeriodOptionsController({
    selectedSymbol,
    snapshotSessionSymbol: snapshot?.session.symbol,
    currentTrainingBaseTimeframe:
      specialTrainingChartBaseTimeframe ?? effectiveTrainingBaseTimeframe,
    activeSamplePoolBaseTimeframe,
    trainerDisplayPeriod,
    shouldClampDisplayPeriod: activePage !== "SPECIAL_TRAINING",
    defaultTrainerDisplayPeriodByBase: DEFAULT_TRAINER_DISPLAY_PERIOD_BY_BASE,
    defaultTrainerPeriodOptionsByBase: DEFAULT_TRAINER_PERIOD_OPTIONS_BY_BASE,
    setTrainerDisplayPeriod,
  });
  const { headerSymbolCount, poolSettingsRows, csvImportCardViews, enabledPoolGroupCount, totalPoolGroupCount } = useDataConfigWorkspaceViewModel({
    language,
    customSamplePools,
    includeSystemDefaultPool,
    systemPoolStorageBytesById: systemStorageUsage?.systemPoolStorageBytesById,
    systemPoolNameOverrides,
    dataConfigPoolOrderByBase,
    builtInSamplePools: getBuiltInSamplePools(),
    visibleBuiltInPoolSymbolsById,
    allCustomPoolSymbols,
    resolveSamplePoolDisplayName,
    csvImportCardStates,
    localDataSourceSummaries,
    instruments,
    formatMoney,
    formatStorageBytes,
  });
  const symbolOptionEntries = useMemo(() => {
    const duplicateCountBySymbol = new Map<string, number>();
    combinedEnabledPoolInstrumentOptions.forEach((entry) => {
      duplicateCountBySymbol.set(
        entry.symbol,
        (duplicateCountBySymbol.get(entry.symbol) ?? 0) + 1,
      );
    });
    const entries =
      activeSamplePoolId === SAMPLE_POOL_ALL_ID
        ? combinedEnabledPoolInstrumentOptions
        : isBuiltInSamplePoolId(activeSamplePoolId)
          ? availableBuiltInPoolInstrumentOptionsById.get(activeSamplePoolId) ?? []
          : selectedCustomPoolInstrumentOptionsMap.get(activeSamplePoolId) ?? [];
    return entries.map((entry) =>
      duplicateCountBySymbol.get(entry.symbol) && duplicateCountBySymbol.get(entry.symbol)! > 1
        ? {
            ...entry,
            label: `${entry.symbol} · ${entry.poolName}`,
          }
        : entry,
    );
  }, [
    activeSamplePoolId,
    availableBuiltInPoolInstrumentOptionsById,
    combinedEnabledPoolInstrumentOptions,
    isBuiltInSamplePoolId,
    selectedCustomPoolInstrumentOptionsMap,
  ]);
  const symbolSelectOptions = useMemo(
    () => symbolOptionEntries.map((entry) => entry.instrumentId),
    [symbolOptionEntries],
  );
  const symbolSelectLabels = useMemo(
    () =>
      Object.fromEntries(
        symbolOptionEntries.map((entry) => [entry.instrumentId, entry.label]),
      ) as Record<string, string>,
    [symbolOptionEntries],
  );
  const isFreeReplayPrepMode = !String(sessionId || "").trim();
  const resetTrainerToPrepView = useCallback(() => {
    symbolLoadRequestVersionRef.current += 1;
    symbolLoadAbortControllerRef.current?.abort();
    symbolLoadAbortControllerRef.current = null;
    snapshotRequestVersionRef.current += 1;
    snapshotAbortControllerRef.current?.abort();
    snapshotAbortControllerRef.current = null;
    ensureBarsForwardAbortControllerRef.current?.abort();
    ensureBarsForwardAbortControllerRef.current = null;
    ensureBarsBackwardAbortControllerRef.current?.abort();
    ensureBarsBackwardAbortControllerRef.current = null;
    barsRef.current = [];
    barsTsMsRef.current = [];
    setBars([]);
    setBarsOffset(0);
    setBarsTotal(0);
    barsOffsetRef.current = 0;
    barsTotalRef.current = 0;
    snapshotRef.current = null;
    setSessionId("");
    setSnapshot(null);
    setSelectedSymbol("");
    setSelectedInstrumentId("");
    setReplayUnavailableMessage("");
    setIsAutoplay(false);
    setTrainerHydrationState("IDLE");
    setCurrentTrainingBaseTimeframe(currentTrainingBaseTimeframe);
  }, [
    currentTrainingBaseTimeframe,
    setIsAutoplay,
    setSelectedInstrumentId,
    setTrainerHydrationState,
  ]);
  const handleMissingTrainerSession = useCallback(() => { resetTrainerToPrepView(); void refreshLatestResumableTrainerSession(); setError(tt("appText.sessionDoesExist")); }, [refreshLatestResumableTrainerSession, resetTrainerToPrepView, setError, tt]);
  const finalizeDestructiveDataChange = useDestructiveDataChangeFinalizer({
    resetTrainerToPrepView,
    setActionDialog,
    setOrderEndPrompt,
    setIsAutoplay,
    setDataPoolRemovedSymbolsBySourceId,
    refreshInstruments,
    syncCustomSamplePoolsFromDataSources,
    refreshLatestResumableTrainerSession,
    refreshTradingSettings,
    refreshSystemStorageUsage,
  });
  const previousActivePageRef = useRef(activePage);
  useLayoutEffect(() => {
    const previousActivePage = previousActivePageRef.current;
    previousActivePageRef.current = activePage;
    if (activePage !== "TRAINER") {
      return;
    }
    if (previousActivePage === "TRAINER") {
      return;
    }
    endTrainerPerfSpan("page-switch-to-trainer", {
      prepMode: !String(sessionId || "").trim(),
    });
    if (!sessionId) {
      return;
    }
    void syncActiveTrainingRuntime();
  }, [activePage, sessionId, syncActiveTrainingRuntime]);
  const isTrainingSymbolLocked = useMemo(() => Boolean(sessionId) && (snapshot?.fills.length ?? 0) > 0, [sessionId, snapshot?.fills.length]);
  const { activeSamplePoolSelectValue, activeToolbarSymbol, selectSamplePoolOption, selectSymbolOption, pickRandomSymbolOption } =
    useTrainerPoolSelectionController({
      activeSamplePoolId,
      selectedSymbol,
      selectedInstrumentId,
      snapshotSessionSymbol: snapshot?.session.symbol,
      snapshotSessionInstrumentId: snapshot?.session.instrument_id,
      isBusy,
      autoStartWhenIdle: false,
      isTrainingSymbolLocked,
      includeSystemDefaultPool,
      selectedCustomSamplePoolsLength: selectedCustomSamplePools.length,
      trainerSamplePoolOptions,
      symbolOptionEntries,
      randomInstrumentPool: symbolOptionEntries,
      availableBuiltInPoolInstrumentOptionsById,
      selectedCustomPoolInstrumentOptionsMap,
      customSamplePools,
      samplePoolAllId: SAMPLE_POOL_ALL_ID,
      samplePoolUnknownId: SAMPLE_POOL_UNKNOWN_ID,
      samplePoolUnknownName: SAMPLE_POOL_UNKNOWN_NAME,
      barsOffsetRef,
      barsTotalRef,
      manualPoolSwitchTokenRef,
      manualPoolSwitchLoadingRef,
      autoSyncSymbolKeyRef,
      setHint,
      setError,
      setReplayUnavailableMessage,
      setActiveSamplePoolId,
      setCurrentTrainingBaseTimeframe,
      setBars,
      setBarsOffset,
      setBarsTotal,
      setSessionId,
      setSnapshot,
      setSelectedSymbol,
      setSelectedInstrumentId,
      setIncludeSystemDefaultPool,
      setCurrentTrainingPoolMeta,
      resolveSamplePoolBaseTimeframe,
      findBuiltInSamplePoolById,
      isBuiltInSamplePoolId,
      loadSymbol,
      tt,
      ttf,
    });
  const noReplayableSymbol = useMemo(() => {
    const current = (selectedInstrumentId || snapshot?.session.instrument_id || "").trim();
    return !current && symbolSelectOptions.length === 0;
  }, [selectedInstrumentId, snapshot?.session.instrument_id, symbolSelectOptions.length]);
  const currentAnchorTs = useMemo(() => {
    if (!snapshot || !bars.length) {
      return null;
    }
    const maxLocalIndex = Math.max(0, bars.length - 1);
    const entryLocal = clamp(Math.floor(Number(snapshot.session.entry_index) || 0), 0, maxLocalIndex);
    return bars[entryLocal]?.ts ?? null;
  }, [bars, snapshot]);
  const replayEmptyWatermarkText = useMemo(() => {
    const custom = replayUnavailableMessage.trim();
    if (custom) {
      return custom;
    }
    if (
      !isFreeReplayPrepMode &&
      isTrainerHydrationPending(trainerHydrationState)
    ) {
      return tt("appText.loading3");
    }
    if (noReplayableSymbol) {
      return tt("appText.replayUnavailable");
    }
    if (isFreeReplayPrepMode) {
      return ui.freeReplayIdleWatermark;
    }
    return "";
  }, [
    isFreeReplayPrepMode,
    language,
    noReplayableSymbol,
    replayUnavailableMessage,
    trainerHydrationState,
    tt,
    ui.freeReplayIdleWatermark,
  ]);
  const { startRenameSamplePool, cancelRenameSamplePool, saveRenameSamplePool, removeCustomPool } = useTrainerCustomPoolManager({
    appIsMountedRef,
    deletingSamplePoolId,
    deletingSamplePoolProgressPercent,
    deletingSamplePoolProgressTargetPercent,
    editingSamplePoolId,
    editingSamplePoolName,
    isPreparingCsvImportPreview,
    isClearingLocalDataSources,
    isCsvImporting,
    samplePoolUnknownId: SAMPLE_POOL_UNKNOWN_ID,
    samplePoolUnknownName: SAMPLE_POOL_UNKNOWN_NAME,
    tt,
    resolveUnknownErrorMessage,
    sanitizeSamplePoolName,
    waitForDuration,
    waitForNextAnimationFrame,
    waitForPercentReach,
    deleteLocalDataSource: api.deleteLocalDataSource,
    refreshInstruments,
    syncCustomSamplePoolsFromDataSources,
    finalizeDestructiveDataChange,
    setError,
    setCustomPoolNameOverrides,
    setCustomSamplePools,
    setCurrentTrainingPoolMeta,
    setCurrentTrainingBaseTimeframe,
    setLotSizeByPool,
    setEditingSamplePoolId,
    setEditingSamplePoolName,
    setDeletingSamplePoolId,
    setDeletingSamplePoolProgressPercent,
    setDeletingSamplePoolProgressTargetPercent,
    onCustomPoolRemoved: (poolId) => {
      const normalizedPoolId = String(poolId || "").trim();
      if (!normalizedPoolId) {
        return;
      }
      setCsvImportCardStates((current) => current.filter((card) => String(card.sourceId || "").trim() !== normalizedPoolId));
    },
  });
  const { saveSamplePoolRename, removeSamplePool, moveCustomPoolWithinTimeframe } = useAppSamplePoolManagement({
    editingSamplePoolId,
    editingSamplePoolName,
    poolSettingsRows,
    sanitizeSamplePoolName,
    isBuiltInSamplePoolId,
    findBuiltInSamplePoolById,
    saveRenameSamplePool,
    removeCustomPool,
    setEditingSamplePoolId,
    setEditingSamplePoolName,
    setSystemPoolNameOverrides,
    setDataConfigPoolOrderByBase,
    setCustomSamplePools,
  });
  return { activeSamplePoolBaseTimeframe, activeSamplePoolSelectValue, activeToolbarSymbol, allCustomPoolSymbols, availableBuiltInPoolInstrumentOptionsById, availableBuiltInPoolSymbolsById, cancelRenameSamplePool, combinedEnabledPoolInstrumentOptions, combinedEnabledPoolSymbols, csvImportCardViews, currentAnchorTs, enabledPoolGroupCount, enabledSpecialTrainingSamplePools, handleMissingTrainerSession, headerSymbolCount, instrumentBarCountBySymbol, instrumentMetaMap, instrumentQuestionBankRevisionById, isFreeReplayPrepMode, isTrainingSymbolLocked, moveCustomPoolWithinTimeframe, noReplayableSymbol, pickRandomSymbolOption, poolSettingsRows, previousActivePageRef, randomSymbolPool, removeCustomPool, removeSamplePool, replayEmptyWatermarkText, resetTrainerToPrepView, resolveSamplePoolBaseTimeframe, saveRenameSamplePool, saveSamplePoolRename, selectSamplePoolOption, selectSymbolOption, selectedCustomPoolInstrumentOptionsMap, selectedCustomPoolSymbolsMap, selectedCustomSamplePools, startRenameSamplePool, symbolOptionEntries, symbolSelectLabels, symbolSelectOptions, totalPoolGroupCount, trainerBaseTimeframe, trainerPeriodOptions, trainerSamplePoolOptions, visibleBuiltInPoolSymbolsById, visibleCustomPoolInstrumentOptionsMap, visibleCustomPoolSymbolsMap, visibleSystemDailyPoolSymbols };
};
