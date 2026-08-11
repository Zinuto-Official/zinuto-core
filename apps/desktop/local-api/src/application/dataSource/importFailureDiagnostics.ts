// SPDX-License-Identifier: GPL-3.0-only

import type { CsvBatchImportFileResult } from './tabularImport.js';

export type ImportDiagnosticSeverity = 'INFO' | 'WARNING' | 'ERROR';
export type ImportDiagnosticStage =
  | 'SCANNING'
  | 'READING_HEADERS'
  | 'MAPPING'
  | 'PARSING'
  | 'VALIDATING_ROWS'
  | 'IMPORTING'
  | 'FINALIZING'
  | 'SYNC_CHECK';

export type ImportDiagnostic = {
  code: string;
  severity: ImportDiagnosticSeverity;
  stage: ImportDiagnosticStage;
  fileName: string | null;
  relativePath: string | null;
  format: string | null;
  field: string | null;
  rowNumber: number | null;
  rawValue: string | null;
  expected: string | null;
  actual: string | number | boolean | null;
  samples: Array<Record<string, string | number | boolean | null>>;
};

export type ImportFailureCause = {
  code: string;
  stage: ImportDiagnosticStage;
};

export type ImportFailureDetails = Record<string, string | number | boolean | null>;

export type ImportFailureSummaryItem = {
  code: string;
  stage: ImportDiagnosticStage;
  fileName: string | null;
  count: number;
};

export type ImportFailureSummary = {
  totalFailedFiles: number;
  primaryCode: string | null;
  items: ImportFailureSummaryItem[];
};

const ERROR_CODE_REGEX = /^[A-Z][A-Z0-9_]*$/;

export const normalizeImportFailureCode = (
  value: unknown,
  fallback = 'CSV_FILE_IMPORT_FAILED',
): string => {
  const normalized = String(value ?? '').trim().toUpperCase();
  return ERROR_CODE_REGEX.test(normalized) ? normalized : fallback;
};

export const resolveImportFailureStage = (codeRaw: unknown): ImportDiagnosticStage => {
  const code = normalizeImportFailureCode(codeRaw);
  if (code.includes('HEADER')) {
    return 'READING_HEADERS';
  }
  if (code.includes('MAPPING') || code.includes('FIELD')) {
    return 'MAPPING';
  }
  if (code.includes('PARSE') || code.includes('FILE_MISSING') || code.includes('FILENAME')) {
    return 'PARSING';
  }
  if (
    code.includes('NO_VALID_BARS') ||
    code.includes('REQUIRED_FIELD') ||
    code.includes('INVALID_OHLC') ||
    code.includes('DUPLICATE') ||
    code.includes('TIMEFRAME')
  ) {
    return 'VALIDATING_ROWS';
  }
  if (code.includes('INCREMENTAL') || code.includes('REIMPORT')) {
    return 'SYNC_CHECK';
  }
  return 'IMPORTING';
};

const toSafeDetailValue = (value: unknown): string | number | boolean | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return String(value);
};

const toPositiveCount = (value: unknown): number =>
  Math.max(0, Math.floor(Number(value) || 0));

export const createImportDiagnostic = ({
  code,
  stage,
  fileName = null,
  relativePath = null,
  format = null,
  field = null,
  rowNumber = null,
  rawValue = null,
  expected = null,
  actual = null,
  samples = [],
}: Partial<ImportDiagnostic> & { code: string }): ImportDiagnostic => ({
  code: normalizeImportFailureCode(code),
  severity: 'ERROR',
  stage: stage ?? resolveImportFailureStage(code),
  fileName,
  relativePath,
  format,
  field,
  rowNumber,
  rawValue,
  expected,
  actual: toSafeDetailValue(actual),
  samples: samples.map((sample) =>
    Object.fromEntries(
      Object.entries(sample).map(([key, value]) => [key, toSafeDetailValue(value)]),
    ),
  ),
});

export const buildImportFailureCause = (codeRaw: unknown): ImportFailureCause => {
  const code = normalizeImportFailureCode(codeRaw);
  return {
    code,
    stage: resolveImportFailureStage(code),
  };
};

export const buildImportFailureDetails = (
  codeRaw: unknown,
  details: Record<string, unknown> = {},
): ImportFailureDetails => {
  const code = normalizeImportFailureCode(codeRaw);
  return Object.fromEntries(
    Object.entries({
      code,
      stage: resolveImportFailureStage(code),
      ...details,
    }).map(([key, value]) => [key, toSafeDetailValue(value)]),
  );
};

export const buildImportDiagnosticsForFileFailure = ({
  code,
  fileName,
  relativePath,
  format,
  result,
}: {
  code: string;
  fileName: string;
  relativePath?: string | null;
  format?: string | null;
  result?: CsvBatchImportFileResult | null;
}): ImportDiagnostic[] => {
  const diagnostics: ImportDiagnostic[] = [
    createImportDiagnostic({
      code,
      fileName,
      relativePath: relativePath ?? fileName,
      format: format ?? null,
      samples: [
        {
          rowsImported: toPositiveCount(result?.rows),
          invalidRequiredRowsSkipped: toPositiveCount(result?.invalidRequiredRowsSkipped),
          invalidOhlcRowsSkipped: toPositiveCount(result?.invalidOhlcRowsSkipped),
          duplicateConflictRowsSkipped: toPositiveCount(result?.duplicateConflictRowsSkipped),
          duplicateIdenticalRowsDeduped: toPositiveCount(result?.duplicateIdenticalRowsDeduped),
          overlapRowsIgnored: toPositiveCount(result?.overlapRowsIgnored),
          internalRangeRowsIgnored: toPositiveCount(result?.internalRangeRowsIgnored),
          conflictRowsIgnored: toPositiveCount(result?.conflictRowsIgnored),
        },
      ],
    }),
  ];
  if (toPositiveCount(result?.invalidRequiredRowsSkipped) > 0 && code !== 'CSV_REQUIRED_FIELD_INVALID') {
    diagnostics.push(
      createImportDiagnostic({
        code: 'CSV_REQUIRED_FIELD_INVALID',
        stage: 'VALIDATING_ROWS',
        fileName,
        relativePath: relativePath ?? fileName,
        format: format ?? null,
        expected: 'timestamp/open/high/low/close contain parseable values',
        actual: `${toPositiveCount(result?.invalidRequiredRowsSkipped)} invalid rows`,
      }),
    );
  }
  if (toPositiveCount(result?.invalidOhlcRowsSkipped) > 0 && code !== 'CSV_INVALID_OHLC') {
    diagnostics.push(
      createImportDiagnostic({
        code: 'CSV_INVALID_OHLC',
        stage: 'VALIDATING_ROWS',
        fileName,
        relativePath: relativePath ?? fileName,
        format: format ?? null,
        expected: 'low <= open/close <= high',
        actual: `${toPositiveCount(result?.invalidOhlcRowsSkipped)} invalid OHLC rows`,
      }),
    );
  }
  if (toPositiveCount(result?.duplicateConflictRowsSkipped) > 0 && code !== 'CSV_DUPLICATE_TIMESTAMP_CONFLICT') {
    diagnostics.push(
      createImportDiagnostic({
        code: 'CSV_DUPLICATE_TIMESTAMP_CONFLICT',
        stage: 'VALIDATING_ROWS',
        fileName,
        relativePath: relativePath ?? fileName,
        format: format ?? null,
        expected: 'one OHLCV value set per timestamp',
        actual: `${toPositiveCount(result?.duplicateConflictRowsSkipped)} conflicting duplicate rows`,
      }),
    );
  }
  return diagnostics;
};

export const stringifyImportFailurePayload = (payload: unknown): string | null => {
  if (payload === null || payload === undefined) {
    return null;
  }
  return JSON.stringify(payload);
};

export const parseImportFailureJson = <T>(raw: unknown, fallback: T): T => {
  if (!raw || typeof raw !== 'string') {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const buildImportFailureSummary = (
  failures: Array<{ code: string; fileName?: string | null }>,
): ImportFailureSummary => {
  const itemByKey = new Map<string, ImportFailureSummaryItem>();
  failures.forEach((failure) => {
    const code = normalizeImportFailureCode(failure.code);
    const stage = resolveImportFailureStage(code);
    const fileName = String(failure.fileName ?? '').trim() || null;
    const key = `${code}|${stage}|${fileName ?? ''}`;
    const existing = itemByKey.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    itemByKey.set(key, {
      code,
      stage,
      fileName,
      count: 1,
    });
  });
  const items = Array.from(itemByKey.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    return left.code.localeCompare(right.code, 'en');
  });
  return {
    totalFailedFiles: failures.length,
    primaryCode: items[0]?.code ?? null,
    items: items.slice(0, 20),
  };
};
