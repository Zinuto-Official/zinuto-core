// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, type CSSProperties, type MutableRefObject } from "react";
import { type Chart } from "klinecharts";
import {
  api,
} from "@/api";
import { useCustomIndicatorProfileVersionState } from "@/app-shell/useCustomIndicatorProfileVersionState";
import { useChartIndicatorSettingsBaseline } from "@/app-shell/useChartIndicatorSettingsBaseline";
import { useTrainerIndicatorOptionsModel } from "@/app-shell/useTrainerIndicatorOptionsModel";
import { useIndicatorSelectionGuards } from "@/app-shell/useIndicatorSelectionGuards";
import { useAppNoticeController } from "@/app-shell/useAppNoticeController";
import { useAppViewportAndSystemTheme } from "@/app-shell/useAppViewportAndSystemTheme";
import { useChartGlobalDisplaySync } from "@/app-shell/useChartGlobalDisplaySync";
import { useShortcutModalEscape } from "@/app-shell/useShortcutModalEscape";
import { useDrawToolModel } from "@/app-shell/useDrawToolModel";
import { useLocalizedDisplayTextModel } from "@/app-shell/useLocalizedDisplayTextModel";
import { setGlobalTypographyContext } from "@/frontend-kernel/typography";
import {
  type UiSettings,
} from "@/frontend-kernel/appTypes";
import { subscribeToGlobalNoticeDialog } from "@/frontend-kernel/notifications/globalNoticeDialog";
import {
  TRAINER_CHART_EDGE_CONFIG,
  resolveChartChangeBubbleRight,
  resolveMaxOffsetRightDistanceByVisibleBars,
  resolveResponsiveChartEdgeConfig,
} from "@/domains/chart/display";
import {
  INDICATOR_NONE_VALUE,
} from "@/domains/indicators/core";
import {
  getTradingSettingsText,
} from "@/ui/config/uiConfig";
import { buildGlobalVisualCssVariables } from "@/ui/theme/visualColors";
import { getUiLabels } from "@/ui/config/uiLabels";
import { resolveTradeMarkerDensityLevel } from "@/domains/chart/overlays/tradeMarkerDensityRules";
import { useReplaySettingsViewModel } from "@/domains/trainer/useReplaySettingsViewModel";
import { useRuntimeAppPersistence } from "@/app-shell/runtime/useRuntimeAppPersistence";
import { useRuntimeProgressAndLifecycleEffects } from "@/app-shell/runtime/useRuntimeProgressAndLifecycleEffects";
import { useRuntimeTrainerAggregationCache } from "@/app-shell/runtime/useRuntimeTrainerAggregationCache";
import { useRuntimeTrainerRefSyncEffects } from "@/app-shell/runtime/useRuntimeTrainerRefSyncEffects";
import { resolveDesktopOnboardingPersistedTourStatus } from "@/domains/onboarding/desktopOnboardingModel";
import {
  formatMessage,
  resolveLocaleWidthProfile,
} from "@zinuto/shared/i18n";
import type { useRuntimeStartupState } from "@/app-shell/runtime/runtimeStartupState";
import type { useRuntimeStartupHistoryState } from "@/app-shell/runtime/runtimeStartupHistoryState";
type RuntimeHookScope = AppRootRuntimeProps &
  ReturnType<typeof useRuntimeStartupState> &
  ReturnType<typeof useRuntimeStartupHistoryState> &
  Record<string, unknown>;

export type AppRootRuntimeProps = {
  initialUiSettings: UiSettings;
  initialDataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
  canPersistUiSettings: boolean;
};





export const useRuntimeStartupPersistence = (scope: RuntimeHookScope) => {
  const { activeDrawTool, activeDrawToolRef, activePage, activeSamplePoolId, activeTrainingRecordNoteId, aggregationPrewarmTaskRef, appBootstrapAbortControllerRef, appIsMountedRef, autoplayBarsPerSec, bars, barsOffset, barsOffsetRef, barsRef, barsTimeZone, barsTotal, barsTotalRef, barsTsMs, barsTsMsRef, buyAmountInput, buyLotInput, buyPriceMode, buyRatioInput, buyRatioPresetInputs, buyTradeInputMode, canPersistUiSettings, chartReady, chartRef, chartRenderMode, cleanupHistoryProjectRequests, clearingLocalDataSourcesProgressPercent, clearingLocalDataSourcesProgressPercentRef, clearingLocalDataSourcesProgressTargetPercent, customPoolNameOverrides, customSamplePools, dataConfigPoolOrderByBase, dataPoolRemovedSymbolsBySourceId, dataSourceSyncPrefsById, drawColor, drawLineType, drawLineWidth, drawMagnet, drawToolByScopePageRef, drawingOverlayIdRef, drawingStoreRef, ensureBarsBackwardAbortControllerRef, ensureBarsForwardAbortControllerRef, fontSizePreset, globalResetProgressHideTimerRef, globalResetProgressPercent, globalResetProgressPercentRef, globalResetProgressTargetPercent, hiddenBuiltInTradingMarketPresetIds, historySamplePoolFilter, includeSystemDefaultPool, isGlobalResetInProgressRef, isGlobalResetProgressVisible, language, languageSource, lastDrawToolScopePageRef, lotSizeByPool, mainNativeIndicator, mainNativeIndicatorParams, noticeDialog, pendingDrawingRebuildPeriodRef, priceColorMode, rearmTimerRef, replayNotes, selectedDrawingId, selectedDrawingIdRef, sellAmountInput, sellLotInput, sellPriceMode, sellRatioInput, sellRatioPresetInputs, sellTradeInputMode, sessionId, sessionNameFormat, setActiveDrawTool, setActiveTrainingRecordNoteId, setAllDrawingsVisible, setChartNoteHover, setClearingLocalDataSourcesProgressPercent, setDrawingCount, setGlobalResetProgressPercent, setMainNativeIndicator, setMainNativeIndicatorParams, setNoticeCountdownMs, setNoticeDialog, setPendingRestoreDrawings, setSelectedDataIndex, setSelectedDrawingId, setSelectedHistoryProjectId, setSelectedReplayNoteId, setShowShortcutModal, setSignalBottomIndicator, setSignalBottomIndicatorParams, setSignalTopIndicator, setSignalTopIndicatorParams, setSystemThemeMode, setViewportLayoutMode, setViewportScale, showChartSettingsModal, showDrawingsAcrossPeriods, showGlobalDecimals, showShortcutModal, showTrainerSubIndicators, showTrainerSubIndicatorsRef, signalBottomIndicator, signalBottomIndicatorParams, signalBottomParamsRef, signalBottomRef, signalTopIndicator, signalTopIndicatorParams, signalTopParamsRef, signalTopRef, snapshot, snapshotAbortControllerRef, snapshotRef, symbolLoadAbortControllerRef, systemPoolNameOverrides, systemPoolTradingBindingById, systemThemeMode, themeMode, tradeColorTheme, tradeMarkerDensityRatio, tradingAssetClass, tradingMarketPresetCustomTemplates, tradingMarketPresetKey, tradingMarketPresetLabelOverridesById, tradingMarketPresetValuesByKey, trainerAggregationCacheRef, trainerAggregationTailCacheRef, trainerDisplayPeriod, trainingProjects, tt, viewportScale } = scope;
  const sessionIdRef = scope.sessionIdRef as MutableRefObject<string | null>;
useRuntimeProgressAndLifecycleEffects({
    appIsMountedRef,
    globalResetProgressHideTimerRef,
    isGlobalResetProgressVisible,
    globalResetProgressPercent,
    globalResetProgressTargetPercent,
    globalResetProgressPercentRef,
    setGlobalResetProgressPercent,
    clearingLocalDataSourcesProgressPercent,
    clearingLocalDataSourcesProgressTargetPercent,
    clearingLocalDataSourcesProgressPercentRef,
    setClearingLocalDataSourcesProgressPercent,
    appBootstrapAbortControllerRef,
    aggregationPrewarmTaskRef,
    ensureBarsForwardAbortControllerRef,
    ensureBarsBackwardAbortControllerRef,
    snapshotAbortControllerRef,
    symbolLoadAbortControllerRef,
    cleanupHistoryProjectRequests,
  });
  const ui = useMemo(() => getUiLabels(language), [language]);
  const tradingSettingsText = useMemo(() => getTradingSettingsText(language), [language]);
  const { compactScriptLanguage, withLabelValue, withCountUnit, withBuySellCount } = useLocalizedDisplayTextModel(language);
  const {
    replaySettingsDensityOptions,
    replaySettingsStampDutyOptions,
    replaySettingsFreeReplayEndSettlementModeOptions,
    replaySettingsSettlementModeOptions,
    replaySettingsAssetClassOptions,
    replaySettingsPositionCostOptions,
    replaySettingsTradeAmountOptions,
    replaySettingsAllowLongOptions,
    replaySettingsAllowShortOptions,
  } = useReplaySettingsViewModel({
    language,
    tradingAssetClass,
    tradeMarkerDensityLevelSuffix: ui.tradeMarkerDensityLevelSuffix,
  });
  const { drawToolLabels, drawToolOptions, drawShortcutToolByKey, drawShortcutItems, drawTooltipByTool } = useDrawToolModel({
    language,
    chartReady,
  });
  const { customIndicatorProfileVersionToken } = useCustomIndicatorProfileVersionState();
  const {
    mainIndicatorSelectOptions,
    groupedSignalIndicatorSelectOptions,
    supportedIndicatorNameSet,
  } = useTrainerIndicatorOptionsModel({
    language,
    chartReady,
    customIndicatorProfileVersionToken,
    indicatorGroupSystemDefaultLabel: ui.indicatorGroupSystemDefault,
    indicatorGroupCustomLabel: ui.indicatorGroupCustom,
  });
  const effectiveThemeMode = themeMode === "system" ? systemThemeMode : themeMode;
  useEffect(() => {
    api.setDesktopSecondaryWindowVisualContext({
      language,
      themeMode,
      resolvedThemeMode: effectiveThemeMode,
      fontSizePreset,
      showGlobalDecimals,
      priceColorMode,
      tradeColorTheme,
    });
  }, [
    effectiveThemeMode,
    fontSizePreset,
    language,
    priceColorMode,
    showGlobalDecimals,
    themeMode,
    tradeColorTheme,
  ]);
  const localeWidthProfile = useMemo(
    () => resolveLocaleWidthProfile(language),
    [language],
  );
  const typographySystem = useMemo(
    () =>
      setGlobalTypographyContext({
        language,
        fontSizePreset,
      }),
    [fontSizePreset, language],
  );
  const appRootStyle = useMemo(
    () =>
      ({
        "--viewport-scale": viewportScale.toFixed(4),
        ...typographySystem.cssVariables,
        ...buildGlobalVisualCssVariables(effectiveThemeMode, priceColorMode, tradeColorTheme),
      }) as CSSProperties,
    [
      effectiveThemeMode,
      priceColorMode,
      tradeColorTheme,
      typographySystem,
      viewportScale,
    ],
  );
  const trainerResponsiveChartEdgeConfig = useMemo(() => resolveResponsiveChartEdgeConfig(TRAINER_CHART_EDGE_CONFIG, viewportScale), [viewportScale]);
  const trainerChartChangeBubbleRight = useMemo(() => resolveChartChangeBubbleRight(trainerResponsiveChartEdgeConfig), [trainerResponsiveChartEdgeConfig]);
  const applyTrainerMaxOffsetRightDistance = useCallback(
    (chart: Chart) => {
      chart.setMaxOffsetRightDistance(resolveMaxOffsetRightDistanceByVisibleBars(chart, trainerResponsiveChartEdgeConfig, 50));
    },
    [trainerResponsiveChartEdgeConfig],
  );
  const tradeMarkerDensityLevel = useMemo(() => resolveTradeMarkerDensityLevel(tradeMarkerDensityRatio), [tradeMarkerDensityRatio]);
  const shellNavigationLabels = useMemo(
    () => ({
      navGroupCommand: formatMessage(language, "shell.navigation.group.command"),
      navTrainingCommandCenter: formatMessage(
        language,
        "shell.navigation.item.commandCenter",
      ),
      navGroupTraining: formatMessage(
        language,
        "shell.navigation.group.training",
      ),
      navGroupReview: formatMessage(
        language,
        "shell.navigation.group.advanced",
      ),
      navGroupReflection: formatMessage(
        language,
        "shell.navigation.group.reflection",
      ),
      navGroupTools: formatMessage(language, "shell.navigation.group.tools"),
      navTrainer: formatMessage(language, "shell.navigation.item.trainer"),
      navHistory: formatMessage(language, "shell.navigation.item.history"),
      navStats: ui.navStats,
      navSpecialTraining: formatMessage(
        language,
        "shell.navigation.item.specialTraining",
      ),
      navChallengeStats: formatMessage(
        language,
        "shell.navigation.item.challengeStats",
      ),
      navNotes: formatMessage(language, "shell.navigation.item.notes"),
      navCustomIndicator: formatMessage(
        language,
        "shell.navigation.item.customIndicator",
      ),
      navStrategyBacktest: formatMessage(
        language,
        "uiLabels.ui.navStrategyBacktest",
      ),
      navDataConfig: formatMessage(language, "shell.navigation.item.data"),
      navSettings: formatMessage(language, "shell.navigation.item.settings"),
    }),
    [language, ui.navStats],
  );
  const { showNotice } = useAppNoticeController({
    noticeDialog,
    setNoticeDialog,
    setNoticeCountdownMs,
    resolveDefaultNoticeTitle: () => tt("appText.notice"),
  });
  useEffect(() => {
    return subscribeToGlobalNoticeDialog((nextNotice) => {
      if (!nextNotice) {
        return;
      }
      setNoticeDialog({
        ...nextNotice,
        title:
          String(nextNotice.title || "").trim() ||
          (nextNotice.severity === "error" ? tt("appText.request") : tt("appText.notice")),
      });
    });
  }, [setNoticeDialog, tt]);
  useChartGlobalDisplaySync({
    showGlobalDecimals,
    priceColorMode,
    tradeColorTheme,
    language,
    fontSizePreset,
  });
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
    void api.syncNativeDesktopUiLanguage(language).catch(() => undefined);
  }, [language]);
  useIndicatorSelectionGuards({
    noneValue: INDICATOR_NONE_VALUE,
    mainNativeIndicator,
    mainIndicatorSelectOptions,
    setMainNativeIndicator,
    setMainNativeIndicatorParams,
    signalTopIndicator,
    setSignalTopIndicator,
    setSignalTopIndicatorParams,
    signalBottomIndicator,
    setSignalBottomIndicator,
    setSignalBottomIndicatorParams,
    supportedIndicatorNameSet,
  });
  const {
    mainIndicatorParamChanged,
    topIndicatorParamChanged,
    bottomIndicatorParamChanged,
    resetMainIndicatorParams,
    resetTopIndicatorParams,
    resetBottomIndicatorParams,
  } = useChartIndicatorSettingsBaseline({
    showChartSettingsModal,
    mainNativeIndicator,
    mainNativeIndicatorParams,
    signalTopIndicator,
    signalTopIndicatorParams,
    signalBottomIndicator,
    signalBottomIndicatorParams,
    setMainNativeIndicatorParams,
    setSignalTopIndicatorParams,
    setSignalBottomIndicatorParams,
  });
  useAppViewportAndSystemTheme({
    setSystemThemeMode,
    setViewportScale,
    setViewportLayoutMode,
  });
  useRuntimeTrainerRefSyncEffects({
    activePage,
    chartRef,
    activeDrawTool,
    setActiveDrawTool,
    activeDrawToolRef,
    drawToolByScopePageRef,
    lastDrawToolScopePageRef,
    drawingOverlayIdRef,
    rearmTimerRef,
    bars,
    barsTsMs,
    barsRef,
    barsTsMsRef,
    trainerAggregationCacheRef,
    trainerAggregationTailCacheRef,
    barsOffset,
    barsOffsetRef,
    barsTotal,
    barsTotalRef,
    snapshot,
    snapshotRef,
    trainingProjects,
    setSelectedHistoryProjectId,
    replayNotes,
    setSelectedReplayNoteId,
    activeTrainingRecordNoteId,
    setActiveTrainingRecordNoteId,
    setChartNoteHover,
    sessionId,
    sessionIdRef,
    setSelectedDataIndex,
    pendingDrawingRebuildPeriodRef,
    drawingStoreRef,
    setPendingRestoreDrawings,
    setSelectedDrawingId,
    setAllDrawingsVisible,
    setDrawingCount,
    selectedDrawingId,
    selectedDrawingIdRef,
    signalTopIndicator,
    signalBottomIndicator,
    signalTopIndicatorParams,
    signalBottomIndicatorParams,
    signalTopRef,
    signalBottomRef,
    signalTopParamsRef,
    signalBottomParamsRef,
    showTrainerSubIndicators,
    showTrainerSubIndicatorsRef,
  });
  const getCachedTrainerAggregatedBars = useRuntimeTrainerAggregationCache({
    barsRef,
    barsTsMsRef,
    trainerAggregationCacheRef,
    trainerAggregationTailCacheRef,
    barsTimeZone,
  });
  const buildUiSettingsForPersist = useCallback((): UiSettings => {
    return {
      language,
      languageSource,
      themeMode,
      priceColorMode,
      tradeColorTheme,
      chartRenderMode,
      fontSizePreset,
      sessionNameFormat,
      trainerDisplayPeriod,
      showGlobalDecimals,
      showDesktopHelpLauncher: scope.showDesktopHelpLauncher,
      showDrawingsAcrossPeriods,
      developerModeEnabled: scope.developerModeEnabled === true,
      desktopCloseButtonAction: scope.desktopCloseButtonAction,
      onboardingTourStatus: resolveDesktopOnboardingPersistedTourStatus(
        scope.onboardingTourStatus,
      ),
      onboardingTourStep: scope.onboardingTourStep,
      tradeMarkerDensityRatio,
      tradingAssetClass,
      tradingMarketPresetKey,
      tradingMarketPresetValuesByKey,
      tradingMarketPresetCustomTemplates,
      tradingMarketPresetLabelOverridesById,
      hiddenBuiltInTradingMarketPresetIds,
      mainNativeIndicator,
      mainNativeIndicatorParams,
      signalTopIndicator,
      signalTopIndicatorParams,
      signalBottomIndicator,
      signalBottomIndicatorParams,
      includeSystemDefaultPool,
      systemPoolNameOverrides,
      customPoolNameOverrides,
      freeReplayPoolDefaultEnvironmentById: systemPoolTradingBindingById,
      dataConfigPoolOrderByBase,
      dataSourceSyncPrefsById,
      activeSamplePoolId,
      historySamplePoolFilter,
      drawLineWidth,
      drawLineType,
      drawColor,
      drawMagnet,
      autoplayBarsPerSec,
      buyTradeInputMode,
      buyLotInput,
      buyAmountInput,
      buyRatioPresetInputs,
      buyRatioInput,
      buyPriceMode,
      sellTradeInputMode,
      sellLotInput,
      sellAmountInput,
      sellRatioPresetInputs,
      sellRatioInput,
      sellPriceMode,
      lotSizeByPool,
    };
  }, [
    activeSamplePoolId,
    autoplayBarsPerSec,
    buyAmountInput,
    buyLotInput,
    buyPriceMode,
    buyRatioInput,
    buyRatioPresetInputs,
    buyTradeInputMode,
    customSamplePools,
    customPoolNameOverrides,
    chartRenderMode,
    dataSourceSyncPrefsById,
    scope.desktopCloseButtonAction,
    scope.developerModeEnabled,
    drawColor,
    drawLineType,
    drawLineWidth,
    drawMagnet,
    fontSizePreset,
    historySamplePoolFilter,
    hiddenBuiltInTradingMarketPresetIds,
    includeSystemDefaultPool,
    language,
    languageSource,
    lotSizeByPool,
    mainNativeIndicator,
    mainNativeIndicatorParams,
    scope.onboardingTourStatus,
    scope.onboardingTourStep,
    dataConfigPoolOrderByBase,
    priceColorMode,
    tradeColorTheme,
    sellAmountInput,
    sellLotInput,
    sellPriceMode,
    sellRatioInput,
    sellRatioPresetInputs,
    sellTradeInputMode,
    sessionNameFormat,
    scope.showDesktopHelpLauncher,
    showDrawingsAcrossPeriods,
    showGlobalDecimals,
    signalBottomIndicator,
    signalBottomIndicatorParams,
    signalTopIndicator,
    signalTopIndicatorParams,
    systemPoolNameOverrides,
    systemPoolTradingBindingById,
    themeMode,
    tradeMarkerDensityRatio,
    tradingAssetClass,
    tradingMarketPresetKey,
    tradingMarketPresetValuesByKey,
    tradingMarketPresetCustomTemplates,
    trainerDisplayPeriod,
  ]);
  const { cancelPendingUiSettingsPersist } = useRuntimeAppPersistence({
    language,
    languageSource,
    themeMode,
    tt,
    buildUiSettings: buildUiSettingsForPersist,
    dataPoolRemovedSymbolsBySourceId,
    isGlobalResetInProgressRef,
    canPersistUiSettings,
    persistInitialUiSettings: scope.onboardingTourStatus === "ACTIVE",
  });

  useShortcutModalEscape({
    showShortcutModal,
    setShowShortcutModal,
  });
  return { appRootStyle, applyTrainerMaxOffsetRightDistance, bottomIndicatorParamChanged, buildUiSettingsForPersist, cancelPendingUiSettingsPersist, compactScriptLanguage, customIndicatorProfileVersionToken, drawShortcutItems, drawShortcutToolByKey, drawToolLabels, drawToolOptions, drawTooltipByTool, effectiveThemeMode, getCachedTrainerAggregatedBars, groupedSignalIndicatorSelectOptions, localeWidthProfile, mainIndicatorParamChanged, mainIndicatorSelectOptions, replaySettingsAllowLongOptions, replaySettingsAllowShortOptions, replaySettingsAssetClassOptions, replaySettingsDensityOptions, replaySettingsFreeReplayEndSettlementModeOptions, replaySettingsPositionCostOptions, replaySettingsSettlementModeOptions, replaySettingsStampDutyOptions, replaySettingsTradeAmountOptions, resetBottomIndicatorParams, resetMainIndicatorParams, resetTopIndicatorParams, shellNavigationLabels, showNotice, supportedIndicatorNameSet, topIndicatorParamChanged, tradeMarkerDensityLevel, tradingSettingsText, trainerChartChangeBubbleRight, trainerResponsiveChartEdgeConfig, typographySystem, ui, withBuySellCount, withCountUnit, withLabelValue };
};
