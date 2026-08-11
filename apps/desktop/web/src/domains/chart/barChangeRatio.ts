// SPDX-License-Identifier: GPL-3.0-only

type AggregatedBarWithRange = {
  close: number;
};

const isFinitePositive = (value: number): boolean => Number.isFinite(value) && value > 0;

export const resolveCurrentBarChangeRatio = <TItem extends AggregatedBarWithRange>(
  visibleItems: readonly TItem[],
  displayIndex: number
): number | null => {
  if (!visibleItems.length) {
    return null;
  }

  const index = Math.max(0, Math.min(Math.floor(displayIndex), visibleItems.length - 1));
  const currentItem = visibleItems[index];
  if (!currentItem || !Number.isFinite(currentItem.close)) {
    return null;
  }

  const previousVisibleItem = index > 0 ? visibleItems[index - 1] : null;
  const previousVisibleClose = previousVisibleItem?.close ?? Number.NaN;
  if (isFinitePositive(previousVisibleClose)) {
    return (currentItem.close - previousVisibleClose) / previousVisibleClose;
  }

  // The chart itself compares against only the data passed to the renderer.
  // Its first visible bar has no previous close and is deliberately neutral,
  // so the companion change bubble must not calculate against hidden raw data
  // or the bar open and contradict that rendered state.
  return null;
};
