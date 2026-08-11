// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-special-training-duration-estimate-"),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const [{ db, DEFAULT_USER_ID }, { estimateSpecialTrainingDuration }] =
  await Promise.all([
    import("../../src/infrastructure/db/database.js"),
    import("../../src/application/specialTrainingDurationEstimateService.js"),
  ]);

test.after(async () => {
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

test.beforeEach(() => {
  db.prepare("DELETE FROM special_training_history_questions").run();
  db.prepare("DELETE FROM special_training_history_sessions").run();
});

const insertSessionStmt = db.prepare(
  `INSERT INTO special_training_history_sessions (
    id,user_id,challenge_id,mode_id,source_tag,timeframe,question_count,completed_question_count,
    passed_question_count,failed_question_count,missed_question_count,timed_out_question_count,
    decision_seconds_total,decision_seconds_average,max_consecutive_passes,config_json,session_summary_json,operator_summary_json,
    created_at,finished_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
);

let sessionSequence = 0;

const buildOperatorSummary = () =>
  JSON.stringify({
    operatorKind: "HUMAN",
    operationMode: null,
    operatorSource: null,
    clientLabel: null,
    modelLabel: null,
    runId: null,
    actionCount: 0,
    orderCount: 0,
    decisionCount: 0,
    decisionSecondsUsed: 0,
    nonTradeActionCount: 0,
    errorActionCount: 0,
    forcedLiquidationCount: 0,
  });

const insertHistorySession = (input: {
  modeId: "fast-decision-training" | "risk-discipline-training";
  questionCount?: number;
  perQuestionSeconds: number;
  horizonBars: number;
  decisionSecondsLimit?: number;
}) => {
  sessionSequence += 1;
  const questionCount = input.questionCount ?? 10;
  const createdAtMs = Date.UTC(2026, 0, 1, 0, sessionSequence, 0);
  const finishedAtMs =
    createdAtMs + Math.round(input.perQuestionSeconds * questionCount * 1000);
  const createdAt = new Date(createdAtMs).toISOString();
  const finishedAt = new Date(finishedAtMs).toISOString();
  insertSessionStmt.run(
    `session-${sessionSequence}`,
    DEFAULT_USER_ID,
    `challenge-${sessionSequence}`,
    input.modeId,
    "",
    "1d",
    questionCount,
    questionCount,
    questionCount,
    0,
    0,
    0,
    0,
    0,
    questionCount,
    JSON.stringify({
      horizonBars: input.horizonBars,
      decisionSecondsLimit: input.decisionSecondsLimit ?? 20,
    }),
    null,
    buildOperatorSummary(),
    createdAt,
    finishedAt,
    finishedAt,
  );
};

test("exact fast-decision history wins over fallback", () => {
  insertHistorySession({
    modeId: "fast-decision-training",
    perQuestionSeconds: 69,
    horizonBars: 20,
    decisionSecondsLimit: 60,
  });
  insertHistorySession({
    modeId: "fast-decision-training",
    perQuestionSeconds: 69,
    horizonBars: 20,
    decisionSecondsLimit: 60,
  });
  insertHistorySession({
    modeId: "fast-decision-training",
    perQuestionSeconds: 69,
    horizonBars: 20,
    decisionSecondsLimit: 60,
  });

  const result = estimateSpecialTrainingDuration({
    modeId: "fast-decision-training",
    operatorMode: "HUMAN",
    questionCount: 20,
    horizonBars: 20,
    decisionSecondsLimit: 60,
  });

  assert.deepEqual(result, {
    minMinutes: 21,
    maxMinutes: 25,
    basis: "EXACT_HISTORY",
    sampleCount: 3,
  });
});

test("fast-decision estimate increases when decisionSecondsLimit increases", () => {
  insertHistorySession({
    modeId: "fast-decision-training",
    perQuestionSeconds: 15,
    horizonBars: 20,
    decisionSecondsLimit: 10,
  });
  insertHistorySession({
    modeId: "fast-decision-training",
    perQuestionSeconds: 15,
    horizonBars: 20,
    decisionSecondsLimit: 10,
  });
  insertHistorySession({
    modeId: "fast-decision-training",
    perQuestionSeconds: 15,
    horizonBars: 20,
    decisionSecondsLimit: 10,
  });
  insertHistorySession({
    modeId: "fast-decision-training",
    perQuestionSeconds: 30,
    horizonBars: 20,
    decisionSecondsLimit: 20,
  });
  insertHistorySession({
    modeId: "fast-decision-training",
    perQuestionSeconds: 45,
    horizonBars: 20,
    decisionSecondsLimit: 30,
  });

  const shortEstimate = estimateSpecialTrainingDuration({
    modeId: "fast-decision-training",
    operatorMode: "HUMAN",
    questionCount: 20,
    horizonBars: 20,
    decisionSecondsLimit: 10,
  });
  const longEstimate = estimateSpecialTrainingDuration({
    modeId: "fast-decision-training",
    operatorMode: "HUMAN",
    questionCount: 20,
    horizonBars: 20,
    decisionSecondsLimit: 60,
  });

  assert.equal(shortEstimate.basis, "EXACT_HISTORY");
  assert.equal(longEstimate.basis, "SIMILAR_HISTORY");
  assert.ok(longEstimate.minMinutes > shortEstimate.minMinutes);
  assert.ok(longEstimate.maxMinutes > shortEstimate.maxMinutes);
});

test("risk-discipline estimate increases when horizonBars increases", () => {
  insertHistorySession({
    modeId: "risk-discipline-training",
    perQuestionSeconds: 96,
    horizonBars: 60,
  });
  insertHistorySession({
    modeId: "risk-discipline-training",
    perQuestionSeconds: 96,
    horizonBars: 60,
  });
  insertHistorySession({
    modeId: "risk-discipline-training",
    perQuestionSeconds: 96,
    horizonBars: 60,
  });
  insertHistorySession({
    modeId: "risk-discipline-training",
    perQuestionSeconds: 192,
    horizonBars: 120,
  });
  insertHistorySession({
    modeId: "risk-discipline-training",
    perQuestionSeconds: 288,
    horizonBars: 180,
  });

  const shortEstimate = estimateSpecialTrainingDuration({
    modeId: "risk-discipline-training",
    operatorMode: "HUMAN",
    questionCount: 20,
    horizonBars: 60,
  });
  const longEstimate = estimateSpecialTrainingDuration({
    modeId: "risk-discipline-training",
    operatorMode: "HUMAN",
    questionCount: 20,
    horizonBars: 240,
  });

  assert.equal(shortEstimate.basis, "EXACT_HISTORY");
  assert.equal(longEstimate.basis, "SIMILAR_HISTORY");
  assert.ok(longEstimate.minMinutes > shortEstimate.minMinutes);
  assert.ok(longEstimate.maxMinutes > shortEstimate.maxMinutes);
});

test("outlier sessions are trimmed from exact-history estimates", () => {
  insertHistorySession({
    modeId: "fast-decision-training",
    perQuestionSeconds: 24,
    horizonBars: 20,
    decisionSecondsLimit: 20,
  });
  insertHistorySession({
    modeId: "fast-decision-training",
    perQuestionSeconds: 25,
    horizonBars: 20,
    decisionSecondsLimit: 20,
  });
  insertHistorySession({
    modeId: "fast-decision-training",
    perQuestionSeconds: 26,
    horizonBars: 20,
    decisionSecondsLimit: 20,
  });
  insertHistorySession({
    modeId: "fast-decision-training",
    perQuestionSeconds: 2000,
    horizonBars: 20,
    decisionSecondsLimit: 20,
  });

  const result = estimateSpecialTrainingDuration({
    modeId: "fast-decision-training",
    operatorMode: "HUMAN",
    questionCount: 20,
    horizonBars: 20,
    decisionSecondsLimit: 20,
  });

  assert.equal(result.basis, "EXACT_HISTORY");
  assert.equal(result.sampleCount, 3);
  assert.deepEqual(
    {
      minMinutes: result.minMinutes,
      maxMinutes: result.maxMinutes,
    },
    {
      minMinutes: 8,
      maxMinutes: 9,
    },
  );
});

test("empty history returns formula fallback", () => {
  const result = estimateSpecialTrainingDuration({
    modeId: "fast-decision-training",
    operatorMode: "HUMAN",
    questionCount: 20,
    horizonBars: 20,
    decisionSecondsLimit: 60,
  });

  assert.deepEqual(result, {
    minMinutes: 17,
    maxMinutes: 29,
    basis: "FORMULA_FALLBACK",
    sampleCount: 0,
  });
});
