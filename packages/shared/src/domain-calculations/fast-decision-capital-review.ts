// SPDX-License-Identifier: GPL-3.0-only

import type { FastDecisionChoice } from "./fast-decision.js";

export const FAST_DECISION_REVIEW_INITIAL_ASSET = 10000;
export const FAST_DECISION_REVIEW_MODEL_KIND = "NOTIONAL_CAPITAL_V1" as const;

export type FastDecisionCapitalReviewStep = "ENTRY" | "OPEN" | "CLOSE";
export type FastDecisionCapitalReviewBarLike = {
  ts?: unknown;
  open?: unknown;
  high?: unknown;
  low?: unknown;
  close?: unknown;
};
export type FastDecisionCapitalReviewAnchorKind =
  | "INITIAL"
  | "HIGH_WATER_MARK"
  | "DRAWDOWN_TROUGH"
  | "FINAL";

export type FastDecisionCapitalReviewPoint = {
  orderIndex: number;
  barIndex: number;
  step: FastDecisionCapitalReviewStep;
  ts: string;
  price: number;
  asset: number;
};

export type FastDecisionCapitalReviewAnchor = {
  kinds: FastDecisionCapitalReviewAnchorKind[];
  orderIndex: number;
  barIndex: number;
  step: FastDecisionCapitalReviewStep;
  ts: string;
  asset: number;
  elapsedBars: number;
};

export type FastDecisionCapitalReviewModel = {
  kind: typeof FAST_DECISION_REVIEW_MODEL_KIND;
  initialAsset: number;
  leverageMultiplier: number;
  feeRate: number;
  slippageRate: number;
  shortSimulation: "MIRRORED";
  affectsScoring: false;
};

export type FastDecisionCapitalReview = {
  initialAsset: number;
  finalAsset: number;
  totalPnl: number;
  returnRate: number;
  maxDrawdownRate: number;
  maxDrawdownAmount: number;
  curve: FastDecisionCapitalReviewPoint[];
  anchors: FastDecisionCapitalReviewAnchor[];
  referenceCurve: FastDecisionCapitalReviewPoint[] | null;
  referenceDirection: FastDecisionChoice | null;
  model: FastDecisionCapitalReviewModel;
};

export type FastDecisionCapitalReviewLike = Pick<
  FastDecisionCapitalReview,
  | "initialAsset"
  | "finalAsset"
  | "totalPnl"
  | "returnRate"
  | "maxDrawdownRate"
  | "maxDrawdownAmount"
>;

export type FastDecisionCapitalSessionSummary = {
  questionCount: number;
  totalInvested: number;
  aggregateFinalAsset: number;
  aggregatePnl: number;
  aggregateReturnRate: number;
  positiveCount: number;
  flatCount: number;
  negativeCount: number;
  bestReviewIndex: number | null;
  worstReviewIndex: number | null;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const toFiniteNumber = (value: unknown, fallback = Number.NaN): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizePositiveNumber = (value: unknown, fallback: number): number => {
  const numeric = toFiniteNumber(value, fallback);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return numeric;
};

const resolvePointAsset = (
  direction: FastDecisionChoice,
  price: number,
  entryPrice: number,
  initialAsset: number,
): number => {
  if (!Number.isFinite(price) || price <= 0) {
    return initialAsset;
  }
  if (direction === "OBSERVE") {
    return initialAsset;
  }
  const moveRatio = (price - entryPrice) / entryPrice;
  if (direction === "LONG") {
    return Math.max(0, initialAsset * (1 + moveRatio));
  }
  return Math.max(0, initialAsset * (1 - moveRatio));
};

const appendCurvePoint = (
  points: FastDecisionCapitalReviewPoint[],
  next: FastDecisionCapitalReviewPoint | null,
): void => {
  if (!next) {
    return;
  }
  points.push(next);
};

const buildDirectionalCurve = (value: {
  bars: readonly FastDecisionCapitalReviewBarLike[];
  startIndex: number;
  revealEndIndex: number;
  direction: FastDecisionChoice;
  initialAsset: number;
}): FastDecisionCapitalReviewPoint[] | null => {
  const bars = Array.isArray(value?.bars) ? value.bars : [];
  if (!bars.length) {
    return null;
  }

  const safeStartIndex = clamp(
    Math.floor(toFiniteNumber(value?.startIndex, 0)),
    0,
    bars.length - 1,
  );
  const safeRevealEndIndex = clamp(
    Math.floor(toFiniteNumber(value?.revealEndIndex, safeStartIndex)),
    safeStartIndex,
    bars.length - 1,
  );
  const entryPrice = toFiniteNumber(bars[safeStartIndex]?.close);
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    return null;
  }

  const direction =
    value?.direction === "LONG" ||
    value?.direction === "SHORT" ||
    value?.direction === "OBSERVE"
      ? value.direction
      : "OBSERVE";
  const initialAsset = normalizePositiveNumber(
    value?.initialAsset,
    FAST_DECISION_REVIEW_INITIAL_ASSET,
  );
  const curve: FastDecisionCapitalReviewPoint[] = [
    {
      orderIndex: 0,
      barIndex: safeStartIndex,
      step: "ENTRY",
      ts: String(bars[safeStartIndex]?.ts ?? ""),
      price: entryPrice,
      asset: initialAsset,
    },
  ];

  let orderIndex = 1;
  for (
    let barIndex = safeStartIndex + 1;
    barIndex <= safeRevealEndIndex;
    barIndex += 1
  ) {
    const bar = bars[barIndex];
    const open = toFiniteNumber(bar?.open);
    if (Number.isFinite(open) && open > 0) {
      appendCurvePoint(curve, {
        orderIndex,
        barIndex,
        step: "OPEN",
        ts: String(bar?.ts ?? ""),
        price: open,
        asset: resolvePointAsset(direction, open, entryPrice, initialAsset),
      });
      orderIndex += 1;
    }

    const close = toFiniteNumber(bar?.close);
    if (Number.isFinite(close) && close > 0) {
      appendCurvePoint(curve, {
        orderIndex,
        barIndex,
        step: "CLOSE",
        ts: String(bar?.ts ?? ""),
        price: close,
        asset: resolvePointAsset(direction, close, entryPrice, initialAsset),
      });
      orderIndex += 1;
    }
  }

  return curve;
};

const resolveAnchorGroups = (
  curve: FastDecisionCapitalReviewPoint[],
  startIndex: number,
): FastDecisionCapitalReviewAnchor[] => {
  if (!curve.length) {
    return [];
  }

  let highWaterIndex = 0;
  let drawdownTroughIndex = 0;
  let runningPeak = curve[0]?.asset ?? 0;
  let maxDrawdownRate = 0;

  curve.forEach((point, index) => {
    if (point.asset > curve[highWaterIndex]!.asset) {
      highWaterIndex = index;
    }
    if (point.asset > runningPeak) {
      runningPeak = point.asset;
    }
    const drawdownRate = runningPeak > 0 ? (runningPeak - point.asset) / runningPeak : 0;
    if (drawdownRate > maxDrawdownRate) {
      maxDrawdownRate = drawdownRate;
      drawdownTroughIndex = index;
    }
  });

  const anchorKindsByIndex = new Map<number, FastDecisionCapitalReviewAnchorKind[]>();
  const appendAnchorKind = (
    index: number,
    kind: FastDecisionCapitalReviewAnchorKind,
  ) => {
    const current = anchorKindsByIndex.get(index) ?? [];
    current.push(kind);
    anchorKindsByIndex.set(index, current);
  };

  appendAnchorKind(0, "INITIAL");
  appendAnchorKind(highWaterIndex, "HIGH_WATER_MARK");
  appendAnchorKind(drawdownTroughIndex, "DRAWDOWN_TROUGH");
  appendAnchorKind(curve.length - 1, "FINAL");

  return Array.from(anchorKindsByIndex.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([index, kinds]) => {
      const point = curve[index]!;
      return {
        kinds,
        orderIndex: point.orderIndex,
        barIndex: point.barIndex,
        step: point.step,
        ts: point.ts,
        asset: point.asset,
        elapsedBars: Math.max(0, point.barIndex - startIndex),
      };
    });
};

const resolveMaxDrawdownRate = (curve: FastDecisionCapitalReviewPoint[]): number => {
  if (!curve.length) {
    return 0;
  }
  let runningPeak = curve[0]?.asset ?? 0;
  let maxDrawdownRate = 0;
  curve.forEach((point) => {
    if (point.asset > runningPeak) {
      runningPeak = point.asset;
    }
    const drawdownRate = runningPeak > 0 ? (runningPeak - point.asset) / runningPeak : 0;
    if (drawdownRate > maxDrawdownRate) {
      maxDrawdownRate = drawdownRate;
    }
  });
  return maxDrawdownRate;
};

export const buildFastDecisionCapitalReview = (value: {
  bars: readonly FastDecisionCapitalReviewBarLike[];
  startIndex: number;
  revealEndIndex: number;
  selection: FastDecisionChoice;
  actual: FastDecisionChoice;
  initialAsset?: number;
}): FastDecisionCapitalReview | null => {
  const initialAsset = normalizePositiveNumber(
    value?.initialAsset,
    FAST_DECISION_REVIEW_INITIAL_ASSET,
  );
  const curve = buildDirectionalCurve({
    bars: value?.bars ?? [],
    startIndex: value?.startIndex ?? 0,
    revealEndIndex: value?.revealEndIndex ?? value?.startIndex ?? 0,
    direction:
      value?.selection === "LONG" ||
      value?.selection === "SHORT" ||
      value?.selection === "OBSERVE"
        ? value.selection
        : "OBSERVE",
    initialAsset,
  });
  if (!curve || !curve.length) {
    return null;
  }

  const finalAsset = curve[curve.length - 1]?.asset ?? initialAsset;
  const totalPnl = finalAsset - initialAsset;
  const returnRate = initialAsset > 0 ? totalPnl / initialAsset : 0;
  const maxDrawdownRate = resolveMaxDrawdownRate(curve);
  const referenceDirection =
    value?.actual !== "LONG" &&
    value?.actual !== "SHORT" &&
    value?.actual !== "OBSERVE"
      ? null
      : value.actual !== value.selection && value.actual !== "OBSERVE"
        ? value.actual
        : null;
  const referenceCurve = referenceDirection
    ? buildDirectionalCurve({
        bars: value?.bars ?? [],
        startIndex: value?.startIndex ?? 0,
        revealEndIndex: value?.revealEndIndex ?? value?.startIndex ?? 0,
        direction: referenceDirection,
        initialAsset,
      })
    : null;

  return {
    initialAsset,
    finalAsset,
    totalPnl,
    returnRate,
    maxDrawdownRate,
    maxDrawdownAmount: initialAsset * maxDrawdownRate,
    curve,
    anchors: resolveAnchorGroups(
      curve,
      clamp(
        Math.floor(toFiniteNumber(value?.startIndex, 0)),
        0,
        Math.max(0, curve[curve.length - 1]?.barIndex ?? 0),
      ),
    ),
    referenceCurve: referenceCurve && referenceCurve.length ? referenceCurve : null,
    referenceDirection,
    model: {
      kind: FAST_DECISION_REVIEW_MODEL_KIND,
      initialAsset,
      leverageMultiplier: 1,
      feeRate: 0,
      slippageRate: 0,
      shortSimulation: "MIRRORED",
      affectsScoring: false,
    },
  };
};

export const summarizeFastDecisionCapitalSession = (
  reviews: readonly (FastDecisionCapitalReviewLike | null | undefined)[],
): FastDecisionCapitalSessionSummary => {
  let totalInvested = 0;
  let aggregateFinalAsset = 0;
  let aggregatePnl = 0;
  let positiveCount = 0;
  let flatCount = 0;
  let negativeCount = 0;
  let bestReviewIndex: number | null = null;
  let worstReviewIndex: number | null = null;
  let bestPnl = Number.NEGATIVE_INFINITY;
  let worstPnl = Number.POSITIVE_INFINITY;
  let questionCount = 0;

  reviews.forEach((review, index) => {
    if (!review) {
      return;
    }
    questionCount += 1;
    const initialAsset = normalizePositiveNumber(
      review.initialAsset,
      FAST_DECISION_REVIEW_INITIAL_ASSET,
    );
    const totalPnl = Number(review.totalPnl) || 0;
    const finalAsset = Number.isFinite(Number(review.finalAsset))
      ? Number(review.finalAsset)
      : initialAsset + totalPnl;
    totalInvested += initialAsset;
    aggregateFinalAsset += finalAsset;
    aggregatePnl += totalPnl;
    if (totalPnl > 1e-9) {
      positiveCount += 1;
    } else if (totalPnl < -1e-9) {
      negativeCount += 1;
    } else {
      flatCount += 1;
    }
    if (totalPnl > bestPnl) {
      bestPnl = totalPnl;
      bestReviewIndex = index;
    }
    if (totalPnl < worstPnl) {
      worstPnl = totalPnl;
      worstReviewIndex = index;
    }
  });

  return {
    questionCount,
    totalInvested,
    aggregateFinalAsset,
    aggregatePnl,
    aggregateReturnRate: totalInvested > 0 ? aggregatePnl / totalInvested : 0,
    positiveCount,
    flatCount,
    negativeCount,
    bestReviewIndex,
    worstReviewIndex,
  };
};
