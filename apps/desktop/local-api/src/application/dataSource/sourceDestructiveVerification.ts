// SPDX-License-Identifier: GPL-3.0-only

import {
  listSystemSeedInstruments,
  resolveSystemSeedInstrumentMetadata,
} from '../ports/infrastructure/db/database.js';
import { readMarketInstrumentDataFootprints } from '../ports/infrastructure/db/marketDatabase.js';
import { appError } from '../../kernel/appError.js';
import { normalizeCount } from './importProgress.js';

type SqliteCountStatement = {
  get: (...args: unknown[]) => unknown;
};

type SourceStoredSummaryStatement = {
  get: (sourceId: string) => unknown;
};

type LocalInstrumentConsistencyStatement = {
  all: (sourceId: string) => unknown[];
};

type SystemInstrumentBySymbolStatement = {
  get: (symbol: string, baseTimeframe: string) => unknown;
};

type SourceDestructiveVerificationDeps = {
  countLocalSourcesStmt: SqliteCountStatement;
  countLocalSourceFilesStmt: SqliteCountStatement;
  countLocalImportJobsStmt: SqliteCountStatement;
  countLocalInstrumentsStmt: SqliteCountStatement;
  countLocalSourceDiagnosticsStmt: SqliteCountStatement;
  countLocalSourceSymbolDiagnosticsStmt: SqliteCountStatement;
  countSourceByIdStmt: SqliteCountStatement;
  countSourceFilesBySourceIdStmt: SqliteCountStatement;
  countSourceFilesBySourceSymbolStmt: SqliteCountStatement;
  countImportJobsBySourceIdStmt: SqliteCountStatement;
  countLocalInstrumentsBySourceIdStmt: SqliteCountStatement;
  countLocalInstrumentsBySourceSymbolStmt: SqliteCountStatement;
  countSourceDiagnosticsBySourceIdStmt: SqliteCountStatement;
  countSourceSymbolDiagnosticsBySourceIdStmt: SqliteCountStatement;
  countSourceSymbolDiagnosticsBySourceSymbolStmt: SqliteCountStatement;
  getSourceStoredSummaryByIdStmt: SourceStoredSummaryStatement;
  listLocalInstrumentConsistencyRowsBySourceStmt: LocalInstrumentConsistencyStatement;
  listSystemInstrumentsBySymbolStmt: SystemInstrumentBySymbolStatement;
};

type MarketDataFootprint = {
  instrumentId: string;
  bars: number;
  instruments: number;
  instrumentBarCount: number;
  chunkAnchors: number;
  displayBars: number;
  displayAnchors: number;
  timelineMeta: number;
};

const readSqliteCount = (
  statement: SqliteCountStatement,
  ...args: unknown[]
): number =>
  normalizeCount(
    (statement.get(...args) as { count?: unknown } | undefined)?.count,
  );

const assertSqliteDestructiveCountsCleared = (
  checks: Array<{ checkId: string; count: number }>,
): void => {
  const remaining = checks.find((check) => normalizeCount(check.count) > 0);
  if (!remaining) {
    return;
  }
  throw appError('LOCAL_DATA_SQLITE_DESTRUCTIVE_VERIFY_FAILED', {
    check: remaining.checkId,
    count: remaining.count,
  });
};

const hasRemainingMarketFootprint = (footprint: MarketDataFootprint): boolean =>
  normalizeCount(footprint.bars) > 0 ||
  normalizeCount(footprint.instruments) > 0 ||
  normalizeCount(footprint.instrumentBarCount) > 0 ||
  normalizeCount(footprint.chunkAnchors) > 0 ||
  normalizeCount(footprint.displayBars) > 0 ||
  normalizeCount(footprint.displayAnchors) > 0 ||
  normalizeCount(footprint.timelineMeta) > 0;

const assertNoMarketDataForInstrumentIds = async (
  instrumentIds: readonly string[],
  operation: string,
): Promise<void> => {
  const footprints = await readMarketInstrumentDataFootprints(instrumentIds);
  const remaining = footprints.find(hasRemainingMarketFootprint);
  if (!remaining) {
    return;
  }
  throw appError('LOCAL_DATA_MARKET_DESTRUCTIVE_VERIFY_FAILED', {
    operation,
    instrumentId: remaining.instrumentId,
    bars: remaining.bars,
    instruments: remaining.instruments,
    chunkAnchors: remaining.chunkAnchors,
    displayBars: remaining.displayBars,
    displayAnchors: remaining.displayAnchors,
    timelineMeta: remaining.timelineMeta,
  });
};

export const createSourceDestructiveVerification = (
  deps: SourceDestructiveVerificationDeps,
) => {
  const verifySourceSummaryMatchesMarketBars = async (
    sourceId: string,
  ): Promise<void> => {
    const sourceSummary = deps.getSourceStoredSummaryByIdStmt.get(sourceId) as
      | { symbolCount?: unknown; barCount?: unknown }
      | undefined;
    if (!sourceSummary) {
      return;
    }
    const instrumentRows =
      deps.listLocalInstrumentConsistencyRowsBySourceStmt.all(sourceId) as Array<{
        id?: unknown;
        symbol?: unknown;
        barCount?: unknown;
      }>;
    const instrumentIds = instrumentRows
      .map((row) => String(row.id ?? '').trim())
      .filter((instrumentId) => Boolean(instrumentId));
    const footprints = await readMarketInstrumentDataFootprints(instrumentIds);
    const footprintsByInstrument = new Map(
      footprints.map((footprint) => [footprint.instrumentId, footprint]),
    );
    let actualBarCount = 0;
    instrumentRows.forEach((row) => {
      const instrumentId = String(row.id ?? '').trim();
      const symbol = String(row.symbol ?? '').trim().toUpperCase();
      const storedBarCount = normalizeCount(row.barCount);
      const footprint = footprintsByInstrument.get(instrumentId);
      const marketBarCount = normalizeCount(footprint?.bars ?? 0);
      actualBarCount += marketBarCount;
      if (
        storedBarCount !== marketBarCount ||
        (footprint &&
          normalizeCount(footprint.instruments) > 0 &&
          normalizeCount(footprint.instrumentBarCount) !== marketBarCount)
      ) {
        throw appError('LOCAL_DATA_SOURCE_MARKET_SUMMARY_MISMATCH', {
          sourceId,
          instrumentId,
          symbol,
          sqliteBars: storedBarCount,
          marketBars: marketBarCount,
          marketInstrumentBars: normalizeCount(
            footprint?.instrumentBarCount ?? 0,
          ),
        });
      }
    });

    const storedSymbolCount = normalizeCount(sourceSummary.symbolCount);
    const storedSourceBarCount = normalizeCount(sourceSummary.barCount);
    if (
      storedSymbolCount !== instrumentRows.length ||
      storedSourceBarCount !== actualBarCount
    ) {
      throw appError('LOCAL_DATA_SOURCE_MARKET_SUMMARY_MISMATCH', {
        sourceId,
        sqliteSymbols: storedSymbolCount,
        actualSymbols: instrumentRows.length,
        sqliteBars: storedSourceBarCount,
        marketBars: actualBarCount,
      });
    }
  };

  const verifySystemSeedMetadataRestored = (): void => {
    listSystemSeedInstruments().forEach((seedInstrument) => {
      const symbol = String(seedInstrument.symbol ?? '').trim().toUpperCase();
      const baseTimeframe = seedInstrument.baseTimeframe;
      if (!symbol) {
        return;
      }
      const expected = resolveSystemSeedInstrumentMetadata(
        symbol,
        baseTimeframe,
      );
      const actual = deps.listSystemInstrumentsBySymbolStmt.get(
        symbol,
        baseTimeframe,
      ) as
        | {
            id?: unknown;
            barCount?: unknown;
            timeStartTs?: unknown;
            timeEndTs?: unknown;
            barsVersionToken?: unknown;
          }
        | undefined;
      if (!expected || !actual?.id) {
        throw appError('SYSTEM_SEED_METADATA_MISSING', {
          symbol,
          baseTimeframe,
        });
      }
      const actualBarCount = normalizeCount(actual.barCount);
      const actualVersion = String(actual.barsVersionToken ?? '').trim();
      const actualStartTs =
        typeof actual.timeStartTs === 'string' && actual.timeStartTs.trim()
          ? actual.timeStartTs
          : null;
      const actualEndTs =
        typeof actual.timeEndTs === 'string' && actual.timeEndTs.trim()
          ? actual.timeEndTs
          : null;
      if (
        actualBarCount !== normalizeCount(expected.barCount) ||
        actualStartTs !== expected.timeStartTs ||
        actualEndTs !== expected.timeEndTs ||
        actualVersion !== expected.barsVersionToken
      ) {
        throw appError('SYSTEM_SEED_METADATA_MISMATCH', {
          symbol,
          baseTimeframe,
          sqliteBars: actualBarCount,
          expectedBars: normalizeCount(expected.barCount),
        });
      }
    });
  };

  const verifyLocalDataSourcesCleared = async (
    instrumentIds: string[],
  ): Promise<void> => {
    assertSqliteDestructiveCountsCleared([
      {
        checkId: 'local_data_sources',
        count: readSqliteCount(deps.countLocalSourcesStmt),
      },
      {
        checkId: 'local_data_source_files',
        count: readSqliteCount(deps.countLocalSourceFilesStmt),
      },
      {
        checkId: 'local_data_import_jobs',
        count: readSqliteCount(deps.countLocalImportJobsStmt),
      },
      {
        checkId: 'local_instruments',
        count: readSqliteCount(deps.countLocalInstrumentsStmt),
      },
      {
        checkId: 'local_data_source_diagnostics',
        count: readSqliteCount(deps.countLocalSourceDiagnosticsStmt),
      },
      {
        checkId: 'local_data_source_symbol_diagnostics',
        count: readSqliteCount(deps.countLocalSourceSymbolDiagnosticsStmt),
      },
    ]);
    await assertNoMarketDataForInstrumentIds(
      instrumentIds,
      'CLEAR_ALL_LOCAL_DATA_SOURCES',
    );
    verifySystemSeedMetadataRestored();
  };

  const verifyLocalDataSourceRemoved = async (
    sourceId: string,
    instrumentIds: string[],
  ): Promise<void> => {
    assertSqliteDestructiveCountsCleared([
      {
        checkId: 'local_data_sources.by_source',
        count: readSqliteCount(deps.countSourceByIdStmt, sourceId),
      },
      {
        checkId: 'local_data_source_files.by_source',
        count: readSqliteCount(deps.countSourceFilesBySourceIdStmt, sourceId),
      },
      {
        checkId: 'local_data_import_jobs.by_source',
        count: readSqliteCount(deps.countImportJobsBySourceIdStmt, sourceId),
      },
      {
        checkId: 'local_instruments.by_source',
        count: readSqliteCount(
          deps.countLocalInstrumentsBySourceIdStmt,
          sourceId,
        ),
      },
      {
        checkId: 'local_data_source_diagnostics.by_source',
        count: readSqliteCount(deps.countSourceDiagnosticsBySourceIdStmt, sourceId),
      },
      {
        checkId: 'local_data_source_symbol_diagnostics.by_source',
        count: readSqliteCount(
          deps.countSourceSymbolDiagnosticsBySourceIdStmt,
          sourceId,
        ),
      },
    ]);
    await assertNoMarketDataForInstrumentIds(
      instrumentIds,
      'REMOVE_LOCAL_DATA_SOURCE',
    );
  };

  const verifySourceSymbolsRemoved = async (
    sourceId: string,
    symbols: readonly string[],
    instrumentIds: readonly string[],
  ): Promise<void> => {
    const normalizedSymbols = Array.from(
      new Set(
        symbols
          .map((symbol) => String(symbol ?? '').trim().toUpperCase())
          .filter((symbol) => Boolean(symbol)),
      ),
    );
    normalizedSymbols.forEach((symbol) => {
      assertSqliteDestructiveCountsCleared([
        {
          checkId: `local_data_source_files.by_source_symbol.${symbol}`,
          count: readSqliteCount(
            deps.countSourceFilesBySourceSymbolStmt,
            sourceId,
            symbol,
          ),
        },
        {
          checkId: `local_instruments.by_source_symbol.${symbol}`,
          count: readSqliteCount(
            deps.countLocalInstrumentsBySourceSymbolStmt,
            sourceId,
            symbol,
          ),
        },
        {
          checkId: `local_data_source_symbol_diagnostics.by_source_symbol.${symbol}`,
          count: readSqliteCount(
            deps.countSourceSymbolDiagnosticsBySourceSymbolStmt,
            sourceId,
            symbol,
          ),
        },
      ]);
    });
    await assertNoMarketDataForInstrumentIds(
      instrumentIds,
      'REMOVE_LOCAL_DATA_SOURCE_SYMBOLS',
    );
    await verifySourceSummaryMatchesMarketBars(sourceId);
  };

  return {
    verifyLocalDataSourcesCleared,
    verifyLocalDataSourceRemoved,
    verifySourceSymbolsRemoved,
  };
};
