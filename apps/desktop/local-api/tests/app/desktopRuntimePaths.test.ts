// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveDesktopAppDataDir } from "../../src/runtime/desktopRuntime.js";

test("Windows desktop app data resolves to LOCALAPPDATA instead of Roaming", () => {
  const resolved = resolveDesktopAppDataDir({
    env: {
      USERPROFILE: "C:\\Users\\trader",
      APPDATA: "C:\\Users\\trader\\AppData\\Roaming",
      LOCALAPPDATA: "C:\\Users\\trader\\AppData\\Local",
    } as NodeJS.ProcessEnv,
    platform: "win32",
    homeDir: "C:\\Users\\trader",
  });

  assert.equal(
    resolved,
    path.join(
      "C:\\Users\\trader\\AppData\\Local",
      "org.zinuto.core",
    ),
  );
});

test("desktop app data always uses the community bundle identifier", () => {
  const resolved = resolveDesktopAppDataDir({
    env: {
      USERPROFILE: "C:\\Users\\trader",
      LOCALAPPDATA: "C:\\Users\\trader\\AppData\\Local",
    } as NodeJS.ProcessEnv,
    platform: "win32",
    homeDir: "C:\\Users\\trader",
  });

  assert.equal(
    resolved,
    path.join(
      "C:\\Users\\trader\\AppData\\Local",
      "org.zinuto.core",
    ),
  );
});
