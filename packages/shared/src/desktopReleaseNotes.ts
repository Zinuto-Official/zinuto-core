// SPDX-License-Identifier: GPL-3.0-only

import releaseNotesManifest from "./desktopReleaseNotes.json";
import { APP_LOCALES, type AppLocale } from "@zinuto/shared/i18n";

export type DesktopReleaseNoteLocale = AppLocale;

export type DesktopLocalizedReleaseHighlights = Record<
  DesktopReleaseNoteLocale,
  string[]
>;

export interface DesktopReleaseNotesManifest {
  schemaVersion: 1;
  version: string;
  publishedAt: string;
  releaseHighlights: DesktopLocalizedReleaseHighlights;
}

export const DESKTOP_RELEASE_NOTE_LOCALES = APP_LOCALES;
export const DESKTOP_RELEASE_NOTES_SIDECAR_FILE_NAME = "release-notes.json";

export const desktopReleaseNotesManifest =
  releaseNotesManifest as DesktopReleaseNotesManifest;
