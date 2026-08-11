// SPDX-License-Identifier: GPL-3.0-only

import type { ReplayContextSummaryChip } from "@/frontend-kernel/replayContext";
import type { ApiSpecialTrainingScopeRestartSignal } from "@/api";
import {
  formatMoney,
  formatMoneyFixed,
  formatSignedMoney,
} from "@/ui/formatting/format";
import { tt, ttf } from "@/frontend-kernel/i18n/messageRuntime";
import {
  formatFastDecisionCapitalPercent,
  formatFastDecisionCapitalSignedPercent,
} from "@/workspaces/special-training/fastDecisionCapitalPresentation";

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const toFiniteNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
};

export const formatTemplate = (
  template: string,
  values: Array<string | number>,
): string =>
  values.reduce<string>(
    (current, value, index) => current.replace(`{${index}}`, String(value)),
    template,
  );

export const formatPrice = (value: number): string => formatMoney(value, 2);

export const formatSigned = (value: number): string => formatSignedMoney(value, 2);

export const formatPercent = (ratio: number): string =>
  `${formatMoney((Number.isFinite(ratio) ? ratio : 0) * 100, 2)}${tt("appText.percent")}`;

export const formatPercentFixed = (ratio: number, digits = 2): string =>
  `${formatMoneyFixed((Number.isFinite(ratio) ? ratio : 0) * 100, digits)}${tt("appText.percent")}`;

export const formatRoundedPercent = (ratio: number): string =>
  formatFastDecisionCapitalPercent(ratio, tt("appText.percent"));

export const formatRoundedSignedPercent = (ratio: number): string =>
  formatFastDecisionCapitalSignedPercent(ratio, tt("appText.percent"));

export const formatConfigValue = (value: number, digits = 1): string => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const fixed = safeValue.toFixed(Math.max(0, Math.min(6, digits)));
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
};

export const formatCountdownClock = (seconds: number): string => {
  const safeSeconds = Math.max(
    0,
    Math.floor(Number.isFinite(seconds) ? seconds : 0),
  );
  const minutes = Math.floor(safeSeconds / 60);
  const remainSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainSeconds).padStart(2, "0")}`;
};

export const resolveSummaryChipTone = (
  value: number,
): ReplayContextSummaryChip["tone"] =>
  value > 0 ? "positive" : value < 0 ? "danger" : "neutral";

export const resolvePnlClass = (value: number): string => {
  if (!Number.isFinite(value) || value === 0) {
    return "flat";
  }
  return value > 0 ? "up" : "down";
};

export const toNullableFiniteNumber = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export const toNullableInteger = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : null;
};

export const toNullableTrimmedString = (value: unknown): string | null => {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
};

export const readRiskCurvePoint = (
  value: unknown,
): { barIndex: number | null; asset: number | null } => {
  if (typeof value === "number") {
    return {
      barIndex: null,
      asset: toNullableFiniteNumber(value),
    };
  }
  if (!value || typeof value !== "object") {
    return {
      barIndex: null,
      asset: null,
    };
  }
  const point = value as {
    barIndex?: unknown;
    x?: unknown;
    asset?: unknown;
    y?: unknown;
  };
  return {
    barIndex: toNullableInteger(point.barIndex ?? point.x),
    asset: toNullableFiniteNumber(point.asset ?? point.y),
  };
};

export const normalizeAlphaAsRatio = (
  value: number | null,
  baseAsset: number | null,
): number | null => {
  if (value === null) {
    return null;
  }
  if (Math.abs(value) <= 2) {
    return value;
  }
  if (baseAsset === null || Math.abs(baseAsset) <= 1e-9) {
    return null;
  }
  return value / Math.abs(baseAsset);
};

export const resolveFirstCurveValue = (
  values: Array<number | null>,
): number | null => {
  for (const value of values) {
    if (value !== null) {
      return value;
    }
  }
  return null;
};

export const formatScopeRestartDescription = (
  signal: ApiSpecialTrainingScopeRestartSignal,
): string =>
  ttf("appText.questionSlotsExhaustedSoSystemRestartedFormalQuestionValue0Value1Value2", [
    Math.max(0, Math.floor(toFiniteNumber(signal.requestedQuestionCount) || 0)),
    Math.max(
      0,
      Math.floor(toFiniteNumber(signal.previousUsedQuestionCount) || 0),
    ),
    Math.max(0, Math.floor(toFiniteNumber(signal.totalQuestionCount) || 0)),
  ]);
