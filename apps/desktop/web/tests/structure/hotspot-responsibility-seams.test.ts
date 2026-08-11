// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string): string => readFileSync(`${webRoot}${path}`, "utf8");
const lines = (source: string): number => source.trimEnd().split(/\r?\n/u).length;

const assertOwnerBudget = (path: string): string => {
  const source = read(path);
  assert.ok(lines(source) <= 1000, `${path} has ${lines(source)} lines`);
  return source;
};

test("HS-CORE-029 separates overview loading and pointer interaction ownership", () => {
  const facade = assertOwnerBudget("src/domains/trainer/AnchorNavigatorControl.tsx");
  const runtime = assertOwnerBudget(
    "src/domains/trainer/AnchorNavigatorControlRuntime.tsx",
  );
  const overview = assertOwnerBudget(
    "src/domains/trainer/useAnchorNavigatorOverviewRuntime.ts",
  );
  const interactions = assertOwnerBudget(
    "src/domains/trainer/useAnchorNavigatorInteractions.ts",
  );

  assert.match(facade, /AnchorNavigatorControlRuntime/u);
  assert.match(runtime, /useAnchorNavigatorOverviewRuntime/u);
  assert.match(runtime, /useAnchorNavigatorInteractions/u);
  assert.match(overview, /export const useAnchorNavigatorOverviewRuntime\b/u);
  assert.match(interactions, /export const useAnchorNavigatorInteractions\b/u);
  assert.doesNotMatch(overview, /AnchorNavigatorControlRuntime/u);
  assert.doesNotMatch(interactions, /AnchorNavigatorControlRuntime/u);
});

test("HS-CORE-060 separates chart, dialog-summary, contract, and runtime ownership", () => {
  const facade = assertOwnerBudget(
    "src/workspaces/challenge-stats/ChallengeFusionDashboard.tsx",
  );
  const runtime = assertOwnerBudget(
    "src/workspaces/challenge-stats/ChallengeFusionDashboardRuntime.tsx",
  );
  const chart = assertOwnerBudget(
    "src/workspaces/challenge-stats/useChallengeFusionChartOptions.ts",
  );
  const dialog = assertOwnerBudget(
    "src/workspaces/challenge-stats/useChallengeFusionDialogSummaryChips.ts",
  );
  const contracts = assertOwnerBudget(
    "src/workspaces/challenge-stats/ChallengeFusionDashboardContracts.tsx",
  );

  assert.match(facade, /ChallengeFusionDashboardRuntime/u);
  assert.match(runtime, /useChallengeFusionChartOptions/u);
  assert.match(runtime, /useChallengeFusionDialogSummaryChips/u);
  assert.match(runtime, /ChallengeFusionDashboardContracts/u);
  assert.match(chart, /export const useChallengeFusionChartOptions\b/u);
  assert.match(dialog, /export const useChallengeFusionDialogSummaryChips\b/u);
  assert.doesNotMatch(chart, /ChallengeFusionDashboardRuntime/u);
  assert.doesNotMatch(dialog, /ChallengeFusionDashboardRuntime/u);
  assert.doesNotMatch(contracts, /ChallengeFusionDashboardRuntime/u);
});

test("HS-CORE-066 separates scalar model, replay window, and console presentation", () => {
  const facade = assertOwnerBudget(
    "src/workspaces/history/history-console/ReplayReviewConsoleHelpers.tsx",
  );
  const model = assertOwnerBudget(
    "src/workspaces/history/history-console/ReplayReviewConsoleModel.ts",
  );
  const presentation = assertOwnerBudget(
    "src/workspaces/history/history-console/ReplayReviewConsolePresentation.tsx",
  );
  const replay = assertOwnerBudget(
    "src/workspaces/history/history-console/ReplayReviewReplayPresentation.tsx",
  );

  assert.match(facade, /ReplayReviewConsoleModel/u);
  assert.match(facade, /ReplayReviewConsolePresentation/u);
  assert.match(presentation, /ReplayReviewReplayPresentation/u);
  assert.match(model, /export const resolveReplayReviewTimeWindowRangeMs\b/u);
  assert.match(replay, /export const ReplayDialogContent\b/u);
  assert.doesNotMatch(model, /ReplayReviewConsolePresentation/u);
  assert.doesNotMatch(replay, /ReplayReviewConsolePresentation/u);
});
