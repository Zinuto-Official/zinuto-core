// SPDX-License-Identifier: GPL-3.0-only

import {
  ensureLocaleCatalog,
  resolveSupportedLocale,
} from "@zinuto/shared/i18n";

const locale = resolveSupportedLocale(
  new URLSearchParams(window.location.search).get("locale"),
);

await ensureLocaleCatalog(locale);
await import("./i18nWorkspacePages");
