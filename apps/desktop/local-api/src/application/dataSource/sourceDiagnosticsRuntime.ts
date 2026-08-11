// SPDX-License-Identifier: GPL-3.0-only

import { parseStoredTradingCalendarConfig } from '@zinuto/shared/tradingCalendar';
import {
  db,
  listSystemSeedInstruments,
} from '../ports/infrastructure/db/database.js';
import {
  getMarketSymbolDiagnosticsSnapshot,
} from '../ports/infrastructure/db/marketDatabase.js';
import { appError } from '../../kernel/appError.js';
import { nowIso } from '../../kernel/time.js';
import { dataSourceRepository } from '../ports/infrastructure/db/dataSource/dataSourceRepository.js';
import {
  createSystemDataSourceDiagnosticProfile,
  normalizeLocalDataSourceDiagnosticProfile,
} from './diagnosticProfile.js';
import {
  createEmptyLocalDataSourceDiagnostics,
  filterLocalDataSourceDiagnostics,
  type LocalDataSourceDiagnosticsInstrument,
  type LocalDataSourceDiagnosticsQuery,
} from './sourceDiagnostics.js';
import {
  buildLocalDataSourceDiagnosticsCache,
  parseCachedLocalDataSourceDiagnostics,
  parseCachedLocalDataSourceSymbolDiagnostics,
} from './sourceDiagnosticsCache.js';
import {
  createSourceDiagnosticsExecutionState,
  isSourceDiagnosticsLifecycleError,
  type SourceDiagnosticsQuiesceLease,
  type SourceDiagnosticsTaskContext,
} from './sourceDiagnosticsExecutionState.js';
import type {
  LocalDataSourceDiagnosticProfile,
  LocalDataSourceDiagnostics,
  LocalDataSourceSymbolDiagnostics,
} from './types.js';

const {
  getSourceBaseTimeframeByIdStmt,
  getImportedSourceSymbolStmt,
  listAllImportedSourceInstrumentsStmt,
  listSystemInstrumentsBySymbolStmt,
  updateSourceDiagnosticProfileStmt,
  getSourceDiagnosticsCacheStmt,
  getSourceSymbolDiagnosticsCacheStmt,
  upsertSourceDiagnosticsCacheStmt,
  upsertSourceSymbolDiagnosticsCacheStmt,
  deleteSourceDiagnosticsCacheStmt,
  deleteSourceSymbolDiagnosticsCacheBySourceStmt,
} = dataSourceRepository;

export type DataSourceDiagnosticConfigRow = {
  id: string;
  baseTimeframe: '1m' | '5m' | '1h' | '1d';
  timeZone: string;
  tradingCalendarJson: string;
  diagnosticAssetClass?: string | null;
  diagnosticMarketPresetId?: string | null;
  diagnosticProfileOrigin?: string | null;
};

type SourceDiagnosticsRuntimeDeps = {
  invalidateLocalDataSourcesCache: () => void;
};

const formatDiagnosticsRebuildError = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

const logDiagnosticsRebuildFailure = (
  stage: 'local' | 'system',
  sourceId: string,
  error: unknown,
): void => {
  // eslint-disable-next-line no-console
  console.warn(`[source-diagnostics] ${stage} diagnostics rebuild failed`, {
    sourceId,
    error: formatDiagnosticsRebuildError(error),
  });
};

export const createSourceDiagnosticsRuntime = ({
  invalidateLocalDataSourcesCache,
}: SourceDiagnosticsRuntimeDeps) => {
  const localDataSourceDiagnosticsBuilds = new Map<
    string,
    Promise<LocalDataSourceDiagnostics>
  >();
  const systemDataSourceDiagnosticsBuilds = new Map<string, Promise<void>>();
  const systemDataSourceDiagnosticsCache = new Map<
    string,
    LocalDataSourceDiagnostics
  >();
  const deferredLocalDataSourceDiagnosticsBuilds = new Set<string>();
  const deferredSystemDataSourceDiagnosticsBuilds = new Set<string>();
  const diagnosticsExecutionState = createSourceDiagnosticsExecutionState();

  const resolveDiagnosticProfileFromRow = (
    row: DataSourceDiagnosticConfigRow,
  ) =>
    normalizeLocalDataSourceDiagnosticProfile({
      assetClass: row.diagnosticAssetClass as never,
      marketPresetId: row.diagnosticMarketPresetId ?? undefined,
      profileOrigin: row.diagnosticProfileOrigin as never,
    });

  const listLocalDiagnosticsInstruments = (
    sourceId: string,
    baseTimeframe: '1m' | '5m' | '1h' | '1d',
  ): LocalDataSourceDiagnosticsInstrument[] =>
    (
      listAllImportedSourceInstrumentsStmt.all() as Array<{
        sourceId?: string | null;
        instrumentId?: string | null;
        symbol?: string | null;
        baseTimeframe?: '1m' | '5m' | '1h' | '1d';
        timeStartTs?: string | null;
        timeEndTs?: string | null;
      }>
    )
      .filter(
        (row) =>
          String(row.sourceId ?? '').trim() === sourceId &&
          row.baseTimeframe === baseTimeframe,
      )
      .map((row) => ({
        instrumentId: String(row.instrumentId ?? '').trim(),
        symbol: String(row.symbol ?? '').trim().toUpperCase(),
        timeStartTs: row.timeStartTs ?? null,
        timeEndTs: row.timeEndTs ?? null,
      }))
      .filter((instrument) => instrument.instrumentId && instrument.symbol);

  const rebuildLocalDataSourceDiagnosticsCache = async (
    sourceId: string,
    taskContext: SourceDiagnosticsTaskContext,
  ): Promise<LocalDataSourceDiagnostics> => {
    const source = getSourceBaseTimeframeByIdStmt.get(sourceId) as
      | DataSourceDiagnosticConfigRow
      | undefined;
    if (!source) {
      throw appError('LOCAL_DATA_SOURCE_NOT_FOUND', { sourceId }, 404);
    }
    const profile = resolveDiagnosticProfileFromRow(source);
    const tradingCalendar = parseStoredTradingCalendarConfig(
      source.tradingCalendarJson,
    );
    const instruments = listLocalDiagnosticsInstruments(
      sourceId,
      source.baseTimeframe,
    );
    const generatedAt = nowIso();
    const result = await buildLocalDataSourceDiagnosticsCache({
      sourceId,
      baseTimeframe: source.baseTimeframe,
      profile,
      instruments,
      generatedAt,
      timeZone: source.timeZone,
      tradingCalendar,
      loadSnapshot: getMarketSymbolDiagnosticsSnapshot,
      signal: taskContext.signal,
    });
    taskContext.assertCanPublish();
    db.transaction(() => {
      deleteSourceSymbolDiagnosticsCacheBySourceStmt.run(sourceId);
      for (const item of result.symbolDiagnostics) {
        upsertSourceSymbolDiagnosticsCacheStmt.run(
          sourceId,
          item.instrumentId,
          item.symbol,
          item.diagnostics.baseTimeframe,
          JSON.stringify(item.diagnostics),
          generatedAt,
        );
      }
      upsertSourceDiagnosticsCacheStmt.run(
        sourceId,
        result.sourceDiagnostics.baseTimeframe,
        JSON.stringify(result.sourceDiagnostics),
        generatedAt,
      );
    })();
    return result.sourceDiagnostics;
  };

  const ensureLocalDataSourceDiagnosticsCache = async (
    sourceId: string,
  ): Promise<LocalDataSourceDiagnostics> => {
    const normalizedSourceId = String(sourceId ?? '').trim();
    if (!normalizedSourceId) {
      throw appError('LOCAL_DATA_SOURCE_NOT_FOUND', { sourceId }, 404);
    }
    const inFlight = localDataSourceDiagnosticsBuilds.get(normalizedSourceId);
    if (inFlight) {
      return inFlight;
    }
    let task: Promise<LocalDataSourceDiagnostics> | null = null;
    const execute = async (taskContext: SourceDiagnosticsTaskContext) => {
      try {
        return await rebuildLocalDataSourceDiagnosticsCache(
          normalizedSourceId,
          taskContext,
        );
      } finally {
        if (localDataSourceDiagnosticsBuilds.get(normalizedSourceId) === task) {
          localDataSourceDiagnosticsBuilds.delete(normalizedSourceId);
        }
      }
    };
    task = diagnosticsExecutionState.tryStartTask(execute);
    if (!task) {
      return diagnosticsExecutionState.startTask(execute);
    }
    localDataSourceDiagnosticsBuilds.set(normalizedSourceId, task);
    return task;
  };

  const deferLocalDataSourceDiagnosticsRebuild = (sourceId: string): void => {
    if (!diagnosticsExecutionState.getState().stopped) {
      deferredLocalDataSourceDiagnosticsBuilds.add(sourceId);
    }
  };

  const scheduleLocalDataSourceDiagnosticsRebuild = (sourceId: string): void => {
    const normalizedSourceId = String(sourceId ?? '').trim();
    if (!normalizedSourceId) {
      return;
    }
    const lifecycle = diagnosticsExecutionState.getState();
    if (lifecycle.stopped) {
      return;
    }
    if (lifecycle.suspended) {
      deferLocalDataSourceDiagnosticsRebuild(normalizedSourceId);
      return;
    }
    void ensureLocalDataSourceDiagnosticsCache(normalizedSourceId).catch((error) => {
      if (isSourceDiagnosticsLifecycleError(error)) {
        if (error.code === 'SOURCE_DIAGNOSTICS_SUSPENDED') {
          deferLocalDataSourceDiagnosticsRebuild(normalizedSourceId);
        }
        return;
      }
      logDiagnosticsRebuildFailure('local', normalizedSourceId, error);
    });
  };

  const listSystemDiagnosticsInstruments = (
    sourceId: string,
    baseTimeframe: '1m' | '5m' | '1h' | '1d',
  ): LocalDataSourceDiagnosticsInstrument[] =>
    listSystemSeedInstruments()
      .filter(
        (seedInstrument) =>
          seedInstrument.poolId === sourceId &&
          seedInstrument.baseTimeframe === baseTimeframe,
      )
      .map((seedInstrument) => {
        const systemInstrument = listSystemInstrumentsBySymbolStmt.get(
          seedInstrument.symbol,
          seedInstrument.baseTimeframe,
        ) as { id?: string; symbol?: string } | undefined;
        return {
          instrumentId: String(systemInstrument?.id ?? '').trim(),
          symbol: String(systemInstrument?.symbol ?? seedInstrument.symbol)
            .trim()
            .toUpperCase(),
        };
      })
      .filter((instrument) => instrument.instrumentId && instrument.symbol);

  const rebuildSystemDataSourceDiagnosticsCache = async (
    sourceId: string,
    taskContext: SourceDiagnosticsTaskContext,
  ): Promise<LocalDataSourceDiagnostics> => {
    const systemSeedInstruments = listSystemSeedInstruments().filter(
      (instrument) => instrument.poolId === sourceId,
    );
    if (!systemSeedInstruments.length) {
      throw appError('LOCAL_DATA_SOURCE_NOT_FOUND', { sourceId }, 404);
    }
    const baseTimeframe = systemSeedInstruments[0]?.baseTimeframe ?? '1d';
    const profile = createSystemDataSourceDiagnosticProfile(sourceId);
    const result = await buildLocalDataSourceDiagnosticsCache({
      sourceId,
      baseTimeframe,
      profile,
      instruments: listSystemDiagnosticsInstruments(sourceId, baseTimeframe),
      generatedAt: nowIso(),
      loadSnapshot: getMarketSymbolDiagnosticsSnapshot,
      signal: taskContext.signal,
    });
    taskContext.assertCanPublish();
    systemDataSourceDiagnosticsCache.set(sourceId, result.sourceDiagnostics);
    return result.sourceDiagnostics;
  };

  const scheduleSystemDataSourceDiagnosticsRebuild = (sourceId: string): void => {
    const normalizedSourceId = String(sourceId ?? '').trim();
    if (!normalizedSourceId) {
      return;
    }
    const lifecycle = diagnosticsExecutionState.getState();
    if (lifecycle.stopped) {
      return;
    }
    if (lifecycle.suspended) {
      deferredSystemDataSourceDiagnosticsBuilds.add(normalizedSourceId);
      return;
    }
    if (systemDataSourceDiagnosticsBuilds.has(normalizedSourceId)) {
      return;
    }
    let task: Promise<void> | null = null;
    const execute = async (taskContext: SourceDiagnosticsTaskContext) => {
      try {
        await rebuildSystemDataSourceDiagnosticsCache(
          normalizedSourceId,
          taskContext,
        );
      } finally {
        if (systemDataSourceDiagnosticsBuilds.get(normalizedSourceId) === task) {
          systemDataSourceDiagnosticsBuilds.delete(normalizedSourceId);
        }
      }
    };
    task = diagnosticsExecutionState.tryStartTask(execute);
    if (!task) {
      deferredSystemDataSourceDiagnosticsBuilds.add(normalizedSourceId);
      return;
    }
    systemDataSourceDiagnosticsBuilds.set(normalizedSourceId, task);
    void task.catch((error) => {
      if (isSourceDiagnosticsLifecycleError(error)) {
        if (error.code === 'SOURCE_DIAGNOSTICS_SUSPENDED') {
          deferredSystemDataSourceDiagnosticsBuilds.add(normalizedSourceId);
        }
        return;
      }
      logDiagnosticsRebuildFailure('system', normalizedSourceId, error);
    });
  };

  const flushDeferredDiagnosticsRebuilds = (): void => {
    const lifecycle = diagnosticsExecutionState.getState();
    if (lifecycle.stopped || lifecycle.suspended) {
      return;
    }
    const localSourceIds = [...deferredLocalDataSourceDiagnosticsBuilds];
    const systemSourceIds = [...deferredSystemDataSourceDiagnosticsBuilds];
    deferredLocalDataSourceDiagnosticsBuilds.clear();
    deferredSystemDataSourceDiagnosticsBuilds.clear();
    localSourceIds.forEach(scheduleLocalDataSourceDiagnosticsRebuild);
    systemSourceIds.forEach(scheduleSystemDataSourceDiagnosticsRebuild);
  };

  const invalidateSourceDiagnosticsRuntimeCaches = (): void => {
    systemDataSourceDiagnosticsCache.clear();
    diagnosticsExecutionState.invalidate();
  };

  const acquireSourceDiagnosticsQuiesceLease = async (): Promise<
    SourceDiagnosticsQuiesceLease
  > => {
    systemDataSourceDiagnosticsCache.clear();
    const lease = await diagnosticsExecutionState.acquireQuiesceLease();
    let released = false;
    return {
      release: () => {
        if (released) {
          return;
        }
        released = true;
        lease.release();
        queueMicrotask(flushDeferredDiagnosticsRebuilds);
      },
    };
  };

  const stopSourceDiagnosticsRuntime = async (): Promise<void> => {
    deferredLocalDataSourceDiagnosticsBuilds.clear();
    deferredSystemDataSourceDiagnosticsBuilds.clear();
    systemDataSourceDiagnosticsCache.clear();
    await diagnosticsExecutionState.stop();
  };

  const readCachedLocalDataSourceDiagnostics = (
    sourceId: string,
    baseTimeframe: '1m' | '5m' | '1h' | '1d',
    query?: LocalDataSourceDiagnosticsQuery,
  ): LocalDataSourceDiagnostics | null => {
    const cached = getSourceDiagnosticsCacheStmt.get(sourceId) as
      | { diagnosticsJson?: string | null }
      | undefined;
    const diagnostics = parseCachedLocalDataSourceDiagnostics(
      cached?.diagnosticsJson,
      sourceId,
      baseTimeframe,
    );
    return diagnostics ? filterLocalDataSourceDiagnostics(diagnostics, query) : null;
  };

  const readCachedLocalDataSourceSymbolDiagnostics = (
    sourceId: string,
    symbol: string,
    baseTimeframe: '1m' | '5m' | '1h' | '1d',
  ): LocalDataSourceSymbolDiagnostics | null => {
    const cached = getSourceSymbolDiagnosticsCacheStmt.get(sourceId, symbol) as
      | { diagnosticsJson?: string | null }
      | undefined;
    return parseCachedLocalDataSourceSymbolDiagnostics(
      cached?.diagnosticsJson,
      symbol,
      baseTimeframe,
    );
  };

  const createBuildingLocalDataSourceSymbolDiagnostics = ({
    sourceId,
    symbol,
    baseTimeframe,
    profile,
  }: {
    sourceId: string;
    symbol: string;
    baseTimeframe: '1m' | '5m' | '1h' | '1d';
    profile: LocalDataSourceDiagnosticProfile;
  }): LocalDataSourceSymbolDiagnostics => {
    const empty = createEmptyLocalDataSourceDiagnostics(
      sourceId,
      baseTimeframe,
      profile,
      'BUILDING',
      1,
    );
    return {
      symbol,
      baseTimeframe,
      diagnosticRulesVersion: empty.diagnosticRulesVersion,
      status: empty.status,
      generatedAt: empty.generatedAt,
      profile: empty.profile,
      health: empty.health,
      totalBars: 0,
      summary: empty.summary,
      items: [],
    };
  };

  const warmMissingSystemDataSourceDiagnosticsCaches = (): void => {
    const warmedSystemPoolIds = new Set<string>();
    listSystemSeedInstruments().forEach((instrument) => {
      const poolId = String(instrument.poolId ?? '').trim();
      if (!poolId || warmedSystemPoolIds.has(poolId)) {
        return;
      }
      warmedSystemPoolIds.add(poolId);
      if (!systemDataSourceDiagnosticsCache.has(poolId)) {
        scheduleSystemDataSourceDiagnosticsRebuild(poolId);
      }
    });
  };

  const getLocalDataSourceSymbolDiagnostics = async (
    sourceIdRaw: string,
    symbolRaw: string,
  ): Promise<LocalDataSourceSymbolDiagnostics> => {
    const sourceId = String(sourceIdRaw ?? '').trim();
    if (!sourceId) {
      throw appError('LOCAL_DATA_SOURCE_NOT_FOUND', { sourceId }, 404);
    }
    const source = getSourceBaseTimeframeByIdStmt.get(sourceId) as
      | DataSourceDiagnosticConfigRow
      | undefined;
    const symbol = String(symbolRaw ?? '').trim().toUpperCase();
    if (source) {
      const profile = resolveDiagnosticProfileFromRow(source);
      if (!symbol) {
        throw appError('INSTRUMENT_NOT_FOUND', {
          symbol,
          timeframe: source.baseTimeframe,
        }, 404);
      }
      const importedSymbol = getImportedSourceSymbolStmt.get(
        sourceId,
        symbol,
      ) as
        | { symbol?: string | null; instrumentId?: string | null }
        | undefined;
      const instrumentId = String(importedSymbol?.instrumentId ?? '').trim();
      if (!importedSymbol?.symbol || !instrumentId) {
        throw appError('INSTRUMENT_NOT_FOUND', {
          symbol,
          timeframe: source.baseTimeframe,
        }, 404);
      }
      const cached = readCachedLocalDataSourceSymbolDiagnostics(
        sourceId,
        symbol,
        source.baseTimeframe,
      );
      if (cached) {
        return cached;
      }
      scheduleLocalDataSourceDiagnosticsRebuild(sourceId);
      return createBuildingLocalDataSourceSymbolDiagnostics({
        sourceId,
        symbol,
        baseTimeframe: source.baseTimeframe,
        profile,
      });
    }

    const systemSeedInstruments = listSystemSeedInstruments().filter(
      (instrument) => instrument.poolId === sourceId,
    );
    if (!systemSeedInstruments.length) {
      throw appError('LOCAL_DATA_SOURCE_NOT_FOUND', { sourceId }, 404);
    }
    const systemSeedInstrument = systemSeedInstruments.find(
      (instrument) => instrument.symbol === symbol,
    );
    if (!systemSeedInstrument) {
      throw appError('INSTRUMENT_NOT_FOUND', {
        symbol,
        timeframe: systemSeedInstruments[0]?.baseTimeframe ?? '1d',
      }, 404);
    }
    const cachedSourceDiagnostics = systemDataSourceDiagnosticsCache.get(sourceId);
    if (cachedSourceDiagnostics) {
      const symbolSummary = cachedSourceDiagnostics.symbols.find(
        (item) => item.symbol === symbol,
      );
      return {
        symbol,
        baseTimeframe: systemSeedInstrument.baseTimeframe,
        diagnosticRulesVersion: cachedSourceDiagnostics.diagnosticRulesVersion,
        status: cachedSourceDiagnostics.status,
        generatedAt: cachedSourceDiagnostics.generatedAt,
        profile: cachedSourceDiagnostics.profile,
        health: cachedSourceDiagnostics.health,
        totalBars: symbolSummary?.totalBars ?? 0,
        summary: {
          totalIssues: cachedSourceDiagnostics.items.filter(
            (item) => item.symbol === symbol,
          ).length,
          criticalIssues: cachedSourceDiagnostics.items.filter(
            (item) => item.symbol === symbol && item.severity === 'CRITICAL',
          ).length,
          warningIssues: cachedSourceDiagnostics.items.filter(
            (item) => item.symbol === symbol && item.severity === 'WARNING',
          ).length,
          infoIssues: cachedSourceDiagnostics.items.filter(
            (item) => item.symbol === symbol && item.severity === 'INFO',
          ).length,
          byCategory: {
            TIME_INTEGRITY: cachedSourceDiagnostics.items.filter(
              (item) =>
                item.symbol === symbol && item.category === 'TIME_INTEGRITY',
            ).length,
            EXTREME_ANOMALY: cachedSourceDiagnostics.items.filter(
              (item) =>
                item.symbol === symbol && item.category === 'EXTREME_ANOMALY',
            ).length,
          },
        },
        items: cachedSourceDiagnostics.items.filter(
          (item) => item.symbol === symbol,
        ),
      };
    }
    scheduleSystemDataSourceDiagnosticsRebuild(sourceId);
    return createBuildingLocalDataSourceSymbolDiagnostics({
      sourceId,
      symbol,
      baseTimeframe: systemSeedInstrument.baseTimeframe,
      profile: createSystemDataSourceDiagnosticProfile(sourceId),
    });
  };

  const getLocalDataSourceDiagnostics = async (
    sourceIdRaw: string,
    query: LocalDataSourceDiagnosticsQuery = {},
  ): Promise<LocalDataSourceDiagnostics> => {
    const sourceId = String(sourceIdRaw ?? '').trim();
    if (!sourceId) {
      throw appError('LOCAL_DATA_SOURCE_NOT_FOUND', { sourceId }, 404);
    }
    const source = getSourceBaseTimeframeByIdStmt.get(sourceId) as
      | DataSourceDiagnosticConfigRow
      | undefined;

    if (source) {
      const cached = readCachedLocalDataSourceDiagnostics(
        sourceId,
        source.baseTimeframe,
        query,
      );
      if (cached) {
        return cached;
      }
      const built = await ensureLocalDataSourceDiagnosticsCache(sourceId);
      return filterLocalDataSourceDiagnostics(built, query);
    }

    const systemSeedInstruments = listSystemSeedInstruments().filter(
      (instrument) => instrument.poolId === sourceId,
    );
    if (!systemSeedInstruments.length) {
      throw appError('LOCAL_DATA_SOURCE_NOT_FOUND', { sourceId }, 404);
    }
    const baseTimeframe = systemSeedInstruments[0]?.baseTimeframe ?? '1d';
    const cached = systemDataSourceDiagnosticsCache.get(sourceId);
    if (cached) {
      return filterLocalDataSourceDiagnostics(cached, query);
    }
    scheduleSystemDataSourceDiagnosticsRebuild(sourceId);
    return createEmptyLocalDataSourceDiagnostics(
      sourceId,
      baseTimeframe,
      createSystemDataSourceDiagnosticProfile(sourceId),
      'BUILDING',
      systemSeedInstruments.length,
    );
  };

  const updateLocalDataSourceDiagnosticProfile = async (
    sourceIdRaw: string,
    input: Partial<LocalDataSourceDiagnosticProfile>,
  ): Promise<LocalDataSourceDiagnostics> => {
    const sourceId = String(sourceIdRaw ?? '').trim();
    const source = getSourceBaseTimeframeByIdStmt.get(sourceId) as
      | DataSourceDiagnosticConfigRow
      | undefined;
    if (!source) {
      const systemSeedInstruments = listSystemSeedInstruments().filter(
        (instrument) => instrument.poolId === sourceId,
      );
      if (systemSeedInstruments.length) {
        throw appError('LOCAL_DATA_SOURCE_PROFILE_LOCKED', { sourceId }, 409);
      }
      throw appError('LOCAL_DATA_SOURCE_NOT_FOUND', { sourceId }, 404);
    }
    const profile = normalizeLocalDataSourceDiagnosticProfile({
      assetClass: input.assetClass,
      marketPresetId: input.marketPresetId,
      profileOrigin: 'USER',
    });
    const updatedAt = nowIso();
    db.transaction(() => {
      updateSourceDiagnosticProfileStmt.run(
        profile.assetClass,
        profile.marketPresetId,
        profile.profileOrigin,
        updatedAt,
        sourceId,
      );
      deleteSourceDiagnosticsCacheStmt.run(sourceId);
      deleteSourceSymbolDiagnosticsCacheBySourceStmt.run(sourceId);
    })();
    invalidateLocalDataSourcesCache();
    scheduleLocalDataSourceDiagnosticsRebuild(sourceId);
    return createEmptyLocalDataSourceDiagnostics(
      sourceId,
      source.baseTimeframe,
      profile,
      'BUILDING',
      listLocalDiagnosticsInstruments(sourceId, source.baseTimeframe).length,
    );
  };

  return {
    ensureLocalDataSourceDiagnosticsCache,
    scheduleLocalDataSourceDiagnosticsRebuild,
    warmMissingSystemDataSourceDiagnosticsCaches,
    getLocalDataSourceDiagnostics,
    getLocalDataSourceSymbolDiagnostics,
    updateLocalDataSourceDiagnosticProfile,
    acquireSourceDiagnosticsQuiesceLease,
    invalidateSourceDiagnosticsRuntimeCaches,
    stopSourceDiagnosticsRuntime,
  };
};
