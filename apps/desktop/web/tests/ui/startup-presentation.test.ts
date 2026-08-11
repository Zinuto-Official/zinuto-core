// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";
import {
  STARTUP_EXIT_DURATION_MS,
  STARTUP_MINIMUM_VISIBLE_MS,
  STARTUP_STATUS_REVEAL_MS,
  resolveStartupExitSchedule,
  resolveStartupStageMessageId,
  calculateStartupCopyRevealDelayMs,
} from "../../src/app-shell/boot/startupPresentation";
import { resolveAppStartupTheme } from "../../src/app-shell/appPreferencesModel";

test("an explicit app theme wins over the operating system theme", () => {
  assert.equal(
    resolveAppStartupTheme({ themeMode: "light", systemTheme: "dark" }),
    "light",
  );
  assert.equal(
    resolveAppStartupTheme({ themeMode: "dark", systemTheme: "light" }),
    "dark",
  );
  assert.equal(
    resolveAppStartupTheme({ themeMode: "system", systemTheme: "dark" }),
    "dark",
  );
  assert.equal(
    resolveAppStartupTheme({ themeMode: "system", systemTheme: "light" }),
    "light",
  );
});

test("startup stages map to bounded user-facing status groups", () => {
  assert.equal(
    resolveStartupStageMessageId("spawn"),
    "appText.startupStartingLocalEngine",
  );
  assert.equal(
    resolveStartupStageMessageId("dataUpgrade:core-schema"),
    "appText.startupPreparingLocalData",
  );
  assert.equal(
    resolveStartupStageMessageId("dataUpgrade:market-probing"),
    "appText.startupCheckingMarketData",
  );
  assert.equal(
    resolveStartupStageMessageId("dataUpgrade:market-validating"),
    "appText.startupCheckingMarketData",
  );
  assert.equal(
    resolveStartupStageMessageId("dataUpgrade:market-copying"),
    "appText.startupUpdatingMarketData",
  );
  assert.equal(
    resolveStartupStageMessageId("dataUpgrade:market-switching"),
    "appText.startupUpdatingMarketData",
  );
  assert.equal(
    resolveStartupStageMessageId("dataUpgrade:reset-recovery"),
    "appText.startupRecoveringLocalData",
  );
  assert.equal(
    resolveStartupStageMessageId("dataUpgrade:seed-reconcile"),
    "appText.startupSyncingBuiltInData",
  );
  assert.equal(
    resolveStartupStageMessageId("dataUpgrade:runtime-bootstrap"),
    "appText.startupPreparingWorkspace",
  );
  assert.equal(
    resolveStartupStageMessageId("future-stage"),
    "appText.startupStarting",
  );
});

test("startup copy remains hidden until 1.2 seconds after the surface is visible", () => {
  assert.equal(STARTUP_STATUS_REVEAL_MS, 1_200);
  assert.equal(
    calculateStartupCopyRevealDelayMs({ nowMs: 1_450, visibleAtMs: 1_000 }),
    750,
  );
  assert.equal(
    calculateStartupCopyRevealDelayMs({ nowMs: 2_500, visibleAtMs: 1_000 }),
    0,
  );
});

test("startup exit includes its fade inside the 800 millisecond minimum", () => {
  assert.equal(STARTUP_MINIMUM_VISIBLE_MS, 800);
  assert.equal(STARTUP_EXIT_DURATION_MS, 180);
  assert.deepEqual(
    resolveStartupExitSchedule({
      readyAtMs: 100,
      visibleAtMs: 0,
    }),
    { exitAtMs: 620, hiddenAtMs: 800 },
  );
  assert.deepEqual(
    resolveStartupExitSchedule({
      readyAtMs: 1_400,
      visibleAtMs: 0,
    }),
    { exitAtMs: 1_400, hiddenAtMs: 1_580 },
  );
  assert.deepEqual(
    resolveStartupExitSchedule({
      exitDurationMs: 0,
      readyAtMs: 100,
      visibleAtMs: 0,
    }),
    { exitAtMs: 800, hiddenAtMs: 800 },
  );
});
