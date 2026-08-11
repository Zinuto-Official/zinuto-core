// SPDX-License-Identifier: GPL-3.0-only

import type {
  DesktopWorkspaceId,
  DesktopWorkspaceReadModel,
} from '@zinuto/shared/contracts-desktop/api';

import {
  buildHistoryReviewModel,
  buildNotesModel,
  type HistoryReviewConsoleQuery,
  type NotesWorkspaceReadModelQuery,
} from '../workspaceReadModelHistory.js';
import { buildSettingsModel } from '../workspaceReadModelSettings.js';
import { buildChallengeStatsModel } from '../workspaceReadModelChallengeStats.js';
import type { WorkspaceReadModelDependencies } from '../workspaceReadModelPrimitives.js';

import {
  buildCommandCenterModel,
  buildCustomIndicatorModel,
  buildDataManagementModel,
  buildSpecialTrainingModel,
  buildStrategyBacktestModel,
  buildTrainerModel,
} from './workspaceModels.js';

export type WorkspaceReadModelBuildOptions = {
  notesQuery?: NotesWorkspaceReadModelQuery;
  historyQuery?: HistoryReviewConsoleQuery;
};

export type WorkspaceReadModelQueryKind = 'none' | 'notes' | 'history-review';

export type WorkspaceReadModelRegistryEntry = {
  id: DesktopWorkspaceId;
  path: `/workspaces/${string}`;
  queryKind: WorkspaceReadModelQueryKind;
  build: (
    deps: WorkspaceReadModelDependencies,
    options: WorkspaceReadModelBuildOptions,
  ) => Promise<DesktopWorkspaceReadModel> | DesktopWorkspaceReadModel;
};

export const WORKSPACE_READ_MODEL_REGISTRY = [
  {
    id: 'command-center',
    path: '/workspaces/command-center',
    queryKind: 'none',
    build: (deps) => buildCommandCenterModel(deps),
  },
  {
    id: 'trainer',
    path: '/workspaces/trainer',
    queryKind: 'none',
    build: (deps) => buildTrainerModel(deps),
  },
  {
    id: 'history-review-console',
    path: '/workspaces/history/review-console',
    queryKind: 'history-review',
    build: (deps, options) => buildHistoryReviewModel(deps, options.historyQuery),
  },
  {
    id: 'challenge-stats',
    path: '/workspaces/challenge-stats',
    queryKind: 'none',
    build: (deps) => buildChallengeStatsModel(deps),
  },
  {
    id: 'special-training',
    path: '/workspaces/special-training',
    queryKind: 'none',
    build: (deps) => buildSpecialTrainingModel(deps),
  },
  {
    id: 'data-management',
    path: '/workspaces/data-management',
    queryKind: 'none',
    build: (deps) => buildDataManagementModel(deps),
  },
  {
    id: 'notes',
    path: '/workspaces/notes',
    queryKind: 'notes',
    build: (deps, options) => buildNotesModel(deps, options.notesQuery),
  },
  {
    id: 'settings',
    path: '/workspaces/settings',
    queryKind: 'none',
    build: (deps) => buildSettingsModel(deps),
  },
  {
    id: 'custom-indicator',
    path: '/workspaces/custom-indicator',
    queryKind: 'none',
    build: (deps) => buildCustomIndicatorModel(deps),
  },
  {
    id: 'strategy-backtest',
    path: '/workspaces/strategy-backtest',
    queryKind: 'none',
    build: (deps) => buildStrategyBacktestModel(deps),
  },
] as const satisfies readonly WorkspaceReadModelRegistryEntry[];

export const WORKSPACE_READ_MODEL_IDS = WORKSPACE_READ_MODEL_REGISTRY.map(
  (entry) => entry.id,
) as readonly DesktopWorkspaceId[];

const workspaceIdSet = new Set<DesktopWorkspaceId>(WORKSPACE_READ_MODEL_IDS);

export const isDesktopWorkspaceReadModelId = (
  value: unknown,
): value is DesktopWorkspaceId =>
  workspaceIdSet.has(String(value ?? '') as DesktopWorkspaceId);

export const getWorkspaceReadModelRegistryEntry = (
  workspaceId: DesktopWorkspaceId,
): WorkspaceReadModelRegistryEntry | null =>
  WORKSPACE_READ_MODEL_REGISTRY.find((entry) => entry.id === workspaceId) ??
  null;
