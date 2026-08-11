// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASE_LOCALE,
  MESSAGE_SOURCE_LOCALE_ORDER,
  flattenMessageValue,
  I18N_MESSAGE_SOURCE_FILES,
  readI18nMessageSources,
} from "../../../../tools/docs/i18n-message-source-utils.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, "..");
const projectRoot = path.resolve(frontendRoot, "../../..");
const reportRoot = path.join(frontendRoot, "reports");
const reportJsonPath = path.join(reportRoot, "i18n-missing-report.json");
const reportMdPath = path.join(reportRoot, "i18n-missing-report.md");

const strictMode = process.argv.includes("--strict");
const noWriteMode = process.argv.includes("--no-write");

const buildSet = (items) => new Set(items);
const diff = (left, right) => [...left].filter((item) => !right.has(item));

const readListOption = (name) => {
  const values = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg === name) {
      for (let valueIndex = index + 1; valueIndex < process.argv.length; valueIndex += 1) {
        const value = process.argv[valueIndex];
        if (!value || value.startsWith("--")) {
          break;
        }
        values.push(value);
      }
      continue;
    }
    if (arg.startsWith(`${name}=`)) {
      values.push(...arg.slice(name.length + 1).split(","));
    }
  }
  return values.map((value) => value.trim()).filter(Boolean);
};

const normalizeProjectRelativePath = (filePath) => {
  const normalized = path.normalize(filePath);
  const absolutePath = path.isAbsolute(normalized)
    ? normalized
    : path.resolve(projectRoot, normalized);
  return path.relative(projectRoot, absolutePath).replace(/\\/gu, "/");
};

const resolveRequestedI18nSourceFiles = () => {
  const requestedFiles = readListOption("--files");
  if (!requestedFiles.length) {
    return null;
  }
  const requestedProjectPaths = requestedFiles.map(normalizeProjectRelativePath);
  const matchedSourceFiles = I18N_MESSAGE_SOURCE_FILES.filter((sourceFileName) =>
    requestedProjectPaths.some((requestedPath) =>
      requestedPath === sourceFileName ||
      requestedPath.endsWith(`/messages/${sourceFileName}`),
    ),
  );
  return {
    requestedProjectPaths,
    sourceFileNames: matchedSourceFiles,
  };
};

const leafPathsForLocale = (entry, locale) =>
  entry.kind === "text"
    ? ["$"]
    : flattenMessageValue(entry.locales[locale]).map(([leafPath]) => leafPath);

const requestedI18nSourceFiles = resolveRequestedI18nSourceFiles();
const { sourceFiles, entriesById } = readI18nMessageSources({
  projectRoot,
  sourceFileNames: requestedI18nSourceFiles?.sourceFileNames ?? null,
});

const groups = sourceFiles.map((sourceFile) => {
  const missingByLanguage = {};
  const extraByLanguage = {};
  let baseKeyCount = 0;

  for (const messageId of sourceFile.messageIds) {
    const entry = entriesById.get(messageId);
    const basePaths = buildSet(
      leafPathsForLocale(entry, BASE_LOCALE).map((leafPath) =>
        leafPath === "$" ? messageId : `${messageId}#${leafPath}`,
      ),
    );
    baseKeyCount += basePaths.size;
    for (const locale of MESSAGE_SOURCE_LOCALE_ORDER) {
      const localePaths = buildSet(
        leafPathsForLocale(entry, locale).map((leafPath) =>
          leafPath === "$" ? messageId : `${messageId}#${leafPath}`,
        ),
      );
      const missing = diff(basePaths, localePaths);
      const extra = diff(localePaths, basePaths);
      if (missing.length) {
        missingByLanguage[locale] ??= [];
        missingByLanguage[locale].push(...missing);
      }
      if (extra.length) {
        extraByLanguage[locale] ??= [];
        extraByLanguage[locale].push(...extra);
      }
    }
  }

  return {
    groupName: sourceFile.fileName,
    filePath: path.relative(projectRoot, sourceFile.filePath),
    baseKeyCount,
    missingByLanguage,
    extraByLanguage,
    extraLanguages: [],
  };
});

let totalMissing = 0;
let totalExtra = 0;
let totalExtraLanguages = 0;
for (const group of groups) {
  for (const values of Object.values(group.missingByLanguage)) {
    totalMissing += values.length;
  }
  for (const values of Object.values(group.extraByLanguage)) {
    totalExtra += values.length;
  }
  totalExtraLanguages += group.extraLanguages.length;
}

const report = {
  generatedAt: new Date().toISOString(),
  baseLanguage: BASE_LOCALE,
  languages: MESSAGE_SOURCE_LOCALE_ORDER,
  scope: requestedI18nSourceFiles
    ? {
        requestedFiles: requestedI18nSourceFiles.requestedProjectPaths,
        sourceFiles: requestedI18nSourceFiles.sourceFileNames,
        skipped: requestedI18nSourceFiles.sourceFileNames.length === 0,
      }
    : {
        requestedFiles: [],
        sourceFiles: I18N_MESSAGE_SOURCE_FILES,
        skipped: false,
      },
  summary: {
    frontendGroupCount: 0,
    sharedCatalogGroupCount: groups.length,
    groupCount: groups.length,
    totalMissing,
    totalExtra,
    totalExtraLanguages,
  },
  groups,
};

const mdLines = [];
mdLines.push("# I18N Missing Key Report");
mdLines.push("");
mdLines.push(`- GeneratedAt: ${report.generatedAt}`);
mdLines.push(`- BaseLanguage: \`${BASE_LOCALE}\``);
mdLines.push(`- Languages: ${MESSAGE_SOURCE_LOCALE_ORDER.map((item) => `\`${item}\``).join(", ")}`);
if (requestedI18nSourceFiles) {
  mdLines.push(
    `- Scope: files=${requestedI18nSourceFiles.requestedProjectPaths.length}, sourceFiles=${requestedI18nSourceFiles.sourceFileNames.length}`,
  );
}
mdLines.push(
  `- Summary: missing=${totalMissing}, extra=${totalExtra}, extraLanguages=${totalExtraLanguages}, groups=${groups.length}`,
);
mdLines.push("");

for (const group of groups) {
  mdLines.push(`## ${group.groupName}`);
  mdLines.push("");
  mdLines.push(`- Source: \`${group.filePath}\``);
  mdLines.push(`- BaseKeys: ${group.baseKeyCount}`);
  let hasAnyDiff = false;
  for (const language of MESSAGE_SOURCE_LOCALE_ORDER) {
    const missing = group.missingByLanguage[language] ?? [];
    const extra = group.extraByLanguage[language] ?? [];
    if (!missing.length && !extra.length) {
      continue;
    }
    hasAnyDiff = true;
    mdLines.push(`- ${language}: missing=${missing.length}, extra=${extra.length}`);
    if (missing.length) {
      mdLines.push(`  - missingKeys: ${missing.map((item) => `\`${item}\``).join(", ")}`);
    }
    if (extra.length) {
      mdLines.push(`  - extraKeys: ${extra.map((item) => `\`${item}\``).join(", ")}`);
    }
  }
  if (!hasAnyDiff) {
    mdLines.push("- Status: no missing/extra keys");
  }
  mdLines.push("");
}

if (!noWriteMode) {
  fs.mkdirSync(reportRoot, { recursive: true });
  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(reportMdPath, `${mdLines.join("\n")}\n`, "utf8");
  console.log(`Generated i18n report: ${path.relative(frontendRoot, reportJsonPath)}`);
  console.log(`Generated i18n report: ${path.relative(frontendRoot, reportMdPath)}`);
}

console.log(
  `Summary => missing: ${totalMissing}, extra: ${totalExtra}, extraLanguages: ${totalExtraLanguages}, groups: ${groups.length}`,
);

if (strictMode && (totalMissing > 0 || totalExtra > 0 || totalExtraLanguages > 0)) {
  process.exit(1);
}
