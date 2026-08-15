// SPDX-License-Identifier: GPL-3.0-only

import {
  isTauriRuntime,
  loadTauriWindowModule,
} from "@/api/desktopNativeBridge";
import { GLOBAL_COLOR_ARCHITECTURE } from "@/ui/theme/visual/colorArchitecture";

export const syncDesktopWindowBackgroundColor = (
  themeMode: "light" | "dark",
): void => {
  if (!isTauriRuntime()) {
    return;
  }
  const color = GLOBAL_COLOR_ARCHITECTURE[themeMode].surfaces.s1;
  void loadTauriWindowModule()
    .then((windowModule) => windowModule.getCurrentWindow())
    .then((windowHandle) => windowHandle.setBackgroundColor(color))
    .catch(() => undefined);
};
