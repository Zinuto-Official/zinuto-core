// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import Database from 'better-sqlite3';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';

type PriceStorageMode = 'REAL' | 'DECIMAL' | 'BIGINT';

type BenchOptions = {
  instruments: number[];
  rowsPerInstrument: number;
  runs: number;
  outputDir: string | null;
};

type StorageRunResult = {
  mode: PriceStorageMode;
  run: number;
  instruments: number;
  rowsPerInstrument: number;
  rows: number;
  insertMs: number;
  checkpointMs: number;
  duckDbBytes: number;
  ohlcStorageInfo: Array<{
    columnName: string;
    segmentType: string;
    compression: string;
    segments: number;
    values: number;
  }>;
};

type PayloadRunResult = {
  run: number;
  rows: number;
  writeMs: number;
  readMs: number;
  payloadBytes: number;
};

type QuickCheckRunResult = {
  run: number;
  files: number;
  elapsedMs: number;
  sizeMtimeHits: number;
  changedFiles: number;
  fingerprintRequired: number;
};

type BenchReport = {
  generatedAt: string;
  options: BenchOptions;
  storage: StorageRunResult[];
  payload: PayloadRunResult[];
  quickCheck: QuickCheckRunResult[];
  summary: {
    storageByMode: Record<PriceStorageMode, { medianDuckDbBytes: number; medianInsertMs: number }>;
    payloadMedian: { writeMs: number; readMs: number; payloadBytes: number };
    quickCheckMedian: { elapsedMs: number; fingerprintRequiredRate: number };
  };
};

const DEFAULT_INSTRUMENTS = [10, 50];
const DEFAULT_ROWS_PER_INSTRUMENT = 5_000;
const DEFAULT_RUNS = 3;

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const parseOptions = (): BenchOptions => {
  const args = process.argv.slice(2);
  const readArg = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const direct = args.find((arg) => arg.startsWith(prefix));
    if (direct) {
      return direct.slice(prefix.length);
    }
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const instrumentsRaw = readArg('instruments');
  const instruments = instrumentsRaw
    ? instrumentsRaw
        .split(',')
        .map((item) => parsePositiveInt(item.trim(), 0))
        .filter((item) => item > 0)
    : DEFAULT_INSTRUMENTS;
  return {
    instruments: instruments.length ? instruments : DEFAULT_INSTRUMENTS,
    rowsPerInstrument: parsePositiveInt(
      readArg('rows-per-instrument'),
      DEFAULT_ROWS_PER_INSTRUMENT,
    ),
    runs: parsePositiveInt(readArg('runs'), DEFAULT_RUNS),
    outputDir: readArg('out') ?? null,
  };
};

const median = (values: number[]): number => {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (!sorted.length) {
    return 0;
  }
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle] ?? 0;
};

const elapsed = async <T>(task: () => Promise<T> | T): Promise<{ ms: number; value: T }> => {
  const startedAt = performance.now();
  const value = await task();
  return {
    ms: performance.now() - startedAt,
    value,
  };
};

const getFileBytes = async (filePath: string): Promise<number> =>
  (await fs.stat(filePath).catch(() => ({ size: 0 }))).size;

const createMarketSchemaSql = (mode: PriceStorageMode): string => {
  const priceType = mode === 'DECIMAL' ? 'DECIMAL(18,8)' : mode;
  return `
    CREATE TABLE market_bars (
      instrument_id VARCHAR NOT NULL,
      raw_index BIGINT NOT NULL,
      ts_ms BIGINT NOT NULL,
      open ${priceType} NOT NULL,
      high ${priceType} NOT NULL,
      low ${priceType} NOT NULL,
      close ${priceType} NOT NULL,
      volume DOUBLE NOT NULL
    )
  `;
};

const priceExpr = (mode: PriceStorageMode, delta: string): string => {
  const value = `100 + instrument_index * 0.01 + raw_index * 0.0001 + ${delta}`;
  if (mode === 'BIGINT') {
    return `CAST(ROUND((${value}) * 100000000) AS BIGINT)`;
  }
  if (mode === 'DECIMAL') {
    return `CAST(${value} AS DECIMAL(18,8))`;
  }
  return `CAST(${value} AS REAL)`;
};

const insertSyntheticBarsSql = (
  mode: PriceStorageMode,
  instruments: number,
  rowsPerInstrument: number,
): string => {
  const totalRows = instruments * rowsPerInstrument;
  return `
    INSERT INTO market_bars
    SELECT
      'bench_' || LPAD(CAST(instrument_index AS VARCHAR), 5, '0') AS instrument_id,
      raw_index,
      1704067200000 + raw_index * 60000 AS ts_ms,
      ${priceExpr(mode, '0')} AS open,
      ${priceExpr(mode, '0.25')} AS high,
      ${priceExpr(mode, '-0.25')} AS low,
      ${priceExpr(mode, '0.05')} AS close,
      CAST(1000 + (raw_index % 1000) AS DOUBLE) AS volume
    FROM (
      SELECT
        CAST(FLOOR(i / ${rowsPerInstrument}) AS BIGINT) AS instrument_index,
        CAST(i % ${rowsPerInstrument} AS BIGINT) AS raw_index
      FROM range(${totalRows}) AS generated(i)
    ) AS source
  `;
};

const readOhlcStorageInfo = async (
  connection: DuckDBConnection,
): Promise<StorageRunResult['ohlcStorageInfo']> => {
  const result = await connection.run(`
    SELECT column_name,
           segment_type,
           compression,
           COUNT(*) AS segments,
           COALESCE(SUM(count), 0) AS values
      FROM pragma_storage_info('market_bars')
     WHERE column_name IN ('open', 'high', 'low', 'close')
     GROUP BY column_name, segment_type, compression
     ORDER BY column_name ASC, segment_type ASC, compression ASC
  `);
  const rows = (await result.getRowObjectsJS()) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    columnName: String(row.column_name ?? ''),
    segmentType: String(row.segment_type ?? ''),
    compression: String(row.compression ?? ''),
    segments: Number(row.segments ?? 0),
    values: Number(row.values ?? 0),
  }));
};

const runStorageBench = async (
  workDir: string,
  mode: PriceStorageMode,
  run: number,
  instruments: number,
  rowsPerInstrument: number,
): Promise<StorageRunResult> => {
  const dbPath = path.join(workDir, `market-${mode.toLowerCase()}-${instruments}-${run}.duckdb`);
  const instance = await DuckDBInstance.fromCache(dbPath);
  const connection = await instance.connect();
  try {
    await connection.run(createMarketSchemaSql(mode));
    const insert = await elapsed(() =>
      connection.run(insertSyntheticBarsSql(mode, instruments, rowsPerInstrument)),
    );
    const checkpoint = await elapsed(() => connection.run('CHECKPOINT'));
    const ohlcStorageInfo = await readOhlcStorageInfo(connection);
    return {
      mode,
      run,
      instruments,
      rowsPerInstrument,
      rows: instruments * rowsPerInstrument,
      insertMs: insert.ms,
      checkpointMs: checkpoint.ms,
      duckDbBytes: await getFileBytes(dbPath),
      ohlcStorageInfo,
    };
  } finally {
    try {
      connection.closeSync();
    } catch {
      // ignore close failures in bench cleanup
    }
    try {
      instance.closeSync();
    } catch {
      // ignore close failures in bench cleanup
    }
  }
};

const runPayloadBench = async (
  workDir: string,
  run: number,
  rows: number,
): Promise<PayloadRunResult> => {
  const payloadPath = path.join(workDir, `payload-${rows}-${run}.sqlite`);
  const payloadDb = new Database(payloadPath);
  try {
    payloadDb.pragma('journal_mode = OFF');
    payloadDb.pragma('synchronous = OFF');
    payloadDb.pragma('temp_store = MEMORY');
    payloadDb.pragma('cache_size = -65536');
    payloadDb.exec(`
      CREATE TABLE portable_export_market_bars (
        instrument_id TEXT NOT NULL,
        ts_ms INTEGER NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume REAL NOT NULL,
        PRIMARY KEY (instrument_id, ts_ms)
      )
    `);
    const insertStatement = payloadDb.prepare(
      `INSERT OR REPLACE INTO portable_export_market_bars (
        instrument_id, ts_ms, open, high, low, close, volume
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const write = elapsed(() => {
      payloadDb.exec('BEGIN IMMEDIATE');
      try {
        for (let index = 0; index < rows; index += 1) {
          const instrumentId = `bench_${String(Math.floor(index / 5000)).padStart(5, '0')}`;
          const rawIndex = index % 5000;
          const price = 100 + rawIndex * 0.0001;
          insertStatement.run(
            instrumentId,
            1704067200000 + rawIndex * 60000,
            price,
            price + 0.25,
            price - 0.25,
            price + 0.05,
            1000 + (rawIndex % 1000),
          );
        }
        payloadDb.exec('COMMIT');
      } catch (error) {
        payloadDb.exec('ROLLBACK');
        throw error;
      }
    });
    const readStatement = payloadDb.prepare(
      'SELECT COUNT(*) AS count, COALESCE(SUM(close), 0) AS close_sum FROM portable_export_market_bars',
    );
    const read = elapsed(() => readStatement.get());
    return {
      run,
      rows,
      writeMs: (await write).ms,
      readMs: (await read).ms,
      payloadBytes: await getFileBytes(payloadPath),
    };
  } finally {
    payloadDb.close();
  }
};

const runQuickCheckBench = (run: number, files: number): QuickCheckRunResult => {
  const existing = new Map<string, { size: number; mtimeMs: number; fingerprint: string }>();
  for (let index = 0; index < files; index += 1) {
    existing.set(`file-${index}.csv`, {
      size: 10_000 + index,
      mtimeMs: 1_700_000_000_000 + index,
      fingerprint: `sha256:${String(index).padStart(64, '0').slice(-64)}`,
    });
  }
  const startedAt = performance.now();
  let sizeMtimeHits = 0;
  let changedFiles = 0;
  let fingerprintRequired = 0;
  for (let index = 0; index < files; index += 1) {
    const key = `file-${index}.csv`;
    const previous = existing.get(key);
    const changed = index % 17 === 0;
    const missingMtime = index % 11 === 0;
    const incomingSize = previous ? previous.size + (changed ? 1 : 0) : 0;
    const incomingMtime = missingMtime ? 0 : previous?.mtimeMs ?? 0;
    if (previous && incomingSize === previous.size && incomingMtime > 0 && incomingMtime === previous.mtimeMs) {
      sizeMtimeHits += 1;
      continue;
    }
    if (!previous || !previous.fingerprint || missingMtime) {
      fingerprintRequired += 1;
    }
    changedFiles += 1;
  }
  return {
    run,
    files,
    elapsedMs: performance.now() - startedAt,
    sizeMtimeHits,
    changedFiles,
    fingerprintRequired,
  };
};

const buildSummary = (
  storage: StorageRunResult[],
  payload: PayloadRunResult[],
  quickCheck: QuickCheckRunResult[],
): BenchReport['summary'] => {
  const storageByMode = Object.fromEntries(
    (['REAL', 'DECIMAL', 'BIGINT'] as PriceStorageMode[]).map((mode) => {
      const rows = storage.filter((row) => row.mode === mode);
      return [
        mode,
        {
          medianDuckDbBytes: median(rows.map((row) => row.duckDbBytes)),
          medianInsertMs: median(rows.map((row) => row.insertMs)),
        },
      ];
    }),
  ) as BenchReport['summary']['storageByMode'];
  const quickFiles = median(quickCheck.map((row) => row.files));
  const quickFingerprintRequired = median(quickCheck.map((row) => row.fingerprintRequired));
  return {
    storageByMode,
    payloadMedian: {
      writeMs: median(payload.map((row) => row.writeMs)),
      readMs: median(payload.map((row) => row.readMs)),
      payloadBytes: median(payload.map((row) => row.payloadBytes)),
    },
    quickCheckMedian: {
      elapsedMs: median(quickCheck.map((row) => row.elapsedMs)),
      fingerprintRequiredRate: quickFiles > 0 ? quickFingerprintRequired / quickFiles : 0,
    },
  };
};

const formatBytes = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;

const toMarkdown = (report: BenchReport): string => {
  const storageLines = (['REAL', 'DECIMAL', 'BIGINT'] as PriceStorageMode[])
    .map((mode) => {
      const summary = report.summary.storageByMode[mode];
      return `| ${mode} | ${formatBytes(summary.medianDuckDbBytes)} | ${summary.medianInsertMs.toFixed(1)} |`;
    })
    .join('\n');
  return [
    '# Market Storage Bench',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Storage Summary',
    '',
    '| Mode | Median DuckDB bytes | Median insert ms |',
    '| --- | ---: | ---: |',
    storageLines,
    '',
    '## Payload Summary',
    '',
    `- Median payload bytes: ${formatBytes(report.summary.payloadMedian.payloadBytes)}`,
    `- Median payload write: ${report.summary.payloadMedian.writeMs.toFixed(1)} ms`,
    `- Median payload read: ${report.summary.payloadMedian.readMs.toFixed(1)} ms`,
    '',
    '## Quick Check Summary',
    '',
    `- Median elapsed: ${report.summary.quickCheckMedian.elapsedMs.toFixed(3)} ms`,
    `- Fingerprint fallback rate: ${(report.summary.quickCheckMedian.fingerprintRequiredRate * 100).toFixed(2)}%`,
    '',
  ].join('\n');
};

const writeReport = async (report: BenchReport): Promise<void> => {
  const json = JSON.stringify(
    report,
    (_key, value) => (typeof value === 'bigint' ? Number(value) : value),
    2,
  );
  if (!report.options.outputDir) {
    console.log(json);
    console.log('\n' + toMarkdown(report));
    return;
  }
  await fs.mkdir(report.options.outputDir, { recursive: true });
  await fs.writeFile(path.join(report.options.outputDir, 'market-storage-bench.json'), json + '\n', 'utf8');
  await fs.writeFile(path.join(report.options.outputDir, 'market-storage-bench.md'), toMarkdown(report), 'utf8');
};

const main = async (): Promise<void> => {
  const options = parseOptions();
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-market-storage-bench-'));
  const storage: StorageRunResult[] = [];
  const payload: PayloadRunResult[] = [];
  const quickCheck: QuickCheckRunResult[] = [];
  try {
    for (let run = 1; run <= options.runs; run += 1) {
      for (const instruments of options.instruments) {
        for (const mode of ['REAL', 'DECIMAL', 'BIGINT'] as PriceStorageMode[]) {
          storage.push(await runStorageBench(workDir, mode, run, instruments, options.rowsPerInstrument));
        }
        const rows = instruments * options.rowsPerInstrument;
        payload.push(await runPayloadBench(workDir, run, rows));
        quickCheck.push(runQuickCheckBench(run, instruments));
      }
    }
    await writeReport({
      generatedAt: new Date().toISOString(),
      options,
      storage,
      payload,
      quickCheck,
      summary: buildSummary(storage, payload, quickCheck),
    });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
};

await main();
