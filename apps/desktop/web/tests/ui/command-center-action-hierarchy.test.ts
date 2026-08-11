// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readCssWithImports } from "./readCssWithImports";

const pageSource = readFileSync(
  new URL("../../src/workspaces/command-center/TrainingCommandCenterPage.tsx", import.meta.url),
  "utf8",
);
const controllerSource = readFileSync(
  new URL(
    "../../src/workspaces/command-center/useTrainingCommandCenterPageController.ts",
    import.meta.url,
  ),
  "utf8",
);
const modeCss = readCssWithImports(
  new URL("../../src/styles/pages/training-command-center-modes-and-responsive.css", import.meta.url),
);

test("command center primary actions carry their mode icon", () => {
  assert.match(
    pageSource,
    /className="training-command-center-cta-icon"[\s\S]*?<AppIcon name=\{card\.primaryAction\.iconName \?\? card\.iconName\}/u,
  );
  assert.match(pageSource, /is-\$\{card\.primaryAction\.tone\}/u);
});

test("command center action icons stay clean and reinforce direction", () => {
  const iconBlock = modeCss.match(
    /\.training-command-center-cta-icon \{(?<body>[\s\S]*?)\n\}/u,
  )?.groups?.body;

  assert.ok(iconBlock, "command-center action icon styles should be declared");
  assert.match(iconBlock, /width:\s*18px/u);
  assert.match(iconBlock, /height:\s*18px/u);
  assert.match(iconBlock, /border:\s*0/u);
  assert.match(iconBlock, /background:\s*transparent/u);
  assert.match(
    modeCss,
    /\.training-command-center-cta\.is-tonal[\s\S]*?\.training-command-center-cta-icon \{[\s\S]*?order:\s*2/u,
  );
  assert.match(
    controllerSource,
    /iconName:\s*canContinueTrainerSession[\s\S]*?\?\s*"actionPlay"[\s\S]*?:\s*"actionArrowRight"/u,
  );
  assert.doesNotMatch(controllerSource, /iconName:\s*"actionPlayPause"/u);
});

test("command center actions use a deliberate primary, tonal, and utility hierarchy", () => {
  const flashBlock = modeCss.match(
    /\.training-command-center-mode-card\.is-flash \{(?<body>[\s\S]*?)\n\}/u,
  )?.groups?.body;
  const crisisBlock = modeCss.match(
    /\.training-command-center-mode-card\.is-crisis \{(?<body>[\s\S]*?)\n\}/u,
  )?.groups?.body;

  assert.ok(flashBlock, "flash action tokens should be declared");
  assert.ok(crisisBlock, "crisis action tokens should be declared");
  assert.match(flashBlock, /--tcc-mode-cta-bg: color-mix/u);
  assert.match(crisisBlock, /--tcc-mode-cta-bg: color-mix/u);
  assert.doesNotMatch(flashBlock, /--tcc-mode-cta-bg:\s*var\(--action-a1\)/u);
  assert.doesNotMatch(crisisBlock, /--tcc-mode-cta-bg:\s*var\(--action-a1\)/u);
  assert.match(modeCss, /border-radius: calc\(var\(--ui-radius-control\) \+ 3px\) !important/u);
  assert.match(modeCss, /\.training-command-center-cta:is\(\.is-primary, \.is-tonal, \.is-secondary\):disabled/u);
  assert.match(modeCss, /\.training-command-center-cta\.is-secondary:focus-visible/u);
});
