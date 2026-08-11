// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readCssWithImports } from "./readCssWithImports";

import { shouldHandleSegmentedControlChange } from "../../src/ui/primitives/segmented-control";
import { shouldHandleOptionStripChange } from "../../src/ui/components/OptionStrip";
import { shouldHandlePlainTabBarChange } from "../../src/ui/components/PlainTabBar";
import { WORKSPACE_KEEP_ALIVE_PAGES } from "../../src/frontend-kernel/workspacePageModel";

const readSource = (path: string): string =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const extractCssBlock = (source: string, header: string): string => {
  const headerIndex = source.indexOf(header);
  assert.notEqual(headerIndex, -1);
  const blockStart = source.indexOf("{", headerIndex);
  assert.notEqual(blockStart, -1);
  let depth = 0;
  for (let index = blockStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      depth += 1;
    }
    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(blockStart + 1, index);
      }
    }
  }
  assert.fail(`CSS block not closed for ${header}`);
};

const assertWorkspaceEnterKeyframeStaysSpatiallyStable = (
  source: string,
  keyframeName: string,
  expectedOpacity: string,
): void => {
  const keyframeBlock = extractCssBlock(source, `@keyframes ${keyframeName}`);
  assert.match(
    keyframeBlock,
    new RegExp(`from\\s*{[^}]*opacity:\\s*${expectedOpacity};`, "s"),
  );
  assert.match(keyframeBlock, /to\s*{[^}]*opacity:\s*1;/s);
  assert.doesNotMatch(keyframeBlock, /transform:/);
};

test("selection controls ignore already active options", () => {
  assert.equal(shouldHandleOptionStripChange("A", "A"), false);
  assert.equal(shouldHandleOptionStripChange("B", "A"), true);
  assert.equal(shouldHandleOptionStripChange("B", "A", true), false);

  assert.equal(shouldHandlePlainTabBarChange("tab-a", "tab-a"), false);
  assert.equal(shouldHandlePlainTabBarChange("tab-b", "tab-a"), true);
  assert.equal(shouldHandlePlainTabBarChange("tab-b", "tab-a", true), false);

  assert.equal(shouldHandleSegmentedControlChange("A", "A"), false);
  assert.equal(shouldHandleSegmentedControlChange("B", "A"), true);
  assert.equal(shouldHandleSegmentedControlChange("B", "A", true), false);
});

test("stable workspace panels do not replay entry animations", () => {
  const specialTrainingPrepCss = readSource(
    "../../src/styles/layout/workspace-overrides/06-special-training-prep.css",
  );
  const trainerPrepCss = readSource(
    "../../src/styles/layout/workspace-overrides/03-trainer-layout-refresh.css",
  );
  const settingsDataCss = readSource("../../src/styles/pages/settings-data.css");

  assert.doesNotMatch(specialTrainingPrepCss, /special-training-prep-panel-switch/);
  assert.doesNotMatch(
    specialTrainingPrepCss,
    /\.special-training-prep-banner-inner\s*{[^}]*animation:/s,
  );
  assert.doesNotMatch(
    specialTrainingPrepCss,
    /\.special-training-prep-console-animated\s*{[^}]*animation:/s,
  );

  assert.doesNotMatch(trainerPrepCss, /trainer-prep-mode-panel-enter/);
  assert.doesNotMatch(
    trainerPrepCss,
    /\.trainer-prep-console-columns\s*{[^}]*animation:/s,
  );
  assert.doesNotMatch(
    trainerPrepCss,
    /\.trainer-prep-mode-panel\s*{[^}]*animation:/s,
  );

  assert.doesNotMatch(settingsDataCss, /settings-progressive-reveal/);
  assert.doesNotMatch(
    settingsDataCss,
    /\.settings-progressive-stack\s*{[^}]*animation:/s,
  );
});

test("workspace page navigation fades without moving the page layout", () => {
  const appShellCss = readSource("../../src/styles/layout/app-shell.css");
  const desktopMotionCss = readSource(
    "../../src/styles/core/desktop-motion.css",
  );
  const workspaceSwitcherSource = readSource(
    "../../src/workspaces/WorkspacePageSwitcher.tsx",
  );
  const motionEnabledRule = extractCssBlock(
    desktopMotionCss,
    '.desktop-main > .workspace-page-cache-slot.is-active[data-motion-enabled="true"]',
  );

  assert.doesNotMatch(appShellCss, /workspace-page-enter/);
  assert.doesNotMatch(appShellCss, /is-motion-underlay/);
  assert.doesNotMatch(
    appShellCss,
    /\.workspace-page-cache-slot\.is-cached\s*\{[^}]*display:\s*none/s,
  );
  assert.match(appShellCss, /\.workspace-page-cache-slot\.is-visible/);
  assert.match(appShellCss, /\.workspace-page-cache-slot\.is-hidden-ready/);
  assert.match(appShellCss, /\.workspace-page-cache-slot\.is-preparing/);
  assert.match(appShellCss, /\.workspace-page-cache-slot\.is-exiting/);
  assert.match(appShellCss, /\.workspace-page-cache-slot-content/);
  assert.match(appShellCss, /\.workspace-page-continuity-shell/);
  assert.match(appShellCss, /\.workspace-continuity-skeleton--overview/);
  assert.match(appShellCss, /\.workspace-continuity-skeleton--workbench/);
  assert.match(appShellCss, /\.workspace-continuity-skeleton--split-detail/);
  assert.match(appShellCss, /\.workspace-continuity-skeleton--workflow/);
  assert.match(motionEnabledRule, /background:\s*var\(--window-bg\);/);
  assert.match(motionEnabledRule, /overflow:\s*hidden;/);
  assert.match(motionEnabledRule, /isolation:\s*isolate;/);
  assert.match(motionEnabledRule, /opacity:\s*1;/);
  assert.doesNotMatch(motionEnabledRule, /animation:/);
  assert.match(
    desktopMotionCss,
    />\s*\.workspace-page-cache-slot-content\s*{[^}]*will-change:\s*opacity;/s,
  );
  assert.match(
    desktopMotionCss,
    /data-motion-direction="forward"[\s\S]*>\s*\.workspace-page-cache-slot-content\s*{[^}]*animation:\s*workspace-page-enter-forward/s,
  );
  assert.match(
    desktopMotionCss,
    /data-motion-direction="backward"[\s\S]*>\s*\.workspace-page-cache-slot-content\s*{[^}]*animation:\s*workspace-page-enter-backward/s,
  );
  assert.match(
    desktopMotionCss,
    /data-motion-surface="immersive"[\s\S]*>\s*\.workspace-page-cache-slot-content\s*{[^}]*animation:\s*workspace-page-enter-immersive/s,
  );
  assertWorkspaceEnterKeyframeStaysSpatiallyStable(
    desktopMotionCss,
    "workspace-page-enter-forward",
    "0\\.985",
  );
  assertWorkspaceEnterKeyframeStaysSpatiallyStable(
    desktopMotionCss,
    "workspace-page-enter-backward",
    "0\\.985",
  );
  assertWorkspaceEnterKeyframeStaysSpatiallyStable(
    desktopMotionCss,
    "workspace-page-enter-immersive",
    "0\\.985",
  );
  assert.match(workspaceSwitcherSource, /data-motion-epoch=/);
  assert.match(workspaceSwitcherSource, /onAnimationEnd=/);
  assert.match(workspaceSwitcherSource, /displayedPage/);
  assert.match(workspaceSwitcherSource, /data-page-state=/);
  assert.match(workspaceSwitcherSource, /workspace-page-cache-slot-content/);
  assert.match(workspaceSwitcherSource, /renderWorkspaceContinuitySkeleton/);
  assert.match(workspaceSwitcherSource, /WorkspaceFrameShell/);
  assert.match(workspaceSwitcherSource, /WORKSPACE_KEEP_ALIVE_PAGES/);
  assert.doesNotMatch(workspaceSwitcherSource, /WORKSPACE_PAGE_KEEP_ALIVE_SET/);
  assert.deepEqual([...WORKSPACE_KEEP_ALIVE_PAGES], [
    "TRAINER",
    "HISTORY",
    "SPECIAL_TRAINING",
    "CHALLENGE_STATS",
    "CUSTOM_INDICATOR",
    "STRATEGY_BACKTEST",
    "NOTES",
    "DATA",
    "SETTINGS",
  ]);
  assert.doesNotMatch(workspaceSwitcherSource, /WORKSPACE_PAGE_KEEP_ALIVE_MAX/);
  assert.doesNotMatch(workspaceSwitcherSource, /previousPage/);
  assert.doesNotMatch(workspaceSwitcherSource, /is-motion-underlay/);
  assert.match(
    workspaceSwitcherSource,
    /WORKSPACE_PAGE_NAVIGATION_MOTION_FAILSAFE_MS/,
  );
});

test("workspace tab overflow cannot resize the fixed sidebar", () => {
  const globalConsistencyCss = readCssWithImports(
    new URL(
      "../../src/styles/core/ui-global-consistency.css",
      import.meta.url,
    ),
  );
  const appRootRule = extractCssBlock(globalConsistencyCss, ".app-root {");

  assert.match(
    appRootRule,
    /scrollbar-gutter:\s*stable\s*!important;/,
  );
});

test("selection indicators keep their last rect during transient detach", () => {
  const selectionRectSource = readSource("../../src/ui/useActiveSelectionRect.ts");

  assert.match(selectionRectSource, /if \(!activeValue\)\s*{[\s\S]*?setActiveRect/);
  assert.match(
    selectionRectSource,
    /if \(!container \|\| !activeElement\)\s*{\s*return;\s*}/,
  );
  assert.doesNotMatch(
    selectionRectSource,
    /if \(!container \|\| !activeElement\)\s*{[^}]*setActiveRect/,
  );
  assert.match(
    selectionRectSource,
    /container\.scrollLeft\s*-\s*container\.clientLeft/,
  );
  assert.match(
    selectionRectSource,
    /container\.scrollTop\s*-\s*container\.clientTop/,
  );
  assert.match(
    selectionRectSource,
    /if \(!container \|\| !activeElement\)\s*{\s*return;\s*}\s*measure\(\);\s*const detachContainer/,
  );
});

test("secondary replay metrics keep stable keys across value updates", () => {
  const secondaryReplayRouteSource = readSource(
    "../../src/app-shell/secondaryWindows/routes/secondaryReplayRoute.tsx",
  );

  assert.doesNotMatch(
    secondaryReplayRouteSource,
    /key=\{`\$\{metric\.label\}-\$\{metric\.value\}`\}/,
  );
  assert.match(
    secondaryReplayRouteSource,
    /key=\{`\$\{metric\.label\}-\$\{index\}`\}/,
  );
});
