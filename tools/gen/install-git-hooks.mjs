#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../..");
const HOOKS_DIR = ".githooks";
const removeHooks = process.argv.includes("--remove");

if (process.env.ZINUTO_SKIP_GIT_HOOKS === "1") {
  console.log("[git-hooks] skipped by ZINUTO_SKIP_GIT_HOOKS=1");
  process.exit(0);
}

if (!fs.existsSync(path.join(ROOT_DIR, ".git"))) {
  console.log("[git-hooks] skipped: .git directory not found");
  process.exit(0);
}

if (removeHooks) {
  const current = spawnSync("git", ["config", "--get", "core.hooksPath"], {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });
  if (String(current.stdout ?? "").trim() !== HOOKS_DIR) {
    console.log("[git-hooks] unchanged: core.hooksPath is not managed by Zinuto");
    process.exit(0);
  }
}

const result = spawnSync(
  "git",
  removeHooks
    ? ["config", "--unset", "core.hooksPath"]
    : ["config", "core.hooksPath", HOOKS_DIR],
  {
  cwd: ROOT_DIR,
  encoding: "utf8",
  },
);

if (result.status !== 0) {
  const output = `${result.stderr ?? ""}${result.stdout ?? ""}`.trim();
  console.warn(`[git-hooks] unable to install hooks${output ? `: ${output}` : ""}`);
  process.exit(0);
}

console.log(
  removeHooks
    ? "[git-hooks] removed managed core.hooksPath"
    : `[git-hooks] core.hooksPath=${HOOKS_DIR}`,
);
