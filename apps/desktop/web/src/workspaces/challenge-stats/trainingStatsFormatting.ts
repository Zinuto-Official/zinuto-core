// SPDX-License-Identifier: GPL-3.0-only

import { formatMoney, formatRatio } from "@/ui/formatting/format";
import type { UiLabelEntry } from "@/ui/config/uiLabels";

export const toDurationText = (value: number, ui: UiLabelEntry): string => {
  const safe = Number.isFinite(value) ? value : 0;
  const normalized = Math.max(0, safe);
  if (normalized >= 1) {
    return `${normalized.toFixed(1)} ${ui.statsUnitBars}`;
  }
  return `${normalized.toFixed(2)} ${ui.statsUnitBars}`;
};

export const toDayCountDisplay = (value: number): string => {
  const safe = Number.isFinite(value) ? value : 0;
  return formatMoney(Math.max(0, safe), 0);
};

export const toPercentDisplay = (value: number): string =>
  formatRatio(Number.isFinite(value) ? value : 0);

export const toSignedNumericText = (value: number, digits = 2): string => {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = formatMoney(Math.abs(safe), digits);
  if (safe > 0) {
    return `+${abs}`;
  }
  if (safe < 0) {
    return `-${abs}`;
  }
  return abs;
};

export const toSignedPercentDisplay = (value: number): string => {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = toPercentDisplay(Math.abs(safe));
  if (safe > 0) {
    return `+${abs}`;
  }
  if (safe < 0) {
    return `-${abs}`;
  }
  return abs;
};

export const toSignedDurationText = (value: number, ui: UiLabelEntry): string => {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = toDurationText(Math.abs(safe), ui);
  if (safe > 0) {
    return `+${abs}`;
  }
  if (safe < 0) {
    return `-${abs}`;
  }
  return abs;
};
