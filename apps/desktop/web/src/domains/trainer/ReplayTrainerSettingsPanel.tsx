// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from 'react';
import type { TradingAssetClassId, TradingMarketPresetId } from '@/domains/trainer/tradingMarketPresets';

export type ReplayTrainerSettingsSaveResult =
  | boolean
  | void
  | Promise<boolean | void>;

export type ReplayTrainerSettingsPanelProps = {
  tradeMarkerDensityTitle: string;
  tradeMarkerDensityValueText: string;
  tradeMarkerDensityHelpText: string;
  tradeMarkerDensityLevel: number;
  replaySettingsDensityOptions: Array<{ value: string; label: string }>;
  onTradeMarkerDensityLevelChange: (value: string) => void;

  initialSecuritiesInput: string;
  onInitialSecuritiesInputChange: (value: string) => void;
  isInitialSecuritiesEditable: boolean;
  initialSecuritiesLockedReason: string;
  tradingAssetClass: TradingAssetClassId;
  replaySettingsAssetClassOptions: Array<{
    value: TradingAssetClassId;
    label: string;
    icon?: ReactNode;
  }>;
  onTradingAssetClassChange: (value: TradingAssetClassId) => void;
  minTradeStepInput: string;
  onMinTradeStepInputChange: (value: string) => void;
  commissionRateInput: string;
  onCommissionRateInputChange: (value: string) => void;
  makerFeeRateInput: string;
  onMakerFeeRateInputChange: (value: string) => void;
  takerFeeRateInput: string;
  onTakerFeeRateInputChange: (value: string) => void;
  fundingRateInput: string;
  onFundingRateInputChange: (value: string) => void;
  contractMultiplierInput: string;
  onContractMultiplierInputChange: (value: string) => void;
  transferFeeRateInput: string;
  onTransferFeeRateInputChange: (value: string) => void;
  regulatoryFeeRateInput: string;
  onRegulatoryFeeRateInputChange: (value: string) => void;
  platformFeeRateInput: string;
  onPlatformFeeRateInputChange: (value: string) => void;
  transactionLevyRateInput: string;
  onTransactionLevyRateInputChange: (value: string) => void;
  slippageRateInput: string;
  onSlippageRateInputChange: (value: string) => void;
  stampDutyRateInput: string;
  onStampDutyRateInputChange: (value: string) => void;
  commissionMinimumFeeInput: string;
  onCommissionMinimumFeeInputChange: (value: string) => void;
  platformFeeMinimumFeeInput: string;
  onPlatformFeeMinimumFeeInputChange: (value: string) => void;
  transactionLevyMinimumFeeInput: string;
  onTransactionLevyMinimumFeeInputChange: (value: string) => void;
  longFinancingAnnualRateInput: string;
  onLongFinancingAnnualRateInputChange: (value: string) => void;
  longInitialMarginRatioInput: string;
  onLongInitialMarginRatioInputChange: (value: string) => void;
  longMaintenanceMarginRatioInput: string;
  onLongMaintenanceMarginRatioInputChange: (value: string) => void;
  shortBorrowAnnualRateInput: string;
  onShortBorrowAnnualRateInputChange: (value: string) => void;
  shortInitialMarginRatioInput: string;
  onShortInitialMarginRatioInputChange: (value: string) => void;
  shortMaintenanceMarginRatioInput: string;
  onShortMaintenanceMarginRatioInputChange: (value: string) => void;

  replaySettingsStampDutyOptions: Array<{ value: 'BUY' | 'SELL' | 'DOUBLE'; label: string }>;
  stampDutyMode: 'BUY' | 'SELL' | 'DOUBLE';
  onStampDutyModeChange: (value: 'BUY' | 'SELL' | 'DOUBLE') => void;

  replaySettingsSettlementModeOptions: Array<{ value: 'T0' | 'T1'; label: string }>;
  tradeSettlementMode: 'T0' | 'T1';
  onTradeSettlementModeChange: (value: 'T0' | 'T1') => void;
  replaySettingsFreeReplayEndSettlementModeOptions: Array<{
    value: 'FORCE_CLOSE' | 'CURRENT_TOTAL_ASSET';
    label: string;
  }>;
  freeReplayEndSettlementMode: 'FORCE_CLOSE' | 'CURRENT_TOTAL_ASSET';
  onFreeReplayEndSettlementModeChange: (value: 'FORCE_CLOSE' | 'CURRENT_TOTAL_ASSET') => void;
  marketPresetChips: Array<{
    id: TradingMarketPresetId;
    label: string;
    isBuiltIn: boolean;
    isCustom: boolean;
    isSelected: boolean;
    isUsedBySamplePool: boolean;
    canDelete: boolean;
  }>;
  onSelectTradingMarketPreset: (presetId: TradingMarketPresetId) => void;
  onCreateTradingMarketPresetFromCurrent: () => void;
  onRenameTradingMarketPresetById: (presetId: TradingMarketPresetId, name: string) => void;
  onDeleteTradingMarketPresetById: (presetId: TradingMarketPresetId) => void;
  onResetAllTradingAssetParameters: () => void;
  isTradingMarketPresetDirty: boolean;
  canSaveTradingMarketPresetToCurrent: boolean;
  onSaveTradingMarketPresetToCurrent: () => void;
  onSaveTradingMarketPresetAsNew: (name: string) => void;
  activeTradingMarketPresetLabel: string;

  replaySettingsPositionCostOptions: Array<{ value: 'DILUTED' | 'AVERAGE_OPEN'; label: string }>;
  positionCostMode: 'DILUTED' | 'AVERAGE_OPEN';
  onPositionCostModeChange: (value: 'DILUTED' | 'AVERAGE_OPEN') => void;

  replaySettingsAllowLongOptions: Array<{ value: 'ALLOW' | 'DISALLOW'; label: string }>;
  allowLongMarginTrading: boolean;
  onAllowLongMarginTradingChange: (next: boolean) => void;
  replaySettingsAllowShortOptions: Array<{ value: 'ALLOW' | 'DISALLOW'; label: string }>;
  allowShortSelling: boolean;
  onAllowShortSellingChange: (next: boolean) => void;

  replaySettingsTradeAmountOptions: Array<{ value: 'EXCLUDE_FEES' | 'INCLUDE_FEES'; label: string }>;
  tradeAmountIncludesFees: boolean;
  onTradeAmountIncludesFeesChange: (next: boolean) => void;

  percentSymbol: string;
  onSave: () => ReplayTrainerSettingsSaveResult;
  isSavingTradingSettings: boolean;
  isBusy: boolean;
  isSaveDisabled?: boolean;
};
