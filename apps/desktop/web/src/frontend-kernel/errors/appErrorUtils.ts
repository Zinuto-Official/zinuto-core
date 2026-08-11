// SPDX-License-Identifier: GPL-3.0-only

import { toBackendErrorMessage } from "@/api";
import { showGlobalErrorDialog } from "@/frontend-kernel/notifications/globalNoticeDialog";
import { getCurrentUiLanguage } from "@/frontend-kernel/i18n/localeState";
import { formatMessage } from "@zinuto/shared/i18n";

const IMPORT_AGGREGATE_ERROR_CODES = new Set([
  "LOCAL_DATA_IMPORT_PARTIAL_FAILED",
  "LOCAL_DATA_IMPORT_ALL_FAILED",
  "LOCAL_DATA_IMPORT_INTERRUPTED",
]);
const LOCAL_DATA_IMPORT_JOB_CANCELED_ERROR_CODE =
  "LOCAL_DATA_IMPORT_JOB_CANCELED";
const LOCAL_DATA_IMPORT_FAILURE_WITHOUT_CODE_ERROR_CODE =
  "LOCAL_DATA_IMPORT_FAILURE_WITHOUT_CODE";
const UNKNOWN_BACKEND_ERROR_CODE = "UNKNOWN_ERROR";

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const trimText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const readStructuredCode = (value: unknown): string => {
  const scalar = trimText(value);
  if (scalar) {
    return scalar;
  }
  if (!isPlainRecord(value)) {
    return "";
  }
  return trimText(value.code) || trimText(value.errorCode);
};

const readStructuredErrorCode = (error: unknown): string => {
  if (!isPlainRecord(error)) {
    return "";
  }
  return (
    trimText(error.code) ||
    trimText(error.errorCode) ||
    readStructuredCode(error.cause)
  );
};

const readStructuredErrorArgs = (
  error: unknown,
): Record<string, unknown> | undefined => {
  if (!isPlainRecord(error)) {
    return undefined;
  }
  const args = error.args ?? error.errorArgs;
  const structuredArgs: Record<string, unknown> = isPlainRecord(args)
    ? { ...args }
    : {};
  ([
    "cause",
    "details",
    "path",
    "requestId",
    "status",
    "statusCode",
  ] as const).forEach((key) => {
    if (key in error && !(key in structuredArgs)) {
      structuredArgs[key] = error[key];
    }
  });
  return Object.keys(structuredArgs).length ? structuredArgs : undefined;
};

const readFailureSummaryPrimaryCode = (error: unknown): string => {
  if (!isPlainRecord(error) || !isPlainRecord(error.failureSummary)) {
    return "";
  }
  return trimText(error.failureSummary.primaryCode);
};

const readFailedFileStructuredError = (
  error: unknown,
): { code: string; args?: Record<string, unknown> } | null => {
  if (!isPlainRecord(error) || !Array.isArray(error.failedFiles)) {
    return null;
  }
  for (const item of error.failedFiles) {
    if (!isPlainRecord(item)) {
      continue;
    }
    const code = readStructuredErrorCode(item);
    if (!code) {
      continue;
    }
    const args = {
      ...(readStructuredErrorArgs(item) ?? {}),
      fileName: trimText(item.fileName),
      symbol: trimText(item.symbol),
    };
    return {
      code,
      args,
    };
  }
  return null;
};

const resolveImportJobStructuredError = (
  rawError: unknown,
): { code: string; args?: Record<string, unknown> } => {
  const directCode =
    typeof rawError === "string"
      ? rawError.trim()
      : readStructuredErrorCode(rawError);
  const directArgs = readStructuredErrorArgs(rawError);
  if (!isPlainRecord(rawError)) {
    return {
      code: directCode,
      args: directArgs,
    };
  }
  const failedFileError = readFailedFileStructuredError(rawError);
  if (
    directCode &&
    !IMPORT_AGGREGATE_ERROR_CODES.has(directCode.toUpperCase())
  ) {
    return {
      code: directCode,
      args: directArgs,
    };
  }
  const causeCode =
    readStructuredCode(rawError.cause) ||
    readFailureSummaryPrimaryCode(rawError) ||
    failedFileError?.code ||
    directCode;
  if (!failedFileError || failedFileError.code !== causeCode) {
    return {
      code: causeCode,
      args: directArgs,
    };
  }
  return {
    code: causeCode,
    args: {
      ...(directArgs ?? {}),
      ...(failedFileError.args ?? {}),
    },
  };
};

const isBackendCodeLike = (value: string): boolean =>
  /^[A-Z][A-Z0-9_]{2,120}$/u.test(value);

const isBareGenericFailureMessage = (message: string): boolean => {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  const language = getCurrentUiLanguage();
  const genericMessages = [
    "request failed",
    "import failed",
    formatMessage(language, "appText.request"),
    formatMessage(language, "appText.import"),
    formatMessage(language, "common.status.importFailed"),
  ].map((value) => value.trim().toLowerCase());
  return genericMessages.includes(normalized);
};

const resolveFallbackMessage = (
  fallback: string,
  error: unknown,
  statusCode: number,
): string => {
  const fallbackMessage = fallback.trim();
  if (fallbackMessage && !isBareGenericFailureMessage(fallbackMessage)) {
    return fallbackMessage;
  }
  return toBackendErrorMessage(
    UNKNOWN_BACKEND_ERROR_CODE,
    readStructuredErrorArgs(error),
    statusCode || 400,
  );
};

const readStructuredStatusCode = (error: unknown): number => {
  if (!isPlainRecord(error)) {
    return 0;
  }
  const rawStatus = Number(error.statusCode ?? error.status ?? 0);
  return Number.isFinite(rawStatus) ? Math.max(0, Math.floor(rawStatus)) : 0;
};

const resolveStructuredBackendErrorMessage = (
  error: unknown,
  fallbackStatusCode = 400,
): string | null => {
  const errorCode = readStructuredErrorCode(error);
  if (!errorCode) {
    return null;
  }
  return toBackendErrorMessage(
    errorCode,
    readStructuredErrorArgs(error),
    readStructuredStatusCode(error) || fallbackStatusCode,
  );
};

const resolveImportAggregateFallbackMessage = (
  code: string,
  args: Record<string, unknown> | undefined,
): string => {
  if (code === LOCAL_DATA_IMPORT_JOB_CANCELED_ERROR_CODE) {
    return formatMessage(getCurrentUiLanguage(), "errors.localData.importCanceled");
  }
  if (!code) {
    return toBackendErrorMessage(UNKNOWN_BACKEND_ERROR_CODE, args, 400);
  }
  return toBackendErrorMessage(code, args, 400);
};

export const resolveUnknownErrorMessage = (
  error: unknown,
  fallback: string,
): string => {
  const statusCode = readStructuredStatusCode(error) || 400;
  const structuredMessage = resolveStructuredBackendErrorMessage(
    error,
    statusCode,
  );
  if (structuredMessage) {
    return structuredMessage;
  }
  if (error instanceof Error) {
    const message = String(error.message || "").trim();
    if (message && isBackendCodeLike(message)) {
      return toBackendErrorMessage(message, readStructuredErrorArgs(error), statusCode);
    }
    if (message && !isBareGenericFailureMessage(message)) {
      return message;
    }
  }
  const rawMessage = typeof error === "string" ? error.trim() : "";
  if (rawMessage && isBackendCodeLike(rawMessage)) {
    return toBackendErrorMessage(rawMessage, undefined, statusCode);
  }
  if (rawMessage && !isBareGenericFailureMessage(rawMessage)) {
    return rawMessage;
  }
  return resolveFallbackMessage(fallback, error, statusCode);
};

export const resolveLocalDataImportJobErrorMessage = (
  rawErrorMessage: unknown,
  structuredError?: unknown,
): string => {
  const errorInput = structuredError ?? rawErrorMessage;
  const { code: rawCode, args } =
    resolveImportJobStructuredError(errorInput);
  const code = (rawCode || String(rawErrorMessage ?? "")).trim().toUpperCase();
  if (code === LOCAL_DATA_IMPORT_JOB_CANCELED_ERROR_CODE) {
    return resolveImportAggregateFallbackMessage(code, args);
  }
  const message = resolveImportAggregateFallbackMessage(code, args);
  if (message.trim() && !isBareGenericFailureMessage(message)) {
    return message;
  }
  return toBackendErrorMessage(
    code || UNKNOWN_BACKEND_ERROR_CODE,
    {
      ...(args ?? {}),
      reason: code || LOCAL_DATA_IMPORT_FAILURE_WITHOUT_CODE_ERROR_CODE,
    },
    400,
  );
};

export const reportAppError = (
  error: unknown,
  options: {
    fallbackMessage: string;
    title?: string;
    autoCloseMs?: number;
  },
): string => {
  const message = resolveUnknownErrorMessage(error, options.fallbackMessage);
  showGlobalErrorDialog(message, options.title, options.autoCloseMs);
  return message;
};
