// SPDX-License-Identifier: GPL-3.0-only

import { Router } from 'express';
import { appError } from '../kernel/appError.js';
import {
  clearReplayNotes,
  createReplayNote,
  deleteReplayNote,
  getReplayNoteById,
  listRecentReplayNoteSummaries,
  listReplayNotes,
  rebindTrainingRecordNotes,
  updateReplayNote
} from '../application/replayNoteService.js';
import {
  replayNoteRebindSchema,
  replayNoteSchema,
  replayNotesQuerySchema,
  replayNoteUpdateSchema
} from './apiSchemas.js';
import { ok } from './response.js';
import { parseRouteId } from './routeParams.js';

export const replayNoteRouter = Router();

replayNoteRouter.get('/replay-notes', (req, res) => {
  const query = replayNotesQuerySchema.parse(req.query ?? {});
  res.json(
    ok(
      listReplayNotes(query.limit, query.cursor, {
        keyword: query.keyword,
        type: query.type,
        colorTokens:
          typeof query.colorTokens === 'string'
            ? query.colorTokens.split(',').map((item) => item.trim()).filter(Boolean) as never[]
            : [],
        scope: query.scope,
      }),
    ),
  );
});

replayNoteRouter.get('/replay-notes/recent', (req, res) => {
  const query = replayNotesQuerySchema.parse(req.query ?? {});
  res.json(ok(listRecentReplayNoteSummaries(query.limit ?? 2)));
});

replayNoteRouter.get('/replay-notes/:id', async (req, res) => {
  const item = await getReplayNoteById(parseRouteId(req.params.id));
  if (!item) {
    throw appError('REPLAY_NOTE_NOT_FOUND');
  }
  res.json(ok(item));
});

replayNoteRouter.post('/replay-notes/rebind-training-project', (req, res) => {
  const payload = replayNoteRebindSchema.parse(req.body ?? {});
  res.json(ok(rebindTrainingRecordNotes(payload.fromBindingId, payload.toBindingId)));
});

replayNoteRouter.post('/replay-notes', async (req, res) => {
  const payload = replayNoteSchema.parse(req.body ?? {});
  res.json(ok(await createReplayNote(payload)));
});

replayNoteRouter.patch('/replay-notes/:id', async (req, res) => {
  const noteId = parseRouteId(req.params.id);
  const payload = replayNoteUpdateSchema.parse(req.body ?? {});
  res.json(ok(await updateReplayNote(noteId, payload)));
});

replayNoteRouter.delete('/replay-notes/:id', (req, res) => {
  res.json(ok(deleteReplayNote(parseRouteId(req.params.id))));
});

replayNoteRouter.delete('/replay-notes', (_req, res) => {
  res.json(ok(clearReplayNotes()));
});
