// SPDX-License-Identifier: GPL-3.0-only

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { VendorIcon, type VendorIconName } from "@/assets/graphics";
import { useDesktopHelpContext } from "@/domains/desktop-help/DesktopHelpContext";
import { searchDesktopHelpCatalog } from "@/domains/desktop-help/desktopHelpSearch";
import type {
  DesktopHelpArticle,
  DesktopHelpArticleId,
  DesktopHelpCatalogV1,
  DesktopHelpCategoryId,
  DesktopHelpContextId,
} from "@/domains/desktop-help/desktopHelpTypes";
import { Button } from "@/ui/primitives/button";
import { SearchInput } from "@/ui/primitives/search-input";

const CATEGORY_ORDER: readonly DesktopHelpCategoryId[] = [
  "START",
  "TRAINING",
  "REVIEW",
  "CHALLENGE",
  "ANALYSIS",
  "DATA",
  "SETTINGS",
];

type DesktopHelpReturnView = "HOME" | "SEARCH" | "CATEGORY";

const DesktopHelpArticleButton = ({
  article,
  catalog,
  onOpen,
  result = false,
}: {
  article: DesktopHelpArticle;
  catalog: DesktopHelpCatalogV1;
  onOpen: (articleId: DesktopHelpArticleId) => void;
  result?: boolean;
}) => (
  <Button
    type="button"
    variant="ghost"
    className="desktop-help-article-row"
    data-help-result={result ? "true" : undefined}
    onClick={() => onOpen(article.id)}
  >
    <span className="desktop-help-article-row-copy">
      <span className="desktop-help-article-row-category">
        {catalog.copy.categoryLabels[article.categoryId]}
      </span>
      <strong>{article.title}</strong>
      <span>{article.summary}</span>
    </span>
    <VendorIcon name="chevronRight" aria-hidden="true" />
  </Button>
);

const DesktopHelpSectionHeading = ({
  icon,
  label,
}: {
  icon: VendorIconName;
  label: string;
}) => (
  <h3 className="desktop-help-section-heading">
    <span className="desktop-help-section-heading-icon" aria-hidden="true">
      <VendorIcon name={icon} />
    </span>
    <span>{label}</span>
  </h3>
);

export const DesktopHelpCenter = ({
  catalog,
  contextId,
  mode,
  onClose,
  onNavigate,
  searchInputRef,
  showEmbeddedHeader = true,
}: {
  catalog: DesktopHelpCatalogV1;
  contextId: DesktopHelpContextId;
  mode: "floating" | "embedded";
  onClose?: () => void;
  onNavigate?: () => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  showEmbeddedHeader?: boolean;
}) => {
  const desktopHelpContext = useDesktopHelpContext();
  const [query, setQuery] = useState("");
  const [selectedArticleId, setSelectedArticleId] =
    useState<DesktopHelpArticleId | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] =
    useState<DesktopHelpCategoryId | null>(null);
  const [returnView, setReturnView] = useState<DesktopHelpReturnView>("HOME");
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setQuery("");
    setSelectedArticleId(null);
    setSelectedCategoryId(null);
    setReturnView("HOME");
  }, [contextId]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [contextId, query, selectedArticleId, selectedCategoryId]);

  const searchResults = useMemo(
    () => searchDesktopHelpCatalog({ catalog, contextId, query }),
    [catalog, contextId, query],
  );
  const selectedArticle = selectedArticleId
    ? catalog.articleById.get(selectedArticleId) ?? null
    : null;
  const recommendedArticles = catalog.contextRecommendations[contextId]
    .map((articleId) => catalog.articleById.get(articleId))
    .filter((article): article is DesktopHelpArticle => Boolean(article));
  const categoryArticles = selectedCategoryId
    ? catalog.articles.filter(
        (article) => article.categoryId === selectedCategoryId,
      )
    : [];

  const openArticle = (articleId: DesktopHelpArticleId) => {
    setReturnView(query.trim() ? "SEARCH" : selectedCategoryId ? "CATEGORY" : "HOME");
    setSelectedArticleId(articleId);
  };
  const handleBack = () => {
    setSelectedArticleId(null);
    if (returnView === "HOME") {
      setSelectedCategoryId(null);
      setQuery("");
    }
  };
  const handleQueryChange = (value: string) => {
    setQuery(value);
    setSelectedArticleId(null);
    setSelectedCategoryId(null);
    setReturnView(value.trim() ? "SEARCH" : "HOME");
  };
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "ArrowDown") {
      return;
    }
    const firstResult = event.currentTarget
      .closest(".desktop-help-center")
      ?.querySelector<HTMLElement>("[data-help-result='true']");
    if (firstResult) {
      event.preventDefault();
      firstResult.focus();
    }
  };
  const handleOpenWorkspace = (article: DesktopHelpArticle) => {
    if (!article.targetWorkspace) {
      return;
    }
    desktopHelpContext?.navigateToTarget({
      workspace: article.targetWorkspace,
      settingsTab: article.targetSettingsTab,
    });
    onNavigate?.();
  };
  const showHeader = mode === "floating" || showEmbeddedHeader;

  const renderArticle = (article: DesktopHelpArticle) => {
    const relatedArticles = article.relatedArticleIds
      .map((articleId) => catalog.articleById.get(articleId))
      .filter((related): related is DesktopHelpArticle => Boolean(related))
      .slice(0, 3);
    return (
      <article className="desktop-help-detail">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="desktop-help-back"
          onClick={handleBack}
        >
          <VendorIcon name="chevronLeft" aria-hidden="true" />
          {catalog.copy.back}
        </Button>
        <header className="desktop-help-detail-heading">
          <span className="desktop-help-detail-category">
            {catalog.copy.categoryLabels[article.categoryId]}
          </span>
          <h2>{article.title}</h2>
        </header>
        <section className="desktop-help-summary-block">
          <DesktopHelpSectionHeading
            icon="quote"
            label={catalog.copy.summaryTitle}
          />
          <p className="desktop-help-summary-copy">{article.summary}</p>
        </section>
        <section className="desktop-help-detail-section">
          <DesktopHelpSectionHeading
            icon="listOrdered"
            label={catalog.copy.stepsTitle}
          />
          <ol className="desktop-help-step-list" role="list">
            {article.steps.map((step, index) => (
              <li key={step} role="listitem">
                <span className="desktop-help-step-row">
                  <span
                    className="desktop-help-step-number"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
        <section className="desktop-help-note-block">
          <DesktopHelpSectionHeading
            icon="circleAlert"
            label={catalog.copy.notesTitle}
          />
          <ul className="desktop-help-note-list" role="list">
            {article.notes.map((note) => (
              <li key={note} role="listitem">
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </section>
        {article.targetWorkspace ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleOpenWorkspace(article)}
          >
            {catalog.copy.openWorkspace}
            <VendorIcon name="arrowRight" aria-hidden="true" />
          </Button>
        ) : null}
        {relatedArticles.length ? (
          <section className="desktop-help-related">
            <DesktopHelpSectionHeading
              icon="link2"
              label={catalog.copy.relatedTitle}
            />
            <div className="desktop-help-article-list">
              {relatedArticles.map((relatedArticle) => (
                <DesktopHelpArticleButton
                  key={relatedArticle.id}
                  article={relatedArticle}
                  catalog={catalog}
                  onOpen={openArticle}
                />
              ))}
            </div>
          </section>
        ) : null}
      </article>
    );
  };

  const renderBrowser = () => {
    if (query.trim()) {
      return (
        <section className="desktop-help-browser-section">
          <h2>{catalog.copy.searchResultsTitle}</h2>
          {searchResults.length ? (
            <div className="desktop-help-article-list">
              {searchResults.map(({ article }) => (
                <DesktopHelpArticleButton
                  key={article.id}
                  article={article}
                  catalog={catalog}
                  onOpen={openArticle}
                  result
                />
              ))}
            </div>
          ) : (
            <div className="desktop-help-empty" role="status">
              <VendorIcon name="circleHelp" aria-hidden="true" />
              <h3>{catalog.copy.noResultsTitle}</h3>
              <p>{catalog.copy.noResultsDescription}</p>
            </div>
          )}
        </section>
      );
    }
    if (selectedCategoryId) {
      return (
        <section className="desktop-help-browser-section">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="desktop-help-back"
            onClick={() => setSelectedCategoryId(null)}
          >
            <VendorIcon name="chevronLeft" aria-hidden="true" />
            {catalog.copy.back}
          </Button>
          <h2>{catalog.copy.categoryLabels[selectedCategoryId]}</h2>
          <div className="desktop-help-article-list">
            {categoryArticles.map((article) => (
              <DesktopHelpArticleButton
                key={article.id}
                article={article}
                catalog={catalog}
                onOpen={openArticle}
              />
            ))}
          </div>
        </section>
      );
    }
    return (
      <>
        <section
          className="desktop-help-browser-section"
          data-help-section="recommended"
        >
          <h2>{catalog.copy.recommendedTitle}</h2>
          <div className="desktop-help-article-list">
            {recommendedArticles.map((article) => (
              <DesktopHelpArticleButton
                key={article.id}
                article={article}
                catalog={catalog}
                onOpen={openArticle}
              />
            ))}
          </div>
        </section>
        <section className="desktop-help-browser-section">
          <h2>{catalog.copy.categoriesTitle}</h2>
          <div className="desktop-help-category-grid">
            {CATEGORY_ORDER.map((categoryId) => (
              <Button
                key={categoryId}
                type="button"
                variant="secondary"
                onClick={() => setSelectedCategoryId(categoryId)}
              >
                <span>{catalog.copy.categoryLabels[categoryId]}</span>
                <span>
                  {
                    catalog.articles.filter(
                      (article) => article.categoryId === categoryId,
                    ).length
                  }
                </span>
              </Button>
            ))}
          </div>
        </section>
      </>
    );
  };

  return (
    <div className={`desktop-help-center is-${mode}`}>
      {showHeader ? (
        <header className="desktop-help-header">
          <div>
            <h1>
              {mode === "embedded"
                ? catalog.copy.embeddedTitle
                : catalog.copy.panelTitle}
            </h1>
            {mode === "embedded" ? (
              <p>{catalog.copy.embeddedDescription}</p>
            ) : null}
          </div>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={catalog.copy.close}
              onClick={onClose}
            >
              <VendorIcon name="x" aria-hidden="true" />
            </Button>
          ) : null}
        </header>
      ) : null}
      <div className="desktop-help-search-wrap">
        <label className="sr-only" htmlFor={`desktop-help-search-${mode}`}>
          {catalog.copy.searchLabel}
        </label>
        <SearchInput
          ref={searchInputRef}
          id={`desktop-help-search-${mode}`}
          value={query}
          placeholder={catalog.copy.searchPlaceholder}
          autoComplete="off"
          onChange={(event) => handleQueryChange(event.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        {query ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={catalog.copy.clearSearch}
            onClick={() => handleQueryChange("")}
          >
            <VendorIcon name="x" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <div ref={scrollContainerRef} className="desktop-help-scroll">
        {selectedArticle ? renderArticle(selectedArticle) : renderBrowser()}
      </div>
    </div>
  );
};
