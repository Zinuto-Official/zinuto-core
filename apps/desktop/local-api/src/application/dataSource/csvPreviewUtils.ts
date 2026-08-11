// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Transform, type Readable } from 'node:stream';
import { IMPORT_LIMITS, INPUT_ARRAY_LIMITS, INPUT_LIMITS } from '@zinuto/shared/input-limits';
import { composeCsvTimestampText, parseCsvTimestampValue } from '@zinuto/shared/csv';
import { detectBaseTimeframeFromTimestamps as detectBaseTimeframeFromTimestampsShared } from '@zinuto/shared/timeframe';
import { normalizeImportHeader } from '@zinuto/shared/importRules';
import type { CsvFieldMapping } from '../../domain/dataSource/csvFieldMappingTypes.js';
import type { SupportedBaseTimeframe } from './supportedFileFormats.js';

export { composeCsvTimestampText, parseCsvTimestampValue };

type CreateAppError = (code: string, args?: Record<string, string | number | boolean | null>) => Error;
export type CsvTimestampSample = {
  raw: string;
  parsedMs: number;
};

const CSV_HEADER_SAMPLE_BYTES = 512 * 1024;
const CSV_TIME_SAMPLE_CHUNK_BYTES = 128 * 1024;
const CSV_TIME_SAMPLE_MAX_SEGMENTS = 12;
export const CSV_HEADER_MIN_FIELDS = 5;
export const CSV_PREVIEW_MAX_SAMPLED_FILES = 2;

export const normalizeCsvHeader = normalizeImportHeader;

const createDefaultLimitError: CreateAppError = (code, args) => {
  const error = new Error(code);
  Object.assign(error, { code, args });
  return error;
};

const assertImportTextLimit = (
  value: string,
  limit: string,
  max: number,
  createError: CreateAppError = createDefaultLimitError,
): void => {
  if (value.length <= max) {
    return;
  }
  throw createError('LOCAL_DATA_IMPORT_LIMIT_EXCEEDED', { limit, max });
};

const assertImportColumnCount = (
  count: number,
  createError: CreateAppError = createDefaultLimitError,
): void => {
  if (count <= INPUT_ARRAY_LIMITS.importColumns) {
    return;
  }
  throw createError('LOCAL_DATA_IMPORT_LIMIT_EXCEEDED', {
    limit: 'columns',
    max: INPUT_ARRAY_LIMITS.importColumns,
  });
};

const parseCsvHeaderLine = (
  line: string,
  delimiter: string,
  createError: CreateAppError = createDefaultLimitError,
): string[] => {
  assertImportTextLimit(line, 'csvRowChars', IMPORT_LIMITS.maxRowChars, createError);
  const cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cell += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && char === delimiter) {
      assertImportTextLimit(cell, 'csvCellChars', INPUT_LIMITS.importCellChars, createError);
      cells.push(cell.replace(/^\uFEFF/, '').trim());
      cell = '';
      continue;
    }
    cell += char;
  }
  if (inQuotes) {
    throw createError('CSV_HEADER_READ_FAILED');
  }
  assertImportTextLimit(cell, 'csvCellChars', INPUT_LIMITS.importCellChars, createError);
  cells.push(cell.replace(/^\uFEFF/, '').trim());
  assertImportColumnCount(cells.length, createError);
  return cells;
};

const detectCsvDelimiter = (line: string): string => {
  const candidates = [',', ';', '\t', '|'];
  let bestDelimiter = ',';
  let bestCount = -1;
  candidates.forEach((delimiter) => {
    const parsed = parseCsvHeaderLine(line, delimiter);
    if (parsed.length > bestCount) {
      bestCount = parsed.length;
      bestDelimiter = delimiter;
    }
  });
  return bestDelimiter;
};

const readFileChunkText = async (
  filePath: string,
  byteLength: number,
  startByte = 0,
): Promise<string> => {
  const handle = await fs.open(filePath, 'r');
  try {
    const signature = Buffer.alloc(3);
    const { bytesRead: signatureBytesRead } = await handle.read(signature, 0, signature.length, 0);
    const hasUtf16LeBom = signatureBytesRead >= 2 && signature[0] === 0xff && signature[1] === 0xfe;
    const hasUtf16BeBom = signatureBytesRead >= 2 && signature[0] === 0xfe && signature[1] === 0xff;
    const resolvedStartByte = hasUtf16LeBom || hasUtf16BeBom
      ? Math.max(0, Math.floor(startByte / 2) * 2)
      : Math.max(0, Math.floor(startByte));
    const buffer = Buffer.alloc(Math.max(1024, Math.floor(byteLength)));
    const { bytesRead } = await handle.read(
      buffer,
      0,
      buffer.length,
      resolvedStartByte,
    );
    if (!bytesRead) {
      return '';
    }
    const decoder = new TextDecoder(
      hasUtf16LeBom ? 'utf-16le' : hasUtf16BeBom ? 'utf-16be' : 'utf-8',
      { fatal: resolvedStartByte === 0 },
    );
    try {
      return decoder.decode(buffer.subarray(0, bytesRead), { stream: true });
    } catch {
      const error = new Error('CSV_ENCODING_UNSUPPORTED');
      Object.assign(error, { code: 'CSV_ENCODING_UNSUPPORTED' });
      throw error;
    }
  } finally {
    await handle.close();
  }
};

export const createCsvDecodedTextStreamFromPath = async (
  filePath: string,
): Promise<Readable> => {
  const handle = await fs.open(filePath, 'r');
  const signature = Buffer.alloc(3);
  let bytesRead = 0;
  try {
    ({ bytesRead } = await handle.read(signature, 0, signature.length, 0));
  } finally {
    await handle.close();
  }
  const decoder = new TextDecoder(
    bytesRead >= 2 && signature[0] === 0xff && signature[1] === 0xfe
      ? 'utf-16le'
      : bytesRead >= 2 && signature[0] === 0xfe && signature[1] === 0xff
        ? 'utf-16be'
        : 'utf-8',
    { fatal: true },
  );
  const decodeTransform = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      try {
        callback(null, decoder.decode(chunk, { stream: true }));
      } catch {
        const error = new Error('CSV_ENCODING_UNSUPPORTED');
        Object.assign(error, { code: 'CSV_ENCODING_UNSUPPORTED' });
        callback(error);
      }
    },
    flush(callback) {
      try {
        callback(null, decoder.decode());
      } catch {
        const error = new Error('CSV_ENCODING_UNSUPPORTED');
        Object.assign(error, { code: 'CSV_ENCODING_UNSUPPORTED' });
        callback(error);
      }
    },
  });
  return createReadStream(filePath).pipe(decodeTransform);
};

export const readCsvHeadersFromPath = async (filePath: string, createError: CreateAppError): Promise<string[]> => {
  const chunk = await readFileChunkText(filePath, CSV_HEADER_SAMPLE_BYTES);
  const lines = chunk
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (!lines.length) {
    throw createError('CSV_HEADER_READ_FAILED', { filePath });
  }
  assertImportTextLimit(lines[0], 'csvHeaderRowChars', IMPORT_LIMITS.maxRowChars, createError);
  const delimiter = detectCsvDelimiter(lines[0]);
  const headers = parseCsvHeaderLine(lines[0], delimiter, createError)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (!headers.length) {
    throw createError('CSV_HEADER_READ_FAILED', { filePath });
  }
  assertImportColumnCount(headers.length, createError);
  headers.forEach((header) => {
    assertImportTextLimit(header, 'csvHeaderChars', INPUT_LIMITS.csvHeaderChars, createError);
  });
  return headers;
};

const buildDistributedCsvSampleOffsets = (
  fileSize: number,
  chunkBytes: number,
  maxSegments: number,
): number[] => {
  const normalizedFileSize = Math.max(0, Math.floor(Number(fileSize) || 0));
  const normalizedChunkBytes = Math.max(1024, Math.floor(Number(chunkBytes) || 0));
  if (normalizedFileSize <= normalizedChunkBytes) {
    return [0];
  }
  const maxOffset = Math.max(0, normalizedFileSize - normalizedChunkBytes);
  const segmentCount = Math.max(2, Math.min(maxSegments, Math.ceil(normalizedFileSize / normalizedChunkBytes)));
  const offsets = new Set<number>([0, maxOffset]);
  for (let index = 1; index < segmentCount - 1; index += 1) {
    offsets.add(Math.floor((maxOffset * index) / (segmentCount - 1)));
  }
  return Array.from(offsets).sort((left, right) => left - right);
};

const extractCsvSampleLinesFromChunk = (
  chunk: string,
  offset: number,
  chunkBytes: number,
  fileSize: number,
): string[] => {
  const lines = chunk
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/u)
    .map((line) => line.trim());
  if (offset > 0) {
    lines.shift();
  }
  if (offset + chunkBytes < fileSize) {
    lines.pop();
  }
  return lines.filter((line) => line.length > 0);
};

export const readCsvTimestampSamplesFromPath = async (
  filePath: string,
  mapping: Pick<CsvFieldMapping, 'timestampMode' | 'date' | 'time'>,
  maxRows = 96,
  timeZone?: string
): Promise<CsvTimestampSample[]> => {
  const maxSampleRows = Math.max(0, Math.floor(Number(maxRows) || 0));
  if (maxSampleRows <= 0) {
    return [];
  }
  const stat = await fs.stat(filePath);
  const fileSize = Math.max(0, Math.floor(Number(stat.size) || 0));
  const headerChunk = await readFileChunkText(filePath, CSV_HEADER_SAMPLE_BYTES);
  const headerLines = headerChunk
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (headerLines.length <= 1) {
    return [];
  }
  const delimiter = detectCsvDelimiter(headerLines[0]);
  const headers = parseCsvHeaderLine(headerLines[0], delimiter).map((item) => item.trim());
  const normalizedDateHeader = normalizeCsvHeader(mapping.date);
  const dateHeaderIndex = headers.findIndex((header) => normalizeCsvHeader(header) === normalizedDateHeader);
  if (dateHeaderIndex < 0) {
    return [];
  }
  const usesSplitMode = mapping.timestampMode === 'SPLIT';
  const normalizedTimeHeader = normalizeCsvHeader(mapping.time);
  const timeHeaderIndex = usesSplitMode
    ? headers.findIndex((header) => normalizeCsvHeader(header) === normalizedTimeHeader)
    : -1;
  if (usesSplitMode && timeHeaderIndex < 0) {
    return [];
  }

  const offsets = buildDistributedCsvSampleOffsets(
    fileSize,
    CSV_TIME_SAMPLE_CHUNK_BYTES,
    CSV_TIME_SAMPLE_MAX_SEGMENTS,
  );
  const linesByChunk = await Promise.all(
    offsets.map(async (offset) => {
      const chunk = await readFileChunkText(filePath, CSV_TIME_SAMPLE_CHUNK_BYTES, offset);
      const lines = extractCsvSampleLinesFromChunk(
        chunk,
        offset,
        CSV_TIME_SAMPLE_CHUNK_BYTES,
        fileSize,
      );
      return offset === 0 ? lines.slice(1) : lines;
    }),
  );
  const samples: CsvTimestampSample[] = [];
  const seenLines = new Set<string>();
  const addSamples = (perChunkLimit: number): void => {
    for (const lines of linesByChunk) {
      let chunkSamples = 0;
      for (const line of lines) {
        if (samples.length >= maxSampleRows) {
          return;
        }
        if (chunkSamples >= perChunkLimit) {
          break;
        }
        if (seenLines.has(line)) {
          continue;
        }
        seenLines.add(line);
        assertImportTextLimit(line, 'csvRowChars', IMPORT_LIMITS.maxRowChars);
        const row = parseCsvHeaderLine(line, delimiter);
        const dateRaw = String(row[dateHeaderIndex] ?? '').trim();
        const timeRaw = usesSplitMode ? String(row[timeHeaderIndex] ?? '').trim() : '';
        const rawValue = composeCsvTimestampText(dateRaw, timeRaw, usesSplitMode ? 'SPLIT' : 'SINGLE');
        if (!rawValue) {
          continue;
        }
        const parsed = parseCsvTimestampValue(rawValue, timeZone);
        if (parsed === null) {
          continue;
        }
        samples.push({ raw: rawValue, parsedMs: parsed });
        chunkSamples += 1;
      }
    }
  };

  addSamples(Math.max(1, Math.ceil(maxSampleRows / Math.max(1, linesByChunk.length))));
  if (samples.length < maxSampleRows) {
    addSamples(maxSampleRows);
  }
  return samples;
};

export const readCsvTimeSamplesFromPath = async (
  filePath: string,
  mapping: Pick<CsvFieldMapping, 'timestampMode' | 'date' | 'time'>,
  maxRows = 96,
  timeZone?: string
): Promise<number[]> =>
  (await readCsvTimestampSamplesFromPath(filePath, mapping, maxRows, timeZone)).map(
    (sample) => sample.parsedMs,
  );

export const detectBaseTimeframeFromTimestamps = (timestamps: number[]): SupportedBaseTimeframe | null =>
  detectBaseTimeframeFromTimestampsShared(timestamps) as SupportedBaseTimeframe | null;
