// SPDX-License-Identifier: GPL-3.0-only

import type { DataSourceSyncMode, DataSourceSyncMonitorEntry, DataSourceSyncMonitorStateById, DataSourceSyncPreference, DataSourceSyncPrefsById } from "@/domains/data-import/dataSourceTypes";
import type { ApiLocalDataImportSymbolLimit } from '@/api';

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

export const normalizeDataSourceSyncMode = (value: unknown): DataSourceSyncMode =>
  value === 'AUTO' || value === 'MANUAL' ? value : 'PROMPT';

export const normalizeDataSourceSyncPrefsById = (
  value: unknown,
): DataSourceSyncPrefsById => {
  const record = toRecord(value);
  if (!record) {
    return {};
  }
  const normalized: DataSourceSyncPrefsById = {};
  Object.entries(record).forEach(([rawSourceId, rawValue]) => {
    const sourceId = String(rawSourceId || '').trim();
    const entry = toRecord(rawValue);
    if (!sourceId || !entry) {
      return;
    }
    normalized[sourceId] = {
      mode: normalizeDataSourceSyncMode(entry.mode),
    };
  });
  return normalized;
};

export const getDataSourceSyncPreference = (
  sourceId: string,
  prefsById: DataSourceSyncPrefsById,
): DataSourceSyncPreference => ({
  mode: normalizeDataSourceSyncMode(
    prefsById[String(sourceId || '').trim()]?.mode,
  ),
});

export const createEmptyDataSourceSyncSymbolLimit =
  (): ApiLocalDataImportSymbolLimit => ({
    limitApplied: false,
    maxSymbols: null,
    selectedSymbols: [],
    skippedSymbols: [],
    skippedSymbolCount: 0,
    reason: null,
  });

export const createDefaultDataSourceSyncMonitorEntry = ({
  sourceId,
  mode = 'PROMPT',
}: {
  sourceId: string;
  mode?: DataSourceSyncMode;
}): DataSourceSyncMonitorEntry => ({
  sourceId: String(sourceId || '').trim(),
  status: 'IDLE',
  mode,
  quickCheckStatus: null,
  reasonCode: '',
  checkedAt: null,
  estimatedChangedFiles: 0,
  estimatedChangedSymbols: 0,
  missingSymbolsRetained: [],
  changedSymbols: [],
  invalidFiles: 0,
  symbolLimit: createEmptyDataSourceSyncSymbolLimit(),
  lastError: null,
  autoSyncArmed: false,
  operationProgress: null,
});

export const mergeDataSourceSyncMonitorEntry = (
  current: DataSourceSyncMonitorEntry | undefined,
  patch: Partial<DataSourceSyncMonitorEntry>,
): DataSourceSyncMonitorEntry => {
  const base = current ?? createDefaultDataSourceSyncMonitorEntry({
    sourceId: String(patch.sourceId || '').trim(),
    mode: normalizeDataSourceSyncMode(patch.mode),
  });
  return {
    ...base,
    ...patch,
    sourceId: String(patch.sourceId || base.sourceId || '').trim(),
    mode: normalizeDataSourceSyncMode(patch.mode ?? base.mode),
  };
};

export const sanitizeDataSourceSyncMonitorStateById = (
  value: DataSourceSyncMonitorStateById,
  sourceIds: string[],
  prefsById: DataSourceSyncPrefsById,
): DataSourceSyncMonitorStateById => {
  const allowedSourceIds = new Set(
    sourceIds.map((item) => String(item || '').trim()).filter(Boolean),
  );
  const next: DataSourceSyncMonitorStateById = {};
  Object.entries(value).forEach(([rawSourceId, entry]) => {
    const sourceId = String(rawSourceId || '').trim();
    if (!sourceId || !allowedSourceIds.has(sourceId)) {
      return;
    }
    next[sourceId] = mergeDataSourceSyncMonitorEntry(entry, {
      sourceId,
      mode: getDataSourceSyncPreference(sourceId, prefsById).mode,
    });
  });
  return next;
};
