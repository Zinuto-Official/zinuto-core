// SPDX-License-Identifier: GPL-3.0-only

import type { DesktopSecondaryWindowKind } from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowContracts";
import type { SecondaryWindowRouteModule } from "@/app-shell/secondaryWindows/routes/secondaryWindowRouteTypes";

export type PopupSurface =
  | "desktop-secondary-window"
  | "app-dialog"
  | "app-drawer"
  | "app-popover"
  | "app-menu";

export type PopupWarmPolicy =
  | "none"
  | "idle-shell"
  | "idle-route"
  | "intent-route"
  | "keep-alive";

export type PopupDependencyBudget = {
  maxShellJsBytes: number;
  maxRouteJsBytes: number;
  maxCssBytes: number;
  deniedInitialDependencyTokens: string[];
};

export type PopupDefinition<TId extends string = string, TModule = unknown> = {
  id: TId;
  surface: PopupSurface;
  loader: () => Promise<TModule>;
  cssLoader: () => Promise<unknown>;
  i18nNamespaces: string[];
  budget: PopupDependencyBudget;
  warmPolicy: PopupWarmPolicy;
};

export type DesktopSecondaryPopupDefinition = PopupDefinition<
  DesktopSecondaryWindowKind,
  SecondaryWindowRouteModule
>;

const HEAVY_EDITOR_AND_CHART_TOKENS = [
  "codemirror",
  "milkdown",
  "markdown",
  "klinecharts",
  "echarts",
  "qrcode",
  "vendor-shared",
];

const LIGHT_POPUP_BUDGET: PopupDependencyBudget = {
  maxShellJsBytes: 500_000,
  maxRouteJsBytes: 500_000,
  maxCssBytes: 80_000,
  deniedInitialDependencyTokens: HEAVY_EDITOR_AND_CHART_TOKENS,
};

const HEAVY_POPUP_SHELL_BUDGET: PopupDependencyBudget = {
  maxShellJsBytes: 1_000_000,
  maxRouteJsBytes: 1_500_000,
  maxCssBytes: 240_000,
  deniedInitialDependencyTokens: HEAVY_EDITOR_AND_CHART_TOKENS,
};

const REPLAY_ROUTE_BUDGET: PopupDependencyBudget = {
  ...HEAVY_POPUP_SHELL_BUDGET,
  maxRouteJsBytes: 1_800_000,
  maxCssBytes: 160_000,
};

const DATA_ROUTE_BUDGET: PopupDependencyBudget = {
  ...HEAVY_POPUP_SHELL_BUDGET,
  maxRouteJsBytes: 1_800_000,
  maxCssBytes: 260_000,
};

const loadOnboardingRoute = () =>
  import("@/app-shell/secondaryWindows/routes/secondaryOnboardingRoute");
const loadTrainingRoute = () =>
  import("@/app-shell/secondaryWindows/routes/secondaryTrainingRoute");
const loadSystemRoute = () =>
  import("@/app-shell/secondaryWindows/routes/secondarySystemRoute");
const loadReplayRoute = () =>
  import("@/app-shell/secondaryWindows/routes/secondaryReplayRoute");
const loadStrategyBacktestDetailRoute = () =>
  import("@/app-shell/secondaryWindows/routes/secondaryStrategyBacktestDetailRoute");
const loadNoteEditorRoute = () =>
  import("@/app-shell/secondaryWindows/routes/secondaryNoteEditorRoute");
const loadDataRoute = () =>
  import("@/app-shell/secondaryWindows/routes/secondaryDataRoute");
const loadIndicatorReferenceRoute = () =>
  import("@/app-shell/secondaryWindows/routes/secondaryIndicatorReferenceRoute");

const loadOnboardingCss = async () => {
  await Promise.all([
    import("@/styles/components/ui-system-business.css"),
    import("@/styles/components/onboarding-tour.css"),
  ]);
};
const loadTrainingCss = () => import("@/styles/popup-training.css");
const loadSpecialTrainingBankEditorCss = async () => {
  await Promise.all([
    loadTrainingCss(),
    import("@/styles/components/special-training-bank-editor.css"),
  ]);
};
const loadSystemCss = () => import("@/styles/popup-system.css");
const loadReplayCss = () => import("@/styles/popup-replay.css");
const loadStrategyBacktestDetailCss = async () => {
  await Promise.all([
    loadReplayCss(),
    import("@/styles/workspaces/strategy-backtest.css"),
  ]);
};
const loadChallengeCss = () => import("@/styles/popup-challenge.css");
const loadNoteEditorCss = () => import("@/styles/popup-note-editor.css");
const loadDataCss = () => import("@/styles/popup-data.css");

const defineSecondaryPopup = (
  id: DesktopSecondaryWindowKind,
  loader: DesktopSecondaryPopupDefinition["loader"],
  cssLoader: DesktopSecondaryPopupDefinition["cssLoader"],
  i18nNamespaces: string[],
  budget: PopupDependencyBudget,
  warmPolicy: PopupWarmPolicy,
): DesktopSecondaryPopupDefinition => ({
  id,
  surface: "desktop-secondary-window",
  loader,
  cssLoader,
  i18nNamespaces,
  budget,
  warmPolicy,
});

export const DESKTOP_SECONDARY_POPUP_DEFINITIONS = {
  ONBOARDING_TOUR: defineSecondaryPopup(
    "ONBOARDING_TOUR",
    loadOnboardingRoute,
    loadOnboardingCss,
    ["platform-core"],
    LIGHT_POPUP_BUDGET,
    "intent-route",
  ),
  TRAINER_TRADING_ENVIRONMENT: defineSecondaryPopup(
    "TRAINER_TRADING_ENVIRONMENT",
    loadTrainingRoute,
    loadTrainingCss,
    ["training-replay", "platform-core"],
    HEAVY_POPUP_SHELL_BUDGET,
    "intent-route",
  ),
  STRATEGY_BACKTEST_RESULT_DETAIL: defineSecondaryPopup(
    "STRATEGY_BACKTEST_RESULT_DETAIL",
    loadStrategyBacktestDetailRoute,
    loadStrategyBacktestDetailCss,
    ["training-replay", "custom-indicator", "platform-core"],
    REPLAY_ROUTE_BUDGET,
    "intent-route",
  ),
  TRAINER_TRADING_DEFAULTS: defineSecondaryPopup(
    "TRAINER_TRADING_DEFAULTS",
    loadTrainingRoute,
    loadTrainingCss,
    ["training-replay", "platform-core"],
    HEAVY_POPUP_SHELL_BUDGET,
    "intent-route",
  ),
  TRAINER_START_POINT: defineSecondaryPopup(
    "TRAINER_START_POINT",
    loadTrainingRoute,
    loadTrainingCss,
    ["training-replay", "platform-core"],
    HEAVY_POPUP_SHELL_BUDGET,
    "intent-route",
  ),
  TRAINER_INDICATOR_SETTINGS: defineSecondaryPopup(
    "TRAINER_INDICATOR_SETTINGS",
    loadTrainingRoute,
    loadTrainingCss,
    ["training-replay", "platform-core"],
    HEAVY_POPUP_SHELL_BUDGET,
    "intent-route",
  ),
  SYSTEM_GLOBAL_RESET_CONFIRM: defineSecondaryPopup(
    "SYSTEM_GLOBAL_RESET_CONFIRM",
    loadSystemRoute,
    loadSystemCss,
    ["data-settings", "platform-core"],
    LIGHT_POPUP_BUDGET,
    "intent-route",
  ),
  SPECIAL_TRAINING_BANK_EDITOR: defineSecondaryPopup(
    "SPECIAL_TRAINING_BANK_EDITOR",
    loadTrainingRoute,
    loadSpecialTrainingBankEditorCss,
    ["training-replay", "platform-core"],
    HEAVY_POPUP_SHELL_BUDGET,
    "intent-route",
  ),
  SPECIAL_TRAINING_BANK_DELETE_CONFIRM: defineSecondaryPopup(
    "SPECIAL_TRAINING_BANK_DELETE_CONFIRM",
    loadTrainingRoute,
    loadTrainingCss,
    ["training-replay", "platform-core"],
    LIGHT_POPUP_BUDGET,
    "intent-route",
  ),
  SPECIAL_TRAINING_MODE_RESTART_CONFIRM: defineSecondaryPopup(
    "SPECIAL_TRAINING_MODE_RESTART_CONFIRM",
    loadTrainingRoute,
    loadTrainingCss,
    ["training-replay", "platform-core"],
    LIGHT_POPUP_BUDGET,
    "intent-route",
  ),
  FREE_REPLAY_REPLAY: defineSecondaryPopup(
    "FREE_REPLAY_REPLAY",
    loadReplayRoute,
    loadReplayCss,
    ["training-replay", "platform-core"],
    REPLAY_ROUTE_BUDGET,
    "idle-route",
  ),
  FREE_REPLAY_ARCHIVE_DETAIL: defineSecondaryPopup(
    "FREE_REPLAY_ARCHIVE_DETAIL",
    loadReplayRoute,
    loadReplayCss,
    ["training-replay", "platform-core"],
    REPLAY_ROUTE_BUDGET,
    "intent-route",
  ),
  FREE_REPLAY_SETTLEMENT_DETAIL: defineSecondaryPopup(
    "FREE_REPLAY_SETTLEMENT_DETAIL",
    loadReplayRoute,
    loadReplayCss,
    ["training-replay", "platform-core"],
    REPLAY_ROUTE_BUDGET,
    "intent-route",
  ),
  CHALLENGE_SESSION_REPLAY: defineSecondaryPopup(
    "CHALLENGE_SESSION_REPLAY",
    loadReplayRoute,
    loadReplayCss,
    ["training-replay", "platform-core"],
    REPLAY_ROUTE_BUDGET,
    "intent-route",
  ),
  CHALLENGE_STATS_REPLAY: defineSecondaryPopup(
    "CHALLENGE_STATS_REPLAY",
    loadReplayRoute,
    loadReplayCss,
    ["training-replay", "platform-core"],
    REPLAY_ROUTE_BUDGET,
    "intent-route",
  ),
  REPLAY_NOTE_EDITOR: defineSecondaryPopup(
    "REPLAY_NOTE_EDITOR",
    loadNoteEditorRoute,
    async () => {
      await Promise.all([loadNoteEditorCss(), loadReplayCss()]);
    },
    ["command-notes", "training-replay", "platform-core"],
    REPLAY_ROUTE_BUDGET,
    "keep-alive",
  ),
  SAMPLE_POOL_IMPORT_CONFIG: defineSecondaryPopup(
    "SAMPLE_POOL_IMPORT_CONFIG",
    loadDataRoute,
    loadDataCss,
    ["data-settings", "platform-core"],
    DATA_ROUTE_BUDGET,
    "intent-route",
  ),
  MARKET_DATA_ACQUISITION: defineSecondaryPopup(
    "MARKET_DATA_ACQUISITION",
    loadDataRoute,
    loadDataCss,
    ["data-settings", "platform-core"],
    DATA_ROUTE_BUDGET,
    "intent-route",
  ),
  DATA_CONFIG_DETAIL: defineSecondaryPopup(
    "DATA_CONFIG_DETAIL",
    loadDataRoute,
    async () => {
      await Promise.all([loadDataCss(), loadReplayCss()]);
    },
    ["data-settings", "platform-core"],
    DATA_ROUTE_BUDGET,
    "intent-route",
  ),
  INDICATOR_REFERENCE: defineSecondaryPopup(
    "INDICATOR_REFERENCE",
    loadIndicatorReferenceRoute,
    loadChallengeCss,
    ["custom-indicator", "platform-core"],
    HEAVY_POPUP_SHELL_BUDGET,
    "intent-route",
  ),
} as const satisfies Record<
  DesktopSecondaryWindowKind,
  DesktopSecondaryPopupDefinition
>;

export const APP_POPUP_DEFINITIONS = {
  DESKTOP_LOCAL_DOCUMENT_DIALOG: {
    id: "DESKTOP_LOCAL_DOCUMENT_DIALOG",
    surface: "app-dialog",
    loader: () => import("@/domains/local-content/DesktopLocalDocumentDialog"),
    cssLoader: () => import("@/styles/popup-ui-primitives.css"),
    i18nNamespaces: ["platform-core"],
    budget: LIGHT_POPUP_BUDGET,
    warmPolicy: "none",
  },
  REPLAY_NOTE_EDITOR_DIALOG: {
    id: "REPLAY_NOTE_EDITOR_DIALOG",
    surface: "app-dialog",
    loader: () => import("@/workspaces/notes/ReplayNoteEditor"),
    cssLoader: loadNoteEditorCss,
    i18nNamespaces: ["command-notes", "training-replay"],
    budget: HEAVY_POPUP_SHELL_BUDGET,
    warmPolicy: "none",
  },
  CUSTOM_INDICATOR_REFERENCE_DIALOG: {
    id: "CUSTOM_INDICATOR_REFERENCE_DIALOG",
    surface: "app-dialog",
    loader: () =>
      import("@/workspaces/custom-indicator/dialogs/CustomIndicatorReferenceCenterDialog"),
    cssLoader: loadChallengeCss,
    i18nNamespaces: ["custom-indicator", "platform-core"],
    budget: HEAVY_POPUP_SHELL_BUDGET,
    warmPolicy: "none",
  },
} as const satisfies Record<string, PopupDefinition>;

export const POPUP_DEFINITIONS = {
  ...DESKTOP_SECONDARY_POPUP_DEFINITIONS,
  ...APP_POPUP_DEFINITIONS,
} as const;

export const getDesktopSecondaryPopupDefinition = (
  kind: DesktopSecondaryWindowKind,
): DesktopSecondaryPopupDefinition => DESKTOP_SECONDARY_POPUP_DEFINITIONS[kind];

export const preloadDesktopSecondaryPopupRoute = async (
  kind: DesktopSecondaryWindowKind,
): Promise<void> => {
  const definition = getDesktopSecondaryPopupDefinition(kind);
  await definition.cssLoader();
  await definition.loader();
};
