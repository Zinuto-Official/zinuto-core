// SPDX-License-Identifier: GPL-3.0-only

export type FastDecisionChoice = "LONG" | "SHORT" | "OBSERVE";
export type FastDecisionStrictnessLevel = "LENIENT" | "STANDARD" | "STRICT";

export const FAST_DECISION_CHOICE_LONG: FastDecisionChoice = "LONG";
export const FAST_DECISION_CHOICE_SHORT: FastDecisionChoice = "SHORT";
export const FAST_DECISION_CHOICE_OBSERVE: FastDecisionChoice = "OBSERVE";

export type FastDecisionBarLike = {
  open?: unknown;
  high?: unknown;
  low?: unknown;
  close?: unknown;
};

export type FastDecisionEvaluation = {
  actual: FastDecisionChoice;
  revealEndIndex: number;
  longSuccess: boolean;
  shortSuccess: boolean;
  observeSuccess: boolean;
  longMfeRatio: number;
  longMaeRatio: number;
  shortMfeRatio: number;
  shortMaeRatio: number;
  dominanceRatio: number;
};

export const FAST_DECISION_STRICTNESS_RATIO_BY_LEVEL = Object.freeze({
  LENIENT: 1.2,
  STANDARD: 1.5,
  STRICT: 2,
}) satisfies Readonly<Record<FastDecisionStrictnessLevel, number>>;
export const FAST_DECISION_DEFAULT_STRICTNESS_LEVEL = "STANDARD";
const FAST_DECISION_DOMINANCE_RATIO_MIN = 1.001;
const FAST_DECISION_DOMINANCE_RATIO_MAX = 9;

const toFiniteNumber = (value: unknown, fallback = Number.NaN): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const resolveFastDecisionStrictnessLevel = (
  value?: unknown,
): FastDecisionStrictnessLevel => {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (
    normalized === "LENIENT" ||
    normalized === "STANDARD" ||
    normalized === "STRICT"
  ) {
    return normalized;
  }
  return FAST_DECISION_DEFAULT_STRICTNESS_LEVEL;
};

export const resolveFastDecisionDominanceRatio = (value?: {
  strictnessLevel?: unknown;
  dominanceRatio?: unknown;
}): number => {
  const strictnessLevel = resolveFastDecisionStrictnessLevel(value?.strictnessLevel);
  const fallbackRatio = FAST_DECISION_STRICTNESS_RATIO_BY_LEVEL[strictnessLevel];
  const numericRatio = toFiniteNumber(value?.dominanceRatio, fallbackRatio);
  if (!Number.isFinite(numericRatio)) {
    return fallbackRatio;
  }
  return clamp(numericRatio, FAST_DECISION_DOMINANCE_RATIO_MIN, FAST_DECISION_DOMINANCE_RATIO_MAX);
};

export const evaluateFastDecision = (value: {
  bars: readonly FastDecisionBarLike[];
  startIndex: number;
  revealBars: number;
  strictnessLevel?: unknown;
  dominanceRatio?: unknown;
}): FastDecisionEvaluation | null => {
  const bars = Array.isArray(value?.bars) ? value.bars : [];
  if (!bars.length) {
    return null;
  }

  const revealBarsRaw = Math.floor(toFiniteNumber(value?.revealBars, 0));
  if (!Number.isFinite(revealBarsRaw) || revealBarsRaw <= 0) {
    return null;
  }

  const safeStart = clamp(Math.floor(toFiniteNumber(value?.startIndex, 0)), 0, bars.length - 1);
  const revealEndIndex = clamp(safeStart + revealBarsRaw, safeStart, bars.length - 1);
  if (revealEndIndex <= safeStart) {
    return null;
  }

  const startClose = toFiniteNumber(bars[safeStart]?.close);
  if (!Number.isFinite(startClose) || Math.abs(startClose) < 1e-6) {
    return null;
  }

  const revealWindowBars = bars.slice(safeStart + 1, revealEndIndex + 1);
  if (!revealWindowBars.length) {
    return null;
  }

  let maxOpenClose = Number.NEGATIVE_INFINITY;
  let minOpenClose = Number.POSITIVE_INFINITY;
  revealWindowBars.forEach((bar) => {
    const open = toFiniteNumber(bar?.open);
    const close = toFiniteNumber(bar?.close);
    if (Number.isFinite(open) && Number.isFinite(close)) {
      maxOpenClose = Math.max(maxOpenClose, open, close);
      minOpenClose = Math.min(minOpenClose, open, close);
      return;
    }
    if (Number.isFinite(open)) {
      maxOpenClose = Math.max(maxOpenClose, open);
      minOpenClose = Math.min(minOpenClose, open);
      return;
    }
    if (Number.isFinite(close)) {
      maxOpenClose = Math.max(maxOpenClose, close);
      minOpenClose = Math.min(minOpenClose, close);
    }
  });

  if (!Number.isFinite(maxOpenClose) || !Number.isFinite(minOpenClose)) {
    return null;
  }

  const denominator = Math.abs(startClose);
  const longMfeRatio = Math.max(0, (maxOpenClose - startClose) / denominator);
  const longMaeRatio = Math.max(0, (startClose - minOpenClose) / denominator);
  const shortMfeRatio = longMaeRatio;
  const shortMaeRatio = longMfeRatio;
  const dominanceRatio = resolveFastDecisionDominanceRatio(value);

  const longSuccess = longMfeRatio > longMaeRatio * dominanceRatio;
  const shortSuccess = shortMfeRatio > shortMaeRatio * dominanceRatio;
  const observeSuccess = !longSuccess && !shortSuccess;

  let actual: FastDecisionChoice = "OBSERVE";
  if (longSuccess && !shortSuccess) {
    actual = "LONG";
  } else if (shortSuccess && !longSuccess) {
    actual = "SHORT";
  }

  return {
    actual,
    revealEndIndex,
    longSuccess,
    shortSuccess,
    observeSuccess,
    longMfeRatio,
    longMaeRatio,
    shortMfeRatio,
    shortMaeRatio,
    dominanceRatio
  };
};
