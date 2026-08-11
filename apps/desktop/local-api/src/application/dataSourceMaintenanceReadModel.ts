// SPDX-License-Identifier: GPL-3.0-only

import type { LocalDataSourceSummary } from './dataSource/types.js';

export type DataSourceMaintenanceActionId =
  | 'clear-all'
  | 'sync-source'
  | 'remove-symbols'
  | 'remove-source'
  | 'rebind-folder'
  | 'import-data';

export type DataSourceMaintenanceAction = {
  id: DataSourceMaintenanceActionId;
  enabled: boolean;
  reasonCode: string | null;
  sourceId?: string;
};

export type DataSourceMaintenanceAvailability = {
  actions: DataSourceMaintenanceAction[];
  hasAnySource: boolean;
  hasReadySource: boolean;
  hasImportingSource: boolean;
  hasFailedSource: boolean;
  hasRebindRequiredSource: boolean;
  hasLockedSource: boolean;
};

const normalizeSourceId = (value: unknown): string =>
  String(value || '').trim();

const isSourceBusy = (source: LocalDataSourceSummary): boolean => {
  const status = String(source.status || '').trim().toUpperCase();
  return status === 'IMPORTING';
};

export const buildDataSourceMaintenanceAvailability = ({
  sources,
}: {
  sources: LocalDataSourceSummary[];
}): DataSourceMaintenanceAvailability => {
  const hasAnySource = sources.length > 0;
  const hasReadySource = sources.some(
    (s) =>
      String(s.status || '').trim().toUpperCase() === 'READY' &&
      !s.sourceLocked &&
      (s.symbolCount ?? 0) > 0 &&
      (s.barCount ?? 0) > 0,
  );
  const hasImportingSource = sources.some(
    (s) => String(s.status || '').trim().toUpperCase() === 'IMPORTING',
  );
  const hasFailedSource = sources.some(
    (s) => String(s.status || '').trim().toUpperCase() === 'FAILED',
  );
  const hasRebindRequiredSource = sources.some(
    (s) => s.requiresSourceFolderRebind === true,
  );
  const hasLockedSource = sources.some((s) => s.sourceLocked === true);

  const actions: DataSourceMaintenanceAction[] = [];

  // Clear all action
  actions.push({
    id: 'clear-all',
    enabled: hasAnySource,
    reasonCode: hasAnySource ? null : 'NO_DATA_SOURCE',
  });

  // Per-source actions
  for (const source of sources) {
    const sourceId = normalizeSourceId(source.id);
    if (!sourceId) continue;

    const sourceStatus = String(source.status || '').trim().toUpperCase();
    const isBusy = isSourceBusy(source);
    const isLocked = source.sourceLocked === true;
    const needsRebind = source.requiresSourceFolderRebind === true;
    const isReady =
      sourceStatus === 'READY' &&
      !isLocked &&
      (source.symbolCount ?? 0) > 0 &&
      (source.barCount ?? 0) > 0;

    // Sync source action
    actions.push({
      id: 'sync-source',
      enabled: isReady && !isBusy && !isLocked && !needsRebind,
      reasonCode: isLocked
        ? 'SOURCE_LOCKED'
        : needsRebind
          ? 'SOURCE_REBIND_REQUIRED'
          : isBusy
            ? 'SOURCE_BUSY'
            : !isReady
              ? 'SOURCE_NOT_READY'
              : null,
      sourceId,
    });

    // Remove symbols action
    actions.push({
      id: 'remove-symbols',
      enabled: isReady && !isBusy && !isLocked,
      reasonCode: isLocked
        ? 'SOURCE_LOCKED'
        : isBusy
          ? 'SOURCE_BUSY'
          : !isReady
            ? 'SOURCE_NOT_READY'
            : null,
      sourceId,
    });

    // Remove source action
    actions.push({
      id: 'remove-source',
      enabled: !isBusy,
      reasonCode: isBusy ? 'SOURCE_BUSY' : null,
      sourceId,
    });

    // Rebind folder action
    actions.push({
      id: 'rebind-folder',
      enabled: needsRebind && !isBusy,
      reasonCode: needsRebind
        ? isBusy
          ? 'SOURCE_BUSY'
          : null
        : 'NO_REBIND_REQUIRED',
      sourceId,
    });

    // Import data action
    actions.push({
      id: 'import-data',
      enabled: !isBusy && !isLocked,
      reasonCode: isLocked
        ? 'SOURCE_LOCKED'
        : isBusy
          ? 'SOURCE_BUSY'
          : null,
      sourceId,
    });
  }

  return {
    actions,
    hasAnySource,
    hasReadySource,
    hasImportingSource,
    hasFailedSource,
    hasRebindRequiredSource,
    hasLockedSource,
  };
};

export const isDataSourceMaintenanceActionEnabled = (
  availability: DataSourceMaintenanceAvailability,
  actionId: DataSourceMaintenanceActionId,
  sourceId?: string,
): boolean => {
  const normalizedSourceId = sourceId ? normalizeSourceId(sourceId) : undefined;
  const action = availability.actions.find(
    (a) =>
      a.id === actionId &&
      (normalizedSourceId === undefined
        ? a.sourceId === undefined
        : a.sourceId === normalizedSourceId),
  );
  return action?.enabled ?? false;
};

export const getDataSourceMaintenanceActionReasonCode = (
  availability: DataSourceMaintenanceAvailability,
  actionId: DataSourceMaintenanceActionId,
  sourceId?: string,
): string | null => {
  const normalizedSourceId = sourceId ? normalizeSourceId(sourceId) : undefined;
  const action = availability.actions.find(
    (a) =>
      a.id === actionId &&
      (normalizedSourceId === undefined
        ? a.sourceId === undefined
        : a.sourceId === normalizedSourceId),
  );
  return action?.reasonCode ?? null;
};
