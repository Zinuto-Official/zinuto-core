// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_SIGNAL_BOTTOM_INDICATOR,
  DEFAULT_SIGNAL_TOP_INDICATOR,
  INDICATOR_NONE_VALUE,
  resolveSubIndicatorToggleState,
} from "../../src/domains/indicators/core";

const webRoot = path.resolve(import.meta.dirname, "../..");

const readSource = (relativePath: string): string =>
  fs.readFileSync(path.join(webRoot, relativePath), "utf8");

test("sub indicator toggle hides visible indicators without changing selections", () => {
  assert.deepEqual(
    resolveSubIndicatorToggleState({
      showSubIndicators: true,
      signalTopIndicator: DEFAULT_SIGNAL_TOP_INDICATOR,
      signalTopIndicatorParams: [9, 3, 3],
      signalBottomIndicator: DEFAULT_SIGNAL_BOTTOM_INDICATOR,
      signalBottomIndicatorParams: [12, 26, 9],
    }),
    {
      showSubIndicators: false,
      signalTopIndicator: DEFAULT_SIGNAL_TOP_INDICATOR,
      signalTopIndicatorParams: [9, 3, 3],
      signalBottomIndicator: DEFAULT_SIGNAL_BOTTOM_INDICATOR,
      signalBottomIndicatorParams: [12, 26, 9],
    },
  );
});

test("trainer toolbar sub indicator toggle keeps the restore path clickable", () => {
  const viewportSource = readSource("src/domains/chart/ReplayChartViewport.tsx");
  const toggleButtonStart = viewportSource.indexOf(
    "chart-period-sub-indicator-toggle",
  );
  const toggleButtonEnd = viewportSource.indexOf("</Button>", toggleButtonStart);
  assert.ok(toggleButtonStart >= 0);
  assert.ok(toggleButtonEnd > toggleButtonStart);

  const toggleButtonSource = viewportSource.slice(
    toggleButtonStart,
    toggleButtonEnd,
  );
  assert.match(
    toggleButtonSource,
    /disabled=\{typeof onToggleSubIndicators !== "function"\}/,
  );
  assert.doesNotMatch(toggleButtonSource, /!hasAnySubIndicator/);

  const trainerSectionSource = readSource(
    "src/domains/trainer/useTrainerChartWorkspaceSection.tsx",
  );
  assert.match(trainerSectionSource, /resolveSubIndicatorToggleState/);
  assert.match(
    trainerSectionSource,
    /setSignalTopIndicator\(next\.signalTopIndicator\)/,
  );
  assert.match(
    trainerSectionSource,
    /setSignalBottomIndicator\(next\.signalBottomIndicator\)/,
  );
});

test("sub indicator toggle shows hidden configured indicators without changing selections", () => {
  assert.deepEqual(
    resolveSubIndicatorToggleState({
      showSubIndicators: false,
      signalTopIndicator: "RSI",
      signalTopIndicatorParams: [6],
      signalBottomIndicator: DEFAULT_SIGNAL_BOTTOM_INDICATOR,
      signalBottomIndicatorParams: [12, 26, 9],
    }),
    {
      showSubIndicators: true,
      signalTopIndicator: "RSI",
      signalTopIndicatorParams: [6],
      signalBottomIndicator: DEFAULT_SIGNAL_BOTTOM_INDICATOR,
      signalBottomIndicatorParams: [12, 26, 9],
    },
  );
});

test("sub indicator toggle restores defaults when hidden indicators are both none", () => {
  assert.deepEqual(
    resolveSubIndicatorToggleState({
      showSubIndicators: false,
      signalTopIndicator: INDICATOR_NONE_VALUE,
      signalTopIndicatorParams: [1],
      signalBottomIndicator: INDICATOR_NONE_VALUE,
      signalBottomIndicatorParams: [2],
    }),
    {
      showSubIndicators: true,
      signalTopIndicator: DEFAULT_SIGNAL_TOP_INDICATOR,
      signalTopIndicatorParams: [],
      signalBottomIndicator: DEFAULT_SIGNAL_BOTTOM_INDICATOR,
      signalBottomIndicatorParams: [],
    },
  );
});
