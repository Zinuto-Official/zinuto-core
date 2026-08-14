// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALLOWED_BACKEND_SQLITE_PREPARE_FILES,
  ALLOWED_TAURI_BRIDGE_FILES,
  ALLOWED_TAURI_CUSTOM_COMMANDS,
  ARCHITECTURE_FILE_LINE_ALLOWLIST,
  ARCHITECTURE_MAX_FILE_LINES,
  ARCHITECTURE_PRIVATE_MODULE_SEGMENTS,
  FRONTEND_API_ENTRY_FILE,
  REQUIRED_DESKTOP_BUNDLE_RESOURCES,
  REQUIRED_MACOS_BUNDLE_FILES,
  REQUIRED_TAURI_BUILD_COMMAND_FRAGMENT,
  REQUIRED_TAURI_DEV_COMMAND_FRAGMENT,
  REQUIRED_WINDOWS_BUNDLE_RESOURCES,
  REQUIRED_WINDOWS_NSIS_INSTALLER_HOOK,
} from "./architecture-guard-config.mjs";
import {
  findAppProductRootForRepoPath,
  findAppProductRootForSpecifier,
  getDesktopLocalApiApplicationOwnershipViolation,
  getDesktopLocalApiLayerBoundaryViolation,
  getFrontendAppShellBoundaryViolation,
  getFrontendBusinessFactImportViolation,
  getFrontendCustomIndicatorWorkspaceViolation,
  getFrontendCustomIndicatorRuntimeLeftoverViolation,
  getFrontendKernelReplacementForAppShellImport,
  getFrontendRuntimeApiPrivateImportViolation,
  getFrontendSecondaryWindowBridgeBoundaryViolation,
  getTestAndDevProductLaneImportViolation,
  isFrontendApiDomainModuleFile,
} from "./architecture-import-boundaries.mjs";
import {
  collectImportCycles,
  collectReachableTsFiles,
  collectWorkspaceMissingDependencies,
  extractImportSpecifiers,
  extractRuntimeImportSpecifiers,
  pathIsInside,
  resolveImportCandidates,
  resolveRelativeImportBase,
} from "./architecture-import-graph.mjs";
import { collectLocalDataUpdateArchitectureViolations } from "./architecture-local-data-guards.mjs";
import { collectTypographyArchitectureViolations } from "./architecture-typography-guards.mjs";
import { getChallengeStatsReadModelDataViolation } from "./architecture-single-source-guards.mjs";
import { readI18nMessageSources } from "../docs/i18n-message-source-utils.mjs";
import { loadArchitectureComposition } from "./architecture-composition.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "../..");

const frontendSrcRoot = path.join(projectRoot, "apps", "desktop", "web", "src");
const backendSrcRoot = path.join(
  projectRoot,
  "apps",
  "desktop",
  "local-api",
  "src",
);
const sharedRoot = path.join(projectRoot, "packages", "shared");
const toolsRoot = path.join(projectRoot, "tools");
const srcTauriRoot = path.join(projectRoot, "apps", "desktop", "shell");
const tauriMainRsPath = path.join(srcTauriRoot, "src", "main.rs");
const tauriBackendRuntimeRsPath = path.join(
  srcTauriRoot,
  "src",
  "runtime",
  "backend_runtime.rs",
);
const tauriBackendRuntimeModuleRoot = path.join(
  srcTauriRoot,
  "src",
  "runtime",
  "backend_runtime",
);
const tauriTransportRsPath = path.join(
  srcTauriRoot,
  "src",
  "bridge",
  "transport.rs",
);
const tauriNativeMenuRsPath = path.join(
  srcTauriRoot,
  "src",
  "platform",
  "native_menu.rs",
);
const tauriBuildRsPath = path.join(srcTauriRoot, "build.rs");
const tauriConfigPath = path.join(srcTauriRoot, "tauri.conf.json");
const tauriWindowsConfigPath = path.join(
  srcTauriRoot,
  "tauri.windows.conf.json",
);
const tauriDefaultCapabilityPath = path.join(
  srcTauriRoot,
  "capabilities",
  "default.json",
);
const frontendPackageJsonPath = path.join(
  projectRoot,
  "apps",
  "desktop",
  "web",
  "package.json",
);
const backendPackageJsonPath = path.join(
  projectRoot,
  "apps",
  "desktop",
  "local-api",
  "package.json",
);
const sharedPackageJsonPath = path.join(sharedRoot, "package.json");

const ARCH_PREFIX = "[arch-check]";

const collectFiles = (dirPath, predicate) => {
  const results = [];
  const walk = (currentPath) => {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && predicate(fullPath)) {
        results.push(fullPath);
      }
    }
  };
  walk(dirPath);
  return results;
};

const collectFilesIfExists = (dirPath, predicate) =>
  fs.existsSync(dirPath) ? collectFiles(dirPath, predicate) : [];

const sourceFileMatcher = (filePath) =>
  filePath.endsWith(".ts") ||
  filePath.endsWith(".tsx") ||
  filePath.endsWith(".css");

const sourceFiles = [
  ...collectFiles(frontendSrcRoot, sourceFileMatcher),
  ...collectFiles(backendSrcRoot, sourceFileMatcher),
];

const frontendJsSourceFiles = collectFiles(
  frontendSrcRoot,
  (filePath) =>
    filePath.endsWith(".js") ||
    filePath.endsWith(".jsx") ||
    filePath.endsWith(".mjs") ||
    filePath.endsWith(".cjs"),
);

const backendJsSourceFiles = collectFiles(
  backendSrcRoot,
  (filePath) =>
    filePath.endsWith(".js") ||
    filePath.endsWith(".jsx") ||
    filePath.endsWith(".mjs") ||
    filePath.endsWith(".cjs"),
);

const sharedJsSourceFiles = collectFiles(
  sharedRoot,
  (filePath) =>
    !filePath.includes(`${path.sep}dist${path.sep}`) &&
    (filePath.endsWith(".js") ||
      filePath.endsWith(".jsx") ||
      filePath.endsWith(".mjs") ||
      filePath.endsWith(".cjs")),
);

const toRel = (filePath) =>
  path.relative(projectRoot, filePath).replaceAll(path.sep, "/");
const toRelativeImportRelPath = (filePath) =>
  filePath ? toRel(filePath) : null;
const isTestLikeFile = (filePath) =>
  /\.(test|spec)\.(ts|tsx)$/.test(toRel(filePath));
const readJsonFile = (filePath) =>
  JSON.parse(fs.readFileSync(filePath, "utf8"));
const countFileLines = (filePath) =>
  fs.readFileSync(filePath, "utf8").split(/\r?\n/).length;
const normalizeRepoPath = (value) => {
  const text = String(value ?? "")
    .trim()
    .replaceAll(path.sep, "/");
  if (!text) {
    return "";
  }
  return path.isAbsolute(text)
    ? toRel(text)
    : path.normalize(text).replaceAll(path.sep, "/").replace(/^\.\//u, "");
};
const parseArgs = (argv) => {
  const options = {
    compositionManifest: null,
    files: [],
    skipReachability: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--skip-reachability") {
      options.skipReachability = true;
      continue;
    }
    if (current === "--composition-manifest") {
      const manifestPath = String(argv[index + 1] ?? "").trim();
      if (!manifestPath || manifestPath.startsWith("--")) {
        throw new Error("--composition-manifest requires one manifest path.");
      }
      options.compositionManifest = manifestPath;
      index += 1;
      continue;
    }
    if (current === "--files") {
      index += 1;
      while (index < argv.length && !String(argv[index]).startsWith("--")) {
        const normalized = normalizeRepoPath(argv[index]);
        if (normalized) {
          options.files.push(normalized);
        }
        index += 1;
      }
      index -= 1;
      continue;
    }
    if (current === "--help" || current === "-h") {
      process.stdout.write(
        [
          "Usage:",
          "  node tools/quality/check-architecture.mjs [--composition-manifest <path>] [--files <path> ...] [--skip-reachability]",
        ].join("\n"),
      );
      process.stdout.write("\n");
      process.exit(0);
    }
    throw new Error(`Unknown option: ${current}`);
  }
  return options;
};
const options = parseArgs(process.argv.slice(2));
const architectureComposition = loadArchitectureComposition({
  projectRoot,
  manifestPath: options.compositionManifest,
});
const scopedFiles = new Set(options.files);
const hasScopedFiles = scopedFiles.size > 0;
const isViolationInScope = (filePath) => {
  if (!hasScopedFiles) {
    return true;
  }
  const relPath = String(filePath ?? "");
  if (scopedFiles.has(relPath)) {
    return true;
  }
  if (relPath.endsWith("/**")) {
    const prefix = relPath.slice(0, -3);
    return [...scopedFiles].some((scopedFile) => scopedFile.startsWith(prefix));
  }
  return false;
};
const getCspDirective = (csp, directiveName) => {
  const directive = String(csp ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${directiveName} `));
  if (!directive) {
    return "";
  }
  return directive.slice(directiveName.length).trim();
};

const sharedTsSourceFiles = collectFiles(
  sharedRoot,
  (filePath) =>
    !filePath.includes(`${path.sep}dist${path.sep}`) &&
    (filePath.endsWith(".ts") || filePath.endsWith(".tsx")),
).filter((filePath) => !isTestLikeFile(filePath));

const sharedBoundaryConsumerFiles = [
  ...collectFiles(
    frontendSrcRoot,
    (filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx"),
  ),
  ...collectFiles(
    backendSrcRoot,
    (filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx"),
  ),
  ...collectFilesIfExists(
    path.join(projectRoot, "apps", "desktop", "web", "testHarness"),
    (filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx"),
  ),
  ...collectFilesIfExists(
    path.join(projectRoot, "apps", "desktop", "web", "tests"),
    (filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx"),
  ),
  ...collectFilesIfExists(
    path.join(projectRoot, "apps", "desktop", "local-api", "tests"),
    (filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx"),
  ),
  ...collectFiles(
    toolsRoot,
    (filePath) =>
      filePath.endsWith(".js") ||
      filePath.endsWith(".mjs") ||
      filePath.endsWith(".cjs") ||
      filePath.endsWith(".ts") ||
      filePath.endsWith(".mts") ||
      filePath.endsWith(".cts") ||
      filePath.endsWith(".tsx"),
  ),
];

const appBoundarySourceFiles = [
  ...collectFiles(
    frontendSrcRoot,
    (filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx"),
  ),
  ...collectFiles(backendSrcRoot, (filePath) => filePath.endsWith(".ts")),
].filter((filePath) => !isTestLikeFile(filePath));

const testAndDevBoundarySourceFiles = [
  ...new Set([
    ...collectFilesIfExists(
      path.join(projectRoot, "apps", "desktop", "web", "testHarness"),
      (filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx"),
    ),
    ...collectFilesIfExists(
      path.join(projectRoot, "apps", "desktop", "web", "tests"),
      (filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx"),
    ),
    ...collectFilesIfExists(
      path.join(projectRoot, "apps", "desktop", "local-api", "tests"),
      (filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx"),
    ),
    ...collectFilesIfExists(
      path.join(projectRoot, "packages", "shared", "tests"),
      (filePath) =>
        filePath.endsWith(".ts") ||
        filePath.endsWith(".tsx") ||
        filePath.endsWith(".js") ||
        filePath.endsWith(".jsx") ||
        filePath.endsWith(".mjs") ||
        filePath.endsWith(".mts") ||
        filePath.endsWith(".cts") ||
        filePath.endsWith(".cjs"),
    ),
    ...collectFilesIfExists(
      path.join(projectRoot, "tools", "dev"),
      (filePath) =>
        filePath.endsWith(".ts") ||
        filePath.endsWith(".tsx") ||
        filePath.endsWith(".js") ||
        filePath.endsWith(".jsx") ||
        filePath.endsWith(".mjs") ||
        filePath.endsWith(".mts") ||
        filePath.endsWith(".cts") ||
        filePath.endsWith(".cjs"),
    ),
    ...collectFilesIfExists(toolsRoot, (filePath) =>
      /\.(test|spec)\.(?:[cm]?[jt]sx?|mts)$/u.test(filePath),
    ),
  ]),
];

const frontendWorkspaceSourceFiles = [
  ...collectFiles(
    frontendSrcRoot,
    (filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx"),
  ),
  ...collectFiles(
    path.join(projectRoot, "apps", "desktop", "web", "scripts"),
    (filePath) =>
      filePath.endsWith(".js") ||
      filePath.endsWith(".mjs") ||
      filePath.endsWith(".cjs") ||
      filePath.endsWith(".ts"),
  ),
].filter((filePath) => !isTestLikeFile(filePath));

const backendWorkspaceSourceFiles = [
  ...collectFiles(backendSrcRoot, (filePath) => filePath.endsWith(".ts")),
  ...collectFiles(
    path.join(projectRoot, "apps", "desktop", "local-api", "scripts"),
    (filePath) =>
      filePath.endsWith(".js") ||
      filePath.endsWith(".mjs") ||
      filePath.endsWith(".cjs") ||
      filePath.endsWith(".ts"),
  ),
].filter((filePath) => !isTestLikeFile(filePath));

const sharedWorkspaceSourceFiles = collectFiles(
  sharedRoot,
  (filePath) =>
    !filePath.includes(`${path.sep}dist${path.sep}`) &&
    (filePath.endsWith(".ts") || filePath.endsWith(".tsx")),
).filter((filePath) => !isTestLikeFile(filePath));

const tsSourceFiles = sourceFiles
  .filter((filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx"))
  .filter((filePath) => !isTestLikeFile(filePath));

const parseRustGenerateHandlerCommands = (sourceText) => {
  const commands = new Set();
  const generateHandlerRegex = /generate_handler!\s*\[([\s\S]*?)\]/g;
  let match = generateHandlerRegex.exec(sourceText);
  while (match) {
    const body = String(match[1] ?? "");
    body
      .split(",")
      .map((entry) => entry.replace(/\/\/.*$/g, "").trim())
      .filter(Boolean)
      .forEach((entry) => {
        const commandName = entry
          .split("::")
          .at(-1)
          ?.match(/[A-Za-z_][A-Za-z0-9_]*/)?.[0];
        if (commandName) {
          commands.add(commandName);
        }
      });
    match = generateHandlerRegex.exec(sourceText);
  }
  return [...commands];
};

const parseInvokeCommandNames = (sourceText) => {
  const commands = new Set();
  const invokeRegex = /\binvoke(?:<[^>]+>)?\s*\(\s*['"]([^'"]+)['"]/g;
  let match = invokeRegex.exec(sourceText);
  while (match) {
    const commandName = String(match[1] ?? "").trim();
    if (commandName) {
      commands.add(commandName);
    }
    match = invokeRegex.exec(sourceText);
  }
  return [...commands];
};

const setToSortedArray = (value) =>
  [...value].sort((left, right) => left.localeCompare(right, "en"));
const setsEqual = (left, right) =>
  left.size === right.size && [...left].every((item) => right.has(item));
const isTradingServiceBarrelImport = (specifier) =>
  specifier === "../application/tradingService.js" ||
  specifier === "../tradingService.js" ||
  specifier === "./tradingService.js" ||
  specifier.endsWith("/application/tradingService.js") ||
  specifier.endsWith("/tradingService.js");
const isSpecialTrainingServiceBarrelImport = (specifier) =>
  specifier === "../specialTrainingService.js" ||
  specifier === "./specialTrainingService.js" ||
  specifier.endsWith("/specialTrainingService.js");

const violations = [];

const pushViolation = (filePath, message) => {
  violations.push({
    filePath: toRel(filePath),
    message,
  });
};

const pushProjectViolation = (relPath, message) => {
  violations.push({
    filePath: relPath,
    message,
  });
};

const ALLOWED_TAURI_CUSTOM_COMMAND_SET = new Set([
  ...ALLOWED_TAURI_CUSTOM_COMMANDS,
  ...architectureComposition.tauriCustomCommands,
]);
const allowedTauriBridgeFiles = [
  ...ALLOWED_TAURI_BRIDGE_FILES,
  ...architectureComposition.tauriBridgeFiles,
];
const SHARED_FORBIDDEN_IMPORT_PATTERNS = [
  { pattern: /^node:/, label: "node:* runtime APIs" },
  { pattern: /^@tauri-apps\//, label: "Tauri APIs" },
  { pattern: /^express(?:\/|$)/, label: "Express runtime" },
  { pattern: /^better-sqlite3(?:\/|$)/, label: "better-sqlite3" },
  { pattern: /duckdb/i, label: "DuckDB runtime" },
];
const allowedSharedExportSpecifiers = fs.existsSync(sharedPackageJsonPath)
  ? new Set(
      Object.keys(readJsonFile(sharedPackageJsonPath).exports ?? {})
        .filter((key) => key.startsWith("./"))
        .map((key) => `@zinuto/shared/${String(key).replace(/^\.\//, "")}`),
    )
  : new Set();
const PUBLIC_SHARED_SOURCE_EXEMPTIONS = [
  /^packages\/shared\/src\/copy\.ts$/u,
  /^packages\/shared\/src\/i18n\.generated(?:\.[A-Za-z-]+)?\.ts$/u,
  /^packages\/shared\/src\/i18n\.(?:browser|loaders\.generated|metadata\.generated)\.ts$/u,
  /^packages\/shared\/src\/i18nRuntime\.ts$/u,
];

const isAllowedTauriBridgeFile = (relPath) =>
  allowedTauriBridgeFiles.includes(relPath);
const frontendApiEntryPath = path.join(
  projectRoot,
  ...FRONTEND_API_ENTRY_FILE.split("/"),
);
const ALLOWED_BACKEND_SQLITE_PREPARE_FILE_SET = new Set(
  ALLOWED_BACKEND_SQLITE_PREPARE_FILES,
);
const BACKEND_SQLITE_PREPARE_PATTERN = /\b[A-Za-z_$][\w$]*\s*\.\s*prepare\s*\(/;
const BACKEND_SQLITE_IMPORT_PATTERN =
  /\bimport\s+(?:type\s+)?\w+\s+from\s+['"]better-sqlite3['"]/u;
const isBackendSqlitePrepareConventionFile = (relPath) =>
  relPath.startsWith("apps/desktop/local-api/src/infrastructure/db/") ||
  /(?:Repository|Store)\.ts$/.test(relPath);
const isAllowedBackendSqlitePrepareFile = (relPath) =>
  isBackendSqlitePrepareConventionFile(relPath) ||
  ALLOWED_BACKEND_SQLITE_PREPARE_FILE_SET.has(relPath);
const isAllowedGraphicsFile = (relPath) =>
  relPath.startsWith("apps/desktop/web/src/assets/graphics/");
const GRAPHIC_ASSET_FILE_PATTERN =
  /\.(svg|png|jpe?g|webp|gif|ico|icns)(\?.*)?$/i;
const HARD_CODED_GRAPHIC_PATH_PATTERN =
  /['"`][^'"`\n]+\.(svg|png|jpe?g|webp|gif|ico|icns)(?:\?[^'"`\n]*)?['"`]/i;
const HARD_CODED_ICON_GLYPH_PATTERN =
  /[\u2190-\u2193\u22EE\u2713]|\p{Extended_Pictographic}/u;
const isAllowedIconGlyphFile = (relPath) => isAllowedGraphicsFile(relPath);

for (const relPath of ALLOWED_BACKEND_SQLITE_PREPARE_FILES) {
  const filePath = path.join(projectRoot, ...relPath.split("/"));
  if (isBackendSqlitePrepareConventionFile(relPath)) {
    pushProjectViolation(
      relPath,
      "Explicit SQLite prepare allowlist entries must only cover non-conventional data access modules.",
    );
    continue;
  }
  if (!fs.existsSync(filePath)) {
    pushProjectViolation(
      relPath,
      "Explicit SQLite prepare allowlist entry points to a missing file.",
    );
    continue;
  }
  const allowlistedSource = fs.readFileSync(filePath, "utf8");
  if (
    !BACKEND_SQLITE_IMPORT_PATTERN.test(allowlistedSource) ||
    !BACKEND_SQLITE_PREPARE_PATTERN.test(allowlistedSource)
  ) {
    pushProjectViolation(
      relPath,
      "Explicit SQLite prepare allowlist entry must import better-sqlite3 and call prepare() directly on a Database connection; remove it from the allowlist otherwise.",
    );
  }
}

const frontendLayerRootFromRelPath = (relPath) => {
  if (relPath.startsWith("apps/desktop/web/src/app-shell/")) {
    return "apps/desktop/web/src/app-shell";
  }
  if (
    !relPath.startsWith("apps/desktop/web/src/domains/") &&
    !relPath.startsWith("apps/desktop/web/src/workspaces/")
  ) {
    return null;
  }
  const parts = relPath.split("/");
  return parts.length >= 6 ? parts.slice(0, 6).join("/") : null;
};
const frontendLayerRootFromSpecifier = (specifier) => {
  if (specifier === "@/app-shell" || specifier.startsWith("@/app-shell/")) {
    return "apps/desktop/web/src/app-shell";
  }
  const match = /^@\/(domains|workspaces)\/([^/]+)/.exec(specifier);
  return match ? `apps/desktop/web/src/${match[1]}/${match[2]}` : null;
};
const isFrontendAppShellAppTypesImportSpecifier = (specifier) =>
  specifier === "@/app-shell/appTypes";
const isFrontendAppShellI18nImportSpecifier = (specifier) =>
  specifier === "@/app-shell/i18n" || specifier.startsWith("@/app-shell/i18n/");
const FRONTEND_APP_TYPES_OWNER_IMPORT_REPLACEMENTS = new Map([
  ["ActiveDrawTool", "@/domains/chart/drawingTypes"],
  ["AggregatedBarItem", "@/domains/chart/replayAggregation"],
  ["ArchivedReplayData", "@/domains/history/replayArchiveTypes"],
  ["BaseTimeframe", "@zinuto/shared/timeframe"],
  ["ChartRenderMode", "@/domains/chart/chartRenderMode"],
  ["CsvImportRuleConfidence", "@/domains/data-import/dataSourceTypes"],
  ["CsvImportRuleFieldKey", "@/domains/data-import/dataSourceTypes"],
  ["CsvImportRulePriceFamily", "@/domains/data-import/dataSourceTypes"],
  ["DataSourceSyncMode", "@/domains/data-import/dataSourceTypes"],
  ["DataSourceSyncMonitorEntry", "@/domains/data-import/dataSourceTypes"],
  ["DataSourceSyncMonitorStateById", "@/domains/data-import/dataSourceTypes"],
  ["DataSourceSyncMonitorStatus", "@/domains/data-import/dataSourceTypes"],
  ["DataSourceSyncPreference", "@/domains/data-import/dataSourceTypes"],
  ["DataSourceSyncPrefsById", "@/domains/data-import/dataSourceTypes"],
  ["DataTaskOperationProgress", "@/domains/data-import/dataSourceTypes"],
  ["DataTaskOperationProgressTone", "@/domains/data-import/dataSourceTypes"],
  ["DesktopCloseButtonAction", "@/frontend-kernel/windowBehaviorTypes"],
  ["DisplayPeriodKey", "@/domains/chart/chartPeriods"],
  ["DrawLineType", "@/domains/chart/drawingTypes"],
  ["DrawTool", "@/domains/chart/drawingTypes"],
  ["FontSizePreset", "@/frontend-kernel/typography"],
  ["OrderPriceMode", "@zinuto/shared/trading"],
  ["PendingCsvFolderImport", "@/domains/data-import/dataSourceTypes"],
  [
    "PendingLocalDataSourceSyncPreview",
    "@/domains/data-import/dataSourceTypes",
  ],
  [
    "PreparingLocalDataSourceSyncPreview",
    "@/domains/data-import/dataSourceTypes",
  ],
  ["ReplayBar", "@/domains/trainer/trainerTypes"],
  ["ReplayContextSummaryChip", "@/frontend-kernel/replayContext"],
  ["ReplayCurvePoint", "@/domains/trainer/trainerTypes"],
  ["ReplayNote", "@/domains/notes/replayNoteModel"],
  ["ReplayTradeRound", "@/domains/trainer/trainerTypes"],
  ["SavedDrawingOverlay", "@/domains/chart/drawingTypes"],
  [
    "SpecialTrainingReplayOverlayContext",
    "@/domains/chart/overlays/specialTrainingReplayOverlayTypes",
  ],
  ["SystemMarkerRenderer", "@/domains/chart/systemMarkerTypes"],
  ["TradeInputMode", "@zinuto/shared/trading"],
  ["UiLanguage", "@/frontend-kernel/typography"],
]);
const FRONTEND_APP_TYPES_SHARED_OWNER_EXPORT_REPLACEMENTS = new Map([
  ["BaseTimeframe", 'BaseTimeframe from "@zinuto/shared/timeframe"'],
  ["OrderPriceMode", 'PriceMode from "@zinuto/shared/trading"'],
  ["TradeInputMode", 'OrderInputMode from "@zinuto/shared/trading"'],
]);
const buildFrontendAppTypesOwnerImportMessage = (importedName, replacement) =>
  replacement.includes(" from ")
    ? `frontend appTypes no longer owns ${importedName}. Use ${replacement} instead.`
    : `frontend appTypes no longer owns ${importedName}. Import it from "${replacement}" instead.`;
const extractAppTypesNamedImports = (sourceText) => {
  const names = [];
  const appTypesImportRegex =
    /\bimport\s+type\s*\{([^}]*)\}\s+from\s+['"]@\/(?:app-shell|frontend-kernel)\/appTypes['"]/g;
  let match = appTypesImportRegex.exec(sourceText);
  while (match) {
    String(match[1] ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) =>
        entry
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/i)[0]
          ?.trim(),
      )
      .filter(Boolean)
      .forEach((name) => names.push(name));
    match = appTypesImportRegex.exec(sourceText);
  }
  return names;
};
const extractAppTypesNamedExports = (sourceText) => {
  const names = [];
  const typeDeclarationRegex = /\bexport\s+type\s+([A-Za-z_$][\w$]*)\b/g;
  const interfaceDeclarationRegex =
    /\bexport\s+interface\s+([A-Za-z_$][\w$]*)\b/g;
  const typeExportListRegex = /\bexport\s+type\s*\{([^}]*)\}/g;
  const mixedExportListRegex = /\bexport\s*\{([^}]*)\}/g;

  const pushExportListNames = (exportListText, requireTypePrefix = false) => {
    String(exportListText ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => {
        const hasTypePrefix = entry.startsWith("type ");
        if (requireTypePrefix && !hasTypePrefix) {
          return;
        }
        const name = entry
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/i)[0]
          ?.trim();
        if (name) {
          names.push(name);
        }
      });
  };

  let match = typeDeclarationRegex.exec(sourceText);
  while (match) {
    names.push(match[1]);
    match = typeDeclarationRegex.exec(sourceText);
  }

  match = interfaceDeclarationRegex.exec(sourceText);
  while (match) {
    names.push(match[1]);
    match = interfaceDeclarationRegex.exec(sourceText);
  }

  match = typeExportListRegex.exec(sourceText);
  while (match) {
    pushExportListNames(match[1]);
    match = typeExportListRegex.exec(sourceText);
  }

  match = mixedExportListRegex.exec(sourceText);
  while (match) {
    pushExportListNames(match[1], true);
    match = mixedExportListRegex.exec(sourceText);
  }

  return [...new Set(names)];
};
const I18N_EXCLUSIVE_NAMESPACE_OWNERS = new Map([
  ["chart", "training-replay.json"],
  ["desktopNotice", "platform-core.json"],
  ["errors", "data-settings.json"],
  ["onboarding", "platform-core.json"],
  ["stats", "platform-core.json"],
]);
const resolveFileBudget = (relPath) => {
  if (relPath.endsWith(".css")) {
    return {
      budget: ARCHITECTURE_MAX_FILE_LINES.css,
      kind: "css",
    };
  }
  if (relPath.startsWith("apps/desktop/local-api/src/http/")) {
    return {
      budget: ARCHITECTURE_MAX_FILE_LINES.router,
      kind: "router",
    };
  }
  if (
    /(Page|PageView|Surface|SurfaceView|Section|Dialog|Drawer|Chart|Runtime)\.(tsx|js)$/.test(
      relPath,
    )
  ) {
    return {
      budget: ARCHITECTURE_MAX_FILE_LINES.page,
      kind: "page",
    };
  }
  if (
    /\/(use[A-Z][^/]*|.*ViewModel|.*Controller)\.(ts|tsx|js)$/.test(relPath)
  ) {
    return {
      budget: ARCHITECTURE_MAX_FILE_LINES.hookOrViewModel,
      kind: "hook/view-model",
    };
  }
  if (
    (/\/(?:service|store|runtime|index|main|.*(?:Service|Store|Runtime|Core|Repository|Engine|Writer|Executor|Runner|Import))\.(ts|js|rs)$/.test(
      relPath,
    ) &&
      (relPath.startsWith("apps/desktop/local-api/src/application/") ||
        relPath.startsWith("apps/desktop/web/src/") ||
        relPath.startsWith("apps/desktop/shell/src/") ||
        relPath.startsWith(
          "apps/desktop/local-api/src/infrastructure/db/marketDatabase/",
        ) ||
        relPath.startsWith(
          "apps/desktop/local-api/src/infrastructure/db/marketCsv",
        ) ||
        relPath.startsWith(
          "apps/desktop/local-api/src/infrastructure/db/training/",
        ) ||
        relPath.startsWith(
          "apps/desktop/local-api/src/infrastructure/db/history/",
        ))) ||
    relPath === "apps/desktop/local-api/src/infrastructure/db/database.ts"
  ) {
    return {
      budget: ARCHITECTURE_MAX_FILE_LINES.serviceOrStore,
      kind: "service/store",
    };
  }
  return {
    budget: ARCHITECTURE_MAX_FILE_LINES.genericSource,
    kind: "generic production source",
  };
};

const lineBudgetCandidateFiles = [
  ...collectFiles(
    frontendSrcRoot,
    (filePath) =>
      filePath.endsWith(".ts") ||
      filePath.endsWith(".tsx") ||
      filePath.endsWith(".css"),
  ),
  ...collectFiles(backendSrcRoot, (filePath) => filePath.endsWith(".ts")),
  ...collectFiles(
    path.join(projectRoot, "apps", "desktop", "shell", "src"),
    (filePath) => filePath.endsWith(".rs"),
  ),
].filter((filePath) => !isTestLikeFile(filePath));

if (frontendJsSourceFiles.length) {
  violations.push({
    filePath: "apps/desktop/web/src/**",
    message:
      `JS source files detected under apps/desktop/web/src (${frontendJsSourceFiles.length}). ` +
      `Zinuto frontend must keep TS/TSX as the single source of truth. ` +
      `Offenders: ${frontendJsSourceFiles.map(toRel).slice(0, 24).join(", ")}${
        frontendJsSourceFiles.length > 24 ? ", ..." : ""
      }`,
  });
}

if (backendJsSourceFiles.length) {
  violations.push({
    filePath: "apps/desktop/local-api/src/**",
    message:
      `JS source files detected under apps/desktop/local-api/src (${backendJsSourceFiles.length}). ` +
      `Zinuto backend must keep TS as the single source of truth. ` +
      `Offenders: ${backendJsSourceFiles.map(toRel).slice(0, 24).join(", ")}${
        backendJsSourceFiles.length > 24 ? ", ..." : ""
      }`,
  });
}

if (sharedJsSourceFiles.length) {
  violations.push({
    filePath: "packages/shared/**",
    message:
      `JS source files detected under shared (${sharedJsSourceFiles.length}). ` +
      `@zinuto/shared must keep TS as the single source of truth and only emit JS into packages/shared/dist. ` +
      `Offenders: ${sharedJsSourceFiles.map(toRel).slice(0, 24).join(", ")}${
        sharedJsSourceFiles.length > 24 ? ", ..." : ""
      }`,
  });
}

if (fs.existsSync(sharedPackageJsonPath)) {
  const sharedPackageJson = readJsonFile(sharedPackageJsonPath);
  const sharedDistRoot = path.join(sharedRoot, "dist");
  const sharedDistExists = fs.existsSync(sharedDistRoot);
  const exportedSharedSourceFiles = new Set();
  for (const [exportKey, exportEntry] of Object.entries(
    sharedPackageJson.exports ?? {},
  )) {
    if (!exportKey.startsWith("./")) {
      continue;
    }
    const exportName = exportKey.slice(2);
    const expectedTypesEntry = `./dist/${exportName}.d.ts`;
    const expectedRuntimeEntry = `./dist/${exportName}.js`;
    const typesPath =
      typeof exportEntry?.types === "string"
        ? path.join(sharedRoot, exportEntry.types)
        : null;
    const defaultPath =
      typeof exportEntry?.default === "string"
        ? path.join(sharedRoot, exportEntry.default)
        : null;
    const sourcePaths = [
      path.join(sharedRoot, "src", `${exportName}.ts`),
      path.join(sharedRoot, "src", `${exportName}.tsx`),
    ];
    if (!sourcePaths.some((sourcePath) => fs.existsSync(sourcePath))) {
      violations.push({
        filePath: toRel(sharedPackageJsonPath),
        message: `Shared export ${exportKey} is missing an existing source entry.`,
      });
    }
    if (sharedDistExists && (!typesPath || !fs.existsSync(typesPath))) {
      violations.push({
        filePath: toRel(sharedPackageJsonPath),
        message: `Shared export ${exportKey} is missing an existing types entry.`,
      });
    }
    if (exportEntry?.types !== expectedTypesEntry) {
      violations.push({
        filePath: toRel(sharedPackageJsonPath),
        message: `Shared export ${exportKey} must point types to ${expectedTypesEntry}.`,
      });
    }
    if (sharedDistExists && (!defaultPath || !fs.existsSync(defaultPath))) {
      violations.push({
        filePath: toRel(sharedPackageJsonPath),
        message: `Shared export ${exportKey} is missing an existing runtime entry.`,
      });
    }
    if (exportEntry?.default !== expectedRuntimeEntry) {
      violations.push({
        filePath: toRel(sharedPackageJsonPath),
        message: `Shared export ${exportKey} must point runtime to ${expectedRuntimeEntry}.`,
      });
    }
    exportedSharedSourceFiles.add(`packages/shared/src/${exportName}.ts`);
    exportedSharedSourceFiles.add(`packages/shared/src/${exportName}.tsx`);
  }
  const unexportedSharedSources = sharedTsSourceFiles
    .map(toRel)
    .filter((relPath) =>
      /^packages\/shared\/src\/[^/]+\.(ts|tsx)$/u.test(relPath),
    )
    .filter(
      (relPath) =>
        !PUBLIC_SHARED_SOURCE_EXEMPTIONS.some((pattern) =>
          pattern.test(relPath),
        ),
    )
    .filter((relPath) => !exportedSharedSourceFiles.has(relPath));
  if (unexportedSharedSources.length) {
    violations.push({
      filePath: toRel(sharedPackageJsonPath),
      message:
        "Top-level shared source files must either be explicit package exports or documented internal exemptions. " +
        `Missing exports: ${unexportedSharedSources.join(", ")}.`,
    });
  }
}

const forbiddenUiImportPrefixes = [
  "@base-ui/react",
  "antd",
  "@ant-design/",
  "@mui/",
  "@chakra-ui/",
  "@mantine/",
  "semantic-ui-react",
  "react-bootstrap",
  "bootstrap",
  "primereact",
  "rsuite",
  "@nextui-org/",
  "element-plus",
];

const isForbiddenUiImport = (specifier) =>
  forbiddenUiImportPrefixes.some(
    (prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`),
  );

const isAllowedRadixConsumer = (relPath) =>
  relPath.startsWith("apps/desktop/web/src/ui/primitives/");
const SHADCN_NATIVE_UI_TAG_GUARD_PATTERN =
  /<\s*(button|input|textarea|select|dialog|details|summary)\b/g;
const SHADCN_DIALOG_ROLE_GUARD_PATTERN =
  /role\s*=\s*['"]dialog['"]|aria-modal\s*=\s*['"]true['"]/;
const SHADCN_COMPONENT_ONLY_NAMES = new Set([
  "SelectField",
  "SegmentedControl",
  "SearchInput",
  "ThemeToggle",
  "Keycap",
  "StatusPill",
  "Toolbar",
]);

if (fs.existsSync(frontendPackageJsonPath)) {
  const frontendPackageJson = readJsonFile(frontendPackageJsonPath);
  const declaredDeps = Object.keys({
    ...(frontendPackageJson.dependencies ?? {}),
    ...(frontendPackageJson.devDependencies ?? {}),
  });
  const forbiddenUiDeps = declaredDeps.filter((depName) =>
    isForbiddenUiImport(depName),
  );
  if (forbiddenUiDeps.length) {
    violations.push({
      filePath: toRel(frontendPackageJsonPath),
      message: `Forbidden UI dependencies declared: ${forbiddenUiDeps.join(", ")}. Use shadcn stack only.`,
    });
  }
}

for (const missingDependency of collectWorkspaceMissingDependencies({
  packageJsonPath: frontendPackageJsonPath,
  filePaths: frontendWorkspaceSourceFiles,
  workspaceLabel: "frontend",
  projectRoot,
})) {
  violations.push({
    filePath: missingDependency.importer,
    message: `apps/desktop/web/package.json is missing direct dependency "${missingDependency.packageName}" for this importer.`,
  });
}

for (const missingDependency of collectWorkspaceMissingDependencies({
  packageJsonPath: backendPackageJsonPath,
  filePaths: backendWorkspaceSourceFiles,
  workspaceLabel: "backend",
  projectRoot,
})) {
  violations.push({
    filePath: missingDependency.importer,
    message: `apps/desktop/local-api/package.json is missing direct dependency "${missingDependency.packageName}" for this importer.`,
  });
}

for (const missingDependency of collectWorkspaceMissingDependencies({
  packageJsonPath: sharedPackageJsonPath,
  filePaths: sharedWorkspaceSourceFiles,
  workspaceLabel: "shared",
  projectRoot,
})) {
  violations.push({
    filePath: missingDependency.importer,
    message: `packages/shared/package.json is missing direct dependency "${missingDependency.packageName}" for this importer.`,
  });
}

for (const filePath of lineBudgetCandidateFiles) {
  const relPath = toRel(filePath);
  const budgetInfo = resolveFileBudget(relPath);
  if (!budgetInfo) {
    continue;
  }
  const lineCount = countFileLines(filePath);
  if (lineCount <= budgetInfo.budget) {
    continue;
  }
  const allowlistedMax = ARCHITECTURE_FILE_LINE_ALLOWLIST[relPath];
  if (typeof allowlistedMax === "number" && lineCount <= allowlistedMax) {
    continue;
  }
  pushViolation(
    filePath,
    `File size budget exceeded for ${budgetInfo.kind}: ${lineCount} lines (budget ${budgetInfo.budget}${typeof allowlistedMax === "number" ? `, allowlisted max ${allowlistedMax}` : ""}).`,
  );
}

for (const relPath of Object.keys(ARCHITECTURE_FILE_LINE_ALLOWLIST)) {
  const filePath = path.join(projectRoot, relPath);
  if (!fs.existsSync(filePath)) {
    pushProjectViolation(
      relPath,
      "File size allowlist entry points to a missing file.",
    );
    continue;
  }
  const budgetInfo = resolveFileBudget(relPath);
  if (!budgetInfo) {
    pushProjectViolation(
      relPath,
      "File size allowlist entry does not match any active line-budget category.",
    );
    continue;
  }
  const lineCount = countFileLines(filePath);
  if (lineCount <= budgetInfo.budget) {
    pushProjectViolation(
      relPath,
      `File size allowlist entry is stale for ${budgetInfo.kind}: ${lineCount} lines (budget ${budgetInfo.budget}).`,
    );
  }
}

for (const filePath of sharedTsSourceFiles) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const importSpecifiers = extractImportSpecifiers(sourceText);

  for (const { pattern, label } of SHARED_FORBIDDEN_IMPORT_PATTERNS) {
    const matchedSpecifier = importSpecifiers.find((specifier) =>
      pattern.test(specifier),
    );
    if (matchedSpecifier) {
      pushViolation(
        filePath,
        `@zinuto/shared must stay pure. Forbidden ${label} import detected: "${matchedSpecifier}".`,
      );
    }
  }

  for (const specifier of importSpecifiers) {
    if (specifier.startsWith("@/")) {
      pushViolation(
        filePath,
        `@zinuto/shared cannot import frontend aliases. Found: "${specifier}".`,
      );
      continue;
    }

    const relativeBasePath = resolveRelativeImportBase(filePath, specifier);
    if (relativeBasePath) {
      if (!pathIsInside(relativeBasePath, sharedRoot)) {
        pushViolation(
          filePath,
          `@zinuto/shared relative imports must stay inside packages/shared/. Found: "${specifier}".`,
        );
      }
      continue;
    }

    if (
      specifier.startsWith("../frontend") ||
      specifier.startsWith("../../frontend") ||
      specifier.startsWith("../backend") ||
      specifier.startsWith("../../backend") ||
      specifier.includes("/apps/desktop/web/") ||
      specifier.includes("/apps/desktop/local-api/") ||
      specifier.includes("/apps/desktop/shell/")
    ) {
      pushViolation(
        filePath,
        `@zinuto/shared cannot import app layers directly. Found: "${specifier}".`,
      );
    }
  }
}

for (const filePath of sharedBoundaryConsumerFiles) {
  const relPath = toRel(filePath);
  if (relPath.startsWith("packages/shared/")) {
    continue;
  }
  const sourceText = fs.readFileSync(filePath, "utf8");
  const importSpecifiers = extractImportSpecifiers(sourceText);

  for (const specifier of importSpecifiers) {
    if (specifier.startsWith("@zinuto/shared/")) {
      if (!allowedSharedExportSpecifiers.has(specifier)) {
        pushViolation(
          filePath,
          `Shared imports must use declared package exports only. Found unsupported specifier "${specifier}".`,
        );
      }
      continue;
    }

    if (
      specifier === "@zinuto/shared" ||
      specifier.startsWith("@zinuto/shared/dist/")
    ) {
      pushViolation(
        filePath,
        `Consumers must import @zinuto/shared through explicit package exports only. Found "${specifier}".`,
      );
      continue;
    }

    const relativeBasePath = resolveRelativeImportBase(filePath, specifier);
    if (!relativeBasePath || !pathIsInside(relativeBasePath, sharedRoot)) {
      continue;
    }
    pushViolation(
      filePath,
      `Do not deep-import shared source files via relative paths ("${specifier}"). Use @zinuto/shared/<export> instead.`,
    );
  }
}

try {
  const { sourceFiles } = readI18nMessageSources({ projectRoot });
  for (const sourceFile of sourceFiles) {
    for (const messageId of sourceFile.messageIds) {
      const dotIndex = messageId.indexOf(".");
      const namespace =
        dotIndex >= 0 ? messageId.slice(0, dotIndex) : messageId;
      const ownerFileName = I18N_EXCLUSIVE_NAMESPACE_OWNERS.get(namespace);
      if (ownerFileName && sourceFile.fileName !== ownerFileName) {
        pushProjectViolation(
          toRel(sourceFile.filePath),
          `i18n namespace "${namespace}" is owned by ${ownerFileName}; move ${messageId} there or update the ownership rule intentionally.`,
        );
      }
    }
  }
} catch (error) {
  pushProjectViolation(
    "packages/shared/src/i18n/messages/**",
    `i18n message sources must stay readable and namespace-owned: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}

for (const filePath of appBoundarySourceFiles) {
  const relPath = toRel(filePath);
  const importerRoot = findAppProductRootForRepoPath(relPath);
  if (!importerRoot) {
    continue;
  }
  const sourceText = fs.readFileSync(filePath, "utf8");
  for (const specifier of extractImportSpecifiers(sourceText)) {
    const relativeBasePath = resolveRelativeImportBase(filePath, specifier);
    const targetRoot = findAppProductRootForSpecifier(
      specifier,
      toRelativeImportRelPath(relativeBasePath),
    );
    if (!targetRoot || targetRoot.id === importerRoot.id) {
      continue;
    }
    pushViolation(
      filePath,
      `Cross-app imports are forbidden (${importerRoot.label} -> ${targetRoot.label}). Move shared truth to @zinuto/shared or a public service contract instead of importing "${specifier}".`,
    );
  }
}

for (const filePath of testAndDevBoundarySourceFiles) {
  const relPath = toRel(filePath);
  const sourceText = fs.readFileSync(filePath, "utf8");
  for (const specifier of extractImportSpecifiers(sourceText)) {
    const relativeBasePath = resolveRelativeImportBase(filePath, specifier);
    const violationMessage = getTestAndDevProductLaneImportViolation({
      importerRelPath: relPath,
      specifier,
      relativeTargetRelPath: toRelativeImportRelPath(relativeBasePath),
    });
    if (violationMessage) {
      pushViolation(filePath, violationMessage);
    }
  }
}

if (fs.existsSync(tauriMainRsPath)) {
  const mainRsText = fs.readFileSync(tauriMainRsPath, "utf8");
  const backendRuntimeText = [
    ...(fs.existsSync(tauriBackendRuntimeRsPath)
      ? [tauriBackendRuntimeRsPath]
      : []),
    ...collectFilesIfExists(
      tauriBackendRuntimeModuleRoot,
      (filePath) =>
        filePath.endsWith(".rs") && path.basename(filePath) !== "tests.rs",
    ),
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
  const transportText = fs.existsSync(tauriTransportRsPath)
    ? fs.readFileSync(tauriTransportRsPath, "utf8")
    : "";
  const registeredCommands = new Set(
    parseRustGenerateHandlerCommands(mainRsText),
  );
  if (!setsEqual(registeredCommands, ALLOWED_TAURI_CUSTOM_COMMAND_SET)) {
    violations.push({
      filePath: toRel(tauriMainRsPath),
      message: `Tauri command surface drift detected. Expected ${setToSortedArray(ALLOWED_TAURI_CUSTOM_COMMAND_SET).join(", ")} but found ${setToSortedArray(registeredCommands).join(", ")}.`,
    });
  }
  if (
    !(
      mainRsText.includes('"/api/v1/system/health"') ||
      backendRuntimeText.includes('"/api/v1/system/health"')
    ) ||
    !(
      mainRsText.includes("build_backend_runtime_build_id") ||
      backendRuntimeText.includes("build_backend_runtime_build_id")
    ) ||
    !(
      mainRsText.includes("is_allowed_backend_api_path") ||
      transportText.includes("is_allowed_backend_api_path")
    ) ||
    !(
      mainRsText.includes('join("zinuto-core-node")') ||
      backendRuntimeText.includes('join("zinuto-core-node")')
    )
  ) {
    violations.push({
      filePath: toRel(tauriMainRsPath),
      message:
        "Desktop shell runtime must keep /api/v1/system/health probing, runtimeBuildId generation, /api/v1 bridge restriction, and the community Node helper resolution across the main, backend runtime, and bridge transport modules.",
    });
  }
}

if (fs.existsSync(tauriDefaultCapabilityPath)) {
  const defaultCapability = readJsonFile(tauriDefaultCapabilityPath);
  const defaultCapabilityPermissions = new Set(
    defaultCapability.permissions ?? [],
  );
  for (const permission of [
    "core:window:allow-hide",
    "core:window:allow-destroy",
    "core:window:allow-is-visible",
    "core:window:allow-set-position",
    "core:window:allow-set-title",
  ]) {
    if (!defaultCapabilityPermissions.has(permission)) {
      pushViolation(
        tauriDefaultCapabilityPath,
        `Desktop secondary window reuse requires Tauri default capability permission "${permission}".`,
      );
    }
  }
} else {
  pushProjectViolation(
    "apps/desktop/shell/capabilities/default.json",
    "Desktop shell default Tauri capability file is required for secondary window reuse permissions.",
  );
}

const customTauriInvokeTargets = new Set();
for (const relPath of allowedTauriBridgeFiles) {
  const absPath = path.join(projectRoot, relPath);
  if (!fs.existsSync(absPath)) {
    continue;
  }
  const sourceText = fs.readFileSync(absPath, "utf8");
  const invokeTargets = parseInvokeCommandNames(sourceText).filter((target) =>
    /^[a-z0-9_]+$/i.test(target),
  );
  invokeTargets.forEach((target) => {
    customTauriInvokeTargets.add(target);
  });
  const unexpectedTargets = invokeTargets.filter(
    (target) => !ALLOWED_TAURI_CUSTOM_COMMAND_SET.has(target),
  );
  if (unexpectedTargets.length) {
    pushViolation(
      absPath,
      `Unexpected custom Tauri commands detected: ${unexpectedTargets.join(", ")}.`,
    );
  }
}

if (!setsEqual(customTauriInvokeTargets, ALLOWED_TAURI_CUSTOM_COMMAND_SET)) {
  violations.push({
    filePath:
      "apps/desktop/web/src/api/index.ts + apps/desktop/web/src/domains/data-import/nativeImportHelpers.ts + apps/desktop/web/src/app-shell/useWindowChromeDrag.ts",
    message: `Frontend custom Tauri command usage drift detected. Expected ${setToSortedArray(ALLOWED_TAURI_CUSTOM_COMMAND_SET).join(", ")} but found ${setToSortedArray(customTauriInvokeTargets).join(", ")}.`,
  });
}

const frontendRuntimeRoot = path.join(frontendSrcRoot, "app-shell", "runtime");
if (fs.existsSync(frontendRuntimeRoot)) {
  for (const filePath of collectFiles(
    frontendRuntimeRoot,
    (candidatePath) =>
      candidatePath.endsWith(".ts") || candidatePath.endsWith(".tsx"),
  )) {
    const sourceText = fs.readFileSync(filePath, "utf8");
    if (/Record\s*<\s*string\s*,\s*any\s*>/u.test(sourceText)) {
      pushViolation(
        filePath,
        "Runtime scope files must not use Record<string, any>. Define the required typed slice or use unknown while narrowing explicitly.",
      );
    }
  }
}

for (const [configPath, requireBeforeBuildCommand] of [
  [tauriConfigPath, true],
]) {
  if (!fs.existsSync(configPath)) {
    continue;
  }
  const config = readJsonFile(configPath);
  const resources = config.bundle?.resources ?? {};
  for (const [source, target] of Object.entries(
    REQUIRED_DESKTOP_BUNDLE_RESOURCES,
  )) {
    if (resources[source] !== target) {
      pushViolation(
        configPath,
        `bundle.resources must map "${source}" to "${target}".`,
      );
    }
  }
  for (const [targetPath, sourcePath] of Object.entries(
    REQUIRED_MACOS_BUNDLE_FILES,
  )) {
    if (config.bundle?.macOS?.files?.[targetPath] !== sourcePath) {
      pushViolation(
        configPath,
        `macOS bundle must map "${targetPath}" to "${sourcePath}".`,
      );
    }
  }
  if (requireBeforeBuildCommand) {
    const beforeBuildCommand = String(config.build?.beforeBuildCommand ?? "");
    if (!beforeBuildCommand.includes(REQUIRED_TAURI_BUILD_COMMAND_FRAGMENT)) {
      pushViolation(
        configPath,
        "beforeBuildCommand must use the unified Tauri build preflight script.",
      );
    }
  }
  const scriptCsp = getCspDirective(config.app?.security?.csp, "script-src");
  if (
    !scriptCsp.includes("'nonce-{nonce}'") ||
    scriptCsp.includes("'unsafe-inline'")
  ) {
    pushViolation(
      configPath,
      "Tauri CSP script-src must use nonce-{nonce} and must not allow unsafe-inline scripts.",
    );
  }
}

if (fs.existsSync(tauriConfigPath)) {
  const tauriConfig = readJsonFile(tauriConfigPath);
  const beforeDevCommand = String(tauriConfig.build?.beforeDevCommand ?? "");
  if (!beforeDevCommand.includes(REQUIRED_TAURI_DEV_COMMAND_FRAGMENT)) {
    pushViolation(
      tauriConfigPath,
      "beforeDevCommand must use the shared Tauri dev preflight entrypoint.",
    );
  }
}

if (fs.existsSync(tauriWindowsConfigPath)) {
  const tauriWindowsConfig = readJsonFile(tauriWindowsConfigPath);
  const windowsResources = tauriWindowsConfig.bundle?.resources ?? {};
  if (tauriWindowsConfig.bundle?.targets?.join?.(",") !== "nsis") {
    pushViolation(
      tauriWindowsConfigPath,
      "Windows bundle target must stay pinned to NSIS.",
    );
  }
  for (const [source, target] of Object.entries(
    REQUIRED_WINDOWS_BUNDLE_RESOURCES,
  )) {
    if (windowsResources[source] !== target) {
      pushViolation(
        tauriWindowsConfigPath,
        `Windows bundle.resources must map "${source}" to "${target}".`,
      );
    }
  }
  const installerHooks = String(
    tauriWindowsConfig.bundle?.windows?.nsis?.installerHooks ?? "",
  ).replaceAll("\\", "/");
  if (installerHooks !== REQUIRED_WINDOWS_NSIS_INSTALLER_HOOK) {
    pushViolation(
      tauriWindowsConfigPath,
      `Windows NSIS installerHooks must stay on "${REQUIRED_WINDOWS_NSIS_INSTALLER_HOOK}" so packaged runtime resources are installed.`,
    );
  }
}

if (fs.existsSync(tauriBuildRsPath)) {
  const buildRsText = fs.readFileSync(tauriBuildRsPath, "utf8");
  if (!buildRsText.includes("ensure-tauri-build-inputs.mjs")) {
    pushViolation(
      tauriBuildRsPath,
      "build.rs must keep ensure-tauri-build-inputs.mjs wired in for direct cargo builds.",
    );
  }
  if (!buildRsText.includes("prepare-tauri-build.mjs")) {
    pushViolation(
      tauriBuildRsPath,
      "build.rs must track prepare-tauri-build.mjs as a Tauri build input.",
    );
  }
  if (!buildRsText.includes("prepare-backend-runtime-bundle.mjs")) {
    pushViolation(
      tauriBuildRsPath,
      "build.rs must track prepare-backend-runtime-bundle.mjs as a Tauri build input.",
    );
  }
  if (!buildRsText.includes("desktop-runtime-layout.mjs")) {
    pushViolation(
      tauriBuildRsPath,
      "build.rs must track desktop-runtime-layout.mjs so platform layout changes invalidate direct cargo builds.",
    );
  }
}

for (const filePath of sourceFiles) {
  const relPath = toRel(filePath);
  if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) {
    continue;
  }
  if (isTestLikeFile(filePath)) {
    continue;
  }

  const sourceText = fs.readFileSync(filePath, "utf8");
  const desktopLocalApiOwnershipViolation =
    getDesktopLocalApiApplicationOwnershipViolation(relPath);
  if (desktopLocalApiOwnershipViolation) {
    pushViolation(filePath, desktopLocalApiOwnershipViolation);
  }
  if (
    relPath.startsWith("apps/desktop/local-api/src/") &&
    BACKEND_SQLITE_PREPARE_PATTERN.test(sourceText) &&
    !isAllowedBackendSqlitePrepareFile(relPath)
  ) {
    pushViolation(
      filePath,
      "SQLite prepare() calls must stay in apps/desktop/local-api/src/infrastructure/db/**, *Repository.ts, *Store.ts, or explicit data access modules.",
    );
  }
  if (relPath.startsWith("apps/desktop/web/src/")) {
    const invokeTargets = parseInvokeCommandNames(sourceText).filter((target) =>
      /^[a-z0-9_]+$/i.test(target),
    );
    if (invokeTargets.length && !isAllowedTauriBridgeFile(relPath)) {
      pushViolation(
        filePath,
        `Tauri invoke() is only allowed in approved bridge files. Found commands: ${invokeTargets.join(", ")}.`,
      );
    }
    if (
      relPath.startsWith("apps/desktop/web/src/workspaces/challenge-stats/") &&
      relPath !==
        "apps/desktop/web/src/workspaces/challenge-stats/useTrainingStatsPageController.ts" &&
      /\bapi\./.test(sourceText)
    ) {
      pushViolation(
        filePath,
        "Stats view components must fetch through useTrainingStatsPageController instead of calling api.* directly.",
      );
    }
    const challengeStatsReadModelDataViolation =
      getChallengeStatsReadModelDataViolation({ relPath, sourceText });
    if (challengeStatsReadModelDataViolation) {
      pushViolation(filePath, challengeStatsReadModelDataViolation);
    }
    if (
      relPath ===
        "apps/desktop/web/src/workspaces/command-center/TrainingCommandCenterPage.tsx" &&
      /\bapi\./.test(sourceText)
    ) {
      pushViolation(
        filePath,
        "TrainingCommandCenterPage must stay view-only. Move api.* calls into its controller/loader layer.",
      );
    }
    if (
      sourceText.includes("__TAURI_INTERNALS__") &&
      !isAllowedTauriBridgeFile(relPath)
    ) {
      pushViolation(
        filePath,
        "Tauri internals access must stay inside approved bridge files only.",
      );
    }
    if (isFrontendApiDomainModuleFile(relPath)) {
      for (const specifier of extractImportSpecifiers(sourceText)) {
        const importsApiEntry = resolveImportCandidates(
          filePath,
          specifier,
          frontendSrcRoot,
        ).some((candidatePath) => candidatePath === frontendApiEntryPath);
        if (importsApiEntry) {
          pushViolation(
            filePath,
            `apps/desktop/web/src/api domain modules must not import the api/index.ts entrypoint. Found: ${specifier}`,
          );
        }
      }
    }
  }
  if (
    relPath.startsWith("apps/desktop/web/src/") &&
    filePath.endsWith(".tsx") &&
    !relPath.startsWith("apps/desktop/web/src/ui/primitives/")
  ) {
    const nativeTagMatches = Array.from(
      sourceText.matchAll(new RegExp(SHADCN_NATIVE_UI_TAG_GUARD_PATTERN)),
    );
    if (nativeTagMatches.length) {
      const tags = Array.from(
        new Set(
          nativeTagMatches
            .map((match) => String(match[1] || "").toLowerCase())
            .filter(Boolean),
        ),
      );
      pushViolation(
        filePath,
        `Native UI tags detected (${tags.join(", ")}). Use shadcn wrappers from apps/desktop/web/src/ui/primitives/* instead.`,
      );
    }
    if (SHADCN_DIALOG_ROLE_GUARD_PATTERN.test(sourceText)) {
      pushViolation(
        filePath,
        "Manual dialog roles detected. Use shadcn Dialog from apps/desktop/web/src/ui/primitives/dialog instead of hand-rolled dialog semantics.",
      );
    }
    if (sourceText.includes("<svg") && !isAllowedGraphicsFile(relPath)) {
      pushViolation(
        filePath,
        "Inline <svg> is only allowed in apps/desktop/web/src/assets/graphics/*. Extract graphical markup into the graphics center first.",
      );
    }
  }
  if (
    relPath.startsWith("apps/desktop/web/src/") &&
    !isAllowedGraphicsFile(relPath) &&
    HARD_CODED_GRAPHIC_PATH_PATTERN.test(sourceText)
  ) {
    pushViolation(
      filePath,
      "Direct image/icon asset paths are forbidden outside apps/desktop/web/src/assets/graphics/*. Route all frontend graphics through the graphics center.",
    );
  }
  if (
    relPath.startsWith("apps/desktop/web/src/") &&
    !isAllowedIconGlyphFile(relPath) &&
    HARD_CODED_ICON_GLYPH_PATTERN.test(sourceText)
  ) {
    pushViolation(
      filePath,
      "Hardcoded icon glyphs are forbidden outside appText/graphics. Register the icon in the graphics center instead.",
    );
  }
  const importSpecifiers = extractImportSpecifiers(sourceText);
  const runtimeImportSpecifiers = new Set(
    extractRuntimeImportSpecifiers(sourceText),
  );

  const customIndicatorRuntimeLeftoverViolation =
    getFrontendCustomIndicatorRuntimeLeftoverViolation(relPath);
  if (customIndicatorRuntimeLeftoverViolation) {
    pushViolation(filePath, customIndicatorRuntimeLeftoverViolation);
  }

  if (relPath.startsWith("apps/desktop/web/src/")) {
    const uiBarrelImportMatches = Array.from(
      sourceText.matchAll(
        /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]*ui\/components)['"]/g,
      ),
    );
    for (const match of uiBarrelImportMatches) {
      const importedSegment = String(match[1] || "");
      const importSpecifier = String(match[2] || "");
      const importedNames = importedSegment
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => entry.split(/\s+as\s+/i)[0]?.trim() || "")
        .filter(Boolean);
      const violatedNames = importedNames.filter((name) =>
        SHADCN_COMPONENT_ONLY_NAMES.has(name),
      );
      if (violatedNames.length) {
        pushViolation(
          filePath,
          `Import ${violatedNames.join(", ")} from "${importSpecifier}" is forbidden. Use "@/ui/primitives/*" entries directly.`,
        );
      }
    }
  }

  if (relPath === "apps/desktop/web/src/frontend-kernel/appTypes.ts") {
    for (const exportedName of extractAppTypesNamedExports(sourceText)) {
      const replacement =
        FRONTEND_APP_TYPES_SHARED_OWNER_EXPORT_REPLACEMENTS.get(exportedName);
      if (!replacement) {
        continue;
      }
      pushViolation(
        filePath,
        `frontend appTypes must not export ${exportedName}. Use ${replacement} at the consumer instead.`,
      );
    }
  }

  if (
    relPath.startsWith("apps/desktop/web/src/api/") ||
    relPath.startsWith("apps/desktop/web/src/domains/") ||
    relPath.startsWith("apps/desktop/web/src/workspaces/")
  ) {
    for (const importedName of extractAppTypesNamedImports(sourceText)) {
      const replacement =
        FRONTEND_APP_TYPES_OWNER_IMPORT_REPLACEMENTS.get(importedName);
      if (!replacement) {
        continue;
      }
      pushViolation(
        filePath,
        buildFrontendAppTypesOwnerImportMessage(importedName, replacement),
      );
    }
  }

  for (const specifier of importSpecifiers) {
    const relativeBasePath = resolveRelativeImportBase(filePath, specifier);
    const relativeTargetRelPath = toRelativeImportRelPath(relativeBasePath);
    const isRuntimeImport = runtimeImportSpecifiers.has(specifier);

    const apiPrivateImportViolation =
      getFrontendRuntimeApiPrivateImportViolation({
        importerRelPath: relPath,
        specifier,
        relativeTargetRelPath,
      });
    if (apiPrivateImportViolation) {
      pushViolation(filePath, apiPrivateImportViolation);
    }

    if (
      relPath.startsWith("apps/desktop/web/src/") &&
      isFrontendAppShellI18nImportSpecifier(specifier)
    ) {
      pushViolation(
        filePath,
        `Frontend i18n runtime belongs to frontend-kernel. Import from "@/frontend-kernel/i18n" instead of "${specifier}".`,
      );
    }

    if (
      (relPath.startsWith("apps/desktop/web/src/api/") ||
        relPath.startsWith("apps/desktop/web/src/domains/") ||
        relPath.startsWith("apps/desktop/web/src/workspaces/")) &&
      isFrontendAppShellAppTypesImportSpecifier(specifier)
    ) {
      pushViolation(
        filePath,
        `api/domain/workspace modules must import owned frontend contracts instead of "${specifier}".`,
      );
    }

    const appShellBoundaryViolation = getFrontendAppShellBoundaryViolation({
      importerRelPath: relPath,
      specifier,
      relativeTargetRelPath,
    });
    if (appShellBoundaryViolation) {
      pushViolation(filePath, appShellBoundaryViolation);
    }

    const secondaryWindowBridgeViolation =
      getFrontendSecondaryWindowBridgeBoundaryViolation({
        importerRelPath: relPath,
        specifier,
        relativeTargetRelPath,
      });
    if (secondaryWindowBridgeViolation) {
      pushViolation(filePath, secondaryWindowBridgeViolation);
    }

    const frontendKernelReplacement = relPath.startsWith(
      "apps/desktop/web/src/",
    )
      ? getFrontendKernelReplacementForAppShellImport(specifier)
      : null;
    if (frontendKernelReplacement) {
      pushViolation(
        filePath,
        `Frontend shared runtime belongs to frontend-kernel. Import from "${frontendKernelReplacement}" instead of "${specifier}".`,
      );
    }

    const customIndicatorWorkspaceViolation =
      getFrontendCustomIndicatorWorkspaceViolation({
        importerRelPath: relPath,
        specifier,
        relativeTargetRelPath,
      });
    if (customIndicatorWorkspaceViolation) {
      pushViolation(filePath, customIndicatorWorkspaceViolation);
    }

    const frontendBusinessFactImportViolation =
      getFrontendBusinessFactImportViolation({
        importerRelPath: relPath,
        specifier,
        isRuntimeImport,
      });
    if (frontendBusinessFactImportViolation) {
      pushViolation(filePath, frontendBusinessFactImportViolation);
    }

    const desktopLocalApiLayerBoundaryViolation =
      getDesktopLocalApiLayerBoundaryViolation({
        importerRelPath: relPath,
        specifier,
        relativeTargetRelPath,
        isRuntimeImport,
      });
    if (desktopLocalApiLayerBoundaryViolation) {
      pushViolation(filePath, desktopLocalApiLayerBoundaryViolation);
    }

    if (
      relPath.startsWith("apps/desktop/web/src/") &&
      specifier.startsWith("@/") &&
      ARCHITECTURE_PRIVATE_MODULE_SEGMENTS.some((segment) =>
        specifier.includes(segment),
      )
    ) {
      const importerLayerRoot = frontendLayerRootFromRelPath(relPath);
      const targetLayerRoot = frontendLayerRootFromSpecifier(specifier);
      if (!targetLayerRoot || importerLayerRoot !== targetLayerRoot) {
        pushViolation(
          filePath,
          `Private frontend module "${specifier}" must be consumed through its public layer entrypoint.`,
        );
      }
    }

    if (
      (relPath.startsWith("apps/desktop/web/src/") ||
        relPath.startsWith("apps/desktop/local-api/src/")) &&
      specifier.startsWith("@zinuto/shared/") &&
      !allowedSharedExportSpecifiers.has(specifier)
    ) {
      pushViolation(
        filePath,
        `Shared imports must use declared package exports only. Found unsupported specifier "${specifier}".`,
      );
    }

    if (
      (relPath.startsWith("apps/desktop/web/src/") ||
        relPath.startsWith("apps/desktop/local-api/src/")) &&
      (specifier === "@zinuto/shared" ||
        specifier.startsWith("@zinuto/shared/dist/"))
    ) {
      pushViolation(
        filePath,
        `Consumers must import @zinuto/shared through explicit package exports only. Found "${specifier}".`,
      );
    }

    if (
      (relPath.startsWith("apps/desktop/web/src/") ||
        relPath.startsWith("apps/desktop/local-api/src/")) &&
      relativeBasePath &&
      pathIsInside(relativeBasePath, sharedRoot)
    ) {
      pushViolation(
        filePath,
        `Do not deep-import shared source files via relative paths ("${specifier}"). Use @zinuto/shared/<export> instead.`,
      );
    }

    if (
      relPath.startsWith(
        "apps/desktop/web/src/workspaces/history/history-console/",
      ) &&
      (specifier.includes("/workspacePages/") ||
        specifier.includes("/HistoryWorkspacePage"))
    ) {
      pushViolation(
        filePath,
        "history-console domain/view files must not depend on workspace page shells.",
      );
    }

    if (
      relPath.startsWith("apps/desktop/web/src/") &&
      isForbiddenUiImport(specifier)
    ) {
      pushViolation(
        filePath,
        `Forbidden UI library import "${specifier}". Zinuto frontend must use the shadcn stack only.`,
      );
    }

    if (
      relPath.startsWith("apps/desktop/web/src/") &&
      specifier.startsWith("@radix-ui/") &&
      !isAllowedRadixConsumer(relPath)
    ) {
      pushViolation(
        filePath,
        `Radix import "${specifier}" is only allowed in apps/desktop/web/src/ui/primitives/*. Use shared shadcn wrappers instead.`,
      );
    }

    if (
      relPath.startsWith("apps/desktop/web/src/") &&
      specifier === "lucide-react" &&
      !isAllowedGraphicsFile(relPath)
    ) {
      pushViolation(
        filePath,
        "Direct lucide-react imports are only allowed in apps/desktop/web/src/assets/graphics/*. Consume icons through the graphics center.",
      );
    }
    if (
      relPath.startsWith("apps/desktop/web/src/") &&
      GRAPHIC_ASSET_FILE_PATTERN.test(specifier) &&
      !isAllowedGraphicsFile(relPath)
    ) {
      pushViolation(
        filePath,
        `Graphic asset import "${specifier}" is only allowed in apps/desktop/web/src/assets/graphics/*. Export assets from the graphics center instead.`,
      );
    }

    if (
      (specifier === "@/app-shell" || specifier === "@/app-shell/AppRoot") &&
      relPath !== "apps/desktop/web/src/App.tsx" &&
      relPath !== "apps/desktop/web/src/app-shell/index.ts"
    ) {
      pushViolation(
        filePath,
        "Only apps/desktop/web/src/App.tsx can consume AppRoot.",
      );
    }

    if (
      specifier.startsWith("@tauri-apps/") &&
      !isAllowedTauriBridgeFile(relPath)
    ) {
      pushViolation(
        filePath,
        `Tauri APIs must be accessed through approved bridge files. Found: ${specifier}`,
      );
    }

    if (
      (relPath === "apps/desktop/web/src/ui/config/uiConfig.ts" ||
        relPath.startsWith("apps/desktop/web/src/ui/config/uiConfig/")) &&
      (specifier.startsWith("@/app-shell/") ||
        specifier.startsWith("@/domains/") ||
        specifier.startsWith("@/workspaces/") ||
        (relativeBasePath &&
          (pathIsInside(
            relativeBasePath,
            path.join(frontendSrcRoot, "app-shell"),
          ) ||
            pathIsInside(
              relativeBasePath,
              path.join(frontendSrcRoot, "domains"),
            ) ||
            pathIsInside(
              relativeBasePath,
              path.join(frontendSrcRoot, "workspaces"),
            ))))
    ) {
      pushViolation(
        filePath,
        "Frontend UI config entrypoints must not depend on app-shell/domain/workspace modules. Extract shared contracts or neutral type modules first.",
      );
    }

    if (relPath.startsWith("apps/desktop/local-api/src/http/")) {
      if (isTradingServiceBarrelImport(specifier)) {
        pushViolation(
          filePath,
          "Routes must import concrete trading subservices instead of the tradingService.ts barrel.",
        );
      }
      if (
        specifier.includes("/infrastructure/db/") ||
        specifier.startsWith("../infrastructure/db/") ||
        specifier.startsWith("../../infrastructure/db/")
      ) {
        pushViolation(
          filePath,
          "HTTP routes should not directly import db layer. Use application layer.",
        );
      }
    }

    if (
      relPath.startsWith("apps/desktop/local-api/src/application/") ||
      relPath.startsWith("apps/desktop/local-api/src/infrastructure/db/")
    ) {
      if (
        relPath.startsWith("apps/desktop/local-api/src/application/") &&
        isTradingServiceBarrelImport(specifier)
      ) {
        pushViolation(
          filePath,
          "Backend application modules must import concrete trading subservices instead of the tradingService.ts barrel.",
        );
      }
      if (
        relPath.startsWith("apps/desktop/local-api/src/application/") &&
        specifier === "@zinuto/shared/replayAggregation"
      ) {
        pushViolation(
          filePath,
          "Backend market/application paths must not import JS replay aggregation. Use DuckDB market_display_bars / market_timeline_meta for market timeframe aggregation.",
        );
      }
      if (
        specifier.startsWith("../http/") ||
        specifier.startsWith("../../http/") ||
        specifier.includes("/http/")
      ) {
        pushViolation(
          filePath,
          "Application/DB layer must not import HTTP route layer.",
        );
      }
    }

    if (relPath.startsWith("apps/desktop/local-api/src/infrastructure/db/")) {
      if (
        specifier.startsWith("../application/") ||
        specifier.startsWith("../../application/") ||
        specifier.includes("/application/")
      ) {
        pushViolation(filePath, "DB layer must not import application layer.");
      }
    }

    if (
      relPath.startsWith(
        "apps/desktop/local-api/src/application/specialTraining/",
      ) &&
      isSpecialTrainingServiceBarrelImport(specifier)
    ) {
      pushViolation(
        filePath,
        "specialTraining submodules must not depend on specialTrainingService.ts as a shared type barrel.",
      );
    }
  }
}

const frontendTsFiles = tsSourceFiles.filter((filePath) =>
  filePath.startsWith(frontendSrcRoot),
);
const backendTsFiles = tsSourceFiles.filter((filePath) =>
  filePath.startsWith(backendSrcRoot),
);
const frontendEntryFiles = [
  path.join(frontendSrcRoot, "main.ts"),
  path.join(frontendSrcRoot, "secondaryWindowMain.tsx"),
  ...architectureComposition.frontendEntryFiles.map((relPath) =>
    path.join(projectRoot, ...relPath.split("/")),
  ),
];
const backendEntryFiles = [
  path.join(backendSrcRoot, "runtime", "index.ts"),
  ...architectureComposition.backendEntryFiles.map((relPath) =>
    path.join(projectRoot, ...relPath.split("/")),
  ),
];
const ALLOWED_FRONTEND_ORPHAN_REL_PATHS = new Set([
  "apps/desktop/web/src/workspaces/data/dataConfig/DataConfigPageProgress.tsx",
  "apps/desktop/web/src/workspaces/data/dataConfig/HallSectionList.tsx",
  "apps/desktop/web/src/workspaces/data/dataConfig/ImportPoolCard.tsx",
  "apps/desktop/web/src/workspaces/data/dataConfig/LocalImportEmptyState.tsx",
  "apps/desktop/web/src/workspaces/data/dataConfig/ReadyPoolCard.tsx",
  "apps/desktop/web/src/workspaces/data/dataConfig/dataConfigPageCopy.ts",
  "apps/desktop/web/src/workspaces/data/dataConfig/types.ts",
  "apps/desktop/web/src/workspaces/data/dataConfig/useCardLayoutAnimation.ts",
  "apps/desktop/web/src/workspaces/data/dataConfig/useDetailWindowActions.ts",
  "apps/desktop/web/src/workspaces/data/dataConfig/useDetailWindowPayload.ts",
  "apps/desktop/web/src/workspaces/data/dataConfig/useDropZone.ts",
]);
const ALLOWED_BACKEND_ORPHAN_REL_PATHS = new Set([
  "apps/desktop/local-api/src/application/backtest/referenceEngineWorker.ts",
  "apps/desktop/local-api/src/infrastructure/db/storageUsageDbstatWorker.ts",
]);

if (!options.skipReachability) {
  const frontendFileSet = new Set(frontendTsFiles);
  const backendFileSet = new Set(backendTsFiles);
  const frontendReachable = new Set(
    frontendEntryFiles.flatMap((entryFilePath) => [
      ...collectReachableTsFiles(
        entryFilePath,
        frontendFileSet,
        frontendSrcRoot,
      ),
    ]),
  );
  const backendReachable = new Set(
    backendEntryFiles.flatMap((entryFilePath) => [
      ...collectReachableTsFiles(entryFilePath, backendFileSet, backendSrcRoot),
    ]),
  );

  const frontendOrphans = frontendTsFiles.filter(
    (filePath) =>
      !frontendReachable.has(filePath) &&
      !ALLOWED_FRONTEND_ORPHAN_REL_PATHS.has(toRel(filePath)),
  );
  const backendOrphans = backendTsFiles.filter(
    (filePath) =>
      !backendReachable.has(filePath) &&
      !ALLOWED_BACKEND_ORPHAN_REL_PATHS.has(toRel(filePath)),
  );

  if (frontendOrphans.length) {
    violations.push({
      filePath: "apps/desktop/web/src/**",
      message: `Found ${frontendOrphans.length} frontend orphan TS/TSX files not reachable from frontend entries: ${frontendOrphans.map(toRel).join(", ")}`,
    });
  }

  if (backendOrphans.length) {
    violations.push({
      filePath: "apps/desktop/local-api/src/**",
      message: `Found ${backendOrphans.length} backend orphan TS/TSX files not reachable from runtime/index.ts: ${backendOrphans.map(toRel).join(", ")}`,
    });
  }
}

for (const cycle of collectImportCycles({
  filePaths: frontendTsFiles,
  srcRoot: frontendSrcRoot,
  projectRoot,
  maxCycles: 20,
})) {
  violations.push({
    filePath: cycle[0] ?? "apps/desktop/web/src/**",
    message: `Frontend import cycle detected: ${cycle.join(" -> ")}`,
  });
}

for (const cycle of collectImportCycles({
  filePaths: backendTsFiles,
  srcRoot: backendSrcRoot,
  projectRoot,
  maxCycles: 20,
})) {
  violations.push({
    filePath: cycle[0] ?? "apps/desktop/local-api/src/**",
    message: `Backend import cycle detected: ${cycle.join(" -> ")}`,
  });
}

const frontendPackageJson = readJsonFile(frontendPackageJsonPath);
for (const dependencyGroupKey of ["dependencies", "devDependencies"]) {
  const dependencyGroup = frontendPackageJson[dependencyGroupKey] ?? {};
  for (const dependencyName of Object.keys(dependencyGroup)) {
    if (dependencyName.startsWith("@fontsource")) {
      pushViolation(
        frontendPackageJsonPath,
        `Typography must use system font stacks. Remove ${dependencyName} from apps/desktop/web/package.json.`,
      );
    }
  }
}

violations.push(
  ...collectTypographyArchitectureViolations({
    frontendSrcRoot,
    collectFiles,
    toRel,
  }),
);

violations.push(...collectLocalDataUpdateArchitectureViolations(projectRoot));

const reportedViolations = hasScopedFiles
  ? violations.filter((violation) => isViolationInScope(violation.filePath))
  : violations;

if (reportedViolations.length) {
  console.error(
    `${ARCH_PREFIX} ❌ architecture guard failed (${reportedViolations.length} violations)\n`,
  );
  for (const violation of reportedViolations) {
    console.error(`${violation.filePath} :: ${violation.message}`);
  }
  process.exit(1);
}

console.log(`${ARCH_PREFIX} ✅ architecture guard passed.`);
