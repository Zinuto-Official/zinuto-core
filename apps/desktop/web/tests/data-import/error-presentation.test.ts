// SPDX-License-Identifier: GPL-3.0-only

import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createApiError, toBackendErrorMessage } from "../../src/api";
import { tt } from "../../src/frontend-kernel/i18n/messageRuntime";
import { setCurrentUiLanguage } from "../../src/frontend-kernel/i18n/localeState";
import {
  resolveLocalDataImportJobErrorMessage,
  resolveUnknownErrorMessage,
} from "../../src/frontend-kernel/errors/appErrorUtils";
import {
  APP_ERROR_DIALOG_AUTO_CLOSE_MS,
  showGlobalErrorDialog,
  subscribeToGlobalNoticeDialog,
} from "../../src/frontend-kernel/notifications/globalNoticeDialog";

beforeEach(() => {
  setCurrentUiLanguage("en", { source: "USER", storage: null });
});

test("structured backend errors resolve to mapped product copy", () => {
  const resolved = resolveUnknownErrorMessage(
    {
      code: "CSV_SYMBOL_CONFLICT_WITH_SYSTEM",
      statusCode: 400,
    },
    "fallback-message",
  );

  assert.equal(
    resolved,
    toBackendErrorMessage("CSV_SYMBOL_CONFLICT_WITH_SYSTEM", undefined, 400),
  );
});

test("ApiError retains structured diagnostics", () => {
  const details = { field: "timestamp", value: "bad.csv" };
  const cause = { code: "CSV_TIMEFRAME_INVALID", stage: "SCANNING" };
  const error = createApiError(
    "failed",
    "LOCAL_DATA_IMPORT_ALL_FAILED",
    {
      cause,
      details,
      path: "/api/v1/data-sources/import/from-paths",
      requestId: "req_123",
    },
    422,
  );

  assert.equal(error.code, "LOCAL_DATA_IMPORT_ALL_FAILED");
  assert.equal(error.statusCode, 422);
  assert.equal(error.status, 422);
  assert.equal(error.path, "/api/v1/data-sources/import/from-paths");
  assert.equal(error.requestId, "req_123");
  assert.equal(error.cause, cause);
  assert.equal(error.details, details);
  assert.equal(error.args?.details, details);
});

test("unknown backend codes include code, reason, and request id", () => {
  const resolved = toBackendErrorMessage(
    "NEW_BACKEND_CODE",
    {
      reason: "LOCAL_OPERATION_EXPIRED",
      requestId: "req_local_1",
    },
    503,
  );

  assert.match(resolved, /Operation failed/);
  assert.match(resolved, /NEW_BACKEND_CODE/);
  assert.match(resolved, /LOCAL_OPERATION_EXPIRED/);
  assert.match(resolved, /req_local_1/);
  assert.notEqual(resolved, tt("appText.request"));
});

test("bare generic error messages fall back instead of leaking raw transport copy", () => {
  assert.equal(
    resolveUnknownErrorMessage(new Error(tt("appText.request")), "fallback-message"),
    "fallback-message",
  );
  assert.equal(
    resolveUnknownErrorMessage("Import failed", "fallback-message"),
    "fallback-message",
  );
});

test("local data import limit errors use readable limit labels", () => {
  const resolved = toBackendErrorMessage(
    "LOCAL_DATA_IMPORT_LIMIT_EXCEEDED",
    {
      limit: "singleFileBytes",
      max: 20 * 1024 * 1024 * 1024,
    },
    400,
  );

  assert.match(resolved, /single file size/i);
  assert.match(resolved, /20\.00 GB/);
  assert.doesNotMatch(resolved, /singleFileBytes/);
});

test("local import preview timeframe errors use backend translation with file context", () => {
  const resolved = toBackendErrorMessage(
    "CSV_TIMEFRAME_INVALID",
    { value: "SZ000001.csv" },
    400,
  );

  assert.match(resolved, /SZ000001\.csv/);
  assert.doesNotMatch(resolved, /CSV_TIMEFRAME_INVALID/);
});

test("local import execution deadlines use an actionable timeout message", () => {
  assert.equal(
    toBackendErrorMessage("LOCAL_DATA_IMPORT_PREVIEW_TIMEOUT", { timeoutMs: 900_000 }, 408),
    tt("appText.requestTimedOutTryAgainLater"),
  );
  assert.equal(
    toBackendErrorMessage("LOCAL_DATA_IMPORT_JOB_TIMEOUT", { timeoutMs: 21_600_000 }, 408),
    tt("appText.requestTimedOutTryAgainLater"),
  );
});

test("interrupted previews and reset recovery failures use product recovery copy", () => {
  assert.equal(
    toBackendErrorMessage("LOCAL_DATA_IMPORT_PREVIEW_INTERRUPTED", undefined, 409),
    tt("appText.requestCanceled"),
  );
  for (const code of [
    "RESET_ALL_DATA_JOURNAL_READ_FAILED",
    "RESET_ALL_DATA_JOURNAL_UPDATE_FAILED",
    "RESET_ALL_DATA_RECOVERY_FAILED",
  ]) {
    assert.equal(toBackendErrorMessage(code, undefined, 500), tt("appText.oneClickReset"));
  }
  assert.equal(
    toBackendErrorMessage("RESET_ALL_DATA_RECOVERY_DEADLINE_EXCEEDED", undefined, 408),
    tt("appText.requestTimedOutTryAgainLater"),
  );
  assert.equal(
    toBackendErrorMessage("RESET_ALL_DATA_JOB_DEADLINE_EXCEEDED", undefined, 408),
    tt("appText.requestTimedOutTryAgainLater"),
  );
});

test("history retention lifecycle errors stay actionable", () => {
  assert.equal(
    toBackendErrorMessage("HISTORY_RETENTION_JOB_ACTIVE", undefined, 409),
    tt("appText.systemProcessingWait"),
  );
  assert.equal(
    toBackendErrorMessage("HISTORY_RETENTION_JOB_TIMEOUT", undefined, 408),
    tt("appText.requestTimedOutTryAgainLater"),
  );
  assert.equal(
    toBackendErrorMessage("HISTORY_RETENTION_JOB_INTERRUPTED", undefined, 409),
    tt("appText.requestCanceled"),
  );
});

test("active source mutation errors use processing copy", () => {
  for (const errorCode of [
    "LOCAL_DATA_SOURCE_IMPORTING",
    "LOCAL_DATA_SOURCE_MUTATION_IN_PROGRESS",
    "LOCAL_DATA_SOURCE_MUTATION_OWNERSHIP_LOST",
  ]) {
    const resolved = toBackendErrorMessage(errorCode, undefined, 409);

    assert.equal(resolved, tt("appText.systemProcessingWait"));
  }
});

test("non-ready local data sources tell the user how to recover", () => {
  const resolved = toBackendErrorMessage("LOCAL_DATA_SOURCE_NOT_READY", undefined, 409);

  assert.equal(resolved, tt("appText.localDataSourceNotReadyRepairOrReimport"));
  assert.notEqual(resolved, tt("appText.systemProcessingWait"));
});

test("backend transport authorization errors keep diagnostic context", () => {
  const resolved = toBackendErrorMessage(
    "BACKEND_BRIDGE_UNAUTHORIZED",
    { requestId: "req_bridge_1" },
    401,
  );

  assert.match(resolved, /BACKEND_BRIDGE_UNAUTHORIZED/);
  assert.match(resolved, /req_bridge_1/);
  assert.notEqual(resolved, tt("appText.import"));
});

test("incremental reimport job errors keep actionable local data copy", () => {
  setCurrentUiLanguage("zh-CN", { source: "USER", storage: null });
  try {
    const resolved = resolveLocalDataImportJobErrorMessage(
      "LOCAL_DATA_INCREMENTAL_REIMPORT_REQUIRED",
    );

    assert.equal(
      resolved,
      tt("appText.incrementalSyncPrependsAppendsEdgeDataHistoricalRepairs"),
    );
    assert.match(resolved, /完整重导入/);
  } finally {
    setCurrentUiLanguage("en", { source: "USER", storage: null });
  }
});

test("no-valid-bars job errors keep actionable local data copy", () => {
  setCurrentUiLanguage("zh-CN", { source: "USER", storage: null });
  try {
    const resolved = resolveLocalDataImportJobErrorMessage("CSV_NO_VALID_BARS");

    assert.equal(resolved, tt("appText.validLineDataFoundImportFile"));
    assert.match(resolved, /没有有效K 线/);
  } finally {
    setCurrentUiLanguage("en", { source: "USER", storage: null });
  }
});

test("structured import job cause details are formatted", () => {
  const resolved = resolveLocalDataImportJobErrorMessage({
    errorCode: "LOCAL_DATA_IMPORT_ALL_FAILED",
    cause: {
      code: "CSV_TIMEFRAME_INVALID",
      stage: "SCANNING",
    },
    details: {
      value: "broken-timeframe.csv",
    },
  });

  assert.match(resolved, /broken-timeframe\.csv/);
  assert.doesNotMatch(resolved, /Import failed/);
});

test("structured failed file errors are formatted from failedFiles", () => {
  const resolved = resolveLocalDataImportJobErrorMessage({
    errorCode: "LOCAL_DATA_IMPORT_PARTIAL_FAILED",
    failedFiles: [
      {
        id: "failed-1",
        fileName: "bad-name.csv",
        symbol: "BAD",
        rowsTotal: 0,
        rowsImported: 0,
        rowsSkipped: 0,
        errorCode: "CSV_FILENAME_INVALID",
        cause: {
          code: "CSV_FILENAME_INVALID",
          stage: "SCANNING",
        },
        details: {},
        errorMessage: "CSV_FILENAME_INVALID",
        updatedAt: "2026-05-19T00:00:00.000Z",
      },
    ],
  });

  assert.match(resolved, /bad-name\.csv/);
  assert.doesNotMatch(resolved, /Import failed/);
});

test("portable transfer backend errors use device-transfer copy", () => {
  assert.equal(
    toBackendErrorMessage("PORTABLE_DOMAIN_SELECTION_REQUIRED", undefined, 400),
    tt("appText.portableTransferDomainSelectionRequired"),
  );
  assert.equal(
    toBackendErrorMessage("PORTABLE_MARKET_DATA_LEGAL_CONFIRM_REQUIRED", undefined, 400),
    tt("appText.portableMarketDataLegalConfirmRequired"),
  );
  assert.equal(
    toBackendErrorMessage("PORTABLE_PACKAGE_TAMPERED", undefined, 400),
    tt("appText.portablePackageInvalid"),
  );
});

test("global error dialog defaults to 8 second auto close", () => {
  const notices: Array<NonNullable<ReturnType<typeof showGlobalErrorDialog>>> = [];
  const unsubscribe = subscribeToGlobalNoticeDialog((notice) => {
    if (notice) {
      notices.push(notice);
    }
  });

  try {
    showGlobalErrorDialog("Import validation failed.");
  } finally {
    unsubscribe();
  }

  assert.equal(notices.length, 1);
  assert.equal(notices[0]?.severity, "error");
  assert.equal(notices[0]?.autoCloseMs, APP_ERROR_DIALOG_AUTO_CLOSE_MS);
});
