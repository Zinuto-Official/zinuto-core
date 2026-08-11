// SPDX-License-Identifier: GPL-3.0-only

import type { DesktopWorkspaceReadModel } from '@zinuto/shared/contracts-desktop/api';
import type {
  ReplayNoteColorToken,
  ReplayNoteScopeFilter,
} from '@zinuto/shared/replayNoteColors';
import {
  buildHistoryReviewFacts,
  buildNotesWorkspaceFacts,
  buildHistoryReviewFilteredProjects,
  buildHistoryPoolFilterOptions,
  type HistoryReviewProjectRow,
} from './workspaceReadModelHistoryFacts.js';
import {
  createAction,
  createModel,
  createSection,
  toCount,
  toRecord,
  type WorkspaceReadModelDependencies,
} from './workspaceReadModelPrimitives.js';

const HISTORY_REVIEW_FACT_PROJECT_LIMIT = 200;
const HISTORY_REVIEW_FACT_NOTE_LIMIT = 200;
const NOTES_WORKSPACE_PAGE_LIMIT = 20;

export type NotesWorkspaceReadModelQuery = {
  keyword?: string;
  scope?: ReplayNoteScopeFilter;
  colorTokens?: ReplayNoteColorToken[];
};

export type HistoryReviewConsoleQuery = {
  keyword?: string;
  profitFilter?: 'ALL' | 'PROFIT' | 'LOSS';
  samplePoolFilter?: string;
  samplePoolAllId?: string;
  samplePoolUnknownId?: string;
};

const normalizeOptionalText = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
};

const normalizeProfitFilter = (value: unknown): 'ALL' | 'PROFIT' | 'LOSS' => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'PROFIT' || normalized === 'LOSS') {
    return normalized;
  }
  return 'ALL';
};

export const buildHistoryReviewModel = async (
  deps: WorkspaceReadModelDependencies,
  query: HistoryReviewConsoleQuery = {},
): Promise<DesktopWorkspaceReadModel> => {
  const [projectsPage, statsSummary, notesPage] = await Promise.all([
    deps.listTrainingProjects(HISTORY_REVIEW_FACT_PROJECT_LIMIT),
    deps.getTrainingStatsSummary({}),
    deps.listReplayNotes(HISTORY_REVIEW_FACT_NOTE_LIMIT),
  ]);
  const reviewFacts = buildHistoryReviewFacts({
    projectsPage,
    statsSummary,
    notesPage,
  });
  const totalProjects = toCount(reviewFacts.totalProjects);

  const keyword = normalizeOptionalText(query.keyword) ?? '';
  const profitFilter = normalizeProfitFilter(query.profitFilter);
  const samplePoolFilter = normalizeOptionalText(query.samplePoolFilter) ?? '';
  const samplePoolAllId = normalizeOptionalText(query.samplePoolAllId) ?? '';
  const samplePoolUnknownId = normalizeOptionalText(query.samplePoolUnknownId) ?? '';

  const projectRows = (Array.isArray(toRecord(projectsPage).items)
    ? toRecord(projectsPage).items
    : []) as HistoryReviewProjectRow[];

  const filteredResult = buildHistoryReviewFilteredProjects({
    projects: projectRows,
    keyword,
    profitFilter,
    samplePoolFilter,
    samplePoolAllId,
    samplePoolUnknownId,
  });

  const poolFilterOptions = buildHistoryPoolFilterOptions({
    projects: projectRows,
    samplePoolAllId,
    samplePoolUnknownId,
  });

  const selectedProjectId = filteredResult.projectIds[0] ?? null;
  const selectedProjectSessionId = selectedProjectId
    ? (projectRows.find((p) => p.id === selectedProjectId)?.replay?.snapshot?.session?.id ?? null)
    : null;

  return createModel({
    deps,
    workspaceId: 'history-review-console',
    statusCode: totalProjects > 0 ? 'READY' : 'EMPTY',
    reasonCode: totalProjects > 0 ? null : 'NO_TRAINING_HISTORY',
    tone: totalProjects > 0 ? 'ready' : 'neutral',
    priority: totalProjects > 0 ? 20 : 60,
    facts: {
      ...reviewFacts,
      filteredProjectIds: filteredResult.projectIds,
      filteredProjectCount: filteredResult.projectIds.length,
      poolFilterOptions,
      selectedProjectId,
      selectedProjectSessionId: typeof selectedProjectSessionId === 'string'
        ? selectedProjectSessionId.trim()
        : null,
    },
    actions: [
      createAction({
        id: 'open-review-console',
        enabled: totalProjects > 0,
        reasonCode: totalProjects > 0 ? null : 'NO_TRAINING_HISTORY',
        priority: 20,
      }),
      createAction({
        id: 'load-more-archive',
        enabled: reviewFacts.hasMoreProjects === true,
        reasonCode:
          reviewFacts.hasMoreProjects === true ? null : 'NO_MORE_TRAINING_HISTORY',
        priority: 40,
      }),
      createAction({
        id: 'delete-all-projects',
        enabled: totalProjects > 0,
        reasonCode: totalProjects > 0 ? null : 'NO_TRAINING_HISTORY',
        priority: 80,
      }),
      createAction({
        id: 'delete-selected-projects',
        enabled: totalProjects > 0,
        reasonCode: totalProjects > 0 ? null : 'NO_TRAINING_HISTORY',
        priority: 70,
      }),
    ],
    sections: [
      createSection({
        id: 'training-history',
        statusCode: totalProjects > 0 ? 'READY' : 'EMPTY',
        reasonCode: totalProjects > 0 ? null : 'NO_TRAINING_HISTORY',
        tone: totalProjects > 0 ? 'ready' : 'neutral',
        facts: {
          totalProjects,
          recentProjectCount: reviewFacts.recentProjectCount,
          hasMoreProjects: reviewFacts.hasMoreProjects,
          filteredProjectIds: filteredResult.projectIds,
          filteredProjectCount: filteredResult.projectIds.length,
          poolFilterOptions,
          selectedProjectId,
          selectedProjectSessionId: typeof selectedProjectSessionId === 'string'
            ? selectedProjectSessionId.trim()
            : null,
        },
      }),
    ],
  });
};

export const buildNotesModel = (
  deps: WorkspaceReadModelDependencies,
  query: NotesWorkspaceReadModelQuery = {},
): DesktopWorkspaceReadModel => {
  const notes = deps.listReplayNotes(NOTES_WORKSPACE_PAGE_LIMIT, undefined, {
    keyword: query.keyword,
    scope: query.scope,
    colorTokens: query.colorTokens,
  });
  const recent = deps.listRecentReplayNoteSummaries(5);
  const notesFacts = buildNotesWorkspaceFacts({
    notesPage: notes,
    recentNotes: recent,
  });
  const total = toCount(notesFacts.totalNotes);
  return createModel({
    deps,
    workspaceId: 'notes',
    statusCode: total > 0 ? 'READY' : 'EMPTY',
    reasonCode: total > 0 ? null : 'NO_REPLAY_NOTES',
    tone: total > 0 ? 'ready' : 'neutral',
    priority: total > 0 ? 20 : 60,
    facts: { ...notesFacts },
    actions: [
      createAction({
        id: 'create-note',
        enabled: toRecord(toRecord(notesFacts.cta).createNote).enabled === true,
        priority: 10,
      }),
      createAction({
        id: 'open-recent-note',
        enabled: toRecord(toRecord(notesFacts.cta).openRecentNote).enabled === true,
        reasonCode: toRecord(toRecord(notesFacts.cta).openRecentNote).reasonCode as
          | string
          | null,
        priority: 30,
      }),
    ],
    sections: [
      createSection({
        id: 'notes',
        statusCode: total > 0 ? 'READY' : 'EMPTY',
        reasonCode: total > 0 ? null : 'NO_REPLAY_NOTES',
        tone: total > 0 ? 'ready' : 'neutral',
        facts: { ...notesFacts },
      }),
    ],
  });
};
