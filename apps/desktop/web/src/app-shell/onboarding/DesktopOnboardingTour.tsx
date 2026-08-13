// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type DesktopOnboardingSidecarTargetRect,
} from "@/api";
import { useI18n } from "@/frontend-kernel/i18n";
import type { WorkspacePage } from "@/frontend-kernel/workspacePageModel";
import {
  DESKTOP_ONBOARDING_TARGET_DEFINITIONS,
  DESKTOP_ONBOARDING_ROW_COUNT,
  DESKTOP_ONBOARDING_TOTAL_STEPS,
  getDesktopOnboardingStepTargets,
  getDesktopOnboardingTargetSelector,
  getNextDesktopOnboardingStep,
  getDesktopOnboardingStepIndex,
  getPreviousDesktopOnboardingStep,
  isDesktopOnboardingTargetId,
  resolveDesktopOnboardingLocalImportAction,
  type DesktopOnboardingTargetId,
  type DesktopOnboardingTourStatus,
  type DesktopOnboardingTourStep,
} from "@/domains/onboarding/desktopOnboardingModel";
import type {
  DesktopOnboardingCardTone,
  DesktopOnboardingWindowPayload,
} from "@/app-shell/onboarding/desktopOnboardingWindowPayload";
import { DesktopOnboardingGuideFrame } from "@/app-shell/onboarding/DesktopOnboardingGuideFrame";
import type { VendorIconName } from "@/assets/graphics";
import { AppModal } from "@/ui/components/AppModal";

type OnboardingTaskRow = {
  targetId: DesktopOnboardingTargetId;
  eyebrow: string;
  title: string;
  body: string;
  tone?: DesktopOnboardingCardTone;
};

type OnboardingStepConfig = {
  title: string;
  body: string;
  primaryLabel: string;
  primaryIcon?: VendorIconName;
  rows: OnboardingTaskRow[];
};

type OnboardingHighlightRect = DesktopOnboardingSidecarTargetRect;

const isExpectedDesktopSecondaryWindowUnavailableError = (
  error: unknown,
): boolean =>
  error instanceof Error &&
  error.message === "DESKTOP_SECONDARY_WINDOW_TAURI_REQUIRED";

const ONBOARDING_SIDECAR_READY_TIMEOUT_MS = 1_500;

const isDesktopSecondaryWindowVisibilityAbortError = (
  error: unknown,
): boolean => error instanceof Error && error.name === "AbortError";

export type DesktopOnboardingTourProps = {
  status: DesktopOnboardingTourStatus;
  step: DesktopOnboardingTourStep;
  activePage: WorkspacePage;
  hasUnlockedLocalImportSource: boolean;
  onOpenLocalImport: () => void;
  onSelectPage: (page: WorkspacePage) => void;
  onStepChange: (step: DesktopOnboardingTourStep) => void;
  onStatusChange: (status: DesktopOnboardingTourStatus) => void;
  onTargetChange?: (targetId: DesktopOnboardingTargetId | null) => void;
};

export const DesktopOnboardingTour = ({
  status,
  step,
  activePage,
  onOpenLocalImport,
  onSelectPage,
  onStepChange,
  onStatusChange,
  onTargetChange,
}: DesktopOnboardingTourProps) => {
  const { t } = useI18n();
  const localImportAction = resolveDesktopOnboardingLocalImportAction();
  const [selectedTargetId, setSelectedTargetId] =
    useState<DesktopOnboardingTargetId | null>(null);
  const [highlightRect, setHighlightRect] =
    useState<OnboardingHighlightRect | null>(null);
  const [showInlineGuideFallback, setShowInlineGuideFallback] =
    useState(false);
  const onboardingWindowOpenedRef = useRef(false);
  const onboardingWindowRevisionRef = useRef(0);
  const onboardingInlineFallbackActiveRef = useRef(false);
  const ignoreNextOnboardingWindowCloseRef = useRef(false);
  const defaultSelectionStepRef =
    useRef<DesktopOnboardingTourStep | null>(null);
  const targetNavigationPageRef = useRef<WorkspacePage | null>(null);
  const suppressDefaultSelectionStepRef =
    useRef<DesktopOnboardingTourStep | null>(null);
  const pendingTargetNavigationFrameRef = useRef(0);
  const lastHighlightSignatureRef = useRef<string | null>(null);

  const stepConfig = useMemo<OnboardingStepConfig>(() => {
    switch (step) {
      case "MODE_OVERVIEW":
        return {
          title: t("onboarding.desktop.modeOverview.title"),
          body: t("onboarding.desktop.modeOverview.body"),
          primaryLabel: t("onboarding.desktop.next"),
          primaryIcon: "arrowRight",
          rows: [
            {
              targetId: "MODE_FREE_REPLAY",
              eyebrow: t("onboarding.desktop.card.mode"),
              title: t("onboarding.desktop.modeOverview.freeReplay.title"),
              body: t("onboarding.desktop.modeOverview.freeReplay.body"),
              tone: "primary",
            },
            {
              targetId: "MODE_LIGHTNING",
              eyebrow: t("onboarding.desktop.card.mode"),
              title: t("onboarding.desktop.modeOverview.lightning.title"),
              body: t("onboarding.desktop.modeOverview.lightning.body"),
            },
            {
              targetId: "MODE_SURVIVAL",
              eyebrow: t("onboarding.desktop.card.mode"),
              title: t("onboarding.desktop.modeOverview.survival.title"),
              body: t("onboarding.desktop.modeOverview.survival.body"),
              tone: "accent",
            },
          ],
        };
      case "PREP_PAGES_DETAIL":
        return {
          title: t("onboarding.desktop.prepPagesDetail.title"),
          body: t("onboarding.desktop.prepPagesDetail.body"),
          primaryLabel: t("onboarding.desktop.next"),
          primaryIcon: "arrowRight",
          rows: [
            {
              targetId: "FREE_REPLAY_PREP_CONFIG",
              eyebrow: t("onboarding.desktop.card.setting"),
              title: t("onboarding.desktop.prepPagesDetail.freeReplayConfig.title"),
              body: t("onboarding.desktop.prepPagesDetail.freeReplayConfig.body"),
              tone: "primary",
            },
            {
              targetId: "LIGHTNING_PREP_BANK_CONFIG",
              eyebrow: t("onboarding.desktop.card.setting"),
              title: t("onboarding.desktop.prepPagesDetail.lightningConfig.title"),
              body: t("onboarding.desktop.prepPagesDetail.lightningConfig.body"),
            },
            {
              targetId: "SURVIVAL_PREP_BANK_CONFIG",
              eyebrow: t("onboarding.desktop.card.setting"),
              title: t("onboarding.desktop.prepPagesDetail.survivalConfig.title"),
              body: t("onboarding.desktop.prepPagesDetail.survivalConfig.body"),
              tone: "accent",
            },
          ],
        };
      case "TOOLS_AND_DISPLAY":
        return {
          title: t("onboarding.desktop.toolsDisplay.title"),
          body: t("onboarding.desktop.toolsDisplay.body"),
          primaryLabel: t("onboarding.desktop.next"),
          primaryIcon: "arrowRight",
          rows: [
            {
              targetId: "TOOLS_INDICATOR",
              eyebrow: t("onboarding.desktop.card.tool"),
              title: t("onboarding.desktop.toolsDisplay.indicator.title"),
              body: t("onboarding.desktop.toolsDisplay.indicator.body"),
              tone: "primary",
            },
            {
              targetId: "TOOLS_NOTES",
              eyebrow: t("onboarding.desktop.card.tool"),
              title: t("onboarding.desktop.toolsDisplay.notes.title"),
              body: t("onboarding.desktop.toolsDisplay.notes.body"),
            },
            {
              targetId: "TOOLS_MARKET_DISPLAY",
              eyebrow: t("onboarding.desktop.card.setting"),
              title: t("onboarding.desktop.toolsDisplay.marketDisplay.title"),
              body: t("onboarding.desktop.toolsDisplay.marketDisplay.body"),
              tone: "accent",
            },
          ],
        };
      case "LOCAL_DATA_DETAIL":
        return {
          title: t("onboarding.desktop.localDataDetail.title"),
          body: t("onboarding.desktop.localDataDetail.body"),
          primaryLabel: t("onboarding.desktop.importNow"),
          primaryIcon: "folderOpen",
          rows: [
            {
              targetId: "LOCAL_IMPORT_ENTRY",
              eyebrow: t("onboarding.desktop.card.import"),
              title: t("onboarding.desktop.localDataDetail.entry.title"),
              body: t("onboarding.desktop.localDataDetail.entry.body"),
              tone: "primary",
            },
            {
              targetId: "LOCAL_IMPORT_TIME_ZONE",
              eyebrow: t("onboarding.desktop.card.format"),
              title: t("onboarding.desktop.localDataDetail.format.title"),
              body: t("onboarding.desktop.localDataDetail.format.body"),
            },
            {
              targetId: "LOCAL_IMPORT_SAMPLE",
              eyebrow: t("onboarding.desktop.card.example"),
              title: t("onboarding.desktop.localDataDetail.sample.title"),
              body: t("onboarding.desktop.localDataDetail.sample.body"),
              tone: "accent",
            },
          ],
        };
    }
  }, [localImportAction, step, t]);

  const stepIndex = getDesktopOnboardingStepIndex(step);
  const previousStep = getPreviousDesktopOnboardingStep(step);
  const isFinalStep = step === "LOCAL_DATA_DETAIL";
  const stepRows = useMemo(
    () => stepConfig.rows.slice(0, DESKTOP_ONBOARDING_ROW_COUNT),
    [stepConfig.rows],
  );
  const defaultTargetId = stepRows[0]?.targetId ?? null;
  const hasSelectedTargetInStep = selectedTargetId
    ? stepRows.some((row) => row.targetId === selectedTargetId)
    : false;
  const selectedTargetIdForPayload =
    selectedTargetId ??
    (status === "ACTIVE" && suppressDefaultSelectionStepRef.current !== step
      ? defaultTargetId
      : null);
  const selectedHighlightRow =
    stepRows.find((row) => row.targetId === selectedTargetId) ?? null;
  const selectedHighlightLabel = selectedHighlightRow?.title ?? "";
  const selectedHighlightTone = selectedHighlightRow?.tone ?? "secondary";
  const cancelPendingTargetNavigation = useCallback(() => {
    if (pendingTargetNavigationFrameRef.current) {
      if (typeof window !== "undefined") {
        window.cancelAnimationFrame(pendingTargetNavigationFrameRef.current);
      }
      pendingTargetNavigationFrameRef.current = 0;
    }
  }, []);
  const navigateToTargetPage = useCallback(
    (page: WorkspacePage, deferPageNavigation = false) => {
      cancelPendingTargetNavigation();
      if (deferPageNavigation && typeof window !== "undefined") {
        pendingTargetNavigationFrameRef.current = window.requestAnimationFrame(
          () => {
            pendingTargetNavigationFrameRef.current = 0;
            onSelectPage(page);
          },
        );
        return;
      }
      onSelectPage(page);
    },
    [cancelPendingTargetNavigation, onSelectPage],
  );
  const clearHighlight = useCallback(() => {
    lastHighlightSignatureRef.current = null;
    setHighlightRect(null);
  }, []);
  const clearSelectedTarget = useCallback(() => {
    cancelPendingTargetNavigation();
    targetNavigationPageRef.current = null;
    setSelectedTargetId(null);
    clearHighlight();
  }, [cancelPendingTargetNavigation, clearHighlight]);
  const selectOnboardingTarget = useCallback(
    (
      targetId: DesktopOnboardingTargetId,
      options: { deferPageNavigation?: boolean } = {},
    ) => {
      const target = DESKTOP_ONBOARDING_TARGET_DEFINITIONS[targetId];
      suppressDefaultSelectionStepRef.current = null;
      setSelectedTargetId(targetId);
      clearHighlight();
      if (activePage !== target.page) {
        targetNavigationPageRef.current = target.page;
        navigateToTargetPage(target.page, options.deferPageNavigation);
        return;
      }
      targetNavigationPageRef.current = null;
    },
    [activePage, clearHighlight, navigateToTargetPage],
  );
  const finishTourWithStatus = useCallback(
    (nextStatus: DesktopOnboardingTourStatus) => {
      ignoreNextOnboardingWindowCloseRef.current = true;
      clearSelectedTarget();
      onStatusChange(nextStatus);
    },
    [clearSelectedTarget, onStatusChange],
  );

  const closeOnboardingWindow = useCallback(async () => {
    const shouldClose = onboardingWindowOpenedRef.current;
    onboardingWindowOpenedRef.current = false;
    onboardingWindowRevisionRef.current = 0;
    if (shouldClose) {
      await api.closeDesktopSecondaryWindow("ONBOARDING_TOUR");
    }
  }, []);

  const activateInlineGuideFallback = useCallback(() => {
    if (onboardingInlineFallbackActiveRef.current) {
      return;
    }
    onboardingInlineFallbackActiveRef.current = true;
    setShowInlineGuideFallback(true);
    ignoreNextOnboardingWindowCloseRef.current = true;
    void closeOnboardingWindow().catch(() => undefined);
  }, [closeOnboardingWindow]);

  const moveToStep = useCallback(
    (nextStep: DesktopOnboardingTourStep) => {
      onStepChange(nextStep);
      const nextDefaultTargetId = getDesktopOnboardingStepTargets(nextStep)[0];
      if (nextDefaultTargetId) {
        selectOnboardingTarget(nextDefaultTargetId, {
          deferPageNavigation: true,
        });
      } else {
        clearSelectedTarget();
      }
    },
    [clearSelectedTarget, onStepChange, selectOnboardingTarget],
  );

  const handleOpenLocalImportFromOnboarding = useCallback(() => {
    onSelectPage("DATA");
    finishTourWithStatus("COMPLETED");
    void closeOnboardingWindow().then(() => {
      onOpenLocalImport();
    });
  }, [
    closeOnboardingWindow,
    finishTourWithStatus,
    onOpenLocalImport,
    onSelectPage,
  ]);

  const handlePrimaryAction = useCallback(() => {
    if (!isFinalStep) {
      const nextStep = getNextDesktopOnboardingStep(step);
      if (nextStep) {
        moveToStep(nextStep);
      }
      return;
    }

    clearSelectedTarget();
    handleOpenLocalImportFromOnboarding();
  }, [
    clearSelectedTarget,
    handleOpenLocalImportFromOnboarding,
    isFinalStep,
    moveToStep,
    step,
  ]);

  const handleBack = useCallback(() => {
    if (previousStep) {
      moveToStep(previousStep);
    }
  }, [moveToStep, previousStep]);

  const handleComplete = useCallback(() => {
    finishTourWithStatus("COMPLETED");
  }, [finishTourWithStatus]);

  const handleSkip = useCallback(() => {
    finishTourWithStatus("SKIPPED");
  }, [finishTourWithStatus]);

  const handleDefer = useCallback(() => {
    finishTourWithStatus("DEFERRED");
  }, [finishTourWithStatus]);

  const windowPayload = useMemo<DesktopOnboardingWindowPayload>(
    () => ({
      step,
      title: stepConfig.title,
      body: stepConfig.body,
      setupLabel: t("onboarding.desktop.setupLabel"),
      progressLabel: t("onboarding.desktop.progress", {
        current: stepIndex,
        total: DESKTOP_ONBOARDING_TOTAL_STEPS,
      }),
      deferLabel: t("onboarding.desktop.defer"),
      skipLabel: t("onboarding.desktop.skip"),
      backLabel: t("onboarding.desktop.back"),
      completeSetupLabel: t("onboarding.desktop.completeSetup"),
      primaryLabel: stepConfig.primaryLabel,
      primaryIcon: stepConfig.primaryIcon,
      isFinalStep,
      canGoBack: Boolean(previousStep),
      rows: stepRows,
      selectedTargetId: selectedTargetIdForPayload,
    }),
    [
      isFinalStep,
      previousStep,
      selectedTargetIdForPayload,
      step,
      stepConfig.body,
      stepConfig.primaryIcon,
      stepConfig.primaryLabel,
      stepConfig.title,
      stepIndex,
      stepRows,
      t,
    ],
  );

  useEffect(() => {
    onTargetChange?.(
      status === "ACTIVE" ? selectedTargetIdForPayload : null,
    );
  }, [onTargetChange, selectedTargetIdForPayload, status]);

  useEffect(
    () => () => {
      cancelPendingTargetNavigation();
    },
    [cancelPendingTargetNavigation],
  );

  useEffect(() => {
    if (status !== "ACTIVE") {
      defaultSelectionStepRef.current = null;
      suppressDefaultSelectionStepRef.current = null;
      return;
    }
    if (!defaultTargetId) {
      return;
    }
    const didStepChange = defaultSelectionStepRef.current !== step;
    if (didStepChange) {
      defaultSelectionStepRef.current = step;
      suppressDefaultSelectionStepRef.current = null;
    }
    if (suppressDefaultSelectionStepRef.current === step) {
      return;
    }
    if (!hasSelectedTargetInStep) {
      selectOnboardingTarget(defaultTargetId);
    }
  }, [
    defaultTargetId,
    hasSelectedTargetInStep,
    selectOnboardingTarget,
    status,
    step,
  ]);

  const handleSelectTarget = useCallback(
    (targetId: DesktopOnboardingTargetId) => {
      selectOnboardingTarget(targetId);
    },
    [selectOnboardingTarget],
  );

  const handleGuideAction = useCallback(
    (action: string, payload?: unknown) => {
      switch (action) {
        case "SELECT_TARGET": {
          const targetPayload =
            payload && typeof payload === "object" && !Array.isArray(payload)
              ? (payload as { targetId?: unknown })
              : {};
          if (isDesktopOnboardingTargetId(targetPayload.targetId)) {
            handleSelectTarget(targetPayload.targetId);
          }
          return;
        }
        case "NEXT":
        case "PRIMARY":
          handlePrimaryAction();
          return;
        case "BACK":
          handleBack();
          return;
        case "SKIP":
          handleSkip();
          return;
        case "DEFER":
          handleDefer();
          return;
        case "COMPLETE":
          handleComplete();
          return;
        default:
          return;
      }
    },
    [
      handleBack,
      handleComplete,
      handleDefer,
      handlePrimaryAction,
      handleSelectTarget,
      handleSkip,
    ],
  );

  const updateHighlightForTarget = useCallback(
    (targetId: DesktopOnboardingTargetId, element: Element): boolean => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return false;
      }
      const padding = 10;
      const left = Math.max(
        8,
        Math.min(rect.left - padding, window.innerWidth - 16),
      );
      const top = Math.max(
        8,
        Math.min(rect.top - padding, window.innerHeight - 16),
      );
      const nextRect = {
        left,
        top,
        width: Math.min(
          Math.max(0, window.innerWidth - left - 8),
          rect.width + padding * 2,
        ),
        height: Math.min(
          Math.max(0, window.innerHeight - top - 8),
          rect.height + padding * 2,
        ),
      };
      const sidecarRect = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
      const nextSignature = [
        targetId,
        Math.round(nextRect.left),
        Math.round(nextRect.top),
        Math.round(nextRect.width),
        Math.round(nextRect.height),
        Math.round(sidecarRect.left),
        Math.round(sidecarRect.top),
        Math.round(sidecarRect.width),
        Math.round(sidecarRect.height),
      ].join(":");
      if (lastHighlightSignatureRef.current === nextSignature) {
        return true;
      }
      lastHighlightSignatureRef.current = nextSignature;
      setHighlightRect(nextRect);
      void api.positionDesktopOnboardingSidecar({
        left: sidecarRect.left,
        top: sidecarRect.top,
        width: sidecarRect.width,
        height: sidecarRect.height,
      });
      return true;
    },
    [],
  );

  useEffect(() => {
    if (status !== "ACTIVE" || !selectedTargetId) {
      clearHighlight();
      return;
    }
    const target = DESKTOP_ONBOARDING_TARGET_DEFINITIONS[selectedTargetId];
    if (activePage !== target.page) {
      clearHighlight();
      return;
    }

    let disposed = false;
    let retryTimerId = 0;
    let locateFrameId = 0;
    let measureFrameId = 0;
    let scrollSettleTimerId = 0;
    let attemptCount = 0;
    let didScrollTargetIntoView = false;
    let resizeObserver: ResizeObserver | null = null;
    let observedElement: Element | null = null;
    let hasBoundViewportListeners = false;
    const measureTargetAfterScroll = (element: Element) => {
      window.cancelAnimationFrame(measureFrameId);
      measureFrameId = window.requestAnimationFrame(() => {
        if (disposed) {
          return;
        }
        measureFrameId = window.requestAnimationFrame(() => {
          if (!disposed) {
            updateHighlightForTarget(selectedTargetId, element);
          }
        });
      });
    };
    const scheduleSettledMeasure = (element: Element) => {
      window.clearTimeout(scrollSettleTimerId);
      scrollSettleTimerId = window.setTimeout(() => {
        if (!disposed) {
          measureTargetAfterScroll(element);
        }
      }, 140);
    };
    const handleViewportSettle = () => {
      if (observedElement) {
        scheduleSettledMeasure(observedElement);
      }
    };
    const bindTargetObservers = (element: Element) => {
      observedElement = element;
      window.addEventListener("resize", handleViewportSettle);
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          scheduleSettledMeasure(element);
        });
        resizeObserver.observe(element);
      }
      window.addEventListener(
        "scroll",
        handleViewportSettle,
        { capture: true, passive: true },
      );
      hasBoundViewportListeners = true;
    };
    const locateTarget = () => {
      if (disposed) {
        return;
      }
      const element = document.querySelector(
        getDesktopOnboardingTargetSelector(selectedTargetId),
      );
      if (!element) {
        if (attemptCount < 24) {
          attemptCount += 1;
          const retryDelay = Math.min(120 + attemptCount * 35, 360);
          retryTimerId = window.setTimeout(locateTarget, retryDelay);
        }
        return;
      }
      if (!didScrollTargetIntoView) {
        didScrollTargetIntoView = true;
        element.scrollIntoView({
          behavior: "auto",
          block: "center",
          inline: "center",
        });
        bindTargetObservers(element);
      }
      measureTargetAfterScroll(element);
    };
    locateFrameId = window.requestAnimationFrame(locateTarget);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(locateFrameId);
      window.cancelAnimationFrame(measureFrameId);
      window.clearTimeout(retryTimerId);
      window.clearTimeout(scrollSettleTimerId);
      resizeObserver?.disconnect();
      if (hasBoundViewportListeners) {
        window.removeEventListener("resize", handleViewportSettle);
        window.removeEventListener("scroll", handleViewportSettle, true);
      }
    };
  }, [
    activePage,
    clearHighlight,
    selectedTargetId,
    status,
    updateHighlightForTarget,
  ]);

  useEffect(() => {
    if (
      status !== "ACTIVE" ||
      !selectedTargetId ||
      activePage === DESKTOP_ONBOARDING_TARGET_DEFINITIONS[selectedTargetId].page
    ) {
      if (selectedTargetId) {
        const target = DESKTOP_ONBOARDING_TARGET_DEFINITIONS[selectedTargetId];
        if (
          activePage === target.page &&
          targetNavigationPageRef.current === target.page
        ) {
          targetNavigationPageRef.current = null;
        }
      }
      return;
    }
    const target = DESKTOP_ONBOARDING_TARGET_DEFINITIONS[selectedTargetId];
    if (targetNavigationPageRef.current === target.page) {
      return;
    }
    suppressDefaultSelectionStepRef.current = step;
    clearSelectedTarget();
  }, [activePage, clearSelectedTarget, selectedTargetId, status, step]);

  useEffect(() => {
    if (status !== "ACTIVE") {
      onboardingInlineFallbackActiveRef.current = false;
      setShowInlineGuideFallback(false);
      void closeOnboardingWindow();
      clearSelectedTarget();
      return;
    }
    if (onboardingInlineFallbackActiveRef.current) {
      return;
    }
    ignoreNextOnboardingWindowCloseRef.current = false;
    const visibilityAbortController = new AbortController();
    const input = {
      kind: "ONBOARDING_TOUR" as const,
      title: windowPayload.title,
      payload: windowPayload,
    };
    const shouldOpenWindow = !onboardingWindowOpenedRef.current;
    if (shouldOpenWindow) {
      onboardingWindowOpenedRef.current = true;
    }
    const windowStateTask = shouldOpenWindow
      ? api.openDesktopSecondaryWindow(input)
      : api.publishDesktopSecondaryWindowState(input);
    void windowStateTask
      .then(async (state) => {
        if (
          visibilityAbortController.signal.aborted ||
          onboardingInlineFallbackActiveRef.current
        ) {
          return;
        }
        onboardingWindowRevisionRef.current = state.revision;
        const visibleRevision =
          await api.waitForDesktopSecondaryWindowVisibleReady(
            "ONBOARDING_TOUR",
            state.revision,
            {
              followLatestRevision: true,
              signal: visibilityAbortController.signal,
              timeoutMs: ONBOARDING_SIDECAR_READY_TIMEOUT_MS,
            },
          );
        if (
          visibilityAbortController.signal.aborted ||
          onboardingInlineFallbackActiveRef.current
        ) {
          return;
        }
        onboardingWindowRevisionRef.current = visibleRevision;
        await api.positionDesktopOnboardingSidecar();
      })
      .catch((error) => {
        if (
          visibilityAbortController.signal.aborted ||
          isDesktopSecondaryWindowVisibilityAbortError(error)
        ) {
          return;
        }
        onboardingWindowOpenedRef.current = false;
        onboardingWindowRevisionRef.current = 0;
        if (!isExpectedDesktopSecondaryWindowUnavailableError(error)) {
          console.error("[desktop-onboarding] sidecar unavailable", error);
        }
        activateInlineGuideFallback();
      });
    return () => {
      visibilityAbortController.abort();
    };
  }, [
    activateInlineGuideFallback,
    clearSelectedTarget,
    closeOnboardingWindow,
    status,
    windowPayload,
  ]);

  useEffect(
    () =>
      api.subscribeDesktopSecondaryWindowActions((message) => {
        if (message.kind !== "ONBOARDING_TOUR") {
          return;
        }
        if (
          !api.isCurrentDesktopSecondaryWindowAction(
            message,
            onboardingWindowRevisionRef.current,
          )
        ) {
          return;
        }
        if (message.action === "WINDOW_CLOSED") {
          onboardingWindowOpenedRef.current = false;
          onboardingWindowRevisionRef.current = 0;
          if (ignoreNextOnboardingWindowCloseRef.current) {
            ignoreNextOnboardingWindowCloseRef.current = false;
            return;
          }
          handleDefer();
          return;
        }
        handleGuideAction(message.action, message.payload);
      }),
    [handleDefer, handleGuideAction],
  );

  if (status !== "ACTIVE") {
    return null;
  }

  return (
    <>
      {highlightRect ? (
        <div
          className="desktop-onboarding-highlight-frame"
          style={{
            left: `${highlightRect.left}px`,
            top: `${highlightRect.top}px`,
            width: `${highlightRect.width}px`,
            height: `${highlightRect.height}px`,
          }}
          data-tone={selectedHighlightTone}
          aria-hidden="true"
        >
          {selectedHighlightLabel ? (
            <span className="desktop-onboarding-highlight-label">
              {selectedHighlightLabel}
            </span>
          ) : null}
        </div>
      ) : null}
      {showInlineGuideFallback ? (
        <AppModal
          open
          onClose={handleDefer}
          preset="workflow"
          className="desktop-onboarding-dialog"
          overlayClassName="desktop-onboarding-dialog-backdrop"
          accessibilityTitle={windowPayload.title}
          accessibilityDescription={windowPayload.body}
        >
          <DesktopOnboardingGuideFrame
            payload={windowPayload}
            onAction={handleGuideAction}
          />
        </AppModal>
      ) : null}
    </>
  );
};
