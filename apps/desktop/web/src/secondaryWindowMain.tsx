// SPDX-License-Identifier: GPL-3.0-only

import { ensureLocaleCatalog, resolveLocale } from "@zinuto/shared/i18n";
import { DESKTOP_SECONDARY_WINDOW_LANGUAGE_QUERY_PARAM } from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowContracts";
import { runPreReactBootstrap } from "@/frontend-kernel/preReactBootstrap";

const initialLanguage = resolveLocale(
  new URLSearchParams(window.location.search).get(
    DESKTOP_SECONDARY_WINDOW_LANGUAGE_QUERY_PARAM,
  ),
);

void runPreReactBootstrap({
  loadPrimaryLocale: () => ensureLocaleCatalog(initialLanguage),
  loadFallbackLocale:
    initialLanguage === "en" ? undefined : () => ensureLocaleCatalog("en"),
  loadApplication: () =>
    import("@/app-shell/secondaryWindows/secondaryWindowApp"),
});
