// SPDX-License-Identifier: GPL-3.0-only

import type { DesktopWorkspaceReadModel } from '@zinuto/shared/contracts-desktop/api';
import {
  createAction,
  createModel,
  createSection,
  toCount,
  toRecord,
  type WorkspaceReadModelDependencies,
} from './workspaceReadModelPrimitives.js';

const ACTIVE_JOB_STATUS = new Set(['QUEUED', 'RUNNING']);
const FINAL_JOB_STATUS = new Set(['SUCCESS', 'FAILED', 'INTERRUPTED']);

const resolveJobTimestamp = (value: Record<string, unknown>): number => {
  const finishedAt = Date.parse(String(value.finishedAt ?? ''));
  if (Number.isFinite(finishedAt) && finishedAt > 0) {
    return finishedAt;
  }
  const startedAt = Date.parse(String(value.startedAt ?? ''));
  return Number.isFinite(startedAt) && startedAt > 0 ? startedAt : 0;
};

const resolveVisibleDevSimulationStatus = ({
  job,
  cleanupJob,
}: {
  job: Record<string, unknown>;
  cleanupJob: Record<string, unknown>;
}): {
  visibleJob: Record<string, unknown> | null;
  visibleCleanupJob: Record<string, unknown> | null;
  statusCode: string;
} => {
  const jobStatus = String(job.status ?? '').trim();
  const cleanupStatus = String(cleanupJob.status ?? '').trim();
  const jobActive = ACTIVE_JOB_STATUS.has(jobStatus);
  const cleanupActive = ACTIVE_JOB_STATUS.has(cleanupStatus);
  if (jobActive) {
    return { visibleJob: job, visibleCleanupJob: null, statusCode: 'JOB_ACTIVE' };
  }
  if (cleanupActive) {
    return {
      visibleJob: null,
      visibleCleanupJob: cleanupJob,
      statusCode: 'CLEANUP_ACTIVE',
    };
  }
  if (Object.keys(job).length > 0 && Object.keys(cleanupJob).length > 0) {
    return resolveJobTimestamp(job) >= resolveJobTimestamp(cleanupJob)
      ? { visibleJob: job, visibleCleanupJob: null, statusCode: jobStatus || 'IDLE' }
      : {
          visibleJob: null,
          visibleCleanupJob: cleanupJob,
          statusCode: cleanupStatus || 'IDLE',
        };
  }
  if (Object.keys(job).length > 0) {
    return { visibleJob: job, visibleCleanupJob: null, statusCode: jobStatus || 'IDLE' };
  }
  if (Object.keys(cleanupJob).length > 0) {
    return {
      visibleJob: null,
      visibleCleanupJob: cleanupJob,
      statusCode: cleanupStatus || 'IDLE',
    };
  }
  return { visibleJob: null, visibleCleanupJob: null, statusCode: 'IDLE' };
};

const resolveDevSimulationDisplayTargets = (
  job: Record<string, unknown> | null,
): Record<string, unknown> | null => {
  if (!job) {
    return null;
  }
  const effectivePlan = toRecord(job.effectivePlan);
  const budget = toRecord(effectivePlan.budget);
  const calibrationTargets =
    String(job.phase ?? '').trim() === 'CALIBRATING' &&
    effectivePlan.calibrated !== true
      ? toRecord(budget.calibrationTargets)
      : {};
  const targets = toRecord(effectivePlan.targets);
  const usingCalibrationTargets = Object.keys(calibrationTargets).length > 0;
  return {
    freeReplayTarget: toCount(
      calibrationTargets.freeReplayTarget ?? job.freeReplayTarget,
    ),
    fastDecisionTarget: toCount(
      calibrationTargets.fastDecisionTarget ?? job.fastDecisionTarget,
    ),
    riskDisciplineTarget: toCount(
      calibrationTargets.riskDisciplineTarget ?? job.riskDisciplineTarget,
    ),
    independentCustomNotesTarget: toCount(
      calibrationTargets.independentCustomNotes ??
        targets.independentCustomNotes,
    ),
    usingCalibrationTargets,
  };
};

const resolveDevSimulationJobDiagnostic = (
  job: Record<string, unknown> | null,
): Record<string, unknown> | null => {
  if (!job) {
    return null;
  }
  const currentWorkload = toRecord(job.currentWorkload);
  return {
    profileId: String(job.profileId ?? '').trim() || null,
    phase: String(job.phase ?? '').trim() || null,
    progressPercent: Math.max(
      0,
      Math.min(100, Math.round(Number(job.progressPercent) || 0)),
    ),
    currentWorkload:
      Object.keys(currentWorkload).length > 0
        ? {
            phase: String(currentWorkload.phase ?? '').trim() || null,
            workload: String(currentWorkload.workload ?? '').trim() || null,
            index:
              currentWorkload.index === null
                ? null
                : Math.max(0, Math.floor(Number(currentWorkload.index) || 0)),
            current: toCount(currentWorkload.current),
            target: toCount(currentWorkload.target),
            startedAt: String(currentWorkload.startedAt ?? '').trim() || null,
            updatedAt: String(currentWorkload.updatedAt ?? '').trim() || null,
          }
        : null,
  };
};

const resolveDevSimulationCleanupSummary = (
  cleanupJob: Record<string, unknown>,
): Record<string, unknown> | null => {
  const status = String(cleanupJob.status ?? '').trim();
  if (status !== 'SUCCESS') {
    return null;
  }
  const result = toRecord(cleanupJob.result);
  const deletedSpecialTrainingRecords =
    toCount(result.deletedQuestionLedger) +
    toCount(result.deletedSpecialTrainingBanks) +
    toCount(result.deletedSpecialTrainingHistoryQuestions) +
    toCount(result.deletedSpecialTrainingHistorySessions);
  const deletedTrainingProjects = toCount(result.deletedTrainingProjects);
  const deletedReplayNotes = toCount(result.deletedReplayNotes);
  const deletedCustomIndicatorProfiles = toCount(
    result.deletedCustomIndicatorProfiles,
  );
  const deletedBacktestBatches = toCount(result.deletedBacktestBatches);
  const deletedTotal =
    deletedTrainingProjects +
    deletedReplayNotes +
    deletedCustomIndicatorProfiles +
    deletedBacktestBatches +
    deletedSpecialTrainingRecords;
  return {
    jobId: String(cleanupJob.id ?? '').trim() || null,
    statusCode: status,
    deletedTrainingProjects,
    deletedReplayNotes,
    deletedCustomIndicatorProfiles,
    deletedBacktestBatches,
    deletedSpecialTrainingRecords,
    deletedTotal,
    hasDeletedRecords: deletedTotal > 0,
  };
};

const resolveDevSimulationStartReasonCode = ({
  profileAvailable,
  profileReasonCode,
  jobActive,
  cleanupJobActive,
}: {
  profileAvailable: boolean;
  profileReasonCode: string | null;
  jobActive: boolean;
  cleanupJobActive: boolean;
}): string | null => {
  if (jobActive) {
    return 'SYSTEM_DEV_SIMULATION_JOB_ACTIVE';
  }
  if (cleanupJobActive) {
    return 'SYSTEM_DEV_SIMULATION_CLEANUP_ACTIVE';
  }
  if (!profileAvailable) {
    return profileReasonCode || 'SYSTEM_DEV_SIMULATION_PROFILE_UNAVAILABLE';
  }
  return null;
};

export const buildSettingsModel = async (
  deps: WorkspaceReadModelDependencies,
): Promise<DesktopWorkspaceReadModel> => {
  const [
    appPreferences,
    retentionPolicy,
    latestRetentionJob,
    storageUsage,
    devSimulationCapabilities,
    latestDevSimulationJob,
    latestDevSimulationCleanupJob,
  ] = await Promise.all([
    deps.getAppPreferences(),
    deps.getHistoryRetentionPolicy(),
    deps.getLatestHistoryRetentionJob(),
    deps.getSystemStorageUsage(),
    deps.getSystemDevSimulationCapabilities(),
    deps.getLatestSystemDevSimulationJob(),
    deps.getLatestSystemDevSimulationCleanupJob(),
  ]);
  const retentionJobStatus = String(toRecord(latestRetentionJob).status ?? '').trim();
  const retentionJobActive =
    retentionJobStatus === 'QUEUED' || retentionJobStatus === 'RUNNING';
  const retentionActionReasonCode = retentionJobActive
    ? 'HISTORY_RETENTION_JOB_ACTIVE'
    : null;
  const latestDevSimulationJobRecord = toRecord(latestDevSimulationJob);
  const latestDevSimulationCleanupJobRecord = toRecord(latestDevSimulationCleanupJob);
  const devSimulationJobStatus = String(
    latestDevSimulationJobRecord.status ?? '',
  ).trim();
  const devSimulationCleanupJobStatus = String(
    latestDevSimulationCleanupJobRecord.status ?? '',
  ).trim();
  const devSimulationJobActive = ACTIVE_JOB_STATUS.has(devSimulationJobStatus);
  const devSimulationCleanupJobActive = ACTIVE_JOB_STATUS.has(
    devSimulationCleanupJobStatus,
  );
  const visibleDevSimulationStatus = resolveVisibleDevSimulationStatus({
    job: latestDevSimulationJobRecord,
    cleanupJob: latestDevSimulationCleanupJobRecord,
  });
  const dataAvailability = toRecord(
    toRecord(devSimulationCapabilities).dataAvailability,
  );
  const devSimulationDataReady = dataAvailability.ready === true;
  const devSimulationProfiles = Array.isArray(
    toRecord(devSimulationCapabilities).profiles,
  )
    ? (toRecord(devSimulationCapabilities).profiles as unknown[])
    : [];
  const devSimulationStartActions = devSimulationProfiles
    .map((profile) => {
      const profileRecord = toRecord(profile);
      const profileId = String(profileRecord.profileId ?? '').trim();
      if (profileId !== 'REALISTIC' && profileId !== 'STRESS') {
        return null;
      }
      const reasonCode = resolveDevSimulationStartReasonCode({
        profileAvailable: profileRecord.available === true,
        profileReasonCode:
          String(profileRecord.reasonCode ?? '').trim() || null,
        jobActive: devSimulationJobActive,
        cleanupJobActive: devSimulationCleanupJobActive,
      });
      return createAction({
        id: `dev-simulation-start-${profileId.toLowerCase()}`,
        enabled: reasonCode === null,
        reasonCode,
        priority: profileId === 'REALISTIC' ? 60 : 61,
        facts: {
          profileId,
          dataReady: devSimulationDataReady,
          profileAvailable: profileRecord.available === true,
        },
      });
    })
    .filter((action): action is NonNullable<typeof action> => action !== null);
  const cancelReasonCode =
    devSimulationJobActive && latestDevSimulationJobRecord.canCancel === true
      ? null
      : devSimulationJobActive
        ? 'SYSTEM_DEV_SIMULATION_CANCEL_UNAVAILABLE'
        : 'SYSTEM_DEV_SIMULATION_NO_CANCELABLE_JOB';
  const cleanupReasonCode = devSimulationJobActive
    ? 'SYSTEM_DEV_SIMULATION_JOB_ACTIVE'
    : devSimulationCleanupJobActive
      ? 'SYSTEM_DEV_SIMULATION_CLEANUP_ACTIVE'
      : null;
  const devSimulationActions = [
    ...devSimulationStartActions,
    createAction({
      id: 'dev-simulation-cleanup',
      enabled: cleanupReasonCode === null,
      reasonCode: cleanupReasonCode,
      priority: 62,
      facts: {
        latestCleanupJobId:
          String(latestDevSimulationCleanupJobRecord.id ?? '').trim() || null,
      },
    }),
    createAction({
      id: 'dev-simulation-cancel',
      enabled: cancelReasonCode === null,
      reasonCode: cancelReasonCode,
      priority: 63,
      facts: {
        jobId: String(latestDevSimulationJobRecord.id ?? '').trim() || null,
      },
    }),
  ];
  const devSimulationFacts = {
    capabilities: devSimulationCapabilities,
    latestJob: latestDevSimulationJob,
    latestCleanupJob: latestDevSimulationCleanupJob,
    visibleJob: visibleDevSimulationStatus.visibleJob,
    visibleCleanupJob: visibleDevSimulationStatus.visibleCleanupJob,
    visibleStatusCode: visibleDevSimulationStatus.statusCode,
    visibleJobDisplayTargets: resolveDevSimulationDisplayTargets(
      visibleDevSimulationStatus.visibleJob,
    ),
    visibleJobDiagnostic: resolveDevSimulationJobDiagnostic(
      visibleDevSimulationStatus.visibleJob,
    ),
    cleanupSummary: resolveDevSimulationCleanupSummary(
      latestDevSimulationCleanupJobRecord,
    ),
    statusCode: devSimulationJobActive
      ? 'JOB_ACTIVE'
      : devSimulationCleanupJobActive
        ? 'CLEANUP_ACTIVE'
        : 'READY',
    reasonCode: devSimulationJobActive
      ? 'SYSTEM_DEV_SIMULATION_JOB_ACTIVE'
      : devSimulationCleanupJobActive
        ? 'SYSTEM_DEV_SIMULATION_CLEANUP_ACTIVE'
        : null,
    jobActive: devSimulationJobActive,
    cleanupJobActive: devSimulationCleanupJobActive,
    latestJobFinal: FINAL_JOB_STATUS.has(devSimulationJobStatus),
    latestCleanupJobFinal: FINAL_JOB_STATUS.has(devSimulationCleanupJobStatus),
  };
  return createModel({
    deps,
    workspaceId: 'settings',
    statusCode: 'READY',
    reasonCode: null,
    tone: 'ready',
    priority: 30,
    facts: {
      appPreferences,
      retention: {
        policy: retentionPolicy,
        latestJob: latestRetentionJob,
        statusCode: retentionJobActive ? 'JOB_ACTIVE' : 'READY',
        reasonCode: retentionActionReasonCode,
      },
      retentionPolicy,
      storageUsage,
      devSimulation: devSimulationFacts,
    },
    actions: [
      createAction({ id: 'portable-export', enabled: true, priority: 20 }),
      createAction({ id: 'portable-import', enabled: true, priority: 30 }),
      createAction({ id: 'reset-all-data', enabled: true, priority: 90 }),
      createAction({
        id: 'retention-save',
        enabled: !retentionJobActive,
        reasonCode: retentionActionReasonCode,
        priority: 50,
      }),
      createAction({
        id: 'retention-preview',
        enabled: !retentionJobActive,
        reasonCode: retentionActionReasonCode,
        priority: 51,
      }),
      createAction({
        id: 'retention-start',
        enabled: !retentionJobActive,
        reasonCode: retentionActionReasonCode,
        priority: 52,
      }),
      ...devSimulationActions,
    ],
    sections: [
      createSection({
        id: 'preferences',
        statusCode: 'READY',
        tone: 'ready',
        facts: { appPreferences },
      }),
      createSection({
        id: 'retention',
        statusCode: 'READY',
        tone: 'ready',
        facts: {
          retentionPolicy,
          latestRetentionJob,
          statusCode: retentionJobActive ? 'JOB_ACTIVE' : 'READY',
          reasonCode: retentionActionReasonCode,
        },
      }),
      createSection({
        id: 'dev-simulation',
        statusCode: String(devSimulationFacts.statusCode),
        reasonCode: devSimulationFacts.reasonCode,
        tone: devSimulationFacts.reasonCode ? 'warning' : 'ready',
        facts: devSimulationFacts,
        actions: devSimulationActions,
      }),
    ],
  });
};
