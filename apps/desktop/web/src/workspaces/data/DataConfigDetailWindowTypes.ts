// SPDX-License-Identifier: GPL-3.0-only

import type { ApiTradingCalendarConfig } from "@/api";
import type { BaseTimeframe } from "@/domains/chart/chartPeriods";
import type { PriceColorMode } from "@/domains/chart/display";
import type {
  HistoryReplayChartBindings,
  HistoryReplayChartViewProps,
} from "@/domains/chart/HistoryReplayChart";
import type {
  DataSourceSyncMode,
  DataTaskOperationProgress,
} from "@/domains/data-import/dataSourceTypes";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import type {
  DetailFocusMarker,
  DetailSymbolRow,
  DiagnosticDetailItem,
  SourceDiagnosticFilterKind,
} from "@/workspaces/data/dataConfig/model";

export type DataConfigDetailWindowTabId =
  "OVERVIEW" | "SYMBOLS" | "DIAGNOSTICS";

type DataConfigDetailWindowTab = {
  id: DataConfigDetailWindowTabId;
  label: string;
};

type DataConfigDetailWindowSymbolRow = DetailSymbolRow & {
  barCountLabel: string;
  healthLabel: string;
  healthTone: "safe" | "warning" | "muted";
};

export type DataConfigDetailWindowPayload = {
  title: string;
  statusLabel: string;
  statusTone: "ready" | "warning" | "danger" | "muted" | "checking" | "pending";
  operationProgress: DataTaskOperationProgress | null;
  operationErrorText: string;
  resetKey: string;
  errorFallbackMessage: string;
  activeTab: DataConfigDetailWindowTabId;
  tabs: DataConfigDetailWindowTab[];
  closeLabel: string;
  primaryActionLabel?: string;
  primaryActionDisabled?: boolean;
  pool: {
    id: string;
    name: string;
    isSystem: boolean;
    sourceLocked: boolean;
    sourceFolder: string;
    timeZone: string;
    tradingCalendar: ApiTradingCalendarConfig;
    importScopeLabel: string;
    baseTimeframe: BaseTimeframe;
    baseTimeframeLabel: string;
    symbolCountLabel: string;
    barCountLabel: string;
    timeRangeLabel: string;
    lastSyncLabel: string;
    syncStatusHint: string;
    lastCheckedLabel: string;
  };
  syncPreferenceMode: DataSourceSyncMode | null;
  canEditSyncPreference: boolean;
  isOperationBlocked: boolean;
  labels: {
    sourceFolder: string;
    timeZone: string;
    tradingCalendar: string;
    defaultTradingDays: string;
    dailyTradingSessions: string;
    tradingSessionStart: string;
    tradingSessionEnd: string;
    tradingCalendarSavedHint: string;
    tradingCalendarTimeframeAlignmentInvalid: string;
    addTradingSession: string;
    save: string;
    reset: string;
    delete: string;
    crossesMidnight: string;
    weekdayMon: string;
    weekdayTue: string;
    weekdayWed: string;
    weekdayThu: string;
    weekdayFri: string;
    weekdaySat: string;
    weekdaySun: string;
    importScope: string;
    period: string;
    symbolCount: string;
    lastSync: string;
    checkAllChanges: string;
    autoSync: string;
    promptAfterCheck: string;
    syncStatus: string;
    lastCheck: string;
    searchSymbolCode: string;
    symbolCode: string;
    lineCount: string;
    timeRange: string;
    health: string;
    symbolsAvailable: string;
    batchRemove: string;
    selectedCount: string;
    systemProcessingWait: string;
    loading: string;
    barsAvailableSymbol: string;
    alerts: string;
    diagnosticCategoryTimeIntegrity: string;
    diagnosticCategoryExtremeAnomaly: string;
    diagnosticStatusBuilding: string;
    diagnosticStatusFailed: string;
    totalIssues: string;
    affectedSymbols: string;
    scannedSymbols: string;
    sourceDiagnostics: string;
    marketPreview: string;
    marketPreviewNoData: string;
    diagnosticsUnavailable: string;
    startTrainingSymbol: string;
    removeSymbol: string;
  };
  symbols: {
    keyword: string;
    rows: DataConfigDetailWindowSymbolRow[];
    activeSymbol: string;
    checkedSymbols: string[];
    isAllChecked: boolean;
    isSystemPool: boolean;
  };
  sourceDiagnostics: {
    activeFilterKind: SourceDiagnosticFilterKind;
    focusedDetailItemId: string;
    activeBarCount: number;
    activeBarCountLabel: string;
    isLoadingSymbolBars: boolean;
    isLoadingSourceDiagnostics: boolean;
    sourceDiagnosticsLoadFailed: boolean;
    activeSymbolBarsLoadFailed: boolean;
    shouldRenderMiniHistoryChart: boolean;
    project: HistoryReplayChartViewProps["project"];
    miniHistoryChartKey: string;
    displayPeriod: NonNullable<HistoryReplayChartViewProps["displayPeriod"]>;
    trainerPeriodOptionsByBase: HistoryReplayChartViewProps["trainerPeriodOptionsByBase"];
    initialDisplayPeriod: BaseTimeframe;
    showVolumePane: boolean;
    focusedDetailBarIndex: number | null;
    focusRequestNonce: number;
    focusedDetailMarker: DetailFocusMarker | null;
    totalIssueCountLabel: string;
    healthScoreLabel: string;
    statusLabel: string;
    affectedSymbolCountLabel: string;
    scannedSymbolCountLabel: string;
    timeIntegrityCountLabel: string;
    timeIntegrityCount: number;
    extremeAnomalyCountLabel: string;
    extremeAnomalyCount: number;
    filterOptions: Array<{
      kind: SourceDiagnosticFilterKind;
      label: string;
    }>;
    detailCountLabel: string;
    detailHint: string;
    emptyText: string;
    items: DiagnosticDetailItem[];
  };
};

export type DataConfigDetailWindowAction =
  | { action: "CLOSE" }
  | { action: "SET_TAB"; payload: { tabId: DataConfigDetailWindowTabId } }
  | { action: "PRIMARY_ACTION" }
  | { action: "CHECK_ALL_CHANGES" }
  | { action: "SET_SYNC_PREFERENCE"; payload: { mode: DataSourceSyncMode } }
  | {
      action: "SAVE_TRADING_CALENDAR";
      payload: { tradingCalendar: ApiTradingCalendarConfig };
    }
  | { action: "SET_SYMBOL_KEYWORD"; payload: { value: string } }
  | { action: "SET_ACTIVE_SYMBOL"; payload: { symbol: string } }
  | { action: "SET_ALL_SYMBOLS_CHECKED"; payload: { checked: boolean } }
  | {
      action: "SET_SYMBOL_CHECKED";
      payload: { symbol: string; checked: boolean };
    }
  | { action: "REMOVE_CHECKED_SYMBOLS" }
  | {
      action: "SET_DIAGNOSTIC_KIND";
      payload: { kind: SourceDiagnosticFilterKind };
    }
  | { action: "JUMP_TO_DIAGNOSTIC_ITEM"; payload: { id: string } }
  | { action: "START_TRAINING_SYMBOL" }
  | { action: "REMOVE_ACTIVE_SYMBOL" };

export type DataConfigDetailWindowPanelProps = {
  payload: DataConfigDetailWindowPayload;
  language: AppUiLanguage;
  themeMode: "light" | "dark";
  showGlobalDecimals?: boolean;
  priceColorMode: PriceColorMode;
  tradeColorTheme?: HistoryReplayChartViewProps["tradeColorTheme"];
  onAction: (action: DataConfigDetailWindowAction) => void;
  historyReplayChartBindings?: HistoryReplayChartBindings;
};
