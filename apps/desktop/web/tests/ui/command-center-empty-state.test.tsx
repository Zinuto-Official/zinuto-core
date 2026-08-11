// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readCssWithImports } from "./readCssWithImports";
import {
  followSystemStorageUntilFresh,
  getSystemStorageFollowupDelayMs,
  type ApiSystemStorageSummary,
} from "../../src/api";

const commandCenterCss = readCssWithImports(
  new URL("../../src/styles/pages/training-command-center.css", import.meta.url),
);
const commandCenterResponsiveCss = readCssWithImports(
  new URL(
    "../../src/styles/pages/training-command-center-modes-and-responsive.css",
    import.meta.url,
  ),
);
const commandCenterDataLoaderSource = readFileSync(
  new URL(
    "../../src/workspaces/command-center/trainingCommandCenterDataLoader.ts",
    import.meta.url,
  ),
  "utf8",
);
const commandCenterControllerSource = readFileSync(
  new URL(
    "../../src/workspaces/command-center/useTrainingCommandCenterPageController.ts",
    import.meta.url,
  ),
  "utf8",
);
const globalResetStorageSummarySource = readFileSync(
  new URL(
    "../../src/app-shell/useGlobalResetStorageSummary.ts",
    import.meta.url,
  ),
  "utf8",
);
const runtimeWorkspaceBundlesSource = [
  "runtimeWorkspaceBundles.ts",
  "useRuntimeGlobalResetConfirmation.ts",
]
  .map((fileName) =>
    readFileSync(
      new URL(`../../src/app-shell/runtime/${fileName}`, import.meta.url),
      "utf8",
    ),
  )
  .join("\n");
const systemSettingsWorkspacePageSource = readFileSync(
  new URL(
    "../../src/workspaces/settings/SystemSettingsWorkspacePage.tsx",
    import.meta.url,
  ),
  "utf8",
);
const workspacePageSwitcherSource = readFileSync(
  new URL("../../src/workspaces/WorkspacePageSwitcher.tsx", import.meta.url),
  "utf8",
);

test("command center consumes business facts from its workspace read model", () => {
  assert.match(
    commandCenterDataLoaderSource,
    /getWorkspaceReadModel\("command-center"\)/,
  );
  assert.doesNotMatch(
    commandCenterDataLoaderSource,
    /getTrainingStatsSummary|getSpecialTrainingStatsSummary|getLatestResumableSession|getSnapshot|listRecentReplayNotes/,
  );
  assert.doesNotMatch(
    workspacePageSwitcherSource,
    /summarizeAllDataConfigItems/,
  );
  assert.doesNotMatch(
    workspacePageSwitcherSource,
    /dataCenterSummary:\s*\{/,
  );
  assert.match(
    commandCenterDataLoaderSource,
    /facts\.dataCenterSummary/,
  );
  assert.match(
    commandCenterDataLoaderSource,
    /toCountWithFallback\(\s*dataCenterSummary\.poolCount,\s*data\.sourceCount,/,
  );
});

test("background runtime summary reads do not surface global page errors", () => {
  assert.match(
    commandCenterControllerSource,
    /loadCommandCenterReadModelSnapshot\(\)[\s\S]*\.catch\(\(\) => undefined\)/,
  );
  assert.match(
    globalResetStorageSummarySource,
    /followSystemStorageUntilFresh\([\s\S]*getSystemStorageSummary\(\{ signal \}\)[\s\S]*\.catch\(\(\) => \{[\s\S]*setStorageSummary\(null\)/,
  );
  assert.doesNotMatch(globalResetStorageSummarySource, /setError|reportAppError/);
});

test("global reset confirmation waits for authoritative storage summary", () => {
  assert.match(
    globalResetStorageSummarySource,
    /isGlobalResetStorageSummaryReady\s*=\s*[\s\S]*storageSummary !== null[\s\S]*measurementState\.status !== ['"]WARMING['"]/,
  );
  assert.match(
    globalResetStorageSummarySource,
    /!isGlobalResetStorageSummaryReady[\s\S]*\?\s*['"]--['"][\s\S]*formatStorageBytes\(storageSummary\.totalBytes\)/,
  );
  assert.match(globalResetStorageSummarySource, /AbortController/);
  assert.match(globalResetStorageSummarySource, /abortController\.abort\(\)/);
  assert.match(
    runtimeWorkspaceBundlesSource,
    /!isGlobalResetStorageSummaryReady[\s\S]*return;/,
  );
  assert.match(
    systemSettingsWorkspacePageSource,
    /isSettingsSystemActionBlocked[\s\S]*!isGlobalResetStorageSummaryReady[\s\S]*!resetAllDataAction\.enabled/,
  );
});

const storageSummary = (
  status: ApiSystemStorageSummary["measurementState"]["status"],
  options: { refreshPending?: boolean; nextRetryAt?: string | null } = {},
): ApiSystemStorageSummary => ({
  rows: [],
  totalBytes: status === "FRESH" ? 42 : 0,
  marketContentCounts: { instrumentCount: 0, barCount: 0 },
  measurementState: {
    status,
    lastGoodAt: status === "WARMING" ? null : "2026-07-16T00:00:00.000Z",
    refreshPending: options.refreshPending ?? status !== "FRESH",
    nextRetryAt: options.nextRetryAt ?? null,
  },
});

test("global reset storage summary follows WARMING state until FRESH", async () => {
  const responses = [storageSummary("WARMING"), storageSummary("FRESH")];
  const published: ApiSystemStorageSummary[] = [];
  const delays: number[] = [];

  await followSystemStorageUntilFresh({
    loadSummary: async () => {
      const next = responses.shift();
      assert.ok(next);
      return next;
    },
    publishSummary: (summary) => published.push(summary),
    signal: new AbortController().signal,
    wait: async (delayMs) => {
      delays.push(delayMs);
      return true;
    },
  });

  assert.deepEqual(
    published.map((summary) => summary.measurementState.status),
    ["WARMING", "FRESH"],
  );
  assert.deepEqual(delays, [400]);
});

test("global reset storage follow-up observes retry state and component cancellation", async () => {
  const retryAt = "2026-07-16T00:00:05.000Z";
  assert.equal(
    getSystemStorageFollowupDelayMs(
      storageSummary("WARMING", { refreshPending: false, nextRetryAt: retryAt }),
      Date.parse("2026-07-16T00:00:00.000Z"),
    ),
    5_000,
  );

  const abortController = new AbortController();
  let loadCount = 0;
  await followSystemStorageUntilFresh({
    loadSummary: async () => {
      loadCount += 1;
      return storageSummary("WARMING");
    },
    publishSummary: () => undefined,
    signal: abortController.signal,
    wait: async () => {
      abortController.abort();
      return false;
    },
  });
  assert.equal(loadCount, 1);
});

test("command center recent-note empty state uses text-flow layout without clipping", () => {
  assert.match(
    commandCenterCss,
    /\.training-command-center-page\s+\.training-command-center-data-card,\s*\.training-command-center-page\s+\.training-command-center-recent-card\s*\{[^}]*overflow:\s*hidden;/,
  );
  assert.match(
    commandCenterCss,
    /\.training-command-center-page\s+\.training-command-center-recent-card\s*\{[^}]*overflow:\s*visible;/,
  );
  assert.match(
    commandCenterCss,
    /\.training-command-center-page\s+\.training-command-center-recent-card\s*>\s*\.training-command-center-recent-list\s*\{[^}]*overflow:\s*visible;/,
  );
  assert.match(
    commandCenterCss,
    /\.training-command-center-page\s+\.training-command-center-empty\s*\{[^}]*width:\s*100%;[^}]*overflow:\s*visible;/,
  );
  assert.match(
    commandCenterCss,
    /\.training-command-center-page\s+\.training-command-center-empty\s+strong\s*\{[^}]*line-height:\s*1\.45;[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/,
  );
  assert.match(
    commandCenterCss,
    /\.training-command-center-page\s+\.training-command-center-empty\s+span\s*\{[^}]*line-height:\s*1\.55;[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/,
  );
});

test("command center overview keeps its grid layout across responsive breakpoints", () => {
  const responsiveStart = commandCenterResponsiveCss.indexOf(
    "@media (max-width: 1320px)",
  );
  assert.notEqual(responsiveStart, -1);
  const responsiveCss = commandCenterResponsiveCss.slice(responsiveStart);

  assert.match(responsiveCss, /\.training-command-center-ribbon-head\s*\{/);
});
