// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { hasApiErrorCode } from "@/api";
import type { OrderInputMode as TradeInputMode } from "@zinuto/shared/trading";
import type { TrainerOrderBlockReasonCode } from "@/domains/training/types";
import { resolveTrainerBlockReasonText } from "@/domains/trainer/trainerOrderBlockReasonText";
import {
  normalizeFixedRatioPresetOption,
} from "@/domains/trainer/tradingFormUtils";
import { formatMoneyFixed } from "@/ui/formatting/format";
import { POSITION_SIZE_OPTIONS } from "@/workspaces/special-training/domain/specialTrainingConstants";
import {
  executeSpecialTrainingChallengeAction,
  getSpecialTrainingChallengeOrderQuote,
  getSpecialTrainingChallengeRuntime,
} from "@/workspaces/special-training/services/specialTrainingApiService";
import {
  makeSpecialTrainingRiskInputQueue,
  type SpecialTrainingRiskCommandIntent,
  type SpecialTrainingRiskCommandQueue,
  type SpecialTrainingRiskCommandQueueExecutor,
} from "@/workspaces/special-training/session/riskDisciplineCommandQueue";
import {
  buildRiskDisciplineActionViewModel,
  type RiskUiActionBlockReasonCode,
} from "@/workspaces/special-training/view-models/specialTrainingRiskDisciplineActionViewModel";
import {
  buildCompletedStableRiskOrderTicketDisplayState,
  buildLoadingStableRiskOrderTicketDisplayState,
  buildRuntimeStableRiskOrderTicketDisplayState,
  resolveVisibleStableRiskOrderTicketDisplayState,
  type StableRiskOrderTicketDisplayState,
} from "@/workspaces/special-training/view-models/specialTrainingRiskOrderQuoteDisplayState";
import {
  readServerSessionFactsFromCommandResult,
  useSpecialTrainingResultDisplayMaterializer,
} from "@/workspaces/special-training/view-models/useSpecialTrainingResultDisplayMaterializer";
import type { SpecialTrainingPageProps } from "@/workspaces/special-training/specialTrainingPageTypes";
import type { SpecialTrainingPageState } from "@/workspaces/special-training/useSpecialTrainingPageState";

type UseSpecialTrainingRiskTradeInteractionsArgs = Pick<
  SpecialTrainingPageProps,
  "ui"
> & {
  state: SpecialTrainingPageState;
};

export const useSpecialTrainingRiskTradeInteractions = ({
  state,
  ui,
}: UseSpecialTrainingRiskTradeInteractionsArgs) => {
  const {
    activeMode,
    activeQuestion,
    activeQuestionId,
    applyBackendCompletion,
    applyCommandChallengeRuntime,
    challengeId,
    challengeRuntime,
    content,
    currentPrice,
    cursorIndex,
    isPageActive,
    isQuestionLoading,
    isTradeMode,
    normalizedChallengeId,
    questionBars,
    resolveRiskActionBlockedReasonText,
    runtime,
    setRuntime,
    setSubmitErrorMessage,
    settlement,
    textDoubleDash,
    tt,
    view,
  } = state;

  const [riskOrderInputMode, setRiskOrderInputMode] =
    useState<TradeInputMode>("RATIO");
  const [riskLotInput, setRiskLotInput] = useState("");
  const [riskAmountInput, setRiskAmountInput] = useState("");
  const [riskRatioInput, setRiskRatioInput] = useState(
    normalizeFixedRatioPresetOption(POSITION_SIZE_OPTIONS[0] ?? "25"),
  );
  const [riskPriceMode, setRiskPriceMode] = useState<"CUR_CLOSE" | "NEXT_OPEN">(
    "CUR_CLOSE",
  );
  const riskLotInputRef = useRef<HTMLInputElement | null>(null);
  const riskAmountInputRef = useRef<HTMLInputElement | null>(null);
  const isPageActiveRef = useRef(isPageActive);
  isPageActiveRef.current = isPageActive;
  const [riskOrderTicketDisplayState, setRiskOrderTicketDisplayState] =
    useState<StableRiskOrderTicketDisplayState | null>(null);
  const riskOrderTicketDisplayCacheRef = useRef(
    new Map<string, StableRiskOrderTicketDisplayState>(),
  );
  const riskQuoteRequestVersionRef = useRef(0);
  const riskCommandExecutorRef =
    useRef<SpecialTrainingRiskCommandQueueExecutor>(
      async () => ({ continueDraining: false }),
    );
  const riskCommandErrorHandlerRef = useRef<(error: unknown) => void>(() => {
    undefined;
  });
  const riskCommandQueueRef = useRef<SpecialTrainingRiskCommandQueue | null>(
    null,
  );
  riskCommandErrorHandlerRef.current = (error) => {
    void error;
    setSubmitErrorMessage(content.dataLoadFailedLabel);
  };
  if (!riskCommandQueueRef.current) {
    riskCommandQueueRef.current = makeSpecialTrainingRiskInputQueue({
      execute: (intent) => riskCommandExecutorRef.current(intent),
      onError: (error) => riskCommandErrorHandlerRef.current(error),
    });
  }
  const enqueueRiskCommand = useCallback(
    (intent: SpecialTrainingRiskCommandIntent): Promise<void> =>
      riskCommandQueueRef.current?.enqueue(intent) ?? Promise.resolve(),
    [],
  );
  const isRiskCommandQueueActive = useCallback(
    (): boolean => Boolean(riskCommandQueueRef.current?.isActive()),
    [],
  );
  useEffect(
    () => () => {
      riskCommandQueueRef.current?.clear();
    },
    [],
  );

  const materializeServerSettlement = useSpecialTrainingResultDisplayMaterializer({
    content,
  });
  const riskQuoteDisplayLifecycleActive =
    view === "TRAINING" &&
    activeMode?.id === "risk-discipline-training" &&
    settlement === null &&
    normalizedChallengeId.length > 0 &&
    activeQuestionId.length > 0 &&
    questionBars.length > 0;
  const visibleRiskOrderTicketDisplayState =
    resolveVisibleStableRiskOrderTicketDisplayState({
      state: riskOrderTicketDisplayState,
      lifecycleActive: riskQuoteDisplayLifecycleActive,
      questionId: activeQuestionId,
    });
  const riskQuoteRequest = useMemo(() => {
    if (!riskQuoteDisplayLifecycleActive || isQuestionLoading) {
      return null;
    }
    const basePayload = {
      inputMode: riskOrderInputMode,
      lotInput: riskLotInput,
      amountInput: riskAmountInput,
      ratioInput: riskRatioInput,
      priceMode: riskPriceMode,
      nextOpenDelayBars: 1,
    } as const;
    const key = JSON.stringify({
      challengeId: normalizedChallengeId,
      questionId: activeQuestionId,
      cursorIndex,
      usedOperations: runtime.usedOperations,
      openCount: runtime.openCount,
      positionQty: runtime.positionQty,
      cashBalance: runtime.cashBalance,
      inputMode: riskOrderInputMode,
      lotInput: riskLotInput,
      amountInput: riskAmountInput,
      ratioInput: riskRatioInput,
      priceMode: riskPriceMode,
    });
    return {
      key,
      questionId: activeQuestionId,
      challengeId: normalizedChallengeId,
      buyPayload: {
        ...basePayload,
        side: "BUY" as const,
      },
      sellPayload: {
        ...basePayload,
        side: "SELL" as const,
      },
    };
  }, [
    activeQuestionId,
    cursorIndex,
    isQuestionLoading,
    normalizedChallengeId,
    riskAmountInput,
    riskLotInput,
    riskOrderInputMode,
    riskPriceMode,
    riskQuoteDisplayLifecycleActive,
    riskRatioInput,
    runtime.cashBalance,
    runtime.openCount,
    runtime.positionQty,
    runtime.usedOperations,
  ]);
  useEffect(() => {
    if (!riskQuoteDisplayLifecycleActive) {
      riskQuoteRequestVersionRef.current += 1;
      riskOrderTicketDisplayCacheRef.current.clear();
      setRiskOrderTicketDisplayState(null);
      return;
    }
    if (!riskQuoteRequest) {
      riskQuoteRequestVersionRef.current += 1;
      return;
    }
    riskQuoteRequestVersionRef.current += 1;
    const requestVersion = riskQuoteRequestVersionRef.current;
    const cachedDisplayState = riskOrderTicketDisplayCacheRef.current.get(
      riskQuoteRequest.key,
    );
    if (cachedDisplayState) {
      setRiskOrderTicketDisplayState(cachedDisplayState);
      return;
    }
    const abortController = new AbortController();
    void Promise.all([
      getSpecialTrainingChallengeOrderQuote(
        riskQuoteRequest.challengeId,
        riskQuoteRequest.buyPayload,
        { signal: abortController.signal },
      ),
      getSpecialTrainingChallengeOrderQuote(
        riskQuoteRequest.challengeId,
        riskQuoteRequest.sellPayload,
        { signal: abortController.signal },
      ),
    ])
      .then(([buyQuote, sellQuote]) => {
        if (riskQuoteRequestVersionRef.current !== requestVersion) {
          return;
        }
        const completedDisplayState =
          buildCompletedStableRiskOrderTicketDisplayState({
            requestKey: riskQuoteRequest.key,
            questionId: riskQuoteRequest.questionId,
            buyQuote,
            sellQuote,
            currentPrice,
            buyDefaultLabel: tt("appText.buy"),
            sellDefaultLabel: tt("appText.sell"),
            buyQuoteBlockedReason: resolveTrainerBlockReasonText(
              buyQuote.blockedReasonCode as TrainerOrderBlockReasonCode | null,
              buyQuote.blockedReason,
              tt,
            ),
            sellQuoteBlockedReason: resolveTrainerBlockReasonText(
              sellQuote.blockedReasonCode as TrainerOrderBlockReasonCode | null,
              sellQuote.blockedReason,
              tt,
            ),
          });
        riskOrderTicketDisplayCacheRef.current.set(
          riskQuoteRequest.key,
          completedDisplayState,
        );
        setRiskOrderTicketDisplayState(completedDisplayState);
      })
      .catch(() => {
        if (riskQuoteRequestVersionRef.current !== requestVersion) {
          return;
        }
      });
    return () => {
      abortController.abort();
    };
  }, [currentPrice, riskQuoteDisplayLifecycleActive, riskQuoteRequest, tt]);

  const buildRiskOrderIntentPayload = useCallback(
    () => ({
      inputMode: riskOrderInputMode,
      lotInput: riskLotInput,
      amountInput: riskAmountInput,
      ratioInput: riskRatioInput,
      priceMode: riskPriceMode,
      nextOpenDelayBars: 1,
    }),
    [
      riskAmountInput,
      riskLotInput,
      riskOrderInputMode,
      riskPriceMode,
      riskRatioInput,
    ],
  );
  const handleRiskOrderInputModeChange = useCallback((mode: TradeInputMode) => {
    setRiskOrderInputMode(mode);
    if (mode === "LOT") {
      window.setTimeout(() => {
        if (isPageActiveRef.current) {
          riskLotInputRef.current?.focus();
        }
      }, 0);
      return;
    }
    if (mode === "AMOUNT") {
      window.setTimeout(() => {
        if (isPageActiveRef.current) {
          riskAmountInputRef.current?.focus();
        }
      }, 0);
    }
  }, []);
  const handleRiskRatioInputChange = useCallback(
    (value: string) => {
      const next = normalizeFixedRatioPresetOption(
        value,
        POSITION_SIZE_OPTIONS[0] ?? "25",
      );
      setRiskRatioInput(next);
      setRuntime((prev) =>
        prev.sizeInput === next ? prev : { ...prev, sizeInput: next },
      );
    },
    [setRuntime],
  );
  const handleBuy = useCallback(async () => {
    if (!activeMode || !isTradeMode || !challengeId) {
      return;
    }
    await enqueueRiskCommand({
      action: "BUY_AND_ADVANCE",
      order: buildRiskOrderIntentPayload(),
    });
  }, [
    activeMode,
    buildRiskOrderIntentPayload,
    challengeId,
    enqueueRiskCommand,
    isTradeMode,
  ]);
  const handleSell = useCallback(async () => {
    if (!activeMode || !isTradeMode || !challengeId) {
      return;
    }
    await enqueueRiskCommand({
      action: "SELL_AND_ADVANCE",
      order: buildRiskOrderIntentPayload(),
    });
  }, [
    activeMode,
    buildRiskOrderIntentPayload,
    challengeId,
    enqueueRiskCommand,
    isTradeMode,
  ]);
  const handleUndo = useCallback(async () => {
    if (!activeMode || !isTradeMode || !challengeId || !activeQuestion) {
      return;
    }
    await enqueueRiskCommand({ action: "UNDO" });
  }, [
    activeMode,
    activeQuestion,
    challengeId,
    enqueueRiskCommand,
    isTradeMode,
  ]);
  const handleNextBar = useCallback(async () => {
    if (!activeMode || !isTradeMode || !challengeId || !activeQuestion) {
      return;
    }
    await enqueueRiskCommand({ action: "NEXT_BAR" });
  }, [
    activeMode,
    activeQuestion,
    challengeId,
    enqueueRiskCommand,
    isTradeMode,
  ]);

  const executeRiskCommandIntent = useCallback<SpecialTrainingRiskCommandQueueExecutor>(
    async (intent) => {
      if (
        !activeMode ||
        !isTradeMode ||
        !challengeId ||
        !activeQuestion ||
        settlement !== null
      ) {
        return { continueDraining: false };
      }
      if (intent.action === "UNDO") {
        setSubmitErrorMessage("");
        const commandResult = await executeSpecialTrainingChallengeAction(
          challengeId,
          { action: "UNDO" },
        );
        await applyCommandChallengeRuntime(commandResult.runtime);
        return { continueDraining: true };
      }
      if (intent.action === "NEXT_BAR") {
        setSubmitErrorMessage("");
        const commandResult = await executeSpecialTrainingChallengeAction(
          challengeId,
          { action: "NEXT_BAR" },
        );
        await applyCommandChallengeRuntime(
          commandResult.runtime,
          commandResult.settlement
            ? { syncCurrentQuestionIndex: false, updateDisplayedRuntime: false }
            : undefined,
        );
        if (commandResult.settlement) {
          const runtimeQuestionId = String(
            commandResult.runtime.currentQuestionId ||
              commandResult.runtime.question?.id ||
              "",
          ).trim();
          const normalizedActiveQuestionId = String(activeQuestion.id || "").trim();
          if (runtimeQuestionId !== normalizedActiveQuestionId) {
            throw new Error("SPECIAL_TRAINING_SETTLEMENT_RUNTIME_MISMATCH");
          }
          applyBackendCompletion(
            materializeServerSettlement(
              activeQuestion,
              activeMode.id,
              commandResult.runtime.cursorIndex ?? activeQuestion.endIndex,
              commandResult.settlement,
              commandResult.runtime.tradeActions,
              readServerSessionFactsFromCommandResult(commandResult),
            ),
          );
          return { continueDraining: false };
        }
        return { continueDraining: true };
      }

      setSubmitErrorMessage("");
      let commandResult: Awaited<
        ReturnType<typeof executeSpecialTrainingChallengeAction>
      >;
      try {
        commandResult = await executeSpecialTrainingChallengeAction(
          challengeId,
          {
            action: intent.action,
            ...intent.order,
          },
        );
      } catch (error) {
        if (hasApiErrorCode(error, "ORDER_BLOCKED")) {
          const refreshedRuntime =
            await getSpecialTrainingChallengeRuntime(challengeId);
          await applyCommandChallengeRuntime(refreshedRuntime);
          setSubmitErrorMessage("");
          return { continueDraining: false };
        }
        throw error;
      }
      await applyCommandChallengeRuntime(
        commandResult.runtime,
        commandResult.settlement
          ? { syncCurrentQuestionIndex: false, updateDisplayedRuntime: false }
          : undefined,
      );
      if (commandResult.settlement) {
        const runtimeQuestionId = String(
          commandResult.runtime.currentQuestionId ||
            commandResult.runtime.question?.id ||
            "",
        ).trim();
        const normalizedActiveQuestionId = String(activeQuestion.id || "").trim();
        if (runtimeQuestionId !== normalizedActiveQuestionId) {
          throw new Error("SPECIAL_TRAINING_SETTLEMENT_RUNTIME_MISMATCH");
        }
        applyBackendCompletion(
          materializeServerSettlement(
            activeQuestion,
            activeMode.id,
            commandResult.runtime.cursorIndex ?? activeQuestion.endIndex,
            commandResult.settlement,
            commandResult.runtime.tradeActions,
            readServerSessionFactsFromCommandResult(commandResult),
          ),
        );
        return { continueDraining: false };
      }
      return { continueDraining: true };
    },
    [
      activeMode,
      activeQuestion,
      applyBackendCompletion,
      applyCommandChallengeRuntime,
      challengeId,
      isTradeMode,
      materializeServerSettlement,
      settlement,
      setSubmitErrorMessage,
    ],
  );
  riskCommandExecutorRef.current = executeRiskCommandIntent;
  useEffect(() => {
    if (view !== "TRAINING" || settlement !== null || !challengeId) {
      riskCommandQueueRef.current?.clear();
    }
  }, [challengeId, settlement, view]);

  const setShortcutBuyRatioInput = useCallback<
    Dispatch<SetStateAction<string>>
  >((value) => {
    setRiskOrderInputMode("RATIO");
    setRiskRatioInput((prevRatio) => {
      const resolved =
        typeof value === "function" ? value(prevRatio) : value;
      return normalizeFixedRatioPresetOption(
        resolved,
        normalizeFixedRatioPresetOption(
          prevRatio,
          POSITION_SIZE_OPTIONS[0] ?? "25",
        ),
      );
    });
    setRuntime((prev) => {
      const resolved =
        typeof value === "function" ? value(prev.sizeInput) : value;
      const fallback = normalizeFixedRatioPresetOption(
        prev.sizeInput,
        POSITION_SIZE_OPTIONS[0] ?? "25",
      );
      const next = normalizeFixedRatioPresetOption(resolved, fallback);
      return prev.sizeInput === next ? prev : { ...prev, sizeInput: next };
    });
  }, [setRuntime]);

  const questionSettledInTraining = view === "TRAINING" && settlement !== null;
  const riskRuntimeActionState =
    activeMode?.id === "risk-discipline-training"
      ? (challengeRuntime?.actionState ?? null)
      : null;
  const {
    riskBuyAdvanceActionState,
    riskSellAdvanceActionState,
    riskNextBarActionState,
    riskUndoActionState,
    buyAndAdvanceDisabled,
    sellAndAdvanceDisabled,
    nextBarDisabled,
    canUndoRiskAction,
    undoAvailableRiskSteps,
    undoMaxRiskSteps,
    riskUndoButtonTitle,
  } = buildRiskDisciplineActionViewModel({
    riskRuntimeActionState,
    resolveRiskActionBlockedReasonText:
      resolveRiskActionBlockedReasonText as (
        code: RiskUiActionBlockReasonCode | null,
        fallbackReason?: string | null,
      ) => string | null,
    tt,
    nextBarLabel: ui.nextBar,
  });
  const runtimeRiskOrderTicketDisplayState =
    riskQuoteDisplayLifecycleActive && riskRuntimeActionState !== null
      ? buildRuntimeStableRiskOrderTicketDisplayState({
          requestKey: riskQuoteRequest?.key ?? "runtime",
          questionId: activeQuestionId,
          currentPrice,
          buyEstimate: challengeRuntime?.buyEstimate ?? null,
          sellEstimate: challengeRuntime?.sellEstimate ?? null,
          buyBlockedReason: riskBuyAdvanceActionState.blockedReason,
          sellBlockedReason: riskSellAdvanceActionState.blockedReason,
          buyDefaultLabel: tt("appText.buy"),
          sellDefaultLabel: tt("appText.sell"),
          nextOpenUnavailable:
            riskNextBarActionState.blockedReasonCode === "NO_ACTIONABLE_BARS",
        })
      : null;
  const riskOrderTicketDisplay =
    visibleRiskOrderTicketDisplayState ??
    runtimeRiskOrderTicketDisplayState ??
    buildLoadingStableRiskOrderTicketDisplayState({
      requestKey: riskQuoteRequest?.key ?? "loading",
      questionId: activeQuestionId,
      currentPrice,
      buyDefaultLabel: tt("appText.buy"),
      sellDefaultLabel: tt("appText.sell"),
    });
  const riskBuyEstimate = {
    qty: riskOrderTicketDisplay.buyEstimate.qty,
    cashEffect: riskOrderTicketDisplay.buyEstimate.cashEffect,
  };
  const riskSellEstimate = {
    qty: riskOrderTicketDisplay.sellEstimate.qty,
    cashEffect: riskOrderTicketDisplay.sellEstimate.cashEffect,
  };
  const formatRiskOrderQuantity = useCallback(
    (value: number | null): string => {
      if (value === null || !Number.isFinite(value) || value <= 0) {
        return textDoubleDash;
      }
      const digits = Math.abs(value - Math.round(value)) < 1e-8 ? 0 : 2;
      return `${formatMoneyFixed(value, digits)} ${tt("appText.shares")}`;
    },
    [textDoubleDash, tt],
  );
  const handleBuyAndAdvance = useCallback(async () => {
    await handleBuy();
  }, [handleBuy]);
  const handleSellAndAdvance = useCallback(async () => {
    await handleSell();
  }, [handleSell]);

  return {
    buyAndAdvanceDisabled,
    canUndoRiskAction,
    formatRiskOrderQuantity,
    handleBuyAndAdvance,
    handleNextBar,
    handleRiskOrderInputModeChange,
    handleRiskRatioInputChange,
    handleSellAndAdvance,
    handleUndo,
    isRiskCommandQueueActive,
    nextBarDisabled,
    questionSettledInTraining,
    riskAmountInput,
    riskAmountInputRef,
    riskBuyAdvanceActionState,
    riskBuyEstimate,
    riskLotInput,
    riskLotInputRef,
    riskNextBarActionState,
    riskOrderInputMode,
    riskOrderTicketDisplay,
    riskPriceMode,
    riskRatioInput,
    riskSellAdvanceActionState,
    riskSellEstimate,
    riskUndoActionState,
    riskUndoButtonTitle,
    sellAndAdvanceDisabled,
    setRiskAmountInput,
    setRiskLotInput,
    setRiskPriceMode,
    setShortcutBuyRatioInput,
    undoAvailableRiskSteps,
    undoMaxRiskSteps,
  };
};

export type SpecialTrainingRiskTradeInteractions = ReturnType<
  typeof useSpecialTrainingRiskTradeInteractions
>;
