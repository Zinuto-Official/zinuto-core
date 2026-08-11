// SPDX-License-Identifier: GPL-3.0-only

import type { ApiReplayRatioState } from "@/api";

export const RATIO_POSITIVE_INFINITY_LABEL = "∞";

export const formatReplayRatioMultiplier = (
  value: number | null | undefined,
  state: ApiReplayRatioState,
  notAvailableLabel: string,
): string => {
  if (state === "POSITIVE_INFINITY") {
    return RATIO_POSITIVE_INFINITY_LABEL;
  }
  if (
    state !== "FINITE" ||
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return notAvailableLabel;
  }
  return `${value.toFixed(2)}x`;
};

export const resolveReplayProfitFactorTone = (
  value: number | null | undefined,
  state: ApiReplayRatioState,
): "up" | "down" | "flat" => {
  if (state === "POSITIVE_INFINITY") {
    return "up";
  }
  if (
    state !== "FINITE" ||
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return "flat";
  }
  return value >= 1.05 ? "up" : value < 0.95 ? "down" : "flat";
};
