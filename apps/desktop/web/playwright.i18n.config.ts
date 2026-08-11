// SPDX-License-Identifier: GPL-3.0-only

import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webServerCommand = "node ./scripts/serve-i18n-smoke.mjs";
const smokePort = Number.parseInt(
  process.env.ZINUTO_I18N_SMOKE_PORT ??
    (process.env.npm_lifecycle_event === "test:i18n:smoke" ? "4274" : "4174"),
  10,
);
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;
const useExternalServer = process.env.ZINUTO_I18N_SMOKE_EXTERNAL_SERVER === "1";
const smokeTestTimeoutMs = Number.parseInt(
  process.env.ZINUTO_I18N_SMOKE_TEST_TIMEOUT_MS ?? "60000",
  10,
);
const smokeWorkers = Number.parseInt(
  process.env.ZINUTO_I18N_SMOKE_WORKERS ?? "4",
  10,
);

export default defineConfig({
  testDir: path.join(__dirname, "tests", "i18n"),
  timeout: Number.isFinite(smokeTestTimeoutMs) ? smokeTestTimeoutMs : 60_000,
  fullyParallel: true,
  reporter: "dot",
  workers: Number.isFinite(smokeWorkers) ? smokeWorkers : 4,
  use: {
    baseURL: smokeBaseUrl,
    trace: "on-first-retry",
  },
  webServer: useExternalServer
    ? undefined
    : {
        command: webServerCommand,
        cwd: __dirname,
        url: `${smokeBaseUrl}/i18n-harness.html`,
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
