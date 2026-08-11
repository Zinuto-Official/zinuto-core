// SPDX-License-Identifier: GPL-3.0-only

import type {
  DesktopHelpArticle,
  DesktopHelpCatalogV1,
  DesktopHelpContextId,
  DesktopHelpSearchResult,
} from "@/domains/desktop-help/desktopHelpTypes";

const SEARCH_RESULT_LIMIT = 8;
const CJK_CHARACTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export const normalizeDesktopHelpSearchText = (
  value: string,
  locale: string,
): string =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase(locale === "en-XA" ? "en" : locale)
    .replace(/[\p{P}\p{S}\s]+/gu, " ")
    .trim();

const segmentSearchText = (value: string, locale: string): string[] => {
  if (!value) {
    return [];
  }
  const terms = new Set<string>();
  const segmenter = new Intl.Segmenter(locale === "en-XA" ? "en" : locale, {
    granularity: "word",
  });
  for (const segment of segmenter.segment(value)) {
    const term = segment.segment.trim();
    if (term && segment.isWordLike !== false) {
      terms.add(term);
    }
  }
  const cjkChars = [...value].filter((character) => CJK_CHARACTER.test(character));
  cjkChars.forEach((character) => terms.add(character));
  for (let index = 0; index < cjkChars.length - 1; index += 1) {
    terms.add(`${cjkChars[index]}${cjkChars[index + 1]}`);
  }
  return [...terms];
};

const normalizeList = (values: readonly string[], locale: string): string[] =>
  values.map((value) => normalizeDesktopHelpSearchText(value, locale));

type SearchableArticle = {
  title: string;
  aliases: string[];
  keywords: string[];
  body: string;
};

const buildSearchableArticle = (
  article: DesktopHelpArticle,
  locale: string,
): SearchableArticle => ({
  title: normalizeDesktopHelpSearchText(article.title, locale),
  aliases: normalizeList(article.aliases, locale),
  keywords: normalizeList(article.keywords, locale),
  body: normalizeDesktopHelpSearchText(
    [article.summary, ...article.steps, ...article.notes].join(" "),
    locale,
  ),
});

const includesAny = (values: readonly string[], query: string): boolean =>
  values.some((value) => value.includes(query));

const countTermMatches = (
  terms: readonly string[],
  values: readonly string[],
): number =>
  terms.reduce(
    (count, term) =>
      count + (values.some((value) => value.includes(term)) ? 1 : 0),
    0,
  );

const scoreArticle = (
  article: DesktopHelpArticle,
  searchable: SearchableArticle,
  query: string,
  terms: readonly string[],
  contextId: DesktopHelpContextId,
): DesktopHelpSearchResult | null => {
  let score = 0;
  let matchedField: DesktopHelpSearchResult["matchedField"] = "body";
  if (searchable.title === query) {
    score += 1_200;
    matchedField = "title";
  } else if (searchable.aliases.includes(query)) {
    score += 1_100;
    matchedField = "alias";
  } else if (searchable.title.includes(query)) {
    score += 760;
    matchedField = "title";
  } else if (includesAny(searchable.aliases, query)) {
    score += 700;
    matchedField = "alias";
  }

  const titleTermMatches = countTermMatches(terms, [searchable.title]);
  const aliasTermMatches = countTermMatches(terms, searchable.aliases);
  const keywordTermMatches = countTermMatches(terms, searchable.keywords);
  const bodyTermMatches = terms.filter((term) => searchable.body.includes(term)).length;
  score += titleTermMatches * 120;
  score += aliasTermMatches * 105;
  score += keywordTermMatches * 60;
  score += bodyTermMatches * 18;
  if (includesAny(searchable.keywords, query)) {
    score += 360;
    if (matchedField === "body") {
      matchedField = "keyword";
    }
  }
  if (searchable.body.includes(query)) {
    score += 130;
  }
  if (article.contextIds.includes(contextId)) {
    score += 35;
  }
  const reliableThreshold = query.length <= 1 ? 180 : 95;
  return score >= reliableThreshold ? { article, score, matchedField } : null;
};

export const searchDesktopHelpCatalog = ({
  catalog,
  contextId,
  query,
}: {
  catalog: DesktopHelpCatalogV1;
  contextId: DesktopHelpContextId;
  query: string;
}): DesktopHelpSearchResult[] => {
  const normalizedQuery = normalizeDesktopHelpSearchText(query, catalog.locale);
  if (!normalizedQuery) {
    return [];
  }
  const terms = segmentSearchText(normalizedQuery, catalog.locale);
  const rankedResults = catalog.articles
    .map((article) =>
      scoreArticle(
        article,
        buildSearchableArticle(article, catalog.locale),
        normalizedQuery,
        terms,
        contextId,
      ),
    )
    .filter((result): result is DesktopHelpSearchResult => result !== null)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.article.recommendationOrder - right.article.recommendationOrder,
    );
  const bestScore = rankedResults[0]?.score ?? 0;
  const relativeThreshold =
    bestScore >= 700 ? Math.max(95, bestScore * 0.28) : 95;
  return rankedResults
    .filter(({ score }) => score >= relativeThreshold)
    .slice(0, SEARCH_RESULT_LIMIT);
};
