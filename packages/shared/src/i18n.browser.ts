// SPDX-License-Identifier: GPL-3.0-only

import { I18N_CATALOG_LOADERS } from "./i18n.loaders.generated.js";
import {
  APP_LOCALE_BASE,
  PSEUDO_LOCALE,
  installLocaleCatalog,
  isLocaleCatalogLoaded,
  resolveLocale,
  type AppLocale,
  type LocaleCatalog,
  type SupportedLocale,
} from "./i18nRuntime.js";

const localeCatalogLoads = new Map<AppLocale, Promise<void>>();

export const ensureLocaleCatalog = async (
  locale: SupportedLocale | string,
): Promise<void> => {
  const resolvedLocale =
    locale === PSEUDO_LOCALE ? APP_LOCALE_BASE : resolveLocale(locale);
  if (isLocaleCatalogLoaded(resolvedLocale)) {
    return;
  }
  const existingLoad = localeCatalogLoads.get(resolvedLocale);
  if (existingLoad) {
    return existingLoad;
  }
  const load = I18N_CATALOG_LOADERS[resolvedLocale]()
    .then((catalog) => {
      installLocaleCatalog(resolvedLocale, catalog as LocaleCatalog);
    })
    .finally(() => {
      localeCatalogLoads.delete(resolvedLocale);
    });
  localeCatalogLoads.set(resolvedLocale, load);
  return load;
};

export const preloadLocaleCatalog = ensureLocaleCatalog;

export * from "./i18nRuntime.js";
