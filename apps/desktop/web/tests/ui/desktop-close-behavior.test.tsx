// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildUiSettingsWithDesktopCloseButtonAction,
  resolveDesktopCloseButtonActionFromUiSettings,
} from "../../src/app-shell/desktopCloseBehavior";
import {
  DEFAULT_DESKTOP_CLOSE_BUTTON_ACTION,
  normalizeDesktopCloseButtonAction,
  resolveDesktopCloseRequestPlan,
} from "../../src/frontend-kernel/windowBehavior";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(dirname, "../..");
const readSource = (relativePath: string): string =>
  readFileSync(path.join(webRoot, relativePath), "utf8");
const readDesktopShellSource = (relativePath: string): string =>
  readFileSync(path.join(webRoot, "../shell", relativePath), "utf8");

test("desktop close button action normalizes to ask by default", () => {
  assert.equal(DEFAULT_DESKTOP_CLOSE_BUTTON_ACTION, "ASK");
  assert.equal(normalizeDesktopCloseButtonAction("ASK"), "ASK");
  assert.equal(
    normalizeDesktopCloseButtonAction("MINIMIZE_TO_TRAY"),
    "MINIMIZE_TO_TRAY",
  );
  assert.equal(normalizeDesktopCloseButtonAction("QUIT"), "QUIT");
  assert.equal(normalizeDesktopCloseButtonAction("CLOSE"), "ASK");
  assert.equal(resolveDesktopCloseButtonActionFromUiSettings({}), "ASK");
});

test("desktop close request plans map remembered choices to direct actions", () => {
  assert.equal(resolveDesktopCloseRequestPlan("ASK"), "PROMPT");
  assert.equal(
    resolveDesktopCloseRequestPlan("MINIMIZE_TO_TRAY"),
    "MINIMIZE_TO_TRAY",
  );
  assert.equal(resolveDesktopCloseRequestPlan("QUIT"), "QUIT");
});

test("remembered close choice is written as a ui setting without dropping existing settings", () => {
  assert.deepEqual(
    buildUiSettingsWithDesktopCloseButtonAction(
      {
        language: "en",
        themeMode: "dark",
      },
      "QUIT",
    ),
    {
      language: "en",
      themeMode: "dark",
      desktopCloseButtonAction: "QUIT",
    },
  );
});

test("main close controller prompts for ask and only persists remembered choices", () => {
  const source = readSource(
    "src/app-shell/DesktopCloseBehaviorController.tsx",
  );
  assert.match(source, /subscribeDesktopMainWindowCloseRequested/u);
  assert.match(source, /event\.preventDefault\(\)/u);
  assert.match(source, /resolveDesktopCloseRequestPlan/u);
  assert.match(source, /setDialogOpen\(true\)/u);
  assert.match(
    source,
    /description=\{t\("desktop\.closeDialog\.description"\)\}/u,
  );
  assert.match(
    source,
    /accessibilityDescription=\{t\("desktop\.closeDialog\.description"\)\}/u,
  );
  assert.match(source, /if \(rememberSelection\)/u);
  assert.match(source, /api\.updateAppUiSettings/u);
  assert.match(source, /catch\(\(\) => undefined\)/u);
  assert.match(source, /setDialogOpen\(true\);\s*\}\)\s*\.finally/u);
  assert.match(
    source,
    /void runCloseAction\(plan\)\.catch\(\(\) => \{[\s\S]*setRememberSelection\(false\);[\s\S]*setDialogOpen\(true\);[\s\S]*\}\);/u,
  );
  assert.match(source, /api\.hideDesktopAppToTray/u);
  assert.match(source, /api\.quitDesktopApp/u);
});

test("desktop close prompt uses a roomier responsive alert surface", () => {
  const source = readSource("src/styles/components/ui-system-business.css");
  assert.match(
    source,
    /\.desktop-close-behavior-modal\s*\{[\s\S]*width:\s*min\(520px,\s*calc\(100vw - 24px\)\)/u,
  );
  assert.match(
    source,
    /\.desktop-close-behavior-modal \.ui-standard-modal\[data-variant="alert"\]\s*\{[\s\S]*gap:\s*22px/u,
  );
});

test("desktop api hides secondary windows for reuse before hiding main to tray", () => {
  const source = readSource("src/api/desktopSecondaryWindows.ts");
  assert.match(source, /export const hideDesktopAppToTray/u);
  assert.match(source, /DESKTOP_SECONDARY_WINDOW_KINDS/u);
  assert.match(source, /existingWindow\.hide\(\)/u);
  assert.match(source, /markDesktopSecondaryWarmWindow\(kind\)/u);
  assert.match(
    source,
    /const state = desktopSecondaryWindowStateStore\.get\(kind\)[\s\S]*notifyDesktopSecondaryWindowHiddenForReuse\(state\)/u,
  );
  assert.match(source, /WINDOW_HIDDEN_FOR_REUSE/u);
  assert.match(source, /getCurrentWindow\(\)\s*\.hide\(\)/u);
  assert.match(source, /desktop_app_quit/u);
});

test("desktop shell close fallback does not bypass the web close behavior controller", () => {
  const source = readDesktopShellSource("src/main.rs");
  const closeRequestedIndex = source.indexOf(
    "event: tauri::WindowEvent::CloseRequested { api, .. },",
  );
  assert.notEqual(closeRequestedIndex, -1);
  const exitRequestedIndex = source.indexOf(
    "tauri::RunEvent::ExitRequested",
    closeRequestedIndex,
  );
  assert.notEqual(exitRequestedIndex, -1);
  const mainCloseBranchSource = source.slice(
    closeRequestedIndex,
    exitRequestedIndex,
  );
  assert.match(mainCloseBranchSource, /label == MAIN_WINDOW_LABEL/u);
  assert.match(mainCloseBranchSource, /api\.prevent_close\(\);/u);
  assert.doesNotMatch(mainCloseBranchSource, /\.hide\(/u);
});

test("desktop shell restores the main window when the macOS dock icon reopens the app", () => {
  const source = readDesktopShellSource("src/main.rs");
  assert.match(
    source,
    /#\[cfg\(target_os = "macos"\)\]\s*tauri::RunEvent::Reopen \{ \.\. \} => \{\s*restore_main_window\(app\);\s*\}/u,
  );
});
