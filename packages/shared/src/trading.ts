// SPDX-License-Identifier: GPL-3.0-only

export type StampDutyMode = "BUY" | "SELL" | "DOUBLE";
export type PositionCostMode = "DILUTED" | "AVERAGE_OPEN";
export type TradeSettlementMode = "T0" | "T1";
export type FreeReplayEndSettlementMode = "FORCE_CLOSE" | "CURRENT_TOTAL_ASSET";
export const ORDER_SIDES = ["BUY", "SELL"] as const;
export type OrderSide = (typeof ORDER_SIDES)[number];
export const ORDER_INPUT_MODES = ["LOT", "AMOUNT", "RATIO"] as const;
export type OrderInputMode = (typeof ORDER_INPUT_MODES)[number];
export const PRICE_MODES = ["CUR_CLOSE", "NEXT_OPEN"] as const;
export type PriceMode = (typeof PRICE_MODES)[number];
export type TradingAssetClass =
  | "STOCK"
  | "FUTURES"
  | "FOREX"
  | "CRYPTO";

export const isOrderSide = (value: unknown): value is OrderSide =>
  value === "BUY" || value === "SELL";

export const isOrderInputMode = (value: unknown): value is OrderInputMode =>
  value === "LOT" || value === "AMOUNT" || value === "RATIO";

export const isPriceMode = (value: unknown): value is PriceMode =>
  value === "CUR_CLOSE" || value === "NEXT_OPEN";

export const isTradeSettlementMode = (
  value: unknown,
): value is TradeSettlementMode => value === "T0" || value === "T1";

export const normalizeTradeSettlementMode = (
  value: unknown,
  fallback: TradeSettlementMode = "T0",
): TradeSettlementMode => (isTradeSettlementMode(value) ? value : fallback);

export const normalizePriceMode = (
  value: unknown,
  fallback: PriceMode = "CUR_CLOSE",
): PriceMode => (isPriceMode(value) ? value : fallback);

export interface TradingSettings {
  initialSecuritiesBalance: number;
  assetClass: TradingAssetClass;
  marketPresetId: string;
  minTradeStep: number;
  commissionRate: number;
  makerFeeRate: number;
  takerFeeRate: number;
  fundingRate: number;
  contractMultiplier: number;
  transferFeeRate: number;
  regulatoryFeeRate: number;
  platformFeeRate: number;
  transactionLevyRate: number;
  slippageRate: number;
  stampDutyRate: number;
  commissionMinimumFee: number;
  platformFeeMinimumFee: number;
  transactionLevyMinimumFee: number;
  longFinancingAnnualRate: number;
  longInitialMarginRatio: number;
  longMaintenanceMarginRatio: number;
  shortBorrowAnnualRate: number;
  shortInitialMarginRatio: number;
  shortMaintenanceMarginRatio: number;
  stampDutyMode: StampDutyMode;
  positionCostMode: PositionCostMode;
  tradeSettlementMode: TradeSettlementMode;
  freeReplayEndSettlementMode: FreeReplayEndSettlementMode;
  tradeAmountIncludesFees: boolean;
  allowLongMarginTrading: boolean;
  allowShortSelling: boolean;
}

export const BUILT_IN_TRADING_MARKET_PRESET_IDS = [
  "A_SHARE",
  "HK_STOCK",
  "US_STOCK",
  "JP_STOCK",
  "KR_STOCK",
  "TW_STOCK",
  "FUTURES_COMMODITY",
  "FUTURES_FINANCIAL",
  "FOREX_STANDARD_LOT",
  "FOREX_MICRO_LOT",
  "CRYPTO_SPOT",
  "CRYPTO_USDT_PERP",
] as const;

export type BuiltInTradingMarketPresetId =
  (typeof BUILT_IN_TRADING_MARKET_PRESET_IDS)[number];

export const TRADING_RULE_PRESET_CATALOG_VERSION =
  "2026-04-30-trading-rule-presets-v1";

export const BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID: Record<
  BuiltInTradingMarketPresetId,
  TradingAssetClass
> = {
  A_SHARE: "STOCK",
  HK_STOCK: "STOCK",
  US_STOCK: "STOCK",
  JP_STOCK: "STOCK",
  KR_STOCK: "STOCK",
  TW_STOCK: "STOCK",
  FUTURES_COMMODITY: "FUTURES",
  FUTURES_FINANCIAL: "FUTURES",
  FOREX_STANDARD_LOT: "FOREX",
  FOREX_MICRO_LOT: "FOREX",
  CRYPTO_SPOT: "CRYPTO",
  CRYPTO_USDT_PERP: "CRYPTO",
};

export const DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS: Record<
  TradingAssetClass,
  BuiltInTradingMarketPresetId
> = {
  STOCK: "A_SHARE",
  FUTURES: "FUTURES_COMMODITY",
  FOREX: "FOREX_STANDARD_LOT",
  CRYPTO: "CRYPTO_SPOT",
};

export const DEFAULT_TRADING_MARKET_PRESET_ID: BuiltInTradingMarketPresetId =
  DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS.STOCK;

export type TradingMarketPresetRuntimeSettings = Pick<
  TradingSettings,
  | "assetClass"
  | "marketPresetId"
  | "tradeSettlementMode"
  | "minTradeStep"
  | "commissionRate"
  | "makerFeeRate"
  | "takerFeeRate"
  | "fundingRate"
  | "contractMultiplier"
  | "slippageRate"
  | "stampDutyRate"
  | "stampDutyMode"
  | "transferFeeRate"
  | "regulatoryFeeRate"
  | "commissionMinimumFee"
  | "transactionLevyRate"
  | "transactionLevyMinimumFee"
  | "platformFeeRate"
  | "platformFeeMinimumFee"
  | "longFinancingAnnualRate"
  | "longInitialMarginRatio"
  | "longMaintenanceMarginRatio"
  | "allowLongMarginTrading"
  | "allowShortSelling"
  | "shortBorrowAnnualRate"
  | "shortInitialMarginRatio"
  | "shortMaintenanceMarginRatio"
>;

const STOCK_COMMON: Omit<
  TradingMarketPresetRuntimeSettings,
  | "assetClass"
  | "marketPresetId"
  | "tradeSettlementMode"
  | "minTradeStep"
  | "allowLongMarginTrading"
  | "allowShortSelling"
> = {
  commissionRate: 0.03,
  makerFeeRate: 0,
  takerFeeRate: 0,
  fundingRate: 0,
  contractMultiplier: 1,
  slippageRate: 0.01,
  stampDutyRate: 0,
  stampDutyMode: "SELL",
  transferFeeRate: 0,
  regulatoryFeeRate: 0,
  commissionMinimumFee: 0,
  transactionLevyRate: 0,
  transactionLevyMinimumFee: 0,
  platformFeeRate: 0,
  platformFeeMinimumFee: 0,
  longFinancingAnnualRate: 0,
  longInitialMarginRatio: 100,
  longMaintenanceMarginRatio: 100,
  shortBorrowAnnualRate: 6,
  shortInitialMarginRatio: 150,
  shortMaintenanceMarginRatio: 130,
};

const FUTURES_COMMON: Omit<
  TradingMarketPresetRuntimeSettings,
  | "assetClass"
  | "marketPresetId"
  | "tradeSettlementMode"
  | "minTradeStep"
  | "allowLongMarginTrading"
  | "allowShortSelling"
> = {
  commissionRate: 0,
  makerFeeRate: 1.8,
  takerFeeRate: 0.7,
  fundingRate: 0,
  contractMultiplier: 1,
  slippageRate: 0.008,
  stampDutyRate: 0,
  stampDutyMode: "SELL",
  transferFeeRate: 0,
  regulatoryFeeRate: 0,
  commissionMinimumFee: 0,
  transactionLevyRate: 0,
  transactionLevyMinimumFee: 0,
  platformFeeRate: 0,
  platformFeeMinimumFee: 0,
  longFinancingAnnualRate: 0,
  longInitialMarginRatio: 12,
  longMaintenanceMarginRatio: 8,
  shortBorrowAnnualRate: 0,
  shortInitialMarginRatio: 12,
  shortMaintenanceMarginRatio: 8,
};

const FOREX_COMMON: Omit<
  TradingMarketPresetRuntimeSettings,
  | "assetClass"
  | "marketPresetId"
  | "tradeSettlementMode"
  | "minTradeStep"
  | "allowLongMarginTrading"
  | "allowShortSelling"
> = {
  commissionRate: 0,
  makerFeeRate: 0.0035,
  takerFeeRate: 0.006,
  fundingRate: 3.5,
  contractMultiplier: 100000,
  slippageRate: 0.001,
  stampDutyRate: 0,
  stampDutyMode: "SELL",
  transferFeeRate: 0,
  regulatoryFeeRate: 0,
  commissionMinimumFee: 0,
  transactionLevyRate: 0,
  transactionLevyMinimumFee: 0,
  platformFeeRate: 0,
  platformFeeMinimumFee: 0,
  longFinancingAnnualRate: 0,
  longInitialMarginRatio: 3,
  longMaintenanceMarginRatio: 2,
  shortBorrowAnnualRate: 0,
  shortInitialMarginRatio: 3,
  shortMaintenanceMarginRatio: 2,
};

const CRYPTO_COMMON: Omit<
  TradingMarketPresetRuntimeSettings,
  | "assetClass"
  | "marketPresetId"
  | "tradeSettlementMode"
  | "minTradeStep"
  | "allowLongMarginTrading"
  | "allowShortSelling"
> = {
  commissionRate: 0,
  makerFeeRate: 0.1,
  takerFeeRate: 0.1,
  fundingRate: 0,
  contractMultiplier: 1,
  slippageRate: 0.02,
  stampDutyRate: 0,
  stampDutyMode: "SELL",
  transferFeeRate: 0,
  regulatoryFeeRate: 0,
  commissionMinimumFee: 0,
  transactionLevyRate: 0,
  transactionLevyMinimumFee: 0,
  platformFeeRate: 0,
  platformFeeMinimumFee: 0,
  longFinancingAnnualRate: 0,
  longInitialMarginRatio: 100,
  longMaintenanceMarginRatio: 100,
  shortBorrowAnnualRate: 0,
  shortInitialMarginRatio: 100,
  shortMaintenanceMarginRatio: 100,
};

export const DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID: Record<
  BuiltInTradingMarketPresetId,
  TradingMarketPresetRuntimeSettings
> = {
  A_SHARE: {
    assetClass: "STOCK",
    marketPresetId: "A_SHARE",
    tradeSettlementMode: "T1",
    minTradeStep: 100,
    allowLongMarginTrading: false,
    allowShortSelling: false,
    ...STOCK_COMMON,
    commissionRate: 0.03,
    stampDutyRate: 0.05,
    transferFeeRate: 0.001,
    regulatoryFeeRate: 0.00341,
    commissionMinimumFee: 5,
  },
  HK_STOCK: {
    assetClass: "STOCK",
    marketPresetId: "HK_STOCK",
    tradeSettlementMode: "T0",
    minTradeStep: 1,
    allowLongMarginTrading: true,
    allowShortSelling: true,
    ...STOCK_COMMON,
    commissionRate: 0.03,
    stampDutyRate: 0.1,
    stampDutyMode: "DOUBLE",
    transferFeeRate: 0.00015,
    transactionLevyRate: 0.0027,
    regulatoryFeeRate: 0.00565,
    platformFeeRate: 0.0042,
    platformFeeMinimumFee: 2,
    longFinancingAnnualRate: 6.8,
    longInitialMarginRatio: 50,
    longMaintenanceMarginRatio: 30,
    shortBorrowAnnualRate: 7.5,
  },
  US_STOCK: {
    assetClass: "STOCK",
    marketPresetId: "US_STOCK",
    tradeSettlementMode: "T0",
    minTradeStep: 1,
    allowLongMarginTrading: true,
    allowShortSelling: true,
    ...STOCK_COMMON,
    commissionRate: 0,
    stampDutyRate: 0,
    transactionLevyRate: 0.000195,
    transactionLevyMinimumFee: 0.01,
    regulatoryFeeRate: 0.00206,
    longFinancingAnnualRate: 6.8,
    longInitialMarginRatio: 50,
    longMaintenanceMarginRatio: 30,
    shortBorrowAnnualRate: 3.5,
  },
  JP_STOCK: {
    assetClass: "STOCK",
    marketPresetId: "JP_STOCK",
    tradeSettlementMode: "T0",
    minTradeStep: 1,
    allowLongMarginTrading: true,
    allowShortSelling: true,
    ...STOCK_COMMON,
    commissionRate: 0,
    stampDutyRate: 0,
    commissionMinimumFee: 0,
    longFinancingAnnualRate: 4.5,
    longInitialMarginRatio: 50,
    longMaintenanceMarginRatio: 30,
    shortBorrowAnnualRate: 5,
  },
  KR_STOCK: {
    assetClass: "STOCK",
    marketPresetId: "KR_STOCK",
    tradeSettlementMode: "T0",
    minTradeStep: 1,
    allowLongMarginTrading: true,
    allowShortSelling: true,
    ...STOCK_COMMON,
    commissionRate: 0.015,
    stampDutyRate: 0.15,
    longFinancingAnnualRate: 6.5,
    longInitialMarginRatio: 50,
    longMaintenanceMarginRatio: 30,
    shortBorrowAnnualRate: 7,
  },
  TW_STOCK: {
    assetClass: "STOCK",
    marketPresetId: "TW_STOCK",
    tradeSettlementMode: "T0",
    minTradeStep: 1,
    allowLongMarginTrading: true,
    allowShortSelling: true,
    ...STOCK_COMMON,
    commissionRate: 0.1425,
    stampDutyRate: 0.3,
    commissionMinimumFee: 20,
    longFinancingAnnualRate: 6.5,
    longInitialMarginRatio: 50,
    longMaintenanceMarginRatio: 30,
    shortBorrowAnnualRate: 7,
  },
  FUTURES_COMMODITY: {
    assetClass: "FUTURES",
    marketPresetId: "FUTURES_COMMODITY",
    tradeSettlementMode: "T0",
    minTradeStep: 1,
    allowLongMarginTrading: true,
    allowShortSelling: true,
    ...FUTURES_COMMON,
    makerFeeRate: 1.8,
    takerFeeRate: 0.7,
    contractMultiplier: 10,
    shortInitialMarginRatio: 12,
    shortMaintenanceMarginRatio: 8,
  },
  FUTURES_FINANCIAL: {
    assetClass: "FUTURES",
    marketPresetId: "FUTURES_FINANCIAL",
    tradeSettlementMode: "T0",
    minTradeStep: 1,
    allowLongMarginTrading: true,
    allowShortSelling: true,
    ...FUTURES_COMMON,
    makerFeeRate: 1.2,
    takerFeeRate: 0.45,
    contractMultiplier: 300,
    slippageRate: 0.006,
    shortInitialMarginRatio: 10,
    shortMaintenanceMarginRatio: 7,
  },
  FOREX_STANDARD_LOT: {
    assetClass: "FOREX",
    marketPresetId: "FOREX_STANDARD_LOT",
    tradeSettlementMode: "T0",
    minTradeStep: 0.01,
    allowLongMarginTrading: true,
    allowShortSelling: true,
    ...FOREX_COMMON,
    contractMultiplier: 100000,
    makerFeeRate: 0.0035,
    takerFeeRate: 0.006,
    fundingRate: 3.5,
    shortInitialMarginRatio: 3,
    shortMaintenanceMarginRatio: 2,
  },
  FOREX_MICRO_LOT: {
    assetClass: "FOREX",
    marketPresetId: "FOREX_MICRO_LOT",
    tradeSettlementMode: "T0",
    minTradeStep: 0.01,
    allowLongMarginTrading: true,
    allowShortSelling: true,
    ...FOREX_COMMON,
    contractMultiplier: 1000,
    makerFeeRate: 0.0035,
    takerFeeRate: 0.006,
    fundingRate: 3.5,
    shortInitialMarginRatio: 3,
    shortMaintenanceMarginRatio: 2,
  },
  CRYPTO_SPOT: {
    assetClass: "CRYPTO",
    marketPresetId: "CRYPTO_SPOT",
    tradeSettlementMode: "T0",
    minTradeStep: 0.0001,
    allowLongMarginTrading: false,
    allowShortSelling: false,
    ...CRYPTO_COMMON,
    makerFeeRate: 0.1,
    takerFeeRate: 0.1,
    fundingRate: 0,
  },
  CRYPTO_USDT_PERP: {
    assetClass: "CRYPTO",
    marketPresetId: "CRYPTO_USDT_PERP",
    tradeSettlementMode: "T0",
    minTradeStep: 0.001,
    allowLongMarginTrading: true,
    allowShortSelling: true,
    ...CRYPTO_COMMON,
    makerFeeRate: 0.02,
    takerFeeRate: 0.05,
    fundingRate: 0.01,
    slippageRate: 0.015,
    longInitialMarginRatio: 10,
    longMaintenanceMarginRatio: 5,
    shortInitialMarginRatio: 10,
    shortMaintenanceMarginRatio: 5,
  },
};

export const isBuiltInTradingMarketPresetId = (
  value: string,
): value is BuiltInTradingMarketPresetId =>
  BUILT_IN_TRADING_MARKET_PRESET_IDS.includes(
    value as BuiltInTradingMarketPresetId,
  );

export const listBuiltInTradingMarketPresetIdsByAssetClass = (
  assetClass: TradingAssetClass,
): BuiltInTradingMarketPresetId[] =>
  BUILT_IN_TRADING_MARKET_PRESET_IDS.filter(
    (presetId) =>
      BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID[presetId] === assetClass,
  );
