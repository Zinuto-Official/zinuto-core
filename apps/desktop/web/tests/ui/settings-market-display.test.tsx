// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const extractSourceBlock = (source: string, start: string, end: string) => {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(endIndex, -1);
  return source.slice(startIndex, endIndex);
};

test("settings market display hosts global amount decimal display below buy/sell palette", () => {
  const settingsSource = readSource(
    "../../src/workspaces/settings/SystemSettingsWorkspacePage.tsx",
  );
  const marketDisplaySection = extractSourceBlock(
    settingsSource,
    "const renderMarketDisplaySection",
    "const renderAboutUpdatesSection",
  );
  const tradeColorIndex = marketDisplaySection.indexOf(
    'settings.general.tradeColorTheme.title',
  );
  const globalAmountIndex = marketDisplaySection.indexOf(
    'appText.globalAmountDisplay',
  );

  assert.ok(tradeColorIndex >= 0);
  assert.ok(globalAmountIndex > tradeColorIndex);
  assert.match(
    marketDisplaySection,
    /appText\.globalAmountDisplayAffectsUiRenderingDoesAffect/,
  );
  assert.match(marketDisplaySection, /value=\{showGlobalDecimals \? "SHOW" : "HIDE"\}/);
  assert.match(
    marketDisplaySection,
    /onChange=\{\(value\) => setShowGlobalDecimals\(value === "SHOW"\)\}/,
  );
  assert.match(marketDisplaySection, /appText\.showDecimals/);
  assert.match(marketDisplaySection, /appText\.hideDecimals/);
});

test("trainer account settings no longer owns global amount decimal display", () => {
  const accountPanelSource = readSource(
    "../../src/workspaces/trainer/TrainerAccountSettingsInlinePanel.tsx",
  );

  assert.doesNotMatch(accountPanelSource, /appText\.globalAmountDisplay/);
  assert.doesNotMatch(accountPanelSource, /onShowGlobalDecimalsChange/);
  assert.doesNotMatch(accountPanelSource, /replaySettingsAmountDisplayOptions/);
});
