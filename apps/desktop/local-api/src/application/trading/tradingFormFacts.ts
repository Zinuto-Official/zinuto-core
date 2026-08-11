// SPDX-License-Identifier: GPL-3.0-only

import {
  BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID,
  BUILT_IN_TRADING_MARKET_PRESET_IDS,
  DEFAULT_TRADING_MARKET_PRESET_ID,
  DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS,
  DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID,
  ORDER_INPUT_MODES,
  PRICE_MODES,
  TRADING_RULE_PRESET_CATALOG_VERSION,
  type BuiltInTradingMarketPresetId,
  type TradingAssetClass,
  type TradingMarketPresetRuntimeSettings,
} from '@zinuto/shared/trading';

export type TrainerTradingPresetFormValues = {
  assetClass: TradingAssetClass;
  tradeSettlementMode: 'T0' | 'T1';
  minTradeStepInput: string;
  commissionRateInput: string;
  makerFeeRateInput: string;
  takerFeeRateInput: string;
  fundingRateInput: string;
  contractMultiplierInput: string;
  slippageRateInput: string;
  stampDutyRateInput: string;
  stampDutyMode: 'BUY' | 'SELL' | 'DOUBLE';
  transferFeeRateInput: string;
  regulatoryFeeRateInput: string;
  commissionMinimumFeeInput: string;
  transactionLevyRateInput: string;
  transactionLevyMinimumFeeInput: string;
  platformFeeRateInput: string;
  platformFeeMinimumFeeInput: string;
  longFinancingAnnualRateInput: string;
  longInitialMarginRatioInput: string;
  longMaintenanceMarginRatioInput: string;
  allowLongMarginTrading: boolean;
  allowShortSelling: boolean;
  shortBorrowAnnualRateInput: string;
  shortInitialMarginRatioInput: string;
  shortMaintenanceMarginRatioInput: string;
};

export type TrainerTradingFormFacts = {
  schemaVersion: 'trainer-trading-form-facts.v1';
  catalogVersion: string;
  orderInputModes: string[];
  priceModes: string[];
  assetClasses: TradingAssetClass[];
  builtInPresetIds: BuiltInTradingMarketPresetId[];
  builtInPresetAssetClassById: Record<BuiltInTradingMarketPresetId, TradingAssetClass>;
  defaultPresetIdByAssetClass: Record<TradingAssetClass, BuiltInTradingMarketPresetId>;
  defaultPresetId: BuiltInTradingMarketPresetId;
  presetAvailabilityById: Record<
    BuiltInTradingMarketPresetId,
    {
      available: boolean;
      disabledReasonCode: string | null;
    }
  >;
  presetValuesById: Record<BuiltInTradingMarketPresetId, TrainerTradingPresetFormValues>;
};

const toPresetInputString = (value: number): string => String(value);

const toTrainerTradingPresetFormValues = (
  preset: TradingMarketPresetRuntimeSettings,
): TrainerTradingPresetFormValues => ({
  assetClass: preset.assetClass,
  tradeSettlementMode: preset.tradeSettlementMode,
  minTradeStepInput: toPresetInputString(preset.minTradeStep),
  commissionRateInput: toPresetInputString(preset.commissionRate),
  makerFeeRateInput: toPresetInputString(preset.makerFeeRate),
  takerFeeRateInput: toPresetInputString(preset.takerFeeRate),
  fundingRateInput: toPresetInputString(preset.fundingRate),
  contractMultiplierInput: toPresetInputString(preset.contractMultiplier),
  slippageRateInput: toPresetInputString(preset.slippageRate),
  stampDutyRateInput: toPresetInputString(preset.stampDutyRate),
  stampDutyMode: preset.stampDutyMode,
  transferFeeRateInput: toPresetInputString(preset.transferFeeRate),
  regulatoryFeeRateInput: toPresetInputString(preset.regulatoryFeeRate),
  commissionMinimumFeeInput: toPresetInputString(preset.commissionMinimumFee),
  transactionLevyRateInput: toPresetInputString(preset.transactionLevyRate),
  transactionLevyMinimumFeeInput: toPresetInputString(
    preset.transactionLevyMinimumFee,
  ),
  platformFeeRateInput: toPresetInputString(preset.platformFeeRate),
  platformFeeMinimumFeeInput: toPresetInputString(preset.platformFeeMinimumFee),
  longFinancingAnnualRateInput: toPresetInputString(
    preset.longFinancingAnnualRate,
  ),
  longInitialMarginRatioInput: toPresetInputString(preset.longInitialMarginRatio),
  longMaintenanceMarginRatioInput: toPresetInputString(
    preset.longMaintenanceMarginRatio,
  ),
  allowLongMarginTrading: preset.allowLongMarginTrading,
  allowShortSelling: preset.allowShortSelling,
  shortBorrowAnnualRateInput: toPresetInputString(preset.shortBorrowAnnualRate),
  shortInitialMarginRatioInput: toPresetInputString(
    preset.shortInitialMarginRatio,
  ),
  shortMaintenanceMarginRatioInput: toPresetInputString(
    preset.shortMaintenanceMarginRatio,
  ),
});

export const buildTrainerTradingFormFacts = (): TrainerTradingFormFacts => ({
  schemaVersion: 'trainer-trading-form-facts.v1',
  catalogVersion: TRADING_RULE_PRESET_CATALOG_VERSION,
  orderInputModes: [...ORDER_INPUT_MODES],
  priceModes: [...PRICE_MODES],
  assetClasses: ['STOCK', 'FUTURES', 'FOREX', 'CRYPTO'],
  builtInPresetIds: [...BUILT_IN_TRADING_MARKET_PRESET_IDS],
  builtInPresetAssetClassById: { ...BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID },
  defaultPresetIdByAssetClass: { ...DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS },
  defaultPresetId: DEFAULT_TRADING_MARKET_PRESET_ID,
  presetAvailabilityById: BUILT_IN_TRADING_MARKET_PRESET_IDS.reduce(
    (result, presetId) => {
      result[presetId] = {
        available: true,
        disabledReasonCode: null,
      };
      return result;
    },
    {} as TrainerTradingFormFacts['presetAvailabilityById'],
  ),
  presetValuesById: BUILT_IN_TRADING_MARKET_PRESET_IDS.reduce(
    (result, presetId) => {
      result[presetId] = toTrainerTradingPresetFormValues(
        DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID[presetId],
      );
      return result;
    },
    {} as TrainerTradingFormFacts['presetValuesById'],
  ),
});
