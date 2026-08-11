// SPDX-License-Identifier: GPL-3.0-only

import type {
  DataSourceSyncMode,
  DataSourceSyncMonitorStateById,
  DataSourceSyncPrefsById,
  PendingLocalDataSourceSyncPreview,
  PreparingLocalDataSourceSyncPreview,
} from "@/domains/data-import/dataSourceTypes";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  HistoryReplayChartBindings,
  HistoryReplayChartViewProps,
} from "@/domains/chart/HistoryReplayChart";
import type { BaseTimeframe } from "@/domains/chart/chartPeriods";
import type { PriceColorMode } from "@/domains/chart/display";
import {
  buildActiveLocalDataImportSourceIds,
  resolveDataConfigOperationLockState,
} from "@/domains/data-import/importActivity";
import type { CsvImportPreviewProgressState } from "@/domains/data-import/useCsvImportController";
import {
  type AppUiLanguage,
} from "@/ui/config/uiConfig";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import {
  type DataConfigDetailWindowTabId,
} from "@/workspaces/data/DataConfigDetailDrawer";
import {
  api,
} from "@/api";
import {
  createDetailFocusMarker,
  createEmptyDetailSymbolDiagnostics,
  createEmptySourceDiagnostics,
  DETAIL_SYMBOL_CHART_WINDOW_BARS,
  DETAIL_SYMBOL_DIAGNOSTICS_CACHE_LIMIT,
  DETAIL_SYMBOL_FOCUS_WINDOW_BARS,
  DETAIL_SYMBOL_RANGE_CACHE_LIMIT,
  normalizeDetailBars,
  normalizeFocusBarIndex,
  resolveWindowFocusBarIndex,
  touchBoundedCacheEntry,
  type CsvImportCardView,
  type DetailBar,
  type DetailSymbolDiagnostics,
  type PoolSettingsRow,
} from "@/workspaces/data/dataConfig/model";
import {
  formatDataConfigLocalizedDateTime,
  formatDataConfigSyncScopeLabel,
} from "@/workspaces/data/dataConfig/dataConfigFormatters";
import { DataConfigWorkspaceSurfaceView } from "@/workspaces/data/dataConfig/DataConfigWorkspaceSurfaceView";
import { useDataConfigCardReorder } from "@/workspaces/data/dataConfig/useDataConfigCardReorder";
import { useDataConfigCopyAndProgress } from "@/workspaces/data/dataConfig/useDataConfigCopyAndProgress";
import { useDataConfigDetailActions } from "@/workspaces/data/dataConfig/useDataConfigDetailActions";
import { useDataConfigDetailProjection } from "@/workspaces/data/dataConfig/useDataConfigDetailProjection";
import { useDataConfigSourceState } from "@/workspaces/data/dataConfig/useDataConfigSourceState";
import { useDataConfigOperationBlockers } from "@/workspaces/data/dataConfig/useDataConfigOperationBlockers";

export type DataConfigWorkspacePageProps = {
  isActive?: boolean;
  ui: {
    dataConfigTitle: string;
    readCsvFolder: string;
  };
  tt: (key: AppTextKey) => string;
  enabledPoolGroupCount: number;
  combinedEnabledPoolSymbols: string[];
  isCsvImporting: boolean;
  isPreparingCsvImportPreview: boolean;
  isClearingLocalDataSources: boolean;
  isNativeImportDragActive: boolean;
  deletingSamplePoolId: string;
  preparingCsvImportPreviewPercent: number;
  preparingCsvImportPreviewProgress: CsvImportPreviewProgressState | null;
  clearingLocalDataSourcesProgressPercent: number;
  deletingSamplePoolProgressPercent: number;
  csvImportCardViews: CsvImportCardView[];
  csvImportCardControlAction: string | null;
  poolSettingsRows: PoolSettingsRow[];
  dataSourceSyncMonitorStateById: DataSourceSyncMonitorStateById;
  dataSourceSyncPrefsById: DataSourceSyncPrefsById;
  customSamplePoolsCount: number;
  editingSamplePoolId: string;
  editingSamplePoolName: string;
  pendingLocalDataSourceSyncPreview: PendingLocalDataSourceSyncPreview | null;
  preparingLocalDataSourceSyncPreview: PreparingLocalDataSourceSyncPreview | null;
  totalPoolGroupCount: number;
  headerSymbolCount: number;
  marketDataStorageBytes: number | null;
  compactScriptLanguage: boolean;
  formatMoney: (value: number, digits?: number) => string;
  formatStorageBytes: (value: number) => string;
  withLabelValue: (label: string, value: string) => string;
  getBaseTimeframeLabels: () => Record<BaseTimeframe, string>;
  effectiveThemeMode: "light" | "dark";
  priceColorMode: PriceColorMode;
  language: AppUiLanguage;
  trainerDisplayPeriod: NonNullable<
    HistoryReplayChartViewProps["displayPeriod"]
  >;
  trainerPeriodOptionsByBase: HistoryReplayChartViewProps["trainerPeriodOptionsByBase"];
  historyReplayChartBindings: HistoryReplayChartBindings;
  onClearLocalPools: () => void;
  openCsvFolderPickerAndPrepareImport: (options?: {
    preferredTargetSourceId?: string;
    importEntryMode?: "GENERAL" | "FULL_REIMPORT";
  }) => void;
  openCsvFolderPathAndPrepareImport: (
    folderPath: string,
    options?: {
      preferredTargetSourceId?: string;
      importEntryMode?: "GENERAL" | "FULL_REIMPORT";
      sourceFolderBookmarkId?: string;
    },
  ) => void;
  controlCsvImportCardJob: (
    cardId: string,
    action: "PAUSE" | "RESUME" | "CANCEL",
  ) => Promise<void>;
  fetchDetailSymbolBarsRange: (
    symbol: string,
    instrumentId: string,
    baseTimeframe: BaseTimeframe,
    offset: number,
    limit: number,
    options?: { signal?: AbortSignal },
  ) => Promise<{
    total: number;
    offset: number;
    limit: number;
    bars: DetailBar[];
  }>;
  fetchDetailSymbolDiagnostics: (
    sourceId: string,
    symbol: string,
    options?: { signal?: AbortSignal },
  ) => Promise<DetailSymbolDiagnostics>;
  startTrainingWithSymbol: (symbol: string, poolId: string) => Promise<void>;
  dismissLocalDataSourceSyncPreview: () => void;
  selectLocalDataSourceSyncPreviewPlan: (previewPlanId: string) => void;
  confirmLocalDataSourceSyncPreview: () => Promise<void>;
  syncSamplePoolWithSourceFolder: (
    poolId: string,
    options?: {
      hasLocalSymbolRemoval?: boolean;
      removedSymbolCount?: number;
      poolName?: string;
      sourceFolderUsageMode?: "BOUND_SOURCE" | "ONE_OFF";
    },
  ) => Promise<void>;
  removeSymbolsFromSamplePool: (
    poolId: string,
    symbols: string[],
  ) => Promise<boolean>;
  updateDataSourceSyncPreference: (
    sourceId: string,
    mode: DataSourceSyncMode,
  ) => void;
  runDataSourceSyncQuickCheckSweep: (options?: {
    force?: boolean;
    trigger?: "BACKGROUND" | "USER";
  }) => Promise<void>;
  refreshLocalDataSources: () => Promise<unknown>;
  setEditingSamplePoolName: (value: string) => void;
  saveRenameSamplePool: () => void;
  cancelRenameSamplePool: () => void;
  startRenameSamplePool: (poolId: string, poolName: string) => void;
  moveCustomPoolWithinTimeframe: (
    draggedPoolId: string,
    targetPoolId: string,
  ) => void;
  removeCustomPool: (poolId: string) => Promise<void>;
  portableRebindTargetSourceIds: string[];
  openDeviceTransferSettings: () => void;
  removedSymbolsByPool: Record<string, string[]>;
  setRemovedSymbolsByPool: Dispatch<SetStateAction<Record<string, string[]>>>;
};

export const DataConfigWorkspacePage = ({
  isActive = true,
  ui,
  tt,
  isCsvImporting,
  isPreparingCsvImportPreview,
  isClearingLocalDataSources,
  isNativeImportDragActive,
  deletingSamplePoolId,
  preparingCsvImportPreviewPercent,
  preparingCsvImportPreviewProgress,
  clearingLocalDataSourcesProgressPercent,
  deletingSamplePoolProgressPercent,
  csvImportCardViews,
  csvImportCardControlAction,
  poolSettingsRows,
  dataSourceSyncMonitorStateById,
  dataSourceSyncPrefsById,
  editingSamplePoolId,
  editingSamplePoolName,
  preparingLocalDataSourceSyncPreview,
  customSamplePoolsCount,
  marketDataStorageBytes,
  withLabelValue,
  formatMoney,
  formatStorageBytes,
  getBaseTimeframeLabels,
  effectiveThemeMode,
  language,
  trainerPeriodOptionsByBase,
  onClearLocalPools,
  openCsvFolderPickerAndPrepareImport,
  openCsvFolderPathAndPrepareImport,
  controlCsvImportCardJob,
  fetchDetailSymbolBarsRange,
  fetchDetailSymbolDiagnostics,
  startTrainingWithSymbol,
  syncSamplePoolWithSourceFolder,
  removeSymbolsFromSamplePool,
  updateDataSourceSyncPreference,
  runDataSourceSyncQuickCheckSweep,
  refreshLocalDataSources,
  setEditingSamplePoolName,
  saveRenameSamplePool,
  cancelRenameSamplePool,
  startRenameSamplePool,
  moveCustomPoolWithinTimeframe,
  removeCustomPool,
  portableRebindTargetSourceIds,
  openDeviceTransferSettings,
  removedSymbolsByPool,
  setRemovedSymbolsByPool,
}: DataConfigWorkspacePageProps) => {
  const {
    baseTimeframeLabels,
    buildBlurClearHandler,
    clearArmedAction,
    clearLocalPoolsActionKey,
    dataConfigCopy,
    formatPercentDisplay,
    isActionArmed,
    joinWithMiddleDot,
    normalizedClearingLocalDataSourcesProgressPercent,
    normalizedDeletingProgressPercent,
    portableCopy,
    renderDataTaskProgressRail,
    renderPreparingCsvImportPreviewProgress,
    setArmedKey,
    ttLoose,
    ttf,
  } = useDataConfigCopyAndProgress({
    clearingLocalDataSourcesProgressPercent,
    deletingSamplePoolProgressPercent,
    formatMoney,
    getBaseTimeframeLabels,
    language,
    preparingCsvImportPreviewPercent,
    preparingCsvImportPreviewProgress,
    tt,
  });
  const [detailPoolId, setDetailPoolId] = useState("");
  const detailWindowRevisionRef = useRef(0);
  const [detailSymbolKeyword, setDetailSymbolKeyword] = useState("");
  const [checkedSymbols, setCheckedSymbols] = useState<string[]>([]);
  const [activeSymbol, setActiveSymbol] = useState("");
  const [isRemovingSymbols, setIsRemovingSymbols] = useState(false);
  const [savingTradingCalendarSourceId, setSavingTradingCalendarSourceId] =
    useState("");
  const [detailOperationErrorText, setDetailOperationErrorText] = useState("");
  const [detailWindowTab, setDetailWindowTab] =
    useState<DataConfigDetailWindowTabId>("OVERVIEW");
  const [isDropZoneActive, setIsDropZoneActive] = useState(false);
  const activeImportSourceIds = useMemo(
    () => buildActiveLocalDataImportSourceIds(csvImportCardViews),
    [csvImportCardViews],
  );
  const operationLocks = resolveDataConfigOperationLockState({
    isPreparingCsvImportPreview,
    isClearingLocalDataSources,
    deletingSamplePoolId,
    isRemovingSymbols,
    isCsvImporting,
  });
  const isImportEntryBlocked = operationLocks.importEntryBlocked;
  const isCardReorderBlocked = operationLocks.cardReorderBlocked;
  const isGlobalOperationBlocked = operationLocks.globalBlocking;
  const isDestructiveOperationBlocked = operationLocks.destructiveBlocking;
  const hasClearablePools = useMemo(
    () => poolSettingsRows.some((pool) => !pool.isSystem),
    [poolSettingsRows],
  );
  const clearLocalPoolsArmed = isActionArmed(clearLocalPoolsActionKey);
  const { prioritizedRebindPools, readModelSourceStatusById } =
    useDataConfigSourceState({
    detailWindowRevisionRef,
    isActive,
    poolSettingsRows,
    portableRebindTargetSourceIds,
    setDetailOperationErrorText,
    setDetailPoolId,
    setDetailWindowTab,
  });
  const formatSyncScopeLabel = useCallback(
    (
      strategy: PoolSettingsRow["importScopeStrategy"],
      topLevelSubfolder: string,
    ): string =>
      formatDataConfigSyncScopeLabel({
        strategy,
        topLevelSubfolder,
        tt,
        ttf,
      }),
    [tt, ttf],
  );
  const formatLocalizedDateTime = useCallback(
    (value: string | null): string =>
      formatDataConfigLocalizedDateTime(value, language, tt),
    [language, tt],
  );
  const {
    activeDetailBarCount,
    activeDetailSymbolRow,
    activeDiagnosticDetailCount,
    activeDiagnosticDetailEmptyText,
    activeDiagnosticDetailHint,
    activeDiagnosticDetailItems,
    activeDiagnosticDetailTitle,
    activeFocusedDetailItem,
    activeSourceDiagnosticKind,
    activeSymbolBarsLoadFailed,
    activeSymbolHistoryProject,
    activeSymbolShowVolumePane,
    activeSymbolTotalBars,
    commitFocusedDetailMarker,
    detailDiagnosticsBaseTimeframe,
    detailDiagnosticsSignature,
    detailDiagnosticsSourceId,
    detailPool,
    detailRows,
    detailWindowResetKey,
    diagnosticPanelTitle,
    focusDetailRequestNonce,
    focusedDetailBarIndex,
    focusedDetailItemId,
    focusedDetailMarker,
    isLoadingSourceDiagnostics,
    isLoadingSymbolBars,
    isAllDetailRowsChecked,
    jumpToDiagnosticDetailBar,
    loadedSourceDiagnosticsSignatureRef,
    miniChartBasePeriod,
    miniHistoryChartDisplayPeriod,
    miniHistoryChartKey,
    setActiveSourceDiagnosticKind,
    setActiveSymbolBars,
    setActiveSymbolBarsLoadFailed,
    setActiveSymbolDiagnostics,
    setFocusDetailRequestNonce,
    setFocusedDetailBarIndex,
    setFocusedDetailItemId,
    setFocusedDetailMarker,
    setIsLoadingSourceDiagnostics,
    setIsLoadingSymbolBars,
    setSourceDiagnostics,
    setSourceDiagnosticsLoadFailed,
    shouldRenderMiniHistoryChart,
    sourceDiagnosticFilterOptions,
    sourceDiagnosticSummaryBySymbol,
    sourceDiagnostics,
    sourceDiagnosticsLoadFailed,
    sourceDiagnosticsLoadedForDetail,
    sourceExtremeAnomalyCount,
    sourceTimeIntegrityCount,
    symbolBarsRangeCacheRef,
    symbolDiagnosticsCacheRef,
  } = useDataConfigDetailProjection({
    activeSymbol,
    checkedSymbols,
    detailPoolId,
    detailSymbolKeyword,
    detailWindowTab,
    formatMoney,
    formatPercentDisplay,
    language,
    poolSettingsRows,
    removedSymbolsByPool,
    setActiveSymbol,
    setCheckedSymbols,
    setDetailPoolId,
    setRemovedSymbolsByPool,
    tt,
    ttLoose,
    ttf,
    withLabelValue,
  });
  const poolSettingsById = useMemo(() => {
    const map = new Map<string, PoolSettingsRow>();
    poolSettingsRows.forEach((pool) => {
      const poolId = String(pool.id || "").trim();
      if (!poolId) {
        return;
      }
      map.set(poolId, pool);
    });
    return map;
  }, [poolSettingsRows]);
  const {
    beginCardReorder,
    cardElementMapRef,
    cardElementRefCallbackMapRef,
    dragOverPoolId,
    draggingPoolId,
    previousCardRectMapRef,
    suppressNextCardClickRef,
  } = useDataConfigCardReorder({
    deletingSamplePoolId,
    isActive,
    isCardReorderBlocked,
    moveCustomPoolWithinTimeframe,
    poolSettingsById,
  });
  const { isItemOperationBlocked, isSourceOperationBlocked } =
    useDataConfigOperationBlockers({
      activeImportSourceIds,
      isGlobalOperationBlocked,
      poolSettingsById,
      savingTradingCalendarSourceId,
    });

  useEffect(() => {
    loadedSourceDiagnosticsSignatureRef.current = "";
    symbolBarsRangeCacheRef.current.clear();
    symbolDiagnosticsCacheRef.current.clear();
    setActiveSymbolBars([]);
    setActiveSymbolDiagnostics(createEmptyDetailSymbolDiagnostics());
    setSourceDiagnostics(
      createEmptySourceDiagnostics(
        detailDiagnosticsSourceId,
        detailDiagnosticsBaseTimeframe,
      ),
    );
    setActiveSourceDiagnosticKind("ALL");
    setActiveSymbolBarsLoadFailed(false);
    setSourceDiagnosticsLoadFailed(false);
    setIsLoadingSymbolBars(false);
    setIsLoadingSourceDiagnostics(false);
  }, [
    detailDiagnosticsBaseTimeframe,
    detailDiagnosticsSignature,
    detailDiagnosticsSourceId,
  ]);

  useEffect(() => {
    if (!detailDiagnosticsSourceId) {
      setSourceDiagnostics(createEmptySourceDiagnostics());
      setIsLoadingSourceDiagnostics(false);
      setSourceDiagnosticsLoadFailed(false);
      return;
    }
    if (detailWindowTab !== "DIAGNOSTICS") {
      setIsLoadingSourceDiagnostics(false);
      return;
    }
    if (
      loadedSourceDiagnosticsSignatureRef.current ===
        detailDiagnosticsSignature &&
      sourceDiagnosticsLoadedForDetail
    ) {
      return;
    }
    const abortController = new AbortController();
    setSourceDiagnostics(
      createEmptySourceDiagnostics(
        detailDiagnosticsSourceId,
        detailDiagnosticsBaseTimeframe,
      ),
    );
    setIsLoadingSourceDiagnostics(true);
    setSourceDiagnosticsLoadFailed(false);
    void api
      .getLocalDataSourceDiagnostics(detailDiagnosticsSourceId, {
        signal: abortController.signal,
      })
      .then((diagnostics) => {
        if (abortController.signal.aborted) {
          return;
        }
        setSourceDiagnostics({
          ...diagnostics,
          sourceId: diagnostics.sourceId || detailDiagnosticsSourceId,
          baseTimeframe:
            diagnostics.baseTimeframe || detailDiagnosticsBaseTimeframe,
        });
        loadedSourceDiagnosticsSignatureRef.current = detailDiagnosticsSignature;
      })
      .catch(() => {
        if (abortController.signal.aborted) {
          return;
        }
        setSourceDiagnostics(
          createEmptySourceDiagnostics(
            detailDiagnosticsSourceId,
            detailDiagnosticsBaseTimeframe,
          ),
        );
        setSourceDiagnosticsLoadFailed(true);
      })
      .finally(() => {
        if (abortController.signal.aborted) {
          return;
        }
        setIsLoadingSourceDiagnostics(false);
      });
    return () => {
      abortController.abort();
    };
  }, [
    detailDiagnosticsBaseTimeframe,
    detailDiagnosticsSignature,
    detailDiagnosticsSourceId,
    detailWindowTab,
    sourceDiagnosticsLoadedForDetail,
  ]);

  useEffect(() => {
    setFocusedDetailItemId("");
    setFocusedDetailBarIndex(null);
    setFocusedDetailMarker(null);
    setFocusDetailRequestNonce((current) => current + 1);
  }, [detailPoolId]);

  useEffect(() => {
    setFocusedDetailItemId("");
    setFocusedDetailBarIndex(null);
    setFocusedDetailMarker(null);
    setFocusDetailRequestNonce((current) => current + 1);
  }, [activeSourceDiagnosticKind]);

  useEffect(() => {
    const symbol = String(activeSymbol || "")
      .trim()
      .toUpperCase();
    if (
      detailWindowTab !== "DIAGNOSTICS" ||
      !symbol ||
      !detailPool ||
      !activeFocusedDetailItem
    ) {
      setActiveSymbolDiagnostics(createEmptyDetailSymbolDiagnostics());
      return;
    }
    const cacheKey = `${detailPool.id}:${symbol}`;
    const cached = symbolDiagnosticsCacheRef.current.get(cacheKey);
    if (cached) {
      touchBoundedCacheEntry(
        symbolDiagnosticsCacheRef.current,
        cacheKey,
        cached,
        DETAIL_SYMBOL_DIAGNOSTICS_CACHE_LIMIT,
      );
      setActiveSymbolDiagnostics(cached);
      return;
    }
    const abortController = new AbortController();
    void fetchDetailSymbolDiagnostics(detailPool.id, symbol, {
      signal: abortController.signal,
    })
      .then((diagnostics) => {
        if (abortController.signal.aborted) {
          return;
        }
        const resolvedDiagnostics =
          diagnostics ?? createEmptyDetailSymbolDiagnostics();
        touchBoundedCacheEntry(
          symbolDiagnosticsCacheRef.current,
          cacheKey,
          resolvedDiagnostics,
          DETAIL_SYMBOL_DIAGNOSTICS_CACHE_LIMIT,
        );
        setActiveSymbolDiagnostics(resolvedDiagnostics);
      })
      .catch(() => {
        if (abortController.signal.aborted) {
          return;
        }
        setActiveSymbolDiagnostics(createEmptyDetailSymbolDiagnostics());
      });
    return () => {
      abortController.abort();
    };
  }, [
    activeFocusedDetailItem,
    activeSymbol,
    detailPool?.id,
    detailWindowTab,
    fetchDetailSymbolDiagnostics,
  ]);

  useEffect(() => {
    const symbol = String(activeSymbol || "")
      .trim()
      .toUpperCase();
    if (!symbol || !activeFocusedDetailItem) {
      setActiveSymbolBars([]);
      setFocusedDetailBarIndex(null);
      setFocusedDetailMarker(null);
      setIsLoadingSymbolBars(false);
      setActiveSymbolBarsLoadFailed(false);
      return;
    }
    if (!detailPool) {
      setActiveSymbolBars([]);
      setFocusedDetailBarIndex(null);
      setFocusedDetailMarker(null);
      setIsLoadingSymbolBars(false);
      setActiveSymbolBarsLoadFailed(false);
      return;
    }
    const activeSymbolInstrumentId = String(
      detailPool.symbolInstrumentIdBySymbol[symbol] ?? "",
    ).trim();
    if (!activeSymbolInstrumentId || activeSymbolTotalBars <= 0) {
      setActiveSymbolBars([]);
      setFocusedDetailBarIndex(null);
      setFocusedDetailMarker(null);
      setIsLoadingSymbolBars(false);
      setActiveSymbolBarsLoadFailed(false);
      return;
    }
    const targetFocusIndex = normalizeFocusBarIndex(
      activeFocusedDetailItem?.focusBarIndex,
    );
    const requestedWindowSize = Math.max(
      1,
      Math.min(
        targetFocusIndex === null
          ? DETAIL_SYMBOL_CHART_WINDOW_BARS
          : DETAIL_SYMBOL_FOCUS_WINDOW_BARS,
        activeSymbolTotalBars,
      ),
    );
    if (requestedWindowSize <= 0) {
      setActiveSymbolBars([]);
      setFocusedDetailBarIndex(null);
      setFocusedDetailMarker(null);
      setIsLoadingSymbolBars(false);
      setActiveSymbolBarsLoadFailed(false);
      return;
    }
    const maxOffset = Math.max(0, activeSymbolTotalBars - requestedWindowSize);
    const focusWindowPivot = Math.max(
      0,
      Math.floor((requestedWindowSize - 1) * 0.5),
    );
    const requestedOffset =
      targetFocusIndex === null
        ? maxOffset
        : Math.max(0, Math.min(maxOffset, targetFocusIndex - focusWindowPivot));
    const cacheKey = `${detailPool.baseTimeframe}:${symbol}:${requestedOffset}:${requestedWindowSize}`;
    const cached = symbolBarsRangeCacheRef.current.get(cacheKey);
    if (cached) {
      const localFocusIndex = resolveWindowFocusBarIndex(
        targetFocusIndex,
        cached.offset,
        cached.bars.length,
      );
      touchBoundedCacheEntry(
        symbolBarsRangeCacheRef.current,
        cacheKey,
        cached,
        DETAIL_SYMBOL_RANGE_CACHE_LIMIT,
      );
      setActiveSymbolBars(cached.bars);
      setFocusedDetailBarIndex(localFocusIndex);
      commitFocusedDetailMarker(
        localFocusIndex === null || !activeFocusedDetailItem
          ? null
          : createDetailFocusMarker(activeFocusedDetailItem, localFocusIndex),
      );
      setIsLoadingSymbolBars(false);
      setActiveSymbolBarsLoadFailed(false);
      return;
    }
    const abortController = new AbortController();
    setIsLoadingSymbolBars(true);
    setActiveSymbolBarsLoadFailed(false);
    void fetchDetailSymbolBarsRange(
      symbol,
      activeSymbolInstrumentId,
      detailPool.baseTimeframe,
      requestedOffset,
      requestedWindowSize,
      {
        signal: abortController.signal,
      },
    )
      .then((range) => {
        if (abortController.signal.aborted) {
          return;
        }
        const normalizedBars = normalizeDetailBars(
          Array.isArray(range.bars) ? range.bars : [],
        );
        const normalizedRange = {
          total: Math.max(0, Math.floor(Number(range.total) || 0)),
          offset: Math.max(0, Math.floor(Number(range.offset) || 0)),
          limit: Math.max(1, Math.floor(Number(range.limit) || 1)),
          bars: normalizedBars,
        };
        const localFocusIndex = resolveWindowFocusBarIndex(
          targetFocusIndex,
          normalizedRange.offset,
          normalizedRange.bars.length,
        );
        touchBoundedCacheEntry(
          symbolBarsRangeCacheRef.current,
          cacheKey,
          normalizedRange,
          DETAIL_SYMBOL_RANGE_CACHE_LIMIT,
        );
        setActiveSymbolBars(normalizedRange.bars);
        setFocusedDetailBarIndex(localFocusIndex);
        commitFocusedDetailMarker(
          localFocusIndex === null || !activeFocusedDetailItem
            ? null
            : createDetailFocusMarker(activeFocusedDetailItem, localFocusIndex),
        );
      })
      .catch(() => {
        if (abortController.signal.aborted) {
          return;
        }
        setActiveSymbolBars([]);
        setFocusedDetailBarIndex(null);
        setFocusedDetailMarker(null);
        setActiveSymbolBarsLoadFailed(true);
      })
      .finally(() => {
        if (abortController.signal.aborted) {
          return;
        }
        setIsLoadingSymbolBars(false);
      });
    return () => {
      abortController.abort();
    };
  }, [
    activeFocusedDetailItem,
    activeSymbol,
    activeSymbolTotalBars,
    detailPool?.id,
    detailPool?.baseTimeframe,
    fetchDetailSymbolBarsRange,
    focusDetailRequestNonce,
    commitFocusedDetailMarker,
  ]);

  const removeSymbolsFromDetail = useCallback(
    async (symbols: string[]) => {
      if (
        !detailPool ||
        detailPool.isSystem ||
        !symbols.length ||
        isSourceOperationBlocked(detailPool.id)
      ) {
        return;
      }
      const normalizedSymbols = Array.from(
        new Set(
          symbols
            .map((symbol) =>
              String(symbol || "")
                .trim()
                .toUpperCase(),
            )
            .filter((symbol) => Boolean(symbol)),
        ),
      );
      if (!normalizedSymbols.length) {
        return;
      }

      const removalSet = new Set(normalizedSymbols);
      const currentVisibleSymbols = detailRows.map((row) => row.symbol);
      const activeRowIndex = currentVisibleSymbols.indexOf(activeSymbol);
      const nextVisibleSymbols = currentVisibleSymbols.filter(
        (symbol) => !removalSet.has(symbol),
      );
      const nextActiveSymbol =
        nextVisibleSymbols.length > 0
          ? (nextVisibleSymbols[
              Math.max(
                0,
                Math.min(activeRowIndex, nextVisibleSymbols.length - 1),
              )
            ] ?? "")
          : "";

      setIsRemovingSymbols(true);
      try {
        const removed = await removeSymbolsFromSamplePool(
          detailPool.id,
          normalizedSymbols,
        );
        if (!removed) {
          return;
        }
        setRemovedSymbolsByPool((current) => {
          const nextRemovedSymbols = new Set(
            (current[detailPool.id] ?? []).map((symbol) =>
              symbol.toUpperCase(),
            ),
          );
          normalizedSymbols.forEach((symbol) => nextRemovedSymbols.add(symbol));
          return {
            ...current,
            [detailPool.id]: Array.from(nextRemovedSymbols),
          };
        });
        setCheckedSymbols((current) =>
          current.filter((symbol) => !removalSet.has(symbol)),
        );
        setActiveSymbol(nextActiveSymbol);
        setFocusedDetailItemId("");
        setFocusedDetailBarIndex(null);
        setFocusedDetailMarker(null);
      } finally {
        setIsRemovingSymbols(false);
      }
    },
    [
      activeSymbol,
      detailPool,
      detailRows,
      isSourceOperationBlocked,
      removeSymbolsFromSamplePool,
    ],
  );

  const { openDetailPool } = useDataConfigDetailActions({
    detailWindowRevisionRef,
    poolSettingsRows,
    setActiveSymbol,
    setCheckedSymbols,
    setDetailOperationErrorText,
    setDetailPoolId,
    setDetailSymbolKeyword,
    setDetailWindowTab,
  });
  const isDetailPoolSystem = Boolean(detailPool?.isSystem);

  return (
    <DataConfigWorkspaceSurfaceView
      model={{
      activeDetailBarCount,
      activeDetailSymbolRow,
      activeDiagnosticDetailCount,
      activeDiagnosticDetailEmptyText,
      activeDiagnosticDetailHint,
      activeDiagnosticDetailItems,
      activeDiagnosticDetailTitle,
      activeSourceDiagnosticKind,
      activeSymbol,
      activeSymbolBarsLoadFailed,
      activeSymbolHistoryProject,
      activeSymbolShowVolumePane,
      baseTimeframeLabels,
      beginCardReorder,
      buildBlurClearHandler,
      cancelRenameSamplePool,
      cardElementMapRef,
      cardElementRefCallbackMapRef,
      checkedSymbols,
      clearArmedAction,
      clearLocalPoolsActionKey,
      clearLocalPoolsArmed,
      controlCsvImportCardJob,
      csvImportCardControlAction,
      csvImportCardViews,
      customSamplePoolsCount,
      dataConfigCopy,
      dataSourceSyncMonitorStateById,
      dataSourceSyncPrefsById,
      deletingSamplePoolId,
      detailOperationErrorText,
      detailPool,
      detailRows,
      detailSymbolKeyword,
      detailWindowResetKey,
      detailWindowRevisionRef,
      detailWindowTab,
      diagnosticPanelTitle,
      dragOverPoolId,
      draggingPoolId,
      editingSamplePoolId,
      editingSamplePoolName,
      effectiveThemeMode,
      focusDetailRequestNonce,
      focusedDetailBarIndex,
      focusedDetailItemId,
      focusedDetailMarker,
      formatLocalizedDateTime,
      formatMoney,
      formatPercentDisplay,
      formatStorageBytes,
      formatSyncScopeLabel,
      hasClearablePools,
      isAllDetailRowsChecked,
      isCardReorderBlocked,
      isClearingLocalDataSources,
      isDestructiveOperationBlocked,
      isDetailPoolSystem,
      isDropZoneActive,
      isGlobalOperationBlocked,
      isImportEntryBlocked,
      isItemOperationBlocked,
      sourceDiagnosticsLoadedForDetail,
      isLoadingSourceDiagnostics,
      isLoadingSymbolBars,
      isNativeImportDragActive,
      isPreparingCsvImportPreview,
      isSourceOperationBlocked,
      joinWithMiddleDot,
      jumpToDiagnosticDetailBar,
      language,
      marketDataStorageBytes,
      miniChartBasePeriod,
      miniHistoryChartDisplayPeriod,
      miniHistoryChartKey,
      normalizedClearingLocalDataSourcesProgressPercent,
      normalizedDeletingProgressPercent,
      onClearLocalPools,
      openCsvFolderPathAndPrepareImport,
      openCsvFolderPickerAndPrepareImport,
      openDetailPool,
      openDeviceTransferSettings,
      poolSettingsById,
      poolSettingsRows,
      portableCopy,
      preparingLocalDataSourceSyncPreview,
      previousCardRectMapRef,
      prioritizedRebindPools,
      readModelSourceStatusById,
      refreshLocalDataSources,
      removeCustomPool,
      removeSymbolsFromDetail,
      removedSymbolsByPool,
      renderDataTaskProgressRail,
      renderPreparingCsvImportPreviewProgress,
      runDataSourceSyncQuickCheckSweep,
      saveRenameSamplePool,
      setActiveSourceDiagnosticKind,
      setActiveSymbol,
      setArmedKey,
      setCheckedSymbols,
      setDetailOperationErrorText,
      setDetailPoolId,
      setDetailSymbolKeyword,
      setDetailWindowTab,
      setEditingSamplePoolName,
      setFocusedDetailBarIndex,
      setFocusedDetailItemId,
      setFocusedDetailMarker,
      setIsDropZoneActive,
      setSavingTradingCalendarSourceId,
      setSourceDiagnostics,
      shouldRenderMiniHistoryChart,
      sourceDiagnosticFilterOptions,
      sourceDiagnosticSummaryBySymbol,
      sourceDiagnostics,
      sourceDiagnosticsLoadFailed,
      sourceExtremeAnomalyCount,
      sourceTimeIntegrityCount,
      startRenameSamplePool,
      startTrainingWithSymbol,
      suppressNextCardClickRef,
      syncSamplePoolWithSourceFolder,
      trainerPeriodOptionsByBase,
      tt,
      ttLoose,
      ttf,
      ui,
      updateDataSourceSyncPreference,
      withLabelValue,
      }}
    />
  );
};
