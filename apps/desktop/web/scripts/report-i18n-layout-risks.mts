// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";

const frontendRoot = path.resolve(import.meta.dirname, "..");
const srcRoot = path.join(frontendRoot, "src");
const reportRoot = path.join(frontendRoot, "reports");
const reportJsonPath = path.join(reportRoot, "i18n-layout-risks-report.json");
const reportMdPath = path.join(reportRoot, "i18n-layout-risks-report.md");

const CSS_FILE_SUFFIXES = [".css"];
const RISK_PATTERNS = [
  { id: "nowrap", regex: /white-space:\s*nowrap/gu },
  { id: "ellipsis", regex: /text-overflow:\s*ellipsis/gu },
  { id: "single_line_grid", regex: /minmax\(168px,\s*220px\)/gu },
  { id: "legacy_compact_width", regex: /max-width:\s*min\(58%/gu },
];

const collectFiles = (dirPath: string): string[] => {
  const results: string[] = [];
  const walk = (currentPath: string) => {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && CSS_FILE_SUFFIXES.some((suffix) => fullPath.endsWith(suffix))) {
        results.push(fullPath);
      }
    }
  };
  walk(dirPath);
  return results;
};

const files = collectFiles(srcRoot)
  .map((filePath) => {
    const sourceText = fs.readFileSync(filePath, "utf8");
    const matches = Object.fromEntries(
      RISK_PATTERNS.map(({ id, regex }) => [id, [...sourceText.matchAll(regex)].length]),
    );
    const total = Object.values(matches).reduce((sum, count) => sum + Number(count), 0);
    return {
      filePath,
      relativePath: path.relative(frontendRoot, filePath),
      total,
      matches,
    };
  })
  .filter((entry) => entry.total > 0)
  .sort((left, right) => right.total - left.total || left.relativePath.localeCompare(right.relativePath));

const report = {
  generatedAt: new Date().toISOString(),
  files: files.length,
  totalRiskMatches: files.reduce((sum, entry) => sum + entry.total, 0),
  rows: files,
};

const markdown = [
  "# I18N Layout Risk Report",
  "",
  `- GeneratedAt: ${report.generatedAt}`,
  `- Files: ${report.files}`,
  `- TotalRiskMatches: ${report.totalRiskMatches}`,
  "",
  "## Top Files",
  "",
  ...report.rows.slice(0, 120).map((row) => {
    const details = Object.entries(row.matches)
      .filter(([, count]) => Number(count) > 0)
      .map(([key, count]) => `${key}=${count}`)
      .join(", ");
    return `- ${row.relativePath}: ${row.total} (${details})`;
  }),
  "",
].join("\n");

fs.mkdirSync(reportRoot, { recursive: true });
fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));
fs.writeFileSync(reportMdPath, markdown);

console.log(`Generated layout risk report: ${path.relative(frontendRoot, reportJsonPath)}`);
console.log(`Generated layout risk report: ${path.relative(frontendRoot, reportMdPath)}`);
console.log(`Summary => files: ${report.files}, risks: ${report.totalRiskMatches}`);
