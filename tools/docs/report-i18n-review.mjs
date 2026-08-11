#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MESSAGE_SOURCE_LOCALE_ORDER,
  flattenMessageValue,
  readI18nMessageSources,
} from "./i18n-message-source-utils.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "../..");
const sharedRoot = path.join(projectRoot, "packages", "shared");
const reportRoot = path.join(sharedRoot, "reports");
const reportPath = path.join(reportRoot, "i18n-message-review.md");

const { sourceFiles, entriesById } = readI18nMessageSources({ projectRoot });

const escapeCell = (value) =>
  String(value ?? "")
    .replace(/\r?\n/gu, "<br>")
    .replace(/\|/gu, "\\|");

const buildRowsForEntry = (entry) => {
  if (entry.kind === "text") {
    return [
      [
        entry.id,
        ...MESSAGE_SOURCE_LOCALE_ORDER.map((locale) => entry.locales[locale]),
      ],
    ];
  }

  const baseRows = flattenMessageValue(entry.locales.en);
  return baseRows.map(([leafPath]) => [
    `${entry.id}#${leafPath}`,
    ...MESSAGE_SOURCE_LOCALE_ORDER.map((locale) => {
      const valueMap = new Map(flattenMessageValue(entry.locales[locale]));
      return valueMap.get(leafPath);
    }),
  ]);
};

const lines = [
  "# I18N Message Review",
  "",
  `- GeneratedAt: ${new Date().toISOString()}`,
  `- Source: \`packages/shared/src/i18n/messages/*.json\``,
  `- Locale order: ${MESSAGE_SOURCE_LOCALE_ORDER.map((locale) => `\`${locale}\``).join(", ")}`,
  "- Edit source JSON files only; this Markdown file is generated for review.",
  "",
  "## How To Update",
  "",
  "1. Do not make lasting copy changes in this Markdown report; it is regenerated and direct edits will be overwritten.",
  "2. Edit the matching entry in `packages/shared/src/i18n/messages/*.json`.",
  "3. Regenerate runtime output with `npm run build --workspace=@zinuto/shared`.",
  "4. Regenerate this review file with `npm run report:i18n-review --workspace=@zinuto/shared`.",
  "5. Validate with `npm run check:i18n-missing --workspace=@zinuto/desktop-web` and `npm run check:i18n-runtime --workspace=@zinuto/desktop-web`.",
  "",
];

for (const sourceFile of sourceFiles) {
  lines.push(`## ${sourceFile.fileName}`);
  lines.push("");
  lines.push(
    `| message id | ${MESSAGE_SOURCE_LOCALE_ORDER.map((locale) => `\`${locale}\``).join(" | ")} |`,
  );
  lines.push(
    `| --- | ${MESSAGE_SOURCE_LOCALE_ORDER.map(() => "---").join(" | ")} |`,
  );
  for (const messageId of sourceFile.messageIds) {
    const entry = entriesById.get(messageId);
    for (const row of buildRowsForEntry(entry)) {
      lines.push(`| ${row.map(escapeCell).join(" | ")} |`);
    }
  }
  lines.push("");
}

fs.mkdirSync(reportRoot, { recursive: true });
fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");

console.log(`Generated i18n review report: ${path.relative(projectRoot, reportPath)}`);
