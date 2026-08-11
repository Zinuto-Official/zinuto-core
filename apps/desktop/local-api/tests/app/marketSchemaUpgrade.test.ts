// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { MARKET_SCHEMA_VERSION } from '../../src/infrastructure/db/database/constants.js';
import type { DesktopStorageLayout } from '../../src/infrastructure/db/database/location.js';
import {
  computeMarketSchemaManifestFingerprint,
  PINNED_MARKET_SCHEMA_MANIFEST_SHA256,
} from '../../src/infrastructure/db/marketDatabase/schemaDefinition.js';
import {
  FLOAT32_MARKET_SCHEMA_VERSION,
  LEGACY_MARKET_SCHEMA_VERSION,
  MARKET_SCHEMA_UPGRADE_JOURNAL_SUFFIX,
  probeAndUpgradeMarketSchema,
} from '../../src/infrastructure/db/marketDatabase/schemaUpgrade.js';

const fixtureSql = fs.readFileSync(
  path.join(
    import.meta.dirname,
    '..',
    'fixtures',
    'market-schema',
    '2026-05-18-trading-calendar-timeline-v1.sql',
  ),
  'utf8',
);

const createLayout = (): { layout: DesktopStorageLayout; cleanup: () => void } => {
  const appRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zinuto-market-upgrade-'));
  const coreDataDir = path.join(appRootDir, 'data', 'core');
  const marketDataDir = path.join(appRootDir, 'data', 'market');
  const cacheDir = path.join(appRootDir, 'cache');
  const tempDir = path.join(appRootDir, 'temp');
  const duckdbTempDir = path.join(tempDir, 'duckdb-tmp');
  for (const dirPath of [
    coreDataDir,
    marketDataDir,
    cacheDir,
    tempDir,
    duckdbTempDir,
  ]) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return {
    layout: {
      appRootDir,
      coreDataDir,
      marketDataDir,
      cacheDir,
      tempDir,
      dbPath: path.join(coreDataDir, 'zinuto.db'),
      marketDbPath: path.join(marketDataDir, 'zinuto.market.duckdb'),
      duckdbTempDir,
    },
    cleanup: () => fs.rmSync(appRootDir, { recursive: true, force: true }),
  };
};

const withConnection = async <T>(
  dbPath: string,
  task: (connection: DuckDBConnection) => Promise<T>,
): Promise<T> => {
  const instance = await DuckDBInstance.create(dbPath);
  const connection = await instance.connect();
  try {
    return await task(connection);
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
};

const createHistoricalDatabase = async (dbPath: string): Promise<void> => {
  await withConnection(dbPath, async (connection) => {
    await connection.run(fixtureSql);
    await connection.run(`
      INSERT INTO market_instruments (instrument_id, symbol, bar_count, updated_at)
      VALUES
        ('instrument-aapl', 'AAPL', 3, '2026-05-18T01:00:00.000Z'),
        ('instrument-empty', 'EMPTY', 0, '2026-05-18T01:01:00.000Z');

      INSERT INTO market_bars (
        instrument_id, raw_index, ts_ms, open, high, low, close, volume
      ) VALUES
        ('instrument-aapl', 0, 1710000000000, 10.25, 11.5, 9.75, 11.0, 100.5),
        ('instrument-aapl', 1, 1710000060000, 11.0, 12.25, 10.5, 12.0, 200.25),
        ('instrument-aapl', 2, 1710000120000, 12.0, 12.5, 11.25, 11.75, 300.75);

      INSERT INTO market_timeline_meta
      VALUES ('instrument-aapl', 'legacy-token', '1d', 'UTC', 3, 1, 'READY', '2026-05-18T02:00:00.000Z');
      INSERT INTO market_display_bars
      VALUES ('instrument-aapl', 'legacy-token', '1d', 'UTC', 0, 1710000000000, 0, 2, 10.25, 12.5, 9.75, 11.75, 601.5);
      INSERT INTO market_display_anchors
      VALUES ('instrument-aapl', 'legacy-token', '1d', 'UTC', 0, 1710000000000, 0);
      INSERT INTO market_bar_chunk_anchors
      VALUES ('instrument-aapl', 0, 1710000000000);
      CHECKPOINT;
    `);
  });
};

const fileDigest = (filePath: string): string =>
  createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

type JournalIdentity = {
  schemaVersion: string;
  contentSha256: string;
  instrumentCount: number;
  totalBars: string;
};

const readMarketIdentity = async (
  dbPath: string,
  schemaVersion: string,
  identityHashMode: 'CANONICAL_DOUBLE' | 'NATIVE' = 'CANONICAL_DOUBLE',
): Promise<JournalIdentity> =>
  withConnection(dbPath, async (connection) => {
    const instrumentResult = await connection.run(
      `SELECT instrument_id, symbol, bar_count, updated_at
         FROM market_instruments
        ORDER BY instrument_id ASC`,
    );
    const instruments = (await instrumentResult.getRowObjectsJS()).map((row) => ({
      instrumentId: String((row as { instrument_id?: unknown }).instrument_id ?? ''),
      symbol: String((row as { symbol?: unknown }).symbol ?? ''),
      barCount: String((row as { bar_count?: unknown }).bar_count ?? '0'),
      updatedAt: String((row as { updated_at?: unknown }).updated_at ?? ''),
    }));
    const canonicalValue = (columnName: string): string =>
      identityHashMode === 'CANONICAL_DOUBLE'
        ? `CAST(${columnName} AS DOUBLE)`
        : columnName;
    const rangeResult = await connection.run(
      `SELECT instrument_id,
              COUNT(*) AS bar_count,
              MIN(ts_ms) AS min_ts_ms,
              MAX(ts_ms) AS max_ts_ms,
              BIT_XOR(HASH(
                raw_index,
                ts_ms,
                ${canonicalValue('open')},
                ${canonicalValue('high')},
                ${canonicalValue('low')},
                ${canonicalValue('close')},
                ${canonicalValue('volume')}
              )) AS content_hash_xor,
              SUM(CAST(HASH(
                raw_index,
                ts_ms,
                ${canonicalValue('open')},
                ${canonicalValue('high')},
                ${canonicalValue('low')},
                ${canonicalValue('close')},
                ${canonicalValue('volume')}
              ) AS HUGEINT)) AS content_hash_sum
         FROM market_bars
        GROUP BY instrument_id
        ORDER BY instrument_id ASC`,
    );
    const barsByInstrument = (await rangeResult.getRowObjectsJS()).map((row) => ({
      instrumentId: String((row as { instrument_id?: unknown }).instrument_id ?? ''),
      barCount: String((row as { bar_count?: unknown }).bar_count ?? '0'),
      minTsMs:
        (row as { min_ts_ms?: unknown }).min_ts_ms == null
          ? null
          : String((row as { min_ts_ms?: unknown }).min_ts_ms),
      maxTsMs:
        (row as { max_ts_ms?: unknown }).max_ts_ms == null
          ? null
          : String((row as { max_ts_ms?: unknown }).max_ts_ms),
      contentHashXor: String(
        (row as { content_hash_xor?: unknown }).content_hash_xor ?? '0',
      ),
      contentHashSum: String(
        (row as { content_hash_sum?: unknown }).content_hash_sum ?? '0',
      ),
    }));
    const totalResult = await connection.run(
      'SELECT COUNT(*) AS total_bars FROM market_bars',
    );
    const totalRows = await totalResult.getRowObjectsJS();
    const totalBars = String(
      (totalRows[0] as { total_bars?: unknown } | undefined)?.total_bars ?? '0',
    );
    const snapshot = { instruments, barsByInstrument, totalBars };
    return {
      schemaVersion,
      contentSha256: createHash('sha256')
        .update(JSON.stringify(snapshot))
        .digest('hex'),
      instrumentCount: instruments.length,
      totalBars,
    };
  });

const writeUpgradeJournal = ({
  sourcePath,
  tempPath,
  backupPath,
  failedPath,
  phase,
  oldIdentity,
  newIdentity,
  formatVersion = 3,
  fromSchemaVersion = LEGACY_MARKET_SCHEMA_VERSION,
}: {
  sourcePath: string;
  tempPath: string;
  backupPath: string;
  failedPath: string;
  phase:
    | 'PREPARING'
    | 'TARGET_VALIDATED'
    | 'SWITCHING'
    | 'SOURCE_BACKED_UP'
    | 'TARGET_INSTALLED'
    | 'VERIFIED';
  oldIdentity: JournalIdentity;
  newIdentity: JournalIdentity | null;
  formatVersion?: 2 | 3;
  fromSchemaVersion?: string;
}): void => {
  fs.writeFileSync(
    `${sourcePath}${MARKET_SCHEMA_UPGRADE_JOURNAL_SUFFIX}`,
    `${JSON.stringify({
      formatVersion,
      sourcePath,
      tempPath,
      backupPath,
      failedPath,
      fromSchemaVersion,
      phase,
      oldIdentity,
      newIdentity,
    })}\n`,
  );
};

const makeDirectoryOpenError = (code: string): NodeJS.ErrnoException => {
  const error = new Error(code) as NodeJS.ErrnoException;
  error.code = code;
  return error;
};

const replaceDirectoryOpen = (
  directoryPath: string,
  code: string,
): (() => void) => {
  const originalOpenSync = fs.openSync;
  fs.openSync = ((filePath: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
    if (path.resolve(String(filePath)) === path.resolve(directoryPath) && flags === 'r') {
      throw makeDirectoryOpenError(code);
    }
    return originalOpenSync(filePath, flags, mode);
  }) as typeof fs.openSync;
  return () => {
    fs.openSync = originalOpenSync;
  };
};

const listUpgradeBackups = (dbPath: string): string[] =>
  fs
    .readdirSync(path.dirname(dbPath))
    .filter((name) => name.startsWith(`${path.basename(dbPath)}.pre-upgrade-`))
    .sort();

const listFailedUpgradeCandidates = (dbPath: string): string[] =>
  fs
    .readdirSync(path.dirname(dbPath))
    .filter((name) => name.startsWith(`${path.basename(dbPath)}.failed-upgrade-`))
    .sort();

test('market schema manifest matches its immutable fingerprint', async () => {
  assert.equal(
    await computeMarketSchemaManifestFingerprint(),
    PINNED_MARKET_SCHEMA_MANIFEST_SHA256,
  );
});

test('allowlisted historical market schema upgrades atomically with lossless raw data', async () => {
  const { layout, cleanup } = createLayout();
  try {
    await createHistoricalDatabase(layout.marketDbPath);
    const phases: string[] = [];
    const result = await probeAndUpgradeMarketSchema(layout, {
      onProgress: (phase) => phases.push(phase),
    });
    assert.equal(result.status, 'UPGRADED');
    assert.equal(result.schemaVersion, MARKET_SCHEMA_VERSION);
    assert.equal(result.isCurrent, true);
    assert.equal(result.issueReason, null);
    assert.ok(result.backupPath);
    assert.equal(fs.existsSync(result.backupPath), true);
    assert.deepEqual(phases, [
      'PROBING',
      'COPYING',
      'VALIDATING',
      'SWITCHING',
      'VALIDATING',
    ]);

    await withConnection(layout.marketDbPath, async (connection) => {
      const versionResult = await connection.run(
        "SELECT value FROM market_meta WHERE key = 'market_schema_version'",
      );
      const versionRows = await versionResult.getRowObjectsJS();
      assert.equal(String((versionRows[0] as { value?: unknown }).value), MARKET_SCHEMA_VERSION);

      const instrumentResult = await connection.run(
        'SELECT instrument_id, symbol, bar_count, updated_at FROM market_instruments ORDER BY instrument_id',
      );
      assert.deepEqual(await instrumentResult.getRowObjectsJS(), [
        {
          instrument_id: 'instrument-aapl',
          symbol: 'AAPL',
          bar_count: 3n,
          updated_at: '2026-05-18T01:00:00.000Z',
        },
        {
          instrument_id: 'instrument-empty',
          symbol: 'EMPTY',
          bar_count: 0n,
          updated_at: '2026-05-18T01:01:00.000Z',
        },
      ]);
      const rangeResult = await connection.run(
        `SELECT instrument_id, COUNT(*) AS count, MIN(ts_ms) AS min_ts, MAX(ts_ms) AS max_ts
           FROM market_bars GROUP BY instrument_id`,
      );
      assert.deepEqual(await rangeResult.getRowObjectsJS(), [
        {
          instrument_id: 'instrument-aapl',
          count: 3n,
          min_ts: 1710000000000n,
          max_ts: 1710000120000n,
        },
      ]);
      const valueResult = await connection.run(
        `SELECT raw_index, CAST(open AS DOUBLE) AS open, CAST(volume AS DOUBLE) AS volume
           FROM market_bars ORDER BY raw_index`,
      );
      assert.deepEqual(await valueResult.getRowObjectsJS(), [
        { raw_index: 0n, open: 10.25, volume: 100.5 },
        { raw_index: 1n, open: 11, volume: 200.25 },
        { raw_index: 2n, open: 12, volume: 300.75 },
      ]);
      const derivedResult = await connection.run(`
        SELECT
          (SELECT COUNT(*) FROM market_timeline_meta) +
          (SELECT COUNT(*) FROM market_display_bars) +
          (SELECT COUNT(*) FROM market_display_anchors) +
          (SELECT COUNT(*) FROM market_bar_chunk_anchors) AS count
      `);
      assert.deepEqual(await derivedResult.getRowObjectsJS(), [{ count: 0n }]);
    });

    await withConnection(result.backupPath, async (connection) => {
      const versionResult = await connection.run(
        "SELECT value FROM market_meta WHERE key = 'market_schema_version'",
      );
      const versionRows = await versionResult.getRowObjectsJS();
      assert.equal(
        String((versionRows[0] as { value?: unknown }).value),
        LEGACY_MARKET_SCHEMA_VERSION,
      );
      const derivedResult = await connection.run('SELECT COUNT(*) AS count FROM market_display_bars');
      assert.deepEqual(await derivedResult.getRowObjectsJS(), [{ count: 1n }]);
    });
  } finally {
    cleanup();
  }
});

test('float32 market schema upgrades atomically to DOUBLE without changing stored values', async () => {
  const { layout, cleanup } = createLayout();
  try {
    await createHistoricalDatabase(layout.marketDbPath);
    await withConnection(layout.marketDbPath, async (connection) => {
      await connection.run(`
        UPDATE market_meta
           SET value = '${FLOAT32_MARKET_SCHEMA_VERSION}'
         WHERE key = 'market_schema_version';
        UPDATE market_bars
           SET open = CASE raw_index
                 WHEN 0 THEN 1.036930
                 WHEN 1 THEN 123456.78
                 ELSE 100000000.01
               END,
               high = CASE raw_index
                 WHEN 0 THEN 1.036930
                 WHEN 1 THEN 123456.78
                 ELSE 100000000.01
               END,
               low = CASE raw_index
                 WHEN 0 THEN 1.036930
                 WHEN 1 THEN 123456.78
                 ELSE 100000000.01
               END,
               close = CASE raw_index
                 WHEN 0 THEN 1.036930
                 WHEN 1 THEN 123456.78
                 ELSE 100000000.01
               END,
               volume = 34344567;
        CHECKPOINT;
      `);
    });
    const beforeValues = await withConnection(layout.marketDbPath, async (connection) => {
      const result = await connection.run(`
        SELECT raw_index,
               CAST(open AS DOUBLE) AS open,
               CAST(high AS DOUBLE) AS high,
               CAST(low AS DOUBLE) AS low,
               CAST(close AS DOUBLE) AS close,
               CAST(volume AS DOUBLE) AS volume
          FROM market_bars
         ORDER BY raw_index
      `);
      return result.getRowObjectsJS();
    });

    const result = await probeAndUpgradeMarketSchema(layout);
    assert.equal(result.status, 'UPGRADED');
    assert.equal(result.schemaVersion, MARKET_SCHEMA_VERSION);
    assert.ok(result.backupPath);

    await withConnection(layout.marketDbPath, async (connection) => {
      const valueResult = await connection.run(`
        SELECT raw_index, open, high, low, close, volume
          FROM market_bars
         ORDER BY raw_index
      `);
      assert.deepEqual(await valueResult.getRowObjectsJS(), beforeValues);

      const columnResult = await connection.run("PRAGMA table_info('market_bars')");
      const ohlcvTypes = (await columnResult.getRowObjectsJS())
        .filter((row) => ['open', 'high', 'low', 'close', 'volume'].includes(String(row.name)))
        .map((row) => [String(row.name), String(row.type)]);
      assert.deepEqual(ohlcvTypes, [
        ['open', 'DOUBLE'],
        ['high', 'DOUBLE'],
        ['low', 'DOUBLE'],
        ['close', 'DOUBLE'],
        ['volume', 'DOUBLE'],
      ]);
    });

    await withConnection(result.backupPath, async (connection) => {
      const versionResult = await connection.run(
        "SELECT value FROM market_meta WHERE key = 'market_schema_version'",
      );
      const versionRows = await versionResult.getRowObjectsJS();
      assert.equal(
        String((versionRows[0] as { value?: unknown }).value),
        FLOAT32_MARKET_SCHEMA_VERSION,
      );
      const columnResult = await connection.run("PRAGMA table_info('market_bars')");
      const openColumn = (await columnResult.getRowObjectsJS()).find(
        (row) => String(row.name) === 'open',
      );
      assert.equal(String(openColumn?.type), 'FLOAT');
    });
  } finally {
    cleanup();
  }
});

test('post-swap failure restores the float32 market database before retry', async () => {
  const { layout, cleanup } = createLayout();
  try {
    await createHistoricalDatabase(layout.marketDbPath);
    await withConnection(layout.marketDbPath, async (connection) => {
      await connection.run(`
        UPDATE market_meta
           SET value = '${FLOAT32_MARKET_SCHEMA_VERSION}'
         WHERE key = 'market_schema_version';
        CHECKPOINT;
      `);
    });
    const originalDigest = fileDigest(layout.marketDbPath);

    const failed = await probeAndUpgradeMarketSchema(layout, {
      afterAtomicSwap: (sourcePath) => {
        fs.writeFileSync(sourcePath, 'invalid-installed-double-target');
      },
    });
    assert.equal(failed.status, 'FAILED');
    assert.equal(failed.issueReason, 'DATABASE_CORRUPTED');
    assert.equal(fileDigest(layout.marketDbPath), originalDigest);
    assert.deepEqual(listUpgradeBackups(layout.marketDbPath), []);
    assert.equal(listFailedUpgradeCandidates(layout.marketDbPath).length, 1);

    const retried = await probeAndUpgradeMarketSchema(layout);
    assert.equal(retried.status, 'UPGRADED');
    assert.equal(retried.schemaVersion, MARKET_SCHEMA_VERSION);
  } finally {
    cleanup();
  }
});

test('a v2 journal from the previous upgrader is recovered before the DOUBLE upgrade', async () => {
  const { layout, cleanup } = createLayout();
  try {
    await createHistoricalDatabase(layout.marketDbPath);
    const sourcePath = layout.marketDbPath;
    const backupPath = `${sourcePath}.pre-upgrade-old-journal.bak`;
    const tempPath = `${sourcePath}.upgrade-old-journal`;
    const failedPath = `${sourcePath}.failed-upgrade-old-journal.bak`;
    const oldIdentity = await readMarketIdentity(
      sourcePath,
      LEGACY_MARKET_SCHEMA_VERSION,
      'NATIVE',
    );
    fs.renameSync(sourcePath, backupPath);
    fs.writeFileSync(tempPath, 'previous-upgrader-partial-target');
    writeUpgradeJournal({
      sourcePath,
      tempPath,
      backupPath,
      failedPath,
      phase: 'SOURCE_BACKED_UP',
      oldIdentity,
      newIdentity: {
        ...oldIdentity,
        schemaVersion: FLOAT32_MARKET_SCHEMA_VERSION,
      },
      formatVersion: 2,
    });

    const result = await probeAndUpgradeMarketSchema(layout);
    assert.equal(result.status, 'UPGRADED');
    assert.equal(result.schemaVersion, MARKET_SCHEMA_VERSION);
    assert.equal(fs.existsSync(tempPath), false);
    assert.equal(
      fs.existsSync(`${sourcePath}${MARKET_SCHEMA_UPGRADE_JOURNAL_SUFFIX}`),
      false,
    );
    assert.ok(result.backupPath);
    await withConnection(result.backupPath, async (connection) => {
      const versionResult = await connection.run(
        "SELECT value FROM market_meta WHERE key = 'market_schema_version'",
      );
      assert.deepEqual(await versionResult.getRowObjectsJS(), [
        { value: LEGACY_MARKET_SCHEMA_VERSION },
      ]);
    });
  } finally {
    cleanup();
  }
});

test('market schema upgrade is idempotent and retains the pre-upgrade backup', async () => {
  const { layout, cleanup } = createLayout();
  try {
    await createHistoricalDatabase(layout.marketDbPath);
    const first = await probeAndUpgradeMarketSchema(layout);
    assert.equal(first.status, 'UPGRADED');
    const backupNames = listUpgradeBackups(layout.marketDbPath);
    assert.equal(backupNames.length, 1);
    const backupDigest = fileDigest(path.join(layout.marketDataDir, backupNames[0]!));

    const second = await probeAndUpgradeMarketSchema(layout);
    assert.equal(second.status, 'CURRENT');
    assert.equal(second.schemaVersion, MARKET_SCHEMA_VERSION);
    assert.deepEqual(listUpgradeBackups(layout.marketDbPath), backupNames);
    assert.equal(
      fileDigest(path.join(layout.marketDataDir, backupNames[0]!)),
      backupDigest,
    );
  } finally {
    cleanup();
  }
});

test('unknown and incomplete historical schemas are preserved without an automatic rewrite', async () => {
  for (const variant of ['UNKNOWN_VERSION', 'MISSING_BARS'] as const) {
    const { layout, cleanup } = createLayout();
    try {
      await createHistoricalDatabase(layout.marketDbPath);
      await withConnection(layout.marketDbPath, async (connection) => {
        if (variant === 'UNKNOWN_VERSION') {
          await connection.run(
            "UPDATE market_meta SET value = '2026-01-01-unknown' WHERE key = 'market_schema_version'; CHECKPOINT",
          );
        } else {
          await connection.run('DROP TABLE market_bars; CHECKPOINT');
        }
      });
      const beforeDigest = fileDigest(layout.marketDbPath);
      const result = await probeAndUpgradeMarketSchema(layout);
      assert.equal(result.status, 'UNSUPPORTED', variant);
      assert.equal(result.issueReason, 'SCHEMA_MISMATCH', variant);
      assert.equal(fileDigest(layout.marketDbPath), beforeDigest);
      assert.deepEqual(listUpgradeBackups(layout.marketDbPath), []);
    } finally {
      cleanup();
    }
  }
});

for (const malformedSchema of [
  {
    name: 'unexpected table',
    create: createHistoricalDatabase,
    mutate: (connection: DuckDBConnection) =>
      connection.run('CREATE TABLE upgrade_unknown_table (id VARCHAR PRIMARY KEY); CHECKPOINT'),
  },
  {
    name: 'unexpected column',
    create: createHistoricalDatabase,
    mutate: (connection: DuckDBConnection) =>
      connection.run('ALTER TABLE market_bars ADD COLUMN upgrade_extra VARCHAR; CHECKPOINT'),
  },
  {
    name: 'column type drift',
    create: async (dbPath: string) =>
      withConnection(dbPath, async (connection) => {
        const doubleOpen = fixtureSql.replace(
          'open REAL NOT NULL,\n  high REAL NOT NULL,',
          'open DOUBLE NOT NULL,\n  high REAL NOT NULL,',
        );
        assert.notEqual(doubleOpen, fixtureSql);
        await connection.run(doubleOpen);
        await connection.run('CHECKPOINT');
      }),
    mutate: async (_connection: DuckDBConnection) => undefined,
  },
  {
    name: 'constraint drift',
    create: async (dbPath: string) =>
      withConnection(dbPath, async (connection) => {
        const withoutInstrumentPrimaryKey = fixtureSql.replace(
          'instrument_id VARCHAR PRIMARY KEY,\n  symbol VARCHAR NOT NULL,',
          'instrument_id VARCHAR NOT NULL,\n  symbol VARCHAR NOT NULL,',
        );
        assert.notEqual(withoutInstrumentPrimaryKey, fixtureSql);
        await connection.run(withoutInstrumentPrimaryKey);
        await connection.run('CHECKPOINT');
      }),
    mutate: async (_connection: DuckDBConnection) => undefined,
  },
  {
    name: 'missing index',
    create: createHistoricalDatabase,
    mutate: (connection: DuckDBConnection) =>
      connection.run('DROP INDEX idx_market_bars_raw_lookup; CHECKPOINT'),
  },
  {
    name: 'unexpected index',
    create: createHistoricalDatabase,
    mutate: (connection: DuckDBConnection) =>
      connection.run('CREATE INDEX idx_upgrade_unknown ON market_meta(value); CHECKPOINT'),
  },
] as const) {
  test(`market schema upgrade fails closed on ${malformedSchema.name}`, async () => {
    const { layout, cleanup } = createLayout();
    try {
      await malformedSchema.create(layout.marketDbPath);
      await withConnection(layout.marketDbPath, malformedSchema.mutate);
      const beforeDigest = fileDigest(layout.marketDbPath);

      const result = await probeAndUpgradeMarketSchema(layout);

      assert.equal(result.status, 'UNSUPPORTED');
      assert.equal(result.issueReason, 'SCHEMA_MISMATCH');
      assert.equal(result.backupPath, null);
      assert.equal(fileDigest(layout.marketDbPath), beforeDigest);
    } finally {
      cleanup();
    }
  });
}

test('market schema upgrade stops before journal or mutation when disk is full', async () => {
  const { layout, cleanup } = createLayout();
  const originalStatfsSync = fs.statfsSync;
  try {
    await createHistoricalDatabase(layout.marketDbPath);
    const beforeDigest = fileDigest(layout.marketDbPath);
    fs.statfsSync = (() => ({ bavail: 0, bsize: 4096 })) as typeof fs.statfsSync;

    const result = await probeAndUpgradeMarketSchema(layout);

    assert.equal(result.status, 'INSUFFICIENT_DISK_SPACE');
    assert.equal(result.availableHeadroomBytes, 0);
    assert.ok((result.requiredHeadroomBytes ?? 0) > 0);
    assert.equal(fileDigest(layout.marketDbPath), beforeDigest);
    assert.equal(
      fs.existsSync(
        `${layout.marketDbPath}${MARKET_SCHEMA_UPGRADE_JOURNAL_SUFFIX}`,
      ),
      false,
    );
  } finally {
    fs.statfsSync = originalStatfsSync;
    cleanup();
  }
});

test('failed legacy value conversion leaves the original database byte-for-byte intact', async () => {
  const { layout, cleanup } = createLayout();
  try {
    await withConnection(layout.marketDbPath, async (connection) => {
      await connection.run(`
        CREATE TABLE market_meta (key VARCHAR PRIMARY KEY, value VARCHAR NOT NULL, updated_at VARCHAR NOT NULL);
        INSERT INTO market_meta VALUES ('market_schema_version', '${LEGACY_MARKET_SCHEMA_VERSION}', '2026-05-18T00:00:00.000Z');
        CREATE TABLE market_instruments (instrument_id VARCHAR PRIMARY KEY, symbol VARCHAR NOT NULL, bar_count BIGINT NOT NULL, updated_at VARCHAR NOT NULL);
        INSERT INTO market_instruments VALUES ('broken', 'BROKEN', 1, '2026-05-18T00:00:00.000Z');
        CREATE TABLE market_bars (
          instrument_id VARCHAR NOT NULL, raw_index BIGINT NOT NULL, ts_ms BIGINT NOT NULL,
          open VARCHAR NOT NULL, high VARCHAR NOT NULL, low VARCHAR NOT NULL,
          close VARCHAR NOT NULL, volume VARCHAR NOT NULL
        );
        INSERT INTO market_bars VALUES ('broken', 0, 1, 'not-a-number', '2', '0', '1', '5');
        CHECKPOINT;
      `);
    });
    const beforeDigest = fileDigest(layout.marketDbPath);
    const result = await probeAndUpgradeMarketSchema(layout);
    assert.equal(result.status, 'UNSUPPORTED');
    assert.equal(result.issueReason, 'SCHEMA_MISMATCH');
    assert.equal(fileDigest(layout.marketDbPath), beforeDigest);
    assert.deepEqual(listUpgradeBackups(layout.marketDbPath), []);
  } finally {
    cleanup();
  }
});

test('target OHLCV corruption fails content validation and preserves the historical source', async () => {
  const { layout, cleanup } = createLayout();
  try {
    await createHistoricalDatabase(layout.marketDbPath);
    const originalDigest = fileDigest(layout.marketDbPath);
    const result = await probeAndUpgradeMarketSchema(layout, {
      afterTargetCopy: async (connection) => {
        await connection.run(
          "UPDATE market_bars SET close = close + 7 WHERE instrument_id = 'instrument-aapl' AND raw_index = 1",
        );
      },
    });
    assert.equal(result.status, 'FAILED');
    assert.equal(result.issueReason, 'DATABASE_CORRUPTED');
    assert.equal(fileDigest(layout.marketDbPath), originalDigest);
    assert.deepEqual(listUpgradeBackups(layout.marketDbPath), []);
    await withConnection(layout.marketDbPath, async (connection) => {
      const closeResult = await connection.run(
        "SELECT CAST(close AS DOUBLE) AS close FROM market_bars WHERE instrument_id = 'instrument-aapl' AND raw_index = 1",
      );
      assert.deepEqual(await closeResult.getRowObjectsJS(), [{ close: 12 }]);
    });
  } finally {
    cleanup();
  }
});

test('corrupted market storage is reported and never deleted', async () => {
  const { layout, cleanup } = createLayout();
  try {
    const corrupted = Buffer.from('not-a-duckdb-database\n');
    fs.writeFileSync(layout.marketDbPath, corrupted);
    const result = await probeAndUpgradeMarketSchema(layout);
    assert.equal(result.status, 'FAILED');
    assert.equal(result.issueReason, 'DATABASE_CORRUPTED');
    assert.deepEqual(fs.readFileSync(layout.marketDbPath), corrupted);
  } finally {
    cleanup();
  }
});

test('directory fsync unsupported still restores an interrupted switch and retries safely', async () => {
  const { layout, cleanup } = createLayout();
  try {
    await createHistoricalDatabase(layout.marketDbPath);
    const sourcePath = layout.marketDbPath;
    const backupPath = `${sourcePath}.pre-upgrade-interrupted.bak`;
    const tempPath = `${sourcePath}.upgrade-interrupted`;
    const failedPath = `${sourcePath}.failed-upgrade-interrupted.bak`;
    const oldIdentity = await readMarketIdentity(
      sourcePath,
      LEGACY_MARKET_SCHEMA_VERSION,
    );
    fs.renameSync(sourcePath, backupPath);
    fs.writeFileSync(tempPath, 'partial-target');
    writeUpgradeJournal({
      sourcePath,
      tempPath,
      backupPath,
      failedPath,
      phase: 'SOURCE_BACKED_UP',
      oldIdentity,
      newIdentity: { ...oldIdentity, schemaVersion: MARKET_SCHEMA_VERSION },
    });

    const restoreDirectoryOpen = replaceDirectoryOpen(layout.marketDataDir, 'EISDIR');
    const result = await probeAndUpgradeMarketSchema(layout).finally(
      restoreDirectoryOpen,
    );
    assert.equal(result.status, 'UPGRADED');
    assert.equal(fs.existsSync(sourcePath), true);
    assert.equal(fs.existsSync(tempPath), false);
    assert.equal(
      fs.existsSync(`${sourcePath}${MARKET_SCHEMA_UPGRADE_JOURNAL_SUFFIX}`),
      false,
    );
    assert.equal(listUpgradeBackups(sourcePath).length, 1);
  } finally {
    cleanup();
  }
});

test('a stale verified journal never rolls back a valid current database', async () => {
  const { layout, cleanup } = createLayout();
  try {
    await createHistoricalDatabase(layout.marketDbPath);
    const oldIdentity = await readMarketIdentity(
      layout.marketDbPath,
      LEGACY_MARKET_SCHEMA_VERSION,
    );
    const first = await probeAndUpgradeMarketSchema(layout);
    assert.equal(first.status, 'UPGRADED');
    assert.ok(first.backupPath);
    const installedIdentity = await readMarketIdentity(
      layout.marketDbPath,
      MARKET_SCHEMA_VERSION,
    );
    await withConnection(layout.marketDbPath, async (connection) => {
      await connection.run(
        "INSERT INTO market_instruments VALUES ('retained', 'GOOD', 0, '2026-07-16T00:00:00.000Z'); CHECKPOINT",
      );
    });
    const sourcePath = layout.marketDbPath;
    const tempPath = `${sourcePath}.upgrade-after-install`;
    writeUpgradeJournal({
      sourcePath,
      tempPath,
      backupPath: first.backupPath,
      failedPath: `${sourcePath}.failed-upgrade-after-install.bak`,
      phase: 'VERIFIED',
      oldIdentity,
      newIdentity: installedIdentity,
    });

    const retried = await probeAndUpgradeMarketSchema(layout);
    assert.equal(retried.status, 'CURRENT');
    await withConnection(sourcePath, async (connection) => {
      const markerResult = await connection.run(
        "SELECT COUNT(*) AS count FROM market_instruments WHERE instrument_id = 'retained'",
      );
      assert.deepEqual(await markerResult.getRowObjectsJS(), [{ count: 1n }]);
    });
    assert.equal(listUpgradeBackups(sourcePath).length, 1);
    assert.equal(
      fs.existsSync(`${sourcePath}${MARKET_SCHEMA_UPGRADE_JOURNAL_SUFFIX}`),
      false,
    );
  } finally {
    cleanup();
  }
});

test('an unverified journal with a different valid current database fails closed', async () => {
  const { layout, cleanup } = createLayout();
  try {
    await createHistoricalDatabase(layout.marketDbPath);
    const oldIdentity = await readMarketIdentity(
      layout.marketDbPath,
      LEGACY_MARKET_SCHEMA_VERSION,
    );
    const first = await probeAndUpgradeMarketSchema(layout);
    assert.equal(first.status, 'UPGRADED');
    assert.ok(first.backupPath);
    const installedIdentity = await readMarketIdentity(
      layout.marketDbPath,
      MARKET_SCHEMA_VERSION,
    );
    await withConnection(layout.marketDbPath, async (connection) => {
      await connection.run(
        "INSERT INTO market_instruments VALUES ('new-current-data', 'SAFE', 0, '2026-07-16T00:00:00.000Z'); CHECKPOINT",
      );
    });
    const backupDigest = fileDigest(first.backupPath);
    writeUpgradeJournal({
      sourcePath: layout.marketDbPath,
      tempPath: `${layout.marketDbPath}.upgrade-unverified-current`,
      backupPath: first.backupPath,
      failedPath: `${layout.marketDbPath}.failed-upgrade-unverified-current.bak`,
      phase: 'TARGET_INSTALLED',
      oldIdentity,
      newIdentity: installedIdentity,
    });

    const result = await probeAndUpgradeMarketSchema(layout);
    assert.equal(result.status, 'FAILED');
    assert.equal(result.issueReason, 'DATABASE_CORRUPTED');
    assert.equal(fileDigest(first.backupPath), backupDigest);
    assert.equal(
      fs.existsSync(
        `${layout.marketDbPath}${MARKET_SCHEMA_UPGRADE_JOURNAL_SUFFIX}`,
      ),
      true,
    );
    await withConnection(layout.marketDbPath, async (connection) => {
      const result = await connection.run(
        "SELECT COUNT(*) AS count FROM market_instruments WHERE instrument_id = 'new-current-data'",
      );
      assert.deepEqual(await result.getRowObjectsJS(), [{ count: 1n }]);
    });
  } finally {
    cleanup();
  }
});

test('a valid current source wins over a corrupted backup candidate', async () => {
  const { layout, cleanup } = createLayout();
  try {
    await createHistoricalDatabase(layout.marketDbPath);
    const oldIdentity = await readMarketIdentity(
      layout.marketDbPath,
      LEGACY_MARKET_SCHEMA_VERSION,
    );
    const first = await probeAndUpgradeMarketSchema(layout);
    assert.equal(first.status, 'UPGRADED');
    assert.ok(first.backupPath);
    const installedIdentity = await readMarketIdentity(
      layout.marketDbPath,
      MARKET_SCHEMA_VERSION,
    );
    fs.writeFileSync(first.backupPath, 'corrupted-backup');
    writeUpgradeJournal({
      sourcePath: layout.marketDbPath,
      tempPath: `${layout.marketDbPath}.upgrade-corrupt-backup`,
      backupPath: first.backupPath,
      failedPath: `${layout.marketDbPath}.failed-upgrade-corrupt-backup.bak`,
      phase: 'TARGET_INSTALLED',
      oldIdentity,
      newIdentity: installedIdentity,
    });

    const result = await probeAndUpgradeMarketSchema(layout);
    assert.equal(result.status, 'CURRENT');
    assert.equal(fs.readFileSync(first.backupPath, 'utf8'), 'corrupted-backup');
    assert.equal(
      fs.existsSync(
        `${layout.marketDbPath}${MARKET_SCHEMA_UPGRADE_JOURNAL_SUFFIX}`,
      ),
      false,
    );
  } finally {
    cleanup();
  }
});

test('two matching legacy candidates are ambiguous and remain untouched', async () => {
  const { layout, cleanup } = createLayout();
  try {
    await createHistoricalDatabase(layout.marketDbPath);
    const sourcePath = layout.marketDbPath;
    const sourceDigest = fileDigest(sourcePath);
    const oldIdentity = await readMarketIdentity(
      sourcePath,
      LEGACY_MARKET_SCHEMA_VERSION,
    );
    const backupPath = `${sourcePath}.pre-upgrade-ambiguous.bak`;
    const tempPath = `${sourcePath}.upgrade-ambiguous`;
    fs.copyFileSync(sourcePath, backupPath);
    fs.writeFileSync(tempPath, 'owned-partial-target');
    writeUpgradeJournal({
      sourcePath,
      tempPath,
      backupPath,
      failedPath: `${sourcePath}.failed-upgrade-ambiguous.bak`,
      phase: 'SOURCE_BACKED_UP',
      oldIdentity,
      newIdentity: { ...oldIdentity, schemaVersion: MARKET_SCHEMA_VERSION },
    });

    const result = await probeAndUpgradeMarketSchema(layout);
    assert.equal(result.status, 'FAILED');
    assert.equal(fileDigest(sourcePath), sourceDigest);
    assert.equal(fileDigest(backupPath), sourceDigest);
    assert.equal(fs.readFileSync(tempPath, 'utf8'), 'owned-partial-target');
    assert.equal(
      fs.existsSync(`${sourcePath}${MARKET_SCHEMA_UPGRADE_JOURNAL_SUFFIX}`),
      true,
    );
  } finally {
    cleanup();
  }
});

test('a real directory sync I/O failure stops before source mutation', async () => {
  const { layout, cleanup } = createLayout();
  try {
    await createHistoricalDatabase(layout.marketDbPath);
    const originalDigest = fileDigest(layout.marketDbPath);
    const restoreDirectoryOpen = replaceDirectoryOpen(layout.marketDataDir, 'EIO');
    const failed = await probeAndUpgradeMarketSchema(layout).finally(
      restoreDirectoryOpen,
    );
    assert.equal(failed.status, 'FAILED');
    assert.equal(failed.issueReason, 'DATABASE_CORRUPTED');
    assert.equal(fileDigest(layout.marketDbPath), originalDigest);
    assert.equal(
      fs.existsSync(
        `${layout.marketDbPath}${MARKET_SCHEMA_UPGRADE_JOURNAL_SUFFIX}`,
      ),
      true,
    );

    const retried = await probeAndUpgradeMarketSchema(layout);
    assert.equal(retried.status, 'UPGRADED');
  } finally {
    cleanup();
  }
});

test('post-swap verification failure restores the original historical database', async () => {
  const { layout, cleanup } = createLayout();
  try {
    await createHistoricalDatabase(layout.marketDbPath);
    const originalDigest = fileDigest(layout.marketDbPath);
    const result = await probeAndUpgradeMarketSchema(layout, {
      afterAtomicSwap: (sourcePath) => {
        fs.writeFileSync(sourcePath, 'invalid-installed-target');
      },
    });
    assert.equal(result.status, 'FAILED');
    assert.equal(result.issueReason, 'DATABASE_CORRUPTED');
    assert.equal(fileDigest(layout.marketDbPath), originalDigest);
    await withConnection(layout.marketDbPath, async (connection) => {
      const versionResult = await connection.run(
        "SELECT value FROM market_meta WHERE key = 'market_schema_version'",
      );
      const versionRows = await versionResult.getRowObjectsJS();
      assert.equal(
        String((versionRows[0] as { value?: unknown }).value),
        LEGACY_MARKET_SCHEMA_VERSION,
      );
    });
    assert.deepEqual(listUpgradeBackups(layout.marketDbPath), []);
    assert.equal(listFailedUpgradeCandidates(layout.marketDbPath).length, 1);
  } finally {
    cleanup();
  }
});
