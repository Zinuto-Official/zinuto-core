// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from 'react';
import {
  formatMoneyFixed,
  sanitizeNumericInput,
  sanitizeSignedNumericInput,
} from '@/ui/formatting/format';
import {
  TRADE_MARKER_DENSITY_LEVELS,
  normalizeTradeMarkerDensityRatio
} from '@/domains/chart/overlays/tradeMarkerDensityRules';
import type { ReplayTrainerSettingsPanelProps } from '@/domains/trainer/ReplayTrainerSettingsPanel';
import type { TradingAssetClassId } from '@/domains/trainer/tradingMarketPresets';

type UseReplayTrainerSettingsModalPropsParams = {
  tradeMarkerDensityTitle: string;
  tradeMarkerDensityLevelSuffix: string;
  tradeMarkerDensityHelpText: string;
  tradeMarkerDensityLevel: number;
  setTradeMarkerDensityRatio: (value: number) => void;
  replaySettingsDensityOptions: ReplayTrainerSettingsPanelProps['replaySettingsDensityOptions'];

  initialSecuritiesInput: string;
  setInitialSecuritiesInput: (value: string) => void;
  isInitialSecuritiesEditable: boolean;
  initialSecuritiesLockedReason: string;
  normalizeIntegerInput: (value: string) => string;
  tradingAssetClass: TradingAssetClassId;
  replaySettingsAssetClassOptions: ReplayTrainerSettingsPanelProps['replaySettingsAssetClassOptions'];
  onTradingAssetClassChange: (value: TradingAssetClassId) => void;
  minTradeStepInput: string;
  setMinTradeStepInput: (value: string) => void;

  commissionRateInput: string;
  setCommissionRateInput: (value: string) => void;
  makerFeeRateInput: string;
  setMakerFeeRateInput: (value: string) => void;
  takerFeeRateInput: string;
  setTakerFeeRateInput: (value: string) => void;
  fundingRateInput: string;
  setFundingRateInput: (value: string) => void;
  contractMultiplierInput: string;
  setContractMultiplierInput: (value: string) => void;
  transferFeeRateInput: string;
  setTransferFeeRateInput: (value: string) => void;
  regulatoryFeeRateInput: string;
  setRegulatoryFeeRateInput: (value: string) => void;
  platformFeeRateInput: string;
  setPlatformFeeRateInput: (value: string) => void;
  transactionLevyRateInput: string;
  setTransactionLevyRateInput: (value: string) => void;
  slippageRateInput: string;
  setSlippageRateInput: (value: string) => void;
  stampDutyRateInput: string;
  setStampDutyRateInput: (value: string) => void;
  commissionMinimumFeeInput: string;
  setCommissionMinimumFeeInput: (value: string) => void;
  platformFeeMinimumFeeInput: string;
  setPlatformFeeMinimumFeeInput: (value: string) => void;
  transactionLevyMinimumFeeInput: string;
  setTransactionLevyMinimumFeeInput: (value: string) => void;
  longFinancingAnnualRateInput: string;
  setLongFinancingAnnualRateInput: (value: string) => void;
  longInitialMarginRatioInput: string;
  setLongInitialMarginRatioInput: (value: string) => void;
  longMaintenanceMarginRatioInput: string;
  setLongMaintenanceMarginRatioInput: (value: string) => void;
  shortBorrowAnnualRateInput: string;
  setShortBorrowAnnualRateInput: (value: string) => void;
  shortInitialMarginRatioInput: string;
  setShortInitialMarginRatioInput: (value: string) => void;
  shortMaintenanceMarginRatioInput: string;
  setShortMaintenanceMarginRatioInput: (value: string) => void;

  replaySettingsStampDutyOptions: ReplayTrainerSettingsPanelProps['replaySettingsStampDutyOptions'];
  stampDutyMode: ReplayTrainerSettingsPanelProps['stampDutyMode'];
  onStampDutyModeChange: ReplayTrainerSettingsPanelProps['onStampDutyModeChange'];

  replaySettingsSettlementModeOptions: ReplayTrainerSettingsPanelProps['replaySettingsSettlementModeOptions'];
  tradeSettlementMode: ReplayTrainerSettingsPanelProps['tradeSettlementMode'];
  onTradeSettlementModeChange: ReplayTrainerSettingsPanelProps['onTradeSettlementModeChange'];
  replaySettingsFreeReplayEndSettlementModeOptions: ReplayTrainerSettingsPanelProps['replaySettingsFreeReplayEndSettlementModeOptions'];
  freeReplayEndSettlementMode: ReplayTrainerSettingsPanelProps['freeReplayEndSettlementMode'];
  onFreeReplayEndSettlementModeChange: ReplayTrainerSettingsPanelProps['onFreeReplayEndSettlementModeChange'];
  marketPresetChips: ReplayTrainerSettingsPanelProps['marketPresetChips'];
  onSelectTradingMarketPreset: ReplayTrainerSettingsPanelProps['onSelectTradingMarketPreset'];
  onCreateTradingMarketPresetFromCurrent: ReplayTrainerSettingsPanelProps['onCreateTradingMarketPresetFromCurrent'];
  onRenameTradingMarketPresetById: ReplayTrainerSettingsPanelProps['onRenameTradingMarketPresetById'];
  onDeleteTradingMarketPresetById: ReplayTrainerSettingsPanelProps['onDeleteTradingMarketPresetById'];
  onResetAllTradingAssetParameters: ReplayTrainerSettingsPanelProps['onResetAllTradingAssetParameters'];
  isTradingMarketPresetDirty: ReplayTrainerSettingsPanelProps['isTradingMarketPresetDirty'];
  canSaveTradingMarketPresetToCurrent: ReplayTrainerSettingsPanelProps['canSaveTradingMarketPresetToCurrent'];
  onSaveTradingMarketPresetToCurrent: ReplayTrainerSettingsPanelProps['onSaveTradingMarketPresetToCurrent'];
  onSaveTradingMarketPresetAsNew: ReplayTrainerSettingsPanelProps['onSaveTradingMarketPresetAsNew'];
  activeTradingMarketPresetLabel: ReplayTrainerSettingsPanelProps['activeTradingMarketPresetLabel'];

  replaySettingsPositionCostOptions: ReplayTrainerSettingsPanelProps['replaySettingsPositionCostOptions'];
  positionCostMode: ReplayTrainerSettingsPanelProps['positionCostMode'];
  onPositionCostModeChange: ReplayTrainerSettingsPanelProps['onPositionCostModeChange'];

  replaySettingsAllowLongOptions: ReplayTrainerSettingsPanelProps['replaySettingsAllowLongOptions'];
  allowLongMarginTrading: boolean;
  onAllowLongMarginTradingChange: (next: boolean) => void;
  replaySettingsAllowShortOptions: ReplayTrainerSettingsPanelProps['replaySettingsAllowShortOptions'];
  allowShortSelling: boolean;
  onAllowShortSellingChange: (next: boolean) => void;

  replaySettingsTradeAmountOptions: ReplayTrainerSettingsPanelProps['replaySettingsTradeAmountOptions'];
  tradeAmountIncludesFees: boolean;
  onTradeAmountIncludesFeesChange: (next: boolean) => void;

  percentSymbol: string;
  onSave: ReplayTrainerSettingsPanelProps['onSave'];
  isSavingTradingSettings: boolean;
  isBusy: boolean;
  isSaveDisabled?: boolean;
};

export const useReplayTrainerSettingsModalProps = (
  params: UseReplayTrainerSettingsModalPropsParams
): ReplayTrainerSettingsPanelProps => {
  const {
    tradeMarkerDensityTitle,
    tradeMarkerDensityLevelSuffix,
    tradeMarkerDensityHelpText,
    tradeMarkerDensityLevel,
    setTradeMarkerDensityRatio,
    replaySettingsDensityOptions,
    initialSecuritiesInput,
    setInitialSecuritiesInput,
    isInitialSecuritiesEditable,
    initialSecuritiesLockedReason,
    normalizeIntegerInput,
    tradingAssetClass,
    replaySettingsAssetClassOptions,
    onTradingAssetClassChange,
    minTradeStepInput,
    setMinTradeStepInput,
    commissionRateInput,
    setCommissionRateInput,
    makerFeeRateInput,
    setMakerFeeRateInput,
    takerFeeRateInput,
    setTakerFeeRateInput,
    fundingRateInput,
    setFundingRateInput,
    contractMultiplierInput,
    setContractMultiplierInput,
    transferFeeRateInput,
    setTransferFeeRateInput,
    regulatoryFeeRateInput,
    setRegulatoryFeeRateInput,
    platformFeeRateInput,
    setPlatformFeeRateInput,
    transactionLevyRateInput,
    setTransactionLevyRateInput,
    slippageRateInput,
    setSlippageRateInput,
    stampDutyRateInput,
    setStampDutyRateInput,
    commissionMinimumFeeInput,
    setCommissionMinimumFeeInput,
    platformFeeMinimumFeeInput,
    setPlatformFeeMinimumFeeInput,
    transactionLevyMinimumFeeInput,
    setTransactionLevyMinimumFeeInput,
    longFinancingAnnualRateInput,
    setLongFinancingAnnualRateInput,
    longInitialMarginRatioInput,
    setLongInitialMarginRatioInput,
    longMaintenanceMarginRatioInput,
    setLongMaintenanceMarginRatioInput,
    shortBorrowAnnualRateInput,
    setShortBorrowAnnualRateInput,
    shortInitialMarginRatioInput,
    setShortInitialMarginRatioInput,
    shortMaintenanceMarginRatioInput,
    setShortMaintenanceMarginRatioInput,
    replaySettingsStampDutyOptions,
    stampDutyMode,
    onStampDutyModeChange,
    replaySettingsSettlementModeOptions,
    tradeSettlementMode,
    onTradeSettlementModeChange,
    replaySettingsFreeReplayEndSettlementModeOptions,
    freeReplayEndSettlementMode,
    onFreeReplayEndSettlementModeChange,
    marketPresetChips,
    onSelectTradingMarketPreset,
    onCreateTradingMarketPresetFromCurrent,
    onRenameTradingMarketPresetById,
    onDeleteTradingMarketPresetById,
    onResetAllTradingAssetParameters,
    isTradingMarketPresetDirty,
    canSaveTradingMarketPresetToCurrent,
    onSaveTradingMarketPresetToCurrent,
    onSaveTradingMarketPresetAsNew,
    activeTradingMarketPresetLabel,
    replaySettingsPositionCostOptions,
    positionCostMode,
    onPositionCostModeChange,
    replaySettingsAllowLongOptions,
    allowLongMarginTrading,
    onAllowLongMarginTradingChange,
    replaySettingsAllowShortOptions,
    allowShortSelling,
    onAllowShortSellingChange,
    replaySettingsTradeAmountOptions,
    tradeAmountIncludesFees,
    onTradeAmountIncludesFeesChange,
    percentSymbol,
    onSave,
    isSavingTradingSettings,
    isBusy,
    isSaveDisabled = false
  } = params;

  return useMemo(
    () => ({
      tradeMarkerDensityTitle,
      tradeMarkerDensityValueText: `${formatMoneyFixed(tradeMarkerDensityLevel, 0)}${tradeMarkerDensityLevelSuffix}`,
      tradeMarkerDensityHelpText,
      tradeMarkerDensityLevel,
      replaySettingsDensityOptions,
      onTradeMarkerDensityLevelChange: (nextLevel: string) => {
        const matched = TRADE_MARKER_DENSITY_LEVELS.find((option) => String(option.level) === nextLevel);
        if (!matched) {
          return;
        }
        setTradeMarkerDensityRatio(normalizeTradeMarkerDensityRatio(matched.ratio));
      },
      initialSecuritiesInput,
      onInitialSecuritiesInputChange: (value: string) => setInitialSecuritiesInput(normalizeIntegerInput(value)),
      isInitialSecuritiesEditable,
      initialSecuritiesLockedReason,
      tradingAssetClass,
      replaySettingsAssetClassOptions,
      onTradingAssetClassChange,
      minTradeStepInput,
      onMinTradeStepInputChange: (value: string) => setMinTradeStepInput(sanitizeNumericInput(value)),
      commissionRateInput,
      onCommissionRateInputChange: (value: string) => setCommissionRateInput(sanitizeNumericInput(value)),
      makerFeeRateInput,
      onMakerFeeRateInputChange: (value: string) => setMakerFeeRateInput(sanitizeNumericInput(value)),
      takerFeeRateInput,
      onTakerFeeRateInputChange: (value: string) => setTakerFeeRateInput(sanitizeNumericInput(value)),
      fundingRateInput,
      onFundingRateInputChange: (value: string) =>
        setFundingRateInput(sanitizeSignedNumericInput(value)),
      contractMultiplierInput,
      onContractMultiplierInputChange: (value: string) => setContractMultiplierInput(sanitizeNumericInput(value)),
      transferFeeRateInput,
      onTransferFeeRateInputChange: (value: string) => setTransferFeeRateInput(sanitizeNumericInput(value)),
      regulatoryFeeRateInput,
      onRegulatoryFeeRateInputChange: (value: string) => setRegulatoryFeeRateInput(sanitizeNumericInput(value)),
      platformFeeRateInput,
      onPlatformFeeRateInputChange: (value: string) => setPlatformFeeRateInput(sanitizeNumericInput(value)),
      transactionLevyRateInput,
      onTransactionLevyRateInputChange: (value: string) => setTransactionLevyRateInput(sanitizeNumericInput(value)),
      slippageRateInput,
      onSlippageRateInputChange: (value: string) => setSlippageRateInput(sanitizeNumericInput(value)),
      stampDutyRateInput,
      onStampDutyRateInputChange: (value: string) => setStampDutyRateInput(sanitizeNumericInput(value)),
      commissionMinimumFeeInput,
      onCommissionMinimumFeeInputChange: (value: string) => setCommissionMinimumFeeInput(sanitizeNumericInput(value)),
      platformFeeMinimumFeeInput,
      onPlatformFeeMinimumFeeInputChange: (value: string) => setPlatformFeeMinimumFeeInput(sanitizeNumericInput(value)),
      transactionLevyMinimumFeeInput,
      onTransactionLevyMinimumFeeInputChange: (value: string) =>
        setTransactionLevyMinimumFeeInput(sanitizeNumericInput(value)),
      longFinancingAnnualRateInput,
      onLongFinancingAnnualRateInputChange: (value: string) =>
        setLongFinancingAnnualRateInput(sanitizeNumericInput(value)),
      longInitialMarginRatioInput,
      onLongInitialMarginRatioInputChange: (value: string) =>
        setLongInitialMarginRatioInput(sanitizeNumericInput(value)),
      longMaintenanceMarginRatioInput,
      onLongMaintenanceMarginRatioInputChange: (value: string) =>
        setLongMaintenanceMarginRatioInput(sanitizeNumericInput(value)),
      shortBorrowAnnualRateInput,
      onShortBorrowAnnualRateInputChange: (value: string) => setShortBorrowAnnualRateInput(sanitizeNumericInput(value)),
      shortInitialMarginRatioInput,
      onShortInitialMarginRatioInputChange: (value: string) =>
        setShortInitialMarginRatioInput(sanitizeNumericInput(value)),
      shortMaintenanceMarginRatioInput,
      onShortMaintenanceMarginRatioInputChange: (value: string) =>
        setShortMaintenanceMarginRatioInput(sanitizeNumericInput(value)),
      replaySettingsStampDutyOptions,
      stampDutyMode,
      onStampDutyModeChange,
      replaySettingsSettlementModeOptions,
      tradeSettlementMode,
      onTradeSettlementModeChange,
      replaySettingsFreeReplayEndSettlementModeOptions,
      freeReplayEndSettlementMode,
      onFreeReplayEndSettlementModeChange,
      marketPresetChips,
      onSelectTradingMarketPreset,
      onCreateTradingMarketPresetFromCurrent,
      onRenameTradingMarketPresetById,
      onDeleteTradingMarketPresetById,
      onResetAllTradingAssetParameters,
      isTradingMarketPresetDirty,
      canSaveTradingMarketPresetToCurrent,
      onSaveTradingMarketPresetToCurrent,
      onSaveTradingMarketPresetAsNew,
      activeTradingMarketPresetLabel,
      replaySettingsPositionCostOptions,
      positionCostMode,
      onPositionCostModeChange,
      replaySettingsAllowLongOptions,
      allowLongMarginTrading,
      onAllowLongMarginTradingChange,
      replaySettingsAllowShortOptions,
      allowShortSelling,
      onAllowShortSellingChange,
      replaySettingsTradeAmountOptions,
      tradeAmountIncludesFees,
      onTradeAmountIncludesFeesChange,
      percentSymbol,
      onSave,
      isSavingTradingSettings,
      isBusy,
      isSaveDisabled
    }),
    [
      commissionRateInput,
      commissionMinimumFeeInput,
      contractMultiplierInput,
      fundingRateInput,
      initialSecuritiesInput,
      initialSecuritiesLockedReason,
      isBusy,
      isInitialSecuritiesEditable,
      isSavingTradingSettings,
      makerFeeRateInput,
      minTradeStepInput,
      normalizeIntegerInput,
      onTradingAssetClassChange,
      onAllowShortSellingChange,
      onPositionCostModeChange,
      onSave,
      onStampDutyModeChange,
      onTradeAmountIncludesFeesChange,
      onTradeSettlementModeChange,
      onSelectTradingMarketPreset,
      onCreateTradingMarketPresetFromCurrent,
      onRenameTradingMarketPresetById,
      onDeleteTradingMarketPresetById,
      onResetAllTradingAssetParameters,
      onSaveTradingMarketPresetToCurrent,
      onSaveTradingMarketPresetAsNew,
      percentSymbol,
      platformFeeMinimumFeeInput,
      platformFeeRateInput,
      longFinancingAnnualRateInput,
      longInitialMarginRatioInput,
      longMaintenanceMarginRatioInput,
      positionCostMode,
      regulatoryFeeRateInput,
      slippageRateInput,
      replaySettingsAssetClassOptions,
      replaySettingsDensityOptions,
      replaySettingsAllowLongOptions,
      replaySettingsAllowShortOptions,
      replaySettingsPositionCostOptions,
      replaySettingsFreeReplayEndSettlementModeOptions,
      replaySettingsSettlementModeOptions,
      marketPresetChips,
      replaySettingsStampDutyOptions,
      replaySettingsTradeAmountOptions,
      setContractMultiplierInput,
      setCommissionMinimumFeeInput,
      setCommissionRateInput,
      setFundingRateInput,
      setInitialSecuritiesInput,
      setLongFinancingAnnualRateInput,
      setLongInitialMarginRatioInput,
      setLongMaintenanceMarginRatioInput,
      setMakerFeeRateInput,
      setMinTradeStepInput,
      setPlatformFeeMinimumFeeInput,
      setPlatformFeeRateInput,
      setRegulatoryFeeRateInput,
      setSlippageRateInput,
      setShortInitialMarginRatioInput,
      setShortMaintenanceMarginRatioInput,
      setStampDutyRateInput,
      setTransactionLevyMinimumFeeInput,
      setTransactionLevyRateInput,
      setTakerFeeRateInput,
      setShortBorrowAnnualRateInput,
      setTradeMarkerDensityRatio,
      setTransferFeeRateInput,
      isSaveDisabled,
      allowLongMarginTrading,
      allowShortSelling,
      stampDutyMode,
      stampDutyRateInput,
      transactionLevyMinimumFeeInput,
      transactionLevyRateInput,
      shortInitialMarginRatioInput,
      shortMaintenanceMarginRatioInput,
      shortBorrowAnnualRateInput,
      onAllowLongMarginTradingChange,
      tradeAmountIncludesFees,
      freeReplayEndSettlementMode,
      tradeMarkerDensityHelpText,
      tradeMarkerDensityLevel,
      tradeMarkerDensityLevelSuffix,
      tradeMarkerDensityTitle,
      tradingAssetClass,
      activeTradingMarketPresetLabel,
      takerFeeRateInput,
      canSaveTradingMarketPresetToCurrent,
      isTradingMarketPresetDirty,
      tradeSettlementMode,
      transferFeeRateInput,
      onFreeReplayEndSettlementModeChange
    ]
  );
};
