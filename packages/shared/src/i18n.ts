// SPDX-License-Identifier: GPL-3.0-only

import { I18N_CATALOGS } from "./i18n.generated.js";
import {
  APP_LOCALES,
  installLocaleCatalog,
  type LocaleCatalog,
  type SupportedLocale,
} from "./i18nRuntime.js";

for (const locale of APP_LOCALES) {
  installLocaleCatalog(locale, I18N_CATALOGS[locale] as LocaleCatalog);
}

export const ensureLocaleCatalog = async (
  _locale: SupportedLocale | string,
): Promise<void> => undefined;

export const preloadLocaleCatalog = ensureLocaleCatalog;

export * from "./i18nRuntime.js";
