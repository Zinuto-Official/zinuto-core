// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import { formatMoneyFixed, formatSignedMoney } from "@/ui/formatting/format";
import type {
  FastDecisionCapitalReviewAnchor,
  FastDecisionCapitalReviewAnchorKind,
} from "@zinuto/shared/domain-calculations/fast-decision-capital-review";

export type FastDecisionCapitalPresentationCopy = {
  fastDecisionCapitalInitialLabel: string;
  fastDecisionCapitalHighWaterLabel: string;
  fastDecisionCapitalDrawdownLabel: string;
  fastDecisionCapitalFinalLabel: string;
  fastDecisionCapitalHighWaterShortLabel: string;
  fastDecisionCapitalDrawdownShortLabel: string;
  fastDecisionCapitalFinalShortLabel: string;
  fastDecisionCapitalCompactMinutesTemplate: string;
  fastDecisionCapitalCompactHoursTemplate: string;
  fastDecisionCapitalCompactDaysTemplate: string;
  fastDecisionCapitalCompactBarsTemplate: string;
  fastDecisionCapitalTimingMinutesTemplate: string;
  fastDecisionCapitalTimingHoursTemplate: string;
  fastDecisionCapitalTimingDaysTemplate: string;
  fastDecisionCapitalTimingBarsTemplate: string;
};

export type FastDecisionCapitalAnchorDisplayItem = {
  title: string;
  shortTitle: string;
  returnRateLabel: string;
  timingLabel: string;
  orderIndex: number;
  asset: number;
  mergedKinds: FastDecisionCapitalReviewAnchorKind[];
};

const FAST_DECISION_VISIBLE_ANCHOR_KINDS: readonly FastDecisionCapitalReviewAnchorKind[] =
  ["DRAWDOWN_TROUGH", "HIGH_WATER_MARK", "FINAL"];

const formatTemplate = (template: string, values: Array<string | number>): string =>
  values.reduce<string>(
    (current, value, index) => current.replace(`{${index}}`, String(value)),
    template,
  );

const sortVisibleAnchorKinds = (
  kinds: readonly FastDecisionCapitalReviewAnchorKind[],
): FastDecisionCapitalReviewAnchorKind[] => {
  const seen = new Set<FastDecisionCapitalReviewAnchorKind>();
  return FAST_DECISION_VISIBLE_ANCHOR_KINDS.filter((kind) => {
    if (seen.has(kind)) {
      return false;
    }
    const matched = kinds.includes(kind);
    if (matched) {
      seen.add(kind);
    }
    return matched;
  });
};

const formatFastDecisionCapitalAnchorLabel = (
  kind: FastDecisionCapitalReviewAnchorKind,
  copy: FastDecisionCapitalPresentationCopy,
): string => {
  if (kind === "INITIAL") {
    return copy.fastDecisionCapitalInitialLabel;
  }
  if (kind === "HIGH_WATER_MARK") {
    return copy.fastDecisionCapitalHighWaterLabel;
  }
  if (kind === "DRAWDOWN_TROUGH") {
    return copy.fastDecisionCapitalDrawdownLabel;
  }
  return copy.fastDecisionCapitalFinalLabel;
};

const formatFastDecisionCapitalAnchorShortLabel = (
  kind: FastDecisionCapitalReviewAnchorKind,
  copy: FastDecisionCapitalPresentationCopy,
): string => {
  if (kind === "HIGH_WATER_MARK") {
    return copy.fastDecisionCapitalHighWaterShortLabel;
  }
  if (kind === "DRAWDOWN_TROUGH") {
    return copy.fastDecisionCapitalDrawdownShortLabel;
  }
  if (kind === "FINAL") {
    return copy.fastDecisionCapitalFinalShortLabel;
  }
  return copy.fastDecisionCapitalInitialLabel;
};

export const formatFastDecisionCapitalAmount = (value: number): string =>
  formatMoneyFixed(Number.isFinite(value) ? value : 0, 0);

export const formatFastDecisionCapitalSignedAmount = (value: number): string =>
  formatSignedMoney(Number.isFinite(value) ? value : 0, 0);

export const formatFastDecisionCapitalPercent = (ratio: number, suffix: string): string =>
  `${formatMoneyFixed((Number.isFinite(ratio) ? ratio : 0) * 100, 0)}${suffix}`;

export const formatFastDecisionCapitalSignedPercent = (
  ratio: number,
  suffix: string,
): string => {
  const percentValue = (Number.isFinite(ratio) ? ratio : 0) * 100;
  const absolute = formatMoneyFixed(Math.abs(percentValue), 0);
  if (percentValue > 1e-9) {
    return `+${absolute}${suffix}`;
  }
  if (percentValue < -1e-9) {
    return `-${absolute}${suffix}`;
  }
  return `${absolute}${suffix}`;
};

export const formatFastDecisionCapitalTimingLabel = (value: {
  elapsedBars: number;
  baseTimeframe: BaseTimeframe | null;
  copy: FastDecisionCapitalPresentationCopy;
}): string => {
  const elapsedBars = Math.max(
    0,
    Math.floor(Number.isFinite(value?.elapsedBars) ? value.elapsedBars : 0),
  );
  const baseTimeframe = value?.baseTimeframe;
  const copy = value.copy;
  if (baseTimeframe === "1m") {
    return formatTemplate(copy.fastDecisionCapitalCompactMinutesTemplate, [
      elapsedBars,
    ]);
  }
  if (baseTimeframe === "5m") {
    const elapsedMinutes = elapsedBars * 5;
    return formatTemplate(copy.fastDecisionCapitalCompactMinutesTemplate, [
      elapsedMinutes,
    ]);
  }
  if (baseTimeframe === "1h") {
    return formatTemplate(copy.fastDecisionCapitalCompactHoursTemplate, [
      elapsedBars,
    ]);
  }
  if (baseTimeframe === "1d") {
    return formatTemplate(copy.fastDecisionCapitalCompactDaysTemplate, [
      elapsedBars,
    ]);
  }
  return formatTemplate(copy.fastDecisionCapitalCompactBarsTemplate, [elapsedBars]);
};

const compareFastDecisionCapitalAnchorDisplayItems = (
  left: FastDecisionCapitalAnchorDisplayItem,
  right: FastDecisionCapitalAnchorDisplayItem,
): number => left.orderIndex - right.orderIndex;

const resolveFastDecisionCapitalAnchorReturnRate = (
  asset: number,
  initialAsset: number,
): number => {
  const safeAsset = Number.isFinite(asset) ? asset : 0;
  const safeInitialAsset =
    Number.isFinite(initialAsset) && initialAsset > 0 ? initialAsset : 0;
  return safeInitialAsset > 0
    ? (safeAsset - safeInitialAsset) / safeInitialAsset
    : 0;
};

export const formatFastDecisionCapitalAnchorTitle = (
  kinds: FastDecisionCapitalReviewAnchorKind[],
  copy: FastDecisionCapitalPresentationCopy,
): string => {
  if (
    kinds.length === 2 &&
    kinds[0] === "DRAWDOWN_TROUGH" &&
    kinds[1] === "FINAL"
  ) {
    return `${copy.fastDecisionCapitalDrawdownShortLabel}/${copy.fastDecisionCapitalFinalLabel}`;
  }
  return kinds
    .map((kind) => formatFastDecisionCapitalAnchorLabel(kind, copy))
    .join(" / ");
};

export const formatFastDecisionCapitalAnchorShortTitle = (
  kinds: FastDecisionCapitalReviewAnchorKind[],
  copy: FastDecisionCapitalPresentationCopy,
): string => {
  if (
    kinds.length === 2 &&
    kinds[0] === "DRAWDOWN_TROUGH" &&
    kinds[1] === "FINAL"
  ) {
    return `${copy.fastDecisionCapitalDrawdownShortLabel}/${copy.fastDecisionCapitalFinalShortLabel}`;
  }
  return kinds
    .map((kind) => formatFastDecisionCapitalAnchorShortLabel(kind, copy))
    .join(" / ");
};

export const buildFastDecisionCapitalAnchorDisplayItems = (value: {
  anchors: readonly FastDecisionCapitalReviewAnchor[];
  initialAsset: number;
  baseTimeframe: BaseTimeframe | null;
  percentSuffix: string;
  copy: FastDecisionCapitalPresentationCopy;
}): FastDecisionCapitalAnchorDisplayItem[] =>
  (Array.isArray(value.anchors) ? value.anchors : [])
    .map<FastDecisionCapitalAnchorDisplayItem | null>((anchor) => {
      const mergedKinds = sortVisibleAnchorKinds(anchor.kinds);
      if (!mergedKinds.length) {
        return null;
      }
      return {
        title: formatFastDecisionCapitalAnchorTitle(mergedKinds, value.copy),
        shortTitle: formatFastDecisionCapitalAnchorShortTitle(
          mergedKinds,
          value.copy,
        ),
        returnRateLabel: formatFastDecisionCapitalSignedPercent(
          resolveFastDecisionCapitalAnchorReturnRate(
            anchor.asset,
            value.initialAsset,
          ),
          value.percentSuffix,
        ),
        timingLabel: formatFastDecisionCapitalTimingLabel({
          elapsedBars: anchor.elapsedBars,
          baseTimeframe: value.baseTimeframe,
          copy: value.copy,
        }),
        orderIndex: anchor.orderIndex,
        asset: anchor.asset,
        mergedKinds,
      };
    })
    .filter((item): item is FastDecisionCapitalAnchorDisplayItem => Boolean(item))
    .sort(compareFastDecisionCapitalAnchorDisplayItems);
