// SPDX-License-Identifier: GPL-3.0-only

export type SystemSettingsTabId =
  | "GENERAL"
  | "DATA_TRANSFER"
  | "SIMULATION"
  | "ABOUT"
  | "ADVANCED";

export type SystemSettingsTabNavigationRequest = {
  requestId: number;
  tab: SystemSettingsTabId;
};

export const createNextSystemSettingsTabNavigationRequest = (
  current: SystemSettingsTabNavigationRequest | null,
  tab: SystemSettingsTabId,
): SystemSettingsTabNavigationRequest => ({
  requestId: (current?.requestId ?? 0) + 1,
  tab,
});

export type SystemSettingsTabItem = {
  key: SystemSettingsTabId;
  label: string;
};

export const DEFAULT_SYSTEM_SETTINGS_TAB: SystemSettingsTabId = "GENERAL";

export const buildSystemSettingsTabItems = (
  t: (key: string) => string,
): SystemSettingsTabItem[] => [
  {
    key: "GENERAL",
    label: t("settings.tabs.general.label"),
  },
  {
    key: "DATA_TRANSFER",
    label: t("settings.tabs.dataTransfer.label"),
  },
  {
    key: "SIMULATION",
    label: t("settings.tabs.simulation.label"),
  },
  {
    key: "ABOUT",
    label: t("settings.tabs.about.label"),
  },
  {
    key: "ADVANCED",
    label: t("settings.tabs.advanced.label"),
  },
];
