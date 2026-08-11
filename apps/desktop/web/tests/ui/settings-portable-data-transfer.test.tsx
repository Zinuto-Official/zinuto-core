// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readCssWithImports } from "./readCssWithImports";

const readPortableDataTransferSource = () =>
  [
    "portableDataTransferModel.ts",
    "PortableDataTransferSection.tsx",
    "PortableImportDialog.tsx",
  ]
    .map((fileName) =>
      readFileSync(
        new URL(
          `../../src/workspaces/settings/portableData/${fileName}`,
          import.meta.url,
        ),
        "utf8",
      ),
    )
    .join("\n");

const readSettingsDataAssetWorkspaceCss = () =>
  readCssWithImports(
    new URL(
      "../../src/styles/pages/settings-data-asset-workspace.css",
      import.meta.url,
    ),
  );

const readSettingsDataAssetLibraryCss = () =>
  readCssWithImports(
    new URL(
      "../../src/styles/pages/settings-data-asset-library.css",
      import.meta.url,
    ),
  );

const readSettingsSystemCss = () =>
  readCssWithImports(
    new URL("../../src/styles/pages/settings-system.css", import.meta.url),
  );

const readSystemSettingsLayoutSource = () =>
  readFileSync(
    new URL(
      "../../src/workspaces/settings/settings/SystemSettingsLayout.tsx",
      import.meta.url,
    ),
    "utf8",
  );

const readSystemSettingsWorkspacePageSource = () =>
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

test("portable export success displays the backend canonical output path", () => {
  const source = readPortableDataTransferSource();
  const executeExportBlock = extractSourceBlock(
    source,
    "const executeExport = useCallback",
    "const pickImportPackage = useCallback",
  );
  const requestIndex = executeExportBlock.indexOf(
    "const result = await api.executePortableExport",
  );
  const pathUpdateIndex = executeExportBlock.indexOf(
    "setExportPath(result.outputPath)",
  );

  assert.ok(requestIndex >= 0);
  assert.ok(pathUpdateIndex > requestIndex);
  assert.match(executeExportBlock, /setExportStep\("SUCCESS"\)/);
});

test("portable export defaults include market data and reload all source selections", () => {
  const source = readPortableDataTransferSource();
  const defaultDomainBlock = extractSourceBlock(
    source,
    "const PORTABLE_EXPORT_DOMAIN_ORDER",
    "const getDefaultExportDomains",
  );
  const openExportBlock = extractSourceBlock(
    source,
    "const openExportDialog = useCallback",
    "const openImportDialog = useCallback",
  );
  const loadSourcesBlock = extractSourceBlock(
    source,
    "const loadMarketSources = useCallback",
    "const openExportDialog = useCallback",
  );

  assert.match(defaultDomainBlock, /"MARKET_DATA"/);
  assert.match(openExportBlock, /setExportDomains\(getDefaultExportDomains\(\)\)/);
  assert.match(openExportBlock, /setMarketSourceRows\(\[\]\)/);
  assert.match(openExportBlock, /setSelectedMarketSourceIds\(\[\]\)/);
  assert.match(openExportBlock, /void loadMarketSources\(\)/);
  assert.match(loadSourcesBlock, /setSelectedMarketSourceIds\(normalized\.map\(\(row\) => row\.id\)\)/);
});

test("portable export selection blocks empty market-source exports before preview", () => {
  const source = readPortableDataTransferSource();
  const selectionStateBlock = extractSourceBlock(
    source,
    "const isExportMarketDataSelected = exportDomains.includes",
    "const isImportMarketDataSelected = importDomains.includes",
  );
  const selectStepBlock = extractSourceBlock(
    source,
    "{exportStep === \"SELECT\" ?",
    "{exportStep === \"PREVIEW\" && exportPreview ?",
  );

  assert.match(selectionStateBlock, /hasNoSelectedExportMarketSources/);
  assert.match(selectionStateBlock, /isLoadingMarketSources/);
  assert.match(selectionStateBlock, /canContinueExportSelection/);
  assert.match(selectStepBlock, /disabled=\{!canContinueExportSelection\}/);
  assert.match(selectStepBlock, /copy\.noSourcesSelected/);
});

test("portable transfer workflow modal has a fixed shell and scrollable body", () => {
  const source = readPortableDataTransferSource();
  const workspaceCss = readSettingsDataAssetWorkspaceCss();
  const libraryCss = readSettingsDataAssetLibraryCss();
  const settingsCss = readSettingsSystemCss();

  assert.match(source, /className="portable-transfer-modal-surface"/);
  assert.match(
    workspaceCss,
    /\.app-modal-surface\.portable-transfer-modal-surface\[data-preset="workflow"\]\s*\{[\s\S]*height:\s*min\(760px,\s*calc\(100dvh - 24px\)\);[\s\S]*overflow:\s*hidden;[\s\S]*padding:\s*0;/,
  );
  assert.match(
    workspaceCss,
    /\.data-config-transfer-dialog\s*\{[\s\S]*height:\s*100%;[\s\S]*min-height:\s*0;[\s\S]*overflow:\s*hidden;/,
  );
  assert.match(
    workspaceCss,
    /\.data-config-transfer-dialog-body\s*\{[\s\S]*overflow-x:\s*hidden;[\s\S]*overflow-y:\s*auto;[\s\S]*overscroll-behavior:\s*contain;/,
  );
  assert.match(
    workspaceCss,
    /\.data-config-transfer-check\s*>\s*span\s*\{[\s\S]*overflow-wrap:\s*anywhere;/,
  );
  assert.match(
    libraryCss,
    /\.app-modal-surface\.portable-transfer-modal-surface\[data-preset="workflow"\]\s*\{[\s\S]*height:\s*calc\(100dvh - 16px\);/,
  );
  assert.match(
    settingsCss,
    /\.settings-redesign-scroll\s*\{[\s\S]*max-height:\s*100%;[\s\S]*overflow:\s*auto;[\s\S]*overscroll-behavior:\s*contain;/,
  );
});

test("data transfer stacks sections and storage categories in a scrollable viewport", () => {
  const layoutSource = readSystemSettingsLayoutSource();
  const transferSource = readPortableDataTransferSource();
  const settingsCss = readSettingsSystemCss();

  assert.match(layoutSource, /data-active-tab=\{activeTab\}/);
  assert.match(
    settingsCss,
    /\.settings-redesign-scroll\[data-active-tab="DATA_TRANSFER"\]\s*\{\s*padding-top:\s*8px;\s*\}/,
  );
  assert.match(
    settingsCss,
    /\.settings-redesign-scroll\[data-active-tab="DATA_TRANSFER"\][\s\S]*\.settings-redesign-section-stack\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/,
  );
  assert.match(
    settingsCss,
    /\.settings-redesign-scroll\[data-active-tab="DATA_TRANSFER"\][\s\S]*\.settings-maintenance-storage-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/,
  );
  assert.match(
    settingsCss,
    /\.settings-maintenance-storage-card\s*\{[\s\S]*column-gap:\s*12px;/,
  );
  assert.doesNotMatch(transferSource, /className="portable-transfer-trust"/);
  assert.doesNotMatch(transferSource, /SettingsStatusPill/);
});

test("storage categories have a distinct label from the one-click reset", () => {
  const source = readSystemSettingsWorkspacePageSource();

  assert.match(
    source,
    /className="settings-reset-action-row"[\s\S]*title=\{t\("settings\.storage\.section\.categories"\)\}/,
  );
  assert.match(source, /\{tt\("appText\.oneClickReset2"\)\}/);
});
