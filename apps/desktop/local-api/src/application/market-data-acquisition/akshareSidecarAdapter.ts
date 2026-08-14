// SPDX-License-Identifier: GPL-3.0-only

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import {
  AcquisitionRuntimeError,
  throwIfAcquisitionCanceled,
  type AcquisitionConnectorAdapter,
  type AcquisitionFetchInput,
  type CanonicalMarketBar,
} from './marketDataAcquisitionTypes.js';

export const AKSHARE_SIDECAR_PROTOCOL = 'zinuto.akshare.v1';
export const AKTOOLS_VERSION = '0.0.91';
export const AKSHARE_VERSION = '1.18.91';

const RESPONSE_LIMIT_BYTES = 128 * 1024 * 1024;
const WORKER_TIMEOUT_MS = 120_000;
const WORKER_TERMINATION_GRACE_MS = 1_000;
const WORKER_SETTLEMENT_DEADLINE_MS = 3_000;
const RETRY_DELAYS_MS = [750, 2_000, 5_000] as const;
const backendDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const repositoryDir = path.resolve(backendDir, '../../..');
const sidecarProjectDir = path.join(backendDir, 'sidecars', 'akshare');

export type AkshareSidecarLaunchSpec = {
  command: string;
  args: string[];
  source: 'TRUSTED_NATIVE' | 'EXPLICIT' | 'GENERATED' | 'DEV_PYTHON';
};

export type AkshareAcquisitionInstrument = {
  symbol: string;
  name: string;
  exchangeId: 'SH' | 'SZ' | 'BJ';
  kind: 'A_SHARE';
};

export type AkshareAcquisitionAdapter = AcquisitionConnectorAdapter & {
  readonly id: 'akshare';
  listInstruments(
    signal?: AbortSignal,
  ): Promise<AkshareAcquisitionInstrument[]>;
};

const executableName = (): string =>
  process.platform === 'win32'
    ? 'zinuto-akshare-sidecar.exe'
    : 'zinuto-akshare-sidecar';

const isRegularFile = (filePath: string): boolean => {
  try {
    const metadata = fs.lstatSync(filePath);
    return !metadata.isSymbolicLink() && metadata.isFile();
  } catch {
    return false;
  }
};

const isExecutableFile = (filePath: string): boolean => {
  try {
    const metadata = fs.lstatSync(filePath);
    return (
      !metadata.isSymbolicLink() &&
      metadata.isFile() &&
      (process.platform === 'win32' || (metadata.mode & 0o111) !== 0)
    );
  } catch {
    return false;
  }
};

export const resolveAkshareSidecarLaunchSpec = (
  env: NodeJS.ProcessEnv = process.env,
): AkshareSidecarLaunchSpec | null => {
  if (env.NODE_ENV === 'production') {
    const trustedNativePath = String(
      env.ZINUTO_AKSHARE_TRUSTED_SIDECAR_PATH ?? '',
    ).trim();
    if (
      trustedNativePath &&
      isExecutableFile(path.resolve(trustedNativePath))
    ) {
      return {
        command: path.resolve(trustedNativePath),
        args: [],
        source: 'TRUSTED_NATIVE',
      };
    }
    return null;
  }

  const explicitPath = String(env.ZINUTO_AKSHARE_SIDECAR_PATH ?? '').trim();
  if (explicitPath && isExecutableFile(path.resolve(explicitPath))) {
    return {
      command: path.resolve(explicitPath),
      args: [],
      source: 'EXPLICIT',
    };
  }

  const generatedPath = path.join(
    repositoryDir,
    'apps',
    'desktop',
    'shell',
    'gen',
    'market-data-acquisition',
    'akshare-sidecar',
    `${process.platform}-${process.arch}`,
    executableName(),
  );
  if (isExecutableFile(generatedPath)) {
    return { command: generatedPath, args: [], source: 'GENERATED' };
  }

  const pythonPath =
    process.platform === 'win32'
      ? path.join(sidecarProjectDir, '.venv', 'Scripts', 'python.exe')
      : path.join(sidecarProjectDir, '.venv', 'bin', 'python');
  const workerPath = path.join(sidecarProjectDir, 'main.py');
  if (isExecutableFile(pythonPath) && isRegularFile(workerPath)) {
    return {
      command: pythonPath,
      args: [workerPath],
      source: 'DEV_PYTHON',
    };
  }
  return null;
};

const canonicalBarSchema = z
  .object({
    timestamp: z.string().min(1).max(64),
    open: z.number(),
    high: z.number(),
    low: z.number(),
    close: z.number(),
    volume: z.number(),
  })
  .strict();
const canonicalInstrumentSchema = z
  .object({
    symbol: z.string().regex(/^[0-9]{6}$/u),
    name: z.string().trim().min(1).max(256),
    exchangeId: z.enum(['SH', 'SZ', 'BJ']),
    kind: z.literal('A_SHARE'),
  })
  .strict();
const runtimeSchema = z
  .object({
    aktools: z.literal(AKTOOLS_VERSION),
    akshare: z.literal(AKSHARE_VERSION),
  })
  .strict();
const barsSuccessResponseSchema = z
  .object({
    protocol: z.literal(AKSHARE_SIDECAR_PROTOCOL),
    requestId: z.string().min(1).max(128),
    ok: z.literal(true),
    runtime: runtimeSchema,
    kind: z.literal('bars'),
    rows: z.array(canonicalBarSchema).max(250_000),
  })
  .strict();
const instrumentsSuccessResponseSchema = z
  .object({
    protocol: z.literal(AKSHARE_SIDECAR_PROTOCOL),
    requestId: z.string().min(1).max(128),
    ok: z.literal(true),
    runtime: runtimeSchema,
    kind: z.literal('instruments'),
    rows: z.array(canonicalInstrumentSchema).max(20_000),
  })
  .strict();
const errorResponseSchema = z
  .object({
    protocol: z.literal(AKSHARE_SIDECAR_PROTOCOL),
    requestId: z.string().min(1).max(128),
    ok: z.literal(false),
    error: z
      .object({
        code: z.enum([
          'AKSHARE_SIDECAR_REQUEST_INVALID',
          'AKSHARE_SIDECAR_PROTOCOL_UNSUPPORTED',
          'AKSHARE_SIDECAR_OPERATION_FORBIDDEN',
          'AKSHARE_UPSTREAM_SCHEMA_INVALID',
          'AKSHARE_UPSTREAM_FAILED',
          'AKSHARE_UPSTREAM_RETRYABLE',
          'ACQUISITION_ROW_LIMIT_EXCEEDED',
        ]),
        args: z.record(z.string(), z.unknown()),
      })
      .strict(),
  })
  .strict();

export const buildAkshareSidecarRequest = (input: AcquisitionFetchInput) => {
  if (input.request.connectorId !== 'akshare') {
    throw new AcquisitionRuntimeError('ACQUISITION_CONNECTOR_REQUEST_MISMATCH');
  }
  const dataset = String(input.request.dataset);
  if (
    dataset !== 'stock_zh_a_hist' &&
    dataset !== 'stock_zh_a_hist_min_em' &&
    dataset !== 'index_zh_a_hist'
  ) {
    throw new AcquisitionRuntimeError('AKSHARE_SIDECAR_OPERATION_FORBIDDEN');
  }
  const indexMatch = /^INDEX-([0-9]{6})$/u.exec(input.symbol);
  if (
    (dataset === 'index_zh_a_hist' &&
      (!indexMatch ||
        input.request.timeframe !== '1d' ||
        input.request.adjustment !== 'none')) ||
    (dataset !== 'index_zh_a_hist' && !/^[0-9]{6}$/u.test(input.symbol))
  ) {
    throw new AcquisitionRuntimeError('AKSHARE_SIDECAR_REQUEST_INVALID');
  }
  return {
    protocol: AKSHARE_SIDECAR_PROTOCOL,
    requestId: randomUUID(),
    operation: dataset,
    params: {
      symbol: indexMatch?.[1] ?? input.symbol,
      timeframe: input.request.timeframe,
      startAt: input.request.startAt,
      endAt: input.request.endAt,
      adjustment: input.request.adjustment,
    },
  } as const;
};

export const buildAkshareInstrumentCatalogRequest = () =>
  ({
    protocol: AKSHARE_SIDECAR_PROTOCOL,
    requestId: randomUUID(),
    operation: 'stock_info_a_code_name',
    params: {},
  }) as const;

const sanitizeErrorArgs = (
  value: Record<string, unknown>,
): Record<string, string | number | boolean | null> =>
  Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      entry === null ||
      typeof entry === 'string' ||
      typeof entry === 'number' ||
      typeof entry === 'boolean'
        ? [[key, entry]]
        : [],
    ),
  );

export const parseAkshareSidecarResponse = (
  raw: string,
  requestId: string,
): CanonicalMarketBar[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AcquisitionRuntimeError('AKSHARE_SIDECAR_RESPONSE_INVALID');
  }
  const success = barsSuccessResponseSchema.safeParse(parsed);
  if (success.success) {
    if (success.data.requestId !== requestId) {
      throw new AcquisitionRuntimeError('AKSHARE_SIDECAR_RESPONSE_MISMATCH');
    }
    return success.data.rows;
  }
  const failure = errorResponseSchema.safeParse(parsed);
  if (!failure.success || failure.data.requestId !== requestId) {
    throw new AcquisitionRuntimeError('AKSHARE_SIDECAR_RESPONSE_INVALID');
  }
  throw new AcquisitionRuntimeError(
    failure.data.error.code,
    sanitizeErrorArgs(failure.data.error.args),
  );
};

export const parseAkshareInstrumentCatalogResponse = (
  raw: string,
  requestId: string,
): AkshareAcquisitionInstrument[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AcquisitionRuntimeError('AKSHARE_SIDECAR_RESPONSE_INVALID');
  }
  const success = instrumentsSuccessResponseSchema.safeParse(parsed);
  if (success.success) {
    if (success.data.requestId !== requestId) {
      throw new AcquisitionRuntimeError('AKSHARE_SIDECAR_RESPONSE_MISMATCH');
    }
    return success.data.rows;
  }
  const failure = errorResponseSchema.safeParse(parsed);
  if (!failure.success || failure.data.requestId !== requestId) {
    throw new AcquisitionRuntimeError('AKSHARE_SIDECAR_RESPONSE_INVALID');
  }
  throw new AcquisitionRuntimeError(
    failure.data.error.code,
    sanitizeErrorArgs(failure.data.error.args),
  );
};

type AkshareSidecarRequest =
  | ReturnType<typeof buildAkshareSidecarRequest>
  | ReturnType<typeof buildAkshareInstrumentCatalogRequest>;

const workerEnvironment = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const allowedNames = [
    'SYSTEMROOT',
    'WINDIR',
    'PATH',
    'LANG',
    'LC_ALL',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
  ] as const;
  return Object.fromEntries(
    allowedNames.flatMap((name) =>
      typeof env[name] === 'string' ? [[name, env[name]]] : [],
    ),
  );
};

export const executeAkshareSidecar = async ({
  launchSpec,
  request,
  signal,
  responseLimitBytes = RESPONSE_LIMIT_BYTES,
  workerTimeoutMs = WORKER_TIMEOUT_MS,
  terminationGraceMs = WORKER_TERMINATION_GRACE_MS,
  settlementDeadlineMs = WORKER_SETTLEMENT_DEADLINE_MS,
}: {
  launchSpec: AkshareSidecarLaunchSpec;
  request: AkshareSidecarRequest;
  signal: AbortSignal;
  responseLimitBytes?: number;
  workerTimeoutMs?: number;
  terminationGraceMs?: number;
  settlementDeadlineMs?: number;
}): Promise<string> => {
  throwIfAcquisitionCanceled(signal);
  const child = spawn(launchSpec.command, launchSpec.args, {
    shell: false,
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: workerEnvironment(process.env),
  });
  const stdout: Buffer[] = [];
  let stdoutBytes = 0;
  let settled = false;
  let terminationReason:
    | 'CANCELED'
    | 'RESPONSE_TOO_LARGE'
    | 'TIMEOUT'
    | null = null;
  let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
  let settlementTimer: ReturnType<typeof setTimeout> | undefined;

  const signalChildTree = (target: ChildProcess, signalName: NodeJS.Signals) => {
    if (!target.pid) {
      return;
    }
    if (process.platform !== 'win32') {
      try {
        process.kill(-target.pid, signalName);
        return;
      } catch {
        // The child may have exited between the liveness check and the signal.
      }
    }
    try {
      target.kill(signalName);
    } catch {
      // A later close/error event or the independent deadline settles the call.
    }
  };

  const forceKillChildTree = (target: ChildProcess): void => {
    if (process.platform === 'win32' && target.pid) {
      const killer = spawn(
        'taskkill.exe',
        ['/PID', String(target.pid), '/T', '/F'],
        {
          shell: false,
          windowsHide: true,
          stdio: 'ignore',
          env: workerEnvironment(process.env),
        },
      );
      killer.once('error', () => {
        signalChildTree(target, 'SIGKILL');
      });
      killer.unref();
      return;
    }
    signalChildTree(target, 'SIGKILL');
  };

  let rejectForDeadline: (() => void) | null = null;
  const terminate = (
    reason: Exclude<typeof terminationReason, null>,
  ): void => {
    if (terminationReason === null) {
      terminationReason = reason;
    }
    child.stdin.destroy();
    signalChildTree(child, 'SIGTERM');
    if (forceKillTimer === undefined) {
      forceKillTimer = setTimeout(() => {
        forceKillChildTree(child);
      }, Math.max(0, Math.floor(terminationGraceMs)));
      forceKillTimer.unref?.();
    }
    if (settlementTimer === undefined) {
      settlementTimer = setTimeout(
        () => rejectForDeadline?.(),
        Math.max(1, Math.floor(terminationGraceMs + settlementDeadlineMs)),
      );
      settlementTimer.unref?.();
    }
  };
  const cancel = () => terminate('CANCELED');
  signal.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => {
    terminate('TIMEOUT');
  }, Math.max(1, Math.floor(workerTimeoutMs)));
  timeout.unref?.();
  child.stdout.on('data', (chunk: Buffer) => {
    stdoutBytes += chunk.length;
    if (stdoutBytes > responseLimitBytes) {
      terminate('RESPONSE_TOO_LARGE');
      return;
    }
    stdout.push(chunk);
  });
  child.stderr.resume();
  try {
    return await new Promise<string>((resolve, reject) => {
      const rejectForTerminationReason = (): void => {
        switch (terminationReason) {
          case 'CANCELED':
            reject(new AcquisitionRuntimeError('ACQUISITION_CANCELED'));
            return;
          case 'RESPONSE_TOO_LARGE':
            reject(
              new AcquisitionRuntimeError('AKSHARE_SIDECAR_RESPONSE_TOO_LARGE'),
            );
            return;
          case 'TIMEOUT':
            reject(new AcquisitionRuntimeError('AKSHARE_SIDECAR_TIMEOUT'));
            return;
          default:
            reject(new AcquisitionRuntimeError('AKSHARE_SIDECAR_START_FAILED'));
        }
      };
      rejectForDeadline = () => {
        if (settled) return;
        settled = true;
        child.stdout.destroy();
        child.stderr.destroy();
        forceKillChildTree(child);
        rejectForTerminationReason();
      };
      child.once('error', (error) => {
        if (settled) return;
        settled = true;
        reject(
          new AcquisitionRuntimeError('AKSHARE_SIDECAR_START_FAILED', {
            upstreamErrorType: error.name,
          }),
        );
      });
      child.once('close', () => {
        if (settled) return;
        settled = true;
        if (terminationReason !== null) {
          rejectForTerminationReason();
          return;
        }
        resolve(Buffer.concat(stdout).toString('utf8').trim());
      });
      child.stdin.end(`${JSON.stringify(request)}\n`, 'utf8');
    });
  } finally {
    clearTimeout(timeout);
    if (forceKillTimer !== undefined) {
      clearTimeout(forceKillTimer);
    }
    if (settlementTimer !== undefined) {
      clearTimeout(settlementTimer);
    }
    rejectForDeadline = null;
    signal.removeEventListener('abort', cancel);
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
  }
};

const waitForRetry = async (
  delayMs: number,
  signal: AbortSignal,
): Promise<void> => {
  throwIfAcquisitionCanceled(signal);
  await new Promise<void>((resolve, reject) => {
    const complete = () => {
      signal.removeEventListener('abort', cancel);
      resolve();
    };
    const timer = setTimeout(complete, delayMs);
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      reject(new AcquisitionRuntimeError('ACQUISITION_CANCELED'));
    };
    signal.addEventListener('abort', cancel, { once: true });
    timer.unref?.();
  });
};

export const createAkshareSidecarAdapter = ({
  resolveLaunchSpec = resolveAkshareSidecarLaunchSpec,
  execute = executeAkshareSidecar,
  retryDelaysMs = RETRY_DELAYS_MS,
  wait = waitForRetry,
}: {
  resolveLaunchSpec?: () => AkshareSidecarLaunchSpec | null;
  execute?: typeof executeAkshareSidecar;
  retryDelaysMs?: readonly number[];
  wait?: (delayMs: number, signal: AbortSignal) => Promise<void>;
} = {}): AkshareAcquisitionAdapter => ({
  id: 'akshare',
  isAvailable: () => resolveLaunchSpec() !== null,
  async listInstruments(
    signal = new AbortController().signal,
  ): Promise<AkshareAcquisitionInstrument[]> {
    const launchSpec = resolveLaunchSpec();
    if (!launchSpec) {
      throw new AcquisitionRuntimeError('AKSHARE_RUNTIME_UNAVAILABLE');
    }
    const request = buildAkshareInstrumentCatalogRequest();
    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
      const response = await execute({ launchSpec, request, signal });
      try {
        return parseAkshareInstrumentCatalogResponse(
          response,
          request.requestId,
        );
      } catch (error) {
        if (
          !(error instanceof AcquisitionRuntimeError) ||
          error.code !== 'AKSHARE_UPSTREAM_RETRYABLE' ||
          attempt === retryDelaysMs.length
        ) {
          throw error;
        }
        await wait(retryDelaysMs[attempt]!, signal);
      }
    }
    throw new AcquisitionRuntimeError('AKSHARE_UPSTREAM_FAILED');
  },
  async fetchSymbol(
    input: AcquisitionFetchInput,
  ): Promise<CanonicalMarketBar[]> {
    const launchSpec = resolveLaunchSpec();
    if (!launchSpec) {
      throw new AcquisitionRuntimeError('AKSHARE_RUNTIME_UNAVAILABLE');
    }
    const request = buildAkshareSidecarRequest(input);
    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
      const response = await execute({
        launchSpec,
        request,
        signal: input.signal,
      });
      try {
        return parseAkshareSidecarResponse(response, request.requestId);
      } catch (error) {
        if (
          !(error instanceof AcquisitionRuntimeError) ||
          error.code !== 'AKSHARE_UPSTREAM_RETRYABLE' ||
          attempt === retryDelaysMs.length
        ) {
          throw error;
        }
        const retryAfterMs = retryDelaysMs[attempt]!;
        input.onRetryWait?.({ attempt: attempt + 1, retryAfterMs });
        await wait(retryAfterMs, input.signal);
        input.onRetryResume?.();
      }
    }
    throw new AcquisitionRuntimeError('AKSHARE_UPSTREAM_FAILED');
  },
});
