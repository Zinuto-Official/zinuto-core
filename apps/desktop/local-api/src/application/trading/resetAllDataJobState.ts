// SPDX-License-Identifier: GPL-3.0-only

import { appError } from '../../kernel/appError.js';
import { createId } from '../../kernel/id.js';
import { nowIso } from '../../kernel/time.js';

export type ResetAllDataModuleKey =
  | 'trainingDataBytes'
  | 'replayNotesBytes'
  | 'statsDataBytes'
  | 'systemSettingsBytes'
  | 'marketDataBytes';

export type ResetAllDataModuleStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
export type ResetAllDataJobStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';

export interface ResetAllDataModuleProgress {
  key: ResetAllDataModuleKey;
  status: ResetAllDataModuleStatus;
  progressPercent: number;
}

type ResetAllDataErrorArgs = Record<string, string | number | boolean | null>;

export interface ResetAllDataJobSnapshot {
  id: string;
  status: ResetAllDataJobStatus;
  progressPercent: number;
  modules: ResetAllDataModuleProgress[];
  startedAt: string | null;
  finishedAt: string | null;
  errorCode: string | null;
  errorArgs: ResetAllDataErrorArgs | null;
  result: unknown | null;
}

export type ResetAllDataProgressCallback = (
  moduleKey: ResetAllDataModuleKey,
  progressPercent: number,
  status?: Extract<ResetAllDataModuleStatus, 'RUNNING' | 'SUCCESS'>
) => void;

type StartResetAllDataJobArgs = {
  runResetAllStoredData: (onProgress?: ResetAllDataProgressCallback) => Promise<unknown>;
  extractErrorCode: (error: unknown) => string;
};

const RESET_ALL_DATA_MODULE_ORDER: ResetAllDataModuleKey[] = [
  'trainingDataBytes',
  'replayNotesBytes',
  'statsDataBytes',
  'systemSettingsBytes',
  'marketDataBytes'
];

let resetAllDataJobState: ResetAllDataJobSnapshot | null = null;
let resetAllDataJobPromise: Promise<void> | null = null;

const scheduleResetAllDataJobRunner = (runner: () => void): void => {
  setImmediate(runner);
};

export const isResetAllStoredDataJobActiveState = (): boolean => {
  if (!resetAllDataJobState) {
    return false;
  }
  return resetAllDataJobState.status === 'QUEUED' || resetAllDataJobState.status === 'RUNNING';
};

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
};

const createResetAllDataModules = (): ResetAllDataModuleProgress[] =>
  RESET_ALL_DATA_MODULE_ORDER.map((key) => ({
    key,
    status: 'PENDING',
    progressPercent: 0
  }));

const cloneResetAllDataJobSnapshot = (state: ResetAllDataJobSnapshot): ResetAllDataJobSnapshot => ({
  ...state,
  errorArgs: state.errorArgs ? { ...state.errorArgs } : null,
  modules: state.modules.map((item) => ({ ...item }))
});

const computeResetAllDataOverallProgress = (modules: ResetAllDataModuleProgress[]): number => {
  if (!modules.length) {
    return 0;
  }
  const total = modules.reduce((sum, item) => sum + clampPercent(item.progressPercent), 0);
  return clampPercent(total / modules.length);
};

const updateResetAllDataModuleProgress = (
  state: ResetAllDataJobSnapshot,
  key: ResetAllDataModuleKey,
  patch: Partial<Pick<ResetAllDataModuleProgress, 'status' | 'progressPercent'>>
): void => {
  const target = state.modules.find((item) => item.key === key);
  if (!target) {
    return;
  }
  if (patch.status) {
    target.status = patch.status;
  }
  if (patch.progressPercent !== undefined) {
    target.progressPercent = clampPercent(patch.progressPercent);
  }
  state.progressPercent = computeResetAllDataOverallProgress(state.modules);
};

const failRunningResetAllDataModules = (state: ResetAllDataJobSnapshot): void => {
  state.modules.forEach((module) => {
    if (module.status === 'RUNNING') {
      module.status = 'FAILED';
    }
  });
  state.progressPercent = computeResetAllDataOverallProgress(state.modules);
};

const readResetAllDataErrorArgs = (error: unknown): ResetAllDataErrorArgs | null => {
  if (!error || typeof error !== 'object' || Array.isArray(error)) {
    return null;
  }
  const rawArgs =
    (error as { args?: unknown; errorArgs?: unknown }).args ??
    (error as { args?: unknown; errorArgs?: unknown }).errorArgs;
  if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) {
    return null;
  }
  const entries = Object.entries(rawArgs).flatMap(([key, value]) => {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    ) {
      return [[key, value] as const];
    }
    return [];
  });
  return entries.length ? Object.fromEntries(entries) : null;
};

export const startResetAllStoredDataJobState = ({
  runResetAllStoredData,
  extractErrorCode
}: StartResetAllDataJobArgs): ResetAllDataJobSnapshot => {
  if (resetAllDataJobState && (resetAllDataJobState.status === 'QUEUED' || resetAllDataJobState.status === 'RUNNING')) {
    return cloneResetAllDataJobSnapshot(resetAllDataJobState);
  }

  const created: ResetAllDataJobSnapshot = {
    id: createId(),
    status: 'QUEUED',
    progressPercent: 0,
    modules: createResetAllDataModules(),
    startedAt: null,
    finishedAt: null,
    errorCode: null,
    errorArgs: null,
    result: null
  };
  resetAllDataJobState = created;

  resetAllDataJobPromise = new Promise((resolve) => {
    scheduleResetAllDataJobRunner(() => {
      void (async () => {
        if (!resetAllDataJobState || resetAllDataJobState.id !== created.id) {
          return;
        }
        resetAllDataJobState.status = 'RUNNING';
        resetAllDataJobState.startedAt = nowIso();
        try {
          const result = await runResetAllStoredData((moduleKey, progressPercent, status = 'RUNNING') => {
            if (!resetAllDataJobState || resetAllDataJobState.id !== created.id) {
              return;
            }
            updateResetAllDataModuleProgress(resetAllDataJobState, moduleKey, {
              status,
              progressPercent
            });
          });
          if (!resetAllDataJobState || resetAllDataJobState.id !== created.id) {
            return;
          }
          resetAllDataJobState.result = result;
          resetAllDataJobState.modules.forEach((module) => {
            module.status = 'SUCCESS';
            module.progressPercent = 100;
          });
          resetAllDataJobState.progressPercent = 100;
          resetAllDataJobState.status = 'SUCCESS';
          resetAllDataJobState.errorCode = null;
          resetAllDataJobState.errorArgs = null;
        } catch (error) {
          if (!resetAllDataJobState || resetAllDataJobState.id !== created.id) {
            return;
          }
          resetAllDataJobState.errorCode = extractErrorCode(error);
          resetAllDataJobState.errorArgs = readResetAllDataErrorArgs(error);
          failRunningResetAllDataModules(resetAllDataJobState);
          resetAllDataJobState.status = 'FAILED';
        } finally {
          if (resetAllDataJobState && resetAllDataJobState.id === created.id) {
            resetAllDataJobState.finishedAt = nowIso();
          }
          resetAllDataJobPromise = null;
          resolve();
        }
      })();
    });
  });
  void resetAllDataJobPromise;

  return cloneResetAllDataJobSnapshot(created);
};

export const getResetAllStoredDataJobState = (jobId: string): ResetAllDataJobSnapshot => {
  const normalizedJobId = String(jobId ?? '').trim();
  if (!normalizedJobId || !resetAllDataJobState || resetAllDataJobState.id !== normalizedJobId) {
    throw appError('SYSTEM_RESET_JOB_NOT_FOUND', { jobId: normalizedJobId }, 404);
  }
  return cloneResetAllDataJobSnapshot(resetAllDataJobState);
};

export const clearSettledResetAllStoredDataJobState = (): boolean => {
  if (isResetAllStoredDataJobActiveState()) {
    return false;
  }
  resetAllDataJobState = null;
  resetAllDataJobPromise = null;
  return true;
};

export const waitForResetAllStoredDataJobIdle = async (): Promise<void> => {
  await resetAllDataJobPromise;
};
