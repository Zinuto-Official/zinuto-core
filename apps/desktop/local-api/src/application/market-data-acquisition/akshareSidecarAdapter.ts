// SPDX-License-Identifier: GPL-3.0-only

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import {
  AcquisitionRuntimeError,
  throwIfAcquisitionCanceled,
  type AcquisitionConnectorAdapter,
  type AcquisitionFetchInput,
  type AkshareFetchResult,
  type CanonicalMarketBar,
} from './marketDataAcquisitionTypes.js';
import {
  executePythonSidecar,
  resolvePythonSidecarLaunchSpec,
  type PythonSidecarLaunchSpec,
} from './pythonSidecarRuntime.js';
import {
  AKSHARE_VERSION,
  AKTOOLS_VERSION,
} from './marketDataConnectorVersions.generated.js';

export const AKSHARE_SIDECAR_PROTOCOL = 'zinuto.akshare.v1';
export { AKTOOLS_VERSION, AKSHARE_VERSION };

const RETRY_DELAYS_MS = [750, 2_000, 5_000] as const;
const backendDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const repositoryDir = path.resolve(backendDir, '../../..');
const sidecarProjectDir = path.join(backendDir, 'sidecars', 'akshare');

export type AkshareSidecarLaunchSpec = PythonSidecarLaunchSpec;

export type AkshareAcquisitionInstrument = {
  symbol: string;
  name: string;
  exchangeId: 'SH' | 'SZ' | 'BJ';
  kind: 'A_SHARE';
};

export type AkshareAcquisitionAdapter = AcquisitionConnectorAdapter & {
  readonly id: 'akshare';
  fetchSymbolWithProvenance?(
    input: AcquisitionFetchInput,
  ): Promise<AkshareFetchResult>;
  listInstruments(
    signal?: AbortSignal,
  ): Promise<AkshareAcquisitionInstrument[]>;
};

export const resolveAkshareSidecarLaunchSpec = (
  env: NodeJS.ProcessEnv = process.env,
): AkshareSidecarLaunchSpec | null => {
  return resolvePythonSidecarLaunchSpec({
    sidecarDirectory: sidecarProjectDir,
    generatedRoot: path.join(
      repositoryDir,
      'apps',
      'desktop',
      'shell',
      'gen',
    ),
    bundleDirectoryName: 'akshare-sidecar',
    executableBaseName: 'zinuto-akshare-sidecar',
    explicitPathEnvName: 'ZINUTO_AKSHARE_SIDECAR_PATH',
    trustedPathEnvName: 'ZINUTO_AKSHARE_TRUSTED_SIDECAR_PATH',
    env,
  });
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
    upstreamId: z.enum(['eastmoney', 'tencent', 'sina']).optional(),
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

export const parseAkshareSidecarResponseWithProvenance = (
  raw: string,
  requestId: string,
): AkshareFetchResult => {
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
    return {
      rows: success.data.rows,
      // Older frozen v1 workers did not emit this optional additive field.
      // Treat that historical response as the original Eastmoney primary.
      upstreamId: success.data.upstreamId ?? 'eastmoney',
    };
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

export const parseAkshareSidecarResponse = (
  raw: string,
  requestId: string,
): CanonicalMarketBar[] =>
  parseAkshareSidecarResponseWithProvenance(raw, requestId).rows;

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

export const executeAkshareSidecar = async ({
  launchSpec,
  request,
  signal,
  responseLimitBytes,
  workerTimeoutMs,
  terminationGraceMs,
  settlementDeadlineMs,
}: {
  launchSpec: AkshareSidecarLaunchSpec;
  request: AkshareSidecarRequest;
  signal: AbortSignal;
  responseLimitBytes?: number;
  workerTimeoutMs?: number;
  terminationGraceMs?: number;
  settlementDeadlineMs?: number;
}): Promise<string> =>
  executePythonSidecar({
    launchSpec,
    request,
    signal,
    startFailureCode: 'AKSHARE_SIDECAR_START_FAILED',
    timeoutCode: 'AKSHARE_SIDECAR_TIMEOUT',
    responseTooLargeCode: 'AKSHARE_SIDECAR_RESPONSE_TOO_LARGE',
    responseLimitBytes,
    workerTimeoutMs,
    terminationGraceMs,
    settlementDeadlineMs,
  });

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
} = {}): AkshareAcquisitionAdapter => {
  const fetchSymbolWithProvenance = async (
    input: AcquisitionFetchInput,
  ): Promise<AkshareFetchResult> => {
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
        return parseAkshareSidecarResponseWithProvenance(
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
        const retryAfterMs = retryDelaysMs[attempt]!;
        input.onRetryWait?.({ attempt: attempt + 1, retryAfterMs });
        await wait(retryAfterMs, input.signal);
        input.onRetryResume?.();
      }
    }
    throw new AcquisitionRuntimeError('AKSHARE_UPSTREAM_FAILED');
  };

  return {
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
  fetchSymbolWithProvenance,
  async fetchSymbol(input: AcquisitionFetchInput): Promise<CanonicalMarketBar[]> {
    return (await fetchSymbolWithProvenance(input)).rows;
  },
  };
};
