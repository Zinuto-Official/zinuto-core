// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import type { SavedIndicatorProfile } from "../../src/domains/custom-indicator/indicator/profileStore";
import type { CustomIndicatorSystemDefaultTemplate } from "../../src/workspaces/custom-indicator/customIndicatorWorkspaceReadModelUi";
import { buildStrategyBacktestIndicatorSources } from "../../src/workspaces/strategy-backtest/strategyIndicatorSources";

const createProfile = (
  overrides: Partial<SavedIndicatorProfile>,
): SavedIndicatorProfile => ({
  id: "profile_saved",
  name: "Saved edge",
  source: "EDGE: CLOSE - OPEN;",
  parameterInputs: {},
  revisions: [],
  createdAt: "2026-06-08T00:00:00.000Z",
  updatedAt: "2026-06-08T00:00:00.000Z",
  ...overrides,
});

const createSystemTemplate = (
  overrides: Partial<CustomIndicatorSystemDefaultTemplate> = {},
): CustomIndicatorSystemDefaultTemplate => ({
  id: "MACD",
  definition: {
    name: "MACD",
    source: "DIF: EMA(CLOSE, SHORT) - EMA(CLOSE, LONG);",
    parameters: [
      { name: "SHORT", defaultValue: 12, min: 1, max: 240 },
      { name: "LONG", defaultValue: 26, min: 1, max: 480 },
    ],
    outputs: [],
  },
  ...overrides,
});

test("strategy backtest indicator sources include every local profile and system templates", () => {
  const sources = buildStrategyBacktestIndicatorSources({
    savedProfiles: [
      createProfile({ id: "profile_saved", name: "Saved edge" }),
      createProfile({
        id: "profile_second",
        name: "Second local edge",
      }),
      createProfile({
        id: "sys_override:MACD",
        name: "MACD",
        parameterInputs: { short: "7" },
      }),
    ],
    systemTemplates: [createSystemTemplate()],
  });

  assert.deepEqual(
    sources.map((source) => source.id),
    ["profile_saved", "profile_second", "system:MACD"],
  );
  assert.equal(sources[0]?.name, "Saved edge");
  assert.equal(sources[1]?.name, "Second local edge");
  assert.equal(sources[2]?.name, "MACD");
  assert.deepEqual(sources[2]?.parameterInputs, {
    SHORT: "7",
    LONG: "26",
  });
  assert.deepEqual(
    sources[2]?.parameters?.map((parameter) => parameter.name),
    ["SHORT", "LONG"],
  );
});
