// SPDX-License-Identifier: GPL-3.0-only

export type ValueAxisExtentOptions = {
  paddingRatio?: number;
  paddingTopRatio?: number;
  paddingBottomRatio?: number;
  preferZeroBoundary?: boolean;
  paddingMode?: "range" | "value";
};

const resolvePaddingDelta = (
  value: number,
  range: number,
  ratio: number,
  mode: "range" | "value",
): number => {
  const primaryBase = mode === "value" ? Math.abs(value) : range;
  if (Number.isFinite(primaryBase) && primaryBase > 1e-9) {
    return primaryBase * ratio;
  }
  const fallbackBase = range > 1e-9 ? range : Math.max(Math.abs(value), 1);
  return Math.max(fallbackBase * ratio, 1);
};

export const resolveValueAxisExtent = (
  values: number[],
  options?: ValueAxisExtentOptions,
): { min: number; max: number } => {
  const source = values.filter((value) => Number.isFinite(value));
  if (!source.length) {
    return { min: 0, max: 1 };
  }
  let min = source[0]!;
  let max = source[0]!;
  for (const value of source) {
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }

  const paddingRatio = Number(options?.paddingRatio);
  const ratio =
    Number.isFinite(paddingRatio) && paddingRatio > 0 ? paddingRatio : 0.12;
  const paddingTopRatioRaw = Number(options?.paddingTopRatio);
  const paddingBottomRatioRaw = Number(options?.paddingBottomRatio);
  const paddingTopRatio =
    Number.isFinite(paddingTopRatioRaw) && paddingTopRatioRaw >= 0
      ? paddingTopRatioRaw
      : ratio;
  const paddingBottomRatio =
    Number.isFinite(paddingBottomRatioRaw) && paddingBottomRatioRaw >= 0
      ? paddingBottomRatioRaw
      : ratio;
  const paddingMode = options?.paddingMode === "value" ? "value" : "range";

  if (min === max) {
    if (paddingMode === "value") {
      const bottomDelta = resolvePaddingDelta(
        min,
        0,
        paddingBottomRatio,
        paddingMode,
      );
      const topDelta = resolvePaddingDelta(
        max,
        0,
        paddingTopRatio,
        paddingMode,
      );
      return {
        min: min - bottomDelta,
        max: max + topDelta,
      };
    }
    const delta = Math.max(Math.abs(min) * 0.2, 1);
    return {
      min: min - delta,
      max: max + delta,
    };
  }

  const range = max - min;
  let nextMin =
    paddingMode === "value"
      ? min - resolvePaddingDelta(min, range, paddingBottomRatio, paddingMode)
      : min - range * paddingBottomRatio;
  let nextMax =
    paddingMode === "value"
      ? max + resolvePaddingDelta(max, range, paddingTopRatio, paddingMode)
      : max + range * paddingTopRatio;

  if (options?.preferZeroBoundary) {
    if (min >= 0) {
      nextMin = Math.max(0, min - range * ratio * 0.6);
    }
    if (max <= 0) {
      nextMax = Math.min(0, max + range * ratio * 0.6);
    }
  }
  if (nextMax <= nextMin) {
    const delta = Math.max(Math.abs(nextMax) * 0.1, 1);
    nextMin -= delta;
    nextMax += delta;
  }
  return {
    min: nextMin,
    max: nextMax,
  };
};
