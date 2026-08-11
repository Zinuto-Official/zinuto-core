// SPDX-License-Identifier: GPL-3.0-only

import "@/styles/workspaces/settings.css";

import type { DesktopCloseButtonAction } from "@/frontend-kernel/windowBehaviorTypes";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Button } from "@/ui/primitives/button";
import { SegmentedControl } from "@/ui/primitives/segmented-control";
import { SelectField } from "@/ui/primitives/select-field";
import { Switch } from "@/ui/primitives/switch";
import { ThemeToggle } from "@/ui/primitives/theme-toggle";
import type { ApiHistoryRetentionJob } from "@/api";
import { useSystemDevSimulationControl } from "@/workspaces/settings/useSystemDevSimulationControl";
import { SystemSettingsDesktopStatusSection } from "@/workspaces/settings/SystemSettingsDesktopStatusSection";
import { SystemSettingsHelpSection } from "@/workspaces/settings/SystemSettingsHelpSection";
import {
  useDesktopHelpContext,
  useDesktopHelpContextReporter,
} from "@/domains/desktop-help/DesktopHelpContext";
import type { DesktopHelpContextId } from "@/domains/desktop-help/desktopHelpTypes";
import { getPortableDataTransferCopy } from "@/ui/config/uiConfig";
import {
  resolveTradeColorThemeSwatches,
  type TradeColorThemeToken,
} from "@/ui/theme/visualColors";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import { SettingRow, WorkspaceSection } from "@/ui/components";
import { useI18n } from "@/frontend-kernel/i18n";
import { PortableDataTransferSection } from "@/workspaces/settings/portableData/PortableDataTransferSection";
import { SystemHistoryRetentionSettings } from "@/workspaces/settings/SystemHistoryRetentionSettings";
import { SystemSettingsLayout } from "@/workspaces/settings/settings/SystemSettingsLayout";
import {
  DEFAULT_SYSTEM_SETTINGS_TAB,
  buildSystemSettingsTabItems,
  type SystemSettingsTabId,
} from "@/workspaces/settings/settings/SystemSettingsTabs";
import { DESKTOP_CLOSE_BUTTON_ACTIONS } from "@/frontend-kernel/windowBehavior";
import { useSettingsWorkspaceReadModelActions } from "@/workspaces/settings/useSettingsWorkspaceReadModelActions";
import { SystemSettingsDeveloperSimulationSection } from "@/workspaces/settings/SystemSettingsDeveloperSimulationSection";

export type { SystemSettingsTabId } from "@/workspaces/settings/settings/SystemSettingsTabs";

type ThemeMode = "light" | "dark" | "system";
type FontSizePreset = "SMALL" | "STANDARD" | "LARGE";
type PriceColorMode = "RED_UP_GREEN_DOWN" | "GREEN_UP_RED_DOWN";
type UiLanguage = "en" | "zh-CN" | "ja" | "ko" | "es";
type SystemDevSimulationTargets = {
  freeReplayTarget: number;
  fastDecisionTarget: number;
  riskDisciplineTarget: number;
  independentCustomNotes: number;
  customIndicatorProfiles: number;
  realBacktestBatches: number;
};

const SYSTEM_DEV_SIMULATION_PRESETS: Record<
  "REALISTIC" | "STRESS",
  SystemDevSimulationTargets
> = {
  REALISTIC: {
    freeReplayTarget: 48,
    fastDecisionTarget: 24,
    riskDisciplineTarget: 24,
    independentCustomNotes: 24,
    customIndicatorProfiles: 12,
    realBacktestBatches: 33,
  },
  STRESS: {
    freeReplayTarget: 1200,
    fastDecisionTarget: 240,
    riskDisciplineTarget: 240,
    independentCustomNotes: 48,
    customIndicatorProfiles: 60,
    realBacktestBatches: 310,
  },
};

const buildTradeColorThemePreviewStyle = (
  tradeColorTheme: TradeColorThemeToken,
): CSSProperties => {
  const preview = resolveTradeColorThemeSwatches(tradeColorTheme);
  return {
    "--settings-trade-buy-swatch": preview.buy,
    "--settings-trade-sell-swatch": preview.sell,
  } as CSSProperties;
};

export const DEVELOPER_MODE_UNLOCK_CLICK_COUNT = 5;

export type SystemSettingsWorkspacePageProps = {
  isActive?: boolean;
  requestedTab?: SystemSettingsTabId | null;
  requestedTabRequestId?: number;
  tt: (key: AppTextKey) => string;
  ui: {
    language: string;
    lightMode: string;
    darkMode: string;
    followSystem: string;
    greenUpRedDown: string;
    redUpGreenDown: string;
    tradeColorTheme: string;
    tradeColorThemeInstitutional: string;
    tradeColorThemeCrypto: string;
    tradeColorThemeAccessible: string;
  };
  activeLanguageLabel: string;
  activeFontSizeLabel: string;
  activeThemeLabel: string;
  canRestartOnboarding?: boolean;
  language: UiLanguage;
  fontSizePreset: FontSizePreset;
  themeMode: ThemeMode;
  desktopCloseButtonAction: DesktopCloseButtonAction;
  priceColorMode: PriceColorMode;
  tradeColorTheme: TradeColorThemeToken;
  showGlobalDecimals: boolean;
  developerModeEnabled: boolean;
  isSystemStorageUsageLoading: boolean;
  isBusy: boolean;
  isPreparingAction: boolean;
  isGlobalResetProgressVisible: boolean;
  globalResetProgressLabel: string;
  globalResetProgressPercent: number;
  storageUsageTotalText: string;
  storageUsageRows: Array<{ key: string; label: string; bytes: number }>;
  languageOptions: Array<{ key: UiLanguage; label: string }>;
  fontSizePresetOptions: Array<{ key: FontSizePreset; label: string }>;
  setCurrentUiLanguage: (language: UiLanguage) => Promise<void>;
  setLanguage: (language: UiLanguage) => void;
  setFontSizePreset: (preset: FontSizePreset) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setDesktopCloseButtonAction: (action: DesktopCloseButtonAction) => void;
  setPriceColorMode: (mode: PriceColorMode) => void;
  setTradeColorTheme: (theme: TradeColorThemeToken) => void;
  setShowGlobalDecimals: (next: boolean) => void;
  refreshSystemStorageUsage: (options?: { silent?: boolean }) => Promise<void>;
  onHistoryRetentionApplied?: (
    job: ApiHistoryRetentionJob,
  ) => void | Promise<void>;
  onRequestGlobalReset: () => void;
  onEnableDeveloperMode: () => void;
  onRestartOnboarding?: () => void;
  globalResetStorageTotalText: string;
  isGlobalResetStorageSummaryReady: boolean;
  globalResetStorageRows: Array<{
    key: string;
    label: string;
    bytes: number;
    valueText: string;
    percent: number;
    progressPercent: number;
    sortOrder: number;
  }>;
  globalResetAffectedPoolCount: number;
  globalResetAffectedSymbolCount: number;
  openDataWorkspaceForPortableRebind: (sourceIds: string[]) => void;
  withLabelValue: (label: string, value: string) => string;
  formatStorageBytes: (value: number) => string;
  devSimulationInput: {
    onDataChanged?: (options: {
      reason: "success" | "cleanup";
    }) => void | Promise<void>;
  };
};

export const SystemSettingsWorkspacePage = ({
  isActive = true,
  requestedTab = null,
  requestedTabRequestId = 0,
  tt,
  ui,
  activeLanguageLabel,
  activeFontSizeLabel,
  activeThemeLabel,
  canRestartOnboarding = false,
  language,
  fontSizePreset,
  themeMode,
  desktopCloseButtonAction,
  priceColorMode,
  tradeColorTheme,
  showGlobalDecimals,
  developerModeEnabled,
  isSystemStorageUsageLoading,
  isBusy,
  isPreparingAction,
  isGlobalResetProgressVisible,
  globalResetProgressLabel,
  globalResetProgressPercent,
  languageOptions,
  fontSizePresetOptions,
  setCurrentUiLanguage,
  setLanguage,
  setFontSizePreset,
  setThemeMode,
  setDesktopCloseButtonAction,
  setPriceColorMode,
  setTradeColorTheme,
  setShowGlobalDecimals,
  refreshSystemStorageUsage,
  onHistoryRetentionApplied,
  onRequestGlobalReset,
  onEnableDeveloperMode,
  onRestartOnboarding,
  globalResetStorageTotalText,
  isGlobalResetStorageSummaryReady,
  globalResetStorageRows,
  globalResetAffectedPoolCount,
  globalResetAffectedSymbolCount,
  openDataWorkspaceForPortableRebind,
  withLabelValue,
  formatStorageBytes,
  devSimulationInput,
}: SystemSettingsWorkspacePageProps) => {
  const { t } = useI18n();
  const desktopHelpContext = useDesktopHelpContext();
  const tLoose = t as (
    key: string,
    params?: Record<string, string | number>,
  ) => string;
  const [activeTab, setActiveTab] = useState<SystemSettingsTabId>(
    requestedTab ?? DEFAULT_SYSTEM_SETTINGS_TAB,
  );
  const helpContextId: DesktopHelpContextId =
    activeTab === "GENERAL"
        ? "SETTINGS_GENERAL"
        : activeTab === "DATA_TRANSFER"
          ? "SETTINGS_DATA_TRANSFER"
          : activeTab === "ABOUT"
            ? "SETTINGS_ABOUT"
            : "SETTINGS_ADVANCED";
  useDesktopHelpContextReporter({
    active: isActive,
    contextId: helpContextId,
    workspace: "SETTINGS",
  });
  const [simulationProfileId, setSimulationProfileId] = useState<
    "REALISTIC" | "STRESS"
  >("REALISTIC");
  const [simulationRepeatMode, setSimulationRepeatMode] = useState<
    "REPLACE" | "APPEND"
  >("REPLACE");
  const [simulationSeed, setSimulationSeed] = useState("zinuto-realistic-v6");
  const [simulationTargets, setSimulationTargets] =
    useState<SystemDevSimulationTargets>(
      SYSTEM_DEV_SIMULATION_PRESETS.REALISTIC,
    );
  const [deviceTransferTitleClickCount, setDeviceTransferTitleClickCount] =
    useState(0);
  const portableCopy = useMemo(
    () => getPortableDataTransferCopy(language),
    [language],
  );
  const tabItems = useMemo(
    () => buildSystemSettingsTabItems(tLoose),
    [tLoose],
  );
  const tradeColorThemeOptions = useMemo<
    Array<{
      value: TradeColorThemeToken;
      label: ReactNode;
    }>
  >(
    () =>
      [
        {
          value: "INSTITUTIONAL" as const,
          accessibilityLabel: ui.tradeColorThemeInstitutional,
        },
        {
          value: "CRYPTO" as const,
          accessibilityLabel: ui.tradeColorThemeCrypto,
        },
        {
          value: "ACCESSIBLE" as const,
          accessibilityLabel: ui.tradeColorThemeAccessible,
        },
      ].map((option) => ({
        value: option.value,
        label: (
          <span
            className="settings-trade-theme-pair-pill"
            style={buildTradeColorThemePreviewStyle(option.value)}
          >
            <span className="sr-only">{option.accessibilityLabel}</span>
            <span className="settings-trade-theme-pair-segment is-buy">
              {tt("appText.buy3")}
            </span>
            <span className="settings-trade-theme-pair-segment is-sell">
              {tt("appText.sell3")}
            </span>
          </span>
        ),
      })),
    [
      tt,
      ui.tradeColorThemeAccessible,
      ui.tradeColorThemeCrypto,
      ui.tradeColorThemeInstitutional,
    ],
  );
  const simulationProfileOptions = useMemo(
    () => [
      {
        key: "REALISTIC" as const,
        label: tLoose("settings.devSimulation.profile.realistic"),
        description: tLoose(
          "settings.devSimulation.profile.realisticDescription",
        ),
      },
      {
        key: "STRESS" as const,
        label: tLoose("settings.devSimulation.profile.stress"),
        description: tLoose("settings.devSimulation.profile.stressDescription"),
      },
    ],
    [tLoose],
  );
  const desktopCloseButtonActionOptions = useMemo(
    () =>
      DESKTOP_CLOSE_BUTTON_ACTIONS.map((action) => ({
        value: action,
        label: t(`settings.general.closeButtonAction.option.${action}`),
      })),
    [t],
  );
  const {
    refresh: refreshSettingsReadModel,
    portableExportAction,
    portableImportAction,
    resetAllDataAction,
    retentionActionModel,
    devSimulationActionModel,
  } = useSettingsWorkspaceReadModelActions(isActive);
  const isSettingsSystemActionBlocked =
    isSystemStorageUsageLoading ||
    isBusy ||
    isPreparingAction ||
    isGlobalResetProgressVisible;
  const isGlobalResetActionBlocked =
    isSettingsSystemActionBlocked ||
    !isGlobalResetStorageSummaryReady ||
    !resetAllDataAction.enabled;
  const devSimulation = useSystemDevSimulationControl({
    tt,
    selectedProfileId: simulationProfileId,
    actionModel: devSimulationActionModel,
    onActionModelChanged: refreshSettingsReadModel,
    enabled: isActive,
    onDataChanged: devSimulationInput.onDataChanged,
    request: {
      repeatMode: simulationRepeatMode,
      seed: simulationSeed,
      targets: simulationTargets,
    },
  });
  const updateSimulationTarget = (
    key: keyof SystemDevSimulationTargets,
    value: number,
  ) => {
    setSimulationTargets((current) => ({
      ...current,
      [key]: Math.max(0, Math.floor(Number(value) || 0)),
    }));
  };
  const restoreSimulationPreset = (profileId = simulationProfileId) => {
    const fromCapabilities = devSimulation.capabilities?.profiles.find(
      (profile) => profile.profileId === profileId,
    )?.defaultTargets;
    setSimulationTargets(
      fromCapabilities
        ? { ...fromCapabilities }
        : { ...SYSTEM_DEV_SIMULATION_PRESETS[profileId] },
    );
    setSimulationSeed(
      profileId === "STRESS" ? "zinuto-stress-v6" : "zinuto-realistic-v6",
    );
  };
  const hasSimulationTargets = Object.values(simulationTargets).some(
    (target) => target > 0,
  );
  const visibleSimulationProfileOptions = useMemo(() => {
    const availabilityByProfileId = new Map(
      (Array.isArray(devSimulation.capabilities?.profiles)
        ? devSimulation.capabilities?.profiles
        : []
      ).map((profile) => [profile.profileId, profile.available]),
    );
    return simulationProfileOptions.filter(
      (option) =>
        availabilityByProfileId.get(option.key) ?? option.key === "REALISTIC",
    );
  }, [devSimulation.capabilities?.profiles, simulationProfileOptions]);
  const activePriceColorLabel =
    priceColorMode === "GREEN_UP_RED_DOWN"
      ? ui.greenUpRedDown
      : ui.redUpGreenDown;
  const activeTradeColorThemeLabel = useMemo(() => {
    switch (tradeColorTheme) {
      case "CRYPTO":
        return ui.tradeColorThemeCrypto;
      case "ACCESSIBLE":
        return ui.tradeColorThemeAccessible;
      case "INSTITUTIONAL":
      default:
        return ui.tradeColorThemeInstitutional;
    }
  }, [
    tradeColorTheme,
    ui.tradeColorThemeAccessible,
    ui.tradeColorThemeCrypto,
    ui.tradeColorThemeInstitutional,
  ]);
  const activeGlobalAmountDisplayLabel = showGlobalDecimals
    ? tt("appText.showDecimals")
    : tt("appText.hideDecimals");
  const activeDesktopCloseButtonActionLabel =
    desktopCloseButtonActionOptions.find(
      (item) => item.value === desktopCloseButtonAction,
    )?.label ??
    desktopCloseButtonActionOptions[0]?.label ??
    "";
  const formatStoragePercent = (value: number): string => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return `0${tt("appText.percent")}`;
    }
    const rounded =
      parsed < 10 ? Math.round(parsed * 10) / 10 : Math.round(parsed);
    return `${String(rounded).replace(/\.0$/, "")}${tt("appText.percent")}`;
  };
  const middleDot = t("common.symbol.middleDot").trim();
  const globalResetKlineMetaText = [
    withLabelValue(tt("appText.symbol"), String(globalResetAffectedPoolCount)),
    withLabelValue(tt("appText.bars"), String(globalResetAffectedSymbolCount)),
  ].join(` ${middleDot} `);

  useEffect(() => {
    const isSelectedVisible = visibleSimulationProfileOptions.some(
      (option) => option.key === simulationProfileId,
    );
    if (!isSelectedVisible) {
      setSimulationProfileId("REALISTIC");
    }
  }, [simulationProfileId, visibleSimulationProfileOptions]);

  useEffect(() => {
    const isRequestedTabVisible =
      requestedTab && tabItems.some((item) => item.key === requestedTab);
    if (isRequestedTabVisible) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab, requestedTabRequestId, tabItems]);

  useEffect(() => {
    const isActiveTabVisible = tabItems.some((item) => item.key === activeTab);
    if (!isActiveTabVisible) {
      setActiveTab(DEFAULT_SYSTEM_SETTINGS_TAB);
    }
  }, [activeTab, tabItems]);

  useEffect(() => {
    if (
      developerModeEnabled ||
      deviceTransferTitleClickCount < DEVELOPER_MODE_UNLOCK_CLICK_COUNT
    ) {
      return;
    }
    onEnableDeveloperMode();
    setDeviceTransferTitleClickCount(0);
  }, [
    developerModeEnabled,
    deviceTransferTitleClickCount,
    onEnableDeveloperMode,
  ]);

  useEffect(() => {
    if (developerModeEnabled || activeTab !== "DATA_TRANSFER") {
      setDeviceTransferTitleClickCount(0);
    }
  }, [activeTab, developerModeEnabled]);

  const activeTabForRender = tabItems.some((item) => item.key === activeTab)
    ? activeTab
    : DEFAULT_SYSTEM_SETTINGS_TAB;
  const activeTabItem = tabItems.find(
    (item) => item.key === activeTabForRender,
  ) ??
    tabItems.find((item) => item.key === DEFAULT_SYSTEM_SETTINGS_TAB) ?? {
      key: DEFAULT_SYSTEM_SETTINGS_TAB,
      label: tLoose("settings.tabs.general.label"),
    };

  const formatCurrentValueTitle = (value: string): string =>
    t("settings.general.currentValue", { value });

  const renderGeneralTab = () => (
    <>
      <WorkspaceSection
        className="settings-flow-group"
        bodyClassName="settings-flow-row-list"
      >
        <SettingRow
          title={t("settings.general.language.title")}
          control={
            <SelectField
              className="settings-language-select"
              density="large"
              title={formatCurrentValueTitle(activeLanguageLabel)}
              aria-label={t("settings.general.language.title")}
              value={language}
              onValueChange={(value) => {
                const nextLanguage = value as UiLanguage;
                void setCurrentUiLanguage(nextLanguage).then(() => {
                  setLanguage(nextLanguage);
                });
              }}
              options={languageOptions.map((item) => ({
                value: item.key,
                label: item.label,
              }))}
            />
          }
        />

        <SettingRow
          title={t("settings.general.fontSize.title")}
          control={
            <div
              className="settings-segmented-current"
              title={formatCurrentValueTitle(activeFontSizeLabel)}
            >
              <SegmentedControl
                className="settings-theme-switch settings-one-line-segment"
                value={fontSizePreset}
                onChange={(value) => setFontSizePreset(value as FontSizePreset)}
                gridTemplateColumns="repeat(3, minmax(0, 1fr))"
                options={fontSizePresetOptions.map((item) => ({
                  value: item.key,
                  label: item.label,
                }))}
              />
            </div>
          }
        />

        <SettingRow
          title={t("settings.general.themeAppearance.title")}
          control={
            <div
              className="settings-segmented-current"
              title={formatCurrentValueTitle(activeThemeLabel)}
            >
              <ThemeToggle
                className="settings-theme-switch settings-theme-mode-switch settings-one-line-segment"
                value={themeMode}
                onChange={setThemeMode}
                gridTemplateColumns="repeat(3, minmax(0, 1fr))"
                labels={{
                  light: ui.lightMode,
                  dark: ui.darkMode,
                  system: ui.followSystem,
                }}
              />
            </div>
          }
        />

        <SettingRow
          title={t("settings.general.closeButtonAction.title")}
          control={
            <SelectField
              className="settings-language-select"
              density="large"
              title={formatCurrentValueTitle(
                activeDesktopCloseButtonActionLabel,
              )}
              aria-label={t("settings.general.closeButtonAction.title")}
              value={desktopCloseButtonAction}
              onValueChange={(value) =>
                setDesktopCloseButtonAction(value as DesktopCloseButtonAction)
              }
              options={desktopCloseButtonActionOptions}
            />
          }
        />

        <SettingRow
          title={t("settings.general.desktopHelpLauncher.title")}
          control={
            <div className="settings-general-toggle-control">
              <Switch
                checked={desktopHelpContext?.showDesktopHelpLauncher ?? true}
                aria-label={t(
                  "settings.general.desktopHelpLauncher.title",
                )}
                onCheckedChange={(checked) =>
                  desktopHelpContext?.setShowDesktopHelpLauncher(checked)
                }
              />
            </div>
          }
        />
      </WorkspaceSection>
      {renderMarketDisplaySection()}
    </>
  );

  const renderMarketDisplaySection = () => (
    <WorkspaceSection
      className="settings-flow-group"
      bodyClassName="settings-flow-row-list"
      onboardingTargetId="TOOLS_MARKET_DISPLAY"
    >
      <SettingRow
        title={t("settings.general.priceColorScheme.title")}
        control={
          <div
            className="settings-segmented-current"
            title={formatCurrentValueTitle(activePriceColorLabel)}
          >
            <SegmentedControl
              className="settings-theme-switch settings-one-line-segment"
              value={priceColorMode}
              onChange={(value) => setPriceColorMode(value as PriceColorMode)}
              gridTemplateColumns="repeat(2, minmax(0, 1fr))"
              options={[
                {
                  value: "RED_UP_GREEN_DOWN",
                  label: ui.redUpGreenDown,
                },
                {
                  value: "GREEN_UP_RED_DOWN",
                  label: ui.greenUpRedDown,
                },
              ]}
            />
          </div>
        }
      />

      <SettingRow
        title={t("settings.general.tradeColorTheme.title")}
        control={
          <div className="settings-trade-theme-picker">
            <SelectField
              className="settings-trade-theme-select"
              density="large"
              aria-label={t("settings.general.tradeColorTheme.title")}
              title={formatCurrentValueTitle(activeTradeColorThemeLabel)}
              value={tradeColorTheme}
              onValueChange={(nextValue) =>
                setTradeColorTheme(nextValue as TradeColorThemeToken)
              }
              options={tradeColorThemeOptions}
            />
          </div>
        }
      />

      <SettingRow
        title={tt("appText.globalAmountDisplay")}
        description={tt(
          "appText.globalAmountDisplayAffectsUiRenderingDoesAffect",
        )}
        control={
          <div
            className="settings-segmented-current"
            title={formatCurrentValueTitle(activeGlobalAmountDisplayLabel)}
          >
            <SegmentedControl
              className="settings-theme-switch settings-one-line-segment"
              value={showGlobalDecimals ? "SHOW" : "HIDE"}
              onChange={(value) => setShowGlobalDecimals(value === "SHOW")}
              gridTemplateColumns="repeat(2, minmax(0, 1fr))"
              options={[
                {
                  value: "SHOW",
                  label: tt("appText.showDecimals"),
                },
                {
                  value: "HIDE",
                  label: tt("appText.hideDecimals"),
                },
              ]}
            />
          </div>
        }
      />
    </WorkspaceSection>
  );

  const renderAboutUpdatesSection = () => (
    <SystemSettingsDesktopStatusSection
      canRestartOnboarding={canRestartOnboarding}
      onRestartOnboarding={onRestartOnboarding}
    />
  );

  const renderDeviceTransferTitle = () =>
    developerModeEnabled ? (
      portableCopy.sectionTitle
    ) : (
      <Button
        type="button"
        variant="inline"
        className="settings-device-transfer-title-trigger"
        aria-label={portableCopy.sectionTitle}
        onClick={() => {
          setDeviceTransferTitleClickCount((current) => current + 1);
        }}
      >
        {portableCopy.sectionTitle}
      </Button>
    );

  const renderDeviceTransferSection = () => (
    <WorkspaceSection
      title={renderDeviceTransferTitle()}
      className="settings-flow-group"
      bodyClassName="settings-flow-row-list"
    >
      <PortableDataTransferSection
        exportEnabled={portableExportAction.enabled}
        importEnabled={portableImportAction.enabled}
        onNavigateToDataForRebind={openDataWorkspaceForPortableRebind}
      />
    </WorkspaceSection>
  );

  const renderGlobalResetProgress = () =>
    isGlobalResetProgressVisible ? (
      <div className="settings-storage-reset-progress" aria-live="polite">
        <div className="settings-storage-reset-progress-head">
          <span className="settings-storage-reset-progress-label">
            {globalResetProgressLabel || tt("appText.oneClickReset2")}
          </span>
          <span className="settings-storage-reset-progress-value">
            {`${Math.max(0, Math.min(100, Math.round(globalResetProgressPercent)))}${tt("appText.percent")}`}
          </span>
        </div>
        <div className="settings-storage-reset-progress-track">
          <span
            style={{
              width: `${Math.max(
                0,
                Math.min(100, globalResetProgressPercent),
              )}%`,
            }}
          ></span>
        </div>
      </div>
    ) : null;

  const renderOneClickResetPanel = () => (
    <div className="settings-action-panel settings-reset-panel">
      <SettingRow
        className="settings-reset-action-row"
        title={t("settings.storage.section.categories")}
        control={
          <div className="settings-action-panel-actions">
            <Button
              variant="destructive"
              size="xs"
              onClick={() => {
                if (isGlobalResetActionBlocked) {
                  return;
                }
                onRequestGlobalReset();
              }}
              disabled={isGlobalResetActionBlocked}
            >
              {tt("appText.oneClickReset2")}
            </Button>
          </div>
        }
      />
      {renderGlobalResetProgress()}
      <div className="settings-maintenance-inline-summary">
        <div className="settings-maintenance-inline-overview">
          {[
            {
              key: "total",
              label: tt("appText.totalUsage"),
              value: globalResetStorageTotalText,
            },
          ].map((item) => (
            <div
              key={item.key}
              className="settings-maintenance-inline-overview-item"
            >
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
        <div
          className="settings-maintenance-storage-stack"
          aria-label={globalResetStorageTotalText}
        >
          {globalResetStorageRows.map((row) => {
            const percentText = formatStoragePercent(row.percent);
            const usageLabel = `${row.label} ${row.valueText} ${percentText}`;
            return (
              <span
                key={row.key}
                className={`settings-maintenance-storage-segment is-${row.key}`}
                style={{
                  width: `${Math.max(0, Math.min(100, row.progressPercent))}%`,
                }}
                title={usageLabel}
                aria-label={usageLabel}
              />
            );
          })}
        </div>
        <div className="settings-maintenance-storage-grid">
          {globalResetStorageRows.map((row) => {
            const percentText = formatStoragePercent(row.percent);
            return (
              <article
                key={row.key}
                className={`settings-maintenance-storage-card is-${row.key} ${
                  row.bytes <= 0 ? "is-empty" : ""
                }`}
                title={`${row.label} ${row.valueText} ${percentText}`}
              >
                <span
                  className="settings-maintenance-storage-swatch"
                  aria-hidden="true"
                />
                <div className="settings-maintenance-storage-card-head">
                  <span className="settings-maintenance-storage-card-label">
                    <span>{row.label}</span>
                    {row.key === "kline" ? (
                      <span className="settings-maintenance-storage-card-label-meta">
                        {globalResetKlineMetaText}
                      </span>
                    ) : null}
                  </span>
                  <strong className="settings-maintenance-storage-card-value">
                    {row.valueText}
                  </strong>
                </div>
                <span className="settings-maintenance-storage-card-percent">
                  {percentText}
                </span>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderStorageSections = () => (
    <>
      <WorkspaceSection
        title={t("settings.storage.section.usage")}
        className="settings-flow-group"
        bodyClassName="settings-flow-row-list"
      >
        {renderOneClickResetPanel()}
      </WorkspaceSection>
    </>
  );

  const renderDataTransferTab = () => (
    <>
      {renderStorageSections()}
      {renderDeviceTransferSection()}
    </>
  );

  const renderAboutTab = () => (
    <>
      {renderAboutUpdatesSection()}
      <SystemSettingsHelpSection />
    </>
  );

  const renderAdvancedTab = () => (
    <>
      <SystemHistoryRetentionSettings
        isActive={isActive && activeTab === "ADVANCED"}
        disabled={isSettingsSystemActionBlocked}
        actionModel={retentionActionModel}
        language={language}
        formatStorageBytes={formatStorageBytes}
        refreshSystemStorageUsage={refreshSystemStorageUsage}
        onHistoryRetentionApplied={onHistoryRetentionApplied}
        t={tLoose}
        tt={tt}
      />

    </>
  );

  const renderSimulationTab = () => (
    <SystemSettingsDeveloperSimulationSection
        visible
        disabled={isSettingsSystemActionBlocked}
        tt={tt}
        t={tLoose}
        devSimulation={devSimulation}
        hasSimulationTargets={hasSimulationTargets}
        simulationProfileId={simulationProfileId}
        visibleSimulationProfileOptions={visibleSimulationProfileOptions}
        simulationRepeatMode={simulationRepeatMode}
        simulationSeed={simulationSeed}
        simulationTargets={simulationTargets}
        onSimulationProfileChange={(profileId) => {
          setSimulationProfileId(profileId);
          restoreSimulationPreset(profileId);
        }}
        onSimulationRepeatModeChange={setSimulationRepeatMode}
        onSimulationSeedChange={setSimulationSeed}
        onSimulationTargetChange={updateSimulationTarget}
        onClearSimulationTargets={() =>
          setSimulationTargets({
            freeReplayTarget: 0,
            fastDecisionTarget: 0,
            riskDisciplineTarget: 0,
            independentCustomNotes: 0,
            customIndicatorProfiles: 0,
            realBacktestBatches: 0,
          })
        }
        onRestoreSimulationPreset={() => restoreSimulationPreset()}
        simulationPresetTargets={SYSTEM_DEV_SIMULATION_PRESETS}
      />
  );

  const renderActiveTabBody = () => {
    switch (activeTabForRender) {
      case "GENERAL":
        return renderGeneralTab();
      case "DATA_TRANSFER":
        return renderDataTransferTab();
      case "SIMULATION":
        return renderSimulationTab();
      case "ABOUT":
        return renderAboutTab();
      case "ADVANCED":
        return renderAdvancedTab();
      default:
        return null;
    }
  };

  return (
    <SystemSettingsLayout
      activeTab={activeTabForRender}
      activeTabItem={activeTabItem}
      ariaLabel={tt("appText.settings")}
      onTabChange={setActiveTab}
      tabItems={tabItems}
    >
      {renderActiveTabBody()}
    </SystemSettingsLayout>
  );
};
