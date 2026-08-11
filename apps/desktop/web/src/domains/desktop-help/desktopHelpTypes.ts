// SPDX-License-Identifier: GPL-3.0-only

import type { WorkspacePage } from "@/frontend-kernel/workspacePageModel";

export type DesktopHelpArticleId =
  | "getting-started"
  | "command-center-overview"
  | "trainer-prepare"
  | "trainer-session"
  | "review-overview"
  | "review-behavior"
  | "review-archive"
  | "challenge-mode-selection"
  | "challenge-fast-decision"
  | "challenge-risk-survival"
  | "challenge-settlement"
  | "challenge-stats"
  | "indicator-create"
  | "indicator-reference"
  | "backtest-configure"
  | "backtest-results"
  | "notes-create"
  | "notes-review-links"
  | "data-acquire"
  | "data-source-by-market"
  | "data-prepare"
  | "data-import"
  | "data-manage"
  | "settings-general"
  | "settings-transfer"
  | "settings-about"
  | "settings-advanced";

export type DesktopHelpCategoryId =
  | "START"
  | "TRAINING"
  | "REVIEW"
  | "CHALLENGE"
  | "ANALYSIS"
  | "DATA"
  | "SETTINGS";

export type DesktopHelpContextId =
  | WorkspacePage
  | "TRAINER_PREP"
  | "TRAINER_SESSION"
  | "HISTORY_OVERVIEW"
  | "HISTORY_BEHAVIOR"
  | "HISTORY_ARCHIVE"
  | "SPECIAL_TRAINING_MODE_SELECTION"
  | "SPECIAL_TRAINING_FAST_DECISION"
  | "SPECIAL_TRAINING_RISK_SURVIVAL"
  | "SPECIAL_TRAINING_SETTLEMENT"
  | "SETTINGS_GENERAL"
  | "SETTINGS_DATA_TRANSFER"
  | "SETTINGS_ABOUT"
  | "SETTINGS_ADVANCED";

export type DesktopHelpSettingsTabId =
  | "GENERAL"
  | "DATA_TRANSFER"
  | "SIMULATION"
  | "ABOUT"
  | "ADVANCED";

export type DesktopHelpNavigationTarget = {
  workspace: WorkspacePage;
  settingsTab?: DesktopHelpSettingsTabId;
};

export type DesktopHelpAnswerBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "steps"; items: readonly string[] }
  | { kind: "list"; items: readonly string[] }
  | { kind: "callout"; text: string };

export type DesktopHelpLocalizedArticle = {
  title: string;
  summary: string;
  steps: readonly string[];
  notes: readonly string[];
  aliases: readonly string[];
  keywords: readonly string[];
};

export type DesktopHelpArticle = DesktopHelpLocalizedArticle & {
  id: DesktopHelpArticleId;
  categoryId: DesktopHelpCategoryId;
  contextIds: readonly DesktopHelpContextId[];
  recommendationOrder: number;
  relatedArticleIds: readonly DesktopHelpArticleId[];
  targetWorkspace: WorkspacePage | null;
  targetSettingsTab?: DesktopHelpSettingsTabId;
  blocks: readonly DesktopHelpAnswerBlock[];
};

export type DesktopHelpSearchResult = {
  article: DesktopHelpArticle;
  score: number;
  matchedField: "title" | "alias" | "keyword" | "body";
};

export type DesktopHelpCatalogCopy = {
  launcherLabel: string;
  hideLauncher: string;
  panelTitle: string;
  embeddedTitle: string;
  embeddedDescription: string;
  searchLabel: string;
  searchPlaceholder: string;
  clearSearch: string;
  close: string;
  back: string;
  recommendedTitle: string;
  categoriesTitle: string;
  searchResultsTitle: string;
  noResultsTitle: string;
  noResultsDescription: string;
  summaryTitle: string;
  stepsTitle: string;
  notesTitle: string;
  relatedTitle: string;
  openWorkspace: string;
  categoryLabels: Record<DesktopHelpCategoryId, string>;
};

export type DesktopHelpCatalogV1 = {
  version: 1;
  locale: string;
  copy: DesktopHelpCatalogCopy;
  articles: readonly DesktopHelpArticle[];
  articleById: ReadonlyMap<DesktopHelpArticleId, DesktopHelpArticle>;
  contextRecommendations: Readonly<
    Record<DesktopHelpContextId, readonly DesktopHelpArticleId[]>
  >;
};
