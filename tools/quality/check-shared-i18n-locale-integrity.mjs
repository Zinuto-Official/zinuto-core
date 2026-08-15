#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  I18N_MESSAGE_SOURCE_FILES,
  APP_LOCALES,
  getMessagesRoot,
  readI18nMessageSources,
} from "../docs/i18n-message-source-utils.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "../..");
const messagesRoot = getMessagesRoot(projectRoot);
const { catalogs, entriesById, namespaceEntries } = readI18nMessageSources({
  projectRoot,
});
const replayNoteBuilderPath = path.join(
  projectRoot,
  "packages",
  "shared",
  "src",
  "replayNoteBuilder.ts",
);
const frontendUiConfigPath = path.join(
  projectRoot,
  "apps",
  "desktop",
  "web",
  "src",
  "ui",
  "config",
  "uiConfig.ts",
);
const frontendSpecialTrainingContentPath = path.join(
  projectRoot,
  "apps",
  "desktop",
  "web",
  "src",
  "ui",
  "config",
  "uiConfig",
  "specialTrainingContent.ts",
);

const HAN_RE = /[\p{Script=Han}]/u;
const HIRAGANA_RE = /[\p{Script=Hiragana}]/u;
const KATAKANA_RE = /[\p{Script=Katakana}]/u;
const HANGUL_RE = /[\p{Script=Hangul}]/u;
const LATIN_RE = /[A-Za-z]/u;

const RETIRED_APP_LOCALES = ["zh-TW", "fr"];

const SIMPLIFIED_ONLY_RE =
  /[边这还过样总务复导库确风观应盘练阶页设图现从动战门长卖买账负处]/u;

const LANGUAGE_AUTONYM_KEY_RE =
  /^uiLabels\.languageOptions\.(zhCn|ko|ja|es|en)$/u;

const HIGH_RISK_ENGLISH_BUNDLE_MARKERS = [
  "uiConfig.trainingCommandCenter.bundle",
  "uiConfig.replayNote.seeding.bundle",
  "uiConfig.replayNote.reflectionCopy.bundle",
];

const HIGH_RISK_ENGLISH_SUBSTRINGS = [
  "Training Command Center",
  "Overview Surface",
  "Scenario Surface",
  "Review Surface",
  "Purchase Route",
  "Upgrade Decision",
  "Tier Collection",
  "Remaining to Unlock",
  "Current Highest",
  "Next Target",
  "Unlocked",
  "Locked",
  "System share opened.",
  "Poster saved to the selected location.",
  "Patient Setup",
  "Breakout Thesis",
  "FOMO Chase",
  "Plan Followed",
  "Early Exit",
  "Clean Breakout",
  "Entry Hesitation",
  "Disciplined Stop",
  "Top/Bottom Guessing",
  "Oversized Exposure",
  "Counter-Trend Hold",
  "Controlled Reset",
  "Trading Framework",
  "Breakout Playbook",
  "Error Review",
  "This note has no structured reflection prompts.",
  "Extra Notes",
];

const SAME_AS_ENGLISH_PRODUCT_KEYS = new Set([
  "appText.aboutZinutoCompany",
  "appText.atr14",
  "appText.edge5x",
  "appText.survival90Percent",
  "appText.zinuto",
  "appText.zinutoReplay",
  "shell.brand.name",
  "uiLabels.ui.reviewRuleMakerTaker",
]);
const DESKTOP_HELP_VENDOR_KEY_RE =
  /^uiConfig\.desktopHelp\.bundle\.articles\.(?:data-acquire|data-source-by-market)\.keywords\[\d+\]$/u;
const DESKTOP_HELP_VENDOR_NAMES = new Set([
  "AKShare",
  "CCXT",
  "Binance Spot",
  "OKX Spot",
  "AkShare",
  "Tushare",
  "TradingView",
  "Binance",
  "HistData",
  "Nasdaq Data Link",
]);
const SAME_AS_ENGLISH_LOCALE_KEY_ALLOWLIST = new Set([
  "es::appText.color",
  "es::uiLabels.ui.color",
  "es::uiConfig.desktopHelp.bundle.articles.notes-create.keywords[1]",
]);

const violations = [];
const MAX_VIOLATIONS_TO_PRINT = 200;
let suppressedViolationCount = 0;

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const resolveSourceFilePathForKeyPath = (keyPath) => {
  let bestMatch = null;
  for (const [messageId, entry] of entriesById.entries()) {
    if (
      keyPath === messageId ||
      keyPath.startsWith(`${messageId}.`) ||
      keyPath.startsWith(`${messageId}[`)
    ) {
      if (!bestMatch || messageId.length > bestMatch.id.length) {
        bestMatch = entry;
      }
    }
  }
  return bestMatch?.filePath ?? messagesRoot;
};

const pushViolation = ({ locale, filePath, keyPath, reason, value }) => {
  if (violations.length >= MAX_VIOLATIONS_TO_PRINT) {
    suppressedViolationCount += 1;
    return;
  }
  violations.push({
    locale,
    filePath: path.relative(projectRoot, filePath),
    keyPath,
    reason,
    value: String(value ?? "")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 180),
  });
};

const shouldAllowScriptAutonym = (keyPath) =>
  LANGUAGE_AUTONYM_KEY_RE.test(keyPath);

const hasWrongScriptForLocale = (locale, keyPath, value) => {
  if (!value || shouldAllowScriptAutonym(keyPath)) {
    return false;
  }

  if (locale === "en" || locale === "es") {
    return (
      HAN_RE.test(value) ||
      HIRAGANA_RE.test(value) ||
      KATAKANA_RE.test(value) ||
      HANGUL_RE.test(value)
    );
  }

  if (locale === "ko") {
    return (
      HAN_RE.test(value) || HIRAGANA_RE.test(value) || KATAKANA_RE.test(value)
    );
  }

  return false;
};

const isProbablyLocalizableString = (value) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return false;
  }
  if (/^(?:https?:\/\/|mailto:|zinuto:\/\/|\/|#)/u.test(normalized)) {
    return false;
  }
  if (/[{}]/u.test(normalized)) {
    return false;
  }
  if (/^\{[^{}]+\}$/u.test(normalized)) {
    return false;
  }
  if (/^[A-Z0-9_./:-]+$/u.test(normalized)) {
    return false;
  }
  if (/^[0-9.,%+\-*/:()\s]+$/u.test(normalized)) {
    return false;
  }
  return normalized.length >= 4 && LATIN_RE.test(normalized);
};

const hasSameAsEnglishLocalizableString = ({
  locale,
  keyPath,
  value,
  englishValue,
}) => {
  if (locale === "en" || !isProbablyLocalizableString(value)) {
    return false;
  }
  if (SAME_AS_ENGLISH_LOCALE_KEY_ALLOWLIST.has(`${locale}::${keyPath}`)) {
    return false;
  }
  if (SAME_AS_ENGLISH_PRODUCT_KEYS.has(keyPath)) {
    return false;
  }
  if (
    DESKTOP_HELP_VENDOR_KEY_RE.test(keyPath) &&
    DESKTOP_HELP_VENDOR_NAMES.has(String(value ?? "").trim())
  ) {
    return false;
  }
  if (
    /^uiConfig\.customIndicatorRuleDocs\.bundle/u.test(keyPath) &&
    /(?:^|\.)(?:id|key|kind|previewStyle|exampleKind|availability|keywords\[\d+\])$/u.test(
      keyPath,
    )
  ) {
    return false;
  }
  if (
    /^uiConfig\.customIndicatorRuleDocs\.bundle/u.test(keyPath) &&
    /(?:^|\.)(?:formula|example|title|code)$/u.test(keyPath) &&
    isProbablyTechnicalIndicatorSnippet(value)
  ) {
    return false;
  }
  if (/(?:^|[.\]])id$/u.test(keyPath)) {
    return false;
  }
  if (shouldAllowScriptAutonym(keyPath)) {
    return false;
  }
  return String(value ?? "").trim() === String(englishValue ?? "").trim();
};

const isProbablyTechnicalIndicatorSnippet = (value) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return true;
  }
  if (/^[A-Z0-9_./:+\-*=<>()\[\]{},;'"|%\s]+$/u.test(normalized)) {
    return true;
  }
  if (
    /(?:^|\s)(?:OUT|DIF|DEA|MACD|FAST|SLOW|COND|LINE|BUY|TXT|SIG|MA\d*|REFL|BASE|RANGE|BODY)\s*[:=]/u.test(
      normalized,
    )
  ) {
    return true;
  }
  if (/\b[A-Z][A-Z0-9_]+\s*\(/u.test(normalized)) {
    return true;
  }
  if (
    /\b(?:COLOR[A-Z0-9]+|LINETHICK\d*|DOTLINE|STICK|NODRAW|DRAWNULL)\b/u.test(
      normalized,
    )
  ) {
    return true;
  }
  return false;
};

const hasHighRiskEnglishPlaceholder = (locale, keyPath, value) => {
  if (!value || locale === "en") {
    return false;
  }
  const isHighRiskPath = HIGH_RISK_ENGLISH_BUNDLE_MARKERS.some((marker) =>
    keyPath.startsWith(marker),
  );
  return (
    isHighRiskPath &&
    HIGH_RISK_ENGLISH_SUBSTRINGS.some((entry) => value.includes(entry))
  );
};

const visitValue = ({ locale, filePath, keyPath, value }) => {
  if (typeof value === "string") {
    if (keyPath.endsWith(".bundle")) {
      try {
        const parsed = JSON.parse(value);
        visitValue({ locale, filePath, keyPath, value: parsed });
        return;
      } catch {
        // Ignore non-JSON bundle strings here; other checks own JSON validity.
      }
    }
    if (hasWrongScriptForLocale(locale, keyPath, value)) {
      pushViolation({
        locale,
        filePath,
        keyPath,
        reason: "wrong-script contamination",
        value,
      });
    }
    if (hasHighRiskEnglishPlaceholder(locale, keyPath, value)) {
      pushViolation({
        locale,
        filePath,
        keyPath,
        reason: "high-risk English placeholder remained in non-English locale",
        value,
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      visitValue({
        locale,
        filePath,
        keyPath: `${keyPath}[${index}]`,
        value: entry,
      }),
    );
    return;
  }

  if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      visitValue({
        locale,
        filePath,
        keyPath: keyPath ? `${keyPath}.${childKey}` : childKey,
        value: childValue,
      });
    }
  }
};

const scanCatalogNamespace = (locale, namespace) => {
  const rootValue = catalogs[locale]?.[namespace];
  if (!rootValue) {
    return;
  }
  visitValue({
    locale,
    filePath: messagesRoot,
    keyPath: namespace,
    value: rootValue,
  });
};

const assertOfficialMessageSourceFiles = () => {
  const actualFiles = fs
    .readdirSync(messagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
  const expectedFiles = [...I18N_MESSAGE_SOURCE_FILES].sort();
  const missing = expectedFiles.filter(
    (fileName) => !actualFiles.includes(fileName),
  );
  const extra = actualFiles.filter(
    (fileName) => !expectedFiles.includes(fileName),
  );
  const retired = actualFiles.filter((fileName) =>
    RETIRED_APP_LOCALES.some((locale) => fileName.includes(locale)),
  );
  if (missing.length || extra.length || retired.length) {
    pushViolation({
      locale: "shared",
      filePath: messagesRoot,
      keyPath: "packages/shared/src/i18n/messages",
      reason: "message source files must be exactly the six canonical domains",
      value: `missing=${missing.join(",") || "none"} extra=${extra.join(",") || "none"} retired=${retired.join(",") || "none"}`,
    });
  }
};

const flattenStrings = (value, keyPath = "") => {
  if (typeof value === "string") {
    if (keyPath.endsWith(".bundle")) {
      try {
        return flattenStrings(JSON.parse(value), keyPath);
      } catch {
        // Keep invalid JSON bundle strings visible to the normal string checks.
      }
    }
    return [[keyPath, value]];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      flattenStrings(entry, `${keyPath}[${index}]`),
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, childValue]) =>
      flattenStrings(childValue, keyPath ? `${keyPath}.${key}` : key),
    );
  }
  return [];
};

const readJsonCatalogBundle = ({ locale, fileName, key }) => {
  const namespace = path.basename(fileName, ".json");
  const messageId = `${namespace}.${key}`;
  const filePath = entriesById.get(messageId)?.filePath ?? messagesRoot;
  const raw = catalogs[locale]?.[namespace]?.[key];
  if (typeof raw !== "string") {
    throw new Error(
      `Missing JSON bundle ${messageId} in ${path.relative(projectRoot, filePath)}`,
    );
  }
  return {
    filePath,
    value: JSON.parse(raw),
  };
};

const resolveSpecialTrainingContentShapeKeys = () => {
  const sourceText = fs.readFileSync(
    frontendSpecialTrainingContentPath,
    "utf8",
  );
  const match = sourceText.match(
    /type SpecialTrainingPageContent = Readonly<\{([\s\S]*?)\}>;/u,
  );
  if (!match) {
    throw new Error("Unable to locate SpecialTrainingPageContent type.");
  }
  const stringKeys = Array.from(
    match[1].matchAll(/^\s*([A-Za-z0-9_]+): string;/gmu),
    (entry) => entry[1],
  );
  return new Set([...stringKeys, "modes"]);
};

const scanSpecialTrainingBundleShape = () => {
  const expectedKeys = resolveSpecialTrainingContentShapeKeys();
  for (const locale of APP_LOCALES) {
    const { filePath, value } = readJsonCatalogBundle({
      locale,
      fileName: "uiConfig.json",
      key: "specialTraining.bundle",
    });
    const actualKeys = new Set(Object.keys(value));
    const missing = [...expectedKeys].filter((key) => !actualKeys.has(key));
    const extra = [...actualKeys].filter((key) => !expectedKeys.has(key));
    if (missing.length || extra.length) {
      pushViolation({
        locale,
        filePath,
        keyPath: "uiConfig.specialTraining.bundle",
        reason:
          "special training bundle shape must match SpecialTrainingPageContent",
        value: `missing=${missing.join(",") || "none"} extra=${extra.join(",") || "none"}`,
      });
    }
  }
};

const scanCustomIndicatorRuleDocsBundleShape = () => {
  const expectedModuleKeys = [
    "examples",
    "syntax",
    "plot",
    "fields",
    "functions",
  ];
  for (const locale of APP_LOCALES) {
    const { filePath, value } = readJsonCatalogBundle({
      locale,
      fileName: "uiConfig.json",
      key: "customIndicatorRuleDocs.bundle",
    });
    if (!Array.isArray(value)) {
      pushViolation({
        locale,
        filePath,
        keyPath: "uiConfig.customIndicatorRuleDocs.bundle",
        reason: "custom indicator rule docs bundle must be an array",
        value: typeof value,
      });
      continue;
    }
    const actualModuleKeys = value.map((entry) => entry?.key);
    const missing = expectedModuleKeys.filter(
      (key) => !actualModuleKeys.includes(key),
    );
    const extra = actualModuleKeys.filter(
      (key) => !expectedModuleKeys.includes(key),
    );
    if (missing.length || extra.length) {
      pushViolation({
        locale,
        filePath,
        keyPath: "uiConfig.customIndicatorRuleDocs.bundle",
        reason:
          "custom indicator rule docs module keys must match the desktop reference center",
        value: `missing=${missing.join(",") || "none"} extra=${extra.join(",") || "none"}`,
      });
    }
    for (const module of value) {
      if (
        !module ||
        typeof module !== "object" ||
        typeof module.label !== "string" ||
        typeof module.overview !== "string" ||
        !Array.isArray(module.sections)
      ) {
        pushViolation({
          locale,
          filePath,
          keyPath: `uiConfig.customIndicatorRuleDocs.bundle.${module?.key ?? "unknown"}`,
          reason:
            "custom indicator module must include label, overview, and sections",
          value: JSON.stringify(module ?? null).slice(0, 180),
        });
        continue;
      }
      if (!module.sections.length) {
        pushViolation({
          locale,
          filePath,
          keyPath: `uiConfig.customIndicatorRuleDocs.bundle.${module.key}`,
          reason: "custom indicator module must contain at least one section",
          value: module.key,
        });
      }
      for (const section of module.sections) {
        if (
          !section ||
          typeof section.title !== "string" ||
          typeof section.summary !== "string" ||
          !Array.isArray(section.entries) ||
          !section.entries.length
        ) {
          pushViolation({
            locale,
            filePath,
            keyPath: `uiConfig.customIndicatorRuleDocs.bundle.${module.key}.${section?.id ?? "unknown"}`,
            reason:
              "custom indicator section must include title, summary, and entries",
            value: JSON.stringify(section ?? null).slice(0, 180),
          });
        }
      }
    }
  }
};

const scanSameAsEnglishStrings = () => {
  for (const namespace of namespaceEntries) {
    const englishCatalog = catalogs.en[namespace];
    const englishMap = new Map(flattenStrings(englishCatalog, namespace));
    for (const locale of APP_LOCALES.filter((entry) => entry !== "en")) {
      if (!catalogs[locale]?.[namespace]) {
        continue;
      }
      for (const [keyPath, value] of flattenStrings(
        catalogs[locale][namespace],
        namespace,
      )) {
        if (
          hasSameAsEnglishLocalizableString({
            locale,
            keyPath,
            value,
            englishValue: englishMap.get(keyPath),
          })
        ) {
          pushViolation({
            locale,
            filePath: resolveSourceFilePathForKeyPath(keyPath),
            keyPath,
            reason: "same-as-English localizable string",
            value,
          });
        }
      }
    }
  }
};

const scanFrontendUiConfigSource = () => {
  const sourceFiles = [
    frontendUiConfigPath,
    frontendSpecialTrainingContentPath,
  ];
  const bannedPatterns = [
    {
      label:
        "custom indicator rule docs must not map ja/ko/es to English runtime docs",
      pattern:
        /CUSTOM_INDICATOR_RULE_DOCS_BY_LANGUAGE[\s\S]*?(?:ja|ko|es)\s*:\s*CUSTOM_INDICATOR_RULE_DOCS_EN_RUNTIME/gu,
    },
    {
      label:
        "special training runtime copy overrides must live in shared catalogs",
      pattern: /SPECIAL_TRAINING_RUNTIME_OVERRIDES_BY_LANGUAGE/gu,
    },
    {
      label: "special training mode copy arrays must live in shared catalogs",
      pattern: /SPECIAL_TRAINING_MODES_(?:ZH_CN|ZH_TW|EN|KO|JA|FR|ES)/gu,
    },
    {
      label:
        "trading settings runtime copy overrides must live in shared catalogs",
      pattern: /TRADING_SETTINGS_RUNTIME_OVERRIDES_BY_LANGUAGE/gu,
    },
  ];

  for (const sourceFile of sourceFiles) {
    const sourceText = fs.readFileSync(sourceFile, "utf8");
    for (const { label, pattern } of bannedPatterns) {
      pattern.lastIndex = 0;
      if (!pattern.test(sourceText)) {
        continue;
      }
      violations.push({
        locale: "frontend",
        filePath: path.relative(projectRoot, sourceFile),
        keyPath: "source",
        reason: label,
        value: label,
      });
    }
  }
};

const scanReplayNoteBuilder = () => {
  const sourceText = fs.readFileSync(replayNoteBuilderPath, "utf8");
  const bannedPatterns = [
    {
      label:
        "explicit locale-to-English replay-note seeding assignment is not allowed",
      pattern:
        /REPLAY_NOTE_SEEDING_BY_LANGUAGE\.(?:ko|ja|es)\s*=\s*REPLAY_NOTE_SEEDING_BY_LANGUAGE\.en/gu,
    },
    {
      label:
        "runtime replay-note seeding fallback to English is not allowed for supported locales",
      pattern: /\?\?\s*REPLAY_NOTE_SEEDING_BY_LANGUAGE\.en(?:\[[^\]]+\])?/gu,
    },
  ];

  for (const { label, pattern } of bannedPatterns) {
    if (!pattern.test(sourceText)) {
      continue;
    }
    violations.push({
      locale: "shared",
      filePath: path.relative(projectRoot, replayNoteBuilderPath),
      keyPath: "source",
      reason: label,
      value: label,
    });
  }
};

[
  ["en", ["uiConfig", "uiLabels"]],
  ["es", ["appText", "uiConfig", "uiLabels"]],
  ["ko", ["appText", "uiConfig", "uiLabels"]],
  ["ja", ["uiConfig", "uiLabels"]],
].forEach(([locale, fileNames]) => {
  fileNames.forEach((namespace) => scanCatalogNamespace(locale, namespace));
});

assertOfficialMessageSourceFiles();
scanSpecialTrainingBundleShape();
scanCustomIndicatorRuleDocsBundleShape();
scanSameAsEnglishStrings();
scanFrontendUiConfigSource();
scanReplayNoteBuilder();

if (violations.length > 0) {
  console.error(
    "[i18n-locale-integrity] Shared locale integrity check failed:",
  );
  for (const violation of violations) {
    console.error(
      `- ${violation.filePath} [${violation.locale}] ${violation.keyPath}: ${violation.reason} :: ${violation.value}`,
    );
  }
  if (suppressedViolationCount > 0) {
    console.error(
      `- ... plus ${suppressedViolationCount} additional violations suppressed for readability`,
    );
  }
  process.exit(1);
}

console.log("[i18n-locale-integrity] Shared locale integrity check passed.");
