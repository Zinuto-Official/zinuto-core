// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildModePickerPrepGuideItems } from "../../src/workspaces/special-training/view-models/specialTrainingModePickerPanelsViewModel";

const labels = {
  goal: "Goal",
  rules: "Rules",
  settlementFocus: "Settlement Focus",
};

const templates = {
  fastDecisionGoal:
    "Fixed {0}-bar history. Choose long, short, or observe within {1} sec",
  fastDecisionRules: "Evaluation uses the next {0} bars",
  fastDecisionSettlementFocus: "Strictness: {0}",
  riskDisciplineRules: "Start with {0} history bars, then manage {1} future bars",
  riskDisciplineSettlementFocus: "Risk control and exit discipline matter most",
};

const formatTemplate = (
  template: string,
  values: Array<string | number>,
): string => {
  let result = template;
  values.forEach((value, index) => {
    result = result.replace(`{${index}}`, String(value));
  });
  return result;
};

test("fast decision prep guide is generated from the active runtime parameters", () => {
  const items = buildModePickerPrepGuideItems({
    isFastDecisionMode: true,
    modeGoal: "stale static mode goal",
    historyBars: 100,
    activeDecisionSecondsLimit: 30,
    activeHorizonBars: 80,
    activeStrictnessSummary: "Standard (1.5x)",
    labels,
    templates,
    formatTemplate,
  });

  assert.equal(items.length, 3);
  assert.equal(items[0]?.value.includes("100"), true);
  assert.equal(items[0]?.value.includes("30"), true);
  assert.equal(items[0]?.value.includes("15"), false);
  assert.equal(items[1]?.value.includes("80"), true);
  assert.equal(items[2]?.value.includes("Standard (1.5x)"), true);
  assert.equal(items.some((item) => item.key === "limit"), false);
  assert.equal(items.some((item) => item.label === "Notes"), false);
});

test("risk discipline prep guide uses the visible mode goal and current windows", () => {
  const modeGoal = "Hold the process through entry, exit, and completion.";
  const items = buildModePickerPrepGuideItems({
    isFastDecisionMode: false,
    modeGoal,
    historyBars: 100,
    activeDecisionSecondsLimit: 45,
    activeHorizonBars: 120,
    activeStrictnessSummary: "unused",
    labels,
    templates,
    formatTemplate,
  });

  assert.equal(items.length, 3);
  assert.equal(items[0]?.value, modeGoal);
  assert.equal(items[1]?.value.includes("100"), true);
  assert.equal(items[1]?.value.includes("120"), true);
  assert.equal(items[2]?.value, templates.riskDisciplineSettlementFocus);
  assert.equal(items.some((item) => item.key === "limit"), false);
  assert.equal(items.some((item) => item.value.includes("ATR")), false);
});

test("novice guide render hooks are present in prep and live training views", () => {
  const modePickerView = readFileSync(
    new URL(
      "../../src/workspaces/special-training/components/SpecialTrainingModePickerView.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const fastDecisionView = readFileSync(
    new URL(
      "../../src/workspaces/special-training/components/SpecialTrainingFastDecisionTrainingView.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const riskDisciplineView = readFileSync(
    new URL(
      "../../src/workspaces/special-training/components/SpecialTrainingRiskDisciplineTrainingView.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const readStyleLayers = (baseName: string, count: number): string =>
    Array.from({ length: count }, (_, index) =>
      readFileSync(
        new URL(
          `../../src/styles/layout/workspace-overrides/${baseName}.layer-0${index + 1}.css`,
          import.meta.url,
        ),
        "utf8",
      ),
    ).join("\n");
  const prepStyles = readStyleLayers("06-special-training-prep", 3);
  const fastDecisionStyles = readStyleLayers(
    "02-special-training-lightning-status",
    2,
  );
  const riskDisciplineStyles = readStyleLayers(
    "02-special-training-risk-review",
    2,
  );

  assert.equal(
    modePickerView.includes("special-training-prep-start-section--guide"),
    true,
  );
  assert.equal(modePickerView.includes("content.prepGuideTitle"), true);
  assert.equal(
    modePickerView.includes("special-training-prep-start-section--readiness"),
    false,
  );
  assert.equal(
    fastDecisionView.includes("content.fastDecisionLiveGuideText"),
    false,
  );
  assert.equal(
    riskDisciplineView.includes("content.riskDisciplineLiveGuideText"),
    true,
  );
  assert.equal(prepStyles.includes(".special-training-prep-guide-list"), true);
  assert.equal(
    fastDecisionStyles.includes(".special-training-live-guide"),
    true,
  );
  assert.equal(
    fastDecisionStyles.includes(".special-training-lightning-live-guide"),
    false,
  );
  assert.equal(
    riskDisciplineStyles.includes(".special-training-risk-live-guide"),
    true,
  );
});
