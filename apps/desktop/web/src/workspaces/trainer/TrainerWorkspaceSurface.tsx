// SPDX-License-Identifier: GPL-3.0-only

import { api } from "@/api";
import { useI18n } from "@/frontend-kernel/i18n";
import { resolveTrainerTradingCapacityDisplay } from "@/domains/trainer/trainerTradingCapacityDisplay";
import type {
  TrainerStartPointInlineHistoryStatus,
} from "@/domains/trainer/trainerStartPointTypes";
import { WorkspacePageShell } from "@/ui/components";
import { formatMoneyFixed } from "@/ui/formatting/format";
import { TrainerMarketPresetOverviewDialog } from "@/workspaces/trainer/TrainerMarketPresetOverviewDialog";
import type { TrainerMarketPresetPanelMode } from "@/workspaces/trainer/TrainerMarketPresetInlinePanel";
import { TrainerStartPointDrawer } from "@/workspaces/trainer/TrainerStartPointDrawer";
import { TrainerWorkspaceLiveSurface } from "@/workspaces/trainer/TrainerWorkspaceLiveSurface";
import { TrainerWorkspacePrepSurface } from "@/workspaces/trainer/TrainerWorkspacePrepSurface";
import type {
  OrderPriceMode,
  TrainerWorkspacePageProps,
} from "@/workspaces/trainer/trainerWorkspaceSurfaceTypes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDesktopHelpContextReporter } from "@/domains/desktop-help/DesktopHelpContext";

const EXECUTION_BREAKDOWN_EPSILON = 1e-8;

export type { TrainerWorkspacePageProps } from "@/workspaces/trainer/trainerWorkspaceSurfaceTypes";

export const TrainerWorkspacePage = (props: TrainerWorkspacePageProps) => {
  const {
    embedded = false,
    onboardingTargetId = null,
    ui,
    freeReplaySetup,
    tradingAssetUi,
    tradingPresetEditor,
    tt,
    ttf,
    trainerHydrationState,
    isBusy,
    isPreparingAction,
    securitiesDelta,
    securitiesAccount,
    currentPosition,
    currentLeverageSummary,
    floatingRate,
    cumulativePnlRate,
    tradeCapacity,
    buyEstimate,
    sellEstimate,
    buyPriceMode,
    buyOrderDisabled,
    buyBlockReason,
    sellOrderDisabled,
    sellBlockReason,
    tradeLogSideStats,
    formatMoney,
    formatSignedMoney,
    formatTradingQuantityText,
    withBuySellCount,
    setBuyPriceMode,
    canUndo,
    undoAvailableSteps,
    undoMaxSteps,
    lastUndoableAction,
  } = props;
  const { t } = useI18n();
  useDesktopHelpContextReporter({
    active: (props.isActive ?? true) && !embedded,
    contextId: freeReplaySetup.isPrepMode ? "TRAINER_PREP" : "TRAINER_SESSION",
    workspace: "TRAINER",
  });
  const buyActionLabel = t("common.action.buy");
  const sellActionLabel = t("common.action.sell");
  const middleDot = t("common.symbol.middleDot");
  const percentSymbol = t("common.symbol.percent");
  const noneLabel = t("common.placeholder.none");
  const randomLabel = t("uiLabels.ui.random");
  const [marketPresetMenuMode, setMarketPresetMenuMode] = useState<
    TrainerMarketPresetPanelMode | null
  >(null);
  const [isTradingAssetWindowOpen, setIsTradingAssetWindowOpen] =
    useState(false);
  const tradingAssetWindowOpenedRef = useRef(false);
  const tradingAssetWindowRevisionRef = useRef(0);
  const tradingAssetWindowLifecycleRef = useRef(0);
  const pendingTradingAssetWindowOpenRequestRef = useRef(false);
  const [
    tradingAssetWindowOpenRequestVersion,
    setTradingAssetWindowOpenRequestVersion,
  ] = useState(0);
  const mirrorTradingEnvironmentWindowToPrepRef = useRef(false);
  const [isMarketPresetOverviewOpen, setIsMarketPresetOverviewOpen] =
    useState(false);
  const [isStartPointWindowOpen, setIsStartPointWindowOpen] = useState(false);
  const [startPointInlineHistoryStatus, setStartPointInlineHistoryStatus] =
    useState<TrainerStartPointInlineHistoryStatus | null>(null);
  const [isAccountSettingsMenuOpen, setIsAccountSettingsMenuOpen] =
    useState(false);

  const formatGlassPnlRatio = useCallback(
    (value: number) => {
      if (!Number.isFinite(value)) {
        return noneLabel;
      }
      return `${formatMoneyFixed(value * 100, 2)}${percentSymbol}`;
    },
    [noneLabel, percentSymbol],
  );

  const trainerTradingEnvironmentWindowPayload = useMemo(() => {
    const panel = tradingPresetEditor.trainerSettingsPanel;
    const serializablePanel = Object.fromEntries(
      Object.entries(panel).filter(
        ([key, value]) =>
          key !== "replaySettingsAssetClassOptions" &&
          typeof value !== "function",
      ),
    );
    return {
      tradingSettingsText: tradingPresetEditor.tradingSettingsText,
      trainerSettingsPanel: {
        ...serializablePanel,
        replaySettingsAssetClassOptions:
          panel.replaySettingsAssetClassOptions.map(({ value, label }) => ({
            value,
            label,
          })),
      },
      copy: {
        title: freeReplaySetup.environmentTitle,
        presetNameLabel:
          freeReplaySetup.environmentPresetLabel ??
          freeReplaySetup.environmentTitle,
      },
    };
  }, [
    freeReplaySetup.environmentPresetLabel,
    freeReplaySetup.environmentTitle,
    tradingPresetEditor.tradingSettingsText,
    tradingPresetEditor.trainerSettingsPanel,
  ]);

  const selectedTradingEnvironmentPresetId = useMemo(
    () =>
      tradingPresetEditor.trainerSettingsPanel.marketPresetChips.find(
        (chip) => chip.isSelected,
      )?.id ?? "",
    [tradingPresetEditor.trainerSettingsPanel.marketPresetChips],
  );

  const trainerStartPointWindowPayload = useMemo(() => {
    if (!freeReplaySetup.startPointWindowPayload) {
      return null;
    }
    const hasSelectedSymbol = Boolean(
      String(freeReplaySetup.selectedSymbolId || "").trim(),
    );
    return {
      ...freeReplaySetup.startPointWindowPayload,
      title: freeReplaySetup.startPointLabel,
      description: hasSelectedSymbol
        ? `${freeReplaySetup.symbolLabel} ${middleDot} ${freeReplaySetup.selectedSymbol}`
        : undefined,
    };
  }, [
    freeReplaySetup.selectedSymbol,
    freeReplaySetup.selectedSymbolId,
    freeReplaySetup.startPointLabel,
    freeReplaySetup.startPointWindowPayload,
    freeReplaySetup.symbolLabel,
    middleDot,
  ]);

  const tradeLogBuySellStats = useMemo(() => {
    const rawText = withBuySellCount(
      tradeLogSideStats.buyCount,
      tradeLogSideStats.sellCount,
    );
    const delimiterMatch = rawText.match(/\s*\/\s*/);
    if (!delimiterMatch) {
      return {
        buyText: rawText.trim(),
        sellText: "",
        separator: "",
      };
    }
    const separator = delimiterMatch[0];
    const separatorIndex = rawText.indexOf("/");
    if (separatorIndex < 0) {
      return {
        buyText: rawText.trim(),
        sellText: "",
        separator: "",
      };
    }
    return {
      buyText: rawText.slice(0, separatorIndex).trim(),
      sellText: rawText.slice(separatorIndex + 1).trim(),
      separator,
    };
  }, [
    tradeLogSideStats.buyCount,
    tradeLogSideStats.sellCount,
    withBuySellCount,
  ]);

  const lastUndoableActionLabel = useMemo(() => {
    switch (lastUndoableAction) {
      case "BUY":
        return buyActionLabel;
      case "SELL":
        return sellActionLabel;
      case "STEP":
        return ui.nextBar;
      default:
        return noneLabel;
    }
  }, [buyActionLabel, lastUndoableAction, noneLabel, sellActionLabel, ui.nextBar]);

  const undoButtonTitle = useMemo(
    () =>
      canUndo
        ? `${tt("appText.undo")} ${middleDot} ${lastUndoableActionLabel} ${middleDot} ${undoAvailableSteps}/${undoMaxSteps} ${middleDot} Cmd/Ctrl+Z`
        : `${tt("appText.undo")} ${middleDot} ${tt("appText.undoStepsAvailable")} ${middleDot} Cmd/Ctrl+Z`,
    [
      canUndo,
      lastUndoableActionLabel,
      middleDot,
      tt,
      undoAvailableSteps,
      undoMaxSteps,
    ],
  );

  const buyBlockMessageText = useMemo(
    () => String(buyBlockReason ?? "").trim(),
    [buyBlockReason],
  );
  const sellBlockMessageText = useMemo(
    () => String(sellBlockReason ?? "").trim(),
    [sellBlockReason],
  );
  const buyOrderButtonLabel =
    buyOrderDisabled && buyBlockMessageText
      ? buyBlockMessageText
      : tt("appText.buy");
  const sellOrderButtonLabel =
    sellOrderDisabled && sellBlockMessageText
      ? sellBlockMessageText
      : tt("appText.sell");
  const buyOrderButtonClassName = `trade-side-action ${
    buyOrderDisabled && buyBlockMessageText ? "is-reason-inline" : ""
  }`.trim();
  const sellOrderButtonClassName = `trade-side-action ${
    sellOrderDisabled && sellBlockMessageText ? "is-reason-inline" : ""
  }`.trim();

  const availableFundsValue = Number(
    tradeCapacity.availableCash ?? securitiesAccount?.balance ?? 0,
  );
  const positionQtyValue = Number(currentPosition?.qty ?? 0);
  const shortFee = Number(
    currentLeverageSummary?.totalFee ??
      currentLeverageSummary?.cumulativeLongFinancingFee ??
      currentLeverageSummary?.cumulativeShortFee ??
      currentLeverageSummary?.longFinancingFee ??
      currentLeverageSummary?.shortFee ??
      0,
  );
  const hasCarryCost = Math.abs(shortFee) > 1e-8;
  const calendarSpanLabel = tt("appText.calendarSpan");
  const replaySpanLabel = tt("appText.replaySpan");
  const tradingCapacityDisplay = resolveTrainerTradingCapacityDisplay({
    assetClass: tradingAssetUi.assetClass,
    allowLongMarginTrading: Boolean(currentLeverageSummary?.allowLongMarginTrading),
    allowShortSelling: Boolean(currentLeverageSummary?.allowShortSelling),
    tradeCapacity,
    formatMoney,
    formatTradingQuantityText,
    tt,
  });
  const longCapacityLabel = tradingCapacityDisplay.long.label;
  const longCapacityValue = tradingCapacityDisplay.long.value;
  const shortCapacityLabel = tradingCapacityDisplay.short.label;
  const shortCapacityValue = tradingCapacityDisplay.short.value;
  const showShortOpenCapacityMenu =
    tradingCapacityDisplay.short.showsShortOpenCapacity;
  const shortFeeLabel = tt("appText.includesBorrowFinancingCosts");
  const shortFeeValue = formatMoney(shortFee);
  const tradingRulesActionLabel = t("trainer.position.tradingRulesAction");
  const floatingPnlValue = Number(currentPosition?.unrealizedPnl ?? 0);
  const floatingPnlText = formatSignedMoney(floatingPnlValue);
  const floatingPnlRatioText = formatGlassPnlRatio(floatingRate);
  const cumulativePnlText = formatSignedMoney(securitiesDelta);
  const cumulativePnlRatioText = formatGlassPnlRatio(cumulativePnlRate);
  const formatExecutionBreakdownText = useCallback(
    (breakdown: typeof buyEstimate.executionBreakdown): string => {
      if (
        !(
          breakdown.closeQty > EXECUTION_BREAKDOWN_EPSILON &&
          breakdown.openQty > EXECUTION_BREAKDOWN_EPSILON
        )
      ) {
        return "";
      }
      const closeText = formatTradingQuantityText(breakdown.closeQty, "ORDER_PRIMARY");
      const openText = formatTradingQuantityText(breakdown.openQty, "ORDER_PRIMARY");
      if (
        breakdown.closeDirection === "SHORT" &&
        breakdown.openDirection === "LONG"
      ) {
        return ttf("appText.coverShortValue0PlusOpenLongValue1", [closeText, openText]);
      }
      if (
        breakdown.closeDirection === "LONG" &&
        breakdown.openDirection === "SHORT"
      ) {
        return ttf("appText.sellLongValue0PlusOpenShortValue1", [closeText, openText]);
      }
      return "";
    },
    [formatTradingQuantityText, ttf],
  );
  const buyExecutionBreakdownText = useMemo(
    () => formatExecutionBreakdownText(buyEstimate.executionBreakdown),
    [buyEstimate.executionBreakdown, formatExecutionBreakdownText],
  );
  const sellExecutionBreakdownText = useMemo(
    () => formatExecutionBreakdownText(sellEstimate.executionBreakdown),
    [formatExecutionBreakdownText, sellEstimate.executionBreakdown],
  );
  const prepDisabled = isBusy || isPreparingAction;
  const hydrationBusy =
    trainerHydrationState === "LAUNCHING" ||
    trainerHydrationState === "HYDRATING";
  const trainerHydrationOverlayLabel = tt("appText.loading3");
  const blindBoxShowLabel =
    freeReplaySetup.blindBoxOptions.find((option) => option.value === "SHOW")
      ?.label ?? freeReplaySetup.blindBoxLabel;
  const blindBoxHideLabel =
    freeReplaySetup.blindBoxOptions.find((option) => option.value === "HIDE")
      ?.label ?? freeReplaySetup.blindBoxActiveLabel;
  const isBlindBoxHidden = freeReplaySetup.blindBoxValue === "HIDE";
  const effectivePrepMode = freeReplaySetup.selectedMode;
  const showBlindBoxStatusPill =
    effectivePrepMode === "RANDOM" && isBlindBoxHidden;
  const referencePriceModeLabel =
    buyPriceMode === "CUR_CLOSE" ? ui.currentClose : ui.nextOpen;
  const activeReferenceOrderPrice =
    buyEstimate.price > 0 ? buyEstimate.price : sellEstimate.price;
  const handleSelectReferencePriceMode = useCallback(
    (nextMode: OrderPriceMode) => {
      setBuyPriceMode(nextMode);
    },
    [setBuyPriceMode],
  );

  const openTradingAssetSettingsWindow = useCallback(() => {
    pendingTradingAssetWindowOpenRequestRef.current = false;
    mirrorTradingEnvironmentWindowToPrepRef.current = false;
    tradingAssetWindowLifecycleRef.current += 1;
    setIsTradingAssetWindowOpen(true);
    tradingAssetWindowOpenedRef.current = true;
    void api
      .openDesktopSecondaryWindow({
        kind: "TRAINER_TRADING_ENVIRONMENT",
        title: freeReplaySetup.environmentTitle,
        payload: trainerTradingEnvironmentWindowPayload,
      })
      .then((state) => {
        tradingAssetWindowRevisionRef.current = state.revision;
      })
      .catch(() => {
        tradingAssetWindowLifecycleRef.current += 1;
        setIsTradingAssetWindowOpen(false);
        tradingAssetWindowOpenedRef.current = false;
        tradingAssetWindowRevisionRef.current = 0;
        mirrorTradingEnvironmentWindowToPrepRef.current = false;
      });
  }, [freeReplaySetup.environmentTitle, trainerTradingEnvironmentWindowPayload]);

  const handleTradingAssetWindowSave = useCallback(() => {
    const saveLifecycleId = tradingAssetWindowLifecycleRef.current;
    const saveResult = tradingPresetEditor.trainerSettingsPanel.onSave();
    void Promise.resolve(saveResult)
      .then((result) => {
        if (
          result === false ||
          saveLifecycleId !== tradingAssetWindowLifecycleRef.current ||
          !tradingAssetWindowOpenedRef.current
        ) {
          return;
        }
        void api.closeDesktopSecondaryWindow("TRAINER_TRADING_ENVIRONMENT");
      })
      .catch(() => undefined);
  }, [tradingPresetEditor.trainerSettingsPanel]);

  const openTradingAssetSettingsDrawer = useCallback(() => {
    setMarketPresetMenuMode(null);
    setIsAccountSettingsMenuOpen(false);
    setIsMarketPresetOverviewOpen(false);
    setIsStartPointWindowOpen(false);
    pendingTradingAssetWindowOpenRequestRef.current = true;
    setTradingAssetWindowOpenRequestVersion((version) => version + 1);
  }, []);

  const openMarketPresetOverviewDialog = useCallback(() => {
    setMarketPresetMenuMode(null);
    setIsAccountSettingsMenuOpen(false);
    setIsTradingAssetWindowOpen(false);
    setIsStartPointWindowOpen(false);
    pendingTradingAssetWindowOpenRequestRef.current = false;
    setIsMarketPresetOverviewOpen(true);
  }, []);

  const openStartPointWindow = useCallback(() => {
    const hasSelectedSymbol = Boolean(
      String(freeReplaySetup.selectedSymbolId || "").trim(),
    );
    if (prepDisabled || !hasSelectedSymbol || !trainerStartPointWindowPayload) {
      return;
    }
    setMarketPresetMenuMode(null);
    setIsAccountSettingsMenuOpen(false);
    setIsTradingAssetWindowOpen(false);
    setIsMarketPresetOverviewOpen(false);
    pendingTradingAssetWindowOpenRequestRef.current = false;
    setIsStartPointWindowOpen(true);
  }, [
    freeReplaySetup.selectedSymbolId,
    prepDisabled,
    trainerStartPointWindowPayload,
  ]);

  const trainerStartPointInlineHistoryPayload = useMemo(() => {
    if (!trainerStartPointWindowPayload) {
      return null;
    }
    return {
      ...trainerStartPointWindowPayload,
      isDisabled: prepDisabled || trainerStartPointWindowPayload.isDisabled,
    };
  }, [prepDisabled, trainerStartPointWindowPayload]);

  useEffect(() => {
    if (!pendingTradingAssetWindowOpenRequestRef.current) {
      return;
    }
    if (freeReplaySetup.isPrepMode) {
      const nextAssetClass = freeReplaySetup.selectedEnvironmentAssetClass;
      const nextPresetId = String(
        freeReplaySetup.selectedEnvironmentPresetId || "",
      ).trim();
      if (
        tradingPresetEditor.trainerSettingsPanel.tradingAssetClass !==
        nextAssetClass
      ) {
        tradingPresetEditor.trainerSettingsPanel.onTradingAssetClassChange(
          nextAssetClass,
        );
        return;
      }
      if (nextPresetId && selectedTradingEnvironmentPresetId !== nextPresetId) {
        tradingPresetEditor.trainerSettingsPanel.onSelectTradingMarketPreset(
          nextPresetId,
        );
        return;
      }
    }
    openTradingAssetSettingsWindow();
  }, [
    freeReplaySetup.isPrepMode,
    freeReplaySetup.selectedEnvironmentAssetClass,
    freeReplaySetup.selectedEnvironmentPresetId,
    openTradingAssetSettingsWindow,
    selectedTradingEnvironmentPresetId,
    tradingAssetWindowOpenRequestVersion,
    tradingPresetEditor.trainerSettingsPanel,
  ]);

  useEffect(() => {
    if (!tradingAssetWindowOpenedRef.current) {
      return;
    }
    void api
      .publishDesktopSecondaryWindowState({
        kind: "TRAINER_TRADING_ENVIRONMENT",
        title: freeReplaySetup.environmentTitle,
        payload: trainerTradingEnvironmentWindowPayload,
      })
      .then((state) => {
        tradingAssetWindowRevisionRef.current = state.revision;
      })
      .catch(() => {
        tradingAssetWindowLifecycleRef.current += 1;
        setIsTradingAssetWindowOpen(false);
        tradingAssetWindowOpenedRef.current = false;
        tradingAssetWindowRevisionRef.current = 0;
        mirrorTradingEnvironmentWindowToPrepRef.current = false;
      });
  }, [freeReplaySetup.environmentTitle, trainerTradingEnvironmentWindowPayload]);

  useEffect(() => {
    if (
      !isTradingAssetWindowOpen ||
      !freeReplaySetup.isPrepMode ||
      !mirrorTradingEnvironmentWindowToPrepRef.current
    ) {
      return;
    }
    const nextAssetClass =
      tradingPresetEditor.trainerSettingsPanel.tradingAssetClass;
    if (nextAssetClass !== freeReplaySetup.selectedEnvironmentAssetClass) {
      freeReplaySetup.onSelectEnvironmentAssetClass(nextAssetClass);
    }
    if (
      selectedTradingEnvironmentPresetId &&
      selectedTradingEnvironmentPresetId !==
        freeReplaySetup.selectedEnvironmentPresetId
    ) {
      freeReplaySetup.onSelectEnvironmentPreset(
        selectedTradingEnvironmentPresetId,
      );
    }
  }, [
    freeReplaySetup.isPrepMode,
    freeReplaySetup.onSelectEnvironmentAssetClass,
    freeReplaySetup.onSelectEnvironmentPreset,
    freeReplaySetup.selectedEnvironmentAssetClass,
    freeReplaySetup.selectedEnvironmentPresetId,
    isTradingAssetWindowOpen,
    selectedTradingEnvironmentPresetId,
    tradingPresetEditor.trainerSettingsPanel.tradingAssetClass,
  ]);

  useEffect(
    () =>
      api.subscribeDesktopSecondaryWindowActions((message) => {
        if (!(props.isActive ?? true)) {
          return;
        }
        if (message.kind !== "TRAINER_TRADING_ENVIRONMENT") {
          return;
        }
        if (message.action === "SAVE") {
          handleTradingAssetWindowSave();
          return;
        }
        if (
          !api.isCurrentDesktopSecondaryWindowAction(
            message,
            tradingAssetWindowRevisionRef.current,
          )
        ) {
          return;
        }
        if (message.action === "WINDOW_CLOSED") {
          tradingAssetWindowLifecycleRef.current += 1;
          setIsTradingAssetWindowOpen(false);
          tradingAssetWindowOpenedRef.current = false;
          tradingAssetWindowRevisionRef.current = 0;
          mirrorTradingEnvironmentWindowToPrepRef.current = false;
          return;
        }
        if (message.action !== "CALLBACK") {
          return;
        }
        const payload =
          message.payload &&
          typeof message.payload === "object" &&
          !Array.isArray(message.payload)
            ? (message.payload as { callbackName?: unknown; args?: unknown })
            : {};
        const callbackName = String(payload.callbackName || "").trim();
        const args = Array.isArray(payload.args) ? payload.args : [];
        const shouldMirrorPrepEnvironment =
          callbackName === "onTradingAssetClassChange" ||
          callbackName === "onSelectTradingMarketPreset" ||
          callbackName === "onCreateTradingMarketPresetFromCurrent" ||
          callbackName === "onRenameTradingMarketPresetById" ||
          callbackName === "onDeleteTradingMarketPresetById" ||
          callbackName === "onResetAllTradingAssetParameters" ||
          callbackName === "onSaveTradingMarketPresetToCurrent" ||
          callbackName === "onSaveTradingMarketPresetAsNew";
        if (freeReplaySetup.isPrepMode && shouldMirrorPrepEnvironment) {
          mirrorTradingEnvironmentWindowToPrepRef.current = true;
        }
        const callback =
          tradingPresetEditor.trainerSettingsPanel[
            callbackName as keyof typeof tradingPresetEditor.trainerSettingsPanel
          ];
        if (typeof callback === "function") {
          if (callbackName === "onSave") {
            handleTradingAssetWindowSave();
            return;
          }
          (callback as (...nextArgs: unknown[]) => unknown)(...args);
        }
        if (!freeReplaySetup.isPrepMode) {
          return;
        }
        if (callbackName === "onTradingAssetClassChange") {
          const nextAssetClass = args[0];
          if (
            nextAssetClass === "STOCK" ||
            nextAssetClass === "FUTURES" ||
            nextAssetClass === "FOREX" ||
            nextAssetClass === "CRYPTO"
          ) {
            freeReplaySetup.onSelectEnvironmentAssetClass(nextAssetClass);
          }
        }
        if (callbackName === "onSelectTradingMarketPreset") {
          const nextPresetId = String(args[0] ?? "").trim();
          if (nextPresetId) {
            freeReplaySetup.onSelectEnvironmentPreset(nextPresetId);
          }
        }
      }),
    [
      freeReplaySetup.isPrepMode,
      freeReplaySetup.onSelectEnvironmentAssetClass,
      freeReplaySetup.onSelectEnvironmentPreset,
      handleTradingAssetWindowSave,
      tradingPresetEditor.trainerSettingsPanel,
    ],
  );

  useEffect(() => {
    if (isStartPointWindowOpen && !trainerStartPointWindowPayload) {
      setIsStartPointWindowOpen(false);
    }
  }, [isStartPointWindowOpen, trainerStartPointWindowPayload]);

  const handleMarketPresetMenuOpenChange = useCallback(
    (mode: TrainerMarketPresetPanelMode, nextOpen: boolean) => {
      if (nextOpen) {
        setIsAccountSettingsMenuOpen(false);
      }
      setMarketPresetMenuMode((currentMode) => {
        if (nextOpen) {
          return mode;
        }
        return currentMode === mode ? null : currentMode;
      });
    },
    [],
  );

  useEffect(() => {
    if (onboardingTargetId !== "FREE_REPLAY_PREP_CONFIG") {
      return;
    }
    setMarketPresetMenuMode(null);
    setIsAccountSettingsMenuOpen(false);
    setIsTradingAssetWindowOpen(false);
    setIsMarketPresetOverviewOpen(false);
    setIsStartPointWindowOpen(false);
    pendingTradingAssetWindowOpenRequestRef.current = false;
    if (!freeReplaySetup.isPrepMode) {
      freeReplaySetup.onResetToPrepView();
    }
  }, [freeReplaySetup.isPrepMode, freeReplaySetup.onResetToPrepView, onboardingTargetId]);

  const activeModeIndex = Math.max(
    0,
    freeReplaySetup.modeOptions.findIndex(
      (option) => option.value === effectivePrepMode,
    ),
  );
  const activeModeIndicatorTransform =
    activeModeIndex === 0
      ? "translateX(0)"
      : "translateX(calc(100% + var(--trainer-prep-mode-switch-gap)))";
  const launchFxDisabled = prepDisabled;
  const disableEndAllTrainingAction =
    isPreparingAction || freeReplaySetup.isPrepMode || hydrationBusy;
  const handleStartPrepSession = useCallback(() => {
    if (launchFxDisabled || freeReplaySetup.startDisabled) {
      // eslint-disable-next-line no-console
      console.warn("[free-replay] start blocked", {
        launchFxDisabled,
        startDisabled: freeReplaySetup.startDisabled,
        isBusy,
        isPreparingAction,
      });
      return;
    }
    freeReplaySetup.onStart();
  }, [freeReplaySetup, launchFxDisabled, isBusy, isPreparingAction]);
  const handleStartPointInlineHistoryStatusChange = useCallback(
    (status: TrainerStartPointInlineHistoryStatus | null) => {
      setStartPointInlineHistoryStatus((current) => {
        if (
          current?.progressText === status?.progressText &&
          current?.remainingText === status?.remainingText &&
          current?.anchorText === status?.anchorText
        ) {
          return current;
        }
        return status;
      });
    },
    [],
  );
  const prepFooterHelperText = freeReplaySetup.showEmptyStateText
    ? freeReplaySetup.emptyStateText
    : freeReplaySetup.startHelperText;
  const hasSelectedFocusedSymbol = Boolean(
    String(freeReplaySetup.selectedSymbolId || "").trim(),
  );
  const canUseFocusedStartPoint =
    hasSelectedFocusedSymbol && !trainerStartPointWindowPayload?.isDisabled;
  const visibleStartPointInlineHistoryStatus =
    canUseFocusedStartPoint && trainerStartPointInlineHistoryPayload
      ? startPointInlineHistoryStatus
      : null;
  const environmentRuleDetailsLabel = t("uiLabels.ui.reviewDetailAction");

  return (
    <WorkspacePageShell
      template="workbench"
      className={`trainer-workspace-page ${
        freeReplaySetup.isPrepMode ? "is-prep-mode" : ""
      } ${embedded ? "is-embedded" : ""}`}
      bodyClassName="trainer-workspace-body"
    >
      {embedded || freeReplaySetup.isPrepMode ? null : (
        <div className="trainer-top-gap" aria-hidden="true" />
      )}
      {freeReplaySetup.isPrepMode ? (
        <TrainerWorkspacePrepSurface
          freeReplaySetup={freeReplaySetup}
          prepDisabled={prepDisabled}
          isBusy={isBusy}
          isActive={props.isActive ?? true}
          isPreparingAction={isPreparingAction}
          isTradingAssetWindowOpen={isTradingAssetWindowOpen}
          isStartPointWindowOpen={isStartPointWindowOpen}
          effectivePrepMode={effectivePrepMode}
          activeModeIndicatorTransform={activeModeIndicatorTransform}
          launchFxDisabled={launchFxDisabled}
          randomLabel={randomLabel}
          blindBoxShowLabel={blindBoxShowLabel}
          blindBoxHideLabel={blindBoxHideLabel}
          isBlindBoxHidden={isBlindBoxHidden}
          showBlindBoxStatusPill={showBlindBoxStatusPill}
          prepFooterHelperText={prepFooterHelperText}
          environmentRuleDetailsLabel={environmentRuleDetailsLabel}
          trainerStartPointWindowPayload={trainerStartPointWindowPayload}
          trainerStartPointInlineHistoryPayload={trainerStartPointInlineHistoryPayload}
          visibleStartPointInlineHistoryStatus={visibleStartPointInlineHistoryStatus}
          canUseFocusedStartPoint={canUseFocusedStartPoint}
          handleStartPrepSession={handleStartPrepSession}
          handleStartPointInlineHistoryStatusChange={
            handleStartPointInlineHistoryStatusChange
          }
          openStartPointWindow={openStartPointWindow}
          openTradingAssetSettingsDrawer={openTradingAssetSettingsDrawer}
        />
      ) : (
        <TrainerWorkspaceLiveSurface
          pageProps={props}
          noneLabel={noneLabel}
          buyActionLabel={buyActionLabel}
          sellActionLabel={sellActionLabel}
          tradeLogBuySellStats={tradeLogBuySellStats}
          marketPresetMenuMode={marketPresetMenuMode}
          isAccountSettingsMenuOpen={isAccountSettingsMenuOpen}
          setIsAccountSettingsMenuOpen={setIsAccountSettingsMenuOpen}
          openMarketPresetOverviewDialog={openMarketPresetOverviewDialog}
          longMarketPresetPanelId="trainer-market-preset-long-panel"
          shortMarketPresetPanelId="trainer-market-preset-short-panel"
          accountSettingsPanelId="trainer-account-settings-panel"
          handleMarketPresetMenuOpenChange={handleMarketPresetMenuOpenChange}
          longCapacityLabel={longCapacityLabel}
          longCapacityValue={longCapacityValue}
          shortCapacityLabel={shortCapacityLabel}
          shortCapacityValue={shortCapacityValue}
          showShortOpenCapacityMenu={showShortOpenCapacityMenu}
          shortFeeLabel={shortFeeLabel}
          shortFeeValue={shortFeeValue}
          hasCarryCost={hasCarryCost}
          availableFundsValue={availableFundsValue}
          positionQtyValue={positionQtyValue}
          floatingPnlValue={floatingPnlValue}
          floatingPnlText={floatingPnlText}
          floatingPnlRatioText={floatingPnlRatioText}
          cumulativePnlText={cumulativePnlText}
          cumulativePnlRatioText={cumulativePnlRatioText}
          buyExecutionBreakdownText={buyExecutionBreakdownText}
          sellExecutionBreakdownText={sellExecutionBreakdownText}
          disableEndAllTrainingAction={disableEndAllTrainingAction}
          hydrationBusy={hydrationBusy}
          trainerHydrationOverlayLabel={trainerHydrationOverlayLabel}
          tradingRulesActionLabel={tradingRulesActionLabel}
          buyOrderButtonLabel={buyOrderButtonLabel}
          sellOrderButtonLabel={sellOrderButtonLabel}
          buyOrderButtonClassName={buyOrderButtonClassName}
          sellOrderButtonClassName={sellOrderButtonClassName}
          referencePriceModeLabel={referencePriceModeLabel}
          activeReferenceOrderPrice={activeReferenceOrderPrice}
          handleSelectReferencePriceMode={handleSelectReferencePriceMode}
          undoButtonTitle={undoButtonTitle}
          calendarSpanLabel={calendarSpanLabel}
          replaySpanLabel={replaySpanLabel}
        />
      )}
      <TrainerMarketPresetOverviewDialog
        open={isMarketPresetOverviewOpen}
        onOpenChange={setIsMarketPresetOverviewOpen}
        activeMarketPresetLabel={tradingPresetEditor.activeMarketPresetLabel}
        tradingSettingsText={tradingPresetEditor.tradingSettingsText}
        trainerSettingsPanel={tradingPresetEditor.trainerSettingsPanel}
        tt={tt}
      />
      <TrainerStartPointDrawer
        open={isStartPointWindowOpen}
        isActive={props.isActive ?? true}
        payload={trainerStartPointWindowPayload}
        onOpenChange={setIsStartPointWindowOpen}
        onApplyAnchor={freeReplaySetup.onApplyStartPoint}
      />
    </WorkspacePageShell>
  );
};
