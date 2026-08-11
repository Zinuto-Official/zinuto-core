// SPDX-License-Identifier: GPL-3.0-only

import type { CsvFieldMapping } from '../../domain/dataSource/csvFieldMappingTypes.js';
import type {
  LocalDataSourceDiagnosticProfile,
  LocalDataSourceInstrumentSummary,
  LocalDataImportJobStage,
  LocalDataImportJobStatus,
  LocalDataImportScopeStrategy,
  LocalDataSourceStatus,
  LocalDataSourceSummary
} from './types.js';
import {
  LOCAL_DATA_SOURCE_FAILED_LOCK_REASON,
  LOCAL_DATA_SOURCE_IMPORTING_LOCK_REASON,
  LOCAL_DATA_SOURCE_MUTATION_LOCK_REASON,
} from './types.js';
import { normalizeTimeZone, normalizeTimeZoneOrigin } from '@zinuto/shared/timezone';
import { parseStoredTradingCalendarConfig } from '@zinuto/shared/tradingCalendar';
import { normalizeLocalDataSourceDiagnosticProfile } from './diagnosticProfile.js';

export type SourceListRow = {
  id: string;
  name: string;
  sourceFolder: string;
  sourceFolderBookmarkId: string | null;
  importScopeStrategy: LocalDataImportScopeStrategy | null;
  importScopeTopLevelSubfolder: string | null;
  timeZone: string | null;
  timeZoneOrigin: string | null;
  baseTimeframe: '1m' | '5m' | '1h' | '1d';
  diagnosticAssetClass: string | null;
  diagnosticMarketPresetId: string | null;
  diagnosticProfileOrigin: string | null;
  fieldMappingJson: string | null;
  tradingCalendarJson: string | null;
  status: LocalDataSourceStatus;
  deletionState?: 'IDLE' | 'DELETING' | 'MUTATING_SYMBOLS';
  symbolCount: number;
  barCount: number;
  storageBytes: number | null;
  timeStartTs: string | null;
  timeEndTs: string | null;
  totalFiles: number;
  importedFiles: number;
  failedFiles: number;
  createdAt: string;
  updatedAt: string;
  lastJobId: string | null;
  lastJobStatus: LocalDataImportJobStatus | null;
  lastJobStage: LocalDataImportJobStage | null;
  lastJobProgressPercent: number | null;
  lastJobCompactProgressPercent: number | null;
  lastJobCompactBeforeBytes: number | null;
  lastJobCompactAfterBytes: number | null;
  lastJobCompactReclaimedBytes: number | null;
  lastJobDoneFiles: number | null;
  lastJobTotalFiles: number | null;
  lastJobErrorFiles: number | null;
  lastJobStartedAt: string | null;
  lastJobFinishedAt: string | null;
};

type SourceQueryDeps = {
  listSourcesRows: () => SourceListRow[];
  listLatestSourceFileRows: () => Array<{
    sourceId: string;
    instrumentId?: string | null;
    symbol: string;
    fileName?: string | null;
    filePath?: string | null;
    status: 'QUEUED' | 'IMPORTING' | 'IMPORTED' | 'FAILED';
    rowsImported: number;
  }>;
  listAllImportedSourceInstruments: () => Array<{
    sourceId: string;
    instrumentId: string;
    symbol: string;
    baseTimeframe: '1m' | '5m' | '1h' | '1d';
    barCount: number;
    timeStartTs: string | null;
    timeEndTs: string | null;
    sourceIdForInstrument: string | null;
    sourceName: string | null;
  }>;
  parseStoredFieldMappingJson: (raw: string | null) => CsvFieldMapping;
  normalizeProgressPercent: (value: number) => number;
  normalizeCompactProgressPercent: (value: number) => number;
  normalizeCount: (value: unknown) => number;
  toSafeStorageBytes: (value: unknown) => number;
};

type SourceEffectiveSummary = {
  barCount: number;
  timeStartTs: string | null;
  timeEndTs: string | null;
};

export const listLocalDataSourcesCore = (deps: SourceQueryDeps): LocalDataSourceSummary[] => {
  const rows = deps.listSourcesRows();
  const sourceFileStatsById = new Map<
    string,
    { totalFiles: number; importedFiles: number; failedFiles: number }
  >();
  deps.listLatestSourceFileRows().forEach((row) => {
    const sourceId = String(row.sourceId ?? '').trim();
    if (!sourceId) {
      return;
    }
    const current = sourceFileStatsById.get(sourceId) ?? {
      totalFiles: 0,
      importedFiles: 0,
      failedFiles: 0
    };
    current.totalFiles += 1;
    if (row.status === 'IMPORTED') {
      current.importedFiles += 1;
    } else if (row.status === 'FAILED') {
      current.failedFiles += 1;
    }
    sourceFileStatsById.set(sourceId, current);
  });

  const importedInstrumentRows = deps.listAllImportedSourceInstruments();
  const sourceInstrumentsMap = new Map<string, LocalDataSourceInstrumentSummary[]>();
  const sourceSymbolsSortedMap = new Map<string, string[]>();
  const uniqueLocalInstrumentRows = new Map<
    string,
    { barCount: number; timeStartTs: string | null; timeEndTs: string | null }
  >();
  importedInstrumentRows.forEach((row) => {
    const sourceId = String(row.sourceId ?? '').trim();
    const instrumentId = String(row.instrumentId ?? '').trim();
    const symbol = String(row.symbol ?? '').trim().toUpperCase();
    if (!sourceId || !instrumentId || !symbol) {
      return;
    }
    if (!uniqueLocalInstrumentRows.has(instrumentId)) {
      uniqueLocalInstrumentRows.set(instrumentId, {
        barCount: Math.max(0, Math.floor(Number(row.barCount ?? 0))),
        timeStartTs: row.timeStartTs || null,
        timeEndTs: row.timeEndTs || null,
      });
    }
    const current = sourceInstrumentsMap.get(sourceId) ?? [];
    current.push({
      samplePoolId: sourceId,
      instrumentId,
      symbol,
      displayLabel: symbol,
      baseTimeframe: row.baseTimeframe,
      sourceTimeframe: row.baseTimeframe,
      scopeKind: 'LOCAL',
      sourceId: String(row.sourceIdForInstrument ?? '').trim() || null,
      sourceName: String(row.sourceName ?? '').trim() || null,
      barCount: Math.max(0, Math.floor(Number(row.barCount ?? 0))),
      timeStartTs: row.timeStartTs || null,
      timeEndTs: row.timeEndTs || null,
    });
    sourceInstrumentsMap.set(sourceId, current);
  });

  sourceInstrumentsMap.forEach((items, sourceId) => {
    const deduped = Array.from(
      new Map(items.map((item) => [item.instrumentId, item])).values(),
    ).sort((left, right) => left.symbol.localeCompare(right.symbol, 'en'));
    sourceInstrumentsMap.set(sourceId, deduped);
    sourceSymbolsSortedMap.set(
      sourceId,
      deduped.map((item) => item.symbol),
    );
  });
  const effectiveSummaryBySourceId = new Map<string, SourceEffectiveSummary>();
  rows.forEach((row) => {
    const sourceInstruments = sourceInstrumentsMap.get(row.id) ?? [];
    let barCount = 0;
    let timeStartTs: string | null = null;
    let timeEndTs: string | null = null;
    sourceInstruments.forEach((instrument) => {
      barCount += Math.max(0, Math.floor(Number(instrument.barCount ?? 0)));
      const candidateStartTs =
        typeof instrument.timeStartTs === 'string' && instrument.timeStartTs.trim()
          ? instrument.timeStartTs
          : null;
      const candidateEndTs =
        typeof instrument.timeEndTs === 'string' && instrument.timeEndTs.trim()
          ? instrument.timeEndTs
          : null;
      if (candidateStartTs && (!timeStartTs || candidateStartTs < timeStartTs)) {
        timeStartTs = candidateStartTs;
      }
      if (candidateEndTs && (!timeEndTs || candidateEndTs > timeEndTs)) {
        timeEndTs = candidateEndTs;
      }
    });
    effectiveSummaryBySourceId.set(row.id, {
      barCount: Math.max(0, Math.floor(Number(barCount) || 0)),
      timeStartTs,
      timeEndTs
    });
  });

  return rows.map((row) => {
    const timeZone = normalizeTimeZone(row.timeZone);
    const timeZoneOrigin = normalizeTimeZoneOrigin(row.timeZoneOrigin);
    const sourceInstruments = sourceInstrumentsMap.get(row.id) ?? [];
    const sourceSymbols = sourceSymbolsSortedMap.get(row.id) ?? [];
    const effectiveSummary = effectiveSummaryBySourceId.get(row.id) ?? {
      barCount: 0,
      timeStartTs: null,
      timeEndTs: null
    };
    const resolvedBarCount =
      effectiveSummary.barCount > 0 ?
        effectiveSummary.barCount :
        Math.max(0, Math.floor(Number(row.barCount ?? 0)));
    const resolvedTimeStartTs =
      effectiveSummary.timeStartTs !== null && effectiveSummary.timeStartTs !== undefined ?
        effectiveSummary.timeStartTs :
        row.timeStartTs !== null && row.timeStartTs !== undefined ?
          row.timeStartTs :
          null;
    const resolvedTimeEndTs =
      effectiveSummary.timeEndTs !== null && effectiveSummary.timeEndTs !== undefined ?
        effectiveSummary.timeEndTs :
        row.timeEndTs !== null && row.timeEndTs !== undefined ?
          row.timeEndTs :
          null;
    const resolvedSymbolCount = sourceSymbols.length;
    const fileStats = sourceFileStatsById.get(row.id);
    const sourceFolderRaw = String(row.sourceFolder ?? '');
    const sourceFolder = sourceFolderRaw.trim() ? sourceFolderRaw : '';
    const sourceFolderBookmarkId = String(row.sourceFolderBookmarkId || '').trim();
    const sourceIsImporting = row.status === 'IMPORTING';
    const sourceIsFailed = row.status === 'FAILED';
    const normalizedDeletionState =
      String(row.deletionState ?? '').trim().toUpperCase() || 'IDLE';
    const sourceIsMutating = normalizedDeletionState !== 'IDLE';
    const sourceOperationallyLocked =
      sourceIsImporting || sourceIsFailed || sourceIsMutating;
    const lockedSymbols = sourceOperationallyLocked ? sourceSymbols : [];
    const operationalLockReason = sourceIsMutating
      ? LOCAL_DATA_SOURCE_MUTATION_LOCK_REASON
      : sourceIsImporting
        ? LOCAL_DATA_SOURCE_IMPORTING_LOCK_REASON
        : sourceIsFailed
          ? LOCAL_DATA_SOURCE_FAILED_LOCK_REASON
          : null;
    const diagnosticProfile = normalizeLocalDataSourceDiagnosticProfile({
      assetClass: row.diagnosticAssetClass as LocalDataSourceDiagnosticProfile['assetClass'],
      marketPresetId: row.diagnosticMarketPresetId ?? undefined,
      profileOrigin: row.diagnosticProfileOrigin as LocalDataSourceDiagnosticProfile['profileOrigin'],
    });
    const importedFiles = Math.max(
      0,
      Math.floor(Number(fileStats?.importedFiles ?? row.importedFiles ?? 0)),
    );
    return {
      symbols: sourceSymbols,
      id: row.id,
      samplePoolId: row.id,
      name: row.name,
      sourceFolder: sourceFolder || String(row.name || '').trim(),
      sourceFolderBookmarkId,
      importScopeStrategy:
        row.importScopeStrategy === 'WITH_PARENT' || row.importScopeStrategy === 'FLAT'
          ? row.importScopeStrategy
          : null,
      importScopeTopLevelSubfolder: (() => {
        const raw = String(row.importScopeTopLevelSubfolder ?? '');
        return raw.trim() ? raw : '';
      })(),
      timeZone,
      timeZoneOrigin,
      baseTimeframe: row.baseTimeframe,
      tradingCalendar: parseStoredTradingCalendarConfig(row.tradingCalendarJson),
      diagnosticProfile,
      fieldMapping: deps.parseStoredFieldMappingJson(row.fieldMappingJson),
      status: row.status,
      instruments: sourceInstruments,
      symbolCount: resolvedSymbolCount,
      barCount: resolvedBarCount,
      symbolStats: sourceInstruments.map((symbolStats) => {
        return {
          instrumentId: symbolStats.instrumentId,
          symbol: symbolStats.symbol,
          displayLabel: symbolStats.displayLabel,
          barCount: Math.max(0, Math.floor(Number(symbolStats.barCount ?? 0))),
          timeStartTs: symbolStats.timeStartTs ?? null,
          timeEndTs: symbolStats.timeEndTs ?? null
        };
      }),
      timeStartTs: resolvedTimeStartTs,
      timeEndTs: resolvedTimeEndTs,
      totalFiles: Math.max(0, Math.floor(Number(fileStats?.totalFiles ?? row.totalFiles ?? 0))),
      importedFiles,
      failedFiles: Math.max(0, Math.floor(Number(fileStats?.failedFiles ?? row.failedFiles ?? 0))),
      requiresSourceFolderRebind:
        importedFiles > 0 &&
        (
          !sourceFolder ||
          (process.platform === 'darwin' && !sourceFolderBookmarkId)
        ),
      sourceLocked: sourceOperationallyLocked,
      unlockedSymbols: sourceOperationallyLocked ? [] : sourceSymbols,
      lockedSymbols,
      lockedSymbolCount: lockedSymbols.length,
      lockReason: operationalLockReason,
      storageBytes: deps.toSafeStorageBytes(row.storageBytes),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastJob:
        row.lastJobId && row.lastJobStatus && row.lastJobStage
          ? {
              id: row.lastJobId,
              status: row.lastJobStatus,
              stage: row.lastJobStage,
              progressPercent: deps.normalizeProgressPercent(Number(row.lastJobProgressPercent ?? 0)),
              compactProgressPercent: deps.normalizeCompactProgressPercent(Number(row.lastJobCompactProgressPercent ?? 0)),
              compactBeforeBytes: deps.toSafeStorageBytes(row.lastJobCompactBeforeBytes),
              compactAfterBytes: deps.toSafeStorageBytes(row.lastJobCompactAfterBytes),
              compactReclaimedBytes: deps.toSafeStorageBytes(row.lastJobCompactReclaimedBytes),
              doneFiles: Math.max(0, Math.floor(Number(row.lastJobDoneFiles ?? 0))),
              totalFiles: Math.max(0, Math.floor(Number(row.lastJobTotalFiles ?? 0))),
              errorFiles: Math.max(0, Math.floor(Number(row.lastJobErrorFiles ?? 0))),
              startedAt: row.lastJobStartedAt || null,
              finishedAt: row.lastJobFinishedAt || null
            }
          : null
    };
  });
};
