// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { resolveBrowserDesktopViewportScale } from "../../src/api/desktopViewport";
import {
  DESKTOP_MAIN_WINDOW_DENSITY_SCALE,
  DESKTOP_MAIN_WINDOW_ZOOM_BASE,
  resolveDesktopSecondaryWindowOwnerCenterPosition,
} from "../../src/frontend-kernel/secondary-windows/desktopWindowViewportConfig";

const sourceUrl = (relativePath: string): URL =>
  new URL(`../../${relativePath}`, import.meta.url);

const readSource = (relativePath: string): string =>
  readFileSync(sourceUrl(relativePath), "utf8");

test("main window applies one stable density multiplier inside its min and max guards", () => {
  assert.equal(DESKTOP_MAIN_WINDOW_DENSITY_SCALE, 0.9);
  assert.equal(
    resolveBrowserDesktopViewportScale(
      DESKTOP_MAIN_WINDOW_ZOOM_BASE,
      DESKTOP_MAIN_WINDOW_ZOOM_BASE.designWidth,
      DESKTOP_MAIN_WINDOW_ZOOM_BASE.designHeight,
    ),
    DESKTOP_MAIN_WINDOW_DENSITY_SCALE,
  );
  assert.equal(
    resolveBrowserDesktopViewportScale(
      DESKTOP_MAIN_WINDOW_ZOOM_BASE,
      1352,
      848,
    ),
    Math.min(
      1352 / DESKTOP_MAIN_WINDOW_ZOOM_BASE.designWidth,
      848 / DESKTOP_MAIN_WINDOW_ZOOM_BASE.designHeight,
    ) * DESKTOP_MAIN_WINDOW_DENSITY_SCALE,
  );
  assert.equal(
    resolveBrowserDesktopViewportScale(
      DESKTOP_MAIN_WINDOW_ZOOM_BASE,
      1280,
      720,
    ),
    (720 / DESKTOP_MAIN_WINDOW_ZOOM_BASE.designHeight) *
      DESKTOP_MAIN_WINDOW_DENSITY_SCALE,
  );
  assert.equal(
    resolveBrowserDesktopViewportScale(
      DESKTOP_MAIN_WINDOW_ZOOM_BASE,
      1920,
      1200,
    ),
    DESKTOP_MAIN_WINDOW_DENSITY_SCALE,
  );
  assert.equal(
    resolveBrowserDesktopViewportScale(
      DESKTOP_MAIN_WINDOW_ZOOM_BASE,
      800,
      500,
    ),
    DESKTOP_MAIN_WINDOW_ZOOM_BASE.minScale,
  );
});

test("secondary windows center from the owner's physical frame on any monitor", () => {
  assert.deepEqual(
    resolveDesktopSecondaryWindowOwnerCenterPosition(
      {
        position: { x: -2440, y: 180 },
        size: { width: 1920, height: 1200 },
      },
      { width: 1280, height: 860 },
    ),
    { x: -2120, y: 350 },
  );
  assert.deepEqual(
    resolveDesktopSecondaryWindowOwnerCenterPosition(
      {
        position: { x: 2560, y: -90 },
        size: { width: 2880, height: 1800 },
      },
      { width: 1499, height: 899 },
    ),
    { x: 3251, y: 361 },
  );
  assert.equal(
    resolveDesktopSecondaryWindowOwnerCenterPosition(
      {
        position: { x: 0, y: 0 },
        size: { width: 0, height: 800 },
      },
      { width: 600, height: 400 },
    ),
    null,
  );
});

test("secondary window creation explicitly follows the main window instead of a monitor center", () => {
  const source = readSource("src/api/desktopSecondaryWindows.ts");
  const geometrySource = readSource("src/api/desktopSecondaryWindowGeometry.ts");

  assert.match(
    geometrySource,
    /positionDesktopSecondaryWindowAtMainCenter[\s\S]*mainWindow\.outerPosition\(\)[\s\S]*mainWindow\.outerSize\(\)[\s\S]*windowRef\.outerSize\(\)/u,
  );
  assert.match(
    geometrySource,
    /new windowModule\.PhysicalPosition\(position\.x, position\.y\)/u,
  );
  assert.match(
    source,
    /positionDesktopSecondaryWindowAtMainCenter\(webviewWindow, windowModule\)/u,
  );
  assert.match(
    source,
    /positionDesktopSecondaryWindowAtMainCenter\(\s*existingWindow,\s*windowModule,\s*\)/u,
  );
  const windowOptions = source.slice(
    source.indexOf("new webviewWindowModule.WebviewWindow(label, {"),
    source.indexOf("});", source.indexOf("new webviewWindowModule.WebviewWindow(label, {")),
  );
  assert.doesNotMatch(windowOptions, /\bcenter:\s*true/u);
});

test("command center geometry is CSS-owned and never rescales from measured content", () => {
  const pageSource = readSource(
    "src/workspaces/command-center/TrainingCommandCenterPage.tsx",
  );

  assert.equal(
    existsSync(
      sourceUrl(
        "src/workspaces/command-center/useTrainingCommandCenterFitScale.ts",
      ),
    ),
    false,
  );
  assert.doesNotMatch(pageSource, /useTrainingCommandCenterFitScale/u);
  assert.doesNotMatch(pageSource, /data-tcc-fit-region/u);
  assert.doesNotMatch(pageSource, /densityScaleStyles/u);
});

test("cross-workspace geometry CSS is fixed at startup instead of arriving from lazy bundles", () => {
  const globalStyles = readSource("src/styles.css");
  const trainerStyles = readSource("src/styles/workspaces/trainer.css");
  const specialTrainingStyles = readSource(
    "src/styles/workspaces/special-training.css",
  );
  const specialTrainingOverrides = readSource(
    "src/styles/layout/workspace-overrides.css",
  );
  const historyStyles = readSource(
    "src/styles/pages/history-notes-history-shell.css",
  );
  const pageLayoutStyles = readSource(
    "src/styles/layout/page-layout-system.css",
  );
  const lazyTrainingRefresh = readSource(
    "src/styles/layout/ui-refresh-workspace-and-training.css",
  );
  const commandCenterStyles = readSource(
    "src/styles/pages/training-command-center.css",
  );

  for (const globalImport of [
    "ui-refresh.css",
    "01-visual-polish.css",
    "02-unified-flat-layout.css",
    "04-layout-stabilization.css",
    "05-global-workspace-geometry.css",
  ]) {
    assert.match(globalStyles, new RegExp(globalImport.replace(".", "\\."), "u"));
  }

  assert.doesNotMatch(trainerStyles, /ui-refresh\.css/u);
  assert.doesNotMatch(trainerStyles, /04-layout-stabilization\.css/u);
  assert.doesNotMatch(trainerStyles, /05-global-workspace-geometry\.css/u);
  assert.doesNotMatch(specialTrainingStyles, /ui-refresh\.css/u);
  assert.doesNotMatch(specialTrainingOverrides, /01-visual-polish\.css/u);
  assert.doesNotMatch(specialTrainingOverrides, /02-unified-flat-layout\.css/u);
  assert.doesNotMatch(specialTrainingOverrides, /04-layout-stabilization\.css/u);
  assert.doesNotMatch(
    specialTrainingOverrides,
    /05-global-workspace-geometry\.css/u,
  );

  assert.doesNotMatch(historyStyles, /^\.workspace-page\s*\{/mu);
  assert.doesNotMatch(historyStyles, /^\.workspace-page-body\s*\{/mu);
  assert.match(pageLayoutStyles, /^\.workspace-page\s*\{/mu);
  assert.match(pageLayoutStyles, /^\.workspace-page-body\s*\{/mu);
  assert.doesNotMatch(lazyTrainingRefresh, /training-command-center/u);
  assert.match(commandCenterStyles, /\.training-command-center-page\s*\{/u);
});

test("lazy visual polish cannot resize whichever button currently owns focus", () => {
  const visualPolishStyles = readSource(
    "src/styles/layout/workspace-overrides/01-visual-polish.css",
  );

  assert.doesNotMatch(visualPolishStyles, /\.app-root button:focus-visible/u);
  assert.doesNotMatch(
    visualPolishStyles,
    /\.app-root \[role=["']button["']\]:focus-visible/u,
  );
  assert.match(
    visualPolishStyles,
    /\.right-panel-head\.toolbar\s*\{[^}]*min-height:\s*var\(--trainer-top-row-h\);/su,
  );
});
