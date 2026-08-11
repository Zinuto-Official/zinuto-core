// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { DuckDBTypeId } from '@duckdb/node-api';
import { IMPORT_LIMITS, INPUT_ARRAY_LIMITS, INPUT_LIMITS } from '@zinuto/shared/input-limits';
import { createInterface } from 'node:readline';
import type { CsvFieldMapping } from '../../domain/dataSource/csvFieldMappingTypes.js';
import {
  composeCsvTimestampText,
  createCsvDecodedTextStreamFromPath,
  detectBaseTimeframeFromTimestamps,
  normalizeCsvHeader,
  parseCsvTimestampValue,
  readCsvHeadersFromPath,
  readCsvTimeSamplesFromPath,
  readCsvTimestampSamplesFromPath,
  type CsvTimestampSample
} from './csvPreviewUtils.js';
import type { SupportedBaseTimeframe, SupportedImportFileFormat } from './supportedFileFormats.js';
import { resolveSupportedImportFileFormat, resolveTimeframeFromPathHints } from './supportedFileFormats.js';
import { withTabularDuckDbConnection } from './tabularDuckDbRuntime.js';

type CreateAppError = (code: string, args?: Record<string, string | number | boolean | null>) => Error;

type TabularRowsResult = {
  headers: string[];
  rows: Array<Record<string, unknown>>;
};

type CsvImportColumnMapping = {
  timestampMode: 'SINGLE' | 'SPLIT';
  date: string;
  time: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};

const MAX_PREVIEW_ROWS = 128;
const JSON_NESTED_TYPE_IDS = new Set<DuckDBTypeId>([
  DuckDBTypeId.LIST,
  DuckDBTypeId.STRUCT,
  DuckDBTypeId.MAP,
  DuckDBTypeId.ARRAY,
  DuckDBTypeId.UNION,
]);
const requireFromModule = createRequire(import.meta.url);

const createDefaultAppError: CreateAppError = (code, args) => {
  const error = new Error(code);
  Object.assign(error, { code, args });
  return error;
};

const tabularAbortReason = (signal: AbortSignal): unknown =>
  signal.reason ?? new Error('TABULAR_OPERATION_ABORTED');

const throwIfTabularAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw tabularAbortReason(signal);
  }
};

const throwImportLimitExceeded = (
  limit: string,
  max: number,
  createError: CreateAppError = createDefaultAppError,
): never => {
  throw createError('LOCAL_DATA_IMPORT_LIMIT_EXCEEDED', { limit, max });
};

const assertTextWithinImportLimit = (
  value: string,
  limit: string,
  max: number,
  createError: CreateAppError = createDefaultAppError,
): void => {
  if (value.length > max) {
    throwImportLimitExceeded(limit, max, createError);
  }
};

const assertColumnCountWithinImportLimit = (
  count: number,
  createError: CreateAppError = createDefaultAppError,
): void => {
  if (count > INPUT_ARRAY_LIMITS.importColumns) {
    throwImportLimitExceeded('columns', INPUT_ARRAY_LIMITS.importColumns, createError);
  }
};

const toCellLimitText = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
};

const assertHeadersWithinImportLimit = (
  headers: string[],
  createError: CreateAppError = createDefaultAppError,
): string[] => {
  assertColumnCountWithinImportLimit(headers.length, createError);
  headers.forEach((header) => {
    assertTextWithinImportLimit(header, 'csvHeaderChars', INPUT_LIMITS.csvHeaderChars, createError);
  });
  return headers;
};

const assertRowsWithinImportLimit = (
  result: TabularRowsResult,
  createError: CreateAppError = createDefaultAppError,
): TabularRowsResult => {
  const headers = assertHeadersWithinImportLimit(result.headers, createError);
  result.rows.forEach((row) => {
    assertColumnCountWithinImportLimit(Object.keys(row).length, createError);
    Object.values(row).forEach((value) => {
      assertTextWithinImportLimit(toCellLimitText(value), 'csvCellChars', INPUT_LIMITS.importCellChars, createError);
    });
  });
  return { headers, rows: result.rows };
};

const assertFileWithinImportLimit = async (
  filePath: string,
  createError?: CreateAppError,
  maxBytes = IMPORT_LIMITS.maxSingleFileBytes,
  limit = 'singleFileBytes',
): Promise<void> => {
  const stat = await fs.stat(filePath);
  if (stat.size > maxBytes) {
    throwImportLimitExceeded(limit, maxBytes, createError);
  }
};

type XlsxSheet = {
  sheet: string;
  data: unknown[][];
};

type ReadExcelFileNode = (filePath: string) => Promise<XlsxSheet[]>;

type ReadExcelFileNodeModule = ReadExcelFileNode & {
  default?: ReadExcelFileNode;
};

type XlsxZipEntry = AsyncIterable<unknown> & {
  path?: unknown;
  type?: unknown;
  autodrain?: () => { resume?: () => void };
};

type UnzipperModule = {
  Parse: (options?: Record<string, unknown>) => AsyncIterable<XlsxZipEntry> & {
    destroy?: (error?: Error) => void;
  };
};

const readExcelFileNode = requireFromModule('read-excel-file/node') as ReadExcelFileNodeModule;
const readAllExcelSheets = readExcelFileNode.default ?? readExcelFileNode;
const unzipper = requireFromModule('unzipper') as UnzipperModule;

const resolveChunkByteLength = (chunk: unknown): number => {
  if (typeof chunk === 'string') {
    return Buffer.byteLength(chunk);
  }
  if (chunk instanceof Uint8Array) {
    return chunk.byteLength;
  }
  if (chunk instanceof ArrayBuffer) {
    return chunk.byteLength;
  }
  return Buffer.byteLength(String(chunk ?? ''));
};

const assertXlsxInflatedSizeWithinImportLimit = async (
  filePath: string,
  createError: CreateAppError = createDefaultAppError,
  signal?: AbortSignal,
): Promise<void> => {
  throwIfTabularAborted(signal);
  const input = createReadStream(filePath);
  const archive = input.pipe(
    unzipper.Parse({ forceStream: true }) as unknown as NodeJS.WritableStream,
  ) as unknown as AsyncIterable<XlsxZipEntry> & { destroy?: (error?: Error) => void };
  const abort = (): void => {
    const reason = tabularAbortReason(signal!);
    const error = reason instanceof Error ? reason : new Error(String(reason));
    input.destroy(error);
    archive.destroy?.(error);
  };
  signal?.addEventListener('abort', abort, { once: true });
  let totalInflatedBytes = 0;
  try {
    for await (const entry of archive) {
      throwIfTabularAborted(signal);
      let entryInflatedBytes = 0;
      for await (const chunk of entry) {
        throwIfTabularAborted(signal);
        const chunkBytes = resolveChunkByteLength(chunk);
        entryInflatedBytes += chunkBytes;
        totalInflatedBytes += chunkBytes;
        if (
          entryInflatedBytes > IMPORT_LIMITS.maxInMemoryTabularFileBytes ||
          totalInflatedBytes > IMPORT_LIMITS.maxInMemoryTabularFileBytes
        ) {
          archive.destroy?.();
          throwImportLimitExceeded(
            'inMemoryTabularFileBytes',
            IMPORT_LIMITS.maxInMemoryTabularFileBytes,
            createError,
          );
        }
      }
    }
  } catch (error) {
    archive.destroy?.(error instanceof Error ? error : undefined);
    if (signal?.aborted) {
      throw tabularAbortReason(signal);
    }
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    input.destroy();
  }
};

const toHeaderValue = (value: unknown, fallbackIndex: number): string => {
  const text = String(value ?? '').trim();
  return text || `col_${String(fallbackIndex + 1)}`;
};

const normalizeXlsxCellValue = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : '';
  }
  return value;
};

const readXlsxMatrixFromPath = async (filePath: string, signal?: AbortSignal): Promise<unknown[][]> => {
  throwIfTabularAborted(signal);
  const sheets = await readAllExcelSheets(filePath);
  throwIfTabularAborted(signal);
  if (sheets.length > 1) {
    throw new Error('XLSX_MULTIPLE_SHEETS_UNSUPPORTED');
  }
  return sheets[0]?.data ?? [];
};

const readXlsxRowsFromPath = async (
  filePath: string,
  maxRows = MAX_PREVIEW_ROWS,
  createError: CreateAppError = createDefaultAppError,
  signal?: AbortSignal,
): Promise<TabularRowsResult> => {
  const matrix = await readXlsxMatrixFromPath(filePath, signal);
  const headerRow = matrix[0] ?? [];
  if (!headerRow.length) {
    return { headers: [], rows: [] };
  }

  const headerSize = headerRow.length;
  if (headerSize <= 0) {
    return { headers: [], rows: [] };
  }
  assertColumnCountWithinImportLimit(headerSize, createError);

  const headers = assertHeadersWithinImportLimit(
    Array.from({ length: headerSize }, (_, index) =>
      toHeaderValue(normalizeXlsxCellValue(headerRow[index]), index)
    ),
    createError,
  );
  const rows: Array<Record<string, unknown>> = [];
  for (const sourceRow of matrix.slice(1)) {
    throwIfTabularAborted(signal);
    if (rows.length >= maxRows) {
      break;
    }
    if (!sourceRow.some((cellValue) => normalizeXlsxCellValue(cellValue) !== '')) {
      continue;
    }
    const row: Record<string, unknown> = {};
    let hasValue = false;
    headers.forEach((header, headerIndex) => {
      const cellValue = normalizeXlsxCellValue(sourceRow[headerIndex]);
      if (!hasValue && cellValue !== '') {
        hasValue = true;
      }
      row[header] = cellValue;
    });
    if (!hasValue) {
      continue;
    }
    rows.push(row);
  }
  return assertRowsWithinImportLimit({ headers, rows }, createError);
};

const readDuckDbRowsFromPath = async (
  filePath: string,
  fileFormat: 'json' | 'parquet',
  maxRows = MAX_PREVIEW_ROWS,
  createError: CreateAppError = createDefaultAppError,
  signal?: AbortSignal,
): Promise<TabularRowsResult> => {
  throwIfTabularAborted(signal);
  return withTabularDuckDbConnection(async (connection) => {
    const interrupt = (): void => {
      try {
        connection.interrupt();
      } catch {
        // The runtime closes the connection after the interrupted query drains.
      }
    };
    signal?.addEventListener('abort', interrupt, { once: true });
    try {
      throwIfTabularAborted(signal);
      const sourceSql = fileFormat === 'json'
        ? 'read_json_auto($filePath, ignore_errors = false)'
        : 'read_parquet($filePath)';
      const result = await connection.run(
        `SELECT * FROM ${sourceSql} LIMIT $maxRows`,
        {
          filePath,
          maxRows: Math.max(0, Math.floor(Number(maxRows) || 0)),
        },
      );
      if (
        fileFormat === 'json' &&
        result.columnCount > 0 &&
        Array.from(
          { length: result.columnCount },
          (_, columnIndex) => result.columnTypeId(columnIndex),
        ).every((typeId) => JSON_NESTED_TYPE_IDS.has(typeId))
      ) {
        throw new Error('JSON_NESTED_TABULAR_SHAPE_UNSUPPORTED');
      }
      const headers = result
        .columnNames()
        .map((header, index) => toHeaderValue(header, index));
      const rows = (await result.getRowsJS()).map((values) =>
        Object.fromEntries(
          headers.map((header, index) => [header, values[index]]),
        ),
      );
      throwIfTabularAborted(signal);
      return assertRowsWithinImportLimit({ headers, rows }, createError);
    } catch (error) {
      if (signal?.aborted) {
        throw tabularAbortReason(signal);
      }
      throw error;
    } finally {
      signal?.removeEventListener('abort', interrupt);
    }
  });
};

const readNonCsvRowsFromPath = async (
  filePath: string,
  fileFormat: Exclude<SupportedImportFileFormat, 'csv'>,
  maxRows = MAX_PREVIEW_ROWS,
  createError: CreateAppError = createDefaultAppError,
  signal?: AbortSignal,
): Promise<TabularRowsResult> => {
  throwIfTabularAborted(signal);
  await assertFileWithinImportLimit(filePath, createError);
  throwIfTabularAborted(signal);
  if (fileFormat === 'xlsx') {
    await assertFileWithinImportLimit(
      filePath,
      createError,
      IMPORT_LIMITS.maxInMemoryTabularFileBytes,
      'inMemoryTabularFileBytes',
    );
    await assertXlsxInflatedSizeWithinImportLimit(filePath, createError, signal);
    return readXlsxRowsFromPath(filePath, maxRows, createError, signal);
  }
  return readDuckDbRowsFromPath(filePath, fileFormat, maxRows, createError, signal);
};

const parseCsvPreviewLine = (
  line: string,
  delimiter: string,
  createError: CreateAppError = createDefaultAppError,
): string[] => {
  assertTextWithinImportLimit(line, 'csvRowChars', IMPORT_LIMITS.maxRowChars, createError);
  const cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        cell += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && char === delimiter) {
      assertTextWithinImportLimit(cell, 'csvCellChars', INPUT_LIMITS.importCellChars, createError);
      cells.push(cell.replace(/^\uFEFF/, '').trim());
      cell = '';
      continue;
    }
    cell += char;
  }
  if (inQuotes) {
    throw createError('CSV_FILE_IMPORT_FAILED', { reason: 'CSV_UNTERMINATED_QUOTE' });
  }
  assertTextWithinImportLimit(cell, 'csvCellChars', INPUT_LIMITS.importCellChars, createError);
  cells.push(cell.replace(/^\uFEFF/, '').trim());
  assertColumnCountWithinImportLimit(cells.length, createError);
  return cells;
};

const detectCsvPreviewDelimiter = (line: string): string => {
  const candidates = [',', ';', '\t', '|'];
  return candidates
    .map((delimiter) => ({
      delimiter,
      count: parseCsvPreviewLine(line, delimiter).length
    }))
    .sort((left, right) => right.count - left.count)[0]?.delimiter ?? ',';
};

const readCsvRowsForPreviewFromPath = async (
  filePath: string,
  maxRows = MAX_PREVIEW_ROWS,
  signal?: AbortSignal,
): Promise<TabularRowsResult> => {
  throwIfTabularAborted(signal);
  await assertFileWithinImportLimit(filePath);
  const stream = await createCsvDecodedTextStreamFromPath(filePath);
  const reader = createInterface({
    input: stream,
    crlfDelay: Infinity
  });
  let headers: string[] = [];
  let delimiter = ',';
  const rows: Array<Record<string, unknown>> = [];
  try {
    for await (const lineRaw of reader) {
      throwIfTabularAborted(signal);
      const line = String(lineRaw || '').trim();
      if (!line) {
        continue;
      }
      if (!headers.length) {
        delimiter = detectCsvPreviewDelimiter(line);
        headers = assertHeadersWithinImportLimit(
          parseCsvPreviewLine(line, delimiter).map((header, index) =>
            toHeaderValue(header, index)
          )
        );
        continue;
      }
      if (rows.length >= maxRows) {
        break;
      }
      const cells = parseCsvPreviewLine(line, delimiter);
      if (cells.length !== headers.length) {
        throw createDefaultAppError('CSV_FILE_IMPORT_FAILED', {
          reason: 'CSV_COLUMN_COUNT_MISMATCH',
        });
      }
      const row: Record<string, unknown> = {};
      let hasValue = false;
      headers.forEach((header, index) => {
        const value = cells[index] ?? '';
        if (!hasValue && String(value).trim()) {
          hasValue = true;
        }
        row[header] = value;
      });
      if (hasValue) {
        rows.push(row);
      }
    }
  } finally {
    reader.close();
    stream.destroy();
  }
  return assertRowsWithinImportLimit({ headers, rows });
};

export const readTabularPreviewRowsFromPath = async (
  filePath: string,
  maxRows = MAX_PREVIEW_ROWS,
  signal?: AbortSignal,
): Promise<TabularRowsResult> => {
  throwIfTabularAborted(signal);
  const fileFormat = resolveSupportedImportFileFormat(filePath);
  if (!fileFormat) {
    return { headers: [], rows: [] };
  }
  if (fileFormat === 'csv') {
    return readCsvRowsForPreviewFromPath(filePath, maxRows, signal);
  }
  return readNonCsvRowsFromPath(filePath, fileFormat, maxRows, createDefaultAppError, signal);
};

const resolveRowHeaderKey = (headers: string[], targetHeader: string): string | null => {
  const expected = normalizeCsvHeader(targetHeader);
  if (!expected) {
    return null;
  }
  const exact = headers.find((header) => normalizeCsvHeader(header) === expected);
  return exact ?? null;
};

const readNonCsvTimestampSamplesFromPath = async (
  filePath: string,
  fileFormat: Exclude<SupportedImportFileFormat, 'csv'>,
  mapping: Pick<CsvFieldMapping, 'timestampMode' | 'date' | 'time'>,
  maxRows = 96,
  timeZone?: string,
  signal?: AbortSignal,
): Promise<CsvTimestampSample[]> => {
  throwIfTabularAborted(signal);
  const { headers, rows } = await readNonCsvRowsFromPath(
    filePath,
    fileFormat,
    Math.max(maxRows, 32),
    createDefaultAppError,
    signal,
  );
  const resolvedDateHeader = resolveRowHeaderKey(headers, mapping.date);
  if (!resolvedDateHeader) {
    return [];
  }
  const usesSplitMode = mapping.timestampMode === 'SPLIT';
  const resolvedTimeHeader = usesSplitMode ? resolveRowHeaderKey(headers, mapping.time) : null;
  if (usesSplitMode && !resolvedTimeHeader) {
    return [];
  }
  const samples: CsvTimestampSample[] = [];
  for (let rowIndex = 0; rowIndex < rows.length && samples.length < maxRows; rowIndex += 1) {
    throwIfTabularAborted(signal);
    const row = rows[rowIndex];
    const dateRaw = String(row[resolvedDateHeader] ?? '');
    const timeRaw = usesSplitMode && resolvedTimeHeader ? String(row[resolvedTimeHeader] ?? '') : '';
    const raw = composeCsvTimestampText(dateRaw, timeRaw, usesSplitMode ? 'SPLIT' : 'SINGLE');
    const parsed = parseCsvTimestampValue(raw, timeZone);
    if (parsed === null) {
      continue;
    }
    samples.push({ raw, parsedMs: parsed });
  }
  return samples;
};

export const readTabularHeadersFromPath = async (
  filePath: string,
  createError: CreateAppError,
  signal?: AbortSignal,
): Promise<{ headers: string[]; fileFormat: SupportedImportFileFormat }> => {
  throwIfTabularAborted(signal);
  const fileFormat = resolveSupportedImportFileFormat(filePath);
  if (!fileFormat) {
    throw createError('CSV_FILENAME_INVALID', { fileName: path.basename(filePath) });
  }
  if (fileFormat === 'csv') {
    const headers = await readCsvHeadersFromPath(filePath, createError);
    throwIfTabularAborted(signal);
    return {
      headers,
      fileFormat
    };
  }
  try {
    await assertFileWithinImportLimit(filePath, createError);
    const { headers } = await readNonCsvRowsFromPath(filePath, fileFormat, 2, createError, signal);
    throwIfTabularAborted(signal);
    const normalizedHeaders = headers.map((header, index) => toHeaderValue(header, index));
    if (!normalizedHeaders.length) {
      throw createError('CSV_HEADER_READ_FAILED', { filePath });
    }
    return {
      headers: normalizedHeaders,
      fileFormat
    };
  } catch (error) {
    if (signal?.aborted) {
      throw tabularAbortReason(signal);
    }
    throw createError('CSV_HEADER_READ_FAILED', {
      filePath,
      reason: error instanceof Error ? error.message : 'CSV_HEADER_READ_FAILED'
    });
  }
};

export const readTabularTimestampSamplesFromPath = async (
  filePath: string,
  mapping: Pick<CsvFieldMapping, 'timestampMode' | 'date' | 'time'>,
  maxRows = 96,
  timeZone?: string,
  signal?: AbortSignal,
): Promise<CsvTimestampSample[]> => {
  throwIfTabularAborted(signal);
  const fileFormat = resolveSupportedImportFileFormat(filePath);
  if (!fileFormat) {
    return [];
  }
  if (fileFormat === 'csv') {
    const samples = await readCsvTimestampSamplesFromPath(filePath, mapping, maxRows, timeZone);
    throwIfTabularAborted(signal);
    return samples;
  }
  return readNonCsvTimestampSamplesFromPath(filePath, fileFormat, mapping, maxRows, timeZone, signal);
};

const readTabularTimeSamplesFromPath = async (
  filePath: string,
  mapping: Pick<CsvFieldMapping, 'timestampMode' | 'date' | 'time'>,
  maxRows = 96,
  timeZone?: string,
  signal?: AbortSignal,
): Promise<number[]> => {
  throwIfTabularAborted(signal);
  const fileFormat = resolveSupportedImportFileFormat(filePath);
  if (!fileFormat) {
    return [];
  }
  if (fileFormat === 'csv') {
    const samples = await readCsvTimeSamplesFromPath(filePath, mapping, maxRows, timeZone);
    throwIfTabularAborted(signal);
    return samples;
  }
  return (await readNonCsvTimestampSamplesFromPath(filePath, fileFormat, mapping, maxRows, timeZone, signal)).map(
    (sample) => sample.parsedMs,
  );
};

export const detectTabularFileTimeframe = async (
  filePath: string,
  mapping: Pick<CsvFieldMapping, 'timestampMode' | 'date' | 'time'>,
  fallbackPathHint = '',
  timeZone?: string,
  signal?: AbortSignal,
): Promise<SupportedBaseTimeframe | null> => {
  throwIfTabularAborted(signal);
  const timestamps = await readTabularTimeSamplesFromPath(filePath, mapping, 96, timeZone, signal);
  const detectedFromData = detectBaseTimeframeFromTimestamps(timestamps);
  if (detectedFromData) {
    return detectedFromData;
  }
  const hint = resolveTimeframeFromPathHints(fallbackPathHint || filePath);
  return hint ?? null;
};

const toCsvCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
};

const escapeCsvCell = (value: string): string => {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const resolveCanonicalCsvHeaderMapping = (
  headers: string[],
  fieldMapping: CsvFieldMapping,
  createError: CreateAppError
): CsvImportColumnMapping => {
  const volumeHeader = String(fieldMapping.volume ?? '').trim();
  const resolvedHeaderByField: CsvImportColumnMapping = {
    timestampMode: fieldMapping.timestampMode === 'SPLIT' ? 'SPLIT' : 'SINGLE',
    date: resolveRowHeaderKey(headers, fieldMapping.date) ?? '',
    time:
      fieldMapping.timestampMode === 'SPLIT' ? resolveRowHeaderKey(headers, fieldMapping.time) ?? '' : '',
    open: resolveRowHeaderKey(headers, fieldMapping.open) ?? '',
    high: resolveRowHeaderKey(headers, fieldMapping.high) ?? '',
    low: resolveRowHeaderKey(headers, fieldMapping.low) ?? '',
    close: resolveRowHeaderKey(headers, fieldMapping.close) ?? '',
    volume: volumeHeader ? resolveRowHeaderKey(headers, volumeHeader) ?? '' : ''
  };
  if (
    !resolvedHeaderByField.date ||
    (resolvedHeaderByField.timestampMode === 'SPLIT' && !resolvedHeaderByField.time) ||
    !resolvedHeaderByField.open ||
    !resolvedHeaderByField.high ||
    !resolvedHeaderByField.low ||
    !resolvedHeaderByField.close
  ) {
    throw createError('CSV_MAPPING_HEADER_MISSING');
  }
  return resolvedHeaderByField;
};

const buildCanonicalCsvLine = (
  row: Record<string, unknown>,
  resolvedHeaderByField: CsvImportColumnMapping
): string => {
  const dateRaw = toCsvCell(row[resolvedHeaderByField.date]);
  const timeRaw =
    resolvedHeaderByField.timestampMode === 'SPLIT' ? toCsvCell(row[resolvedHeaderByField.time]) : '';
  const timestampText = composeCsvTimestampText(
    dateRaw,
    timeRaw,
    resolvedHeaderByField.timestampMode === 'SPLIT' ? 'SPLIT' : 'SINGLE'
  );
  return [
    timestampText,
    toCsvCell(row[resolvedHeaderByField.open]),
    toCsvCell(row[resolvedHeaderByField.high]),
    toCsvCell(row[resolvedHeaderByField.low]),
    toCsvCell(row[resolvedHeaderByField.close]),
    resolvedHeaderByField.volume ? toCsvCell(row[resolvedHeaderByField.volume]) : '0'
  ]
    .map(escapeCsvCell)
    .join(',');
};

const writeCanonicalCsvFromXlsx = async (
  outputPath: string,
  filePath: string,
  mapping: CsvFieldMapping,
  createError: CreateAppError,
  signal?: AbortSignal,
): Promise<void> => {
  throwIfTabularAborted(signal);
  await assertFileWithinImportLimit(
    filePath,
    createError,
    IMPORT_LIMITS.maxInMemoryTabularFileBytes,
    'inMemoryTabularFileBytes',
  );
  await assertXlsxInflatedSizeWithinImportLimit(filePath, createError, signal);
  const matrix = await readXlsxMatrixFromPath(filePath, signal);
  const headerRow = matrix[0] ?? [];
  if (!headerRow.length) {
    throw createError('CSV_FILE_IMPORT_FAILED', {
      filePath,
      reason: 'XLSX_ROWS_EMPTY'
    });
  }
  const outputLines: string[] = ['date,open,high,low,close,volume'];
  let rowsWritten = 0;
  const flushLines = async (): Promise<void> => {
    throwIfTabularAborted(signal);
    if (outputLines.length <= 0) {
      return;
    }
    await fs.appendFile(outputPath, `${outputLines.join('\n')}\n`, 'utf8');
    throwIfTabularAborted(signal);
    outputLines.length = 0;
  };
  await fs.writeFile(outputPath, '', 'utf8');

  const headerSize = headerRow.length;
  assertColumnCountWithinImportLimit(headerSize, createError);
  const headers = assertHeadersWithinImportLimit(
    Array.from({ length: headerSize }, (_, index) =>
      toHeaderValue(normalizeXlsxCellValue(headerRow[index]), index)
    ),
    createError,
  );
  if (!headers.length) {
    throw createError('CSV_FILE_IMPORT_FAILED', {
      filePath,
      reason: 'XLSX_ROWS_EMPTY'
    });
  }
  const resolvedHeaderByField = resolveCanonicalCsvHeaderMapping(headers, mapping, createError);

  for (const sourceRow of matrix.slice(1)) {
    throwIfTabularAborted(signal);
    if (!sourceRow.some((cellValue) => normalizeXlsxCellValue(cellValue) !== '')) {
      continue;
    }
    const normalizedRow: Record<string, unknown> = {};
    let hasValue = false;
    headers.forEach((header, index) => {
      const cellValue = normalizeXlsxCellValue(sourceRow[index]);
      if (!hasValue && cellValue !== '') {
        hasValue = true;
      }
      assertTextWithinImportLimit(toCellLimitText(cellValue), 'csvCellChars', INPUT_LIMITS.importCellChars, createError);
      normalizedRow[header] = cellValue;
    });
    if (!hasValue) {
      continue;
    }
    outputLines.push(buildCanonicalCsvLine(normalizedRow, resolvedHeaderByField));
    rowsWritten += 1;
    if (outputLines.length >= 512) {
      await flushLines();
    }
  }
  await flushLines();
  throwIfTabularAborted(signal);
  if (rowsWritten <= 0) {
    throw createError('CSV_FILE_IMPORT_FAILED', {
      filePath,
      reason: 'XLSX_ROWS_EMPTY'
    });
  }
};

export const materializeTabularFileToImportCsv = async (
  filePath: string,
  fileName: string,
  mapping: CsvFieldMapping,
  createError: CreateAppError,
  signal?: AbortSignal,
): Promise<{
  importCsvPath: string;
  inputFormat: 'csv' | 'json' | 'parquet';
  normalizedMapping: CsvImportColumnMapping;
  cleanup: () => Promise<void>;
}> => {
  throwIfTabularAborted(signal);
  const fileFormat = resolveSupportedImportFileFormat(fileName || filePath);
  if (!fileFormat) {
    throw createError('CSV_FILENAME_INVALID', { fileName });
  }
  if (fileFormat === 'csv') {
    const { headers } = await readTabularHeadersFromPath(filePath, createError, signal);
    return {
      importCsvPath: filePath,
      inputFormat: 'csv',
      normalizedMapping: resolveCanonicalCsvHeaderMapping(headers, mapping, createError),
      cleanup: async () => undefined
    };
  }

  if (fileFormat === 'json' || fileFormat === 'parquet') {
    const { headers } = await readTabularHeadersFromPath(filePath, createError, signal);
    return {
      importCsvPath: filePath,
      inputFormat: fileFormat,
      normalizedMapping: resolveCanonicalCsvHeaderMapping(headers, mapping, createError),
      cleanup: async () => undefined
    };
  }

  const tempCsvPath = path.join(
    os.tmpdir(),
    'zinuto-csv-upload',
    `converted-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.csv`
  );
  await fs.mkdir(path.dirname(tempCsvPath), { recursive: true });
  try {
    await writeCanonicalCsvFromXlsx(tempCsvPath, filePath, mapping, createError, signal);
  } catch (error) {
    await fs.unlink(tempCsvPath).catch(() => undefined);
    if (signal?.aborted) {
      throw tabularAbortReason(signal);
    }
    throw createError('CSV_FILE_IMPORT_FAILED', {
      fileName,
      reason: error instanceof Error ? error.message : 'CSV_FILE_IMPORT_FAILED'
    });
  }
  return {
    importCsvPath: tempCsvPath,
    inputFormat: 'csv',
    normalizedMapping: {
      timestampMode: 'SINGLE',
      date: 'date',
      time: '',
      open: 'open',
      high: 'high',
      low: 'low',
      close: 'close',
      volume: 'volume'
    },
    cleanup: async () => {
      await fs.unlink(tempCsvPath).catch(() => undefined);
    }
  };
};
