// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(SCRIPT_DIR, "../..");

const PRODUCT_LANES_REGISTRY_PATH = path.join(
  ROOT_DIR,
  "docs",
  "registry",
  "product-lanes.json",
);

const readProductLanesFromRegistry = () => {
  const registry = JSON.parse(fs.readFileSync(PRODUCT_LANES_REGISTRY_PATH, "utf8"));
  if (!Array.isArray(registry.lanes)) {
    throw new Error(
      `[repo-governance] ${PRODUCT_LANES_REGISTRY_PATH} must contain a lanes array.`,
    );
  }
  return registry.lanes.map((lane) => ({
    ...lane,
    pathPrefixes:
      lane.pathPrefixes ??
      lane.codeRoots?.map((root) => `${String(root).replace(/\/+$/u, "")}/`) ??
      [],
    paths: lane.paths ?? [],
    releaseEntrypoints: lane.releaseEntrypoints ?? [],
    requiredChecks: lane.requiredChecks ?? lane.checks ?? [],
  }));
};

export const PRODUCT_LANES = readProductLanesFromRegistry();

export const PRODUCT_LANE_IDS = PRODUCT_LANES.map((lane) => lane.id);
export const PRODUCT_LANE_IDS_WITH_GOVERNANCE = [
  ...PRODUCT_LANE_IDS,
  "governance-docs",
];

export const PRODUCT_LANE_LABELS = new Map(
  PRODUCT_LANES.map((lane) => [lane.id, lane.title]),
);
PRODUCT_LANE_LABELS.set("governance-docs", "Governance / Docs");

export const COMMON_PRODUCT_PATHS = [
  ".editorconfig",
  ".nvmrc",
  ".gitignore",
  "package.json",
  "package-lock.json",
  "tools/quality/check-input-limits.mjs",
  "tsconfig.base.json",
];

export const GOVERNANCE_PATH_PREFIXES = [
  ".github/",
  ".githooks/",
  "contributors/",
  "docs/",
  "tools/gen/",
];
export const GOVERNANCE_PATHS = [
  ".gitleaks.toml",
  ".gitleaksignore",
  "AGENTS.md",
  "BRANDING.md",
  "CLA.md",
  "CODE_OF_CONDUCT.md",
  "COMMERCIAL-LICENSE.md",
  "CONTRIBUTING.md",
  "GOVERNANCE.md",
  "README.md",
  "README.es.md",
  "README.ja.md",
  "README.ko.md",
  "README.zh-CN.md",
  "SECURITY.md",
  "THIRD_PARTY_DATA.md",
  "THIRD_PARTY_NOTICES.md",
  "TRADEMARKS.md",
  "documentation-manifest.json",
  "docs/registry/product-lanes.json",
  "docs/registry/features.json",
  "docs/registry/contracts.json",
  "docs/registry/agent-scopes.json",
  "tools/docs/docs-check.mjs",
  "tools/docs/docs-check.test.mjs",
  "tools/docs/docs-where.mjs",
  "tools/gen/agents-rules.mjs",
  "tools/gen/agents-rules.test.mjs",
  "tools/gen/index.mjs",
  "tools/gen/install-git-hooks.mjs",
  "tools/gen/scaffold-core.mjs",
  "tools/gen/scaffold-core.test.mjs",
  "tools/quality/architecture-import-graph.mjs",
  "tools/quality/architecture-local-data-guards.mjs",
  "tools/quality/check-change-impact.mjs",
  "tools/quality/check-repo-structure.mjs",
  "tools/quality/repo-governance.mjs",
  "tools/quality/run-quality-for-impact.mjs",
  "tools/quality/run-quality-for-impact.test.mjs",
  "tools/quality/validate-pr-impact.mjs",
];

export const DOCS_ONLY_PREFIXES = ["docs/"];
export const DOCS_ONLY_PATHS = [
  "AGENTS.md",
  "BRANDING.md",
  "CLA.md",
  "CODE_OF_CONDUCT.md",
  "COMMERCIAL-LICENSE.md",
  "CONTRIBUTING.md",
  "GOVERNANCE.md",
  "README.md",
  "README.es.md",
  "README.ja.md",
  "README.ko.md",
  "README.zh-CN.md",
  "SECURITY.md",
  "THIRD_PARTY_DATA.md",
  "THIRD_PARTY_NOTICES.md",
  "TRADEMARKS.md",
  "documentation-manifest.json",
];
export const GENERATED_OUTPUT_PREFIXES = [".playwright-cli/", "logs/", "output/", "test-results/", "tmp/"];

const SHARED_EXPORT_ALIASES = new Map([
  ["packages/shared/src/i18n.ts", "i18n"],
  ["packages/shared/src/input-limits.ts", "input-limits"],
  [
    "packages/shared/src/contracts-desktop/api.ts",
    "contracts-desktop/api",
  ],
  [
    "packages/shared/src/contracts-desktop/http-api.ts",
    "contracts-desktop/http-api",
  ],
  ["packages/shared/src/csv.ts", "csv"],
  [
    "packages/shared/src/domain-calculations/fast-decision.ts",
    "domain-calculations/fast-decision",
  ],
  [
    "packages/shared/src/domain-calculations/fast-decision-capital-review.ts",
    "domain-calculations/fast-decision-capital-review",
  ],
  ["packages/shared/src/marketTime.ts", "marketTime"],
  ["packages/shared/src/replayNoteColors.ts", "replayNoteColors"],
  ["packages/shared/src/period.ts", "period"],
  ["packages/shared/src/replay.ts", "replay"],
  ["packages/shared/src/replayNoteBuilder.ts", "replayNoteBuilder"],
  ["packages/shared/src/replayNoteSuggestions.ts", "replayNoteSuggestions"],
  ["packages/shared/src/sessionNaming.ts", "sessionNaming"],
  ["packages/shared/src/simulationArtifactIdentity.ts", "simulationArtifactIdentity"],
  ["packages/shared/src/specialTrainingModes.ts", "specialTrainingModes"],
  [
    "packages/shared/src/domain-calculations/special-training-risk.ts",
    "domain-calculations/special-training-risk",
  ],
  [
    "packages/shared/src/domain-calculations/special-training-session-summary.ts",
    "domain-calculations/special-training-session-summary",
  ],
  [
    "packages/shared/src/domain-calculations/training-return-rate.ts",
    "domain-calculations/training-return-rate",
  ],
  [
    "packages/shared/src/domain-calculations/replay-review-window.ts",
    "domain-calculations/replay-review-window",
  ],
  ["packages/shared/src/systemDevSimulationCopy.ts", "systemDevSimulationCopy"],
  ["packages/shared/src/systemDevSimulationProfiles.ts", "systemDevSimulationProfiles"],
  ["packages/shared/src/timeframe.ts", "timeframe"],
  ["packages/shared/src/timezone.ts", "timezone"],
  ["packages/shared/src/trading.ts", "trading"],
]);

const SHARED_ALL_CONSUMERS_PATHS = new Set([
  "packages/shared/package.json",
  "packages/shared/tsconfig.json",
]);

const SHARED_WILDCARD_PREFIXES = ["packages/shared/src/i18n/messages/", "packages/shared/tests/"];

const SHARED_CONSUMER_WORKSPACES = [
  {
    id: "desktop-web",
    laneId: "desktop-app",
    roots: ["apps/desktop/web/src", "apps/desktop/web/scripts", "apps/desktop/web/tests", "apps/desktop/web/testHarness"],
  },
  {
    id: "desktop-local-api",
    laneId: "desktop-app",
    roots: ["apps/desktop/local-api/src", "apps/desktop/local-api/scripts", "apps/desktop/local-api/tests"],
  },
];

const SOURCE_FILE_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);

const normalizePathSeparators = (filePath) =>
  String(filePath || "").replaceAll(path.sep, "/");

export const normalizeRepoPath = (filePath) => {
  const normalized = normalizePathSeparators(filePath).replace(/^\.\/+/, "");
  return normalized.replace(/^\/+/, "");
};

const pathHasPrefix = (filePath, prefix) =>
  filePath === prefix.slice(0, -1) || filePath.startsWith(prefix);

const isAgentContextDocPath = (filePath) =>
  filePath === "AGENTS.md" || filePath === "CLAUDE.md" || filePath.endsWith("/AGENTS.md");

export const isGovernancePath = (filePath) => {
  const normalized = normalizeRepoPath(filePath);
  if (!normalized) {
    return false;
  }
  if (isAgentContextDocPath(normalized)) {
    return true;
  }
  if (GOVERNANCE_PATHS.includes(normalized)) {
    return true;
  }
  return GOVERNANCE_PATH_PREFIXES.some((prefix) => pathHasPrefix(normalized, prefix));
};

export const isDocsOnlyPath = (filePath) => {
  const normalized = normalizeRepoPath(filePath);
  if (!normalized) {
    return false;
  }
  if (isAgentContextDocPath(normalized)) {
    return true;
  }
  if (DOCS_ONLY_PATHS.includes(normalized)) {
    return true;
  }
  return DOCS_ONLY_PREFIXES.some((prefix) => pathHasPrefix(normalized, prefix));
};

export const isGeneratedOutputPath = (filePath) => {
  const normalized = normalizeRepoPath(filePath);
  if (!normalized) {
    return false;
  }
  return GENERATED_OUTPUT_PREFIXES.some((prefix) => pathHasPrefix(normalized, prefix));
};

export const getDirectLaneIdsForPath = (filePath) => {
  const normalized = normalizeRepoPath(filePath);
  if (!normalized) {
    return [];
  }
  if (isAgentContextDocPath(normalized)) {
    return [];
  }
  if (COMMON_PRODUCT_PATHS.includes(normalized)) {
    return PRODUCT_LANE_IDS;
  }
  return PRODUCT_LANES.filter((lane) =>
    lane.pathPrefixes.some((prefix) => pathHasPrefix(normalized, prefix)) ||
    (lane.paths ?? []).includes(normalized),
  ).map((lane) => lane.id);
};

export const resolveSharedExportKeysForPath = (filePath) => {
  const normalized = normalizeRepoPath(filePath);
  if (!normalized.startsWith("packages/shared/")) {
    return [];
  }
  if (SHARED_ALL_CONSUMERS_PATHS.has(normalized)) {
    return ["*"];
  }
  for (const prefix of SHARED_WILDCARD_PREFIXES) {
    if (pathHasPrefix(normalized, prefix)) {
      return ["*"];
    }
  }
  if (SHARED_EXPORT_ALIASES.has(normalized)) {
    return [SHARED_EXPORT_ALIASES.get(normalized)];
  }
  if (/^packages\/shared\/src\/[^/]+\.(ts|tsx)$/.test(normalized)) {
    return [path.basename(normalized, path.extname(normalized))];
  }
  return ["*"];
};

const walkFiles = (rootDir) => {
  const results = [];
  const pending = [rootDir];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || !fs.existsSync(current)) {
      continue;
    }
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "dist" || entry.name === "node_modules" || entry.name.startsWith(".")) {
        continue;
      }
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(nextPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (SOURCE_FILE_EXTENSIONS.has(path.extname(entry.name))) {
        results.push(nextPath);
      }
    }
  }
  return results;
};

const extractImportSpecifiers = (sourceText) => {
  const specs = new Set();
  const importRegex = /\bimport\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g;
  const exportFromRegex =
    /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g;
  const dynamicImportRegex = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  const requireRegex = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;

  let match = importRegex.exec(sourceText);
  while (match) {
    specs.add(match[1]);
    match = importRegex.exec(sourceText);
  }

  match = exportFromRegex.exec(sourceText);
  while (match) {
    specs.add(match[1]);
    match = exportFromRegex.exec(sourceText);
  }

  match = dynamicImportRegex.exec(sourceText);
  while (match) {
    specs.add(match[1]);
    match = dynamicImportRegex.exec(sourceText);
  }

  match = requireRegex.exec(sourceText);
  while (match) {
    specs.add(match[1]);
    match = requireRegex.exec(sourceText);
  }

  return [...specs];
};

const hasSharedImportMatch = (filePath, exportKeys) => {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const importSpecifiers = extractImportSpecifiers(sourceText);
  return importSpecifiers.some((specifier) => {
    if (specifier === "@zinuto/shared" || specifier.startsWith("@zinuto/shared/dist/")) {
      return true;
    }
    if (!specifier.startsWith("@zinuto/shared/")) {
      return false;
    }
    if (exportKeys.has("*")) {
      return true;
    }
    return exportKeys.has(specifier.slice("@zinuto/shared/".length));
  });
};

export const findSharedConsumerImpact = (sharedChangedFiles) => {
  const normalizedFiles = [...new Set(sharedChangedFiles.map(normalizeRepoPath).filter(Boolean))];
  const exportKeys = new Set();
  normalizedFiles.forEach((filePath) => {
    resolveSharedExportKeysForPath(filePath).forEach((key) => exportKeys.add(key));
  });

  const consumerWorkspaces = new Set();
  const consumerLaneIds = new Set();

  if (normalizedFiles.length === 0) {
    return {
      changedFiles: [],
      exportKeys: [],
      consumerWorkspaceIds: [],
      consumerLaneIds: [],
    };
  }

  if (exportKeys.has("*")) {
    SHARED_CONSUMER_WORKSPACES.forEach((workspace) => {
      consumerWorkspaces.add(workspace.id);
      consumerLaneIds.add(workspace.laneId);
    });
  } else {
    for (const workspace of SHARED_CONSUMER_WORKSPACES) {
      const files = workspace.roots.flatMap((relativeRoot) =>
        walkFiles(path.join(ROOT_DIR, relativeRoot)),
      );
      const matched = files.some((filePath) => hasSharedImportMatch(filePath, exportKeys));
      if (matched) {
        consumerWorkspaces.add(workspace.id);
        consumerLaneIds.add(workspace.laneId);
      }
    }
  }
  return {
    changedFiles: normalizedFiles,
    exportKeys: [...exportKeys].sort(),
    consumerWorkspaceIds: [...consumerWorkspaces].sort(),
    consumerLaneIds: [...consumerLaneIds].sort(),
  };
};

export const computeChangeImpact = (changedFiles) => {
  const normalizedFiles = [
    ...new Set(
      changedFiles
        .map(normalizeRepoPath)
        .filter(Boolean)
        .filter((filePath) => !isGeneratedOutputPath(filePath)),
    ),
  ].sort();
  const directLaneIds = new Set();
  const sharedChangedFiles = [];
  const governanceFiles = [];
  const unmappedFiles = [];

  for (const filePath of normalizedFiles) {
    const laneIds = getDirectLaneIdsForPath(filePath);
    if (laneIds.length > 0) {
      laneIds.forEach((laneId) => directLaneIds.add(laneId));
      if (filePath.startsWith("packages/shared/")) {
        sharedChangedFiles.push(filePath);
      }
      continue;
    }

    if (isGovernancePath(filePath)) {
      governanceFiles.push(filePath);
      continue;
    }

    unmappedFiles.push(filePath);
  }

  const sharedImpact = findSharedConsumerImpact(sharedChangedFiles);
  sharedImpact.consumerLaneIds.forEach((laneId) => directLaneIds.add(laneId));

  const impactedLaneIds = [...directLaneIds].sort(
    (left, right) => PRODUCT_LANE_IDS.indexOf(left) - PRODUCT_LANE_IDS.indexOf(right),
  );

  const docsOnly =
    normalizedFiles.length > 0 && normalizedFiles.every((filePath) => isDocsOnlyPath(filePath));
  const governanceOnly =
    impactedLaneIds.length === 0 &&
    normalizedFiles.length > 0 &&
    normalizedFiles.every((filePath) => isGovernancePath(filePath));

  return {
    changedFiles: normalizedFiles,
    impactedLaneIds,
    governanceFiles,
    governanceOnly,
    docsOnly,
    sharedImpact,
    unmappedFiles,
  };
};

export const formatChangeImpactReport = (impact) => {
  const lines = [];
  lines.push("Change Impact");
  lines.push(`Changed files: ${impact.changedFiles.length}`);
  lines.push(
    `Impacted product lines: ${impact.impactedLaneIds.length > 0 ? impact.impactedLaneIds.join(", ") : "(none)"}`,
  );
  if (impact.governanceOnly) {
    lines.push("Governance / docs only: yes");
  }
  if (impact.sharedImpact.changedFiles.length > 0) {
    lines.push(
      `Shared exports touched: ${impact.sharedImpact.exportKeys.length > 0 ? impact.sharedImpact.exportKeys.join(", ") : "(none)"}`,
    );
    lines.push(
      `Shared consumer lanes: ${impact.sharedImpact.consumerLaneIds.length > 0 ? impact.sharedImpact.consumerLaneIds.join(", ") : "(none)"}`,
    );
  }
  if (impact.unmappedFiles.length > 0) {
    lines.push(`Unmapped files: ${impact.unmappedFiles.join(", ")}`);
  }
  return `${lines.join("\n")}\n`;
};
