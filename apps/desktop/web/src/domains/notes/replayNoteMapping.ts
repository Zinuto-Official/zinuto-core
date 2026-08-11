// SPDX-License-Identifier: GPL-3.0-only

import type { ReplayNote } from "@/domains/notes/replayNoteModel";
import type { ArchivedReplayData } from "@/domains/history/replayArchiveTypes";
import type {
  ApiReplayNoteDetail,
  ApiReplayNoteSummary,
} from '@/api';
import {
  normalizeReplayNoteMeta,
  normalizeReplayNoteSource,
  normalizeReplayNoteColors
} from '@/domains/notes/replayNoteSemantics';
import { isReplayNoteType, type ReplayNoteType } from '@zinuto/shared/replayNoteBuilder';
import {
  buildReplayNoteDocumentPreview,
  createEmptyReplayNoteDocument,
  normalizeReplayNoteAttachments,
  normalizeReplayNoteDocument,
  type ReplayNoteAttachmentV1,
  type ReplayNoteDocumentV1,
} from '@zinuto/shared/replayNoteDocument';
import { normalizeReplayDisplayPeriod } from '@/domains/chart/replayDisplayPeriod';

const normalizeReplayNoteType = (value: unknown): ReplayNoteType => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (isReplayNoteType(normalized)) {
    return normalized;
  }
  throw new Error('INVALID_REPLAY_NOTE_TYPE');
};

const normalizeReplayNotePreviewText = (text: string): string => {
  if (!text) {
    return '';
  }
  return text
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const mapApiReplayNoteToLocal = (
  note: ApiReplayNoteSummary | ApiReplayNoteDetail
): ReplayNote => {
  const createdAt = typeof note.createdAt === 'string' && note.createdAt ? note.createdAt : new Date().toISOString();
  const normalizedType = normalizeReplayNoteType(note.type);
  const normalizedAttachments = normalizeReplayNoteAttachments(note.attachments);
  const normalizedContentDocument: ReplayNoteDocumentV1 = note.contentDocument
    ? normalizeReplayNoteDocument(note.contentDocument)
    : createEmptyReplayNoteDocument();

  const contextReplay =
    'contextReplay' in note &&
    note.contextReplay &&
    typeof note.contextReplay === 'object'
      ? (note.contextReplay as ArchivedReplayData)
      : null;

  const sourceKindFallback =
    'sourceKind' in note && typeof note.sourceKind === 'string'
      ? note.sourceKind
      : '';
  const sourceIdFallback =
    'sourceId' in note &&
    (typeof note.sourceId === 'string' || note.sourceId === null)
      ? note.sourceId
      : null;
  const normalizedSource =
    normalizeReplayNoteSource(note.source) ??
    (sourceKindFallback || sourceIdFallback
      ? normalizeReplayNoteSource({
          kind: sourceKindFallback,
          id: sourceIdFallback,
        })
      : null);
  const normalizedMeta =
    normalizeReplayNoteMeta(note.meta) ??
    normalizeReplayNoteMeta(
      'metaSummary' in note ? note.metaSummary : null
    );

  return {
    id: note.id,
    title: typeof note.title === 'string' ? note.title : '',
    type: normalizedType,
    contentDocument: normalizedContentDocument,
    contentPreview:
      typeof note.contentPreview === 'string'
        ? normalizeReplayNotePreviewText(note.contentPreview)
        : normalizedContentDocument.blocks.length
          ? buildReplayNoteDocumentPreview(normalizedContentDocument, normalizedAttachments)
          : '',
    contentLoaded: typeof note.contentLoaded === 'boolean' ? note.contentLoaded : normalizedContentDocument.blocks.length > 0,
    trainingProjectId: typeof note.trainingProjectId === 'string' && note.trainingProjectId.trim() ? note.trainingProjectId : null,
    hasContextReplay: Boolean(note.hasContextReplay),
    contextExpiredAt:
      typeof note.contextExpiredAt === 'string' && note.contextExpiredAt.trim()
        ? note.contextExpiredAt.trim()
        : null,
    contextSessionId: typeof note.contextSessionId === 'string' && note.contextSessionId.trim() ? note.contextSessionId.trim() : null,
    contextCursorIndex:
      note.contextCursorIndex === null || note.contextCursorIndex === undefined || !Number.isFinite(Number(note.contextCursorIndex))
        ? null
        : Math.max(0, Math.floor(Number(note.contextCursorIndex))),
    contextReplay,
    contextDisplayPeriod: normalizeReplayDisplayPeriod(note.contextDisplayPeriod),
    colorTokens: normalizeReplayNoteColors(note.colorTokens),
    attachments: normalizedAttachments,
    source: normalizedSource,
    meta: normalizedMeta,
    createdAt,
    updatedAt: typeof note.updatedAt === 'string' && note.updatedAt ? note.updatedAt : createdAt
  };
};

export const toReplayNotePreview = (
  document: ReplayNoteDocumentV1,
  attachments: ReplayNoteAttachmentV1[] = [],
): string => {
  return buildReplayNoteDocumentPreview(
    normalizeReplayNoteDocument(document),
    normalizeReplayNoteAttachments(attachments),
  );
};
