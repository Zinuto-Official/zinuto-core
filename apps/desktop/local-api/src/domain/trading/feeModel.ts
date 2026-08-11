// SPDX-License-Identifier: GPL-3.0-only

import type { TradingSettings } from '@zinuto/shared/trading';
import type { Side } from '../models.js';

type TradingFeeModelSettings = Pick<
  TradingSettings,
  | 'marketPresetId'
  | 'assetClass'
  | 'commissionRate'
  | 'makerFeeRate'
  | 'takerFeeRate'
  | 'fundingRate'
  | 'transferFeeRate'
  | 'regulatoryFeeRate'
  | 'platformFeeRate'
  | 'transactionLevyRate'
  | 'slippageRate'
  | 'stampDutyRate'
  | 'commissionMinimumFee'
  | 'platformFeeMinimumFee'
  | 'transactionLevyMinimumFee'
  | 'stampDutyMode'
>;

type TradingCostBreakdown = {
  commission: number;
  transferFee: number;
  regulatoryFee: number;
  platformFee: number;
  transactionLevy: number;
  fee: number;
  tax: number;
  slippage: number;
  tradingCost: number;
};

const FEE_EPSILON = 1e-12;

const toNonNegativeRate = (value: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return numeric / 100;
};

const toNonNegativeAmount = (value: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return numeric;
};

const toNonNegativeUnitAmount = (value: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return numeric;
};

const applyMinimumCharge = (rawAmount: number, minimumAmount: number): number => {
  const amount = Math.max(0, rawAmount);
  const minimum = Math.max(0, minimumAmount);
  if (minimum <= FEE_EPSILON) {
    return amount;
  }
  return Math.max(amount, minimum);
};

export const calculateTradingCostBreakdown = (
  gross: number,
  side: Side,
  settings: TradingFeeModelSettings,
  qty = 0,
): TradingCostBreakdown => {
  const normalizedGross = Number.isFinite(gross) ? Math.max(0, gross) : 0;
  const normalizedQty = Number.isFinite(qty) ? Math.max(0, qty) : 0;
  if (normalizedGross <= FEE_EPSILON) {
    return {
      commission: 0,
      transferFee: 0,
      regulatoryFee: 0,
      platformFee: 0,
      transactionLevy: 0,
      fee: 0,
      tax: 0,
      slippage: 0,
      tradingCost: 0
    };
  }

  let commission = 0;
  let transferFee = 0;
  let regulatoryFee = 0;
  let platformFee = 0;
  let transactionLevy = 0;
  let tax = 0;
  let slippage = 0;

  if (settings.assetClass === 'FUTURES') {
    commission = normalizedQty * toNonNegativeUnitAmount(settings.makerFeeRate);
    regulatoryFee = normalizedQty * toNonNegativeUnitAmount(settings.regulatoryFeeRate);
    slippage = normalizedGross * toNonNegativeRate(settings.slippageRate);
  } else if (settings.assetClass === 'FOREX') {
    const commissionRate = toNonNegativeRate(
      settings.commissionRate > FEE_EPSILON
        ? settings.commissionRate
        : settings.makerFeeRate,
    );
    const spreadRate = toNonNegativeRate(settings.takerFeeRate);
    commission = normalizedGross * commissionRate;
    slippage =
      normalizedGross * (spreadRate + toNonNegativeRate(settings.slippageRate));
  } else if (settings.assetClass === 'CRYPTO') {
    const derivativeTakerRate = toNonNegativeRate(settings.takerFeeRate);
    const derivativeMakerRate = toNonNegativeRate(settings.makerFeeRate);
    const derivativeExecutionRate =
      derivativeTakerRate > FEE_EPSILON
        ? derivativeTakerRate
        : derivativeMakerRate;
    commission = normalizedGross * derivativeExecutionRate;
    slippage = normalizedGross * toNonNegativeRate(settings.slippageRate);
  } else {
    const isUsStock = String(settings.marketPresetId || '').trim() === 'US_STOCK';
    commission = applyMinimumCharge(
      normalizedGross * toNonNegativeRate(settings.commissionRate),
      toNonNegativeAmount(settings.commissionMinimumFee)
    );
    transferFee = normalizedGross * toNonNegativeRate(settings.transferFeeRate);
    regulatoryFee = isUsStock
      ? side === 'SELL'
        ? normalizedGross * toNonNegativeRate(settings.regulatoryFeeRate)
        : 0
      : normalizedGross * toNonNegativeRate(settings.regulatoryFeeRate);
    platformFee = applyMinimumCharge(
      normalizedGross * toNonNegativeRate(settings.platformFeeRate),
      toNonNegativeAmount(settings.platformFeeMinimumFee)
    );
    transactionLevy = isUsStock
      ? side === 'SELL'
        ? applyMinimumCharge(
            normalizedQty * toNonNegativeUnitAmount(settings.transactionLevyRate),
            toNonNegativeAmount(settings.transactionLevyMinimumFee)
          )
        : 0
      : applyMinimumCharge(
          normalizedGross * toNonNegativeRate(settings.transactionLevyRate),
          toNonNegativeAmount(settings.transactionLevyMinimumFee)
        );
    slippage = normalizedGross * toNonNegativeRate(settings.slippageRate);
    const shouldApplyStampDuty =
      settings.stampDutyMode === 'DOUBLE' ||
      (settings.stampDutyMode === 'BUY' && side === 'BUY') ||
      (settings.stampDutyMode === 'SELL' && side === 'SELL');
    tax = shouldApplyStampDuty
      ? normalizedGross * toNonNegativeRate(settings.stampDutyRate)
      : 0;
  }

  const fee = commission + transferFee + regulatoryFee + platformFee + transactionLevy;

  return {
    commission,
    transferFee,
    regulatoryFee,
    platformFee,
    transactionLevy,
    fee,
    tax,
    slippage,
    tradingCost: fee + tax + slippage
  };
};
