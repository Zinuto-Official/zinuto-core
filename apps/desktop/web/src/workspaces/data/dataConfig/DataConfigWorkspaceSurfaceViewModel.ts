// SPDX-License-Identifier: GPL-3.0-only

import type {
  Dispatch,
  FocusEventHandler,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  SetStateAction,
} from "react";
import type {
  DataSourceSyncMode,
  DataSourceSyncMonitorStateById,
  DataSourceSyncPrefsById,
  DataTaskOperationProgress,
  PreparingLocalDataSourceSyncPreview,
} from "@/domains/data-import/dataSourceTypes";
import type { HistoryReplayChartViewProps } from "@/domains/chart/HistoryReplayChart";
import type { BaseTimeframe } from "@/domains/chart/chartPeriods";
import type {
  AppUiLanguage,
  getPortableDataTransferCopy,
} from "@/ui/config/uiConfig";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import type { DataConfigDetailWindowTabId } from "@/workspaces/data/DataConfigDetailDrawer";
import type {
  CsvImportCardView,
  DetailFocusMarker,
  DetailSymbolRow,
  DiagnosticDetailItem,
  HallSectionItem,
  PoolSettingsRow,
  SourceDiagnosticFilterKind,
  SourceDiagnostics,
} from "@/workspaces/data/dataConfig/model";
import type {
  readDataSourceStatusFactsFromReadModel,
} from "@/workspaces/data/dataConfig/dataConfigWorkspaceReadModelUi";

type DataConfigCopy = {
  close: string;
  checkAllChanges: string;
  viewDetails: string;
  importTask: string;
  retry: string;
  lastChecked: (value: string) => string;
  readOnly: string;
  readOnlyHint: string;
  errorFailed: string;
  lightweightCheckFailed: string;
  changesDetected: string;
  confirmationRequired: string;
  previewBeforeSync: string;
  sync: string;
  estimatedChangedFiles: (value: string) => string;
  confirmationNeeded: string;
  autoSyncArmed: string;
  sourceFolderChanged: string;
  rebindRequired: string;
  rebindRequiredHint: string;
  rebindActionLabel: string;
  pendingChanges: string;
  checking: string;
  checkingHint: string;
  autoSyncEnabled: string;
  promptOnlyHint: string;
  syncedAuto: string;
  syncedAutoHint: string;
  noChangesHint: string;
  manualCheckHint: string;
  manualMode: string;
  syncing: string;
  syncingHint: string;
  errorsFailedHint: string;
  importHeroTitle: string;
  importHeroDropTitle: string;
  importHeroBrowseAction: string;
  importHeroScanningHint: string;
  localImportEmptySupportedFormats: string;
  localImportEmptyRequiredFields: string;
  localImportEmptySourceQualityCheck: string;
  localImportEmptyTimeframeSupport: string;
  importedDataTitle: string;
  importedDataUpdateNotice: string;
  importedDataEmptyTitle: string;
  systemSamplesTitle: string;
  tabOverview: string;
  tabSymbols: string;
  tabDiagnostics: string;
  sourceFolder: string;
  importScope: string;
  autoSync: string;
  promptAfterCheck: string;
  syncStatus: string;
  lastCheck: string;
  files: string;
  phase: string;
  compaction: string;
  symbolCount: string;
  symbols: string;
  timeRange: string;
  storageUsed: string;
  removedSymbolsNote: (value: string) => string;
};

type ClearLocalPoolsActionKey = "" | "clear-local-pools";
type LocalImportEntryMode = "GENERAL" | "FULL_REIMPORT";
type LocalImportScopeStrategy = "FLAT" | "WITH_PARENT" | null;

export type DataConfigWorkspaceSurfaceViewModel = {
  activeDetailBarCount: number;
  activeDetailSymbolRow: DetailSymbolRow | null;
  activeDiagnosticDetailCount: number;
  activeDiagnosticDetailEmptyText: string;
  activeDiagnosticDetailHint: string;
  activeDiagnosticDetailItems: DiagnosticDetailItem[];
  activeDiagnosticDetailTitle: string;
  activeSourceDiagnosticKind: SourceDiagnosticFilterKind;
  activeSymbol: string;
  activeSymbolBarsLoadFailed: boolean;
  activeSymbolHistoryProject: HistoryReplayChartViewProps["project"];
  activeSymbolShowVolumePane: boolean;
  baseTimeframeLabels: Record<BaseTimeframe, string>;
  beginCardReorder: (
    event: ReactPointerEvent<HTMLElement>,
    poolId: string,
    baseTimeframe: BaseTimeframe,
  ) => void;
  buildBlurClearHandler: (
    key: Exclude<ClearLocalPoolsActionKey, "">,
  ) => FocusEventHandler<HTMLElement>;
  cancelRenameSamplePool: () => void;
  cardElementMapRef: MutableRefObject<Map<string, HTMLElement>>;
  cardElementRefCallbackMapRef: MutableRefObject<
    Map<string, (node: HTMLElement | null) => void>
  >;
  checkedSymbols: string[];
  clearArmedAction: () => void;
  clearLocalPoolsActionKey: Exclude<ClearLocalPoolsActionKey, "">;
  clearLocalPoolsArmed: boolean;
  controlCsvImportCardJob: (
    cardId: string,
    action: "PAUSE" | "RESUME" | "CANCEL",
  ) => Promise<void>;
  csvImportCardControlAction: string | null;
  csvImportCardViews: CsvImportCardView[];
  customSamplePoolsCount: number;
  dataConfigCopy: DataConfigCopy;
  dataSourceSyncMonitorStateById: DataSourceSyncMonitorStateById;
  dataSourceSyncPrefsById: DataSourceSyncPrefsById;
  deletingSamplePoolId: string;
  detailOperationErrorText: string;
  detailPool: PoolSettingsRow | null;
  detailRows: DetailSymbolRow[];
  detailSymbolKeyword: string;
  detailWindowResetKey: string;
  detailWindowRevisionRef: MutableRefObject<number>;
  detailWindowTab: DataConfigDetailWindowTabId;
  diagnosticPanelTitle: string;
  dragOverPoolId: string;
  draggingPoolId: string;
  editingSamplePoolId: string;
  editingSamplePoolName: string;
  effectiveThemeMode: "light" | "dark";
  focusDetailRequestNonce: number;
  focusedDetailBarIndex: number | null;
  focusedDetailItemId: string;
  focusedDetailMarker: DetailFocusMarker | null;
  formatLocalizedDateTime: (value: string | null) => string;
  formatMoney: (value: number, digits?: number) => string;
  formatPercentDisplay: (value: number, digits?: number) => string;
  formatStorageBytes: (value: number) => string;
  formatSyncScopeLabel: (
    strategy: LocalImportScopeStrategy,
    topLevelSubfolder: string,
  ) => string;
  hasClearablePools: boolean;
  isAllDetailRowsChecked: boolean;
  isCardReorderBlocked: boolean;
  isClearingLocalDataSources: boolean;
  isDestructiveOperationBlocked: boolean;
  isDetailPoolSystem: boolean;
  isDropZoneActive: boolean;
  isGlobalOperationBlocked: boolean;
  isImportEntryBlocked: boolean;
  isItemOperationBlocked: (item: HallSectionItem) => boolean;
  isLoadingSourceDiagnostics: boolean;
  isLoadingSymbolBars: boolean;
  isNativeImportDragActive: boolean;
  isPreparingCsvImportPreview: boolean;
  isSourceOperationBlocked: (sourceId: string) => boolean;
  joinWithMiddleDot: (parts: ReadonlyArray<string>) => string;
  jumpToDiagnosticDetailBar: (detailItem: DiagnosticDetailItem) => void;
  language: AppUiLanguage;
  marketDataStorageBytes: number | null;
  miniChartBasePeriod: BaseTimeframe;
  miniHistoryChartDisplayPeriod: BaseTimeframe;
  miniHistoryChartKey: string;
  normalizedClearingLocalDataSourcesProgressPercent: number;
  normalizedDeletingProgressPercent: number;
  onClearLocalPools: () => void;
  openCsvFolderPathAndPrepareImport: (
    folderPath: string,
    options?: {
      preferredTargetSourceId?: string;
      importEntryMode?: LocalImportEntryMode;
      sourceFolderBookmarkId?: string;
    },
  ) => void;
  openCsvFolderPickerAndPrepareImport: (options?: {
    preferredTargetSourceId?: string;
    importEntryMode?: LocalImportEntryMode;
  }) => void;
  openDetailPool: (poolId: string) => void;
  openDeviceTransferSettings: () => void;
  poolSettingsById: Map<string, PoolSettingsRow>;
  poolSettingsRows: PoolSettingsRow[];
  portableCopy: ReturnType<typeof getPortableDataTransferCopy>;
  preparingLocalDataSourceSyncPreview: PreparingLocalDataSourceSyncPreview | null;
  previousCardRectMapRef: MutableRefObject<Map<string, DOMRect>>;
  prioritizedRebindPools: PoolSettingsRow[];
  readModelSourceStatusById: ReturnType<typeof readDataSourceStatusFactsFromReadModel>;
  refreshLocalDataSources: () => Promise<unknown>;
  removeCustomPool: (poolId: string) => Promise<void>;
  removeSymbolsFromDetail: (symbols: string[]) => void | Promise<void>;
  removedSymbolsByPool: Record<string, string[]>;
  renderDataTaskProgressRail: (
    progress: DataTaskOperationProgress,
    className?: string,
  ) => ReactNode;
  renderPreparingCsvImportPreviewProgress: () => ReactNode;
  runDataSourceSyncQuickCheckSweep: (options?: {
    force?: boolean;
    trigger?: "USER" | "BACKGROUND";
  }) => void | Promise<void>;
  saveRenameSamplePool: () => void;
  setActiveSourceDiagnosticKind: Dispatch<SetStateAction<SourceDiagnosticFilterKind>>;
  setActiveSymbol: Dispatch<SetStateAction<string>>;
  setArmedKey: Dispatch<SetStateAction<ClearLocalPoolsActionKey>>;
  setCheckedSymbols: Dispatch<SetStateAction<string[]>>;
  setDetailOperationErrorText: Dispatch<SetStateAction<string>>;
  setDetailPoolId: Dispatch<SetStateAction<string>>;
  setDetailSymbolKeyword: Dispatch<SetStateAction<string>>;
  setDetailWindowTab: Dispatch<SetStateAction<DataConfigDetailWindowTabId>>;
  setEditingSamplePoolName: (value: string) => void;
  setFocusedDetailBarIndex: Dispatch<SetStateAction<number | null>>;
  setFocusedDetailItemId: Dispatch<SetStateAction<string>>;
  setFocusedDetailMarker: Dispatch<SetStateAction<DetailFocusMarker | null>>;
  setIsDropZoneActive: Dispatch<SetStateAction<boolean>>;
  setSavingTradingCalendarSourceId: (value: string) => void;
  setSourceDiagnostics: Dispatch<SetStateAction<SourceDiagnostics>>;
  shouldRenderMiniHistoryChart: boolean;
  sourceDiagnosticFilterOptions: Array<{
    kind: SourceDiagnosticFilterKind;
    label: string;
  }>;
  sourceDiagnosticSummaryBySymbol: Map<
    string,
    SourceDiagnostics["symbols"][number]
  >;
  sourceDiagnostics: SourceDiagnostics;
  sourceDiagnosticsLoadedForDetail: boolean;
  sourceDiagnosticsLoadFailed: boolean;
  sourceExtremeAnomalyCount: number;
  sourceTimeIntegrityCount: number;
  startRenameSamplePool: (poolId: string, poolName: string) => void;
  startTrainingWithSymbol: (symbol: string, poolId: string) => Promise<void>;
  suppressNextCardClickRef: MutableRefObject<boolean>;
  syncSamplePoolWithSourceFolder: (
    poolId: string,
    options?: {
      hasLocalSymbolRemoval?: boolean;
      removedSymbolCount?: number;
      poolName?: string;
      sourceFolderUsageMode?: "BOUND_SOURCE" | "ONE_OFF";
    },
  ) => Promise<void>;
  trainerPeriodOptionsByBase: HistoryReplayChartViewProps["trainerPeriodOptionsByBase"];
  tt: (key: AppTextKey) => string;
  ttLoose: (key: string) => string;
  ttf: (key: AppTextKey, values?: Array<unknown>) => string;
  ui: {
    dataConfigTitle: string;
    readCsvFolder: string;
  };
  updateDataSourceSyncPreference: (
    sourceId: string,
    mode: DataSourceSyncMode,
  ) => void;
  withLabelValue: (label: string, value: string) => string;
};
