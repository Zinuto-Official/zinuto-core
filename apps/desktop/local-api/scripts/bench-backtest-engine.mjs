// SPDX-License-Identifier: GPL-3.0-only

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { DuckDBInstance } from '@duckdb/node-api';

const repoRoot = path.resolve(import.meta.dirname, '../../..', '..');
const defaultEngineBin = path.join(
  repoRoot,
  'apps/desktop/backtest-engine/target/debug/open-trading-practice-backtest-engine',
);
const engineBin = process.env.ZINUTO_BACKTEST_ENGINE_BIN || defaultEngineBin;
const rowsPerInstrument = Number.parseInt(
  process.argv.find((arg) => arg.startsWith('--rows-per-instrument='))?.split('=')[1] ?? '5000',
  10,
);
const instrumentCounts = (
  process.argv.find((arg) => arg.startsWith('--instruments='))?.split('=')[1] ?? '10,50,200'
)
  .split(',')
  .map((item) => Number.parseInt(item.trim(), 10))
  .filter((item) => Number.isFinite(item) && item > 0);
const singleCliTimeoutMs = Number.parseInt(
  process.argv.find((arg) => arg.startsWith('--single-cli-timeout-ms='))?.split('=')[1] ?? '10000',
  10,
);

if (!fs.existsSync(engineBin)) {
  throw new Error(`Backtest engine binary not found: ${engineBin}`);
}

const buildEngineEnv = () => {
  const engineDir = path.dirname(engineBin);
  const dylibDirs = [
    path.join(engineDir, 'deps'),
    engineDir,
    path.join(repoRoot, 'node_modules/@duckdb/node-bindings-darwin-arm64'),
  ].filter((item) => fs.existsSync(item));
  const joinLibraryPath = (existing) =>
    Array.from(new Set([...dylibDirs, ...(existing ? existing.split(':') : [])]))
      .filter(Boolean)
      .join(':');
  return {
    ...process.env,
    DYLD_LIBRARY_PATH: joinLibraryPath(process.env.DYLD_LIBRARY_PATH),
    LD_LIBRARY_PATH: joinLibraryPath(process.env.LD_LIBRARY_PATH),
  };
};

const buildConfig = () => ({
  strategySource: 'BUY:1;',
  initialCapital: 100000,
  priceMode: 'NEXT_OPEN',
  signalExecutionMode: 'NEXT_OPEN',
  orderSizing: {
    mode: 'FIXED_QTY',
    value: 10,
  },
  tradingSettings: {
    marketPresetId: 'A_SHARE',
    assetClass: 'STOCK',
    minTradeStep: 1,
    contractMultiplier: 1,
    allowShortSelling: false,
    allowLongMarginTrading: false,
    tradeAmountIncludesFees: false,
    commissionRate: 0,
    makerFeeRate: 0,
    takerFeeRate: 0,
    fundingRate: 0,
    transferFeeRate: 0,
    regulatoryFeeRate: 0,
    platformFeeRate: 0,
    transactionLevyRate: 0,
    stampDutyRate: 0,
    slippageRate: 0,
    commissionMinimumFee: 0,
    platformFeeMinimumFee: 0,
    transactionLevyMinimumFee: 0,
    stampDutyMode: 'SELL',
  },
});

const buildInstruments = (instrumentCount) =>
  Array.from({ length: instrumentCount }, (_, index) => ({
    instrumentId: `bench-${index}`,
    symbol: `B${String(index).padStart(4, '0')}`,
    baseTimeframe: '1m',
    name: null,
    barCount: rowsPerInstrument,
  }));

const buildSignalsByInstrument = (instruments) =>
  Object.fromEntries(
    instruments.map((instrument) => [
      instrument.instrumentId,
      [
        { barIndex: 0, buy: true, sell: false, short: false, cover: false },
        { barIndex: rowsPerInstrument - 2, buy: false, sell: true, short: false, cover: false },
      ],
    ]),
  );

const createMarketDb = async (dbPath, instrumentCount) => {
  const instance = await DuckDBInstance.create(dbPath);
  const connection = await instance.connect();
  await connection.run(`
    CREATE TABLE market_bars (
      instrument_id VARCHAR NOT NULL,
      raw_index BIGINT NOT NULL,
      ts_ms BIGINT NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL NOT NULL
    )
  `);
  await connection.run(`
    INSERT INTO market_bars
    SELECT
      'bench-' || CAST(inst.range AS VARCHAR) AS instrument_id,
      bar.range AS raw_index,
      1767267000000 + bar.range * 60000 AS ts_ms,
      CAST(100 + inst.range * 0.01 + bar.range * 0.001 AS REAL) AS open,
      CAST(101 + inst.range * 0.01 + bar.range * 0.001 AS REAL) AS high,
      CAST( 99 + inst.range * 0.01 + bar.range * 0.001 AS REAL) AS low,
      CAST(100.5 + inst.range * 0.01 + bar.range * 0.001 AS REAL) AS close,
      CAST(1000 + bar.range AS REAL) AS volume
    FROM range(0, ${String(instrumentCount)}) AS inst
    CROSS JOIN range(0, ${String(rowsPerInstrument)}) AS bar
  `);
  connection.closeSync();
  instance.closeSync();
};

const readInstrumentBars = async (dbPath, instrumentId) => {
  const instance = await DuckDBInstance.create(dbPath);
  const connection = await instance.connect();
  try {
    const escapedInstrumentId = instrumentId.replaceAll("'", "''");
    const result = await connection.runAndReadAll(`
      SELECT raw_index, ts_ms, open, high, low, close, volume
      FROM market_bars
      WHERE instrument_id = '${escapedInstrumentId}'
      ORDER BY raw_index ASC
    `);
    return result.getRowObjectsJS().map((row) => ({
      ts: new Date(Number(row.ts_ms)).toISOString(),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    }));
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
};

const summarizeDuration = ({ benchmark, instrumentCount, durationMs, nativeWorkers = null, error = null }) => ({
  benchmark,
  instruments: instrumentCount,
  rows: instrumentCount * rowsPerInstrument,
  durationMs: Math.round(durationMs),
  rowsPerSecond: Math.round((instrumentCount * rowsPerInstrument) / (durationMs / 1000)),
  nativeWorkers,
  error,
});

const runNodeSerialReferenceBench = async ({ dbPath, instruments, signalsByInstrument }) => {
  const config = buildConfig();
  const started = performance.now();
  for (const instrument of instruments) {
    const bars = await readInstrumentBars(dbPath, instrument.instrumentId);
    let cash = config.initialCapital;
    let positionQty = 0;
    let averageCost = 0;
    for (const signal of signalsByInstrument[instrument.instrumentId] ?? []) {
      const bar = bars[signal.barIndex + (config.signalExecutionMode === 'NEXT_OPEN' ? 1 : 0)];
      if (!bar) {
        continue;
      }
      const price = config.signalExecutionMode === 'NEXT_OPEN' ? bar.open : bar.close;
      if (signal.buy && positionQty <= 0) {
        const qty = Math.max(0, Math.floor(config.orderSizing.value ?? 0));
        const gross = price * qty;
        if (qty > 0 && gross <= cash) {
          cash -= gross;
          positionQty = qty;
          averageCost = price;
        }
      }
      if (signal.sell && positionQty > 0) {
        cash += price * positionQty;
        positionQty = 0;
        averageCost = 0;
      }
    }
    const lastClose = bars.at(-1)?.close ?? averageCost;
    Number(cash + positionQty * lastClose);
  }
  return summarizeDuration({
    benchmark: 'node-serial-reference',
    instrumentCount: instruments.length,
    durationMs: performance.now() - started,
  });
};

const runRustSingleJsonCliBench = async ({ dbPath, instruments, signalsByInstrument }) => {
  const config = buildConfig();
  const started = performance.now();
  for (const instrument of instruments) {
    const bars = await readInstrumentBars(dbPath, instrument.instrumentId);
    const result = spawnSync(
      engineBin,
      [],
      {
        encoding: 'utf8',
        env: buildEngineEnv(),
        input: JSON.stringify({
          config,
          instrument,
          bars,
          signals: signalsByInstrument[instrument.instrumentId] ?? [],
          priceMode: 'NEXT_OPEN',
        }),
        maxBuffer: 64 * 1024 * 1024,
        timeout: Number.isFinite(singleCliTimeoutMs) && singleCliTimeoutMs > 0
          ? singleCliTimeoutMs
          : 10000,
      },
    );
    if (result.error) {
      return summarizeDuration({
        benchmark: 'rust-single-json-cli',
        instrumentCount: instruments.length,
        durationMs: performance.now() - started,
        error: result.error.message,
      });
    }
    if (result.status !== 0) {
      return summarizeDuration({
        benchmark: 'rust-single-json-cli',
        instrumentCount: instruments.length,
        durationMs: performance.now() - started,
        error: result.stderr || result.stdout || `exit status ${String(result.status)}`,
      });
    }
  }
  return summarizeDuration({
    benchmark: 'rust-single-json-cli',
    instrumentCount: instruments.length,
    durationMs: performance.now() - started,
  });
};

const runRustBatchBench = async ({ dbPath, tempDir, instruments, signalsByInstrument }) => {
  const outputDir = path.join(tempDir, 'out');
  const requestPath = path.join(tempDir, 'request.json');
  fs.writeFileSync(
    requestPath,
    JSON.stringify({
      batchId: `bench-${instruments.length}`,
      marketDbPath: dbPath,
      outputDir,
      config: buildConfig(),
      instruments,
      priceMode: 'NEXT_OPEN',
      workerCount: Number.parseInt(process.env.ZINUTO_BACKTEST_ENGINE_WORKERS || '0', 10) || undefined,
      engineVersion: 'bench',
      signalsByInstrument,
    }),
  );
  const started = performance.now();
  const result = spawnSync(engineBin, ['--batch', '--input', requestPath], {
    encoding: 'utf8',
    env: buildEngineEnv(),
    maxBuffer: 64 * 1024 * 1024,
  });
  const durationMs = performance.now() - started;
  if (result.status !== 0) {
    throw new Error(`native batch failed: ${result.stderr || result.stdout}`);
  }
  const parsed = JSON.parse(result.stdout);
  return summarizeDuration({
    benchmark: 'rust-batch-duckdb',
    instrumentCount: instruments.length,
    durationMs,
    nativeWorkers: parsed.nativeWorkers,
  });
};

const runBench = async (instrumentCount) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zinuto-backtest-bench-'));
  const dbPath = path.join(tempDir, 'market.duckdb');
  await createMarketDb(dbPath, instrumentCount);
  const instruments = buildInstruments(instrumentCount);
  const signalsByInstrument = buildSignalsByInstrument(instruments);
  return [
    await runNodeSerialReferenceBench({ dbPath, instruments, signalsByInstrument }),
    await runRustSingleJsonCliBench({ dbPath, instruments, signalsByInstrument }),
    await runRustBatchBench({ dbPath, tempDir, instruments, signalsByInstrument }),
  ];
};

const rows = [];
for (const instrumentCount of instrumentCounts) {
  rows.push(...await runBench(instrumentCount));
}
console.table(rows);
