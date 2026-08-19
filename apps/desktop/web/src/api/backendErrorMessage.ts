// SPDX-License-Identifier: GPL-3.0-only

import { formatStorageBytes } from "@/frontend-kernel/uiOptions";
import { getCurrentUiLanguage } from "@/frontend-kernel/i18n/localeState";
import {
  tt,
  ttf,
  type AppTextKey,
} from "@/frontend-kernel/i18n/messageRuntime";

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const readScalarText = (value: unknown): string => {
  if (value === undefined || value === null) {
    return "";
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).trim();
  }
  return "";
};

const readStructuredCode = (value: unknown): string => {
  const scalar = readScalarText(value);
  if (scalar) {
    return scalar;
  }
  if (!isPlainRecord(value)) {
    return "";
  }
  return (
    readScalarText(value.code) ||
    readScalarText(value.errorCode) ||
    readScalarText(value.reason)
  );
};

const readErrorDetails = (
  args: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined =>
  isPlainRecord(args?.details) ? args.details : undefined;

const readErrorArg = (
  args: Record<string, unknown> | undefined,
  key: string,
): string => {
  const value = args?.[key] ?? readErrorDetails(args)?.[key];
  return readScalarText(value) || readStructuredCode(value);
};

const readUnknownErrorReason = (
  code: string,
  errorArgs: Record<string, unknown> | undefined,
): string => {
  const reason =
    readErrorArg(errorArgs, "reason") ||
    readStructuredCode(errorArgs?.cause) ||
    readErrorArg(errorArgs, "statusReason") ||
    readErrorArg(errorArgs, "message");
  return reason && reason !== code ? reason : "";
};

const formatUnknownBackendErrorMessage = (
  code: string,
  errorArgs: Record<string, unknown> | undefined,
  statusCode: number,
): string => {
  const codeLabel =
    code ||
    (Number.isFinite(statusCode) && statusCode > 0
      ? `HTTP_${Math.floor(statusCode)}`
      : "UNKNOWN_ERROR");
  const reason = readUnknownErrorReason(codeLabel, errorArgs);
  const requestId = readErrorArg(errorArgs, "requestId");
  const segments = [
    codeLabel,
    reason ? `reason: ${reason}` : "",
    requestId ? `requestId: ${requestId}` : "",
  ].filter(Boolean);
  return ttf("appText.operationFailedValue0", [segments.join(" / ")]);
};

const importLimitLabelKeys: Record<string, AppTextKey> = {
  bookmark: "appText.importLimitNameBookmark",
  csvHeaderRowChars: "appText.importLimitNameCsvHeaderRowChars",
  csvRowChars: "appText.importLimitNameCsvRowChars",
  file: "appText.importLimitNameSingleFileBytes",
  fileName: "appText.importLimitNameFileName",
  files: "appText.importLimitNameFiles",
  fullJsonPreviewBytes: "appText.importLimitNameFullJsonPreviewBytes",
  fullJsonPreviewChars: "appText.importLimitNameFullJsonPreviewChars",
  inMemoryTabularFileBytes: "appText.importLimitNameInMemoryTabularFileBytes",
  jsonlLineChars: "appText.importLimitNameJsonlLineChars",
  path: "appText.importLimitNamePath",
  relativePath: "appText.importLimitNameRelativePath",
  singleFileBytes: "appText.importLimitNameSingleFileBytes",
  totalBytes: "appText.importLimitNameTotalBytes",
};

const byteImportLimitNames = new Set([
  "file",
  "fullJsonPreviewBytes",
  "inMemoryTabularFileBytes",
  "singleFileBytes",
  "totalBytes",
]);

const charImportLimitNames = new Set([
  "csvHeaderRowChars",
  "csvRowChars",
  "fileName",
  "fullJsonPreviewChars",
  "jsonlLineChars",
  "path",
  "relativePath",
]);

const resolveImportLimitLabel = (limit: string): string => {
  const key = importLimitLabelKeys[limit];
  return key ? tt(key) : limit || "-";
};

const formatImportLimitMax = (limit: string, maxRaw: string): string => {
  const numericMax = Number(maxRaw);
  if (Number.isFinite(numericMax) && byteImportLimitNames.has(limit)) {
    return formatStorageBytes(numericMax);
  }
  if (Number.isFinite(numericMax) && charImportLimitNames.has(limit)) {
    const language = getCurrentUiLanguage();
    try {
      return new Intl.NumberFormat(language).format(numericMax);
    } catch {
      return maxRaw;
    }
  }
  return maxRaw || "-";
};

const formatSystemDevSimulationFailure = (
  code: string,
  errorArgs: Record<string, unknown> | undefined,
): string => {
  const reason = readErrorArg(errorArgs, "reason");
  const errorName = readErrorArg(errorArgs, "errorName");
  const errorDetail = readErrorArg(errorArgs, "errorDetail");
  const actionableReason =
    reason && reason !== "UNEXPECTED_ERROR" ? reason : "";
  const diagnostic =
    errorDetail && errorName
      ? `${errorName}: ${errorDetail}`
      : errorDetail || actionableReason || errorName || code;
  return ttf("appText.requestValue0", [diagnostic]);
};

export const toBackendErrorMessage = (
  errorCode: string | null | undefined,
  errorArgs: Record<string, unknown> | undefined,
  statusCode: number,
): string => {
  const code = String(errorCode ?? "").trim();
  if (!code) {
    return formatUnknownBackendErrorMessage("", errorArgs, statusCode);
  }
  switch (code) {
    case "INVALID_PARAMS":
      return tt("appText.parameterIncorrect");
    case "INTERNAL_SERVER_ERROR":
    case "APP_PORT_NOT_REGISTERED":
    case "APPLICATION_PORT_MODULE_INVALID":
      return tt("appText.serverInternalError");
    case "UPLOAD_FILES_REQUIRED":
      return tt("appText.provideLeastOneImportableFile");
    case "LOCAL_DATA_SOURCE_TIMEZONE_REIMPORT_REQUIRED":
      return tt("appText.changingTimeZoneRequiresFullReimport");
    case "LOCAL_DATA_TRADING_CALENDAR_INVALID":
      return tt("appText.tradingCalendarInvalid");
    case "LOCAL_MARKET_DATA_NEEDS_ATTENTION":
      return tt("appText.localDataNeedsAttentionBeforeStartup");
    case "LOCAL_DATA_MARKET_DESTRUCTIVE_VERIFY_FAILED":
    case "LOCAL_DATA_SOURCE_MARKET_SUMMARY_MISMATCH":
    case "LOCAL_DATA_SQLITE_DESTRUCTIVE_VERIFY_FAILED":
    case "SYSTEM_SEED_METADATA_MISMATCH":
    case "SYSTEM_SEED_METADATA_MISSING":
      return tt("appText.dataVerification");
    case "LOCAL_DATA_SOURCE_TIMEZONE_CONFLICT":
      return tt("appText.anotherLocalDataSourceAlreadyUsesSymbolTimeframe");
    case "LOCAL_DATA_SOURCE_PROFILE_LOCKED":
      return tt("appText.diagnosticProfileLocked");
    case "LOCAL_DATA_IMPORT_DUPLICATE_SYMBOL_IN_POOL":
      return ttf("appText.samplePoolDuplicateSymbolValue0", [
        readErrorArg(errorArgs, "symbol") ||
          readErrorArg(errorArgs, "fileName") ||
          "-",
      ]);
    case "CSV_MAPPING_FORMAT_INVALID":
      return tt("appText.importFieldMappingFormatInvalid");
    case "TRAINING_PROJECT_NOT_FOUND":
      return tt("appText.historyTrainingProgramDoesExist");
    case "REPLAY_NOTE_NOT_FOUND":
      return tt("appText.noteDoesExist");
    case "REPLAY_NOTE_SAVE_FAILED":
      return tt("appText.saveNote2");
    case "REPLAY_NOTE_UPDATE_FAILED":
      return tt("appText.noteUpdate");
    case "CSV_FIELD_UNRECOGNIZED":
      return ttf("appText.unrecognizedFieldValue0", [
        readErrorArg(errorArgs, "field"),
      ]);
    case "CSV_MAPPING_REQUIRED":
      return ttf("appText.missingFieldMappingValue0", [
        readErrorArg(errorArgs, "field"),
      ]);
    case "CSV_MAPPING_HEADER_MISSING":
      return ttf("appText.fieldMappingDoesExistImportFileHeaderValue0Value1", [
        readErrorArg(errorArgs, "field"),
        readErrorArg(errorArgs, "header"),
      ]);
    case "CSV_MAPPING_DUPLICATED":
      return ttf("appText.duplicateFieldMappingValue0", [
        readErrorArg(errorArgs, "field"),
      ]);
    case "CSV_FILE_MISSING":
      return ttf("appText.importFileDoesExistValue0", [
        readErrorArg(errorArgs, "filePath"),
      ]);
    case "CSV_FOLDER_NO_FILES":
      return tt("appText.importableFileFoundFolder");
    case "LOCAL_DATA_IMPORT_LIMIT_EXCEEDED":
      return ttf("appText.importLimitExceededValue0Value1", [
        resolveImportLimitLabel(readErrorArg(errorArgs, "limit")),
        formatImportLimitMax(
          readErrorArg(errorArgs, "limit"),
          readErrorArg(errorArgs, "max"),
        ),
      ]);
    case "LOCAL_DATA_SOURCE_NAME_TOO_LONG":
    case "REPLAY_NOTE_ID_INVALID":
    case "REPLAY_NOTE_SOURCE_TOO_LONG":
    case "REPLAY_NOTE_TITLE_TOO_LONG":
    case "REPLAY_NOTE_CONTENT_TOO_LARGE":
    case "CUSTOM_INDICATOR_PROFILE_NAME_TOO_LONG":
    case "CUSTOM_INDICATOR_PARAMETER_INVALID":
    case "CUSTOM_INDICATOR_PROFILES_INVALID":
      return ttf("appText.inputExceedsLimitValue0", [
        readErrorArg(errorArgs, "max") || "-",
      ]);
    case "BARS_RANGE_LIMIT_EXCEEDED":
      return ttf("appText.inputExceedsLimitValue0", [
        readErrorArg(errorArgs, "limit") || "-",
      ]);
    case "CSV_HEADER_SCHEMA_INCONSISTENT":
      return tt("appText.importableFilesFolderTreeMustUseSameHeader");
    case "CSV_IMPORT_FORMAT_INCONSISTENT":
    case "CSV_DIALECT_MISMATCH":
      return tt("appText.importedFilesInconsistentImportConfiguration");
    case "CSV_SYMBOL_COLUMN_MIXED":
      return tt("appText.importFileContainsMultipleSymbols");
    case "CSV_REQUIRED_FIELD_INVALID":
      return tt("appText.importDiagnosticRequiredFieldMissing");
    case "CSV_INVALID_OHLC":
      return tt("appText.importDiagnosticOhlcOutOfRange");
    case "CSV_DUPLICATE_TIMESTAMP_CONFLICT":
      return tt("appText.importDiagnosticDuplicateTimestampConflict");
    case "CSV_TIMEFRAME_INCONSISTENT":
      return ttf("appText.sampledFileTimeframeInconsistentValue0", [
        readErrorArg(errorArgs, "timeframes") || "-",
      ]);
    case "CSV_TIMEFRAME_INVALID":
      return ttf("appText.unsupportedPeriod1m5m1hValue0", [
        readErrorArg(errorArgs, "value") || "-",
      ]);
    case "LOCAL_DATA_SOURCE_SCOPE_MISMATCH":
      return tt("appText.selectedFolderDoesMatchTargetDataSourceTimeframe");
    case "CSV_SYMBOL_CONFLICT_WITH_SYSTEM":
      return tt("appText.targetDataSourceUnavailableSoFullReimportContinue");
    case "CSV_PARSE_FAILED":
    case "CSV_ENCODING_UNSUPPORTED":
      return tt("appText.importFileParsing");
    case "CSV_HEADER_READ_FAILED":
      return tt("appText.importFileHeaderReading");
    case "CSV_NO_VALID_BARS":
      return tt("appText.validLineDataFoundImportFile");
    case "CSV_FILENAME_INVALID":
      return ttf("appText.invalidFileNameValue0", [
        readErrorArg(errorArgs, "fileName"),
      ]);
    case "CSV_FILE_IMPORT_FAILED": {
      const fileName = readErrorArg(errorArgs, "fileName");
      const reasonCode =
        readErrorArg(errorArgs, "reason") ||
        readStructuredCode(errorArgs?.cause);
      const reasonText =
        reasonCode && reasonCode !== "CSV_FILE_IMPORT_FAILED"
          ? toBackendErrorMessage(reasonCode, errorArgs, statusCode)
          : formatUnknownBackendErrorMessage(code, errorArgs, statusCode);
      return ttf("appText.value0Value15", [
        fileName,
        reasonText ||
          formatUnknownBackendErrorMessage(code, errorArgs, statusCode),
      ]);
    }
    case "LOCAL_DATA_IMPORT_JOB_CANCELED":
    case "LOCAL_DATA_IMPORT_PREVIEW_INTERRUPTED":
    case "BACKEND_HTTP_REQUEST_CANCELED":
    case "BACKTEST_RUN_CANCELLED":
      return tt("appText.requestCanceled");
    case "LOCAL_DATA_IMPORT_JOB_TIMEOUT":
    case "LOCAL_DATA_IMPORT_PREVIEW_TIMEOUT":
      return tt("appText.requestTimedOutTryAgainLater");
    case "LOCAL_DATA_IMPORT_JOB_ACTIVE":
    case "LOCAL_DATA_SOURCE_MUTATION_IN_PROGRESS":
    case "LOCAL_DATA_SOURCE_MUTATION_OWNERSHIP_LOST":
    case "LOCAL_DATA_SOURCE_IMPORTING":
      return tt("appText.systemProcessingWait");
    case "LOCAL_DATA_IMPORT_JOB_NOT_FOUND":
      return tt("appText.import");
    case "LOCAL_DATA_IMPORT_PREVIEW_FAILED":
      return tt("appText.importPreviewFailed");
    case "LOCAL_DATA_IMPORT_PREVIEW_EXPIRED":
    case "LOCAL_DATA_IMPORT_PREVIEW_SCOPE_MISMATCH":
      return tt("appText.importConfigurationExpiredRescanFolder");
    case "LOCAL_DATA_INCREMENTAL_REIMPORT_REQUIRED":
      return tt(
        "appText.incrementalSyncPrependsAppendsEdgeDataHistoricalRepairs",
      );
    case "LOCAL_DATA_SOURCE_NOT_FOUND":
      return tt("appText.import");
    case "LOCAL_DATA_SOURCE_NOT_READY":
      return tt("appText.localDataSourceNotReadyRepairOrReimport");
    case "PROFILE_SOURCE_EMPTY":
      return tt("appText.customIndicatorProfileSourceRequired");
    case "PROFILE_SOURCE_TOO_LONG":
      return ttf("appText.inputExceedsLimitValue0", [
        readErrorArg(errorArgs, "max") || "-",
      ]);
    case "PROFILE_NAME_EMPTY":
      return tt("appText.customIndicatorProfileNameRequired");
    case "PROFILE_STORAGE_LIMIT_EXCEEDED":
      return ttf("appText.indicatorProfileStorageExceededValue0Value1Bytes", [
        readErrorArg(errorArgs, "bytes") || "-",
        readErrorArg(errorArgs, "maxBytes") || "-",
      ]);
    case "BACKTEST_BATCH_NOT_FOUND":
      return tt("trainer.strategyBacktest.errorBatchNotFound");
    case "BACKTEST_BATCH_ACTIVE":
      return tt("trainer.strategyBacktest.errorBatchActive");
    case "BACKTEST_RESULT_NOT_FOUND":
      return tt("trainer.strategyBacktest.errorResultNotFound");
    case "BACKTEST_NO_MARKET_BARS":
      return tt("trainer.strategyBacktest.errorNoMarketBars");
    case "BACKTEST_UNIVERSE_EMPTY":
      return tt("trainer.strategyBacktest.errorUniverseEmpty");
    case "BACKTEST_STRATEGY_COMPILE_FAILED":
      return tt("trainer.strategyBacktest.errorCompileFailed");
    case "BACKTEST_STRATEGY_RUNTIME_FAILED":
      return tt("trainer.strategyBacktest.errorRuntimeFailed");
    case "BACKTEST_SIGNAL_RULE_INVALID_CONSTANT":
      return tt("trainer.strategyBacktest.errorSignalRuleInvalidConstant");
    case "BACKTEST_SIGNAL_RULE_INVALID_OUTPUT":
      return tt("trainer.strategyBacktest.errorSignalRuleInvalidOutput");
    case "BACKTEST_NATIVE_ENGINE_UNAVAILABLE":
    case "BACKTEST_NATIVE_ENGINE_INVALID_RESPONSE":
    case "BACKTEST_NATIVE_ENGINE_FAILED":
    case "BACKTEST_NATIVE_BATCH_FAILED":
    case "BACKTEST_NATIVE_DIFFERENTIAL_MISMATCH":
    case "BACKTEST_RUN_FAILED":
      return tt("trainer.strategyBacktest.errorGeneric");
    case "BACKTEST_NATIVE_BATCH_TIMEOUT":
      return tt("trainer.strategyBacktest.errorNativeBatchTimeout");
    case "BACKTEST_NATIVE_BATCH_UNSUPPORTED":
      return tt("trainer.strategyBacktest.errorNativeBatchUnsupported");
    case "BACKTEST_NATIVE_BATCH_INVALID_RESPONSE":
      return tt("trainer.strategyBacktest.errorNativeBatchInvalidResponse");
    case "BACKTEST_NATIVE_BATCH_INCOMPLETE":
      return tt("trainer.strategyBacktest.errorNativeBatchIncomplete");
    case "SESSION_NOT_FOUND":
      return tt("appText.sessionDoesExist");
    case "SECURITIES_ACCOUNT_NOT_FOUND":
      return tt("appText.securitiesAccountDoesExist");
    case "SESSION_TRADING_SETTINGS_CORRUPTED":
      return tt("appText.tradingSystemInvalid");
    case "TRADING_SETTINGS_INVALID_NUMBER":
      return tt("appText.tradingSetupMustValidNumber");
    case "TRADING_ASSET_CLASS_INVALID":
    case "TRADING_MARKET_PRESET_INVALID":
    case "TRADING_STEP_OR_MULTIPLIER_INVALID":
    case "ALLOW_LONG_MARGIN_MODE_INVALID":
      return tt("appText.tradingSetupMustValidNumber");
    case "TRADING_INITIAL_BALANCE_LOCKED":
      return tt(
        "appText.replayAlreadyFilledTradesInitialAvailableFundsChanged",
      );
    case "TRADING_INITIAL_BALANCE_NEGATIVE":
      return tt("appText.initialAmountLessThan0");
    case "TRADING_RATE_NEGATIVE":
      return tt("appText.rateLessThan0");
    case "STAMP_DUTY_MODE_INVALID":
      return tt("appText.stampDutyModeInvalid");
    case "POSITION_COST_MODE_INVALID":
      return tt("appText.holdingCostModelInvalid");
    case "TRADE_SETTLEMENT_MODE_INVALID":
    case "FREE_REPLAY_END_SETTLEMENT_MODE_INVALID":
      return tt("appText.tradingSystemInvalid");
    case "TRADE_AMOUNT_MODE_INVALID":
      return tt("appText.transactionAmountCaliberInvalid");
    case "ALLOW_SHORT_SELLING_MODE_INVALID":
      return tt("appText.tradingSetupMustValidNumber");
    case "FREE_REPLAY_SELECTION_STALE":
      return tt("appText.freeReplaySelectionStale");
    case "SPECIAL_TRAINING_SYMBOLS_REQUIRED":
      return tt("appText.samplePoolEmptyImportEnableSamplePool");
    case "SPECIAL_TRAINING_SYMBOLS_NO_DATA":
      return tt("appText.replayableSymbolsSamplePool");
    case "SPECIAL_TRAINING_BANK_NAME_TOO_LONG":
      return ttf("trainer.specialTrainingBanks.errorNameTooLong", [
        readErrorArg(errorArgs, "max") || "-",
      ]);
    case "SPECIAL_TRAINING_BANK_NAME_REQUIRED":
    case "SPECIAL_TRAINING_BANK_SCOPE_REQUIRED":
    case "SPECIAL_TRAINING_BANK_ASSET_CLASS_INVALID":
    case "SPECIAL_TRAINING_BANK_TARGET_TIMEFRAME_INVALID":
    case "SPECIAL_TRAINING_HORIZON_INVALID":
    case "SPECIAL_TRAINING_DECISION_SECONDS_INVALID":
    case "SPECIAL_TRAINING_FAST_DECISION_STRICTNESS_INVALID":
    case "SPECIAL_TRAINING_MAX_OPERATIONS_INVALID":
      return tt("appText.parameterIncorrect");
    case "SPECIAL_TRAINING_BANK_NOT_FOUND":
      return tt("appText.sessionDoesExist");
    case "SPECIAL_TRAINING_QUESTION_COUNT_INVALID":
      return tt("appText.parameterIncorrect");
    case "SPECIAL_TRAINING_FAST_DECISION_REQUIRED":
    case "SPECIAL_TRAINING_MODE_INVALID":
      return tt("appText.parameterIncorrect");
    case "SPECIAL_TRAINING_CHALLENGE_NOT_FOUND":
      return tt("appText.sessionDoesExist");
    case "SPECIAL_TRAINING_QUESTION_NOT_FOUND":
      return tt("appText.sessionDoesExist");
    case "SPECIAL_TRAINING_HISTORY_SESSION_NOT_FOUND":
      return tt("appText.sessionDoesExist");
    case "SPECIAL_TRAINING_HISTORY_CLEAR_BLOCKED_BY_NOTE_CONTEXT":
      return tt("appText.sessionDoesExist");
    case "SPECIAL_TRAINING_HISTORY_PERSIST_FAILED":
      return formatUnknownBackendErrorMessage(code, errorArgs, statusCode);
    case "SPECIAL_TRAINING_QUESTION_GENERATION_FAILED": {
      const reason = readErrorArg(errorArgs, "reason");
      if (reason === "SLOT_WINDOW_MISSING") {
        return tt(
          "appText.temporarySimulationEncounteredIncompleteMarketWindowWhileGenerating",
        );
      }
      return tt(
        "appText.temporarySimulationWhileGeneratingSpecialTrainingQuestionsClear",
      );
    }
    case "SPECIAL_TRAINING_BAR_DATA_INVALID":
      return formatUnknownBackendErrorMessage(code, errorArgs, statusCode);
    case "SYSTEM_DEV_SIMULATION_JOB_ACTIVE":
      return tt(
        "appText.simulationJobStillRunningCleanupTemporarilyUnavailable",
      );
    case "SYSTEM_DEV_SIMULATION_CLEANUP_ACTIVE":
      return tt(
        "appText.simulationCleanupStillRunningGenerationTemporarilyUnavailable",
      );
    case "SYSTEM_DEV_SIMULATION_PROFILE_UNAVAILABLE":
      return tt("appText.desktopBackendLoadedCleanupEndpointYetRestartApp");
    case "SYSTEM_DEV_SIMULATION_INVALID":
    case "SYSTEM_DEV_SIMULATION_FAILED":
      return formatSystemDevSimulationFailure(code, errorArgs);
    case "SYSTEM_DEV_SIMULATION_JOB_NOT_FOUND":
    case "SYSTEM_DEV_SIMULATION_CLEANUP_REQUIRED":
      return tt("appText.simulationJobStateLostClearSimulationDataBefore");
    case "SYSTEM_DEV_SIMULATION_INTERRUPTED":
      return tt("appText.requestCanceled");
    case "SYSTEM_DEV_SIMULATION_CLEANUP_JOB_NOT_FOUND":
      return tt("appText.desktopBackendLoadedCleanupEndpointYetRestartApp");
    case "HISTORY_RETENTION_JOB_NOT_FOUND":
      return tt("settings.storage.historyRetention.job.none");
    case "HISTORY_RETENTION_JOB_ACTIVE":
      return tt("appText.systemProcessingWait");
    case "HISTORY_RETENTION_JOB_TIMEOUT":
      return tt("appText.requestTimedOutTryAgainLater");
    case "HISTORY_RETENTION_JOB_INTERRUPTED":
      return tt("appText.requestCanceled");
    case "HISTORY_RETENTION_JOB_FAILED":
      return tt("appText.request");
    case "MARGIN_RATIO_INVALID":
      return tt(
        "appText.invalidMarginSettingsCheckRatioRangeInitialMaintenance",
      );
    case "MARGIN_RATIO_RELATION_INVALID":
      return tt(
        "appText.invalidMarginSettingsCheckRatioRangeInitialMaintenance",
      );
    case "FILL_BAR_NOT_FOUND":
      return tt("appText.transactionKlineDoesExist");
    case "FILL_QTY_INVALID":
      return tt("appText.transactionQuantityInvalid");
    case "NEXT_OPEN_DELAY_REQUIRED":
      return tt("appText.nextOpenExecutionPlanMissingRefreshRetry");
    case "ACCOUNT_BALANCE_INSUFFICIENT":
      return tt("appText.insufficientFundsAvailableSecuritiesAccount");
    case "BACKEND_BRIDGE_UNAUTHORIZED":
    case "BACKEND_TRANSPORT_REQUIRED":
    case "SYSTEM_STARTUP_BLOCKED":
      return formatUnknownBackendErrorMessage(code, errorArgs, statusCode);
    case "PORTABLE_EXPORT_PATH_REQUIRED":
    case "PORTABLE_IMPORT_PATH_REQUIRED":
    case "LOCAL_IMPORT_MOCK_SAMPLE_EXPORT_PATH_REQUIRED":
      return tt("appText.portableTransferPathRequired");
    case "LOCAL_IMPORT_MOCK_SAMPLE_EXPORT_PATH_EXTENSION_INVALID":
    case "LOCAL_IMPORT_MOCK_SAMPLE_EXPORT_FAILED":
      return tt("appText.request");
    case "PORTABLE_PACKAGE_INVALID":
    case "PORTABLE_PACKAGE_TAMPERED":
    case "PORTABLE_PACKAGE_UNSUPPORTED":
    case "PORTABLE_DATA_IMPORT_INVALID":
      return tt("appText.portablePackageInvalid");
    case "PORTABLE_DOMAIN_SELECTION_REQUIRED":
      return tt("appText.portableTransferDomainSelectionRequired");
    case "PORTABLE_IMPORT_PREVIEW_STALE":
      return tt("appText.importPreviewFailed");
    case "PORTABLE_MARKET_DATA_LEGAL_CONFIRM_REQUIRED":
      return tt("appText.portableMarketDataLegalConfirmRequired");
    case "LOCAL_DATA_IMPORT_JOB_CONTROL_INVALID":
    case "CUSTOM_INDICATOR_PROFILES_INVALID":
      return tt("appText.parameterIncorrect");
    case "MARKET_STORAGE_REMOVAL_FAILED":
      return tt("appText.localDataResetFailed");
    case "RESET_ALL_DATA_FAILED":
    case "RESET_ALL_DATA_JOURNAL_READ_FAILED":
    case "RESET_ALL_DATA_JOURNAL_UPDATE_FAILED":
    case "RESET_ALL_DATA_RECOVERY_FAILED":
      return tt("appText.oneClickReset");
    case "RESET_ALL_DATA_JOB_DEADLINE_EXCEEDED":
    case "RESET_ALL_DATA_RECOVERY_DEADLINE_EXCEEDED":
      return tt("appText.requestTimedOutTryAgainLater");
    case "RESET_ALL_DATA_PARTIAL_FAILED": {
      const cause = readErrorArg(errorArgs, "cause");
      if (cause && cause !== code) {
        return toBackendErrorMessage(cause, errorArgs, statusCode);
      }
      return tt("appText.oneClickReset");
    }
    case "LOCAL_DATA_DESTRUCTIVE_OPERATION_PARTIAL_FAILED": {
      const cause = readErrorArg(errorArgs, "cause");
      if (cause && cause !== code) {
        return toBackendErrorMessage(cause, errorArgs, statusCode);
      }
      return tt("appText.import");
    }
    case "SYSTEM_RESET_IN_PROGRESS":
    case "SYSTEM_RESET_JOB_NOT_FOUND":
      return tt("appText.oneClickReset");
    case "T1_SELL_LIMIT":
      return ttf("appText.plus1RestrictionSharesPurchasedDaySoldSameValue0", [
        readErrorArg(errorArgs, "sellableQty"),
      ]);
    case "POSITION_INSUFFICIENT":
      return tt("appText.insufficientPositionsUnableSell");
    case "SHORT_SELLING_DISABLED":
      return tt("appText.shortSellingDisabledSellingExistingHoldingsAllowed");
    case "SHORT_MARGIN_INSUFFICIENT":
      return ttf(
        "appText.insufficientShortMarginRequiredValue0AvailableValue1",
        [
          readErrorArg(errorArgs, "requiredEquity"),
          readErrorArg(errorArgs, "availableEquity"),
        ],
      );
    case "MARGIN_MAINTENANCE_INSUFFICIENT":
      return ttf(
        "appText.maintenanceMarginInsufficientRequiredValue0AvailableValue1",
        [
          readErrorArg(errorArgs, "requiredEquity"),
          readErrorArg(errorArgs, "availableEquity"),
        ],
      );
    case "INSTRUMENT_NOT_FOUND":
      return ttf("appText.symbolDoesExistValue0", [
        readErrorArg(errorArgs, "symbol"),
      ]);
    case "INSTRUMENT_NOT_ENOUGH_BARS":
    case "INSTRUMENT_NO_BARS":
      return ttf("appText.lineDataSymbolValue0", [
        readErrorArg(errorArgs, "symbol"),
      ]);
    case "MARKET_BAR_FRAME_INVALID_NUMBER":
    case "MARKET_BAR_FRAME_INVALID_TIMESTAMP":
      return formatUnknownBackendErrorMessage(code, errorArgs, statusCode);
    case "TIMELINE_NOT_READY":
      return tt("appText.systemProcessingWait");
    case "MARKET_TIMELINE_FIXED_PERIOD_INVALID":
    case "MARKET_TIMELINE_BOUNDARY_INVALID":
    case "MARKET_TIMELINE_BOUNDARY_GUARD_EXCEEDED":
    case "MARKET_TIMELINE_STAGE_INVALID":
      return formatUnknownBackendErrorMessage(code, errorArgs, statusCode);
    case "CURRENT_BAR_NOT_FOUND":
      return tt("appText.klineDoesExist");
    case "ORDER_QTY_OR_AMOUNT_REQUIRED":
      return tt("appText.quantityAmountMustFilledOne0");
    case "ORDER_BLOCKED": {
      const blockedReason = String(
        readErrorArg(errorArgs, "blockedReason") ?? "",
      ).trim();
      return blockedReason || tt("appText.order");
    }
    case "NEXT_BAR_NOT_FOUND":
      return tt("appText.nextKline2");
    case "INSTRUMENT_INFO_NOT_FOUND":
      return tt("appText.symbolInfoFound");
    case "PROJECT_NAME_REQUIRED":
      return tt("appText.projectNameEmpty");
    case "HISTORY_PROJECT_SAVE_FAILED":
    case "TRAINING_PROJECT_REPLAY_ARCHIVE_FAILED":
    case "TRAINING_PROJECT_REPLAY_ARCHIVE_TOO_LARGE":
    case "TRAINING_PROJECT_REPLAY_REF_SAVE_FAILED":
      return tt("appText.saveHistoricalTraining");
    case "TRAINING_PROJECT_DELETE_BLOCKED_BY_NOTE_CONTEXT":
      return tt("appText.deleteHistoricalTraining");
    case "REPLAY_NOTE_META_TOO_LARGE":
      return ttf("appText.trainingSnapshotValue0DataTooLargeSaved", [
        readErrorArg(errorArgs, "part"),
      ]);
    case "REPLAY_NOTE_SNAPSHOT_SOURCE_TOO_LARGE":
      return ttf("appText.trainingSnapshotValue0DataTooLargeSaved", [
        readErrorArg(errorArgs, "part"),
      ]);
    case "REPLAY_NOTE_SNAPSHOT_COMPRESSED_TOO_LARGE":
      return ttf("appText.trainingSnapshotValue0StillTooLargeSaveAfter", [
        readErrorArg(errorArgs, "part"),
      ]);
    default:
      return formatUnknownBackendErrorMessage(code, errorArgs, statusCode);
  }
};
