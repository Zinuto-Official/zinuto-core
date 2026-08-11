// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useMemo } from 'react';
import type { AppTrainerModalHostProps } from '@/app-shell/AppTrainerModalHost';

type UseAppTrainerModalHostPropsArgs = {
  tt: AppTrainerModalHostProps['tt'];
  ttf: AppTrainerModalHostProps['ttf'];
  uiText: AppTrainerModalHostProps['uiText'];
  showShortcutModal: boolean;
  setShowShortcutModal: (open: boolean) => void;
  drawShortcutItems: AppTrainerModalHostProps['shortcutModal']['drawShortcutItems'];
  addNoteKey: string;
  showChartSettingsModal: boolean;
  setShowChartSettingsModal: (open: boolean) => void;
  chartSettingsModalFocusTarget: AppTrainerModalHostProps['chartSettingsModal']['focusedTarget'];
  indicatorNoneValue: string;
  mainNativeIndicator: string;
  onMainNativeIndicatorChange: (value: string) => void;
  mainIndicatorSelectOptions: AppTrainerModalHostProps['chartSettingsModal']['mainIndicatorSelectOptions'];
  mainNativeIndicatorParams: number[];
  mainIndicatorParamChanged: boolean;
  onResetMainIndicatorParams: () => void;
  onUpdateMainIndicatorParamAt: (index: number, value: string) => void;
  signalTopIndicator: AppTrainerModalHostProps['chartSettingsModal']['signalTopIndicator'];
  onSignalTopIndicatorChange: (value: AppTrainerModalHostProps['chartSettingsModal']['signalTopIndicator']) => void;
  signalTopIndicatorParams: number[];
  topIndicatorParamChanged: boolean;
  onResetTopIndicatorParams: () => void;
  onUpdateTopIndicatorParamAt: (index: number, value: string) => void;
  signalBottomIndicator: AppTrainerModalHostProps['chartSettingsModal']['signalBottomIndicator'];
  onSignalBottomIndicatorChange: (
    value: AppTrainerModalHostProps['chartSettingsModal']['signalBottomIndicator']
  ) => void;
  signalBottomIndicatorParams: number[];
  bottomIndicatorParamChanged: boolean;
  onResetBottomIndicatorParams: () => void;
  onUpdateBottomIndicatorParamAt: (index: number, value: string) => void;
  signalIndicatorOptions: AppTrainerModalHostProps['chartSettingsModal']['signalIndicatorOptions'];
  onSaveChartSettings: () => void;
  isSavingTradingSettings: boolean;
  isBusy: boolean;
  showTradingSettingsModal: boolean;
  setShowTradingSettingsModal: (open: boolean) => void;
  quantityModeLabel: string;
  quantityInputPlaceholder: string;
  amountModeLabel: string;
  amountInputPlaceholder: string;
  buyTradeInputMode: AppTrainerModalHostProps['tradingSettingsModal']['buyTradeInputMode'];
  onBuyTradeInputModeChange: AppTrainerModalHostProps['tradingSettingsModal']['onBuyTradeInputModeChange'];
  buyLotInput: string;
  setBuyLotInput: (value: string) => void;
  buyAmountInput: string;
  setBuyAmountInput: (value: string) => void;
  buyRatioInput: string;
  buyRatioPresetOptions: ReadonlyArray<string>;
  onBuyRatioInputChange: (value: string) => void;
  buyPriceMode: AppTrainerModalHostProps['tradingSettingsModal']['buyPriceMode'];
  onBuyPriceModeChange: AppTrainerModalHostProps['tradingSettingsModal']['onBuyPriceModeChange'];
  normalizeInput: (value: string) => string;
};

export const useAppTrainerModalHostProps = ({
  tt,
  ttf,
  uiText,
  showShortcutModal,
  setShowShortcutModal,
  drawShortcutItems,
  addNoteKey,
  showChartSettingsModal,
  setShowChartSettingsModal,
  chartSettingsModalFocusTarget,
  indicatorNoneValue,
  mainNativeIndicator,
  onMainNativeIndicatorChange,
  mainIndicatorSelectOptions,
  mainNativeIndicatorParams,
  mainIndicatorParamChanged,
  onResetMainIndicatorParams,
  onUpdateMainIndicatorParamAt,
  signalTopIndicator,
  onSignalTopIndicatorChange,
  signalTopIndicatorParams,
  topIndicatorParamChanged,
  onResetTopIndicatorParams,
  onUpdateTopIndicatorParamAt,
  signalBottomIndicator,
  onSignalBottomIndicatorChange,
  signalBottomIndicatorParams,
  bottomIndicatorParamChanged,
  onResetBottomIndicatorParams,
  onUpdateBottomIndicatorParamAt,
  signalIndicatorOptions,
  onSaveChartSettings,
  isSavingTradingSettings,
  isBusy,
  showTradingSettingsModal,
  setShowTradingSettingsModal,
  quantityModeLabel,
  quantityInputPlaceholder,
  amountModeLabel,
  amountInputPlaceholder,
  buyTradeInputMode,
  onBuyTradeInputModeChange,
  buyLotInput,
  setBuyLotInput,
  buyAmountInput,
  setBuyAmountInput,
  buyRatioInput,
  buyRatioPresetOptions,
  onBuyRatioInputChange,
  buyPriceMode,
  onBuyPriceModeChange,
  normalizeInput
}: UseAppTrainerModalHostPropsArgs): AppTrainerModalHostProps => {
  const closeShortcutModal = useCallback(() => {
    setShowShortcutModal(false);
  }, [setShowShortcutModal]);

  const closeChartSettingsModal = useCallback(() => {
    setShowChartSettingsModal(false);
  }, [setShowChartSettingsModal]);

  const closeTradingSettingsModal = useCallback(() => {
    setShowTradingSettingsModal(false);
  }, [setShowTradingSettingsModal]);

  const handleBuyLotInputChange = useCallback(
    (value: string) => {
      setBuyLotInput(normalizeInput(value));
    },
    [normalizeInput, setBuyLotInput]
  );

  const handleBuyAmountInputChange = useCallback(
    (value: string) => {
      setBuyAmountInput(normalizeInput(value));
    },
    [normalizeInput, setBuyAmountInput]
  );

  const shortcutModal = useMemo<AppTrainerModalHostProps['shortcutModal']>(
    () => ({
      open: showShortcutModal,
      onClose: closeShortcutModal,
      addNoteKey,
      drawShortcutItems
    }),
    [showShortcutModal, closeShortcutModal, addNoteKey, drawShortcutItems]
  );

  const chartSettingsModal = useMemo<AppTrainerModalHostProps['chartSettingsModal']>(
    () => ({
      open: showChartSettingsModal,
      onClose: closeChartSettingsModal,
      focusedTarget: chartSettingsModalFocusTarget,
      indicatorNoneValue,
      mainNativeIndicator,
      onMainNativeIndicatorChange,
      mainIndicatorSelectOptions,
      mainNativeIndicatorParams,
      mainIndicatorParamChanged,
      onResetMainIndicatorParams,
      onUpdateMainIndicatorParamAt,
      signalTopIndicator,
      onSignalTopIndicatorChange,
      signalTopIndicatorParams,
      topIndicatorParamChanged,
      onResetTopIndicatorParams,
      onUpdateTopIndicatorParamAt,
      signalBottomIndicator,
      onSignalBottomIndicatorChange,
      signalBottomIndicatorParams,
      bottomIndicatorParamChanged,
      onResetBottomIndicatorParams,
      onUpdateBottomIndicatorParamAt,
      signalIndicatorOptions,
      onSave: onSaveChartSettings,
      isSaving: isSavingTradingSettings,
      saveDisabled: isBusy
    }),
    [
      showChartSettingsModal,
      closeChartSettingsModal,
      chartSettingsModalFocusTarget,
      indicatorNoneValue,
      mainNativeIndicator,
      onMainNativeIndicatorChange,
      mainIndicatorSelectOptions,
      mainNativeIndicatorParams,
      mainIndicatorParamChanged,
      onResetMainIndicatorParams,
      onUpdateMainIndicatorParamAt,
      signalTopIndicator,
      onSignalTopIndicatorChange,
      signalTopIndicatorParams,
      topIndicatorParamChanged,
      onResetTopIndicatorParams,
      onUpdateTopIndicatorParamAt,
      signalBottomIndicator,
      onSignalBottomIndicatorChange,
      signalBottomIndicatorParams,
      bottomIndicatorParamChanged,
      onResetBottomIndicatorParams,
      onUpdateBottomIndicatorParamAt,
      signalIndicatorOptions,
      onSaveChartSettings,
      isSavingTradingSettings,
      isBusy
    ]
  );

  const tradingSettingsModal = useMemo<AppTrainerModalHostProps['tradingSettingsModal']>(
    () => ({
      open: showTradingSettingsModal,
      onClose: closeTradingSettingsModal,
      quantityModeLabel,
      quantityInputPlaceholder,
      amountModeLabel,
      amountInputPlaceholder,
      buyTradeInputMode,
      onBuyTradeInputModeChange,
      buyLotInput,
      onBuyLotInputChange: handleBuyLotInputChange,
      buyAmountInput,
      onBuyAmountInputChange: handleBuyAmountInputChange,
      buyRatioInput,
      buyRatioPresetOptions,
      onBuyRatioInputChange,
      buyPriceMode,
      onBuyPriceModeChange,
      isBusy
    }),
    [
      showTradingSettingsModal,
      closeTradingSettingsModal,
      quantityModeLabel,
      quantityInputPlaceholder,
      amountModeLabel,
      amountInputPlaceholder,
      buyTradeInputMode,
      onBuyTradeInputModeChange,
      buyLotInput,
      handleBuyLotInputChange,
      buyAmountInput,
      handleBuyAmountInputChange,
      buyRatioInput,
      buyRatioPresetOptions,
      onBuyRatioInputChange,
      buyPriceMode,
      onBuyPriceModeChange,
      isBusy
    ]
  );

  return useMemo(
    () => ({
      tt,
      ttf,
      uiText,
      shortcutModal,
      chartSettingsModal,
      tradingSettingsModal
    }),
    [tt, ttf, uiText, shortcutModal, chartSettingsModal, tradingSettingsModal]
  );
};
