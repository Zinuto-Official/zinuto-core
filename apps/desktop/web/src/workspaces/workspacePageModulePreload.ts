// SPDX-License-Identifier: GPL-3.0-only

import {
  WORKSPACE_IDLE_PRELOAD_ORDER,
  type WorkspacePage,
} from "@/frontend-kernel/workspacePageModel";

export type CachedWorkspacePage = WorkspacePage;

export type WorkspacePageWarmPolicy = "initial" | "idle" | "intent";

export type WorkspacePageAssetStatus = "idle" | "loading" | "ready" | "error";

export type WorkspacePageAssetBudget = {
  maxCssBytes: number;
  maxJsBytes: number;
};

export type WorkspacePageAssetDefinition = {
  page: CachedWorkspacePage;
  cssLoader: () => Promise<unknown>;
  jsLoader: () => Promise<unknown>;
  warmPolicy: WorkspacePageWarmPolicy;
  budget: WorkspacePageAssetBudget;
};

export const WORKSPACE_PAGE_ASSET_LOAD_DEADLINE_MS = 4_000;

const settleWorkspaceAssetWithinDeadline = <T>(
  page: CachedWorkspacePage,
  assetKind: "css" | "js",
  task: Promise<T>,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`WORKSPACE_${page}_${assetKind.toUpperCase()}_TIMEOUT`));
    }, WORKSPACE_PAGE_ASSET_LOAD_DEADLINE_MS);
    if (typeof timer === "object") {
      timer.unref?.();
    }
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

export const WORKSPACE_PAGE_IDLE_PRELOAD_ORDER: CachedWorkspacePage[] = [
  ...WORKSPACE_IDLE_PRELOAD_ORDER,
];

export const normalizeWorkspacePageForCache = (
  page: WorkspacePage,
): CachedWorkspacePage => page;

const workspacePageModulePromiseCache = new Map<
  CachedWorkspacePage,
  Promise<unknown>
>();
const workspacePageCssPromiseCache = new Map<
  CachedWorkspacePage,
  Promise<unknown>
>();
const workspacePageAssetPromiseCache = new Map<
  CachedWorkspacePage,
  Promise<unknown>
>();
const workspacePageAssetStatusCache = new Map<
  CachedWorkspacePage,
  WorkspacePageAssetStatus
>();

const loadWorkspacePageModule = <T>(
  page: CachedWorkspacePage,
  loader: () => Promise<T>,
): Promise<T> => {
  const cached = workspacePageModulePromiseCache.get(page);
  if (cached) {
    return cached as Promise<T>;
  }
  const nextPromise = settleWorkspaceAssetWithinDeadline(
    page,
    "js",
    loader(),
  ).catch((error) => {
    workspacePageModulePromiseCache.delete(page);
    throw error;
  });
  workspacePageModulePromiseCache.set(page, nextPromise as Promise<unknown>);
  return nextPromise;
};

const loadWorkspacePageCss = (
  page: CachedWorkspacePage,
  loader: () => Promise<unknown>,
): Promise<unknown> => {
  const cached = workspacePageCssPromiseCache.get(page);
  if (cached) {
    return cached;
  }
  const nextPromise = settleWorkspaceAssetWithinDeadline(
    page,
    "css",
    loader(),
  ).catch((error) => {
    workspacePageCssPromiseCache.delete(page);
    throw error;
  });
  workspacePageCssPromiseCache.set(page, nextPromise);
  return nextPromise;
};

const loadTrainerCss = () =>
  loadWorkspacePageCss("TRAINER", () =>
    import("@/styles/workspaces/trainer.css"),
  );
const loadHistoryCss = () =>
  loadWorkspacePageCss("HISTORY", () =>
    import("@/styles/workspaces/history.css"),
  );
const loadSpecialTrainingCss = () =>
  loadWorkspacePageCss("SPECIAL_TRAINING", () =>
    import("@/styles/workspaces/special-training.css"),
  );
const loadChallengeStatsCss = () =>
  loadWorkspacePageCss("CHALLENGE_STATS", () =>
    import("@/styles/workspaces/challenge-stats.css"),
  );
const loadStrategyBacktestCss = () =>
  loadWorkspacePageCss("STRATEGY_BACKTEST", () =>
    import("@/styles/workspaces/strategy-backtest.css"),
  );
const loadNotesCss = () =>
  loadWorkspacePageCss("NOTES", () =>
    import("@/styles/workspaces/notes.css"),
  );
const loadCustomIndicatorCss = () =>
  loadWorkspacePageCss("CUSTOM_INDICATOR", () =>
    import("@/styles/workspaces/custom-indicator.css"),
  );
const loadDataCss = () =>
  loadWorkspacePageCss("DATA", () =>
    import("@/styles/workspaces/data.css"),
  );
const loadSettingsCss = () =>
  loadWorkspacePageCss("SETTINGS", () =>
    import("@/styles/workspaces/settings.css"),
  );

export const loadHistoryPage = () =>
  loadWorkspacePageModule("HISTORY", () =>
    import("@/workspaces/history/DiagnosticCenterWorkspacePage").then((module) => ({
      default: module.DiagnosticCenterWorkspacePage,
    })),
  );

export const loadTrainerPage = () =>
  loadWorkspacePageModule("TRAINER", () =>
    import("@/workspaces/trainer/TrainerWorkspacePage").then((module) => ({
      default: module.TrainerWorkspacePage,
    })),
  );

export const loadNotesPage = () =>
  loadWorkspacePageModule("NOTES", () => import("@/workspaces/notes/NotesPage"));

export const loadChallengeStatsPage = () =>
  loadWorkspacePageModule("CHALLENGE_STATS", () =>
    import("@/workspaces/challenge-stats/ChallengeStatsPage"),
  );

export const loadStrategyBacktestPage = () =>
  loadWorkspacePageModule("STRATEGY_BACKTEST", () =>
    import("@/workspaces/strategy-backtest/StrategyBacktestPage").then((module) => ({
      default: module.StrategyBacktestPage,
    })),
  );

export const loadSpecialTrainingPage = () =>
  loadWorkspacePageModule("SPECIAL_TRAINING", () =>
    import("@/workspaces/special-training/SpecialTrainingPage").then((module) => ({
      default: module.SpecialTrainingPage,
    })),
  );

export const loadCustomIndicatorSystemPage = () =>
  loadWorkspacePageModule("CUSTOM_INDICATOR", () =>
    import("@/workspaces/custom-indicator/CustomIndicatorSystemPage").then(
      (module) => ({
        default: module.CustomIndicatorSystemPage,
      }),
    ),
  );

export const loadDataConfigPage = () =>
  loadWorkspacePageModule("DATA", () =>
    import("@/workspaces/data/DataConfigWorkspacePage").then((module) => ({
      default: module.DataConfigWorkspacePage,
    })),
  );

export const loadSystemSettingsPage = () =>
  loadWorkspacePageModule("SETTINGS", () =>
    import("@/workspaces/settings/SystemSettingsWorkspacePage").then((module) => ({
      default: module.SystemSettingsWorkspacePage,
    })),
  );

export const WORKSPACE_PAGE_ASSET_DEFINITIONS = {
  COMMAND_CENTER: {
    page: "COMMAND_CENTER",
    cssLoader: () => Promise.resolve(undefined),
    jsLoader: () => Promise.resolve(undefined),
    warmPolicy: "initial",
    budget: { maxCssBytes: 120_000, maxJsBytes: 120_000 },
  },
  TRAINER: {
    page: "TRAINER",
    cssLoader: loadTrainerCss,
    jsLoader: loadTrainerPage,
    warmPolicy: "intent",
    budget: { maxCssBytes: 360_000, maxJsBytes: 260_000 },
  },
  HISTORY: {
    page: "HISTORY",
    cssLoader: loadHistoryCss,
    jsLoader: loadHistoryPage,
    warmPolicy: "idle",
    budget: { maxCssBytes: 180_000, maxJsBytes: 160_000 },
  },
  SPECIAL_TRAINING: {
    page: "SPECIAL_TRAINING",
    cssLoader: loadSpecialTrainingCss,
    jsLoader: loadSpecialTrainingPage,
    warmPolicy: "intent",
    budget: { maxCssBytes: 560_000, maxJsBytes: 360_000 },
  },
  CHALLENGE_STATS: {
    page: "CHALLENGE_STATS",
    cssLoader: loadChallengeStatsCss,
    jsLoader: loadChallengeStatsPage,
    warmPolicy: "intent",
    budget: { maxCssBytes: 80_000, maxJsBytes: 120_000 },
  },
  STRATEGY_BACKTEST: {
    page: "STRATEGY_BACKTEST",
    cssLoader: loadStrategyBacktestCss,
    jsLoader: loadStrategyBacktestPage,
    warmPolicy: "intent",
    budget: { maxCssBytes: 80_000, maxJsBytes: 120_000 },
  },
  NOTES: {
    page: "NOTES",
    cssLoader: loadNotesCss,
    jsLoader: loadNotesPage,
    warmPolicy: "intent",
    budget: { maxCssBytes: 120_000, maxJsBytes: 120_000 },
  },
  CUSTOM_INDICATOR: {
    page: "CUSTOM_INDICATOR",
    cssLoader: loadCustomIndicatorCss,
    jsLoader: loadCustomIndicatorSystemPage,
    warmPolicy: "intent",
    budget: { maxCssBytes: 140_000, maxJsBytes: 180_000 },
  },
  DATA: {
    page: "DATA",
    cssLoader: loadDataCss,
    jsLoader: loadDataConfigPage,
    warmPolicy: "idle",
    budget: { maxCssBytes: 240_000, maxJsBytes: 220_000 },
  },
  SETTINGS: {
    page: "SETTINGS",
    cssLoader: loadSettingsCss,
    jsLoader: loadSystemSettingsPage,
    warmPolicy: "idle",
    budget: { maxCssBytes: 80_000, maxJsBytes: 120_000 },
  },
} as const satisfies Record<CachedWorkspacePage, WorkspacePageAssetDefinition>;

export const getWorkspacePageAssetStatus = (
  page: CachedWorkspacePage,
): WorkspacePageAssetStatus =>
  workspacePageAssetStatusCache.get(page) ??
  (page === "COMMAND_CENTER" ? "ready" : "idle");

export const preloadWorkspacePageAssets = (
  page: CachedWorkspacePage,
): Promise<unknown> => {
  if (page === "COMMAND_CENTER") {
    workspacePageAssetStatusCache.set(page, "ready");
    return Promise.resolve(undefined);
  }

  const cached = workspacePageAssetPromiseCache.get(page);
  if (cached) {
    return cached;
  }

  const definition = WORKSPACE_PAGE_ASSET_DEFINITIONS[page];
  workspacePageAssetStatusCache.set(page, "loading");
  const nextPromise = Promise.all([
    definition.cssLoader(),
    definition.jsLoader(),
  ])
    .then(() => {
      workspacePageAssetStatusCache.set(page, "ready");
    })
    .catch((error) => {
      workspacePageAssetStatusCache.set(page, "error");
      workspacePageAssetPromiseCache.delete(page);
      throw error;
    });
  workspacePageAssetPromiseCache.set(page, nextPromise);
  return nextPromise;
};

export const preloadWorkspacePageModule = preloadWorkspacePageAssets;
