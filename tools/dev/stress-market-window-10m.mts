// SPDX-License-Identifier: GPL-3.0-only

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const tsxBin = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);
const stressScript = path.join(
  projectRoot,
  "apps",
  "desktop",
  "local-api",
  "scripts",
  "stress-market-window-10m.mts",
);

const result = spawnSync(tsxBin, [stressScript, ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: process.env,
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
