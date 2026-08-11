// SPDX-License-Identifier: GPL-3.0-only

import type {
  DesktopWorkspaceReadModelTone,
} from '@zinuto/shared/contracts-desktop/api';

import type {
  DataSourceFacts,
  WorkspaceReadModelDependencies,
} from '../workspaceReadModelPrimitives.js';
import {
  createAction,
  createSection,
  toCount,
  toRecord,
} from '../workspaceReadModelPrimitives.js';

export type DataSourceStatusFact = {
  sourceId: string;
  statusCode: string;
  reasonCode: string | null;
  tone: DesktopWorkspaceReadModelTone;
  priority: number;
  summaryFilter: 'ALL' | 'DIRTY' | 'ERROR' | 'SYNCING';
  primaryActionId:
    | 'view-details'
    | 'retry-import'
    | 'rebind-folder'
    | 'import-data';
  primaryActionEnabled: boolean;
  primaryActionReasonCode: string | null;
  sourceStatus: string;
  sourceLocked: boolean;
  requiresSourceFolderRebind: boolean;
  symbolCount: number;
  barCount: number;
  storageBytes: number;
  lastJobStatus: string | null;
};

export type DataSourceReadModelFacts = DataSourceFacts & {
  sourceStatusById: Record<string, DataSourceStatusFact>;
};

export const resolveDataSourceStatusFact = (
  row: Record<string, unknown>,
): DataSourceStatusFact | null => {
  const sourceId = String(row.id ?? '').trim();
  if (!sourceId) {
    return null;
  }
  const sourceStatus = String(row.status ?? '').trim().toUpperCase();
  const sourceLocked = row.sourceLocked === true;
  const requiresSourceFolderRebind = row.requiresSourceFolderRebind === true;
  const symbolCount = toCount(row.symbolCount);
  const barCount = toCount(row.barCount);
  const storageBytes = toCount(row.storageBytes);
  const lastJobStatus = String(toRecord(row.lastJob).status ?? '').trim() || null;

  if (sourceLocked) {
    return {
      sourceId,
      statusCode: 'READ_ONLY',
      reasonCode: String(row.lockReason ?? '').trim() || 'LOCAL_DATA_SOURCE_LOCKED',
      tone: 'neutral',
      priority: 60,
      summaryFilter: 'ALL',
      primaryActionId: 'view-details',
      primaryActionEnabled: true,
      primaryActionReasonCode: null,
      sourceStatus,
      sourceLocked,
      requiresSourceFolderRebind,
      symbolCount,
      barCount,
      storageBytes,
      lastJobStatus,
    };
  }

  if (requiresSourceFolderRebind) {
    return {
      sourceId,
      statusCode: 'REBIND_REQUIRED',
      reasonCode: 'LOCAL_DATA_SOURCE_FOLDER_REBIND_REQUIRED',
      tone: 'warning',
      priority: 10,
      summaryFilter: 'DIRTY',
      primaryActionId: 'rebind-folder',
      primaryActionEnabled: true,
      primaryActionReasonCode: null,
      sourceStatus,
      sourceLocked,
      requiresSourceFolderRebind,
      symbolCount,
      barCount,
      storageBytes,
      lastJobStatus,
    };
  }

  if (sourceStatus === 'FAILED') {
    return {
      sourceId,
      statusCode: 'FAILED',
      reasonCode: 'LOCAL_DATA_SOURCE_IMPORT_FAILED',
      tone: 'danger',
      priority: 0,
      summaryFilter: 'ERROR',
      primaryActionId: 'retry-import',
      primaryActionEnabled: true,
      primaryActionReasonCode: null,
      sourceStatus,
      sourceLocked,
      requiresSourceFolderRebind,
      symbolCount,
      barCount,
      storageBytes,
      lastJobStatus,
    };
  }

  if (sourceStatus === 'IMPORTING') {
    return {
      sourceId,
      statusCode: 'IMPORTING',
      reasonCode: 'LOCAL_DATA_SOURCE_IMPORTING',
      tone: 'loading',
      priority: 20,
      summaryFilter: 'SYNCING',
      primaryActionId: 'view-details',
      primaryActionEnabled: true,
      primaryActionReasonCode: null,
      sourceStatus,
      sourceLocked,
      requiresSourceFolderRebind,
      symbolCount,
      barCount,
      storageBytes,
      lastJobStatus,
    };
  }

  if (sourceStatus === 'READY' && symbolCount > 0 && barCount > 0) {
    return {
      sourceId,
      statusCode: 'READY',
      reasonCode: null,
      tone: 'ready',
      priority: 50,
      summaryFilter: 'ALL',
      primaryActionId: 'view-details',
      primaryActionEnabled: true,
      primaryActionReasonCode: null,
      sourceStatus,
      sourceLocked,
      requiresSourceFolderRebind,
      symbolCount,
      barCount,
      storageBytes,
      lastJobStatus,
    };
  }

  return {
    sourceId,
    statusCode: 'EMPTY',
    reasonCode: 'LOCAL_DATA_SOURCE_EMPTY',
    tone: 'warning',
    priority: 40,
    summaryFilter: 'ALL',
    primaryActionId: 'import-data',
    primaryActionEnabled: true,
    primaryActionReasonCode: null,
    sourceStatus,
    sourceLocked,
    requiresSourceFolderRebind,
    symbolCount,
    barCount,
    storageBytes,
    lastJobStatus,
  };
};

export const summarizeDataSourceRows = (
  sources: readonly unknown[],
): DataSourceReadModelFacts =>
  sources.reduce<DataSourceReadModelFacts>(
    (summary, source) => {
      const row = toRecord(source);
      const status = String(row.status ?? '').trim().toUpperCase();
      const sourceLocked = row.sourceLocked === true;
      const requiresSourceFolderRebind = row.requiresSourceFolderRebind === true;
      const symbolCount = toCount(row.symbolCount);
      const barCount = toCount(row.barCount);
      summary.sourceCount += 1;
      summary.symbolCount += symbolCount;
      summary.barCount += barCount;
      summary.storageBytes += toCount(row.storageBytes);
      if (status === 'READY' && !sourceLocked && symbolCount > 0 && barCount > 0) {
        summary.readySourceCount += 1;
      }
      if (status === 'IMPORTING') {
        summary.importingSourceCount += 1;
      }
      if (status === 'FAILED') {
        summary.failedSourceCount += 1;
      }
      if (requiresSourceFolderRebind) {
        summary.rebindRequiredSourceCount += 1;
      }
      if (sourceLocked) {
        summary.lockedSourceCount += 1;
      }
      const sourceStatusFact = resolveDataSourceStatusFact(row);
      if (sourceStatusFact) {
        summary.sourceStatusById[sourceStatusFact.sourceId] = sourceStatusFact;
      }
      return summary;
    },
    {
      sourceCount: 0,
      readySourceCount: 0,
      importingSourceCount: 0,
      failedSourceCount: 0,
      rebindRequiredSourceCount: 0,
      lockedSourceCount: 0,
      symbolCount: 0,
      barCount: 0,
      storageBytes: 0,
      sourceStatusById: {},
    },
  );

export const summarizeDataSources = async (
  deps: WorkspaceReadModelDependencies,
): Promise<DataSourceReadModelFacts> =>
  summarizeDataSourceRows(await deps.listLocalDataSources());

export const resolveDataReadiness = (
  facts: DataSourceFacts,
): {
  statusCode: string;
  reasonCode: string | null;
  tone: DesktopWorkspaceReadModelTone;
} => {
  if (facts.readySourceCount > 0) {
    if (
      facts.failedSourceCount > 0 ||
      facts.rebindRequiredSourceCount > 0 ||
      facts.lockedSourceCount > 0
    ) {
      return {
        statusCode: 'READY_WITH_ATTENTION',
        reasonCode: 'DATA_SOURCE_ATTENTION_REQUIRED',
        tone: 'warning',
      };
    }
    return { statusCode: 'READY', reasonCode: null, tone: 'ready' };
  }
  if (facts.sourceCount > 0) {
    return {
      statusCode: 'BLOCKED',
      reasonCode: 'NO_READY_DATA_SOURCE',
      tone: 'warning',
    };
  }
  return {
    statusCode: 'EMPTY',
    reasonCode: 'NO_DATA_SOURCE',
    tone: 'neutral',
  };
};

export const dataSourceSection = (facts: DataSourceFacts) => {
  const readiness = resolveDataReadiness(facts);
  return createSection({
    id: 'data-sources',
    statusCode: readiness.statusCode,
    reasonCode: readiness.reasonCode,
    tone: readiness.tone,
    priority: readiness.statusCode === 'READY' ? 20 : 90,
    facts,
    actions: [
      createAction({
        id: 'import-data',
        enabled: true,
        priority: 20,
      }),
      createAction({
        id: 'repair-data-source',
        enabled:
          facts.failedSourceCount > 0 ||
          facts.rebindRequiredSourceCount > 0 ||
          facts.lockedSourceCount > 0,
        reasonCode:
          facts.failedSourceCount > 0 ||
          facts.rebindRequiredSourceCount > 0 ||
          facts.lockedSourceCount > 0
            ? null
            : 'NO_DATA_SOURCE_REPAIR_REQUIRED',
        priority: 70,
      }),
    ],
  });
};
