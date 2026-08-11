// SPDX-License-Identifier: GPL-3.0-only

import { appError } from "../../../kernel/appError.js";
import { parseStoredJsonSafe } from "../../../kernel/compressedJson.js";
import { resolveSpecialTrainingLookbackBars } from "@zinuto/shared/specialTrainingModes";
import {
  countSimulationSpecialTrainingBanksByBatchIds,
  countSimulationSpecialTrainingHistorySessionsByBatchIds,
  countSimulationTrainingProjectsByBatchIds,
  countSimulationBacktestBatchesByBatchId,
  countSimulationCustomIndicatorProfilesByBatchId,
} from "../../ports/infrastructure/db/systemDevSimulation/cleanupStore.js";
import {
  listChallengeQuestionVerificationRows,
  listChallengeSessionVerificationRows,
  listReplayNoteVerificationRows,
  listReplayRefVerificationRows,
  type ReplayRefVerificationRow,
} from "../../ports/infrastructure/db/systemDevSimulation/verificationStore.js";
import type {
  MutableSystemDevSimulationJob,
  StartSystemDevSimulationPayload,
} from "../../ports/infrastructure/db/systemDevSimulation/jobStore.js";

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
};

const toInteger = (value: unknown, fallback = 0): number =>
  Math.floor(toFiniteNumber(value, fallback));

const failVerification = (
  job: MutableSystemDevSimulationJob,
  reason: string,
  details?: Record<string, string | number | boolean | null>,
): never => {
  job.metrics.verificationStatus = "FAILED";
  throw appError("SYSTEM_DEV_SIMULATION_FAILED", {
    reason,
    ...(details ?? {}),
  });
};

const verifyReplayRefDrawingPayload = (
  row: ReplayRefVerificationRow,
): string[] => {
  const startMs = Date.parse(String(row.start_ts ?? ""));
  const endMs = Date.parse(String(row.end_ts ?? ""));
  const storedPayload = parseStoredJsonSafe<{ drawings?: unknown[] }>(
    row.payload_blob,
    { drawings: [] },
  );
  const drawings = Array.isArray(storedPayload.drawings)
    ? storedPayload.drawings
    : [];
  if (drawings.length > 4) {
    throw new Error("TOO_MANY_DRAWINGS");
  }
  const names: string[] = [];
  drawings.forEach((drawing) => {
    if (!Array.isArray(drawing) || drawing.length < 3) {
      throw new Error("INVALID_DRAWING");
    }
    const name = String(drawing[1] ?? "").trim();
    const points = Array.isArray(drawing[2]) ? drawing[2] : [];
    if (!name || !points.length) {
      throw new Error("INVALID_DRAWING");
    }
    names.push(name);
    points.forEach((point) => {
      if (!Array.isArray(point) || point.length < 2) {
        throw new Error("INVALID_DRAWING_POINT");
      }
      const timestamp = toFiniteNumber(point[0], Number.NaN);
      const value = toFiniteNumber(point[1], Number.NaN);
      if (!Number.isFinite(timestamp) || !Number.isFinite(value)) {
        throw new Error("INVALID_DRAWING_POINT");
      }
      if (
        Number.isFinite(startMs) &&
        Number.isFinite(endMs) &&
        (timestamp < startMs || timestamp > endMs)
      ) {
        throw new Error("DRAWING_POINT_OUT_OF_RANGE");
      }
    });
  });
  return names;
};

const verifyReplayArtifacts = (
  job: MutableSystemDevSimulationJob,
  batchId: string,
): void => {
  const rows = listReplayRefVerificationRows(batchId);
  const drawingToolNames = new Set<string>();
  let projectsWithTrades = 0;
  rows.forEach((row) => {
    const projectId = String(row.id ?? "").trim();
    const historyBars = toInteger(row.history_bars, 0);
    const entryIndex = toInteger(row.entry_index, -1);
    const cursorIndex = toInteger(row.cursor_index, -1);
    if (!projectId || historyBars <= 0 || entryIndex < 0 || cursorIndex < entryIndex) {
      failVerification(job, "VERIFY_REPLAY_REF_INVALID", {
        projectId,
        historyBars,
        entryIndex,
        cursorIndex,
      });
    }
    const totalTrades = toInteger(row.total_trades, 0);
    if (totalTrades > 0) {
      projectsWithTrades += 1;
    }
    try {
      verifyReplayRefDrawingPayload(row).forEach((toolName) =>
        drawingToolNames.add(toolName),
      );
    } catch (error) {
      failVerification(job, "VERIFY_REPLAY_DRAWINGS_INVALID", {
        projectId,
        detail: error instanceof Error ? error.message : "UNKNOWN",
      });
    }
  });

  // Watch-only replays are valid user-facing sessions. Non-watch scenarios
  // assert their own required trade before archive, so batch verification only
  // needs to ensure the completed batch includes genuine trading activity.
  if (rows.length > 0 && projectsWithTrades === 0) {
    failVerification(job, "VERIFY_FREE_REPLAY_NO_REAL_TRADE", {
      projectCount: rows.length,
      projectsWithTrades,
    });
  }

  const expectedDrawingTools =
    job.effectivePlan?.coverage.drawingTools?.map((tool) => String(tool)) ?? [];
  if (rows.length >= expectedDrawingTools.length) {
    const missingDrawingTool = expectedDrawingTools.find(
      (toolName) => !drawingToolNames.has(toolName),
    );
    if (missingDrawingTool) {
      failVerification(job, "VERIFY_REPLAY_DRAWING_COVERAGE_MISSING", {
        toolName: missingDrawingTool,
      });
    }
  }
};

const verifyReplayNoteContexts = (
  job: MutableSystemDevSimulationJob,
  batchId: string,
): void => {
  const rows = listReplayNoteVerificationRows(batchId);
  rows.forEach((row) => {
    const noteId = String(row.id ?? "").trim();
    const projectId = String(row.training_project_id ?? "").trim();
    const contextCursor = toInteger(row.context_cursor_index, -1);
    const replayCursor = toInteger(row.cursor_index, -1);
    if (
      !noteId ||
      !projectId ||
      contextCursor < 0 ||
      replayCursor < 0 ||
      contextCursor > replayCursor
    ) {
      failVerification(job, "VERIFY_REPLAY_NOTE_CONTEXT_INVALID", {
        noteId,
        projectId,
        contextCursor,
        replayCursor,
      });
    }
  });
};

const verifyChallengeArtifacts = (
  job: MutableSystemDevSimulationJob,
  batchId: string,
): void => {
  const sessions = listChallengeSessionVerificationRows(batchId);
  sessions.forEach((row) => {
    const modeId = String(row.mode_id ?? "");
    const completedQuestionCount = toInteger(row.completed_question_count, 0);
    const decisionSecondsTotal = toFiniteNumber(row.decision_seconds_total, 0);
    const decisionSecondsAverage = toFiniteNumber(row.decision_seconds_average, 0);
    if (
      completedQuestionCount <= 0 ||
      decisionSecondsTotal <= 0 ||
      decisionSecondsAverage <= 0
    ) {
      failVerification(job, "VERIFY_CHALLENGE_TIMELINE_INVALID", {
        modeId,
        completedQuestionCount,
        decisionSecondsTotal,
        decisionSecondsAverage,
      });
    }
  });

  const questions = listChallengeQuestionVerificationRows(batchId);
  questions.forEach((row) => {
    const modeId = String(row.mode_id ?? "");
    const requiredLookback =
      modeId === "fast-decision-training" || modeId === "risk-discipline-training"
        ? resolveSpecialTrainingLookbackBars(modeId)
        : 0;
    const windowBarCount = toInteger(row.window_bar_count, 0);
    const startIndex = toInteger(row.start_index, 0);
    const endIndex = toInteger(row.end_index, 0);
    const usedOperations = toInteger(row.used_operations, 0);
    const maxOperations = toInteger(row.max_operations, 0);
    if (
      requiredLookback <= 0 ||
      startIndex + 1 < requiredLookback ||
      windowBarCount < requiredLookback + 1 ||
      endIndex <= startIndex ||
      (maxOperations > 0 && usedOperations > maxOperations)
    ) {
      failVerification(job, "VERIFY_CHALLENGE_QUESTION_INVALID", {
        modeId,
        requiredLookback,
        windowBarCount,
        startIndex,
        endIndex,
        usedOperations,
        maxOperations,
      });
    }
  });
};

export const verifySystemDevSimulationBatchCounts = (input: {
  job: MutableSystemDevSimulationJob;
  payload: StartSystemDevSimulationPayload;
  countIndependentCustomNotesByBatchId: (simulationBatchId: string) => number;
}): void => {
  const batchIds = [input.payload.batchId];
  const trainingProjects = countSimulationTrainingProjectsByBatchIds(batchIds);
  const fastDecisionSessions = countSimulationSpecialTrainingHistorySessionsByBatchIds(
    batchIds,
    "fast-decision-training",
  );
  const riskDisciplineSessions =
    countSimulationSpecialTrainingHistorySessionsByBatchIds(
      batchIds,
      "risk-discipline-training",
    );
  const independentCustomNotes = input.countIndependentCustomNotesByBatchId(
    input.payload.batchId,
  );
  const specialTrainingBanks =
    countSimulationSpecialTrainingBanksByBatchIds(batchIds);
  const requiredCustomNotes =
    Number(input.job.effectivePlan?.targets.independentCustomNotes) || 0;
  const requiredIndicators =
    Number(input.job.effectivePlan?.targets.customIndicatorProfiles) || 0;
  const requiredRealBacktests =
    Number(input.job.effectivePlan?.targets.realBacktestBatches) || 0;
  if (
    trainingProjects < input.job.freeReplayTarget ||
    fastDecisionSessions < input.job.fastDecisionTarget ||
    riskDisciplineSessions < input.job.riskDisciplineTarget ||
    specialTrainingBanks <
      input.job.fastDecisionTarget + input.job.riskDisciplineTarget ||
    input.job.createdCounts.desktopMutableRuns < 1 ||
    independentCustomNotes < requiredCustomNotes ||
    countSimulationCustomIndicatorProfilesByBatchId(input.payload.batchId) <
      requiredIndicators ||
    countSimulationBacktestBatchesByBatchId(input.payload.batchId, "real") <
      requiredRealBacktests
  ) {
    failVerification(input.job, "VERIFY_COUNTS_MISMATCH");
  }
  verifyReplayArtifacts(input.job, input.payload.batchId);
  verifyReplayNoteContexts(input.job, input.payload.batchId);
  verifyChallengeArtifacts(input.job, input.payload.batchId);
  input.job.metrics.verificationStatus = "SUCCESS";
};
