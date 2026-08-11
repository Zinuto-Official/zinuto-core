// SPDX-License-Identifier: GPL-3.0-only

import type { AppIconName } from "@/assets/graphics";

export type WorkspaceSidebarGroupKey =
  | "command"
  | "core"
  | "advanced"
  | "reflection"
  | "system";

export type WorkspaceSidebarGroupLabelKey =
  | "navGroupCommand"
  | "navGroupTraining"
  | "navGroupReview"
  | "navGroupReflection"
  | "navGroupTools";

export type WorkspaceSidebarItemLabelKey =
  | "navTrainingCommandCenter"
  | "navTrainer"
  | "navHistory"
  | "navSpecialTraining"
  | "navChallengeStats"
  | "navNotes"
  | "navCustomIndicator"
  | "navStrategyBacktest"
  | "navDataConfig"
  | "navSettings";

export type WorkspaceMotionSurface = "immersive" | "standard";

type WorkspaceUiRegistryEntry = {
  page: string;
  sidebarGroup: WorkspaceSidebarGroupKey;
  sidebarLabelKey: WorkspaceSidebarItemLabelKey;
  icon: AppIconName;
  motionSurface: WorkspaceMotionSurface;
  idlePreload: boolean;
  keepAlive: boolean;
  readModelId?: string;
};

export const WORKSPACE_SIDEBAR_GROUPS = [
  { key: "command", labelKey: "navGroupCommand" },
  { key: "core", labelKey: "navGroupTraining" },
  { key: "advanced", labelKey: "navGroupReview" },
  { key: "reflection", labelKey: "navGroupReflection" },
  { key: "system", labelKey: "navGroupTools" },
] as const satisfies readonly {
  key: WorkspaceSidebarGroupKey;
  labelKey: WorkspaceSidebarGroupLabelKey;
}[];

export const WORKSPACE_UI_REGISTRY = [
  {
    page: "COMMAND_CENTER",
    sidebarGroup: "command",
    sidebarLabelKey: "navTrainingCommandCenter",
    icon: "navCommandCenter",
    motionSurface: "standard",
    idlePreload: false,
    keepAlive: false,
    readModelId: "command-center",
  },
  {
    page: "TRAINER",
    sidebarGroup: "core",
    sidebarLabelKey: "navTrainer",
    icon: "navTrainer",
    motionSurface: "immersive",
    idlePreload: false,
    keepAlive: true,
    readModelId: "trainer",
  },
  {
    page: "HISTORY",
    sidebarGroup: "core",
    sidebarLabelKey: "navHistory",
    icon: "navHistory",
    motionSurface: "standard",
    idlePreload: true,
    keepAlive: true,
    readModelId: "history-review-console",
  },
  {
    page: "SPECIAL_TRAINING",
    sidebarGroup: "advanced",
    sidebarLabelKey: "navSpecialTraining",
    icon: "navChallengeHall",
    motionSurface: "immersive",
    idlePreload: false,
    keepAlive: true,
    readModelId: "special-training",
  },
  {
    page: "CHALLENGE_STATS",
    sidebarGroup: "advanced",
    sidebarLabelKey: "navChallengeStats",
    icon: "navChallengeStats",
    motionSurface: "standard",
    idlePreload: false,
    keepAlive: true,
    readModelId: "challenge-stats",
  },
  {
    page: "CUSTOM_INDICATOR",
    sidebarGroup: "reflection",
    sidebarLabelKey: "navCustomIndicator",
    icon: "navCustomIndicator",
    motionSurface: "standard",
    idlePreload: false,
    keepAlive: true,
    readModelId: "custom-indicator",
  },
  {
    page: "STRATEGY_BACKTEST",
    sidebarGroup: "reflection",
    sidebarLabelKey: "navStrategyBacktest",
    icon: "navStrategyBacktest",
    motionSurface: "standard",
    idlePreload: false,
    keepAlive: true,
    readModelId: "strategy-backtest",
  },
  {
    page: "NOTES",
    sidebarGroup: "system",
    sidebarLabelKey: "navNotes",
    icon: "navNotes",
    motionSurface: "standard",
    idlePreload: false,
    keepAlive: true,
    readModelId: "notes",
  },
  {
    page: "DATA",
    sidebarGroup: "system",
    sidebarLabelKey: "navDataConfig",
    icon: "navData",
    motionSurface: "standard",
    idlePreload: true,
    keepAlive: true,
    readModelId: "data-management",
  },
  {
    page: "SETTINGS",
    sidebarGroup: "system",
    sidebarLabelKey: "navSettings",
    icon: "settingsGear",
    motionSurface: "standard",
    idlePreload: true,
    keepAlive: true,
    readModelId: "settings",
  },
] as const satisfies readonly WorkspaceUiRegistryEntry[];

export type WorkspacePage = (typeof WORKSPACE_UI_REGISTRY)[number]["page"];

export const WORKSPACE_MOTION_ORDER: readonly WorkspacePage[] =
  WORKSPACE_UI_REGISTRY.map((entry) => entry.page);

export const WORKSPACE_PAGE_SET = new Set<WorkspacePage>(WORKSPACE_MOTION_ORDER);

export const WORKSPACE_IDLE_PRELOAD_ORDER: readonly WorkspacePage[] =
  WORKSPACE_UI_REGISTRY.filter((entry) => entry.idlePreload).map(
    (entry) => entry.page,
  );

export const WORKSPACE_KEEP_ALIVE_PAGES = new Set<WorkspacePage>(
  WORKSPACE_UI_REGISTRY.filter((entry) => entry.keepAlive).map(
    (entry) => entry.page,
  ),
);

const WORKSPACE_MOTION_INDEX = new Map(
  WORKSPACE_MOTION_ORDER.map((page, index) => [page, index]),
);

export const getWorkspaceMotionDirection = (
  fromPage: WorkspacePage | null,
  toPage: WorkspacePage,
): "backward" | "forward" | "none" => {
  if (!fromPage || fromPage === toPage) {
    return "none";
  }
  const fromIndex = WORKSPACE_MOTION_INDEX.get(fromPage);
  const toIndex = WORKSPACE_MOTION_INDEX.get(toPage);
  if (fromIndex == null || toIndex == null || fromIndex === toIndex) {
    return "none";
  }
  return fromIndex < toIndex ? "forward" : "backward";
};

export const getWorkspaceMotionSurface = (
  page: WorkspacePage,
): WorkspaceMotionSurface =>
  WORKSPACE_UI_REGISTRY.find((entry) => entry.page === page)?.motionSurface ??
  "standard";
