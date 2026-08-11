// SPDX-License-Identifier: GPL-3.0-only

import { closeMarketDatabase as closeMarketDatabaseCore } from './marketDatabase/connection.js';
import { stopMarketPrewarmRuntime } from './marketDatabase/timeline.js';

export { HOT_MARKET_TIMELINE_PREWARM_PERIODS, MARKET_DB_FILE_PATH } from './marketDatabase/constants.js';
export type {
  CsvImportColumnMapping,
  MarketDisplayBar,
  MarketInstrumentDataFootprint,
  MarketStorageFootprint,
  MarketSymbolDiagnosticsSnapshot,
  MarketTimelineBuildInput,
  ReclaimEmptyMarketStorageResult,
  TabularImportFileFormat,
} from './marketDatabase/types.js';
export { resetMarketReadDiagnostics, getMarketReadDiagnostics } from './marketDatabase/readDiagnostics.js';
export const closeMarketDatabase = async (): Promise<void> => {
  await stopMarketPrewarmRuntime();
  await closeMarketDatabaseCore();
};
export {
  checkpointMarketStorage,
  getMarketStorageBlockUsage,
  getMarketStorageFootprint,
  getMarketStorageUsageSummary,
  readMarketInstrumentDataFootprints,
  reclaimEmptyMarketStorage,
  reclaimMarketStorage,
  runMarketMaintenance,
} from './marketDatabase/storageMaintenance.js';
export {
  appendEdgeBarsForInstrumentFromCsvFile,
  appendEdgeBarsForInstrumentsFromCsvFilesBatch,
  refreshInstrumentQuestionMetaBatch,
  removeMarketInstrumentData,
  replaceMarketBarsForInstrument,
  replaceMarketBarsForInstrumentBatched,
  replaceMarketBarsForInstrumentFromCsvFile,
  replaceMarketBarsForInstrumentsFromCsvFilesBatch,
} from './marketDatabase/importWriter.js';
export type {
  CsvEdgeAppendBatchInput,
  CsvEdgeAppendBatchResult,
} from './marketDatabase/importWriter.js';
export {
  acquireMarketPrewarmQuiesceLease,
  enqueueHotMarketTimelinePrewarmForInstruments,
  ensureMarketTimelinePeriodsReady,
  ensureMarketTimelineReady,
  getMarketDisplayBarByDisplayIndex,
  getMarketDisplayBarContainingRawIndex,
  getMarketDisplayBarsByIndexRange,
  getMarketTimelineReadyPeriods,
  getMarketTimelineStorageStats,
  getMarketTimelineTotalDisplay,
  invalidateMarketPrewarmRuntime,
  scheduleMarketDatabaseWarmUp,
  scheduleMarketPrewarmTask,
  setMarketTimelinePrewarmBlocker,
  stopMarketPrewarmRuntime,
} from './marketDatabase/timeline.js';
export type {
  MarketPrewarmQuiesceLease,
  MarketPrewarmTaskContext,
} from './marketDatabase/timeline.js';
export {
  clearMarketData,
  countMarketBarsAfterUntilExclusive,
  countMarketBarsAfterUntilInclusive,
  findMarketBarRawIndexByTs,
  getFirstMarketBarTsAtOrAfter,
  getMarketBarByIndex,
  getMarketBarCount,
  getMarketBarTsByRange,
  getMarketBarsByInstrumentId,
  getMarketBarsByInstrumentIdRange,
  getMarketBarsByInstrumentIdTsRange,
  getMarketCloseAtOrBefore,
} from './marketDatabase/barReader.js';
export { getMarketSymbolDiagnosticsSnapshot } from './marketDatabase/diagnostics.js';
