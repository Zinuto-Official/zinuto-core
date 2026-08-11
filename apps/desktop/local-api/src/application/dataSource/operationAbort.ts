// SPDX-License-Identifier: GPL-3.0-only

export const readAbortReason = (signal: AbortSignal): unknown =>
  signal.reason ?? new Error('OPERATION_ABORTED');

export const throwIfOperationAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw readAbortReason(signal);
  }
};

export const createOperationDeadline = ({
  timeoutMs,
  createTimeoutError,
}: {
  timeoutMs: number;
  createTimeoutError: () => Error;
}) => {
  const normalizedTimeoutMs = Math.max(1, Math.floor(Number(timeoutMs) || 0));
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(createTimeoutError());
  }, normalizedTimeoutMs);
  timer.unref?.();

  return {
    signal: controller.signal,
    timeoutMs: normalizedTimeoutMs,
    dispose: (): void => {
      clearTimeout(timer);
    },
  };
};
