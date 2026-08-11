// SPDX-License-Identifier: GPL-3.0-only

import type { ComponentType } from "react";
import { AppRootBootShell } from "@/app-shell/AppRootBootShell";
import { RetryableLazyModuleSurface } from "@/frontend-kernel/RetryableLazyModuleSurface";
import { tt } from "@/frontend-kernel/i18n/messageRuntime";

type MainAppRuntimeProps = Record<string, never>;

const loadMainAppRuntime = async (): Promise<{
  default: ComponentType<MainAppRuntimeProps>;
}> => {
  const module = await import("@/app-shell/MainAppRuntime");
  return { default: module.MainAppRuntime };
};

export const MainAppBoot = () => (
  <RetryableLazyModuleSurface
    componentProps={{}}
    fallback={<AppRootBootShell />}
    loader={loadMainAppRuntime}
    moduleName="MAIN_APP_RUNTIME"
    renderError={({ retry }) => (
      <AppRootBootShell
        failure={{
          actionLabel: tt("appText.retry"),
          body: tt("appText.desktopStartupFailedBody"),
          onAction: retry,
          title: tt("common.status.loadFailed"),
        }}
      />
    )}
  />
);
