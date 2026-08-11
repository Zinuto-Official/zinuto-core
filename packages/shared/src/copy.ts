// SPDX-License-Identifier: GPL-3.0-only

export const APP_COPY_LANGUAGES = [
  "en",
  "zh-CN",
  "ja",
  "ko",
  "es",
] as const;

export type AppCopyLanguage = (typeof APP_COPY_LANGUAGES)[number];

export const APP_COPY_BASE_LANGUAGE: AppCopyLanguage = "en";

export const resolveAppCopyLanguage = (value: unknown): AppCopyLanguage => {
  const normalized = String(value ?? "").trim();
  if (
    normalized === "en" ||
    normalized === "zh-CN" ||
    normalized === "ja" ||
    normalized === "ko" ||
    normalized === "es"
  ) {
    return normalized;
  }
  return APP_COPY_BASE_LANGUAGE;
};

export const formatCopyTemplate = (
  template: string,
  values: ReadonlyArray<string | number>,
): string =>
  String(template ?? "").replace(/\{(\d+)\}/g, (_token, indexText) => {
    const index = Number(indexText);
    const value = values[index];
    return value === undefined || value === null ? "" : String(value);
  });
