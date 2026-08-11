#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "../..");
const STRUCTURE_PREFIX = "[repo-structure]";

const GENERAL_SOURCE_MAX_LINES = 2200;
const MAX_CYCLES_PER_ROOT = 20;
const TRACKED_FILE_MAX_BYTES = 50 * 1024 * 1024;

const SOURCE_ROOTS = [
  {
    label: "desktop web",
    root: "apps/desktop/web/src",
    aliases: ["@/"],
  },
  {
    label: "desktop local api",
    root: "apps/desktop/local-api/src",
    aliases: [],
  },
  {
    label: "desktop shell",
    root: "apps/desktop/shell/src",
    aliases: [],
  },
  {
    label: "desktop backtest engine",
    root: "apps/desktop/backtest-engine/src",
    aliases: [],
  },
  {
    label: "shared package",
    root: "packages/shared/src",
    aliases: [],
  },
  {
    label: "quality and release tools",
    root: "tools",
    aliases: [],
  },
];

const SOURCE_EXTENSIONS = new Set([
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

const SKIP_DIR_NAMES = new Set([
  ".git",
  "build",
  "coverage",
  "dist",
  "gen",
  "node_modules",
  "playwright-report",
  "reports",
  "target",
  "test-results",
  "vendor",
]);

const FORBIDDEN_TRACKED_ARTIFACT_PATHS = [
  {
    pattern: /^\.cache\//u,
    reason: "Local cache output must stay out of Git.",
  },
  {
    pattern: /^\.codex-artifacts\//u,
    reason: "Codex review screenshots and scratch artifacts must stay out of Git.",
  },
  {
    pattern: /^\.playwright-cli\//u,
    reason: "Playwright scratch output must stay out of Git.",
  },
  {
    pattern: /^output\//u,
    reason: "Generated output and screenshots must stay out of Git.",
  },
  {
    pattern: /^tmp\//u,
    reason: "Temporary working files must stay out of Git.",
  },
  {
    pattern: /(?:^|\/)target\//u,
    reason: "Build target directories must stay out of Git; recreate them locally or in CI.",
  },
  {
    pattern: /(?:^|\/)dist\//u,
    reason: "Build dist directories must stay out of Git; recreate them from source.",
  },
  {
    pattern: /(?:^|\/)\.build\//u,
    reason: "Native build cache directories must stay out of Git.",
  },
  {
    pattern: /^apps\/desktop\/shell\/gen\/(?!backtest-engine\/\.gitkeep$)/u,
    reason: "Generated Tauri runtime/package input must stay out of Git; only the backtest-engine .gitkeep placeholder is tracked.",
  },
  {
    pattern: /^apps\/desktop\/backtest-engine\/target\//u,
    reason: "Rust build output must stay out of Git; rebuild it locally when needed.",
  },
  {
    pattern:
      /^apps\/desktop\/shell\/gen\/backtest-engine\/(?:deps\/|open-trading-practice-backtest-engine(?:\.exe)?$)/u,
    reason: "Generated backtest sidecar payload is a packaging output, not source.",
  },
  {
    pattern:
      /^apps\/desktop\/shell\/gen\/(?:backend-runtime|schemas|node-runtime-libs)(?:\/|$)/u,
    reason: "Generated Tauri runtime/package input must be recreated by release scripts.",
  },
];

const FORBIDDEN_TRACKED_ARTIFACT_FILE_PATTERNS = [
  {
    pattern: /(?:^|\/)\.DS_Store$/iu,
    reason: "macOS metadata files must stay out of Git.",
  },
  {
    pattern: /\.(?:dylib|dll|so|rlib|rmeta|pkg|dmg|node)$/iu,
    reason: "Native binaries and package artifacts must not be committed to Git.",
  },
  {
    pattern: /\.app\.tar\.gz$/iu,
    reason: "Packaged application archives must not be committed to Git.",
  },
];

const STRUCTURE_CONTENT_EXEMPTIONS = [
  /^contracts\//u,
  /^packages\/shared\/src\/contracts-[^/]+\/http-api\.ts$/u,
  /^packages\/shared\/src\/i18n\/messages\//u,
  /^packages\/shared\/src\/i18n\.generated(?:\.[A-Za-z-]+)?\.ts$/u,
];

const TEST_OR_HARNESS_SEGMENT_PATTERN =
  /(?:^|\/)(?:__tests__|testHarness|tests?)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/u;

const toPosix = (value) => String(value).split(path.sep).join("/");
const toRel = (filePath) => toPosix(path.relative(projectRoot, filePath));
const absoluteFromRel = (relPath) => path.join(projectRoot, ...relPath.split("/"));
const normalizeRepoPath = (value) => {
  const text = toPosix(String(value ?? "").trim());
  if (!text) {
    return "";
  }
  return path.isAbsolute(text)
    ? toPosix(path.relative(projectRoot, text))
    : toPosix(path.normalize(text)).replace(/^\.\//u, "");
};

const parseArgs = (argv) => {
  const options = { files: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
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
          "  node tools/quality/check-repo-structure.mjs",
          "  node tools/quality/check-repo-structure.mjs --files <path> [more paths]",
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
const scopedFiles = new Set(options.files);
const hasScopedFiles = scopedFiles.size > 0;
const isScopedFile = (relPath) => !hasScopedFiles || scopedFiles.has(relPath);

const countFileLines = (filePath) =>
  fs.readFileSync(filePath, "utf8").split(/\r?\n/u).length;

const readTrackedRepoFiles = () => {
  try {
    return execFileSync("git", ["ls-files", "-z"], {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    })
      .split("\0")
      .map(normalizeRepoPath)
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, "en"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Failed to list tracked Git files: ${detail}`);
  }
};

const describeBytes = (bytes) => {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)}MiB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)}KiB`;
  }
  return `${bytes}B`;
};

const collectTrackedArtifactViolations = () => {
  const trackedFiles = readTrackedRepoFiles().filter(isScopedFile);
  const artifactViolations = [];

  for (const relPath of trackedFiles) {
    const absolutePath = absoluteFromRel(relPath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }
    for (const { pattern, reason } of FORBIDDEN_TRACKED_ARTIFACT_PATHS) {
      if (pattern.test(relPath)) {
        artifactViolations.push({
          filePath: relPath,
          message: reason,
        });
      }
    }
    for (const { pattern, reason } of FORBIDDEN_TRACKED_ARTIFACT_FILE_PATTERNS) {
      if (pattern.test(relPath)) {
        artifactViolations.push({
          filePath: relPath,
          message: reason,
        });
      }
    }

    if (fs.statSync(absolutePath).isFile()) {
      const byteSize = fs.statSync(absolutePath).size;
      if (byteSize > TRACKED_FILE_MAX_BYTES) {
        artifactViolations.push({
          filePath: relPath,
          message:
            `Tracked file is ${describeBytes(byteSize)}, above the ` +
            `${describeBytes(TRACKED_FILE_MAX_BYTES)} Git source limit. Use generated artifacts, release storage, or Git LFS instead.`,
        });
      }
    }
  }

  return artifactViolations;
};

const isSourceFile = (filePath) =>
  SOURCE_EXTENSIONS.has(path.extname(filePath));

const shouldSkipDirectory = (relativePath, dirName) =>
  SKIP_DIR_NAMES.has(dirName) ||
  relativePath.includes("/_unused_archive_") ||
  relativePath.includes("/_archive_");

const walkFiles = (relativeRoot, predicate = () => true) => {
  const rootPath = absoluteFromRel(relativeRoot);
  if (!fs.existsSync(rootPath)) {
    return [];
  }
  const files = [];
  const pending = [rootPath];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      const relativePath = toRel(absolutePath);
      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(relativePath, entry.name)) {
          pending.push(absolutePath);
        }
        continue;
      }
      if (entry.isFile() && predicate(absolutePath)) {
        files.push(absolutePath);
      }
    }
  }
  return files.sort((left, right) => toRel(left).localeCompare(toRel(right), "en"));
};

const isContentOrGeneratedExempt = (relPath) =>
  STRUCTURE_CONTENT_EXEMPTIONS.some((pattern) => pattern.test(relPath));

const isProductionStructureFile = (relPath) =>
  isSourceFile(relPath) &&
  !TEST_OR_HARNESS_SEGMENT_PATTERN.test(relPath) &&
  !isContentOrGeneratedExempt(relPath);

const extractRuntimeImportSpecifiers = (sourceText) => {
  const specs = new Set();
  const patterns = [
    /\bimport\s+(?!type\b)(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/gu,
    /\bexport\s+(?!type\b)(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/gu,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/gu,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/gu,
    /new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/gu,
  ];
  for (const pattern of patterns) {
    let match = pattern.exec(sourceText);
    while (match) {
      specs.add(match[1]);
      match = pattern.exec(sourceText);
    }
  }
  return [...specs];
};

const resolveImportCandidates = ({ fromFilePath, specifier, rootPath, aliases }) => {
  if (!specifier || typeof specifier !== "string") {
    return [];
  }
  let basePath = null;
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    basePath = path.resolve(path.dirname(fromFilePath), specifier);
  } else {
    const alias = aliases.find((entry) => specifier.startsWith(entry));
    if (alias) {
      basePath = path.join(rootPath, specifier.slice(alias.length));
    }
  }
  if (!basePath) {
    return [];
  }
  const bases = [basePath];
  for (const ext of SOURCE_EXTENSIONS) {
    if (basePath.endsWith(ext)) {
      bases.push(basePath.slice(0, -ext.length));
    }
  }
  const candidates = new Set();
  for (const base of bases) {
    candidates.add(base);
    for (const ext of SOURCE_EXTENSIONS) {
      candidates.add(`${base}${ext}`);
    }
    for (const ext of SOURCE_EXTENSIONS) {
      candidates.add(path.join(base, `index${ext}`));
    }
  }
  return [...candidates];
};

const collectImportCycles = ({ filePaths, rootPath, aliases }) => {
  const fileSet = new Set(filePaths);
  const graph = new Map();
  for (const filePath of filePaths) {
    const dependencies = new Set();
    const sourceText = fs.readFileSync(filePath, "utf8");
    for (const specifier of extractRuntimeImportSpecifiers(sourceText)) {
      const candidates = resolveImportCandidates({
        fromFilePath: filePath,
        specifier,
        rootPath,
        aliases,
      });
      for (const candidate of candidates) {
        if (fileSet.has(candidate)) {
          dependencies.add(candidate);
          break;
        }
      }
    }
    graph.set(filePath, [...dependencies]);
  }

  const seen = new Set();
  const active = new Set();
  const stack = [];
  const cycleKeys = new Set();
  const cycles = [];

  const visit = (filePath) => {
    if (cycles.length >= MAX_CYCLES_PER_ROOT) {
      return;
    }
    seen.add(filePath);
    active.add(filePath);
    stack.push(filePath);

    for (const dependencyPath of graph.get(filePath) ?? []) {
      if (cycles.length >= MAX_CYCLES_PER_ROOT) {
        break;
      }
      if (!seen.has(dependencyPath)) {
        visit(dependencyPath);
        continue;
      }
      if (!active.has(dependencyPath)) {
        continue;
      }
      const cycleStartIndex = stack.indexOf(dependencyPath);
      if (cycleStartIndex < 0) {
        continue;
      }
      const cycle = [...stack.slice(cycleStartIndex), dependencyPath].map(toRel);
      const cycleKey = cycle.join(" -> ");
      if (!cycleKeys.has(cycleKey)) {
        cycleKeys.add(cycleKey);
        cycles.push(cycle);
      }
    }

    stack.pop();
    active.delete(filePath);
  };

  for (const filePath of filePaths) {
    if (cycles.length >= MAX_CYCLES_PER_ROOT) {
      break;
    }
    if (!seen.has(filePath)) {
      visit(filePath);
    }
  }

  return cycles;
};

const violations = [];
violations.push(...collectTrackedArtifactViolations());

const allProductionFiles = [
  ...new Set(
    SOURCE_ROOTS.flatMap(({ root }) =>
      walkFiles(root, (filePath) => isProductionStructureFile(toRel(filePath))),
    ),
  ),
].filter((filePath) => isScopedFile(toRel(filePath)));

for (const filePath of allProductionFiles) {
  const relPath = toRel(filePath);
  const lineCount = countFileLines(filePath);
  if (lineCount > GENERAL_SOURCE_MAX_LINES) {
    violations.push({
      filePath: relPath,
      message: `Source file has ${lineCount} lines, above the ${GENERAL_SOURCE_MAX_LINES}-line budget. Split the file before adding more code.`,
    });
  }
}

for (const { label, root, aliases } of SOURCE_ROOTS) {
  const rootPath = absoluteFromRel(root);
  const files = walkFiles(root, (filePath) =>
    isSourceFile(filePath) &&
    !TEST_OR_HARNESS_SEGMENT_PATTERN.test(toRel(filePath)) &&
    !isContentOrGeneratedExempt(toRel(filePath)),
  );
  for (const cycle of collectImportCycles({
    filePaths: files,
    rootPath,
    aliases,
  })) {
    if (hasScopedFiles && !cycle.some((relPath) => scopedFiles.has(relPath))) {
      continue;
    }
    violations.push({
      filePath: cycle[0] ?? root,
      message: `${label} runtime import cycle detected: ${cycle.join(" -> ")}`,
    });
  }
}

if (violations.length > 0) {
  console.error(`${STRUCTURE_PREFIX} Found ${violations.length} structure violation(s):`);
  for (const violation of violations) {
    console.error(`- ${violation.filePath}: ${violation.message}`);
  }
  process.exit(1);
}

console.log(
  `${STRUCTURE_PREFIX} OK: ${allProductionFiles.length} production source files checked; ` +
    `no oversized source files or runtime import cycles.`,
);
