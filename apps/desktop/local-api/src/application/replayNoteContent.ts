// SPDX-License-Identifier: GPL-3.0-only

import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { INPUT_LIMITS, INPUT_SERIALIZED_LIMITS } from '@zinuto/shared/input-limits';
import { normalizeReplayNoteColorTokens, type ReplayNoteColorToken } from '@zinuto/shared/replayNoteColors';
import {
  REPLAY_NOTE_DOCUMENT_SCHEMA_VERSION,
  buildReplayNoteDocumentPreview,
  createEmptyReplayNoteDocument,
  deriveReplayNoteDocumentPlainText,
  listReplayNoteDocumentAttachmentRefIds,
  normalizeReplayNoteAttachments,
  normalizeReplayNoteDocument,
  stringifyReplayNoteDocument,
  type ReplayNoteAttachmentV1,
  type ReplayNoteDocumentV1,
} from '@zinuto/shared/replayNoteDocument';
import { appError } from '../kernel/appError.js';
import { runtimeLimits } from '../kernel/runtimeLimits.js';
import * as replayNoteStore from './ports/infrastructure/db/replayNote/replayNoteStore.js';
import type {
  ReplayNoteAttachmentRow,
  ReplayNoteContentRow,
  ReplayNoteMetaRow,
} from './ports/infrastructure/db/replayNote/replayNoteStore.js';
import { decodeBoundedGzipJson } from './replayNotePayloadCodec.js';

export type ReplayNoteMeta = Record<string, unknown>;

const NOTE_CONTENT_PREVIEW_MAX = runtimeLimits.noteContentPreviewMaxChars;
const NOTE_DOCUMENT_ENCODING_GZIP_JSON_V1 = 'GZIP_JSON_V1';
const NOTE_ATTACHMENT_PAYLOAD_ENCODING_GZIP_JSON_V1 = 'GZIP_JSON_V1';
const NOTE_META_MAX_BYTES = INPUT_SERIALIZED_LIMITS.replayNoteMetaBytes;
const NOTE_META_SUMMARY_MAX_BYTES = INPUT_SERIALIZED_LIMITS.replayNoteMetaSummaryBytes;
const NOTE_DOCUMENT_MAX_SOURCE_BYTES = INPUT_LIMITS.noteContentChars * 8;
const NOTE_DOCUMENT_MAX_COMPRESSED_BYTES = NOTE_DOCUMENT_MAX_SOURCE_BYTES + 64 * 1024;
const NOTE_ATTACHMENT_MAX_COMPRESSED_BYTES = NOTE_META_MAX_BYTES + 64 * 1024;

const normalizeText = (value: unknown): string => (typeof value === 'string' ? value : '');

export const normalizeReplayNoteMeta = (value: unknown): ReplayNoteMeta | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as ReplayNoteMeta;
};

const parseReplayNoteMeta = (value: unknown): ReplayNoteMeta | null => {
  const normalized = normalizeText(value).trim();
  if (!normalized) {
    return null;
  }
  try {
    return normalizeReplayNoteMeta(JSON.parse(normalized));
  } catch {
    return null;
  }
};

const encodeReplayNoteMeta = (
  meta: ReplayNoteMeta | null,
  maxBytes: number,
  part: 'meta' | 'metaSummary',
): string => {
  const normalized = normalizeReplayNoteMeta(meta);
  const json = JSON.stringify(normalized);
  const bytes = Buffer.byteLength(json, 'utf-8');
  if (bytes > maxBytes) {
    throw appError('REPLAY_NOTE_META_TOO_LARGE', { part });
  }
  return json;
};

export const buildContentPreview = (
  document: ReplayNoteDocumentV1,
  attachments: readonly ReplayNoteAttachmentV1[] = [],
): string => buildReplayNoteDocumentPreview(document, attachments, NOTE_CONTENT_PREVIEW_MAX);

export const buildContentPlainText = (
  document: ReplayNoteDocumentV1,
  attachments: readonly ReplayNoteAttachmentV1[] = [],
): string => deriveReplayNoteDocumentPlainText(document, attachments);

export const hashReplayNoteDocument = (document: ReplayNoteDocumentV1): string =>
  createHash('sha256').update(stringifyReplayNoteDocument(document), 'utf-8').digest('hex');

const loadReplayNoteContentRow = (noteId: string): ReplayNoteContentRow | null => {
  return replayNoteStore.getReplayNoteContentRow(noteId);
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

const encodeReplayNoteDocumentPayload = (
  document: ReplayNoteDocumentV1,
): { payload: Buffer; payloadBytes: number; hash: string; sourceBytes: number } => {
  const json = stringifyReplayNoteDocument(document);
  const sourceBytes = Buffer.byteLength(json, 'utf-8');
  if (sourceBytes > INPUT_LIMITS.noteContentChars * 8) {
    throw appError('REPLAY_NOTE_CONTENT_TOO_LARGE', { max: INPUT_LIMITS.noteContentChars });
  }
  const payload = gzipSync(Buffer.from(json, 'utf-8'));
  return {
    payload,
    payloadBytes: payload.byteLength,
    hash: createHash('sha256').update(json, 'utf-8').digest('hex'),
    sourceBytes,
  };
};

const decodeReplayNoteDocumentPayload = (
  row: ReplayNoteContentRow,
): ReplayNoteDocumentV1 => {
  const encoding = normalizeText(row.document_encoding).trim().toUpperCase();
  const payloadBuffer = toPayloadBuffer(row.document_payload);
  if (!payloadBuffer || encoding !== NOTE_DOCUMENT_ENCODING_GZIP_JSON_V1) {
    throw appError('REPLAY_NOTE_CONTENT_TOO_LARGE', { part: 'contentDocument' });
  }
  try {
    const decoded = decodeBoundedGzipJson(payloadBuffer, {
      maxCompressedBytes: NOTE_DOCUMENT_MAX_COMPRESSED_BYTES,
      maxSourceBytes: NOTE_DOCUMENT_MAX_SOURCE_BYTES,
    });
    if (
      (Number.isSafeInteger(row.payload_bytes) && row.payload_bytes > 0
        && row.payload_bytes !== decoded.payloadBytes)
      || (normalizeText(row.document_hash) && normalizeText(row.document_hash) !== decoded.sha256)
    ) {
      throw new Error('REPLAY_NOTE_CONTENT_IDENTITY_MISMATCH');
    }
    return normalizeReplayNoteDocument(decoded.value);
  } catch {
    throw appError('REPLAY_NOTE_CONTENT_TOO_LARGE', { part: 'contentDocument' });
  }
};

export const saveReplayNoteContent = (
  noteId: string,
  document: ReplayNoteDocumentV1,
  attachments: readonly ReplayNoteAttachmentV1[],
  timestamp: string,
): void => {
  const normalizedDocument = normalizeReplayNoteDocument(document);
  const normalizedAttachments = normalizeReplayNoteAttachments(attachments);
  const plainText = buildContentPlainText(normalizedDocument, normalizedAttachments);
  if (plainText.length > INPUT_LIMITS.noteContentChars) {
    throw appError('REPLAY_NOTE_CONTENT_TOO_LARGE', { max: INPUT_LIMITS.noteContentChars });
  }
  const encoded = encodeReplayNoteDocumentPayload(normalizedDocument);
  const existing = loadReplayNoteContentRow(noteId);
  const contentPreview = buildContentPreview(normalizedDocument, normalizedAttachments);
  if (existing && normalizeText(existing.document_hash) === encoded.hash) {
    replayNoteStore.updateReplayNoteContentPreview({
      noteId,
      contentPreview,
      textChars: plainText.length,
      updatedAt: timestamp,
    });
    return;
  }
  replayNoteStore.upsertReplayNoteContentRow({
    noteId,
    documentSchemaVersion: REPLAY_NOTE_DOCUMENT_SCHEMA_VERSION,
    documentEncoding: NOTE_DOCUMENT_ENCODING_GZIP_JSON_V1,
    documentPayload: encoded.payload,
    documentHash: encoded.hash,
    contentPreview,
    textChars: plainText.length,
    payloadBytes: encoded.payloadBytes,
    updatedAt: timestamp,
  });
};

export const resolveReplayNoteContent = (
  noteId: string,
  fallbackPreview: string | null,
): { contentDocument: ReplayNoteDocumentV1; contentPreview: string } => {
  const contentRow = loadReplayNoteContentRow(noteId);
  if (contentRow) {
    const contentDocument = decodeReplayNoteDocumentPayload(contentRow);
    const preview = normalizeText(contentRow.content_preview) || buildContentPreview(contentDocument);
    return {
      contentDocument,
      contentPreview: preview,
    };
  }
  return {
    contentDocument: createEmptyReplayNoteDocument(),
    contentPreview: normalizeText(fallbackPreview),
  };
};

export const deleteReplayNoteSearchDocument = (noteId: string): void => {
  replayNoteStore.deleteReplayNoteSearchDocument(noteId);
};

export const upsertReplayNoteSearchDocument = (input: {
  noteId: string;
  title: string;
  content: string;
}): void => {
  replayNoteStore.upsertReplayNoteSearchDocument({
    noteId: input.noteId,
    title: normalizeText(input.title),
    content: normalizeText(input.content),
  });
};

export const buildReplayNoteFtsQuery = (keyword: string): string | null => {
  const tokens = normalizeText(keyword)
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/"/g, '""').trim())
    .filter((token) => Boolean(token));
  if (!tokens.length) {
    return null;
  }
  return tokens.map((token) => `"${token}"*`).join(' AND ');
};

const loadReplayNoteMetaRow = (noteId: string): ReplayNoteMetaRow | null => {
  return replayNoteStore.getReplayNoteMetaRow(noteId);
};

export const loadReplayNoteMeta = (
  noteId: string,
): { meta: ReplayNoteMeta | null; metaSummary: ReplayNoteMeta | null } => {
  const row = loadReplayNoteMetaRow(noteId);
  if (!row) {
    return {
      meta: null,
      metaSummary: null,
    };
  }
  return {
    meta: parseReplayNoteMeta(row.meta_json),
    metaSummary: parseReplayNoteMeta(row.meta_summary_json),
  };
};

export const saveReplayNoteMeta = (
  noteId: string,
  meta: ReplayNoteMeta | null,
  metaSummary: ReplayNoteMeta | null,
  timestamp: string,
): void => {
  const normalizedMeta = normalizeReplayNoteMeta(meta);
  const normalizedSummary = normalizeReplayNoteMeta(metaSummary);
  if (!normalizedMeta && !normalizedSummary) {
    replayNoteStore.deleteReplayNoteMeta(noteId);
    return;
  }
  replayNoteStore.upsertReplayNoteMeta({
    noteId,
    metaJson: encodeReplayNoteMeta(normalizedMeta, NOTE_META_MAX_BYTES, 'meta'),
    metaSummaryJson: encodeReplayNoteMeta(
      normalizedSummary,
      NOTE_META_SUMMARY_MAX_BYTES,
      'metaSummary',
    ),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
};

export const listReplayNoteMetaSummaryByNoteIds = (
  noteIds: readonly string[],
): Map<string, ReplayNoteMeta | null> => {
  const map = new Map<string, ReplayNoteMeta | null>();
  if (!noteIds.length) {
    return map;
  }
  const rows = replayNoteStore.listReplayNoteMetaSummaryRows(noteIds);
  rows.forEach((row) => {
    map.set(row.note_id, parseReplayNoteMeta(row.meta_summary_json));
  });
  return map;
};

const encodeReplayNoteAttachmentSummary = (
  summary: ReplayNoteAttachmentV1['summary'] | null | undefined,
): string => {
  const json = JSON.stringify(summary ?? null);
  if (Buffer.byteLength(json, 'utf-8') > NOTE_META_SUMMARY_MAX_BYTES) {
    throw appError('REPLAY_NOTE_META_TOO_LARGE', { part: 'attachmentSummary' });
  }
  return json;
};

const parseReplayNoteAttachmentSummary = (
  value: unknown,
): ReplayNoteAttachmentV1['summary'] | null => {
  const normalized = normalizeText(value).trim();
  if (!normalized) {
    return null;
  }
  try {
    const parsed = JSON.parse(normalized);
    return normalizeReplayNoteAttachments([
      {
        attachmentRefId: 'summary-probe',
        kind: 'CAPSULE',
        summary: parsed,
      },
    ])[0]?.summary ?? null;
  } catch {
    return null;
  }
};

const encodeReplayNoteAttachmentPayload = (
  payload: unknown,
): { encoding: string | null; payloadBlob: Buffer | null; sourceBytes: number; payloadBytes: number } => {
  if (payload === undefined || payload === null) {
    return {
      encoding: null,
      payloadBlob: null,
      sourceBytes: 0,
      payloadBytes: 0,
    };
  }
  const sourceJson = JSON.stringify(payload);
  const sourceBytes = Buffer.byteLength(sourceJson, 'utf-8');
  if (sourceBytes > NOTE_META_MAX_BYTES) {
    throw appError('REPLAY_NOTE_META_TOO_LARGE', { part: 'attachmentPayload' });
  }
  const payloadBlob = gzipSync(Buffer.from(sourceJson, 'utf-8'));
  return {
    encoding: NOTE_ATTACHMENT_PAYLOAD_ENCODING_GZIP_JSON_V1,
    payloadBlob,
    sourceBytes,
    payloadBytes: payloadBlob.byteLength,
  };
};

const decodeReplayNoteAttachmentPayload = (
  row: ReplayNoteAttachmentRow,
): unknown => {
  const encoding = normalizeText(row.payload_encoding).trim().toUpperCase();
  const payloadBuffer = toPayloadBuffer(row.payload_blob);
  if (!payloadBuffer || encoding !== NOTE_ATTACHMENT_PAYLOAD_ENCODING_GZIP_JSON_V1) {
    return undefined;
  }
  try {
    const decoded = decodeBoundedGzipJson(payloadBuffer, {
      maxCompressedBytes: NOTE_ATTACHMENT_MAX_COMPRESSED_BYTES,
      maxSourceBytes: NOTE_META_MAX_BYTES,
    });
    if (
      (Number.isSafeInteger(row.payload_bytes) && Number(row.payload_bytes) > 0
        && Number(row.payload_bytes) !== decoded.payloadBytes)
      || (Number.isSafeInteger(row.source_bytes) && Number(row.source_bytes) > 0
        && Number(row.source_bytes) !== decoded.sourceBytes)
    ) {
      return undefined;
    }
    return decoded.value;
  } catch {
    return undefined;
  }
};

const mapReplayNoteAttachmentRow = (
  row: ReplayNoteAttachmentRow,
  includePayload = true,
): ReplayNoteAttachmentV1 | null => {
  const normalized = normalizeReplayNoteAttachments([
    {
      attachmentRefId: row.attachment_ref_id,
      kind: row.attachment_kind,
      summary: parseReplayNoteAttachmentSummary(row.summary_json),
      ref: row.ref_kind
        ? {
            kind: row.ref_kind,
            id: row.ref_id,
          }
        : null,
      payload: includePayload ? decodeReplayNoteAttachmentPayload(row) : undefined,
      sortIndex: row.sort_index,
    },
  ]);
  return normalized[0] ?? null;
};

export const loadReplayNoteAttachments = (noteId: string): ReplayNoteAttachmentV1[] => {
  const rows = replayNoteStore.listReplayNoteAttachmentRows(noteId);
  return rows
    .map((row) => mapReplayNoteAttachmentRow(row, true))
    .filter((attachment): attachment is ReplayNoteAttachmentV1 => Boolean(attachment));
};

export const listReplayNoteAttachmentsByNoteIds = (
  noteIds: readonly string[],
): Map<string, ReplayNoteAttachmentV1[]> => {
  const map = new Map<string, ReplayNoteAttachmentV1[]>();
  if (!noteIds.length) {
    return map;
  }
  const rows = replayNoteStore.listReplayNoteAttachmentRowsByNoteIds(noteIds);
  rows.forEach((row) => {
    const attachment = mapReplayNoteAttachmentRow(row, false);
    if (!attachment) {
      return;
    }
    const current = map.get(row.note_id) ?? [];
    current.push(attachment);
    map.set(row.note_id, current);
  });
  return map;
};

export const validateReplayNoteAttachmentManifest = (
  document: ReplayNoteDocumentV1,
  attachments: readonly ReplayNoteAttachmentV1[],
): ReplayNoteAttachmentV1[] => {
  const normalizedAttachments = normalizeReplayNoteAttachments(attachments);
  const attachmentByRefId = new Map(
    normalizedAttachments.map((attachment) => [attachment.attachmentRefId, attachment]),
  );
  const missingRefs = listReplayNoteDocumentAttachmentRefIds(document).filter(
    (attachmentRefId) => !attachmentByRefId.has(attachmentRefId),
  );
  if (missingRefs.length) {
    throw appError('INVALID_PARAMS', { part: 'attachments' });
  }
  return normalizedAttachments;
};

export const replaceReplayNoteAttachments = (
  noteId: string,
  document: ReplayNoteDocumentV1,
  attachments: readonly ReplayNoteAttachmentV1[],
  timestamp: string,
): ReplayNoteAttachmentV1[] => {
  const normalizedAttachments = validateReplayNoteAttachmentManifest(document, attachments);
  replayNoteStore.replaceReplayNoteAttachmentRows(
    noteId,
    normalizedAttachments.map((attachment, index) => {
      const encodedPayload = encodeReplayNoteAttachmentPayload(attachment.payload);
      return {
        attachmentRefId: attachment.attachmentRefId,
        attachmentKind: attachment.kind,
        summaryJson: encodeReplayNoteAttachmentSummary(attachment.summary),
        refKind: attachment.ref?.kind ?? null,
        refId: attachment.ref?.id ?? null,
        payloadEncoding: encodedPayload.encoding,
        payloadBlob: encodedPayload.payloadBlob,
        sourceBytes: encodedPayload.sourceBytes,
        payloadBytes: encodedPayload.payloadBytes,
        sortIndex: Number.isFinite(Number(attachment.sortIndex))
          ? Math.max(0, Math.floor(Number(attachment.sortIndex)))
          : index,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    }),
  );
  return normalizedAttachments;
};

export const loadReplayNoteColors = (noteId: string): ReplayNoteColorToken[] => {
  const rows = replayNoteStore.listReplayNoteColorRows(noteId);
  return normalizeReplayNoteColorTokens(rows.map((row) => row.color_token));
};

export const listReplayNoteColorsByNoteIds = (
  noteIds: readonly string[],
): Map<string, ReplayNoteColorToken[]> => {
  const map = new Map<string, ReplayNoteColorToken[]>();
  if (!noteIds.length) {
    return map;
  }
  const rows = replayNoteStore.listReplayNoteColorRowsByNoteIds(noteIds);
  rows.forEach((row) => {
    const token = normalizeReplayNoteColorTokens([row.color_token])[0];
    if (!token) {
      return;
    }
    const current = map.get(row.note_id) ?? [];
    if (!current.includes(token)) {
      current.push(token);
      map.set(row.note_id, current);
    }
  });
  return map;
};

export const replaceReplayNoteColors = (
  noteId: string,
  colorTokens: readonly ReplayNoteColorToken[],
  timestamp: string,
): void => {
  const normalizedTokens = normalizeReplayNoteColorTokens(colorTokens);
  replayNoteStore.replaceReplayNoteColorRows(
    noteId,
    normalizedTokens.map((token, index) => ({
      colorToken: token,
      sortIndex: index,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  );
};
