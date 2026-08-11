// SPDX-License-Identifier: GPL-3.0-only

let cleanupExecutionActive = false;

export const isSystemDevSimulationCleanupExecutionActive = (): boolean =>
  cleanupExecutionActive;

export const tryAcquireSystemDevSimulationCleanupExecution = (): boolean => {
  if (cleanupExecutionActive) {
    return false;
  }
  cleanupExecutionActive = true;
  return true;
};

export const releaseSystemDevSimulationCleanupExecution = (): void => {
  cleanupExecutionActive = false;
};
