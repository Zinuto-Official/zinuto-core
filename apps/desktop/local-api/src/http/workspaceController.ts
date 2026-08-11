// SPDX-License-Identifier: GPL-3.0-only

import type { Request, Response } from 'express';
import {
  isReplayNoteColorToken,
  isReplayNoteScopeFilter,
} from '@zinuto/shared/replayNoteColors';
import type { HistoryReviewConsoleQuery } from '../application/workspaceReadModelHistory.js';
import {
  buildWorkspaceReadModel,
  type WorkspaceReadModelBuildOptions,
  type WorkspaceReadModelRegistryEntry,
} from '../application/workspaceReadModelService.js';
import { ok } from './response.js';

const readQueryText = (value: unknown): string | undefined => {
  const text = String(Array.isArray(value) ? value[0] ?? '' : value ?? '').trim();
  return text || undefined;
};

const readNotesQuery = (req: Request) => {
  const keyword = readQueryText(req.query.keyword);
  const scopeText = readQueryText(req.query.scope);
  const colorTokensText = readQueryText(req.query.colorTokens);
  return {
    ...(keyword ? { keyword } : {}),
    ...(scopeText && isReplayNoteScopeFilter(scopeText) ? { scope: scopeText } : {}),
    colorTokens: colorTokensText
      ? colorTokensText
          .split(',')
          .map((item) => item.trim())
          .filter(isReplayNoteColorToken)
      : [],
  };
};

const normalizeProfitFilter = (value: unknown): 'ALL' | 'PROFIT' | 'LOSS' => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'PROFIT' || normalized === 'LOSS') return normalized;
  return 'ALL';
};

const readHistoryQuery = (req: Request): HistoryReviewConsoleQuery => {
  const keyword = readQueryText(req.query.keyword);
  const profitFilter = normalizeProfitFilter(req.query.profitFilter);
  const samplePoolFilter = readQueryText(req.query.samplePoolFilter);
  const samplePoolAllId = readQueryText(req.query.samplePoolAllId);
  const samplePoolUnknownId = readQueryText(req.query.samplePoolUnknownId);
  return {
    ...(keyword ? { keyword } : {}),
    profitFilter,
    ...(samplePoolFilter ? { samplePoolFilter } : {}),
    ...(samplePoolAllId ? { samplePoolAllId } : {}),
    ...(samplePoolUnknownId ? { samplePoolUnknownId } : {}),
  };
};

const readWorkspaceRequestOptions = (
  entry: WorkspaceReadModelRegistryEntry,
  req: Request,
): WorkspaceReadModelBuildOptions => {
  switch (entry.queryKind) {
    case 'notes':
      return { notesQuery: readNotesQuery(req) };
    case 'history-review':
      return { historyQuery: readHistoryQuery(req) };
    case 'none':
      return {};
  }
};

export const createWorkspaceReadModelController =
  (entry: WorkspaceReadModelRegistryEntry) =>
  async (req: Request, res: Response): Promise<void> => {
    res.json(
      ok(
        await buildWorkspaceReadModel(
          entry.id,
          undefined,
          readWorkspaceRequestOptions(entry, req),
        ),
      ),
    );
  };
