// SPDX-License-Identifier: GPL-3.0-only

import { tt } from '@/frontend-kernel/i18n/messageRuntime';

export type TradeMarkerOverrideInput = {
  rawIndex: number;
  side: 'BUY' | 'SELL';
  price: number;
  label: string;
};

export type TradeMarkerOverrideBucketSide = 'BUY' | 'SELL' | 'MIXED';

export type TradeMarkerOverrideVisibleItem = {
  bucketStartMs: number;
  startRawIndex: number;
  endRawIndex: number;
  high?: number;
  low?: number;
  close?: number;
};

export type TradeMarkerOverrideBucket = {
  key: string;
  side: TradeMarkerOverrideBucketSide;
  timestamp: number;
  price: number;
  markerValue: number;
  displayLabel: string;
  isAggregated: boolean;
  count: number;
  rawIndex: number;
  forceDirection?: 1 | -1;
};

type TradeMarkerOverrideBucketDetail = {
  side: 'BUY' | 'SELL';
  label: string;
};

const resolveBucketSide = (
  details: readonly Pick<TradeMarkerOverrideBucketDetail, 'side'>[],
): TradeMarkerOverrideBucketSide => {
  const hasBuy = details.some((detail) => detail.side === 'BUY');
  const hasSell = details.some((detail) => detail.side === 'SELL');
  if (hasBuy && hasSell) {
    return 'MIXED';
  }
  return hasSell ? 'SELL' : 'BUY';
};

const buildSameSideDisplayLabel = (
  side: 'BUY' | 'SELL',
  labels: readonly string[],
): string => {
  const sideLabel = side === 'SELL' ? 'S' : 'B';
  const firstLabel = String(labels[0] ?? `${sideLabel}1`).trim() || `${sideLabel}1`;
  if (labels.length <= 1) {
    return firstLabel;
  }
  const lastLabel = String(labels[labels.length - 1] ?? firstLabel).trim() || firstLabel;
  const firstOrdinal = firstLabel.startsWith(sideLabel) ? firstLabel.slice(sideLabel.length) : '';
  const lastOrdinal = lastLabel.startsWith(sideLabel) ? lastLabel.slice(sideLabel.length) : '';
  if (firstOrdinal && lastOrdinal) {
    return `${sideLabel}${firstOrdinal}-${lastOrdinal}`;
  }
  return `${firstLabel}-${lastLabel}`;
};

const buildOverrideDisplayLabel = (
  details: readonly TradeMarkerOverrideBucketDetail[],
): string => {
  const side = resolveBucketSide(details);
  if (side === 'MIXED') {
    return tt('chart.tradeMarkerMixedSideLabel');
  }
  return buildSameSideDisplayLabel(
    side,
    details
      .filter((detail) => detail.side === side)
      .map((detail) => detail.label),
  );
};

const resolveMixedForceDirection = (
  visibleItem: TradeMarkerOverrideVisibleItem,
  markerValue: number,
): 1 | -1 | undefined => {
  const high = Number(visibleItem.high);
  const low = Number(visibleItem.low);
  if (!Number.isFinite(high) || !Number.isFinite(low) || high <= 0 || low <= 0) {
    return undefined;
  }
  const mid = (high + low) / 2;
  return Number.isFinite(markerValue) && markerValue >= mid ? -1 : 1;
};

const resolveSideMarkerValue = (
  visibleItem: TradeMarkerOverrideVisibleItem,
  side: 'BUY' | 'SELL',
  fallbackPrice: number,
): number => {
  const high = Number(visibleItem.high);
  const low = Number(visibleItem.low);
  const sideValue = side === 'SELL' ? high : low;
  return Number.isFinite(sideValue) && sideValue > 0 ? sideValue : fallbackPrice;
};

const resolveMixedMarkerValue = (
  visibleItem: TradeMarkerOverrideVisibleItem,
  fallbackPrice: number,
): number => {
  const close = Number(visibleItem.close);
  if (Number.isFinite(close) && close > 0) {
    return close;
  }
  const high = Number(visibleItem.high);
  const low = Number(visibleItem.low);
  if (Number.isFinite(high) && Number.isFinite(low) && high > 0 && low > 0) {
    return (high + low) / 2;
  }
  return fallbackPrice;
};

export const buildTradeMarkerOverrideBuckets = ({
  markers,
  visibleItems,
  maxIndex,
  aggregateByVisiblePeriod = false,
}: {
  markers: readonly TradeMarkerOverrideInput[];
  visibleItems: readonly TradeMarkerOverrideVisibleItem[];
  maxIndex: number;
  aggregateByVisiblePeriod?: boolean;
}): TradeMarkerOverrideBucket[] => {
  type DraftBucket = TradeMarkerOverrideBucket & {
    details: TradeMarkerOverrideBucketDetail[];
    priceSum: number;
    visibleItem: TradeMarkerOverrideVisibleItem;
  };

  const buckets = new Map<string, DraftBucket>();
  markers.forEach((marker) => {
    const rawIndex = Math.max(
      0,
      Math.min(Math.floor(Number(marker.rawIndex)), Math.max(0, Math.floor(Number(maxIndex)))),
    );
    const visibleItem = visibleItems.find((item) => {
      const startRawIndex = Math.floor(Number(item.startRawIndex));
      const endRawIndex = Math.floor(Number(item.endRawIndex));
      if (!Number.isFinite(startRawIndex) || !Number.isFinite(endRawIndex)) {
        return false;
      }
      return rawIndex >= startRawIndex && rawIndex <= endRawIndex;
    });
    const price = Number(marker.price);
    const label = String(marker.label ?? '').trim();
    const timestamp = Number(visibleItem?.bucketStartMs);
    if (!visibleItem || !Number.isFinite(timestamp) || !Number.isFinite(price) || price <= 0 || !label) {
      return;
    }

    const side = marker.side === 'SELL' ? 'SELL' : 'BUY';
    const markerValue = resolveSideMarkerValue(visibleItem, side, price);
    const detail: TradeMarkerOverrideBucketDetail = { side, label };
    const key = aggregateByVisiblePeriod
      ? `${timestamp}`
      : `${timestamp}|${side}|${rawIndex}|${label}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
      existing.priceSum += price;
      existing.price = existing.priceSum / existing.count;
      existing.details.push(detail);
      existing.side = resolveBucketSide(existing.details);
      existing.displayLabel = buildOverrideDisplayLabel(existing.details);
      existing.isAggregated = existing.count > 1;
      existing.markerValue =
        existing.side === 'MIXED'
          ? resolveMixedMarkerValue(existing.visibleItem, existing.price)
          : resolveSideMarkerValue(existing.visibleItem, existing.side, existing.price);
      existing.forceDirection =
        existing.side === 'MIXED'
          ? resolveMixedForceDirection(existing.visibleItem, existing.markerValue)
          : undefined;
      return;
    }
    buckets.set(key, {
      key,
      side,
      timestamp,
      price,
      markerValue,
      displayLabel: label,
      isAggregated: false,
      count: 1,
      rawIndex,
      details: [detail],
      priceSum: price,
      visibleItem,
    });
  });

  return Array.from(buckets.values()).map(({ details: _details, priceSum: _priceSum, visibleItem: _visibleItem, ...bucket }) => bucket);
};
