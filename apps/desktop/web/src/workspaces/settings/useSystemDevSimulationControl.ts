// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  toBackendErrorMessage,
  type ApiSystemDevSimulationCleanupJob,
  type ApiSystemDevSimulationJob,
} from "@/api";
import { ttf, type AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import { getCurrentUiLanguage } from "@/frontend-kernel/i18n/localeState";
import { formatDotJoinedText } from "@/ui/formatting/i18nDisplay";
import type {
  SettingsDevSimulationActionModel,
  SettingsDevSimulationProfileId,
} from "@/workspaces/settings/settingsWorkspaceReadModelUi";

type UseSystemDevSimulationControlArgs = {
  tt: (key: AppTextKey) => string;
  selectedProfileId?: SettingsDevSimulationProfileId;
  actionModel: SettingsDevSimulationActionModel;
  onActionModelChanged?: (options?: {
    force?: boolean;
  }) => void | Promise<void>;
  enabled?: boolean;
  onDataChanged?: (options: {
    reason: "success" | "cleanup";
  }) => void | Promise<void>;
  request: {
    repeatMode: "REPLACE" | "APPEND";
    seed: string;
    targets: {
      freeReplayTarget: number;
      fastDecisionTarget: number;
      riskDisciplineTarget: number;
      independentCustomNotes: number;
      customIndicatorProfiles: number;
      realBacktestBatches: number;
    };
  };
};

const resolveSimulationRequestErrorText = (
  error: unknown,
  tt: (key: AppTextKey) => string,
): string => {
  const genericRequestFailedText = tt("appText.request");
  if (error instanceof Error) {
    const apiError = error as Error & {
      code?: string;
      args?: Record<string, unknown>;
      statusCode?: number;
    };
    if (apiError.code) {
      return toBackendErrorMessage(
        apiError.code,
        apiError.args ?? undefined,
        Number(apiError.statusCode) || 400,
      );
    }
  }
  return genericRequestFailedText;
};

const resolveSimulationCleanupErrorText = (
  error: unknown,
  tt: (key: AppTextKey) => string,
  cleanupCapabilityAvailable: boolean,
): string => {
  const genericRequestFailedText = tt("appText.request");
  if (error instanceof Error) {
    const apiError = error as Error & {
      code?: string;
      args?: Record<string, unknown>;
      statusCode?: number;
    };
    if (apiError.code) {
      return toBackendErrorMessage(
        apiError.code,
        apiError.args ?? undefined,
        Number(apiError.statusCode) || 400,
      );
    }
    if (!cleanupCapabilityAvailable) {
      return tt("appText.desktopBackendLoadedCleanupEndpointYetRestartApp");
    }
  }
  return genericRequestFailedText;
};

const resolveSimulationJobErrorText = (
  job: ApiSystemDevSimulationJob,
  tt: (key: AppTextKey) => string,
): string => {
  if (job.errorCode) {
    return toBackendErrorMessage(job.errorCode, job.errorArgs ?? undefined, 400);
  }
  if (String(job.errorMessage || "").trim()) {
    console.error("[system-dev-simulation] job failed", {
      errorMessage: job.errorMessage,
      jobId: job.id,
    });
  }
  return tt("appText.request");
};

const resolveSimulationCleanupJobErrorText = (
  job: ApiSystemDevSimulationCleanupJob,
  tt: (key: AppTextKey) => string,
): string => {
  if (job.errorCode) {
    return toBackendErrorMessage(job.errorCode, job.errorArgs ?? undefined, 400);
  }
  return tt("appText.request");
};

const resolveSimulationActionReasonText = (
  reasonCode: string | null | undefined,
  tt: (key: AppTextKey) => string,
): string => {
  switch (reasonCode) {
    case "SYSTEM_DEV_SIMULATION_DATASET_NOT_READY":
      return tt("appText.eligibleSymbolsAvailableSamplePoolSimulationStart");
    case "DEV_ONLY_DISABLED":
    case "SYSTEM_DEV_SIMULATION_PROFILE_UNAVAILABLE":
      return tt("appText.desktopBackendLoadedCleanupEndpointYetRestartApp");
    default:
      return "";
  }
};

const resolveSimulationJobDiagnosticText = (
  diagnostic: SettingsDevSimulationActionModel["visibleJobDiagnostic"],
  tt: (key: AppTextKey) => string,
): string => {
  if (!diagnostic) {
    return "";
  }
  return formatDotJoinedText(getCurrentUiLanguage(), [
    diagnostic.profileId ?? "",
    diagnostic.phase ?? "",
    `${diagnostic.progressPercent}${tt("appText.percent")}`,
  ]);
};

const resolveSimulationWorkloadText = (
  workload: string | null | undefined,
  tt: (key: AppTextKey) => string,
): string => {
  switch (workload) {
    case "FREE_REPLAY":
      return tt("appText.freeReplay");
    case "FAST_DECISION":
      return tt("appText.fastDecision");
    case "RISK_DISCIPLINE":
      return tt("appText.riskDiscipline");
    case "CUSTOM_NOTE":
      return tt("settings.devSimulation.status.customNotes");
    case "CUSTOM_INDICATORS":
      return tt("settings.devSimulation.targets.customIndicators");
    case "REAL_BACKTEST":
      return tt("settings.devSimulation.targets.realBacktests");
    case "DESKTOP_MUTABLE":
      return tt("settings.devSimulation.status.desktopMutable");
    case "VERIFYING":
      return tt("settings.devSimulation.status.verifying");
    default:
      return String(workload ?? "").trim();
  }
};

const resolveSimulationCurrentWorkloadText = (
  diagnostic: SettingsDevSimulationActionModel["visibleJobDiagnostic"],
  tt: (key: AppTextKey) => string,
): string => {
  const workload = diagnostic?.currentWorkload;
  const workloadText = resolveSimulationWorkloadText(workload?.workload, tt);
  if (!workload || !workloadText) {
    return "";
  }
  const current = Math.max(0, workload.current);
  const target = Math.max(0, workload.target);
  const progressText =
    target > 0 ? `${current}/${target}` : current > 0 ? String(current) : "";
  return formatDotJoinedText(getCurrentUiLanguage(), [
    tt("settings.devSimulation.status.currentItem"),
    workloadText,
    progressText,
  ]);
};

const hasRemainingSystemDevSimulationWork = (
  job: ApiSystemDevSimulationJob,
  displayTargets: SettingsDevSimulationActionModel["visibleJobDisplayTargets"],
): boolean => {
  const freeReplayTarget = displayTargets?.freeReplayTarget ?? job.freeReplayTarget;
  const fastDecisionTarget =
    displayTargets?.fastDecisionTarget ?? job.fastDecisionTarget;
  const riskDisciplineTarget =
    displayTargets?.riskDisciplineTarget ?? job.riskDisciplineTarget;
  const customNotesTarget =
    displayTargets?.independentCustomNotesTarget ??
    job.effectivePlan?.targets.independentCustomNotes ??
    0;
  return (
    job.freeReplayCompleted < freeReplayTarget ||
    job.fastDecisionCompleted < fastDecisionTarget ||
    job.riskDisciplineCompleted < riskDisciplineTarget ||
    job.createdCounts.independentCustomNotes < customNotesTarget ||
    job.createdCounts.customIndicatorProfiles <
      (job.effectivePlan?.targets.customIndicatorProfiles ?? 0) ||
    job.createdCounts.realBacktestBatches <
      (job.effectivePlan?.targets.realBacktestBatches ?? 0) ||
    job.createdCounts.desktopMutableRuns < 1 ||
    job.metrics.verificationStatus !== "SUCCESS"
  );
};

const resolveSimulationRemainingText = (
  job: ApiSystemDevSimulationJob | null,
  displayTargets: SettingsDevSimulationActionModel["visibleJobDisplayTargets"],
  tt: (key: AppTextKey) => string,
): string => {
  if (!job) {
    return "";
  }
  const isActive = job.status === "QUEUED" || job.status === "RUNNING";
  if (job.estimatedRemainingMs === null) {
    return tt("appText.calculating");
  }
  if (
    isActive &&
    job.estimatedRemainingMs <= 0 &&
    hasRemainingSystemDevSimulationWork(job, displayTargets)
  ) {
    return tt("appText.calculating");
  }
  const minutes = isActive
    ? Math.max(1, Math.ceil(job.estimatedRemainingMs / 60_000))
    : Math.max(0, Math.round(job.estimatedRemainingMs / 60_000));
  return ttf("settings.devSimulation.status.remainingMinutes", [minutes]);
};

export const useSystemDevSimulationControl = ({
  tt,
  selectedProfileId = "REALISTIC",
  actionModel,
  onActionModelChanged,
  enabled = true,
  onDataChanged,
  request,
}: UseSystemDevSimulationControlArgs) => {
  const [isStarting, setIsStarting] = useState(false);
  const [isCleanupSubmitting, setIsCleanupSubmitting] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<
    "neutral" | "error" | "success"
  >("neutral");
  const latestErrorFeedbackRef = useRef("");
  const latestJobFeedbackKeyRef = useRef("");
  const latestCleanupFeedbackKeyRef = useRef("");

  const notifyActionModelChanged = useCallback((options?: { force?: boolean }) => {
    void Promise.resolve(onActionModelChanged?.(options)).catch(() => undefined);
  }, [onActionModelChanged]);

  const clearErrorFeedback = useCallback(() => {
    latestErrorFeedbackRef.current = "";
    setFeedbackTone("neutral");
    setFeedbackText("");
  }, []);

  const showErrorFeedback = useCallback((message: string) => {
    const normalizedMessage = String(message || "").trim();
    setFeedbackTone("error");
    setFeedbackText(normalizedMessage);
    if (
      normalizedMessage &&
      latestErrorFeedbackRef.current !== normalizedMessage
    ) {
      latestErrorFeedbackRef.current = normalizedMessage;
    }
  }, []);

  const startAction =
    actionModel.startActionsByProfileId[selectedProfileId];
  const hasRequestedTargets = Object.values(request.targets).some(
    (target) => target > 0,
  );
  const canStart =
    hasRequestedTargets &&
    Boolean(request.seed.trim()) &&
    startAction.enabled;

  const disabledReason =
    resolveSimulationActionReasonText(startAction.reasonCode, tt);

  const capabilities = actionModel.capabilities;
  // Capability probe: an absent dev-simulation capabilities fact means the
  // backend predates the feature and cannot serve the cleanup endpoint.
  const cleanupCapabilityAvailable = Boolean(capabilities);
  const job = actionModel.latestJob;
  const cleanupJob = actionModel.latestCleanupJob;
  const isJobActive = actionModel.jobActive;
  const isCleanupJobActive = actionModel.cleanupJobActive;
  const isCleaning = isCleanupSubmitting || isCleanupJobActive;
  const visibleJobDisplayTargets = actionModel.visibleJobDisplayTargets;

  const visibleJobDiagnosticText = useMemo(
    () => resolveSimulationJobDiagnosticText(actionModel.visibleJobDiagnostic, tt),
    [actionModel.visibleJobDiagnostic, tt],
  );

  const visibleJobCurrentWorkloadText = useMemo(
    () => resolveSimulationCurrentWorkloadText(actionModel.visibleJobDiagnostic, tt),
    [actionModel.visibleJobDiagnostic, tt],
  );

  const visibleJobRemainingText = useMemo(
    () => resolveSimulationRemainingText(actionModel.visibleJob, visibleJobDisplayTargets, tt),
    [actionModel.visibleJob, visibleJobDisplayTargets, tt],
  );

  const start = useCallback(async () => {
    if (!canStart) {
      const reasonText = resolveSimulationActionReasonText(
        startAction.reasonCode,
        tt,
      );
      if (reasonText) {
        showErrorFeedback(reasonText);
      }
      return;
    }
    setIsStarting(true);
    clearErrorFeedback();
    try {
      await api.startSystemDevSimulationJob({
        profileId: selectedProfileId,
        repeatMode: request.repeatMode,
        seed: request.seed,
        targets: request.targets,
      });
      notifyActionModelChanged({ force: true });
    } catch (error) {
      showErrorFeedback(resolveSimulationRequestErrorText(error, tt));
    } finally {
      setIsStarting(false);
    }
  }, [
    clearErrorFeedback,
    notifyActionModelChanged,
    selectedProfileId,
    request,
    showErrorFeedback,
    canStart,
    startAction.reasonCode,
    tt,
  ]);

  const cancel = useCallback(async () => {
    const jobId =
      typeof actionModel.cancelAction.facts.jobId === "string"
        ? actionModel.cancelAction.facts.jobId
        : "";
    if (!actionModel.cancelAction.enabled || !jobId) {
      return;
    }
    clearErrorFeedback();
    try {
      await api.cancelSystemDevSimulationJob({ jobId });
      notifyActionModelChanged({ force: true });
    } catch (error) {
      showErrorFeedback(resolveSimulationRequestErrorText(error, tt));
    }
  }, [
    actionModel.cancelAction.enabled,
    actionModel.cancelAction.facts.jobId,
    clearErrorFeedback,
    notifyActionModelChanged,
    showErrorFeedback,
    tt,
  ]);

  const cleanup = useCallback(async () => {
    if (!actionModel.cleanupAction.enabled) {
      return;
    }
    setIsCleanupSubmitting(true);
    clearErrorFeedback();
    try {
      await api.startSystemDevSimulationCleanupJob();
      notifyActionModelChanged({ force: true });
    } catch (error) {
      showErrorFeedback(
        resolveSimulationCleanupErrorText(
          error,
          tt,
          cleanupCapabilityAvailable,
        ),
      );
    } finally {
      setIsCleanupSubmitting(false);
    }
  }, [
    actionModel.cleanupAction.enabled,
    cleanupCapabilityAvailable,
    clearErrorFeedback,
    notifyActionModelChanged,
    showErrorFeedback,
    tt,
  ]);

  useEffect(() => {
    if (!enabled || (!isJobActive && !isCleanupJobActive)) {
      return;
    }
    const timerId = window.setInterval(() => {
      notifyActionModelChanged({ force: true });
    }, 1500);
    return () => {
      window.clearInterval(timerId);
    };
  }, [
    enabled,
    isCleanupJobActive,
    isJobActive,
    job?.id,
    cleanupJob?.id,
    notifyActionModelChanged,
  ]);

  useEffect(() => {
    if (!job) {
      return;
    }
    const feedbackKey = [job.id, job.status, job.errorCode ?? "", job.errorMessage ?? ""].join(":");
    if (latestJobFeedbackKeyRef.current === feedbackKey) {
      return;
    }
    if (job.status === "SUCCESS") {
      latestJobFeedbackKeyRef.current = feedbackKey;
      void Promise.resolve(onDataChanged?.({ reason: "success" })).catch(
        () => undefined,
      );
      notifyActionModelChanged();
      return;
    }
    if (job.errorCode || job.errorMessage) {
      latestJobFeedbackKeyRef.current = feedbackKey;
      showErrorFeedback(resolveSimulationJobErrorText(job, tt));
      notifyActionModelChanged();
    }
  }, [
    job,
    notifyActionModelChanged,
    onDataChanged,
    showErrorFeedback,
    tt,
  ]);

  useEffect(() => {
    if (!cleanupJob) {
      return;
    }
    const feedbackKey = [
      cleanupJob.id,
      cleanupJob.status,
      cleanupJob.errorCode ?? "",
      actionModel.cleanupSummary?.deletedTotal ?? "",
    ].join(":");
    if (latestCleanupFeedbackKeyRef.current === feedbackKey) {
      return;
    }
    if (cleanupJob.status === "SUCCESS" && actionModel.cleanupSummary) {
      latestCleanupFeedbackKeyRef.current = feedbackKey;
      latestErrorFeedbackRef.current = "";
      setFeedbackTone("success");
      setFeedbackText(
        actionModel.cleanupSummary.hasDeletedRecords
          ? ttf("appText.clearedValue0FreeReplaySessionsValue1NotesValue2", [
              actionModel.cleanupSummary.deletedTrainingProjects,
              actionModel.cleanupSummary.deletedReplayNotes,
              actionModel.cleanupSummary.deletedSpecialTrainingRecords,
            ])
          : tt("appText.simulationDataAvailableClear"),
      );
      void Promise.resolve(onDataChanged?.({ reason: "cleanup" })).catch(
        () => undefined,
      );
      notifyActionModelChanged();
      return;
    }
    if (cleanupJob.status === "FAILED") {
      latestCleanupFeedbackKeyRef.current = feedbackKey;
      showErrorFeedback(resolveSimulationCleanupJobErrorText(cleanupJob, tt));
      notifyActionModelChanged();
    }
  }, [
    actionModel.cleanupSummary,
    cleanupJob,
    notifyActionModelChanged,
    onDataChanged,
    showErrorFeedback,
    tt,
  ]);

  return {
    capabilities,
    job,
    cleanupJob,
    visibleJob: actionModel.visibleJob,
    visibleCleanupJob: actionModel.visibleCleanupJob,
    visibleJobDisplayTargets,
    visibleJobDiagnosticText,
    visibleJobCurrentWorkloadText,
    visibleJobRemainingText,
    isStarting,
    isCleaning,
    feedbackText,
    feedbackTone,
    startAction,
    cleanupAction: actionModel.cleanupAction,
    cancelAction: actionModel.cancelAction,
    canStart,
    disabledReason,
    isJobActive,
    isCleanupJobActive,
    start,
    cancel,
    cleanup,
  };
};
