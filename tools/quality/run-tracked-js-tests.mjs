#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const trackedPaths = () =>
  execFileSync("git", ["ls-files", "-z"], {
    cwd: ROOT_DIR,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "en"));

const isJsTest = (filePath) => /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(filePath);

const classifyTrackedTests = (paths) => {
  const suites = {
    governance: [],
    "local-api": [],
    shared: [],
    "web-browser": [],
    "web-unit": [],
    "rust-integration": [],
  };
  const unclassified = [];

  for (const filePath of paths) {
    if (filePath.startsWith("tools/") && filePath.endsWith(".test.mjs")) {
      suites.governance.push(filePath);
    } else if (
      filePath.startsWith("apps/desktop/local-api/tests/") &&
      filePath.endsWith(".test.ts")
    ) {
      suites["local-api"].push(filePath);
    } else if (
      filePath.startsWith("packages/shared/") &&
      filePath.endsWith(".test.ts")
    ) {
      suites.shared.push(filePath);
    } else if (
      filePath.startsWith("apps/desktop/web/tests/") &&
      filePath.endsWith(".spec.ts")
    ) {
      suites["web-browser"].push(filePath);
    } else if (
      filePath.startsWith("apps/desktop/web/tests/") &&
      /\.test\.tsx?$/u.test(filePath)
    ) {
      suites["web-unit"].push(filePath);
    } else if (
      (
        filePath.startsWith("apps/desktop/backtest-engine/tests/") ||
        filePath.startsWith("apps/desktop/shell/tests/")
      ) &&
      filePath.endsWith(".rs")
    ) {
      suites["rust-integration"].push(filePath);
    } else if (isJsTest(filePath) || /(?:^|\/)tests\/.*\.rs$/u.test(filePath)) {
      unclassified.push(filePath);
    }
  }

  return { suites, unclassified };
};

export const discoverTrackedTests = () => classifyTrackedTests(trackedPaths());

const failForDiscoveryDrift = ({ suites, unclassified }) => {
  if (unclassified.length > 0) {
    throw new Error(
      `Tracked tests lack an execution suite:\n${unclassified.map((entry) => `- ${entry}`).join("\n")}`,
    );
  }
  for (const [suite, files] of Object.entries(suites)) {
    if (files.length === 0) {
      throw new Error(`Tracked test suite ${suite} unexpectedly contains no files.`);
    }
  }
};

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const main = () => {
  const suiteArg = process.argv.find((arg) => arg.startsWith("--suite="));
  const discovered = discoverTrackedTests();
  failForDiscoveryDrift(discovered);

  if (!suiteArg) {
    const summary = Object.fromEntries(
      Object.entries(discovered.suites).map(([suite, files]) => [suite, files.length]),
    );
    console.log(`Tracked test discovery PASS ${JSON.stringify(summary)}`);
    return;
  }

  const suite = suiteArg.slice("--suite=".length);
  const files = discovered.suites[suite];
  if (!files || suite === "web-browser" || suite === "rust-integration") {
    throw new Error(`Suite ${suite} is not a JavaScript runner suite.`);
  }

  const workspaceFiles = files.map((filePath) => {
    if (suite === "local-api") {
      return path.relative(path.join(ROOT_DIR, "apps/desktop/local-api"), path.join(ROOT_DIR, filePath));
    }
    if (suite === "web-unit") {
      return path.relative(path.join(ROOT_DIR, "apps/desktop/web"), path.join(ROOT_DIR, filePath));
    }
    if (suite === "shared") {
      return path.relative(path.join(ROOT_DIR, "packages/shared"), path.join(ROOT_DIR, filePath));
    }
    return filePath;
  });

  if (suite === "governance") {
    run(process.execPath, ["--test", ...workspaceFiles]);
    return;
  }

  const tsxCli = path.join(ROOT_DIR, "node_modules", "tsx", "dist", "cli.mjs");
  const args = [tsxCli, "--test"];
  if (suite === "local-api") {
    args.push("--test-concurrency=1");
  }
  args.push(...workspaceFiles);
  const cwd =
    suite === "local-api"
      ? path.join(ROOT_DIR, "apps/desktop/local-api")
      : suite === "web-unit"
        ? path.join(ROOT_DIR, "apps/desktop/web")
        : path.join(ROOT_DIR, "packages/shared");
  const result = spawnSync(process.execPath, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    throw result.error;
  }
  process.exit(result.status ?? 1);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
