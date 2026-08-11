// SPDX-License-Identifier: GPL-3.0-only

import type { ApiBacktestTradingSettings } from "@/api";
import type { ReplayTrainerSettingsPanelProps } from "@/domains/trainer/ReplayTrainerSettingsPanel";
import { parseTradingSettingsDraft } from "@/domains/trainer/tradingSettingsFormDomain";
import {
  DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS,
  normalizeTradingAssetClass,
  type TradingAssetClassId,
  type TradingMarketPresetId,
} from "@/domains/trainer/tradingMarketPresets";

export type StrategyBacktestEnvironmentSelection = {
  assetClass: TradingAssetClassId;
  marketPresetId: TradingMarketPresetId;
};

export type StrategyBacktestEnvironmentSource = {
  assetClass?: unknown;
  marketPresetId?: unknown;
};

export const resolveStrategyBacktestEnvironmentSuggestion = (
  source: StrategyBacktestEnvironmentSource | null | undefined,
): StrategyBacktestEnvironmentSelection | null => {
  if (!source) {
    return null;
  }
  const assetClass = normalizeTradingAssetClass(source.assetClass, "STOCK");
  const marketPresetId =
    String(source.marketPresetId || "").trim() ||
    DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS[assetClass];
  return {
    assetClass,
    marketPresetId,
  };
};

export const areStrategyBacktestEnvironmentSelectionsEqual = (
  left: StrategyBacktestEnvironmentSelection | null | undefined,
  right: StrategyBacktestEnvironmentSelection | null | undefined,
): boolean =>
  Boolean(left) &&
  Boolean(right) &&
  left?.assetClass === right?.assetClass &&
  left?.marketPresetId === right?.marketPresetId;

export const shouldApplyStrategyBacktestEnvironmentSuggestion = ({
  current,
  suggestion,
  touched,
}: {
  current: StrategyBacktestEnvironmentSelection | null;
  suggestion: StrategyBacktestEnvironmentSelection;
  touched: boolean;
}): boolean =>
  !current ||
  (!touched && !areStrategyBacktestEnvironmentSelectionsEqual(current, suggestion));

export const resolveSelectedStrategyBacktestMarketPresetId = (
  panel: Pick<ReplayTrainerSettingsPanelProps, "marketPresetChips">,
): TradingMarketPresetId =>
  panel.marketPresetChips.find((chip) => chip.isSelected)?.id ?? "";

export const buildStrategyBacktestTradingSettingsFromPanel = (
  panel: ReplayTrainerSettingsPanelProps,
  initialCapital: number,
):
  | {
    ok: true;
    tradingSettings: ApiBacktestTradingSettings;
  }
  | {
    ok: false;
    errorCode: string;
  } => {
  const parsed = parseTradingSettingsDraft({
    initialSecuritiesInput: String(Math.floor(initialCapital)),
    assetClass: panel.tradingAssetClass,
    marketPresetId: resolveSelectedStrategyBacktestMarketPresetId(panel),
    minTradeStepInput: panel.minTradeStepInput,
    commissionRateInput: panel.commissionRateInput,
    makerFeeRateInput: panel.makerFeeRateInput,
    takerFeeRateInput: panel.takerFeeRateInput,
    fundingRateInput: panel.fundingRateInput,
    contractMultiplierInput: panel.contractMultiplierInput,
    transferFeeRateInput: panel.transferFeeRateInput,
    regulatoryFeeRateInput: panel.regulatoryFeeRateInput,
    platformFeeRateInput: panel.platformFeeRateInput,
    transactionLevyRateInput: panel.transactionLevyRateInput,
    slippageRateInput: panel.slippageRateInput,
    stampDutyRateInput: panel.stampDutyRateInput,
    commissionMinimumFeeInput: panel.commissionMinimumFeeInput,
    platformFeeMinimumFeeInput: panel.platformFeeMinimumFeeInput,
    transactionLevyMinimumFeeInput: panel.transactionLevyMinimumFeeInput,
    longFinancingAnnualRateInput: panel.longFinancingAnnualRateInput,
    longInitialMarginRatioInput: panel.longInitialMarginRatioInput,
    longMaintenanceMarginRatioInput: panel.longMaintenanceMarginRatioInput,
    shortBorrowAnnualRateInput: panel.shortBorrowAnnualRateInput,
    shortInitialMarginRatioInput: panel.shortInitialMarginRatioInput,
    shortMaintenanceMarginRatioInput: panel.shortMaintenanceMarginRatioInput,
    stampDutyMode: panel.stampDutyMode,
    positionCostMode: panel.positionCostMode,
    tradeSettlementMode: panel.tradeSettlementMode,
    freeReplayEndSettlementMode: panel.freeReplayEndSettlementMode,
    tradeAmountIncludesFees: panel.tradeAmountIncludesFees,
    allowLongMarginTrading: panel.allowLongMarginTrading,
    allowShortSelling: panel.allowShortSelling,
  });
  if (!parsed.ok) {
    return {
      ok: false,
      errorCode: parsed.errorCode,
    };
  }
  return {
    ok: true,
    tradingSettings: {
      ...parsed.payload,
    },
  };
};
