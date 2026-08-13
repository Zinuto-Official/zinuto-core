// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createDesktopWindowChromeAdapter,
  resolveDesktopWindowChromePlatform,
} from "../../src/api/desktopWindowChrome";

const readSource = (relativePath: string): string =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");

test("desktop window chrome platform detection is explicit and deterministic", () => {
  assert.equal(
    resolveDesktopWindowChromePlatform({
      platform: "Win32",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    }),
    "windows",
  );
  assert.equal(
    resolveDesktopWindowChromePlatform({ platform: "MacIntel" }),
    "macos",
  );
  assert.equal(
    resolveDesktopWindowChromePlatform({ platform: "Linux x86_64" }),
    "unknown",
  );
});

test("desktop window chrome adapter routes controls and publishes maximize state", async () => {
  const calls: string[] = [];
  let maximized = false;
  let resizeListener: () => void = () => undefined;
  let resizeUnlistenCount = 0;
  const adapter = createDesktopWindowChromeAdapter(async () => ({
    close: async () => {
      calls.push("close");
    },
    isMaximized: async () => maximized,
    minimize: async () => {
      calls.push("minimize");
    },
    onResized: async (listener) => {
      resizeListener = listener;
      return () => {
        resizeUnlistenCount += 1;
      };
    },
    setTheme: async (theme) => {
      calls.push(`theme:${theme}`);
    },
    toggleMaximize: async () => {
      calls.push("toggle-maximize");
    },
  }));

  await adapter.minimize();
  await adapter.toggleMaximize();
  await adapter.setTheme("dark");
  await adapter.close();
  assert.deepEqual(calls, [
    "minimize",
    "toggle-maximize",
    "theme:dark",
    "close",
  ]);

  const states: boolean[] = [];
  const unlisten = await adapter.subscribeMaximized((value) => {
    states.push(value);
  });
  assert.deepEqual(states, [false]);
  maximized = true;
  resizeListener();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(states, [false, true]);
  unlisten();
  unlisten();
  assert.equal(resizeUnlistenCount, 1);
});

test("Windows main window removes native decorations before first display", () => {
  const shellSource = readSource("../shell/src/main.rs");
  const prepareStart = shellSource.indexOf(
    "fn prepare_main_window_for_display(window: &tauri::WebviewWindow)",
  );
  const fallbackStart = shellSource.indexOf(
    "fn schedule_main_window_display_fallback",
    prepareStart,
  );
  assert.notEqual(prepareStart, -1);
  assert.notEqual(fallbackStart, -1);
  const prepareSource = shellSource.slice(prepareStart, fallbackStart);
  assert.match(prepareSource, /#\[cfg\(windows\)\]/u);
  assert.match(prepareSource, /window\.set_decorations\(false\)/u);
  assert.match(prepareSource, /window\.set_shadow\(true\)/u);
  assert.ok(
    shellSource.indexOf("prepare_main_window_for_display(&window)") <
      shellSource.indexOf("schedule_main_window_display_fallback(app.handle())"),
  );
});

test("custom chrome uses theme tokens and complete accessible window controls", () => {
  const componentSource = readSource(
    "src/ui/components/DesktopWindowChrome.tsx",
  );
  const styleSource = readSource(
    "src/styles/components/desktop-window-chrome.css",
  );
  assert.match(componentSource, /desktop\.windowChrome\.minimize/u);
  assert.match(componentSource, /desktop\.windowChrome\.maximize/u);
  assert.match(componentSource, /desktop\.windowChrome\.restore/u);
  assert.match(componentSource, /desktop\.windowChrome\.close/u);
  assert.match(componentSource, /aria-label=\{maximizeLabel\}/u);
  assert.match(componentSource, /subscribeCurrentDesktopWindowMaximized/u);
  assert.match(componentSource, /syncCurrentDesktopWindowTheme\(theme\)/u);
  assert.match(styleSource, /--desktop-window-chrome-height:\s*40px/u);
  assert.match(styleSource, /width:\s*46px/u);
  assert.match(styleSource, /var\(--theme-shell-toolbar/u);
  assert.match(styleSource, /background:\s*var\(--theme-canvas/u);
  assert.match(styleSource, /var\(--theme-hover/u);
  assert.match(styleSource, /rgb\(var\(--color-danger\)\)/u);
  assert.match(styleSource, /@media \(forced-colors: active\)/u);
});

test("main, boot, fatal, and secondary surfaces all mount custom chrome", () => {
  const mainShellSource = readSource("src/app-shell/AppRootDesktopShell.tsx");
  const bootSource = readSource("src/app-shell/AppRootBootShell.tsx");
  const mainAppSource = readSource("src/app-shell/mainApp.ts");
  const secondarySource = readSource(
    "src/app-shell/secondaryWindows/DesktopSecondaryWindowRoot.tsx",
  );
  for (const source of [
    mainShellSource,
    bootSource,
    mainAppSource,
    secondarySource,
  ]) {
    assert.match(source, /DesktopWindowChrome/u);
    assert.match(source, /data-zinuto-window-chrome/u);
  }
  assert.match(
    bootSource,
    /presentationMode === "root" && customWindowChromeEnabled/u,
  );
  assert.match(secondarySource, /state\?\.title\?\.trim\(\)/u);
});

test("window permissions cover theme, state, and all control actions", () => {
  const capabilities = JSON.parse(
    readSource("../shell/capabilities/default.json"),
  ) as { permissions: string[] };
  for (const permission of [
    "core:window:allow-close",
    "core:window:allow-is-maximized",
    "core:window:allow-minimize",
    "core:window:allow-set-theme",
    "core:window:allow-start-dragging",
    "core:window:allow-toggle-maximize",
  ]) {
    assert.ok(capabilities.permissions.includes(permission), permission);
  }
});
