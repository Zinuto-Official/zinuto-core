// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo } from "react";
import { formatRatio, parseNumeric } from "@/ui/formatting/format";
import { useAppTradingMarketPresetSelectionActions } from "@/app-shell/useAppTradingMarketPresetSelectionActions";
import {
  listSupportedTimeZones} from "@zinuto/shared/timezone";
import {
  type UiSettings,
} from "@/frontend-kernel/appTypes";
import {
  buildDefaultSystemPoolTradingBindingById,
} from "@/app-shell/appRootPoolTradingBinding";
import {
  getDisplayPeriodLabel,
} from "@/ui/config/uiConfig";
import {
  SAMPLE_POOL_ALL_ID,
} from "@/domains/trainer/samplePools";
import { DEFAULT_TRADING_SETTINGS_FORM_VALUES } from "@/domains/trainer/tradingSettingsFormDomain";
import {
  ADD_TRADING_FEE_TEMPLATE_OPTION_ID,
  DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS,
  DEFAULT_TRADING_MARKET_PRESET_ID,
  DEFAULT_TRADING_MARKET_PRESET_VALUES_BY_ID,
  areTradingMarketPresetValuesEqual,
  type BuiltInTradingMarketPresetId,
  type TradingCustomFeeTemplateMeta,
  type TradingAssetClassId,
  type TradingMarketPresetId,
  type TradingMarketPresetValues,
} from "@/domains/trainer/tradingMarketPresets";
import {
  type FreeReplayAssetClass,
} from "@/domains/trainer/freeReplaySetup";
import { useTrainerChartWorkspaceSection } from "@/domains/trainer/useTrainerChartWorkspaceSection";
import { useTrainerChartWorkspaceSectionArgs } from "@/app-shell/runtime/useTrainerChartWorkspaceArgs";
import type { useRuntimeStartupState } from "@/app-shell/runtime/runtimeStartupState";
import type { useRuntimeStartupHistoryState } from "@/app-shell/runtime/runtimeStartupHistoryState";
import type { useRuntimeStartupPersistence } from "@/app-shell/runtime/runtimeStartupPersistence";
import type { useRuntimeTrainerChartSession } from "@/app-shell/runtime/runtimeTrainerChartSession";
import type { useRuntimeTrainerMarketSettings } from "@/app-shell/runtime/runtimeTrainerMarketSettings";
import type { useRuntimeTrainerPoolChartPipeline } from "@/app-shell/runtime/runtimeTrainerPoolChartPipeline";
import type { useRuntimeTrainerChartOrchestration } from "@/app-shell/runtime/runtimeTrainerChartOrchestration";
import type { useRuntimeFreeReplaySetup } from "@/app-shell/runtime/runtimeFreeReplaySetup";
import type { useRuntimeFreeReplayExecution } from "@/app-shell/runtime/runtimeFreeReplayExecution";
import type { useRuntimeTradingSettingsAndImport } from "@/app-shell/runtime/runtimeTradingSettingsAndImport";
import type { useRuntimeDataResetNavigation } from "@/app-shell/runtime/runtimeDataResetNavigation";
import type { useRuntimeNoteEditorAndShortcuts } from "@/app-shell/runtime/runtimeNoteEditorAndShortcuts";
type RuntimeHookScope = AppRootRuntimeProps & ReturnType<typeof useRuntimeStartupState> & ReturnType<typeof useRuntimeStartupHistoryState> & ReturnType<typeof useRuntimeStartupPersistence> & ReturnType<typeof useRuntimeTrainerChartSession> & ReturnType<typeof useRuntimeTrainerMarketSettings> & ReturnType<typeof useRuntimeTrainerPoolChartPipeline> & ReturnType<typeof useRuntimeTrainerChartOrchestration> & ReturnType<typeof useRuntimeFreeReplaySetup> & ReturnType<typeof useRuntimeFreeReplayExecution> & ReturnType<typeof useRuntimeTradingSettingsAndImport> & ReturnType<typeof useRuntimeDataResetNavigation> & ReturnType<typeof useRuntimeNoteEditorAndShortcuts> & Record<string, unknown>;

export type AppRootRuntimeProps = {
  initialUiSettings: UiSettings;
  initialDataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
  canPersistUiSettings: boolean;
};





export const useRuntimeWorkspaceProps = (scope: RuntimeHookScope) => {
  const { activeDrawTool, activeSamplePoolSelectValue, allDrawingsVisible, allowLongMarginTrading, allowShortSelling, anchorToolbarNode, autoplayBarsPerSec, bars, bindChartDomRef, chartRenderMode, clearDrawings, commissionMinimumFeeInput, commissionRateInput, contractMultiplierInput, createTrainingRecordReplayNote, drawColor, drawColors, drawLineType, drawLineWidth, drawMagnet, drawToolLabels, drawToolOptions, drawTooltipByTool, drawingCount, freeReplayPrepConfig, fundingRateInput, handleDrawToolSelect, handleFreeReplayPrepEnvironmentAssetClassChangeBase, hasNextBar, isAutoplay, isBusy, isFreeReplayPrepMode, isTradingMarketPresetAvailableInAssetClass, isTrainingSymbolLocked, klineRemainingLine, language, listVisibleBuiltInTradingMarketPresetIdsByAssetClass, longFinancingAnnualRateInput, longInitialMarginRatioInput, longMaintenanceMarginRatioInput, makerFeeRateInput, minTradeStepInput, openChartSettingsModal, pickRandomSymbolOption, platformFeeMinimumFeeInput, platformFeeRateInput, pnlClass, readonlySamplePoolText, readonlySymbolText, regulatoryFeeRateInput, replayEmptyWatermarkText, resolveFallbackTradingMarketPresetId, resolveTradingMarketPresetLabel, resolveTradingMarketPresetValuesForAssetClass, selectSamplePoolOption, selectSymbolOption, selectedInstrumentId, sessionId, setAllowLongMarginTrading, setAllowShortSelling, setAutoplayBarsPerSec, setChartRenderMode, setCommissionMinimumFeeInput, setCommissionRateInput, setContractMultiplierInput, setDrawColor, setDrawLineType, setDrawLineWidth, setDrawMagnet, setFreeReplayPrepEnvironmentPresetId, setFundingRateInput, setHiddenBuiltInTradingMarketPresetIds, setLongFinancingAnnualRateInput, setLongInitialMarginRatioInput, setLongMaintenanceMarginRatioInput, setMakerFeeRateInput, setMinTradeStepInput, setPlatformFeeMinimumFeeInput, setPlatformFeeRateInput, setRegulatoryFeeRateInput, setShortBorrowAnnualRateInput, setShortInitialMarginRatioInput, setShortMaintenanceMarginRatioInput, setShowTrainerSubIndicators, setSignalBottomIndicator, setSignalBottomIndicatorParams, setSignalTopIndicator, setSignalTopIndicatorParams, setSlippageRateInput, setStampDutyMode, setStampDutyRateInput, setSystemPoolTradingBindingById, setTakerFeeRateInput, setTradeSettlementMode, setTradingAssetClass, setTradingMarketPresetCustomTemplates, setTradingMarketPresetKey, setTradingMarketPresetLabelOverridesById, setTradingMarketPresetValuesByKey, setTransactionLevyMinimumFeeInput, setTransactionLevyRateInput, setTransferFeeRateInput, shortBorrowAnnualRateInput, shortInitialMarginRatioInput, shortMaintenanceMarginRatioInput, showChartSettingsModal, showTrainerSubIndicators, signalBottomIndicator, signalBottomIndicatorParams, signalTopIndicator, signalTopIndicatorParams, slippageRateInput, snapshot, stampDutyMode, stampDutyRateInput, symbolSelectLabels, symbolSelectOptions, systemPoolTradingBindingById, takerFeeRateInput, toggleAllDrawingVisible, toggleAutoplay, tradeSettlementMode, tradingAssetClass, tradingMarketPresetCustomTemplates, tradingMarketPresetKey, tradingSettingsDraftParseResult, trainerBaseTimeframe, trainerChartChangeBubbleRight, trainerChartIndicatorQuickMenu, trainerDisplayPeriod, trainerPeriodOptions, trainerSamplePoolOptions, transactionLevyMinimumFeeInput, transactionLevyRateInput, transferFeeRateInput, tt, ui, workspaceSelectedBarChange } = scope;
  const { requestTrainerDisplayPeriodChange } = scope;
  const { bindSpecialTrainingChartDomRef } = scope;
  const trainerChartWorkspaceArgs = useTrainerChartWorkspaceSectionArgs({
    ui,
    tt,
    language,
    isDrawingToolbarDisabled: isFreeReplayPrepMode,
    isTrainingSymbolLocked,
    activeSamplePoolSelectValue,
    readonlySamplePoolText,
    selectSamplePoolOption,
    trainerSamplePoolOptions,
    samplePoolAllId: SAMPLE_POOL_ALL_ID,
    activeToolbarSymbolValue: selectedInstrumentId || snapshot?.session.instrument_id || "",
    readonlySymbolText,
    selectSymbolOption,
    pickRandomSymbolOption,
    symbolSelectOptions,
    symbolSelectLabels,
    hideSymbolIdentity: !isFreeReplayPrepMode && freeReplayPrepConfig.hideSymbolName,
    hiddenSymbolLabel: ui.freeReplayBlindBoxActive,
    sessionId,
    isBusy,
    autoplayBarsPerSec,
    setAutoplayBarsPerSec,
    isAutoplay,
    toggleAutoplay,
    hasProgressWarning: Boolean(snapshot && bars.length && !hasNextBar),
    klineRemainingLine,
    anchorToolbarNode,
    activeDrawTool,
    drawToolOptions,
    drawToolLabels,
    drawTooltipByTool,
    handleDrawToolSelect,
    drawColors,
    drawColor,
    setDrawColor,
    drawLineWidth,
    setDrawLineWidth,
    drawMagnet,
    setDrawMagnet,
    drawLineType,
    setDrawLineType,
    drawingCount,
    allDrawingsVisible,
    toggleAllDrawingVisible,
    clearDrawings,
    createTrainingRecordReplayNote,
    bindChartDomRef,
    showChartSettingsModal,
    openChartSettingsModal,
    indicatorQuickMenu: trainerChartIndicatorQuickMenu,
    chartRenderMode,
    setChartRenderMode,
    trainerPeriodOptions,
    trainerDisplayPeriod,
    setTrainerDisplayPeriod: requestTrainerDisplayPeriodChange,
    getDisplayPeriodLabel,
    trainerBaseTimeframe,
    showTrainerSubIndicators,
    setShowTrainerSubIndicators,
    signalTopIndicator,
    setSignalTopIndicator,
    signalTopIndicatorParams,
    setSignalTopIndicatorParams,
    signalBottomIndicator,
    setSignalBottomIndicator,
    signalBottomIndicatorParams,
    setSignalBottomIndicatorParams,
    replayEmptyWatermarkText,
    selectedBarChange: workspaceSelectedBarChange,
    formatRatio,
    pnlClass,
    trainerChartChangeBubbleRight,
  });

  const {
    sharedTrainerChartWorkspaceProps: trainerChartWorkspaceSharedProps,
    trainerKlineSourceProgressLine,
    trainerChartWorkspaceLayout,
  } = useTrainerChartWorkspaceSection(trainerChartWorkspaceArgs);
  const sharedTrainerChartWorkspaceProps = useMemo(
    () => ({
      ...trainerChartWorkspaceSharedProps,
      chartDomRef: bindSpecialTrainingChartDomRef,
    }),
    [bindSpecialTrainingChartDomRef, trainerChartWorkspaceSharedProps],
  );
  const isReplaySettingsSaveDisabled = !tradingSettingsDraftParseResult.ok;
  const shouldUseDefaultPositiveInput = (value: string): boolean => {
    const parsed = parseNumeric(String(value ?? "").trim());
    return !(parsed > 0);
  };
  const handleAllowShortSellingChange = useCallback(
    (next: boolean) => {
      setAllowShortSelling(next);
      if (!next) {
        return;
      }
      if (shouldUseDefaultPositiveInput(shortBorrowAnnualRateInput)) {
        setShortBorrowAnnualRateInput(DEFAULT_TRADING_SETTINGS_FORM_VALUES.shortBorrowAnnualRateInput);
      }
      const nextShortInitial = shouldUseDefaultPositiveInput(shortInitialMarginRatioInput)
        ? parseNumeric(DEFAULT_TRADING_SETTINGS_FORM_VALUES.shortInitialMarginRatioInput)
        : parseNumeric(shortInitialMarginRatioInput);
      if (shouldUseDefaultPositiveInput(shortInitialMarginRatioInput)) {
        setShortInitialMarginRatioInput(DEFAULT_TRADING_SETTINGS_FORM_VALUES.shortInitialMarginRatioInput);
      }
      const shouldUseDefaultShortMaintenance =
        shouldUseDefaultPositiveInput(shortMaintenanceMarginRatioInput) || parseNumeric(shortMaintenanceMarginRatioInput) > nextShortInitial;
      if (shouldUseDefaultShortMaintenance) {
        const defaultShortMaintenance = parseNumeric(DEFAULT_TRADING_SETTINGS_FORM_VALUES.shortMaintenanceMarginRatioInput);
        setShortMaintenanceMarginRatioInput(String(Math.min(defaultShortMaintenance, nextShortInitial)));
      }
    },
    [
      setAllowShortSelling,
      setShortBorrowAnnualRateInput,
      setShortInitialMarginRatioInput,
      setShortMaintenanceMarginRatioInput,
      shortBorrowAnnualRateInput,
      shortInitialMarginRatioInput,
      shortMaintenanceMarginRatioInput,
    ],
  );
  const handleAllowLongMarginTradingChange = useCallback(
    (next: boolean) => {
      setAllowLongMarginTrading(next);
      if (!next) {
        return;
      }
      if (shouldUseDefaultPositiveInput(longFinancingAnnualRateInput)) {
        setLongFinancingAnnualRateInput(DEFAULT_TRADING_SETTINGS_FORM_VALUES.longFinancingAnnualRateInput);
      }
      const nextLongInitial = shouldUseDefaultPositiveInput(longInitialMarginRatioInput)
        ? parseNumeric(DEFAULT_TRADING_SETTINGS_FORM_VALUES.longInitialMarginRatioInput)
        : parseNumeric(longInitialMarginRatioInput);
      if (shouldUseDefaultPositiveInput(longInitialMarginRatioInput)) {
        setLongInitialMarginRatioInput(DEFAULT_TRADING_SETTINGS_FORM_VALUES.longInitialMarginRatioInput);
      }
      const shouldUseDefaultLongMaintenance =
        shouldUseDefaultPositiveInput(longMaintenanceMarginRatioInput) || parseNumeric(longMaintenanceMarginRatioInput) > nextLongInitial;
      if (shouldUseDefaultLongMaintenance) {
        const defaultLongMaintenance = parseNumeric(DEFAULT_TRADING_SETTINGS_FORM_VALUES.longMaintenanceMarginRatioInput);
        setLongMaintenanceMarginRatioInput(String(Math.min(defaultLongMaintenance, nextLongInitial)));
      }
    },
    [
      longFinancingAnnualRateInput,
      longInitialMarginRatioInput,
      longMaintenanceMarginRatioInput,
      setAllowLongMarginTrading,
      setLongFinancingAnnualRateInput,
      setLongInitialMarginRatioInput,
      setLongMaintenanceMarginRatioInput,
    ],
  );
  useEffect(() => {
    if (allowLongMarginTrading !== true) {
      return;
    }
    if (shouldUseDefaultPositiveInput(longFinancingAnnualRateInput)) {
      setLongFinancingAnnualRateInput(DEFAULT_TRADING_SETTINGS_FORM_VALUES.longFinancingAnnualRateInput);
    }
    const nextLongInitial = shouldUseDefaultPositiveInput(longInitialMarginRatioInput)
      ? parseNumeric(DEFAULT_TRADING_SETTINGS_FORM_VALUES.longInitialMarginRatioInput)
      : parseNumeric(longInitialMarginRatioInput);
    if (shouldUseDefaultPositiveInput(longInitialMarginRatioInput)) {
      setLongInitialMarginRatioInput(DEFAULT_TRADING_SETTINGS_FORM_VALUES.longInitialMarginRatioInput);
    }
    const shouldUseDefaultLongMaintenance =
      shouldUseDefaultPositiveInput(longMaintenanceMarginRatioInput) || parseNumeric(longMaintenanceMarginRatioInput) > nextLongInitial;
    if (shouldUseDefaultLongMaintenance) {
      const defaultLongMaintenance = parseNumeric(DEFAULT_TRADING_SETTINGS_FORM_VALUES.longMaintenanceMarginRatioInput);
      setLongMaintenanceMarginRatioInput(String(Math.min(defaultLongMaintenance, nextLongInitial)));
    }
  }, [allowLongMarginTrading, longFinancingAnnualRateInput, longInitialMarginRatioInput, longMaintenanceMarginRatioInput]);
  const activeTradingMarketPresetValues = useMemo<TradingMarketPresetValues>(
    () => ({
      assetClass: tradingAssetClass,
      tradeSettlementMode,
      minTradeStepInput,
      commissionRateInput,
      makerFeeRateInput,
      takerFeeRateInput,
      fundingRateInput,
      contractMultiplierInput,
      slippageRateInput,
      stampDutyRateInput,
      stampDutyMode,
      transferFeeRateInput,
      regulatoryFeeRateInput,
      commissionMinimumFeeInput,
      transactionLevyRateInput,
      transactionLevyMinimumFeeInput,
      platformFeeRateInput,
      platformFeeMinimumFeeInput,
      longFinancingAnnualRateInput,
      longInitialMarginRatioInput,
      longMaintenanceMarginRatioInput,
      allowLongMarginTrading,
      allowShortSelling,
      shortBorrowAnnualRateInput,
      shortInitialMarginRatioInput,
      shortMaintenanceMarginRatioInput,
    }),
    [
      allowLongMarginTrading,
      allowShortSelling,
      contractMultiplierInput,
      commissionRateInput,
      commissionMinimumFeeInput,
      fundingRateInput,
      longFinancingAnnualRateInput,
      longInitialMarginRatioInput,
      longMaintenanceMarginRatioInput,
      makerFeeRateInput,
      minTradeStepInput,
      platformFeeMinimumFeeInput,
      platformFeeRateInput,
      slippageRateInput,
      shortBorrowAnnualRateInput,
      shortInitialMarginRatioInput,
      shortMaintenanceMarginRatioInput,
      stampDutyMode,
      stampDutyRateInput,
      takerFeeRateInput,
      tradeSettlementMode,
      tradingAssetClass,
      regulatoryFeeRateInput,
      transactionLevyMinimumFeeInput,
      transactionLevyRateInput,
      transferFeeRateInput,
    ],
  );
  const resolveTradingMarketPresetValues = useCallback(
    (presetId: TradingMarketPresetId): TradingMarketPresetValues => resolveTradingMarketPresetValuesForAssetClass(presetId, tradingAssetClass),
    [resolveTradingMarketPresetValuesForAssetClass, tradingAssetClass],
  );
  const applyTradingMarketPresetValues = useCallback(
    (values: TradingMarketPresetValues) => {
      setTradingAssetClass(values.assetClass);
      setTradeSettlementMode(values.tradeSettlementMode);
      setMinTradeStepInput(values.minTradeStepInput);
      setCommissionRateInput(values.commissionRateInput);
      setMakerFeeRateInput(values.makerFeeRateInput);
      setTakerFeeRateInput(values.takerFeeRateInput);
      setFundingRateInput(values.fundingRateInput);
      setContractMultiplierInput(values.contractMultiplierInput);
      setSlippageRateInput(values.slippageRateInput);
      setStampDutyRateInput(values.stampDutyRateInput);
      setStampDutyMode(values.stampDutyMode);
      setTransferFeeRateInput(values.transferFeeRateInput);
      setRegulatoryFeeRateInput(values.regulatoryFeeRateInput);
      setCommissionMinimumFeeInput(values.commissionMinimumFeeInput);
      setTransactionLevyRateInput(values.transactionLevyRateInput);
      setTransactionLevyMinimumFeeInput(values.transactionLevyMinimumFeeInput);
      setPlatformFeeRateInput(values.platformFeeRateInput);
      setPlatformFeeMinimumFeeInput(values.platformFeeMinimumFeeInput);
      setLongFinancingAnnualRateInput(values.longFinancingAnnualRateInput);
      setLongInitialMarginRatioInput(values.longInitialMarginRatioInput);
      setLongMaintenanceMarginRatioInput(values.longMaintenanceMarginRatioInput);
      setAllowLongMarginTrading(values.allowLongMarginTrading);
      setAllowShortSelling(values.allowShortSelling);
      setShortBorrowAnnualRateInput(values.shortBorrowAnnualRateInput);
      setShortInitialMarginRatioInput(values.shortInitialMarginRatioInput);
      setShortMaintenanceMarginRatioInput(values.shortMaintenanceMarginRatioInput);
    },
    [
      setAllowShortSelling,
      setContractMultiplierInput,
      setCommissionMinimumFeeInput,
      setCommissionRateInput,
      setFundingRateInput,
      setLongFinancingAnnualRateInput,
      setLongInitialMarginRatioInput,
      setLongMaintenanceMarginRatioInput,
      setAllowLongMarginTrading,
      setMakerFeeRateInput,
      setMinTradeStepInput,
      setPlatformFeeMinimumFeeInput,
      setPlatformFeeRateInput,
      setRegulatoryFeeRateInput,
      setShortBorrowAnnualRateInput,
      setShortInitialMarginRatioInput,
      setShortMaintenanceMarginRatioInput,
      setSlippageRateInput,
      setStampDutyMode,
      setStampDutyRateInput,
      setTakerFeeRateInput,
      setTradeSettlementMode,
      setTradingAssetClass,
      setTransactionLevyMinimumFeeInput,
      setTransactionLevyRateInput,
      setTransferFeeRateInput,
    ],
  );
  useEffect(() => {
    if (tradingMarketPresetKey === ADD_TRADING_FEE_TEMPLATE_OPTION_ID) {
      setTradingMarketPresetKey(resolveFallbackTradingMarketPresetId(tradingAssetClass));
      return;
    }
    if (isTradingMarketPresetAvailableInAssetClass(tradingMarketPresetKey, tradingAssetClass)) {
      return;
    }
    const fallbackPresetId = resolveFallbackTradingMarketPresetId(tradingAssetClass, {
      excludeId: tradingMarketPresetKey,
    });
    setTradingMarketPresetKey(fallbackPresetId);
    applyTradingMarketPresetValues(resolveTradingMarketPresetValues(fallbackPresetId));
  }, [
    applyTradingMarketPresetValues,
    isTradingMarketPresetAvailableInAssetClass,
    resolveTradingMarketPresetValues,
    resolveFallbackTradingMarketPresetId,
    setTradingMarketPresetKey,
    tradingAssetClass,
    tradingMarketPresetKey,
  ]);
  const selectedTradingMarketPresetValues = useMemo(
    () =>
      tradingMarketPresetKey === ADD_TRADING_FEE_TEMPLATE_OPTION_ID
        ? activeTradingMarketPresetValues
        : resolveTradingMarketPresetValues(tradingMarketPresetKey),
    [activeTradingMarketPresetValues, resolveTradingMarketPresetValues, tradingMarketPresetKey],
  );
  const isTradingMarketPresetDirty = useMemo(
    () =>
      tradingMarketPresetKey !== ADD_TRADING_FEE_TEMPLATE_OPTION_ID &&
      !areTradingMarketPresetValuesEqual(selectedTradingMarketPresetValues, activeTradingMarketPresetValues),
    [activeTradingMarketPresetValues, selectedTradingMarketPresetValues, tradingMarketPresetKey],
  );
  const buildNextTradingCustomTemplateName = useCallback(
    (existing: TradingCustomFeeTemplateMeta[]): string => {
      const namePrefix = tt("appText.template");
      const names = new Set(existing.map((item) => item.name.trim()).filter(Boolean));
      let index = existing.length + 1;
      while (names.has(`${namePrefix}${index}`)) {
        index += 1;
      }
      return `${namePrefix}${index}`;
    },
    [tt],
  );
  const createTradingCustomTemplateId = useCallback((): string => {
    return `custom_fee_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }, []);
  const marketPresetChips = useMemo(() => {
    const usedTradingMarketPresetIdSet = new Set<string>();
    const collectUsedPresetId = (value: string | null | undefined) => {
      const normalized = String(value || "").trim();
      if (!normalized) {
        return;
      }
      usedTradingMarketPresetIdSet.add(normalized);
    };
    Object.values(systemPoolTradingBindingById).forEach((binding) => {
      collectUsedPresetId(binding.marketPresetId);
    });
    const visibleBuiltInPresetIds = listVisibleBuiltInTradingMarketPresetIdsByAssetClass(tradingAssetClass);
    const visibleCustomPresetTemplates = tradingMarketPresetCustomTemplates.filter((item) => item.assetClass === tradingAssetClass);
    const orderedVisiblePresetIds = [...visibleBuiltInPresetIds, ...visibleCustomPresetTemplates.map((item) => item.id)];
    const resolveCanDelete = (presetId: TradingMarketPresetId): boolean => orderedVisiblePresetIds.some((candidateId) => candidateId !== presetId);
    return [
      ...visibleBuiltInPresetIds.map((presetId) => ({
        id: presetId,
        label: resolveTradingMarketPresetLabel(presetId),
        isBuiltIn: true,
        isCustom: false,
        isSelected: presetId === tradingMarketPresetKey,
        isUsedBySamplePool: usedTradingMarketPresetIdSet.has(presetId),
        canDelete: resolveCanDelete(presetId),
      })),
      ...visibleCustomPresetTemplates.map((item, index) => ({
        id: item.id,
        label: resolveTradingMarketPresetLabel(item.id, `${tt("appText.template")}${index + 1}`),
        isBuiltIn: false,
        isCustom: true,
        isSelected: item.id === tradingMarketPresetKey,
        isUsedBySamplePool: usedTradingMarketPresetIdSet.has(item.id),
        canDelete: resolveCanDelete(item.id),
      })),
    ];
  }, [
    listVisibleBuiltInTradingMarketPresetIdsByAssetClass,
    resolveTradingMarketPresetLabel,
    tradingAssetClass,
    tradingMarketPresetCustomTemplates,
    tradingMarketPresetKey,
    systemPoolTradingBindingById,
    tt,
  ]);
  const activeTradingMarketPresetLabel = useMemo(
    () =>
      marketPresetChips.find((item) => item.isSelected)?.label ??
      resolveTradingMarketPresetLabel(DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS[tradingAssetClass] ?? DEFAULT_TRADING_MARKET_PRESET_ID),
    [marketPresetChips, resolveTradingMarketPresetLabel, tradingAssetClass],
  );
  const canSaveTradingMarketPresetToCurrent =
    tradingMarketPresetKey !== ADD_TRADING_FEE_TEMPLATE_OPTION_ID && isTradingMarketPresetDirty;
  const availableTimeZones = useMemo(() => listSupportedTimeZones(), []);
  const resetAllTradingAssetParameters = useCallback(() => {
    const normalizeAssetClassForPreset = (assetClass: TradingAssetClassId): TradingAssetClassId =>
      assetClass === "FUTURES" || assetClass === "FOREX" || assetClass === "CRYPTO" ? assetClass : "STOCK";
    const resolveDefaultPresetId = (assetClass: TradingAssetClassId): BuiltInTradingMarketPresetId =>
      DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS[normalizeAssetClassForPreset(assetClass)] ?? DEFAULT_TRADING_MARKET_PRESET_ID;
    const nextTradingAssetClass = normalizeAssetClassForPreset(tradingAssetClass);
    const nextTradingPresetId = resolveDefaultPresetId(nextTradingAssetClass);
    const nextTradingPresetValues = DEFAULT_TRADING_MARKET_PRESET_VALUES_BY_ID[nextTradingPresetId];

    setTradingMarketPresetValuesByKey({});
    setTradingMarketPresetCustomTemplates([]);
    setTradingMarketPresetLabelOverridesById({});
    setHiddenBuiltInTradingMarketPresetIds([]);

    setSystemPoolTradingBindingById(buildDefaultSystemPoolTradingBindingById());

    setTradingMarketPresetKey(nextTradingPresetId);
    applyTradingMarketPresetValues({
      ...nextTradingPresetValues,
      assetClass: nextTradingAssetClass,
    });
  }, [
    applyTradingMarketPresetValues,
    setHiddenBuiltInTradingMarketPresetIds,
    setSystemPoolTradingBindingById,
    setTradingMarketPresetCustomTemplates,
    setTradingMarketPresetKey,
    setTradingMarketPresetLabelOverridesById,
    setTradingMarketPresetValuesByKey,
    tradingAssetClass,
  ]);
  const {
    createTradingCustomTemplateFromCurrent,
    handleTradingAssetClassChange,
    handleCreateTradingMarketPresetFromCurrent,
    handleTradingMarketPresetKeyChange,
  } = useAppTradingMarketPresetSelectionActions({
    tradingAssetClass,
    activeTradingMarketPresetValues,
    resolveFallbackTradingMarketPresetId,
    resolveTradingMarketPresetValues,
    resolveTradingMarketPresetValuesForAssetClass,
    applyTradingMarketPresetValues,
    createTradingCustomTemplateId,
    buildNextTradingCustomTemplateName,
    setTradingAssetClass,
    setTradingMarketPresetKey,
    setTradingMarketPresetCustomTemplates,
    setTradingMarketPresetValuesByKey,
  });
  const handleFreeReplayPrepEnvironmentAssetClassChange = useCallback(
    (value: FreeReplayAssetClass) => {
      handleFreeReplayPrepEnvironmentAssetClassChangeBase(value);
      setFreeReplayPrepEnvironmentPresetId((current) =>
        isTradingMarketPresetAvailableInAssetClass(current, value)
          ? current
          : resolveFallbackTradingMarketPresetId(value, {
              excludeId: current,
            }),
      );
    },
    [
      handleFreeReplayPrepEnvironmentAssetClassChangeBase,
      isTradingMarketPresetAvailableInAssetClass,
      resolveFallbackTradingMarketPresetId,
      setFreeReplayPrepEnvironmentPresetId,
    ],
  );
  return { activeTradingMarketPresetLabel, activeTradingMarketPresetValues, applyTradingMarketPresetValues, availableTimeZones, buildNextTradingCustomTemplateName, canSaveTradingMarketPresetToCurrent, createTradingCustomTemplateFromCurrent, createTradingCustomTemplateId, handleAllowLongMarginTradingChange, handleAllowShortSellingChange, handleCreateTradingMarketPresetFromCurrent, handleFreeReplayPrepEnvironmentAssetClassChange, handleTradingAssetClassChange, handleTradingMarketPresetKeyChange, isReplaySettingsSaveDisabled, isTradingMarketPresetDirty, marketPresetChips, resetAllTradingAssetParameters, resolveTradingMarketPresetValues, selectedTradingMarketPresetValues, sharedTrainerChartWorkspaceProps, shouldUseDefaultPositiveInput, trainerChartWorkspaceArgs, trainerChartWorkspaceLayout, trainerKlineSourceProgressLine };
};
