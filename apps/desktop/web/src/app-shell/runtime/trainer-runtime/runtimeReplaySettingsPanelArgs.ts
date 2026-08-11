// SPDX-License-Identifier: GPL-3.0-only

import { useReplayTrainerSettingsModalProps } from "@/app-shell/useReplayTrainerSettingsModalProps";

type ReplaySettingsPanelHookArgs = Parameters<
  typeof useReplayTrainerSettingsModalProps
>[0];

type ReplaySettingsPanelAliasedArgs = Omit<
  ReplaySettingsPanelHookArgs,
  | "onTradingAssetClassChange"
  | "onStampDutyModeChange"
  | "onTradeSettlementModeChange"
  | "onFreeReplayEndSettlementModeChange"
  | "onSelectTradingMarketPreset"
  | "onCreateTradingMarketPresetFromCurrent"
  | "onRenameTradingMarketPresetById"
  | "onDeleteTradingMarketPresetById"
  | "onResetAllTradingAssetParameters"
  | "onSaveTradingMarketPresetToCurrent"
  | "onSaveTradingMarketPresetAsNew"
  | "onPositionCostModeChange"
  | "onAllowLongMarginTradingChange"
  | "onAllowShortSellingChange"
  | "onTradeAmountIncludesFeesChange"
> & {
  handleTradingAssetClassChange: ReplaySettingsPanelHookArgs["onTradingAssetClassChange"];
  setStampDutyMode: ReplaySettingsPanelHookArgs["onStampDutyModeChange"];
  setTradeSettlementMode: ReplaySettingsPanelHookArgs["onTradeSettlementModeChange"];
  setFreeReplayEndSettlementMode: ReplaySettingsPanelHookArgs["onFreeReplayEndSettlementModeChange"];
  handleTradingMarketPresetKeyChange: ReplaySettingsPanelHookArgs["onSelectTradingMarketPreset"];
  handleCreateTradingMarketPresetFromCurrent: ReplaySettingsPanelHookArgs["onCreateTradingMarketPresetFromCurrent"];
  handleRenameTradingMarketPresetById: ReplaySettingsPanelHookArgs["onRenameTradingMarketPresetById"];
  handleDeleteTradingMarketPresetById: ReplaySettingsPanelHookArgs["onDeleteTradingMarketPresetById"];
  resetAllTradingAssetParameters: ReplaySettingsPanelHookArgs["onResetAllTradingAssetParameters"];
  handleSaveTradingMarketPresetToCurrent: ReplaySettingsPanelHookArgs["onSaveTradingMarketPresetToCurrent"];
  handleSaveTradingMarketPresetAsNew: ReplaySettingsPanelHookArgs["onSaveTradingMarketPresetAsNew"];
  setPositionCostMode: ReplaySettingsPanelHookArgs["onPositionCostModeChange"];
  handleAllowLongMarginTradingChange: ReplaySettingsPanelHookArgs["onAllowLongMarginTradingChange"];
  handleAllowShortSellingChange: ReplaySettingsPanelHookArgs["onAllowShortSellingChange"];
  setTradeAmountIncludesFees: ReplaySettingsPanelHookArgs["onTradeAmountIncludesFeesChange"];
};

export const buildRuntimeReplaySettingsPanelArgs = ({
  handleTradingAssetClassChange,
  setStampDutyMode,
  setTradeSettlementMode,
  setFreeReplayEndSettlementMode,
  handleTradingMarketPresetKeyChange,
  handleCreateTradingMarketPresetFromCurrent,
  handleRenameTradingMarketPresetById,
  handleDeleteTradingMarketPresetById,
  resetAllTradingAssetParameters,
  handleSaveTradingMarketPresetToCurrent,
  handleSaveTradingMarketPresetAsNew,
  setPositionCostMode,
  handleAllowLongMarginTradingChange,
  handleAllowShortSellingChange,
  setTradeAmountIncludesFees,
  ...rest
}: ReplaySettingsPanelAliasedArgs): ReplaySettingsPanelHookArgs => ({
  ...rest,
  onTradingAssetClassChange: handleTradingAssetClassChange,
  onStampDutyModeChange: setStampDutyMode,
  onTradeSettlementModeChange: setTradeSettlementMode,
  onFreeReplayEndSettlementModeChange: setFreeReplayEndSettlementMode,
  onSelectTradingMarketPreset: handleTradingMarketPresetKeyChange,
  onCreateTradingMarketPresetFromCurrent:
    handleCreateTradingMarketPresetFromCurrent,
  onRenameTradingMarketPresetById: handleRenameTradingMarketPresetById,
  onDeleteTradingMarketPresetById: handleDeleteTradingMarketPresetById,
  onResetAllTradingAssetParameters: resetAllTradingAssetParameters,
  onSaveTradingMarketPresetToCurrent: handleSaveTradingMarketPresetToCurrent,
  onSaveTradingMarketPresetAsNew: handleSaveTradingMarketPresetAsNew,
  onPositionCostModeChange: setPositionCostMode,
  onAllowLongMarginTradingChange: handleAllowLongMarginTradingChange,
  onAllowShortSellingChange: handleAllowShortSellingChange,
  onTradeAmountIncludesFeesChange: setTradeAmountIncludesFees,
});
