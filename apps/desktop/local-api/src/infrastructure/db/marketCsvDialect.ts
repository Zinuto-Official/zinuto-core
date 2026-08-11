// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs/promises';

import { quoteDuckLiteral } from './marketCsvImportSql.js';

export type MarketCsvDialect = {
  delimiter: ',' | ';' | '\t' | '|';
  encoding: 'utf-8' | 'utf-16';
};

const HEADER_PREFIX_BYTES = 256 * 1024;
const DELIMITER_CANDIDATES = [',', ';', '\t', '|'] as const;

const decodeHeaderPrefix = (buffer: Buffer): { text: string; encoding: MarketCsvDialect['encoding'] } => {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return {
      text: new TextDecoder('utf-16le', { fatal: true }).decode(buffer, { stream: true }),
      encoding: 'utf-16',
    };
  }
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    return {
      text: new TextDecoder('utf-16be', { fatal: true }).decode(buffer, { stream: true }),
      encoding: 'utf-16',
    };
  }
  return {
    text: new TextDecoder('utf-8', { fatal: true }).decode(buffer, { stream: true }),
    encoding: 'utf-8',
  };
};

const countDelimitedCells = (line: string, delimiter: string): number => {
  let count = 1;
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      count += 1;
    }
  }
  if (inQuotes) {
    const error = new Error('CSV_HEADER_READ_FAILED');
    Object.assign(error, { code: 'CSV_HEADER_READ_FAILED' });
    throw error;
  }
  return count;
};

export const detectMarketCsvDialect = async (filePath: string): Promise<MarketCsvDialect> => {
  const handle = await fs.open(filePath, 'r');
  let prefix: Buffer;
  try {
    prefix = Buffer.alloc(HEADER_PREFIX_BYTES);
    const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
    prefix = prefix.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
  let decoded: { text: string; encoding: MarketCsvDialect['encoding'] };
  try {
    decoded = decodeHeaderPrefix(prefix);
  } catch {
    const error = new Error('CSV_ENCODING_UNSUPPORTED');
    Object.assign(error, { code: 'CSV_ENCODING_UNSUPPORTED' });
    throw error;
  }
  const header = decoded.text
    .replace(/^\uFEFF/u, '')
    .split(/\r\n|\n|\r/u)
    .map((line) => line.trim())
    .find(Boolean);
  if (!header) {
    const error = new Error('CSV_HEADER_READ_FAILED');
    Object.assign(error, { code: 'CSV_HEADER_READ_FAILED' });
    throw error;
  }
  const delimiter = DELIMITER_CANDIDATES
    .map((candidate, index) => ({
      candidate,
      count: countDelimitedCells(header, candidate),
      index,
    }))
    .sort((left, right) => right.count - left.count || left.index - right.index)[0]
    ?.candidate ?? ',';
  return { delimiter, encoding: decoded.encoding };
};

export const buildMarketCsvReadOptionsSql = (dialect: MarketCsvDialect): string =>
  [
    `delim = ${quoteDuckLiteral(dialect.delimiter)}`,
    `quote = ${quoteDuckLiteral('"')}`,
    `escape = ${quoteDuckLiteral('"')}`,
    `encoding = ${quoteDuckLiteral(dialect.encoding)}`,
    'header = true',
    'all_varchar = true',
    'ignore_errors = false',
    'strict_mode = true',
  ].join(',\n    ');

export const detectCommonMarketCsvDialect = async (
  filePaths: string[],
): Promise<MarketCsvDialect> => {
  const dialects = await Promise.all(filePaths.map(detectMarketCsvDialect));
  const [first] = dialects;
  if (!first) {
    return { delimiter: ',', encoding: 'utf-8' };
  }
  if (dialects.some((dialect) =>
    dialect.delimiter !== first.delimiter || dialect.encoding !== first.encoding)) {
    const error = new Error('CSV_DIALECT_MISMATCH');
    Object.assign(error, { code: 'CSV_DIALECT_MISMATCH' });
    throw error;
  }
  return first;
};
