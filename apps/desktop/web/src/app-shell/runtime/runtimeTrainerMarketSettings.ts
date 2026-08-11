// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useMemo, type MutableRefObject } from "react";
import {
  api,
} from "@/api";
import { formatMoney } from "@/ui/formatting/format";
import {
  startTrainerPerfSpan,
} from "@/domains/trainer/trainerPerfTrace";
import {
  type UiSettings,
} from "@/frontend-kernel/appTypes";
import { formatRateInput } from "@/frontend-kernel/valueFormat";
import { sanitizeSamplePoolName } from "@/app-shell/appSamplePools";
import {
  resolvePoolTradingBindingByPoolId,
} from "@/app-shell/appRootPoolTradingBinding";
import {
  SAMPLE_POOL_ALL_ID,
  SAMPLE_POOL_UNKNOWN_ID,
  SAMPLE_POOL_UNKNOWN_NAME,
  findBuiltInSamplePoolById,
  resolveBuiltInPoolBySymbol,
} from "@/domains/trainer/samplePools";
import { parseTradingSettingsDraft } from "@/domains/trainer/tradingSettingsFormDomain";
import {
  DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS,
  DEFAULT_TRADING_MARKET_PRESET_ID,
  listBuiltInTradingMarketPresetIdsByAssetClass,
  isTradingMarketPresetInAssetClass,
  isBuiltInTradingMarketPresetId,
  resolveTradingMarketPresetDisplayLabel,
  resolveTradingMarketPresetValuesFromState,
  type TradingAssetClassId,
  type TradingMarketPresetId,
  type TradingMarketPresetValues,
} from "@/domains/trainer/tradingMarketPresets";
import { useTrainerSymbolLoader } from "@/domains/trainer/useTrainerSymbolLoader";
import { DEFAULT_TRADING_SETTINGS } from "@/domains/trainer/defaultTradingSettings";
import type {
  TradingSettings,
} from "@/domains/training/types";
import type { useRuntimeStartupState } from "@/app-shell/runtime/runtimeStartupState";
import type { useRuntimeStartupHistoryState } from "@/app-shell/runtime/runtimeStartupHistoryState";
import type { useRuntimeStartupPersistence } from "@/app-shell/runtime/runtimeStartupPersistence";
import type { useRuntimeTrainerChartSession } from "@/app-shell/runtime/runtimeTrainerChartSession";
type RuntimeHookScope = AppRootRuntimeProps & ReturnType<typeof useRuntimeStartupState> & ReturnType<typeof useRuntimeStartupHistoryState> & ReturnType<typeof useRuntimeStartupPersistence> & ReturnType<typeof useRuntimeTrainerChartSession> & Record<string, unknown>;

export type AppRootRuntimeProps = {
  initialUiSettings: UiSettings;
  initialDataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
  canPersistUiSettings: boolean;
};





export const useRuntimeTrainerMarketSettings = (scope: RuntimeHookScope) => {
  const { allowLongMarginTrading, allowShortSelling, appIsMountedRef, barsOffsetRef, barsRef, barsTotalRef, commissionMinimumFeeInput, commissionRateInput, contractMultiplierInput, customSamplePools, ensureBarsBackwardAbortControllerRef, ensureBarsForwardAbortControllerRef, freeReplayEndSettlementMode, fundingRateInput, hasLiveResumableTrainerSession, hiddenBuiltInTradingMarketPresetIds, includeSystemDefaultPool, initialSecuritiesInput, latestResumableTrainerSession, longFinancingAnnualRateInput, longInitialMarginRatioInput, longMaintenanceMarginRatioInput, makerFeeRateInput, minTradeStepInput, platformFeeMinimumFeeInput, platformFeeRateInput, positionCostMode, refreshLatestResumableTrainerSession, regulatoryFeeRateInput, resolveSamplePoolDisplayName, sessionIdRef, setActivePage, setAllowLongMarginTrading, setAllowShortSelling, setBars, setBarsOffset, setBarsTimeZone, setBarsTotal, setCommissionMinimumFeeInput, setCommissionRateInput, setContractMultiplierInput, setCurrentTrainingBaseTimeframe, setCurrentTrainingMinimumBaseTimeframe, setCurrentTrainingPoolMeta, setError, setFreeReplayEndSettlementMode, setFundingRateInput, setHint, setInitialSecuritiesInput, setIsBusy, setLongFinancingAnnualRateInput, setLongInitialMarginRatioInput, setLongMaintenanceMarginRatioInput, setMakerFeeRateInput, setMinTradeStepInput, setPlatformFeeMinimumFeeInput, setPlatformFeeRateInput, setPositionCostMode, setRegulatoryFeeRateInput, setReplayUnavailableMessage, setSelectedInstrumentId, setSelectedSymbol, setSessionId, setShortBorrowAnnualRateInput, setShortInitialMarginRatioInput, setShortMaintenanceMarginRatioInput, setSlippageRateInput, setSnapshot, setStampDutyMode, setStampDutyRateInput, setTakerFeeRateInput, setTradeAmountIncludesFees, setTradeSettlementMode, setTradingAssetClass, setTradingMarketPresetKey, setTrainerDisplayPeriod, setTrainerHydrationState, setTransactionLevyMinimumFeeInput, setTransactionLevyRateInput, setTransferFeeRateInput, shortBorrowAnnualRateInput, shortInitialMarginRatioInput, shortMaintenanceMarginRatioInput, slippageRateInput, snapshotAbortControllerRef, snapshotRef, snapshotRequestVersionRef, stampDutyMode, stampDutyRateInput, symbolLoadAbortControllerRef, symbolLoadRequestVersionRef, syncActiveTrainingRuntime, systemPoolTradingBindingById, takerFeeRateInput, tradeAmountIncludesFees, tradeSettlementMode, tradingAssetClass, tradingMarketPresetCustomTemplates, tradingMarketPresetKey, tradingMarketPresetLabelOverridesById, tradingMarketPresetValuesByKey, tradingSettingsText, transactionLevyMinimumFeeInput, transactionLevyRateInput, transferFeeRateInput, tt, ttf } = scope;
const hiddenBuiltInTradingMarketPresetIdSet = useMemo(() => new Set(hiddenBuiltInTradingMarketPresetIds), [hiddenBuiltInTradingMarketPresetIds]);
  const activeSessionIdRef = sessionIdRef as MutableRefObject<string | null>;
  const listVisibleBuiltInTradingMarketPresetIdsByAssetClass = useCallback(
    (assetClass: TradingAssetClassId) =>
      listBuiltInTradingMarketPresetIdsByAssetClass(assetClass).filter((presetId) => !hiddenBuiltInTradingMarketPresetIdSet.has(presetId)),
    [hiddenBuiltInTradingMarketPresetIdSet],
  );
  const isTradingMarketPresetAvailableInAssetClass = useCallback(
    (presetId: TradingMarketPresetId, assetClass: TradingAssetClassId): boolean => {
      if (!isTradingMarketPresetInAssetClass(presetId, assetClass, tradingMarketPresetCustomTemplates)) {
        return false;
      }
      if (isBuiltInTradingMarketPresetId(presetId) && hiddenBuiltInTradingMarketPresetIdSet.has(presetId)) {
        return false;
      }
      return true;
    },
    [hiddenBuiltInTradingMarketPresetIdSet, tradingMarketPresetCustomTemplates],
  );
  const resolveFallbackTradingMarketPresetId = useCallback(
    (
      assetClass: TradingAssetClassId,
      options?: {
        excludeId?: string;
      },
    ): TradingMarketPresetId => {
      const excludeId = String(options?.excludeId || "").trim();
      const visibleBuiltInPresetIds = listVisibleBuiltInTradingMarketPresetIdsByAssetClass(assetClass).filter((presetId) => presetId !== excludeId);
      if (visibleBuiltInPresetIds.length > 0) {
        return visibleBuiltInPresetIds[0]!;
      }
      const customPresetId = tradingMarketPresetCustomTemplates.find((item) => item.assetClass === assetClass && item.id !== excludeId)?.id ?? "";
      if (customPresetId) {
        return customPresetId;
      }
      return DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS[assetClass] ?? DEFAULT_TRADING_MARKET_PRESET_ID;
    },
    [listVisibleBuiltInTradingMarketPresetIdsByAssetClass, tradingMarketPresetCustomTemplates],
  );
  const resolveTradingMarketPresetLabel = useCallback(
    (presetId: TradingMarketPresetId, fallbackLabel = ""): string =>
      resolveTradingMarketPresetDisplayLabel({
        presetId,
        builtInLabels: tradingSettingsText.marketPresetLabels,
        customTemplates: tradingMarketPresetCustomTemplates,
        labelOverridesById: tradingMarketPresetLabelOverridesById,
        fallbackLabel,
      }),
    [
      tradingMarketPresetCustomTemplates,
      tradingMarketPresetLabelOverridesById,
      tradingSettingsText.marketPresetLabels,
    ],
  );
  const activeTradingMarketPresetDraftValues = useMemo<TradingMarketPresetValues>(
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
      commissionMinimumFeeInput,
      commissionRateInput,
      contractMultiplierInput,
      fundingRateInput,
      longFinancingAnnualRateInput,
      longInitialMarginRatioInput,
      longMaintenanceMarginRatioInput,
      makerFeeRateInput,
      minTradeStepInput,
      platformFeeMinimumFeeInput,
      platformFeeRateInput,
      regulatoryFeeRateInput,
      shortBorrowAnnualRateInput,
      shortInitialMarginRatioInput,
      shortMaintenanceMarginRatioInput,
      slippageRateInput,
      stampDutyMode,
      stampDutyRateInput,
      takerFeeRateInput,
      tradeSettlementMode,
      tradingAssetClass,
      transactionLevyMinimumFeeInput,
      transactionLevyRateInput,
      transferFeeRateInput,
    ],
  );

  const resolveTradingMarketPresetValuesForAssetClass = useCallback(
    (presetId: TradingMarketPresetId, assetClass: TradingAssetClassId): TradingMarketPresetValues => {
      return resolveTradingMarketPresetValuesFromState({
        presetId,
        assetClass,
        valuesByKey: tradingMarketPresetValuesByKey,
        isPresetAvailable: isTradingMarketPresetAvailableInAssetClass,
        resolveFallbackPresetId: resolveFallbackTradingMarketPresetId,
      });
    },
    [isTradingMarketPresetAvailableInAssetClass, resolveFallbackTradingMarketPresetId, tradingMarketPresetValuesByKey],
  );
  const resolveActiveTradingMarketPresetValuesForEnvironment = useCallback(
    (
      presetId: TradingMarketPresetId,
      assetClass: TradingAssetClassId,
    ): TradingMarketPresetValues =>
      resolveTradingMarketPresetValuesFromState({
        presetId,
        assetClass,
        valuesByKey: tradingMarketPresetValuesByKey,
        isPresetAvailable: isTradingMarketPresetAvailableInAssetClass,
        resolveFallbackPresetId: resolveFallbackTradingMarketPresetId,
        activeDraft: {
          presetId: tradingMarketPresetKey,
          values: activeTradingMarketPresetDraftValues,
        },
      }),
    [
      activeTradingMarketPresetDraftValues,
      isTradingMarketPresetAvailableInAssetClass,
      resolveFallbackTradingMarketPresetId,
      tradingMarketPresetKey,
      tradingMarketPresetValuesByKey,
    ],
  );
  const parseSessionTradingSettingsByEnvironment = useCallback(
    (
      assetClass: TradingAssetClassId,
      marketPresetId: TradingMarketPresetId,
    ) => {
      const targetAssetClass = assetClass;
      const targetMarketPresetId = marketPresetId;
      const presetValues = resolveActiveTradingMarketPresetValuesForEnvironment(
        targetMarketPresetId,
        targetAssetClass,
      );
      return parseTradingSettingsDraft({
        initialSecuritiesInput,
        assetClass: targetAssetClass,
        marketPresetId: targetMarketPresetId,
        minTradeStepInput: presetValues.minTradeStepInput,
        commissionRateInput: presetValues.commissionRateInput,
        makerFeeRateInput: presetValues.makerFeeRateInput,
        takerFeeRateInput: presetValues.takerFeeRateInput,
        fundingRateInput: presetValues.fundingRateInput,
        contractMultiplierInput: presetValues.contractMultiplierInput,
        transferFeeRateInput: presetValues.transferFeeRateInput,
        regulatoryFeeRateInput: presetValues.regulatoryFeeRateInput,
        platformFeeRateInput: presetValues.platformFeeRateInput,
        transactionLevyRateInput: presetValues.transactionLevyRateInput,
        slippageRateInput: presetValues.slippageRateInput,
        stampDutyRateInput: presetValues.stampDutyRateInput,
        commissionMinimumFeeInput: presetValues.commissionMinimumFeeInput,
        platformFeeMinimumFeeInput: presetValues.platformFeeMinimumFeeInput,
        transactionLevyMinimumFeeInput:
          presetValues.transactionLevyMinimumFeeInput,
        longFinancingAnnualRateInput: presetValues.longFinancingAnnualRateInput,
        longInitialMarginRatioInput: presetValues.longInitialMarginRatioInput,
        longMaintenanceMarginRatioInput:
          presetValues.longMaintenanceMarginRatioInput,
        shortBorrowAnnualRateInput: presetValues.shortBorrowAnnualRateInput,
        shortInitialMarginRatioInput: presetValues.shortInitialMarginRatioInput,
        shortMaintenanceMarginRatioInput:
          presetValues.shortMaintenanceMarginRatioInput,
        stampDutyMode: presetValues.stampDutyMode,
        positionCostMode,
        tradeSettlementMode: presetValues.tradeSettlementMode,
        freeReplayEndSettlementMode,
        tradeAmountIncludesFees,
        allowLongMarginTrading: presetValues.allowLongMarginTrading,
        allowShortSelling: presetValues.allowShortSelling,
      });
    },
    [
      freeReplayEndSettlementMode,
      initialSecuritiesInput,
      positionCostMode,
      resolveActiveTradingMarketPresetValuesForEnvironment,
      tradeAmountIncludesFees,
    ],
  );
  const resolveTradingSettingsValidationErrorMessage = useCallback(
    (errorCode: string): string =>
      tt(
        errorCode === "INVALID_INITIAL_SECURITIES"
          ? "appText.initialAmountMustIntegerGreaterThan0"
          : errorCode === "INVALID_MARGIN_RATIO"
            ? "appText.invalidMarginSettingsCheckRatioRangeInitialMaintenance"
            : "appText.rateMustGreaterThanEqual0",
      ),
    [tt],
  );
  const resolveSessionTradingSettingsErrorMessageByEnvironment = useCallback(
    (
      assetClass: TradingAssetClassId,
      marketPresetId: TradingMarketPresetId,
    ): string => {
      const parsed = parseSessionTradingSettingsByEnvironment(
        assetClass,
        marketPresetId,
      );
      return parsed.ok
        ? ""
        : resolveTradingSettingsValidationErrorMessage(parsed.errorCode);
    },
    [
      parseSessionTradingSettingsByEnvironment,
      resolveTradingSettingsValidationErrorMessage,
    ],
  );
  const resolveSessionTradingSettingsByEnvironment = useCallback(
    (
      assetClass: TradingAssetClassId,
      marketPresetId: TradingMarketPresetId,
    ): TradingSettings | undefined => {
      const parsed = parseSessionTradingSettingsByEnvironment(
        assetClass,
        marketPresetId,
      );
      if (parsed.ok) {
        return parsed.payload;
      }

      return undefined;
    },
    [parseSessionTradingSettingsByEnvironment],
  );

  const resolveSessionTradingSettingsByPoolId = useCallback(
    (poolId?: string): TradingSettings | undefined => {
      const normalizedPoolId = String(poolId || "").trim();
      const resolvedPoolBinding =
        normalizedPoolId && normalizedPoolId !== SAMPLE_POOL_ALL_ID
          ? resolvePoolTradingBindingByPoolId({
              poolId: normalizedPoolId,
              fallbackAssetClass: tradingAssetClass,
              fallbackMarketPresetId: tradingMarketPresetKey,
              customSamplePools,
              systemPoolTradingBindingById,
              tradingMarketPresetCustomTemplates,
            })
          : {
              assetClass: tradingAssetClass,
              marketPresetId: tradingMarketPresetKey,
            };
      const targetAssetClass = resolvedPoolBinding.assetClass;
      const targetMarketPresetId = resolvedPoolBinding.marketPresetId;
      return resolveSessionTradingSettingsByEnvironment(
        targetAssetClass,
        targetMarketPresetId,
      );
    },
    [
      customSamplePools,
      resolveSessionTradingSettingsByEnvironment,
      systemPoolTradingBindingById,
      tradingAssetClass,
      tradingMarketPresetCustomTemplates,
      tradingMarketPresetKey,
    ],
  );
  const applyResolvedTradingSettingsToForm = useCallback(
    (settings: TradingSettings) => {
      setInitialSecuritiesInput(formatMoney(settings.initialSecuritiesBalance, 0));
      setTradingAssetClass(settings.assetClass);
      setTradingMarketPresetKey(settings.marketPresetId);
      setMinTradeStepInput(formatRateInput(settings.minTradeStep));
      setCommissionRateInput(formatRateInput(settings.commissionRate));
      setMakerFeeRateInput(formatRateInput(settings.makerFeeRate));
      setTakerFeeRateInput(formatRateInput(settings.takerFeeRate));
      setFundingRateInput(formatRateInput(settings.fundingRate));
      setContractMultiplierInput(formatRateInput(settings.contractMultiplier));
      setTransferFeeRateInput(formatRateInput(settings.transferFeeRate));
      setRegulatoryFeeRateInput(formatRateInput(settings.regulatoryFeeRate));
      setPlatformFeeRateInput(formatRateInput(settings.platformFeeRate));
      setTransactionLevyRateInput(formatRateInput(settings.transactionLevyRate));
      setSlippageRateInput(formatRateInput(settings.slippageRate));
      setStampDutyRateInput(formatRateInput(settings.stampDutyRate));
      setCommissionMinimumFeeInput(formatRateInput(settings.commissionMinimumFee));
      setPlatformFeeMinimumFeeInput(formatRateInput(settings.platformFeeMinimumFee));
      setTransactionLevyMinimumFeeInput(formatRateInput(settings.transactionLevyMinimumFee));
      setLongFinancingAnnualRateInput(
        formatRateInput(
          Number.isFinite(Number(settings.longFinancingAnnualRate)) ? settings.longFinancingAnnualRate : DEFAULT_TRADING_SETTINGS.longFinancingAnnualRate,
        ),
      );
      setLongInitialMarginRatioInput(
        formatRateInput(
          Number.isFinite(Number(settings.longInitialMarginRatio)) ? settings.longInitialMarginRatio : DEFAULT_TRADING_SETTINGS.longInitialMarginRatio,
        ),
      );
      setLongMaintenanceMarginRatioInput(
        formatRateInput(
          Number.isFinite(Number(settings.longMaintenanceMarginRatio))
            ? settings.longMaintenanceMarginRatio
            : DEFAULT_TRADING_SETTINGS.longMaintenanceMarginRatio,
        ),
      );
      setShortBorrowAnnualRateInput(formatRateInput(settings.shortBorrowAnnualRate));
      setShortInitialMarginRatioInput(formatRateInput(settings.shortInitialMarginRatio));
      setShortMaintenanceMarginRatioInput(formatRateInput(settings.shortMaintenanceMarginRatio));
      setStampDutyMode(settings.stampDutyMode);
      setPositionCostMode(settings.positionCostMode);
      setTradeSettlementMode(settings.tradeSettlementMode);
      setFreeReplayEndSettlementMode(settings.freeReplayEndSettlementMode);
      setTradeAmountIncludesFees(Boolean(settings.tradeAmountIncludesFees));
      setAllowLongMarginTrading(Boolean(settings.allowLongMarginTrading));
      setAllowShortSelling(Boolean(settings.allowShortSelling));
    },
    [
      formatMoney,
      formatRateInput,
      setAllowLongMarginTrading,
      setAllowShortSelling,
      setContractMultiplierInput,
      setCommissionMinimumFeeInput,
      setCommissionRateInput,
      setFundingRateInput,
      setFreeReplayEndSettlementMode,
      setInitialSecuritiesInput,
      setLongFinancingAnnualRateInput,
      setLongInitialMarginRatioInput,
      setLongMaintenanceMarginRatioInput,
      setMakerFeeRateInput,
      setMinTradeStepInput,
      setPlatformFeeMinimumFeeInput,
      setPlatformFeeRateInput,
      setPositionCostMode,
      setRegulatoryFeeRateInput,
      setShortBorrowAnnualRateInput,
      setShortInitialMarginRatioInput,
      setShortMaintenanceMarginRatioInput,
      setSlippageRateInput,
      setStampDutyMode,
      setStampDutyRateInput,
      setTakerFeeRateInput,
      setTradeAmountIncludesFees,
      setTradeSettlementMode,
      setTradingAssetClass,
      setTradingMarketPresetKey,
      setTransactionLevyMinimumFeeInput,
      setTransactionLevyRateInput,
      setTransferFeeRateInput,
    ],
  );

  const { applySessionBootstrap, loadSymbol, resumeSessionById } = useTrainerSymbolLoader({
    appIsMountedRef,
    symbolLoadRequestVersionRef,
    symbolLoadAbortControllerRef,
    sessionIdRef: activeSessionIdRef,
    snapshotRef,
    snapshotRequestVersionRef,
    snapshotAbortControllerRef,
    ensureBarsForwardAbortControllerRef,
    ensureBarsBackwardAbortControllerRef,
    barsRef,
    barsOffsetRef,
    barsTotalRef,
    samplePoolAllId: SAMPLE_POOL_ALL_ID,
    samplePoolUnknownId: SAMPLE_POOL_UNKNOWN_ID,
    samplePoolUnknownName: SAMPLE_POOL_UNKNOWN_NAME,
    customSamplePools,
    includeSystemDefaultPool,
    findBuiltInSamplePoolById,
    resolveBuiltInPoolBySymbol,
    resolveSamplePoolDisplayName,
    sanitizeSamplePoolName,
    setError,
    setReplayUnavailableMessage,
    setIsBusy,
    setTrainerHydrationState,
    setBarsOffset,
    setBarsTotal,
    setBars,
    setBarsTimeZone,
    setSnapshot,
    setSessionId,
    setSelectedSymbol,
    setSelectedInstrumentId,
    setCurrentTrainingPoolMeta,
    setCurrentTrainingBaseTimeframe,
    setCurrentTrainingMinimumBaseTimeframe,
    setTrainerDisplayPeriod,
    setHint,
    cleanupStaleSessionsRequest: api.cleanupStaleSessions,
    createSessionBootstrap: api.createSessionBootstrap,
    getSessionBootstrapById: api.getSessionBootstrapById,
    formatMoney,
    resolveSessionTradingSettingsByPoolId,
    applyResolvedTradingSettingsToForm,
    tt,
    ttf,
  });

  const handleResumeLatestTrainerSession = useCallback(async (): Promise<boolean> => {
    if (hasLiveResumableTrainerSession) {
      startTrainerPerfSpan("page-switch-to-trainer", {
        source: "resume-live-session",
      });
      setActivePage("TRAINER");
      void syncActiveTrainingRuntime();
      return true;
    }
    const latest = latestResumableTrainerSession ?? (await refreshLatestResumableTrainerSession());
    if (!latest) {
      setHint(tt("appText.trainingSessionsProgress"));
      return false;
    }
    startTrainerPerfSpan("page-switch-to-trainer", {
      source: "resume-latest-session",
    });
	    setCurrentTrainingMinimumBaseTimeframe(
	      latest.minimumBaseTimeframe === "1m" ||
	        latest.minimumBaseTimeframe === "5m" ||
        latest.minimumBaseTimeframe === "1h" ||
        latest.minimumBaseTimeframe === "1d" ||
        latest.minimumBaseTimeframe === "1w" ||
        latest.minimumBaseTimeframe === "1month" ||
        latest.minimumBaseTimeframe === "1year"
	        ? latest.minimumBaseTimeframe
	        : "1d",
	    );
    setActivePage("TRAINER");
    const resumedSessionId = await resumeSessionById(latest.sessionId, {
      preferredPoolId: latest.samplePoolId,
      symbol: latest.symbol,
      timeframe: latest.timeframe,
    });
    if (!resumedSessionId) {
      await refreshLatestResumableTrainerSession();
      return false;
    }
    if (!appIsMountedRef.current) {
      return false;
    }
    return true;
  }, [
    appIsMountedRef,
    hasLiveResumableTrainerSession,
    latestResumableTrainerSession,
    refreshLatestResumableTrainerSession,
    resumeSessionById,
    setCurrentTrainingMinimumBaseTimeframe,
    setActivePage,
    setHint,
    syncActiveTrainingRuntime,
    tt,
  ]);
  return { applyResolvedTradingSettingsToForm, applySessionBootstrap, handleResumeLatestTrainerSession, hiddenBuiltInTradingMarketPresetIdSet, isTradingMarketPresetAvailableInAssetClass, listVisibleBuiltInTradingMarketPresetIdsByAssetClass, loadSymbol, resolveActiveTradingMarketPresetValuesForEnvironment, resolveFallbackTradingMarketPresetId, resolveSessionTradingSettingsByEnvironment, resolveSessionTradingSettingsByPoolId, resolveSessionTradingSettingsErrorMessageByEnvironment, resolveTradingMarketPresetLabel, resolveTradingMarketPresetValuesForAssetClass, resumeSessionById };
};
