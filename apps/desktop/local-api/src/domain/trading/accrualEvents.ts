// SPDX-License-Identifier: GPL-3.0-only

import { POSITION_EPSILON } from './orderSizing.js';

export type AccrualEventKind = 'LONG_FINANCING' | 'SHORT_BORROW' | 'FUNDING';

export type AccrualEventDraft = {
  kind: AccrualEventKind;
  qty: number;
  referencePrice: number;
  notionalBasis: number;
  annualRate: number;
  amount: number;
};

export type AccrualIntervalSettlement = {
  events: AccrualEventDraft[];
  totalAmount: number;
  longFinancingMetricDelta: number;
  shortBorrowMetricDelta: number;
};

const round = (value: number, digits = 6): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(digits));
};

export const buildAccrualIntervalSettlement = ({
  accrualDays,
  positionQty,
  referencePrice,
  contractMultiplier,
  longFinancingPrincipal,
  annualRatePercent,
  fundingRatePercent,
  assetClass,
  allowShortSelling,
}: {
  accrualDays: number;
  positionQty: number;
  referencePrice: number;
  contractMultiplier: number;
  longFinancingPrincipal: number;
  annualRatePercent: number;
  fundingRatePercent: number;
  assetClass: string;
  allowShortSelling: boolean;
}): AccrualIntervalSettlement => {
  const days = Math.max(0, Math.floor(Number(accrualDays) || 0));
  const qty = Number(positionQty);
  const price = Number(referencePrice);
  const multiplier = Math.max(Number.EPSILON, Number(contractMultiplier) || 1);
  if (
    days <= 0 ||
    !Number.isFinite(qty) ||
    Math.abs(qty) <= POSITION_EPSILON ||
    !Number.isFinite(price) ||
    price <= POSITION_EPSILON
  ) {
    return {
      events: [],
      totalAmount: 0,
      longFinancingMetricDelta: 0,
      shortBorrowMetricDelta: 0,
    };
  }

  const events: AccrualEventDraft[] = [];
  const isLongPosition = qty > POSITION_EPSILON;
  const positionQtyAbs = Math.abs(qty);
  const safeAnnualRatePercent = Math.max(0, Number(annualRatePercent) || 0);
  const dailyRate = safeAnnualRatePercent / 100 / 365;
  const annualFinancingBase = isLongPosition
    ? Math.max(0, Number(longFinancingPrincipal) || 0)
    : positionQtyAbs * price * multiplier;
  let longFinancingMetricDelta = 0;
  let shortBorrowMetricDelta = 0;
  let totalAmount = 0;

  if (dailyRate > POSITION_EPSILON && annualFinancingBase > POSITION_EPSILON) {
    const amount = round(annualFinancingBase * dailyRate * days, 6);
    if (amount > POSITION_EPSILON) {
      events.push({
        kind: isLongPosition ? 'LONG_FINANCING' : 'SHORT_BORROW',
        qty: isLongPosition ? positionQtyAbs : positionQtyAbs,
        referencePrice: price,
        notionalBasis: annualFinancingBase,
        annualRate: safeAnnualRatePercent,
        amount,
      });
      totalAmount += amount;
      if (isLongPosition) {
        longFinancingMetricDelta += amount;
      } else {
        shortBorrowMetricDelta += amount;
      }
    }
  }

  const safeFundingRatePercent = Number(fundingRatePercent) || 0;
  const usesPeriodicCryptoFunding = assetClass === 'CRYPTO' && allowShortSelling;
  const fundingDailyRate = usesPeriodicCryptoFunding
    ? (safeFundingRatePercent / 100) * 3
    : assetClass === 'CRYPTO'
      ? 0
      : safeFundingRatePercent / 100 / 365;
  if (Math.abs(fundingDailyRate) > POSITION_EPSILON) {
    const notionalBasis = Math.abs(qty * price * multiplier);
    const amount = round(qty * price * multiplier * fundingDailyRate * days, 6);
    if (Math.abs(amount) > POSITION_EPSILON) {
      events.push({
        kind: 'FUNDING',
        qty,
        referencePrice: price,
        notionalBasis,
        annualRate: safeFundingRatePercent,
        amount,
      });
      totalAmount += amount;
      if (isLongPosition) {
        longFinancingMetricDelta += amount;
      } else {
        shortBorrowMetricDelta += amount;
      }
    }
  }

  return {
    events,
    totalAmount: round(totalAmount, 6),
    longFinancingMetricDelta: round(longFinancingMetricDelta, 6),
    shortBorrowMetricDelta: round(shortBorrowMetricDelta, 6),
  };
};
