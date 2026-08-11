// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  getChallengeStatsReadModelDataViolation,
} from "./architecture-single-source-guards.mjs";

test("challenge stats read-model fields are only read through the snapshot owner", () => {
  assert.match(
    getChallengeStatsReadModelDataViolation({
      relPath:
        "apps/desktop/web/src/workspaces/challenge-stats/ChallengeFusionDashboard.tsx",
      sourceText: `const rows = readModelFacts?.sessionRows ?? [];`,
    }) ?? "",
    /challengeStatsDashboardSnapshot/u,
  );
  assert.equal(
    getChallengeStatsReadModelDataViolation({
      relPath:
        "apps/desktop/web/src/workspaces/challenge-stats/challengeStatsDashboardSnapshot.ts",
      sourceText: `const rows = readModelFacts.sessionRows;`,
    }),
    null,
  );
  assert.equal(
    getChallengeStatsReadModelDataViolation({
      relPath: "apps/desktop/web/src/workspaces/trainer/example.ts",
      sourceText: `const rows = readModelFacts?.sessionRows ?? [];`,
    }),
    null,
  );
});
