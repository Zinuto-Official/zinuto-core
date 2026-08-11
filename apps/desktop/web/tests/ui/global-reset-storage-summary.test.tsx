// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSystemSettingsSource = () =>
  readFileSync(
    new URL(
      "../../src/workspaces/settings/SystemSettingsWorkspacePage.tsx",
      import.meta.url,
    ),
    "utf8",
  );

const extractSourceBlock = (source: string, start: string, end: string) => {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(endIndex, -1);
  return source.slice(startIndex, endIndex);
};

test("global reset storage summary uses one stacked bar and legend cards", () => {
  const source = readSystemSettingsSource();

  assert.match(source, /settings-maintenance-storage-stack/);
  assert.match(source, /settings-maintenance-storage-segment/);
  assert.match(source, /settings-maintenance-storage-swatch/);
  assert.doesNotMatch(source, /settings-maintenance-storage-card-meter/);
});

test("global reset K-line card labels instruments and bars, not sample pools", () => {
  const source = readSystemSettingsSource();

  assert.match(source, /tt\("appText\.bars"\)/);
  assert.doesNotMatch(
    source,
    /globalResetKlineMetaText[\s\S]{0,240}appText\.samplePool/,
  );
});

test("advanced settings hosts history retention without one-click reset", () => {
  const source = readSystemSettingsSource();
  const storageSections = extractSourceBlock(
    source,
    "const renderStorageSections",
    "const renderDataTransferTab",
  );
  const advancedTab = extractSourceBlock(
    source,
    "const renderAdvancedTab",
    "const renderActiveTabBody",
  );

  assert.match(storageSections, /renderOneClickResetPanel\(\)/);
  assert.doesNotMatch(storageSections, /SystemHistoryRetentionSettings/);
  assert.match(
    advancedTab,
    /isActive=\{isActive && activeTab === "ADVANCED"\}/,
  );
  assert.doesNotMatch(advancedTab, /renderOneClickResetPanel\(\)/);
  assert.doesNotMatch(
    source,
    /isActive=\{isActive && activeTab === "DATA_TRANSFER"\}/,
  );
});
