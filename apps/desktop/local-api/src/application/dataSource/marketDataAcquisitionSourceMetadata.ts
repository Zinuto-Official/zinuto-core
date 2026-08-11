// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs/promises';
import type { Stats } from 'node:fs';
import path from 'node:path';

const SOURCE_NOTICE_FILE_NAME = 'SOURCE.md';
const SOURCE_NOTICE_MAX_BYTES = 64 * 1024;
const SOURCE_METADATA_PREFIX = '<!-- zinuto-market-data-acquisition:';
const SOURCE_METADATA_SUFFIX = ' -->';
const SOURCE_SYMBOL_LIMIT = 20;

export type MarketDataAcquisitionSourceMetadata = {
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

export const parseMarketDataAcquisitionSourceMetadata = (
  value: unknown,
): MarketDataAcquisitionSourceMetadata | null => {
  const schemaVersion = isRecord(value) ? value.schemaVersion : null;
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
  let adjustment: MarketDataAcquisitionSourceMetadata['adjustment'];
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
