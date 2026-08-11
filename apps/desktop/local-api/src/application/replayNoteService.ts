// SPDX-License-Identifier: GPL-3.0-only

import {
  REPLAY_NOTE_COLOR_TOKENS,
  REPLAY_NOTE_SCOPE_FILTERS,
  normalizeReplayNoteColorTokens,
  type ReplayNoteColorToken,
  type ReplayNoteScopeFilter,
} from '@zinuto/shared/replayNoteColors';
import {
  isReplayNoteType,
  type ReplayNoteType,
} from '@zinuto/shared/replayNoteBuilder';
import {
  createEmptyReplayNoteDocument,
  normalizeReplayNoteAttachments,
  normalizeReplayNoteDocument,
  type ReplayNoteAttachmentV1,
  type ReplayNoteDocumentV1,
} from '@zinuto/shared/replayNoteDocument';
import { createId } from '../kernel/id.js';
import { runtimeLimits } from '../kernel/runtimeLimits.js';
import { INPUT_LIMITS } from '@zinuto/shared/input-limits';
import { nowIso } from '../kernel/time.js';
import { appError } from '../kernel/appError.js';
import * as replayNoteStore from './ports/infrastructure/db/replayNote/replayNoteStore.js';
import type { ReplayNoteRow } from './ports/infrastructure/db/replayNote/replayNoteStore.js';
import { db } from './ports/infrastructure/db/database.js';
import { createSessionMetricStore } from './ports/infrastructure/db/trading/sessionMetricStore.js';
import {
  buildContentPlainText,
  buildContentPreview,
  buildReplayNoteFtsQuery,
  deleteReplayNoteSearchDocument,
  hashReplayNoteDocument,
  listReplayNoteAttachmentsByNoteIds,
  listReplayNoteColorsByNoteIds,
  listReplayNoteMetaSummaryByNoteIds,
  loadReplayNoteAttachments,
  loadReplayNoteColors,
  loadReplayNoteMeta,
  normalizeReplayNoteMeta,
  replaceReplayNoteAttachments,
  replaceReplayNoteColors,
  resolveReplayNoteContent,
  saveReplayNoteContent,
  saveReplayNoteMeta,
  upsertReplayNoteSearchDocument,
  validateReplayNoteAttachmentManifest,
  type ReplayNoteMeta,
} from './replayNoteContent.js';
import {
  clearReplayNoteContextArchive,
  hasReplayNoteContextArchive,
  loadReplayNoteContext,
  loadReplayNoteContextArchive,
  loadReplayNoteSpecialTrainingContext,
  normalizeReplayNoteContextReplay,
  resolveReplayNoteSpecialTrainingQuestionId,
  saveReplayNoteContextArchive,
  saveReplayNoteContextRef,
  saveReplayNoteSpecialTrainingContextRef,
} from './replayNoteContext.js';

const round = (value: number, digits = 8): number => Number(value.toFixed(digits));
const replayNoteSessionMetricStore = createSessionMetricStore({ db, round });

export {
  ensureReplayNoteContextArchivesForNotes,
  ensureReplayNoteContextArchivesForSpecialTrainingQuestions,
  ensureReplayNoteContextArchivesForTrainingProjects,
} from './replayNoteContext.js';

interface ReplayNoteRecord {
  id: string;
  title: string;
  type: ReplayNoteType;
  contentDocument: ReplayNoteDocumentV1;
  contentPreview?: string;
  contentLoaded: boolean;
  trainingProjectId: string | null;
  contextDisplayPeriod?: string;
  createdAt: string;
  updatedAt: string;
  hasContextReplay: boolean;
  contextExpiredAt: string | null;
  contextSessionId: string | null;
  contextCursorIndex: number | null;
  contextReplay: Record<string, unknown> | null;
  simulationBatchId?: string | null;
  sourceKind: string | null;
  sourceId: string | null;
  colorTokens: ReplayNoteColorToken[];
  attachments: ReplayNoteAttachmentV1[];
  metaSummary: ReplayNoteMeta | null;
  meta?: ReplayNoteMeta | null;
}

interface ReplayNoteListItem extends Omit<ReplayNoteRecord, 'contextReplay' | 'meta' | 'contentDocument'> {}

interface ReplayNoteListResult {
  items: ReplayNoteListItem[];
  nextCursor: string | null;
  total: number;
}

interface RecentReplayNoteSummary {
  id: string;
  title: string;
  type: ReplayNoteType;
  colorTokens: ReplayNoteColorToken[];
  createdAt: string;
  updatedAt: string;
}

type ReplayNoteListFilters = {
  keyword?: string;
  type?: ReplayNoteType;
  colorTokens?: ReplayNoteColorToken[];
  scope?: ReplayNoteScopeFilter;
};

interface SaveReplayNotePayload {
  id?: string;
  title?: string;
  type: ReplayNoteType;
  contentDocument: unknown;
  attachments?: unknown;
  contextReplay?: Record<string, unknown> | null;
  simulationBatchId?: string | null;
  trainingProjectId?: string | null;
  contextDisplayPeriod?: string | null;
  contextSessionId?: string | null;
  contextCursorIndex?: number | null;
  sourceKind?: string | null;
  sourceId?: string | null;
  colorTokens?: ReplayNoteColorToken[] | null;
  meta?: ReplayNoteMeta | null;
  metaSummary?: ReplayNoteMeta | null;
  createdAt?: string;
  updatedAt?: string;
}

interface UpdateReplayNotePayload {
  title?: string;
  contentDocument?: unknown;
  attachments?: unknown;
  trainingProjectId?: string | null;
  contextDisplayPeriod?: string | null;
  contextReplay?: Record<string, unknown> | null;
  simulationBatchId?: string | null;
  contextSessionId?: string | null;
  contextCursorIndex?: number | null;
  sourceKind?: string | null;
  sourceId?: string | null;
  colorTokens?: ReplayNoteColorToken[] | null;
  meta?: ReplayNoteMeta | null;
  metaSummary?: ReplayNoteMeta | null;
}

const NOTE_SOURCE_KIND_MAX_CHARS = INPUT_LIMITS.shortCodeChars;
const NOTE_SOURCE_ID_MAX_CHARS = 191;

const REPLAY_NOTE_COLOR_TOKEN_SET = new Set<string>(REPLAY_NOTE_COLOR_TOKENS);
const REPLAY_NOTE_SCOPE_FILTER_SET = new Set<string>(REPLAY_NOTE_SCOPE_FILTERS);

const normalizeNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeReplayNoteType = (value: unknown): ReplayNoteType => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (isReplayNoteType(normalized)) {
    return normalized;
  }
  throw new Error('INVALID_REPLAY_NOTE_TYPE');
};

const normalizeText = (value: unknown): string => (typeof value === 'string' ? value : '');

const normalizeOptionalText = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
};

const normalizeReplayNoteSourceKind = (value: unknown): string | null => {
  const sourceKind = normalizeOptionalText(value);
  if (!sourceKind) {
    return null;
  }
  if (sourceKind.length > NOTE_SOURCE_KIND_MAX_CHARS) {
    throw appError('REPLAY_NOTE_SOURCE_TOO_LONG', { max: NOTE_SOURCE_KIND_MAX_CHARS });
  }
  return sourceKind.toUpperCase();
};

const normalizeReplayNoteSourceId = (value: unknown): string | null => {
  const sourceId = normalizeOptionalText(value);
  if (!sourceId) {
    return null;
  }
  if (sourceId.length > NOTE_SOURCE_ID_MAX_CHARS) {
    throw appError('REPLAY_NOTE_SOURCE_TOO_LONG', { max: NOTE_SOURCE_ID_MAX_CHARS });
  }
  return sourceId;
};

const normalizeReplayNoteScope = (
  value: unknown,
): ReplayNoteScopeFilter => {
  const normalized = normalizeOptionalText(value)?.toUpperCase() ?? '';
  if (normalized && REPLAY_NOTE_SCOPE_FILTER_SET.has(normalized)) {
    return normalized as ReplayNoteScopeFilter;
  }
  return 'ALL';
};

const encodeCursor = (updatedAt: string, createdAt: string, id: string): string =>
  Buffer.from(JSON.stringify({ updatedAt, createdAt, id }), 'utf-8').toString('base64');

const decodeCursor = (rawCursor?: string): { updatedAt: string; createdAt: string; id: string } | null => {
  if (!rawCursor) {
    return null;
  }
  try {
    const decoded = Buffer.from(rawCursor, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded) as { updatedAt?: unknown; createdAt?: unknown; id?: unknown };
    const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt.trim() : '';
    const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt.trim() : '';
    const id = typeof parsed.id === 'string' ? parsed.id.trim() : '';
    if (!updatedAt || !createdAt || !id) {
      return null;
    }
    return { updatedAt, createdAt, id };
  } catch {
    return null;
  }
};

const extractContextMetaFromPayload = (
  payload: Pick<SaveReplayNotePayload, 'contextSessionId' | 'contextCursorIndex'>
): { contextSessionId: string | null; contextCursorIndex: number | null } => {
  const sessionId = normalizeOptionalText(payload.contextSessionId);
  const cursorIndexRaw = normalizeNumber(payload.contextCursorIndex, Number.NaN);
  const cursorIndex = Number.isFinite(cursorIndexRaw) ? Math.max(0, Math.floor(cursorIndexRaw)) : null;
  return {
    contextSessionId: sessionId,
    contextCursorIndex: cursorIndex
  };
};

const mapReplayNoteRow = (
  row: ReplayNoteRow,
  contentDocument: ReplayNoteDocumentV1,
  contentPreview: string,
  contentLoaded: boolean,
  contextReplay: Record<string, unknown> | null = null,
  metaSummary: ReplayNoteMeta | null = null,
  colorTokens: ReplayNoteColorToken[] = [],
  attachments: ReplayNoteAttachmentV1[] = [],
  meta: ReplayNoteMeta | null = null,
): ReplayNoteRecord => ({
  id: row.id,
  title: row.title,
  type: normalizeReplayNoteType(row.type),
  contentDocument,
  contentPreview,
  contentLoaded,
  trainingProjectId: normalizeOptionalText(row.training_project_id),
  contextDisplayPeriod: normalizeOptionalText(row.context_display_period) ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  hasContextReplay: Boolean(row.has_context_replay),
  contextExpiredAt: normalizeOptionalText(row.context_expired_at),
  contextSessionId: normalizeOptionalText(row.context_session_id),
  contextCursorIndex:
    row.context_cursor_index === null || row.context_cursor_index === undefined
      ? null
      : Math.max(0, Math.floor(normalizeNumber(row.context_cursor_index))),
  contextReplay,
  simulationBatchId: normalizeOptionalText(row.simulation_batch_id),
  sourceKind: normalizeReplayNoteSourceKind(row.source_kind),
  sourceId: normalizeReplayNoteSourceId(row.source_id),
  colorTokens,
  attachments,
  metaSummary,
  meta
});

const stripReplayNoteInternalFields = (
  note: ReplayNoteRecord,
): ReplayNoteRecord => {
  const { simulationBatchId: _omitSimulationBatchId, ...publicNote } = note;
  return publicNote;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const readNonNegativeInteger = (value: unknown): number | null => {
  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }
  if (typeof value !== 'number' && typeof value !== 'string') {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

const resolveContextReplaySessionId = (
  contextReplay: Record<string, unknown>,
  contextSessionId: string | null,
): string => {
  const snapshot = isRecord(contextReplay.snapshot) ? contextReplay.snapshot : null;
  const session = isRecord(snapshot?.session) ? snapshot.session : null;
  const fromContext = String(contextSessionId || '').trim();
  if (fromContext) {
    return fromContext;
  }
  return String(session?.id || session?.sessionId || '').trim();
};

const hydrateFreeReplayNoteSnapshotFills = ({
  type,
  contextReplay,
  contextSessionId,
}: {
  type: ReplayNoteType;
  contextReplay: Record<string, unknown> | null;
  contextSessionId: string | null;
}): Record<string, unknown> | null => {
  if (type !== 'FREE_REPLAY' || !contextReplay) {
    return contextReplay;
  }
  const sessionId = resolveContextReplaySessionId(contextReplay, contextSessionId);
  if (!sessionId) {
    return contextReplay;
  }
  const snapshot = isRecord(contextReplay.snapshot) ? contextReplay.snapshot : null;
  const barWindow = isRecord(contextReplay.barWindow) ? contextReplay.barWindow : null;
  const startRawIndex = readNonNegativeInteger(barWindow?.startRawIndex);
  const endRawIndex = readNonNegativeInteger(barWindow?.endRawIndex);
  if (!snapshot || startRawIndex === null || endRawIndex === null || endRawIndex < startRawIndex) {
    return contextReplay;
  }

  const fillWindow = replayNoteSessionMetricStore.readFillSnapshotWindow(
    sessionId,
    startRawIndex,
    endRawIndex,
  );
  const existingFills = Array.isArray(snapshot.fills) ? snapshot.fills : [];
  if (fillWindow.fillsTotal <= 0 && existingFills.length > 0) {
    return contextReplay;
  }

  return {
    ...contextReplay,
    snapshot: {
      ...snapshot,
      fills: fillWindow.fills.map((fill) => ({
        ...fill,
        fill_index: Math.max(0, Math.floor(Number(fill.fill_index) || 0) - startRawIndex),
      })),
      fillsTotal: fillWindow.fillsTotal,
      residentFillsStartIndex: fillWindow.residentFillsStartIndex,
      nextFillCursor: null,
    },
  };
};

const saveReplayNoteTx = (payload: SaveReplayNotePayload): string =>
  replayNoteStore.runReplayNoteTransaction(() => {
    const timestamp =
      typeof payload.updatedAt === 'string' && payload.updatedAt.trim()
        ? payload.updatedAt
        : nowIso();
    const createdAt =
      typeof payload.createdAt === 'string' && payload.createdAt.trim()
        ? payload.createdAt
        : timestamp;
    const noteId =
      typeof payload.id === 'string' && payload.id.trim()
        ? payload.id.trim()
        : createId();
    const title = normalizeText(payload.title);
    const contentDocument = normalizeReplayNoteDocument(payload.contentDocument);
    const attachments = validateReplayNoteAttachmentManifest(
      contentDocument,
      normalizeReplayNoteAttachments(payload.attachments),
    );
    const contentPlainText = buildContentPlainText(contentDocument, attachments);
    if (noteId.length > INPUT_LIMITS.idChars) {
      throw appError('REPLAY_NOTE_ID_INVALID', { max: INPUT_LIMITS.idChars });
    }
    if (title.length > INPUT_LIMITS.noteTitleChars) {
      throw appError('REPLAY_NOTE_TITLE_TOO_LONG', { max: INPUT_LIMITS.noteTitleChars });
    }
    if (contentPlainText.length > INPUT_LIMITS.noteContentChars) {
      throw appError('REPLAY_NOTE_CONTENT_TOO_LARGE', { max: INPUT_LIMITS.noteContentChars });
    }
    const type = normalizeReplayNoteType(payload.type);
    const simulationBatchId = normalizeOptionalText(payload.simulationBatchId);
    const sourceKind = normalizeReplayNoteSourceKind(payload.sourceKind);
    const sourceId = normalizeReplayNoteSourceId(payload.sourceId);
    const colorTokens = normalizeReplayNoteColorTokens(payload.colorTokens);
    const trainingProjectId = normalizeOptionalText(payload.trainingProjectId);
    const contextDisplayPeriod = normalizeOptionalText(payload.contextDisplayPeriod);
    const contextMeta = extractContextMetaFromPayload(payload);
    const contextReplay = hydrateFreeReplayNoteSnapshotFills({
      type,
      contextReplay: normalizeReplayNoteContextReplay(payload.contextReplay),
      contextSessionId: contextMeta.contextSessionId,
    });
    const meta = normalizeReplayNoteMeta(payload.meta);
    const metaSummary = normalizeReplayNoteMeta(payload.metaSummary);
    const contentPreview = buildContentPreview(contentDocument, attachments);

    replayNoteStore.upsertReplayNoteRow({
      id: noteId,
      title,
      type,
      simulationBatchId,
      sourceKind,
      sourceId,
      contentPreview,
      trainingProjectId,
      contextDisplayPeriod,
      hasContextReplay: 0,
      contextExpiredAt: null,
      contextSessionId: contextMeta.contextSessionId,
      contextCursorIndex: contextMeta.contextCursorIndex,
      createdAt,
      updatedAt: timestamp,
    });

    const specialTrainingQuestionId = resolveReplayNoteSpecialTrainingQuestionId({
      sourceKind,
      sourceId,
      contextSessionId: contextMeta.contextSessionId,
    });
    const hasStoredTrainingProjectContextRef = saveReplayNoteContextRef(
      noteId,
      trainingProjectId,
      contextMeta.contextCursorIndex,
      timestamp,
    );
    const hasStoredSpecialTrainingContextRef = saveReplayNoteSpecialTrainingContextRef(
      noteId,
      specialTrainingQuestionId,
      timestamp,
    );
    const hasStoredContextRef =
      hasStoredTrainingProjectContextRef || hasStoredSpecialTrainingContextRef;
    const hasStoredContextArchive = hasStoredContextRef
      ? false
      : saveReplayNoteContextArchive(noteId, contextReplay, timestamp);
    if (hasStoredContextRef) {
      clearReplayNoteContextArchive(noteId);
    }
    const hasStoredContext = hasStoredContextRef || hasStoredContextArchive;
    replayNoteStore.updateReplayNoteContextState({
      noteId,
      hasContextReplay: hasStoredContext ? 1 : 0,
      contextSessionId: contextMeta.contextSessionId,
      contextCursorIndex: contextMeta.contextCursorIndex,
    });

    saveReplayNoteMeta(noteId, meta, metaSummary, timestamp);
    replaceReplayNoteColors(noteId, colorTokens, timestamp);
    replaceReplayNoteAttachments(noteId, contentDocument, attachments, timestamp);
    saveReplayNoteContent(noteId, contentDocument, attachments, timestamp);
    upsertReplayNoteSearchDocument({
      noteId,
      title,
      content: contentPlainText,
    });
    return noteId;
  });

const buildReplayNoteWhereClause = (
  filters: ReplayNoteListFilters,
  cursorMeta?: { updatedAt: string; createdAt: string; id: string } | null,
): { whereSql: string; params: unknown[] } => {
  const clauses: string[] = [];
  const params: unknown[] = [];

  const scope = normalizeReplayNoteScope(filters.scope);
  if (scope === 'FREE_REPLAY') {
    clauses.push(`n.type = 'FREE_REPLAY'`);
  } else if (scope === 'CHALLENGE') {
    clauses.push(`n.type = 'CHALLENGE'`);
  } else if (scope === 'CUSTOM') {
    clauses.push(`n.type = 'CUSTOM'`);
  }

  if (filters.type) {
    clauses.push(`n.type = ?`);
    params.push(filters.type);
  }

  const colorTokens = Array.isArray(filters.colorTokens)
    ? filters.colorTokens.filter((item) => REPLAY_NOTE_COLOR_TOKEN_SET.has(item))
    : [];
  if (colorTokens.length) {
    clauses.push(
      `EXISTS (
        SELECT 1
          FROM replay_note_colors colored
         WHERE colored.note_id = n.id
           AND colored.color_token IN (${colorTokens.map(() => '?').join(',')})
      )`,
    );
    params.push(...colorTokens);
  }

  const keyword = normalizeOptionalText(filters.keyword);
  if (keyword) {
    const ftsQuery = buildReplayNoteFtsQuery(keyword);
    if (ftsQuery) {
      clauses.push(
        `EXISTS (
          SELECT 1
            FROM replay_notes_fts
           WHERE replay_notes_fts.note_id = n.id
             AND replay_notes_fts MATCH ?
        )`,
      );
      params.push(ftsQuery);
    }
  }

  if (cursorMeta) {
    clauses.push(`(n.updated_at, n.created_at, n.id) < (?, ?, ?)`);
    params.push(cursorMeta.updatedAt, cursorMeta.createdAt, cursorMeta.id);
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
};

const listReplayNoteRows = (
  limit: number,
  cursorMeta: { updatedAt: string; createdAt: string; id: string } | null,
  filters: ReplayNoteListFilters,
): ReplayNoteRow[] => {
  const where = buildReplayNoteWhereClause(filters, cursorMeta);
  return replayNoteStore.listReplayNoteRows({
    whereSql: where.whereSql,
    params: where.params,
    limit,
  });
};

const countReplayNoteRows = (filters: ReplayNoteListFilters): number => {
  const where = buildReplayNoteWhereClause(filters, null);
  const row = replayNoteStore.countReplayNoteRows({
    whereSql: where.whereSql,
    params: where.params,
  });
  return Math.max(0, Math.floor(normalizeNumber(row?.count)));
};

export const listReplayNotes = (
  limit = 60,
  cursor?: string,
  filters: ReplayNoteListFilters = {},
): ReplayNoteListResult => {
  const normalizedLimit = Math.max(1, Math.min(runtimeLimits.replayNotesQueryLimitMax, Math.floor(Number.isFinite(limit) ? limit : 60)));
  const cursorMeta = decodeCursor(cursor);
  const queryLimit = normalizedLimit + 1;
  const rows = listReplayNoteRows(queryLimit, cursorMeta, filters);
  const total = countReplayNoteRows(filters);

  const hasMore = rows.length > normalizedLimit;
  const trimmed = hasMore ? rows.slice(0, normalizedLimit) : rows;
  const nextCursor = hasMore
    ? (() => {
        const last = trimmed[trimmed.length - 1];
        if (!last) {
          return null;
        }
        return encodeCursor(last.updated_at, last.created_at, last.id);
      })()
    : null;

  const noteIds = trimmed.map((row) => row.id);
  const metaSummaryByNoteId = listReplayNoteMetaSummaryByNoteIds(noteIds);
  const colorsByNoteId = listReplayNoteColorsByNoteIds(noteIds);
  const attachmentsByNoteId = listReplayNoteAttachmentsByNoteIds(noteIds);
  const items = trimmed.map((row) => {
    const attachments = attachmentsByNoteId.get(row.id) ?? [];
    const preview = normalizeText(row.content_preview);
    const mapped = mapReplayNoteRow(
      row,
      createEmptyReplayNoteDocument(),
      preview,
      false,
      null,
      metaSummaryByNoteId.get(row.id) ?? null,
      colorsByNoteId.get(row.id) ?? [],
      attachments
    );
    const {
      contextReplay: _omitContextReplay,
      contentDocument: _omitContentDocument,
      meta: _omitMeta,
      simulationBatchId: _omitSimulationBatchId,
      ...meta
    } = mapped;
    return meta;
  });

  return {
    items,
    nextCursor,
    total,
  };
};

export const listRecentReplayNoteSummaries = (limit = 2): RecentReplayNoteSummary[] => {
  const normalizedLimit = Math.max(
    1,
    Math.min(
      runtimeLimits.replayNotesQueryLimitMax,
      Math.floor(Number.isFinite(limit) ? limit : 2)
    )
  );
  const rows = replayNoteStore.listRecentReplayNoteRows(normalizedLimit);

  const colorsByNoteId = listReplayNoteColorsByNoteIds(rows.map((row) => row.id));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    type: normalizeReplayNoteType(row.type),
    colorTokens: colorsByNoteId.get(row.id) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
};

const getReplayNoteByIdInternal = async (
  noteId: string,
  options: { includeContextReplay?: boolean } = {},
): Promise<ReplayNoteRecord | null> => {
  const id = noteId.trim();
  if (!id) {
    return null;
  }
  const includeContextReplay = options.includeContextReplay ?? true;
  const row = replayNoteStore.getReplayNoteRowById(id);
  if (!row) {
    return null;
  }
  const attachments = loadReplayNoteAttachments(id);
  const contentResolved = resolveReplayNoteContent(id, row.content_preview);
  const contextReplayFromTrainingProjectRef = includeContextReplay && row.has_context_replay
    ? await loadReplayNoteContext(id)
    : null;
  const contextReplayFromSpecialTrainingRef =
    !includeContextReplay || contextReplayFromTrainingProjectRef || !row.has_context_replay
      ? null
      : await loadReplayNoteSpecialTrainingContext(id);
  const contextReplay =
    includeContextReplay
      ? contextReplayFromTrainingProjectRef ??
        contextReplayFromSpecialTrainingRef ??
        loadReplayNoteContextArchive(id)
      : null;
  const metaPayload = loadReplayNoteMeta(id);
  const colorTokens = loadReplayNoteColors(id);
  const rowWithResolvedContext = {
    ...row,
    has_context_replay: includeContextReplay ? (contextReplay ? 1 : 0) : row.has_context_replay
  };
  return mapReplayNoteRow(
    rowWithResolvedContext,
    contentResolved.contentDocument,
    contentResolved.contentPreview,
    true,
    contextReplay,
    metaPayload.metaSummary,
    colorTokens,
    attachments,
    metaPayload.meta
  );
};

export const getReplayNoteById = async (
  noteId: string,
): Promise<ReplayNoteRecord | null> => {
  const note = await getReplayNoteByIdInternal(noteId);
  return note ? stripReplayNoteInternalFields(note) : null;
};

export const createReplayNote = async (payload: SaveReplayNotePayload): Promise<ReplayNoteRecord> => {
  const id = saveReplayNoteTx(payload);
  const saved = await getReplayNoteByIdInternal(id, { includeContextReplay: false });
  if (!saved) {
    throw appError('REPLAY_NOTE_SAVE_FAILED');
  }
  return stripReplayNoteInternalFields(saved);
};

export const updateReplayNote = async (noteId: string, payload: UpdateReplayNotePayload): Promise<ReplayNoteRecord> => {
  const id = noteId.trim();
  if (!id || id.length > INPUT_LIMITS.idChars) {
    throw appError('REPLAY_NOTE_NOT_FOUND');
  }
  const existing = await getReplayNoteByIdInternal(id, { includeContextReplay: false });
  if (!existing) {
    throw appError('REPLAY_NOTE_NOT_FOUND');
  }

  const updatedAt = nowIso();
  const trainingProjectId =
    payload.trainingProjectId !== undefined ? normalizeOptionalText(payload.trainingProjectId) : existing.trainingProjectId;
  const nextContextSessionId =
    payload.contextSessionId !== undefined
      ? normalizeOptionalText(payload.contextSessionId)
      : existing.contextSessionId;
  const nextContextCursorIndexRaw =
    payload.contextCursorIndex !== undefined
      ? normalizeNumber(payload.contextCursorIndex, Number.NaN)
      : existing.contextCursorIndex;
  const nextContextCursorIndex =
    typeof nextContextCursorIndexRaw === 'number' &&
    Number.isFinite(nextContextCursorIndexRaw)
    ? Math.max(0, Math.floor(nextContextCursorIndexRaw))
    : null;
  const hasExplicitContextReplay = Object.prototype.hasOwnProperty.call(payload, 'contextReplay');
  const nextContextReplay = hasExplicitContextReplay
    ? hydrateFreeReplayNoteSnapshotFills({
        type: existing.type,
        contextReplay: normalizeReplayNoteContextReplay(payload.contextReplay ?? null),
        contextSessionId: nextContextSessionId,
      })
    : null;
  const sourceKind =
    payload.sourceKind !== undefined
      ? normalizeReplayNoteSourceKind(payload.sourceKind)
      : existing.sourceKind;
  const simulationBatchId =
    payload.simulationBatchId !== undefined
      ? normalizeOptionalText(payload.simulationBatchId)
      : existing.simulationBatchId ?? null;
  const sourceId =
    payload.sourceId !== undefined
      ? normalizeReplayNoteSourceId(payload.sourceId)
      : existing.sourceId;
  const hasExplicitMeta = Object.prototype.hasOwnProperty.call(payload, 'meta');
  const hasExplicitMetaSummary = Object.prototype.hasOwnProperty.call(payload, 'metaSummary');
  const nextMeta = hasExplicitMeta ? normalizeReplayNoteMeta(payload.meta) : existing.meta ?? null;
  const nextMetaSummary = hasExplicitMetaSummary
    ? normalizeReplayNoteMeta(payload.metaSummary)
    : existing.metaSummary ?? null;
  const hasExplicitColors = Object.prototype.hasOwnProperty.call(payload, 'colorTokens');
  const nextColorTokens = hasExplicitColors
    ? normalizeReplayNoteColorTokens(payload.colorTokens)
    : existing.colorTokens;
  const specialTrainingQuestionId = resolveReplayNoteSpecialTrainingQuestionId({
    sourceKind,
    sourceId,
    contextSessionId: nextContextSessionId,
  });

  const hasStoredTrainingProjectContextRef = saveReplayNoteContextRef(
    id,
    trainingProjectId,
    nextContextCursorIndex,
    updatedAt
  );
  const hasStoredSpecialTrainingContextRef = saveReplayNoteSpecialTrainingContextRef(
    id,
    specialTrainingQuestionId,
    updatedAt,
  );
  const hasStoredContextRef =
    hasStoredTrainingProjectContextRef || hasStoredSpecialTrainingContextRef;
  const hasStoredContextArchive = hasStoredContextRef
    ? false
    : hasExplicitContextReplay
      ? saveReplayNoteContextArchive(id, nextContextReplay, updatedAt)
      : hasReplayNoteContextArchive(id);
  if (hasStoredContextRef) {
    clearReplayNoteContextArchive(id);
  }
  const hasStoredContext = hasStoredContextRef || hasStoredContextArchive;
  const nextContextExpiredAt =
    hasStoredContext ||
    hasExplicitContextReplay ||
    payload.trainingProjectId !== undefined ||
    payload.contextSessionId !== undefined ||
    payload.contextCursorIndex !== undefined
      ? null
      : existing.contextExpiredAt;
  const hasExplicitContentDocument = Object.prototype.hasOwnProperty.call(payload, 'contentDocument');
  const hasExplicitAttachments = Object.prototype.hasOwnProperty.call(payload, 'attachments');
  const nextContentDocument = hasExplicitContentDocument
    ? normalizeReplayNoteDocument(payload.contentDocument)
    : existing.contentDocument;
  const nextAttachments = hasExplicitAttachments
    ? validateReplayNoteAttachmentManifest(
        nextContentDocument,
        normalizeReplayNoteAttachments(payload.attachments),
      )
    : existing.attachments;
  const nextContentPreview = buildContentPreview(nextContentDocument, nextAttachments);
  const nextContentPlainText = buildContentPlainText(nextContentDocument, nextAttachments);
  if (nextContentPlainText.length > INPUT_LIMITS.noteContentChars) {
    throw appError('REPLAY_NOTE_CONTENT_TOO_LARGE', { max: INPUT_LIMITS.noteContentChars });
  }
  const contentChanged =
    hasExplicitContentDocument &&
    hashReplayNoteDocument(nextContentDocument) !== hashReplayNoteDocument(existing.contentDocument);
  const attachmentsChanged =
    hasExplicitAttachments &&
    JSON.stringify(normalizeReplayNoteAttachments(nextAttachments)) !==
      JSON.stringify(normalizeReplayNoteAttachments(existing.attachments));
  const nextTitle =
    payload.title !== undefined ? normalizeText(payload.title) : existing.title;
  if (nextTitle.length > INPUT_LIMITS.noteTitleChars) {
    throw appError('REPLAY_NOTE_TITLE_TOO_LONG', { max: INPUT_LIMITS.noteTitleChars });
  }
  const titleChanged = nextTitle !== existing.title;

  replayNoteStore.runReplayNoteTransaction(() => {
    replayNoteStore.updateReplayNoteRow({
      id,
      title: nextTitle,
      simulationBatchId,
      sourceKind,
      sourceId,
      contentPreview: nextContentPreview,
      trainingProjectId,
      contextDisplayPeriod:
        payload.contextDisplayPeriod !== undefined
          ? normalizeOptionalText(payload.contextDisplayPeriod)
          : existing.contextDisplayPeriod ?? null,
      hasContextReplay: hasStoredContext ? 1 : 0,
      contextExpiredAt: nextContextExpiredAt,
      contextSessionId: nextContextSessionId,
      contextCursorIndex: nextContextCursorIndex,
      updatedAt,
    });

    if (hasExplicitMeta || hasExplicitMetaSummary) {
      saveReplayNoteMeta(id, nextMeta, nextMetaSummary, updatedAt);
    }
    if (hasExplicitColors) {
      replaceReplayNoteColors(id, nextColorTokens, updatedAt);
    }
    if (contentChanged || attachmentsChanged) {
      replaceReplayNoteAttachments(id, nextContentDocument, nextAttachments, updatedAt);
      saveReplayNoteContent(id, nextContentDocument, nextAttachments, updatedAt);
    }
    if (titleChanged || contentChanged || attachmentsChanged) {
      upsertReplayNoteSearchDocument({
        noteId: id,
        title: nextTitle,
        content: nextContentPlainText,
      });
    }
  });

  const row = replayNoteStore.getReplayNoteRowById(id);
  if (!row) {
    throw appError('REPLAY_NOTE_UPDATE_FAILED');
  }

  const preview = normalizeText(row.content_preview) || nextContentPreview;
  const metaPayload = loadReplayNoteMeta(id);
  const colorTokens = loadReplayNoteColors(id);
  const savedAttachments = loadReplayNoteAttachments(id);
  const saved = mapReplayNoteRow(
    row,
    nextContentDocument,
    preview,
    true,
    hasExplicitContextReplay ? nextContextReplay : null,
    metaPayload.metaSummary,
    colorTokens,
    savedAttachments,
    metaPayload.meta
  );
  return stripReplayNoteInternalFields(saved);
};

export const deleteReplayNote = (noteId: string): { deleted: number } => {
  const id = noteId.trim();
  if (!id) {
    return { deleted: 0 };
  }
  deleteReplayNoteSearchDocument(id);
  return { deleted: replayNoteStore.deleteReplayNoteRow(id) };
};

export const clearReplayNotes = (): { deleted: number } => {
  replayNoteStore.clearReplayNoteSearchDocuments();
  return { deleted: replayNoteStore.clearReplayNoteRows() };
};

export const rebindTrainingRecordNotes = (fromBindingId: string, toBindingId: string): { updated: number } => {
  const sourceId = fromBindingId.trim();
  const targetId = toBindingId.trim();
  if (!sourceId || !targetId) {
    return { updated: 0 };
  }

  const timestamp = nowIso();
  return {
    updated: replayNoteStore.rebindTrainingRecordNoteRows({
      sourceId,
      targetId,
      updatedAt: timestamp,
    }),
  };
};
