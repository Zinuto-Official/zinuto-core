// SPDX-License-Identifier: GPL-3.0-only

import type {
  ApiDesktopWorkspaceReadModel,
  ApiSystemDevSimulationCapabilities,
  ApiSystemDevSimulationCleanupJob,
  ApiSystemDevSimulationJob,
  ApiWorkspaceReadModelAction,
} from "@/api";

export type SettingsDevSimulationProfileId = "REALISTIC" | "STRESS";

export type SettingsDevSimulationActionModel = {
  capabilities: ApiSystemDevSimulationCapabilities | null;
  latestJob: ApiSystemDevSimulationJob | null;
  latestCleanupJob: ApiSystemDevSimulationCleanupJob | null;
  visibleJob: ApiSystemDevSimulationJob | null;
  visibleCleanupJob: ApiSystemDevSimulationCleanupJob | null;
  visibleJobDisplayTargets: {
    freeReplayTarget: number;
    fastDecisionTarget: number;
    riskDisciplineTarget: number;
    independentCustomNotesTarget: number;
    usingCalibrationTargets: boolean;
  } | null;
  visibleJobDiagnostic: {
    profileId: string | null;
    phase: string | null;
    progressPercent: number;
    currentWorkload: {
      phase: string | null;
      workload: string | null;
      index: number | null;
      current: number;
      target: number;
      startedAt: string | null;
      updatedAt: string | null;
    } | null;
  } | null;
  cleanupSummary: {
    jobId: string | null;
    statusCode: string;
    deletedTrainingProjects: number;
    deletedReplayNotes: number;
    deletedCustomIndicatorProfiles: number;
    deletedBacktestBatches: number;
    deletedSpecialTrainingRecords: number;
    deletedTotal: number;
    hasDeletedRecords: boolean;
  } | null;
  jobActive: boolean;
  cleanupJobActive: boolean;
  startActionsByProfileId: Record<
    SettingsDevSimulationProfileId,
    ApiWorkspaceReadModelAction
  >;
  cleanupAction: ApiWorkspaceReadModelAction;
  cancelAction: ApiWorkspaceReadModelAction;
};

const createUnavailableAction = (
  id: string,
  reasonCode = "SETTINGS_READ_MODEL_UNAVAILABLE",
): ApiWorkspaceReadModelAction => ({
  id,
  enabled: false,
  reasonCode,
  priority: 100,
  facts: {},
});

export const readSettingsWorkspaceAction = (
  model: ApiDesktopWorkspaceReadModel | null,
  actionId: string,
): ApiWorkspaceReadModelAction => {
  const action = model?.actions.find((item) => item.id === actionId);
  return action ? { ...action, facts: action.facts ?? {} } : createUnavailableAction(actionId);
};

const readObjectFact = (
  value: unknown,
): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const readDevSimulationFacts = (
  model: ApiDesktopWorkspaceReadModel | null,
): Record<string, unknown> => readObjectFact(model?.facts.devSimulation) ?? {};

const readDisplayTargetsFact = (
  value: unknown,
): SettingsDevSimulationActionModel["visibleJobDisplayTargets"] => {
  const record = readObjectFact(value);
  if (!record) {
    return null;
  }
  return {
    freeReplayTarget: Math.max(0, Math.floor(Number(record.freeReplayTarget) || 0)),
    fastDecisionTarget: Math.max(0, Math.floor(Number(record.fastDecisionTarget) || 0)),
    riskDisciplineTarget: Math.max(
      0,
      Math.floor(Number(record.riskDisciplineTarget) || 0),
    ),
    independentCustomNotesTarget: Math.max(
      0,
      Math.floor(Number(record.independentCustomNotesTarget) || 0),
    ),
    usingCalibrationTargets: record.usingCalibrationTargets === true,
  };
};

const readDiagnosticFact = (
  value: unknown,
): SettingsDevSimulationActionModel["visibleJobDiagnostic"] => {
  const record = readObjectFact(value);
  if (!record) {
    return null;
  }
  const currentWorkload = readObjectFact(record.currentWorkload);
  return {
    profileId:
      typeof record.profileId === "string" && record.profileId.trim()
        ? record.profileId
        : null,
    phase:
      typeof record.phase === "string" && record.phase.trim()
        ? record.phase
        : null,
    progressPercent: Math.max(
      0,
      Math.min(100, Math.round(Number(record.progressPercent) || 0)),
    ),
    currentWorkload: currentWorkload
      ? {
          phase:
            typeof currentWorkload.phase === "string" &&
            currentWorkload.phase.trim()
              ? currentWorkload.phase
              : null,
          workload:
            typeof currentWorkload.workload === "string" &&
            currentWorkload.workload.trim()
              ? currentWorkload.workload
              : null,
          index:
            currentWorkload.index === null
              ? null
              : Math.max(0, Math.floor(Number(currentWorkload.index) || 0)),
          current: Math.max(0, Math.floor(Number(currentWorkload.current) || 0)),
          target: Math.max(0, Math.floor(Number(currentWorkload.target) || 0)),
          startedAt:
            typeof currentWorkload.startedAt === "string" &&
            currentWorkload.startedAt.trim()
              ? currentWorkload.startedAt
              : null,
          updatedAt:
            typeof currentWorkload.updatedAt === "string" &&
            currentWorkload.updatedAt.trim()
              ? currentWorkload.updatedAt
              : null,
        }
      : null,
  };
};

const readCleanupSummaryFact = (
  value: unknown,
): SettingsDevSimulationActionModel["cleanupSummary"] => {
  const record = readObjectFact(value);
  if (!record) {
    return null;
  }
  return {
    jobId:
      typeof record.jobId === "string" && record.jobId.trim()
        ? record.jobId
        : null,
    statusCode: String(record.statusCode ?? "").trim(),
    deletedTrainingProjects: Math.max(
      0,
      Math.floor(Number(record.deletedTrainingProjects) || 0),
    ),
    deletedReplayNotes: Math.max(
      0,
      Math.floor(Number(record.deletedReplayNotes) || 0),
    ),
    deletedCustomIndicatorProfiles: Math.max(
      0,
      Math.floor(Number(record.deletedCustomIndicatorProfiles) || 0),
    ),
    deletedBacktestBatches: Math.max(
      0,
      Math.floor(Number(record.deletedBacktestBatches) || 0),
    ),
    deletedSpecialTrainingRecords: Math.max(
      0,
      Math.floor(Number(record.deletedSpecialTrainingRecords) || 0),
    ),
    deletedTotal: Math.max(0, Math.floor(Number(record.deletedTotal) || 0)),
    hasDeletedRecords: record.hasDeletedRecords === true,
  };
};

export const readSettingsDevSimulationActionModel = (
  model: ApiDesktopWorkspaceReadModel | null,
): SettingsDevSimulationActionModel => {
  const facts = readDevSimulationFacts(model);
  return {
    capabilities:
      (readObjectFact(facts.capabilities) as ApiSystemDevSimulationCapabilities | null) ??
      null,
    latestJob:
      (readObjectFact(facts.latestJob) as ApiSystemDevSimulationJob | null) ??
      null,
    latestCleanupJob:
      (readObjectFact(
        facts.latestCleanupJob,
      ) as ApiSystemDevSimulationCleanupJob | null) ?? null,
    visibleJob:
      (readObjectFact(facts.visibleJob) as ApiSystemDevSimulationJob | null) ??
      null,
    visibleCleanupJob:
      (readObjectFact(
        facts.visibleCleanupJob,
      ) as ApiSystemDevSimulationCleanupJob | null) ?? null,
    visibleJobDisplayTargets: readDisplayTargetsFact(
      facts.visibleJobDisplayTargets,
    ),
    visibleJobDiagnostic: readDiagnosticFact(facts.visibleJobDiagnostic),
    cleanupSummary: readCleanupSummaryFact(facts.cleanupSummary),
    jobActive: facts.jobActive === true,
    cleanupJobActive: facts.cleanupJobActive === true,
    startActionsByProfileId: {
      REALISTIC: readSettingsWorkspaceAction(
        model,
        "dev-simulation-start-realistic",
      ),
      STRESS: readSettingsWorkspaceAction(
        model,
        "dev-simulation-start-stress",
      ),
    },
    cleanupAction: readSettingsWorkspaceAction(model, "dev-simulation-cleanup"),
    cancelAction: readSettingsWorkspaceAction(model, "dev-simulation-cancel"),
  };
};
