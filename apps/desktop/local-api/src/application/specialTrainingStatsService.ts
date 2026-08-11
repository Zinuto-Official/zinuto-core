// SPDX-License-Identifier: GPL-3.0-only

import {
  SPECIAL_TRAINING_MODE_IDS,
  resolveSpecialTrainingStatsTag,
} from '@zinuto/shared/specialTrainingModes';
import { buildSpecialTrainingStatsReportPayload } from './specialTraining/statsReportBuilder.js';
import {
  countSpecialTrainingStatsProjectionRows,
  ensureSpecialTrainingStatsProjectionRowsForFilters,
  loadChallengeStatsProjectDetailById,
  loadSpecialTrainingStatsProjectionRows,
} from './ports/infrastructure/db/specialTraining/statsProjectionStore.js';
import {
  clearSpecialTrainingHistorySessions,
} from './ports/infrastructure/db/specialTraining/historyStore.js';
import { ensureReplayNoteContextArchivesForSpecialTrainingQuestions } from './replayNoteService.js';
import type { SpecialTrainingModeId } from '../domain/specialTraining/contracts.js';
import type {
  ChallengeStatsReport,
  ChallengeStatsProjectDetail,
  SpecialTrainingStatsModeAvailability,
  SpecialTrainingStatsFilters,
} from '../domain/specialTraining/statsContracts.js';

export type {
  ChallengeStatsProjectDetail,
  SpecialTrainingStatsFilters,
  SpecialTrainingStatsReportPayload,
} from '../domain/specialTraining/statsContracts.js';

type ClearSpecialTrainingHistoryPayload = {
  modeId?: SpecialTrainingModeId;
};

type ClearSpecialTrainingHistoryResult = {
  deletedSessionRows: number;
  deletedQuestionRows: number;
};

export type SpecialTrainingStatsSummaryPayload = Pick<
  ChallengeStatsReport,
  | 'generatedAt'
  | 'modeId'
  | 'totals'
  | 'overview'
  | 'dashboardInsights'
  | 'defaultModeId'
  | 'modeAvailability'
  | 'recentSessions'
>;

const SPECIAL_TRAINING_STATS_SUMMARY_LIMIT = 50;

const repairSpecialTrainingStatsProjectionForAllModes = (): void => {
  SPECIAL_TRAINING_MODE_IDS.forEach((modeId) => {
    ensureSpecialTrainingStatsProjectionRowsForFilters({
      modeId,
      profitability: 'ALL',
    });
  });
};

const buildSpecialTrainingModeAvailability = (): SpecialTrainingStatsModeAvailability => {
  return SPECIAL_TRAINING_MODE_IDS.reduce(
    (result, modeId) => {
      result[modeId] = {
        tag: resolveSpecialTrainingStatsTag(modeId),
        projectCount: countSpecialTrainingStatsProjectionRows({
          modeId,
          profitability: 'ALL',
        }),
      };
      return result;
    },
    {} as SpecialTrainingStatsModeAvailability,
  );
};

const resolveEffectiveSpecialTrainingStatsFilters = (
  filters: SpecialTrainingStatsFilters,
  modeAvailability: SpecialTrainingStatsModeAvailability,
): SpecialTrainingStatsFilters => {
  const effectiveModeId =
    modeAvailability[filters.modeId].projectCount > 0
      ? filters.modeId
      : SPECIAL_TRAINING_MODE_IDS.find(
          (modeId) => modeAvailability[modeId].projectCount > 0,
        ) ?? filters.modeId;
  return effectiveModeId === filters.modeId
    ? filters
    : {
        ...filters,
        modeId: effectiveModeId,
      };
};

export const getSpecialTrainingStatsReport = async (
  filters: SpecialTrainingStatsFilters,
): Promise<import('../domain/specialTraining/statsContracts.js').SpecialTrainingStatsReportPayload> => {
  repairSpecialTrainingStatsProjectionForAllModes();
  const modeAvailability = buildSpecialTrainingModeAvailability();
  const effectiveFilters = resolveEffectiveSpecialTrainingStatsFilters(
    filters,
    modeAvailability,
  );
  const projectionRows = loadSpecialTrainingStatsProjectionRows(effectiveFilters);
  const totalModeProjects = countSpecialTrainingStatsProjectionRows({
    modeId: effectiveFilters.modeId,
    profitability: 'ALL',
  });
  const totalFilteredProjects = countSpecialTrainingStatsProjectionRows(effectiveFilters);
  const normalizedDetailId = String(effectiveFilters.detailId ?? '').trim();
  const shouldIncludeProjectDetails =
    effectiveFilters.includeProjectDetails === true || normalizedDetailId.length > 0;
  const detailIds = shouldIncludeProjectDetails
    ? normalizedDetailId
      ? [normalizedDetailId]
      : projectionRows.map((row) => row.project_id)
    : [];
  const projectDetailsEntries = await Promise.all(
    detailIds.map(async (projectId) => {
      const detail = await loadChallengeStatsProjectDetailById(projectId);
      return detail ? ([projectId, detail] as const) : null;
    }),
  );
  const projectDetailsById = Object.fromEntries(
    projectDetailsEntries.filter(
      (
        entry,
      ): entry is [string, ChallengeStatsProjectDetail] => entry !== null,
    ),
  );

  return buildSpecialTrainingStatsReportPayload({
    filters: effectiveFilters,
    projectionRows,
    totalModeProjects,
    totalFilteredProjects,
    defaultModeId: effectiveFilters.modeId,
    modeAvailability,
    projectDetailsById,
  });
};

export const getSpecialTrainingStatsSummary = (
  filters: SpecialTrainingStatsFilters,
): SpecialTrainingStatsSummaryPayload => {
  repairSpecialTrainingStatsProjectionForAllModes();
  const modeAvailability = buildSpecialTrainingModeAvailability();
  const effectiveFilters = resolveEffectiveSpecialTrainingStatsFilters(
    {
      ...filters,
      limit: Math.min(
        SPECIAL_TRAINING_STATS_SUMMARY_LIMIT,
        Math.max(1, Math.floor(Number(filters.limit) || SPECIAL_TRAINING_STATS_SUMMARY_LIMIT)),
      ),
      includeProjectDetails: false,
      detailId: undefined,
    },
    modeAvailability,
  );
  const projectionRows = loadSpecialTrainingStatsProjectionRows(effectiveFilters);
  const totalModeProjects = countSpecialTrainingStatsProjectionRows({
    modeId: effectiveFilters.modeId,
    profitability: 'ALL',
  });
  const totalFilteredProjects = countSpecialTrainingStatsProjectionRows(effectiveFilters);
  const { report } = buildSpecialTrainingStatsReportPayload({
    filters: effectiveFilters,
    projectionRows,
    totalModeProjects,
    totalFilteredProjects,
    defaultModeId: effectiveFilters.modeId,
    modeAvailability,
    projectDetailsById: {},
  });
  return {
    generatedAt: report.generatedAt,
    modeId: report.modeId,
    totals: report.totals,
    overview: report.overview,
    dashboardInsights: report.dashboardInsights,
    defaultModeId: report.defaultModeId,
    modeAvailability: report.modeAvailability,
    recentSessions: report.recentSessions,
  };
};

export const clearSpecialTrainingHistory = async (
  options?: ClearSpecialTrainingHistoryPayload,
): Promise<ClearSpecialTrainingHistoryResult> => {
  await ensureReplayNoteContextArchivesForSpecialTrainingQuestions();
  const result = clearSpecialTrainingHistorySessions(options);
  return {
    deletedSessionRows: result.deletedSessionRows,
    deletedQuestionRows: result.deletedQuestionRows,
  };
};

export const getSpecialTrainingStatsProjectDetail = async (
  projectId: string,
): Promise<import('../domain/specialTraining/statsContracts.js').ChallengeStatsProjectDetail | null> =>
  loadChallengeStatsProjectDetailById(projectId);
