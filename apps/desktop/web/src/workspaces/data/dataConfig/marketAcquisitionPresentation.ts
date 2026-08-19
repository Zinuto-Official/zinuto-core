// SPDX-License-Identifier: GPL-3.0-only

import type {
  MarketDataAcquisitionAssetClass,
  MarketDataAcquisitionCatalog,
  MarketDataAcquisitionMarketId,
  MarketDataAcquisitionSourcePlanId,
} from "@/api";

type Translate = (key: string) => string;
type TranslateFormatted = (key: string, values?: Array<unknown>) => string;

export const marketAcquisitionAssetClassLabelKey = (
  assetClassId: MarketDataAcquisitionAssetClass["id"],
): string =>
  ({
    STOCKS_AND_INDICES: "appText.marketDataAcquisitionAssetStocksAndIndices",
    FOREX: "appText.marketDataAcquisitionAssetForex",
    COMMODITIES_AND_RATES:
      "appText.marketDataAcquisitionAssetCommoditiesAndRates",
    CRYPTO: "appText.marketDataAcquisitionAssetCrypto",
  })[assetClassId];

export const marketAcquisitionAssetClassDescriptionKey = (
  assetClassId: MarketDataAcquisitionAssetClass["id"],
): string =>
  ({
    STOCKS_AND_INDICES:
      "appText.marketDataAcquisitionAssetStocksAndIndicesDescription",
    FOREX: "appText.marketDataAcquisitionAssetForexDescription",
    COMMODITIES_AND_RATES:
      "appText.marketDataAcquisitionAssetCommoditiesAndRatesDescription",
    CRYPTO: "appText.marketDataAcquisitionAssetCryptoDescription",
  })[assetClassId];

export const marketAcquisitionMarketLabelKey = (
  marketId: MarketDataAcquisitionMarketId,
): string =>
  ({
    CN_A_SHARE: "appText.marketDataAcquisitionMarketCnAShare",
    HK_STOCKS: "appText.marketDataAcquisitionMarketHongKong",
    KR_STOCKS: "appText.marketDataAcquisitionMarketKorea",
    US_STOCKS: "appText.marketDataAcquisitionMarketUsStocks",
    JP_STOCKS: "appText.marketDataAcquisitionMarketJapan",
    VN_STOCKS: "appText.marketDataAcquisitionMarketVietnam",
    GLOBAL_INDICES: "appText.marketDataAcquisitionMarketGlobalIndices",
    FOREX: "appText.marketDataAcquisitionMarketForex",
    COMMODITY_FUTURES: "appText.marketDataAcquisitionMarketCommodityFutures",
    RATE_FUTURES: "appText.marketDataAcquisitionMarketRateFutures",
    CRYPTO_SPOT: "appText.marketDataAcquisitionMarketCryptoSpot",
  })[marketId];

export const marketAcquisitionSourcePlanExchangeLabelKey = (
  sourcePlanId: MarketDataAcquisitionSourcePlanId,
): string | null => {
  switch (sourcePlanId) {
    case "CCXT_BINANCE_SMART":
      return "appText.marketDataAcquisitionExchangeBinance";
    case "CCXT_OKX_SMART":
      return "appText.marketDataAcquisitionExchangeOkx";
    default:
      return null;
  }
};

export const marketAcquisitionSourcePlanLabel = (
  sourcePlan: MarketDataAcquisitionCatalog["markets"][number]["sourcePlans"][number],
  catalog: MarketDataAcquisitionCatalog,
  tt: Translate,
  ttf: TranslateFormatted,
): string => {
  const providerLabel = sourcePlan.providerChain
    .map(
      (providerId) =>
        catalog.providers.find((entry) => entry.id === providerId)?.name ??
        providerId,
    )
    .join(" / ");
  const exchangeLabelKey = marketAcquisitionSourcePlanExchangeLabelKey(
    sourcePlan.id,
  );
  return exchangeLabelKey
    ? ttf("appText.marketDataAcquisitionSourcePlanValue0Value1", [
        tt(exchangeLabelKey),
        providerLabel,
      ])
    : providerLabel;
};
