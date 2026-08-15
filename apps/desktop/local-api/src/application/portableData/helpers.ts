// SPDX-License-Identifier: GPL-3.0-only

import { gzipSync, gunzipSync } from 'node:zlib';
import type Database from 'better-sqlite3';
import { INPUT_LIMITS } from '@zinuto/shared/input-limits';
import { createId } from '../../kernel/id.js';
import { nowIso } from '../../kernel/time.js';
import { appError } from '../../kernel/appError.js';
import { runtimeLimits } from '../../kernel/runtimeLimits.js';
import { isReplayNoteType, type ReplayNoteType } from '@zinuto/shared/replayNoteBuilder';
import {
  PORTABLE_EXPORT_DOMAINS,
  type PortableDateRangeFilter,
  type PortableImportConflictMode,
} from '../portableDataModel.js';
import {
  arePortablePayloadsEqual,
  toSha256,
} from '../portableDataPackage.js';

export { buildImportedTitleSuffix } from '../portableDataPackage.js';
import {
  getPortableSourceManifestBySourceId,
  insertPortablePayloadRow,
  listInstrumentSourceRows,
  listPortableSourceRowsForManifest,
  loadPortableSettingsBundleRows,
  upsertPortableSourceManifestRow,
} from '../ports/infrastructure/db/portableData/portableDataRepository.js';

import type {
  ExportSettingsBundle,
  PortableNormalizedTrainingProject,
} from './types.js';

export { PORTABLE_EXPORT_DOMAINS };
export type {
  PortableDateRangeFilter,
  PortableDomainPreview,
  PortableExportDomain,
  PortableExportManifest,
  PortableExportPreview,
  PortableExportResult,
  PortableImportConflictMode,
  PortableImportPreview,
  PortableImportPreviewDomain,
  PortableImportResult,
  PortableImportSettingsConflictMode,
  PortableMarketSourcePreview,
  PortableSnapshotPolicy,
  ReplayAvailability,
} from '../portableDataModel.js';


export const PORTABLE_HISTORY_EXPORT_BATCH_SIZE = 200;

export const normalizeText = (value: unknown): string =>
  (typeof value === 'string' ? value : String(value ?? '')).trim();

// Portable bundles can carry names longer than the destination CHECK limits
// (local source names reach 64 characters; exported fields are not
// re-validated). Mapped local names are truncated to match the archive
// write paths, while out-of-spec bundle fields are rejected with a domain
// error instead of failing mid-import with a raw SQLite CHECK violation.
const sanitizeLimitedText = (value: unknown, maxChars: number): string =>
  normalizeText(value).slice(0, maxChars);

const assertBundleTextLimit = (value: unknown, maxChars: number): string => {
  const normalized = normalizeText(value);
  if (normalized.length > maxChars) {
    throw appError('PORTABLE_DATA_IMPORT_INVALID');
  }
  return normalized;
};

export const applyRangeWhere = (
  columnName: string,
  range: PortableDateRangeFilter,
): { whereSql: string; values: unknown[] } => {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (range.from) {
    clauses.push(`${columnName} >= ?`);
    values.push(range.from);
  }
  if (range.to) {
    clauses.push(`${columnName} <= ?`);
    values.push(range.to);
  }
  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
  };
};

export const sanitizeSettingsBundle = (): ExportSettingsBundle => {
  const {
    userSettings,
    userAppPreferences: userAppPreferencesRow,
  } = loadPortableSettingsBundleRows();
  return {
    userSettings,
    userAppPreferences: userAppPreferencesRow,
  };
};

export const buildPortableSourceFingerprintHash = (input: {
  baseTimeframe?: unknown;
  timeZone?: unknown;
  timeZoneOrigin?: unknown;
  importScopeStrategy?: unknown;
  importScopeTopLevelSubfolder?: unknown;
  fieldMappingJson?: unknown;
  tradingCalendarJson?: unknown;
  fingerprintInput?: unknown;
}): string =>
  toSha256(
    [
      normalizeText(input.baseTimeframe).toLowerCase(),
      normalizeText(input.timeZone),
      normalizeText(input.timeZoneOrigin),
      normalizeText(input.importScopeStrategy),
      normalizeText(input.importScopeTopLevelSubfolder),
      normalizeText(input.fieldMappingJson),
      normalizeText(input.tradingCalendarJson),
      normalizeText(input.fingerprintInput),
    ].join('|#|'),
  );

export const listPortableSourceManifestBundles = (): Array<Record<string, unknown>> => {
  const sourceRows = listPortableSourceRowsForManifest();
  return sourceRows.map((row) => {
    const fingerprintInput = normalizeText(row.fingerprint_input);
    const storedFingerprintHash = normalizeText(row.stored_fingerprint_hash);
    return {
      id: normalizeText(row.source_id) || createId(),
      sourceId: normalizeText(row.source_id),
      sourceName: normalizeText(row.source_name),
      baseTimeframe: normalizeText(row.base_timeframe),
      timeZone: normalizeText(row.time_zone),
      timeZoneOrigin: normalizeText(row.time_zone_origin),
      importScopeStrategy: normalizeText(row.import_scope_strategy) || null,
      importScopeTopLevelSubfolder: normalizeText(row.import_scope_top_level_subfolder),
      fieldMappingJson: normalizeText(row.field_mapping_json) || '{}',
      tradingCalendarJson: normalizeText(row.trading_calendar_json),
      symbolCount: Math.max(0, Math.floor(Number(row.symbol_count ?? 0) || 0)),
      barCount: Math.max(0, Math.floor(Number(row.bar_count ?? 0) || 0)),
      timeStartTs: normalizeText(row.time_start_ts) || null,
      timeEndTs: normalizeText(row.time_end_ts) || null,
      fingerprintHash:
        storedFingerprintHash ||
        buildPortableSourceFingerprintHash({
          baseTimeframe: row.base_timeframe,
          timeZone: row.time_zone,
          timeZoneOrigin: row.time_zone_origin,
          importScopeStrategy: row.import_scope_strategy,
          importScopeTopLevelSubfolder: row.import_scope_top_level_subfolder,
          fieldMappingJson: row.field_mapping_json,
          tradingCalendarJson: row.trading_calendar_json,
          fingerprintInput,
        }),
      updatedAt: normalizeText(row.updated_at) || nowIso(),
    };
  });
};

export const buildSourceManifestHashBySourceId = (
  sourceManifests: Array<Record<string, unknown>>,
): Map<string, string> => {
  const map = new Map<string, string>();
  sourceManifests.forEach((row) => {
    const sourceId = normalizeText(row.sourceId);
    if (!sourceId) {
      return;
    }
    map.set(sourceId, normalizeText(row.fingerprintHash));
  });
  return map;
};

export const buildInstrumentSourceMap = (): Map<string, string> => {
  const rows = listInstrumentSourceRows();
  const map = new Map<string, string>();
  rows.forEach((row) => {
    const instrumentId = normalizeText(row.id);
    const sourceId = normalizeText(row.source_id);
    if (!instrumentId) {
      return;
    }
    map.set(instrumentId, sourceId);
  });
  return map;
};

export const normalizeMarketSourceIds = (
  sourceIds?: readonly string[] | null,
): string[] =>
  Array.from(
    new Set(
      (Array.isArray(sourceIds) ? sourceIds : [])
        .map((item) => normalizeText(item))
        .filter(Boolean),
    ),
  );

export const buildRelativeLedgerPath = ({
  sourceFolder,
  filePath,
  fileName,
  symbol,
}: {
  sourceFolder: string;
  filePath: string;
  fileName: string;
  symbol: string;
}): string => {
  const normalizedPath = normalizeText(filePath).replace(/\\/g, '/');
  const normalizedFolder = normalizeText(sourceFolder).replace(/\\/g, '/');
  if (normalizedPath && normalizedFolder) {
    const normalizedFolderPrefix = normalizedFolder.endsWith('/')
      ? normalizedFolder
      : `${normalizedFolder}/`;
    if (normalizedPath.startsWith(normalizedFolderPrefix)) {
      return normalizedPath.slice(normalizedFolderPrefix.length).replace(/^\/+/, '');
    }
  }
  return normalizeText(fileName) || normalizeText(symbol);
};

export const insertPayloadRow = (
  payloadDb: Database.Database,
  tableName: Parameters<typeof insertPortablePayloadRow>[0]['tableName'],
  idColumn: string,
  id: string,
  payload: unknown,
  updatedAt: string,
  extra: Record<string, unknown> = {},
): void => {
  insertPortablePayloadRow({
    payloadDb,
    tableName,
    idColumn,
    id,
    payload,
    updatedAt,
    extra,
  });
};

export const normalizePortableReplayNoteType = (value: unknown): ReplayNoteType => {
  const noteType = normalizeText(value).toUpperCase();
  if (!isReplayNoteType(noteType)) {
    throw appError('PORTABLE_DATA_IMPORT_INVALID');
  }
  return noteType;
};

export const normalizePortableTrainingProjectForImport = (
  project: Record<string, unknown>,
  input: {
    targetProjectId: string;
    targetName?: string;
    mappedSamplePoolId: string;
    mappedSamplePoolName: string;
  },
): PortableNormalizedTrainingProject => ({
  id: input.targetProjectId,
  name: assertBundleTextLimit(
    input.targetName ?? project.name ?? 'Imported Training',
    INPUT_LIMITS.generalNameChars,
  ),
  createdAt: normalizeText(project.created_at) || normalizeText(project.createdAt) || nowIso(),
  updatedAt: normalizeText(project.updated_at) || normalizeText(project.updatedAt) || nowIso(),
  symbol: assertBundleTextLimit(project.symbol, INPUT_LIMITS.symbolChars),
  samplePoolId: input.mappedSamplePoolId,
  samplePoolName: normalizeText(input.mappedSamplePoolName)
    ? sanitizeLimitedText(input.mappedSamplePoolName, INPUT_LIMITS.samplePoolNameChars)
    : assertBundleTextLimit(
        project.sample_pool_name ?? project.samplePoolName,
        INPUT_LIMITS.samplePoolNameChars,
      ),
  baseTimeframe:
    normalizeText(project.base_timeframe) ||
    normalizeText(project.baseTimeframe) ||
    '1d',
  trainingDateRange:
    normalizeText(project.training_date_range) ||
    normalizeText(project.trainingDateRange),
  initialTotal: Number(project.initial_total ?? project.initialTotal ?? 0),
  totalPnl: Number(project.total_pnl ?? project.totalPnl ?? 0),
  profitRate: Number(project.profit_rate ?? project.profitRate ?? 0),
  durationDays: Number(project.duration_days ?? project.durationDays ?? 0),
  totalTrades: Number(project.total_trades ?? project.totalTrades ?? 0),
  finalEquity: Number(project.final_equity ?? project.finalEquity ?? 0),
  equityReturnRate: Number(project.equity_return_rate ?? project.equityReturnRate ?? 0),
  simulationBatchId: normalizeText(project.simulation_batch_id)
    ? assertBundleTextLimit(project.simulation_batch_id, INPUT_LIMITS.idChars)
    : null,
  sourceTag: normalizeText(project.source_tag),
  summaryJson: normalizeText(project.summary_json) || JSON.stringify(project.summary ?? {}),
  operatorSummaryJson:
    normalizeText(project.operator_summary_json) ||
    JSON.stringify(project.operatorSummary ?? null),
});

export const normalizeOptionalNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, Math.floor(numberValue)) : null;
};

export const buildPortableReplayArchiveReplacementMap = (input: {
  projectIdMap: Map<string, string>;
  questionIdMap: Map<string, string>;
  sourceIdMap: Map<string, string>;
  instrumentIdMap: Map<string, { instrumentId: string }>;
}): Map<string, string> => {
  const replacements = new Map<string, string>();
  const setReplacement = (from: string, to: string): void => {
    const normalizedFrom = normalizeText(from);
    const normalizedTo = normalizeText(to);
    if (normalizedFrom && normalizedTo && normalizedFrom !== normalizedTo) {
      replacements.set(normalizedFrom, normalizedTo);
    }
  };
  input.projectIdMap.forEach((to, from) => setReplacement(from, to));
  input.questionIdMap.forEach((to, from) => setReplacement(from, to));
  input.sourceIdMap.forEach((to, from) => setReplacement(from, to));
  input.instrumentIdMap.forEach((binding, from) =>
    setReplacement(from, binding.instrumentId),
  );
  return replacements;
};

export const replacePortableReplayArchiveIds = (
  value: unknown,
  replacements: Map<string, string>,
): unknown => {
  if (typeof value === 'string') {
    return replacements.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replacePortableReplayArchiveIds(item, replacements));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      replacePortableReplayArchiveIds(item, replacements),
    ]),
  );
};

export const rewritePortableReplayContextArchive = (
  archive: Record<string, unknown> | null,
  replacements: Map<string, string>,
): Record<string, unknown> | null => {
  if (!archive) {
    return archive;
  }
  const encoding = normalizeText(archive.archive_encoding).toUpperCase() || 'GZIP_BINARY';
  if (encoding !== 'GZIP_BINARY') {
    throw appError('PORTABLE_DATA_IMPORT_INVALID');
  }
  const payloadRaw = normalizeText(archive.archive_payload);
  if (!payloadRaw) {
    throw appError('PORTABLE_DATA_IMPORT_INVALID');
  }
  const maxCompressedBytes = runtimeLimits.replayNoteSnapshotCompressedMaxBytes;
  const maxBase64Chars = Math.ceil(maxCompressedBytes / 3) * 4;
  if (
    payloadRaw.length > maxBase64Chars ||
    payloadRaw.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(payloadRaw)
  ) {
    throw appError('PORTABLE_DATA_IMPORT_INVALID');
  }
  let parsed: unknown;
  let compressed: Buffer;
  let sourceBytes = 0;
  try {
    compressed = Buffer.from(payloadRaw, 'base64');
    if (
      compressed.byteLength <= 0 ||
      compressed.byteLength > maxCompressedBytes ||
      compressed.toString('base64') !== payloadRaw
    ) {
      throw appError('PORTABLE_DATA_IMPORT_INVALID');
    }
    const inflated = gunzipSync(compressed, {
      maxOutputLength: runtimeLimits.replayNoteSnapshotSourceMaxBytes,
    });
    sourceBytes = inflated.byteLength;
    parsed = JSON.parse(inflated.toString('utf-8'));
  } catch {
    throw appError('PORTABLE_DATA_IMPORT_INVALID');
  }
  const rewritten = replacements.size > 0
    ? replacePortableReplayArchiveIds(parsed, replacements)
    : parsed;
  const sourceJson = JSON.stringify(rewritten ?? null);
  const rewrittenSourceBytes = Buffer.byteLength(sourceJson, 'utf-8');
  if (
    sourceBytes > runtimeLimits.replayNoteSnapshotSourceMaxBytes ||
    rewrittenSourceBytes > runtimeLimits.replayNoteSnapshotSourceMaxBytes
  ) {
    throw appError('REPLAY_NOTE_SNAPSHOT_SOURCE_TOO_LARGE', { part: 'portable-context' });
  }
  const rewrittenCompressed = replacements.size > 0
    ? gzipSync(Buffer.from(sourceJson, 'utf-8'))
    : compressed;
  if (rewrittenCompressed.byteLength > maxCompressedBytes) {
    throw appError('REPLAY_NOTE_SNAPSHOT_COMPRESSED_TOO_LARGE', { part: 'portable-context' });
  }
  if (
    Number(archive.source_bytes) !== sourceBytes
    || Number(archive.archive_bytes) !== compressed.byteLength
  ) {
    throw appError('PORTABLE_DATA_IMPORT_INVALID');
  }
  return {
    ...archive,
    archive_encoding: 'GZIP_BINARY',
    archive_payload: rewrittenCompressed.toString('base64'),
    source_bytes: rewrittenSourceBytes,
    archive_bytes: rewrittenCompressed.byteLength,
  };
};

export const remapPortableReplayNoteSourceId = (
  input: {
    sourceKind: string;
    sourceId: string;
    projectIdMap: Map<string, string>;
    questionIdMap: Map<string, string>;
  },
): string | null => {
  if (!input.sourceId) {
    return null;
  }
  if (input.sourceKind === 'SPECIAL_TRAINING_QUESTION') {
    return input.questionIdMap.get(input.sourceId) ?? input.sourceId;
  }
  if (input.sourceKind === 'TRAINING_PROJECT') {
    return input.projectIdMap.get(input.sourceId) ?? input.sourceId;
  }
  return input.sourceId;
};

export const upsertPortableSourceManifestRows = (
  rows: Array<Record<string, unknown>>,
  conflictMode: PortableImportConflictMode,
): { imported: number; skipped: number; conflicts: number } => {
  let imported = 0;
  let skipped = 0;
  let conflicts = 0;
  rows.forEach((row) => {
    const sourceId = normalizeText(row.sourceId);
    if (!sourceId) {
      skipped += 1;
      return;
    }
    const existing = getPortableSourceManifestBySourceId(sourceId);
    if (existing) {
      const same = arePortablePayloadsEqual(existing, {
        id: existing.id,
        ...row,
      });
      if (same) {
        skipped += 1;
        return;
      }
      conflicts += 1;
      if (conflictMode !== 'REPLACE_DOMAIN') {
        skipped += 1;
        return;
      }
    }
    const importedAt = nowIso();
    upsertPortableSourceManifestRow({
      id: normalizeText(row.id) || createId(),
      sourceId,
      sourceName: normalizeText(row.sourceName),
      baseTimeframe: normalizeText(row.baseTimeframe),
      timeZone: normalizeText(row.timeZone),
      symbolCount: Math.max(0, Math.floor(Number(row.symbolCount ?? 0) || 0)),
      barCount: Math.max(0, Math.floor(Number(row.barCount ?? 0) || 0)),
      timeStartTs: normalizeText(row.timeStartTs) || null,
      timeEndTs: normalizeText(row.timeEndTs) || null,
      fingerprintHash: normalizeText(row.fingerprintHash),
      createdAt: importedAt,
      updatedAt: normalizeText(row.updatedAt) || importedAt,
    });
    imported += 1;
  });
  return { imported, skipped, conflicts };
};
