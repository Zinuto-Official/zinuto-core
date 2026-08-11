#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "../..");

const scannedRoots = [
  "apps/desktop/web/src",
].map((relativePath) => path.join(projectRoot, relativePath));

const sourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".mjs",
]);

const ignoredPathSegments = new Set([
  "node_modules",
  "dist",
  "reports",
  "test-results",
]);

const rules = [
  {
    label: "retired TXT_* message id",
    pattern: /\bTXT_[0-9A-Z_]+\b/u,
  },
  {
    label: "retired appText runtime import",
    pattern: /\b(?:appTextRuntime|formatAppText|appTextTypes)\b/u,
  },
  {
    label: "copy tone replacement patch layer",
    pattern: /\bCOPY_TONE_REPLACEMENTS_BY_LANGUAGE\b/u,
  },
  {
    label: "page-layer zh-CN locale branch",
    pattern: /\b(?:locale\s*(?:===|!==|==|!=)\s*["']zh-CN["']|isZh)\b/u,
  },
];

const violations = [];

const shouldSkip = (filePath) => {
  const relative = path.relative(projectRoot, filePath).replace(/\\/gu, "/");
  if (relative === "packages/shared/src/i18n.generated.ts") {
    return true;
  }
  return relative
    .split("/")
    .some((segment) => ignoredPathSegments.has(segment));
};

const collectSourceFiles = (dirPath, files = []) => {
  if (!fs.existsSync(dirPath)) {
    return files;
  }
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredPathSegments.has(entry.name)) {
        collectSourceFiles(absolutePath, files);
      }
      continue;
    }
    if (
      entry.isFile() &&
      sourceExtensions.has(path.extname(entry.name)) &&
      !shouldSkip(absolutePath)
    ) {
      files.push(absolutePath);
    }
  }
  return files;
};

for (const filePath of scannedRoots.flatMap((root) => collectSourceFiles(root))) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const lines = sourceText.split(/\r?\n/u);
  lines.forEach((line, index) => {
    for (const rule of rules) {
      if (rule.pattern.test(line)) {
        violations.push({
          relativePath: path.relative(projectRoot, filePath),
          lineNumber: index + 1,
          label: rule.label,
          line: line.trim(),
        });
      }
    }
  });
}

if (violations.length > 0) {
  console.error(
    "[copy-check] Centralized user-facing text guard failed. Use packages/shared/src/i18n message ids and remove page-layer language forks:",
  );
  for (const violation of violations) {
    console.error(
      `- ${violation.relativePath}:${violation.lineNumber} [${violation.label}] ${violation.line}`,
    );
  }
  process.exit(1);
}

console.log(
  `[copy-check] Centralized user-facing text guard passed across ${scannedRoots.length} roots.`,
);
