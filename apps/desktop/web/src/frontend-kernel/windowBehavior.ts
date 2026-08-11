// SPDX-License-Identifier: GPL-3.0-only

import type { DesktopCloseButtonAction } from "@/frontend-kernel/windowBehaviorTypes";

export const DESKTOP_CLOSE_BUTTON_ACTIONS = [
  "ASK",
  "MINIMIZE_TO_TRAY",
  "QUIT",
] as const satisfies readonly DesktopCloseButtonAction[];

export const DEFAULT_DESKTOP_CLOSE_BUTTON_ACTION =
  "ASK" as const satisfies DesktopCloseButtonAction;

export type DesktopCloseRequestPlan = "PROMPT" | "MINIMIZE_TO_TRAY" | "QUIT";

export const isDesktopCloseButtonAction = (
  value: unknown,
): value is DesktopCloseButtonAction =>
  DESKTOP_CLOSE_BUTTON_ACTIONS.includes(value as DesktopCloseButtonAction);

export const normalizeDesktopCloseButtonAction = (
  value: unknown,
): DesktopCloseButtonAction =>
  isDesktopCloseButtonAction(value)
    ? value
    : DEFAULT_DESKTOP_CLOSE_BUTTON_ACTION;

export const resolveDesktopCloseRequestPlan = (
  action: DesktopCloseButtonAction,
): DesktopCloseRequestPlan => {
  switch (action) {
    case "MINIMIZE_TO_TRAY":
      return "MINIMIZE_TO_TRAY";
    case "QUIT":
      return "QUIT";
    case "ASK":
    default:
      return "PROMPT";
  }
};
