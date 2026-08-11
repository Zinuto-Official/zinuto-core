// SPDX-License-Identifier: GPL-3.0-only

const RETRIABLE_TAURI_BRIDGE_METHODS = new Set(["GET"]);

const RETRIABLE_TAURI_BRIDGE_ERROR_CODES = new Set([
  "BACKEND_NOT_READY",
  "BACKEND_TRANSPORT_UNAVAILABLE",
  "BACKEND_HTTP_REQUEST_FAILED",
  "BACKEND_HTTP_RESPONSE_INVALID",
]);

const TAURI_BRIDGE_RETRY_DELAYS_MS = [120, 320] as const;

export const shouldRetryTauriBridgeRequest = ({
  method,
  errorCode,
  attemptIndex,
}: {
  method: string;
  errorCode: string;
  attemptIndex: number;
}): boolean => {
  const normalizedMethod = String(method || "").trim().toUpperCase() || "GET";
  const normalizedErrorCode = String(errorCode || "").trim().toUpperCase();
  const normalizedAttemptIndex = Math.floor(Number(attemptIndex));

  if (!RETRIABLE_TAURI_BRIDGE_METHODS.has(normalizedMethod)) {
    return false;
  }
  if (!RETRIABLE_TAURI_BRIDGE_ERROR_CODES.has(normalizedErrorCode)) {
    return false;
  }
  return (
    Number.isFinite(normalizedAttemptIndex) &&
    normalizedAttemptIndex >= 0 &&
    normalizedAttemptIndex < TAURI_BRIDGE_RETRY_DELAYS_MS.length
  );
};

export const resolveTauriBridgeRetryDelayMs = (attemptIndex: number): number => {
  const normalizedAttemptIndex = Math.floor(Number(attemptIndex));
  if (
    !Number.isFinite(normalizedAttemptIndex) ||
    normalizedAttemptIndex < 0 ||
    normalizedAttemptIndex >= TAURI_BRIDGE_RETRY_DELAYS_MS.length
  ) {
    return 0;
  }
  return TAURI_BRIDGE_RETRY_DELAYS_MS[normalizedAttemptIndex];
};
