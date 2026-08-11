// SPDX-License-Identifier: GPL-3.0-only

import type { AppUiLanguage } from "@/ui/config/uiConfig";
import {
  normalizeReplayNoteColorTokens,
  type ReplayNoteColorToken,
} from "@zinuto/shared/replayNoteColors";
import type {
  ReplayNoteReferenceEntry,
  ReplayNoteReferenceSummaryChip,
  ReplayNoteReferenceSummaryChipTone,
  ReplayNoteSource,
  ReplayNoteSourceKind,
  ReplayNoteStructuredMeta,
} from "@/domains/notes/replayNoteSemanticTypes";
import {
  buildReplayNoteDefaultTitle as buildSharedReplayNoteDefaultTitle,
  buildReplayNoteSeedContent as buildSharedReplayNoteSeedContent,
  buildReplayNoteSeedMeta as buildSharedReplayNoteSeedMeta,
  buildReplayNoteSourceForCreate as buildSharedReplayNoteSourceForCreate,
  isReplayNoteType,
  resolveReplayNoteSemanticLabel as resolveSharedReplayNoteSemanticLabel,
} from "@zinuto/shared/replayNoteBuilder";
import type { ReplayNoteDocumentV1 } from "@zinuto/shared/replayNoteDocument";
import type { ReplayNoteType } from "@zinuto/shared/replayNoteBuilder";

export type {
  ReplayNoteReferenceEntry,
  ReplayNoteReferenceSummaryChip,
  ReplayNoteReferenceSummaryChipTone,
  ReplayNoteSource,
  ReplayNoteSourceKind,
  ReplayNoteStructuredMeta,
} from "@/domains/notes/replayNoteSemanticTypes";

export const buildReplayNoteSeedMeta = (
  noteType: ReplayNoteType
): ReplayNoteStructuredMeta => buildSharedReplayNoteSeedMeta(noteType);

export const buildReplayNoteSeedContent = (
  noteType: ReplayNoteType,
  language: AppUiLanguage
): ReplayNoteDocumentV1 => buildSharedReplayNoteSeedContent(noteType, language);

export const normalizeReplayNoteColors = (
  rawColors: unknown,
): ReplayNoteColorToken[] => normalizeReplayNoteColorTokens(rawColors);

export const normalizeReplayNoteSource = (rawSource: unknown): ReplayNoteSource | null => {
  if (!rawSource || typeof rawSource !== "object") {
    return null;
  }
  const record = rawSource as Record<string, unknown>;
  const kindRaw = String(record.kind ?? "").trim().toUpperCase();
  const kind: ReplayNoteSourceKind =
    kindRaw === "TRAINING_PROJECT" ||
    kindRaw === "SPECIAL_TRAINING_QUESTION" ||
    kindRaw === "CUSTOM"
      ? (kindRaw as ReplayNoteSourceKind)
      : "UNKNOWN";
  const id = String(record.id ?? "").trim();
  const label = String(record.label ?? "").trim();
  return {
    kind,
    id: id || null,
    label: label || undefined,
  };
};

export const normalizeReplayNoteMeta = (
  rawMeta: unknown
): ReplayNoteStructuredMeta | null => {
  if (!rawMeta || typeof rawMeta !== "object") {
    return null;
  }
  const record = rawMeta as Record<string, unknown>;
  const schemaVersionRaw = Number(record.schemaVersion);
  const schemaVersion = Number.isFinite(schemaVersionRaw)
    ? Math.max(1, Math.floor(schemaVersionRaw))
    : 1;
  const templateId = String(record.templateId ?? "").trim();
  if (!templateId) {
    return null;
  }
  const layoutRaw = String(record.layout ?? "").trim();
  const layout =
    layoutRaw === "DOCUMENT_ONLY"
      ? "DOCUMENT_ONLY"
      : "DASHBOARD_REPLAY_REFLECTION";
  const reflectionSections = Array.isArray(record.reflectionSections)
    ? record.reflectionSections.reduce<Array<{ key: string; required?: boolean }>>(
        (acc, item) => {
          const section =
            item && typeof item === "object"
              ? (item as Record<string, unknown>)
              : null;
          const key = String(section?.key ?? "").trim();
          if (!key) {
            return acc;
          }
          acc.push({
            key,
            required: Boolean(section?.required),
          });
          return acc;
        },
        []
      )
    : [];
  const reflectionEntries =
    record.reflectionEntries &&
    typeof record.reflectionEntries === "object" &&
    !Array.isArray(record.reflectionEntries)
      ? Object.entries(record.reflectionEntries as Record<string, unknown>).reduce<
          Record<string, { value: string; updatedAt?: string }>
        >((acc, [key, value]) => {
          const normalizedKey = String(key ?? "").trim();
          const entry =
            value && typeof value === "object"
              ? (value as Record<string, unknown>)
              : null;
          if (!normalizedKey || !entry) {
            return acc;
          }
          const updatedAt = String(entry.updatedAt ?? "").trim();
          acc[normalizedKey] = {
            value: String(entry.value ?? "").trim(),
            updatedAt: updatedAt || undefined,
          };
          return acc;
        }, {})
      : undefined;
  return {
    schemaVersion,
    templateId,
    layout,
    reflectionSections,
    reflectionEntries:
      reflectionEntries && Object.keys(reflectionEntries).length
        ? reflectionEntries
        : undefined,
    referenceEntries: normalizeReplayNoteReferenceEntries(record.referenceEntries),
  };
};

export const normalizeReplayNoteReferenceEntries = (
  rawEntries: unknown
): ReplayNoteReferenceEntry[] | undefined => {
  if (!Array.isArray(rawEntries)) {
    return undefined;
  }
  const entries = rawEntries.reduce<ReplayNoteReferenceEntry[]>((acc, item) => {
    if (!item || typeof item !== "object") {
      return acc;
    }
    const record = item as Record<string, unknown>;
    const noteId = String(record.noteId ?? "").trim();
    const title = String(record.title ?? "").trim();
    const rawType = String(record.type ?? "").trim().toUpperCase();
    if (!isReplayNoteType(rawType)) {
      return acc;
    }
    if (!noteId || !title) {
      return acc;
    }
    const summaryChips = Array.isArray(record.summaryChips)
      ? record.summaryChips.reduce<ReplayNoteReferenceSummaryChip[]>((chips, chip) => {
          const chipRecord =
            chip && typeof chip === "object"
              ? (chip as Record<string, unknown>)
              : null;
          const label = String(chipRecord?.label ?? "").trim();
          const value = String(chipRecord?.value ?? "").trim();
          const tone = String(chipRecord?.tone ?? "").trim();
          if (!label || !value) {
            return chips;
          }
          chips.push({
            label,
            value,
            tone:
              tone === "neutral" ||
              tone === "positive" ||
              tone === "warning" ||
              tone === "danger"
                ? (tone as ReplayNoteReferenceSummaryChipTone)
                : undefined,
          });
          return chips;
        }, [])
      : undefined;
    acc.push({
      noteId,
      title,
      type: rawType,
      source: normalizeReplayNoteSource(record.source),
      colorTokens: normalizeReplayNoteColors(record.colorTokens),
      summaryChips,
      addedAt: String(record.addedAt ?? "").trim() || undefined,
    });
    return acc;
  }, []);
  return entries.length ? entries : undefined;
};

export const resolveReplayNoteSemanticLabel = (
  language: AppUiLanguage,
  noteType: ReplayNoteType
): string => resolveSharedReplayNoteSemanticLabel(language, noteType);

export const buildReplayNoteSourceForCreate = (params: {
  noteType: ReplayNoteType;
  trainingProjectId?: string | null;
  contextSessionId?: string | null;
  symbol?: string | null;
}): ReplayNoteSource => buildSharedReplayNoteSourceForCreate(params);

type ReplayNoteDefaultTitleContext = {
  language: AppUiLanguage;
  noteType: ReplayNoteType;
  createdAt?: string | null;
  symbol?: string | null;
  displayPeriod?: string | null;
  baseTimeframe?: string | null;
  profitLossRatio?: number | null;
  winRate?: number | null;
  advantageRatio?: number | string | null;
  grade?: string | null;
  recoveryRate?: number | null;
};

export const buildReplayNoteDefaultTitle = (
  context: ReplayNoteDefaultTitleContext
): string => buildSharedReplayNoteDefaultTitle(context);
