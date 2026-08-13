// SPDX-License-Identifier: GPL-3.0-only

import type { DesktopSecondaryWindowVisualContext } from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowContracts";
import { GLOBAL_COLOR_ARCHITECTURE } from "@/ui/theme/visualColors";

const DESKTOP_SECONDARY_WINDOW_BACKGROUND_COLOR = {
  light: GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s1,
  dark: GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s1,
} as const;

export const DESKTOP_SECONDARY_WINDOW_NATIVE_TITLE = "";

type DesktopSecondaryWindowNativeChromeTarget = {
  setTitle: (title: string) => Promise<void>;
};

const resolveDesktopSecondaryWindowInitialTheme = (
  visualContext: DesktopSecondaryWindowVisualContext | null | undefined,
): DesktopSecondaryWindowVisualContext["resolvedThemeMode"] =>
  visualContext?.resolvedThemeMode === "dark" ? "dark" : "light";

export const resolveDesktopSecondaryWindowBackgroundColor = (
  visualContext: DesktopSecondaryWindowVisualContext | null | undefined,
): string =>
  DESKTOP_SECONDARY_WINDOW_BACKGROUND_COLOR[
    resolveDesktopSecondaryWindowInitialTheme(visualContext)
  ];

export const clearDesktopSecondaryWindowNativeChrome = async (
  windowRef: DesktopSecondaryWindowNativeChromeTarget,
): Promise<void> => {
  await windowRef
    .setTitle(DESKTOP_SECONDARY_WINDOW_NATIVE_TITLE)
    .catch(() => undefined);
};
