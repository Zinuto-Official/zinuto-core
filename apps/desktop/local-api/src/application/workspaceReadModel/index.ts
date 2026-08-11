// SPDX-License-Identifier: GPL-3.0-only

import type {
  DesktopWorkspaceId,
  DesktopWorkspaceReadModel,
} from '@zinuto/shared/contracts-desktop/api';

import { nowIso } from '../../kernel/time.js';
import { listLocalDataSources } from '../dataSourceService.js';
import { listTrainingProjects } from '../historyService.js';
import { getTrainingStatsSummary } from '../trainingStatsService.js';
import {
  getLatestResumableSession,
  listInstruments,
  getPortfolioSummary,
  getTradingSettings,
} from '../trading/sessionService.js';
import { getSpecialTrainingStatsSummary } from '../specialTrainingStatsService.js';
import { getSpecialTrainingStatsReport } from '../specialTrainingStatsService.js';
import { listSpecialTrainingBanksPage } from '../specialTraining/banks.js';
import { listRecentReplayNoteSummaries, listReplayNotes } from '../replayNoteService.js';
import { getAppPreferences } from '../appPreferencesService.js';
import {
  getHistoryRetentionPolicy,
  getLatestHistoryRetentionJob,
} from '../historyRetentionService.js';
import { getWorkspaceSystemStorageUsage } from '../systemStorageService.js';
import {
  getLatestSystemDevSimulationCleanupJob,
  getLatestSystemDevSimulationJob,
  getSystemDevSimulationCapabilities,
} from '../systemDevSimulationService.js';
import { listCustomIndicatorProfiles } from '../customIndicatorService.js';
import { listSystemSeedDatasets } from '../ports/infrastructure/db/systemSeedBars.js';
import {
  createErrorModel,
  type WorkspaceReadModelDependencies,
} from '../workspaceReadModelPrimitives.js';

import {
  getWorkspaceReadModelRegistryEntry,
  type WorkspaceReadModelBuildOptions,
} from './registry.js';

export {
  WORKSPACE_READ_MODEL_IDS,
  WORKSPACE_READ_MODEL_REGISTRY,
  getWorkspaceReadModelRegistryEntry,
  isDesktopWorkspaceReadModelId,
  type WorkspaceReadModelBuildOptions,
  type WorkspaceReadModelRegistryEntry,
} from './registry.js';

export type { WorkspaceReadModelDependencies } from '../workspaceReadModelPrimitives.js';

const defaultWorkspaceReadModelDependencies: WorkspaceReadModelDependencies = {
  nowIso,
  listLocalDataSources,
  listTrainingProjects,
  getTrainingStatsSummary,
  getLatestResumableSession,
  listInstruments,
  getPortfolioSummary,
  getTradingSettings,
  listSpecialTrainingBanksPage,
  getSpecialTrainingStatsSummary,
  getSpecialTrainingStatsReport,
  listReplayNotes,
  listRecentReplayNoteSummaries,
  getAppPreferences,
  getHistoryRetentionPolicy,
  getLatestHistoryRetentionJob,
  getSystemStorageUsage: getWorkspaceSystemStorageUsage,
  getSystemDevSimulationCapabilities,
  getLatestSystemDevSimulationJob,
  getLatestSystemDevSimulationCleanupJob,
  listCustomIndicatorProfiles,
  listSystemSeedDatasets,
};

export const buildWorkspaceReadModel = async (
  workspaceId: DesktopWorkspaceId,
  deps: WorkspaceReadModelDependencies = defaultWorkspaceReadModelDependencies,
  options: WorkspaceReadModelBuildOptions = {},
): Promise<DesktopWorkspaceReadModel> => {
  try {
    const registryEntry = getWorkspaceReadModelRegistryEntry(workspaceId);
    if (!registryEntry) {
      return createErrorModel(
        workspaceId,
        new Error('Unknown workspace read model'),
        deps,
      );
    }
    return await registryEntry.build(deps, options);
  } catch (error) {
    return createErrorModel(workspaceId, error, deps);
  }
};
