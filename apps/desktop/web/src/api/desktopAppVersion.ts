// SPDX-License-Identifier: GPL-3.0-only

import {
  isTauriRuntime,
  loadTauriAppModule,
} from "@/api/desktopNativeBridge";

export const getDesktopAppVersion = async (): Promise<string | null> => {
  if (!isTauriRuntime()) {
    return null;
  }
  try {
    const mod = await loadTauriAppModule();
    return await mod.getVersion();
  } catch {
    return null;
  }
};
