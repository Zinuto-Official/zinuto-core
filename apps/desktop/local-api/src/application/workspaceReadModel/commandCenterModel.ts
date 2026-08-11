// SPDX-License-Identifier: GPL-3.0-only

import type {
  DesktopWorkspaceReadModel,
} from '@zinuto/shared/contracts-desktop/api';

import type {
  WorkspaceReadModelDependencies,
} from '../workspaceReadModelPrimitives.js';
import {
  createAction,
  createModel,
  createSection,
  toCount,
  toRecord,
} from '../workspaceReadModelPrimitives.js';


import {
  summarizeDataSources,
  dataSourceSection,
} from './dataSourceFacts.js';

const COMMAND_CENTER_RECENT_NOTE_LIMIT = 2;

const resolveCommandCenterDataSummary = (
  deps: WorkspaceReadModelDependencies,
  dataFacts: { sourceCount: number; symbolCount: number },
): {
  poolCount: number;
  symbolCount: number;
  localSourceCount: number;
  localSymbolCount: number;
  systemPoolCount: number;
  systemSymbolCount: number;
} => {
  const localSourceCount = toCount(dataFacts.sourceCount);
  const localSymbolCount = toCount(dataFacts.symbolCount);
  const systemDatasets = deps.listSystemSeedDatasets();
  const systemPoolCount = systemDatasets.filter(
    (dataset) => toCount(dataset.selectedSymbolCount) > 0,
  ).length;
  const systemSymbolCount = systemDatasets.reduce(
    (total, dataset) => total + toCount(dataset.selectedSymbolCount),
    0,
  );
  return {
    poolCount: localSourceCount + systemPoolCount,
    symbolCount: localSymbolCount + systemSymbolCount,
    localSourceCount,
    localSymbolCount,
    systemPoolCount,
    systemSymbolCount,
  };
};

export const buildCommandCenterModel = async (
  deps: WorkspaceReadModelDependencies,
): Promise<DesktopWorkspaceReadModel> => {
  const [
    dataFacts,
    trainingStatsSummary,
    fastTrainingStatsSummary,
    riskTrainingStatsSummary,
    recentReplayNotes,
    latestResumableSession,
  ] = await Promise.all([
    summarizeDataSources(deps),
    deps.getTrainingStatsSummary({}),
    deps.getSpecialTrainingStatsSummary({
      modeId: 'fast-decision-training',
      profitability: 'ALL',
      limit: 50,
    }),
    deps.getSpecialTrainingStatsSummary({
      modeId: 'risk-discipline-training',
      profitability: 'ALL',
      limit: 50,
    }),
    deps.listRecentReplayNoteSummaries(COMMAND_CENTER_RECENT_NOTE_LIMIT),
    deps.getLatestResumableSession(),
  ]);
  const trainingProjects = toCount(
    toRecord(toRecord(trainingStatsSummary).totals).totalProjects,
  );
  const fastChallengeProjects = toCount(
    toRecord(toRecord(fastTrainingStatsSummary).totals).totalProjects ??
      toRecord(toRecord(fastTrainingStatsSummary).totals).filteredProjects,
  );
  const riskChallengeProjects = toCount(
    toRecord(toRecord(riskTrainingStatsSummary).totals).totalProjects ??
      toRecord(toRecord(riskTrainingStatsSummary).totals).filteredProjects,
  );
  const challengeProjects = toCount(
    fastChallengeProjects + riskChallengeProjects,
  );
  const dataCenterSummary = resolveCommandCenterDataSummary(deps, dataFacts);
  const canStartTrainer =
    dataFacts.readySourceCount > 0 || dataCenterSummary.systemSymbolCount > 0;
  const canResumeTrainer =
    latestResumableSession !== null && latestResumableSession !== undefined;
  const hasActivity =
    canStartTrainer ||
    trainingProjects > 0 ||
    challengeProjects > 0 ||
    recentReplayNotes.length > 0 ||
    canResumeTrainer;
  return createModel({
    deps,
    workspaceId: 'command-center',
    statusCode: hasActivity ? 'READY' : 'EMPTY',
    reasonCode: hasActivity ? null : 'NO_WORKSPACE_ACTIVITY',
    tone: hasActivity ? 'ready' : 'neutral',
    priority: hasActivity ? 20 : 60,
    facts: {
      data: dataFacts,
      dataCenterSummary,
      trainingStatsSummary,
      challengeStatsSummary: fastTrainingStatsSummary,
      specialStatsSummariesByModeId: {
        'fast-decision-training': fastTrainingStatsSummary,
        'risk-discipline-training': riskTrainingStatsSummary,
      },
      recentReplayNotes,
      latestResumableSession,
      actionFacts: {
        startTrainer: {
          enabled: canStartTrainer,
          reasonCode: canStartTrainer ? null : 'NO_READY_DATA_SOURCE',
        },
        resumeTrainer: {
          enabled: canResumeTrainer,
          reasonCode: canResumeTrainer ? null : 'NO_RESUMABLE_SESSION',
          sessionId: String(
            toRecord(latestResumableSession).sessionId ?? '',
          ).trim() || null,
        },
      },
    },
    actions: [
      createAction({
        id: 'start-trainer',
        enabled: canStartTrainer,
        reasonCode: canStartTrainer ? null : 'NO_READY_DATA_SOURCE',
        priority: 10,
        facts: {
          readySourceCount: dataFacts.readySourceCount,
        },
      }),
      createAction({
        id: 'resume-trainer',
        enabled: canResumeTrainer,
        reasonCode: canResumeTrainer ? null : 'NO_RESUMABLE_SESSION',
        priority: 15,
        facts: {
          sessionId: String(
            toRecord(latestResumableSession).sessionId ?? '',
          ).trim() || null,
        },
      }),
      createAction({
        id: 'open-special-training',
        enabled: true,
        priority: 20,
      }),
      createAction({
        id: 'import-data',
        enabled: true,
        priority: 30,
      }),
    ],
    sections: [
      dataSourceSection(dataFacts),
      createSection({
        id: 'activity',
        statusCode: hasActivity ? 'READY' : 'EMPTY',
        reasonCode: hasActivity ? null : 'NO_WORKSPACE_ACTIVITY',
        tone: hasActivity ? 'ready' : 'neutral',
        facts: {
          trainingProjects,
          challengeProjects,
        },
      }),
    ],
  });
};
