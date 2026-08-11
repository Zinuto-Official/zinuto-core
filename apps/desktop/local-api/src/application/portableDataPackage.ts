// SPDX-License-Identifier: GPL-3.0-only

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { STORAGE_LAYOUT } from './ports/infrastructure/db/database.js';
import { createId } from '../kernel/id.js';
import { appError } from '../kernel/appError.js';
import {
  extractPortablePayloadFile,
  PORTABLE_TRANSFER_FORMAT_VERSION,
} from './portableDataContainer.js';
import {
  PORTABLE_EXPORT_DOMAINS,
  type PortableExportDomain,
  type PortableExportManifest,
} from './portableDataModel.js';
import {
  getPortablePayloadJsonByKey,
  readPortablePayloadRows,
  type PortablePayloadTableName,
} from './ports/infrastructure/db/portableData/portableDataRepository.js';

const PORTABLE_PAYLOAD_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS portable_export_manifest (
  manifest_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portable_export_settings (
  domain_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portable_export_custom_indicators (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portable_export_notes (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portable_export_training_projects (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  archived_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portable_export_special_training_sessions (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portable_export_special_training_questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  settled_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portable_export_source_manifests (
  source_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portable_export_market_sources (
  source_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portable_export_market_instruments (
  instrument_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portable_export_market_bars (
  instrument_id TEXT NOT NULL,
  ts_ms INTEGER NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL,
  PRIMARY KEY (instrument_id, ts_ms)
);

CREATE TABLE IF NOT EXISTS portable_export_market_file_ledgers (
  source_id TEXT NOT NULL,
  row_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(source_id, row_id)
);
`;

const normalizeText = (value: unknown): string =>
  (typeof value === 'string' ? value : String(value ?? '')).trim();

export const toSha256 = (value: Buffer | Uint8Array | string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

export const ensurePortableTempDir = async (): Promise<string> => {
  const portableTempDir = path.join(STORAGE_LAYOUT.tempDir, 'portable-data');
  await fs.mkdir(portableTempDir, { recursive: true });
  return portableTempDir;
};

export const withTempWorkingDir = async <T>(
  callback: (workingDir: string) => Promise<T>,
): Promise<T> => {
  const portableTempDir = await ensurePortableTempDir();
  const workingDir = path.join(portableTempDir, createId());
  await fs.mkdir(workingDir, { recursive: true });
  try {
    return await callback(workingDir);
  } finally {
    await fs.rm(workingDir, { recursive: true, force: true }).catch(() => undefined);
  }
};

export const createPayloadDatabase = (payloadPath: string): Database.Database => {
  const payloadDb = new Database(payloadPath);
  payloadDb.pragma('journal_mode = OFF');
  payloadDb.pragma('synchronous = OFF');
  payloadDb.pragma('temp_store = MEMORY');
  payloadDb.pragma('cache_size = -65536');
  payloadDb.pragma('locking_mode = EXCLUSIVE');
  payloadDb.exec(PORTABLE_PAYLOAD_SCHEMA_SQL);
  return payloadDb;
};

export const readBundleRows = <T>(
  payloadDb: Database.Database,
  tableName: PortablePayloadTableName,
): T[] =>
  readPortablePayloadRows<T>(payloadDb, tableName);

export const parsePayloadJson = <T>(value: unknown, fallback: T): T => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return fallback;
  }
  try {
    return (JSON.parse(normalized) as T) ?? fallback;
  } catch {
    throw appError('PORTABLE_PACKAGE_TAMPERED');
  }
};

type SqliteColumnShape = {
  name?: unknown;
  type?: unknown;
  notnull?: unknown;
  dflt_value?: unknown;
  pk?: unknown;
};

const quoteSqlIdentifier = (value: string): string =>
  `"${String(value).replaceAll('"', '""')}"`;

const readPayloadTableShapes = (
  payloadDb: Database.Database,
): Map<string, string> => {
  const tableNames = (
    payloadDb
      .prepare(
        `SELECT name
           FROM sqlite_master
          WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
          ORDER BY name ASC`,
      )
      .all() as Array<{ name?: unknown }>
  ).map((row) => normalizeText(row.name));
  return new Map(
    tableNames.map((tableName) => {
      const columns = payloadDb
        .prepare(`PRAGMA table_info(${quoteSqlIdentifier(tableName)})`)
        .all() as SqliteColumnShape[];
      return [
        tableName,
        JSON.stringify(
          columns.map((column) => ({
            name: normalizeText(column.name),
            type: normalizeText(column.type).toUpperCase(),
            notnull: Number(column.notnull ?? 0),
            defaultValue:
              column.dflt_value === null || column.dflt_value === undefined
                ? null
                : String(column.dflt_value),
            primaryKey: Number(column.pk ?? 0),
          })),
        ),
      ];
    }),
  );
};

const expectedPayloadTableShapes = (() => {
  const referenceDb = new Database(':memory:');
  try {
    referenceDb.exec(PORTABLE_PAYLOAD_SCHEMA_SQL);
    return readPayloadTableShapes(referenceDb);
  } finally {
    referenceDb.close();
  }
})();

const assertPortablePayloadDatabaseShape = (
  payloadDb: Database.Database,
): void => {
  const quickCheck = payloadDb.pragma('quick_check') as Array<
    Record<string, unknown>
  >;
  if (
    quickCheck.length !== 1 ||
    normalizeText(Object.values(quickCheck[0] ?? {})[0]).toLowerCase() !== 'ok'
  ) {
    throw appError('PORTABLE_PACKAGE_TAMPERED');
  }
  const unexpectedExecutableObjects = Number(
    payloadDb
      .prepare(
        `SELECT COUNT(*)
           FROM sqlite_master
          WHERE type IN ('trigger', 'view')`,
      )
      .pluck()
      .get() ?? 0,
  );
  const actualShapes = readPayloadTableShapes(payloadDb);
  if (
    unexpectedExecutableObjects !== 0 ||
    actualShapes.size !== expectedPayloadTableShapes.size
  ) {
    throw appError('PORTABLE_PACKAGE_TAMPERED');
  }
  for (const [tableName, expectedShape] of expectedPayloadTableShapes) {
    if (actualShapes.get(tableName) !== expectedShape) {
      throw appError('PORTABLE_PACKAGE_TAMPERED');
    }
  }
};

const countRows = (payloadDb: Database.Database, tableName: string): number =>
  Number(
    payloadDb
      .prepare(`SELECT COUNT(*) FROM ${quoteSqlIdentifier(tableName)}`)
      .pluck()
      .get() ?? 0,
  );

const DOMAIN_TABLES: Record<PortableExportDomain, string> = {
  SETTINGS: 'portable_export_settings',
  CUSTOM_INDICATORS: 'portable_export_custom_indicators',
  NOTES: 'portable_export_notes',
  TRAINING_HISTORY: 'portable_export_training_projects',
  SPECIAL_TRAINING_HISTORY: 'portable_export_special_training_sessions',
  MARKET_DATA: 'portable_export_market_sources',
};

const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean =>
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

const isNullableIsoDate = (value: unknown): boolean =>
  value === null ||
  (typeof value === 'string' &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value)));

const assertPortableManifest = ({
  manifest,
  payloadDb,
  payloadBytes,
}: {
  manifest: unknown;
  payloadDb: Database.Database;
  payloadBytes: number;
}): PortableExportManifest => {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw appError('PORTABLE_PACKAGE_TAMPERED');
  }
  const record = manifest as Record<string, unknown>;
  const expectedKeys = [
    'schemaVersion',
    'exportId',
    'exportedAt',
    'appBuildVersion',
    'selectedDomains',
    'selectedMarketSourceIds',
    'dateRange',
    'snapshotPolicy',
    'countsByDomain',
    'payloadBytes',
    'marketDataIncluded',
  ] as const;
  const selectedDomains = Array.isArray(record.selectedDomains)
    ? record.selectedDomains
    : [];
  const selectedDomainSet = new Set(selectedDomains);
  const selectedMarketSourceIds = Array.isArray(record.selectedMarketSourceIds)
    ? record.selectedMarketSourceIds
    : [];
  const dateRange =
    record.dateRange &&
    typeof record.dateRange === 'object' &&
    !Array.isArray(record.dateRange)
      ? (record.dateRange as Record<string, unknown>)
      : null;
  const counts =
    record.countsByDomain &&
    typeof record.countsByDomain === 'object' &&
    !Array.isArray(record.countsByDomain)
      ? (record.countsByDomain as Record<string, unknown>)
      : null;
  if (
    !hasExactKeys(record, expectedKeys) ||
    record.schemaVersion !== PORTABLE_TRANSFER_FORMAT_VERSION ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(normalizeText(record.exportId)) ||
    !Number.isFinite(Date.parse(normalizeText(record.exportedAt))) ||
    !normalizeText(record.appBuildVersion) ||
    selectedDomains.length !== selectedDomainSet.size ||
    selectedDomains.some(
      (domain) =>
        !PORTABLE_EXPORT_DOMAINS.includes(domain as PortableExportDomain),
    ) ||
    selectedMarketSourceIds.some(
      (sourceId) => typeof sourceId !== 'string' || !sourceId.trim(),
    ) ||
    new Set(selectedMarketSourceIds).size !== selectedMarketSourceIds.length ||
    !dateRange ||
    !hasExactKeys(dateRange, ['from', 'to']) ||
    !isNullableIsoDate(dateRange.from) ||
    !isNullableIsoDate(dateRange.to) ||
    record.snapshotPolicy !== 'EVIDENCE_ONLY' ||
    !counts ||
    !hasExactKeys(counts, PORTABLE_EXPORT_DOMAINS) ||
    !Number.isSafeInteger(record.payloadBytes) ||
    Number(record.payloadBytes) !== payloadBytes ||
    typeof record.marketDataIncluded !== 'boolean'
  ) {
    throw appError('PORTABLE_PACKAGE_TAMPERED');
  }
  for (const domain of PORTABLE_EXPORT_DOMAINS) {
    const declaredCount = counts[domain];
    const actualCount = countRows(payloadDb, DOMAIN_TABLES[domain]);
    if (
      !Number.isSafeInteger(declaredCount) ||
      Number(declaredCount) < 0 ||
      Number(declaredCount) !== actualCount ||
      (!selectedDomainSet.has(domain) && actualCount !== 0)
    ) {
      throw appError('PORTABLE_PACKAGE_TAMPERED');
    }
  }
  const hasMarketData = Number(counts.MARKET_DATA) > 0;
  const actualMarketSourceIds = (
    payloadDb
      .prepare(
        `SELECT source_id
           FROM portable_export_market_sources
          ORDER BY source_id ASC`,
      )
      .all() as Array<{ source_id?: unknown }>
  ).map((row) => normalizeText(row.source_id));
  if (
    record.marketDataIncluded !== hasMarketData ||
    (hasMarketData && !selectedDomainSet.has('MARKET_DATA')) ||
    (hasMarketData &&
      selectedMarketSourceIds.length !== Number(counts.MARKET_DATA)) ||
    JSON.stringify([...selectedMarketSourceIds].sort()) !==
      JSON.stringify(actualMarketSourceIds)
  ) {
    throw appError('PORTABLE_PACKAGE_TAMPERED');
  }
  return record as PortableExportManifest;
};

export const readPortableManifest = <TManifest>(
  payloadDb: Database.Database,
): TManifest => {
  const row = getPortablePayloadJsonByKey({
    payloadDb,
    tableName: 'portable_export_manifest',
    keyColumn: 'manifest_key',
    key: 'MANIFEST',
  });
  const manifest = parsePayloadJson<TManifest | null>(
    row?.payload_json,
    null,
  );
  if (!manifest) {
    throw appError('PORTABLE_PACKAGE_TAMPERED');
  }
  return manifest;
};

export const readPortableMarketSourcePreviewRows = <TPreview>(
  payloadDb: Database.Database,
): TPreview[] => {
  const row = getPortablePayloadJsonByKey({
    payloadDb,
    tableName: 'portable_export_manifest',
    keyColumn: 'manifest_key',
    key: 'MARKET_PREVIEW',
  });
  return parsePayloadJson<TPreview[]>(
    row?.payload_json,
    [],
  );
};

export const loadPortablePackage = async <TManifest>(
  inputPath: string,
): Promise<{
  manifest: TManifest;
  payloadDb: Database.Database;
  cleanup: () => Promise<void>;
}> => {
  const portableTempDir = await ensurePortableTempDir();
  const workingDir = path.join(portableTempDir, createId());
  await fs.mkdir(workingDir, { recursive: true });
  try {
    const payloadPath = path.join(workingDir, 'payload.sqlite');
    await extractPortablePayloadFile({
      inputPath,
      outputPath: payloadPath,
    });
    const payloadBytes = (await fs.stat(payloadPath)).size;
    const payloadDb = new Database(payloadPath, { readonly: true });
    assertPortablePayloadDatabaseShape(payloadDb);
    const manifest = assertPortableManifest({
      manifest: readPortableManifest<unknown>(payloadDb),
      payloadDb,
      payloadBytes,
    });
    return {
      manifest: manifest as TManifest,
      payloadDb,
      cleanup: async () => {
        try {
          payloadDb.close();
        } catch {
          // already closed
        }
        await fs.rm(workingDir, { recursive: true, force: true }).catch(() => undefined);
      },
    };
  } catch (error) {
    await fs.rm(workingDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
};

export const arePortablePayloadsEqual = (
  left: unknown,
  right: unknown,
): boolean => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

export const buildImportedTitleSuffix = (): string =>
  ` (Imported ${new Date().toISOString().slice(0, 10)})`;
