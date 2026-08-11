// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";

export const APP_LOCALES = ["en", "zh-CN", "ja", "ko", "es"];
export const MESSAGE_SOURCE_LOCALE_ORDER = ["zh-CN", "en", "ja", "ko", "es"];
export const BASE_LOCALE = "en";

export const I18N_MESSAGE_SOURCE_FILES = [
  "platform-core.json",
  "general-actions.json",
  "training-replay.json",
  "data-settings.json",
  "desktop-help.json",
  "custom-indicator.json",
  "command-notes.json",
];

const MESSAGE_ID_RE = /^[^\s.]+(?:\.[^\s.]+)+$/u;

const normalizePath = (filePath) => filePath.replace(/\\/gu, "/");

const readJson = (filePath) =>
  JSON.parse(fs.readFileSync(filePath, "utf8"));

const parseTopLevelKeys = (sourceText) =>
  Array.from(
    sourceText.matchAll(/^\s{2}"((?:[^"\\]|\\.)+)"\s*:/gmu),
    (match) => JSON.parse(`"${match[1]}"`),
  );

const assertExactKeys = ({
  actual,
  expected,
  filePath,
  keyPath,
}) => {
  const missing = expected.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !expected.includes(key));
  if (missing.length || extra.length) {
    throw new Error(
      `[i18n-source] ${normalizePath(filePath)} ${keyPath} must contain exactly ${expected.join(", ")}. Missing: ${missing.join(", ") || "none"}; Extra: ${extra.join(", ") || "none"}`,
    );
  }
};

const assertNoBlankStrings = ({ value, filePath, keyPath }) => {
  if (typeof value === "string") {
    if (!value.trim()) {
      throw new Error(
        `[i18n-source] ${normalizePath(filePath)} ${keyPath} must not be blank`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoBlankStrings({
        value: entry,
        filePath,
        keyPath: `${keyPath}[${index}]`,
      }),
    );
    return;
  }
  if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      assertNoBlankStrings({
        value: childValue,
        filePath,
        keyPath: `${keyPath}.${childKey}`,
      });
    }
  }
};

export const getMessagesRoot = (projectRoot) =>
  path.join(projectRoot, "packages", "shared", "src", "i18n", "messages");

export const readI18nMessageSources = ({ projectRoot, sourceFileNames = null }) => {
  const messagesRoot = getMessagesRoot(projectRoot);
  const actualFiles = fs.existsSync(messagesRoot)
    ? fs
        .readdirSync(messagesRoot, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => entry.name)
        .sort()
    : [];
  assertExactKeys({
    actual: actualFiles,
    expected: [...I18N_MESSAGE_SOURCE_FILES].sort(),
    filePath: messagesRoot,
      keyPath: "source files",
  });
  const requestedSourceFileSet = sourceFileNames
    ? new Set(sourceFileNames.map((fileName) => path.basename(String(fileName))))
    : null;
  if (requestedSourceFileSet) {
    const unknownSourceFiles = [...requestedSourceFileSet]
      .filter((fileName) => !I18N_MESSAGE_SOURCE_FILES.includes(fileName))
      .sort();
    if (unknownSourceFiles.length) {
      throw new Error(
        `[i18n-source] unknown source files requested: ${unknownSourceFiles.join(", ")}`,
      );
    }
  }
  const selectedSourceFiles = requestedSourceFileSet
    ? I18N_MESSAGE_SOURCE_FILES.filter((fileName) => requestedSourceFileSet.has(fileName))
    : I18N_MESSAGE_SOURCE_FILES;

  const entries = [];
  const entriesById = new Map();
  const sourceFiles = [];
  const catalogs = Object.fromEntries(
    APP_LOCALES.map((locale) => [locale, {}]),
  );

  for (const fileName of selectedSourceFiles) {
    const filePath = path.join(messagesRoot, fileName);
    const sourceText = fs.readFileSync(filePath, "utf8");
    const topLevelKeys = parseTopLevelKeys(sourceText);
    const duplicateKeys = topLevelKeys.filter(
      (key, index) => topLevelKeys.indexOf(key) !== index,
    );
    if (duplicateKeys.length) {
      throw new Error(
        `[i18n-source] ${normalizePath(filePath)} has duplicate message ids: ${Array.from(new Set(duplicateKeys)).join(", ")}`,
      );
    }

    const raw = readJson(filePath);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`[i18n-source] ${normalizePath(filePath)} must be a JSON object`);
    }
    const messageIds = Object.keys(raw);
    sourceFiles.push({ fileName, filePath, messageIds });

    for (const [messageId, entry] of Object.entries(raw)) {
      if (!MESSAGE_ID_RE.test(messageId)) {
        throw new Error(
          `[i18n-source] ${normalizePath(filePath)} has invalid message id: ${messageId}`,
        );
      }
      if (entriesById.has(messageId)) {
        const existing = entriesById.get(messageId);
        throw new Error(
          `[i18n-source] Duplicate message id ${messageId} in ${normalizePath(filePath)} and ${normalizePath(existing.filePath)}`,
        );
      }
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(
          `[i18n-source] ${normalizePath(filePath)} ${messageId} must be an object`,
        );
      }
      const { kind, locales } = entry;
      if (kind !== "text" && kind !== "json") {
        throw new Error(
          `[i18n-source] ${normalizePath(filePath)} ${messageId}.kind must be "text" or "json"`,
        );
      }
      if (!locales || typeof locales !== "object" || Array.isArray(locales)) {
        throw new Error(
          `[i18n-source] ${normalizePath(filePath)} ${messageId}.locales must be an object`,
        );
      }
      assertExactKeys({
        actual: Object.keys(locales),
        expected: MESSAGE_SOURCE_LOCALE_ORDER,
        filePath,
        keyPath: `${messageId}.locales`,
      });

      for (const locale of MESSAGE_SOURCE_LOCALE_ORDER) {
        const value = locales[locale];
        if (kind === "text" && typeof value !== "string") {
          throw new Error(
            `[i18n-source] ${normalizePath(filePath)} ${messageId}.${locale} must be a string`,
          );
        }
        if (
          kind === "json" &&
          (!value || typeof value !== "object")
        ) {
          throw new Error(
            `[i18n-source] ${normalizePath(filePath)} ${messageId}.${locale} must be a JSON object or array`,
          );
        }
        assertNoBlankStrings({
          value,
          filePath,
          keyPath: `${messageId}.locales.${locale}`,
        });
      }
      if (kind === "json") {
        const baseLeafPaths = flattenMessageValue(locales[BASE_LOCALE])
          .map(([leafPath]) => leafPath)
          .sort();
        for (const locale of MESSAGE_SOURCE_LOCALE_ORDER) {
          const localeLeafPaths = flattenMessageValue(locales[locale])
            .map(([leafPath]) => leafPath)
            .sort();
          const missing = baseLeafPaths.filter(
            (leafPath) => !localeLeafPaths.includes(leafPath),
          );
          const extra = localeLeafPaths.filter(
            (leafPath) => !baseLeafPaths.includes(leafPath),
          );
          if (missing.length || extra.length) {
            throw new Error(
              `[i18n-source] ${normalizePath(filePath)} ${messageId}.${locale} JSON shape must match ${BASE_LOCALE}. Missing: ${missing.join(", ") || "none"}; Extra: ${extra.join(", ") || "none"}`,
            );
          }
        }
      }

      const normalizedEntry = {
        id: messageId,
        kind,
        locales,
        fileName,
        filePath,
      };
      entries.push(normalizedEntry);
      entriesById.set(messageId, normalizedEntry);

      const dotIndex = messageId.indexOf(".");
      const namespace = messageId.slice(0, dotIndex);
      const key = messageId.slice(dotIndex + 1);
      for (const locale of APP_LOCALES) {
        catalogs[locale][namespace] ??= {};
        catalogs[locale][namespace][key] =
          kind === "json" ? JSON.stringify(locales[locale]) : locales[locale];
      }
    }
  }

  const namespaceEntries = Array.from(
    new Set(entries.map((entry) => entry.id.slice(0, entry.id.indexOf(".")))),
  ).sort();
  for (const locale of APP_LOCALES) {
    for (const namespace of namespaceEntries) {
      catalogs[locale][namespace] = Object.fromEntries(
        Object.entries(catalogs[locale][namespace] ?? {}).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      );
    }
    catalogs[locale] = Object.fromEntries(
      Object.entries(catalogs[locale]).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
  }

  return {
    messagesRoot,
    sourceFiles,
    entries,
    entriesById,
    catalogs,
    localeEntries: APP_LOCALES,
    namespaceEntries,
    messageIds: entries.map((entry) => entry.id).sort(),
  };
};

export const flattenMessageValue = (value, prefix = "") => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return [[prefix || "$", value]];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      flattenMessageValue(entry, `${prefix}[${index}]`),
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, childValue]) =>
      flattenMessageValue(childValue, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [[prefix || "$", value]];
};
