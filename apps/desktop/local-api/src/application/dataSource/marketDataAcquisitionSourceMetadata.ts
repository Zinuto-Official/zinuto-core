// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs/promises';
import type { Stats } from 'node:fs';
import path from 'node:path';

import { isValidTimeZone } from '@zinuto/shared/timezone';

const SOURCE_NOTICE_FILE_NAME = 'SOURCE.md';
const SOURCE_NOTICE_MAX_BYTES = 64 * 1024;
const SOURCE_METADATA_PREFIX = '<!-- zinuto-market-data-acquisition:';
const SOURCE_METADATA_SUFFIX = ' -->';
const SOURCE_SYMBOL_LIMIT = 20;

type LegacyMarketDataAcquisitionSourceMetadata = {
  connectorId: 'akshare' | 'ccxt';
  adjustment: 'none' | 'qfq' | 'hfq' | null;
  sourceSymbols: string[];
  importSymbols: string[];
} & (
  | {
      schemaVersion: 1;
    }
  | {
      schemaVersion: 2;
      timeframe: '1m' | '5m' | '1h' | '1d';
    }
);

export type MarketDataAcquisitionSourceAttempt = {
  providerId: 'akshare' | 'ccxt' | 'financedatareader';
  providerVersion: string;
  upstreamId: string;
  status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  errorCode: string | null;
};

export type MarketDataAcquisitionSourceMetadataV3 = {
  schemaVersion: 3;
  connectorId: 'akshare' | 'ccxt' | 'financedatareader' | 'mixed';
  adjustment: 'none' | 'qfq' | 'hfq' | null;
  sourceSymbols: string[];
  importSymbols: string[];
  timeframe: '1m' | '5m' | '1h' | '1d';
  marketId: string;
  timeZone: string;
  sources: Array<{
    sourceSymbol: string;
    importSymbol: string;
    finalSource: MarketDataAcquisitionSourceAttempt;
    attempts: MarketDataAcquisitionSourceAttempt[];
  }>;
};

export type MarketDataAcquisitionSourceMetadata =
  | LegacyMarketDataAcquisitionSourceMetadata
  | MarketDataAcquisitionSourceMetadataV3;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
};

const parseSymbolList = (value: unknown): string[] | null => {
  if (!Array.isArray(value) || value.length === 0 || value.length > SOURCE_SYMBOL_LIMIT) {
    return null;
  }
  const symbols = value.map((item) => typeof item === 'string' ? item : '');
  if (
    symbols.some((symbol) => symbol.length === 0 || symbol.length > 64 || symbol.trim() !== symbol) ||
    new Set(symbols).size !== symbols.length
  ) {
    return null;
  }
  return symbols;
};

const isTimeframe = (value: unknown): value is '1m' | '5m' | '1h' | '1d' =>
  value === '1m' || value === '5m' || value === '1h' || value === '1d';

const parseSourceAttempt = (
  value: unknown,
): MarketDataAcquisitionSourceAttempt | null => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'providerId',
      'providerVersion',
      'upstreamId',
      'status',
      'errorCode',
    ]) ||
    (value.providerId !== 'akshare' &&
      value.providerId !== 'ccxt' &&
      value.providerId !== 'financedatareader') ||
    typeof value.providerVersion !== 'string' ||
    value.providerVersion.length === 0 ||
    value.providerVersion.length > 64 ||
    value.providerVersion.trim() !== value.providerVersion ||
    typeof value.upstreamId !== 'string' ||
    !/^[A-Za-z0-9._-]{1,128}$/u.test(value.upstreamId) ||
    (value.status !== 'SUCCEEDED' &&
      value.status !== 'FAILED' &&
      value.status !== 'SKIPPED') ||
    (value.errorCode !== null &&
      (typeof value.errorCode !== 'string' ||
        !/^[A-Za-z0-9._-]{1,128}$/u.test(value.errorCode)))
  ) {
    return null;
  }
  if (
    (value.status === 'SUCCEEDED' && value.errorCode !== null) ||
    (value.status !== 'SUCCEEDED' && value.errorCode === null)
  ) {
    return null;
  }
  return {
    providerId: value.providerId,
    providerVersion: value.providerVersion,
    upstreamId: value.upstreamId,
    status: value.status,
    errorCode: value.errorCode,
  };
};

const parseV3Metadata = (
  value: Record<string, unknown>,
): MarketDataAcquisitionSourceMetadataV3 | null => {
  if (
    !hasExactKeys(value, [
      'schemaVersion',
      'connectorId',
      'adjustment',
      'sourceSymbols',
      'importSymbols',
      'timeframe',
      'marketId',
      'timeZone',
      'sources',
    ]) ||
    (value.connectorId !== 'akshare' &&
      value.connectorId !== 'ccxt' &&
      value.connectorId !== 'financedatareader' &&
      value.connectorId !== 'mixed') ||
    (value.adjustment !== null &&
      value.adjustment !== 'none' &&
      value.adjustment !== 'qfq' &&
      value.adjustment !== 'hfq') ||
    !isTimeframe(value.timeframe) ||
    typeof value.marketId !== 'string' ||
    !/^[A-Z_]{2,64}$/u.test(value.marketId) ||
    typeof value.timeZone !== 'string' ||
    value.timeZone.length === 0 ||
    value.timeZone.length > 64 ||
    value.timeZone.trim() !== value.timeZone ||
    !isValidTimeZone(value.timeZone)
  ) {
    return null;
  }
  const sourceSymbols = parseSymbolList(value.sourceSymbols);
  const importSymbols = parseSymbolList(value.importSymbols);
  if (!sourceSymbols || !importSymbols || sourceSymbols.length !== importSymbols.length) {
    return null;
  }
  if (
    sourceSymbols.some((symbol) => !/^[A-Za-z0-9._^=/:-]{1,64}$/u.test(symbol)) ||
    importSymbols.some((symbol) => !/^[A-Z0-9._-]{1,64}$/u.test(symbol)) ||
    !Array.isArray(value.sources) ||
    value.sources.length !== sourceSymbols.length
  ) {
    return null;
  }
  const sources = value.sources.map((entry) => {
    if (
      !isRecord(entry) ||
      !hasExactKeys(entry, [
        'sourceSymbol',
        'importSymbol',
        'finalSource',
        'attempts',
      ]) ||
      typeof entry.sourceSymbol !== 'string' ||
      typeof entry.importSymbol !== 'string' ||
      !Array.isArray(entry.attempts) ||
      entry.attempts.length === 0 ||
      entry.attempts.length > 3
    ) {
      return null;
    }
    const finalSource = parseSourceAttempt(entry.finalSource);
    const attempts = entry.attempts.map(parseSourceAttempt);
    if (
      !finalSource ||
      finalSource.status !== 'SUCCEEDED' ||
      attempts.some((attempt) => !attempt) ||
      !attempts.some(
        (attempt) =>
          attempt!.providerId === finalSource.providerId &&
          attempt!.providerVersion === finalSource.providerVersion &&
          attempt!.upstreamId === finalSource.upstreamId &&
          attempt!.status === 'SUCCEEDED',
      )
    ) {
      return null;
    }
    return {
      sourceSymbol: entry.sourceSymbol,
      importSymbol: entry.importSymbol,
      finalSource,
      attempts: attempts as MarketDataAcquisitionSourceAttempt[],
    };
  });
  if (
    sources.some((entry) => !entry) ||
    sources.some(
      (entry, index) =>
        entry!.sourceSymbol !== sourceSymbols[index] ||
        entry!.importSymbol !== importSymbols[index],
    )
  ) {
    return null;
  }
  const finalConnectorIds = new Set(
    sources.map((entry) => entry!.finalSource.providerId),
  );
  if (
    (value.connectorId === 'mixed' && finalConnectorIds.size < 2) ||
    (value.connectorId !== 'mixed' &&
      (finalConnectorIds.size !== 1 || !finalConnectorIds.has(value.connectorId)))
  ) {
    return null;
  }
  return {
    schemaVersion: 3,
    connectorId: value.connectorId,
    adjustment: value.adjustment,
    sourceSymbols,
    importSymbols,
    timeframe: value.timeframe,
    marketId: value.marketId,
    timeZone: value.timeZone,
    sources: sources as MarketDataAcquisitionSourceMetadataV3['sources'],
  };
};

export const parseMarketDataAcquisitionSourceMetadata = (
  value: unknown,
): MarketDataAcquisitionSourceMetadata | null => {
  const schemaVersion = isRecord(value) ? value.schemaVersion : null;
  if (isRecord(value) && schemaVersion === 3) {
    return parseV3Metadata(value);
  }
  const expectedKeys = schemaVersion === 2
    ? [
        'schemaVersion',
        'connectorId',
        'adjustment',
        'sourceSymbols',
        'importSymbols',
        'timeframe',
      ]
    : [
        'schemaVersion',
        'connectorId',
        'adjustment',
        'sourceSymbols',
        'importSymbols',
      ];
  if (
    !isRecord(value) ||
    (schemaVersion !== 1 && schemaVersion !== 2) ||
    !hasExactKeys(value, expectedKeys) ||
    (value.connectorId !== 'akshare' && value.connectorId !== 'ccxt')
  ) {
    return null;
  }
  const sourceSymbols = parseSymbolList(value.sourceSymbols);
  const importSymbols = parseSymbolList(value.importSymbols);
  if (!sourceSymbols || !importSymbols || sourceSymbols.length !== importSymbols.length) {
    return null;
  }
  let adjustment: LegacyMarketDataAcquisitionSourceMetadata['adjustment'];
  if (value.connectorId === 'akshare') {
    if (
      value.adjustment !== 'none' &&
      value.adjustment !== 'qfq' &&
      value.adjustment !== 'hfq'
    ) {
      return null;
    }
    adjustment = value.adjustment;
  } else {
    if (value.adjustment !== null) {
      return null;
    }
    adjustment = null;
  }
  const sourcePattern = value.connectorId === 'akshare'
    ? /^(?:[0-9]{6}|INDEX-[0-9]{6})$/u
    : /^[A-Z0-9._-]+\/[A-Z0-9._-]+$/u;
  if (
    sourceSymbols.some((symbol) => !sourcePattern.test(symbol)) ||
    importSymbols.some((symbol, index) =>
      !/^[A-Z0-9._-]{1,64}$/u.test(symbol) ||
      symbol !== sourceSymbols[index]!.replace('/', '-'))
  ) {
    return null;
  }
  const connectorId = value.connectorId === 'akshare' ? 'akshare' : 'ccxt';
  const common: {
    connectorId: 'akshare' | 'ccxt';
    adjustment: 'none' | 'qfq' | 'hfq' | null;
    sourceSymbols: string[];
    importSymbols: string[];
  } = {
    connectorId,
    adjustment,
    sourceSymbols,
    importSymbols,
  };
  if (schemaVersion === 2) {
    if (
      value.timeframe !== '1m' &&
      value.timeframe !== '5m' &&
      value.timeframe !== '1h' &&
      value.timeframe !== '1d'
    ) {
      return null;
    }
    return {
      schemaVersion: 2,
      ...common,
      timeframe: value.timeframe,
    };
  }
  return {
    schemaVersion: 1,
    ...common,
  };
};

export const serializeMarketDataAcquisitionSourceMetadata = (
  metadata: MarketDataAcquisitionSourceMetadata,
): string => {
  const parsed = parseMarketDataAcquisitionSourceMetadata(metadata);
  if (!parsed) {
    throw new Error('MARKET_DATA_ACQUISITION_SOURCE_METADATA_INVALID');
  }
  return `${SOURCE_METADATA_PREFIX}${JSON.stringify(parsed)}${SOURCE_METADATA_SUFFIX}`;
};

const sameFileSnapshot = (
  left: Stats,
  right: Stats,
): boolean =>
  left.isFile() &&
  right.isFile() &&
  !right.isSymbolicLink() &&
  left.size === right.size &&
  left.dev === right.dev &&
  left.ino === right.ino;

export const readMarketDataAcquisitionSourceMetadata = async (
  folderPath: string,
): Promise<MarketDataAcquisitionSourceMetadata | null> => {
  const sourcePath = path.join(folderPath, SOURCE_NOTICE_FILE_NAME);
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    const linkStat = await fs.lstat(sourcePath);
    if (
      linkStat.isSymbolicLink() ||
      !linkStat.isFile() ||
      linkStat.size <= 0 ||
      linkStat.size > SOURCE_NOTICE_MAX_BYTES
    ) {
      return null;
    }
    handle = await fs.open(sourcePath, 'r');
    const openedStat = await handle.stat();
    const currentLinkStat = await fs.lstat(sourcePath);
    if (
      !sameFileSnapshot(openedStat, currentLinkStat) ||
      openedStat.size <= 0 ||
      openedStat.size > SOURCE_NOTICE_MAX_BYTES
    ) {
      return null;
    }
    const buffer = Buffer.alloc(openedStat.size);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const finalStat = await handle.stat();
    if (bytesRead !== buffer.length || !sameFileSnapshot(finalStat, currentLinkStat)) {
      return null;
    }
    const metadataLines = buffer
      .toString('utf8')
      .split(/\r?\n/u)
      .filter((line) =>
        line.startsWith(SOURCE_METADATA_PREFIX) && line.endsWith(SOURCE_METADATA_SUFFIX));
    if (metadataLines.length !== 1) {
      return null;
    }
    const line = metadataLines[0]!;
    const json = line.slice(SOURCE_METADATA_PREFIX.length, -SOURCE_METADATA_SUFFIX.length);
    return parseMarketDataAcquisitionSourceMetadata(JSON.parse(json));
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => undefined);
  }
};
