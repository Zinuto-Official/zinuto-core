// SPDX-License-Identifier: GPL-3.0-only

import {
  assertTradingCalendarConfig,
  serializeTradingCalendarConfig,
  type TradingCalendarConfig,
} from '@zinuto/shared/tradingCalendar';
import { appError } from '../../kernel/appError.js';
import type { LocalDataSourceSummary } from './types.js';
import {
  isTradingCalendarValidForLocalDataImport,
  normalizeTradingCalendarForLocalDataImport,
} from './importDraftValidation.js';

type BaseTimeframe = '1m' | '5m' | '1h' | '1d';

type TradingCalendarSourceRow = {
  baseTimeframe: BaseTimeframe;
};

export const createLocalDataSourceTradingCalendarUpdateService = ({
  assertLocalImportMutationAccess,
  countActiveJobsBySource,
  getSourceBaseTimeframe,
  invalidateLocalDataSourcesCache,
  invalidateMarketReadCaches,
  listLocalDataSources,
  listLocalInstrumentIdsBySource,
  listSystemSeedPoolIds,
  nowIso,
  persistTradingCalendar,
  scheduleLocalDataSourceDiagnosticsRebuild,
}: {
  assertLocalImportMutationAccess: (sourceId: string) => Promise<void>;
  countActiveJobsBySource: (sourceId: string) => number;
  getSourceBaseTimeframe: (sourceId: string) => TradingCalendarSourceRow | undefined;
  invalidateLocalDataSourcesCache: () => void;
  invalidateMarketReadCaches: (instrumentId: string) => void;
  listLocalDataSources: () => Promise<LocalDataSourceSummary[]>;
  listLocalInstrumentIdsBySource: (sourceId: string) => string[];
  listSystemSeedPoolIds: () => string[];
  nowIso: () => string;
  persistTradingCalendar: (sourceId: string, tradingCalendarJson: string, updatedAt: string) => void;
  scheduleLocalDataSourceDiagnosticsRebuild: (sourceId: string) => void;
}) => async (
  sourceIdRaw: string,
  input: TradingCalendarConfig,
): Promise<LocalDataSourceSummary> => {
  const sourceId = String(sourceIdRaw ?? '').trim();
  await assertLocalImportMutationAccess(sourceId);
  const source = getSourceBaseTimeframe(sourceId);
  if (!source) {
    if (listSystemSeedPoolIds().includes(sourceId)) {
      throw appError('LOCAL_DATA_SOURCE_PROFILE_LOCKED', { sourceId }, 409);
    }
    throw appError('LOCAL_DATA_SOURCE_NOT_FOUND', { sourceId }, 404);
  }
  if (countActiveJobsBySource(sourceId) > 0) {
    throw appError('LOCAL_DATA_IMPORT_JOB_ACTIVE');
  }
  let tradingCalendar: TradingCalendarConfig;
  try {
    tradingCalendar = assertTradingCalendarConfig(input);
  } catch {
    throw appError('LOCAL_DATA_TRADING_CALENDAR_INVALID');
  }
  if (!isTradingCalendarValidForLocalDataImport(tradingCalendar, source.baseTimeframe)) {
    throw appError('LOCAL_DATA_TRADING_CALENDAR_INVALID');
  }
  tradingCalendar = normalizeTradingCalendarForLocalDataImport(
    tradingCalendar,
    source.baseTimeframe,
  );
  const updatedAt = nowIso();
  const instrumentIds = listLocalInstrumentIdsBySource(sourceId);
  persistTradingCalendar(
    sourceId,
    serializeTradingCalendarConfig(tradingCalendar),
    updatedAt,
  );
  instrumentIds.forEach(invalidateMarketReadCaches);
  invalidateLocalDataSourcesCache();
  scheduleLocalDataSourceDiagnosticsRebuild(sourceId);
  const updated = (await listLocalDataSources()).find((item) => item.id === sourceId);
  if (!updated) {
    throw appError('LOCAL_DATA_SOURCE_NOT_FOUND', { sourceId }, 404);
  }
  return updated;
};
