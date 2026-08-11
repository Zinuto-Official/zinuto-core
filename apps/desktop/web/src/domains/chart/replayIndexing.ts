// SPDX-License-Identifier: GPL-3.0-only

type AggregatedRangeItem = {
  startRawIndex: number;
  endRawIndex: number;
};

export const findAggregatedBarIndexByRawIndex = <T extends AggregatedRangeItem>(
  items: readonly T[],
  rawIndex: number
): number => {
  let left = 0;
  let right = items.length - 1;
  while (left <= right) {
    const middle = (left + right) >> 1;
    const item = items[middle];
    if (rawIndex < item.startRawIndex) {
      right = middle - 1;
      continue;
    }
    if (rawIndex > item.endRawIndex) {
      left = middle + 1;
      continue;
    }
    return middle;
  }
  return -1;
};
