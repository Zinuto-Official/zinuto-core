#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ARCHITECTURE_MAX_FILE_LINES } from "../quality/architecture-guard-config.mjs";
import { SUPPORTED_SCAFFOLDS } from "./scaffold-core.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../..");
const PRODUCT_LANES_PATH = path.join(ROOT_DIR, "docs/registry/product-lanes.json");
const AGENT_SCOPES_PATH = path.join(ROOT_DIR, "docs/registry/agent-scopes.json");

export const GENERATED_RULES_START = "<!-- AI-GENERATED-RULES:START -->";
export const GENERATED_RULES_END = "<!-- AI-GENERATED-RULES:END -->";

const readProductLanes = () => {
  const registry = JSON.parse(fs.readFileSync(PRODUCT_LANES_PATH, "utf8"));
  return new Map((registry.lanes ?? []).map((lane) => [lane.id, lane]));
};

export const readAgentScopes = () => {
  const registry = JSON.parse(fs.readFileSync(AGENT_SCOPES_PATH, "utf8"));
  if (registry.version !== 1 || !Array.isArray(registry.scopes) || registry.scopes.length === 0) {
    throw new Error("docs/registry/agent-scopes.json must use version 1 and contain scopes.");
  }
  return registry.scopes;
};

const budgetSummary = () => [
  `page ${ARCHITECTURE_MAX_FILE_LINES.page}`,
  `hook/view-model ${ARCHITECTURE_MAX_FILE_LINES.hookOrViewModel}`,
  `application ${ARCHITECTURE_MAX_FILE_LINES.applicationModule}`,
  `service/store ${ARCHITECTURE_MAX_FILE_LINES.serviceOrStore}`,
  `router ${ARCHITECTURE_MAX_FILE_LINES.router}`,
  `css ${ARCHITECTURE_MAX_FILE_LINES.css}`,
].join("; ");

const formatGenerators = (generators) => (
  generators.length > 0
    ? generators.map((name) => `\`npm run ${name}\``).join(", ")
    : "none"
);

export const validateAgentScopes = (scopes = readAgentScopes(), lanes = readProductLanes()) => {
  const failures = [];
  const paths = scopes.map((scope) => scope.path);
  if (new Set(paths).size !== paths.length) failures.push("agent scope paths must be unique");
  for (const scope of scopes) {
    if (!lanes.has(scope.laneId)) {
      failures.push(`agent scope ${scope.path} references missing lane ${scope.laneId}`);
    }
    if (scope.path !== ".") {
      if (!fs.existsSync(path.join(ROOT_DIR, scope.path))) {
        failures.push(`agent scope path does not exist: ${scope.path}`);
      } else {
        const trackedFiles = execFileSync("git", ["-C", ROOT_DIR, "ls-files", "--", scope.path], {
          encoding: "utf8",
        }).trim();
        if (!trackedFiles) failures.push(`agent scope path contains no tracked files: ${scope.path}`);
      }
    }
    if (!Array.isArray(scope.generators) || typeof scope.rule !== "string") {
      failures.push(`agent scope is incomplete: ${scope.path}`);
    }
  }
  return failures;
};

export const buildExpectedAgentBlock = (
  scopes = readAgentScopes(),
  lanes = readProductLanes(),
) => {
  const rows = scopes.map((scope) => {
    const lane = lanes.get(scope.laneId);
    return `| \`${scope.path}\` | ${scope.label} | \`${scope.laneId}\` | ${
      (lane?.requiredChecks ?? []).map((command) => `\`${command}\``).join("; ") || "none"
    } | ${formatGenerators(scope.generators)} |`;
  });
  const rules = scopes.map((scope) => `- \`${scope.path}\`: ${scope.rule}`);
  return [
    GENERATED_RULES_START,
    "## Path rules (generated)",
    "",
    "`docs/registry/agent-scopes.json` owns path routing. `docs/registry/product-lanes.json` owns quality gates. `tools/quality/architecture-guard-config.mjs` owns file budgets. `npm run check:agents-rules` rejects drift.",
    "",
    "| Path | Scope | Lane | Required gate | Generators |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    ...rules,
    "",
    `File budgets: ${budgetSummary()}. Split by responsibility before crossing a budget. Do not add compatibility aliases to avoid a proper contract or migration.`,
    "",
    "During editing, run `npm run check:fast -- --files <changed-files...>`. Before handoff, run `npm run check:affected -- --files <changed-files...>`. Before release, run `npm run check:full`.",
    GENERATED_RULES_END,
  ].join("\n");
};

export const buildExpectedAgentBlocks = () => new Map([
  ["AGENTS.md", buildExpectedAgentBlock()],
]);

const replaceOrInsertGeneratedBlock = (source, expectedBlock) => {
  const blockPattern = new RegExp(
    `${GENERATED_RULES_START.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}[\\s\\S]*?${GENERATED_RULES_END.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`,
    "u",
  );
  if (blockPattern.test(source)) return source.replace(blockPattern, expectedBlock);
  return `${source.trimEnd()}\n\n${expectedBlock}\n`;
};

const checkPackageScriptRules = () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  const scripts = packageJson.scripts ?? {};
  const failures = [];
  const requiredScripts = {
    "check:fast": ["run-quality-for-impact.mjs", "--tier fast", "--cache"],
    "check:affected": [
      "run-quality-for-impact.mjs",
      "--tier affected",
      "--cache",
      "--incremental-typecheck",
    ],
    "check:full": ["run-quality-for-impact.mjs", "--tier full", "--no-cache"],
    "check:agents-rules": ["tools/gen/agents-rules.mjs", "--check"],
  };
  for (const [scriptName, requiredFragments] of Object.entries(requiredScripts)) {
    const script = String(scripts[scriptName] ?? "");
    if (!script) {
      failures.push(`package.json script ${scriptName} is missing.`);
      continue;
    }
    for (const fragment of requiredFragments) {
      if (!script.includes(fragment)) {
        failures.push(`package.json script ${scriptName} must include ${fragment}.`);
      }
    }
  }
  for (const scaffold of SUPPORTED_SCAFFOLDS) {
    const scriptName = `new:${scaffold}`;
    const script = String(scripts[scriptName] ?? "");
    if (!script.includes(`tools/gen/index.mjs ${scaffold}`)) {
      failures.push(`package.json script ${scriptName} must call tools/gen/index.mjs ${scaffold}.`);
    }
  }
  return failures;
};

export const checkAgentsRules = ({ write = false } = {}) => {
  const expectedBlocks = buildExpectedAgentBlocks();
  const failures = validateAgentScopes();
  const updated = [];
  for (const [relativePath, expectedBlock] of expectedBlocks) {
    const absolutePath = path.join(ROOT_DIR, relativePath);
    if (!fs.existsSync(absolutePath)) {
      failures.push(`${relativePath} is missing.`);
      continue;
    }
    const source = fs.readFileSync(absolutePath, "utf8");
    const nextSource = replaceOrInsertGeneratedBlock(source, expectedBlock);
    if (source !== nextSource) {
      if (write) {
        fs.writeFileSync(absolutePath, nextSource, "utf8");
        updated.push(relativePath);
      } else {
        failures.push(`${relativePath} generated path rules are out of sync.`);
      }
    }
  }
  for (const scope of readAgentScopes().filter((entry) => entry.path !== ".")) {
    const legacyPath = path.join(ROOT_DIR, scope.path, "AGENTS.md");
    if (fs.existsSync(legacyPath)) {
      failures.push(`${toPosix(path.relative(ROOT_DIR, legacyPath))} duplicates the root path registry.`);
    }
  }
  failures.push(...checkPackageScriptRules());
  return { failures, updated };
};

const toPosix = (value) => value.split(path.sep).join("/");

const main = () => {
  const args = new Set(process.argv.slice(2));
  const write = args.has("--write");
  const result = checkAgentsRules({ write });
  if (result.failures.length > 0) {
    console.error("[agents-rules] generated path rules are out of sync:");
    for (const failure of result.failures) console.error(`- ${failure}`);
    console.error("Run: node ./tools/gen/agents-rules.mjs --write");
    process.exit(1);
  }
  if (write) {
    console.log(`[agents-rules] updated ${result.updated.length} AGENTS.md file(s).`);
    return;
  }
  console.log("[agents-rules] root AGENTS.md matches the path registry.");
};

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) main();
