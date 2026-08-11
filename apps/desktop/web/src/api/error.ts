// SPDX-License-Identifier: GPL-3.0-only

export type ApiError = Error & {
  args?: Record<string, unknown>;
  cause?: unknown;
  code?: string;
  details?: unknown;
  path?: string;
  requestId?: string;
  status?: number;
  statusCode?: number;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toTrimmedString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const toFiniteStatus = (value: unknown): number | undefined => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric) : undefined;
};

const RETRYABLE_BACKEND_TRANSPORT_ERROR_CODES = [
  "BACKEND_NOT_READY",
  "BACKEND_TRANSPORT_UNAVAILABLE",
  "BACKEND_HTTP_REQUEST_FAILED",
  "BACKEND_HTTP_RESPONSE_INVALID",
] as const;

export const createApiError = (
  message: string,
  code?: string | null,
  args?: Record<string, unknown>,
  statusCode?: number,
): ApiError => {
  const error = new Error(message) as ApiError;
  const normalizedCode = String(code ?? "").trim();
  if (normalizedCode) {
    error.code = normalizedCode;
  }
  if (isPlainRecord(args)) {
    error.args = args;
    if ("cause" in args) {
      error.cause = args.cause;
    }
    if ("details" in args) {
      error.details = args.details;
    }
    const requestId = toTrimmedString(args.requestId);
    if (requestId) {
      error.requestId = requestId;
    }
    const path = toTrimmedString(args.path) || toTrimmedString(args.routePath);
    if (path) {
      error.path = path;
    }
  }
  const normalizedStatus =
    toFiniteStatus(statusCode) ??
    (isPlainRecord(args)
      ? toFiniteStatus(args.statusCode) ?? toFiniteStatus(args.status)
      : undefined);
  if (normalizedStatus !== undefined) {
    error.statusCode = normalizedStatus;
    error.status = normalizedStatus;
  }
  return error;
};

export const hasApiErrorCode = (error: unknown, code: string): boolean => {
  if (!error || typeof error !== "object" || Array.isArray(error)) {
    return false;
  }
  return (
    String((error as { code?: unknown }).code ?? "").trim().toUpperCase() ===
    String(code || "").trim().toUpperCase()
  );
};

export const isRetryableBackendTransportError = (
  error: unknown,
): boolean =>
  RETRYABLE_BACKEND_TRANSPORT_ERROR_CODES.some((code) =>
    hasApiErrorCode(error, code),
  );
