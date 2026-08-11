// SPDX-License-Identifier: GPL-3.0-only

import { loadLocaleCatalog, type SupportedLocale } from "@zinuto/shared/i18n";
import {
  DESKTOP_HELP_ARTICLE_METADATA,
  DESKTOP_HELP_CONTEXT_RECOMMENDATIONS,
} from "@/domains/desktop-help/desktopHelpMetadata";
import type {
  DesktopHelpArticle,
  DesktopHelpArticleId,
  DesktopHelpCatalogCopy,
  DesktopHelpCatalogV1,
  DesktopHelpLocalizedArticle,
} from "@/domains/desktop-help/desktopHelpTypes";

type DesktopHelpLocalizedBundle = {
  copy: DesktopHelpCatalogCopy;
  articles: Record<DesktopHelpArticleId, DesktopHelpLocalizedArticle>;
};

const BUNDLE_KEY = "desktopHelp.bundle";
const catalogCache = new Map<string, DesktopHelpCatalogV1>();

const parseDesktopHelpBundle = (
  locale: SupportedLocale | string,
): DesktopHelpLocalizedBundle => {
  const bundleLocale = locale === "en-XA" ? "en" : locale;
  const catalog = loadLocaleCatalog(bundleLocale, "uiConfig") as Readonly<
    Record<string, string>
  >;
  const raw = catalog[BUNDLE_KEY];
  if (!raw) {
    throw new Error(`Missing desktop help bundle for ${bundleLocale}`);
  }
  return JSON.parse(raw) as DesktopHelpLocalizedBundle;
};

const assertDesktopHelpBundle = (bundle: DesktopHelpLocalizedBundle): void => {
  const localizedIds = Object.keys(bundle.articles).sort();
  const metadataIds = DESKTOP_HELP_ARTICLE_METADATA.map(({ id }) => id).sort();
  if (localizedIds.join("|") !== metadataIds.join("|")) {
    throw new Error("Desktop help article ids do not match metadata");
  }
  const articleIdSet = new Set<DesktopHelpArticleId>(metadataIds);
  for (const metadata of DESKTOP_HELP_ARTICLE_METADATA) {
    const localized = bundle.articles[metadata.id];
    if (
      !localized?.title ||
      !localized.summary ||
      localized.steps.length === 0 ||
      localized.notes.length === 0
    ) {
      throw new Error(`Desktop help article ${metadata.id} is incomplete`);
    }
    for (const relatedId of metadata.relatedArticleIds) {
      if (!articleIdSet.has(relatedId)) {
        throw new Error(
          `Desktop help article ${metadata.id} has invalid relation ${relatedId}`,
        );
      }
    }
  }
  for (const [contextId, articleIds] of Object.entries(
    DESKTOP_HELP_CONTEXT_RECOMMENDATIONS,
  )) {
    if (articleIds.length !== 4 || articleIds.some((id) => !articleIdSet.has(id))) {
      throw new Error(`Desktop help context ${contextId} must contain 4 articles`);
    }
  }
};

export const getDesktopHelpCatalog = (
  locale: SupportedLocale | string,
): DesktopHelpCatalogV1 => {
  const bundleLocale = locale === "en-XA" ? "en" : locale;
  const cached = catalogCache.get(bundleLocale);
  if (cached) {
    return cached;
  }
  const bundle = parseDesktopHelpBundle(bundleLocale);
  assertDesktopHelpBundle(bundle);
  const articles: DesktopHelpArticle[] = DESKTOP_HELP_ARTICLE_METADATA.map(
    (metadata) => {
      const localized = bundle.articles[metadata.id];
      return {
        ...metadata,
        ...localized,
        blocks: [
          { kind: "paragraph", text: localized.summary },
          { kind: "steps", items: localized.steps },
          { kind: "list", items: localized.notes },
        ],
      };
    },
  );
  const built: DesktopHelpCatalogV1 = {
    version: 1,
    locale: bundleLocale,
    copy: bundle.copy,
    articles,
    articleById: new Map(
      articles.map((article) => [article.id, article] as const),
    ),
    contextRecommendations: DESKTOP_HELP_CONTEXT_RECOMMENDATIONS,
  };
  catalogCache.set(bundleLocale, built);
  return built;
};
