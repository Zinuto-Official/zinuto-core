// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react";
import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import { AppIcon } from "@/assets/graphics";
import type {
  SpecialTrainingModeDefinition,
  SpecialTrainingModeId,
} from "@/ui/config/uiConfig";
import { resolveSpecialTrainingModeHeroIconName } from "@/workspaces/special-training/specialTrainingModeRegistry";
import type { SpecialTrainingPrepTone } from "@/workspaces/special-training/components/specialTrainingModePickerViewTypes";

export type ModePickerTabItem = {
  key: SpecialTrainingModeId;
  label: ReactNode;
  desc?: ReactNode;
  disabled?: boolean;
  className?: string;
};

export const resolvePrepToneClassName = (
  tone: SpecialTrainingPrepTone,
): string => `is-${tone}`;

export const formatBankScopeTimeframeSummary = (
  timeframes: readonly BaseTimeframe[],
  fallbackTimeframe: BaseTimeframe,
  formatBankTimeframeLabel: (timeframe: BaseTimeframe) => string,
): string => {
  const normalizedTimeframes =
    timeframes.length > 0 ? timeframes : [fallbackTimeframe];
  return normalizedTimeframes.map(formatBankTimeframeLabel).join(" / ");
};

export const buildModePickerTabItems = (
  availableModes: SpecialTrainingModeDefinition[],
): ModePickerTabItem[] =>
  availableModes.map((mode) => ({
    key: mode.id,
    className: mode.id === "risk-discipline-training" ? "is-risk" : "is-fast",
    label: (
      <span className="special-training-prep-switcher-label-main">
        <span className="special-training-prep-switcher-label-icon-shell">
          <AppIcon
            name={resolveSpecialTrainingModeHeroIconName(mode.id)}
            className="special-training-prep-switcher-label-icon"
          />
        </span>
        <span className="special-training-prep-switcher-label-title">
          {mode.title}
        </span>
      </span>
    ),
    desc: (
      <span className="special-training-prep-switcher-subtitle">
        {mode.switcherSubtitle}
      </span>
    ),
  }));
