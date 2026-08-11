// SPDX-License-Identifier: GPL-3.0-only

import type { AggregatedBarItem } from "@/domains/chart/replayAggregation";
import type { ReplayBar } from "@/domains/trainer/trainerTypes";
import type { Fill } from "@/domains/training/types";
import { resolveRawDisplayTarget } from "@/domains/chart/rawDisplayIndex";
import { tt } from "@/frontend-kernel/i18n/messageRuntime";

export type SystemTradeMarkerDetail = {
  side: "BUY" | "SELL";
  label: string;
  qty: number;
  price: number;
  grossAmount: number;
  tradingCost: number;
  cashAmount: number;
};

export type SystemTradeMarkerBucketSide = "BUY" | "SELL" | "MIXED";

export type SystemTradeMarkerBucket = {
  key: string;
  side: SystemTradeMarkerBucketSide;
  timestamp: number;
  markerValue: number;
  isAggregated: boolean;
  totalQty: number;
  weightedPriceSum: number;
  grossAmount: number;
  tradingCost: number;
  displayLabel: string;
  forceDirection?: 1 | -1;
  details: SystemTradeMarkerDetail[];
};

const toPositiveFinite = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const resolveBucketSide = (
  details: readonly Pick<SystemTradeMarkerDetail, "side">[],
): SystemTradeMarkerBucketSide => {
  const hasBuy = details.some((detail) => detail.side === "BUY");
  const hasSell = details.some((detail) => detail.side === "SELL");
  if (hasBuy && hasSell) {
    return "MIXED";
  }
  return hasSell ? "SELL" : "BUY";
};

const buildSameSideDisplayLabel = (
  side: "BUY" | "SELL",
  details: readonly SystemTradeMarkerDetail[],
): string => {
  const sideLabel = side === "SELL" ? "S" : "B";
  if (details.length <= 0) {
    return `${sideLabel}1`;
  }
  const firstLabel = details[0]?.label || `${sideLabel}1`;
  if (details.length === 1) {
    return firstLabel;
  }
  const lastLabel = details[details.length - 1]?.label || firstLabel;
  const firstOrdinal = firstLabel.startsWith(sideLabel) ? firstLabel.slice(sideLabel.length) : "";
  const lastOrdinal = lastLabel.startsWith(sideLabel) ? lastLabel.slice(sideLabel.length) : "";
  if (firstOrdinal && lastOrdinal) {
    return `${sideLabel}${firstOrdinal}-${lastOrdinal}`;
  }
  return `${firstLabel}-${lastLabel}`;
};

const buildDisplayLabel = (
  details: readonly SystemTradeMarkerDetail[],
): string => {
  const side = resolveBucketSide(details);
  if (side === "MIXED") {
    return tt("chart.tradeMarkerMixedSideLabel");
  }
  return buildSameSideDisplayLabel(
    side,
    details.filter((detail) => detail.side === side),
  );
};

const resolveMixedMarkerValue = (item: AggregatedBarItem): number => {
  const close = toPositiveFinite(item.close, 0);
  if (close > 0) {
    return close;
  }
  const high = toPositiveFinite(item.high, 0);
  const low = toPositiveFinite(item.low, 0);
  return high > 0 && low > 0 ? (high + low) / 2 : 0;
};

const resolveMixedForceDirection = (item: AggregatedBarItem, markerValue: number): 1 | -1 | undefined => {
  const high = toPositiveFinite(item.high, 0);
  const low = toPositiveFinite(item.low, 0);
  if (high <= 0 || low <= 0) {
    return undefined;
  }
  const mid = (high + low) / 2;
  return Number.isFinite(markerValue) && markerValue >= mid ? -1 : 1;
};

export const buildSystemTradeMarkerBuckets = ({
  fills,
  sourceBars,
  visibleItems,
  tradeAmountIncludesFees,
  aggregateByVisiblePeriod = false,
  fillSequenceStartIndex = 0,
}: {
  fills: readonly Fill[];
  sourceBars: readonly ReplayBar[];
  visibleItems: readonly AggregatedBarItem[];
  tradeAmountIncludesFees: boolean;
  aggregateByVisiblePeriod?: boolean;
  fillSequenceStartIndex?: number;
}): SystemTradeMarkerBucket[] => {
  const aggregatedMarkerMap = new Map<string, SystemTradeMarkerBucket>();
  const sequenceStartIndex = Math.max(
    0,
    Math.floor(Number(fillSequenceStartIndex) || 0),
  );

  fills.forEach((fill, fillIndex) => {
    if (!fill || typeof fill !== "object") {
      return;
    }
    const side: "BUY" | "SELL" = fill.side === "SELL" ? "SELL" : "BUY";
    const sequence = sequenceStartIndex + fillIndex + 1;
    const label = `${side === "BUY" ? "B" : "S"}${sequence}`;
    const rawIndex = Math.max(0, Math.floor(Number(fill.fill_index)));
    const target = resolveRawDisplayTarget({
      rawIndex,
      sourceBars,
      visibleItems,
    });
    const targetItem = target.visibleItem;
    if (!targetItem) {
      return;
    }
    const sourceBar = target.sourceBar;
    const bucketStartMs = Number(targetItem.bucketStartMs);
    if (!Number.isFinite(bucketStartMs)) {
      return;
    }

    const isBuy = side === "BUY";
    const markerBase = Number(isBuy ? targetItem.low : targetItem.high);
    const fallbackBase = Number(isBuy ? sourceBar?.low : sourceBar?.high);
    const baseValue =
      Number.isFinite(markerBase) && markerBase > 0 ? markerBase : fallbackBase;
    const mixedBaseValue = resolveMixedMarkerValue(targetItem);
    if (!Number.isFinite(baseValue) || baseValue <= 0) {
      return;
    }

    const qty = toPositiveFinite(fill.fill_qty, 0);
    const fallbackClose = Number(sourceBar?.close);
    const price = toPositiveFinite(fill.fill_price, toPositiveFinite(fallbackClose, 0));
    const contractMultiplier = toPositiveFinite(fill.contract_multiplier, 0);
    if (qty <= 0 || price <= 0 || contractMultiplier <= 0) {
      return;
    }

    const grossAmount = price * qty * contractMultiplier;
    const fee = Number(fill.fee);
    const tax = Number(fill.tax);
    const slippage = Number(fill.slippage);
    const tradingCost = Math.max(
      0,
      (Number.isFinite(fee) ? fee : 0) +
        (Number.isFinite(tax) ? tax : 0) +
        (Number.isFinite(slippage) ? slippage : 0),
    );
    const cashAmount = isBuy
      ? tradeAmountIncludesFees
        ? grossAmount + tradingCost
        : grossAmount
      : tradeAmountIncludesFees
        ? Math.max(0, grossAmount - tradingCost)
        : grossAmount;
    const detail: SystemTradeMarkerDetail = {
      side,
      label,
      qty,
      price,
      grossAmount,
      tradingCost,
      cashAmount,
    };
    const key = aggregateByVisiblePeriod
      ? `${bucketStartMs}`
      : `${bucketStartMs}|${side}|${rawIndex}|${label}`;
    const existing = aggregatedMarkerMap.get(key);
    if (existing) {
      existing.totalQty += qty;
      existing.weightedPriceSum += price * qty;
      existing.grossAmount += grossAmount;
      existing.tradingCost += tradingCost;
      existing.details.push(detail);
      existing.isAggregated = existing.details.length > 1;
      existing.side = resolveBucketSide(existing.details);
      existing.displayLabel = buildDisplayLabel(existing.details);
      if (existing.side === "MIXED" && mixedBaseValue > 0) {
        existing.markerValue = mixedBaseValue;
        existing.forceDirection = resolveMixedForceDirection(targetItem, mixedBaseValue);
      }
      return;
    }
    aggregatedMarkerMap.set(key, {
      key,
      side,
      timestamp: bucketStartMs,
      markerValue: baseValue,
      isAggregated: false,
      totalQty: qty,
      weightedPriceSum: price * qty,
      grossAmount,
      tradingCost,
      displayLabel: label,
      details: [detail],
    });
  });

  return Array.from(aggregatedMarkerMap.values());
};
