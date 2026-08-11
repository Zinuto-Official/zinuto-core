#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "../..");

const scannedFiles = [
  ...fs
    .readdirSync(path.join(projectRoot, "packages", "shared", "src", "i18n", "messages"))
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) =>
      path.join(projectRoot, "packages", "shared", "src", "i18n", "messages", fileName),
    ),
  path.join(projectRoot, "README.md"),
  path.join(projectRoot, "docs", "ARCHITECTURE.md"),
];

const rulesByLocale = {
  "zh-CN": [
    /本地数据导入/u,
    /本地导入数据/u,
    /本地行情数据导入/u,
    /本地行情导入/u,
    /导入本地行情数据/u,
    /导入源/u,
    /本地数据源/u,
    /数据池/u,
    /本地行情数据行情数据/u,
    /导入数据/u,
    /标的池/u,
    /系统样本/u,
    /样本数据包/u,
    /交易品类/u,
    /交易品种/u,
    /大类资产/u,
    /资产类型/u,
  ],
  en: [
    /\blocal data imports?\b/iu,
    /\blocal imported data\b/iu,
    /\blocal imports?\b/iu,
    /\blocal sources?\b/iu,
    /\bimport local data\b/iu,
    /\bimported local folder\b/iu,
    /\bimported data\b/iu,
    /\bsymbol pools?\b/iu,
    /\bsymbols?\b/iu,
    /\bsample datasets?\b/iu,
    /\bsample data\b/iu,
    /\bsystem samples?\b(?!\s+pools?\b)/iu,
    /\bbuilt-in samples?\b(?!\s+pools?\b)/iu,
    /(?<!sample )\bpools?\b/iu,
  ],
  ja: [
    /ローカルインポート/u,
    /ローカル取り込み/u,
    /ローカル導入/u,
    /サンプルデータ/u,
    /システムサンプル/u,
    /内蔵サンプル(?!プール)/u,
    /(?<!サンプル)プール/u,
  ],
  ko: [
    /로컬 가져오기/u,
    /로컬 소스/u,
    /심볼/u,
    /가져오기 데이터/u,
    /샘플 데이터/u,
    /시스템 샘플/u,
    /내장 샘플(?! 풀)/u,
    /(?<!샘플 )풀(?!사이즈)/u,
  ],
  es: [
    /importaciones locales/iu,
    /importación local/iu,
    /importación de datos locales/iu,
    /datos importados locales/iu,
    /grupo de muestra/iu,
    /grupos de muestra/iu,
    /fuente local/iu,
    /pools? de instrumentos/iu,
    /muestras incluidas/iu,
    /símbolos?/iu,
  ],
};

const localeKeySegmentRe = /(?:^|\.)(en|zh-CN|ja|ko|es)(?:\.|$)/u;

const violations = [];

const pushViolation = ({ filePath, keyPath, locale, pattern, value }) => {
  violations.push({
    relativePath: path.relative(projectRoot, filePath),
    keyPath,
    locale,
    pattern: String(pattern).replace(/^\/|\/[a-z]*$/giu, ""),
    value: String(value).replace(/\s+/gu, " ").trim().slice(0, 220),
  });
};

const scanValue = ({ filePath, keyPath, locale, value }) => {
  const rules = rulesByLocale[locale] ?? [];
  const visibleValue = value.replace(/\{[^}]*\}/gu, "{}");
  for (const pattern of rules) {
    if (pattern.test(visibleValue)) {
      pushViolation({ filePath, keyPath, locale, pattern, value });
    }
  }
};

const walkJson = ({ filePath, value, keyPath = "" }) => {
  if (typeof value === "string") {
    const locale = keyPath.match(localeKeySegmentRe)?.[1];
    if (locale) {
      scanValue({ filePath, keyPath, locale, value });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walkJson({ filePath, value: item, keyPath: `${keyPath}.${index}` }),
    );
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) =>
      walkJson({
        filePath,
        value: item,
        keyPath: keyPath ? `${keyPath}.${key}` : key,
      }),
    );
  }
};

for (const filePath of scannedFiles) {
  const text = fs.readFileSync(filePath, "utf8");
  if (filePath.endsWith(".json")) {
    walkJson({ filePath, value: JSON.parse(text) });
    continue;
  }
  text.split(/\r?\n/u).forEach((line, index) => {
    scanValue({
      filePath,
      keyPath: String(index + 1),
      locale: "en",
      value: line,
    });
  });
}

if (violations.length > 0) {
  console.error("[terminology-check] Product terminology guard failed:");
  for (const violation of violations.slice(0, 200)) {
    console.error(
      `- ${violation.relativePath}:${violation.keyPath} [${violation.locale}] /${violation.pattern}/ -> ${violation.value}`,
    );
  }
  if (violations.length > 200) {
    console.error(`... ${violations.length - 200} more violations omitted`);
  }
  process.exit(1);
}

console.log(
  `[terminology-check] Product terminology guard passed across ${scannedFiles.length} files.`,
);
