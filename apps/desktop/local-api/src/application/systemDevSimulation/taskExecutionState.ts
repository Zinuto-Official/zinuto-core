// SPDX-License-Identifier: GPL-3.0-only

import { appError, isAppError } from "../../kernel/appError.js";

const ACTIVE_TASK_EXECUTIONS = new Set<Promise<void>>();

export const throwIfSystemDevSimulationTaskAborted = (
  signal: AbortSignal | undefined,
): void => {
  if (!signal?.aborted) {
    return;
  }
  if (isAppError(signal.reason)) {
    throw signal.reason;
  }
  throw appError("SYSTEM_DEV_SIMULATION_INTERRUPTED", {
    reason: "TASK_ABORTED",
  });
};

export const trackSystemDevSimulationTaskExecution = <T>(
  task: Promise<T>,
): Promise<T> => {
  const settled = task.then(
    () => undefined,
    () => undefined,
  );
  ACTIVE_TASK_EXECUTIONS.add(settled);
  void settled.then(() => {
    ACTIVE_TASK_EXECUTIONS.delete(settled);
  });
  return task;
};

export const hasActiveSystemDevSimulationTaskExecution = (): boolean =>
  ACTIVE_TASK_EXECUTIONS.size > 0;

export const waitForSystemDevSimulationTaskExecutions = async (): Promise<void> => {
  while (ACTIVE_TASK_EXECUTIONS.size > 0) {
    await Promise.all(Array.from(ACTIVE_TASK_EXECUTIONS));
  }
};
