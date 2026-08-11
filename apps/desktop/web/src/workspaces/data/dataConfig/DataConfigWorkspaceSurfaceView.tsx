// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  type DragEvent,
} from "react";
import {
  normalizeNativeImportDirectoryPath,
  resolveDroppedCsvFolderPath,
} from "@/domains/data-import/nativeImportHelpers";
import { resolveLayoutMotionAnimationOptions } from "@/frontend-kernel/motionTokens";
import {
  type DataConfigDetailWindowAction,
  type DataConfigDetailWindowPayload,
} from "@/workspaces/data/DataConfigDetailDrawer";
import {
  api,
} from "@/api";
import {
  createEmptySourceDiagnostics,
  resolveHallSectionStats,
  resolveTimeSpanText,
  type HallSection,
} from "@/workspaces/data/dataConfig/model";
import { useDataConfigHallViewModel } from "@/workspaces/data/dataConfig/useDataConfigHallViewModel";
import {
  resolveSummaryOperationProgress,
} from "@/workspaces/data/dataConfig/dataConfigWorkspaceReadModelUi";
import type { DataConfigWorkspaceSurfaceViewModel } from "@/workspaces/data/dataConfig/DataConfigWorkspaceSurfaceViewModel";
import { createDataConfigPoolCardRenderers } from "@/workspaces/data/dataConfig/DataConfigPoolCards";
import { DataConfigHallContent } from "@/workspaces/data/dataConfig/DataConfigHallContent";

type DataConfigWorkspaceSurfaceViewProps = {
  model: DataConfigWorkspaceSurfaceViewModel;
};

export const DataConfigWorkspaceSurfaceView = ({
  model,
}: DataConfigWorkspaceSurfaceViewProps) => {
  const {
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
    cardElementMapRef,
    cardElementRefCallbackMapRef,
    checkedSymbols,
    csvImportCardViews,
    dataConfigCopy,
    dataSourceSyncMonitorStateById,
    dataSourceSyncPrefsById,
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
    focusDetailRequestNonce,
    focusedDetailBarIndex,
    focusedDetailItemId,
    focusedDetailMarker,
    formatLocalizedDateTime,
    formatMoney,
    formatSyncScopeLabel,
    isAllDetailRowsChecked,
    isDetailPoolSystem,
    isDropZoneActive,
    isImportEntryBlocked,
    isItemOperationBlocked,
    isLoadingSourceDiagnostics,
    isLoadingSymbolBars,
    isSourceOperationBlocked,
    jumpToDiagnosticDetailBar,
    miniChartBasePeriod,
    miniHistoryChartDisplayPeriod,
    miniHistoryChartKey,
    openCsvFolderPathAndPrepareImport,
    openCsvFolderPickerAndPrepareImport,
    poolSettingsById,
    poolSettingsRows,
    portableCopy,
    preparingLocalDataSourceSyncPreview,
    previousCardRectMapRef,
    readModelSourceStatusById,
    refreshLocalDataSources,
    removeSymbolsFromDetail,
    removedSymbolsByPool,
    runDataSourceSyncQuickCheckSweep,
    setActiveSourceDiagnosticKind,
    setActiveSymbol,
    setCheckedSymbols,
    setDetailOperationErrorText,
    setDetailPoolId,
    setDetailSymbolKeyword,
    setDetailWindowTab,
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
    sourceDiagnosticsLoadedForDetail,
    sourceDiagnosticsLoadFailed,
    sourceExtremeAnomalyCount,
    sourceTimeIntegrityCount,
    startTrainingWithSymbol,
    syncSamplePoolWithSourceFolder,
    trainerPeriodOptionsByBase,
    tt,
    ttLoose,
    ttf,
    ui,
    updateDataSourceSyncPreference,
    withLabelValue,
  } = model;

  const startLocalDataImportEntry = useCallback(
    (folderPath?: string) => {
      if (isImportEntryBlocked) {
        return;
      }
      const normalizedFolderPath = normalizeNativeImportDirectoryPath(folderPath ?? "");
      const openImport = () => {
        if (normalizedFolderPath) {
          openCsvFolderPathAndPrepareImport(normalizedFolderPath);
          return;
        }
        openCsvFolderPickerAndPrepareImport();
      };
      openImport();
    },
    [
      isImportEntryBlocked,
      openCsvFolderPathAndPrepareImport,
      openCsvFolderPickerAndPrepareImport,
    ],
  );

  const onDropZoneDragEnter = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (!isDropZoneActive) {
      setIsDropZoneActive(true);
    }
  };

  const onDropZoneDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!isDropZoneActive) {
      setIsDropZoneActive(true);
    }
  };

  const onDropZoneDragLeave = (event: DragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDropZoneActive(false);
  };

  const onDropZoneDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDropZoneActive(false);
    if (isImportEntryBlocked) {
      return;
    }
    const dataTransfer = event.dataTransfer;
    const droppedFolderPath = resolveDroppedCsvFolderPath(dataTransfer);
    startLocalDataImportEntry(droppedFolderPath);
  };

  const { hallSectionsWithDragPreview, resolveSummaryFilterForItem } =
    useDataConfigHallViewModel({
      baseTimeframeLabels,
      csvImportCardViews,
      dataConfigCopy,
      dataSourceSyncMonitorStateById,
      dataSourceSyncPrefsById,
      draggingPoolId,
      dragOverPoolId,
      formatLocalizedDateTime,
      formatMoney,
      isItemOperationBlocked,
      poolSettingsById,
      poolSettingsRows,
      readModelSourceStatusById,
      tt: ttLoose,
    });

  const displayedHallSections = useMemo<HallSection[]>(() => {
    return hallSectionsWithDragPreview
      .map((section) => {
        const nextItems = section.items;
        if (!nextItems.length) {
          return null;
        }
        return {
          ...section,
          items: nextItems,
          ...resolveHallSectionStats(nextItems),
        };
      })
      .filter((section): section is HallSection => Boolean(section));
  }, [hallSectionsWithDragPreview]);

  const importedHallSections = useMemo<HallSection[]>(
    () =>
      displayedHallSections
        .map((section) => {
          const items = section.items.filter((item) => {
            if (item.type === "IMPORT") {
              return !item.bridgedReadyPool?.isSystem;
            }
            return !item.pool.isSystem;
          });
          if (!items.length) {
            return null;
          }
          return {
            ...section,
            items,
            ...resolveHallSectionStats(items),
          };
        })
        .filter((section): section is HallSection => Boolean(section)),
    [displayedHallSections],
  );

  const systemHallSections = useMemo<HallSection[]>(
    () =>
      displayedHallSections
        .map((section) => {
          const items = section.items.filter(
            (item) => item.type === "READY" && item.pool.isSystem,
          );
          if (!items.length) {
            return null;
          }
          return {
            ...section,
            items,
            ...resolveHallSectionStats(items),
          };
        })
        .filter((section): section is HallSection => Boolean(section)),
    [displayedHallSections],
  );
  const hasImportedDataUpdates = useMemo(
    () =>
      poolSettingsRows.some((pool) => {
        if (pool.isSystem) {
          return false;
        }
        const sourceId = String(pool.id || "").trim();
        if (!sourceId) {
          return false;
        }
        const monitor = dataSourceSyncMonitorStateById[sourceId] ?? null;
        const hasSyncableChanges =
          Math.max(0, Number(monitor?.estimatedChangedFiles) || 0) > 0 ||
          (monitor?.changedSymbols?.length ?? 0) > 0 ||
          (monitor?.missingSymbolsRetained?.length ?? 0) > 0;
        return (
          (monitor?.status === "DIRTY" ||
            monitor?.status === "NEEDS_CONFIRMATION") &&
          hasSyncableChanges
        );
      }),
    [dataSourceSyncMonitorStateById, poolSettingsRows],
  );

  const detailPoolResolvedStatus = useMemo(
    () =>
      detailPool
        ? resolveSummaryFilterForItem({
            id: detailPool.id,
            type: "READY",
            pool: detailPool,
            compactTitle: detailPool.name,
          })
        : null,
    [detailPool, resolveSummaryFilterForItem],
  );

  const detailWindowPayload =
    useMemo<DataConfigDetailWindowPayload | null>(() => {
      if (!detailPool) {
        return null;
      }
      const detailPoolTimeRangeLabel = resolveTimeSpanText(
        detailPool.timeStartTs,
        detailPool.timeEndTs,
        tt("appText.unknownTimeRange"),
        (startLabel, endLabel) =>
          ttf("appText.value0Value13", [startLabel, endLabel]),
      );
      const detailPoolPreparingProgress =
        preparingLocalDataSourceSyncPreview?.sourceId === detailPool.id
          ? preparingLocalDataSourceSyncPreview.operationProgress
          : null;
      const detailPoolOperationProgress =
        detailPoolPreparingProgress ??
        (detailPoolResolvedStatus
          ? resolveSummaryOperationProgress(detailPoolResolvedStatus)
          : null);
      return {
        title: detailPool.name || ui.dataConfigTitle,
        statusLabel:
          detailPoolResolvedStatus?.statusLabel || dataConfigCopy.viewDetails,
        statusTone: detailPoolResolvedStatus?.statusTone || "muted",
        operationProgress: detailPoolOperationProgress,
        operationErrorText: detailOperationErrorText,
        resetKey: detailWindowResetKey,
        errorFallbackMessage: tt("appText.loading"),
        activeTab: detailWindowTab,
        tabs: [
          { id: "OVERVIEW", label: dataConfigCopy.tabOverview },
          { id: "SYMBOLS", label: dataConfigCopy.tabSymbols },
          { id: "DIAGNOSTICS", label: dataConfigCopy.tabDiagnostics },
        ],
        closeLabel: dataConfigCopy.close,
        primaryActionLabel: !detailPool.isSystem
          ? detailPool.requiresSourceFolderRebind
            ? portableCopy.rebindActionLabel
            : tt("appText.syncData")
          : undefined,
        primaryActionDisabled:
          isSourceOperationBlocked(detailPool.id) ||
          Boolean(detailPool.sourceLocked),
        pool: {
          id: detailPool.id,
          name: detailPool.name,
          isSystem: detailPool.isSystem,
          sourceLocked: detailPool.sourceLocked,
          sourceFolder: detailPool.sourceFolder,
          timeZone: detailPool.timeZone,
          tradingCalendar: detailPool.tradingCalendar,
          importScopeLabel: formatSyncScopeLabel(
            detailPool.importScopeStrategy,
            detailPool.importScopeTopLevelSubfolder,
          ),
          baseTimeframe: detailPool.baseTimeframe,
          baseTimeframeLabel:
            baseTimeframeLabels[detailPool.baseTimeframe] ??
            detailPool.baseTimeframe,
          symbolCountLabel: formatMoney(detailPool.symbolCount, 0),
          barCountLabel: formatMoney(detailPool.barCount, 0),
          timeRangeLabel: detailPoolTimeRangeLabel,
          lastSyncLabel: formatLocalizedDateTime(detailPool.lastSyncedAt),
          syncStatusHint: detailPoolResolvedStatus?.statusHint || "",
          lastCheckedLabel: detailPoolResolvedStatus?.lastCheckedLabel || "",
        },
        syncPreferenceMode:
          dataSourceSyncPrefsById[detailPool.id]?.mode ?? null,
        canEditSyncPreference: !detailPool.isSystem && !detailPool.sourceLocked,
        isOperationBlocked: isSourceOperationBlocked(detailPool.id),
        labels: {
          sourceFolder: dataConfigCopy.sourceFolder,
          timeZone: tt("appText.timeZone"),
          tradingCalendar: tt("appText.tradingCalendar"),
          defaultTradingDays: tt("appText.defaultTradingDays"),
          dailyTradingSessions: tt("appText.dailyTradingSessions"),
          tradingSessionStart: tt("appText.tradingSessionStart"),
          tradingSessionEnd: tt("appText.tradingSessionEnd"),
          tradingCalendarSavedHint: tt("appText.tradingCalendarSavedHint"),
          tradingCalendarTimeframeAlignmentInvalid: tt(
            "appText.tradingCalendarTimeframeAlignmentInvalid",
          ),
          addTradingSession: tt("appText.addTradingSession"),
          save: tt("appText.save"),
          reset: tt("appText.reset"),
          delete: tt("appText.delete2"),
          crossesMidnight: tt("appText.crossesMidnight"),
          weekdayMon: tt("appText.weekdayMon"),
          weekdayTue: tt("appText.weekdayTue"),
          weekdayWed: tt("appText.weekdayWed"),
          weekdayThu: tt("appText.weekdayThu"),
          weekdayFri: tt("appText.weekdayFri"),
          weekdaySat: tt("appText.weekdaySat"),
          weekdaySun: tt("appText.weekdaySun"),
          importScope: dataConfigCopy.importScope,
          period: tt("appText.period"),
          symbolCount: dataConfigCopy.symbolCount,
          lastSync: tt("appText.lastSync"),
          checkAllChanges: dataConfigCopy.checkAllChanges,
          autoSync: dataConfigCopy.autoSync,
          promptAfterCheck: dataConfigCopy.promptAfterCheck,
          syncStatus: dataConfigCopy.syncStatus,
          lastCheck: dataConfigCopy.lastCheck,
          searchSymbolCode: tt("appText.searchSymbolCode"),
          symbolCode: tt("appText.symbolCode"),
          lineCount: tt("appText.lineCount"),
          timeRange: tt("appText.timeRange"),
          health: tt("appText.health"),
          symbolsAvailable: tt("appText.symbolsAvailable"),
          batchRemove: tt("appText.batchRemove"),
          selectedCount: ttf("appText.value0Selected2", [
            formatMoney(checkedSymbols.length, 0),
          ]),
          systemProcessingWait: tt("appText.systemProcessingWait"),
          loading: tt("appText.loading"),
          barsAvailableSymbol: ttLoose("appText.barsAvailableSymbol"),
          alerts: diagnosticPanelTitle,
          diagnosticCategoryTimeIntegrity: ttLoose(
            "appText.diagnosticCategoryTimeIntegrity",
          ),
          diagnosticCategoryExtremeAnomaly: ttLoose(
            "appText.diagnosticCategoryExtremeAnomaly",
          ),
          diagnosticStatusBuilding: ttLoose("appText.diagnosticStatusBuilding"),
          diagnosticStatusFailed: ttLoose("appText.diagnosticStatusFailed"),
          totalIssues: tt("appText.totalIssues"),
          affectedSymbols: tt("appText.affectedSymbols"),
          scannedSymbols: tt("appText.scannedSymbols"),
          sourceDiagnostics: ttLoose("appText.sourceDiagnostics"),
          marketPreview: ttLoose("appText.diagnosticMarketPreview"),
          marketPreviewNoData: ttLoose(
            "appText.diagnosticMarketPreviewNoData",
          ),
          diagnosticsUnavailable: tt("appText.diagnosticsUnavailable"),
          startTrainingSymbol: ttLoose("appText.startTrainingSymbol"),
          removeSymbol: tt("appText.removeSymbol"),
        },
        symbols: {
          keyword: detailSymbolKeyword,
          rows: detailRows.map((row) => {
            const diagnosticSummary = sourceDiagnosticSummaryBySymbol.get(
              row.symbol,
            );
            const issueCount = Math.max(
              0,
              Number(diagnosticSummary?.issueCount || 0),
            );
            return {
              ...row,
              barCountLabel: formatMoney(row.barCount, 0),
              healthLabel: sourceDiagnosticsLoadFailed
                ? "--"
                : isLoadingSourceDiagnostics
                  ? tt("appText.loading")
                  : !sourceDiagnosticsLoadedForDetail
                    ? "--"
                  : sourceDiagnostics.status === "BUILDING"
                    ? tt("appText.loading")
                  : issueCount > 0
                    ? ttf("appText.sourceIssuesValue0", [
                        formatMoney(issueCount, 0),
                      ])
                    : ttLoose("appText.goodDataQuality"),
              healthTone: sourceDiagnosticsLoadFailed
                ? "muted"
                : !sourceDiagnosticsLoadedForDetail
                  ? "muted"
                : sourceDiagnostics.status === "BUILDING"
                  ? "muted"
                : issueCount > 0
                  ? "warning"
                  : "safe",
            };
          }),
          activeSymbol,
          checkedSymbols,
          isAllChecked: isAllDetailRowsChecked,
          isSystemPool: isDetailPoolSystem,
        },
        sourceDiagnostics: {
          activeFilterKind: activeSourceDiagnosticKind,
          focusedDetailItemId,
          activeBarCount: activeDetailBarCount,
          activeBarCountLabel: withLabelValue(
            tt("appText.lineCount"),
            formatMoney(activeDetailBarCount, 0),
          ),
          isLoadingSymbolBars,
          isLoadingSourceDiagnostics,
          sourceDiagnosticsLoadFailed,
          activeSymbolBarsLoadFailed,
          shouldRenderMiniHistoryChart,
          project: activeSymbolHistoryProject,
          miniHistoryChartKey,
          displayPeriod: miniHistoryChartDisplayPeriod,
          trainerPeriodOptionsByBase,
          initialDisplayPeriod: miniChartBasePeriod,
          showVolumePane: Boolean(activeSymbolShowVolumePane),
          focusedDetailBarIndex,
          focusRequestNonce: focusDetailRequestNonce,
          focusedDetailMarker,
          totalIssueCountLabel: formatMoney(sourceDiagnostics.totalIssues, 0),
          healthScoreLabel: formatMoney(sourceDiagnostics.health.score, 0),
          statusLabel:
            sourceDiagnostics.status === "BUILDING"
              ? ttLoose("appText.diagnosticStatusBuilding")
              : sourceDiagnostics.status === "FAILED"
                ? ttLoose("appText.diagnosticStatusFailed")
                : ttLoose("appText.done"),
          affectedSymbolCountLabel: formatMoney(
            sourceDiagnostics.affectedSymbols,
            0,
          ),
          scannedSymbolCountLabel: formatMoney(
            sourceDiagnostics.scannedSymbols,
            0,
          ),
          timeIntegrityCountLabel: formatMoney(sourceTimeIntegrityCount, 0),
          timeIntegrityCount: sourceTimeIntegrityCount,
          extremeAnomalyCountLabel: formatMoney(sourceExtremeAnomalyCount, 0),
          extremeAnomalyCount: sourceExtremeAnomalyCount,
          filterOptions: sourceDiagnosticFilterOptions,
          detailCountLabel: ttf("appText.value0Value12", [
            activeDiagnosticDetailTitle,
            formatMoney(activeDiagnosticDetailCount, 0),
          ]),
          detailHint: activeDiagnosticDetailHint,
          emptyText: activeDiagnosticDetailEmptyText,
          items: activeDiagnosticDetailItems,
        },
      };
    }, [
      activeDetailBarCount,
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
      checkedSymbols,
      dataConfigCopy,
      dataSourceSyncPrefsById,
      detailOperationErrorText,
      detailWindowResetKey,
      detailWindowTab,
      detailPool,
      detailPoolResolvedStatus,
      detailRows,
      detailSymbolKeyword,
      diagnosticPanelTitle,
      focusedDetailBarIndex,
      focusedDetailItemId,
      focusedDetailMarker,
      focusDetailRequestNonce,
      formatMoney,
      isAllDetailRowsChecked,
      isDetailPoolSystem,
      isLoadingSymbolBars,
      isLoadingSourceDiagnostics,
      isSourceOperationBlocked,
      miniChartBasePeriod,
      miniHistoryChartDisplayPeriod,
      miniHistoryChartKey,
      preparingLocalDataSourceSyncPreview,
      portableCopy.rebindActionLabel,
      shouldRenderMiniHistoryChart,
      sourceDiagnosticSummaryBySymbol,
      sourceDiagnosticFilterOptions,
      sourceDiagnostics,
      sourceDiagnosticsLoadedForDetail,
      sourceDiagnosticsLoadFailed,
      sourceExtremeAnomalyCount,
      sourceTimeIntegrityCount,
      trainerPeriodOptionsByBase,
      tt,
      ttLoose,
      ttf,
      ui.dataConfigTitle,
      withLabelValue,
    ]);

  const handleDetailWindowAction = useCallback(
    (action: DataConfigDetailWindowAction) => {
      if (!detailPool) {
        return;
      }
      const formatDetailOperationError = (error: unknown): string => {
        console.error("[data-management] detail operation failed", error);
        return ttf("appText.operationFailedValue0", [tt("appText.request")]);
      };
      switch (action.action) {
        case "CLOSE":
          setDetailPoolId("");
          setDetailOperationErrorText("");
          return;
        case "SET_TAB":
          setDetailOperationErrorText("");
          setDetailWindowTab(action.payload.tabId);
          return;
        case "PRIMARY_ACTION":
          if (!detailPool.isSystem) {
            const removedSymbolCount = Math.max(
              0,
              Number(removedSymbolsByPool[detailPool.id]?.length || 0),
            );
            void syncSamplePoolWithSourceFolder(detailPool.id, {
              hasLocalSymbolRemoval: removedSymbolCount > 0,
              removedSymbolCount,
              poolName: detailPool.name,
              sourceFolderUsageMode: "BOUND_SOURCE",
            });
          }
          return;
        case "CHECK_ALL_CHANGES":
          void runDataSourceSyncQuickCheckSweep({
            force: true,
            trigger: "USER",
          });
          return;
        case "SET_SYNC_PREFERENCE":
          updateDataSourceSyncPreference(detailPool.id, action.payload.mode);
          if (action.payload.mode === "MANUAL") {
            void runDataSourceSyncQuickCheckSweep({
              force: true,
              trigger: "USER",
            });
          }
          return;
        case "SAVE_TRADING_CALENDAR":
          if (detailPool.isSystem || isSourceOperationBlocked(detailPool.id)) {
            return;
          }
          setDetailOperationErrorText("");
          setSavingTradingCalendarSourceId(detailPool.id);
          void api
            .updateLocalDataSourceTradingCalendar(
              detailPool.id,
              action.payload.tradingCalendar,
            )
            .then(async () => {
              await refreshLocalDataSources();
              setSourceDiagnostics(createEmptySourceDiagnostics(detailPool.id, detailPool.baseTimeframe));
              setActiveSourceDiagnosticKind("ALL");
              setFocusedDetailItemId("");
              setFocusedDetailBarIndex(null);
              setFocusedDetailMarker(null);
              setDetailOperationErrorText("");
            })
            .catch((error) => {
              setDetailOperationErrorText(formatDetailOperationError(error));
            })
            .finally(() => {
              setSavingTradingCalendarSourceId("");
            });
          return;
        case "SET_SYMBOL_KEYWORD":
          setDetailSymbolKeyword(action.payload.value);
          return;
        case "SET_ACTIVE_SYMBOL":
          if (detailRows.some((row) => row.symbol === action.payload.symbol && row.locked)) {
            return;
          }
          setActiveSymbol(action.payload.symbol);
          setFocusedDetailItemId("");
          setFocusedDetailBarIndex(null);
          setFocusedDetailMarker(null);
          return;
        case "SET_ALL_SYMBOLS_CHECKED":
          setCheckedSymbols(
            action.payload.checked
              ? detailRows.filter((row) => !row.locked).map((row) => row.symbol)
              : [],
          );
          return;
        case "SET_SYMBOL_CHECKED":
          setCheckedSymbols((current: string[]) => {
            if (action.payload.checked) {
              return current.includes(action.payload.symbol)
                ? current
                : [...current, action.payload.symbol];
            }
            return current.filter((symbol: string) => symbol !== action.payload.symbol);
          });
          return;
        case "REMOVE_CHECKED_SYMBOLS":
          void removeSymbolsFromDetail(checkedSymbols);
          return;
        case "SET_DIAGNOSTIC_KIND":
          setActiveSourceDiagnosticKind(action.payload.kind);
          return;
        case "JUMP_TO_DIAGNOSTIC_ITEM": {
          const item =
            activeDiagnosticDetailItems.find(
              (detailItem) => detailItem.id === action.payload.id,
            ) ?? null;
          if (item) {
            if (item.symbol) {
              setActiveSymbol(item.symbol);
            }
            jumpToDiagnosticDetailBar(item);
          }
          return;
        }
        case "START_TRAINING_SYMBOL":
          if (activeSymbol && !activeDetailSymbolRow?.locked) {
            void startTrainingWithSymbol(activeSymbol, detailPool.id);
          }
          return;
        case "REMOVE_ACTIVE_SYMBOL":
          if (activeSymbol) {
            void removeSymbolsFromDetail([activeSymbol]);
          }
          return;
      }
    },
    [
      activeDiagnosticDetailItems,
      activeDetailSymbolRow,
      activeSymbol,
      checkedSymbols,
      detailPool,
      detailRows,
      isSourceOperationBlocked,
      jumpToDiagnosticDetailBar,
      refreshLocalDataSources,
      removeSymbolsFromDetail,
      removedSymbolsByPool,
      runDataSourceSyncQuickCheckSweep,
      startTrainingWithSymbol,
      syncSamplePoolWithSourceFolder,
      tt,
      ttf,
      updateDataSourceSyncPreference,
    ],
  );

  useEffect(() => {
    if (!detailWindowPayload) {
      detailWindowRevisionRef.current = 0;
      return;
    }
    void api
      .publishDesktopSecondaryWindowState({
        kind: "DATA_CONFIG_DETAIL",
        title: detailWindowPayload.title,
        payload: detailWindowPayload,
      })
      .then((state) => {
        detailWindowRevisionRef.current = state.revision;
      })
      .catch(() => {
        detailWindowRevisionRef.current = 0;
        setDetailPoolId("");
      });
  }, [detailWindowPayload]);

  useEffect(() => {
    const unsubscribe = api.subscribeDesktopSecondaryWindowActions((action) => {
      if (action.kind !== "DATA_CONFIG_DETAIL") {
        return;
      }
      if (
        !api.isCurrentDesktopSecondaryWindowAction(
          action,
          detailWindowRevisionRef.current,
        )
      ) {
        return;
      }
      if (action.action === "WINDOW_CLOSED") {
        detailWindowRevisionRef.current = 0;
        setDetailPoolId("");
        return;
      }
      handleDetailWindowAction(action as DataConfigDetailWindowAction);
    });
    return unsubscribe;
  }, [handleDetailWindowAction]);

  const cardLayoutSignature = useMemo(
    () =>
      displayedHallSections
        .map(
          (section) =>
            `${section.id}:${section.items.map((item) => item.id).join(",")}`,
        )
        .join("||"),
    [displayedHallSections],
  );

  useLayoutEffect(() => {
    const nextCardRectMap = new Map<string, DOMRect>();
    cardElementMapRef.current.forEach((element: HTMLElement, cardKey: string) => {
      nextCardRectMap.set(cardKey, element.getBoundingClientRect());
    });
    if (previousCardRectMapRef.current.size > 0) {
      previousCardRectMapRef.current.forEach((previousRect: DOMRect, cardKey: string) => {
        const element = cardElementMapRef.current.get(cardKey);
        const nextRect = nextCardRectMap.get(cardKey);
        if (!element || !nextRect) {
          return;
        }
        if (element.classList.contains("is-dragging")) {
          return;
        }
        const deltaX = previousRect.left - nextRect.left;
        const deltaY = previousRect.top - nextRect.top;
        if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
          return;
        }
        const currentAnimations = element.getAnimations();
        if (currentAnimations.length) {
          currentAnimations.forEach((animation: Animation) => animation.cancel());
        }
        element.animate(
          [
            {
              transform: `translate(${deltaX.toFixed(2)}px, ${deltaY.toFixed(2)}px)`,
            },
            { transform: "translate(0px, 0px)" },
          ],
          resolveLayoutMotionAnimationOptions(element),
        );
      });
    }
    previousCardRectMapRef.current = nextCardRectMap;
  }, [cardLayoutSignature]);

  const bindCardElementRef = useCallback(
    (cardId: string, node: HTMLElement | null) => {
      const normalizedCardId = String(cardId || "").trim();
      if (!normalizedCardId) {
        return;
      }
      if (!node) {
        cardElementMapRef.current.delete(normalizedCardId);
        previousCardRectMapRef.current.delete(normalizedCardId);
        return;
      }
      cardElementMapRef.current.set(normalizedCardId, node);
    },
    [],
  );

  const getCardElementRef = useCallback(
    (cardId: string) => {
      const normalizedCardId = String(cardId || "").trim();
      if (!normalizedCardId) {
        return undefined;
      }
      const cached = cardElementRefCallbackMapRef.current.get(normalizedCardId);
      if (cached) {
        return cached;
      }
      const nextRef = (node: HTMLElement | null) => {
        bindCardElementRef(normalizedCardId, node);
      };
      cardElementRefCallbackMapRef.current.set(normalizedCardId, nextRef);
      return nextRef;
    },
    [bindCardElementRef],
  );

  useEffect(() => {
    const activeCardIds = new Set(
      displayedHallSections.flatMap((section) =>
        section.items.map((item) => item.id),
      ),
    );
    cardElementRefCallbackMapRef.current.forEach((_: unknown, cardId: string) => {
      if (!activeCardIds.has(cardId)) {
        cardElementRefCallbackMapRef.current.delete(cardId);
      }
    });
  }, [displayedHallSections]);

  const { renderImportPoolCard, renderReadyPoolCard } =
    createDataConfigPoolCardRenderers({
      getCardElementRef,
      model,
      resolveSummaryFilterForItem,
    });

  return (
    <DataConfigHallContent
      hasImportedDataUpdates={hasImportedDataUpdates}
      importedHallSections={importedHallSections}
      model={model}
      onDropZoneDragEnter={onDropZoneDragEnter}
      onDropZoneDragLeave={onDropZoneDragLeave}
      onDropZoneDragOver={onDropZoneDragOver}
      onDropZoneDrop={onDropZoneDrop}
      renderImportPoolCard={renderImportPoolCard}
      renderReadyPoolCard={renderReadyPoolCard}
      startLocalDataImportEntry={() => startLocalDataImportEntry()}
      systemHallSections={systemHallSections}
    />
  );

};
