// SPDX-License-Identifier: GPL-3.0-only

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import type { OhlcvBar } from '../../domain/models.js';
import { appError } from '../../kernel/appError.js';
import { runBacktestReferenceEngine } from './referenceEngine.js';
import type {
  BacktestConflict,
  BacktestConfig,
  BacktestInstrumentCandidate,
  BacktestInstrumentRunResult,
  BacktestReferenceEngineInput,
  BacktestSignal,
} from './types.js';

const BACKTEST_ENGINE_BIN_ENV = 'ZINUTO_BACKTEST_ENGINE_BIN';
const BACKTEST_NATIVE_BATCH_ENV = 'ZINUTO_BACKTEST_NATIVE_BATCH';
const BACKTEST_NATIVE_BATCH_WORKERS_ENV = 'ZINUTO_BACKTEST_ENGINE_WORKERS';
const BACKTEST_BATCH_ENGINE_TIMEOUT_MS = 600_000;
const BACKTEST_BATCH_ENGINE_VERSION = 'backtest-batch-v1';
const DEFAULT_MAX_EQUITY_POINTS_PER_SYMBOL = 2_000;
const DUCKDB_RUNTIME_LIBRARY_NAMES = process.platform === 'win32'
  ? ['duckdb.dll', 'libduckdb.dll']
  : process.platform === 'darwin'
    ? ['libduckdb.dylib']
    : ['libduckdb.so'];

type NativeBatchArtifactPaths = {
  resultsPath: string;
  fillsPath: string;
  equityPath: string;
  instrumentResultsPath?: string;
  committedPath: string;
};

type NativeBatchEngineResponse = {
  engine?: string;
  engineVersion?: string;
  batchId?: string;
  totalSymbols?: number;
  completedSymbols?: number;
  skippedSymbols?: number;
  skippedSymbolDetails?: Array<{
    instrumentId?: string;
    symbol?: string;
    reason?: string;
    message?: string;
  }>;
  nativeWorkers?: number;
  durationMs?: number;
  output?: NativeBatchArtifactPaths;
};

type NativeBatchInstrumentResultLine = {
  instrument?: BacktestInstrumentCandidate;
  result?: BacktestInstrumentRunResult['result'];
  fills?: BacktestInstrumentRunResult['fills'];
  equityCurve?: BacktestInstrumentRunResult['equityCurve'];
  conflicts?: BacktestConflict[];
};

type NativeBatchProgressLine = {
  event?: string;
  completed?: number;
  total?: number;
  symbol?: string;
};

export type BacktestNativeBatchProgress = {
  completed: number;
  total: number;
  symbol: string | null;
};

export type BacktestNativeBatchRunSummary = {
  engine: string;
  engineVersion: string;
  batchId: string;
  totalSymbols: number;
  completedSymbols: number;
  skippedSymbols: number;
  completedInstruments: Array<{
    instrumentId: string;
    symbol: string;
  }>;
  skippedSymbolDetails: Array<{
    instrumentId: string;
    symbol: string;
    reason: string;
    message?: string;
  }>;
  nativeWorkers: number | null;
  durationMs: number | null;
  importedSymbols: number;
};

type BacktestNativeBatchRunOptions = {
  batchId?: string;
  engineTimeoutMs?: number;
  isCancellationRequested?: () => boolean;
  onProgress?: (progress: BacktestNativeBatchProgress) => void;
  onResult?: (result: BacktestInstrumentRunResult) => void | Promise<void>;
};

export type BacktestNativeSignalPlan = {
  version: 1;
  semanticsVersion: 'backtest-evaluator-v1';
  program: unknown;
  parameterOverrides: Record<string, number>;
  outputKeys: string[];
};

export type BacktestNativeBatchInput = {
  batchId: string;
  config: BacktestConfig;
  instruments: BacktestInstrumentCandidate[];
  marketDbPath: string;
  signalPlan: BacktestNativeSignalPlan;
  priceMode: BacktestReferenceEngineInput['priceMode'];
};

const resolveNativeEnginePath = (): string | null => {
  const configured = String(process.env[BACKTEST_ENGINE_BIN_ENV] || '').trim();
  if (!configured) {
    return null;
  }
  if (!fs.existsSync(configured) || !fs.statSync(configured).isFile()) {
    throw appError('BACKTEST_NATIVE_ENGINE_UNAVAILABLE', {
      env: BACKTEST_ENGINE_BIN_ENV,
    });
  }
  return configured;
};

export const isNativeBatchBacktestEnabled = (): boolean => {
  const raw = String(process.env[BACKTEST_NATIVE_BATCH_ENV] || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(raw);
};

export const getNativeBatchBacktestRuntimeFacts = (): {
  engine: 'RUST_DUCKDB_BATCH' | 'TS_REFERENCE';
  nativeBatchEnabled: boolean;
  nativeEngineAvailable: boolean;
} => {
  const nativeBatchEnabled = isNativeBatchBacktestEnabled();
  let nativeEngineAvailable = false;
  if (nativeBatchEnabled) {
    try {
      nativeEngineAvailable = Boolean(resolveNativeEnginePath());
    } catch {
      nativeEngineAvailable = false;
    }
  }
  return {
    engine: nativeBatchEnabled && nativeEngineAvailable ? 'RUST_DUCKDB_BATCH' : 'TS_REFERENCE',
    nativeBatchEnabled,
    nativeEngineAvailable,
  };
};

const resolveNativeWorkerCount = (): number | undefined => {
  const raw = Number(process.env[BACKTEST_NATIVE_BATCH_WORKERS_ENV]);
  if (!Number.isFinite(raw) || raw <= 0) {
    const detected = typeof os.availableParallelism === 'function'
      ? os.availableParallelism()
      : os.cpus().length;
    return Math.max(1, Math.min(8, Math.floor(detected - 2)));
  }
  return Math.max(1, Math.min(32, Math.floor(raw)));
};

const activeNativeBatchChildren = new Map<string, ChildProcess>();
const cancelledNativeBatchIds = new Set<string>();

export const cancelNativeBacktestBatch = (batchId: string): void => {
  const normalizedBatchId = String(batchId || '').trim();
  if (!normalizedBatchId) {
    return;
  }
  cancelledNativeBatchIds.add(normalizedBatchId);
  activeNativeBatchChildren.get(normalizedBatchId)?.kill('SIGKILL');
};

export const resetNativeBacktestBatchCancellation = (batchId: string): void => {
  const normalizedBatchId = String(batchId || '').trim();
  if (normalizedBatchId && !activeNativeBatchChildren.has(normalizedBatchId)) {
    cancelledNativeBatchIds.delete(normalizedBatchId);
  }
};

const isNativeBatchCancellationRequested = (
  batchId: string,
  options: BacktestNativeBatchRunOptions,
): boolean => Boolean(
  (batchId && cancelledNativeBatchIds.has(batchId)) ||
  options.isCancellationRequested?.(),
);

const throwIfNativeBatchCancelled = (
  batchId: string,
  options: BacktestNativeBatchRunOptions,
): void => {
  if (isNativeBatchCancellationRequested(batchId, options)) {
    throw appError('BACKTEST_RUN_CANCELLED', batchId ? { batchId } : undefined);
  }
};

const resolveNativeBatchEngineTimeoutMs = (value: number | undefined): number =>
  Number.isFinite(value) && Number(value) > 0
    ? Math.max(1, Math.floor(Number(value)))
    : BACKTEST_BATCH_ENGINE_TIMEOUT_MS;

const isExistingDirectory = (dirPath: string): boolean =>
  fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();

const hasDuckDbRuntimeLibrary = (dirPath: string): boolean =>
  DUCKDB_RUNTIME_LIBRARY_NAMES.some((libraryName) => {
    const libraryPath = path.join(dirPath, libraryName);
    return fs.existsSync(libraryPath) && fs.statSync(libraryPath).isFile();
  });

const collectAncestorNodeModulesDirs = (startDir: string): string[] => {
  const dirs: string[] = [];
  let current = path.resolve(startDir);
  while (true) {
    dirs.push(path.join(current, 'node_modules'));
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return dirs;
};

const collectDuckDbBindingDirs = (nodeModulesDir: string): string[] => {
  const duckDbScopeDir = path.join(nodeModulesDir, '@duckdb');
  if (!isExistingDirectory(duckDbScopeDir)) {
    return [];
  }
  return fs.readdirSync(duckDbScopeDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('node-bindings-'))
    .map((entry) => path.join(duckDbScopeDir, entry.name))
    .filter(hasDuckDbRuntimeLibrary);
};

const resolveNativeEngineLibraryDirs = (enginePath: string): string[] => {
  const engineDir = path.dirname(enginePath);
  const directDirs = [
    path.join(engineDir, 'deps'),
    engineDir,
  ].filter((item) => isExistingDirectory(item) && hasDuckDbRuntimeLibrary(item));
  const nodeModulesDirs = [
    ...collectAncestorNodeModulesDirs(engineDir),
    ...collectAncestorNodeModulesDirs(process.cwd()),
  ].filter(isExistingDirectory);
  return Array.from(new Set([
    ...directDirs,
    ...nodeModulesDirs.flatMap(collectDuckDbBindingDirs),
  ]));
};

const copyNativeEngineEnvironmentValue = (
  target: NodeJS.ProcessEnv,
  source: NodeJS.ProcessEnv,
  name: string,
): void => {
  const value = source[name];
  if (typeof value === 'string' && value.length > 0) {
    target[name] = value;
  }
};

export const buildNativeEngineEnv = (
  enginePath: string,
  sourceEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv => {
  const dylibDirs = resolveNativeEngineLibraryDirs(enginePath);
  const joinLibraryPath = (existing: string | undefined): string =>
    Array.from(new Set([...dylibDirs, ...(existing ? existing.split(path.delimiter) : [])]))
      .filter(Boolean)
      .join(path.delimiter);
  const env: NodeJS.ProcessEnv = {};
  for (const name of [
    'HOME',
    'LANG',
    'LC_ALL',
    'SYSTEMROOT',
    'TEMP',
    'TMP',
    'TMPDIR',
    'USERPROFILE',
    'WINDIR',
  ]) {
    copyNativeEngineEnvironmentValue(env, sourceEnvironment, name);
  }
  const nonEmptyDylibPath = joinLibraryPath(sourceEnvironment.DYLD_LIBRARY_PATH);
  const nonEmptyLdLibraryPath = joinLibraryPath(sourceEnvironment.LD_LIBRARY_PATH);
  if (nonEmptyDylibPath) {
    env.DYLD_LIBRARY_PATH = nonEmptyDylibPath;
  }
  if (nonEmptyLdLibraryPath) {
    env.LD_LIBRARY_PATH = nonEmptyLdLibraryPath;
  }
  if (process.platform === 'win32') {
    const pathEnvKey = Object.keys(sourceEnvironment).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
    env[pathEnvKey] = joinLibraryPath(sourceEnvironment[pathEnvKey]);
  }
  return env;
};

export const runBacktestEngine = (
  input: {
    config: BacktestReferenceEngineInput['config'];
    instrument: BacktestInstrumentCandidate;
    bars: OhlcvBar[];
    signals: BacktestSignal[];
    priceMode: BacktestReferenceEngineInput['priceMode'];
  },
  initialConflicts: readonly BacktestConflict[] = [],
): BacktestInstrumentRunResult => {
  const referenceInput: BacktestReferenceEngineInput = input;
  return runBacktestReferenceEngine(referenceInput, initialConflicts);
};

const forEachJsonLine = async <T>(
  filePath: string,
  onLine: (line: T) => void | Promise<void>,
  throwIfCancelled: () => void,
): Promise<void> => {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });
  try {
    for await (const line of rl) {
      throwIfCancelled();
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      await onLine(JSON.parse(trimmed) as T);
      throwIfCancelled();
    }
  } finally {
    rl.close();
  }
};

const spawnNativeBatch = async (
  enginePath: string,
  inputPath: string,
  options: BacktestNativeBatchRunOptions = {},
): Promise<NativeBatchEngineResponse> =>
  new Promise((resolve, reject) => {
    const batchId = String(options.batchId || '').trim();
    try {
      throwIfNativeBatchCancelled(batchId, options);
    } catch (error) {
      reject(error);
      return;
    }
    const child = spawn(enginePath, ['--batch', '--input', inputPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildNativeEngineEnv(enginePath),
    });
    if (batchId) {
      activeNativeBatchChildren.set(batchId, child);
    }
    let stdout = '';
    let stderr = '';
    let stderrLineBuffer = '';
    let timeoutError: Error | null = null;
    const parseProgressLine = (line: string): void => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) {
        return;
      }
      try {
        const parsed = JSON.parse(trimmed) as NativeBatchProgressLine;
        if (parsed.event !== 'progress') {
          return;
        }
        const completed = Math.max(0, Math.floor(Number(parsed.completed) || 0));
        const total = Math.max(0, Math.floor(Number(parsed.total) || 0));
        const symbol = typeof parsed.symbol === 'string' && parsed.symbol.trim()
          ? parsed.symbol.trim()
          : null;
        options.onProgress?.({ completed, total, symbol });
      } catch {
        // Non-JSON stderr remains available in the failure payload below.
      }
    };
    const drainProgressLines = (chunk: string, flush = false): void => {
      stderrLineBuffer += chunk;
      const lines = stderrLineBuffer.split(/\r?\n/u);
      const readyLines = flush ? lines : lines.slice(0, -1);
      stderrLineBuffer = flush ? '' : lines[lines.length - 1] ?? '';
      readyLines.forEach(parseProgressLine);
    };
    const engineTimeoutMs = resolveNativeBatchEngineTimeoutMs(options.engineTimeoutMs);
    const timeout = setTimeout(() => {
      timeoutError = appError('BACKTEST_NATIVE_BATCH_TIMEOUT', {
        timeoutMs: engineTimeoutMs,
      });
      child.kill('SIGKILL');
    }, engineTimeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      const text = String(chunk);
      stderr += text;
      drainProgressLines(text);
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      if (batchId) {
        activeNativeBatchChildren.delete(batchId);
      }
      if (isNativeBatchCancellationRequested(batchId, options)) {
        reject(appError('BACKTEST_RUN_CANCELLED', batchId ? { batchId } : undefined));
        return;
      }
      if (timeoutError) {
        reject(timeoutError);
        return;
      }
      reject(appError('BACKTEST_NATIVE_BATCH_FAILED', {
        message: error.message,
      }));
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (batchId) {
        activeNativeBatchChildren.delete(batchId);
      }
      drainProgressLines('', true);
      if (isNativeBatchCancellationRequested(batchId, options)) {
        reject(appError('BACKTEST_RUN_CANCELLED', batchId ? { batchId } : undefined));
        return;
      }
      if (timeoutError) {
        reject(timeoutError);
        return;
      }
      if (code !== 0) {
        const stderrText = stderr.slice(0, 1200);
        if (stderrText.includes('BACKTEST_NATIVE_SIGNAL_PLAN_UNSUPPORTED')) {
          reject(appError('BACKTEST_NATIVE_BATCH_UNSUPPORTED', {
            status: code,
            stderr: stderrText,
          }));
          return;
        }
        reject(appError('BACKTEST_NATIVE_BATCH_FAILED', {
          status: code,
          stderr: stderrText,
        }));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()) as NativeBatchEngineResponse);
      } catch (error) {
        reject(appError('BACKTEST_NATIVE_BATCH_INVALID_RESPONSE', {
          message: error instanceof Error ? error.message : String(error),
        }));
      }
    });
    if (batchId && isNativeBatchCancellationRequested(batchId, options)) {
      child.kill('SIGKILL');
    }
  });

const importNativeBatchArtifacts = async (
  response: NativeBatchEngineResponse,
  options: BacktestNativeBatchRunOptions = {},
): Promise<{
  importedSymbols: number;
  completedInstruments: Array<{
    instrumentId: string;
    symbol: string;
  }>;
}> => {
  const output = response.output;
  const batchId = String(options.batchId || response.batchId || '').trim();
  const throwIfCancelled = (): void => {
    throwIfNativeBatchCancelled(batchId, options);
  };
  throwIfCancelled();
  if (!output?.committedPath) {
    throw appError('BACKTEST_NATIVE_BATCH_INVALID_RESPONSE', {
      reason: 'ARTIFACT_PATHS_MISSING',
    });
  }
  const committedExists = await fsp.stat(output.committedPath)
    .then((stat) => stat.isFile())
    .catch(() => false);
  throwIfCancelled();
  if (!committedExists) {
    throw appError('BACKTEST_NATIVE_BATCH_INCOMPLETE', {
      committedPath: output.committedPath,
    });
  }
  if (!output.instrumentResultsPath) {
    throw appError('BACKTEST_NATIVE_BATCH_INVALID_RESPONSE', {
      reason: 'INSTRUMENT_RESULTS_PATH_MISSING',
    });
  }
  let importedSymbols = 0;
  const completedInstruments: Array<{
    instrumentId: string;
    symbol: string;
  }> = [];
  await forEachJsonLine<NativeBatchInstrumentResultLine>(
    output.instrumentResultsPath,
    async (line) => {
      throwIfCancelled();
      if (!line.instrument?.instrumentId || !line.result) {
        return;
      }
      completedInstruments.push({
        instrumentId: line.instrument.instrumentId,
        symbol: line.instrument.symbol,
      });
      await options.onResult?.({
        instrument: line.instrument,
        result: {
          ...line.result,
          summary: {
            ...(line.result.summary ?? {}),
            engine: response.engine ?? 'RUST_DUCKDB_BATCH',
            engineVersion: response.engineVersion ?? BACKTEST_BATCH_ENGINE_VERSION,
            nativeWorkers: response.nativeWorkers ?? null,
            durationMs: response.durationMs ?? null,
          },
        },
        fills: Array.isArray(line.fills) ? line.fills : [],
        equityCurve: Array.isArray(line.equityCurve) ? line.equityCurve : [],
        conflicts: line.conflicts ?? [],
      });
      throwIfCancelled();
      importedSymbols += 1;
    },
    throwIfCancelled,
  );
  return { importedSymbols, completedInstruments };
};

export const runBacktestNativeBatch = async (
  input: BacktestNativeBatchInput,
  options: BacktestNativeBatchRunOptions = {},
): Promise<BacktestNativeBatchRunSummary> => {
  const batchId = String(input.batchId || '').trim();
  try {
    throwIfNativeBatchCancelled(batchId, options);
    const nativeEnginePath = resolveNativeEnginePath();
    if (!nativeEnginePath) {
      throw appError('BACKTEST_NATIVE_ENGINE_UNAVAILABLE', {
        env: BACKTEST_ENGINE_BIN_ENV,
      });
    }
    const outputDir = await fsp.mkdtemp(
      path.join(os.tmpdir(), `zinuto-backtest-${input.batchId}-`),
    );
    try {
      throwIfNativeBatchCancelled(batchId, options);
    const requestPath = path.join(outputDir, 'request.json');
    const payload = {
      batchId: input.batchId,
      marketDbPath: input.marketDbPath,
      outputDir,
      config: input.config,
      instruments: input.instruments.map((instrument) => ({
        instrumentId: instrument.instrumentId,
        symbol: instrument.symbol,
        baseTimeframe: instrument.baseTimeframe,
        name: instrument.name,
        barCount: instrument.barCount,
      })),
      priceMode: input.priceMode,
      workerCount: resolveNativeWorkerCount(),
      engineVersion: BACKTEST_BATCH_ENGINE_VERSION,
      signalPlan: input.signalPlan,
      maxEquityPointsPerSymbol: DEFAULT_MAX_EQUITY_POINTS_PER_SYMBOL,
    };
    await fsp.writeFile(requestPath, JSON.stringify(payload), 'utf8');
    throwIfNativeBatchCancelled(batchId, options);
    const response = await spawnNativeBatch(nativeEnginePath, requestPath, {
      ...options,
      batchId: input.batchId,
    });
    const {
      importedSymbols,
      completedInstruments,
    } = await importNativeBatchArtifacts(response, { ...options, batchId });
    throwIfNativeBatchCancelled(batchId, options);
    return {
      engine: response.engine ?? 'RUST_DUCKDB_BATCH',
      engineVersion: response.engineVersion ?? BACKTEST_BATCH_ENGINE_VERSION,
      batchId: response.batchId ?? input.batchId,
      totalSymbols: Math.max(0, Math.floor(Number(response.totalSymbols) || input.instruments.length)),
      completedSymbols: Math.max(0, Math.floor(Number(response.completedSymbols) || 0)),
      skippedSymbols: Math.max(0, Math.floor(Number(response.skippedSymbols) || 0)),
      completedInstruments,
      skippedSymbolDetails: Array.isArray(response.skippedSymbolDetails)
        ? response.skippedSymbolDetails.flatMap((item) => {
          const instrumentId = String(item?.instrumentId ?? '').trim();
          const symbol = String(item?.symbol ?? '').trim().toUpperCase();
          const reason = String(item?.reason ?? '').trim().toUpperCase();
          if (!instrumentId || !symbol || !reason) {
            return [];
          }
          const message = String(item?.message ?? '').trim();
          return [{
            instrumentId,
            symbol,
            reason,
            ...(message ? { message } : {}),
          }];
        })
        : [],
      nativeWorkers: Number.isFinite(Number(response.nativeWorkers))
        ? Math.floor(Number(response.nativeWorkers))
        : null,
      durationMs: Number.isFinite(Number(response.durationMs))
        ? Number(response.durationMs)
        : null,
      importedSymbols,
    };
    } finally {
      await fsp.rm(outputDir, { recursive: true, force: true }).catch((error) => {
        // eslint-disable-next-line no-console
        console.warn('[backtest-native] temporary artifact cleanup failed', {
          batchId: input.batchId,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        });
      });
    }
  } finally {
    if (batchId) {
      activeNativeBatchChildren.delete(batchId);
      cancelledNativeBatchIds.delete(batchId);
    }
  }
};
