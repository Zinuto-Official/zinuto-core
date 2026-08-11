// SPDX-License-Identifier: GPL-3.0-only

import path from 'node:path';
import {
  normalizeImportHeader,
  type ImportRuleMappingProfile,
} from '@zinuto/shared/importRules';
import { IMPORT_LIMITS, INPUT_LIMITS } from '@zinuto/shared/input-limits';
import type { CsvFieldMapping } from '../../domain/dataSource/csvFieldMappingTypes.js';
import {
  composeCsvTimestampText,
  createCsvDecodedTextStreamFromPath,
  parseCsvTimestampValue,
} from './csvPreviewUtils.js';
import { appError } from '../../kernel/appError.js';
import type { SupportedBaseTimeframe } from './supportedFileFormats.js';
import type { InferredImportTimeZone } from './importTimeZoneInference.js';
import {
  readTabularPreviewRowsFromPath,
  readTabularTimestampSamplesFromPath,
} from './tabularFileUtils.js';
import { readAbortReason, throwIfOperationAborted } from './operationAbort.js';
import type {
  LocalDataImportFieldDiagnostic,
  LocalDataImportMappingProfile,
  LocalDataImportRepairSummary,
  LocalDataImportTimeZoneSuggestion,
} from './types.js';

export type FolderPreviewQualityImportFile = {
  path: string;
  symbol: string;
  detectedTimeframe: SupportedBaseTimeframe;
  headers: string[];
  mapping: CsvFieldMapping;
};

const PREVIEW_QUALITY_SAMPLE_FILE_LIMIT = 6;
const PREVIEW_TIME_ZONE_SAMPLE_LIMIT = 6;
const PREVIEW_TRADING_CALENDAR_SAMPLE_LIMIT = 4096;
const PREVIEW_TRADING_CALENDAR_SAMPLE_PER_FILE_LIMIT = 768;
const PRICE_FIELD_KEYS = ['open', 'high', 'low', 'close'] as const;

export const toApiMappingProfile = (
  profile: ImportRuleMappingProfile
): LocalDataImportMappingProfile => ({
  canonicalSchemaKey: profile.canonicalSchemaKey,
  priceFamily: profile.priceFamily,
  confidence: profile.confidence,
  score: profile.score,
  conflicts: [...profile.conflicts]
});

export const toApiFieldDiagnostics = (
  profile: ImportRuleMappingProfile
): LocalDataImportFieldDiagnostic[] =>
  profile.fieldDiagnostics.map((diagnostic) => ({
    field: diagnostic.field,
    status: diagnostic.status,
    selectedHeader: diagnostic.selectedHeader,
    confidence: diagnostic.confidence,
    reason: diagnostic.reason,
    candidates: diagnostic.candidates.map((candidate) => ({
      header: candidate.header,
      score: candidate.score,
      reason: candidate.reason,
      family: candidate.family
    }))
  }));

const resolveRowHeaderKey = (headers: string[], targetHeader: string): string | null => {
  const expected = normalizeImportHeader(targetHeader);
  if (!expected) {
    return null;
  }
  return headers.find((header) => normalizeImportHeader(header) === expected) ?? null;
};

const parsePreviewNumericValue = (
  value: unknown
): { value: number | null; usedThousandsSeparator: boolean } => {
  if (typeof value === 'number') {
    return {
      value: Number.isFinite(value) ? value : null,
      usedThousandsSeparator: false
    };
  }
  const raw = String(value ?? '').trim();
  if (!raw) {
    return { value: null, usedThousandsSeparator: false };
  }
  const compact = raw.replace(/\s+/g, '');
  const usedThousandsSeparator = /^-?\d{1,3}(,\d{3})+(?:\.\d+)?$/.test(compact);
  const normalized = usedThousandsSeparator ? compact.replace(/,/g, '') : compact;
  const parsed = Number(normalized);
  return {
    value: Number.isFinite(parsed) ? parsed : null,
    usedThousandsSeparator
  };
};

const hasHeaderNormalizerRepair = (headers: string[], mapping: CsvFieldMapping): boolean => {
  const mappedHeaders = [
    mapping.date,
    mapping.timestampMode === 'SPLIT' ? mapping.time : '',
    mapping.open,
    mapping.high,
    mapping.low,
    mapping.close,
    mapping.volume
  ]
    .map((header) => String(header || '').trim())
    .filter((header) => Boolean(header));
  return mappedHeaders.some((mappedHeader) =>
    headers.some(
      (header) =>
        header !== mappedHeader && normalizeImportHeader(header) === normalizeImportHeader(mappedHeader)
    )
  );
};

const resolveMappedRowHeaders = (
  headers: string[],
  mapping: CsvFieldMapping
): Record<keyof CsvFieldMapping, string | null> => ({
  timestampMode: null,
  date: resolveRowHeaderKey(headers, mapping.date),
  time: mapping.timestampMode === 'SPLIT' ? resolveRowHeaderKey(headers, mapping.time) : null,
  open: resolveRowHeaderKey(headers, mapping.open),
  high: resolveRowHeaderKey(headers, mapping.high),
  low: resolveRowHeaderKey(headers, mapping.low),
  close: resolveRowHeaderKey(headers, mapping.close),
  volume: mapping.volume ? resolveRowHeaderKey(headers, mapping.volume) : null
});

const SYMBOL_COLUMN_HEADER_KEYS = new Set([
  'symbol',
  'ticker',
  'instrument',
  'instrumentid',
  'security',
  'securitycode',
  'seccode',
  'stockcode',
  'contract',
  'contractcode',
  'tscode',
  'indexcode',
  'code',
]);
const CSV_DELIMITER_CANDIDATES = [',', ';', '\t', '|'] as const;
const CSV_HEADER_SCAN_BYTES = 512 * 1024;

export const hasPreviewSymbolColumn = (headers: string[]): boolean =>
  headers.some((header) =>
    SYMBOL_COLUMN_HEADER_KEYS.has(normalizeImportHeader(header)),
  );

const detectCsvDelimiterFromPath = async (filePath: string): Promise<string> => {
  const reader = await createCsvDecodedTextStreamFromPath(filePath);
  try {
    let text = '';
    for await (const chunk of reader) {
      text += String(chunk);
      if (text.length > CSV_HEADER_SCAN_BYTES) {
        throw appError('LOCAL_DATA_IMPORT_LIMIT_EXCEEDED', {
          limit: 'csvHeaderChars',
          max: INPUT_LIMITS.csvHeaderChars,
        });
      }
      let inQuotes = false;
      let complete = false;
      for (let index = 0; index < text.length; index += 1) {
        if (text[index] === '"') {
          if (inQuotes && text[index + 1] === '"') {
            index += 1;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (!inQuotes && (text[index] === '\r' || text[index] === '\n')) {
          complete = true;
          break;
        }
      }
      if (complete) {
        break;
      }
    }
    const counts = new Map<string, number>(
      CSV_DELIMITER_CANDIDATES.map((delimiter) => [delimiter, 0]),
    );
    let inQuotes = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '"') {
        if (inQuotes && text[index + 1] === '"') {
          index += 1;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && (char === '\r' || char === '\n')) {
        break;
      }
      if (!inQuotes && counts.has(char)) {
        counts.set(char, (counts.get(char) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? ',';
  } finally {
    reader.destroy();
  }
};

export const assertCsvFileUsesSingleSymbol = async (
  filePath: string,
  signal?: AbortSignal,
): Promise<void> => {
  const delimiter = await detectCsvDelimiterFromPath(filePath);
  const reader = await createCsvDecodedTextStreamFromPath(filePath);
  let field = '';
  let fields: string[] = [];
  let inQuotes = false;
  let pendingQuote = false;
  let previousWasCr = false;
  let rowChars = 0;
  let symbolColumnIndexes: number[] | null = null;
  const symbols = new Set<string>();

  const finishField = (): void => {
    if (field.length > INPUT_LIMITS.importCellChars) {
      throw appError('LOCAL_DATA_IMPORT_LIMIT_EXCEEDED', {
        limit: 'csvCellChars',
        max: INPUT_LIMITS.importCellChars,
      });
    }
    fields.push(field.replace(/^\uFEFF/, '').trim());
    if (fields.length > IMPORT_LIMITS.maxColumns) {
      throw appError('LOCAL_DATA_IMPORT_LIMIT_EXCEEDED', {
        limit: 'columns',
        max: IMPORT_LIMITS.maxColumns,
      });
    }
    field = '';
  };

  const finishRecord = (): void => {
    finishField();
    const hasValue = fields.some((value) => Boolean(value));
    if (hasValue && symbolColumnIndexes === null) {
      symbolColumnIndexes = fields
        .map((header, index) =>
          SYMBOL_COLUMN_HEADER_KEYS.has(normalizeImportHeader(header)) ? index : -1,
        )
        .filter((index) => index >= 0);
    } else if (hasValue && symbolColumnIndexes?.length) {
      symbolColumnIndexes.forEach((columnIndex) => {
        const symbol = String(fields[columnIndex] ?? '').trim().toUpperCase();
        if (symbol) {
          symbols.add(symbol);
        }
      });
      if (symbols.size > 1) {
        throw appError('CSV_SYMBOL_COLUMN_MIXED', { fileName: path.basename(filePath) });
      }
    }
    fields = [];
    rowChars = 0;
  };

  try {
    for await (const chunk of reader) {
      throwIfOperationAborted(signal);
      const text = String(chunk);
      for (let index = 0; index < text.length; index += 1) {
        throwIfOperationAborted(signal);
        const char = text[index];
        if (previousWasCr) {
          previousWasCr = false;
          if (char === '\n') {
            continue;
          }
        }
        rowChars += 1;
        if (rowChars > IMPORT_LIMITS.maxRowChars) {
          throw appError('LOCAL_DATA_IMPORT_LIMIT_EXCEEDED', {
            limit: 'csvRowChars',
            max: IMPORT_LIMITS.maxRowChars,
          });
        }
        if (pendingQuote) {
          pendingQuote = false;
          if (char === '"') {
            field += '"';
            continue;
          }
          inQuotes = false;
        }
        if (inQuotes) {
          if (char === '"') {
            pendingQuote = true;
          } else {
            field += char;
          }
          continue;
        }
        if (char === '"' && field.length === 0) {
          inQuotes = true;
          continue;
        }
        if (char === delimiter) {
          finishField();
          continue;
        }
        if (char === '\r' || char === '\n') {
          finishRecord();
          previousWasCr = char === '\r';
          continue;
        }
        field += char;
      }
    }
    if (inQuotes && !pendingQuote) {
      throw appError('CSV_HEADER_READ_FAILED', { filePath });
    }
    if (field || fields.length > 0) {
      finishRecord();
    }
  } finally {
    reader.destroy();
  }
};

export const assertPreviewRowsUseSingleSymbol = (
  fileName: string,
  headers: string[],
  rows: Array<Record<string, unknown>>,
): void => {
  const symbolHeaders = headers.filter((header) =>
    SYMBOL_COLUMN_HEADER_KEYS.has(normalizeImportHeader(header)),
  );
  if (!symbolHeaders.length) {
    return;
  }
  const symbols = new Set<string>();
  rows.forEach((row) => {
    symbolHeaders.forEach((header) => {
      const symbol = String(row[header] ?? '').trim().toUpperCase();
      if (symbol) {
        symbols.add(symbol);
      }
    });
  });
  if (symbols.size > 1) {
    throw appError('CSV_SYMBOL_COLUMN_MIXED', {
      fileName,
      header: symbolHeaders[0] ?? '',
    });
  }
};

export type PreviewQualityResult = {
  repairSummary: LocalDataImportRepairSummary;
  timeZoneSamples: LocalDataImportTimeZoneSuggestion['samples'];
  tradingCalendarTimestampSamples: number[];
  tradingCalendarParseableTimestampRowCount: number;
  tradingCalendarSampledFileCount: number;
};

export const buildPreviewQualityDiagnostics = async (
  files: FolderPreviewQualityImportFile[],
  timeZone: string,
  onFileComplete?: (file: FolderPreviewQualityImportFile) => void,
  signal?: AbortSignal,
): Promise<PreviewQualityResult> => {
  throwIfOperationAborted(signal);
  const applied = new Set<string>();
  const warnings = new Set<string>();
  const timestampSamples: LocalDataImportTimeZoneSuggestion['samples'] = [];
  const tradingCalendarTimestampSamples: number[] = [];
  let tradingCalendarParseableTimestampRowCount = 0;
  let tradingCalendarSampledFileCount = 0;
  const duplicateSignaturesByInstrumentTimestamp = new Map<string, string>();
  const sample = {
    checkedRows: 0,
    parseableTimestampRows: 0,
    validOhlcRows: 0,
    duplicateTimestampRows: 0,
    conflictingDuplicateTimestampRows: 0
  };

  for (const file of files.slice(0, PREVIEW_QUALITY_SAMPLE_FILE_LIMIT)) {
    throwIfOperationAborted(signal);
    try {
      const remainingTradingCalendarSampleCount =
        PREVIEW_TRADING_CALENDAR_SAMPLE_LIMIT - tradingCalendarTimestampSamples.length;
      if (remainingTradingCalendarSampleCount > 0) {
        try {
          const timestampRows = await readTabularTimestampSamplesFromPath(
            file.path,
            file.mapping,
            Math.min(
              PREVIEW_TRADING_CALENDAR_SAMPLE_PER_FILE_LIMIT,
              remainingTradingCalendarSampleCount,
            ),
            timeZone,
            signal,
          );
          if (timestampRows.length > 0) {
            tradingCalendarSampledFileCount += 1;
            tradingCalendarParseableTimestampRowCount += timestampRows.length;
          }
          timestampRows.forEach((timestampRow) => {
            if (timestampSamples.length < PREVIEW_TIME_ZONE_SAMPLE_LIMIT) {
              timestampSamples.push({
                raw: timestampRow.raw,
                parsedAt: new Date(timestampRow.parsedMs).toISOString()
              });
            }
            if (tradingCalendarTimestampSamples.length < PREVIEW_TRADING_CALENDAR_SAMPLE_LIMIT) {
              tradingCalendarTimestampSamples.push(timestampRow.parsedMs);
            }
          });
        } catch (error) {
          if (signal?.aborted) {
            throw readAbortReason(signal);
          }
          // Quality diagnostics should not reject an otherwise importable file.
        }
      }

      let previewRows: Awaited<ReturnType<typeof readTabularPreviewRowsFromPath>>;
      try {
        previewRows = await readTabularPreviewRowsFromPath(file.path, undefined, signal);
      } catch (error) {
        if (signal?.aborted) {
          throw readAbortReason(signal);
        }
        continue;
      }
      if (!previewRows.rows.length) {
        continue;
      }
      if (!file.mapping.volume) {
        applied.add('MISSING_VOLUME_DEFAULT_ZERO');
      }
      if (hasHeaderNormalizerRepair(previewRows.headers, file.mapping)) {
        applied.add('HEADER_NORMALIZED');
      }

      const resolvedHeaders = resolveMappedRowHeaders(previewRows.headers, file.mapping);
      if (
        !resolvedHeaders.date ||
        (file.mapping.timestampMode === 'SPLIT' && !resolvedHeaders.time) ||
        !resolvedHeaders.open ||
        !resolvedHeaders.high ||
        !resolvedHeaders.low ||
        !resolvedHeaders.close
      ) {
        continue;
      }

      for (const row of previewRows.rows) {
        throwIfOperationAborted(signal);
        sample.checkedRows += 1;
        const dateRaw = String(row[resolvedHeaders.date] ?? '').trim();
        const timeRaw =
          file.mapping.timestampMode === 'SPLIT' && resolvedHeaders.time
            ? String(row[resolvedHeaders.time] ?? '').trim()
            : '';
        if (file.mapping.timestampMode === 'SPLIT' && /^\d{1,6}$/.test(timeRaw) && timeRaw.length < 6) {
          applied.add('SPLIT_TIME_ZERO_PADDED');
        }
        const timestampText = composeCsvTimestampText(dateRaw, timeRaw, file.mapping.timestampMode);
        const timestampMs = parseCsvTimestampValue(timestampText, timeZone);
        if (timestampMs === null) {
          continue;
        }
        sample.parseableTimestampRows += 1;

        const parsedValues = Object.fromEntries(
          PRICE_FIELD_KEYS.map((field) => {
            const header = resolvedHeaders[field];
            const parsed = parsePreviewNumericValue(header ? row[header] : '');
            if (parsed.usedThousandsSeparator) {
              applied.add('NUMERIC_THOUSANDS_SEPARATOR');
            }
            return [field, parsed.value] as const;
          })
        ) as Record<(typeof PRICE_FIELD_KEYS)[number], number | null>;
        const volumeRaw = resolvedHeaders.volume
          ? String(row[resolvedHeaders.volume] ?? '').trim()
          : '';
        const parsedVolume = resolvedHeaders.volume
          ? parsePreviewNumericValue(volumeRaw)
          : { value: 0, usedThousandsSeparator: false };
        if (parsedVolume.usedThousandsSeparator) {
          applied.add('NUMERIC_THOUSANDS_SEPARATOR');
        }

        if (
          PRICE_FIELD_KEYS.some((field) => parsedValues[field] === null) ||
          (Boolean(resolvedHeaders.volume) && Boolean(volumeRaw) && parsedVolume.value === null)
        ) {
          continue;
        }
        const open = parsedValues.open as number;
        const high = parsedValues.high as number;
        const low = parsedValues.low as number;
        const close = parsedValues.close as number;
        const volume = parsedVolume.value ?? 0;
        if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
          warnings.add('NEGATIVE_PRICE');
          continue;
        }
        if (volume < 0) {
          continue;
        }
        if (high < low) {
          warnings.add('HIGH_LOW_REVERSED');
          continue;
        }
        if (open < low || open > high || close < low || close > high) {
          warnings.add('OHLC_OUT_OF_RANGE');
          continue;
        }
        const signature = [open, high, low, close, volume].join('|');
        const duplicateKey = [
          String(file.symbol || '').trim().toUpperCase(),
          file.detectedTimeframe,
          String(timestampMs)
        ].join('|');
        const existingSignature = duplicateSignaturesByInstrumentTimestamp.get(duplicateKey);
        if (existingSignature) {
          sample.duplicateTimestampRows += 1;
          if (existingSignature === signature) {
            applied.add('DUPLICATE_TIMESTAMP_IDENTICAL_DEDUPED');
          } else {
            sample.conflictingDuplicateTimestampRows += 1;
            warnings.add('DUPLICATE_TIMESTAMP_CONFLICT');
          }
          continue;
        }
        duplicateSignaturesByInstrumentTimestamp.set(duplicateKey, signature);
        sample.validOhlcRows += 1;
      }
    } finally {
      onFileComplete?.(file);
    }
  }

  if (sample.parseableTimestampRows > 1) {
    applied.add('TIMESTAMP_SORTED_BEFORE_IMPORT');
  }

  return {
    repairSummary: {
      applied: [...applied].sort((left, right) => left.localeCompare(right, 'en')),
      warnings: [...warnings].sort((left, right) => left.localeCompare(right, 'en')),
      sample
    },
    timeZoneSamples: timestampSamples,
    tradingCalendarTimestampSamples,
    tradingCalendarParseableTimestampRowCount,
    tradingCalendarSampledFileCount
  };
};

export const collectPreviewTimeZoneRawSamples = async (
  files: FolderPreviewQualityImportFile[],
  onFileComplete?: (file: FolderPreviewQualityImportFile) => void,
  signal?: AbortSignal,
): Promise<string[]> => {
  throwIfOperationAborted(signal);
  const samples: string[] = [];
  for (const file of files.slice(0, PREVIEW_QUALITY_SAMPLE_FILE_LIMIT)) {
    throwIfOperationAborted(signal);
    try {
      try {
        const timestampRows = await readTabularTimestampSamplesFromPath(
          file.path,
          file.mapping,
          PREVIEW_TIME_ZONE_SAMPLE_LIMIT - samples.length,
          undefined,
          signal,
        );
        timestampRows.forEach((timestampRow) => {
          if (samples.length < PREVIEW_TIME_ZONE_SAMPLE_LIMIT) {
            samples.push(timestampRow.raw);
          }
        });
      } catch (error) {
        if (signal?.aborted) {
          throw readAbortReason(signal);
        }
        continue;
      }
      if (samples.length >= PREVIEW_TIME_ZONE_SAMPLE_LIMIT) {
        return samples;
      }
    } finally {
      onFileComplete?.(file);
    }
  }
  return samples;
};

export const buildTimeZoneSuggestion = (
  inferred: InferredImportTimeZone,
  samples: LocalDataImportTimeZoneSuggestion['samples']
): LocalDataImportTimeZoneSuggestion => {
  return {
    timeZone: inferred.timeZone,
    reason: inferred.reason,
    confidence: inferred.confidence,
    reasons: inferred.reasons,
    samples
  };
};
