// SPDX-License-Identifier: GPL-3.0-only

import type { LocalDataSourceSummary } from './types.js';
import {
  LOCAL_DATA_SOURCE_FAILED_LOCK_REASON,
  LOCAL_DATA_SOURCE_IMPORTING_LOCK_REASON,
  LOCAL_DATA_SOURCE_MUTATION_LOCK_REASON,
} from './types.js';

type OperationAccessErrorFactory = (
  code: string,
  args?: Record<string, string | number | boolean | null>,
  status?: number,
) => Error;

type LocalDataSourceAccessSource = Pick<
  LocalDataSourceSummary,
  'id' | 'createdAt' | 'symbols' | 'baseTimeframe' | 'status'
>;

type LocalImportSourceAccess = {
  id: string;
  sourceLocked: boolean;
  unlockedSymbols: string[];
  lockedSymbols: string[];
  lockedSymbolCount: number;
  lockReason: string | null;
};

const normalizeSourceSymbols = (
  symbols: readonly string[] | undefined,
): string[] =>
  Array.from(
    new Set(
      (Array.isArray(symbols) ? symbols : [])
        .map((symbol) => String(symbol ?? '').trim().toUpperCase())
        .filter((symbol) => Boolean(symbol)),
    ),
  );

const hasOperationalFootprint = (
  source: Pick<LocalDataSourceSummary, 'symbols' | 'status'>,
): boolean =>
  source.status === 'IMPORTING' ||
  normalizeSourceSymbols(source.symbols).length > 0;

export const buildLocalDataSourceAccessMap = ({
  items,
  symbolOrderBySourceId,
}: {
  items: LocalDataSourceAccessSource[];
  symbolOrderBySourceId: Map<string, string[]>;
}): Map<string, LocalImportSourceAccess> =>
  new Map(
    items
      .filter((item) => hasOperationalFootprint(item))
      .map((item) => ({
        id: item.id,
        sourceLocked: false,
        unlockedSymbols: normalizeSourceSymbols(
          symbolOrderBySourceId.get(item.id) ?? item.symbols,
        ),
        lockedSymbols: [],
        lockedSymbolCount: 0,
        lockReason: null,
      }))
      .map((item) => [item.id, item]),
  );

export const applyOperationalAccessToLocalDataSources = ({
  items,
  symbolOrderBySourceId,
}: {
  items: LocalDataSourceSummary[];
  symbolOrderBySourceId: Map<string, string[]>;
}): LocalDataSourceSummary[] => {
  const accessMap = buildLocalDataSourceAccessMap({
    items,
    symbolOrderBySourceId,
  });
  return items.map((item) => {
    const access = accessMap.get(item.id);
    const operationallyLocked = item.sourceLocked === true;
    const operationalLockedSymbols =
      item.lockedSymbols.length > 0 ? item.lockedSymbols : item.symbols;
    if (operationallyLocked) {
      return {
        ...item,
        sourceLocked: true,
        unlockedSymbols: [],
        lockedSymbols: operationalLockedSymbols,
        lockedSymbolCount: Math.max(
          item.lockedSymbolCount,
          operationalLockedSymbols.length,
        ),
        lockReason:
          item.lockReason ??
          access?.lockReason ??
          LOCAL_DATA_SOURCE_IMPORTING_LOCK_REASON,
      };
    }
    return {
      ...item,
      sourceLocked: access?.sourceLocked ?? false,
      unlockedSymbols: access?.unlockedSymbols ?? item.unlockedSymbols,
      lockedSymbols: access?.lockedSymbols ?? item.lockedSymbols,
      lockedSymbolCount: access?.lockedSymbolCount ?? item.lockedSymbolCount,
      lockReason: access?.lockReason ?? item.lockReason,
    };
  });
};

export const assertLocalImportOperationalAccessForSources = ({
  sourceIdRaw,
  sources,
  appError,
}: {
  sourceIdRaw?: string;
  sources: Array<
    Pick<
      LocalDataSourceSummary,
      'id' | 'sourceLocked' | 'symbols' | 'status' | 'lockReason'
    >
  >;
  appError: OperationAccessErrorFactory;
}): void => {
  const normalizedSourceId = String(sourceIdRaw ?? '').trim();
  if (!normalizedSourceId) {
    return;
  }
  const matchedSource = sources.find(
    (source) => String(source.id ?? '').trim() === normalizedSourceId,
  );
  if (!matchedSource) {
    throw appError('LOCAL_DATA_SOURCE_NOT_FOUND', { sourceId: normalizedSourceId }, 404);
  }
  if (
    matchedSource.status === 'IMPORTING' ||
    String(matchedSource.lockReason ?? '').trim() ===
      LOCAL_DATA_SOURCE_IMPORTING_LOCK_REASON
  ) {
    throw appError('LOCAL_DATA_IMPORT_JOB_ACTIVE', { sourceId: normalizedSourceId }, 409);
  }
  if (
    String(matchedSource.lockReason ?? '').trim() ===
    LOCAL_DATA_SOURCE_MUTATION_LOCK_REASON
  ) {
    throw appError(
      'LOCAL_DATA_SOURCE_MUTATION_IN_PROGRESS',
      { sourceId: normalizedSourceId },
      409,
    );
  }
  if (
    matchedSource.sourceLocked &&
    String(matchedSource.lockReason ?? '').trim() ===
      LOCAL_DATA_SOURCE_FAILED_LOCK_REASON
  ) {
    throw appError('LOCAL_DATA_SOURCE_NOT_READY', { sourceId: normalizedSourceId }, 409);
  }
};
