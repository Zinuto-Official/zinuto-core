// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath: string): string =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("fast decision training keeps the chart drawing rail compact", () => {
  const viewSource = readSource(
    "../../src/workspaces/special-training/components/SpecialTrainingFastDecisionTrainingView.tsx",
  );
  const pageSource = readSource(
    "../../src/workspaces/special-training/specialTrainingPageRuntimePresentation.ts",
  );
  const lightningCss = [1, 2]
    .map((layer) =>
      readSource(
        `../../src/styles/layout/workspace-overrides/02-special-training-lightning-status.layer-0${layer}.css`,
      ),
    )
    .join("\n");
  const workspaceGeometryCss = [1, 2]
    .map((layer) =>
      readSource(
        `../../src/styles/layout/workspace-overrides/05-global-workspace-geometry.layer-0${layer}.css`,
      ),
    )
    .join("\n");

  assert.match(
    viewSource,
    /leftPanelBodyClassName="special-training-fast-decision-left-panel-body"/,
  );
  assert.match(
    pageSource,
    /view === "TRAINING" && isFastDecisionMode\s*\? "is-fast-decision-training"\s*: ""/,
  );
  assert.match(
    lightningCss,
    /\.desktop-main\.is-special-training\s+\.special-training-fast-decision-left-panel-body[\s\S]*> \.chart-layout\[data-drawing-density="slim"\]\s*\{[\s\S]*gap:\s*clamp\(2px, 0\.18vw, 4px\);/,
  );
  assert.match(
    lightningCss,
    /\.desktop-main\.is-special-training\s+\.special-training-fast-decision-left-panel-body\s+\.draw-toolbar\[data-density="slim"\]\s*\{[\s\S]*--dt-toolbar-width:\s*clamp\(42px, 2\.72vw, 48px\);[\s\S]*--dt-control-width:\s*clamp\(34px, 2\.18vw, 38px\);[\s\S]*width:\s*var\(--dt-toolbar-width\);[\s\S]*flex:\s*0 0 var\(--dt-toolbar-width\);/,
  );
  assert.match(
    workspaceGeometryCss,
    /\.workspace-page\.special-training-page\.is-fast-decision-training[\s\S]*padding-inline-start:\s*0;/,
  );
  assert.match(
    workspaceGeometryCss,
    /\.workspace-page\.special-training-page\.is-fast-decision-training[\s\S]*\.special-training-trainer-app-shell\s*\{[\s\S]*padding-inline-start:\s*0;/,
  );
});

test("special training content object is stable across same-language renders", () => {
  const pageStateSource = readSource(
    "../../src/workspaces/special-training/useSpecialTrainingPageState.ts",
  );

  assert.match(
    pageStateSource,
    /const content = useMemo\(\s*\(\) => getSpecialTrainingPageContent\(language\),\s*\[language\],?\s*\);/,
  );
  assert.doesNotMatch(
    pageStateSource,
    /const content = getSpecialTrainingPageContent\(language\);/,
  );
});
