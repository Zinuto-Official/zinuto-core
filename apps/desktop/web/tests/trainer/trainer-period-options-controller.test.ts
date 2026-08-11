// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TRAINER_DISPLAY_PERIOD_BY_BASE,
  DEFAULT_TRAINER_PERIOD_OPTIONS_BY_BASE,
} from "../../src/domains/chart/chartPeriods";
import { resolveTrainerDisplayPeriodClampTarget } from "../../src/domains/trainer/useTrainerPeriodOptionsController";

test("trainer period clamp stays silent when disabled for special training", () => {
  const clampTarget = resolveTrainerDisplayPeriodClampTarget({
    shouldClampDisplayPeriod: false,
    trainerBaseTimeframe: "1d",
    trainerDisplayPeriod: "1h",
    trainerPeriodOptions: DEFAULT_TRAINER_PERIOD_OPTIONS_BY_BASE["1d"],
    defaultTrainerDisplayPeriodByBase: DEFAULT_TRAINER_DISPLAY_PERIOD_BY_BASE,
  });

  assert.equal(clampTarget, null);
});

test("trainer period clamp returns the base default when enabled period is invalid", () => {
  const clampTarget = resolveTrainerDisplayPeriodClampTarget({
    shouldClampDisplayPeriod: true,
    trainerBaseTimeframe: "1d",
    trainerDisplayPeriod: "1h",
    trainerPeriodOptions: DEFAULT_TRAINER_PERIOD_OPTIONS_BY_BASE["1d"],
    defaultTrainerDisplayPeriodByBase: DEFAULT_TRAINER_DISPLAY_PERIOD_BY_BASE,
  });

  assert.equal(clampTarget, "1d");
});

test("trainer period clamp stays silent when enabled period is valid", () => {
  const clampTarget = resolveTrainerDisplayPeriodClampTarget({
    shouldClampDisplayPeriod: true,
    trainerBaseTimeframe: "1d",
    trainerDisplayPeriod: "1w",
    trainerPeriodOptions: DEFAULT_TRAINER_PERIOD_OPTIONS_BY_BASE["1d"],
    defaultTrainerDisplayPeriodByBase: DEFAULT_TRAINER_DISPLAY_PERIOD_BY_BASE,
  });

  assert.equal(clampTarget, null);
});
