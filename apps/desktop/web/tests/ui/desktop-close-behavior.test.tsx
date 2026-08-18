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

test("main close controller uses the native lease and commits without waiting for cleanup", () => {
  const source = readSource(
    "src/app-shell/DesktopCloseBehaviorController.tsx",
  );
  assert.match(source, /subscribeDesktopMainWindowCloseRequested/u);
  assert.match(source, /acknowledgeDesktopMainWindowCloseRequest/u);
  assert.match(source, /keepaliveDesktopMainWindowCloseRequest/u);
  assert.match(source, /resolveDesktopMainWindowCloseRequest/u);
  assert.match(source, /setDesktopMainWindowCloseHandlerStatus/u);
  assert.doesNotMatch(source, /event\.preventDefault\(\)/u);
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
  assert.match(source, /if \(remember\)/u);
  assert.match(source, /writeCachedAppUiSettingsSnapshot/u);
  assert.match(source, /api\s*\.updateAppUiSettings/u);
  assert.match(source, /catch\(\(\) => undefined\)/u);
  assert.match(
    source,
    /void executeDesktopClosePlan\(action, requestId\)[\s\S]*\.finally\(/u,
  );
  assert.match(source, /clearActiveCloseRequest\(requestId\)/u);
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
  const mainHideIndex = source.indexOf("await currentWindow.hide()");
  const secondaryHideIndex = source.indexOf("const hideSecondaryWindow");
  assert.notEqual(mainHideIndex, -1);
  assert.ok(secondaryHideIndex > mainHideIndex);
  assert.match(source, /Promise\.allSettled\(/u);
  assert.match(source, /desktop_app_quit/u);
});

test("desktop shell close requests use a lease and fall back to fast quit", () => {
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
  assert.match(
    mainCloseBranchSource,
    /handle_main_window_close_requested\(app, &api\);/u,
  );
  assert.match(source, /fn handle_main_window_close_requested/u);
  assert.match(source, /handler_is_alive\(\)/u);
  assert.match(source, /api\.prevent_close\(\);/u);
  assert.match(source, /DESKTOP_MAIN_WINDOW_CLOSE_REQUESTED_EVENT/u);
  assert.match(source, /request_desktop_shutdown\(app\.clone\(\), DesktopShutdownAction::Exit\)/u);
  assert.doesNotMatch(source, /shutdown_desktop_runtime/u);

  const exitHandlingSource = source.slice(
    exitRequestedIndex,
    source.indexOf("tauri::RunEvent::Exit =>", exitRequestedIndex),
  );
  assert.match(exitHandlingSource, /observe_desktop_exit_requested/u);
  assert.doesNotMatch(exitHandlingSource, /terminate_tracked_backend_on_exit/u);
});

test("desktop shell restores the main window when the macOS dock icon reopens the app", () => {
  const source = readDesktopShellSource("src/main.rs");
  assert.match(
    source,
    /#\[cfg\(target_os = "macos"\)\]\s*tauri::RunEvent::Reopen \{ \.\. \} => \{\s*restore_main_window\(app\);\s*\}/u,
  );
});
