// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  readChallengeStatsMetricReadiness,
  readChallengeStatsReadModelFacts,
  resolveChallengeStatsMetricReadinessForDashboard,
} from "../../src/workspaces/challenge-stats/challengeStatsReadModelFacts";
import {
  resolveChallengeStatsDashboardSnapshot,
} from "../../src/workspaces/challenge-stats/challengeStatsDashboardSnapshot";

test("challenge stats read-model facts expose backend readiness and availability", () => {
  const facts = readChallengeStatsReadModelFacts({
    workspaceId: "challenge-stats",
    generatedAt: "2026-05-29T00:00:00.000Z",
    statusCode: "READY",
    reasonCode: null,
    tone: "ready",
    priority: 20,
    actions: [],
    sections: [],
    facts: {
      summary: {
        generatedAt: "2026-05-29T00:00:00.000Z",
        modeId: "fast-decision-training",
        defaultModeId: "fast-decision-training",
        filtersApplied: {},
        totals: { totalProjects: 4, filteredProjects: 4 },
        overview: { totalSessions: 4 },
        modeAvailability: {
          "fast-decision-training": {
            tag: "special_fast_decision",
            projectCount: 4,
          },
        },
        dashboardInsights: {},
        recentSessions: [],
      },
      sessionRows: [{ id: "challenge-1", kind: "fast" }],
      metricReadiness: {
        fast: {
          RECENT_10: {
            enabled: true,
            statusCode: "READY",
            reasonCode: null,
            sampleCount: 4,
            minimumSampleCount: 3,
            priority: 20,
          },
        },
        risk: {
          RECENT_10: {
            enabled: true,
            statusCode: "READY",
            reasonCode: null,
            sampleCount: 120,
            minimumSampleCount: 3,
            priority: 20,
          },
        },
      },
      emptyState: {
        isEmpty: false,
        statusCode: "READY",
        reasonCode: null,
        totalProjects: 4,
        filteredProjects: 4,
        modeProjectCount: 4,
      },
      exportAvailability: { enabled: true, reasonCode: null },
      clearHistoryAvailability: { enabled: true, reasonCode: null },
    },
  } as never);

  assert.equal(facts?.sessionRows[0]?.id, "challenge-1");
  assert.equal(facts?.exportAvailability.enabled, true);
  assert.equal(facts?.clearHistoryAvailability.enabled, true);
  const readiness = readChallengeStatsMetricReadiness(
    facts,
    "FAST_DECISION",
    "RECENT_10",
  );
  assert.equal(readiness?.enabled, true);
  assert.equal(readiness?.sampleCount, 4);
  assert.equal(readiness?.minimumSampleCount, 3);

  const reportReadiness = resolveChallengeStatsMetricReadinessForDashboard({
    facts,
    dashboardInsights: {
      risk: {
        RECENT_10: { sampleCount: 2 },
      },
    },
    family: "RISK_DISCIPLINE",
    preset: "RECENT_10",
  } as never);
  assert.equal(reportReadiness?.enabled, false);
  assert.equal(reportReadiness?.statusCode, "INSUFFICIENT_SAMPLE");
  assert.equal(reportReadiness?.sampleCount, 2);
  assert.equal(reportReadiness?.minimumSampleCount, 3);
});

test("challenge stats dashboard snapshot prefers report as a whole snapshot", () => {
  const snapshot = resolveChallengeStatsDashboardSnapshot({
    report: {
      dashboardRows: [{ id: "report-row", kind: "fast" }],
      recentSessions: [{ id: "report-recent" }],
      dashboardInsights: { fast: { ALL: { sampleCount: 8 } } },
      modeAvailability: {
        "fast-decision-training": {
          tag: "special_fast_decision",
          projectCount: 1,
        },
      },
    } as never,
    readModelFacts: {
      sessionRows: [{ id: "read-model-row", kind: "risk" }],
      summary: {
        recentSessions: [{ id: "read-model-recent" }],
        dashboardInsights: { risk: { ALL: { sampleCount: 99 } } },
      },
      clearHistoryAvailability: { enabled: false },
    } as never,
  });

  assert.equal(snapshot.source, "report");
  assert.equal(snapshot.dashboardRows[0]?.id, "report-row");
  assert.equal(snapshot.recentSessions[0]?.id, "report-recent");
  assert.equal(snapshot.dashboardInsights?.fast?.ALL?.sampleCount, 8);
  assert.equal(snapshot.clearHistoryEnabled, true);
});

test("challenge stats dashboard snapshot falls back to read model as a whole snapshot", () => {
  const snapshot = resolveChallengeStatsDashboardSnapshot({
    report: null,
    readModelFacts: {
      sessionRows: [{ id: "read-model-row", kind: "risk" }],
      summary: {
        recentSessions: [{ id: "read-model-recent" }],
        dashboardInsights: { risk: { ALL: { sampleCount: 9 } } },
      },
      clearHistoryAvailability: { enabled: true },
    } as never,
  });

  assert.equal(snapshot.source, "readModel");
  assert.equal(snapshot.dashboardRows[0]?.id, "read-model-row");
  assert.equal(snapshot.recentSessions[0]?.id, "read-model-recent");
  assert.equal(snapshot.dashboardInsights?.risk?.ALL?.sampleCount, 9);
  assert.equal(snapshot.clearHistoryEnabled, true);
});
