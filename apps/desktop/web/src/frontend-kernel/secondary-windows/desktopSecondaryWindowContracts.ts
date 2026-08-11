// SPDX-License-Identifier: GPL-3.0-only

import type {
  DesktopSecondaryWindowStateRecord,
} from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowManagerModel";
import {
  DESKTOP_SECONDARY_WINDOW_KINDS,
  type DesktopSecondaryWindowKind,
} from "@/frontend-kernel/secondary-windows/desktopWindowViewportConfig";
import type { TradeColorThemeToken } from "@/ui/theme/visualColors";

export type {
  DesktopSecondaryWindowKind,
} from "@/frontend-kernel/secondary-windows/desktopWindowViewportConfig";

export const DESKTOP_SECONDARY_WINDOW_QUERY_PARAM = "zinutoSecondaryWindow";
export const DESKTOP_SECONDARY_WINDOW_THEME_QUERY_PARAM =
  "zinutoSecondaryTheme";
export const DESKTOP_SECONDARY_WINDOW_LANGUAGE_QUERY_PARAM =
  "zinutoSecondaryLanguage";

export type DesktopSecondaryWindowVisualContext = {
  language: "en" | "zh-CN" | "ja" | "ko" | "es";
  themeMode: "light" | "dark" | "system";
  resolvedThemeMode: "light" | "dark";
  fontSizePreset: "SMALL" | "STANDARD" | "LARGE";
  showGlobalDecimals: boolean;
  priceColorMode: "RED_UP_GREEN_DOWN" | "GREEN_UP_RED_DOWN";
  tradeColorTheme: TradeColorThemeToken;
};

export type DesktopSecondaryWindowStatePayload =
  DesktopSecondaryWindowStateRecord<
    DesktopSecondaryWindowKind,
    DesktopSecondaryWindowVisualContext
  >;

export const isDesktopSecondaryWindowKind = (
  value: string | null | undefined,
): value is DesktopSecondaryWindowKind =>
  Boolean(value) &&
  DESKTOP_SECONDARY_WINDOW_KINDS.has(value as DesktopSecondaryWindowKind);

export const resolveDesktopSecondaryWindowKindFromSearch = (
  search: string,
): DesktopSecondaryWindowKind | null => {
  const params = new URLSearchParams(search);
  const rawKind = params.get(DESKTOP_SECONDARY_WINDOW_QUERY_PARAM);
  return isDesktopSecondaryWindowKind(rawKind) ? rawKind : null;
};

export const resolveDesktopSecondaryWindowKindFromLocation = (
  locationLike: Pick<Location, "search">,
): DesktopSecondaryWindowKind | null =>
  resolveDesktopSecondaryWindowKindFromSearch(locationLike.search);
