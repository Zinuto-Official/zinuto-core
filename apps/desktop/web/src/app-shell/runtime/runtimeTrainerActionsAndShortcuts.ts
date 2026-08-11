// SPDX-License-Identifier: GPL-3.0-only

import type { ActiveDrawTool, DrawTool } from "@/domains/chart/drawingTypes";
import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import {
  api,
} from "@/api";
import { formatMoney, parseNumeric } from "@/ui/formatting/format";
import { useTrainerKeyboardShortcuts } from "@/app-shell/useTrainerKeyboardShortcuts";
import { useTrainerAutoplayLoop } from "@/app-shell/useTrainerAutoplayLoop";
import { useDrawingToolController } from "@/app-shell/useDrawingToolController";
import { useOrderEstimationController } from "@/app-shell/useOrderEstimationController";
import { type SpecialTrainingShortcutBindings } from "@/domains/special-training/specialTrainingContracts";
import { useTrainerTradeInputController } from "@/app-shell/useTrainerTradeInputController";
import { useTradeQuantityTextFormatters } from "@/app-shell/useTradeQuantityTextFormatters";
import {
  type UiSettings
} from "@/frontend-kernel/appTypes";
import { getDrawingMinPointCount } from "@/domains/chart/chartRuntime";
import {
  isDisplayPeriodKey,
} from "@/ui/config/uiConfig";
import { useTrainerActionOrchestrator } from "@/domains/trainer/useTrainerActionOrchestrator";
import { toTrainerOrderButtonDisplay } from "@/domains/trainer/trainerOrderActionDisplay";
import {
  mergeTrainerFillEnvelope,
  resolveTrainerFillCursor,
} from "@/domains/trainer/trainerFillEnvelope";
import { readActiveSessionTerminationReasonCode } from "@/domains/trainer/trainingSessionGuards";
import type {
  MarketBarFrame,
	  SessionRuntimeDelta,
  SessionSnapshot,
  SessionTerminationReasonCode,
} from "@/domains/training/types";
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
type RuntimeHookScope = AppRootRuntimeProps & ReturnType<typeof useRuntimeStartupState> & ReturnType<typeof useRuntimeStartupHistoryState> & ReturnType<typeof useRuntimeStartupPersistence> & ReturnType<typeof useRuntimeTrainerChartSession> & ReturnType<typeof useRuntimeTrainerMarketSettings> & ReturnType<typeof useRuntimeTrainerPoolChartPipeline> & ReturnType<typeof useRuntimeTrainerChartOrchestration> & ReturnType<typeof useRuntimeFreeReplaySetup> & ReturnType<typeof useRuntimeFreeReplayExecution> & ReturnType<typeof useRuntimeTradingSettingsAndImport> & ReturnType<typeof useRuntimeDataResetNavigation> & Record<string, unknown>;

export type AppRootRuntimeProps = {
  initialUiSettings: UiSettings;
  initialDataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
  canPersistUiSettings: boolean;
};

type TrainerShortcutSurfaceId = "trainer" | "specialTraining";

type TrainerShortcutSurface = {
  stepNext: () => Promise<void>;
  undo: () => Promise<void>;
  placeOrder: (side: "BUY" | "SELL") => Promise<void>;
  toggleAutoplay: () => Promise<void>;
  createTrainingRecordReplayNote: () => void;
  buyTradeInputMode: SpecialTrainingShortcutBindings["buyTradeInputMode"];
  buyRatioPresetOptions: SpecialTrainingShortcutBindings["buyRatioPresetOptions"];
  setBuyRatioInput: SpecialTrainingShortcutBindings["setBuyRatioInput"];
};

export const TRAINER_SHORTCUT_SURFACE_BY_PAGE = {
  TRAINER: "trainer",
  SPECIAL_TRAINING: "specialTraining",
} as const satisfies Record<string, TrainerShortcutSurfaceId>;

export const resolveTrainerShortcutSurfaceId = (
  activePage: string,
): TrainerShortcutSurfaceId =>
  TRAINER_SHORTCUT_SURFACE_BY_PAGE[
    activePage as keyof typeof TRAINER_SHORTCUT_SURFACE_BY_PAGE
  ] ?? "trainer";





export const useRuntimeTrainerActionsAndShortcuts = (scope: RuntimeHookScope) => {
const { activeDrawTool, activeDrawToolRef, activePage, activeSamplePoolId, activeSessionTradingSettings, activeTrainingRecordNoteId, appIsMountedRef, armDrawOverlayRef, autoplayBarsPerSec, bars, buyAmountInput, buyLotInput, buyPriceMode, buyRatioInput, buyTradeInputMode, chartDomRef, chartPipelineBars, chartReady, chartRef, createTrainingRecordReplayNote, currentBar, currentPosition, currentTrainingPoolMeta, customSamplePools, drawArmEpochRef, drawColor, drawLineType, drawLineWidth, drawMagnet, drawShortcutToolByKey, drawToolLabels, drawingOverlayIdRef, drawingStoreRef, isAutoplay, isBusy, isPlacingOrderRef, isPreparingAction, language, lotSizeByPool, noticeDialog, openResetAllDialogRef, playingLockRef, rearmTimerRef, refreshDrawingMeta, refreshSnapshot, securitiesAccount, selectedSymbolUpper, sellAmountInput, sellLotInput, sellPriceMode, sellRatioInput, sellTradeInputMode, sessionId, setActiveDrawTool, setActiveTrainingRecordNoteId, setAllDrawingsVisible, setBuyRatioInput, setError, setHint, setIsAutoplay, setLotSizeByPool, setMainNativeIndicatorParams, setNoticeDialog, setOrderEndPrompt, setSelectedDrawingId, setSellAmountInput, setSellLotInput, setSellPriceMode, setSellRatioInput, setSellTradeInputMode, setSignalBottomIndicatorParams, setSignalTopIndicatorParams, setSnapshot, setSpecialTrainingShortcutBindings, showNotice, snapshot, snapshotRef, specialTrainingShortcutBindings, trainerDisplayPeriod, trainerFillDerivedState, trainerTradingAssetUi, tt, ttf } = scope;
  const { applyTrainerChartFrame } = scope;
const { lotSizeForCurrentPool, buyRatioPresetOptions } = useTrainerTradeInputController({
    currentTrainingPoolId: currentTrainingPoolMeta.id,
    activeSamplePoolId,
    customSamplePools,
    selectedSymbolUpper,
    lotSizeByPool,
    setLotSizeByPool,
    buyRatioInput,
    setBuyRatioInput,
    setSellRatioInput,
    buyTradeInputMode,
    setSellTradeInputMode,
    buyLotInput,
    setSellLotInput,
    buyAmountInput,
    setSellAmountInput,
    buyPriceMode,
    setSellPriceMode,
    sellTradeInputMode,
    sellLotInput,
    sellAmountInput,
    sellPriceMode,
    sellRatioInput,
  });
  const { tradeStepForCurrentSettings, formatWorkspaceTradeQuantityText, formatTradeLogQuantityText } = useTradeQuantityTextFormatters({
    language,
    lotSizeForCurrentPool,
    lotStepUnitLabel: tt("appText.lots2"),
    minTradeStep: activeSessionTradingSettings.minTradeStep,
    tradeContractMultiplier: activeSessionTradingSettings.contractMultiplier,
    trainerTradingAssetUi,
  });

  const {
    estimateOrder,
    buyEstimate,
    sellEstimate,
    tradeCapacity,
    buyBlockReason,
    sellBlockReason,
    buyOrderActionState,
    sellOrderActionState,
  } =
    useOrderEstimationController({
      sessionId,
      trainerDisplayPeriod,
      isBusy,
      isPreparingAction,
      snapshot,
      bars,
      currentBarClose: currentBar?.close ?? 0,
      currentPositionQty: currentPosition?.qty ?? 0,
      securitiesBalance: securitiesAccount?.balance ?? 0,
      getSameDayBoughtQtyAtFillIndex: trainerFillDerivedState.getSameDayBoughtQtyAtFillIndex,
      lotSizeForCurrentPool: tradeStepForCurrentSettings,
      tradingSettings: activeSessionTradingSettings,
      buyTradeInputMode,
      buyLotInput,
      buyAmountInput,
      buyRatioInput,
      buyPriceMode,
      sellTradeInputMode,
      sellLotInput,
      sellAmountInput,
      sellRatioInput,
      sellPriceMode,
      parseNumeric,
      formatMoney,
      tt,
      ttf,
    });
  const trainingTerminationReasonCode = readActiveSessionTerminationReasonCode(
    snapshot,
    sessionId,
  );
  const handleTrainingTerminated = useCallback(
    async (reasonCode: SessionTerminationReasonCode) => {
      setOrderEndPrompt(null);
      await openResetAllDialogRef.current({
        terminationReasonCode: reasonCode,
      });
    },
    [setOrderEndPrompt],
  );

  const { handleDrawToolSelect, toggleAllDrawingVisible, clearDrawings } = useDrawingToolController<DrawTool, ActiveDrawTool>({
    chartRef,
    chartDomRef,
    chartReady,
    barsLength: chartPipelineBars.length,
    activePage,
    activeDrawTool,
    activeDrawToolRef,
    drawArmEpochRef,
    armDrawOverlayRef,
    drawingOverlayIdRef,
    rearmTimerRef,
    drawingStoreRef,
    drawLineType,
    drawLineWidth,
    drawColor,
    drawMagnet,
    drawToolLabels,
    getDrawingMinPointCount,
    refreshDrawingMeta,
    setActiveDrawTool,
    setSelectedDrawingId,
    setAllDrawingsVisible,
    setHint,
    tt,
    ttf,
  });

  const updateMainIndicatorParamAt = useCallback((index: number, rawValue: string) => {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return;
    }
    setMainNativeIndicatorParams((current) => {
      if (index < 0 || index >= current.length) {
        return current;
      }
      const next = [...current];
      next[index] = parsed;
      return next;
    });
  }, []);

  const updateTopIndicatorParamAt = useCallback((index: number, rawValue: string) => {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return;
    }
    setSignalTopIndicatorParams((current) => {
      if (index < 0 || index >= current.length) {
        return current;
      }
      const next = [...current];
      next[index] = parsed;
      return next;
    });
  }, []);

  const updateBottomIndicatorParamAt = useCallback((index: number, rawValue: string) => {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return;
    }
    setSignalBottomIndicatorParams((current) => {
      if (index < 0 || index >= current.length) {
        return current;
      }
      const next = [...current];
      next[index] = parsed;
      return next;
    });
  }, []);

  const commitSessionRuntimePatch = useCallback(
    (result: {
      runtimeDelta: unknown;
      chartFrame?: unknown;
    }, options: { appendFillsFromPrevious?: boolean } = {}) => {
      const appendFillsFromPrevious = Boolean(options.appendFillsFromPrevious);
      const nextRuntimeDelta = result.runtimeDelta as SessionRuntimeDelta;
      const nextChartFrame =
        (result.chartFrame as MarketBarFrame | undefined) ??
        nextRuntimeDelta?.chartFrameDelta;
      const previousSnapshot = snapshotRef.current;
      const fillEnvelope = mergeTrainerFillEnvelope({
        sessionId: nextRuntimeDelta.session.id,
        previousSnapshot,
        incomingFills: nextRuntimeDelta.fills,
        incomingFillsTotal: nextRuntimeDelta.fillsTotal,
        incomingNextFillCursor: nextRuntimeDelta.nextFillCursor,
        incomingResidentFillsStartIndex: nextRuntimeDelta.residentFillsStartIndex,
        appendFromPrevious: appendFillsFromPrevious,
      });
      const mergedSnapshot: SessionSnapshot = {
        ...(previousSnapshot?.session.id === nextRuntimeDelta.session.id
          ? previousSnapshot
          : {
              session: nextRuntimeDelta.session,
              accounts: [],
              positions: [],
              fills: [],
              drawings: [],
            }),
        session: nextRuntimeDelta.session,
        sessionTradingSettings:
          nextRuntimeDelta.sessionTradingSettings ??
          previousSnapshot?.sessionTradingSettings,
        positions: nextRuntimeDelta.positions,
        accounts: nextRuntimeDelta.accounts,
        fills: fillEnvelope.fills,
        fillsTotal: fillEnvelope.fillsTotal,
        nextFillCursor: fillEnvelope.nextFillCursor,
        residentFillsStartIndex: fillEnvelope.residentFillsStartIndex,
        tradingCostBreakdown: nextRuntimeDelta.tradingCostBreakdown,
        longFinancingChargesTotal: nextRuntimeDelta.longFinancingChargesTotal,
        shortBorrowChargesTotal: nextRuntimeDelta.shortBorrowChargesTotal,
        currentLeverageCycle: nextRuntimeDelta.currentLeverageCycle,
        termination: nextRuntimeDelta.termination,
        actionState: nextRuntimeDelta.actionState,
        drawings: previousSnapshot?.drawings ?? [],
      };
      snapshotRef.current = mergedSnapshot;
      setSnapshot(mergedSnapshot);
      applyTrainerChartFrame(nextChartFrame, {
        mode: "merge",
        expectedDisplayPeriod: isDisplayPeriodKey(nextRuntimeDelta.displayPeriod)
          ? nextRuntimeDelta.displayPeriod
          : undefined,
      });
    },
    [
      applyTrainerChartFrame,
      setSnapshot,
      snapshotRef,
    ],
  );

  const resolveActionFillCursor = useCallback((): string | null => {
    return resolveTrainerFillCursor(snapshotRef.current);
  }, [snapshotRef]);

  const { stepNext, autoplayStep, undo, placeOrder: placeTrainerOrder, toggleAutoplay, hotActionState } = useTrainerActionOrchestrator({
    sessionId,
    trainerDisplayPeriod,
    autoplayBarsPerSec,
    isAutoplay,
    buyPriceMode,
    buyTradeInputMode,
    buyLotInput,
    buyAmountInput,
    buyRatioInput,
    sellPriceMode,
    sellTradeInputMode,
    sellLotInput,
    sellAmountInput,
    sellRatioInput,
    trainingTerminationReasonCode,
    appIsMountedRef,
    playingLockRef,
    isPlacingOrderRef,
    parseNumeric,
    tt,
    ttf,
    formatMoney,
    formatTradeQuantityText: formatWorkspaceTradeQuantityText,
    estimateOrder,
    apiExecuteSessionAction: api.executeSessionAction,
    apiSetPlayback: api.setPlayback,
    refreshSnapshot,
    commitSessionRuntimePatch,
    resolveFillCursor: resolveActionFillCursor,
    setHint,
    setError,
    setIsAutoplay,
    onTrainingTerminated: handleTrainingTerminated,
    showNotice,
  });

  const {
    buyOrderDisabled,
    sellOrderDisabled,
    isOrderActionBusy,
  } = toTrainerOrderButtonDisplay({
    buyOrderActionState,
    sellOrderActionState,
    hotActionState,
  });

  useTrainerAutoplayLoop({
    sessionId,
    isAutoplay,
    isSurfaceActive: activePage === "TRAINER",
    trainerDisplayPeriod,
    autoplayBarsPerSec,
    parseNumeric,
    autoplayStep,
    apiSetPlayback: api.setPlayback,
    onPlaybackSyncError: () => {
      setError(tt('appText.setUpAutoplay'));
    },
  });

  const noopSpecialTrainingRatioSetter = useCallback<Dispatch<SetStateAction<string>>>((_value) => {}, []);
  const handleSpecialTrainingShortcutBindingsChange = useCallback((next: SpecialTrainingShortcutBindings | null) => {
    setSpecialTrainingShortcutBindings(next);
  }, []);
  const submitTrainerOrder = useCallback(
    async (side: "BUY" | "SELL") => {
      if (isOrderActionBusy) {
        setHint(tt("appText.processing"));
        return;
      }
      const blockReason = side === "BUY" ? buyBlockReason : sellBlockReason;
      const orderDisabled = side === "BUY" ? buyOrderDisabled : sellOrderDisabled;
      if (orderDisabled) {
        const disabledReason =
          blockReason || "";
        if (disabledReason) {
          setHint(disabledReason);
        }
        return;
      }
      await placeTrainerOrder(side);
    },
    [
      buyBlockReason,
      buyOrderDisabled,
      isOrderActionBusy,
      placeTrainerOrder,
      sellBlockReason,
      sellOrderDisabled,
      setHint,
      tt,
    ],
  );
  const trainerShortcutSurface = useMemo<TrainerShortcutSurface>(() => ({
    stepNext,
    undo,
    placeOrder: submitTrainerOrder,
    toggleAutoplay,
    createTrainingRecordReplayNote,
    buyTradeInputMode,
    buyRatioPresetOptions,
    setBuyRatioInput,
  }), [
    buyRatioPresetOptions,
    buyTradeInputMode,
    createTrainingRecordReplayNote,
    setBuyRatioInput,
    stepNext,
    submitTrainerOrder,
    toggleAutoplay,
    undo,
  ]);
  const specialTrainingFallbackShortcutSurface = useMemo<TrainerShortcutSurface>(() => ({
    ...trainerShortcutSurface,
    buyTradeInputMode: "LOT",
    buyRatioPresetOptions: [],
    setBuyRatioInput: noopSpecialTrainingRatioSetter,
  }), [noopSpecialTrainingRatioSetter, trainerShortcutSurface]);
  const shortcutSurfaceById = useMemo<Record<TrainerShortcutSurfaceId, TrainerShortcutSurface>>(() => ({
    trainer: trainerShortcutSurface,
    specialTraining:
      specialTrainingShortcutBindings ?? specialTrainingFallbackShortcutSurface,
  }), [
    specialTrainingFallbackShortcutSurface,
    specialTrainingShortcutBindings,
    trainerShortcutSurface,
  ]);
  const shortcutSurface =
    shortcutSurfaceById[resolveTrainerShortcutSurfaceId(activePage)];
  const shortcutStepNext = useCallback(async () => {
    await shortcutSurface.stepNext();
  }, [shortcutSurface]);
  const shortcutUndo = useCallback(async () => {
    await shortcutSurface.undo();
  }, [shortcutSurface]);
  const shortcutPlaceOrder = useCallback(
    async (side: "BUY" | "SELL") => {
      await shortcutSurface.placeOrder(side);
    },
    [shortcutSurface],
  );
  const shortcutToggleAutoplay = useCallback(async () => {
    await shortcutSurface.toggleAutoplay();
  }, [shortcutSurface]);
  const shortcutCreateTrainingRecordReplayNote = useCallback(() => {
    shortcutSurface.createTrainingRecordReplayNote();
  }, [shortcutSurface]);
  const shortcutBuyTradeInputMode = shortcutSurface.buyTradeInputMode;
  const shortcutBuyRatioPresetOptions = shortcutSurface.buyRatioPresetOptions;
  const shortcutSetBuyRatioInput = shortcutSurface.setBuyRatioInput;

  useTrainerKeyboardShortcuts({
    noticeDialog,
    setNoticeDialog,
    activePage,
    activeTrainingRecordNoteId,
    setActiveTrainingRecordNoteId,
    activeDrawToolRef,
    handleDrawToolSelect,
    stepNext: shortcutStepNext,
    undo: shortcutUndo,
    placeOrder: shortcutPlaceOrder,
    createTrainingRecordReplayNote: shortcutCreateTrainingRecordReplayNote,
    drawShortcutToolByKey,
    toggleAutoplay: shortcutToggleAutoplay,
    buyTradeInputMode: shortcutBuyTradeInputMode,
    buyRatioPresetOptions: shortcutBuyRatioPresetOptions,
    setBuyRatioInput: shortcutSetBuyRatioInput,
  });
  return { lotSizeForCurrentPool, buyRatioPresetOptions, tradeStepForCurrentSettings, formatWorkspaceTradeQuantityText, formatTradeLogQuantityText, estimateOrder, buyEstimate, sellEstimate, tradeCapacity, buyBlockReason, sellBlockReason, buyOrderDisabled, sellOrderDisabled, trainingTerminationReasonCode, handleTrainingTerminated, handleDrawToolSelect, toggleAllDrawingVisible, clearDrawings, updateMainIndicatorParamAt, updateTopIndicatorParamAt, updateBottomIndicatorParamAt, applySessionRuntimeResult: commitSessionRuntimePatch, stepNext, undo, placeOrder: submitTrainerOrder, toggleAutoplay, noopSpecialTrainingRatioSetter, handleSpecialTrainingShortcutBindingsChange, shortcutStepNext, shortcutUndo, shortcutPlaceOrder, shortcutToggleAutoplay, shortcutCreateTrainingRecordReplayNote, shortcutBuyTradeInputMode, shortcutBuyRatioPresetOptions, shortcutSetBuyRatioInput };
};
