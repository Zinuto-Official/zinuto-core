// SPDX-License-Identifier: GPL-3.0-only

import {
  DESKTOP_SECONDARY_WINDOW_LANGUAGE_QUERY_PARAM,
  DESKTOP_SECONDARY_WINDOW_QUERY_PARAM,
  DESKTOP_SECONDARY_WINDOW_THEME_QUERY_PARAM,
  type DesktopSecondaryWindowVisualContext,
} from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowContracts";
import type { DesktopSecondaryWindowKind } from "@/frontend-kernel/secondary-windows/desktopWindowViewportConfig";

export const buildDesktopSecondaryWindowUrl = (
  kind: DesktopSecondaryWindowKind,
  visualContext: DesktopSecondaryWindowVisualContext | null | undefined,
): string => {
  const initialTheme =
    visualContext?.resolvedThemeMode === "dark" ? "dark" : "light";
  if (typeof window === "undefined") {
    const params = new URLSearchParams();
    params.set(DESKTOP_SECONDARY_WINDOW_QUERY_PARAM, kind);
    params.set(DESKTOP_SECONDARY_WINDOW_THEME_QUERY_PARAM, initialTheme);
    params.set(
      DESKTOP_SECONDARY_WINDOW_LANGUAGE_QUERY_PARAM,
      visualContext?.language ?? "en",
    );
    return `/secondary-window.html?${params.toString()}`;
  }
  const url = new URL("secondary-window.html", window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set(DESKTOP_SECONDARY_WINDOW_QUERY_PARAM, kind);
  url.searchParams.set(
    DESKTOP_SECONDARY_WINDOW_THEME_QUERY_PARAM,
    initialTheme,
  );
  url.searchParams.set(
    DESKTOP_SECONDARY_WINDOW_LANGUAGE_QUERY_PARAM,
    visualContext?.language ?? "en",
  );
  return url.href;
};
