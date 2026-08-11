// SPDX-License-Identifier: GPL-3.0-only

import { useShallowStableObject } from "@/workspaces/useShallowStableObject";
import type { SystemSettingsWorkspacePageProps } from "@/workspaces/settings/SystemSettingsWorkspacePage";

type UseSystemSettingsWorkspacePagePropsArgs = {
  isActive?: SystemSettingsWorkspacePageProps["isActive"];
  requestedTab?: SystemSettingsWorkspacePageProps["requestedTab"];
  requestedTabRequestId?: SystemSettingsWorkspacePageProps["requestedTabRequestId"];
  tt: SystemSettingsWorkspacePageProps["tt"];
  ui: SystemSettingsWorkspacePageProps["ui"];
  labels: {
    activeLanguageLabel: SystemSettingsWorkspacePageProps["activeLanguageLabel"];
    activeFontSizeLabel: SystemSettingsWorkspacePageProps["activeFontSizeLabel"];
    activeThemeLabel: SystemSettingsWorkspacePageProps["activeThemeLabel"];
  };
  values: {
    language: SystemSettingsWorkspacePageProps["language"];
    fontSizePreset: SystemSettingsWorkspacePageProps["fontSizePreset"];
    themeMode: SystemSettingsWorkspacePageProps["themeMode"];
    desktopCloseButtonAction: SystemSettingsWorkspacePageProps["desktopCloseButtonAction"];
    priceColorMode: SystemSettingsWorkspacePageProps["priceColorMode"];
    tradeColorTheme: SystemSettingsWorkspacePageProps["tradeColorTheme"];
    showGlobalDecimals: SystemSettingsWorkspacePageProps["showGlobalDecimals"];
    developerModeEnabled: SystemSettingsWorkspacePageProps["developerModeEnabled"];
  };
  status: {
    isSystemStorageUsageLoading: SystemSettingsWorkspacePageProps["isSystemStorageUsageLoading"];
    isBusy: SystemSettingsWorkspacePageProps["isBusy"];
    isPreparingAction: SystemSettingsWorkspacePageProps["isPreparingAction"];
    isGlobalResetProgressVisible: SystemSettingsWorkspacePageProps["isGlobalResetProgressVisible"];
    globalResetProgressLabel: SystemSettingsWorkspacePageProps["globalResetProgressLabel"];
    globalResetProgressPercent: SystemSettingsWorkspacePageProps["globalResetProgressPercent"];
  };
  storage: {
    storageUsageTotalText: SystemSettingsWorkspacePageProps["storageUsageTotalText"];
    storageUsageRows: SystemSettingsWorkspacePageProps["storageUsageRows"];
    globalResetStorageTotalText: SystemSettingsWorkspacePageProps["globalResetStorageTotalText"];
    isGlobalResetStorageSummaryReady: SystemSettingsWorkspacePageProps["isGlobalResetStorageSummaryReady"];
    globalResetStorageRows: SystemSettingsWorkspacePageProps["globalResetStorageRows"];
    globalResetAffectedPoolCount: SystemSettingsWorkspacePageProps["globalResetAffectedPoolCount"];
    globalResetAffectedSymbolCount: SystemSettingsWorkspacePageProps["globalResetAffectedSymbolCount"];
  };
  options: {
    languageOptions: SystemSettingsWorkspacePageProps["languageOptions"];
    fontSizePresetOptions: SystemSettingsWorkspacePageProps["fontSizePresetOptions"];
  };
  actions: {
    setCurrentUiLanguage: SystemSettingsWorkspacePageProps["setCurrentUiLanguage"];
    setLanguage: SystemSettingsWorkspacePageProps["setLanguage"];
    setFontSizePreset: SystemSettingsWorkspacePageProps["setFontSizePreset"];
    setThemeMode: SystemSettingsWorkspacePageProps["setThemeMode"];
    setDesktopCloseButtonAction: SystemSettingsWorkspacePageProps["setDesktopCloseButtonAction"];
    setPriceColorMode: SystemSettingsWorkspacePageProps["setPriceColorMode"];
    setTradeColorTheme: SystemSettingsWorkspacePageProps["setTradeColorTheme"];
    setShowGlobalDecimals: SystemSettingsWorkspacePageProps["setShowGlobalDecimals"];
    refreshSystemStorageUsage: SystemSettingsWorkspacePageProps["refreshSystemStorageUsage"];
    onHistoryRetentionApplied: SystemSettingsWorkspacePageProps["onHistoryRetentionApplied"];
    onRequestGlobalReset: SystemSettingsWorkspacePageProps["onRequestGlobalReset"];
    onEnableDeveloperMode: SystemSettingsWorkspacePageProps["onEnableDeveloperMode"];
    openDataWorkspaceForPortableRebind: SystemSettingsWorkspacePageProps["openDataWorkspaceForPortableRebind"];
  };
  formatters: {
    withLabelValue: SystemSettingsWorkspacePageProps["withLabelValue"];
    formatStorageBytes: SystemSettingsWorkspacePageProps["formatStorageBytes"];
  };
  devSimulationInput: SystemSettingsWorkspacePageProps["devSimulationInput"];
};

export const useSystemSettingsWorkspacePageProps = ({
  isActive,
  requestedTab,
  requestedTabRequestId,
  tt,
  ui,
  labels,
  values,
  status,
  storage,
  options,
  actions,
  formatters,
  devSimulationInput,
}: UseSystemSettingsWorkspacePagePropsArgs): SystemSettingsWorkspacePageProps =>
  useShallowStableObject({
    isActive,
    requestedTab,
    requestedTabRequestId,
    tt,
    ui,
    activeLanguageLabel: labels.activeLanguageLabel,
    activeFontSizeLabel: labels.activeFontSizeLabel,
    activeThemeLabel: labels.activeThemeLabel,
    language: values.language,
    fontSizePreset: values.fontSizePreset,
    themeMode: values.themeMode,
    desktopCloseButtonAction: values.desktopCloseButtonAction,
    priceColorMode: values.priceColorMode,
    tradeColorTheme: values.tradeColorTheme,
    showGlobalDecimals: values.showGlobalDecimals,
    developerModeEnabled: values.developerModeEnabled,
    isSystemStorageUsageLoading: status.isSystemStorageUsageLoading,
    isBusy: status.isBusy,
    isPreparingAction: status.isPreparingAction,
    isGlobalResetProgressVisible: status.isGlobalResetProgressVisible,
    globalResetProgressLabel: status.globalResetProgressLabel,
    globalResetProgressPercent: status.globalResetProgressPercent,
    storageUsageTotalText: storage.storageUsageTotalText,
    storageUsageRows: storage.storageUsageRows,
    globalResetStorageTotalText: storage.globalResetStorageTotalText,
    isGlobalResetStorageSummaryReady:
      storage.isGlobalResetStorageSummaryReady,
    globalResetStorageRows: storage.globalResetStorageRows,
    globalResetAffectedPoolCount: storage.globalResetAffectedPoolCount,
    globalResetAffectedSymbolCount: storage.globalResetAffectedSymbolCount,
    languageOptions: options.languageOptions,
    fontSizePresetOptions: options.fontSizePresetOptions,
    setCurrentUiLanguage: actions.setCurrentUiLanguage,
    setLanguage: actions.setLanguage,
    setFontSizePreset: actions.setFontSizePreset,
    setThemeMode: actions.setThemeMode,
    setDesktopCloseButtonAction: actions.setDesktopCloseButtonAction,
    setPriceColorMode: actions.setPriceColorMode,
    setTradeColorTheme: actions.setTradeColorTheme,
    setShowGlobalDecimals: actions.setShowGlobalDecimals,
    refreshSystemStorageUsage: actions.refreshSystemStorageUsage,
    onHistoryRetentionApplied: actions.onHistoryRetentionApplied,
    onRequestGlobalReset: actions.onRequestGlobalReset,
    onEnableDeveloperMode: actions.onEnableDeveloperMode,
    openDataWorkspaceForPortableRebind:
      actions.openDataWorkspaceForPortableRebind,
    withLabelValue: formatters.withLabelValue,
    formatStorageBytes: formatters.formatStorageBytes,
    devSimulationInput,
  });
