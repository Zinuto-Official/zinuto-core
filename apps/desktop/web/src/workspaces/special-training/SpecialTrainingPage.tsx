// SPDX-License-Identifier: GPL-3.0-only

import "@/styles/workspaces/special-training.css";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  SpecialTrainingChartSyncHandler,
  SpecialTrainingResumableSessionState,
  SpecialTrainingShortcutBindings,
} from "@/domains/special-training/specialTrainingContracts";
import type { SpecialTrainingModeId } from "@/ui/config/uiConfig";
import { SpecialTrainingPageRuntime } from "@/workspaces/special-training/SpecialTrainingPageRuntime";
import {
  DEFAULT_SPECIAL_TRAINING_MODE_ID,
  SPECIAL_TRAINING_MODE_IDS,
} from "@/workspaces/special-training/specialTrainingModeRegistry";
import type { SpecialTrainingPageProps } from "@/workspaces/special-training/specialTrainingPageTypes";

type ResumableSessionByMode = Partial<
  Record<SpecialTrainingModeId, SpecialTrainingResumableSessionState>
>;

const resolveOnboardingModeId = (
  targetId: SpecialTrainingPageProps["onboardingTargetId"],
): SpecialTrainingModeId | null => {
  if (targetId === "LIGHTNING_PREP_BANK_CONFIG") {
    return "fast-decision-training";
  }
  if (targetId === "SURVIVAL_PREP_BANK_CONFIG") {
    return "risk-discipline-training";
  }
  return null;
};

export const SpecialTrainingPage = (props: SpecialTrainingPageProps) => {
  const requestedInitialModeId =
    props.launchRequest?.modeId ??
    resolveOnboardingModeId(props.onboardingTargetId) ??
    DEFAULT_SPECIAL_TRAINING_MODE_ID;
  const [activeModeId, setActiveModeId] = useState<SpecialTrainingModeId>(
    requestedInitialModeId,
  );
  const [visitedModeIds, setVisitedModeIds] = useState<
    SpecialTrainingModeId[]
  >([requestedInitialModeId]);
  const [resumableSessionByMode, setResumableSessionByMode] =
    useState<ResumableSessionByMode>({});
  const handledLaunchRequestIdRef = useRef<number | null>(null);
  const activeModeIdRef = useRef(activeModeId);
  const onShortcutBindingsChangeRef = useRef(props.onShortcutBindingsChange);
  const onSyncChartQuestionRef = useRef(props.onSyncChartQuestion);
  activeModeIdRef.current = activeModeId;
  onShortcutBindingsChangeRef.current = props.onShortcutBindingsChange;
  onSyncChartQuestionRef.current = props.onSyncChartQuestion;

  const activateMode = useCallback((modeId: SpecialTrainingModeId) => {
    setVisitedModeIds((current) =>
      current.includes(modeId) ? current : [...current, modeId],
    );
    setActiveModeId(modeId);
  }, []);

  useEffect(() => {
    const request = props.launchRequest;
    if (
      !request ||
      handledLaunchRequestIdRef.current === request.requestId
    ) {
      return;
    }
    handledLaunchRequestIdRef.current = request.requestId;
    activateMode(request.modeId);
  }, [activateMode, props.launchRequest]);

  useEffect(() => {
    const onboardingModeId = resolveOnboardingModeId(props.onboardingTargetId);
    if (onboardingModeId) {
      activateMode(onboardingModeId);
    }
  }, [activateMode, props.onboardingTargetId]);

  const updateResumableSession = useCallback(
    (
      modeId: SpecialTrainingModeId,
      payload: SpecialTrainingResumableSessionState | null,
    ) => {
      setResumableSessionByMode((current) => {
        if (payload) {
          return current[modeId] === payload
            ? current
            : { ...current, [modeId]: payload };
        }
        if (!current[modeId]) {
          return current;
        }
        const next = { ...current };
        delete next[modeId];
        return next;
      });
    },
    [],
  );
  const handleFastResumableSessionChange = useCallback(
    (payload: SpecialTrainingResumableSessionState | null) => {
      updateResumableSession("fast-decision-training", payload);
    },
    [updateResumableSession],
  );
  const handleRiskResumableSessionChange = useCallback(
    (payload: SpecialTrainingResumableSessionState | null) => {
      updateResumableSession("risk-discipline-training", payload);
    },
    [updateResumableSession],
  );
  const resumableChangeByMode = useMemo(
    () => ({
      "fast-decision-training": handleFastResumableSessionChange,
      "risk-discipline-training": handleRiskResumableSessionChange,
    }),
    [handleFastResumableSessionChange, handleRiskResumableSessionChange],
  );
  const forwardShortcutBindings = useCallback(
    (
      modeId: SpecialTrainingModeId,
      payload: SpecialTrainingShortcutBindings | null,
    ) => {
      if (activeModeIdRef.current === modeId) {
        onShortcutBindingsChangeRef.current?.(payload);
      }
    },
    [],
  );
  const handleFastShortcutBindings = useCallback(
    (payload: SpecialTrainingShortcutBindings | null) => {
      forwardShortcutBindings("fast-decision-training", payload);
    },
    [forwardShortcutBindings],
  );
  const handleRiskShortcutBindings = useCallback(
    (payload: SpecialTrainingShortcutBindings | null) => {
      forwardShortcutBindings("risk-discipline-training", payload);
    },
    [forwardShortcutBindings],
  );
  const shortcutBindingsChangeByMode = useMemo(
    () => ({
      "fast-decision-training": handleFastShortcutBindings,
      "risk-discipline-training": handleRiskShortcutBindings,
    }),
    [handleFastShortcutBindings, handleRiskShortcutBindings],
  );
  const forwardChartSync = useCallback(
    (
      modeId: SpecialTrainingModeId,
      payload: Parameters<SpecialTrainingChartSyncHandler>[0],
    ) => {
      if (activeModeIdRef.current === modeId) {
        onSyncChartQuestionRef.current?.(payload);
      }
    },
    [],
  );
  const handleFastChartSync = useCallback<SpecialTrainingChartSyncHandler>(
    (payload) => {
      forwardChartSync("fast-decision-training", payload);
    },
    [forwardChartSync],
  );
  const handleRiskChartSync = useCallback<SpecialTrainingChartSyncHandler>(
    (payload) => {
      forwardChartSync("risk-discipline-training", payload);
    },
    [forwardChartSync],
  );
  const chartSyncByMode = useMemo(
    () => ({
      "fast-decision-training": handleFastChartSync,
      "risk-discipline-training": handleRiskChartSync,
    }),
    [handleFastChartSync, handleRiskChartSync],
  );

  useEffect(() => {
    props.onResumableSessionChange?.(
      resumableSessionByMode[activeModeId] ?? null,
    );
  }, [activeModeId, props.onResumableSessionChange, resumableSessionByMode]);

  return (
    <div
      className="special-training-mode-runtime-stack"
      data-active-special-training-mode={activeModeId}
    >
      {SPECIAL_TRAINING_MODE_IDS.filter((modeId) =>
        visitedModeIds.includes(modeId),
      ).map((modeId) => {
        const isSelectedMode = modeId === activeModeId;
        const isRuntimeActive = Boolean(
          (props.isPageActive ?? true) && isSelectedMode,
        );
        const onboardingModeId = resolveOnboardingModeId(
          props.onboardingTargetId,
        );
        return (
          <div
            key={modeId}
            className="special-training-mode-runtime-slot"
            data-special-training-mode={modeId}
            hidden={!isSelectedMode}
            inert={isSelectedMode ? undefined : true}
            aria-hidden={isSelectedMode ? undefined : true}
          >
            <SpecialTrainingPageRuntime
              {...props}
              launchRequest={null}
              controlledModeId={modeId}
              onRequestModeChange={activateMode}
              isPageActive={isRuntimeActive}
              onboardingTargetId={
                isSelectedMode && onboardingModeId === modeId
                  ? props.onboardingTargetId
                  : null
              }
              onResumableSessionChange={resumableChangeByMode[modeId]}
              onShortcutBindingsChange={shortcutBindingsChangeByMode[modeId]}
              onSyncChartQuestion={chartSyncByMode[modeId]}
            />
          </div>
        );
      })}
    </div>
  );
};

export type { SpecialTrainingPageProps } from "@/workspaces/special-training/specialTrainingPageTypes";
