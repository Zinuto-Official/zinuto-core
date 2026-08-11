// SPDX-License-Identifier: GPL-3.0-only

import { toArray, toCount, toRecord } from './workspaceReadModelPrimitives.js';

type ProjectDateRangeFacts = {
  statusCode: 'READY' | 'EMPTY';
  reasonCode: string | null;
  rawRange: string;
  startDate: string | null;
  endDate: string | null;
};

const normalizeNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeNonNegativeNumber = (value: unknown, fallback = 0): number =>
  Math.max(0, normalizeNumber(value, fallback));

const normalizeOptionalText = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
};

const resolveFirstFiniteNumber = (...values: unknown[]): number => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
};

const resolveDateRangeFacts = (value: unknown): ProjectDateRangeFacts => {
  const rawRange = typeof value === 'string' ? value.trim() : '';
  if (!rawRange || rawRange === '~' || rawRange === '- ~ -') {
    return {
      statusCode: 'EMPTY',
      reasonCode: 'TRAINING_DATE_RANGE_EMPTY',
      rawRange,
      startDate: null,
      endDate: null,
    };
  }
  const normalized = rawRange.replace(/\s+/g, ' ');
  const [left = '', right = ''] = normalized
    .split('~')
    .map((part) => part.trim());
  const startDate = left || null;
  const endDate = right || null;
  if (!startDate && !endDate) {
    return {
      statusCode: 'EMPTY',
      reasonCode: 'TRAINING_DATE_RANGE_EMPTY',
      rawRange,
      startDate: null,
      endDate: null,
    };
  }
  return {
    statusCode: 'READY',
    reasonCode: null,
    rawRange,
    startDate,
    endDate,
  };
};

export const buildReplayNoteCountsByTrainingProjectId = (
  notesPage: unknown,
): {
  countByProjectId: Map<string, number>;
  totalNoteCount: number;
  scannedNoteCount: number;
  coverageStatusCode: 'COMPLETE' | 'WINDOWED';
} => {
  const page = toRecord(notesPage);
  const noteItems = toArray(page.items);
  const totalNoteCount = toCount(page.total);
  const countByProjectId = new Map<string, number>();
  noteItems.forEach((note) => {
    const row = toRecord(note);
    const noteType = String(row.type ?? '').trim().toUpperCase();
    if (noteType !== 'FREE_REPLAY' && noteType !== 'CHALLENGE') {
      return;
    }
    const projectId = normalizeOptionalText(row.trainingProjectId);
    if (!projectId) {
      return;
    }
    countByProjectId.set(projectId, (countByProjectId.get(projectId) ?? 0) + 1);
  });
  return {
    countByProjectId,
    totalNoteCount,
    scannedNoteCount: noteItems.length,
    coverageStatusCode: totalNoteCount <= noteItems.length ? 'COMPLETE' : 'WINDOWED',
  };
};

export const buildHistoryReviewProjectFacts = (
  project: unknown,
  replayNoteCount: number,
) => {
  const row = toRecord(project);
  const summary = toRecord(row.summary);
  const initialCapital = normalizeNonNegativeNumber(
    resolveFirstFiniteNumber(row.initialTotal, summary.initialAsset),
  );
  const totalPnl = resolveFirstFiniteNumber(summary.totalPnl, row.totalPnl);
  const finalEquity = resolveFirstFiniteNumber(
    row.finalEquity,
    summary.endingAsset,
    initialCapital + totalPnl,
  );
  const equityReturnRate = resolveFirstFiniteNumber(
    row.equityReturnRate,
    summary.assetReturnRate,
    initialCapital > 0 ? (finalEquity - initialCapital) / initialCapital : 0,
  );
  const drawdownRate = normalizeNonNegativeNumber(summary.maxDrawdownRate);
  const drawdownAmount = normalizeNonNegativeNumber(
    Math.abs(normalizeNumber(summary.maxDrawdownAmount)),
  );
  return {
    id: row.id,
    replayNoteCount,
    replayNoteCountStatusCode: replayNoteCount > 0 ? 'READY' : 'EMPTY',
    compactStats: {
      initialCapital,
      finalEquity,
      equityReturnRate,
      drawdownRate,
      drawdownAmount,
      dateRange: resolveDateRangeFacts(row.trainingDateRange),
    },
  };
};

export const buildHistoryReviewFacts = ({
  projectsPage,
  statsSummary,
  notesPage,
}: {
  projectsPage: unknown;
  statsSummary: unknown;
  notesPage: unknown;
}) => {
  const projects = toArray(toRecord(projectsPage).items);
  const noteCounts = buildReplayNoteCountsByTrainingProjectId(notesPage);
  const projectFactsById: Record<string, ReturnType<typeof buildHistoryReviewProjectFacts>> = {};
  projects.forEach((project) => {
    const id = String(toRecord(project).id ?? '').trim();
    if (!id) {
      return;
    }
    projectFactsById[id] = buildHistoryReviewProjectFacts(
      project,
      noteCounts.countByProjectId.get(id) ?? 0,
    );
  });
  const totalProjects =
    toCount(toRecord(toRecord(statsSummary).totals).totalProjects) ||
    projects.length;
  return {
    totalProjects,
    recentProjectCount: projects.length,
    hasMoreProjects: Boolean(toRecord(projectsPage).nextCursor),
    nextCursor: toRecord(projectsPage).nextCursor ?? null,
    statsSummary,
    projectFactsById,
    replayNoteCountCoverage: {
      statusCode: noteCounts.coverageStatusCode,
      totalNoteCount: noteCounts.totalNoteCount,
      scannedNoteCount: noteCounts.scannedNoteCount,
    },
  };
};

export const buildNotesWorkspaceFacts = ({
  notesPage,
  recentNotes,
}: {
  notesPage: unknown;
  recentNotes: unknown;
}) => {
  const page = toRecord(notesPage);
  const totalNotes = toCount(page.total);
  const loadedNoteCount = toArray(page.items).length;
  const hasMore = Boolean(page.nextCursor);
  const statusCode = totalNotes > 0 ? 'READY' : 'EMPTY';
  const reasonCode = totalNotes > 0 ? null : 'NO_REPLAY_NOTES';
  return {
    totalNotes,
    loadedNoteCount,
    recentCount: toArray(recentNotes).length,
    recentNotes,
    hasMore,
    nextCursor: page.nextCursor ?? null,
    statusCode,
    reasonCode,
    emptyState: {
      statusCode,
      reasonCode,
    },
    cta: {
      createNote: {
        enabled: true,
        reasonCode: null,
      },
      openRecentNote: {
        enabled: totalNotes > 0,
        reasonCode,
      },
      loadMore: {
        enabled: hasMore,
        reasonCode: hasMore ? null : 'NO_MORE_REPLAY_NOTES',
      },
    },
  };
};

export type HistoryReviewProjectRow = {
  id?: unknown;
  name?: unknown;
  symbol?: unknown;
  samplePoolId?: unknown;
  samplePoolName?: unknown;
  trainingDateRange?: unknown;
  totalPnl?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  replay?: {
    snapshot?: {
      session?: {
        id?: unknown;
      };
    };
  };
};

const normalizeText = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const parseTimestampMs = (value: unknown): number => {
  const text = normalizeText(value).trim();
  if (!text) return Number.NaN;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

export const buildHistoryPoolFilterOptions = ({
  projects,
  samplePoolAllId,
  samplePoolUnknownId,
}: {
  projects: HistoryReviewProjectRow[];
  samplePoolAllId: string;
  samplePoolUnknownId: string;
}): Array<{ id: string; name: string }> => {
  const map = new Map<string, string>();
  for (const project of projects) {
    const row = toRecord(project);
    const rawPoolId = normalizeOptionalText(row.samplePoolId) ?? '';
    const poolId = rawPoolId.trim() || samplePoolUnknownId;
    if (poolId === samplePoolAllId) continue;
    if (!map.has(poolId)) {
      const poolName = normalizeOptionalText(row.samplePoolName) ?? poolId;
      map.set(poolId, poolName);
    }
  }
  return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
};

export const buildHistoryReviewFilteredProjects = ({
  projects,
  keyword,
  profitFilter,
  samplePoolFilter,
  samplePoolAllId,
  samplePoolUnknownId,
}: {
  projects: HistoryReviewProjectRow[];
  keyword: string;
  profitFilter: 'ALL' | 'PROFIT' | 'LOSS';
  samplePoolFilter: string;
  samplePoolAllId: string;
  samplePoolUnknownId: string;
}): { projectIds: string[] } => {
  const upperKeyword = keyword.trim().toUpperCase();

  const filtered = projects.filter((project) => {
    const row = toRecord(project);
    const projectId = normalizeOptionalText(row.id);
    if (!projectId) return false;

    const projectPoolId = (normalizeOptionalText(row.samplePoolId) || samplePoolUnknownId).trim() || samplePoolUnknownId;
    if (samplePoolFilter && samplePoolFilter !== samplePoolAllId && projectPoolId !== samplePoolFilter) {
      return false;
    }

    const pnl = Number(row.totalPnl) || 0;
    if (profitFilter === 'PROFIT' && pnl <= 0) return false;
    if (profitFilter === 'LOSS' && pnl >= 0) return false;

    if (upperKeyword) {
      const name = normalizeText(row.name).toUpperCase();
      const symbol = normalizeText(row.symbol).toUpperCase();
      const range = normalizeText(row.trainingDateRange).toUpperCase();
      if (!name.includes(upperKeyword) && !symbol.includes(upperKeyword) && !range.includes(upperKeyword)) {
        return false;
      }
    }

    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const rowA = toRecord(a);
    const rowB = toRecord(b);
    const leftEndTime = parseTimestampMs(rowA.createdAt);
    const rightEndTime = parseTimestampMs(rowB.createdAt);
    if (Number.isFinite(rightEndTime) && Number.isFinite(leftEndTime) && rightEndTime !== leftEndTime) {
      return rightEndTime - leftEndTime;
    }
    if (Number.isFinite(rightEndTime) && !Number.isFinite(leftEndTime)) return 1;
    if (!Number.isFinite(rightEndTime) && Number.isFinite(leftEndTime)) return -1;

    const leftUpdatedTime = parseTimestampMs(rowA.updatedAt);
    const rightUpdatedTime = parseTimestampMs(rowB.updatedAt);
    if (Number.isFinite(rightUpdatedTime) && Number.isFinite(leftUpdatedTime) && rightUpdatedTime !== leftUpdatedTime) {
      return rightUpdatedTime - leftUpdatedTime;
    }
    if (Number.isFinite(rightUpdatedTime) && !Number.isFinite(leftUpdatedTime)) return 1;
    if (!Number.isFinite(rightUpdatedTime) && Number.isFinite(leftUpdatedTime)) return -1;

    const idA = normalizeOptionalText(rowA.id) ?? '';
    const idB = normalizeOptionalText(rowB.id) ?? '';
    return idB.localeCompare(idA);
  });

  return {
    projectIds: sorted.map((p) => normalizeOptionalText(toRecord(p).id) ?? '').filter(Boolean),
  };
};
