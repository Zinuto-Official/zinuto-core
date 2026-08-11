// SPDX-License-Identifier: GPL-3.0-only

export const FAST_DECISION_RATIO_GAUGE_MIN = 0;
export const FAST_DECISION_RATIO_GAUGE_MAX = 5;
const FAST_DECISION_RATIO_GAUGE_DEFAULT_THRESHOLD = 1.5;
const FAST_DECISION_DOMINANCE_RATIO_MIN = 1.001;
const FAST_DECISION_DOMINANCE_RATIO_MAX = 9;
const FAST_DECISION_RATIO_GAUGE_LABEL_EPSILON = 0.0001;
const FAST_DECISION_RATIO_GAUGE_LABEL_CENTER_X = 50;
const FAST_DECISION_RATIO_GAUGE_LABEL_CENTER_Y = 80;
const FAST_DECISION_RATIO_GAUGE_LABEL_RADIUS_X = 38;
const FAST_DECISION_RATIO_GAUGE_LABEL_RADIUS_Y = 56;
const FAST_DECISION_RATIO_GAUGE_DEFAULT_ANCHOR_VALUES = [0, 1.5, 3, 5] as const;

export type FastDecisionRatioGaugeTone = "down" | "up";
export type FastDecisionRatioGaugeAnchorTone = "down" | "up" | "threshold";
export type FastDecisionRatioGaugeAnchorAlign = "left" | "center" | "right";
export type FastDecisionRatioGaugeAnchor = {
  value: number;
  leftPercent: number;
  topPercent: number;
  align: FastDecisionRatioGaugeAnchorAlign;
  tone: FastDecisionRatioGaugeAnchorTone;
  isThreshold: boolean;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const normalizeFastDecisionDominanceRatio = (value?: unknown): number => {
  const numeric = Number(value);
  return clamp(
    Number.isFinite(numeric)
      ? numeric
      : FAST_DECISION_RATIO_GAUGE_DEFAULT_THRESHOLD,
    FAST_DECISION_DOMINANCE_RATIO_MIN,
    FAST_DECISION_DOMINANCE_RATIO_MAX,
  );
};

export const resolveFastDecisionRatioGaugeThreshold = (
  dominanceRatio?: unknown,
): number =>
  clamp(
    normalizeFastDecisionDominanceRatio(dominanceRatio),
    FAST_DECISION_RATIO_GAUGE_MIN,
    FAST_DECISION_RATIO_GAUGE_MAX,
  );

export const resolveFastDecisionRatioGaugeStop = (
  dominanceRatio?: unknown,
): number => {
  const threshold = resolveFastDecisionRatioGaugeThreshold(dominanceRatio);
  return threshold / FAST_DECISION_RATIO_GAUGE_MAX;
};

export const resolveFastDecisionRatioGaugeTone = (value: {
  ratioValue: unknown;
  dominanceRatio?: unknown;
}): FastDecisionRatioGaugeTone => {
  const threshold = resolveFastDecisionRatioGaugeThreshold(
    value.dominanceRatio,
  );
  const ratioValue = clamp(
    Number(value.ratioValue) || 0,
    FAST_DECISION_RATIO_GAUGE_MIN,
    FAST_DECISION_RATIO_GAUGE_MAX,
  );

  if (ratioValue >= threshold) {
    return "up";
  }
  return "down";
};

export const resolveFastDecisionRatioGaugeAnchors = (
  dominanceRatio?: unknown,
): FastDecisionRatioGaugeAnchor[] => {
  const threshold = resolveFastDecisionRatioGaugeThreshold(dominanceRatio);
  const values = Array.from(
    new Set([
      ...FAST_DECISION_RATIO_GAUGE_DEFAULT_ANCHOR_VALUES,
      threshold,
    ]),
  ).sort((left, right) => left - right);

  return values.map((rawValue) => {
    const value = clamp(
      rawValue,
      FAST_DECISION_RATIO_GAUGE_MIN,
      FAST_DECISION_RATIO_GAUGE_MAX,
    );
    const angleRad =
      Math.PI -
      (value / FAST_DECISION_RATIO_GAUGE_MAX) * Math.PI;
    const leftPercent = clamp(
      FAST_DECISION_RATIO_GAUGE_LABEL_CENTER_X +
        Math.cos(angleRad) * FAST_DECISION_RATIO_GAUGE_LABEL_RADIUS_X,
      6,
      94,
    );
    const topPercent = clamp(
      FAST_DECISION_RATIO_GAUGE_LABEL_CENTER_Y -
        Math.sin(angleRad) * FAST_DECISION_RATIO_GAUGE_LABEL_RADIUS_Y,
      12,
      90,
    );
    const isThreshold =
      Math.abs(value - threshold) <= FAST_DECISION_RATIO_GAUGE_LABEL_EPSILON;

    let align: FastDecisionRatioGaugeAnchorAlign = "center";
    if (isThreshold) {
      align = "center";
    } else if (leftPercent <= 24) {
      align = "left";
    } else if (leftPercent >= 76) {
      align = "right";
    }

    let tone: FastDecisionRatioGaugeAnchorTone = "down";
    if (isThreshold) {
      tone = "threshold";
    } else if (value >= threshold) {
      tone = "up";
    }

    return {
      value,
      leftPercent,
      topPercent,
      align,
      tone,
      isThreshold,
    };
  });
};
