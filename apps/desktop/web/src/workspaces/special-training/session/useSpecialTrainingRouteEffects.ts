// SPDX-License-Identifier: GPL-3.0-only

import type { OrderInputMode as TradeInputMode } from "@zinuto/shared/trading";
import {
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { SpecialTrainingResumableSessionState } from "@/domains/special-training/specialTrainingContracts";
import type {
  ApiSpecialTrainingChallengeActivityResult,
  ApiSpecialTrainingChallengeRuntime,
} from "@/api";
import type { SpecialTrainingModeDefinition } from "@/ui/config/uiConfig";
import {
  POSITION_SIZE_OPTIONS,
  RISK_AUTOPLAY_STEP_DELAY_MS,
} from "@/workspaces/special-training/domain/specialTrainingConstants";
import type {
  FastDecisionChoice,
  FastDecisionArenaPhase,
  RuntimeState,
  SettlementResult,
  SpecialTrainingView,
} from "@/workspaces/special-training/domain/specialTrainingTypes";
import { setSpecialTrainingChallengeActivity } from "@/workspaces/special-training/services/specialTrainingApiService";
import {
  createSpecialTrainingActivityQueue,
  type SpecialTrainingActivityQueue,
} from "@/workspaces/special-training/session/specialTrainingActivityQueue";

type SpecialTrainingShortcutBindings = {
  stepNext: () => Promise<void>;
  undo: () => Promise<void>;
  placeOrder: (side: "BUY" | "SELL") => Promise<void>;
  toggleAutoplay: () => Promise<void>;
  createTrainingRecordReplayNote: () => void;
  buyTradeInputMode: TradeInputMode;
  buyRatioPresetOptions: ReadonlyArray<string>;
  setBuyRatioInput: Dispatch<SetStateAction<string>>;
};

const isEditableKeyboardTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT");

export const useSpecialTrainingShortcutBindings = ({
  onShortcutBindingsChange,
  isPageActive,
  view,
  isFastDecisionMode,
  isRiskDisciplineMode,
  activeMode,
  isQuestionLoading,
  runtimePaused,
  fastDecisionPhase,
  fastDecisionResult,
  decisionSecondsLeft,
  settlement,
  gotoNextQuestion,
  handleNextBar,
  handleUndo,
  handleBuyAndAdvance,
  handleSellAndAdvance,
  submitFastDecision,
  setRiskAutoplayEnabled,
  createTrainingRecordReplayNoteShortcut,
  setShortcutBuyRatioInput,
}: {
  onShortcutBindingsChange?: (
    payload: SpecialTrainingShortcutBindings | null,
  ) => void;
  isPageActive: boolean;
  view: SpecialTrainingView;
  isFastDecisionMode: boolean;
  isRiskDisciplineMode: boolean;
  activeMode: SpecialTrainingModeDefinition | null;
  isQuestionLoading: boolean;
  runtimePaused: boolean;
  fastDecisionPhase: FastDecisionArenaPhase;
  fastDecisionResult: unknown;
  decisionSecondsLeft: number;
  settlement: SettlementResult | null;
  gotoNextQuestion: () => void;
  handleNextBar: () => Promise<void>;
  handleUndo: () => Promise<void>;
  handleBuyAndAdvance: () => Promise<void>;
  handleSellAndAdvance: () => Promise<void>;
  submitFastDecision: (
    selection: FastDecisionChoice,
    isTimeout?: boolean,
  ) => void;
  setRiskAutoplayEnabled: Dispatch<SetStateAction<boolean>>;
  createTrainingRecordReplayNoteShortcut: () => void;
  setShortcutBuyRatioInput: Dispatch<SetStateAction<string>>;
}) => {
  const shortcutBindings = useMemo<SpecialTrainingShortcutBindings>(
    () => ({
      stepNext: async () => {
        if (view !== "TRAINING") {
          return;
        }
        if (isFastDecisionMode && settlement !== null) {
          gotoNextQuestion();
          return;
        }
        if (settlement !== null) {
          return;
        }
        if (isFastDecisionMode) {
          const isFastDecisionShortcutBlocked =
            !activeMode ||
            isQuestionLoading ||
            runtimePaused ||
            fastDecisionPhase !== "THINKING" ||
            Boolean(fastDecisionResult) ||
            decisionSecondsLeft <= 0;
          if (!isFastDecisionShortcutBlocked) {
            submitFastDecision("OBSERVE");
          }
          return;
        }
        await handleNextBar();
      },
      undo: async () => {
        if (
          view !== "TRAINING" ||
          !isRiskDisciplineMode ||
          settlement !== null
        ) {
          return;
        }
        await handleUndo();
      },
      placeOrder: async (side: "BUY" | "SELL") => {
        if (view !== "TRAINING") {
          return;
        }
        if (isFastDecisionMode && settlement !== null) {
          gotoNextQuestion();
          return;
        }
        if (settlement !== null) {
          return;
        }
        if (isFastDecisionMode) {
          const isFastDecisionShortcutBlocked =
            !activeMode ||
            isQuestionLoading ||
            runtimePaused ||
            fastDecisionPhase !== "THINKING" ||
            Boolean(fastDecisionResult) ||
            decisionSecondsLeft <= 0;
          if (isFastDecisionShortcutBlocked) {
            return;
          }
          submitFastDecision(side === "BUY" ? "LONG" : "SHORT");
          return;
        }
        if (side === "BUY") {
          await handleBuyAndAdvance();
          return;
        }
        await handleSellAndAdvance();
      },
      toggleAutoplay: async () => {
        if (
          view !== "TRAINING" ||
          !isRiskDisciplineMode ||
          settlement !== null
        ) {
          return;
        }
        setRiskAutoplayEnabled((current) => !current);
      },
      createTrainingRecordReplayNote: createTrainingRecordReplayNoteShortcut,
      buyTradeInputMode:
        view === "TRAINING" && isRiskDisciplineMode
          ? ("RATIO" as const)
          : ("LOT" as const),
      buyRatioPresetOptions: POSITION_SIZE_OPTIONS,
      setBuyRatioInput: setShortcutBuyRatioInput,
    }),
    [
      activeMode,
      createTrainingRecordReplayNoteShortcut,
      decisionSecondsLeft,
      fastDecisionPhase,
      fastDecisionResult,
      gotoNextQuestion,
      handleBuyAndAdvance,
      handleNextBar,
      handleSellAndAdvance,
      handleUndo,
      isFastDecisionMode,
      isQuestionLoading,
      isRiskDisciplineMode,
      runtimePaused,
      settlement,
      setRiskAutoplayEnabled,
      setShortcutBuyRatioInput,
      submitFastDecision,
      view,
    ],
  );

  useEffect(() => {
    onShortcutBindingsChange?.(isPageActive ? shortcutBindings : null);
  }, [isPageActive, onShortcutBindingsChange, shortcutBindings]);

  useEffect(
    () => () => {
      onShortcutBindingsChange?.(null);
    },
    [onShortcutBindingsChange],
  );
};

export const useSpecialTrainingResumableSessionSync = ({
  onResumableSessionChange,
  resumableChallengeSession,
}: {
  onResumableSessionChange?: (
    payload: SpecialTrainingResumableSessionState | null,
  ) => void;
  resumableChallengeSession: SpecialTrainingResumableSessionState | null;
}) => {
  useEffect(() => {
    onResumableSessionChange?.(resumableChallengeSession);
  }, [onResumableSessionChange, resumableChallengeSession]);

  useEffect(
    () => () => {
      onResumableSessionChange?.(null);
    },
    [onResumableSessionChange],
  );
};

export const useSpecialTrainingInactivePagePause = ({
  challengeId,
  hasLiveChallengeSession,
  isPageActive,
  clearFastDecisionTimers,
  onActivityError,
  onActivityRuntime,
  setRuntime,
  setDecisionDeadlineAtMs,
}: {
  challengeId: string;
  hasLiveChallengeSession: boolean;
  isPageActive: boolean;
  clearFastDecisionTimers: () => void;
  onActivityError: (error: unknown) => void;
  onActivityRuntime: (runtime: ApiSpecialTrainingChallengeRuntime) => void;
  setRuntime: Dispatch<SetStateAction<RuntimeState>>;
  setDecisionDeadlineAtMs: Dispatch<SetStateAction<number | null>>;
}) => {
  const activityQueueRef = useRef<
    SpecialTrainingActivityQueue<ApiSpecialTrainingChallengeActivityResult> | null
  >(null);
  if (!activityQueueRef.current) {
    activityQueueRef.current = createSpecialTrainingActivityQueue(
      setSpecialTrainingChallengeActivity,
    );
  }

  useEffect(() => {
    const normalizedChallengeId = String(challengeId || "").trim();
    const shouldPause = !isPageActive;

    if (!hasLiveChallengeSession || !normalizedChallengeId) {
      activityQueueRef.current?.clearDesiredActivity();
      return;
    }

    if (shouldPause) {
      clearFastDecisionTimers();
      setDecisionDeadlineAtMs(null);
    }
    setRuntime((current) =>
      current.paused === shouldPause
        ? current
        : { ...current, paused: shouldPause },
    );

    const scheduledActivity = activityQueueRef.current?.scheduleActivity(
      normalizedChallengeId,
      shouldPause,
    );
    if (!scheduledActivity?.scheduled) {
      return;
    }
    void scheduledActivity.completion
      .then((result) => {
        if (!result) {
          return;
        }
        setRuntime((current) =>
          current.paused === result.paused
            ? current
            : { ...current, paused: result.paused },
        );
        onActivityRuntime(result.runtime);
      })
      .catch(onActivityError);
  }, [
    challengeId,
    clearFastDecisionTimers,
    hasLiveChallengeSession,
    isPageActive,
    onActivityError,
    onActivityRuntime,
    setDecisionDeadlineAtMs,
    setRuntime,
  ]);
};

export const useSpecialTrainingRiskAutoplay = ({
  riskAutoplayEnabled,
  view,
  isRiskDisciplineMode,
  runtimePaused,
  isQuestionLoading,
  settlement,
  nextBarDisabled,
  handleNextBar,
  setRiskAutoplayEnabled,
}: {
  riskAutoplayEnabled: boolean;
  view: SpecialTrainingView;
  isRiskDisciplineMode: boolean;
  runtimePaused: boolean;
  isQuestionLoading: boolean;
  settlement: SettlementResult | null;
  nextBarDisabled: boolean;
  handleNextBar: () => Promise<void>;
  setRiskAutoplayEnabled: Dispatch<SetStateAction<boolean>>;
}) => {
  useEffect(() => {
    if (!riskAutoplayEnabled) {
      return;
    }
    if (view !== "TRAINING" || !isRiskDisciplineMode || runtimePaused) {
      return;
    }
    if (isQuestionLoading || settlement !== null) {
      setRiskAutoplayEnabled(false);
      return;
    }
    if (nextBarDisabled) {
      return;
    }
    const timer = window.setTimeout(() => {
      void handleNextBar();
    }, RISK_AUTOPLAY_STEP_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [
    handleNextBar,
    isQuestionLoading,
    isRiskDisciplineMode,
    nextBarDisabled,
    riskAutoplayEnabled,
    runtimePaused,
    settlement,
    setRiskAutoplayEnabled,
    view,
  ]);
};

export const useSpecialTrainingRiskPanelScrollReset = ({
  view,
  isRiskDisciplineMode,
  currentQuestionIndex,
  settlement,
  riskPanelBodyRef,
}: {
  view: SpecialTrainingView;
  isRiskDisciplineMode: boolean;
  currentQuestionIndex: number;
  settlement: SettlementResult | null;
  riskPanelBodyRef: RefObject<HTMLDivElement | null>;
}) => {
  useEffect(() => {
    if (view !== "TRAINING" || !isRiskDisciplineMode) {
      return;
    }
    const panel = riskPanelBodyRef.current;
    if (!panel) {
      return;
    }
    const rafId = window.requestAnimationFrame(() => {
      panel.scrollTop = 0;
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [
    currentQuestionIndex,
    isRiskDisciplineMode,
    riskPanelBodyRef,
    settlement,
    view,
  ]);
};

export const useSpecialTrainingSettlementKeyboardShortcuts = ({
  isPageActive,
  view,
  isFastDecisionMode,
  settlement,
  selectedSessionReviewIndex,
  exitTraining,
  gotoNextQuestion,
  restartCurrentMode,
}: {
  isPageActive: boolean;
  view: SpecialTrainingView;
  isFastDecisionMode: boolean;
  settlement: SettlementResult | null;
  selectedSessionReviewIndex: number | null;
  exitTraining: () => void;
  gotoNextQuestion: () => void;
  restartCurrentMode: () => void;
}) => {
  useEffect(() => {
    if (
      !isPageActive ||
      view !== "TRAINING" ||
      !isFastDecisionMode ||
      settlement === null
    ) {
      return;
    }

    const handleFastDecisionSettlementKeydown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) {
        return;
      }
      if (event.defaultPrevented || event.repeat) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key;
      if (
        !key ||
        key === "Shift" ||
        key === "Control" ||
        key === "Alt" ||
        key === "Meta" ||
        key === "CapsLock" ||
        key === "Tab"
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (key === "Escape") {
        exitTraining();
        return;
      }
      gotoNextQuestion();
    };

    window.addEventListener(
      "keydown",
      handleFastDecisionSettlementKeydown,
      true,
    );
    return () => {
      window.removeEventListener(
        "keydown",
        handleFastDecisionSettlementKeydown,
        true,
      );
    };
  }, [
    exitTraining,
    gotoNextQuestion,
    isFastDecisionMode,
    isPageActive,
    settlement,
    view,
  ]);

  useEffect(() => {
    if (
      !isPageActive ||
      view !== "SETTLEMENT" ||
      selectedSessionReviewIndex !== null
    ) {
      return;
    }

    const handleSessionSettlementKeydown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) {
        return;
      }
      if (event.defaultPrevented || event.repeat) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        restartCurrentMode();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        exitTraining();
      }
    };

    window.addEventListener("keydown", handleSessionSettlementKeydown, true);
    return () => {
      window.removeEventListener(
        "keydown",
        handleSessionSettlementKeydown,
        true,
      );
    };
  }, [
    exitTraining,
    isPageActive,
    restartCurrentMode,
    selectedSessionReviewIndex,
    view,
  ]);
};
