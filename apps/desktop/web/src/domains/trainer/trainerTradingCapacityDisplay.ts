// SPDX-License-Identifier: GPL-3.0-only

import type { TradingAssetClass } from "@zinuto/shared/trading";
import type { TradeCapacitySummary } from "@/domains/training/types";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";

const CAPACITY_EPSILON = 1e-8;

export type TrainerTradingCapacityDisplayModel = {
  long: {
    label: string;
    value: string;
    showsMarginCapacity: boolean;
  };
  short: {
    label: string;
    value: string;
    showsShortOpenCapacity: boolean;
    sellableLongQty: number;
  };
};

export const resolveTrainerTradingCapacityDisplay = ({
  assetClass,
  allowLongMarginTrading,
  allowShortSelling,
  tradeCapacity,
  formatMoney,
  formatTradingQuantityText,
  tt,
}: {
  assetClass: TradingAssetClass;
  allowLongMarginTrading: boolean;
  allowShortSelling: boolean;
  tradeCapacity: TradeCapacitySummary;
  formatMoney: (value: number, digits?: number) => string;
  formatTradingQuantityText: (
    quantity: number,
    kind?: "ORDER" | "POSITION",
  ) => string;
  tt: (key: AppTextKey) => string;
}): TrainerTradingCapacityDisplayModel => {
  const showsLongMarginCapacity =
    assetClass === "STOCK" && allowLongMarginTrading;
  const sellableLongQty =
    tradeCapacity.ratioBases.sell.kind === "CLOSE_LONG"
      ? Math.max(0, Number(tradeCapacity.ratioBases.sell.quantity) || 0)
      : 0;
  const showsShortOpenCapacity = allowShortSelling;

  return {
    long: {
      label: showsLongMarginCapacity
        ? tt("appText.longBuyingPower")
        : tt("appText.longOpenCapacity"),
      value: formatMoney(
        showsLongMarginCapacity
          ? tradeCapacity.longFinancingAmount
          : tradeCapacity.longBuyingPowerAmount,
        0,
      ),
      showsMarginCapacity: showsLongMarginCapacity,
    },
    short: {
      label: showsShortOpenCapacity
        ? assetClass === "STOCK"
          ? tt("appText.shortSellCapacity")
          : tt("appText.shortOpenCapacity")
        : sellableLongQty > CAPACITY_EPSILON
          ? tt("appText.sellableHolding")
          : tt("appText.sellablePosition"),
      value: showsShortOpenCapacity
        ? formatTradingQuantityText(
            Math.max(0, Number(tradeCapacity.shortOpenCapacityQty) || 0),
            "POSITION",
          )
        : formatTradingQuantityText(
            sellableLongQty > CAPACITY_EPSILON ? sellableLongQty : 0,
            "POSITION",
          ),
      showsShortOpenCapacity,
      sellableLongQty,
    },
  };
};
