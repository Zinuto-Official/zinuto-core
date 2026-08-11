// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveSpecialTrainingLaunchRequest } from "../../src/workspaces/command-center/specialTrainingLaunchRequest";

test("command center challenge requests only open the selected mode", () => {
  const first = resolveSpecialTrainingLaunchRequest({
    requestedModeId: "fast-decision-training",
    previousRequestId: null,
  });

  assert.deepEqual(first, {
    requestId: 1,
    modeId: "fast-decision-training",
  });

  const second = resolveSpecialTrainingLaunchRequest({
    requestedModeId: "fast-decision-training",
    previousRequestId: first.requestId,
  });

  assert.deepEqual(second, {
    requestId: 2,
    modeId: "fast-decision-training",
  });
});

test("command center challenge request ids remain monotonic", () => {
  const request = resolveSpecialTrainingLaunchRequest({
    requestedModeId: "risk-discipline-training",
    previousRequestId: 9,
  });

  assert.deepEqual(request, {
    requestId: 10,
    modeId: "risk-discipline-training",
  });
});

test("visited special-training modes retain independent keyed runtimes", () => {
  const pageSource = readFileSync(
    new URL(
      "../../src/workspaces/special-training/SpecialTrainingPage.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(pageSource, /visitedModeIds/);
  assert.match(pageSource, /key=\{modeId\}/);
  assert.match(pageSource, /controlledModeId=\{modeId\}/);
  assert.match(pageSource, /isPageActive=\{isRuntimeActive\}/);
  assert.match(pageSource, /hidden=\{!isSelectedMode\}/);
  assert.match(pageSource, /inert=\{isSelectedMode \? undefined : true\}/);
  assert.match(pageSource, /resumableSessionByMode\[activeModeId\]/);
  assert.match(pageSource, /launchRequest=\{null\}/);
  assert.doesNotMatch(pageSource, /discardChallengeId/);
  assert.doesNotMatch(pageSource, /beginTraining\(\)/);
});

test("global data reset clears every retained special-training runtime", () => {
  const pageStateSource = readFileSync(
    new URL(
      "../../src/workspaces/special-training/useSpecialTrainingPageState.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(pageStateSource, /globalResetRevisionRef/);
  assert.match(
    pageStateSource,
    /globalResetRevisionRef\.current = globalResetRevision;\s*exitTraining\(\);/,
  );
});
