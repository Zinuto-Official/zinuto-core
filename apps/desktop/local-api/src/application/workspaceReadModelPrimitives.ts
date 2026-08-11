// SPDX-License-Identifier: GPL-3.0-only

import type {
  DesktopWorkspaceId,
  DesktopWorkspaceReadModel,
  DesktopWorkspaceReadModelAction,
  DesktopWorkspaceReadModelSection,
  DesktopWorkspaceReadModelTone,
} from '@zinuto/shared/contracts-desktop/api';
import type { listLocalDataSources } from './dataSourceService.js';
import type { listTrainingProjects } from './historyService.js';
import type { getTrainingStatsSummary } from './trainingStatsService.js';
import type {
  getLatestResumableSession,
  listInstruments,
  getPortfolioSummary,
  getTradingSettings,
} from './trading/sessionService.js';
import type { getSpecialTrainingStatsSummary } from './specialTrainingStatsService.js';
import type { getSpecialTrainingStatsReport } from './specialTrainingStatsService.js';
import type { listSpecialTrainingBanksPage } from './specialTraining/banks.js';
import type {
  listRecentReplayNoteSummaries,
  listReplayNotes,
} from './replayNoteService.js';
import type { getAppPreferences } from './appPreferencesService.js';
import type {
  getHistoryRetentionPolicy,
  getLatestHistoryRetentionJob,
} from './historyRetentionService.js';
import type { getSystemStorageUsage } from './trading/resetService.js';
import type {
  getLatestSystemDevSimulationCleanupJob,
  getLatestSystemDevSimulationJob,
  getSystemDevSimulationCapabilities,
} from './systemDevSimulationService.js';
import type { listCustomIndicatorProfiles } from './customIndicatorService.js';
import type { listSystemSeedDatasets } from './ports/infrastructure/db/systemSeedBars.js';

export type JsonFacts = Record<string, unknown>;

export type DataSourceFacts = {
  sourceCount: number;
  readySourceCount: number;
  importingSourceCount: number;
  failedSourceCount: number;
  rebindRequiredSourceCount: number;
  lockedSourceCount: number;
  symbolCount: number;
  barCount: number;
  storageBytes: number;
};

export type WorkspaceReadModelDependencies = {
  nowIso: () => string;
  listLocalDataSources: typeof listLocalDataSources;
  listTrainingProjects: typeof listTrainingProjects;
  getTrainingStatsSummary: typeof getTrainingStatsSummary;
  getLatestResumableSession: typeof getLatestResumableSession;
  listInstruments: typeof listInstruments;
  getPortfolioSummary: typeof getPortfolioSummary;
  getTradingSettings: typeof getTradingSettings;
  listSpecialTrainingBanksPage: typeof listSpecialTrainingBanksPage;
  getSpecialTrainingStatsSummary: typeof getSpecialTrainingStatsSummary;
  getSpecialTrainingStatsReport: typeof getSpecialTrainingStatsReport;
  listReplayNotes: typeof listReplayNotes;
  listRecentReplayNoteSummaries: typeof listRecentReplayNoteSummaries;
  getAppPreferences: typeof getAppPreferences;
  getHistoryRetentionPolicy: typeof getHistoryRetentionPolicy;
  getLatestHistoryRetentionJob: typeof getLatestHistoryRetentionJob;
  getSystemStorageUsage: typeof getSystemStorageUsage;
  getSystemDevSimulationCapabilities: typeof getSystemDevSimulationCapabilities;
  getLatestSystemDevSimulationJob: typeof getLatestSystemDevSimulationJob;
  getLatestSystemDevSimulationCleanupJob: typeof getLatestSystemDevSimulationCleanupJob;
  listCustomIndicatorProfiles: typeof listCustomIndicatorProfiles;
  listSystemSeedDatasets: typeof listSystemSeedDatasets;
};

export const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const toArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

export const toCount = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
};

export const toReasonCode = (value: unknown, fallback: string): string => {
  if (value && typeof value === 'object') {
    const code = (value as { code?: unknown; errorCode?: unknown }).code ??
      (value as { errorCode?: unknown }).errorCode;
    const normalizedCode = String(code ?? '').trim();
    if (normalizedCode) {
      return normalizedCode;
    }
  }
  return fallback;
};

export const createAction = ({
  id,
  enabled,
  reasonCode = null,
  priority = 50,
  facts = {},
}: {
  id: string;
  enabled: boolean;
  reasonCode?: string | null;
  priority?: number;
  facts?: JsonFacts;
}): DesktopWorkspaceReadModelAction => ({
  id,
  enabled,
  reasonCode,
  priority,
  facts,
});

export const createSection = ({
  id,
  statusCode,
  reasonCode = null,
  tone,
  priority = 50,
  facts = {},
  actions = [],
}: {
  id: string;
  statusCode: string;
  reasonCode?: string | null;
  tone: DesktopWorkspaceReadModelTone;
  priority?: number;
  facts?: JsonFacts;
  actions?: DesktopWorkspaceReadModelAction[];
}): DesktopWorkspaceReadModelSection => ({
  id,
  statusCode,
  reasonCode,
  tone,
  priority,
  facts,
  actions,
});

export const createModel = ({
  deps,
  workspaceId,
  statusCode,
  reasonCode = null,
  tone,
  priority = 50,
  facts = {},
  actions = [],
  sections = [],
}: {
  deps: WorkspaceReadModelDependencies;
  workspaceId: DesktopWorkspaceId;
  statusCode: string;
  reasonCode?: string | null;
  tone: DesktopWorkspaceReadModelTone;
  priority?: number;
  facts?: JsonFacts;
  actions?: DesktopWorkspaceReadModelAction[];
  sections?: DesktopWorkspaceReadModelSection[];
}): DesktopWorkspaceReadModel => ({
  workspaceId,
  generatedAt: deps.nowIso(),
  statusCode,
  reasonCode,
  tone,
  priority,
  facts,
  actions,
  sections,
});

export const createErrorModel = (
  workspaceId: DesktopWorkspaceId,
  error: unknown,
  deps: WorkspaceReadModelDependencies,
): DesktopWorkspaceReadModel =>
  createModel({
    deps,
    workspaceId,
    statusCode: 'ERROR',
    reasonCode: toReasonCode(error, 'WORKSPACE_READ_MODEL_FAILED'),
    tone: 'danger',
    priority: 100,
    facts: {},
    actions: [],
    sections: [
      createSection({
        id: 'runtime',
        statusCode: 'ERROR',
        reasonCode: toReasonCode(error, 'WORKSPACE_READ_MODEL_FAILED'),
        tone: 'danger',
        priority: 100,
      }),
    ],
  });
