// SPDX-License-Identifier: GPL-3.0-only

import {
  isTauriRuntime,
  loadTauriWindowModule,
} from "@/api/desktopNativeBridge";
import { createTauriUnlistenCleanup } from "@/frontend-kernel/tauriEventCleanup";

export type DesktopWindowChromePlatform =
  | "macos"
  | "windows"
  | "unknown";

export type DesktopWindowTheme = "dark" | "light";

export type DesktopWindowPlatformSnapshot = {
  platform?: string | null;
  userAgent?: string | null;
  userAgentDataPlatform?: string | null;
};

type DesktopWindowChromeNativeWindow = {
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  minimize: () => Promise<void>;
  onResized: (listener: () => void) => Promise<() => void>;
  setTheme: (theme: DesktopWindowTheme) => Promise<void>;
  toggleMaximize: () => Promise<void>;
};

export type DesktopWindowChromeAdapter = {
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  minimize: () => Promise<void>;
  setTheme: (theme: DesktopWindowTheme) => Promise<void>;
  subscribeMaximized: (
    listener: (maximized: boolean) => void,
  ) => Promise<() => void>;
  toggleMaximize: () => Promise<void>;
};

export const createDesktopWindowChromeAdapter = (
  loadWindow: () => Promise<DesktopWindowChromeNativeWindow>,
): DesktopWindowChromeAdapter => ({
  close: async () => (await loadWindow()).close(),
  isMaximized: async () => (await loadWindow()).isMaximized(),
  minimize: async () => (await loadWindow()).minimize(),
  setTheme: async (theme) => (await loadWindow()).setTheme(theme),
  subscribeMaximized: async (listener) => {
    const currentWindow = await loadWindow();
    let disposed = false;
    let latestValue: boolean | null = null;
    const publish = async () => {
      const maximized = await currentWindow.isMaximized().catch(() => false);
      if (!disposed && maximized !== latestValue) {
        latestValue = maximized;
        listener(maximized);
      }
    };
    await publish();
    const unlisten = await currentWindow.onResized(() => {
      void publish();
    });
    return createTauriUnlistenCleanup(() => {
      disposed = true;
      unlisten();
    });
  },
  toggleMaximize: async () => (await loadWindow()).toggleMaximize(),
});

const desktopWindowChromeAdapter = createDesktopWindowChromeAdapter(
  async () => {
    const windowModule = await loadTauriWindowModule();
    return windowModule.getCurrentWindow();
  },
);

export const resolveDesktopWindowChromePlatform = ({
  platform,
  userAgent,
  userAgentDataPlatform,
}: DesktopWindowPlatformSnapshot): DesktopWindowChromePlatform => {
  const snapshot = [platform, userAgent, userAgentDataPlatform]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  if (/mac|darwin/u.test(snapshot)) {
    return "macos";
  }
  if (/win/u.test(snapshot)) {
    return "windows";
  }
  return "unknown";
};

export const readDesktopWindowChromePlatform = (): DesktopWindowChromePlatform => {
  if (typeof navigator === "undefined") {
    return "unknown";
  }
  const navigatorWithUserAgentData = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  return resolveDesktopWindowChromePlatform({
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    userAgentDataPlatform: navigatorWithUserAgentData.userAgentData?.platform,
  });
};

export const shouldUseCustomDesktopWindowChrome = (): boolean =>
  isTauriRuntime() && readDesktopWindowChromePlatform() === "windows";

export const minimizeCurrentDesktopWindow = async (): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  await desktopWindowChromeAdapter.minimize();
};

export const toggleCurrentDesktopWindowMaximized = async (): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  await desktopWindowChromeAdapter.toggleMaximize();
};

export const closeCurrentDesktopWindow = async (): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  await desktopWindowChromeAdapter.close();
};

export const readCurrentDesktopWindowMaximized = async (): Promise<boolean> => {
  if (!isTauriRuntime()) {
    return false;
  }
  return desktopWindowChromeAdapter.isMaximized();
};

export const subscribeCurrentDesktopWindowMaximized = async (
  listener: (maximized: boolean) => void,
): Promise<() => void> => {
  if (!isTauriRuntime()) {
    return () => undefined;
  }
  return desktopWindowChromeAdapter.subscribeMaximized(listener);
};

export const syncCurrentDesktopWindowTheme = async (
  theme: DesktopWindowTheme,
): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  await desktopWindowChromeAdapter.setTheme(theme);
};
