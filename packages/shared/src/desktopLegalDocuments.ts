// SPDX-License-Identifier: GPL-3.0-only

import { z } from "zod";

import {
  APP_LOCALE_BASE,
  APP_LOCALES,
  isAppLocale,
  type AppLocale,
} from "@zinuto/shared/i18n";

export const DESKTOP_LEGAL_DOCUMENT_VERSION = "2026-08-12" as const;
export const DESKTOP_LOCAL_LEGAL_DOCUMENT_KEYS = ["privacy", "terms"] as const;
export const DESKTOP_LEGAL_DOCUMENT_CACHE_STATUSES = ["local"] as const;

export type DesktopLocalLegalDocumentKey =
  (typeof DESKTOP_LOCAL_LEGAL_DOCUMENT_KEYS)[number];
export type DesktopLocalLegalDocumentLocale = AppLocale;
export type DesktopLegalDocumentCacheStatus =
  (typeof DESKTOP_LEGAL_DOCUMENT_CACHE_STATUSES)[number];

export const desktopLocalLegalDocumentKeySchema = z.enum(
  DESKTOP_LOCAL_LEGAL_DOCUMENT_KEYS,
);
export const desktopLocalLegalDocumentLocaleSchema = z.enum(APP_LOCALES);
export const desktopLegalDocumentCacheStatusSchema = z.enum(
  DESKTOP_LEGAL_DOCUMENT_CACHE_STATUSES,
);

export const desktopLegalDocumentResponseSchema = z
  .object({
    documentKey: desktopLocalLegalDocumentKeySchema,
    locale: desktopLocalLegalDocumentLocaleSchema,
    documentVersion: z.literal(DESKTOP_LEGAL_DOCUMENT_VERSION),
    lastUpdated: z.string().min(1).max(64),
    effectiveDate: z.string().min(1).max(64),
    markdown: z.string().min(1).max(100_000),
    sourceUrl: z.string().min(1).max(8192).url(),
    cacheStatus: desktopLegalDocumentCacheStatusSchema,
    fetchedAt: z.string().min(1).max(64),
    checkedAt: z.string().min(1).max(64),
  })
  .strict();

export type DesktopLegalDocumentResponse = z.infer<
  typeof desktopLegalDocumentResponseSchema
>;

export const normalizeDesktopLegalDocumentLocale = (
  locale: unknown,
): DesktopLocalLegalDocumentLocale =>
  isAppLocale(locale) ? locale : APP_LOCALE_BASE;
