// SPDX-License-Identifier: GPL-3.0-only

import { ensureLocaleCatalog } from "@zinuto/shared/i18n";
import { resolveInitialUiLanguage } from "@/frontend-kernel/i18n/localeState";
import { runPreReactBootstrap } from "@/frontend-kernel/preReactBootstrap";
import {
  bootstrapInitialMainDesktopViewport,
  syncNativeDesktopUiLanguage,
} from "@/api";

const initialLanguage = resolveInitialUiLanguage();

void syncNativeDesktopUiLanguage(initialLanguage).catch(() => undefined);

// The native shell already exposes the static preboot surface on page load.
// Start the single shared viewport bootstrap now, in parallel with locale and
// application chunks, so its authoritative density is settled before React
// replaces that surface without moving zoom work back onto the pre-show path.
void bootstrapInitialMainDesktopViewport().catch(() => undefined);

void runPreReactBootstrap({
  loadPrimaryLocale: () => ensureLocaleCatalog(initialLanguage),
  loadFallbackLocale:
    initialLanguage === "en" ? undefined : () => ensureLocaleCatalog("en"),
  loadApplication: () => import("@/app-shell/mainApp"),
});
