// SPDX-License-Identifier: GPL-3.0-only

import { appError } from "../../../kernel/appError.js";
import type { MutableSystemDevSimulationJob } from "../../ports/infrastructure/db/systemDevSimulation/jobStore.js";
import type { SystemDevSimulationFreeReplayPlanItem } from "../freeReplayPlan.js";
import {
  throwIfSystemDevSimulationTaskAborted,
  trackSystemDevSimulationTaskExecution,
} from "../taskExecutionState.js";

export const DEFAULT_SYSTEM_DEV_SIMULATION_ITEM_TIMEOUT_MS = 120_000;
export const DEFAULT_SYSTEM_DEV_SIMULATION_WORKLOAD_TIMEOUT_MS = 120_000;
const SYSTEM_DEV_SIMULATION_TASK_ABORT_DRAIN_MS = 250;

type JobPoolRunner = (
  total: number,
  concurrency: number,
  worker: (index: number) => Promise<void>,
) => Promise<void>;

type JobRetryRunner = <T>(
  task: () => Promise<T>,
  signal?: AbortSignal,
) => Promise<T>;

type FreeReplayWorkloadResult = {
  replayNotesCreated: number;
};

type ChallengeWorkloadResult = {
  replayNotesCreated: number;
  questionCount: number;
  coverage?: {
    createdQuestionBanks?: number;
  };
};

type WorkloadItemContext = {
  index: number;
  target: number;
};

type TimedWorkloadName =
  | "FREE_REPLAY"
  | "FAST_DECISION"
  | "RISK_DISCIPLINE"
  | "CUSTOM_NOTE"
  | "DESKTOP_MUTABLE"
  | "VERIFYING";

const normalizeTimeoutMs = (value: unknown, fallback: number): number => {
  const normalized = Math.floor(Number(value) || 0);
  return normalized > 0 ? normalized : fallback;
};

const resolveSignalAbortError = (signal: AbortSignal): unknown => {
  try {
    throwIfSystemDevSimulationTaskAborted(signal);
  } catch (error) {
    return error;
  }
  return appError("SYSTEM_DEV_SIMULATION_INTERRUPTED");
};

const waitForTaskAbortDrain = async (task: Promise<unknown>): Promise<void> => {
  let drainTimeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    await Promise.race([
      task.then(() => undefined),
      new Promise<void>((resolve) => {
        drainTimeoutId = setTimeout(resolve, SYSTEM_DEV_SIMULATION_TASK_ABORT_DRAIN_MS);
      }),
    ]);
  } finally {
    if (drainTimeoutId) {
      clearTimeout(drainTimeoutId);
    }
  }
};

export const runSystemDevSimulationTimedTask = async <T>(input: {
  task: (signal: AbortSignal) => Promise<T>;
  signal?: AbortSignal;
  timeoutMs?: number;
  fallbackTimeoutMs?: number;
  phase: MutableSystemDevSimulationJob["phase"];
  workload: TimedWorkloadName;
  index?: number | null;
  target?: number | null;
  timeoutReason?: "ITEM_TIMEOUT" | "WORKLOAD_TIMEOUT";
}): Promise<T> => {
  const timeoutMs = normalizeTimeoutMs(
    input.timeoutMs,
    input.fallbackTimeoutMs ??
      DEFAULT_SYSTEM_DEV_SIMULATION_WORKLOAD_TIMEOUT_MS,
  );
  throwIfSystemDevSimulationTaskAborted(input.signal);
  const taskController = new AbortController();
  type StopOutcome = { kind: "STOP"; error: unknown };
  let stopTask: ((outcome: StopOutcome) => void) | null = null;
  const stopPromise = new Promise<StopOutcome>((resolve) => {
    stopTask = resolve;
  });
  const abortFromParent = (): void => {
    const parentSignal = input.signal;
    if (!parentSignal) {
      return;
    }
    const error = resolveSignalAbortError(parentSignal);
    if (!taskController.signal.aborted) {
      taskController.abort(error);
    }
    stopTask?.({ kind: "STOP", error });
  };
  input.signal?.addEventListener("abort", abortFromParent, { once: true });

  const taskPromise = trackSystemDevSimulationTaskExecution(
    Promise.resolve().then(() => {
      throwIfSystemDevSimulationTaskAborted(taskController.signal);
      return input.task(taskController.signal);
    }),
  );
  const taskOutcome = taskPromise.then(
    (value) => ({ kind: "VALUE" as const, value }),
    (error: unknown) => ({ kind: "ERROR" as const, error }),
  );
  let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    const error = appError("SYSTEM_DEV_SIMULATION_FAILED", {
      reason: input.timeoutReason ?? "WORKLOAD_TIMEOUT",
      phase: input.phase,
      workload: input.workload,
      index:
        Number.isFinite(Number(input.index)) && Number(input.index) >= 0
          ? Math.floor(Number(input.index))
          : null,
      target:
        Number.isFinite(Number(input.target)) && Number(input.target) >= 0
          ? Math.floor(Number(input.target))
          : null,
      timeoutMs,
    });
    if (!taskController.signal.aborted) {
      taskController.abort(error);
    }
    stopTask?.({ kind: "STOP", error });
  }, timeoutMs);

  if (input.signal?.aborted) {
    abortFromParent();
  }
  try {
    const outcome = await Promise.race([taskOutcome, stopPromise]);
    if (outcome.kind === "VALUE") {
      throwIfSystemDevSimulationTaskAborted(taskController.signal);
      return outcome.value;
    }
    if (outcome.kind === "ERROR") {
      throw outcome.error;
    }
    await waitForTaskAbortDrain(taskOutcome);
    throw outcome.error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    input.signal?.removeEventListener("abort", abortFromParent);
    stopTask = null;
  }
};

export const runSystemDevSimulationFreeReplayWorkload = async (input: {
  job: MutableSystemDevSimulationJob;
  startIndex: number;
  target: number;
  concurrency: number;
  runPool: JobPoolRunner;
  withRetry: JobRetryRunner;
  maybeThrowInterrupted: (job: MutableSystemDevSimulationJob) => void;
  executeItem: (
    item: SystemDevSimulationFreeReplayPlanItem,
    index: number,
    signal: AbortSignal,
  ) => Promise<FreeReplayWorkloadResult>;
  items: readonly SystemDevSimulationFreeReplayPlanItem[];
  onBeforeItem?: (context: WorkloadItemContext) => void | Promise<void>;
  onItemCompleted: (context: {
    index: number;
    durationMs: number;
    result: FreeReplayWorkloadResult;
  }) => void | Promise<void>;
  itemTimeoutMs?: number;
  signal?: AbortSignal;
}): Promise<void> => {
  if (input.startIndex >= input.target) {
    return;
  }
  await input.runPool(
    input.target - input.startIndex,
    input.concurrency,
    async (relativeIndex) => {
      throwIfSystemDevSimulationTaskAborted(input.signal);
      input.maybeThrowInterrupted(input.job);
      const index = input.startIndex + relativeIndex;
      await input.onBeforeItem?.({
        index,
        target: input.target,
      });
      const item = input.items[index];
      if (!item) {
        throw appError("SYSTEM_DEV_SIMULATION_INVALID");
      }
      const startedAtMs = Date.now();
      const result = await runSystemDevSimulationTimedTask({
        task: (signal) =>
          input.withRetry(() => input.executeItem(item, index, signal), signal),
        signal: input.signal,
        timeoutMs: input.itemTimeoutMs,
        fallbackTimeoutMs: DEFAULT_SYSTEM_DEV_SIMULATION_ITEM_TIMEOUT_MS,
        phase: input.job.phase,
        workload: "FREE_REPLAY",
        index,
        target: input.target,
        timeoutReason: "ITEM_TIMEOUT",
      });
      throwIfSystemDevSimulationTaskAborted(input.signal);
      await input.onItemCompleted({
        index,
        durationMs: Date.now() - startedAtMs,
        result,
      });
    },
  );
};

export const runSystemDevSimulationChallengeWorkload = async (input: {
  job: MutableSystemDevSimulationJob;
  startIndex: number;
  target: number;
  concurrency: number;
  runPool: JobPoolRunner;
  withRetry: JobRetryRunner;
  maybeThrowInterrupted: (job: MutableSystemDevSimulationJob) => void;
  executeItem: (
    index: number,
    signal: AbortSignal,
  ) => Promise<ChallengeWorkloadResult>;
  onBeforeItem?: (context: WorkloadItemContext) => void | Promise<void>;
  onItemCompleted: (context: {
    index: number;
    durationMs: number;
    result: ChallengeWorkloadResult;
  }) => void | Promise<void>;
  itemTimeoutMs?: number;
  workload: "FAST_DECISION" | "RISK_DISCIPLINE";
  signal?: AbortSignal;
}): Promise<void> => {
  if (input.startIndex >= input.target) {
    return;
  }
  await input.runPool(
    input.target - input.startIndex,
    input.concurrency,
    async (relativeIndex) => {
      throwIfSystemDevSimulationTaskAborted(input.signal);
      input.maybeThrowInterrupted(input.job);
      const index = input.startIndex + relativeIndex;
      await input.onBeforeItem?.({
        index,
        target: input.target,
      });
      const startedAtMs = Date.now();
      const result = await runSystemDevSimulationTimedTask({
        task: (signal) =>
          input.withRetry(() => input.executeItem(index, signal), signal),
        signal: input.signal,
        timeoutMs: input.itemTimeoutMs,
        fallbackTimeoutMs: DEFAULT_SYSTEM_DEV_SIMULATION_ITEM_TIMEOUT_MS,
        phase: input.job.phase,
        workload: input.workload,
        index,
        target: input.target,
        timeoutReason: "ITEM_TIMEOUT",
      });
      throwIfSystemDevSimulationTaskAborted(input.signal);
      await input.onItemCompleted({
        index,
        durationMs: Date.now() - startedAtMs,
        result,
      });
    },
  );
};

export const runSystemDevSimulationCustomNoteWorkload = async (input: {
  remainingCount: number;
  createNotes: (count: number, signal: AbortSignal) => Promise<number>;
  onCompleted: (context: {
    createdCount: number;
    averageDurationMs: number;
  }) => void | Promise<void>;
  phase?: MutableSystemDevSimulationJob["phase"];
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<void> => {
  if (input.remainingCount <= 0) {
    return;
  }
  const startedAtMs = Date.now();
  const createdCount = await runSystemDevSimulationTimedTask({
    task: (signal) => input.createNotes(input.remainingCount, signal),
    signal: input.signal,
    timeoutMs: input.timeoutMs,
    fallbackTimeoutMs: DEFAULT_SYSTEM_DEV_SIMULATION_WORKLOAD_TIMEOUT_MS,
    phase: input.phase ?? "FREE_REPLAY",
    workload: "CUSTOM_NOTE",
    index: null,
    target: input.remainingCount,
    timeoutReason: "WORKLOAD_TIMEOUT",
  });
  if (createdCount <= 0) {
    return;
  }
  throwIfSystemDevSimulationTaskAborted(input.signal);
  await input.onCompleted({
    createdCount,
    averageDurationMs: Math.round((Date.now() - startedAtMs) / createdCount),
  });
};
