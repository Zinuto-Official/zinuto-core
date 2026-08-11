// SPDX-License-Identifier: GPL-3.0-only

import type { TrainerWorkspacePageProps } from '@/workspaces/trainer/TrainerWorkspacePage';

type UseTrainerWorkspacePagePropsArgs = {
  layout: TrainerWorkspacePageProps['trainerChartWorkspaceLayout'];
  ui: TrainerWorkspacePageProps['ui'];
  freeReplaySetup: TrainerWorkspacePageProps['freeReplaySetup'];
  tradingAssetUi: TrainerWorkspacePageProps['tradingAssetUi'];
  tradeLogBaseTimeframe: TrainerWorkspacePageProps['tradeLogBaseTimeframe'];
  tradeLogTimeZone: TrainerWorkspacePageProps['tradeLogTimeZone'];
  tradingPresetEditor: TrainerWorkspacePageProps['tradingPresetEditor'];
  tt: TrainerWorkspacePageProps['tt'];
  ttf: TrainerWorkspacePageProps['ttf'];
  trainerHydrationState: TrainerWorkspacePageProps['trainerHydrationState'];
  status: {
    isBusy: TrainerWorkspacePageProps['isBusy'];
    isPreparingAction: TrainerWorkspacePageProps['isPreparingAction'];
  };
  summary: {
    trainingDays: TrainerWorkspacePageProps['trainingDays'];
    trainingKlineCount: TrainerWorkspacePageProps['trainingKlineCount'];
    trainingKlineSourceProgressLine: TrainerWorkspacePageProps['trainingKlineSourceProgressLine'];
    hasTrainingKlineProgressWarning: TrainerWorkspacePageProps['hasTrainingKlineProgressWarning'];
    calendarSpanText: TrainerWorkspacePageProps['calendarSpanText'];
    replaySpanText: TrainerWorkspacePageProps['replaySpanText'];
    securitiesTotal: TrainerWorkspacePageProps['securitiesTotal'];
    securitiesDelta: TrainerWorkspacePageProps['securitiesDelta'];
    positionMarketValue: TrainerWorkspacePageProps['positionMarketValue'];
    securitiesAccount: TrainerWorkspacePageProps['securitiesAccount'];
    currentPosition: TrainerWorkspacePageProps['currentPosition'];
    currentTradingFee: TrainerWorkspacePageProps['currentTradingFee'];
    floatingRate: TrainerWorkspacePageProps['floatingRate'];
    cumulativePnlRate: TrainerWorkspacePageProps['cumulativePnlRate'];
    currentLeverageSummary: TrainerWorkspacePageProps['currentLeverageSummary'];
    tradeCapacity: TrainerWorkspacePageProps['tradeCapacity'];
    trainingDateRange: TrainerWorkspacePageProps['trainingDateRange'];
  };
  order: {
    buyTradeInputMode: TrainerWorkspacePageProps['buyTradeInputMode'];
    buyLotInput: TrainerWorkspacePageProps['buyLotInput'];
    buyAmountInput: TrainerWorkspacePageProps['buyAmountInput'];
    buyRatioInput: TrainerWorkspacePageProps['buyRatioInput'];
    buyRatioPresetOptions: TrainerWorkspacePageProps['buyRatioPresetOptions'];
    buyEstimate: TrainerWorkspacePageProps['buyEstimate'];
    sellEstimate: TrainerWorkspacePageProps['sellEstimate'];
    buyPriceMode: TrainerWorkspacePageProps['buyPriceMode'];
    buyOrderDisabled: TrainerWorkspacePageProps['buyOrderDisabled'];
    buyBlockReason: TrainerWorkspacePageProps['buyBlockReason'];
    sellOrderDisabled: TrainerWorkspacePageProps['sellOrderDisabled'];
    sellBlockReason: TrainerWorkspacePageProps['sellBlockReason'];
    nextOpenUnavailable: TrainerWorkspacePageProps['nextOpenUnavailable'];
    canUndo: TrainerWorkspacePageProps['canUndo'];
    undoAvailableSteps: TrainerWorkspacePageProps['undoAvailableSteps'];
    undoMaxSteps: TrainerWorkspacePageProps['undoMaxSteps'];
    lastUndoableAction: TrainerWorkspacePageProps['lastUndoableAction'];
  };
  tradeLog: {
    tradeLogRows: TrainerWorkspacePageProps['tradeLogRows'];
    tradeLogSideStats: TrainerWorkspacePageProps['tradeLogSideStats'];
  };
  formatters: {
    formatMoney: TrainerWorkspacePageProps['formatMoney'];
    formatRatio: TrainerWorkspacePageProps['formatRatio'];
    formatSignedMoney: TrainerWorkspacePageProps['formatSignedMoney'];
    formatTradingQuantityText: TrainerWorkspacePageProps['formatTradingQuantityText'];
    formatTradeLogQuantityText: TrainerWorkspacePageProps['formatTradeLogQuantityText'];
    withCountUnit: TrainerWorkspacePageProps['withCountUnit'];
    withBuySellCount: TrainerWorkspacePageProps['withBuySellCount'];
    pnlClass: TrainerWorkspacePageProps['pnlClass'];
    normalizeInput: TrainerWorkspacePageProps['normalizeInput'];
  };
  actions: {
    setBuyTradeInputMode: TrainerWorkspacePageProps['setBuyTradeInputMode'];
    setBuyLotInput: TrainerWorkspacePageProps['setBuyLotInput'];
    setBuyAmountInput: TrainerWorkspacePageProps['setBuyAmountInput'];
    setBuyRatioInput: TrainerWorkspacePageProps['setBuyRatioInput'];
    setBuyPriceMode: TrainerWorkspacePageProps['setBuyPriceMode'];
    stepNext: TrainerWorkspacePageProps['stepNext'];
    isStepNextDisabled: TrainerWorkspacePageProps['isStepNextDisabled'];
    undo: TrainerWorkspacePageProps['undo'];
    placeOrder: TrainerWorkspacePageProps['placeOrder'];
    openResetAllDialog: TrainerWorkspacePageProps['openResetAllDialog'];
  };
};

export const useTrainerWorkspacePageProps = ({
  layout,
  ui,
  freeReplaySetup,
  tradingAssetUi,
  tradeLogBaseTimeframe,
  tradeLogTimeZone,
  tradingPresetEditor,
  tt,
  ttf,
  trainerHydrationState,
  status,
  summary,
  order,
  tradeLog,
  formatters,
  actions
}: UseTrainerWorkspacePagePropsArgs): TrainerWorkspacePageProps => ({
  trainerChartWorkspaceLayout: layout,
  ui,
  freeReplaySetup,
  tradingAssetUi,
  tradeLogBaseTimeframe,
  tradeLogTimeZone,
  tradingPresetEditor,
  tt,
  ttf,
  trainerHydrationState,
  isBusy: status.isBusy,
  isPreparingAction: status.isPreparingAction,
  trainingDays: summary.trainingDays,
  trainingKlineCount: summary.trainingKlineCount,
  trainingKlineSourceProgressLine: summary.trainingKlineSourceProgressLine,
  hasTrainingKlineProgressWarning: summary.hasTrainingKlineProgressWarning,
  calendarSpanText: summary.calendarSpanText,
  replaySpanText: summary.replaySpanText,
  securitiesTotal: summary.securitiesTotal,
  securitiesDelta: summary.securitiesDelta,
  positionMarketValue: summary.positionMarketValue,
  securitiesAccount: summary.securitiesAccount,
  currentPosition: summary.currentPosition,
  currentTradingFee: summary.currentTradingFee,
  floatingRate: summary.floatingRate,
  cumulativePnlRate: summary.cumulativePnlRate,
  currentLeverageSummary: summary.currentLeverageSummary,
  tradeCapacity: summary.tradeCapacity,
  trainingDateRange: summary.trainingDateRange,
  buyTradeInputMode: order.buyTradeInputMode,
  buyLotInput: order.buyLotInput,
  buyAmountInput: order.buyAmountInput,
  buyRatioInput: order.buyRatioInput,
  buyRatioPresetOptions: order.buyRatioPresetOptions,
  buyEstimate: order.buyEstimate,
  sellEstimate: order.sellEstimate,
  buyPriceMode: order.buyPriceMode,
  buyOrderDisabled: order.buyOrderDisabled,
  buyBlockReason: order.buyBlockReason,
  sellOrderDisabled: order.sellOrderDisabled,
  sellBlockReason: order.sellBlockReason,
  nextOpenUnavailable: order.nextOpenUnavailable,
  canUndo: order.canUndo,
  undoAvailableSteps: order.undoAvailableSteps,
  undoMaxSteps: order.undoMaxSteps,
  lastUndoableAction: order.lastUndoableAction,
  tradeLogRows: tradeLog.tradeLogRows,
  tradeLogSideStats: tradeLog.tradeLogSideStats,
  formatMoney: formatters.formatMoney,
  formatRatio: formatters.formatRatio,
  formatSignedMoney: formatters.formatSignedMoney,
  formatTradingQuantityText: formatters.formatTradingQuantityText,
  formatTradeLogQuantityText: formatters.formatTradeLogQuantityText,
  withCountUnit: formatters.withCountUnit,
  withBuySellCount: formatters.withBuySellCount,
  pnlClass: formatters.pnlClass,
  normalizeInput: formatters.normalizeInput,
  setBuyTradeInputMode: actions.setBuyTradeInputMode,
  setBuyLotInput: actions.setBuyLotInput,
  setBuyAmountInput: actions.setBuyAmountInput,
  setBuyRatioInput: actions.setBuyRatioInput,
  setBuyPriceMode: actions.setBuyPriceMode,
  stepNext: actions.stepNext,
  isStepNextDisabled: actions.isStepNextDisabled,
  undo: actions.undo,
  placeOrder: actions.placeOrder,
  openResetAllDialog: actions.openResetAllDialog
});
