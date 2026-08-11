// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type {
  SpecialTrainingModeId,
  SpecialTrainingQuestionState,
  SpecialTrainingSettlementResult,
  SpecialTrainingTradeAction,
} from "../../src/domain/specialTraining/contracts.js";

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-special-training-stats-projection-"),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const [
  { db },
  { persistSpecialTrainingHistorySession },
  { upsertSpecialTrainingStatsProjectionRowsForQuestions },
  { getSpecialTrainingStatsReport, getSpecialTrainingStatsSummary },
] = await Promise.all([
  import("../../src/infrastructure/db/database.js"),
  import("../../src/infrastructure/db/specialTraining/historyStore.js"),
  import("../../src/infrastructure/db/specialTraining/statsProjectionStore.js"),
  import("../../src/application/specialTrainingStatsService.js"),
]);

test.after(async () => {
  db.close();
  delete process.env.ZINUTO_DATA_DIR;
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

test.beforeEach(() => {
  db.prepare("DROP TRIGGER IF EXISTS test_delete_stats_projection_after_insert").run();
  db.prepare("DELETE FROM special_training_stats_projection").run();
  db.prepare("DELETE FROM special_training_history_questions").run();
  db.prepare("DELETE FROM special_training_history_sessions").run();
});

test.afterEach(() => {
  db.prepare("DROP TRIGGER IF EXISTS test_delete_stats_projection_after_insert").run();
});

const countRows = (
  tableName: string,
  whereSql = "1 = 1",
  ...params: unknown[]
): number => {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM ${tableName} WHERE ${whereSql}`)
    .get(...params) as { count?: unknown } | undefined;
  return Math.max(0, Math.floor(Number(row?.count) || 0));
};

const buildBars = () =>
  Array.from({ length: 6 }, (_, index) => ({
    ts: `2026-01-0${index + 1}T00:00:00.000Z`,
    open: 100 + index,
    high: 103 + index,
    low: 99 + index,
    close: 101 + index,
    volume: 1000 + index,
  }));

const buildQuestion = (
  modeId: SpecialTrainingModeId,
  index: number,
): SpecialTrainingQuestionState => {
  const bars = buildBars();
  return {
    id: `${modeId}-question-${index}`,
    instrumentId: `${modeId}-instrument`,
    samplePoolId: `${modeId}-bank`,
    barsVersionToken: "bars-v1",
    symbol: modeId === "fast-decision-training" ? "AAPL" : "MSFT",
    timeframe: "1d",
    targetTimeframe: "1d",
    effectiveTimeframe: "1d",
    minimumBaseTimeframe: "1d",
    sourceTimeframe: "1d",
    sourceBarsPerEffectiveBar: 1,
    slotIndex: index,
    scopeHash: `${modeId}-scope`,
    ledgerId: `${modeId}-ledger-${index}`,
    bars,
    startIndex: 1,
    endIndex: bars.length - 1,
    effectiveWindowBarCount: bars.length,
    sourceWindowBarCount: bars.length,
    minTradeStep: 1,
  };
};

const buildTradeActions = (modeId: SpecialTrainingModeId): SpecialTrainingTradeAction[] =>
  modeId === "risk-discipline-training"
    ? [
        {
          type: "BUY",
          barIndex: 2,
          inputMode: "RATIO",
          priceMode: "CUR_CLOSE",
          ratioInput: "50",
          quantity: 10,
          executionPrice: 102,
          cashEffect: 1020,
        },
      ]
    : [];

const buildSettlementResult = (
  modeId: SpecialTrainingModeId,
  index: number,
): SpecialTrainingSettlementResult => {
  const totalPnl = modeId === "fast-decision-training" ? 120 + index : 80 + index;
  return {
    score: 80 + index,
    passed: true,
    totalPnl,
    finalTotalAsset: 10000 + totalPnl,
    feedbackCodes: [],
    usedOperations: modeId === "risk-discipline-training" ? 1 : 0,
    maxOperations: modeId === "risk-discipline-training" ? 3 : 1,
    directionResult:
      modeId === "fast-decision-training"
        ? {
            selection: "LONG",
            actual: "LONG",
            correct: true,
            timedOut: false,
            decisionSecondsUsed: 12 + index,
            revealEndIndex: 5,
            strictnessLevel: "STANDARD",
            dominanceRatio: 1.5,
            selectedMfeRatio: 0.08,
            selectedMaeRatio: 0.01,
            selectedMfeMaeRatio: 8,
            opportunityDirection: "LONG",
            opportunityMfeRatio: 0.08,
            opportunityMaeRatio: 0.01,
            opportunityMfeMaeRatio: 8,
            longMfeRatio: 0.08,
            longMaeRatio: 0.01,
          }
        : null,
    recoveryRate: modeId === "risk-discipline-training" ? 0.45 : null,
    alpha: modeId === "risk-discipline-training" ? 0.02 : null,
    captureRate: modeId === "risk-discipline-training" ? 0.3 : null,
    maxDrawdownRatio: 0.02,
    grade: modeId === "fast-decision-training" ? "S" : "A",
    riskReview:
      modeId === "risk-discipline-training"
        ? {
            alphaVsHold: 0.02,
            alphaVsHardStop: 0.03,
            equityCurves: {
              user: [
                { barIndex: 1, asset: 10000 },
                { barIndex: 2, asset: 10080 + index },
              ],
              hold: [],
              hardStop: [],
            },
            costBasisShift: {
              initialCostBasis: 100,
              finalCostBasis: 102,
              referencePrice: 101,
              shiftValue: 2,
              shiftRatio: 0.02,
            },
          }
        : null,
    fastReview: null,
  };
};

const persistCompletedSession = (
  modeId: SpecialTrainingModeId,
  challengeId = `${modeId}-challenge`,
  questionCount = 2,
): string => {
  const questionIds = Array.from(
    { length: questionCount },
    (_, index) => `${challengeId}-question-${index}`,
  );
  const questionsById = new Map<string, SpecialTrainingQuestionState>();
  const settledEntriesByQuestionId = new Map<
    string,
    Parameters<typeof persistSpecialTrainingHistorySession>[0]["settledEntriesByQuestionId"] extends Map<string, infer Entry>
      ? Entry
      : never
  >();
  questionIds.forEach((questionId, index) => {
    const question = {
      ...buildQuestion(modeId, index),
      id: questionId,
    };
    questionsById.set(questionId, question);
    settledEntriesByQuestionId.set(questionId, {
      result: buildSettlementResult(modeId, index),
      payload: {
        decisionSecondsUsed: modeId === "fast-decision-training" ? 12 + index : 0,
        fastDecision:
          modeId === "fast-decision-training"
            ? {
                selection: "LONG",
                decisionSecondsUsed: 12 + index,
                timedOut: false,
              }
            : undefined,
        tradeActions: buildTradeActions(modeId),
      },
      abandoned: false,
      settledAt: `2026-01-06T00:00:0${index}.000Z`,
    });
  });
  return persistSpecialTrainingHistorySession({
    challengeId,
    bankId: `${modeId}-bank`,
    bankName: `${modeId} bank`,
    modeId,
    simulationBatchId: null,
    questionCount: questionIds.length,
    horizonBars: modeId === "fast-decision-training" ? 20 : 60,
    maxOperations: modeId === "fast-decision-training" ? 1 : 3,
    maxEntries: modeId === "fast-decision-training" ? 1 : 3,
    decisionSecondsLimit: 20,
    fastDecisionStrictnessLevel: "STANDARD",
    fastDecisionDominanceRatio: 1.5,
    createdAtMs: Date.parse("2026-01-06T00:00:00.000Z"),
    timeframe: "1d",
    sourceTag: "",
    enabledInstrumentIds: [`${modeId}-instrument`],
    questionIds,
    questionsById,
    settledEntriesByQuestionId,
  });
};

test("completed fast and risk sessions write stats projection rows and reports", async () => {
  const expectations = [
    {
      modeId: "fast-decision-training" as const,
      dashboardKind: "fast",
    },
    {
      modeId: "risk-discipline-training" as const,
      dashboardKind: "risk",
    },
  ];

  for (const { modeId, dashboardKind } of expectations) {
    const sessionId = persistCompletedSession(modeId);
    assert.equal(
      countRows("special_training_history_questions", "session_id = ?", sessionId),
      2,
    );
    assert.equal(
      countRows("special_training_stats_projection", "session_id = ?", sessionId),
      2,
    );

    const payload = await getSpecialTrainingStatsReport({
      modeId,
      profitability: "ALL",
      limit: 200,
    });
    assert.ok(payload.report.totals.filteredProjects > 0);
    assert.ok(payload.report.recentSessions.length > 0);
    assert.ok(
      payload.report.dashboardRows.some((row) => row.kind === dashboardKind),
    );
    assert.equal(payload.report.modeAvailability[modeId].projectCount, 2);
  }
});

test("stats report lazily repairs missing projection rows from retained history detail", async () => {
  const expectations = [
    {
      modeId: "fast-decision-training" as const,
      dashboardKind: "fast",
    },
    {
      modeId: "risk-discipline-training" as const,
      dashboardKind: "risk",
    },
  ];

  for (const { modeId, dashboardKind } of expectations) {
    const sessionId = persistCompletedSession(
      modeId,
      `${modeId}-lazy-repair`,
    );
    db.prepare("DELETE FROM special_training_stats_projection WHERE session_id = ?").run(
      sessionId,
    );
    assert.equal(
      countRows("special_training_history_questions", "session_id = ?", sessionId),
      2,
    );
    assert.equal(
      countRows("special_training_stats_projection", "session_id = ?", sessionId),
      0,
    );

    const payload = await getSpecialTrainingStatsReport({
      modeId,
      profitability: "ALL",
      limit: 200,
    });

    assert.equal(
      countRows("special_training_stats_projection", "session_id = ?", sessionId),
      2,
    );
    assert.ok(payload.report.recentSessions.length > 0);
    assert.ok(
      payload.report.dashboardRows.some((row) => row.kind === dashboardKind),
    );
    if (dashboardKind === "risk") {
      assert.ok(
        payload.report.dashboardRows.some(
          (row) => row.kind === "risk" && row.curvePoints.length > 0,
        ),
      );
      assert.ok(
        payload.report.dashboardInsights.risk.RECENT_10.behaviorStats.ADD_POSITION
          .count > 0,
      );
    }
  }
});

test("stats report repairs all mode projections before resolving mode availability", async () => {
  const fastSessionId = persistCompletedSession(
    "fast-decision-training",
    "fast-all-mode-repair",
  );
  const riskSessionId = persistCompletedSession(
    "risk-discipline-training",
    "risk-all-mode-repair",
  );
  db.prepare("DELETE FROM special_training_stats_projection WHERE session_id IN (?, ?)").run(
    fastSessionId,
    riskSessionId,
  );

  const payload = await getSpecialTrainingStatsReport({
    modeId: "fast-decision-training",
    profitability: "ALL",
    limit: 200,
  });

  assert.equal(
    countRows("special_training_stats_projection", "session_id = ?", fastSessionId),
    2,
  );
  assert.equal(
    countRows("special_training_stats_projection", "session_id = ?", riskSessionId),
    2,
  );
  assert.equal(
    payload.report.modeAvailability["fast-decision-training"].projectCount,
    2,
  );
  assert.equal(
    payload.report.modeAvailability["risk-discipline-training"].projectCount,
    2,
  );
  assert.equal(payload.report.totals.totalProjects, 2);
  assert.equal(payload.report.dashboardRows.length, 2);
});

test("history without retained projection detail does not count as challenge stats data", async () => {
  const sessionId = persistCompletedSession(
    "fast-decision-training",
    "fast-orphan-history",
  );
  db.prepare("DELETE FROM special_training_stats_projection WHERE session_id = ?").run(
    sessionId,
  );
  db.prepare(
    `UPDATE special_training_history_questions
        SET detail_expired_at = ?
      WHERE session_id = ?`,
  ).run("2026-02-01T00:00:00.000Z", sessionId);

  const payload = await getSpecialTrainingStatsReport({
    modeId: "fast-decision-training",
    profitability: "ALL",
    limit: 200,
  });

  assert.equal(
    countRows("special_training_history_sessions", "id = ?", sessionId),
    1,
  );
  assert.equal(
    countRows("special_training_stats_projection", "session_id = ?", sessionId),
    0,
  );
  assert.equal(
    payload.report.modeAvailability["fast-decision-training"].projectCount,
    0,
  );
  assert.equal(payload.report.totals.totalProjects, 0);
  assert.equal(payload.report.dashboardRows.length, 0);
});

test("stats summary lazily repairs missing projection rows before loading read-model samples", () => {
  const sessionId = persistCompletedSession(
    "risk-discipline-training",
    "risk-summary-lazy-repair",
  );
  db.prepare("DELETE FROM special_training_stats_projection WHERE session_id = ?").run(
    sessionId,
  );

  const summary = getSpecialTrainingStatsSummary({
    modeId: "risk-discipline-training",
    profitability: "ALL",
    limit: 50,
  });

  assert.equal(
    countRows("special_training_stats_projection", "session_id = ?", sessionId),
    2,
  );
  assert.ok(summary.recentSessions.length > 0);
  assert.ok(summary.dashboardInsights.risk.RECENT_10.sampleCount > 0);
});

test("stats projection upsert chunks retained question ids past sqlite variable limits", () => {
  const questionCount = 1001;
  const challengeId = "fast-decision-large-retention";
  const sessionId = persistCompletedSession(
    "fast-decision-training",
    challengeId,
    questionCount,
  );
  const questionIds = (
    db
      .prepare(
        `SELECT id
           FROM special_training_history_questions
          WHERE session_id = ?
          ORDER BY question_order ASC`,
      )
      .all(sessionId) as Array<{ id: string }>
  ).map((row) => row.id);
  db.prepare("DELETE FROM special_training_stats_projection WHERE session_id = ?").run(
    sessionId,
  );

  const changed = upsertSpecialTrainingStatsProjectionRowsForQuestions(
    questionIds,
    "2026-02-01T00:00:00.000Z",
  );

  assert.equal(changed, questionCount);
  assert.equal(
    countRows("special_training_stats_projection", "session_id = ?", sessionId),
    questionCount,
  );
});

test("history persistence rolls back when projection completeness is broken", () => {
  db.prepare(
    `CREATE TRIGGER test_delete_stats_projection_after_insert
       AFTER INSERT ON special_training_stats_projection
       BEGIN
         DELETE FROM special_training_stats_projection
          WHERE project_id = NEW.project_id;
       END`,
  ).run();

  assert.throws(
    () =>
      persistCompletedSession(
        "fast-decision-training",
        "fast-decision-projection-failure",
      ),
    {
      message: "SPECIAL_TRAINING_HISTORY_PERSIST_FAILED",
    },
  );
  assert.equal(
    countRows(
      "special_training_history_sessions",
      "challenge_id = ?",
      "fast-decision-projection-failure",
    ),
    0,
  );
  assert.equal(countRows("special_training_history_questions"), 0);
  assert.equal(countRows("special_training_stats_projection"), 0);
});
