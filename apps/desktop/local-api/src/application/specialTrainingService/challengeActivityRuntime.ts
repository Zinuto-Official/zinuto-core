// SPDX-License-Identifier: GPL-3.0-only

import {
  createSpecialTrainingFastDecisionTimer,
  pauseSpecialTrainingFastDecisionTimer,
  readSpecialTrainingFastDecisionTimer,
  resumeSpecialTrainingFastDecisionTimer,
  type SpecialTrainingFastDecisionTimerRuntime,
} from "../../domain/specialTraining/fastDecisionTimer.js";
import type { SpecialTrainingFastDecisionTimerState } from "../../domain/specialTraining/contracts.js";

export type SpecialTrainingFastDecisionTimerStore = Map<
  string,
  SpecialTrainingFastDecisionTimerRuntime
>;

type SpecialTrainingChallengeActivityState = {
  modeId: string;
  activityPaused: boolean;
  decisionSecondsLimit: number;
  settledEntriesByQuestionId: ReadonlyMap<string, unknown>;
  fastDecisionTimersByQuestionId: SpecialTrainingFastDecisionTimerStore;
};

export const getOrCreateFastDecisionTimer = (
  challenge: SpecialTrainingChallengeActivityState,
  questionId: string,
): SpecialTrainingFastDecisionTimerRuntime => {
  const normalizedQuestionId = String(questionId || "").trim();
  const existing = challenge.fastDecisionTimersByQuestionId.get(
    normalizedQuestionId,
  );
  if (existing) {
    return existing;
  }
  const timer = createSpecialTrainingFastDecisionTimer(
    Date.now(),
    challenge.activityPaused,
  );
  challenge.fastDecisionTimersByQuestionId.set(normalizedQuestionId, timer);
  return timer;
};

export const buildFastDecisionTimerSnapshot = (
  challenge: SpecialTrainingChallengeActivityState,
  questionId: string | null,
): SpecialTrainingFastDecisionTimerState | null => {
  if (challenge.modeId !== "fast-decision-training" || !questionId) {
    return null;
  }
  const timer = getOrCreateFastDecisionTimer(challenge, questionId);
  const nowMs = Date.now();
  const secondsLimit = Math.max(0, Math.floor(challenge.decisionSecondsLimit));
  const snapshot = readSpecialTrainingFastDecisionTimer(
    timer,
    nowMs,
    secondsLimit,
  );
  const isSettled = challenge.settledEntriesByQuestionId.has(questionId);
  return {
    state: isSettled
      ? "SETTLED"
      : challenge.activityPaused
        ? "PAUSED"
        : "RUNNING",
    startedAt: new Date(timer.startedAtMs).toISOString(),
    deadlineAt:
      snapshot.deadlineAtMs === null
        ? null
        : new Date(snapshot.deadlineAtMs).toISOString(),
    serverNow: new Date(nowMs).toISOString(),
    secondsLimit,
    elapsedSeconds: snapshot.elapsedSeconds,
    remainingSeconds: snapshot.remainingSeconds,
    timedOut: !isSettled && snapshot.remainingSeconds <= 0,
  };
};

export const applySpecialTrainingChallengeActivity = (
  challenge: SpecialTrainingChallengeActivityState,
  paused: boolean,
  nowMs = Date.now(),
): void => {
  if (challenge.activityPaused === paused) {
    return;
  }
  challenge.fastDecisionTimersByQuestionId.forEach((timer, questionId) => {
    if (paused) {
      pauseSpecialTrainingFastDecisionTimer(timer, nowMs);
    } else if (!challenge.settledEntriesByQuestionId.has(questionId)) {
      resumeSpecialTrainingFastDecisionTimer(timer, nowMs);
    }
  });
  challenge.activityPaused = paused;
};

export const settleSpecialTrainingFastDecisionTimer = (
  challenge: SpecialTrainingChallengeActivityState,
  questionId: string,
  nowMs = Date.now(),
): void => {
  const timer = challenge.fastDecisionTimersByQuestionId.get(questionId);
  if (timer) {
    pauseSpecialTrainingFastDecisionTimer(timer, nowMs);
  }
};
