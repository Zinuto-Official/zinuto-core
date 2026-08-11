// SPDX-License-Identifier: GPL-3.0-only

import { APP_LOCALES, type AppLocale } from "@zinuto/shared/i18n";
import { desktopReleaseNotesManifest } from "./desktopReleaseNotes.js";

export type DesktopLocalDocumentLocale = AppLocale;

export const desktopLocalDocumentLocales = APP_LOCALES;

export interface DesktopLocalReleaseManifest {
  version: string | null;
  publishedAt: string;
  releaseHighlights: Record<string, string[]>;
}

export interface DesktopLocalDocumentReleaseNotesText {
  latestReleaseLabel: string;
  highlightsLabel: string;
  emptyHighlightsLabel: string;
}

export interface DesktopLocalDocumentUiText {
  releaseNotes: DesktopLocalDocumentReleaseNotesText;
}

export type DesktopReleasePublicationState = "PUBLISHED" | "SCHEDULED";

export const resolveDesktopReleasePublicationState = (
  publishedAt: string,
  now: number | Date = Date.now(),
): DesktopReleasePublicationState => {
  const publicationTimestamp = Date.parse(publishedAt);
  const nowTimestamp = now instanceof Date ? now.getTime() : Number(now);
  return Number.isFinite(publicationTimestamp) &&
    Number.isFinite(nowTimestamp) &&
    publicationTimestamp > nowTimestamp
    ? "SCHEDULED"
    : "PUBLISHED";
};

export const desktopLocalReleaseManifest: DesktopLocalReleaseManifest = {
  version: desktopReleaseNotesManifest.version,
  publishedAt: desktopReleaseNotesManifest.publishedAt,
  releaseHighlights: desktopReleaseNotesManifest.releaseHighlights,
};

export const desktopLocalDocumentUiText: Record<
  DesktopLocalDocumentLocale,
  DesktopLocalDocumentUiText
> = {
  en: {
    releaseNotes: {
      latestReleaseLabel: "Latest release",
      highlightsLabel: "Highlights",
      emptyHighlightsLabel: "No release highlights are bundled in this build.",
    },
  },
  "zh-CN": {
    releaseNotes: {
      latestReleaseLabel: "最新版本",
      highlightsLabel: "版本摘要",
      emptyHighlightsLabel: "当前构建未内置版本摘要。",
    },
  },
  ja: {
    releaseNotes: {
      latestReleaseLabel: "最新リリース",
      highlightsLabel: "ハイライト",
      emptyHighlightsLabel: "このビルドにはリリース要点が含まれていません。",
    },
  },
  ko: {
    releaseNotes: {
      latestReleaseLabel: "최신 릴리스",
      highlightsLabel: "주요 내용",
      emptyHighlightsLabel: "이 빌드에는 릴리스 요약이 포함되어 있지 않습니다.",
    },
  },
  es: {
    releaseNotes: {
      latestReleaseLabel: "Última versión",
      highlightsLabel: "Novedades",
      emptyHighlightsLabel: "Esta compilación no incluye un resumen de la versión.",
    },
  },
};
