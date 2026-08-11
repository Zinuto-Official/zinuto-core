// SPDX-License-Identifier: GPL-3.0-only

import type {
  FreeReplayAssetClass,
  FreeReplayPrepConfig,
  FreeReplayStartDisableReason,
} from "@/domains/trainer/freeReplaySetup";
import { buildFreeReplaySetupViewModel } from "@/domains/trainer/buildFreeReplaySetupViewModel";
import type { AppWorkspacePageBundleArgs } from "@/app-shell/useAppWorkspacePageBundleArgs";
import type { SessionTerminationReasonCode } from "@/domains/training/types";
import type { AppIconName } from "@/assets/graphics";
import type { UiLabelEntry } from "@/ui/config/uiLabels";

type TrainerWorkspaceBundleArgs = AppWorkspacePageBundleArgs["trainer"];
type TrainerFreeReplaySetup = TrainerWorkspaceBundleArgs["freeReplaySetup"];
type TrainerFreeReplayModeOption = Omit<
  TrainerFreeReplaySetup["modeOptions"][number],
  "iconName"
>;

type UseAppRootTrainerWorkspaceBundleDeps = {
  layout: TrainerWorkspaceBundleArgs["layout"];
  ui: UiLabelEntry;
  isFreeReplayPrepMode: TrainerFreeReplaySetup["isPrepMode"];
  freeReplayModeOptions: TrainerFreeReplayModeOption[];
  freeReplayPrepConfig: FreeReplayPrepConfig;
  freeReplayAssetOptions: Array<{
    value: string;
    label: string;
    iconName: AppIconName;
    disabled?: boolean;
  }>;
  freeReplayEnvironmentAssetOptions: Array<{
    value: FreeReplayAssetClass;
    label: string;
  }>;
  freeReplayEnvironmentPresetOptions: Array<{
    value: string;
    label: string;
  }>;
  freeReplaySelectedEnvironmentAssetClass: FreeReplayAssetClass;
  freeReplaySelectedEnvironmentPresetId: string;
  freeReplaySelectedEnvironmentPresetLabel: string;
  freeReplayEnvironmentRuleCards: Array<{
    id: string;
    label: string;
    value: string;
  }>;
  freeReplayPersistEnvironmentToPool: boolean;
  freeReplayTimeframeOptions: TrainerFreeReplaySetup["minimumBaseTimeframeOptions"];
  freeReplaySamplePoolOptions: TrainerFreeReplaySetup["samplePoolOptions"];
  freeReplaySelectedPoolId: string;
  freeReplaySymbolOptions: TrainerFreeReplaySetup["symbolOptions"];
  freeReplayAvailableSymbolCount: number;
  freeReplaySelectedInstrumentId: string;
  freeReplaySelectedSymbol: string;
  freeReplayPrepAnchorText: string;
  freeReplayBlindBoxOptions: TrainerFreeReplaySetup["blindBoxOptions"];
  freeReplayBlindBoxValue: TrainerFreeReplaySetup["blindBoxValue"];
  startPointWindowPayload: TrainerFreeReplaySetup["startPointWindowPayload"];
  onApplyStartPoint: TrainerFreeReplaySetup["onApplyStartPoint"];
  freeReplayStartDisabled: boolean;
  freeReplayStartDisableReason: FreeReplayStartDisableReason;
  freeReplayHasAvailableSymbols: boolean;
  freeReplayStartButtonIconName: AppIconName;
  startPreparedFreeReplay: TrainerFreeReplaySetup["onStart"];
  resetTrainerToPrepView: TrainerFreeReplaySetup["onResetToPrepView"];
  canResumeTrainerSession: boolean;
  resumeLatestTrainerSession: () => void;
  handleFreeReplayPrepModeChange: TrainerFreeReplaySetup["onSelectMode"];
  handleFreeReplayPrepEnvironmentAssetClassChange: (
    value: FreeReplayAssetClass,
  ) => void;
  handleFreeReplayPrepEnvironmentPresetChange: (value: string) => void;
  handleFreeReplayPrepPersistEnvironmentToPoolChange: (
    next: boolean,
  ) => void;
  handleFreeReplayPrepBaseTimeframeChange: TrainerFreeReplaySetup["onSelectMinimumBaseTimeframe"];
  handleFreeReplayPrepSamplePoolChange: TrainerFreeReplaySetup["onSelectSamplePool"];
  handleFreeReplayPrepSymbolChange: TrainerFreeReplaySetup["onSelectSymbol"];
  handleFreeReplayPrepBlindBoxChange: TrainerFreeReplaySetup["onSelectBlindBox"];
  trainerTradingAssetUi: TrainerWorkspaceBundleArgs["tradingAssetUi"];
  tradeLogBaseTimeframe: TrainerWorkspaceBundleArgs["tradeLogBaseTimeframe"];
  tradeLogTimeZone: TrainerWorkspaceBundleArgs["tradeLogTimeZone"];
  tradingPresetEditor: TrainerWorkspaceBundleArgs["tradingPresetEditor"];
  tt: TrainerWorkspaceBundleArgs["tt"];
  ttf: TrainerWorkspaceBundleArgs["ttf"];
  trainerHydrationState: TrainerWorkspaceBundleArgs["trainerHydrationState"];
  isBusy: TrainerWorkspaceBundleArgs["isBusy"];
  isPreparingAction: TrainerWorkspaceBundleArgs["isPreparingAction"];
  trainingDays: TrainerWorkspaceBundleArgs["trainingDays"];
  trainingKlineCount: TrainerWorkspaceBundleArgs["trainingKlineCount"];
  trainingKlineSourceProgressLine: TrainerWorkspaceBundleArgs["trainingKlineSourceProgressLine"];
  hasTrainingKlineProgressWarning: TrainerWorkspaceBundleArgs["hasTrainingKlineProgressWarning"];
  calendarSpanText: TrainerWorkspaceBundleArgs["calendarSpanText"];
  replaySpanText: TrainerWorkspaceBundleArgs["replaySpanText"];
  securitiesTotal: TrainerWorkspaceBundleArgs["securitiesTotal"];
  securitiesDelta: TrainerWorkspaceBundleArgs["securitiesDelta"];
  positionMarketValue: TrainerWorkspaceBundleArgs["positionMarketValue"];
  securitiesAccount: TrainerWorkspaceBundleArgs["securitiesAccount"];
  currentPosition: TrainerWorkspaceBundleArgs["currentPosition"];
  currentTradingFee: TrainerWorkspaceBundleArgs["currentTradingFee"];
  floatingRate: TrainerWorkspaceBundleArgs["floatingRate"];
  cumulativePnlRate: TrainerWorkspaceBundleArgs["cumulativePnlRate"];
  leverageExposureSummary: TrainerWorkspaceBundleArgs["currentLeverageSummary"];
  tradeCapacity: TrainerWorkspaceBundleArgs["tradeCapacity"];
  trainingDateRange: TrainerWorkspaceBundleArgs["trainingDateRange"];
  buyTradeInputMode: TrainerWorkspaceBundleArgs["buyTradeInputMode"];
  buyLotInput: TrainerWorkspaceBundleArgs["buyLotInput"];
  buyAmountInput: TrainerWorkspaceBundleArgs["buyAmountInput"];
  buyRatioInput: TrainerWorkspaceBundleArgs["buyRatioInput"];
  buyRatioPresetOptions: TrainerWorkspaceBundleArgs["buyRatioPresetOptions"];
  buyEstimate: TrainerWorkspaceBundleArgs["buyEstimate"];
  sellEstimate: TrainerWorkspaceBundleArgs["sellEstimate"];
  buyPriceMode: TrainerWorkspaceBundleArgs["buyPriceMode"];
  buyBlockReason: TrainerWorkspaceBundleArgs["buyBlockReason"];
  sellBlockReason: TrainerWorkspaceBundleArgs["sellBlockReason"];
  buyOrderDisabled: TrainerWorkspaceBundleArgs["buyOrderDisabled"];
  sellOrderDisabled: TrainerWorkspaceBundleArgs["sellOrderDisabled"];
  nextOpenUnavailable: TrainerWorkspaceBundleArgs["nextOpenUnavailable"];
  canUndo: TrainerWorkspaceBundleArgs["canUndo"];
  undoAvailableSteps: TrainerWorkspaceBundleArgs["undoAvailableSteps"];
  undoMaxSteps: TrainerWorkspaceBundleArgs["undoMaxSteps"];
  lastUndoableAction: TrainerWorkspaceBundleArgs["lastUndoableAction"];
  tradeLogRows: TrainerWorkspaceBundleArgs["tradeLogRows"];
  tradeLogSideStats: TrainerWorkspaceBundleArgs["tradeLogSideStats"];
  formatMoney: TrainerWorkspaceBundleArgs["formatMoney"];
  formatRatio: TrainerWorkspaceBundleArgs["formatRatio"];
  formatSignedMoney: TrainerWorkspaceBundleArgs["formatSignedMoney"];
  formatTradingQuantityText: TrainerWorkspaceBundleArgs["formatTradingQuantityText"];
  formatTradeLogQuantityText: TrainerWorkspaceBundleArgs["formatTradeLogQuantityText"];
  withCountUnit: TrainerWorkspaceBundleArgs["withCountUnit"];
  withBuySellCount: TrainerWorkspaceBundleArgs["withBuySellCount"];
  pnlClass: TrainerWorkspaceBundleArgs["pnlClass"];
  normalizeInput: TrainerWorkspaceBundleArgs["normalizeInput"];
  setBuyTradeInputMode: TrainerWorkspaceBundleArgs["setBuyTradeInputMode"];
  setBuyLotInput: TrainerWorkspaceBundleArgs["setBuyLotInput"];
  setBuyAmountInput: TrainerWorkspaceBundleArgs["setBuyAmountInput"];
  setBuyRatioInput: TrainerWorkspaceBundleArgs["setBuyRatioInput"];
  setBuyPriceMode: TrainerWorkspaceBundleArgs["setBuyPriceMode"];
  stepNext: TrainerWorkspaceBundleArgs["stepNext"];
  isStepNextDisabled: TrainerWorkspaceBundleArgs["isStepNextDisabled"];
  undo: TrainerWorkspaceBundleArgs["undo"];
  placeOrder: TrainerWorkspaceBundleArgs["placeOrder"];
  openResetAllDialog: (options?: {
    terminationReasonCode?: SessionTerminationReasonCode | null;
  }) => Promise<void>;
};

export const useAppRootTrainerWorkspaceBundle = (
  deps: UseAppRootTrainerWorkspaceBundleDeps,
): AppWorkspacePageBundleArgs["trainer"] => {
  const {
    layout,
    ui,
    isFreeReplayPrepMode,
    freeReplayModeOptions,
    freeReplayPrepConfig,
    freeReplayEnvironmentAssetOptions,
    freeReplayEnvironmentPresetOptions,
    freeReplaySelectedEnvironmentAssetClass,
    freeReplaySelectedEnvironmentPresetId,
    freeReplaySelectedEnvironmentPresetLabel,
    freeReplayEnvironmentRuleCards,
    freeReplayPersistEnvironmentToPool,
    freeReplayTimeframeOptions,
    freeReplaySamplePoolOptions,
    freeReplaySelectedPoolId,
    freeReplaySymbolOptions,
    freeReplayAvailableSymbolCount,
    freeReplaySelectedInstrumentId,
    freeReplaySelectedSymbol,
    freeReplayPrepAnchorText,
    freeReplayBlindBoxOptions,
    freeReplayBlindBoxValue,
    startPointWindowPayload,
    onApplyStartPoint,
    freeReplayStartDisabled,
    freeReplayStartDisableReason,
    freeReplayHasAvailableSymbols,
    freeReplayStartButtonIconName,
    startPreparedFreeReplay,
    resetTrainerToPrepView,
    canResumeTrainerSession,
    resumeLatestTrainerSession,
    handleFreeReplayPrepModeChange,
    handleFreeReplayPrepEnvironmentAssetClassChange,
    handleFreeReplayPrepEnvironmentPresetChange,
    handleFreeReplayPrepPersistEnvironmentToPoolChange,
    handleFreeReplayPrepBaseTimeframeChange,
    handleFreeReplayPrepSamplePoolChange,
    handleFreeReplayPrepSymbolChange,
    handleFreeReplayPrepBlindBoxChange,
    trainerTradingAssetUi,
    tradeLogBaseTimeframe,
    tradeLogTimeZone,
    tradingPresetEditor,
    tt,
    ttf,
    trainerHydrationState,
    isBusy,
    isPreparingAction,
    trainingDays,
    trainingKlineCount,
    trainingKlineSourceProgressLine,
    hasTrainingKlineProgressWarning,
    calendarSpanText,
    replaySpanText,
    securitiesTotal,
    securitiesDelta,
    positionMarketValue,
    securitiesAccount,
    currentPosition,
    currentTradingFee,
    floatingRate,
    cumulativePnlRate,
    leverageExposureSummary,
    tradeCapacity,
    trainingDateRange,
    buyTradeInputMode,
    buyLotInput,
    buyAmountInput,
    buyRatioInput,
    buyRatioPresetOptions,
    buyEstimate,
    sellEstimate,
    buyPriceMode,
    buyBlockReason,
    sellBlockReason,
    buyOrderDisabled,
    sellOrderDisabled,
    nextOpenUnavailable,
    canUndo,
    undoAvailableSteps,
    undoMaxSteps,
    lastUndoableAction,
    tradeLogRows,
    tradeLogSideStats,
    formatMoney,
    formatRatio,
    formatSignedMoney,
    formatTradingQuantityText,
    formatTradeLogQuantityText,
    withCountUnit,
    withBuySellCount,
    pnlClass,
    normalizeInput,
    setBuyTradeInputMode,
    setBuyLotInput,
    setBuyAmountInput,
    setBuyRatioInput,
    setBuyPriceMode,
    stepNext,
    isStepNextDisabled,
    undo,
    placeOrder,
    openResetAllDialog,
  } = deps;

  const freeReplaySetup = buildFreeReplaySetupViewModel({
    isPrepMode: isFreeReplayPrepMode,
    ui,
    tt,
    freeReplayModeOptions,
    freeReplayPrepConfig,
    freeReplayEnvironmentAssetOptions,
    freeReplayEnvironmentPresetOptions,
    freeReplaySelectedEnvironmentAssetClass,
    freeReplaySelectedEnvironmentPresetId,
    freeReplaySelectedEnvironmentPresetLabel,
    freeReplayEnvironmentRuleCards,
    freeReplayPersistEnvironmentToPool,
    freeReplayTimeframeOptions,
    freeReplaySamplePoolOptions,
    freeReplaySelectedPoolId,
    freeReplaySymbolOptions,
    freeReplayAvailableSymbolCount,
    freeReplaySelectedInstrumentId,
    freeReplaySelectedSymbol,
    freeReplayPrepAnchorText,
    freeReplayBlindBoxOptions,
    freeReplayBlindBoxValue,
    startPointWindowPayload,
    onApplyStartPoint,
    freeReplayStartDisabled,
    freeReplayStartDisableReason,
    freeReplayHasAvailableSymbols,
    freeReplayStartButtonIconName,
    startPreparedFreeReplay,
    resetTrainerToPrepView,
    canResumeTrainerSession,
    resumeLatestTrainerSession,
    handleFreeReplayPrepModeChange,
    handleFreeReplayPrepEnvironmentAssetClassChange,
    handleFreeReplayPrepEnvironmentPresetChange,
    handleFreeReplayPrepPersistEnvironmentToPoolChange,
    handleFreeReplayPrepBaseTimeframeChange,
    handleFreeReplayPrepSamplePoolChange,
    handleFreeReplayPrepSymbolChange,
    handleFreeReplayPrepBlindBoxChange,
  });

  return {
    layout,
    ui,
    freeReplaySetup,
    tradingAssetUi: trainerTradingAssetUi,
    tradeLogBaseTimeframe,
    tradeLogTimeZone,
    tradingPresetEditor,
    tt,
    ttf,
    trainerHydrationState,
    isBusy,
    isPreparingAction,
    trainingDays,
    trainingKlineCount,
    trainingKlineSourceProgressLine,
    hasTrainingKlineProgressWarning,
    calendarSpanText,
    replaySpanText,
    securitiesTotal,
    securitiesDelta,
    positionMarketValue,
    securitiesAccount,
    currentPosition,
    currentTradingFee,
    floatingRate,
    cumulativePnlRate,
    currentLeverageSummary: leverageExposureSummary,
    tradeCapacity,
    trainingDateRange,
    buyTradeInputMode,
    buyLotInput,
    buyAmountInput,
    buyRatioInput,
    buyRatioPresetOptions,
    buyEstimate,
    sellEstimate,
    buyPriceMode,
    buyOrderDisabled,
    buyBlockReason,
    sellOrderDisabled,
    sellBlockReason,
    nextOpenUnavailable,
    canUndo,
    undoAvailableSteps,
    undoMaxSteps,
    lastUndoableAction,
    tradeLogRows,
    tradeLogSideStats,
    formatMoney,
    formatRatio,
    formatSignedMoney,
    formatTradingQuantityText,
    formatTradeLogQuantityText,
    withCountUnit,
    withBuySellCount,
    pnlClass,
    normalizeInput,
    setBuyTradeInputMode,
    setBuyLotInput,
    setBuyAmountInput,
    setBuyRatioInput,
    setBuyPriceMode,
    stepNext,
    isStepNextDisabled,
    undo,
    placeOrder,
    openResetAllDialog,
  };
};
