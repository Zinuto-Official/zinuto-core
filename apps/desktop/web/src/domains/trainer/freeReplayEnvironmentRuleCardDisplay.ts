// SPDX-License-Identifier: GPL-3.0-only

import type {
  ApiFreeReplayEnvironmentRuleCard,
  ApiFreeReplayPoolDefaultEnvironment,
} from "@/api";
import { getTradingSettingsText } from "@/ui/config/uiConfig";

type TradingSettingsText = ReturnType<typeof getTradingSettingsText>;
type EnvironmentAssetClass = ApiFreeReplayPoolDefaultEnvironment["assetClass"];
type NonStockEnvironmentAssetClass = Exclude<EnvironmentAssetClass, "STOCK">;

export type FreeReplayEnvironmentRuleCardDisplay = {
  id: ApiFreeReplayEnvironmentRuleCard["id"];
  label: string;
  value: string;
};

const toNonStockAssetClass = (
  assetClass: EnvironmentAssetClass,
): NonStockEnvironmentAssetClass =>
  assetClass === "STOCK" ? "CRYPTO" : assetClass;

const toRuleCardLabel = (
  id: ApiFreeReplayEnvironmentRuleCard["id"],
  assetClass: EnvironmentAssetClass,
  tradingSettingsText: TradingSettingsText,
): string => {
  switch (id) {
    case "settlement":
      return tradingSettingsText.tradeSettlementModeLabel;
    case "direction":
      return tradingSettingsText.allowShortSellingLabel;
    case "longPermission":
      return tradingSettingsText.allowLongMarginTradingLabelByAssetClass[
        assetClass
      ];
    case "minTradeStep":
      return tradingSettingsText.minTradeStepLabel;
    case "commissionRate":
      return tradingSettingsText.commissionRateLabel;
    case "commissionMinimumFee":
      return tradingSettingsText.commissionMinimumFeeLabel;
    case "platformFeeRate":
      return tradingSettingsText.platformFeeRateLabel;
    case "platformFeeMinimumFee":
      return tradingSettingsText.platformFeeMinimumFeeLabel;
    case "transactionLevyRate":
      return tradingSettingsText.transactionLevyRateLabel;
    case "transactionLevyMinimumFee":
      return tradingSettingsText.transactionLevyMinimumFeeLabel;
    case "transferFeeRate":
      return tradingSettingsText.transferFeeRateLabel;
    case "regulatoryFeeRate":
      return tradingSettingsText.regulatoryFeeRateLabel;
    case "stampDutyRate":
      return tradingSettingsText.stampDutyRateLabel;
    case "stampDutyMode":
      return tradingSettingsText.stampDutyModeLabel;
    case "makerFeeRate":
      return tradingSettingsText.makerFeeRateLabelByAssetClass[
        toNonStockAssetClass(assetClass)
      ];
    case "takerFeeRate":
      return tradingSettingsText.takerFeeRateLabelByAssetClass[
        toNonStockAssetClass(assetClass)
      ];
    case "fundingRate":
      return tradingSettingsText.fundingRateLabelByAssetClass[
        toNonStockAssetClass(assetClass)
      ];
    case "slippageRate":
      return tradingSettingsText.slippageRateLabel;
    case "contractMultiplier":
      return tradingSettingsText.contractMultiplierLabelByAssetClass[assetClass];
    case "longInitialMargin":
      return tradingSettingsText.longInitialMarginRatioLabel;
    case "longMaintenanceMargin":
      return tradingSettingsText.longMaintenanceMarginRatioLabel;
    case "longFinancing":
      return tradingSettingsText.longFinancingAnnualRateLabel;
    case "shortInitialMargin":
      return tradingSettingsText.shortInitialMarginRatioLabel;
    case "shortMaintenanceMargin":
      return tradingSettingsText.shortMaintenanceMarginRatioLabel;
    case "shortBorrow":
      return tradingSettingsText.shortBorrowAnnualRateLabel;
    default:
      return id;
  }
};

const toRuleCardValue = (
  card: ApiFreeReplayEnvironmentRuleCard,
  assetClass: EnvironmentAssetClass,
  tradingSettingsText: TradingSettingsText,
): string => {
  switch (card.valueKind) {
    case "TRADE_SETTLEMENT_MODE":
      return (
        tradingSettingsText.importRuleSummarySettlementModeLabels[
          card.value as keyof typeof tradingSettingsText.importRuleSummarySettlementModeLabels
        ] ?? card.value
      );
    case "DIRECTION":
      return (
        tradingSettingsText.importRuleSummaryDirectionLabels[
          card.value as keyof typeof tradingSettingsText.importRuleSummaryDirectionLabels
        ] ?? card.value
      );
    case "LONG_MARGIN_PERMISSION":
      return (
        tradingSettingsText.allowLongMarginTradingOptionLabels[
          card.value as keyof typeof tradingSettingsText.allowLongMarginTradingOptionLabels
        ] ?? card.value
      );
    case "MIN_TRADE_STEP": {
      const unit =
        tradingSettingsText.minTradeStepUnitPlaceholderByAssetClass[assetClass];
      return `${card.value} ${unit}`.trim();
    }
    case "STAMP_DUTY_MODE":
      return (
        tradingSettingsText.stampDutyModeOptionLabels[
          card.value as keyof typeof tradingSettingsText.stampDutyModeOptionLabels
        ] ?? card.value
      );
    default:
      return card.value;
  }
};

export const toFreeReplayEnvironmentRuleCardDisplays = (
  cards: readonly ApiFreeReplayEnvironmentRuleCard[],
  assetClass: EnvironmentAssetClass,
  tradingSettingsText: TradingSettingsText,
): FreeReplayEnvironmentRuleCardDisplay[] =>
  cards.map((card) => ({
    id: card.id,
    label: toRuleCardLabel(card.id, assetClass, tradingSettingsText),
    value: toRuleCardValue(card, assetClass, tradingSettingsText),
  }));
