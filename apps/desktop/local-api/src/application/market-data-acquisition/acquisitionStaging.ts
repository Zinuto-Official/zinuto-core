// SPDX-License-Identifier: GPL-3.0-only

import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { detectBaseTimeframeFromTimestamps } from '@zinuto/shared/timeframe';

import { serializeMarketDataAcquisitionSourceMetadata } from '../dataSource/marketDataAcquisitionSourceMetadata.js';

import {
  AcquisitionRuntimeError,
  type AcquisitionManifest,
  type AcquisitionManifestFile,
  type AcquisitionRequest,
  type CanonicalMarketBar,
  type MarketAcquisitionJob,
  type MarketAcquisitionRequest,
} from './marketDataAcquisitionTypes.js';
import {
  AKSHARE_VERSION,
  AKTOOLS_VERSION,
  CCXT_VERSION,
  FINANCE_DATA_READER_VERSION,
} from './marketDataConnectorVersions.generated.js';

export const ACQUISITION_MAX_SYMBOLS = 20;
export const ACQUISITION_MAX_FILES = 21;
export const ACQUISITION_MAX_FILE_BYTES = 512 * 1024 * 1024;
export const ACQUISITION_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
export const ACQUISITION_MAX_ROWS_PER_SYMBOL = 250_000;
// Timeframe detection uses the first 96 bars as its sample. Below that count
// the sample is too short to trust, so sparse downloads are staged under the
// requested timeframe instead of failing on a misdetection.
const TIMEFRAME_DETECTION_MIN_BARS = 96;

const timeframeMilliseconds = {
  '1m': 60_000,
  '5m': 300_000,
  '1h': 3_600_000,
  '1d': 86_400_000,
} as const;

const sha256 = (value: Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

const createOutputFolderName = (
  connectorId: 'akshare' | 'ccxt',
  createdAt: string,
  jobId: string,
): string => {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) {
    throw new AcquisitionRuntimeError('ACQUISITION_TIMESTAMP_INVALID');
  }
  const timestamp = date
    .toISOString()
    .slice(0, 19)
    .replace(/[-:T]/gu, '')
    .replace(/^(\d{8})(\d{6})$/u, '$1-$2');
  const jobToken = jobId.replace(/[^A-Za-z0-9]/gu, '').slice(0, 8);
  if (jobToken.length !== 8) {
    throw new AcquisitionRuntimeError('ACQUISITION_JOB_ID_INVALID');
  }
  return `Zinuto-Data-${connectorId}-${timestamp}-${jobToken}`;
};

export const resolveAcquisitionDataFileName = (symbol: string): string => {
  const stem = symbol.toUpperCase().replace('/', '-');
  if (!/^[A-Z0-9._-]{1,64}$/u.test(stem)) {
    throw new AcquisitionRuntimeError('ACQUISITION_SYMBOL_FILE_NAME_INVALID');
  }
  return `${stem}.csv`;
};

export const resolveAcquisitionImportSymbol = (symbol: string): string =>
  path.basename(resolveAcquisitionDataFileName(symbol), '.csv');

const sameBar = (left: CanonicalMarketBar, right: CanonicalMarketBar): boolean =>
  left.open === right.open &&
  left.high === right.high &&
  left.low === right.low &&
  left.close === right.close &&
  left.volume === right.volume;

export const normalizeAndValidateAcquisitionBars = ({
  request,
  rows,
}: {
  request: AcquisitionRequest;
  rows: CanonicalMarketBar[];
}): { rows: CanonicalMarketBar[]; mergedDuplicates: number } => {
  if (rows.length === 0) {
    throw new AcquisitionRuntimeError('ACQUISITION_NO_DATA');
  }
  if (rows.length > ACQUISITION_MAX_ROWS_PER_SYMBOL) {
    throw new AcquisitionRuntimeError('ACQUISITION_ROW_LIMIT_EXCEEDED', {
      maxRows: ACQUISITION_MAX_ROWS_PER_SYMBOL,
    });
  }
  const startAtMs = Date.parse(request.startAt);
  const endAtMs = Date.parse(request.endAt);
  const intervalMs = timeframeMilliseconds[request.timeframe];
  const sorted = [...rows].sort(
    (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp),
  );
  const result: CanonicalMarketBar[] = [];
  let mergedDuplicates = 0;
  for (const row of sorted) {
    const timestampMs = Date.parse(row.timestamp);
    const values = [row.open, row.high, row.low, row.close, row.volume];
    if (
      !Number.isFinite(timestampMs) ||
      timestampMs < startAtMs ||
      timestampMs > endAtMs ||
      values.some((value) => !Number.isFinite(value)) ||
      row.open <= 0 ||
      row.high <= 0 ||
      row.low <= 0 ||
      row.close <= 0 ||
      row.volume < 0 ||
      row.high < Math.max(row.open, row.close, row.low) ||
      row.low > Math.min(row.open, row.close, row.high)
    ) {
      throw new AcquisitionRuntimeError('ACQUISITION_BAR_INVALID');
    }
    if (
      (request.connectorId === 'akshare' && !/\+08:00$/u.test(row.timestamp)) ||
      (request.connectorId === 'ccxt' && !/Z$/u.test(row.timestamp))
    ) {
      throw new AcquisitionRuntimeError('ACQUISITION_TIMEZONE_INVALID');
    }
    const previous = result.at(-1);
    if (previous) {
      const previousTimestampMs = Date.parse(previous.timestamp);
      if (timestampMs === previousTimestampMs) {
        if (!sameBar(previous, row)) {
          throw new AcquisitionRuntimeError('ACQUISITION_DUPLICATE_CONFLICT');
        }
        mergedDuplicates += 1;
        continue;
      }
      if (timestampMs - previousTimestampMs < intervalMs) {
        throw new AcquisitionRuntimeError('ACQUISITION_TIMEFRAME_INVALID');
      }
    }
    result.push(row);
  }
  if (result.length >= TIMEFRAME_DETECTION_MIN_BARS) {
    const detectedTimeframe = detectBaseTimeframeFromTimestamps(
      result.slice(0, 96).map((row) => Date.parse(row.timestamp)),
    );
    if (detectedTimeframe !== request.timeframe) {
      throw new AcquisitionRuntimeError('ACQUISITION_TIMEFRAME_INVALID', {
        expectedTimeframe: request.timeframe,
        detectedTimeframe,
      });
    }
  }
  return { rows: result, mergedDuplicates };
};

const toCsv = (rows: CanonicalMarketBar[]): string => {
  const lines = ['datetime,open,high,low,close,volume'];
  for (const row of rows) {
    lines.push(
      [
        row.timestamp,
        row.open,
        row.high,
        row.low,
        row.close,
        row.volume,
      ].join(','),
    );
  }
  return `${lines.join('\n')}\n`;
};

const writeAtomicFile = async (filePath: string, contents: Buffer): Promise<void> => {
  if (contents.byteLength > ACQUISITION_MAX_FILE_BYTES) {
    throw new AcquisitionRuntimeError('ACQUISITION_FILE_LIMIT_EXCEEDED', {
      maxBytes: ACQUISITION_MAX_FILE_BYTES,
    });
  }
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  const handle = await fs.open(temporaryPath, 'wx', 0o600);
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(temporaryPath, filePath);
};

const connectorSourceDetails = (request: AcquisitionRequest) => {
  if (request.connectorId === 'akshare') {
    const isIndex = request.dataset === 'index_zh_a_hist';
    return {
      connector: `Zinuto whitelist NDJSON adapter for AKTools ${AKTOOLS_VERSION} bridge semantics / AKShare ${AKSHARE_VERSION}`,
      upstream: isIndex
        ? 'AKShare China index interface (Eastmoney source)'
        : 'AKShare A-share interface (Eastmoney source)',
      projects: [
        `AKTools ${AKTOOLS_VERSION} — https://github.com/akfamily/aktools`,
        `AKShare ${AKSHARE_VERSION} — https://github.com/akfamily/akshare`,
        'AKShare introduction — https://akshare.akfamily.xyz/introduction.html',
      ],
      termsUrl: 'https://about.eastmoney.com/home/protocol',
      docsUrl: isIndex
        ? 'https://akshare.akfamily.xyz/data/index/index.html'
        : 'https://akshare.akfamily.xyz/data/stock/stock.html',
    };
  }
  if (request.exchangeId === 'binance') {
    return {
      connector: `CCXT ${CCXT_VERSION}`,
      upstream: 'Binance Spot public market data',
      projects: [`CCXT ${CCXT_VERSION} — https://github.com/ccxt/ccxt`],
      termsUrl: 'https://www.binance.com/en/terms',
      docsUrl: 'https://developers.binance.com/en/docs/products/spot/rest-api',
    };
  }
  return {
    connector: `CCXT ${CCXT_VERSION}`,
    upstream: 'OKX Spot public market data',
    projects: [`CCXT ${CCXT_VERSION} — https://github.com/ccxt/ccxt`],
    termsUrl: 'https://www.okx.com/help/terms-of-service',
    docsUrl: 'https://www.okx.com/docs-v5/en/',
  };
};

const buildSourceNotice = ({
  request,
  createdAt,
  dataFiles,
}: {
  request: AcquisitionRequest;
  createdAt: string;
  dataFiles: AcquisitionManifestFile[];
}): string => {
  const source = connectorSourceDetails(request);
  const adjustment = request.connectorId === 'akshare' ? request.adjustment : 'not applicable';
  const exchange = request.connectorId === 'ccxt' ? request.exchangeId : 'not applicable';
  const sourceMetadata = serializeMarketDataAcquisitionSourceMetadata({
    schemaVersion: 2,
    connectorId: request.connectorId,
    adjustment: request.connectorId === 'akshare' ? request.adjustment : null,
    sourceSymbols: [...request.symbols],
    importSymbols: request.symbols.map(resolveAcquisitionImportSymbol),
    timeframe: request.timeframe,
  });
  return `# Data source\n\n` +
    `Zinuto only invoked a local open-source connector. The download was made directly by this computer and Zinuto does not distribute or host the market data. Check the selected source's terms for your use.\n\n` +
    `- Retrieved at: ${createdAt}\n` +
    `- Connector: ${source.connector}\n` +
    `- Upstream: ${source.upstream}\n` +
    source.projects.map((project) => `- Project: ${project}\n`).join('') +
    `- Source terms/docs: ${source.termsUrl}\n` +
    `- API/interface docs: ${source.docsUrl}\n` +
    `- Symbols: ${request.symbols.join(', ')}\n` +
    `- Timeframe: ${request.timeframe}\n` +
    `- Requested range: ${request.startAt} — ${request.endAt}\n` +
    `- Exchange: ${exchange}\n` +
    `- Adjustment: ${adjustment}\n` +
    `- Timestamp zone: ${request.connectorId === 'akshare' ? 'Asia/Shanghai (+08:00)' : 'UTC (Z)'}\n\n` +
    `## Import symbol mapping\n\n` +
    request.symbols.map((symbol) =>
      `- \`${resolveAcquisitionDataFileName(symbol)}\` → \`${resolveAcquisitionImportSymbol(symbol)}\` (source: \`${symbol}\`)\n`
    ).join('') +
    `\n` +
    `## Data file SHA-256\n\n` +
    dataFiles.map((file) => `- \`${file.relativePath}\`: \`${file.sha256}\``).join('\n') +
    `\n\n${sourceMetadata}\n`;
};

const buildManifestRequest = (
  request: AcquisitionRequest,
): AcquisitionManifest['request'] => ({
  market: request.connectorId === 'akshare' ? 'A_SHARE' : 'CRYPTO_SPOT',
  timeframe: request.timeframe,
  startAt: request.startAt,
  endAt: request.endAt,
  adjustment: request.connectorId === 'akshare' ? request.adjustment : null,
  exchangeId: request.connectorId === 'ccxt' ? request.exchangeId : null,
  symbols: [...request.symbols],
});

export const prepareAcquisitionStaging = async ({
  stagingRoot,
  jobId,
  request,
  createdAt,
  rowsBySymbol,
  mergedDuplicateBars,
}: {
  stagingRoot: string;
  jobId: string;
  request: AcquisitionRequest;
  createdAt: string;
  rowsBySymbol: ReadonlyMap<string, CanonicalMarketBar[]>;
  mergedDuplicateBars: number;
}) => {
  if (request.symbols.length > ACQUISITION_MAX_SYMBOLS) {
    throw new AcquisitionRuntimeError('ACQUISITION_SYMBOL_LIMIT_EXCEEDED', {
      maxSymbols: ACQUISITION_MAX_SYMBOLS,
    });
  }
  const jobRoot = path.join(stagingRoot, jobId);
  const payloadRoot = path.join(jobRoot, 'payload');
  await fs.rm(jobRoot, { recursive: true, force: true });
  await fs.mkdir(payloadRoot, { recursive: true, mode: 0o700 });
  const files: AcquisitionManifestFile[] = [];
  const fileNames = new Set<string>();
  try {
    for (const symbol of request.symbols) {
      const rows = rowsBySymbol.get(symbol);
      if (!rows) {
        throw new AcquisitionRuntimeError('ACQUISITION_SYMBOL_RESULT_MISSING', { symbol });
      }
      const fileName = resolveAcquisitionDataFileName(symbol);
      if (fileNames.has(fileName)) {
        throw new AcquisitionRuntimeError('ACQUISITION_FILE_NAME_CONFLICT');
      }
      fileNames.add(fileName);
      const contents = Buffer.from(toCsv(rows), 'utf8');
      await writeAtomicFile(path.join(payloadRoot, fileName), contents);
      files.push({
        relativePath: fileName,
        kind: 'DATA',
        bytes: contents.byteLength,
        sha256: sha256(contents),
      });
    }
    const sourceContents = Buffer.from(
      buildSourceNotice({ request, createdAt, dataFiles: files }),
      'utf8',
    );
    await writeAtomicFile(path.join(payloadRoot, 'SOURCE.md'), sourceContents);
    files.push({
      relativePath: 'SOURCE.md',
      kind: 'SOURCE_NOTICE',
      bytes: sourceContents.byteLength,
      sha256: sha256(sourceContents),
    });
    const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
    if (files.length > ACQUISITION_MAX_FILES || totalBytes > ACQUISITION_MAX_TOTAL_BYTES) {
      throw new AcquisitionRuntimeError('ACQUISITION_OUTPUT_LIMIT_EXCEEDED', {
        maxFiles: ACQUISITION_MAX_FILES,
        maxBytes: ACQUISITION_MAX_TOTAL_BYTES,
      });
    }
    const outputFolderName = createOutputFolderName(
      request.connectorId,
      createdAt,
      jobId,
    );
    const manifest: AcquisitionManifest = {
      schemaVersion: 1,
      jobId,
      connectorId: request.connectorId,
      outputFolderName,
      createdAt,
      request: buildManifestRequest(request),
      fileCount: files.length,
      totalBytes,
      files,
    };
    const manifestContents = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await writeAtomicFile(path.join(jobRoot, 'manifest.json'), manifestContents);
    return {
      fileCount: files.length,
      totalBytes,
      manifestSha256: sha256(manifestContents),
      outputFolderName,
      mergedDuplicateBars,
    };
  } catch (error) {
    await fs.rm(jobRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
};

export const discardAcquisitionStaging = async (
  stagingRoot: string,
  jobId: string,
): Promise<void> => {
  await fs.rm(path.join(stagingRoot, jobId), { recursive: true, force: true });
};

const expectedOffsetMinutes = (timestampMs: number, timeZone: string): number => {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(timestampMs))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    const localMilliseconds = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return Math.round((localMilliseconds - timestampMs) / 60_000);
  } catch {
    throw new AcquisitionRuntimeError('ACQUISITION_TIMEZONE_INVALID', { timeZone });
  }
};

const timestampOffsetMinutes = (timestamp: string): number | null => {
  if (/Z$/u.test(timestamp)) return 0;
  const match = /([+-])(\d{2}):(\d{2})$/u.exec(timestamp);
  if (!match) return null;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '+' ? minutes : -minutes;
};

/** Validate a complete, single-provider OHLCV result before it is staged. */
export const normalizeAndValidateMarketAcquisitionBars = ({
  request,
  timeZone,
  rows,
}: {
  request: MarketAcquisitionRequest;
  timeZone: string;
  rows: CanonicalMarketBar[];
}): { rows: CanonicalMarketBar[]; mergedDuplicates: number } => {
  if (rows.length === 0) {
    throw new AcquisitionRuntimeError('ACQUISITION_NO_DATA');
  }
  if (rows.length > ACQUISITION_MAX_ROWS_PER_SYMBOL) {
    throw new AcquisitionRuntimeError('ACQUISITION_ROW_LIMIT_EXCEEDED', {
      maxRows: ACQUISITION_MAX_ROWS_PER_SYMBOL,
    });
  }
  const startAtMs = Date.parse(request.startAt);
  const endAtMs = Date.parse(request.endAt);
  const intervalMs = timeframeMilliseconds[request.timeframe];
  const result: CanonicalMarketBar[] = [];
  let mergedDuplicates = 0;
  for (const row of [...rows].sort(
    (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp),
  )) {
    const timestampMs = Date.parse(row.timestamp);
    const values = [row.open, row.high, row.low, row.close, row.volume];
    const offsetMinutes = timestampOffsetMinutes(row.timestamp);
    if (
      !Number.isFinite(timestampMs) ||
      timestampMs < startAtMs ||
      timestampMs > endAtMs ||
      offsetMinutes === null ||
      offsetMinutes !== expectedOffsetMinutes(timestampMs, timeZone) ||
      values.some((value) => !Number.isFinite(value)) ||
      row.open <= 0 ||
      row.high <= 0 ||
      row.low <= 0 ||
      row.close <= 0 ||
      row.volume < 0 ||
      row.high < Math.max(row.open, row.close, row.low) ||
      row.low > Math.min(row.open, row.close, row.high)
    ) {
      throw new AcquisitionRuntimeError(
        offsetMinutes === null ||
          (Number.isFinite(timestampMs) &&
            offsetMinutes !== null &&
            offsetMinutes !== expectedOffsetMinutes(timestampMs, timeZone))
          ? 'ACQUISITION_TIMEZONE_INVALID'
          : 'ACQUISITION_BAR_INVALID',
      );
    }
    const previous = result.at(-1);
    if (previous) {
      const previousTimestampMs = Date.parse(previous.timestamp);
      if (timestampMs === previousTimestampMs) {
        if (!sameBar(previous, row)) {
          throw new AcquisitionRuntimeError('ACQUISITION_DUPLICATE_CONFLICT');
        }
        mergedDuplicates += 1;
        continue;
      }
      if (timestampMs - previousTimestampMs < intervalMs) {
        throw new AcquisitionRuntimeError('ACQUISITION_TIMEFRAME_INVALID');
      }
    }
    result.push(row);
  }
  if (result.length >= TIMEFRAME_DETECTION_MIN_BARS) {
    const detectedTimeframe = detectBaseTimeframeFromTimestamps(
      result.slice(0, 96).map((row) => Date.parse(row.timestamp)),
    );
    if (detectedTimeframe !== request.timeframe) {
      throw new AcquisitionRuntimeError('ACQUISITION_TIMEFRAME_INVALID', {
        expectedTimeframe: request.timeframe,
        detectedTimeframe,
      });
    }
  }
  return { rows: result, mergedDuplicates };
};

export const resolveMarketAcquisitionImportSymbol = (symbol: string): string => {
  const normalized = symbol.toUpperCase();
  const direct = normalized.replace(/[^A-Z0-9._-]/gu, '-');
  if (direct === normalized && /^[A-Z0-9._-]{1,64}$/u.test(direct)) {
    return direct;
  }
  const readable = direct.replace(/-+/gu, '-').replace(/^-|-$/gu, '').slice(0, 48);
  const digest = sha256(Buffer.from(normalized, 'utf8')).slice(0, 12).toUpperCase();
  const result = `${readable || 'MARKET'}-${digest}`;
  if (!/^[A-Z0-9._-]{1,64}$/u.test(result)) {
    throw new AcquisitionRuntimeError('ACQUISITION_SYMBOL_FILE_NAME_INVALID');
  }
  return result;
};

export const resolveMarketAcquisitionDataFileName = (symbol: string): string =>
  `${resolveMarketAcquisitionImportSymbol(symbol)}.csv`;

type MarketAcquisitionManifest = {
  schemaVersion: 3;
  jobId: string;
  outputFolderName: string;
  createdAt: string;
  request: MarketAcquisitionRequest;
  timeZone: string;
  sourceResults: MarketAcquisitionJob['sourceResults'];
  fileCount: number;
  totalBytes: number;
  files: AcquisitionManifestFile[];
};

const marketOutputFolderName = (
  marketId: string,
  createdAt: string,
  jobId: string,
): string => {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) {
    throw new AcquisitionRuntimeError('ACQUISITION_TIMESTAMP_INVALID');
  }
  const timestamp = date
    .toISOString()
    .slice(0, 19)
    .replace(/[-:T]/gu, '')
    .replace(/^(\d{8})(\d{6})$/u, '$1-$2');
  const jobToken = jobId.replace(/[^A-Za-z0-9]/gu, '').slice(0, 8);
  const safeMarket = marketId.replace(/[^A-Z0-9_-]/gu, '');
  if (jobToken.length !== 8 || safeMarket.length === 0) {
    throw new AcquisitionRuntimeError('ACQUISITION_JOB_ID_INVALID');
  }
  return `Zinuto-Data-${safeMarket}-${timestamp}-${jobToken}`;
};

const marketSourceDetails = (providerId: string, upstreamId: string) => {
  if (providerId === 'akshare') {
    return {
      connector: `AKTools ${AKTOOLS_VERSION} / AKShare ${AKSHARE_VERSION}`,
      project: 'https://github.com/akfamily/akshare',
      terms: upstreamId === 'tencent'
        ? 'https://www.tencent.com/term-of-service/'
        : upstreamId === 'sina'
          ? 'https://finance.sina.com.cn/roll/2021-05-12/doc-ikmxzfmm2033220.shtml'
          : 'https://about.eastmoney.com/home/protocol',
      upstream: upstreamId,
    };
  }
  if (providerId === 'ccxt') {
    return {
      connector: `CCXT ${CCXT_VERSION}`,
      project: 'https://github.com/ccxt/ccxt',
      terms: upstreamId === 'okx'
        ? 'https://www.okx.com/help/terms-of-service'
        : 'https://www.binance.com/en/terms',
      upstream: upstreamId,
    };
  }
  return {
    connector: `FinanceDataReader ${FINANCE_DATA_READER_VERSION}`,
    project: 'https://github.com/FinanceData/FinanceDataReader',
    terms: upstreamId === 'naver-finance'
      ? 'https://policy.naver.com/rules/service.html'
      : upstreamId === 'krx-index-cache'
        ? 'https://global.krx.co.kr/contents/GLB/01/0102/0102010100/GLB0102010100.jsp'
        : upstreamId === 'investing-com'
          ? 'https://www.investing.com/about-us/terms-and-conditions'
          : 'https://finance.yahoo.com/legal/terms.html',
    upstream: upstreamId,
  };
};

const buildMarketSourceNotice = ({
  request,
  createdAt,
  timeZone,
  sourceResults,
  dataFiles,
}: {
  request: MarketAcquisitionRequest;
  createdAt: string;
  timeZone: string;
  sourceResults: MarketAcquisitionJob['sourceResults'];
  dataFiles: AcquisitionManifestFile[];
}): string => {
  const resolved = sourceResults.map((result) => {
    if (!result.finalSource) {
      throw new AcquisitionRuntimeError('ACQUISITION_SYMBOL_RESULT_MISSING', {
        symbol: result.symbol,
      });
    }
    return result;
  });
  const finalProviderIds = new Set(
    resolved.map((result) => result.finalSource!.providerId),
  );
  const connectorId = finalProviderIds.size === 1
    ? [...finalProviderIds][0]!
    : 'mixed';
  const sourceMetadata = serializeMarketDataAcquisitionSourceMetadata({
    schemaVersion: 3,
    connectorId,
    adjustment: request.adjustment,
    sourceSymbols: resolved.map((result) => result.sourceSymbol),
    importSymbols: resolved.map((result) =>
      resolveMarketAcquisitionImportSymbol(result.sourceSymbol)),
    timeframe: request.timeframe,
    marketId: request.marketId,
    timeZone,
    sources: resolved.map((result) => ({
      sourceSymbol: result.sourceSymbol,
      importSymbol: resolveMarketAcquisitionImportSymbol(result.sourceSymbol),
      finalSource: result.finalSource!,
      attempts: result.attempts,
    })),
  });
  const sources = resolved.map((result) => {
    const finalSource = result.finalSource!;
    const details = marketSourceDetails(
      finalSource.providerId,
      finalSource.upstreamId,
    );
    const attempts = result.attempts
      .map(
        (attempt) =>
          `${attempt.providerId}@${attempt.providerVersion} ${attempt.status}` +
          (attempt.errorCode ? ` (${attempt.errorCode})` : ''),
      )
      .join(' → ');
    return `- \`${result.sourceSymbol}\` → \`${resolveMarketAcquisitionDataFileName(result.sourceSymbol)}\`: ${details.connector}; upstream \`${details.upstream}\`; attempts ${attempts}\n`;
  }).join('');
  const providerDetails = [...new Map(
    resolved.map((result) => {
      const finalSource = result.finalSource!;
      const details = marketSourceDetails(finalSource.providerId, finalSource.upstreamId);
      return [`${finalSource.providerId}:${finalSource.upstreamId}`, details] as const;
    }),
  ).values()];
  return `# Data source\n\n` +
    `Zinuto invoked only local open-source connectors. This computer retrieved the data directly from the selected upstream; Zinuto does not host or redistribute market data. Check every listed upstream's terms for your use.\n\n` +
    `- Retrieved at: ${createdAt}\n` +
    `- Market: ${request.marketId}\n` +
    `- Source plan: ${request.sourcePlanId}\n` +
    `- Timeframe: ${request.timeframe}\n` +
    `- Requested range: ${request.startAt} — ${request.endAt}\n` +
    `- Adjustment: ${request.adjustment ?? 'not applicable'}\n` +
    `- Timestamp zone: ${timeZone}\n` +
    providerDetails.map((details) =>
      `- Connector/project: ${details.connector} — ${details.project}\n- Upstream terms: ${details.terms}\n`,
    ).join('') +
    `\n## Per-instrument provenance\n\n${sources}\n` +
    `## Data file SHA-256\n\n` +
    dataFiles.map((file) => `- \`${file.relativePath}\`: \`${file.sha256}\``).join('\n') +
    `\n\n${sourceMetadata}\n`;
};

export const prepareMarketAcquisitionStaging = async ({
  stagingRoot,
  jobId,
  request,
  createdAt,
  timeZone,
  rowsBySymbol,
  sourceResults,
  mergedDuplicateBars,
}: {
  stagingRoot: string;
  jobId: string;
  request: MarketAcquisitionRequest;
  createdAt: string;
  timeZone: string;
  rowsBySymbol: ReadonlyMap<string, CanonicalMarketBar[]>;
  sourceResults: MarketAcquisitionJob['sourceResults'];
  mergedDuplicateBars: number;
}) => {
  if (request.symbols.length > ACQUISITION_MAX_SYMBOLS) {
    throw new AcquisitionRuntimeError('ACQUISITION_SYMBOL_LIMIT_EXCEEDED', {
      maxSymbols: ACQUISITION_MAX_SYMBOLS,
    });
  }
  const sourceBySymbol = new Map(sourceResults.map((result) => [result.symbol, result]));
  const jobRoot = path.join(stagingRoot, jobId);
  const payloadRoot = path.join(jobRoot, 'payload');
  await fs.rm(jobRoot, { recursive: true, force: true });
  await fs.mkdir(payloadRoot, { recursive: true, mode: 0o700 });
  const files: AcquisitionManifestFile[] = [];
  const fileNames = new Set<string>();
  try {
    for (const symbol of request.symbols) {
      const rows = rowsBySymbol.get(symbol);
      const sourceResult = sourceBySymbol.get(symbol);
      if (!rows || !sourceResult?.finalSource) {
        throw new AcquisitionRuntimeError('ACQUISITION_SYMBOL_RESULT_MISSING', { symbol });
      }
      const fileName = resolveMarketAcquisitionDataFileName(sourceResult.sourceSymbol);
      if (fileNames.has(fileName)) {
        throw new AcquisitionRuntimeError('ACQUISITION_FILE_NAME_CONFLICT');
      }
      fileNames.add(fileName);
      const contents = Buffer.from(toCsv(rows), 'utf8');
      await writeAtomicFile(path.join(payloadRoot, fileName), contents);
      files.push({
        relativePath: fileName,
        kind: 'DATA',
        bytes: contents.byteLength,
        sha256: sha256(contents),
      });
    }
    const sourceContents = Buffer.from(
      buildMarketSourceNotice({
        request,
        createdAt,
        timeZone,
        sourceResults,
        dataFiles: files,
      }),
      'utf8',
    );
    await writeAtomicFile(path.join(payloadRoot, 'SOURCE.md'), sourceContents);
    files.push({
      relativePath: 'SOURCE.md',
      kind: 'SOURCE_NOTICE',
      bytes: sourceContents.byteLength,
      sha256: sha256(sourceContents),
    });
    const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
    if (files.length > ACQUISITION_MAX_FILES || totalBytes > ACQUISITION_MAX_TOTAL_BYTES) {
      throw new AcquisitionRuntimeError('ACQUISITION_OUTPUT_LIMIT_EXCEEDED', {
        maxFiles: ACQUISITION_MAX_FILES,
        maxBytes: ACQUISITION_MAX_TOTAL_BYTES,
      });
    }
    const outputFolderName = marketOutputFolderName(request.marketId, createdAt, jobId);
    const manifest: MarketAcquisitionManifest = {
      schemaVersion: 3,
      jobId,
      outputFolderName,
      createdAt,
      request,
      timeZone,
      sourceResults,
      fileCount: files.length,
      totalBytes,
      files,
    };
    const manifestContents = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await writeAtomicFile(path.join(jobRoot, 'manifest.json'), manifestContents);
    return {
      fileCount: files.length,
      totalBytes,
      manifestSha256: sha256(manifestContents),
      outputFolderName,
      mergedDuplicateBars,
    };
  } catch (error) {
    await fs.rm(jobRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
};
