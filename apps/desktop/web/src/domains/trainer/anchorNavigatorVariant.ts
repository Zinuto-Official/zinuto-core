// SPDX-License-Identifier: GPL-3.0-only

export type AnchorNavigatorVariant = "dropdown" | "embedded";
export type AnchorNavigatorCommitMode = "explicit" | "immediate";

export type AnchorNavigatorChromeModel = {
  isEmbedded: boolean;
  showsDropdownTrigger: boolean;
  showsViewModeSwitch: boolean;
  showsApplyAction: boolean;
  usesInlineWeekStartSelector: boolean;
  usesInlineYearLabel: boolean;
};

export const resolveAnchorNavigatorChrome = ({
  variant,
  commitMode,
}: {
  variant: AnchorNavigatorVariant;
  commitMode: AnchorNavigatorCommitMode;
}): AnchorNavigatorChromeModel => {
  const isEmbedded = variant === "embedded";
  return {
    isEmbedded,
    showsDropdownTrigger: !isEmbedded,
    showsViewModeSwitch: !isEmbedded,
    showsApplyAction: commitMode === "explicit",
    usesInlineWeekStartSelector: false,
    usesInlineYearLabel: false,
  };
};
