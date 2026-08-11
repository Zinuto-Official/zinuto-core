// SPDX-License-Identifier: GPL-3.0-only

import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const perfPort = Number.parseInt(
  process.env.ZINUTO_HOT_INTERACTION_PERF_PORT ??
    (process.env.npm_lifecycle_event === "test:hot-interaction:perf"
      ? "4275"
      : "4175"),
  10,
);
const perfBaseUrl = `http://127.0.0.1:${perfPort}`;
const useExternalServer =
  process.env.ZINUTO_HOT_INTERACTION_PERF_EXTERNAL_SERVER === "1";

export default defineConfig({
  testDir: path.join(__dirname, "tests", "hot-interaction"),
  timeout: 60_000,
  fullyParallel: false,
  reporter: "dot",
  workers: 1,
  use: {
    baseURL: perfBaseUrl,
    trace: "on-first-retry",
  },
  webServer: useExternalServer
    ? undefined
    : {
        command: "node ./scripts/serve-i18n-smoke.mjs",
        cwd: __dirname,
        env: {
          ZINUTO_I18N_SMOKE_PORT: String(perfPort),
        },
        reuseExistingServer: false,
        timeout: 180_000,
        url: `${perfBaseUrl}/hot-interaction-perf.html`,
      },
});
