// SPDX-License-Identifier: GPL-3.0-only

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import {
  AcquisitionRuntimeError,
  type FinanceDataReaderAcquisitionAdapter,
  type FinanceDataReaderAcquisitionInstrument,
  type FinanceDataReaderFetchInput,
  type FinanceDataReaderFetchResult,
} from './marketDataAcquisitionTypes.js';
import {
  executePythonSidecar,
  resolvePythonSidecarLaunchSpec,
  type PythonSidecarLaunchSpec,
} from './pythonSidecarRuntime.js';
import { FINANCE_DATA_READER_VERSION } from './marketDataConnectorVersions.generated.js';

export const FINANCE_DATA_READER_SIDECAR_PROTOCOL =
  'zinuto.finance-datareader.v1';
// The picker promises a 60-second maximum wait. Keep the local worker below
// that boundary so the API returns a classified failure before the browser
// abandons the request.
export const FINANCE_DATA_READER_SIDECAR_TIMEOUT_MS = 55_000;
export { FINANCE_DATA_READER_VERSION };

const backendDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const repositoryDir = path.resolve(backendDir, '../../..');
const sidecarProjectDir = path.join(backendDir, 'sidecars', 'finance-datareader');

export type FinanceDataReaderSidecarLaunchSpec = PythonSidecarLaunchSpec;

const marketIdSchema = z.enum([
  'CN_A_SHARE',
  'HK_STOCKS',
  'KR_STOCKS',
  'US_STOCKS',
  'JP_STOCKS',
  'VN_STOCKS',
  'GLOBAL_INDICES',
  'FOREX',
  'COMMODITY_FUTURES',
  'RATE_FUTURES',
  'CRYPTO_SPOT',
]);
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
const runtimeSchema = z
  .object({ financedatareader: z.literal(FINANCE_DATA_READER_VERSION) })
  .strict();
const errorResponseSchema = z
  .object({
    protocol: z.literal(FINANCE_DATA_READER_SIDECAR_PROTOCOL),
    requestId: z.string().min(1).max(128),
    ok: z.literal(false),
    error: z
      .object({
        code: z.enum([
          'FINANCEDATAREADER_SIDECAR_REQUEST_INVALID',
          'FINANCEDATAREADER_SIDECAR_PROTOCOL_UNSUPPORTED',
          'FINANCEDATAREADER_SIDECAR_OPERATION_FORBIDDEN',
          'FINANCEDATAREADER_UPSTREAM_FAILED',
          'FINANCEDATAREADER_UPSTREAM_SCHEMA_INVALID',
          'FINANCEDATAREADER_OHLCV_UNAVAILABLE',
          'FINANCEDATAREADER_TIMEFRAME_UNAVAILABLE',
          'FINANCEDATAREADER_SYMBOL_UNAVAILABLE',
          'ACQUISITION_ROW_LIMIT_EXCEEDED',
        ]),
        args: z.record(z.string(), z.unknown()),
      })
      .strict(),
  })
  .strict();
const barsResponseSchema = z
  .object({
    protocol: z.literal(FINANCE_DATA_READER_SIDECAR_PROTOCOL),
    requestId: z.string().min(1).max(128),
    ok: z.literal(true),
    runtime: runtimeSchema,
    kind: z.literal('bars'),
    upstreamId: z.string().trim().min(1).max(128),
    rows: z.array(canonicalBarSchema).max(250_000),
  })
  .strict();
const instrumentResponseSchema = z
  .object({
    protocol: z.literal(FINANCE_DATA_READER_SIDECAR_PROTOCOL),
    requestId: z.string().min(1).max(128),
    ok: z.literal(true),
    runtime: runtimeSchema,
    kind: z.literal('instruments'),
    upstreamId: z.string().trim().min(1).max(128),
    rows: z
      .array(
        z
          .object({
            symbol: z.string().trim().min(1).max(64),
            name: z.string().trim().min(1).max(256),
            exchangeId: z.string().trim().min(1).max(32).nullable(),
          })
          .strict(),
      )
      .max(20_000),
  })
  .strict();

type FinanceDataReaderBarsRequest = {
  protocol: typeof FINANCE_DATA_READER_SIDECAR_PROTOCOL;
  requestId: string;
  operation: 'bars';
  params: {
    marketId: z.infer<typeof marketIdSchema>;
    symbol: string;
    timeframe: '1d';
    startAt: string;
    endAt: string;
  };
};
type FinanceDataReaderInstrumentsRequest = {
  protocol: typeof FINANCE_DATA_READER_SIDECAR_PROTOCOL;
  requestId: string;
  operation: 'instruments';
  params: { marketId: z.infer<typeof marketIdSchema>; query: string };
};

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

const parseFailure = (raw: string, requestId: string): never => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AcquisitionRuntimeError('FINANCEDATAREADER_SIDECAR_RESPONSE_INVALID');
  }
  const failure = errorResponseSchema.safeParse(parsed);
  if (!failure.success || failure.data.requestId !== requestId) {
    throw new AcquisitionRuntimeError('FINANCEDATAREADER_SIDECAR_RESPONSE_INVALID');
  }
  throw new AcquisitionRuntimeError(
    failure.data.error.code,
    sanitizeErrorArgs(failure.data.error.args),
  );
};

export const buildFinanceDataReaderBarsRequest = (
  input: FinanceDataReaderFetchInput,
): FinanceDataReaderBarsRequest => {
  const normalizedSymbol = input.sourceSymbol.trim().toUpperCase();
  if (input.timeframe !== '1d' || !marketIdSchema.safeParse(input.marketId).success) {
    throw new AcquisitionRuntimeError('FINANCEDATAREADER_TIMEFRAME_UNAVAILABLE');
  }
  if (
    !/^[A-Za-z0-9._^=/:-]{1,64}$/u.test(input.sourceSymbol) ||
    normalizedSymbol.startsWith('FRED:') ||
    normalizedSymbol.startsWith('ECOS:') ||
    !Number.isFinite(Date.parse(input.startAt)) ||
    !Number.isFinite(Date.parse(input.endAt)) ||
    Date.parse(input.endAt) < Date.parse(input.startAt)
  ) {
    throw new AcquisitionRuntimeError(
      normalizedSymbol.startsWith('FRED:') || normalizedSymbol.startsWith('ECOS:')
        ? 'FINANCEDATAREADER_SIDECAR_OPERATION_FORBIDDEN'
        : 'FINANCEDATAREADER_SIDECAR_REQUEST_INVALID',
    );
  }
  return {
    protocol: FINANCE_DATA_READER_SIDECAR_PROTOCOL,
    requestId: randomUUID(),
    operation: 'bars',
    params: {
      marketId: input.marketId,
      symbol: input.sourceSymbol,
      timeframe: '1d',
      startAt: input.startAt,
      endAt: input.endAt,
    },
  };
};

export const buildFinanceDataReaderInstrumentCatalogRequest = ({
  marketId,
  query,
}: {
  marketId: z.infer<typeof marketIdSchema>;
  query: string;
}): FinanceDataReaderInstrumentsRequest => {
  if (!marketIdSchema.safeParse(marketId).success || query.length > 64) {
    throw new AcquisitionRuntimeError('FINANCEDATAREADER_SIDECAR_REQUEST_INVALID');
  }
  return {
    protocol: FINANCE_DATA_READER_SIDECAR_PROTOCOL,
    requestId: randomUUID(),
    operation: 'instruments',
    params: { marketId, query },
  };
};

export const parseFinanceDataReaderBarsResponse = (
  raw: string,
  requestId: string,
): FinanceDataReaderFetchResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AcquisitionRuntimeError('FINANCEDATAREADER_SIDECAR_RESPONSE_INVALID');
  }
  const success = barsResponseSchema.safeParse(parsed);
  if (success.success) {
    if (success.data.requestId !== requestId) {
      throw new AcquisitionRuntimeError('FINANCEDATAREADER_SIDECAR_RESPONSE_INVALID');
    }
    return { rows: success.data.rows, upstreamId: success.data.upstreamId };
  }
  return parseFailure(raw, requestId);
};

export const parseFinanceDataReaderInstrumentCatalogResponse = (
  raw: string,
  requestId: string,
): FinanceDataReaderAcquisitionInstrument[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AcquisitionRuntimeError('FINANCEDATAREADER_SIDECAR_RESPONSE_INVALID');
  }
  const success = instrumentResponseSchema.safeParse(parsed);
  if (success.success) {
    if (success.data.requestId !== requestId) {
      throw new AcquisitionRuntimeError('FINANCEDATAREADER_SIDECAR_RESPONSE_INVALID');
    }
    return success.data.rows;
  }
  return parseFailure(raw, requestId);
};

export const resolveFinanceDataReaderSidecarLaunchSpec = (
  env: NodeJS.ProcessEnv = process.env,
): FinanceDataReaderSidecarLaunchSpec | null =>
  resolvePythonSidecarLaunchSpec({
    sidecarDirectory: sidecarProjectDir,
    generatedRoot: path.join(
      repositoryDir,
      'apps',
      'desktop',
      'shell',
      'gen',
    ),
    bundleDirectoryName: 'finance-datareader-sidecar',
    executableBaseName: 'zinuto-finance-datareader-sidecar',
    explicitPathEnvName: 'ZINUTO_FINANCEDATAREADER_SIDECAR_PATH',
    trustedPathEnvName: 'ZINUTO_FINANCEDATAREADER_TRUSTED_SIDECAR_PATH',
    env,
  });

export const executeFinanceDataReaderSidecar = async ({
  launchSpec,
  request,
  signal,
  responseLimitBytes,
  workerTimeoutMs,
  terminationGraceMs,
  settlementDeadlineMs,
}: {
  launchSpec: FinanceDataReaderSidecarLaunchSpec;
  request: FinanceDataReaderBarsRequest | FinanceDataReaderInstrumentsRequest;
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
    startFailureCode: 'FINANCEDATAREADER_SIDECAR_START_FAILED',
    timeoutCode: 'FINANCEDATAREADER_SIDECAR_TIMEOUT',
    responseTooLargeCode: 'FINANCEDATAREADER_SIDECAR_RESPONSE_TOO_LARGE',
    responseLimitBytes,
    workerTimeoutMs,
    terminationGraceMs,
    settlementDeadlineMs,
  });

export const createFinanceDataReaderSidecarAdapter = ({
  resolveLaunchSpec = resolveFinanceDataReaderSidecarLaunchSpec,
  execute = executeFinanceDataReaderSidecar,
}: {
  resolveLaunchSpec?: () => FinanceDataReaderSidecarLaunchSpec | null;
  execute?: typeof executeFinanceDataReaderSidecar;
} = {}): FinanceDataReaderAcquisitionAdapter => ({
  id: 'financedatareader',
  isAvailable: () => resolveLaunchSpec() !== null,
  async listInstruments({ marketId, query, signal = new AbortController().signal }) {
    const launchSpec = resolveLaunchSpec();
    if (!launchSpec) {
      throw new AcquisitionRuntimeError('FINANCEDATAREADER_RUNTIME_UNAVAILABLE');
    }
    const request = buildFinanceDataReaderInstrumentCatalogRequest({ marketId, query });
    return parseFinanceDataReaderInstrumentCatalogResponse(
      await execute({
        launchSpec,
        request,
        signal,
        workerTimeoutMs: FINANCE_DATA_READER_SIDECAR_TIMEOUT_MS,
      }),
      request.requestId,
    );
  },
  async fetchSymbol(input) {
    const launchSpec = resolveLaunchSpec();
    if (!launchSpec) {
      throw new AcquisitionRuntimeError('FINANCEDATAREADER_RUNTIME_UNAVAILABLE');
    }
    const request = buildFinanceDataReaderBarsRequest(input);
    return parseFinanceDataReaderBarsResponse(
      await execute({
        launchSpec,
        request,
        signal: input.signal,
        workerTimeoutMs: FINANCE_DATA_READER_SIDECAR_TIMEOUT_MS,
      }),
      request.requestId,
    );
  },
});
