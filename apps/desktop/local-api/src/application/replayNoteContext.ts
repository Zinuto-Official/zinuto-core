// SPDX-License-Identifier: GPL-3.0-only

import { gzipSync } from 'node:zlib';

import { appError } from '../kernel/appError.js';
import { runtimeLimits } from '../kernel/runtimeLimits.js';
import { nowIso } from '../kernel/time.js';
import { loadTrainingProjectReplayWindowFromRef } from './ports/infrastructure/db/history/replayRefStore.js';
import * as replayNoteStore from './ports/infrastructure/db/replayNote/replayNoteStore.js';
import type {
  ReplayNoteContextArchiveRow,
  ReplayNoteContextRefRow,
  ReplayNoteSpecialTrainingContextRefRow,
} from './ports/infrastructure/db/replayNote/replayNoteStore.js';
import {
  getSpecialTrainingHistoryQuestionDetailById,
  getSpecialTrainingHistorySessionSummaryById,
} from './ports/infrastructure/db/specialTraining/historyStore.js';
import { buildChallengeStatsProjectDetail } from '../domain/specialTraining/statsReplayProjectBuilder.js';
import { decodeBoundedGzipJson } from './replayNotePayloadCodec.js';

const REPLAY_NOTE_CONTEXT_ARCHIVE_BACKFILL_BATCH_SIZE = 200;
const NOTE_CONTEXT_WINDOW_BARS = 240;
const NOTE_CONTEXT_ARCHIVE_ENCODING_GZIP_BINARY = 'GZIP_BINARY';

type ReplayNoteContextArchiveEncoded = {
  encoding: string;
  payload: Buffer;
  sourceBytes: number;
  archiveBytes: number;
};

const normalizeText = (value: unknown): string => (typeof value === 'string' ? value : '');

const normalizeOptionalText = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
};

const toPayloadBuffer = (payload: unknown): Buffer | null => {
  if (Buffer.isBuffer(payload)) {
    return payload.length > 0 ? payload : null;
  }
  if (typeof payload === 'string') {
    const normalized = payload.trim();
    if (!normalized) {
      return null;
    }
    return Buffer.from(normalized, 'utf-8');
  }
  return null;
};

export const normalizeReplayNoteContextReplay = (
  value: unknown,
): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
};

const encodeReplayNoteContextArchive = (
  contextReplay: Record<string, unknown>,
  part = 'context'
): ReplayNoteContextArchiveEncoded => {
  const sourceJson = JSON.stringify(contextReplay);
  const sourceBytes = Buffer.byteLength(sourceJson, 'utf-8');
  if (sourceBytes > runtimeLimits.replayNoteSnapshotSourceMaxBytes) {
    throw appError('REPLAY_NOTE_SNAPSHOT_SOURCE_TOO_LARGE', { part });
  }

  const compressed = gzipSync(Buffer.from(sourceJson, 'utf-8'));
  const archiveBytes = compressed.byteLength;
  if (archiveBytes > runtimeLimits.replayNoteSnapshotCompressedMaxBytes) {
    throw appError('REPLAY_NOTE_SNAPSHOT_COMPRESSED_TOO_LARGE', { part });
  }

  return {
    encoding: NOTE_CONTEXT_ARCHIVE_ENCODING_GZIP_BINARY,
    payload: compressed,
    sourceBytes,
    archiveBytes
  };
};

const decodeReplayNoteContextArchive = (row: ReplayNoteContextArchiveRow): unknown | null => {
  const encoding = normalizeText(row.archive_encoding).trim().toUpperCase();
  const payloadBuffer = toPayloadBuffer(row.archive_payload);
  if (!payloadBuffer) {
    return null;
  }
  try {
    if (encoding !== NOTE_CONTEXT_ARCHIVE_ENCODING_GZIP_BINARY) {
      return null;
    }
    const decoded = decodeBoundedGzipJson(payloadBuffer, {
      maxCompressedBytes: runtimeLimits.replayNoteSnapshotCompressedMaxBytes,
      maxSourceBytes: runtimeLimits.replayNoteSnapshotSourceMaxBytes,
    });
    if (
      (Number.isSafeInteger(row.archive_bytes) && row.archive_bytes > 0
        && row.archive_bytes !== decoded.payloadBytes)
      || (Number.isSafeInteger(row.source_bytes) && row.source_bytes > 0
        && row.source_bytes !== decoded.sourceBytes)
    ) {
      return null;
    }
    const parsed = decoded.value;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const loadReplayNoteContextRef = (noteId: string): ReplayNoteContextRefRow | null => {
  return replayNoteStore.getReplayNoteContextRefRow(noteId);
};

const loadReplayNoteSpecialTrainingContextRef = (
  noteId: string,
): ReplayNoteSpecialTrainingContextRefRow | null => {
  return replayNoteStore.getReplayNoteSpecialTrainingContextRefRow(noteId);
};

const clearReplayNoteSpecialTrainingContextRef = (noteId: string): void => {
  replayNoteStore.clearReplayNoteSpecialTrainingContextRef(noteId);
};

const hasSpecialTrainingQuestion = (questionId: string): boolean => {
  const normalizedQuestionId = normalizeOptionalText(questionId);
  if (!normalizedQuestionId) {
    return false;
  }
  return replayNoteStore.hasSpecialTrainingQuestion(normalizedQuestionId);
};

export const resolveReplayNoteSpecialTrainingQuestionId = (input: {
  sourceKind?: string | null;
  sourceId?: string | null;
  contextSessionId?: string | null;
}): string | null => {
  void input.contextSessionId;
  const sourceKind = normalizeOptionalText(input.sourceKind)?.toUpperCase() ?? '';
  if (sourceKind !== 'SPECIAL_TRAINING_QUESTION') {
    return null;
  }
  const sourceId = normalizeOptionalText(input.sourceId);
  return sourceId && hasSpecialTrainingQuestion(sourceId) ? sourceId : null;
};

export const saveReplayNoteSpecialTrainingContextRef = (
  noteId: string,
  questionId: string | null,
  timestamp: string,
): boolean => {
  const normalizedQuestionId = normalizeOptionalText(questionId);
  if (!normalizedQuestionId || !hasSpecialTrainingQuestion(normalizedQuestionId)) {
    clearReplayNoteSpecialTrainingContextRef(noteId);
    return false;
  }
  replayNoteStore.upsertReplayNoteSpecialTrainingContextRef({
    noteId,
    questionId: normalizedQuestionId,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return true;
};

export const loadReplayNoteSpecialTrainingContext = async (
  noteId: string,
): Promise<Record<string, unknown> | null> => {
  const contextRef = loadReplayNoteSpecialTrainingContextRef(noteId);
  if (!contextRef) {
    return null;
  }
  const question = await getSpecialTrainingHistoryQuestionDetailById(
    contextRef.question_id,
  );
  if (!question) {
    return null;
  }
  const session = getSpecialTrainingHistorySessionSummaryById(question.sessionId);
  if (!session) {
    return null;
  }
  const detail = buildChallengeStatsProjectDetail(session, question);
  return normalizeReplayNoteContextReplay(detail.replay);
};

export const loadReplayNoteContext = async (
  noteId: string
): Promise<Record<string, unknown> | null> => {
  const contextRef = loadReplayNoteContextRef(noteId);
  if (!contextRef) {
    return null;
  }
  const loaded = await loadTrainingProjectReplayWindowFromRef(
    contextRef.training_project_id,
    contextRef.context_cursor_index,
    contextRef.window_bars
  );
  return normalizeReplayNoteContextReplay(loaded);
};

const loadReplayNoteContextArchiveRow = (noteId: string): ReplayNoteContextArchiveRow | null => {
  return replayNoteStore.getReplayNoteContextArchiveRow(noteId);
};

export const loadReplayNoteContextArchive = (
  noteId: string
): Record<string, unknown> | null => {
  const row = loadReplayNoteContextArchiveRow(noteId);
  if (!row) {
    return null;
  }
  return normalizeReplayNoteContextReplay(decodeReplayNoteContextArchive(row));
};

export const clearReplayNoteContextArchive = (noteId: string): void => {
  replayNoteStore.clearReplayNoteContextArchive(noteId);
};

export const hasReplayNoteContextArchive = (noteId: string): boolean => {
  return replayNoteStore.hasReplayNoteContextArchive(noteId);
};

export const saveReplayNoteContextArchive = (
  noteId: string,
  contextReplay: Record<string, unknown> | null,
  timestamp: string
): boolean => {
  const normalizedContextReplay = normalizeReplayNoteContextReplay(contextReplay);
  if (!normalizedContextReplay) {
    clearReplayNoteContextArchive(noteId);
    return false;
  }

  const encoded = encodeReplayNoteContextArchive(normalizedContextReplay, 'context');
  replayNoteStore.upsertReplayNoteContextArchive({
    noteId,
    archiveEncoding: encoded.encoding,
    archivePayload: encoded.payload,
    sourceBytes: encoded.sourceBytes,
    archiveBytes: encoded.archiveBytes,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return true;
};

const normalizeTrainingProjectIdList = (trainingProjectIds?: readonly string[]): string[] => {
  if (!Array.isArray(trainingProjectIds) || !trainingProjectIds.length) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  trainingProjectIds.forEach((trainingProjectId) => {
    const id = normalizeText(trainingProjectId).trim();
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    normalized.push(id);
  });
  return normalized;
};

const normalizeReplayNoteIdList = (noteIds?: readonly string[]): string[] => {
  if (!Array.isArray(noteIds) || !noteIds.length) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  noteIds.forEach((noteId) => {
    const id = normalizeText(noteId).trim();
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    normalized.push(id);
  });
  return normalized;
};

const chunkReplayNoteIds = (noteIds: readonly string[]): string[][] => {
  const chunks: string[][] = [];
  for (let index = 0; index < noteIds.length; index += REPLAY_NOTE_CONTEXT_ARCHIVE_BACKFILL_BATCH_SIZE) {
    chunks.push(noteIds.slice(index, index + REPLAY_NOTE_CONTEXT_ARCHIVE_BACKFILL_BATCH_SIZE));
  }
  return chunks;
};

const listReplayNoteContextRefsMissingArchive = (
  trainingProjectIds?: readonly string[],
  limit = REPLAY_NOTE_CONTEXT_ARCHIVE_BACKFILL_BATCH_SIZE,
): ReplayNoteContextRefRow[] => {
  const normalizedTrainingProjectIds = normalizeTrainingProjectIdList(trainingProjectIds);
  const safeLimit = Math.max(1, Math.floor(limit));
  return replayNoteStore.listReplayNoteContextRefsMissingArchive(
    normalizedTrainingProjectIds,
    safeLimit,
  );
};

const listReplayNoteContextRefsMissingArchiveByNoteIds = (
  noteIds: readonly string[],
): ReplayNoteContextRefRow[] => {
  const normalizedNoteIds = normalizeReplayNoteIdList(noteIds);
  if (!normalizedNoteIds.length) {
    return [];
  }
  return replayNoteStore.listReplayNoteContextRefsMissingArchiveByNoteIds(normalizedNoteIds);
};

const backfillReplayNoteContextArchivesForTrainingProjectRefs = async (
  missingArchiveRows: readonly ReplayNoteContextRefRow[],
): Promise<string[]> => {
  if (!missingArchiveRows.length) {
    return [];
  }
  const contextReplayCache = new Map<string, Record<string, unknown> | null>();
  const hydratedNoteIds = new Set<string>();

  for (const row of missingArchiveRows) {
    const cacheKey = `${row.training_project_id}::${row.context_cursor_index}::${row.window_bars}`;
    let contextReplay = contextReplayCache.get(cacheKey);
    if (contextReplay === undefined) {
      contextReplay = normalizeReplayNoteContextReplay(
        await loadTrainingProjectReplayWindowFromRef(
          row.training_project_id,
          row.context_cursor_index,
          row.window_bars
        )
      );
      contextReplayCache.set(cacheKey, contextReplay);
    }
    if (!contextReplay) {
      throw appError('TRAINING_PROJECT_DELETE_BLOCKED_BY_NOTE_CONTEXT', {
        noteId: row.note_id,
        trainingProjectId: row.training_project_id
      });
    }
    const timestamp = nowIso();
    saveReplayNoteContextArchive(row.note_id, contextReplay, timestamp);
    replayNoteStore.markReplayNoteContextHydrated(row.note_id);
    hydratedNoteIds.add(row.note_id);
  }

  return Array.from(hydratedNoteIds);
};

export const ensureReplayNoteContextArchivesForTrainingProjects = async (
  trainingProjectIds?: readonly string[]
): Promise<void> => {
  while (true) {
    const missingArchiveRows = listReplayNoteContextRefsMissingArchive(trainingProjectIds);
    if (!missingArchiveRows.length) {
      break;
    }
    await backfillReplayNoteContextArchivesForTrainingProjectRefs(missingArchiveRows);
    if (missingArchiveRows.length < REPLAY_NOTE_CONTEXT_ARCHIVE_BACKFILL_BATCH_SIZE) {
      break;
    }
  }
};

const normalizeSpecialTrainingQuestionIdList = (
  questionIds?: readonly string[],
): string[] => {
  if (!Array.isArray(questionIds) || !questionIds.length) {
    return [];
  }
  return Array.from(
    new Set(
      questionIds
        .map((questionId) => normalizeOptionalText(questionId))
        .filter((questionId): questionId is string => Boolean(questionId)),
    ),
  );
};

const listReplayNoteSpecialTrainingContextRefsMissingArchive = (
  questionIds?: readonly string[],
  limit = REPLAY_NOTE_CONTEXT_ARCHIVE_BACKFILL_BATCH_SIZE,
): ReplayNoteSpecialTrainingContextRefRow[] => {
  const normalizedQuestionIds =
    normalizeSpecialTrainingQuestionIdList(questionIds);
  const safeLimit = Math.max(1, Math.floor(limit));
  return replayNoteStore.listReplayNoteSpecialTrainingContextRefsMissingArchive(
    normalizedQuestionIds,
    safeLimit,
  );
};

const listReplayNoteSpecialTrainingContextRefsMissingArchiveByNoteIds = (
  noteIds: readonly string[],
): ReplayNoteSpecialTrainingContextRefRow[] => {
  const normalizedNoteIds = normalizeReplayNoteIdList(noteIds);
  if (!normalizedNoteIds.length) {
    return [];
  }
  return replayNoteStore.listReplayNoteSpecialTrainingContextRefsMissingArchiveByNoteIds(
    normalizedNoteIds,
  );
};

const backfillReplayNoteContextArchivesForSpecialTrainingQuestionRefs = async (
  missingArchiveRows: readonly ReplayNoteSpecialTrainingContextRefRow[],
): Promise<string[]> => {
  if (!missingArchiveRows.length) {
    return [];
  }
  const contextReplayCache = new Map<string, Record<string, unknown> | null>();
  const hydratedNoteIds = new Set<string>();

  for (const row of missingArchiveRows) {
    let contextReplay = contextReplayCache.get(row.question_id);
    if (contextReplay === undefined) {
      contextReplay = await loadReplayNoteSpecialTrainingContext(row.note_id);
      contextReplayCache.set(row.question_id, contextReplay);
    }
    if (!contextReplay) {
      throw appError('SPECIAL_TRAINING_HISTORY_CLEAR_BLOCKED_BY_NOTE_CONTEXT', {
        noteId: row.note_id,
        questionId: row.question_id,
      });
    }
    const timestamp = nowIso();
    saveReplayNoteContextArchive(row.note_id, contextReplay, timestamp);
    replayNoteStore.markReplayNoteContextHydrated(row.note_id);
    hydratedNoteIds.add(row.note_id);
  }

  return Array.from(hydratedNoteIds);
};

export const ensureReplayNoteContextArchivesForSpecialTrainingQuestions = async (
  questionIds?: readonly string[],
): Promise<void> => {
  while (true) {
    const missingArchiveRows =
      listReplayNoteSpecialTrainingContextRefsMissingArchive(questionIds);
    if (!missingArchiveRows.length) {
      break;
    }
    await backfillReplayNoteContextArchivesForSpecialTrainingQuestionRefs(
      missingArchiveRows,
    );
    if (missingArchiveRows.length < REPLAY_NOTE_CONTEXT_ARCHIVE_BACKFILL_BATCH_SIZE) {
      break;
    }
  }
};

export const ensureReplayNoteContextArchivesForNotes = async (
  noteIds: readonly string[],
): Promise<string[]> => {
  const normalizedNoteIds = normalizeReplayNoteIdList(noteIds);
  if (!normalizedNoteIds.length) {
    return [];
  }
  const hydratedNoteIds = new Set<string>();
  for (const noteIdChunk of chunkReplayNoteIds(normalizedNoteIds)) {
    (
      await backfillReplayNoteContextArchivesForTrainingProjectRefs(
        listReplayNoteContextRefsMissingArchiveByNoteIds(noteIdChunk),
      )
    ).forEach((noteId) => {
      hydratedNoteIds.add(noteId);
    });
    (
      await backfillReplayNoteContextArchivesForSpecialTrainingQuestionRefs(
        listReplayNoteSpecialTrainingContextRefsMissingArchiveByNoteIds(
          noteIdChunk,
        ),
      )
    ).forEach((noteId) => {
      hydratedNoteIds.add(noteId);
    });
  }
  return Array.from(hydratedNoteIds);
};

const clearReplayNoteContextRef = (noteId: string): void => {
  replayNoteStore.clearReplayNoteContextRef(noteId);
};

const hasTrainingProject = (projectId: string): boolean => {
  const id = projectId.trim();
  if (!id) {
    return false;
  }
  return replayNoteStore.hasTrainingProject(id);
};

export const saveReplayNoteContextRef = (
  noteId: string,
  trainingProjectId: string | null,
  contextCursorIndex: number | null,
  timestamp: string
): boolean => {
  const normalizedTrainingProjectId = (trainingProjectId || '').trim();
  if (!normalizedTrainingProjectId || contextCursorIndex === null || !Number.isFinite(contextCursorIndex)) {
    clearReplayNoteContextRef(noteId);
    return false;
  }
  if (!hasTrainingProject(normalizedTrainingProjectId)) {
    clearReplayNoteContextRef(noteId);
    return false;
  }

  const cursorIndex = Math.max(0, Math.floor(contextCursorIndex));
  try {
    replayNoteStore.upsertReplayNoteContextRef({
      noteId,
      trainingProjectId: normalizedTrainingProjectId,
      contextCursorIndex: cursorIndex,
      windowBars: NOTE_CONTEXT_WINDOW_BARS,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return true;
  } catch {
    clearReplayNoteContextRef(noteId);
    return false;
  }
};
