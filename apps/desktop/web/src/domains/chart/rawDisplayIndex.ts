// SPDX-License-Identifier: GPL-3.0-only

import { findAggregatedBarIndexByRawIndex } from "@/domains/chart/replayIndexing";

export type RawRangeItem = {
  startRawIndex?: number;
  endRawIndex?: number;
};

export type RawDisplayTarget<
  TSourceBar extends RawRangeItem,
  TVisibleItem extends { startRawIndex: number; endRawIndex: number },
> = {
  rawIndex: number;
  sourceBar: TSourceBar | null;
  sourceBarIndex: number;
  visibleItem: TVisibleItem | null;
  visibleItemIndex: number;
};

const normalizeRawIndex = (rawIndex: number): number | null => {
  const normalized = Math.floor(Number(rawIndex));
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : null;
};

export const findRawRangeItemIndex = <TItem extends RawRangeItem>(
  items: readonly TItem[],
  rawIndex: number,
): number => {
  const normalizedRawIndex = normalizeRawIndex(rawIndex);
  if (normalizedRawIndex === null || !items.length) {
    return -1;
  }
  let left = 0;
  let right = items.length - 1;
  while (left <= right) {
    const middle = (left + right) >> 1;
    const item = items[middle];
    const startRawIndex = Number.isFinite(Number(item?.startRawIndex))
      ? Math.max(0, Math.floor(Number(item?.startRawIndex)))
      : middle;
    const endRawIndex = Number.isFinite(Number(item?.endRawIndex))
      ? Math.max(startRawIndex, Math.floor(Number(item?.endRawIndex)))
      : startRawIndex;
    if (normalizedRawIndex < startRawIndex) {
      right = middle - 1;
      continue;
    }
    if (normalizedRawIndex > endRawIndex) {
      left = middle + 1;
      continue;
    }
    return middle;
  }
  return -1;
};

export const resolveRawDisplayTarget = <
  TSourceBar extends RawRangeItem,
  TVisibleItem extends { startRawIndex: number; endRawIndex: number },
>({
  rawIndex,
  sourceBars,
  visibleItems,
}: {
  rawIndex: number;
  sourceBars: readonly TSourceBar[];
  visibleItems: readonly TVisibleItem[];
}): RawDisplayTarget<TSourceBar, TVisibleItem> => {
  const normalizedRawIndex = normalizeRawIndex(rawIndex);
  if (normalizedRawIndex === null) {
    return {
      rawIndex: 0,
      sourceBar: null,
      sourceBarIndex: -1,
      visibleItem: null,
      visibleItemIndex: -1,
    };
  }
  const visibleItemIndex = findAggregatedBarIndexByRawIndex(
    visibleItems,
    normalizedRawIndex,
  );
  const sourceBarIndex = findRawRangeItemIndex(sourceBars, normalizedRawIndex);
  return {
    rawIndex: normalizedRawIndex,
    sourceBar: sourceBarIndex >= 0 ? sourceBars[sourceBarIndex] ?? null : null,
    sourceBarIndex,
    visibleItem:
      visibleItemIndex >= 0 ? visibleItems[visibleItemIndex] ?? null : null,
    visibleItemIndex,
  };
};
