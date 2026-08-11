// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  formatCommand,
  resolveQualityPlan,
  resolveSpawnInvocation,
} from "./run-quality-for-impact.mjs";
import { PRODUCT_LANES, ROOT_DIR } from "./repo-governance.mjs";

const commandTexts = (files, tier = "affected", options = {}) =>
  resolveQualityPlan(files, tier, options).commands.map(formatCommand);

const SCRIPT_PATH = fileURLToPath(
  new URL("./run-quality-for-impact.mjs", import.meta.url),
);
const runCli = (args) =>
  spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });

const CURRENT_LANE_COMMANDS = [
  "npm run quality:desktop-app",
  "npm run quality:shared-contracts",
  "npm run quality:governance",
];

test("quality routing is backed by the three public Core lanes", () => {
  assert.deepEqual(
    PRODUCT_LANES.map(({ id, requiredChecks }) => ({ id, requiredChecks })),
    [
      { id: "desktop-app", requiredChecks: ["npm run quality:desktop-app"] },
      {
        id: "shared-contracts",
        requiredChecks: ["npm run quality:shared-contracts"],
      },
      { id: "governance", requiredChecks: ["npm run quality:governance"] },
    ],
  );
});

test("a fresh public root commit maps every repository-level input", () => {
  const plan = resolveQualityPlan([
    ".editorconfig",
    "contributors/cla-signatures.json",
  ]);
  assert.deepEqual(plan.impact.unmappedFiles, []);
  assert.deepEqual(plan.impact.impactedLaneIds, [
    "desktop-app",
    "shared-contracts",
    "governance",
  ]);
  assert.deepEqual(plan.impact.governanceFiles, [
    "contributors/cla-signatures.json",
  ]);
});

test("affected tier skips ordinary docs and validates governance changes", () => {
  assert.deepEqual(commandTexts(["docs/change-impact.md"]), []);
  assert.deepEqual(commandTexts(["README.zh-CN.md", "CODE_OF_CONDUCT.md"]), []);
  assert.deepEqual(commandTexts([".gitleaks.toml", ".gitleaksignore"]), []);
  assert.deepEqual(
    commandTexts(["tools/quality/run-quality-for-impact.mjs"]),
    ["npm run test:governance"],
  );
  assert.deepEqual(
    commandTexts(["tools/quality/architecture-import-boundaries.mjs"]),
    ["npm run check:architecture", "npm run test:governance"],
  );
});

test("every tracked Git hook, including pre-push, selects governance", () => {
  for (const hookPath of [".githooks/pre-commit", ".githooks/pre-push", ".githooks/future-hook"]) {
    assert.deepEqual(commandTexts([hookPath]), ["npm run test:governance"]);
  }
});

test("documentation governance inputs are mapped to a product lane or governance", () => {
  const plan = resolveQualityPlan([
    "documentation-manifest.json",
    "docs/registry/agent-scopes.json",
    "tools/docs/docs-check.test.mjs",
  ]);
  assert.deepEqual(plan.impact.unmappedFiles, []);
  assert.deepEqual(plan.impact.impactedLaneIds, ["governance"]);
  assert.deepEqual(plan.impact.governanceFiles, ["documentation-manifest.json"]);
});

test("affected desktop-web source uses one shared build and targeted checks", () => {
  assert.deepEqual(commandTexts(["apps/desktop/web/src/App.tsx"]), [
    "npm run build --workspace=@zinuto/shared",
    "npm run typecheck:workspace --workspace=@zinuto/desktop-web",
    "npm run check:architecture -- --files apps/desktop/web/src/App.tsx",
    "npm run check:repo-structure:workspace -- --files apps/desktop/web/src/App.tsx",
    "npm run check:pure-presentation --workspace=@zinuto/desktop-web",
    "npm run check:text --workspace=@zinuto/desktop-web",
  ]);
});

test("fast tier keeps source and changed-test checks file scoped", () => {
  assert.deepEqual(commandTexts(["apps/desktop/web/src/App.tsx"], "fast"), [
    "npm run check:architecture -- --files apps/desktop/web/src/App.tsx --skip-reachability",
    "npm run check:repo-structure:workspace -- --files apps/desktop/web/src/App.tsx",
    "npm run check:pure-presentation --workspace=@zinuto/desktop-web -- --files apps/desktop/web/src/App.tsx",
    "npm run check:text:literals --workspace=@zinuto/desktop-web -- --files apps/desktop/web/src/App.tsx",
    "npm run check:dynamic-panel-keys --workspace=@zinuto/desktop-web -- --files apps/desktop/web/src/App.tsx",
  ]);
  assert.deepEqual(
    commandTexts(
      ["apps/desktop/web/tests/trainer/free-replay-prep-defaults.test.ts"],
      "fast",
    ),
    [
      "npm run test:file --workspace=@zinuto/desktop-web -- tests/trainer/free-replay-prep-defaults.test.ts",
    ],
  );
});

test("affected local data-source changes avoid generated-runtime validation", () => {
  const commands = commandTexts([
    "apps/desktop/local-api/src/application/dataSource/csvPreviewUtils.ts",
  ]);
  assert.deepEqual(commands, [
    "npm run build --workspace=@zinuto/shared",
    "npm run check:architecture -- --files apps/desktop/local-api/src/application/dataSource/csvPreviewUtils.ts",
    "npm run check:repo-structure:workspace -- --files apps/desktop/local-api/src/application/dataSource/csvPreviewUtils.ts",
    "npm run typecheck:workspace --workspace=@zinuto/desktop-local-api",
    "npm run test:data-source:workspace --workspace=@zinuto/desktop-local-api",
    "npm run check:input-limits",
  ]);
  assert.doesNotMatch(commands.join("\n"), /desktop:runtime/u);
});

test("backtest engine changes run only targeted Rust gates", () => {
  const sourcePath = "apps/desktop/backtest-engine/src/lib.rs";
  assert.deepEqual(commandTexts([sourcePath], "fast"), [
    "npm run desktop:backtest-engine:format",
    `npm run check:repo-structure:workspace -- --files ${sourcePath}`,
  ]);
  assert.deepEqual(commandTexts([sourcePath]), [
    `npm run check:repo-structure:workspace -- --files ${sourcePath}`,
    "npm run desktop:backtest-engine:check",
  ]);

  for (const path of [
    "apps/desktop/backtest-engine/Cargo.toml",
    "apps/desktop/backtest-engine/Cargo.lock",
  ]) {
    assert.deepEqual(commandTexts([path], "fast"), [
      "npm run desktop:backtest-engine:format",
    ]);
    assert.deepEqual(commandTexts([path]), [
      "npm run desktop:backtest-engine:check",
    ]);
  }

  const commands = commandTexts([sourcePath]).join("\n");
  assert.doesNotMatch(commands, /quality:desktop-app|check:full|desktop:runtime/u);
});

test("desktop shell source and packaging changes use different gates", () => {
  const runtimeSource = "apps/desktop/shell/src/runtime/backend_runtime.rs";
  assert.deepEqual(commandTexts([runtimeSource], "fast"), [
    "npm run desktop:shell:format",
    `npm run check:repo-structure:workspace -- --files ${runtimeSource}`,
  ]);
  assert.deepEqual(commandTexts([runtimeSource]), [
    `npm run check:repo-structure:workspace -- --files ${runtimeSource}`,
    "npm run desktop:shell:test",
  ]);

  const bridgeSource = "apps/desktop/shell/src/bridge/transport.rs";
  assert.deepEqual(commandTexts([bridgeSource]), [
    `npm run check:repo-structure:workspace -- --files ${bridgeSource}`,
    "npm run desktop:shell:test",
  ]);

  for (const source of [
    "apps/desktop/shell/src/bridge/chunked_body_decoder.rs",
    "apps/desktop/shell/src/acquisition/market_data_acquisition_output.rs",
    "apps/desktop/shell/src/platform/macos.rs",
  ]) {
    assert.match(commandTexts([source]).join("\n"), /npm run desktop:shell:test/u, source);
  }

  for (const buildInput of [
    "apps/desktop/shell/build.rs",
    "apps/desktop/shell/Cargo.toml",
    "apps/desktop/shell/tauri.conf.json",
    "tools/release/prepare-tauri-dev.mjs",
  ]) {
    assert.match(
      commandTexts([buildInput]).join("\n"),
      /desktop:runtime:check:dev/u,
      buildInput,
    );
  }

  const sourceCommands = commandTexts([runtimeSource]).join("\n");
  assert.doesNotMatch(sourceCommands, /desktop:runtime:check:dev|quality:desktop-app|check:full/u);
});

test("native runtime authority and transaction modules select the runtime gate", () => {
  for (const runtimePath of [
    "config/open-source/node-runtime-authority.json",
    "tools/release/native-runtime-authority.mjs",
    "tools/release/native-runtime-archive.mjs",
    "tools/release/native-runtime-download.mjs",
    "tools/release/native-runtime-transaction.mjs",
  ]) {
    assert.match(
      commandTexts([runtimePath]).join("\n"),
      /npm run desktop:runtime:check:dev/u,
      runtimePath,
    );
  }
});

test("runtime composition and native bridge changes retain runtime guards", () => {
  assert.deepEqual(
    commandTexts(["apps/desktop/local-api/src/runtime/compositionRoot.ts"]),
    [
      "npm run build --workspace=@zinuto/shared",
      "npm run check:architecture -- --files apps/desktop/local-api/src/runtime/compositionRoot.ts",
      "npm run check:repo-structure:workspace -- --files apps/desktop/local-api/src/runtime/compositionRoot.ts",
      "npm run typecheck:workspace --workspace=@zinuto/desktop-local-api",
      "npm run test:app:workspace --workspace=@zinuto/desktop-local-api",
      "npm run desktop:runtime:check:dev",
    ],
  );
  assert.deepEqual(
    commandTexts(["contracts/native-bridge/native-bridge.v1.json"]),
    [
      "npm run contract:check",
      "npm run check:input-limits",
      "npm run desktop:runtime:check:dev",
    ],
  );
});

test("root configuration expands affected scope while fast checks the toolchain", () => {
  assert.deepEqual(commandTexts(["package.json"]), [
    "npm run check:architecture",
    "npm run check:repo-structure",
    ...CURRENT_LANE_COMMANDS,
    "npm run desktop:runtime:check:dev",
  ]);
  assert.deepEqual(commandTexts(["package.json"], "fast"), [
    "npm run check:node-version",
  ]);
});

test("full tier runs every host-supported lane", () => {
  const expected = [
    "npm run check:node-version",
    "npm run check:test-discovery",
    "npm run check:public-repo:workspace",
    "npm run docs:check:workspace",
    "npm run check:agents-rules",
    "npm run license:audit",
    "npm run test:governance:workspace",
    "npm run check:input-limits:workspace",
    "npm run check:architecture:workspace",
    "npm run check:repo-structure:workspace",
    "npm run security:audit:rust",
    "npm run desktop:runtime:check:build",
    "npm run desktop:shell:test",
    "npm run desktop:backtest-engine:check",
    "npm run contract:check:workspace",
    "npm run build:workspace --workspace=@zinuto/shared",
    "npm run typecheck:workspace --workspace=@zinuto/shared",
    "npm run test:suggestions:workspace --workspace=@zinuto/shared",
    "npm run typecheck:workspace --workspace=@zinuto/desktop-local-api",
    "npm run typecheck:workspace --workspace=@zinuto/desktop-web",
    "npm run check:static:local --workspace=@zinuto/desktop-web",
    "npm run build:artifact:workspace --workspace=@zinuto/desktop-web",
    "npm run test:all:workspace --workspace=@zinuto/desktop-local-api",
    "npm run test:workspace --workspace=@zinuto/desktop-web",
    "npm run security:audit:prod:workspace",
  ];
  for (const platform of ["darwin", "win32", "linux"]) {
    assert.deepEqual(commandTexts([], "full", { platform }), expected, platform);
  }
});

test("only fast, affected, and full are accepted tiers", () => {
  for (const removedTier of ["focus", "strict", "lane", "changed"]) {
    assert.throws(
      () => resolveQualityPlan(["apps/desktop/web/src/App.tsx"], removedTier),
      /Unknown quality tier/u,
    );
  }
});

test("generated outputs never enter impact routing", () => {
  const plan = resolveQualityPlan([
    ".playwright-cli/generated-output/example.png",
    "logs/generated-output/example.log",
    "output/generated-output/example.png",
    "test-results/.last-run.json",
    "tmp/generated-output/example.html",
  ]);
  assert.deepEqual(plan.impact.changedFiles, []);
  assert.deepEqual(plan.commands, []);
});

test("Windows npm command files run through cmd with quoted paths", () => {
  assert.deepEqual(
    resolveSpawnInvocation(
      {
        bin: "npm.cmd",
        args: [
          "run",
          "check:affected",
          "--",
          "--files",
          "apps/desktop/web/src/My File.ts",
        ],
      },
      "win32",
      { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
    ),
    {
      bin: "C:\\Windows\\System32\\cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        'npm.cmd run check:affected -- --files "apps/desktop/web/src/My File.ts"',
      ],
    },
  );
});

test("affected CLI requires explicit scope and fast dry-run executes nothing", () => {
  const missingScope = runCli(["--tier", "affected"]);
  assert.equal(missingScope.status, 2);
  assert.match(
    missingScope.stdout,
    /Affected tier requires an explicit change scope/u,
  );
  assert.doesNotMatch(missingScope.stdout, /^\$ /mu);

  const dryRun = runCli([
    "--tier",
    "fast",
    "--files",
    "apps/desktop/web/src/App.tsx",
    "--cache",
    "--dry-run",
  ]);
  assert.equal(dryRun.status, 0);
  assert.match(dryRun.stdout, /Quality cache:/u);
  assert.doesNotMatch(dryRun.stdout, /^\$ /mu);
});
