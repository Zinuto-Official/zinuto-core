// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef, useState } from "react";

export type UiFeedbackTone = "info" | "success" | "warning" | "error";

export type UiFeedbackCountdownMessage = {
  kind: "countdown";
  expiresAtMs: number;
  format: (seconds: number) => string;
  minSeconds?: number;
};

export type UiFeedbackMessage = string | UiFeedbackCountdownMessage;

export type UiFeedback<TScope extends string = string> = {
  id: number;
  tone: UiFeedbackTone;
  message: UiFeedbackMessage;
  autoHideMs: number | null;
  scope?: TScope;
};

export type UiFeedbackInput<TScope extends string = string> = Omit<
  UiFeedback<TScope>,
  "id"
>;

type TimeoutHandle = ReturnType<typeof globalThis.setTimeout> | number;

type UiFeedbackScheduler = {
  clearTimeout: (handle: TimeoutHandle) => void;
  setTimeout: (callback: () => void, ms: number) => TimeoutHandle;
};

type TimedUiFeedbackControllerArgs<TScope extends string> = {
  onChange: (feedback: UiFeedback<TScope> | null) => void;
  scheduler?: UiFeedbackScheduler;
};

export type TimedUiFeedbackController<TScope extends string> = {
  clearFeedback: () => void;
  dispose: () => void;
  getFeedback: () => UiFeedback<TScope> | null;
  showFeedback: (nextFeedback: UiFeedbackInput<TScope>) => void;
};

const resolveDefaultScheduler = (): UiFeedbackScheduler => ({
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle);
  },
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
});

const isCountdownMessage = (
  message: UiFeedbackMessage,
): message is UiFeedbackCountdownMessage =>
  typeof message === "object" &&
  message !== null &&
  message.kind === "countdown";

export const createCountdownUiFeedbackMessage = ({
  durationMs,
  format,
  minSeconds = 1,
  nowMs = Date.now(),
}: {
  durationMs: number;
  format: (seconds: number) => string;
  minSeconds?: number;
  nowMs?: number;
}): UiFeedbackCountdownMessage => ({
  expiresAtMs: nowMs + Math.max(0, Math.ceil(durationMs)),
  format,
  kind: "countdown",
  minSeconds,
});

export const resolveUiFeedbackMessage = (
  message: UiFeedbackMessage,
  nowMs = Date.now(),
): string => {
  if (!isCountdownMessage(message)) {
    return String(message || "").trim();
  }
  const remainingMs = message.expiresAtMs - nowMs;
  if (remainingMs <= 0) {
    return "";
  }
  const minSeconds =
    typeof message.minSeconds === "number" && Number.isFinite(message.minSeconds)
      ? Math.max(0, Math.floor(message.minSeconds))
      : 1;
  return String(
    message.format(Math.max(minSeconds, Math.ceil(remainingMs / 1000))) || "",
  ).trim();
};

const resolveCountdownAutoHideMs = (
  message: UiFeedbackMessage,
  nowMs: number,
): number | null =>
  isCountdownMessage(message) ? Math.max(0, message.expiresAtMs - nowMs) : null;

export const createTimedUiFeedbackController = <TScope extends string>({
  onChange,
  scheduler = resolveDefaultScheduler(),
}: TimedUiFeedbackControllerArgs<TScope>): TimedUiFeedbackController<TScope> => {
  let activeFeedback: UiFeedback<TScope> | null = null;
  let nextFeedbackId = 0;
  let timeoutHandle: TimeoutHandle | null = null;

  const commitFeedback = (feedback: UiFeedback<TScope> | null) => {
    activeFeedback = feedback;
    onChange(feedback);
  };

  const clearScheduledFeedback = () => {
    if (timeoutHandle === null) {
      return;
    }
    scheduler.clearTimeout(timeoutHandle);
    timeoutHandle = null;
  };

  const clearFeedback = () => {
    clearScheduledFeedback();
    commitFeedback(null);
  };

  const showFeedback = (nextFeedback: UiFeedbackInput<TScope>) => {
    clearScheduledFeedback();
    const nowMs = Date.now();
    const message = resolveUiFeedbackMessage(nextFeedback.message, nowMs);
    if (!message) {
      commitFeedback(null);
      return;
    }
    nextFeedbackId += 1;
    const autoHideMs =
      nextFeedback.autoHideMs ??
      resolveCountdownAutoHideMs(nextFeedback.message, nowMs);
    const resolvedFeedback: UiFeedback<TScope> = {
      ...nextFeedback,
      autoHideMs,
      id: nextFeedbackId,
    };
    commitFeedback(resolvedFeedback);
    if (
      resolvedFeedback.autoHideMs !== null &&
      resolvedFeedback.autoHideMs > 0
    ) {
      const activeFeedbackId = resolvedFeedback.id;
      timeoutHandle = scheduler.setTimeout(() => {
        timeoutHandle = null;
        if (activeFeedback?.id !== activeFeedbackId) {
          return;
        }
        commitFeedback(null);
      }, resolvedFeedback.autoHideMs);
    }
  };

  return {
    clearFeedback,
    dispose: clearScheduledFeedback,
    getFeedback: () => activeFeedback,
    showFeedback,
  };
};

export const useResolvedUiFeedbackMessage = (
  feedback: UiFeedback | null,
): string => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!feedback || !isCountdownMessage(feedback.message)) {
      return;
    }
    setNowMs(Date.now());
    const interval = globalThis.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => {
      globalThis.clearInterval(interval);
    };
  }, [feedback?.id, feedback?.message]);

  return feedback ? resolveUiFeedbackMessage(feedback.message, nowMs) : "";
};

export const useTimedUiFeedback = <TScope extends string = string>() => {
  const [feedback, setFeedback] = useState<UiFeedback<TScope> | null>(null);
  const controllerRef = useRef<TimedUiFeedbackController<TScope> | null>(null);

  if (controllerRef.current === null) {
    controllerRef.current = createTimedUiFeedbackController<TScope>({
      onChange: setFeedback,
    });
  }

  useEffect(() => {
    return () => {
      controllerRef.current?.dispose();
    };
  }, []);

  const clearFeedback = useCallback(() => {
    controllerRef.current?.clearFeedback();
  }, []);

  const showFeedback = useCallback((nextFeedback: UiFeedbackInput<TScope>) => {
    controllerRef.current?.showFeedback(nextFeedback);
  }, []);

  return {
    clearFeedback,
    feedback,
    showFeedback,
  };
};
