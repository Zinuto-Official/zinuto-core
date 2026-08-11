// SPDX-License-Identifier: GPL-3.0-only

import type { LocalDataImportOutcomeSummary } from "./types.js";

const IMPORT_ERROR_CODE_REGEX = /^[A-Z][A-Z0-9_]*$/;

export const normalizeImportErrorCode = (
  value: unknown,
  fallback = "CSV_FILE_IMPORT_FAILED",
): string => {
  const normalized = String(value ?? "").trim();
  if (IMPORT_ERROR_CODE_REGEX.test(normalized)) {
    return normalized;
  }
  return fallback;
};

const COMPLETE_FAILURE_DETAIL_CODES = new Set([
  "LOCAL_DATA_INCREMENTAL_REIMPORT_REQUIRED",
  "CSV_NO_VALID_BARS",
  "CSV_COLUMN_COUNT_MISMATCH",
  "CSV_DIALECT_MISMATCH",
  "CSV_DUPLICATE_TIMESTAMP_CONFLICT",
  "CSV_ENCODING_UNSUPPORTED",
  "CSV_INVALID_OHLC",
  "CSV_MAPPING_HEADER_MISSING",
  "CSV_PARSE_FAILED",
  "CSV_REQUIRED_FIELD_INVALID",
  "CSV_SYMBOL_COLUMN_MIXED",
  "CSV_UNTERMINATED_QUOTE",
  "CSV_HEADER_READ_FAILED",
  "CSV_FILE_MISSING",
  "CSV_FILENAME_INVALID",
]);

export const readImportErrorCode = (
  error: unknown,
  fallback = "CSV_FILE_IMPORT_FAILED",
): string => {
  if (error && typeof error === "object") {
    const code = normalizeImportErrorCode(
      (error as { code?: unknown }).code,
      "",
    );
    if (code) {
      return code;
    }
  }
  if (error instanceof Error) {
    return normalizeImportErrorCode(error.message, fallback);
  }
  return normalizeImportErrorCode(error, fallback);
};

export const resolveCompleteFailureErrorMessage = (
  failedErrorCodes: string[],
): string => {
  const normalizedCodes = failedErrorCodes
    .map((code) => normalizeImportErrorCode(code, ""))
    .filter((code) => Boolean(code));
  const firstCode = normalizedCodes[0] ?? "";
  if (
    firstCode &&
    COMPLETE_FAILURE_DETAIL_CODES.has(firstCode) &&
    normalizedCodes.every((code) => code === firstCode)
  ) {
    return firstCode;
  }
  return "LOCAL_DATA_IMPORT_ALL_FAILED";
};

export const createEmptyOutcomeSummary = (): LocalDataImportOutcomeSummary => ({
  noChanges: true,
  addedSymbols: [],
  updatedSymbols: [],
  unchangedFiles: 0,
  prependedRows: 0,
  appendedRows: 0,
  overlapRowsIgnored: 0,
  internalRangeRowsIgnored: 0,
  conflictRowsIgnored: 0,
  qualityWarnings: {
    filesWithSkippedRows: 0,
    invalidRequiredRowsSkipped: 0,
    invalidOhlcRowsSkipped: 0,
    duplicateConflictRowsSkipped: 0,
    duplicateIdenticalRowsDeduped: 0,
  },
});
