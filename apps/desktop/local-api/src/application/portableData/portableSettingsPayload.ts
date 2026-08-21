// SPDX-License-Identifier: GPL-3.0-only

import { INPUT_LIMITS } from "@zinuto/shared/input-limits";
import type { PortableUserSettingsUpsertRow } from "../../domain/portableDataRepositoryTypes.js";
import { appError } from "../../kernel/appError.js";
import { normalizeText } from "./helpers.js";

type PortableUserSettingsValues = Omit<PortableUserSettingsUpsertRow, "updatedAt">;

const invalidPortableSettings = (): never => {
  throw appError("PORTABLE_DATA_IMPORT_INVALID");
};

const finiteNumber = (
  value: unknown,
  fallback: number,
  {
    integer = false,
    minimum = Number.NEGATIVE_INFINITY,
    maximum = Number.POSITIVE_INFINITY,
    minimumExclusive = false,
  }: {
    integer?: boolean;
    minimum?: number;
    maximum?: number;
    minimumExclusive?: boolean;
  } = {},
): number => {
  const parsed = Number(value ?? fallback);
  if (
    !Number.isFinite(parsed)
    || (integer && !Number.isSafeInteger(parsed))
    || (minimumExclusive ? parsed <= minimum : parsed < minimum)
    || parsed > maximum
  ) {
    return invalidPortableSettings();
  }
  return parsed;
};

const enumText = <Value extends string>(
  value: unknown,
  fallback: Value,
  allowed: readonly Value[],
): Value => {
  const normalized = normalizeText(value) || fallback;
  return allowed.includes(normalized as Value)
    ? normalized as Value
    : invalidPortableSettings();
};

const booleanInteger = (value: unknown): number =>
  finiteNumber(value, 0, { integer: true, minimum: 0, maximum: 1 });

export const parsePortableUserSettingsRow = (
  rowRecord: Record<string, unknown>,
): PortableUserSettingsValues => {
  const marketPresetId = normalizeText(rowRecord.market_preset_id) || "A_SHARE";
  if (marketPresetId.length > INPUT_LIMITS.tradingPresetNameChars) {
    return invalidPortableSettings();
  }

  const longInitialMarginRatio = finiteNumber(
    rowRecord.long_initial_margin_ratio,
    0,
    { minimum: 0, maximum: 1000, minimumExclusive: true },
  );
  const longMaintenanceMarginRatio = finiteNumber(
    rowRecord.long_maintenance_margin_ratio,
    0,
    { minimum: 0, maximum: 1000, minimumExclusive: true },
  );
  const shortInitialMarginRatio = finiteNumber(
    rowRecord.short_initial_margin_ratio,
    0,
    { minimum: 0, maximum: 1000, minimumExclusive: true },
  );
  const shortMaintenanceMarginRatio = finiteNumber(
    rowRecord.short_maintenance_margin_ratio,
    0,
    { minimum: 0, maximum: 1000, minimumExclusive: true },
  );
  if (
    longMaintenanceMarginRatio > longInitialMarginRatio
    || shortMaintenanceMarginRatio > shortInitialMarginRatio
  ) {
    return invalidPortableSettings();
  }

  const nonNegative = (value: unknown, fallback = 0): number =>
    finiteNumber(value, fallback, { minimum: 0 });

  return {
    initialSecuritiesBalance: finiteNumber(
      rowRecord.initial_securities_balance,
      0,
      { integer: true, minimum: 0, minimumExclusive: true },
    ),
    initialBankBalance: nonNegative(rowRecord.initial_bank_balance),
    assetClass: enumText(
      rowRecord.asset_class,
      "STOCK",
      ["STOCK", "FUTURES", "FOREX", "CRYPTO"] as const,
    ),
    marketPresetId,
    minTradeStep: finiteNumber(rowRecord.min_trade_step, 0, {
      minimum: 0,
      minimumExclusive: true,
    }),
    commissionRate: nonNegative(rowRecord.commission_rate),
    makerFeeRate: nonNegative(rowRecord.maker_fee_rate),
    takerFeeRate: nonNegative(rowRecord.taker_fee_rate),
    fundingRate: finiteNumber(rowRecord.funding_rate, 0),
    contractMultiplier: finiteNumber(rowRecord.contract_multiplier, 1, {
      minimum: 0,
      minimumExclusive: true,
    }),
    transferFeeRate: nonNegative(rowRecord.transfer_fee_rate),
    regulatoryFeeRate: nonNegative(rowRecord.regulatory_fee_rate),
    platformFeeRate: nonNegative(rowRecord.platform_fee_rate),
    transactionLevyRate: nonNegative(rowRecord.transaction_levy_rate),
    slippageRate: nonNegative(rowRecord.slippage_rate),
    stampDutyRate: nonNegative(rowRecord.stamp_duty_rate),
    commissionMinimumFee: nonNegative(rowRecord.commission_minimum_fee),
    platformFeeMinimumFee: nonNegative(rowRecord.platform_fee_minimum_fee),
    transactionLevyMinimumFee: nonNegative(
      rowRecord.transaction_levy_minimum_fee,
    ),
    longFinancingAnnualRate: nonNegative(rowRecord.long_financing_annual_rate),
    longInitialMarginRatio,
    longMaintenanceMarginRatio,
    shortBorrowAnnualRate: nonNegative(rowRecord.short_borrow_annual_rate),
    shortInitialMarginRatio,
    shortMaintenanceMarginRatio,
    stampDutyMode: enumText(
      rowRecord.stamp_duty_mode,
      "SINGLE",
      ["SINGLE", "DOUBLE"] as const,
    ),
    stampDutySingleSide: enumText(
      rowRecord.stamp_duty_single_side,
      "SELL",
      ["BUY", "SELL"] as const,
    ),
    positionCostMode: enumText(
      rowRecord.position_cost_mode,
      "DILUTED",
      ["DILUTED", "AVERAGE_OPEN"] as const,
    ),
    tradeSettlementMode: enumText(
      rowRecord.trade_settlement_mode,
      "T0",
      ["T0", "T1"] as const,
    ),
    freeReplayEndSettlementMode: enumText(
      rowRecord.free_replay_end_settlement_mode,
      "FORCE_CLOSE",
      ["FORCE_CLOSE", "CURRENT_TOTAL_ASSET"] as const,
    ),
    tradeAmountIncludesFees: booleanInteger(
      rowRecord.trade_amount_includes_fees,
    ),
    allowLongMarginTrading: booleanInteger(
      rowRecord.allow_long_margin_trading,
    ),
    allowShortSelling: booleanInteger(rowRecord.allow_short_selling),
  };
};
