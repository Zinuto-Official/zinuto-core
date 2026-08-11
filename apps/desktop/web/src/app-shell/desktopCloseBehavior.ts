// SPDX-License-Identifier: GPL-3.0-only

import type { DesktopCloseButtonAction } from "@/frontend-kernel/windowBehaviorTypes";
import type { UiSettings } from "@/frontend-kernel/appTypes";
import { normalizeDesktopCloseButtonAction } from "@/frontend-kernel/windowBehavior";

export const resolveDesktopCloseButtonActionFromUiSettings = (
  settings: Pick<UiSettings, "desktopCloseButtonAction"> | null | undefined,
): DesktopCloseButtonAction =>
  normalizeDesktopCloseButtonAction(settings?.desktopCloseButtonAction);

export const buildUiSettingsWithDesktopCloseButtonAction = (
  settings: UiSettings,
  action: DesktopCloseButtonAction,
): UiSettings => ({
  ...settings,
  desktopCloseButtonAction: action,
});
