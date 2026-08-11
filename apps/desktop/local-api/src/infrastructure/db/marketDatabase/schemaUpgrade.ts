// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import {
  CORE_SCHEMA_STARTUP_SCRATCH_BYTES,
  GLOBAL_STARTUP_MIN_FREE_BYTES,
  MARKET_SCHEMA_VERSION,
  MARKET_STARTUP_SCRATCH_BYTES,
} from '../database/constants.js';
import type { DesktopStorageLayout } from '../database/location.js';
import { MARKET_PRICE_STORAGE_SQL, MARKET_VOLUME_STORAGE_SQL } from './ohlcvSql.js';
import {
  computeMarketSchemaConnectionManifestFingerprint,
  initializeCurrentMarketSchema,
  PINNED_FLOAT32_MARKET_SCHEMA_MANIFEST_SHA256,
  probeMarketSchemaConnection,
} from './schemaDefinition.js';

export const LEGACY_MARKET_SCHEMA_VERSION =
  '2026-05-18-trading-calendar-timeline-v1';
export const FLOAT32_MARKET_SCHEMA_VERSION =
  '2026-06-06-market-display-storage-v1';

export const SUPPORTED_MARKET_SCHEMA_UPGRADES: Readonly<Record<string, string>> =
  Object.freeze({
    [LEGACY_MARKET_SCHEMA_VERSION]: MARKET_SCHEMA_VERSION,
    [FLOAT32_MARKET_SCHEMA_VERSION]: MARKET_SCHEMA_VERSION,
  });

const SUPPORTED_SOURCE_SCHEMA_MANIFESTS: Readonly<Record<string, string>> =
  Object.freeze({
    [LEGACY_MARKET_SCHEMA_VERSION]: PINNED_FLOAT32_MARKET_SCHEMA_MANIFEST_SHA256,
    [FLOAT32_MARKET_SCHEMA_VERSION]: PINNED_FLOAT32_MARKET_SCHEMA_MANIFEST_SHA256,
  });

export const MARKET_SCHEMA_UPGRADE_JOURNAL_SUFFIX = '.schema-upgrade.json';

export type MarketSchemaUpgradeResult = {
  status:
    | 'NO_DATABASE'
    | 'CURRENT'
    | 'UPGRADED'
    | 'UNSUPPORTED'
    | 'FAILED'
    | 'INSUFFICIENT_DISK_SPACE';
  schemaVersion: string | null;
  isCurrent: boolean;
  issueReason: 'SCHEMA_MISMATCH' | 'DATABASE_CORRUPTED' | null;
  missingSchemaRequirements: string[];
  backupPath: string | null;
  requiredHeadroomBytes: number | null;
  availableHeadroomBytes: number | null;
};

export type MarketSchemaUpgradePhase =
  | 'PROBING'
  | 'COPYING'
  | 'VALIDATING'
  | 'SWITCHING';

export type MarketSchemaUpgradeLifecycle = {
  onProgress?: (
    phase: MarketSchemaUpgradePhase,
  ) => void | Promise<void>;
  afterTargetCopy?: (
    connection: DuckDBConnection,
  ) => void | Promise<void>;
  afterAtomicSwap?: (sourcePath: string) => void | Promise<void>;
};

type UpgradeJournal = {
  formatVersion: 2 | 3;
  sourcePath: string;
  tempPath: string;
  backupPath: string;
  failedPath: string;
  fromSchemaVersion: string;
  phase:
    | 'PREPARING'
    | 'TARGET_VALIDATED'
    | 'SWITCHING'
    | 'SOURCE_BACKED_UP'
    | 'TARGET_INSTALLED'
    | 'VERIFIED';
  oldIdentity: MarketDataIdentity;
  newIdentity: MarketDataIdentity | null;
};

type MarketDataIdentity = {
  schemaVersion: string;
  contentSha256: string;
  instrumentCount: number;
  totalBars: string;
};

type MarketDataSnapshot = {
  instruments: Array<{
    instrumentId: string;
    symbol: string;
    barCount: string;
    updatedAt: string;
  }>;
  barsByInstrument: Array<{
    instrumentId: string;
    barCount: string;
    minTsMs: string | null;
    maxTsMs: string | null;
    contentHashXor: string;
    contentHashSum: string;
  }>;
  totalBars: string;
};

const normalizePath = (value: string): string => path.resolve(value);

const buildDataIdentity = (
  schemaVersion: string,
  snapshot: MarketDataSnapshot,
): MarketDataIdentity => ({
  schemaVersion,
  contentSha256: createHash('sha256')
    .update(JSON.stringify(snapshot))
    .digest('hex'),
  instrumentCount: snapshot.instruments.length,
  totalBars: snapshot.totalBars,
});

const identitiesMatch = (
  left: MarketDataIdentity | null,
  right: MarketDataIdentity | null,
): boolean => Boolean(left && right && JSON.stringify(left) === JSON.stringify(right));

const closeConnection = (connection: DuckDBConnection | null): void => {
  try {
    connection?.closeSync();
  } catch {
    // The owning instance is closed immediately afterwards.
  }
};

const closeInstance = (instance: DuckDBInstance | null): void => {
  try {
    instance?.closeSync();
  } catch {
    // Startup probing reports the primary operation result.
  }
};

const isDirectorySyncUnsupported = (error: unknown): boolean => {
  const code = String((error as NodeJS.ErrnoException | null)?.code ?? '');
  if (['EISDIR', 'EINVAL', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP'].includes(code)) {
    return true;
  }
  // Windows does not expose a portable directory FlushFileBuffers handle.
  // EPERM/EBADF from this directory-only operation means "unsupported";
  // EIO/EACCES and all other failures still abort the upgrade.
  return process.platform === 'win32' && ['EPERM', 'EBADF'].includes(code);
};

const syncDirectory = (dirPath: string): void => {
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(dirPath, 'r');
    fs.fsyncSync(descriptor);
  } catch (error) {
    // File fsync plus the v2 phase/identity protocol remains authoritative on
    // filesystems where directory fsync is not supported.
    if (!isDirectorySyncUnsupported(error)) {
      throw error;
    }
  } finally {
    if (descriptor !== null) {
      fs.closeSync(descriptor);
    }
  }
};

const syncFile = (filePath: string): void => {
  // Windows FlushFileBuffers requires a handle opened with write access.
  const descriptor = fs.openSync(filePath, 'r+');
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
};

const removeOwnedFileSet = (filePath: string): void => {
  for (const suffix of ['', '.wal']) {
    fs.rmSync(`${filePath}${suffix}`, { force: true });
  }
};

const moveFileSet = (sourcePath: string, targetPath: string): void => {
  syncFile(sourcePath);
  fs.renameSync(sourcePath, targetPath);
  if (fs.existsSync(`${sourcePath}.wal`)) {
    syncFile(`${sourcePath}.wal`);
    fs.renameSync(`${sourcePath}.wal`, `${targetPath}.wal`);
  }
  syncFile(targetPath);
};

const writeJournal = (journalPath: string, journal: UpgradeJournal): void => {
  const stagingPath = `${journalPath}.tmp`;
  const previousPath = `${journalPath}.previous`;
  fs.writeFileSync(stagingPath, `${JSON.stringify(journal)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  const descriptor = fs.openSync(stagingPath, 'r+');
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.rmSync(previousPath, { force: true });
  if (fs.existsSync(journalPath)) {
    fs.renameSync(journalPath, previousPath);
  }
  fs.renameSync(stagingPath, journalPath);
  syncDirectory(path.dirname(journalPath));
  const persisted = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as UpgradeJournal;
  if (JSON.stringify(persisted) !== JSON.stringify(journal)) {
    throw new Error('MARKET_SCHEMA_UPGRADE_JOURNAL_VERIFY_FAILED');
  }
  fs.rmSync(previousPath, { force: true });
  syncDirectory(path.dirname(journalPath));
};

const isOwnedArtifactPath = ({
  sourcePath,
  artifactPath,
  marker,
}: {
  sourcePath: string;
  artifactPath: string;
  marker: string;
}): boolean =>
  path.dirname(artifactPath) === path.dirname(sourcePath) &&
  path.basename(artifactPath).startsWith(`${path.basename(sourcePath)}.${marker}-`);

const readValidJournal = (
  sourcePath: string,
  candidatePath: string,
): UpgradeJournal | null => {
  try {
    const parsed = JSON.parse(fs.readFileSync(candidatePath, 'utf8')) as Partial<UpgradeJournal>;
    const validIdentity = (identity: MarketDataIdentity | null | undefined): boolean =>
      Boolean(
        identity &&
          typeof identity.schemaVersion === 'string' &&
          /^[a-f0-9]{64}$/u.test(String(identity.contentSha256 ?? '')) &&
          Number.isInteger(identity.instrumentCount) &&
          identity.instrumentCount >= 0 &&
          /^\d+$/u.test(String(identity.totalBars ?? '')),
      );
    const fromSchemaVersion = String(parsed.fromSchemaVersion ?? '');
    const targetSchemaVersion =
      parsed.formatVersion === 2
        ? FLOAT32_MARKET_SCHEMA_VERSION
        : MARKET_SCHEMA_VERSION;
    const validFormatVersion = parsed.formatVersion === 2 || parsed.formatVersion === 3;
    const validSchemaTransition =
      parsed.formatVersion === 2
        ? fromSchemaVersion === LEGACY_MARKET_SCHEMA_VERSION
        : SUPPORTED_MARKET_SCHEMA_UPGRADES[fromSchemaVersion] === MARKET_SCHEMA_VERSION;
    if (
      !validFormatVersion ||
      normalizePath(String(parsed.sourcePath ?? '')) !== normalizePath(sourcePath) ||
      !validSchemaTransition ||
      ![
        'PREPARING',
        'TARGET_VALIDATED',
        'SWITCHING',
        'SOURCE_BACKED_UP',
        'TARGET_INSTALLED',
        'VERIFIED',
      ].includes(String(parsed.phase ?? '')) ||
      !validIdentity(parsed.oldIdentity) ||
      parsed.oldIdentity?.schemaVersion !== fromSchemaVersion ||
      (parsed.newIdentity !== null && !validIdentity(parsed.newIdentity)) ||
      (parsed.newIdentity !== null &&
        parsed.newIdentity?.schemaVersion !== targetSchemaVersion) ||
      (parsed.phase !== 'PREPARING' && parsed.newIdentity === null) ||
      !isOwnedArtifactPath({
        sourcePath,
        artifactPath: normalizePath(String(parsed.tempPath ?? '')),
        marker: 'upgrade',
      }) ||
      !isOwnedArtifactPath({
        sourcePath,
        artifactPath: normalizePath(String(parsed.backupPath ?? '')),
        marker: 'pre-upgrade',
      }) ||
      !isOwnedArtifactPath({
        sourcePath,
        artifactPath: normalizePath(String(parsed.failedPath ?? '')),
        marker: 'failed-upgrade',
      })
    ) {
      return null;
    }
    return parsed as UpgradeJournal;
  } catch {
    return null;
  }
};

const journalPhaseRank = (phase: UpgradeJournal['phase']): number =>
  ['PREPARING', 'TARGET_VALIDATED', 'SWITCHING', 'SOURCE_BACKED_UP', 'TARGET_INSTALLED', 'VERIFIED'].indexOf(
    phase,
  );

const readLatestValidJournal = (
  sourcePath: string,
  journalPath: string,
): UpgradeJournal | null => {
  const journals = [journalPath, `${journalPath}.previous`, `${journalPath}.tmp`]
    .filter((candidatePath) => fs.existsSync(candidatePath))
    .map((candidatePath) => readValidJournal(sourcePath, candidatePath))
    .filter((journal): journal is UpgradeJournal => Boolean(journal))
    .sort((left, right) => journalPhaseRank(right.phase) - journalPhaseRank(left.phase));
  return journals[0] ?? null;
};

const removeJournalDurably = (journalPath: string): void => {
  fs.rmSync(journalPath, { force: true });
  fs.rmSync(`${journalPath}.previous`, { force: true });
  fs.rmSync(`${journalPath}.tmp`, { force: true });
  syncDirectory(path.dirname(journalPath));
};

type CandidateState =
  | { kind: 'MISSING' | 'CORRUPT' | 'UNKNOWN'; identity: null }
  | { kind: 'CURRENT' | 'SOURCE'; identity: MarketDataIdentity };

const recoverInterruptedUpgrade = async (
  sourcePath: string,
): Promise<{ ok: boolean; retainedBackupPath: string | null }> => {
  try {
    const journalPath = `${sourcePath}${MARKET_SCHEMA_UPGRADE_JOURNAL_SUFFIX}`;
    if (
      ![journalPath, `${journalPath}.previous`, `${journalPath}.tmp`].some((candidatePath) =>
        fs.existsSync(candidatePath),
      )
    ) {
      return { ok: true, retainedBackupPath: null };
    }
    const journal = readLatestValidJournal(sourcePath, journalPath);
    if (!journal) {
      return { ok: false, retainedBackupPath: null };
    }
    const identityHashMode =
      journal.formatVersion === 2 ? 'NATIVE' : 'CANONICAL_DOUBLE';
    const [source, backup] = await Promise.all([
      inspectCandidateState(sourcePath, identityHashMode),
      inspectCandidateState(journal.backupPath, identityHashMode),
    ]);
    const sourceHasIdentity = source.kind === 'CURRENT' || source.kind === 'SOURCE';
    if (
      sourceHasIdentity &&
      journal.newIdentity &&
      source.identity.schemaVersion === journal.newIdentity.schemaVersion
    ) {
      if (
        (!identitiesMatch(source.identity, journal.newIdentity) && journal.phase !== 'VERIFIED')
      ) {
        return { ok: false, retainedBackupPath: journal.backupPath };
      }
      removeOwnedFileSet(journal.tempPath);
      removeJournalDurably(journalPath);
      return {
        ok: true,
        retainedBackupPath: fs.existsSync(journal.backupPath) ? journal.backupPath : null,
      };
    }
    const backupMatches =
      backup.kind === 'SOURCE' && identitiesMatch(backup.identity, journal.oldIdentity);
    if (source.kind === 'SOURCE' && identitiesMatch(source.identity, journal.oldIdentity)) {
      if (fs.existsSync(journal.backupPath)) {
        return { ok: false, retainedBackupPath: journal.backupPath };
      }
      removeOwnedFileSet(journal.tempPath);
      removeJournalDurably(journalPath);
      return { ok: true, retainedBackupPath: null };
    }
    if (source.kind === 'MISSING' && backupMatches) {
      moveFileSet(journal.backupPath, sourcePath);
      syncDirectory(path.dirname(sourcePath));
      removeOwnedFileSet(journal.tempPath);
      removeJournalDurably(journalPath);
      return { ok: true, retainedBackupPath: null };
    }
    if (source.kind === 'CORRUPT' && backupMatches && !fs.existsSync(journal.failedPath)) {
      moveFileSet(sourcePath, journal.failedPath);
      try {
        moveFileSet(journal.backupPath, sourcePath);
        syncDirectory(path.dirname(sourcePath));
      } catch (error) {
        if (!fs.existsSync(sourcePath) && fs.existsSync(journal.failedPath)) {
          moveFileSet(journal.failedPath, sourcePath);
        }
        throw error;
      }
      removeOwnedFileSet(journal.tempPath);
      removeJournalDurably(journalPath);
      return { ok: true, retainedBackupPath: journal.failedPath };
    }
    if (source.kind === 'MISSING' || source.kind === 'CORRUPT' || source.kind === 'UNKNOWN') {
      return { ok: false, retainedBackupPath: null };
    }
    return { ok: false, retainedBackupPath: null };
  } catch {
    return { ok: false, retainedBackupPath: null };
  }
};

const readAvailableBytes = (targetDir: string): number | null => {
  try {
    const stats = fs.statfsSync(targetDir);
    const blocks = Number(stats.bavail ?? Number.NaN);
    const blockSize = Number(stats.bsize ?? Number.NaN);
    if (!Number.isFinite(blocks) || !Number.isFinite(blockSize)) {
      return null;
    }
    return Math.max(0, Math.floor(blocks * blockSize));
  } catch {
    return null;
  }
};

const computeUpgradeHeadroomBytes = (sourcePath: string): number => {
  const sourceBytes =
    fs.statSync(sourcePath).size +
    (fs.existsSync(`${sourcePath}.wal`) ? fs.statSync(`${sourcePath}.wal`).size : 0);
  return (
    GLOBAL_STARTUP_MIN_FREE_BYTES +
    Math.max(
      CORE_SCHEMA_STARTUP_SCRATCH_BYTES,
      sourceBytes + MARKET_STARTUP_SCRATCH_BYTES,
    )
  );
};

const checkpointLegacySource = async (sourcePath: string): Promise<void> => {
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  try {
    ({ instance, connection } = await openDatabase(sourcePath, false));
    await connection.run('CHECKPOINT');
  } finally {
    closeConnection(connection);
    closeInstance(instance);
  }
  if (fs.existsSync(`${sourcePath}.wal`)) {
    throw new Error('MARKET_SCHEMA_UPGRADE_SOURCE_WAL_NOT_CHECKPOINTED');
  }
};

const openDatabase = async (
  filePath: string,
  readonly: boolean,
): Promise<{ instance: DuckDBInstance; connection: DuckDBConnection }> => {
  const instance = await DuckDBInstance.create(
    filePath,
    readonly ? { access_mode: 'READ_ONLY' } : undefined,
  );
  try {
    return { instance, connection: await instance.connect() };
  } catch (error) {
    closeInstance(instance);
    throw error;
  }
};

const stringifyInteger = (value: unknown): string => String(value ?? '0');

const stringifyNullableInteger = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

const readDataSnapshot = async (
  connection: DuckDBConnection,
  identityHashMode: 'CANONICAL_DOUBLE' | 'NATIVE' = 'CANONICAL_DOUBLE',
): Promise<MarketDataSnapshot> => {
  const instrumentResult = await connection.run(
    `SELECT instrument_id, symbol, bar_count, updated_at
       FROM market_instruments
      ORDER BY instrument_id ASC`,
  );
  const instruments = (await instrumentResult.getRowObjectsJS()).map((row) => ({
    instrumentId: String((row as { instrument_id?: unknown }).instrument_id ?? ''),
    symbol: String((row as { symbol?: unknown }).symbol ?? ''),
    barCount: stringifyInteger((row as { bar_count?: unknown }).bar_count),
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
    barCount: stringifyInteger((row as { bar_count?: unknown }).bar_count),
    minTsMs: stringifyNullableInteger((row as { min_ts_ms?: unknown }).min_ts_ms),
    maxTsMs: stringifyNullableInteger((row as { max_ts_ms?: unknown }).max_ts_ms),
    contentHashXor: stringifyInteger(
      (row as { content_hash_xor?: unknown }).content_hash_xor,
    ),
    contentHashSum: stringifyInteger(
      (row as { content_hash_sum?: unknown }).content_hash_sum,
    ),
  }));
  const totalResult = await connection.run('SELECT COUNT(*) AS total_bars FROM market_bars');
  const totalRows = await totalResult.getRowObjectsJS();
  return {
    instruments,
    barsByInstrument,
    totalBars: stringifyInteger(
      (totalRows[0] as { total_bars?: unknown } | undefined)?.total_bars,
    ),
  };
};

const snapshotsMatch = (
  source: MarketDataSnapshot,
  target: MarketDataSnapshot,
): boolean => JSON.stringify(source) === JSON.stringify(target);

const notifyProgress = async (
  lifecycle: MarketSchemaUpgradeLifecycle,
  phase: MarketSchemaUpgradePhase,
): Promise<void> => {
  try {
    await lifecycle.onProgress?.(phase);
  } catch {
    // Progress reporting must never make a durable data upgrade fail.
  }
};

const copyLegacyData = async (
  connection: DuckDBConnection,
  sourcePath: string,
): Promise<void> => {
  const sourceLiteral = `'${sourcePath.replaceAll("'", "''")}'`;
  await connection.run(`ATTACH ${sourceLiteral} AS legacy_market (READ_ONLY)`);
  try {
    await connection.run(`
      INSERT INTO market_instruments (instrument_id, symbol, bar_count, updated_at)
      SELECT CAST(instrument_id AS VARCHAR),
             CAST(symbol AS VARCHAR),
             CAST(bar_count AS BIGINT),
             CAST(updated_at AS VARCHAR)
        FROM legacy_market.market_instruments;

      INSERT INTO market_bars (
        instrument_id, raw_index, ts_ms, open, high, low, close, volume
      )
      SELECT CAST(instrument_id AS VARCHAR),
             CAST(raw_index AS BIGINT),
             CAST(ts_ms AS BIGINT),
             CAST(open AS ${MARKET_PRICE_STORAGE_SQL}),
             CAST(high AS ${MARKET_PRICE_STORAGE_SQL}),
             CAST(low AS ${MARKET_PRICE_STORAGE_SQL}),
             CAST(close AS ${MARKET_PRICE_STORAGE_SQL}),
             CAST(volume AS ${MARKET_VOLUME_STORAGE_SQL})
        FROM legacy_market.market_bars;
    `);
  } finally {
    await connection.run('DETACH legacy_market').catch(() => undefined);
  }
};

const buildAndValidateTarget = async ({
  sourcePath,
  tempPath,
  sourceSnapshot,
  lifecycle,
}: {
  sourcePath: string;
  tempPath: string;
  sourceSnapshot: MarketDataSnapshot;
  lifecycle: MarketSchemaUpgradeLifecycle;
}): Promise<MarketDataIdentity> => {
  removeOwnedFileSet(tempPath);
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  let targetIdentity: MarketDataIdentity | null = null;
  try {
    ({ instance, connection } = await openDatabase(tempPath, false));
    await initializeCurrentMarketSchema(connection);
    await notifyProgress(lifecycle, 'COPYING');
    await copyLegacyData(connection, sourcePath);
    await lifecycle.afterTargetCopy?.(connection);
    await connection.run('CHECKPOINT');
    await notifyProgress(lifecycle, 'VALIDATING');
    const targetProbe = await probeMarketSchemaConnection(connection);
    if (!targetProbe.isCurrent) {
      throw new Error('MARKET_SCHEMA_UPGRADE_TARGET_SCHEMA_INVALID');
    }
    const targetSnapshot = await readDataSnapshot(connection);
    if (!snapshotsMatch(sourceSnapshot, targetSnapshot)) {
      throw new Error('MARKET_SCHEMA_UPGRADE_DATA_MISMATCH');
    }
    targetIdentity = buildDataIdentity(MARKET_SCHEMA_VERSION, targetSnapshot);
    const derivedCountResult = await connection.run(`
      SELECT
        (SELECT COUNT(*) FROM market_timeline_meta) +
        (SELECT COUNT(*) FROM market_display_bars) +
        (SELECT COUNT(*) FROM market_display_anchors) +
        (SELECT COUNT(*) FROM market_bar_chunk_anchors) AS derived_count
    `);
    const derivedRows = await derivedCountResult.getRowObjectsJS();
    if (stringifyInteger((derivedRows[0] as { derived_count?: unknown })?.derived_count) !== '0') {
      throw new Error('MARKET_SCHEMA_UPGRADE_DERIVED_STATE_NOT_EMPTY');
    }
  } finally {
    closeConnection(connection);
    closeInstance(instance);
  }
  if (fs.existsSync(`${tempPath}.wal`)) {
    throw new Error('MARKET_SCHEMA_UPGRADE_TARGET_WAL_NOT_CHECKPOINTED');
  }
  if (!targetIdentity) {
    throw new Error('MARKET_SCHEMA_UPGRADE_TARGET_IDENTITY_MISSING');
  }
  syncFile(tempPath);
  return targetIdentity;
};

const probeFile = async (
  sourcePath: string,
  identityHashMode: 'CANONICAL_DOUBLE' | 'NATIVE' = 'CANONICAL_DOUBLE',
): Promise<{
  schemaVersion: string | null;
  isCurrent: boolean;
  schemaMatchesVersionManifest: boolean;
  missingSchemaRequirements: string[];
  sourceSnapshot: MarketDataSnapshot | null;
}> => {
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  try {
    ({ instance, connection } = await openDatabase(sourcePath, true));
    const probe = await probeMarketSchemaConnection(connection);
    const sourceManifestFingerprint =
      await computeMarketSchemaConnectionManifestFingerprint(connection);
    const expectedSourceManifestFingerprint = probe.schemaVersion
      ? SUPPORTED_SOURCE_SCHEMA_MANIFESTS[probe.schemaVersion]
      : undefined;
    const schemaMatchesVersionManifest =
      probe.schemaVersion === MARKET_SCHEMA_VERSION
        ? probe.schemaMatchesManifest
        : Boolean(
            expectedSourceManifestFingerprint &&
              sourceManifestFingerprint === expectedSourceManifestFingerprint,
          );
    const sourceSnapshot = schemaMatchesVersionManifest
      ? await readDataSnapshot(connection, identityHashMode)
      : null;
    return {
      schemaVersion: probe.schemaVersion,
      isCurrent: probe.isCurrent,
      schemaMatchesVersionManifest,
      missingSchemaRequirements: schemaMatchesVersionManifest
        ? []
        : probe.missingSchemaRequirements,
      sourceSnapshot,
    };
  } finally {
    closeConnection(connection);
    closeInstance(instance);
  }
};

const inspectCandidateState = async (
  filePath: string,
  identityHashMode: 'CANONICAL_DOUBLE' | 'NATIVE' = 'CANONICAL_DOUBLE',
): Promise<CandidateState> => {
  if (!fs.existsSync(filePath)) {
    return { kind: 'MISSING', identity: null };
  }
  try {
    const probe = await probeFile(filePath, identityHashMode);
    if (!probe.sourceSnapshot) {
      return { kind: 'UNKNOWN', identity: null };
    }
    if (probe.isCurrent && probe.schemaVersion === MARKET_SCHEMA_VERSION) {
      return {
        kind: 'CURRENT',
        identity: buildDataIdentity(MARKET_SCHEMA_VERSION, probe.sourceSnapshot),
      };
    }
    if (
      probe.schemaVersion &&
      SUPPORTED_MARKET_SCHEMA_UPGRADES[probe.schemaVersion] === MARKET_SCHEMA_VERSION &&
      probe.schemaMatchesVersionManifest
    ) {
      return {
        kind: 'SOURCE',
        identity: buildDataIdentity(probe.schemaVersion, probe.sourceSnapshot),
      };
    }
    return { kind: 'UNKNOWN', identity: null };
  } catch {
    return { kind: 'CORRUPT', identity: null };
  }
};

const failedResult = ({
  schemaVersion = null,
  reason,
  missingSchemaRequirements = [],
}: {
  schemaVersion?: string | null;
  reason: 'SCHEMA_MISMATCH' | 'DATABASE_CORRUPTED';
  missingSchemaRequirements?: string[];
}): MarketSchemaUpgradeResult => ({
  status: reason === 'SCHEMA_MISMATCH' ? 'UNSUPPORTED' : 'FAILED',
  schemaVersion,
  isCurrent: false,
  issueReason: reason,
  missingSchemaRequirements,
  backupPath: null,
  requiredHeadroomBytes: null,
  availableHeadroomBytes: null,
});

export const probeAndUpgradeMarketSchema = async (
  storageLayout: DesktopStorageLayout,
  lifecycle: MarketSchemaUpgradeLifecycle = {},
): Promise<MarketSchemaUpgradeResult> => {
  const sourcePath = storageLayout.marketDbPath;
  try {
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.mkdirSync(storageLayout.duckdbTempDir, { recursive: true });
  } catch {
    return failedResult({ reason: 'DATABASE_CORRUPTED' });
  }

  await notifyProgress(lifecycle, 'PROBING');
  const recovery = await recoverInterruptedUpgrade(sourcePath);
  if (!recovery.ok) {
    return failedResult({ reason: 'DATABASE_CORRUPTED' });
  }
  if (!fs.existsSync(sourcePath)) {
    return {
      status: 'NO_DATABASE',
      schemaVersion: MARKET_SCHEMA_VERSION,
      isCurrent: true,
      issueReason: null,
      missingSchemaRequirements: [],
      backupPath: recovery.retainedBackupPath,
      requiredHeadroomBytes: null,
      availableHeadroomBytes: null,
    };
  }

  let sourceProbe: Awaited<ReturnType<typeof probeFile>>;
  try {
    sourceProbe = await probeFile(sourcePath);
  } catch {
    return failedResult({ reason: 'DATABASE_CORRUPTED' });
  }
  if (sourceProbe.isCurrent) {
    return {
      status: 'CURRENT',
      schemaVersion: sourceProbe.schemaVersion,
      isCurrent: true,
      issueReason: null,
      missingSchemaRequirements: [],
      backupPath: recovery.retainedBackupPath,
      requiredHeadroomBytes: null,
      availableHeadroomBytes: null,
    };
  }
  if (
    !sourceProbe.schemaVersion ||
    SUPPORTED_MARKET_SCHEMA_UPGRADES[sourceProbe.schemaVersion] !== MARKET_SCHEMA_VERSION ||
    !sourceProbe.schemaMatchesVersionManifest ||
    !sourceProbe.sourceSnapshot
  ) {
    return failedResult({
      schemaVersion: sourceProbe.schemaVersion,
      reason: 'SCHEMA_MISMATCH',
      missingSchemaRequirements: sourceProbe.missingSchemaRequirements,
    });
  }

  let requiredHeadroomBytes: number;
  try {
    requiredHeadroomBytes = computeUpgradeHeadroomBytes(sourcePath);
  } catch {
    return failedResult({
      schemaVersion: sourceProbe.schemaVersion,
      reason: 'DATABASE_CORRUPTED',
    });
  }
  const availableHeadroomBytes = readAvailableBytes(path.dirname(sourcePath));
  if (
    availableHeadroomBytes === null ||
    availableHeadroomBytes < requiredHeadroomBytes
  ) {
    return {
      status: 'INSUFFICIENT_DISK_SPACE',
      schemaVersion: sourceProbe.schemaVersion,
      isCurrent: false,
      issueReason: null,
      missingSchemaRequirements: [],
      backupPath: null,
      requiredHeadroomBytes,
      availableHeadroomBytes,
    };
  }

  try {
    await checkpointLegacySource(sourcePath);
    sourceProbe = await probeFile(sourcePath);
    if (
      !sourceProbe.schemaVersion ||
      SUPPORTED_MARKET_SCHEMA_UPGRADES[sourceProbe.schemaVersion] !== MARKET_SCHEMA_VERSION ||
      !sourceProbe.schemaMatchesVersionManifest ||
      !sourceProbe.sourceSnapshot
    ) {
      return failedResult({
        schemaVersion: sourceProbe.schemaVersion,
        reason: 'SCHEMA_MISMATCH',
        missingSchemaRequirements: sourceProbe.missingSchemaRequirements,
      });
    }
  } catch {
    return failedResult({
      schemaVersion: sourceProbe.schemaVersion,
      reason: 'DATABASE_CORRUPTED',
    });
  }

  const suffix = `${Date.now().toString(36)}-${randomUUID()}`;
  const tempPath = `${sourcePath}.upgrade-${suffix}`;
  const backupPath = `${sourcePath}.pre-upgrade-${suffix}.bak`;
  const failedPath = `${sourcePath}.failed-upgrade-${suffix}.bak`;
  const journalPath = `${sourcePath}${MARKET_SCHEMA_UPGRADE_JOURNAL_SUFFIX}`;
  const fromSchemaVersion = sourceProbe.schemaVersion;
  if (!fromSchemaVersion) {
    return failedResult({
      schemaVersion: sourceProbe.schemaVersion,
      reason: 'SCHEMA_MISMATCH',
      missingSchemaRequirements: sourceProbe.missingSchemaRequirements,
    });
  }
  let journal: UpgradeJournal = {
    formatVersion: 3,
    sourcePath,
    tempPath,
    backupPath,
    failedPath,
    fromSchemaVersion,
    phase: 'PREPARING',
    oldIdentity: buildDataIdentity(
      fromSchemaVersion,
      sourceProbe.sourceSnapshot,
    ),
    newIdentity: null,
  };
  try {
    writeJournal(journalPath, journal);
  } catch {
    try {
      fs.rmSync(`${journalPath}.tmp`, { force: true });
    } catch {
      // The source database has not been touched; the staging journal is inert.
    }
    return failedResult({
      schemaVersion: sourceProbe.schemaVersion,
      reason: 'DATABASE_CORRUPTED',
    });
  }

  try {
    const newIdentity = await buildAndValidateTarget({
      sourcePath,
      tempPath,
      sourceSnapshot: sourceProbe.sourceSnapshot,
      lifecycle,
    });
    journal = { ...journal, phase: 'TARGET_VALIDATED', newIdentity };
    writeJournal(journalPath, journal);
    await notifyProgress(lifecycle, 'SWITCHING');
    journal = { ...journal, phase: 'SWITCHING' };
    writeJournal(journalPath, journal);
    moveFileSet(sourcePath, backupPath);
    syncDirectory(path.dirname(sourcePath));
    journal = { ...journal, phase: 'SOURCE_BACKED_UP' };
    writeJournal(journalPath, journal);
    moveFileSet(tempPath, sourcePath);
    syncDirectory(path.dirname(sourcePath));
    journal = { ...journal, phase: 'TARGET_INSTALLED' };
    writeJournal(journalPath, journal);

    await lifecycle.afterAtomicSwap?.(sourcePath);
    await notifyProgress(lifecycle, 'VALIDATING');
    const installedProbe = await probeFile(sourcePath);
    const installedIdentity = installedProbe.sourceSnapshot
      ? buildDataIdentity(MARKET_SCHEMA_VERSION, installedProbe.sourceSnapshot)
      : null;
    if (
      !installedProbe.isCurrent ||
      !identitiesMatch(installedIdentity, journal.newIdentity)
    ) {
      throw new Error('MARKET_SCHEMA_UPGRADE_INSTALLED_SCHEMA_INVALID');
    }
    journal = { ...journal, phase: 'VERIFIED' };
    writeJournal(journalPath, journal);
    removeJournalDurably(journalPath);
    return {
      status: 'UPGRADED',
      schemaVersion: MARKET_SCHEMA_VERSION,
      isCurrent: true,
      issueReason: null,
      missingSchemaRequirements: [],
      backupPath,
      requiredHeadroomBytes,
      availableHeadroomBytes,
    };
  } catch {
    // Recovery owns every destructive decision and validates both candidates
    // against the identities recorded before the first rename.
    await recoverInterruptedUpgrade(sourcePath);
    return failedResult({
      schemaVersion: sourceProbe.schemaVersion,
      reason: 'DATABASE_CORRUPTED',
    });
  }
};
