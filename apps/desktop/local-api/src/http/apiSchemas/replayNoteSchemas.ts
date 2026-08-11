// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import {
  INPUT_ARRAY_LIMITS,
  INPUT_LIMITS,
  INPUT_SERIALIZED_LIMITS,
} from '@zinuto/shared/input-limits';
import {
  REPLAY_NOTE_COLOR_TOKENS,
  REPLAY_NOTE_SCOPE_FILTERS,
} from '@zinuto/shared/replayNoteColors';
import { REPLAY_NOTE_TYPES } from '@zinuto/shared/replayNoteBuilder';
import { REPLAY_NOTE_ATTACHMENT_KINDS } from '@zinuto/shared/replayNoteDocument';
import { runtimeLimits } from '../../kernel/runtimeLimits.js';
import {
  boundedRecordSchema,
  boundedUnknownSchema,
  cursorSchema,
  idSchema,
  nonEmptyTrimmedString,
  nullableIdSchema,
  searchQuerySchema,
  trimmedString,
} from './common.js';

const replayNoteTypeSchema = z.enum(REPLAY_NOTE_TYPES);
const replayNoteDocumentSchema = boundedRecordSchema(INPUT_LIMITS.noteContentChars * 8);
const replayNoteAttachmentSchema = z.object({
  attachmentRefId: nonEmptyTrimmedString(INPUT_LIMITS.idChars),
  kind: z.enum(REPLAY_NOTE_ATTACHMENT_KINDS),
  summary: boundedRecordSchema(INPUT_SERIALIZED_LIMITS.replayNoteMetaSummaryBytes).nullable().optional(),
  ref: z.object({
    kind: nonEmptyTrimmedString(INPUT_LIMITS.shortCodeChars),
    id: nullableIdSchema,
  }).nullable().optional(),
  payload: boundedUnknownSchema(INPUT_SERIALIZED_LIMITS.replayNoteMetaBytes).optional(),
  sortIndex: z.coerce.number().int().min(0).optional(),
});

export const replayNoteSchema = z.object({
  id: idSchema.optional(),
  title: z.string().max(INPUT_LIMITS.noteTitleChars).optional(),
  type: replayNoteTypeSchema,
  sourceKind: z.string().trim().min(1).max(64).nullable().optional(),
  sourceId: z.string().trim().min(1).max(191).nullable().optional(),
  contentDocument: replayNoteDocumentSchema,
  attachments: z.array(replayNoteAttachmentSchema).max(500).nullable().optional(),
  colorTokens: z.array(z.enum(REPLAY_NOTE_COLOR_TOKENS)).max(INPUT_ARRAY_LIMITS.replayNoteColors).nullable().optional(),
  meta: boundedRecordSchema(INPUT_SERIALIZED_LIMITS.replayNoteMetaBytes).nullable().optional(),
  metaSummary: boundedRecordSchema(INPUT_SERIALIZED_LIMITS.replayNoteMetaSummaryBytes).nullable().optional(),
  contextReplay: boundedRecordSchema(runtimeLimits.replayNoteSnapshotSourceMaxBytes).nullable().optional(),
  trainingProjectId: nullableIdSchema,
  contextDisplayPeriod: trimmedString(INPUT_LIMITS.shortCodeChars).nullable().optional(),
  contextSessionId: nullableIdSchema,
  contextCursorIndex: z.coerce.number().int().min(0).nullable().optional(),
  createdAt: nonEmptyTrimmedString(INPUT_LIMITS.dateTimeChars).optional(),
  updatedAt: nonEmptyTrimmedString(INPUT_LIMITS.dateTimeChars).optional()
});

export const replayNoteUpdateSchema = z.object({
  title: z.string().max(INPUT_LIMITS.noteTitleChars).optional(),
  sourceKind: z.string().trim().min(1).max(64).nullable().optional(),
  sourceId: z.string().trim().min(1).max(191).nullable().optional(),
  contentDocument: replayNoteDocumentSchema.optional(),
  attachments: z.array(replayNoteAttachmentSchema).max(500).nullable().optional(),
  colorTokens: z.array(z.enum(REPLAY_NOTE_COLOR_TOKENS)).max(INPUT_ARRAY_LIMITS.replayNoteColors).nullable().optional(),
  meta: boundedRecordSchema(INPUT_SERIALIZED_LIMITS.replayNoteMetaBytes).nullable().optional(),
  metaSummary: boundedRecordSchema(INPUT_SERIALIZED_LIMITS.replayNoteMetaSummaryBytes).nullable().optional(),
  trainingProjectId: nullableIdSchema,
  contextDisplayPeriod: trimmedString(INPUT_LIMITS.shortCodeChars).nullable().optional(),
  contextReplay: boundedRecordSchema(runtimeLimits.replayNoteSnapshotSourceMaxBytes).nullable().optional(),
  contextSessionId: nullableIdSchema,
  contextCursorIndex: z.coerce.number().int().min(0).nullable().optional()
});

export const replayNoteRebindSchema = z.object({
  fromBindingId: idSchema,
  toBindingId: idSchema
});

export const replayNotesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(runtimeLimits.replayNotesQueryLimitMax).optional(),
  cursor: cursorSchema,
  keyword: searchQuerySchema,
  type: replayNoteTypeSchema.optional(),
  colorTokens: trimmedString(INPUT_LIMITS.searchQueryChars).optional(),
  scope: z.enum(REPLAY_NOTE_SCOPE_FILTERS).optional(),
});
