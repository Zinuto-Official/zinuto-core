// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";

export const APP_PORTAL_ROOT_ID = "app-portal-root";

export type AppPortalContainer = Element | DocumentFragment;

export const getAppPortalContainer = (): AppPortalContainer | undefined => {
  if (typeof document === "undefined") {
    return undefined;
  }
  return (
    document.getElementById(APP_PORTAL_ROOT_ID) ??
    // Never portal into `.app-root`: React owns that element and renders the
    // app's children there. During a cold render the dedicated portal node can
    // be absent briefly, and using the app root then produces React's
    // createPortal container warning. `body` is a safe temporary host until
    // the layout effect resolves the dedicated portal root.
    document.body ??
    undefined
  );
};

export const useAppPortalContainer = (
  container?: AppPortalContainer | null,
): AppPortalContainer | undefined => {
  const [resolvedContainer, setResolvedContainer] = React.useState<
    AppPortalContainer | undefined
  >(() => container ?? undefined);

  React.useLayoutEffect(() => {
    setResolvedContainer(container ?? getAppPortalContainer());
  }, [container]);

  return resolvedContainer;
};
