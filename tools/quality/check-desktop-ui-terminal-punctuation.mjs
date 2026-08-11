#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  flattenMessageValue,
  readI18nMessageSources,
} from "../docs/i18n-message-source-utils.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "../..");

const TEXT_UI_NAMESPACES = new Set([
  "appText",
  "common",
  "dialogs",
  "onboarding",
  "settings",
  "trainer",
  "uiConfig",
  "uiLabels",
]);

const JSON_UI_MESSAGE_IDS = new Set([
  "uiConfig.customIndicatorEngine.bundle",
  "uiConfig.drawToolLabels.bundle",
  "uiConfig.portableDataTransfer.bundle",
  "uiConfig.replayNote.reflectionCopy.bundle",
  "uiConfig.replayNote.reflectionForm.bundle",
  "uiConfig.replayNote.reflectionSection.bundle",
  "uiConfig.replayNote.seeding.bundle",
  "uiConfig.specialTraining.bundle",
  "uiConfig.tradingSettings.bundle",
  "uiConfig.trainingCommandCenter.bundle",
]);

const TEXT_ID_EXCLUSION_RE =
  /(?:^emails\.|\.emails\.|email\.|legalNotice|desktopLegal|privacyPolicy|termsOfUse|customIndicatorReference|customIndicatorRules|customIndicatorAiGuide|customIndicatorAiConversion|customIndicatorRuleDocs)/iu;

const JSON_LEAF_EXCLUSION_RE =
  /(?:email|mail|legalNotice|privacy|terms|aiConversion|conversionGuide|ruleDocs|reference|tutorial|example|sampleCode|codeBlock|sourceCode|syntaxItems|instructions)/iu;

const ABBREVIATION_FINAL_PERIOD_RE =
  /(?:(?:\b(?:Co|Corp|Inc|LLC|Ltd|No|Pte|St|etc|e\.g|i\.e|vs)\.)|(?:\b[A-Z]\.){2,})$/u;

const MAX_VIOLATIONS_TO_PRINT = 200;

const normalizePath = (filePath) =>
  path.relative(projectRoot, filePath).replace(/\\/gu, "/");

const hasDisallowedTerminalPunctuation = (locale, value) => {
  if (typeof value !== "string") {
    return false;
  }
  if (value.endsWith("...") || value.endsWith("…")) {
    return false;
  }
  if (locale === "zh-CN" || locale === "ja") {
    return value.endsWith("。");
  }
  if (locale === "en" || locale === "ko" || locale === "es") {
    return value.endsWith(".") && !ABBREVIATION_FINAL_PERIOD_RE.test(value);
  }
  return false;
};

const isTextUiMessage = (messageId) => {
  const dotIndex = messageId.indexOf(".");
  const namespace = dotIndex === -1 ? messageId : messageId.slice(0, dotIndex);
  return TEXT_UI_NAMESPACES.has(namespace) && !TEXT_ID_EXCLUSION_RE.test(messageId);
};

const pushViolation = ({ violations, entry, locale, keyPath, value }) => {
  if (violations.length >= MAX_VIOLATIONS_TO_PRINT) {
    return;
  }
  violations.push({
    filePath: normalizePath(entry.filePath),
    keyPath,
    locale,
    value: value.replace(/\s+/gu, " ").trim().slice(0, 180),
  });
};

const { entries } = readI18nMessageSources({ projectRoot });
const violations = [];
let violationCount = 0;

for (const entry of entries) {
  if (entry.kind === "text" && isTextUiMessage(entry.id)) {
    for (const [locale, value] of Object.entries(entry.locales)) {
      if (hasDisallowedTerminalPunctuation(locale, value)) {
        violationCount += 1;
        pushViolation({
          violations,
          entry,
          locale,
          keyPath: entry.id,
          value,
        });
      }
    }
    continue;
  }

  if (entry.kind === "json" && JSON_UI_MESSAGE_IDS.has(entry.id)) {
    for (const [locale, value] of Object.entries(entry.locales)) {
      for (const [leafPath, leafValue] of flattenMessageValue(value)) {
        const keyPath = `${entry.id}.${leafPath}`;
        if (
          typeof leafValue === "string" &&
          !JSON_LEAF_EXCLUSION_RE.test(keyPath) &&
          hasDisallowedTerminalPunctuation(locale, leafValue)
        ) {
          violationCount += 1;
          pushViolation({
            violations,
            entry,
            locale,
            keyPath,
            value: leafValue,
          });
        }
      }
    }
  }
}

if (violationCount > 0) {
  console.error(
    "[copy-check] Desktop UI copy must not end with product-surface sentence periods:",
  );
  for (const violation of violations) {
    console.error(
      `- ${violation.filePath}:${violation.keyPath} [${violation.locale}] ${violation.value}`,
    );
  }
  const suppressedCount = violationCount - violations.length;
  if (suppressedCount > 0) {
    console.error(`... ${suppressedCount} more violations suppressed`);
  }
  process.exit(1);
}

console.log("[copy-check] Desktop UI terminal punctuation guard passed.");
