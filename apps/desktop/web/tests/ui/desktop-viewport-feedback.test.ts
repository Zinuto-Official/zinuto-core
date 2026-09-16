// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";
import { applyDesktopWebviewZoom } from "../../src/api/desktopViewport";

test("native resize during zoom settlement does not repeat the same zoom write", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const base = { designWidth: 1000, designHeight: 1000, minScale: 0.5, maxScale: 1 };
  let width = 800;
  const writes: number[] = [];
  let resized: ReturnType<typeof applyDesktopWebviewZoom> | undefined;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    setTimeout, clearTimeout,
    __TAURI_INTERNALS__: {
      metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
      invoke: async (command: string, args: { value?: number }) => {
        if (command === "plugin:window|inner_size") return { width, height: 1000 };
        if (command === "plugin:window|scale_factor") return 1;
        if (command === "plugin:webview|set_webview_zoom") {
          writes.push(args.value!);
          // Model the native callback before its command promise settles.
          // Bound the simulated callbacks so a regression fails an assertion.
          if (writes.length < 4) resized = applyDesktopWebviewZoom(base);
          return;
        }
        throw new Error(`Unexpected native command: ${command}`);
      },
    },
  } });
  try {
    await applyDesktopWebviewZoom(base);
    await resized;
    assert.equal(writes.length, 1);
    await applyDesktopWebviewZoom(base);
    assert.equal(writes.length, 1);
    width = 700;
    await applyDesktopWebviewZoom(base);
    const changed = await resized;
    assert.equal(writes.length, 2);
    assert.equal(changed?.scale, 0.7);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
