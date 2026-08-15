// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  api,
} from "@/api";
import { useAppRootWorkspaceDesktopBindings } from "@/app-shell/useAppRootWorkspaceDesktopBindings";
import type { TrainerIndicatorSettingsWindowPayload } from "@/app-shell/AppTrainerModalHost";
import {
  type UiSettings,
} from "@/frontend-kernel/appTypes";
import { normalizeInput } from "@/frontend-kernel/valueFormat";
import {
  INDICATOR_NONE_VALUE,
  type SignalIndicatorName,
} from "@/domains/indicators/core";
import {
  DEFAULT_REPLAY_NOTE_TITLE_BY_LANGUAGE,
  TRAINER_SHORTCUT_KEYS,
} from "@/ui/config/uiConfig";
import {
  buildRuntimeDesktopBindingsArgs,
} from "@/app-shell/runtime/workspace-shell/runtimeDesktopBindings";
import {
  buildRuntimeActionDialogBindings,
  buildRuntimeActionDialogHistoryReviewBindings,
  buildRuntimeModalPropsBundle,
  buildRuntimeWorkspaceSwitcherBaseBindings,
} from "@/app-shell/runtime/workspace-shell/runtimeDesktopComposition";
import {
  buildRuntimeTrainerModalHostProps,
  buildRuntimeTrainingRecordNoteModalProps,
  buildRuntimeUtilityDialogsModalProps,
} from "@/app-shell/runtime/workspace-shell/runtimeModalSectionBuilders";
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
import type { useRuntimeWorkspaceProps } from "@/app-shell/runtime/runtimeWorkspaceProps";
import type { useRuntimeWorkspaceBundles } from "@/app-shell/runtime/runtimeWorkspaceBundles";
import type { useRuntimeSecondaryWindows } from "@/app-shell/runtime/runtimeSecondaryWindows";
type RuntimeHookScope = AppRootRuntimeProps & ReturnType<typeof useRuntimeStartupState> & ReturnType<typeof useRuntimeStartupHistoryState> & ReturnType<typeof useRuntimeStartupPersistence> & ReturnType<typeof useRuntimeTrainerChartSession> & ReturnType<typeof useRuntimeTrainerMarketSettings> & ReturnType<typeof useRuntimeTrainerPoolChartPipeline> & ReturnType<typeof useRuntimeTrainerChartOrchestration> & ReturnType<typeof useRuntimeFreeReplaySetup> & ReturnType<typeof useRuntimeFreeReplayExecution> & ReturnType<typeof useRuntimeTradingSettingsAndImport> & ReturnType<typeof useRuntimeDataResetNavigation> & ReturnType<typeof useRuntimeNoteEditorAndShortcuts> & ReturnType<typeof useRuntimeWorkspaceProps> & ReturnType<typeof useRuntimeWorkspaceBundles> & ReturnType<typeof useRuntimeSecondaryWindows> & Record<string, unknown>;

export type AppRootRuntimeProps = {
  initialUiSettings: UiSettings;
  initialDataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
  canPersistUiSettings: boolean;
};





export const useRuntimeGlobalOverlayHost = (scope: RuntimeHookScope) => {
  const { actionDialog, actionDialogDesc, actionDialogReplayMetrics, actionDialogTitle, activePage, activeTrainingRecordNote, bars, bottomIndicatorParamChanged, buildCurrentReplayContext, buyAmountInput, buyLotInput, buyPriceMode, buyRatioInput, buyRatioPresetOptions, buyTradeInputMode, canResumeTrainerSession, cancelActiveTrainingRecordNote, chartSettingsModalFocusTarget, closeActiveTrainingRecordNote, combinedEnabledPoolSymbols, commitReplayNoteTitle, compactScriptLanguage, confirmActionDialog, createHistoryReviewReplayNote, csvMappingModalArgs, drawShortcutItems, effectiveThemeMode, effectiveTrainingBaseTimeframe, enabledSpecialTrainingSamplePools, groupedSignalIndicatorSelectOptions, handleCreateSpecialTrainingChallengeReviewNote, handleResumeLatestTrainerSession, handleSpecialTrainingShortcutBindingsChange, isActiveTrainingRecordNoteNewlyCreated, isBusy, isPreparingAction, isSavingTradingSettings, language, mainIndicatorParamChanged, mainIndicatorSelectOptions, mainNativeIndicator, mainNativeIndicatorParams, notesPageController, noticeCountdownSec, noticeDialog, openResetAllDialog, orderEndPrompt, priceColorMode, renderTrainingNoteSnapshot, resetBottomIndicatorParams, resetMainIndicatorParams, resetTopIndicatorParams, resolveSamplePoolDisplayName, saveTradingSettings, sessionId, setActionDialog, setActivePage, setBuyAmountInput, setBuyLotInput, setBuyPriceMode, setBuyRatioInput, setBuyTradeInputMode, setChartSettingsModalFocusTarget, setError, setMainNativeIndicator, setNoticeDialog, setOrderEndPrompt, setShowChartSettingsModal, setShowShortcutModal, setShowTradingSettingsModal, setSignalBottomIndicator, setSignalTopIndicator, sharedTrainerChartWorkspaceProps, showChartSettingsModal, showNotice, showShortcutModal, showTradingSettingsModal, signalBottomIndicator, signalBottomIndicatorParams, signalTopIndicator, signalTopIndicatorParams, snapshot, supportedIndicatorNameSet, syncSpecialTrainingChartState, topIndicatorParamChanged, trainerDisplayPeriod, trainerTradingAssetUi, tt, ttf, ui, updateBottomIndicatorParamAt, updateMainIndicatorParamAt, updateReplayNoteColorTokens, updateReplayNoteContent, updateReplayNoteTitle, updateTopIndicatorParamAt, withLabelValue, workspacePageBundleArgs } = scope;
  const globalResetRevision = Number(scope.globalResetRevision ?? 0) || 0;
  const handleSaveChartSettings = useCallback(() => {
    void saveTradingSettings({
      closeChartSettingsModal: true,
      quietHint: true,
    });
  }, [saveTradingSettings]);
  const handleConfirmOrderEndPrompt = useCallback(() => {
    setOrderEndPrompt(null);
    void openResetAllDialog();
  }, [openResetAllDialog, setOrderEndPrompt]);
  const handleCloseActionDialog = useCallback(() => {
    setActionDialog(null);
  }, [setActionDialog]);
  const handleConfirmActionDialog = useCallback(() => {
    void confirmActionDialog();
  }, [confirmActionDialog]);
  const handleResumeLatestTrainerSessionStable = useCallback(() => {
    void handleResumeLatestTrainerSession();
  }, [handleResumeLatestTrainerSession]);
  const trainerModalHostArgs = buildRuntimeTrainerModalHostProps({
    tt,
    ttf,
    uiText: {
      shortcutTitle: ui.shortcutTitle,
      shortcutModalDescription: ui.shortcutModalDescription,
      shortcutGroupPlayback: ui.shortcutGroupPlayback,
      shortcutGroupTrading: ui.shortcutGroupTrading,
      shortcutGroupDrawing: ui.shortcutGroupDrawing,
      shortcutActionNextBar: ui.shortcutActionNextBar,
      shortcutActionAutoPlay: ui.shortcutActionAutoPlay,
      nextBar: ui.nextBar,
      autoPlay: ui.autoPlay,
      currentClose: ui.currentClose,
      nextOpen: ui.nextOpen,
    },
    showShortcutModal,
    setShowShortcutModal,
    drawShortcutItems,
    addNoteKey: TRAINER_SHORTCUT_KEYS.addNote.toUpperCase(),
    showChartSettingsModal,
    setShowChartSettingsModal,
    chartSettingsModalFocusTarget,
    indicatorNoneValue: INDICATOR_NONE_VALUE,
    mainNativeIndicator,
    onMainNativeIndicatorChange: setMainNativeIndicator,
    mainIndicatorSelectOptions,
    mainNativeIndicatorParams,
    mainIndicatorParamChanged,
    onResetMainIndicatorParams: resetMainIndicatorParams,
    onUpdateMainIndicatorParamAt: updateMainIndicatorParamAt,
    signalTopIndicator,
    onSignalTopIndicatorChange: setSignalTopIndicator,
    signalTopIndicatorParams,
    topIndicatorParamChanged,
    onResetTopIndicatorParams: resetTopIndicatorParams,
    onUpdateTopIndicatorParamAt: updateTopIndicatorParamAt,
    signalBottomIndicator,
    onSignalBottomIndicatorChange: setSignalBottomIndicator,
    signalBottomIndicatorParams,
    bottomIndicatorParamChanged,
    onResetBottomIndicatorParams: resetBottomIndicatorParams,
    onUpdateBottomIndicatorParamAt: updateBottomIndicatorParamAt,
    signalIndicatorOptions: groupedSignalIndicatorSelectOptions,
    onSaveChartSettings: handleSaveChartSettings,
    isSavingTradingSettings,
    isBusy,
    showTradingSettingsModal,
    setShowTradingSettingsModal,
    quantityModeLabel: trainerTradingAssetUi.quantityModeLabel,
    quantityInputPlaceholder: trainerTradingAssetUi.quantityInputPlaceholder,
    amountModeLabel: trainerTradingAssetUi.amountModeLabel,
    amountInputPlaceholder: trainerTradingAssetUi.amountInputPlaceholder,
    buyTradeInputMode,
    onBuyTradeInputModeChange: setBuyTradeInputMode,
    buyLotInput,
    setBuyLotInput,
    buyAmountInput,
    setBuyAmountInput,
    buyRatioInput,
    buyRatioPresetOptions,
    onBuyRatioInputChange: setBuyRatioInput,
    buyPriceMode,
    onBuyPriceModeChange: setBuyPriceMode,
    normalizeInput,
  });
  const trainerIndicatorSettingsWindowOpenedRef = useRef(false);
  const trainerIndicatorSettingsWindowRevisionRef = useRef(0);
  const trainerIndicatorSettingsWindowPayload =
    useMemo<TrainerIndicatorSettingsWindowPayload>(
      () => ({
        focusedTarget: chartSettingsModalFocusTarget,
        indicatorNoneValue: INDICATOR_NONE_VALUE,
        mainNativeIndicator,
        mainIndicatorSelectOptions,
        mainNativeIndicatorParams,
        mainIndicatorParamChanged,
        signalTopIndicator,
        signalTopIndicatorParams,
        topIndicatorParamChanged,
        signalBottomIndicator,
        signalBottomIndicatorParams,
        bottomIndicatorParamChanged,
        signalIndicatorOptions: groupedSignalIndicatorSelectOptions,
        isSaving: isSavingTradingSettings,
        saveDisabled: isBusy,
      }),
      [
        bottomIndicatorParamChanged,
        chartSettingsModalFocusTarget,
        groupedSignalIndicatorSelectOptions,
        isBusy,
        isSavingTradingSettings,
        mainIndicatorParamChanged,
        mainIndicatorSelectOptions,
        mainNativeIndicator,
        mainNativeIndicatorParams,
        signalBottomIndicator,
        signalBottomIndicatorParams,
        signalTopIndicator,
        signalTopIndicatorParams,
        topIndicatorParamChanged,
      ],
    );

  useEffect(() => {
    if (!showChartSettingsModal) {
      if (trainerIndicatorSettingsWindowOpenedRef.current) {
        void api
          .closeDesktopSecondaryWindow("TRAINER_INDICATOR_SETTINGS")
          .catch(() => undefined);
      }
      trainerIndicatorSettingsWindowOpenedRef.current = false;
      trainerIndicatorSettingsWindowRevisionRef.current = 0;
      return;
    }
    const input = {
      kind: "TRAINER_INDICATOR_SETTINGS" as const,
      title: tt("appText.indicatorSettings"),
      payload: trainerIndicatorSettingsWindowPayload,
    };
    if (!trainerIndicatorSettingsWindowOpenedRef.current) {
      trainerIndicatorSettingsWindowOpenedRef.current = true;
      void api
        .openDesktopSecondaryWindow(input)
        .then((state) => {
          trainerIndicatorSettingsWindowRevisionRef.current = state.revision;
        })
        .catch((error) => {
          trainerIndicatorSettingsWindowOpenedRef.current = false;
          trainerIndicatorSettingsWindowRevisionRef.current = 0;
          console.error("[desktop-secondary-window] trainer indicator settings failed", error);
          setShowChartSettingsModal(false);
          setChartSettingsModalFocusTarget(null);
          setError(tt("appText.request"));
        });
      return;
    }
    void api
      .isDesktopSecondaryWindowAlive("TRAINER_INDICATOR_SETTINGS")
      .then((alive) =>
        alive
          ? api.publishDesktopSecondaryWindowState(input)
          : api.openDesktopSecondaryWindow(input),
      )
      .then((state) => {
        trainerIndicatorSettingsWindowRevisionRef.current = state.revision;
      })
      .catch((error) => {
        trainerIndicatorSettingsWindowOpenedRef.current = false;
        trainerIndicatorSettingsWindowRevisionRef.current = 0;
        console.error("[desktop-secondary-window] trainer indicator settings sync failed", error);
        setShowChartSettingsModal(false);
        setChartSettingsModalFocusTarget(null);
        setError(tt("appText.request"));
      });
  }, [
    showChartSettingsModal,
    trainerIndicatorSettingsWindowPayload,
    setChartSettingsModalFocusTarget,
    setError,
    setShowChartSettingsModal,
    tt,
  ]);

  useEffect(
    () =>
      api.subscribeDesktopSecondaryWindowActions((message) => {
        if (message.kind !== "TRAINER_INDICATOR_SETTINGS") {
          return;
        }
        if (
          !api.isCurrentDesktopSecondaryWindowAction(
            message,
            trainerIndicatorSettingsWindowRevisionRef.current,
          )
        ) {
          return;
        }
        const payload =
          message.payload &&
          typeof message.payload === "object" &&
          !Array.isArray(message.payload)
            ? (message.payload as { index?: unknown; value?: unknown })
            : {};
        const readIndicatorValue = (): string =>
          String(payload.value ?? "").trim();
        const readParamIndex = (): number | null => {
          const index = Number(payload.index);
          return Number.isInteger(index) && index >= 0 ? index : null;
        };
        const isValidMainIndicator = (value: string): boolean =>
          mainIndicatorSelectOptions.some((option) => option.key === value);
        const isValidSignalIndicator = (
          value: string,
        ): value is SignalIndicatorName =>
          value === INDICATOR_NONE_VALUE || supportedIndicatorNameSet.has(value);
        switch (message.action) {
          case "CLOSE":
          case "WINDOW_CLOSED":
          case "WINDOW_HIDDEN_FOR_REUSE":
            trainerIndicatorSettingsWindowOpenedRef.current = false;
            trainerIndicatorSettingsWindowRevisionRef.current = 0;
            setShowChartSettingsModal(false);
            setChartSettingsModalFocusTarget(null);
            break;
          case "SET_MAIN_INDICATOR": {
            const value = readIndicatorValue();
            if (isValidMainIndicator(value)) {
              setMainNativeIndicator(value);
            }
            break;
          }
          case "SET_SIGNAL_TOP_INDICATOR": {
            const value = readIndicatorValue();
            if (isValidSignalIndicator(value)) {
              setSignalTopIndicator(value);
            }
            break;
          }
          case "SET_SIGNAL_BOTTOM_INDICATOR": {
            const value = readIndicatorValue();
            if (isValidSignalIndicator(value)) {
              setSignalBottomIndicator(value);
            }
            break;
          }
          case "RESET_MAIN_INDICATOR_PARAMS":
            resetMainIndicatorParams();
            break;
          case "RESET_TOP_INDICATOR_PARAMS":
            resetTopIndicatorParams();
            break;
          case "RESET_BOTTOM_INDICATOR_PARAMS":
            resetBottomIndicatorParams();
            break;
          case "UPDATE_MAIN_INDICATOR_PARAM": {
            const index = readParamIndex();
            if (index !== null) {
              updateMainIndicatorParamAt(index, String(payload.value ?? ""));
            }
            break;
          }
          case "UPDATE_TOP_INDICATOR_PARAM": {
            const index = readParamIndex();
            if (index !== null) {
              updateTopIndicatorParamAt(index, String(payload.value ?? ""));
            }
            break;
          }
          case "UPDATE_BOTTOM_INDICATOR_PARAM": {
            const index = readParamIndex();
            if (index !== null) {
              updateBottomIndicatorParamAt(index, String(payload.value ?? ""));
            }
            break;
          }
          case "SAVE":
            void saveTradingSettings({
              closeChartSettingsModal: true,
              quietHint: true,
            });
            break;
          default:
            break;
        }
      }),
    [
      mainIndicatorSelectOptions,
      resetBottomIndicatorParams,
      resetMainIndicatorParams,
      resetTopIndicatorParams,
      saveTradingSettings,
      setChartSettingsModalFocusTarget,
      setMainNativeIndicator,
      setShowChartSettingsModal,
      setSignalBottomIndicator,
      setSignalTopIndicator,
      supportedIndicatorNameSet,
      updateBottomIndicatorParamAt,
      updateMainIndicatorParamAt,
      updateTopIndicatorParamAt,
    ],
  );
  const trainerTradingDefaultsWindowOpenedRef = useRef(false);
  const trainerTradingDefaultsWindowRevisionRef = useRef(0);
  const trainerTradingDefaultsPayload = useMemo(
    () => ({
      uiText: {
        shortcutTitle: ui.shortcutTitle,
        shortcutModalDescription: ui.shortcutModalDescription,
        shortcutGroupPlayback: ui.shortcutGroupPlayback,
        shortcutGroupTrading: ui.shortcutGroupTrading,
        shortcutGroupDrawing: ui.shortcutGroupDrawing,
        shortcutActionNextBar: ui.shortcutActionNextBar,
        shortcutActionAutoPlay: ui.shortcutActionAutoPlay,
        nextBar: ui.nextBar,
        autoPlay: ui.autoPlay,
        currentClose: ui.currentClose,
        nextOpen: ui.nextOpen,
      },
      tradingSettingsModal: {
        quantityModeLabel: trainerTradingAssetUi.quantityModeLabel,
        quantityInputPlaceholder: trainerTradingAssetUi.quantityInputPlaceholder,
        amountModeLabel: trainerTradingAssetUi.amountModeLabel,
        amountInputPlaceholder: trainerTradingAssetUi.amountInputPlaceholder,
        buyTradeInputMode,
        buyLotInput,
        buyAmountInput,
        buyRatioInput,
        buyRatioPresetOptions,
        buyPriceMode,
        isBusy,
      },
    }),
    [
      buyAmountInput,
      buyLotInput,
      buyPriceMode,
      buyRatioInput,
      buyRatioPresetOptions,
      buyTradeInputMode,
      isBusy,
      trainerTradingAssetUi.amountInputPlaceholder,
      trainerTradingAssetUi.amountModeLabel,
      trainerTradingAssetUi.quantityInputPlaceholder,
      trainerTradingAssetUi.quantityModeLabel,
      ui.autoPlay,
      ui.currentClose,
      ui.nextBar,
      ui.nextOpen,
      ui.shortcutActionAutoPlay,
      ui.shortcutActionNextBar,
      ui.shortcutGroupDrawing,
      ui.shortcutGroupPlayback,
      ui.shortcutGroupTrading,
      ui.shortcutModalDescription,
      ui.shortcutTitle,
    ],
  );

  useEffect(() => {
    if (!showTradingSettingsModal) {
      trainerTradingDefaultsWindowOpenedRef.current = false;
      trainerTradingDefaultsWindowRevisionRef.current = 0;
      return;
    }
    const input = {
      kind: "TRAINER_TRADING_DEFAULTS" as const,
      title: tt("appText.paperOrderDefaults"),
      payload: trainerTradingDefaultsPayload,
    };
    if (!trainerTradingDefaultsWindowOpenedRef.current) {
      trainerTradingDefaultsWindowOpenedRef.current = true;
      void api
        .openDesktopSecondaryWindow(input)
        .then((state) => {
          trainerTradingDefaultsWindowRevisionRef.current = state.revision;
        })
        .catch((error) => {
          trainerTradingDefaultsWindowOpenedRef.current = false;
          trainerTradingDefaultsWindowRevisionRef.current = 0;
          console.error("[desktop-secondary-window] trainer trading defaults failed", error);
          setError(tt("appText.request"));
        });
      return;
    }
    void api
      .isDesktopSecondaryWindowAlive("TRAINER_TRADING_DEFAULTS")
      .then((alive) =>
        alive
          ? api.publishDesktopSecondaryWindowState(input)
          : api.openDesktopSecondaryWindow(input),
      )
      .then((state) => {
        trainerTradingDefaultsWindowRevisionRef.current = state.revision;
      })
      .catch((error) => {
        trainerTradingDefaultsWindowOpenedRef.current = false;
        trainerTradingDefaultsWindowRevisionRef.current = 0;
        console.error("[desktop-secondary-window] trainer trading defaults sync failed", error);
        setError(tt("appText.request"));
      });
  }, [
    showTradingSettingsModal,
    trainerTradingDefaultsPayload,
    setError,
    tt,
  ]);

  useEffect(
    () =>
      api.subscribeDesktopSecondaryWindowActions((message) => {
        if (message.kind !== "TRAINER_TRADING_DEFAULTS") {
          return;
        }
        if (
          !api.isCurrentDesktopSecondaryWindowAction(
            message,
            trainerTradingDefaultsWindowRevisionRef.current,
          )
        ) {
          return;
        }
        const payload =
          message.payload &&
          typeof message.payload === "object" &&
          !Array.isArray(message.payload)
            ? (message.payload as { mode?: unknown; value?: unknown })
            : {};
        switch (message.action) {
          case "CLOSE":
          case "WINDOW_CLOSED":
          case "WINDOW_HIDDEN_FOR_REUSE":
            setShowTradingSettingsModal(false);
            break;
          case "SET_BUY_TRADE_INPUT_MODE":
            if (
              payload.mode === "LOT" ||
              payload.mode === "AMOUNT" ||
              payload.mode === "RATIO"
            ) {
              setBuyTradeInputMode(payload.mode);
            }
            break;
          case "SET_BUY_LOT_INPUT":
            setBuyLotInput(normalizeInput(String(payload.value ?? "")));
            break;
          case "SET_BUY_AMOUNT_INPUT":
            setBuyAmountInput(normalizeInput(String(payload.value ?? "")));
            break;
          case "SET_BUY_RATIO_INPUT":
            setBuyRatioInput(String(payload.value ?? ""));
            break;
          case "SET_BUY_PRICE_MODE":
            if (payload.mode === "CUR_CLOSE" || payload.mode === "NEXT_OPEN") {
              setBuyPriceMode(payload.mode);
            }
            break;
          default:
            break;
        }
      }),
    [
      normalizeInput,
      setBuyAmountInput,
      setBuyLotInput,
      setBuyPriceMode,
      setBuyRatioInput,
      setBuyTradeInputMode,
      setShowTradingSettingsModal,
    ],
  );

  const trainingRecordNoteModalArgs = buildRuntimeTrainingRecordNoteModalProps({
    note: activeTrainingRecordNote,
    language,
    defaultTitle: DEFAULT_REPLAY_NOTE_TITLE_BY_LANGUAGE[language],
    loadingLabel: tt("appText.loading3"),
    completeLabel: tt("appText.done"),
    cancelLabel: tt("appText.cancel"),
    deleteLabel: tt("appText.delete2"),
    createdAtLabel: tt("appText.created"),
    colorLabel: tt("appText.color"),
    isNewlyCreatedAtLocation: isActiveTrainingRecordNoteNewlyCreated,
    notesPageController,
    withLabelValue,
    onCompleteClose: closeActiveTrainingRecordNote,
    onCancelNewlyCreatedNote: cancelActiveTrainingRecordNote,
    onTitleChange: updateReplayNoteTitle,
    onTitleBlur: commitReplayNoteTitle,
    onContentDocumentChange: updateReplayNoteContent,
    onColorTokensChange: updateReplayNoteColorTokens,
    renderSnapshot: renderTrainingNoteSnapshot,
  });

  const utilityDialogsModalArgs = buildRuntimeUtilityDialogsModalProps({
    actionDialogOpen: Boolean(actionDialog),
    noticeDialog,
    noticeCountdownSec,
    setNoticeDialog,
    orderEndPrompt,
    setOrderEndPrompt,
    onConfirmOrderEndPrompt: handleConfirmOrderEndPrompt,
    compactScriptLanguage,
    tt,
    ttf,
  });

  const modalProps = buildRuntimeModalPropsBundle({
    csvMappingModalProps: csvMappingModalArgs,
    trainerModalHostProps: trainerModalHostArgs,
    trainingRecordNoteModalProps: trainingRecordNoteModalArgs,
    utilityDialogsProps: utilityDialogsModalArgs,
  });

  const actionDialogHistoryReview = buildRuntimeActionDialogHistoryReviewBindings(
    {
      actionDialogOpen: Boolean(actionDialog),
      barCount: bars.length,
      sessionId,
      snapshot,
      trainerDisplayPeriod,
      buildCurrentReplayContext,
      createHistoryReviewReplayNote,
      setError,
      missingContextMessage: tt("appText.createTrainingRecordNotes"),
    },
  );

  const actionDialogBindings = buildRuntimeActionDialogBindings({
    summary: actionDialog?.summary ?? null,
    title: actionDialogTitle,
    description: actionDialogDesc,
    replayMetrics: actionDialogReplayMetrics,
    baseTimeframe: effectiveTrainingBaseTimeframe,
    language,
    themeMode: effectiveThemeMode,
    isActionBlocked: isPreparingAction,
    onClose: handleCloseActionDialog,
    onConfirm: handleConfirmActionDialog,
    createHistoryReviewNoteLabel: tt("appText.addPostSimulationReviewNote"),
  });

  const workspaceSwitcherBase = buildRuntimeWorkspaceSwitcherBaseBindings({
    activePage,
    onDisplayedPageChange: scope.setDisplayedWorkspacePage,
    canResumeTrainerSession,
    onResumeTrainerSession: handleResumeLatestTrainerSessionStable,
    tt,
    ui,
    language,
    priceColorMode,
    sharedTrainerChartWorkspaceProps,
    enabledSamplePoolSymbols: combinedEnabledPoolSymbols,
    enabledSamplePools: enabledSpecialTrainingSamplePools,
    globalResetRevision,
    onSpecialTrainingChartSync: syncSpecialTrainingChartState,
    onSpecialTrainingShortcutBindingsChange:
      handleSpecialTrainingShortcutBindingsChange,
    onCreateSpecialTrainingChallengeReviewNote:
      handleCreateSpecialTrainingChallengeReviewNote,
    resolveSamplePoolDisplayName,
    setError,
    showNotice,
    statsTitle: ui.statsTitle,
  });

  const {
    csvMappingModalProps,
    trainerModalHostProps,
    utilityDialogsProps,
    actionDialogNode,
    workspaceSwitcherProps,
  } = useAppRootWorkspaceDesktopBindings({
    workspacePageBundleArgs,
    setActivePage,
    buildDesktopShellBindingsArgs: (workspaceShellArgs) =>
      buildRuntimeDesktopBindingsArgs({
        workspaceShellArgs,
        modalProps,
        actionDialogHistoryReview,
        actionDialog: actionDialogBindings,
        workspaceSwitcherBase,
      }),
  });
  return { actionDialogBindings, actionDialogHistoryReview, actionDialogNode, csvMappingModalProps, modalProps, trainerModalHostArgs, trainerModalHostProps, trainerTradingDefaultsPayload, trainerTradingDefaultsWindowOpenedRef, trainingRecordNoteModalArgs, utilityDialogsModalArgs, utilityDialogsProps, workspaceSwitcherBase, workspaceSwitcherProps };
};
