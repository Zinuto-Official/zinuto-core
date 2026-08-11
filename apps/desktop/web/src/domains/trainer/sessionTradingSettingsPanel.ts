// SPDX-License-Identifier: GPL-3.0-only

import type { TradingSettings } from '@zinuto/shared/trading';
import type { ReplayTrainerSettingsPanelProps } from '@/domains/trainer/ReplayTrainerSettingsPanel';
import type { TradingMarketPresetId } from '@/domains/trainer/tradingMarketPresets';

const toInputString = (value: number): string => String(value);

export const applySessionTradingSettingsToReplayPanelProps = ({
  panel,
  settings,
  activeTradingMarketPresetLabel,
}: {
  panel: ReplayTrainerSettingsPanelProps;
  settings: TradingSettings;
  activeTradingMarketPresetLabel: string;
}): ReplayTrainerSettingsPanelProps => {
  const marketPresetId = String(settings.marketPresetId || '').trim() as TradingMarketPresetId;
  return {
    ...panel,
    initialSecuritiesInput: toInputString(settings.initialSecuritiesBalance),
    tradingAssetClass: settings.assetClass,
    minTradeStepInput: toInputString(settings.minTradeStep),
    commissionRateInput: toInputString(settings.commissionRate),
    makerFeeRateInput: toInputString(settings.makerFeeRate),
    takerFeeRateInput: toInputString(settings.takerFeeRate),
    fundingRateInput: toInputString(settings.fundingRate),
    contractMultiplierInput: toInputString(settings.contractMultiplier),
    transferFeeRateInput: toInputString(settings.transferFeeRate),
    regulatoryFeeRateInput: toInputString(settings.regulatoryFeeRate),
    platformFeeRateInput: toInputString(settings.platformFeeRate),
    transactionLevyRateInput: toInputString(settings.transactionLevyRate),
    transactionLevyMinimumFeeInput: toInputString(settings.transactionLevyMinimumFee),
    slippageRateInput: toInputString(settings.slippageRate),
    stampDutyRateInput: toInputString(settings.stampDutyRate),
    commissionMinimumFeeInput: toInputString(settings.commissionMinimumFee),
    platformFeeMinimumFeeInput: toInputString(settings.platformFeeMinimumFee),
    longFinancingAnnualRateInput: toInputString(settings.longFinancingAnnualRate),
    longInitialMarginRatioInput: toInputString(settings.longInitialMarginRatio),
    longMaintenanceMarginRatioInput: toInputString(settings.longMaintenanceMarginRatio),
    shortBorrowAnnualRateInput: toInputString(settings.shortBorrowAnnualRate),
    shortInitialMarginRatioInput: toInputString(settings.shortInitialMarginRatio),
    shortMaintenanceMarginRatioInput: toInputString(settings.shortMaintenanceMarginRatio),
    stampDutyMode: settings.stampDutyMode,
    tradeSettlementMode: settings.tradeSettlementMode,
    freeReplayEndSettlementMode: settings.freeReplayEndSettlementMode,
    positionCostMode: settings.positionCostMode,
    tradeAmountIncludesFees: settings.tradeAmountIncludesFees,
    allowLongMarginTrading: settings.allowLongMarginTrading,
    allowShortSelling: settings.allowShortSelling,
    activeTradingMarketPresetLabel,
    marketPresetChips: panel.marketPresetChips.map((chip) => ({
      ...chip,
      isSelected: chip.id === marketPresetId,
    })),
  };
};
