// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import test from "node:test";

const i18nWorkspacePagesSource = [
  "i18nWorkspacePages.tsx",
  "I18nWorkspacePreviewSurface.tsx",
  "PreviewMarketDataAcquisition.tsx",
  "i18nWorkspacePreviewSupport.tsx",
  "renderI18nWorkspacePreviewPrimary.tsx",
  "renderI18nWorkspacePreviewSecondary.tsx",
]
  .map((fileName) =>
    readFileSync(new URL(`../../testHarness/${fileName}`, import.meta.url), "utf8"),
  )
  .join("\n");

test("i18n workspace preview formats placeholder messages through ttf", () => {
  assert.match(
    i18nWorkspacePagesSource,
    /ttf\("appText\.remainingValue0",\s*\[/,
  );
  assert.doesNotMatch(
    i18nWorkspacePagesSource,
    /tt\("appText\.remainingValue0"\)\.replace/,
  );
});

test("i18n DATA preview exposes empty and populated management states", () => {
  assert.match(i18nWorkspacePagesSource, /requestedScenario === "empty"/);
  assert.match(i18nWorkspacePagesSource, /requestedScenario === "populated"/);
  assert.match(
    i18nWorkspacePagesSource,
    /isDataEmptyPreview[\s\S]{0,180}\[systemPool\]/,
  );
  assert.match(
    i18nWorkspacePagesSource,
    /isDataPopulatedPreview[\s\S]{0,180}isDataPrecheckPreview/,
  );
});

test("i18n preview exposes the acquisition wizard and terminal states", () => {
  assert.match(i18nWorkspacePagesSource, /\| "DATA_ACQUISITION"/);
  assert.match(
    i18nWorkspacePagesSource,
    /scenario === "catalog"[\s\S]{0,120}scenario === "settings"/,
  );
  assert.match(i18nWorkspacePagesSource, /scenario === "saved"/);
  assert.match(i18nWorkspacePagesSource, /scenario === "failed"/);
  assert.match(
    i18nWorkspacePagesSource,
    /<MarketDataAcquisitionWizard[\s\S]{0,1200}wizardStep=\{wizardStep\}/,
  );
  assert.match(
    i18nWorkspacePagesSource,
    /<MarketDataAcquisitionResult[\s\S]{0,800}market-data-acquisition-state-page/,
  );
});
