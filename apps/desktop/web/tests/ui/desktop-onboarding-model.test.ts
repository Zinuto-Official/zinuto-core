// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  DESKTOP_ONBOARDING_ROW_COUNT,
  DESKTOP_ONBOARDING_ROW_LABELS,
  DESKTOP_ONBOARDING_STEPS,
  DESKTOP_ONBOARDING_TARGETS,
  DESKTOP_ONBOARDING_TARGET_ATTRIBUTE,
  DESKTOP_ONBOARDING_TARGET_DEFINITIONS,
  DESKTOP_ONBOARDING_TOTAL_STEPS,
  getDesktopOnboardingMainPage,
  getDesktopOnboardingStepTargets,
  normalizeDesktopOnboardingPersistedTourStatus,
  normalizeDesktopOnboardingTourStep,
  resolveDesktopOnboardingLocalImportAction,
  resolveDesktopOnboardingPersistedTourStatus,
} from "../../src/domains/onboarding/desktopOnboardingModel";
import { WORKSPACE_MOTION_ORDER } from "../../src/frontend-kernel/workspacePageModel";

test("desktop onboarding defines a compact four-step tour", () => {
  assert.deepEqual([...DESKTOP_ONBOARDING_STEPS], [
    "MODE_OVERVIEW",
    "PREP_PAGES_DETAIL",
    "TOOLS_AND_DISPLAY",
    "LOCAL_DATA_DETAIL",
  ]);
  assert.equal(DESKTOP_ONBOARDING_TOTAL_STEPS, 4);
  assert.equal(DESKTOP_ONBOARDING_ROW_COUNT, 3);
  assert.deepEqual([...DESKTOP_ONBOARDING_ROW_LABELS], ["A", "B", "C"]);
  assert.equal(normalizeDesktopOnboardingTourStep("DATA_IMPORT"), "MODE_OVERVIEW");
  assert.equal(getDesktopOnboardingMainPage("MODE_OVERVIEW"), "COMMAND_CENTER");
  assert.equal(getDesktopOnboardingMainPage("PREP_PAGES_DETAIL"), "TRAINER");
  assert.equal(getDesktopOnboardingMainPage("TOOLS_AND_DISPLAY"), "CUSTOM_INDICATOR");
  assert.equal(getDesktopOnboardingMainPage("LOCAL_DATA_DETAIL"), "DATA");
});

test("desktop onboarding persistence resolves active and terminal states", () => {
  assert.equal(normalizeDesktopOnboardingPersistedTourStatus(undefined), "ACTIVE");
  assert.equal(
    normalizeDesktopOnboardingPersistedTourStatus(undefined, "DEFERRED"),
    "DEFERRED",
  );
  assert.equal(normalizeDesktopOnboardingPersistedTourStatus("ACTIVE"), "ACTIVE");
  assert.equal(
    normalizeDesktopOnboardingPersistedTourStatus("COMPLETED"),
    "COMPLETED",
  );
  assert.equal(normalizeDesktopOnboardingPersistedTourStatus("SKIPPED"), "SKIPPED");
  assert.equal(normalizeDesktopOnboardingPersistedTourStatus("DEFERRED"), "ACTIVE");
  assert.equal(resolveDesktopOnboardingPersistedTourStatus("ACTIVE"), "DEFERRED");
  assert.equal(
    resolveDesktopOnboardingPersistedTourStatus("COMPLETED"),
    "COMPLETED",
  );
  assert.equal(resolveDesktopOnboardingPersistedTourStatus("SKIPPED"), "SKIPPED");
  assert.equal(resolveDesktopOnboardingPersistedTourStatus("DEFERRED"), "DEFERRED");
});

test("desktop onboarding target map covers every row and valid workspace", () => {
  assert.equal(
    DESKTOP_ONBOARDING_TARGETS.length,
    DESKTOP_ONBOARDING_STEPS.length * DESKTOP_ONBOARDING_ROW_COUNT,
  );
  assert.equal(
    new Set(DESKTOP_ONBOARDING_TARGETS).size,
    DESKTOP_ONBOARDING_TARGETS.length,
  );
  assert.equal(DESKTOP_ONBOARDING_TARGET_ATTRIBUTE, "data-onboarding-target");

  const validPages = new Set(WORKSPACE_MOTION_ORDER);
  for (const step of DESKTOP_ONBOARDING_STEPS) {
    const targets = getDesktopOnboardingStepTargets(step);
    assert.equal(targets.length, DESKTOP_ONBOARDING_ROW_COUNT);
    assert.deepEqual(
      targets.map(
        (targetId) => DESKTOP_ONBOARDING_TARGET_DEFINITIONS[targetId].rowIndex,
      ),
      [0, 1, 2],
    );
  }

  for (const targetId of DESKTOP_ONBOARDING_TARGETS) {
    const definition = DESKTOP_ONBOARDING_TARGET_DEFINITIONS[targetId];
    assert.equal(definition.id, targetId);
    assert.equal(DESKTOP_ONBOARDING_STEPS.includes(definition.step), true);
    assert.equal(validPages.has(definition.page), true);
  }
});

test("desktop onboarding local import action is always available", () => {
  assert.equal(resolveDesktopOnboardingLocalImportAction(), "IMPORT");
});
