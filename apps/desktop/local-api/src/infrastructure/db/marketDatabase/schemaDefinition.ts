// SPDX-License-Identifier: GPL-3.0-only

import { createHash } from 'node:crypto';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { nowIso } from '../../../kernel/time.js';
import { MARKET_SCHEMA_VERSION } from '../database/constants.js';
import { MARKET_PRICE_STORAGE_SQL, MARKET_VOLUME_STORAGE_SQL } from './ohlcvSql.js';

type MarketSchemaTableDefinition = {
  tableName: string;
  columns: readonly string[];
  createSql: string;
};

export type MarketSchemaConnectionProbe = {
  schemaVersion: string | null;
  isCurrent: boolean;
  schemaMatchesManifest: boolean;
  missingSchemaRequirements: string[];
};

export const MARKET_DURABLE_TABLE_NAMES = [
  'market_meta',
  'market_instruments',
  'market_bars',
] as const;

export const MARKET_DERIVED_TABLE_NAMES = [
  'market_timeline_meta',
  'market_display_bars',
  'market_display_anchors',
  'market_bar_chunk_anchors',
] as const;

export const MARKET_SCHEMA_TABLES: readonly MarketSchemaTableDefinition[] = [
  {
    tableName: 'market_meta',
    columns: ['key', 'value', 'updated_at'],
    createSql: `
      CREATE TABLE IF NOT EXISTS market_meta (
        key VARCHAR PRIMARY KEY,
        value VARCHAR NOT NULL,
        updated_at VARCHAR NOT NULL
      )
    `
  },
  {
    tableName: 'market_instruments',
    columns: ['instrument_id', 'symbol', 'bar_count', 'updated_at'],
    createSql: `
      CREATE TABLE IF NOT EXISTS market_instruments (
        instrument_id VARCHAR PRIMARY KEY,
        symbol VARCHAR NOT NULL,
        bar_count BIGINT NOT NULL DEFAULT 0,
        updated_at VARCHAR NOT NULL
      )
    `
  },
  {
    tableName: 'market_bars',
    columns: ['instrument_id', 'raw_index', 'ts_ms', 'open', 'high', 'low', 'close', 'volume'],
    createSql: `
      CREATE TABLE IF NOT EXISTS market_bars (
        instrument_id VARCHAR NOT NULL,
        raw_index BIGINT NOT NULL DEFAULT 0,
        ts_ms BIGINT NOT NULL,
        open ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
        high ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
        low ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
        close ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
        volume ${MARKET_VOLUME_STORAGE_SQL} NOT NULL
      )
    `
  },
  {
    tableName: 'market_timeline_meta',
    columns: [
      'instrument_id',
      'version_token',
      'display_period',
      'time_zone',
      'total_raw',
      'total_display',
      'build_status',
      'built_at'
    ],
    createSql: `
      CREATE TABLE IF NOT EXISTS market_timeline_meta (
        instrument_id VARCHAR NOT NULL,
        version_token VARCHAR NOT NULL,
        display_period VARCHAR NOT NULL,
        time_zone VARCHAR NOT NULL,
        total_raw BIGINT NOT NULL,
        total_display BIGINT NOT NULL,
        build_status VARCHAR NOT NULL,
        built_at VARCHAR NOT NULL
      )
    `
  },
  {
    tableName: 'market_display_bars',
    columns: [
      'instrument_id',
      'version_token',
      'display_period',
      'time_zone',
      'display_index',
      'bucket_start_ms',
      'start_raw_index',
      'end_raw_index',
      'open',
      'high',
      'low',
      'close',
      'volume'
    ],
    createSql: `
      CREATE TABLE IF NOT EXISTS market_display_bars (
        instrument_id VARCHAR NOT NULL,
        version_token VARCHAR NOT NULL,
        display_period VARCHAR NOT NULL,
        time_zone VARCHAR NOT NULL,
        display_index BIGINT NOT NULL,
        bucket_start_ms BIGINT NOT NULL,
        start_raw_index BIGINT NOT NULL,
        end_raw_index BIGINT NOT NULL,
        open ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
        high ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
        low ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
        close ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
        volume ${MARKET_VOLUME_STORAGE_SQL} NOT NULL
      )
    `
  },
  {
    tableName: 'market_display_anchors',
    columns: [
      'instrument_id',
      'version_token',
      'display_period',
      'time_zone',
      'display_index',
      'bucket_start_ms',
      'start_raw_index'
    ],
    createSql: `
      CREATE TABLE IF NOT EXISTS market_display_anchors (
        instrument_id VARCHAR NOT NULL,
        version_token VARCHAR NOT NULL,
        display_period VARCHAR NOT NULL,
        time_zone VARCHAR NOT NULL,
        display_index BIGINT NOT NULL,
        bucket_start_ms BIGINT NOT NULL,
        start_raw_index BIGINT NOT NULL
      )
    `
  },
  {
    tableName: 'market_bar_chunk_anchors',
    columns: ['instrument_id', 'chunk_start', 'start_ts_ms'],
    createSql: `
      CREATE TABLE IF NOT EXISTS market_bar_chunk_anchors (
        instrument_id VARCHAR NOT NULL,
        chunk_start BIGINT NOT NULL,
        start_ts_ms BIGINT NOT NULL
      )
    `
  }
];

type MarketSchemaManifest = {
  relations: Array<{ name: string; type: string }>;
  tables: Array<{
    name: string;
    columns: Array<{
      cid: number;
      name: string;
      type: string;
      notnull: boolean;
      defaultValue: string | null;
      pk: boolean;
    }>;
  }>;
  constraints: Array<{
    tableName: string;
    type: string;
    text: string;
    columns: string[];
    referencedTable: string | null;
    referencedColumns: string[];
  }>;
  indexes: Array<{
    name: string;
    tableName: string;
    unique: boolean;
    primary: boolean;
    expressions: string;
  }>;
};

export const PINNED_MARKET_SCHEMA_MANIFEST_SHA256 =
  '29acbb19998eb173a72ce552abe0c404ede864bda3db8291904bb4de94e4d6e9';

export const PINNED_FLOAT32_MARKET_SCHEMA_MANIFEST_SHA256 =
  '1649e96c7ecaf5ab44c5f53eeb6ccb9e3f15147c8d040867f8603ab777af9d27';

const normalizeSql = (value: unknown): string =>
  String(value ?? '').trim().replace(/\s+/gu, ' ');

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((entry) => String(entry)) : [];

const captureMarketSchemaManifest = async (
  connection: DuckDBConnection
): Promise<MarketSchemaManifest> => {
  const relationResult = await connection.run(`
    SELECT table_name, table_type
      FROM information_schema.tables
     WHERE table_catalog = current_database()
       AND table_schema = 'main'
     ORDER BY table_name ASC
  `);
  const relations = (await relationResult.getRowObjectsJS()).map((row) => ({
    name: String((row as { table_name?: unknown }).table_name ?? ''),
    type: String((row as { table_type?: unknown }).table_type ?? '').toUpperCase(),
  }));
  const tables = [] as MarketSchemaManifest['tables'];
  for (const relation of relations.filter((entry) => entry.type === 'BASE TABLE')) {
    const result = await connection.run(
      `PRAGMA table_info('${relation.name.replaceAll("'", "''")}')`
    );
    tables.push({
      name: relation.name,
      columns: (await result.getRowObjectsJS()).map((row) => {
        const column = row as Record<string, unknown>;
        return {
          cid: Number(column.cid),
          name: String(column.name ?? ''),
          type: String(column.type ?? '').toUpperCase(),
          notnull: Boolean(column.notnull),
          defaultValue:
            column.dflt_value === null || column.dflt_value === undefined
              ? null
              : normalizeSql(column.dflt_value),
          pk: Boolean(column.pk),
        };
      }),
    });
  }
  const constraintResult = await connection.run(`
    SELECT table_name, constraint_type, constraint_text,
           constraint_column_names, referenced_table, referenced_column_names
      FROM duckdb_constraints()
     WHERE database_name = current_database()
       AND schema_name = 'main'
     ORDER BY table_name ASC, constraint_index ASC
  `);
  const constraints = (await constraintResult.getRowObjectsJS()).map((row) => {
    const constraint = row as Record<string, unknown>;
    return {
      tableName: String(constraint.table_name ?? ''),
      type: String(constraint.constraint_type ?? '').toUpperCase(),
      text: normalizeSql(constraint.constraint_text),
      columns: toStringArray(constraint.constraint_column_names),
      referencedTable:
        constraint.referenced_table === null || constraint.referenced_table === undefined
          ? null
          : String(constraint.referenced_table),
      referencedColumns: toStringArray(constraint.referenced_column_names),
    };
  });
  const indexResult = await connection.run(`
    SELECT index_name, table_name, is_unique, is_primary, expressions
      FROM duckdb_indexes()
     WHERE database_name = current_database()
       AND schema_name = 'main'
     ORDER BY index_name ASC
  `);
  const indexes = (await indexResult.getRowObjectsJS()).map((row) => {
    const index = row as Record<string, unknown>;
    return {
      name: String(index.index_name ?? ''),
      tableName: String(index.table_name ?? ''),
      unique: Boolean(index.is_unique),
      primary: Boolean(index.is_primary),
      expressions: normalizeSql(index.expressions),
    };
  });
  return { relations, tables, constraints, indexes };
};

const fingerprintMarketSchemaManifest = (
  manifest: MarketSchemaManifest
): string =>
  createHash('sha256').update(JSON.stringify(manifest)).digest('hex');

export const computeMarketSchemaConnectionManifestFingerprint = async (
  connection: DuckDBConnection,
): Promise<string> =>
  fingerprintMarketSchemaManifest(await captureMarketSchemaManifest(connection));

let expectedMarketSchemaManifestPromise: Promise<MarketSchemaManifest> | null = null;

const readExpectedMarketSchemaManifest = (): Promise<MarketSchemaManifest> => {
  if (expectedMarketSchemaManifestPromise) {
    return expectedMarketSchemaManifestPromise;
  }
  expectedMarketSchemaManifestPromise = (async () => {
    const instance = await DuckDBInstance.create(':memory:');
    const connection = await instance.connect();
    try {
      await initializeCurrentMarketSchema(connection);
      const manifest = await captureMarketSchemaManifest(connection);
      const actualFingerprint = fingerprintMarketSchemaManifest(manifest);
      if (actualFingerprint !== PINNED_MARKET_SCHEMA_MANIFEST_SHA256) {
        const error = new Error('MARKET_SCHEMA_MANIFEST_DEFINITION_DRIFT');
        Object.assign(error, {
          expectedFingerprint: PINNED_MARKET_SCHEMA_MANIFEST_SHA256,
          actualFingerprint,
        });
        throw error;
      }
      return manifest;
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  })();
  return expectedMarketSchemaManifestPromise;
};

export const computeMarketSchemaManifestFingerprint = async (): Promise<string> =>
  fingerprintMarketSchemaManifest(await readExpectedMarketSchemaManifest());

const inspectMarketSchemaManifest = async (
  connection: DuckDBConnection
): Promise<string[]> => {
  const [actual, expected] = await Promise.all([
    captureMarketSchemaManifest(connection),
    readExpectedMarketSchemaManifest(),
  ]);
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    return [];
  }
  const expectedRelations = new Set(expected.relations.map((relation) => relation.name));
  const actualRelations = new Set(actual.relations.map((relation) => relation.name));
  const details = [
    ...actual.relations
      .filter((relation) => !expectedRelations.has(relation.name))
      .map((relation) => `unexpected-table:${relation.name}`),
    ...expected.relations
      .filter((relation) => !actualRelations.has(relation.name))
      .map((relation) => `missing-table:${relation.name}`),
  ];
  return details.length > 0 ? details : ['market-schema-fingerprint:mismatch'];
};

export const probeMarketSchemaConnection = async (
  connection: DuckDBConnection
): Promise<MarketSchemaConnectionProbe> => {
  let schemaVersion: string | null = null;
  try {
    const result = await connection.run(
      "SELECT value FROM market_meta WHERE key = 'market_schema_version' LIMIT 1"
    );
    const rows = (await result.getRowObjectsJS()) as Array<{ value?: unknown }>;
    schemaVersion = String(rows[0]?.value ?? '').trim() || null;
  } catch {
    schemaVersion = null;
  }

  const missingSchemaRequirements = await inspectMarketSchemaManifest(connection);
  const schemaMatchesManifest = missingSchemaRequirements.length === 0;

  return {
    schemaVersion,
    isCurrent: schemaVersion === MARKET_SCHEMA_VERSION && schemaMatchesManifest,
    schemaMatchesManifest,
    missingSchemaRequirements
  };
};

export const initializeCurrentMarketSchema = async (
  connection: DuckDBConnection
): Promise<void> => {
  for (const table of MARKET_SCHEMA_TABLES) {
    await connection.run(table.createSql);
  }
  await connection.run(`
    CREATE INDEX IF NOT EXISTS idx_market_instruments_symbol
      ON market_instruments(symbol);
    CREATE INDEX IF NOT EXISTS idx_market_bar_chunk_anchors_lookup
      ON market_bar_chunk_anchors(instrument_id, chunk_start);
    CREATE INDEX IF NOT EXISTS idx_market_bars_raw_lookup
      ON market_bars(instrument_id, raw_index);
    CREATE INDEX IF NOT EXISTS idx_market_bars_instrument_ts_lookup
      ON market_bars(instrument_id, ts_ms);
    DROP INDEX IF EXISTS idx_market_display_bars_raw_lookup;
    CREATE INDEX IF NOT EXISTS idx_market_display_bars_lookup
      ON market_display_bars(instrument_id, version_token, display_period, time_zone, display_index);
    CREATE INDEX IF NOT EXISTS idx_market_display_anchors_lookup
      ON market_display_anchors(instrument_id, version_token, display_period, time_zone, display_index);
    CREATE INDEX IF NOT EXISTS idx_market_display_anchors_raw_lookup
      ON market_display_anchors(instrument_id, version_token, display_period, time_zone, start_raw_index);
    CREATE INDEX IF NOT EXISTS idx_market_timeline_meta_lookup
      ON market_timeline_meta(instrument_id, version_token, display_period, time_zone);
    DROP INDEX IF EXISTS idx_market_bars_symbol_ts;
    DROP INDEX IF EXISTS idx_market_bars_instrument_ts;
  `);
  await connection.run(
    `INSERT INTO market_meta (key, value, updated_at)
     VALUES ('market_schema_version', ?, ?)
     ON CONFLICT (key) DO UPDATE
       SET value = excluded.value,
           updated_at = excluded.updated_at`,
    [MARKET_SCHEMA_VERSION, nowIso()]
  );
};
