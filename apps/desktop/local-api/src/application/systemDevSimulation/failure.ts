// SPDX-License-Identifier: GPL-3.0-only

import { isAppError } from '../../kernel/appError.js';
import type { SystemDevSimulationProfileId } from '@zinuto/shared/systemDevSimulationProfiles';
import { SYSTEM_DEV_SIMULATION_INTERRUPTED_ERROR_CODE } from '../../domain/systemDevSimulation/sharedDomain.js';
import type { MutableSystemDevSimulationJob } from '../ports/infrastructure/db/systemDevSimulation/jobStore.js';

const SYSTEM_DEV_SIMULATION_UNEXPECTED_ERROR_REASON = 'UNEXPECTED_ERROR';

type SystemDevSimulationFailureArgs = Record<
  string,
  string | number | boolean | null
>;

const normalizeFailureCount = (value: unknown): number =>
  Math.max(0, Math.floor(Number(value) || 0));

const normalizeFailureProgressPercent = (value: unknown): number =>
  Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

const buildSystemDevSimulationFailureContext = (
  job: MutableSystemDevSimulationJob,
  batchId: string,
  errorCode: string,
): SystemDevSimulationFailureArgs => {
  const customNotesTarget =
    job.effectivePlan?.profileId === 'STRESS' && !job.effectivePlan.calibrated
      ? job.effectivePlan.budget.calibrationTargets?.independentCustomNotes ?? 0
      : job.effectivePlan?.targets.independentCustomNotes ?? 0;
  const totalCompleted =
    normalizeFailureCount(job.freeReplayCompleted) +
    normalizeFailureCount(job.fastDecisionCompleted) +
    normalizeFailureCount(job.riskDisciplineCompleted);
  return {
    errorCode,
    jobId: job.id,
    batchId,
    profileId: job.profileId,
    phase: job.phase,
    progressPercent: normalizeFailureProgressPercent(job.progressPercent),
    totalCompleted,
    totalTarget: normalizeFailureCount(job.totalTarget),
    freeReplayCompleted: normalizeFailureCount(job.freeReplayCompleted),
    freeReplayTarget: normalizeFailureCount(job.freeReplayTarget),
    fastDecisionCompleted: normalizeFailureCount(job.fastDecisionCompleted),
    fastDecisionTarget: normalizeFailureCount(job.fastDecisionTarget),
    riskDisciplineCompleted: normalizeFailureCount(job.riskDisciplineCompleted),
    riskDisciplineTarget: normalizeFailureCount(job.riskDisciplineTarget),
    customNotesCreated: normalizeFailureCount(
      job.createdCounts.independentCustomNotes,
    ),
    customNotesTarget: normalizeFailureCount(customNotesTarget),
    effectivePlanCalibrated: Boolean(job.effectivePlan?.calibrated),
  };
};

const readUnexpectedSystemDevSimulationErrorDetails = (
  error: unknown,
): {
  errorName?: string;
  errorDetail?: string;
} | null => {
  if (error instanceof Error) {
    const errorName = String(error.name || '').trim();
    const errorDetail = String(error.message || '').trim();
    if (!errorName && !errorDetail) {
      return null;
    }
    return {
      ...(errorName ? { errorName } : {}),
      ...(errorDetail ? { errorDetail } : {}),
    };
  }
  if (typeof error === 'string' && error.trim()) {
    return {
      errorDetail: error.trim(),
    };
  }
  return null;
};

const normalizeUnexpectedSystemDevSimulationErrorArgs = (
  error: unknown,
  context: SystemDevSimulationFailureArgs,
): SystemDevSimulationFailureArgs => ({
  ...context,
  reason: SYSTEM_DEV_SIMULATION_UNEXPECTED_ERROR_REASON,
  ...(readUnexpectedSystemDevSimulationErrorDetails(error) ?? {}),
});

const logUnexpectedSystemDevSimulationFailure = (
  error: unknown,
  context: {
    jobId: string;
    batchId: string;
    profileId: SystemDevSimulationProfileId;
    phase: MutableSystemDevSimulationJob['phase'];
    progressPercent: number;
    freeReplayCompleted: number;
    freeReplayTarget: number;
    fastDecisionCompleted: number;
    fastDecisionTarget: number;
    riskDisciplineCompleted: number;
    riskDisciplineTarget: number;
  },
): void => {
  // eslint-disable-next-line no-console
  console.error('[zinuto-system-dev-simulation] unexpected job failure', {
    ...context,
  });
  if (error instanceof Error) {
    // eslint-disable-next-line no-console
    console.error(error.stack || `${error.name}: ${error.message}`);
    return;
  }
  // eslint-disable-next-line no-console
  console.error(error);
};

export const normalizeSystemDevSimulationJobFailure = (
  error: unknown,
  job: MutableSystemDevSimulationJob,
  batchId: string,
): {
  interrupted: boolean;
  errorCode: string;
  errorArgs: SystemDevSimulationFailureArgs | null;
  errorMessage: string;
} => {
  const interrupted =
    isAppError(error) &&
    error.code === SYSTEM_DEV_SIMULATION_INTERRUPTED_ERROR_CODE;
  if (isAppError(error)) {
    const context = buildSystemDevSimulationFailureContext(
      job,
      batchId,
      error.code,
    );
    const errorArgs = {
      ...(error.args ?? {}),
      ...context,
      reason: error.args?.reason ?? error.code,
    };
    return {
      interrupted,
      errorCode: error.code,
      errorArgs,
      errorMessage: error.code,
    };
  }
  const context = buildSystemDevSimulationFailureContext(
    job,
    batchId,
    'SYSTEM_DEV_SIMULATION_FAILED',
  );
  logUnexpectedSystemDevSimulationFailure(error, {
    jobId: job.id,
    batchId,
    profileId: job.profileId,
    phase: job.phase,
    progressPercent: normalizeFailureProgressPercent(context.progressPercent),
    freeReplayCompleted: job.freeReplayCompleted,
    freeReplayTarget: job.freeReplayTarget,
    fastDecisionCompleted: job.fastDecisionCompleted,
    fastDecisionTarget: job.fastDecisionTarget,
    riskDisciplineCompleted: job.riskDisciplineCompleted,
    riskDisciplineTarget: job.riskDisciplineTarget,
  });
  return {
    interrupted: false,
    errorCode: 'SYSTEM_DEV_SIMULATION_FAILED',
    errorArgs: normalizeUnexpectedSystemDevSimulationErrorArgs(error, context),
    errorMessage: 'SYSTEM_DEV_SIMULATION_FAILED',
  };
};
