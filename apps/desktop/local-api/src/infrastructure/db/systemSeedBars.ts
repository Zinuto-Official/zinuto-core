// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { getTimeZonePeriodStartMs, type DisplayPeriodKey } from '@zinuto/shared/period';
import {
  FIXED_EST_TIME_ZONE,
  parseTimestampMsInTimeZone,
} from '@zinuto/shared/timezone';

export type SystemSeedBaseTimeframe = '1m' | '1d';
export type SystemSeedDisplayPeriod = Extract<DisplayPeriodKey, '1m' | '5m' | '1h' | '1d'>;
export type SystemSeedAssetClass = 'STOCK' | 'FOREX';

export const SYSTEM_BARS_SEED_VERSION = '2026-07-30-v3-system-market-seed-wiki-eod-100-fx-1m-fixed-est';
export const SYSTEM_WIKI_EOD_SEED_VERSION = '2026-04-27-v1-nasdaq-data-link-wiki-eod-100';
export const SYSTEM_FX_1M_2025Q1_SEED_VERSION = '2026-07-30-v2-histdata-fx-1m-2025q1-fixed-est';

export const SYSTEM_WIKI_EOD_POOL_ID = '__sample_pool_system__';
export const SYSTEM_FX_1M_2025Q1_POOL_ID = '__sample_pool_system_fx_1m_2025q1__';

export const SYSTEM_SEED_SOURCE_NAME = 'Nasdaq Data Link WIKI EOD 100';
export const SYSTEM_SEED_TIME_ZONE = 'America/New_York';
export const SYSTEM_SEED_MARKET_PRESET_ID = 'US_STOCK';
export const SYSTEM_SEED_ASSET_CLASS = 'STOCK';
export const SYSTEM_SEED_MIN_TRADE_STEP = 1;

export const SYSTEM_FX_1M_2025Q1_SOURCE_NAME = 'HistData FX 1m 2025 Q1';
export const SYSTEM_FX_1M_2025Q1_TIME_ZONE = 'America/New_York';
export const SYSTEM_FX_1M_2025Q1_TIMESTAMP_TIME_ZONE = FIXED_EST_TIME_ZONE;
export const SYSTEM_FX_1M_2025Q1_MARKET_PRESET_ID = 'FOREX_STANDARD_LOT';
export const SYSTEM_FX_1M_2025Q1_ASSET_CLASS = 'FOREX';
export const SYSTEM_FX_1M_2025Q1_MIN_TRADE_STEP = 0.01;

const SYSTEM_WIKI_EOD_SYMBOLS = [
  'AAPL',
  'MSFT',
  'AMZN',
  'GOOGL',
  'GOOG',
  'FB',
  'BRK_B',
  'JPM',
  'JNJ',
  'XOM',
  'WMT',
  'BAC',
  'PG',
  'V',
  'MA',
  'UNH',
  'HD',
  'DIS',
  'INTC',
  'CSCO',
  'PFE',
  'KO',
  'PEP',
  'MRK',
  'T',
  'VZ',
  'CVX',
  'ORCL',
  'IBM',
  'MCD',
  'NKE',
  'BA',
  'GE',
  'MMM',
  'CAT',
  'GS',
  'MS',
  'C',
  'WFC',
  'AXP',
  'COST',
  'SBUX',
  'NFLX',
  'NVDA',
  'ADBE',
  'CRM',
  'PYPL',
  'QCOM',
  'TXN',
  'AVGO',
  'AMAT',
  'AMD',
  'MU',
  'GILD',
  'AMGN',
  'BIIB',
  'CELG',
  'REGN',
  'ISRG',
  'MDT',
  'ABBV',
  'ABT',
  'BMY',
  'LLY',
  'UPS',
  'FDX',
  'UTX',
  'HON',
  'LMT',
  'RTN',
  'NOC',
  'MO',
  'PM',
  'CL',
  'KMB',
  'TGT',
  'LOW',
  'CVS',
  'WBA',
  'BK',
  'BLK',
  'SPG',
  'O',
  'VLO',
  'COP',
  'SLB',
  'EOG',
  'NEE',
  'DUK',
  'SO',
  'AEP',
  'MDLZ',
  'KHC',
  'GM',
  'F',
  'TSLA',
  'EBAY',
  'YHOO',
  'AIG',
  'MET',
] as const;

const SYSTEM_FX_1M_2025Q1_SYMBOLS = [
  'AUDCAD',
  'AUDJPY',
  'AUDUSD',
  'EURAUD',
  'EURCAD',
  'EURCHF',
  'EURGBP',
  'EURJPY',
  'EURNZD',
  'EURUSD',
  'GBPAUD',
  'GBPCAD',
  'GBPCHF',
] as const;

export const SYSTEM_DEFAULT_SYMBOLS = [
  ...SYSTEM_WIKI_EOD_SYMBOLS,
  ...SYSTEM_FX_1M_2025Q1_SYMBOLS,
] as const;

type SeedBar = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type SystemSeedManifestSymbol = {
  symbol: string;
  fileName: string;
  rowCount: number;
  firstDate: string;
  lastDate: string;
  firstTimestamp?: string;
  lastTimestamp?: string;
  rawCsvBytes: number;
  compressedBytes: number;
  sha256: string;
};

type SystemSeedStorageEstimate = {
  rawCsvBytes: number;
  compressedAssetBytes: number;
  seededDuckDbBytes: number;
};

type SystemSeedManifest = {
  version: string;
  sourceName: string;
  timeZone: string;
  timestampTimeZone?: string;
  baseTimeframe: SystemSeedBaseTimeframe;
  marketPresetId: string;
  assetClass: SystemSeedAssetClass;
  minTradeStep: number;
  selectedSymbolCount: number;
  totalRows: number;
  storageEstimate: SystemSeedStorageEstimate;
  droppedRows: Array<{
    symbol: string;
    lineNumber: number;
    date?: string;
    datetime?: string;
    reason: string;
  }>;
  symbols: SystemSeedManifestSymbol[];
};

type SystemSeedDatasetDefinition = {
  poolId: string;
  version: string;
  sourceName: string;
  assetDirName: string;
  timeZone: string;
  timestampTimeZone: string;
  baseTimeframe: SystemSeedBaseTimeframe;
  marketPresetId: string;
  assetClass: SystemSeedAssetClass;
  minTradeStep: number;
  nameSuffix: string;
  csvHeader: string;
  symbols: readonly string[];
};

export type SystemSeedInstrumentDefinition = {
  poolId: string;
  sourceName: string;
  symbol: string;
  baseTimeframe: SystemSeedBaseTimeframe;
  name: string;
  timeZone: string;
  marketPresetId: string;
  assetClass: SystemSeedAssetClass;
  minTradeStep: number;
};

export type SystemSeedInstrumentMetadata = {
  barCount: number;
  timeStartTs: string | null;
  timeEndTs: string | null;
  barsVersionToken: string;
};

const SYSTEM_SEED_DATASETS = [
  {
    poolId: SYSTEM_WIKI_EOD_POOL_ID,
    version: SYSTEM_WIKI_EOD_SEED_VERSION,
    sourceName: SYSTEM_SEED_SOURCE_NAME,
    assetDirName: 'wiki-eod-100',
    timeZone: SYSTEM_SEED_TIME_ZONE,
    timestampTimeZone: SYSTEM_SEED_TIME_ZONE,
    baseTimeframe: '1d',
    marketPresetId: SYSTEM_SEED_MARKET_PRESET_ID,
    assetClass: SYSTEM_SEED_ASSET_CLASS,
    minTradeStep: SYSTEM_SEED_MIN_TRADE_STEP,
    nameSuffix: 'WIKI EOD',
    csvHeader: 'date,adj_open,adj_high,adj_low,adj_close,adj_volume',
    symbols: SYSTEM_WIKI_EOD_SYMBOLS,
  },
  {
    poolId: SYSTEM_FX_1M_2025Q1_POOL_ID,
    version: SYSTEM_FX_1M_2025Q1_SEED_VERSION,
    sourceName: SYSTEM_FX_1M_2025Q1_SOURCE_NAME,
    assetDirName: 'histdata-fx-1m-2025q1',
    timeZone: SYSTEM_FX_1M_2025Q1_TIME_ZONE,
    timestampTimeZone: SYSTEM_FX_1M_2025Q1_TIMESTAMP_TIME_ZONE,
    baseTimeframe: '1m',
    marketPresetId: SYSTEM_FX_1M_2025Q1_MARKET_PRESET_ID,
    assetClass: SYSTEM_FX_1M_2025Q1_ASSET_CLASS,
    minTradeStep: SYSTEM_FX_1M_2025Q1_MIN_TRADE_STEP,
    nameSuffix: 'FX 1m 2025Q1',
    csvHeader: 'datetime,open,high,low,close,volume',
    symbols: SYSTEM_FX_1M_2025Q1_SYMBOLS,
  },
] as const satisfies readonly SystemSeedDatasetDefinition[];

const ASSET_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'assets',
  'system-market-seed',
);

const buildInstrumentKey = (symbol: string, baseTimeframe: string): string =>
  `${String(baseTimeframe || '').trim().toLowerCase()}::${String(symbol || '').trim().toUpperCase()}`;

const SYSTEM_SEED_INSTRUMENTS: readonly SystemSeedInstrumentDefinition[] = SYSTEM_SEED_DATASETS.flatMap((dataset) =>
  dataset.symbols.map((symbol) => ({
    poolId: dataset.poolId,
    sourceName: dataset.sourceName,
    symbol,
    baseTimeframe: dataset.baseTimeframe,
    name: `${symbol} ${dataset.nameSuffix}`,
    timeZone: dataset.timeZone,
    marketPresetId: dataset.marketPresetId,
    assetClass: dataset.assetClass,
    minTradeStep: dataset.minTradeStep,
  })),
);

const datasetByPoolId = new Map<string, SystemSeedDatasetDefinition>(
  SYSTEM_SEED_DATASETS.map((dataset) => [dataset.poolId, dataset]),
);

export const resolveSystemSeedPoolBaseTimeframe = (
  poolId: string,
): SystemSeedBaseTimeframe | null =>
  datasetByPoolId.get(String(poolId || '').trim())?.baseTimeframe ?? null;

const instrumentByKey = new Map<string, SystemSeedInstrumentDefinition>(
  SYSTEM_SEED_INSTRUMENTS.map((instrument) => [
    buildInstrumentKey(instrument.symbol, instrument.baseTimeframe),
    instrument,
  ]),
);
const firstInstrumentBySymbol = new Map<string, SystemSeedInstrumentDefinition>();
SYSTEM_SEED_INSTRUMENTS.forEach((instrument) => {
  if (!firstInstrumentBySymbol.has(instrument.symbol)) {
    firstInstrumentBySymbol.set(instrument.symbol, instrument);
  }
});

const barsByInstrumentCache = new Map<string, SeedBar[]>();
const manifestCacheByPoolId = new Map<string, SystemSeedManifest>();
const displayBarCountCache = new Map<string, number>();

const getDatasetAssetRoot = (dataset: SystemSeedDatasetDefinition): string =>
  path.join(ASSET_ROOT, dataset.assetDirName);

const readManifest = (dataset: SystemSeedDatasetDefinition): SystemSeedManifest => {
  const cached = manifestCacheByPoolId.get(dataset.poolId);
  if (cached) {
    return cached;
  }
  const manifestPath = path.join(getDatasetAssetRoot(dataset), 'manifest.json');
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as SystemSeedManifest;
  if (
    parsed.version !== dataset.version ||
    parsed.sourceName !== dataset.sourceName ||
    parsed.timeZone !== dataset.timeZone ||
    (parsed.timestampTimeZone ?? parsed.timeZone) !== dataset.timestampTimeZone ||
    parsed.baseTimeframe !== dataset.baseTimeframe ||
    parsed.marketPresetId !== dataset.marketPresetId ||
    parsed.assetClass !== dataset.assetClass ||
    parsed.minTradeStep !== dataset.minTradeStep ||
    parsed.selectedSymbolCount !== dataset.symbols.length
  ) {
    throw new Error('SYSTEM_SEED_MANIFEST_MISMATCH');
  }
  const manifestSymbols = parsed.symbols.map((item) => item.symbol);
  if (manifestSymbols.join('|') !== dataset.symbols.join('|')) {
    throw new Error('SYSTEM_SEED_SYMBOL_LIST_MISMATCH');
  }
  manifestCacheByPoolId.set(dataset.poolId, parsed);
  return parsed;
};

const toSeedTimestamp = (value: string, timeZone: string): string => {
  const compactDateTime = String(value || '').trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  const timestampValue = compactDateTime
    ? `${compactDateTime[1]}-${compactDateTime[2]}-${compactDateTime[3]}T${compactDateTime[4]}:${compactDateTime[5]}:${compactDateTime[6]}`
    : value;
  const timestampMs = parseTimestampMsInTimeZone(timestampValue, timeZone);
  if (!Number.isFinite(timestampMs)) {
    throw new Error('SYSTEM_SEED_INVALID_TIMESTAMP');
  }
  return new Date(timestampMs).toISOString();
};

const normalizeManifestTimestamp = (
  timestamp: string | undefined,
  fallbackDate: string | undefined,
  timeZone: string,
): string | null => {
  const normalizedTimestamp = String(timestamp ?? '').trim();
  if (normalizedTimestamp) {
    const parsed = Date.parse(normalizedTimestamp);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  const normalizedFallbackDate = String(fallbackDate ?? '').trim();
  if (!normalizedFallbackDate) {
    return null;
  }
  return toSeedTimestamp(normalizedFallbackDate, timeZone);
};

const toFinitePositiveNumber = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('SYSTEM_SEED_INVALID_PRICE');
  }
  return parsed;
};

const toFiniteVolume = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('SYSTEM_SEED_INVALID_VOLUME');
  }
  return parsed;
};

const assertValidSeedOhlc = (bar: {
  open: number;
  high: number;
  low: number;
  close: number;
}): void => {
  if (
    bar.high < bar.open ||
    bar.high < bar.low ||
    bar.high < bar.close ||
    bar.low > bar.open ||
    bar.low > bar.high ||
    bar.low > bar.close
  ) {
    throw new Error('SYSTEM_SEED_INVALID_OHLC');
  }
};

const getSeedManifestSymbol = (
  dataset: SystemSeedDatasetDefinition,
  symbol: string,
): SystemSeedManifestSymbol | null =>
  readManifest(dataset).symbols.find((item) => item.symbol === symbol) ?? null;

const readSeedCsvText = (
  dataset: SystemSeedDatasetDefinition,
  manifestSymbol: SystemSeedManifestSymbol,
): string => {
  const csvPath = path.join(getDatasetAssetRoot(dataset), manifestSymbol.fileName);
  return zlib.gunzipSync(fs.readFileSync(csvPath)).toString('utf8').trim();
};

const readSeedCsvLines = (
  dataset: SystemSeedDatasetDefinition,
  manifestSymbol: SystemSeedManifestSymbol,
): string[] => {
  const csvText = readSeedCsvText(dataset, manifestSymbol);
  const lines = csvText ? csvText.split(/\r?\n/) : [];
  if (lines[0] !== dataset.csvHeader) {
    throw new Error('SYSTEM_SEED_INVALID_HEADER');
  }
  return lines;
};

const loadBarsForInstrument = (instrument: SystemSeedInstrumentDefinition): SeedBar[] => {
  const cacheKey = buildInstrumentKey(instrument.symbol, instrument.baseTimeframe);
  const cached = barsByInstrumentCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const dataset = datasetByPoolId.get(instrument.poolId);
  if (!dataset) {
    return [];
  }
  const manifestSymbol = getSeedManifestSymbol(dataset, instrument.symbol);
  if (!manifestSymbol) {
    return [];
  }
  const lines = readSeedCsvLines(dataset, manifestSymbol);
  const bars = lines.slice(1).map((line) => {
    const [timestamp, open, high, low, close, volume] = line.split(',');
    const bar = {
      ts: toSeedTimestamp(timestamp ?? '', dataset.timestampTimeZone),
      open: toFinitePositiveNumber(open ?? ''),
      high: toFinitePositiveNumber(high ?? ''),
      low: toFinitePositiveNumber(low ?? ''),
      close: toFinitePositiveNumber(close ?? ''),
      volume: toFiniteVolume(volume ?? ''),
    };
    assertValidSeedOhlc(bar);
    return bar;
  });
  if (bars.length !== manifestSymbol.rowCount) {
    throw new Error('SYSTEM_SEED_ROW_COUNT_MISMATCH');
  }
  barsByInstrumentCache.set(cacheKey, bars);
  return bars;
};

export const listSystemSeedDatasets = (): Array<{
  poolId: string;
  version: string;
  sourceName: string;
  timeZone: string;
  baseTimeframe: SystemSeedBaseTimeframe;
  marketPresetId: string;
  assetClass: SystemSeedAssetClass;
  minTradeStep: number;
  selectedSymbolCount: number;
}> =>
  SYSTEM_SEED_DATASETS.map((dataset) => ({
    poolId: dataset.poolId,
    version: dataset.version,
    sourceName: dataset.sourceName,
    timeZone: dataset.timeZone,
    baseTimeframe: dataset.baseTimeframe,
    marketPresetId: dataset.marketPresetId,
    assetClass: dataset.assetClass,
    minTradeStep: dataset.minTradeStep,
    selectedSymbolCount: dataset.symbols.length,
  }));

export const listSystemSeedInstruments = (): SystemSeedInstrumentDefinition[] =>
  SYSTEM_SEED_INSTRUMENTS.map((instrument) => ({ ...instrument }));

export const listSystemSeedSymbols = (): string[] =>
  SYSTEM_SEED_INSTRUMENTS.map((instrument) => instrument.symbol);

export const resolveSystemSeedInstrumentDefinition = (
  symbol: string,
  baseTimeframe?: string | null,
): SystemSeedInstrumentDefinition | null => {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (!normalizedSymbol) {
    return null;
  }
  const normalizedBaseTimeframe = String(baseTimeframe || '').trim().toLowerCase();
  if (normalizedBaseTimeframe) {
    return instrumentByKey.get(buildInstrumentKey(normalizedSymbol, normalizedBaseTimeframe)) ?? null;
  }
  return firstInstrumentBySymbol.get(normalizedSymbol) ?? null;
};

export const resolveSystemSeedBaseTimeframe = (symbol: string): SystemSeedBaseTimeframe | null =>
  resolveSystemSeedInstrumentDefinition(symbol)?.baseTimeframe ?? null;

export const resolveSystemSeedMarketPresetId = (
  symbol: string,
  baseTimeframe?: string | null,
): string | null => resolveSystemSeedInstrumentDefinition(symbol, baseTimeframe)?.marketPresetId ?? null;

export const resolveSystemSeedInstrumentMetadata = (
  symbol: string,
  baseTimeframe?: string | null,
): SystemSeedInstrumentMetadata | null => {
  const instrument = resolveSystemSeedInstrumentDefinition(symbol, baseTimeframe);
  if (!instrument) {
    return null;
  }
  const dataset = datasetByPoolId.get(instrument.poolId);
  if (!dataset) {
    return null;
  }
  const manifest = readManifest(dataset);
  const manifestSymbol = manifest.symbols.find((item) => item.symbol === instrument.symbol);
  if (!manifestSymbol) {
    return null;
  }
  const barCount = Math.max(0, Math.floor(Number(manifestSymbol.rowCount) || 0));
  const timeStartTs = normalizeManifestTimestamp(
    manifestSymbol.firstTimestamp,
    manifestSymbol.firstDate,
    dataset.timestampTimeZone,
  );
  const timeEndTs = normalizeManifestTimestamp(
    manifestSymbol.lastTimestamp,
    manifestSymbol.lastDate,
    dataset.timestampTimeZone,
  );
  return {
    barCount,
    timeStartTs,
    timeEndTs,
    barsVersionToken:
      barCount > 0 && timeStartTs && timeEndTs
        ? `system-seed:${dataset.version}:${manifestSymbol.sha256}:${barCount}`
        : '',
  };
};

const normalizeSystemSeedDisplayPeriod = (
  value?: string | null,
): SystemSeedDisplayPeriod | null => {
  switch (String(value || '').trim().toLowerCase()) {
    case '1m':
    case '5m':
    case '1h':
    case '1d':
      return String(value).trim().toLowerCase() as SystemSeedDisplayPeriod;
    default:
      return null;
  }
};

const resolveSeedTimestampBucketKey = (
  timestamp: string,
  displayPeriod: SystemSeedDisplayPeriod,
): string | null => {
  const normalizedTimestamp = String(timestamp || '').trim();
  const compact = normalizedTimestamp.match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/,
  );
  const separated = normalizedTimestamp.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):?(\d{2})?)?/,
  );
  const parts = compact ?? separated;
  if (!parts) {
    return null;
  }

  const year = parts[1];
  const month = parts[2];
  const day = parts[3];
  const hour = parts[4] ?? '00';
  const minuteValue = Math.max(0, Math.min(59, Number(parts[5] ?? 0) || 0));
  const minute = String(
    displayPeriod === '5m' ? Math.floor(minuteValue / 5) * 5 : minuteValue,
  ).padStart(2, '0');

  switch (displayPeriod) {
    case '1m':
      return `${year}-${month}-${day}T${hour}:${minute}`;
    case '5m':
      return `${year}-${month}-${day}T${hour}:${minute}`;
    case '1h':
      return `${year}-${month}-${day}T${hour}`;
    case '1d':
      return `${year}-${month}-${day}`;
    default:
      return null;
  }
};

const countDisplayBarsFromSeedCsv = (
  instrument: SystemSeedInstrumentDefinition,
  displayPeriod: SystemSeedDisplayPeriod,
): number | null => {
  const dataset = datasetByPoolId.get(instrument.poolId);
  if (!dataset || dataset.timeZone !== instrument.timeZone) {
    return null;
  }
  const manifestSymbol = getSeedManifestSymbol(dataset, instrument.symbol);
  if (!manifestSymbol) {
    return null;
  }
  const lines = readSeedCsvLines(dataset, manifestSymbol);
  let count = 0;
  let rowCount = 0;
  let lastBucketKey: string | null = null;
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }
    const commaIndex = line.indexOf(',');
    if (commaIndex <= 0) {
      throw new Error('SYSTEM_SEED_INVALID_ROW');
    }
    const timestamp = line.slice(0, commaIndex);
    const bucketKey = resolveSeedTimestampBucketKey(timestamp, displayPeriod);
    if (!bucketKey) {
      throw new Error('SYSTEM_SEED_INVALID_TIMESTAMP');
    }
    rowCount += 1;
    if (bucketKey === lastBucketKey) {
      continue;
    }
    lastBucketKey = bucketKey;
    count += 1;
  }
  if (rowCount !== manifestSymbol.rowCount) {
    throw new Error('SYSTEM_SEED_ROW_COUNT_MISMATCH');
  }
  return count;
};

const countDisplayBarsFromParsedSeedBars = (
  instrument: SystemSeedInstrumentDefinition,
  displayPeriod: SystemSeedDisplayPeriod,
  timeZone: string,
): number => {
  let count = 0;
  let lastBucketStartMs: number | null = null;
  for (const bar of loadBarsForInstrument(instrument)) {
    const timestampMs = Date.parse(bar.ts);
    if (!Number.isFinite(timestampMs)) {
      continue;
    }
    const bucketStartMs = getTimeZonePeriodStartMs(
      timestampMs,
      displayPeriod,
      timeZone,
    );
    if (!Number.isFinite(bucketStartMs) || bucketStartMs === lastBucketStartMs) {
      continue;
    }
    lastBucketStartMs = bucketStartMs;
    count += 1;
  }
  return count;
};

export const resolveSystemSeedDisplayBarCount = (
  symbol: string,
  baseTimeframe?: string | null,
  displayPeriod?: string | null,
  timeZone?: string | null,
): number | null => {
  const instrument = resolveSystemSeedInstrumentDefinition(symbol, baseTimeframe);
  const normalizedDisplayPeriod = normalizeSystemSeedDisplayPeriod(displayPeriod);
  if (!instrument || !normalizedDisplayPeriod) {
    return null;
  }
  const metadata = resolveSystemSeedInstrumentMetadata(instrument.symbol, instrument.baseTimeframe);
  if (!metadata) {
    return null;
  }
  if (normalizedDisplayPeriod === instrument.baseTimeframe) {
    return metadata.barCount;
  }

  const normalizedTimeZone = String(timeZone || instrument.timeZone || '').trim() || instrument.timeZone;
  const cacheKey = [
    buildInstrumentKey(instrument.symbol, instrument.baseTimeframe),
    normalizedDisplayPeriod,
    normalizedTimeZone,
    metadata.barsVersionToken,
  ].join('|');
  const cached = displayBarCountCache.get(cacheKey);
  if (typeof cached === 'number') {
    return cached;
  }

  const count =
    normalizedTimeZone === instrument.timeZone
      ? countDisplayBarsFromSeedCsv(instrument, normalizedDisplayPeriod) ??
        countDisplayBarsFromParsedSeedBars(
          instrument,
          normalizedDisplayPeriod,
          normalizedTimeZone,
        )
      : countDisplayBarsFromParsedSeedBars(
          instrument,
          normalizedDisplayPeriod,
          normalizedTimeZone,
        );

  displayBarCountCache.set(cacheKey, count);
  return count;
};

export const generateSystemSeedBars = (
  symbol: string,
  baseTimeframe?: string | null,
): SeedBar[] => {
  const instrument = resolveSystemSeedInstrumentDefinition(symbol, baseTimeframe);
  if (!instrument) {
    return [];
  }
  return loadBarsForInstrument(instrument).map((bar) => ({ ...bar }));
};

const emptyStorageEstimate = (): SystemSeedStorageEstimate => ({
  rawCsvBytes: 0,
  compressedAssetBytes: 0,
  seededDuckDbBytes: 0,
});

export const getSystemSeedStorageEstimate = (): SystemSeedStorageEstimate =>
  SYSTEM_SEED_DATASETS.reduce((total, dataset) => {
    const estimate = readManifest(dataset).storageEstimate;
    return {
      rawCsvBytes: total.rawCsvBytes + estimate.rawCsvBytes,
      compressedAssetBytes: total.compressedAssetBytes + estimate.compressedAssetBytes,
      seededDuckDbBytes: total.seededDuckDbBytes + estimate.seededDuckDbBytes,
    };
  }, emptyStorageEstimate());

export const getSystemSeedStorageEstimatesByPoolId = (): Record<string, SystemSeedStorageEstimate> =>
  Object.fromEntries(
    SYSTEM_SEED_DATASETS.map((dataset) => [
      dataset.poolId,
      { ...readManifest(dataset).storageEstimate },
    ]),
  );

export const getSystemSeedManifestSummaries = (): Array<
  Pick<
    SystemSeedManifest,
    'version' | 'sourceName' | 'timeZone' | 'baseTimeframe' | 'marketPresetId' | 'assetClass' | 'minTradeStep' | 'selectedSymbolCount' | 'totalRows' | 'droppedRows'
  > & { poolId: string }
> =>
  SYSTEM_SEED_DATASETS.map((dataset) => {
    const manifest = readManifest(dataset);
    return {
      poolId: dataset.poolId,
      version: manifest.version,
      sourceName: manifest.sourceName,
      timeZone: manifest.timeZone,
      baseTimeframe: manifest.baseTimeframe,
      marketPresetId: manifest.marketPresetId,
      assetClass: manifest.assetClass,
      minTradeStep: manifest.minTradeStep,
      selectedSymbolCount: manifest.selectedSymbolCount,
      totalRows: manifest.totalRows,
      droppedRows: [...manifest.droppedRows],
    };
  });

export const getSystemSeedManifestSummary = (): Pick<
  SystemSeedManifest,
  'version' | 'sourceName' | 'timeZone' | 'baseTimeframe' | 'marketPresetId' | 'assetClass' | 'minTradeStep' | 'selectedSymbolCount' | 'totalRows' | 'droppedRows'
> => {
  const manifest = readManifest(SYSTEM_SEED_DATASETS[0]);
  return {
    version: manifest.version,
    sourceName: manifest.sourceName,
    timeZone: manifest.timeZone,
    baseTimeframe: manifest.baseTimeframe,
    marketPresetId: manifest.marketPresetId,
    assetClass: manifest.assetClass,
    minTradeStep: manifest.minTradeStep,
    selectedSymbolCount: manifest.selectedSymbolCount,
    totalRows: manifest.totalRows,
    droppedRows: [...manifest.droppedRows],
  };
};
