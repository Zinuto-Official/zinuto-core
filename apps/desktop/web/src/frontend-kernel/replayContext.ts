// SPDX-License-Identifier: GPL-3.0-only

export type ReplayContextSummaryChipTone =
  | "neutral"
  | "positive"
  | "warning"
  | "danger";

export type ReplayContextMetricTone =
  | "up"
  | "down"
  | "flat"
  | "buy"
  | "sell"
  | "accent"
  | "warning"
  | "danger";

export type ReplayContextSummaryChip = {
  label: string;
  value: string;
  tone?: ReplayContextSummaryChipTone;
  secondaryTone?: ReplayContextMetricTone;
};
