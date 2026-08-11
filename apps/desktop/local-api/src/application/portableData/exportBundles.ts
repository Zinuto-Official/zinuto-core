// SPDX-License-Identifier: GPL-3.0-only

import {
  countSpecialTrainingQuestionsBySourceId,
  countTrainingProjectReplayRefsBySourceId,
  listPortableMarketInstrumentRows,
  listPortableMarketLatestLedgerRows,
  listPortableMarketSourceRows,
} from '../ports/infrastructure/db/portableData/portableDataRepository.js';

import type {
  ExportMarketSourceBundle,
  ExportMarketInstrumentBundle,
  ExportMarketFileLedgerBundle,
} from './types.js';

import {
  normalizeText,
  listPortableSourceManifestBundles,
  buildRelativeLedgerPath,
  normalizeMarketSourceIds,
  sanitizeSettingsBundle,
  applyRangeWhere,
} from './helpers.js';

import {
  getPortableCustomIndicatorPreviewStats,
  getPortableNotesPreviewStats,
  getPortableTrainingHistoryPreviewStats,
  getPortableSpecialTrainingHistoryPreviewStats,
} from '../ports/infrastructure/db/portableData/portableDataRepository.js';

import { nowIso } from '../../kernel/time.js';
import { createId } from '../../kernel/id.js';

import type {
  PortableDateRangeFilter,
  PortableDomainPreview,
  PortableExportDomain,
  PortableExportPreview,
  PortableMarketSourcePreview,
} from '../portableDataModel.js';
import { normalizeDomains } from '../portableDataModel.js';

export const listPortableMarketSourceBundles = (
  selectedSourceIds: readonly string[],
): {
  sourceBundles: ExportMarketSourceBundle[];
  instrumentBundles: ExportMarketInstrumentBundle[];
  fileLedgerBundles: ExportMarketFileLedgerBundle[];
  previews: PortableMarketSourcePreview[];
} => {
  const normalizedSourceIds = normalizeMarketSourceIds(selectedSourceIds);
  if (!normalizedSourceIds.length) {
    return {
      sourceBundles: [],
      instrumentBundles: [],
      fileLedgerBundles: [],
      previews: [],
    };
  }
  const sourceRows = listPortableMarketSourceRows(normalizedSourceIds);
  const instrumentRows = listPortableMarketInstrumentRows(normalizedSourceIds);
  const latestLedgerRows = listPortableMarketLatestLedgerRows(normalizedSourceIds);
  const sourceManifestById = new Map(
    listPortableSourceManifestBundles().map((row) => [
      normalizeText(row.sourceId),
      row,
    ]),
  );
  const trainingCountRows =
    countTrainingProjectReplayRefsBySourceId(normalizedSourceIds);
  const specialCountRows =
    countSpecialTrainingQuestionsBySourceId(normalizedSourceIds);
  const trainingCountBySourceId = new Map(
    trainingCountRows.map((row) => [
      normalizeText(row.source_id),
      Math.max(0, Math.floor(Number(row.count ?? 0) || 0)),
    ]),
  );
  const specialCountBySourceId = new Map(
    specialCountRows.map((row) => [
      normalizeText(row.source_id),
      Math.max(0, Math.floor(Number(row.count ?? 0) || 0)),
    ]),
  );
  const sourceRowsById = new Map(
    sourceRows.map((row) => [normalizeText(row.id), row]),
  );
  const sourceBundles = sourceRows.map<ExportMarketSourceBundle>((row) => {
    const sourceId = normalizeText(row.id);
    const manifest = sourceManifestById.get(sourceId);
    return {
      sourceId,
      sourceName: normalizeText(row.name),
      baseTimeframe: normalizeText(row.base_timeframe),
      timeZone: normalizeText(row.time_zone),
      timeZoneOrigin: normalizeText(row.time_zone_origin),
      importScopeStrategy: normalizeText(row.import_scope_strategy) || null,
      importScopeTopLevelSubfolder: normalizeText(row.import_scope_top_level_subfolder),
      fieldMappingJson: normalizeText(row.field_mapping_json) || '{}',
      tradingCalendarJson: normalizeText(row.trading_calendar_json),
      symbolCount: Math.max(0, Math.floor(Number(row.symbol_count ?? 0) || 0)),
      barCount: Math.max(0, Math.floor(Number(row.bar_count ?? 0) || 0)),
      storageBytes: Math.max(0, Math.floor(Number(row.storage_bytes ?? 0) || 0)),
      timeStartTs: normalizeText(row.time_start_ts) || null,
      timeEndTs: normalizeText(row.time_end_ts) || null,
      fingerprintHash: normalizeText(manifest?.fingerprintHash),
      createdAt: normalizeText(row.created_at) || nowIso(),
      updatedAt: normalizeText(row.updated_at) || nowIso(),
    };
  });
  const instrumentBundles = instrumentRows.map<ExportMarketInstrumentBundle>((row) => ({
    exportInstrumentId: normalizeText(row.id),
    sourceId: normalizeText(row.source_id),
    symbol: normalizeText(row.symbol),
    baseTimeframe: normalizeText(row.base_timeframe) || '1d',
    name: normalizeText(row.name) || normalizeText(row.symbol),
    market: normalizeText(row.market) || 'LOCAL',
    timeZone: normalizeText(row.time_zone) || null,
    minTradeStep: Number(row.min_trade_step ?? 0),
    barCount: Math.max(0, Math.floor(Number(row.bar_count ?? 0) || 0)),
    timeStartTs: normalizeText(row.time_start_ts) || null,
    timeEndTs: normalizeText(row.time_end_ts) || null,
    barsVersionToken: normalizeText(row.bars_version_token),
    createdAt: normalizeText(row.created_at) || nowIso(),
  }));
  const fileLedgerBundles = latestLedgerRows.map<ExportMarketFileLedgerBundle>((row) => {
    const sourceId = normalizeText(row.source_id);
    const sourceRow = sourceRowsById.get(sourceId);
    const fileName = normalizeText(row.file_name);
    const symbol = normalizeText(row.symbol);
    return {
      sourceId,
      rowId:
        buildRelativeLedgerPath({
          sourceFolder: normalizeText(sourceRow?.source_folder),
          filePath: normalizeText(row.file_path),
          fileName,
          symbol,
        }) || createId(),
      exportInstrumentId: normalizeText(row.instrument_id),
      symbol,
      fileName,
      relativePath: buildRelativeLedgerPath({
        sourceFolder: normalizeText(sourceRow?.source_folder),
        filePath: normalizeText(row.file_path),
        fileName,
        symbol,
      }),
      fileSize: Math.max(0, Math.floor(Number(row.file_size ?? 0) || 0)),
      fileMtimeMs: Math.max(0, Math.floor(Number(row.file_mtime_ms ?? 0) || 0)),
      fileFingerprint: normalizeText(row.file_fingerprint),
      updatedAt: normalizeText(row.updated_at) || nowIso(),
    };
  });
  const previews = sourceBundles.map<PortableMarketSourcePreview>((row) => ({
    sourceId: row.sourceId,
    sourceName: row.sourceName,
    baseTimeframe: row.baseTimeframe,
    timeZone: row.timeZone,
    symbolCount: row.symbolCount,
    barCount: row.barCount,
    estimatedBytes:
      row.storageBytes > 0
        ? row.storageBytes
        : Math.max(0, row.barCount * 64 + row.symbolCount * 256),
    linkedTrainingProjectCount: trainingCountBySourceId.get(row.sourceId) ?? 0,
    linkedSpecialTrainingQuestionCount:
      specialCountBySourceId.get(row.sourceId) ?? 0,
  }));
  return {
    sourceBundles,
    instrumentBundles,
    fileLedgerBundles,
    previews,
  };
};

export const collectPortableExportPreview = (
  domains: readonly PortableExportDomain[],
  range: PortableDateRangeFilter,
  marketSourceIds: readonly string[],
): PortableExportPreview => {
  const normalizedDomains = normalizeDomains(domains);
  const marketSourceBundles = listPortableMarketSourceBundles(marketSourceIds);
  const previews = normalizedDomains.map<PortableDomainPreview>((domain) => {
    switch (domain) {
      case 'SETTINGS':
        return {
          domain,
          itemCount: 2,
          estimatedBytes: Buffer.byteLength(JSON.stringify(sanitizeSettingsBundle()), 'utf-8'),
          includesEvidenceSnapshots: false,
          needsRebindAfterImport: false,
        };
      case 'CUSTOM_INDICATORS': {
        const where = applyRangeWhere('updated_at', range);
        const row = getPortableCustomIndicatorPreviewStats(where);
        return {
          domain,
          itemCount: Math.max(0, Math.floor(Number(row?.count ?? 0) || 0)),
          estimatedBytes: Math.max(0, Math.floor(Number(row?.bytes ?? 0) || 0)),
          includesEvidenceSnapshots: false,
          needsRebindAfterImport: false,
        };
      }
      case 'NOTES': {
        const where = applyRangeWhere('updated_at', range);
        const row = getPortableNotesPreviewStats(where);
        return {
          domain,
          itemCount: Math.max(0, Math.floor(Number(row?.count ?? 0) || 0)),
          estimatedBytes: Math.max(0, Math.floor(Number(row?.bytes ?? 0) || 0)),
          includesEvidenceSnapshots: true,
          needsRebindAfterImport: false,
        };
      }
      case 'TRAINING_HISTORY': {
        const where = applyRangeWhere('created_at', range);
        const row = getPortableTrainingHistoryPreviewStats(where);
        return {
          domain,
          itemCount: Math.max(0, Math.floor(Number(row?.count ?? 0) || 0)),
          estimatedBytes: Math.max(0, Math.floor(Number(row?.bytes ?? 0) || 0)),
          includesEvidenceSnapshots: true,
          needsRebindAfterImport: true,
        };
      }
      case 'SPECIAL_TRAINING_HISTORY': {
        const where = applyRangeWhere('finished_at', range);
        const row = getPortableSpecialTrainingHistoryPreviewStats(where);
        return {
          domain,
          itemCount: Math.max(0, Math.floor(Number(row?.count ?? 0) || 0)),
          estimatedBytes: Math.max(0, Math.floor(Number(row?.bytes ?? 0) || 0)),
          includesEvidenceSnapshots: true,
          needsRebindAfterImport: true,
        };
      }
      case 'MARKET_DATA': {
        return {
          domain,
          itemCount: marketSourceBundles.previews.length,
          estimatedBytes: marketSourceBundles.previews.reduce(
            (sum, item) => sum + item.estimatedBytes,
            0,
          ),
          includesEvidenceSnapshots: false,
          needsRebindAfterImport: true,
        };
      }
      default:
        return {
          domain,
          itemCount: 0,
          estimatedBytes: 0,
          includesEvidenceSnapshots: false,
          needsRebindAfterImport: false,
        };
    }
  });
  return {
    domains: previews,
    marketSources: marketSourceBundles.previews,
    totalItems: previews.reduce((sum, item) => sum + item.itemCount, 0),
    estimatedBytes: previews.reduce((sum, item) => sum + item.estimatedBytes, 0),
    snapshotPolicy: 'EVIDENCE_ONLY',
    dateRange: range,
  };
};
