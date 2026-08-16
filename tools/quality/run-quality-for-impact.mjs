#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ROOT_DIR,
  PRODUCT_LANES,
  computeChangeImpact,
  formatChangeImpactReport,
  normalizeRepoPath,
} from "./repo-governance.mjs";

const NPM_BIN = process.platform === "win32" ? "npm.cmd" : "npm";
const AFFECTED_SCOPE_REQUIRED_EXIT_CODE = 2;
const QUALITY_CACHE_VERSION = 1;
const QUALITY_CACHE_PATH = path.join(ROOT_DIR, ".cache", "quality", "impact-cache.json");

const shouldUseWindowsCommandShell = (command, platform = process.platform) =>
  platform === "win32" && /\.(cmd|bat)$/i.test(path.basename(String(command || "")));

const quoteWindowsCommandArg = (value) => {
  const text = String(value ?? "");
  if (!text.length) {
    return '""';
  }
  if (!/[\s"&()<>^|]/.test(text)) {
    return text;
  }
  return `"${text.replace(/(["^&|<>()])/g, "^$1")}"`;
};

export const resolveSpawnInvocation = (
  command,
  platform = process.platform,
  env = process.env,
) => {
  if (!shouldUseWindowsCommandShell(command.bin, platform)) {
    return { bin: command.bin, args: command.args };
  }

  return {
    bin: env.ComSpec || "cmd.exe",
    args: [
      "/d",
      "/s",
      "/c",
      [
        quoteWindowsCommandArg(command.bin),
        ...command.args.map((arg) => quoteWindowsCommandArg(arg)),
      ].join(" "),
    ],
  };
};

const COMMON_ROOT_PATHS = new Set([
  ".nvmrc",
  ".gitignore",
  "package.json",
  "package-lock.json",
  "tsconfig.base.json",
]);

const DESKTOP_RUNTIME_SCRIPT_PATHS = new Set([
  "config/open-source/node-runtime-authority.json",
  "tools/release/desktop-command-utils.mjs",
  "tools/release/desktop-runtime-layout.mjs",
  "tools/release/ensure-native-runtime.mjs",
  "tools/release/ensure-tauri-build-inputs.mjs",
  "tools/release/install-native-runtime.mjs",
  "tools/release/native-runtime-archive.mjs",
  "tools/release/native-runtime-authority.mjs",
  "tools/release/native-runtime-authority.test.mjs",
  "tools/release/native-runtime-download.mjs",
  "tools/release/native-runtime-download.test.mjs",
  "tools/release/native-runtime-transaction.mjs",
  "tools/release/native-runtime-transaction.test.mjs",
  "tools/release/prepare-backend-runtime-bundle.mjs",
  "tools/release/prepare-backtest-engine.mjs",
  "tools/release/prepare-node-runtime-libs.mjs",
  "tools/release/prepare-tauri-build.mjs",
  "tools/release/prepare-tauri-dev.mjs",
  "tools/release/rebuild-runtime-native-modules.mjs",
  "tools/release/run-frontend-tauri-dev.mjs",
  "tools/release/run-tauri-desktop.mjs",
  "tools/release/validate-native-runtime.mjs",
  "tools/release/validate-windows-nsis-installer.mjs",
]);

const DESKTOP_WEB_ARTIFACT_RISK_PATHS = new Set([
  "apps/desktop/web/package.json",
  "apps/desktop/web/vite.config.ts",
  "apps/desktop/web/scripts/check-main-bundle-budget.mjs",
  "apps/desktop/web/scripts/check-popup-bundle-budget.mjs",
  "apps/desktop/web/scripts/check-popup-manifest.mjs",
  "apps/desktop/web/scripts/popup-manifest-rules.mjs",
  "apps/desktop/web/src/styles/secondary-window.css",
]);

const DESKTOP_WEB_NATIVE_BRIDGE_RISK_PATHS = new Set([
  "apps/desktop/web/src/api/desktopNativeBridge.ts",
  "apps/desktop/web/src/api/desktopNativeCommands.ts",
  "apps/desktop/web/src/api/desktopSecondaryWindows.ts",
  "apps/desktop/web/src/api/desktopViewport.ts",
  "apps/desktop/web/src/api/index.ts",
  "apps/desktop/web/src/app-shell/useWindowChromeDrag.ts",
  "apps/desktop/web/src/domains/data-import/nativeImportHelpers.ts",
]);

const BACKTEST_ENGINE_ROOT = "apps/desktop/backtest-engine/";
const BACKTEST_ENGINE_MANIFEST_PATHS = new Set([
  `${BACKTEST_ENGINE_ROOT}Cargo.lock`,
  `${BACKTEST_ENGINE_ROOT}Cargo.toml`,
]);

const DESKTOP_SHELL_ROOT = "apps/desktop/shell/";
const DESKTOP_SHELL_CARGO_PATHS = new Set([
  `${DESKTOP_SHELL_ROOT}Cargo.lock`,
  `${DESKTOP_SHELL_ROOT}Cargo.toml`,
  `${DESKTOP_SHELL_ROOT}build.rs`,
]);
const DESKTOP_SHELL_RUNTIME_BUILD_INPUT_PATHS = new Set([
  `${DESKTOP_SHELL_ROOT}.taurignore`,
  `${DESKTOP_SHELL_ROOT}Entitlements.plist`,
  `${DESKTOP_SHELL_ROOT}Info.plist`,
  `${DESKTOP_SHELL_ROOT}PrivacyInfo.xcprivacy`,
  `${DESKTOP_SHELL_ROOT}tauri.conf.json`,
  `${DESKTOP_SHELL_ROOT}tauri.windows.conf.json`,
]);
const DESKTOP_SHELL_RUNTIME_BUILD_INPUT_PREFIXES = [
  `${DESKTOP_SHELL_ROOT}capabilities/`,
  `${DESKTOP_SHELL_ROOT}nsis/`,
];

const QUALITY_GOVERNANCE_PATHS = new Set([
  "docs/registry/product-lanes.json",
  "docs/registry/features.json",
  "docs/registry/contracts.json",
  "tools/docs/docs-check.mjs",
  "tools/docs/docs-where.mjs",
  "tools/quality/architecture-import-graph.mjs",
  "tools/quality/architecture-import-boundaries.mjs",
  "tools/quality/architecture-import-boundaries.test.mjs",
  "tools/quality/architecture-local-data-guards.mjs",
  "tools/quality/architecture-single-source-guards.mjs",
  "tools/quality/check-architecture-single-source-guards.test.mjs",
  "tools/quality/architecture-typography-guards.mjs",
  "tools/quality/check-change-impact.mjs",
  "tools/quality/check-repo-structure.mjs",
  "tools/quality/repo-governance.mjs",
  "tools/quality/run-quality-for-impact.mjs",
  "tools/quality/run-quality-for-impact.test.mjs",
  "tools/quality/validate-pr-impact.mjs",
  "tools/gen/agents-rules.mjs",
  "tools/gen/agents-rules.test.mjs",
  "tools/gen/index.mjs",
  "tools/gen/install-git-hooks.mjs",
  "tools/gen/scaffold-core.mjs",
  "tools/gen/scaffold-core.test.mjs",
]);

const CONTRACT_GUARD_PATHS = new Set([
  "tools/contracts/check-api-contracts.mjs",
  "tools/contracts/generate-openapi-contracts.mjs",
]);

const INPUT_LIMIT_GUARD_PATHS = new Set([
  "tools/quality/check-input-limits.mjs",
  "packages/shared/src/input-limits.ts",
  "contracts/native-bridge/native-bridge.v1.json",
  "apps/desktop/shell/src/main.rs",
  "apps/desktop/local-api/src/http/apiSchemas.ts",
  "apps/desktop/local-api/src/http/apiSchemas/common.ts",
  "apps/desktop/local-api/src/http/apiSchemas/dataSourceSchemas.ts",
  "apps/desktop/local-api/src/http/apiSchemas/replayNoteSchemas.ts",
  "apps/desktop/local-api/src/http/apiSchemas/sessionSchemas.ts",
  "apps/desktop/local-api/src/http/apiSchemas/specialTrainingSchemas.ts",
  "apps/desktop/local-api/src/http/apiSchemas/systemSchemas.ts",
  "apps/desktop/local-api/src/application/dataSource/csvPreviewUtils.ts",
  "apps/desktop/local-api/src/application/dataSource/tabularFileUtils.ts",
]);

const USER_FACING_TEXT_GUARD_PATHS = new Set([
  "tools/quality/check-centralized-user-facing-copy.mjs",
  "tools/quality/check-desktop-ui-terminal-punctuation.mjs",
  "tools/quality/check-product-terminology.mjs",
  "tools/quality/check-shared-i18n-locale-integrity.mjs",
]);

const DESKTOP_WEB_PURE_PRESENTATION_GUARD_PATHS = new Set([
  "tools/quality/check-desktop-web-pure-presentation.mjs",
]);

const FRONTEND_TEXT_CHECK_EXTENSIONS = new Set([".jsx", ".tsx"]);
const FRONTEND_STYLE_EXTENSIONS = new Set([".css"]);
const FRONTEND_SOURCE_CODE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const STRUCTURE_CHECK_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".rs",
  ".ts",
  ".tsx",
]);
const STRUCTURE_CHECK_SOURCE_ROOTS = [
  "apps/desktop/web/src/",
  "apps/desktop/local-api/src/",
  "packages/shared/src/",
];
const TEST_OR_HARNESS_SEGMENT_PATTERN =
  /(?:^|\/)(?:__tests__|testHarness|tests?)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/u;

const npmRun = (script, args = []) => ({
  bin: NPM_BIN,
  displayBin: "npm",
  args: ["run", script, ...args],
});

const INCREMENTAL_TYPECHECK_WORKSPACES = new Set([
  "@zinuto/desktop-web",
  "@zinuto/desktop-local-api",
]);

const workspaceTypecheck = (workspace, options = {}) =>
  npmRun(
    options.incrementalTypecheck && INCREMENTAL_TYPECHECK_WORKSPACES.has(workspace)
      ? "typecheck:incremental"
      : "typecheck:workspace",
    [`--workspace=${workspace}`],
  );

const parseNpmRunCommand = (commandText, label) => {
  const parts = String(commandText || "").trim().split(/\s+/u).filter(Boolean);
  if (parts[0] !== "npm" || parts[1] !== "run" || !parts[2]) {
    throw new Error(`${label} must be an npm run command. Found: ${commandText}`);
  }
  return npmRun(parts[2], parts.slice(3));
};

const getLaneQualityCommand = (lane) => {
  const commandText = [...(lane.requiredChecks ?? []), ...(lane.checks ?? [])].find((command) =>
    /^npm\s+run\s+quality:/u.test(String(command || "")),
  );
  if (!commandText) {
    throw new Error(`Lane ${lane.id} must declare a quality command in docs/registry/product-lanes.json.`);
  }
  return parseNpmRunCommand(commandText, `Lane ${lane.id} quality command`);
};

const PRODUCT_LANE_COMMANDS = new Map(
  PRODUCT_LANES.map((lane) => [lane.id, getLaneQualityCommand(lane)]),
);

const isRequiredCheckSupportedOnPlatform = (lane, commandText, platform) => {
  const supportedPlatforms = lane.requiredCheckPlatforms?.[commandText];
  return !Array.isArray(supportedPlatforms) || supportedPlatforms.includes(platform);
};

const getLaneRequiredCommands = (lane, platform = process.platform) => {
  const requiredChecks = lane.requiredChecks ?? [];
  if (requiredChecks.length === 0) {
    return [getLaneQualityCommand(lane)];
  }
  return requiredChecks
    .map((commandText, index) => ({ commandText, index }))
    .filter(({ commandText }) => isRequiredCheckSupportedOnPlatform(lane, commandText, platform))
    .map(({ commandText, index }) =>
      parseNpmRunCommand(commandText, `Lane ${lane.id} required check ${String(index + 1)}`),
    );
};

const buildFullCommands = (platform = process.platform) => [
  npmRun("check:node-version"),
  npmRun("check:test-discovery"),
  npmRun("check:public-repo:workspace"),
  npmRun("docs:check:workspace"),
  npmRun("check:agents-rules"),
  npmRun("license:audit"),
  npmRun("test:governance:workspace"),
  npmRun("check:input-limits:workspace"),
  npmRun("check:architecture:workspace"),
  npmRun("check:repo-structure:workspace"),
  npmRun("security:audit:rust"),
  npmRun("desktop:runtime:check:build"),
  npmRun("desktop:shell:test"),
  npmRun("desktop:backtest-engine:check"),
  npmRun("contract:check:workspace"),
  npmRun("build:workspace", ["--workspace=@zinuto/shared"]),
  npmRun("typecheck:workspace", ["--workspace=@zinuto/shared"]),
  npmRun("test:suggestions:workspace", ["--workspace=@zinuto/shared"]),
  npmRun("typecheck:workspace", ["--workspace=@zinuto/desktop-local-api"]),
  npmRun("typecheck:workspace", ["--workspace=@zinuto/desktop-web"]),
  npmRun("check:static:local", ["--workspace=@zinuto/desktop-web"]),
  npmRun("build:artifact:workspace", ["--workspace=@zinuto/desktop-web"]),
  npmRun("test:all:workspace", ["--workspace=@zinuto/desktop-local-api"]),
  npmRun("test:workspace", ["--workspace=@zinuto/desktop-web"]),
  npmRun("security:audit:prod:workspace"),
];

const listPlatformSkippedRequiredChecks = (platform = process.platform) =>
  PRODUCT_LANES.flatMap((lane) =>
    (lane.requiredChecks ?? [])
      .filter((commandText) => !isRequiredCheckSupportedOnPlatform(lane, commandText, platform))
      .map((commandText) => `${lane.id}: ${commandText}`),
  );

const quoteArg = (value) => {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@-]+$/u.test(text)) {
    return text;
  }
  return JSON.stringify(text);
};

export const formatCommand = (command) =>
  [command.displayBin ?? command.bin, ...command.args].map(quoteArg).join(" ");

const dedupeCommands = (commands) => {
  const seen = new Set();
  const results = [];
  for (const command of commands) {
    const key = formatCommand(command);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(command);
  }
  return results;
};

const hasPath = (files, predicate) => files.some((filePath) => predicate(filePath));

const hasPrefix = (filePath, prefix) =>
  filePath === prefix.slice(0, -1) || filePath.startsWith(prefix);

const hasCommonRootChange = (files) => files.some((filePath) => COMMON_ROOT_PATHS.has(filePath));

const hasQualityGovernanceChange = (files) =>
  files.some(
    (filePath) =>
      hasPrefix(filePath, ".githooks/") ||
      QUALITY_GOVERNANCE_PATHS.has(filePath) ||
      filePath === "AGENTS.md" ||
      filePath === "CLAUDE.md" ||
      filePath.endsWith("/AGENTS.md"),
  );

const isArchitectureGuardPath = (filePath) =>
  filePath === "tools/quality/architecture-import-boundaries.mjs" ||
  filePath === "tools/quality/architecture-import-boundaries.test.mjs" ||
  filePath === "tools/quality/architecture-import-graph.mjs" ||
  filePath === "tools/quality/architecture-local-data-guards.mjs" ||
  filePath === "tools/quality/architecture-single-source-guards.mjs" ||
  filePath === "tools/quality/architecture-typography-guards.mjs" ||
  filePath === "tools/quality/check-architecture-single-source-guards.test.mjs" ||
  filePath === "tools/quality/check-architecture.mjs" ||
  filePath === "tools/quality/architecture-guard-config.mjs";

const hasArchitectureGuardChange = (files) =>
  files.some((filePath) => isArchitectureGuardPath(filePath));

const hasContractGuardChange = (files) =>
  files.some((filePath) => CONTRACT_GUARD_PATHS.has(filePath));

const hasInputLimitGuardChange = (files) =>
  files.some((filePath) => INPUT_LIMIT_GUARD_PATHS.has(filePath));

const hasUserFacingTextGuardChange = (files) =>
  files.some((filePath) => USER_FACING_TEXT_GUARD_PATHS.has(filePath));

const hasDesktopWebPurePresentationGuardChange = (files) =>
  files.some((filePath) => DESKTOP_WEB_PURE_PRESENTATION_GUARD_PATHS.has(filePath));

const isDesktopWebPopupManifestRiskPath = (filePath) =>
  DESKTOP_WEB_ARTIFACT_RISK_PATHS.has(filePath) ||
  hasPrefix(filePath, "apps/desktop/web/src/app-shell/popups/") ||
  hasPrefix(filePath, "apps/desktop/web/src/app-shell/secondaryWindows/") ||
  hasPrefix(filePath, "apps/desktop/web/src/frontend-kernel/secondary-windows/") ||
  hasPrefix(filePath, "apps/desktop/web/src/styles/popup-");

const hasDesktopWebPopupManifestRiskChange = (files) =>
  files.some((filePath) => isDesktopWebPopupManifestRiskPath(filePath));

const hasDesktopWebArtifactBuildRiskChange = (files) =>
  hasDesktopWebPopupManifestRiskChange(files) ||
  files.some((filePath) => DESKTOP_WEB_NATIVE_BRIDGE_RISK_PATHS.has(filePath));

const hasDesktopRuntimeChange = (files) =>
  files.some(
    (filePath) =>
      filePath === "package.json" ||
      filePath === "package-lock.json" ||
      filePath === ".nvmrc" ||
      filePath === "tsconfig.base.json" ||
      filePath === "apps/desktop/local-api/package.json" ||
      filePath === "apps/desktop/local-api/tsconfig.json" ||
      hasPrefix(filePath, "apps/desktop/local-api/scripts/") ||
      hasPrefix(filePath, "apps/desktop/local-api/src/runtime/") ||
      filePath === "apps/desktop/local-api/src/http/api.ts" ||
      filePath === "apps/desktop/local-api/src/http/baseApi.ts" ||
      isDesktopShellRuntimeBuildInput(filePath) ||
      hasPrefix(filePath, "contracts/native-bridge/") ||
      DESKTOP_WEB_NATIVE_BRIDGE_RISK_PATHS.has(filePath) ||
      DESKTOP_RUNTIME_SCRIPT_PATHS.has(filePath),
  );

const isDesktopShellRustSource = (filePath) =>
  hasPrefix(filePath, `${DESKTOP_SHELL_ROOT}src/`) && path.extname(filePath) === ".rs";

const isDesktopShellRuntimeBuildInput = (filePath) =>
  DESKTOP_SHELL_CARGO_PATHS.has(filePath) ||
  DESKTOP_SHELL_RUNTIME_BUILD_INPUT_PATHS.has(filePath) ||
  DESKTOP_SHELL_RUNTIME_BUILD_INPUT_PREFIXES.some((prefix) => hasPrefix(filePath, prefix));

const hasTauriRustChange = (files) =>
  files.some(
    (filePath) => isDesktopShellRustSource(filePath) || DESKTOP_SHELL_CARGO_PATHS.has(filePath),
  );

const hasDesktopShellBackendRuntimeChange = (files) =>
  files.some((filePath) => hasPrefix(filePath, `${DESKTOP_SHELL_ROOT}src/runtime/`));

const listDesktopShellRustFiles = (files) =>
  files
    .filter(isDesktopShellRustSource)
    .sort((left, right) => left.localeCompare(right, "en"));

const isBacktestEngineQualityInput = (filePath) =>
  BACKTEST_ENGINE_MANIFEST_PATHS.has(filePath) ||
  hasPrefix(filePath, `${BACKTEST_ENGINE_ROOT}fixtures/`) ||
  (hasPrefix(filePath, `${BACKTEST_ENGINE_ROOT}src/`) && path.extname(filePath) === ".rs") ||
  (hasPrefix(filePath, `${BACKTEST_ENGINE_ROOT}tests/`) && path.extname(filePath) === ".rs");

const hasBacktestEngineChange = (files) =>
  files.some((filePath) => isBacktestEngineQualityInput(filePath));

const listBacktestEngineRustFiles = (files) =>
  files
    .filter(
      (filePath) =>
        path.extname(filePath) === ".rs" &&
        (hasPrefix(filePath, `${BACKTEST_ENGINE_ROOT}src/`) ||
          hasPrefix(filePath, `${BACKTEST_ENGINE_ROOT}tests/`)),
    )
    .sort((left, right) => left.localeCompare(right, "en"));

const isSharedI18nMessagePath = (filePath) => hasPrefix(filePath, "packages/shared/src/i18n/messages/");

const isSharedPackagePath = (filePath) => hasPrefix(filePath, "packages/shared/");

const isFrontendStyleOrThemePath = (filePath) => {
  if (!hasPrefix(filePath, "apps/desktop/web/")) {
    return false;
  }
  const extension = path.extname(filePath).toLowerCase();
  if (FRONTEND_STYLE_EXTENSIONS.has(extension)) {
    return true;
  }
  const basename = path.basename(filePath).toLowerCase();
  return (
    hasPrefix(filePath, "apps/desktop/web/src/styles/") ||
    hasPrefix(filePath, "apps/desktop/web/src/theme/") ||
    basename.includes("theme")
  );
};

const isFrontendTypecheckPath = (filePath) =>
  hasPrefix(filePath, "apps/desktop/web/") &&
  !FRONTEND_STYLE_EXTENSIONS.has(path.extname(filePath).toLowerCase());

const isFrontendSourceCodePath = (filePath) =>
  hasPrefix(filePath, "apps/desktop/web/src/") &&
  FRONTEND_SOURCE_CODE_EXTENSIONS.has(path.extname(filePath).toLowerCase());

const isFrontendSourceTextPath = (filePath) =>
  hasPrefix(filePath, "apps/desktop/web/src/") &&
  FRONTEND_TEXT_CHECK_EXTENSIONS.has(path.extname(filePath).toLowerCase());

const isStructureCheckSourcePath = (filePath) =>
  STRUCTURE_CHECK_SOURCE_ROOTS.some((prefix) => hasPrefix(filePath, prefix)) &&
  STRUCTURE_CHECK_EXTENSIONS.has(path.extname(filePath).toLowerCase()) &&
  !TEST_OR_HARNESS_SEGMENT_PATTERN.test(filePath);

const listStructureCheckSourceFiles = (files) =>
  files.filter(isStructureCheckSourcePath).sort((left, right) => left.localeCompare(right, "en"));

const listFrontendSourceFiles = (files) =>
  files
    .filter((filePath) => hasPrefix(filePath, "apps/desktop/web/src/"))
    .filter((filePath) => FRONTEND_SOURCE_CODE_EXTENSIONS.has(path.extname(filePath).toLowerCase()))
    .sort((left, right) => left.localeCompare(right, "en"));

const listFrontendTextFiles = (files) =>
  files
    .filter(
      (filePath) =>
        hasPrefix(filePath, "apps/desktop/web/src/") &&
        [".css", ".json", ".ts", ".tsx"].includes(path.extname(filePath).toLowerCase()),
    )
    .sort((left, right) => left.localeCompare(right, "en"));

const listFrontendPanelKeyFiles = (files) =>
  files
    .filter(
      (filePath) =>
        hasPrefix(filePath, "apps/desktop/web/src/") &&
        [".jsx", ".tsx"].includes(path.extname(filePath).toLowerCase()),
    )
    .sort((left, right) => left.localeCompare(right, "en"));

const listFrontendMotionFiles = (files) =>
  files
    .filter(
      (filePath) =>
        hasPrefix(filePath, "apps/desktop/web/src/") &&
        path.extname(filePath).toLowerCase() === ".css",
    )
    .sort((left, right) => left.localeCompare(right, "en"));

const toWorkspaceRelativePath = (filePath, workspaceRoot) =>
  filePath.startsWith(`${workspaceRoot}/`) ? filePath.slice(workspaceRoot.length + 1) : filePath;

const listWorkspaceTestFiles = (files, workspaceRoot) =>
  files
    .filter((filePath) => hasPrefix(filePath, `${workspaceRoot}/tests/`))
    .filter((filePath) => /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(filePath))
    .map((filePath) => toWorkspaceRelativePath(filePath, workspaceRoot))
    .sort((left, right) => left.localeCompare(right, "en"));

const isDesktopWebBrowserTestFile = (filePath) =>
  /\.spec\.[cm]?[jt]sx?$/u.test(filePath);

const addProductLaneCommands = (commands, laneIds) => {
  for (const laneId of laneIds) {
    const command = PRODUCT_LANE_COMMANDS.get(laneId);
    if (command) {
      commands.push(command);
    }
  }
};

const resolveFastCommands = (files, impact) => {
  const commands = [];
  const notes = [];
  let blocked = null;

  if (files.length === 0) {
    notes.push("No changed files detected.");
    return { commands, notes };
  }

  if (impact.docsOnly || impact.governanceOnly) {
    if (hasQualityGovernanceChange(files)) {
      commands.push(npmRun("test:governance"));
      notes.push("Quality governance script change detected.");
      return { commands, notes };
    }
    notes.push("Governance/docs-only change: no code quality command is required for fast tier.");
    return { commands, notes };
  }

  if (hasCommonRootChange(files)) {
    const rootFiles = files.filter((filePath) => COMMON_ROOT_PATHS.has(filePath));
    commands.push(npmRun("check:node-version"));
    notes.push(
      `Root dependency/config change detected (${rootFiles.join(", ")}); fast tier checks the toolchain and leaves lane validation to check:affected.`,
    );
    return { commands, notes, blocked };
  }

  if (
    hasPath(files, (filePath) => hasPrefix(filePath, "contracts/")) ||
    hasContractGuardChange(files)
  ) {
    commands.push(npmRun("contract:check"));
  }
  if (hasBacktestEngineChange(files)) {
    commands.push(npmRun("desktop:backtest-engine:format"));
    const backtestEngineRustFiles = listBacktestEngineRustFiles(files);
    if (backtestEngineRustFiles.length > 0) {
      commands.push(
        npmRun("check:repo-structure:workspace", ["--", "--files", ...backtestEngineRustFiles]),
      );
    }
    notes.push("Backtest engine change detected; fast tier checks Rust formatting and source size.");
  }
  if (hasTauriRustChange(files)) {
    commands.push(npmRun("desktop:shell:format"));
    const desktopShellRustFiles = listDesktopShellRustFiles(files);
    if (desktopShellRustFiles.length > 0) {
      commands.push(
        npmRun("check:repo-structure:workspace", ["--", "--files", ...desktopShellRustFiles]),
      );
    }
    notes.push("Desktop shell Rust change detected; fast tier checks formatting and source size.");
  }

  const structureCheckSourceFiles = listStructureCheckSourceFiles(files);
  if (structureCheckSourceFiles.length > 0) {
    commands.push(
      npmRun("check:architecture", [
        "--",
        "--files",
        ...structureCheckSourceFiles,
        "--skip-reachability",
      ]),
    );
    commands.push(
      npmRun("check:repo-structure:workspace", ["--", "--files", ...structureCheckSourceFiles]),
    );
  }

  const frontendSourceFiles = listFrontendSourceFiles(files);
  if (frontendSourceFiles.length > 0) {
    commands.push(
      npmRun("check:pure-presentation", [
        "--workspace=@zinuto/desktop-web",
        "--",
        "--files",
        ...frontendSourceFiles,
      ]),
    );
  }

  const frontendTextFiles = listFrontendTextFiles(files);
  if (frontendTextFiles.length > 0) {
    commands.push(
      npmRun("check:text:literals", [
        "--workspace=@zinuto/desktop-web",
        "--",
        "--files",
        ...frontendTextFiles,
      ]),
    );
  }

  const frontendPanelKeyFiles = listFrontendPanelKeyFiles(files);
  if (frontendPanelKeyFiles.length > 0) {
    commands.push(
      npmRun("check:dynamic-panel-keys", [
        "--workspace=@zinuto/desktop-web",
        "--",
        "--files",
        ...frontendPanelKeyFiles,
      ]),
    );
  }

  const frontendMotionFiles = listFrontendMotionFiles(files);
  if (frontendMotionFiles.length > 0) {
    commands.push(
      npmRun("check:motion-literals", [
        "--workspace=@zinuto/desktop-web",
        "--",
        "--files",
        ...frontendMotionFiles,
      ]),
    );
  }
  if (hasDesktopWebPopupManifestRiskChange(files)) {
    commands.push(npmRun("check:popup-manifest", ["--workspace=@zinuto/desktop-web"]));
    notes.push("Desktop web popup/secondary manifest risk detected.");
  }

  const desktopWebTestFiles = listWorkspaceTestFiles(files, "apps/desktop/web");
  if (desktopWebTestFiles.length > 0) {
    const browserTestFiles = desktopWebTestFiles.filter(isDesktopWebBrowserTestFile);
    const nodeTestFiles = desktopWebTestFiles.filter(
      (filePath) => !isDesktopWebBrowserTestFile(filePath),
    );
    if (nodeTestFiles.length > 0) {
      commands.push(
        npmRun("test:file", [
          "--workspace=@zinuto/desktop-web",
          "--",
          ...nodeTestFiles,
        ]),
      );
    }
    if (browserTestFiles.length > 0) {
      commands.push(npmRun("test:browser:workspace", ["--workspace=@zinuto/desktop-web"]));
    }
  }

  const localApiTestFiles = listWorkspaceTestFiles(files, "apps/desktop/local-api");
  if (localApiTestFiles.length > 0) {
    commands.push(
      npmRun("test:file", [
        "--workspace=@zinuto/desktop-local-api",
        "--",
        ...localApiTestFiles,
      ]),
    );
  }

  if (hasInputLimitGuardChange(files)) {
    commands.push(npmRun("check:input-limits"));
  }
  if (hasQualityGovernanceChange(files)) {
    commands.push(npmRun("test:governance"));
  }
  if (hasUserFacingTextGuardChange(files)) {
    commands.push(npmRun("check:user-facing-text"));
  }

  return { commands, notes, blocked };
};

const resolveAffectedCommands = (files, impact, options = {}) => {
  const commands = [];
  const notes = [];
  let blocked = null;

  if (files.length === 0) {
    notes.push("No changed files detected.");
    return { commands, notes };
  }

  if (impact.docsOnly || impact.governanceOnly) {
    if (hasQualityGovernanceChange(files)) {
      if (hasArchitectureGuardChange(files)) {
        commands.push(npmRun("check:architecture"));
      }
      if (hasInputLimitGuardChange(files)) {
        commands.push(npmRun("check:input-limits"));
      }
      commands.push(npmRun("test:governance"));
      if (hasPath(files, (filePath) => filePath === "tools/quality/check-repo-structure.mjs")) {
        commands.push(npmRun("check:repo-structure"));
      }
      notes.push("Quality governance script change detected.");
      return { commands, notes };
    }
    notes.push("Governance/docs-only change: no code quality command is required for affected tier.");
    return { commands, notes };
  }

  if (hasCommonRootChange(files)) {
    const rootFiles = files.filter((filePath) => COMMON_ROOT_PATHS.has(filePath));
    notes.push(
      `Root dependency/config change detected (${rootFiles.join(", ")}); affected tier expands to impacted product lanes.`,
    );
    return resolveLaneCommands(files, impact);
  }

  if (
    hasPath(files, (filePath) => hasPrefix(filePath, "contracts/")) ||
    hasContractGuardChange(files)
  ) {
    commands.push(npmRun("contract:check"));
  }
  if (hasBacktestEngineChange(files)) {
    const backtestEngineRustFiles = listBacktestEngineRustFiles(files);
    if (backtestEngineRustFiles.length > 0) {
      commands.push(
        npmRun("check:repo-structure:workspace", ["--", "--files", ...backtestEngineRustFiles]),
      );
    }
    commands.push(npmRun("desktop:backtest-engine:check"));
    notes.push("Backtest engine change detected; affected tier runs the targeted Rust suite.");
  }
  if (hasTauriRustChange(files)) {
    const desktopShellRustFiles = listDesktopShellRustFiles(files);
    if (desktopShellRustFiles.length > 0) {
      commands.push(
        npmRun("check:repo-structure:workspace", ["--", "--files", ...desktopShellRustFiles]),
      );
    }
    commands.push(npmRun("desktop:shell:test"));
    notes.push("Desktop shell Rust change detected; affected tier runs the complete Shell Rust suite.");
  }

  if (
    hasPath(
      files,
      (filePath) =>
        isSharedPackagePath(filePath)
        || hasPrefix(filePath, "apps/desktop/web/")
        || hasPrefix(filePath, "apps/desktop/local-api/"),
    )
  ) {
    commands.push(npmRun("build", ["--workspace=@zinuto/shared"]));
  }

  if (hasPath(files, isFrontendTypecheckPath)) {
    commands.push(workspaceTypecheck("@zinuto/desktop-web", options));
  }
  const structureCheckSourceFiles = listStructureCheckSourceFiles(files);
  if (structureCheckSourceFiles.length > 0) {
    commands.push(npmRun("check:architecture", ["--", "--files", ...structureCheckSourceFiles]));
    commands.push(
      npmRun("check:repo-structure:workspace", ["--", "--files", ...structureCheckSourceFiles]),
    );
  }
  if (hasPath(files, isFrontendSourceCodePath)) {
    commands.push(npmRun("check:pure-presentation", ["--workspace=@zinuto/desktop-web"]));
  }
  if (hasPath(files, isFrontendSourceTextPath)) {
    commands.push(npmRun("check:text", ["--workspace=@zinuto/desktop-web"]));
  }
  if (hasPath(files, isFrontendStyleOrThemePath)) {
    commands.push(npmRun("check:theme-colors", ["--workspace=@zinuto/desktop-web"]));
  }
  if (hasDesktopWebArtifactBuildRiskChange(files)) {
    commands.push(npmRun("build:workspace", ["--workspace=@zinuto/desktop-web"]));
    notes.push("Desktop web runtime artifact risk detected; affected tier runs the real desktop-web build.");
  }
  if (
    hasPath(
      files,
      (filePath) =>
        hasPrefix(filePath, "apps/desktop/web/src/domains/data-import/") ||
        hasPrefix(filePath, "apps/desktop/web/src/workspaces/data/") ||
        hasPrefix(filePath, "apps/desktop/web/tests/data-import/"),
    )
  ) {
    commands.push(npmRun("test:data-import:ui", ["--workspace=@zinuto/desktop-web"]));
  }
  if (hasPath(files, (filePath) => hasPrefix(filePath, "apps/desktop/web/tests/special-training/"))) {
    commands.push(npmRun("test:special-training", ["--workspace=@zinuto/desktop-web"]));
  }
  if (hasPath(files, (filePath) => hasPrefix(filePath, "apps/desktop/web/tests/trainer/"))) {
    commands.push(npmRun("test:trainer", ["--workspace=@zinuto/desktop-web"]));
  }
  if (hasPath(files, (filePath) => hasPrefix(filePath, "apps/desktop/web/tests/custom-indicator/"))) {
    commands.push(npmRun("test:custom-indicator", ["--workspace=@zinuto/desktop-web"]));
  }
  if (hasPath(files, (filePath) => hasPrefix(filePath, "apps/desktop/web/tests/history-console/"))) {
    commands.push(npmRun("test:history-console", ["--workspace=@zinuto/desktop-web"]));
  }
  if (hasPath(files, (filePath) => hasPrefix(filePath, "apps/desktop/web/tests/ui/"))) {
    commands.push(npmRun("test:ui", ["--workspace=@zinuto/desktop-web"]));
  }

  if (hasPath(files, (filePath) => hasPrefix(filePath, "apps/desktop/local-api/"))) {
    commands.push(workspaceTypecheck("@zinuto/desktop-local-api", options));
  }
  const hasLocalApiDataSourceChange = hasPath(files, (filePath) =>
    hasPrefix(filePath, "apps/desktop/local-api/src/application/dataSource/") ||
    hasPrefix(filePath, "apps/desktop/local-api/tests/dataSource/"),
  );
  const hasLocalApiAppChange = hasPath(files, (filePath) =>
    hasPrefix(filePath, "apps/desktop/local-api/src/") || hasPrefix(filePath, "apps/desktop/local-api/tests/"),
  );
  const hasLocalApiNonDataSourceAppChange = hasPath(files, (filePath) =>
    (hasPrefix(filePath, "apps/desktop/local-api/src/") ||
      hasPrefix(filePath, "apps/desktop/local-api/tests/")) &&
    !hasPrefix(filePath, "apps/desktop/local-api/src/application/dataSource/") &&
    !hasPrefix(filePath, "apps/desktop/local-api/tests/dataSource/"),
  );
  if (hasLocalApiDataSourceChange) {
    commands.push(npmRun("test:data-source:workspace", ["--workspace=@zinuto/desktop-local-api"]));
  }
  if (hasLocalApiAppChange && (!hasLocalApiDataSourceChange || hasLocalApiNonDataSourceAppChange)) {
    commands.push(npmRun("test:app:workspace", ["--workspace=@zinuto/desktop-local-api"]));
  }

  if (hasPath(files, isSharedI18nMessagePath)) {
    commands.push(npmRun("build", ["--workspace=@zinuto/shared"]));
    commands.push(npmRun("check:i18n-missing", ["--workspace=@zinuto/desktop-web"]));
    commands.push(npmRun("check:i18n-runtime", ["--workspace=@zinuto/desktop-web"]));
    notes.push("Shared i18n catalog change: affected tier skips page audit and Playwright smoke.");
  }

  if (
    hasPath(
      files,
      (filePath) => isSharedPackagePath(filePath) && !isSharedI18nMessagePath(filePath),
    )
  ) {
    commands.push(npmRun("build", ["--workspace=@zinuto/shared"]));
    commands.push(workspaceTypecheck("@zinuto/shared", options));
    commands.push(npmRun("test:suggestions:workspace", ["--workspace=@zinuto/shared"]));
  }

  if (hasArchitectureGuardChange(files)) {
    commands.push(npmRun("check:architecture"));
  }
  if (hasInputLimitGuardChange(files)) {
    commands.push(npmRun("check:input-limits"));
  }

  if (hasTauriRustChange(files)) {
    commands.push(npmRun("desktop:shell:test"));
  }
  if (hasDesktopRuntimeChange(files)) {
    commands.push(npmRun("desktop:runtime:check:dev"));
  }
  if (hasQualityGovernanceChange(files)) {
    commands.push(npmRun("test:governance"));
  }
  if (hasUserFacingTextGuardChange(files)) {
    commands.push(npmRun("check:user-facing-text"));
  }
  if (hasDesktopWebPurePresentationGuardChange(files)) {
    commands.push(npmRun("check:pure-presentation", ["--workspace=@zinuto/desktop-web"]));
  }

  return { commands, notes, blocked };
};

const resolveLaneCommands = (files, impact) => {
  const commands = [];
  const notes = [];

  if (files.length === 0) {
    notes.push("No changed files detected.");
    return { commands, notes, blocked: null };
  }

  if (impact.docsOnly || impact.governanceOnly) {
    if (hasQualityGovernanceChange(files)) {
      commands.push(npmRun("check:architecture"));
      commands.push(npmRun("check:repo-structure"));
      if (hasInputLimitGuardChange(files)) {
        commands.push(npmRun("check:input-limits"));
      }
      commands.push(npmRun("test:governance"));
      notes.push("Quality governance script change detected.");
      return { commands, notes, blocked: null };
    }
    notes.push("Governance/docs-only change: no product lane quality command is required.");
    return { commands, notes, blocked: null };
  }

  commands.push(npmRun("check:architecture"));
  commands.push(npmRun("check:repo-structure"));
  addProductLaneCommands(commands, impact.impactedLaneIds);
  if (hasQualityGovernanceChange(files)) {
    commands.push(npmRun("test:governance"));
  }
  if (hasUserFacingTextGuardChange(files)) {
    commands.push(npmRun("check:user-facing-text"));
  }
  if (hasInputLimitGuardChange(files)) {
    commands.push(npmRun("check:input-limits"));
  }
  if (hasDesktopWebPurePresentationGuardChange(files)) {
    commands.push(npmRun("check:pure-presentation", ["--workspace=@zinuto/desktop-web"]));
  }

  if (hasTauriRustChange(files)) {
    commands.push(npmRun("desktop:shell:test"));
  }
  if (hasDesktopRuntimeChange(files)) {
    commands.push(npmRun("desktop:runtime:check:dev"));
    notes.push("Desktop runtime/build guards require a generated-runtime validation pass.");
  }

  return { commands, notes, blocked: null };
};

const normalizeTier = (tier) => tier;

export const resolveQualityPlan = (changedFiles, tier = "affected", options = {}) => {
  const normalizedFiles = [...new Set(changedFiles.map(normalizeRepoPath).filter(Boolean))].sort();
  const normalizedTier = normalizeTier(tier);
  const impact = computeChangeImpact(normalizedFiles);

  if (!["fast", "affected", "full"].includes(normalizedTier)) {
    throw new Error(`Unknown quality tier: ${tier}`);
  }

  if (normalizedTier === "full") {
    const platform = String(options.platform || process.platform);
    const skippedRequiredChecks = listPlatformSkippedRequiredChecks(platform);
    return {
      tier: normalizedTier,
      impact,
      commands: buildFullCommands(platform),
      notes: [
        "Full tier runs all host-supported product lane gates plus governance tests and production dependency audit.",
        ...(skippedRequiredChecks.length > 0
          ? [`Host ${platform} skips platform-incompatible required checks: ${skippedRequiredChecks.join(", ")}.`]
          : []),
      ],
      blocked: null,
    };
  }

  if (impact.unmappedFiles.length > 0) {
    throw new Error(
      [
        "Changed files could not be mapped to a product lane.",
        formatChangeImpactReport(impact),
      ].join("\n"),
    );
  }

  const plan =
    normalizedTier === "fast"
      ? resolveFastCommands(normalizedFiles, impact, options)
      : resolveAffectedCommands(normalizedFiles, impact, options);

  return {
    tier: normalizedTier,
    impact,
    commands: dedupeCommands(plan.commands),
    notes: plan.notes,
    blocked: plan.blocked ?? null,
  };
};

const parseArgs = (argv) => {
  const options = {
    base: "",
    dryRun: false,
    files: [],
    head: "",
    includeWorkingTree: false,
    staged: false,
    cache: false,
    explain: false,
    incrementalTypecheck: false,
    noCache: false,
    tier: "affected",
    workingTree: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--tier") {
      options.tier = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (current === "--cache") {
      options.cache = true;
      continue;
    }
    if (current === "--no-cache") {
      options.noCache = true;
      continue;
    }
    if (current === "--explain") {
      options.explain = true;
      continue;
    }
    if (current === "--incremental-typecheck") {
      options.incrementalTypecheck = true;
      continue;
    }
    if (current === "--base") {
      options.base = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (current === "--head") {
      options.head = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (current === "--files") {
      index += 1;
      while (index < argv.length && !String(argv[index]).startsWith("--")) {
        options.files.push(argv[index]);
        index += 1;
      }
      index -= 1;
      continue;
    }
    if (current === "--include-working-tree") {
      options.includeWorkingTree = true;
      continue;
    }
    if (current === "--staged") {
      options.staged = true;
      continue;
    }
    if (current === "--working-tree") {
      options.workingTree = true;
      continue;
    }
    if (current === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (current === "--help" || current === "-h") {
      process.stdout.write(
        [
          "Usage:",
          "  node tools/quality/run-quality-for-impact.mjs [--tier fast|affected|full]",
          "  node tools/quality/run-quality-for-impact.mjs --tier affected --base <sha> --head <sha>",
          "  node tools/quality/run-quality-for-impact.mjs --tier affected --files <path> [more paths]",
          "  node tools/quality/run-quality-for-impact.mjs --tier affected --staged",
          "  node tools/quality/run-quality-for-impact.mjs --tier affected --working-tree",
          "",
          "Options:",
          "  --tier <tier>           fast, affected, or full. Default: affected.",
          "  --base <sha>            Git diff base sha/ref.",
          "  --head <sha>            Git diff head sha/ref. Default with --base: HEAD.",
          "  --include-working-tree  Include staged, unstaged, and untracked files with --base/--head.",
          "  --staged                Use staged files only.",
          "  --working-tree          Use staged, unstaged, and untracked files.",
          "  --files <paths...>      Explicit repo-relative file list.",
          "  --cache                 Reuse successful command results for unchanged affected/fast inputs.",
          "  --no-cache              Disable persistent quality cache.",
          "  --explain               Print cache key inputs and selected routing details.",
          "  --incremental-typecheck Use workspace typecheck:incremental scripts when available.",
          "  --dry-run               Print selected commands without running them.",
        ].join("\n"),
      );
      process.exit(0);
    }
    throw new Error(`Unknown option: ${current}`);
  }

  return options;
};

const gitLines = (args) => {
  const output = execFileSync("git", args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
};

const listChangedFilesFromGitRange = (base, head) => {
  const resolvedHead = head || "HEAD";
  const args = ["diff", "--name-only", "--diff-filter=ACMR", base, resolvedHead];
  return gitLines(args);
};

const listChangedFilesFromWorkingTree = () => {
  const changed = [
    ...gitLines(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"]),
    ...gitLines(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]),
    ...gitLines(["ls-files", "--others", "--exclude-standard"]),
  ];
  return [...new Set(changed)].sort();
};

const listChangedFilesFromStaged = () =>
  gitLines(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);

const listChangedFiles = (options) => {
  if (options.files.length > 0) {
    return options.files;
  }

  const collected = [];
  const hasExplicitGitScope =
    Boolean(options.base) ||
    Boolean(options.head) ||
    options.workingTree ||
    options.includeWorkingTree ||
    options.staged;

  if (options.base || options.head) {
    const base = options.base || "HEAD~1";
    collected.push(...listChangedFilesFromGitRange(base, options.head));
  }

  if (options.workingTree || options.includeWorkingTree) {
    collected.push(...listChangedFilesFromWorkingTree());
  }

  if (options.staged) {
    collected.push(...listChangedFilesFromStaged());
  }

  if (collected.length > 0) {
    return [...new Set(collected)].sort();
  }

  if (hasExplicitGitScope) {
    return [];
  }

  return listChangedFilesFromWorkingTree();
};

const hashText = (text) => crypto.createHash("sha256").update(text).digest("hex");

const hashRepoFile = (relativePath) => {
  const normalized = normalizeRepoPath(relativePath);
  const absolutePath = path.join(ROOT_DIR, normalized);
  if (!normalized || !fs.existsSync(absolutePath)) {
    return "missing";
  }
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    return "not-file";
  }
  return hashText(fs.readFileSync(absolutePath));
};

const readPackageScriptsSignature = () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  return hashText(JSON.stringify(packageJson.scripts ?? {}));
};

const uniqueExistingFiles = (files) =>
  [...new Set(files.map(normalizeRepoPath).filter(Boolean))]
    .filter((filePath) => fs.existsSync(path.join(ROOT_DIR, filePath)))
    .sort((left, right) => left.localeCompare(right, "en"));

const cacheDependencyFilesForCommand = (command) => {
  const commandText = formatCommand(command);
  const dependencies = [
    "package.json",
    "package-lock.json",
    "tsconfig.base.json",
    "tools/quality/repo-governance.mjs",
    "tools/quality/run-quality-for-impact.mjs",
  ];

  if (commandText.includes("check:architecture")) {
    dependencies.push(
      "tools/quality/check-architecture.mjs",
      "tools/quality/architecture-guard-config.mjs",
      "tools/quality/architecture-import-boundaries.mjs",
      "tools/quality/architecture-import-graph.mjs",
      "tools/quality/architecture-local-data-guards.mjs",
      "tools/quality/architecture-single-source-guards.mjs",
      "tools/quality/architecture-typography-guards.mjs",
    );
  }
  if (commandText.includes("check:repo-structure")) {
    dependencies.push("tools/quality/check-repo-structure.mjs");
  }
  if (commandText.includes("check:pure-presentation")) {
    dependencies.push("tools/quality/check-desktop-web-pure-presentation.mjs");
  }
  if (commandText.includes("check:text:literals") || commandText.includes("check:text ")) {
    dependencies.push("apps/desktop/web/scripts/check-text-literals.mjs");
  }
  if (commandText.includes("check:dynamic-panel-keys")) {
    dependencies.push("apps/desktop/web/scripts/check-dynamic-panel-keys.mjs");
  }
  if (commandText.includes("check:motion-literals")) {
    dependencies.push("apps/desktop/web/scripts/check-motion-literals.mjs");
  }
  if (
    commandText.includes("check:popup-manifest") ||
    commandText.includes("check:popup-bundles") ||
    commandText.includes("build --workspace=@zinuto/desktop-web")
  ) {
    dependencies.push(
      "apps/desktop/web/package.json",
      "apps/desktop/web/vite.config.ts",
      "apps/desktop/web/scripts/check-popup-manifest.mjs",
      "apps/desktop/web/scripts/popup-manifest-rules.mjs",
      "apps/desktop/web/scripts/check-popup-bundle-budget.mjs",
      "apps/desktop/web/scripts/check-main-bundle-budget.mjs",
    );
  }
  if (commandText.includes("typecheck")) {
    dependencies.push(
      "apps/desktop/web/tsconfig.json",
      "apps/desktop/local-api/tsconfig.json",
    );
  }

  return uniqueExistingFiles(dependencies);
};

const computeCommandCacheKey = (command, changedFiles) => {
  const normalizedChangedFiles = [...new Set(changedFiles.map(normalizeRepoPath).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "en"));
  const dependencyFiles = cacheDependencyFilesForCommand(command);
  return {
    dependencyFiles,
    key: hashText(
      JSON.stringify({
        version: QUALITY_CACHE_VERSION,
        node: process.version,
        platform: process.platform,
        command: formatCommand(command),
        packageScripts: readPackageScriptsSignature(),
        files: normalizedChangedFiles.map((filePath) => [filePath, hashRepoFile(filePath)]),
        dependencies: dependencyFiles.map((filePath) => [filePath, hashRepoFile(filePath)]),
      }),
    ),
  };
};

const loadQualityCache = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(QUALITY_CACHE_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const saveQualityCache = (cache) => {
  fs.mkdirSync(path.dirname(QUALITY_CACHE_PATH), { recursive: true });
  fs.writeFileSync(QUALITY_CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
};

const isCacheAllowedForOptions = (options) => {
  const tier = normalizeTier(options.tier);
  return Boolean(options.cache && !options.noCache && (tier === "fast" || tier === "affected"));
};

const printCachePlan = (commands, changedFiles) => {
  const cache = loadQualityCache();
  process.stdout.write(`Quality cache: ${QUALITY_CACHE_PATH}\n`);
  for (const command of commands) {
    const { key, dependencyFiles } = computeCommandCacheKey(command, changedFiles);
    const hit = cache[key]?.status === 0;
    process.stdout.write(
      `  - ${hit ? "hit" : "miss"} ${formatCommand(command)} [${key.slice(0, 12)}]\n`,
    );
    if (dependencyFiles.length > 0) {
      process.stdout.write(`    deps: ${dependencyFiles.join(", ")}\n`);
    }
  }
};

const hasExplicitChangeScope = (options) =>
  options.files.length > 0 ||
  Boolean(options.base) ||
  Boolean(options.head) ||
  options.staged ||
  options.workingTree ||
  options.includeWorkingTree;

const printAffectedScopeRequired = () => {
  process.stdout.write(
    [
      "Affected tier requires an explicit change scope before it runs commands.",
      "",
      "Recommended commands:",
      "  npm run check:affected -- --files apps/desktop/web/src/App.tsx",
      "  npm run check:affected -- --staged",
      "  npm run check:affected -- --working-tree",
      "",
      "Current dirty working tree summary (not used without an explicit scope):",
    ].join("\n"),
  );
  process.stdout.write("\n");
  const files = listChangedFilesFromWorkingTree();
  if (files.length === 0) {
    process.stdout.write("Changed files: 0\n");
    return;
  }
  process.stdout.write(formatChangeImpactReport(computeChangeImpact(files)));
};

const printPlan = (plan) => {
  process.stdout.write(formatChangeImpactReport(plan.impact));
  process.stdout.write(`Quality tier: ${plan.tier}\n`);
  if (plan.notes.length > 0) {
    process.stdout.write(`Notes: ${plan.notes.join(" ")}\n`);
  }
  if (plan.blocked) {
    process.stdout.write(`Blocked: ${plan.blocked.message}\n`);
    if (plan.blocked.suggestions.length > 0) {
      process.stdout.write("Suggested next commands:\n");
      plan.blocked.suggestions.forEach((suggestion, index) => {
        process.stdout.write(`  ${index + 1}. ${suggestion}\n`);
      });
    }
  }
  if (plan.commands.length === 0) {
    process.stdout.write("Selected commands: (none)\n");
    return;
  }
  process.stdout.write("Selected commands:\n");
  plan.commands.forEach((command, index) => {
    process.stdout.write(`  ${index + 1}. ${formatCommand(command)}\n`);
  });
};

const runCommands = (commands, { cacheEnabled = false, changedFiles = [] } = {}) => {
  const cache = cacheEnabled ? loadQualityCache() : null;
  let cacheChanged = false;
  for (const command of commands) {
    const cacheEntry = cacheEnabled ? computeCommandCacheKey(command, changedFiles) : null;
    if (cacheEntry && cache?.[cacheEntry.key]?.status === 0) {
      process.stdout.write(`\n$ ${formatCommand(command)}\n`);
      process.stdout.write(`[quality-cache] hit ${cacheEntry.key.slice(0, 12)}; skipped.\n`);
      continue;
    }
    process.stdout.write(`\n$ ${formatCommand(command)}\n`);
    const invocation = resolveSpawnInvocation(command);
    const result = spawnSync(invocation.bin, invocation.args, {
      cwd: ROOT_DIR,
      stdio: "inherit",
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
    if (cacheEntry && cache) {
      cache[cacheEntry.key] = {
        command: formatCommand(command),
        createdAt: new Date().toISOString(),
        status: 0,
        version: QUALITY_CACHE_VERSION,
      };
      cacheChanged = true;
    }
  }
  if (cacheChanged && cache) {
    saveQualityCache(cache);
  }
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const normalizedTier = normalizeTier(options.tier);
  if ((normalizedTier === "fast" || normalizedTier === "affected") && !hasExplicitChangeScope(options)) {
    printAffectedScopeRequired();
    if (options.dryRun) {
      return;
    }
    process.exit(AFFECTED_SCOPE_REQUIRED_EXIT_CODE);
  }
  const files = listChangedFiles(options);
  const plan = resolveQualityPlan(files, options.tier, {
    incrementalTypecheck: options.incrementalTypecheck,
  });
  printPlan(plan);
  const cacheEnabled = isCacheAllowedForOptions(options);
  if (options.explain || (options.dryRun && cacheEnabled)) {
    printCachePlan(plan.commands, files);
  }

  if (plan.blocked) {
    if (options.dryRun) {
      return;
    }
    process.exit(AFFECTED_SCOPE_REQUIRED_EXIT_CODE);
  }

  if (options.dryRun) {
    return;
  }

  runCommands(plan.commands, { cacheEnabled, changedFiles: files });
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
