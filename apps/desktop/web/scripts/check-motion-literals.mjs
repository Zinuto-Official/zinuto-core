// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const sourceRoot = path.join(projectRoot, "src");
const motionTokenPath = path.normalize(
  path.join("src", "styles", "core", "motion-tokens.css"),
);

const TIME_LITERAL_RE = /(?<![A-Za-z0-9_-])(?:\d*\.\d+|\d+)(?:ms|s)\b/g;
const CUBIC_BEZIER_RE = /cubic-bezier\([^)]*\)/g;
const TIMING_KEYWORD_RE =
  /(?<![A-Za-z0-9_-])(?:ease-in-out|ease-in|ease-out|ease|linear|step-start|step-end|steps\([^)]*\))\b/g;
const MOTION_CUSTOM_PROP_RE =
  /^--.*(?:motion|duration|delay|ease|transition|animation)/i;
const MOTION_DECLARATION_RE = /^(?:transition|animation)(?:-|$)/i;

const walkFiles = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".css")) {
      files.push(fullPath);
    }
  }
  return files;
};

const normalizePath = (value) => String(value ?? "").trim().replaceAll(path.sep, "/");

const absoluteSourceFileFromInput = (value) => {
  const normalized = normalizePath(value);
  if (!normalized) {
    return null;
  }
  const absolutePath = path.isAbsolute(normalized)
    ? normalized
    : normalized.startsWith("apps/desktop/web/")
      ? path.join(path.resolve(projectRoot, "../../.."), normalized)
      : path.join(projectRoot, normalized);
  const resolved = path.resolve(absolutePath);
  if (!resolved.startsWith(`${sourceRoot}${path.sep}`)) {
    return null;
  }
  return resolved;
};

const parseArgs = (argv) => {
  const options = { files: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--files") {
      index += 1;
      while (index < argv.length && !String(argv[index]).startsWith("--")) {
        const absolutePath = absoluteSourceFileFromInput(argv[index]);
        if (absolutePath && fs.existsSync(absolutePath) && absolutePath.endsWith(".css")) {
          options.files.push(absolutePath);
        }
        index += 1;
      }
      index -= 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/check-motion-literals.mjs [--files <path> ...]");
      process.exit(0);
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
};

const toRelative = (filePath) =>
  path.relative(projectRoot, filePath).replaceAll(path.sep, "/");

const isMotionDeclaration = (decl) =>
  MOTION_DECLARATION_RE.test(decl.prop) ||
  MOTION_CUSTOM_PROP_RE.test(decl.prop);

const collectMotionLiterals = (value) => {
  const matches = [];
  for (const match of value.matchAll(TIME_LITERAL_RE)) {
    matches.push(match[0]);
  }
  for (const match of value.matchAll(CUBIC_BEZIER_RE)) {
    matches.push(match[0]);
  }
  for (const match of value.matchAll(TIMING_KEYWORD_RE)) {
    matches.push(match[0]);
  }
  return matches;
};

const collectViolations = (cssFilePath) => {
  const source = fs.readFileSync(cssFilePath, "utf8");
  const root = postcss.parse(source, { from: cssFilePath });
  const violations = [];

  root.walkDecls((decl) => {
    if (!isMotionDeclaration(decl)) {
      return;
    }
    const tokens = collectMotionLiterals(decl.value);
    if (tokens.length === 0) {
      return;
    }
    const selector = decl.parent?.type === "rule" ? decl.parent.selector : "[no-selector]";
    tokens.forEach((token) => {
      violations.push({
        line: decl.source?.start?.line ?? 0,
        selector,
        prop: decl.prop,
        value: decl.value,
        token,
      });
    });
  });

  return violations;
};

if (!fs.existsSync(sourceRoot)) {
  console.error("[motion-literal-check] source directory not found:", sourceRoot);
  process.exit(1);
}

const options = parseArgs(process.argv.slice(2));
const sourceFiles = options.files.length > 0
  ? [...new Set(options.files)].sort()
  : walkFiles(sourceRoot);
const violations = [];
for (const cssFilePath of sourceFiles) {
  const relativePath = toRelative(cssFilePath);
  if (path.normalize(relativePath) === motionTokenPath) {
    continue;
  }
  collectViolations(cssFilePath).forEach((violation) => {
    violations.push({
      file: relativePath,
      ...violation,
    });
  });
}

if (violations.length > 0) {
  console.error(
    "[motion-literal-check] Found unmanaged motion literals outside src/styles/core/motion-tokens.css:",
  );
  violations.forEach((item) => {
    console.error(
      `  - ${item.file}:${item.line} | ${item.selector} | ${item.prop}: ${item.value} [${item.token}]`,
    );
  });
  console.error(
    "[motion-literal-check] Fix: route transition/animation timing through semantic motion tokens.",
  );
  process.exit(1);
}

console.log("[motion-literal-check] no unmanaged transition or animation timing literals.");
