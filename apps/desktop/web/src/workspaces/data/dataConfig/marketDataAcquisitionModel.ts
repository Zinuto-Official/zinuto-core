// SPDX-License-Identifier: GPL-3.0-only

import type {
  MarketDataAcquisitionConnectorId,
  MarketDataAcquisitionMarketId,
  MarketDataAcquisitionMarketRequest,
  MarketDataAcquisitionRequest,
  MarketDataAcquisitionSourcePlanId,
  MarketDataAcquisitionTimeframe,
} from "@/api";
import {
  MARKET_DATA_ACQUISITION_ERROR_CODES,
  MARKET_DATA_ACQUISITION_LIMITS,
  type MarketDataAcquisitionErrorCode,
} from "@zinuto/shared/contracts-desktop/api";

export const MARKET_DATA_ACQUISITION_MAX_SYMBOLS =
  MARKET_DATA_ACQUISITION_LIMITS.maxSymbols;

const DATE_INPUT_RE = /^\d{4}-\d{2}-\d{2}$/u;

export const isValidMarketDataAcquisitionDate = (value: string): boolean => {
  if (!DATE_INPUT_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month! - 1 &&
    parsed.getUTCDate() === day
  );
};

export type MarketDataAcquisitionDateIssues = {
  startDate?: "INVALID";
  endDate?: "INVALID" | "BEFORE_START";
};

export const resolveMarketDataAcquisitionDateIssues = (
  startDate: string,
  endDate: string,
): MarketDataAcquisitionDateIssues => {
  const issues: MarketDataAcquisitionDateIssues = {};
  if (!isValidMarketDataAcquisitionDate(startDate)) {
    issues.startDate = "INVALID";
  }
  if (!isValidMarketDataAcquisitionDate(endDate)) {
    issues.endDate = "INVALID";
  } else if (!issues.startDate && endDate < startDate) {
    issues.endDate = "BEFORE_START";
  }
  return issues;
};

const toDateTimeWithOffset = (
  date: string,
  endOfDay: boolean,
  offset: string,
): string => `${date}T${endOfDay ? "23:59:59" : "00:00:00"}${offset}`;

const timeZoneOffsetForDate = (date: string, timeZone: string): string => {
  if (timeZone === "UTC") return "Z";
  const instant = new Date(`${date}T12:00:00Z`);
  try {
    const part = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    })
      .formatToParts(instant)
      .find((entry) => entry.type === "timeZoneName")?.value;
    if (part && /^GMT[+-]\d{2}:\d{2}$/u.test(part)) {
      return part.slice(3);
    }
  } catch {
    // The server owns the IANA zone validation. Returning UTC means this
    // unexpected condition is rejected rather than silently shifted.
  }
  return "Z";
};

export const buildMarketDataAcquisitionMarketRequest = (input: {
  marketId: MarketDataAcquisitionMarketId;
  sourcePlanId: MarketDataAcquisitionSourcePlanId;
  symbols: string[];
  timeframe: MarketDataAcquisitionTimeframe;
  startDate: string;
  endDate: string;
  timeZone: string;
  adjustment: "none" | "qfq" | "hfq" | null;
}): MarketDataAcquisitionMarketRequest => {
  const offset = timeZoneOffsetForDate(input.startDate, input.timeZone);
  const endOffset = timeZoneOffsetForDate(input.endDate, input.timeZone);
  return {
    marketId: input.marketId,
    sourcePlanId: input.sourcePlanId,
    symbols: input.symbols.map((symbol) => symbol.trim().toUpperCase()),
    timeframe: input.timeframe,
    startAt: toDateTimeWithOffset(input.startDate, false, offset),
    endAt: toDateTimeWithOffset(input.endDate, true, endOffset),
    adjustment: input.adjustment,
  };
};

export const buildMarketDataAcquisitionRequest = (input: {
  connectorId: MarketDataAcquisitionConnectorId;
  akshareInstrumentKind?: "A_SHARE" | "INDEX";
  exchangeId: "binance" | "okx";
  symbols: string[];
  timeframe: MarketDataAcquisitionTimeframe;
  startDate: string;
  endDate: string;
  adjustment: "none" | "qfq" | "hfq";
}): MarketDataAcquisitionRequest =>
  input.connectorId === "akshare"
    ? {
        connectorId: "akshare",
        dataset:
          input.akshareInstrumentKind === "INDEX"
            ? "index_zh_a_hist"
            : input.timeframe === "1d"
            ? "stock_zh_a_hist"
            : "stock_zh_a_hist_min_em",
        symbols: input.symbols,
        timeframe: input.timeframe,
        startAt: toDateTimeWithOffset(input.startDate, false, "+08:00"),
        endAt: toDateTimeWithOffset(input.endDate, true, "+08:00"),
        adjustment:
          input.akshareInstrumentKind === "INDEX" ? "none" : input.adjustment,
      }
    : {
        connectorId: "ccxt",
        exchangeId: input.exchangeId,
        marketType: "spot",
        symbols: input.symbols,
        timeframe: input.timeframe,
        startAt: toDateTimeWithOffset(input.startDate, false, "Z"),
        endAt: toDateTimeWithOffset(input.endDate, true, "Z"),
      };

export type MarketDataAcquisitionErrorMessageKey =
  | "appText.marketDataAcquisitionErrorAkshareConnection"
  | "appText.marketDataAcquisitionErrorCanceled"
  | "appText.marketDataAcquisitionErrorConnection"
  | "appText.marketDataAcquisitionErrorFormatChanged"
  | "appText.marketDataAcquisitionErrorInterrupted"
  | "appText.marketDataAcquisitionErrorJobActive"
  | "appText.marketDataAcquisitionErrorJobNotFound"
  | "appText.marketDataAcquisitionErrorLocalValidation"
  | "appText.marketDataAcquisitionErrorMarketUnavailable"
  | "appText.marketDataAcquisitionErrorNoData"
  | "appText.marketDataAcquisitionErrorRangeTooLarge"
  | "appText.marketDataAcquisitionErrorRateLimited"
  | "appText.marketDataAcquisitionErrorRuntimeUnavailable"
  | "appText.marketDataAcquisitionJobFailed";

const KNOWN_ACQUISITION_ERROR_CODES = new Set<string>(
  MARKET_DATA_ACQUISITION_ERROR_CODES,
);

const ACQUISITION_ERROR_MESSAGE_KEYS: Record<
  MarketDataAcquisitionErrorCode,
  MarketDataAcquisitionErrorMessageKey
> = {
  ACQUISITION_FAILED: "appText.marketDataAcquisitionJobFailed",
  ACQUISITION_JOB_ACTIVE: "appText.marketDataAcquisitionErrorJobActive",
  ACQUISITION_JOB_NOT_FOUND: "appText.marketDataAcquisitionErrorJobNotFound",
  ACQUISITION_CONNECTOR_UNAVAILABLE:
    "appText.marketDataAcquisitionErrorRuntimeUnavailable",
  ACQUISITION_NO_DATA: "appText.marketDataAcquisitionErrorNoData",
  ACQUISITION_CANCELED: "appText.marketDataAcquisitionErrorCanceled",
  ACQUISITION_IMPORT_VALIDATION_FAILED:
    "appText.marketDataAcquisitionErrorLocalValidation",
  ACQUISITION_BAR_INVALID:
    "appText.marketDataAcquisitionErrorLocalValidation",
  ACQUISITION_TIMEZONE_INVALID:
    "appText.marketDataAcquisitionErrorLocalValidation",
  ACQUISITION_TIMEFRAME_INVALID:
    "appText.marketDataAcquisitionErrorLocalValidation",
  ACQUISITION_TIMEFRAME_UNSUPPORTED:
    "appText.marketDataAcquisitionErrorMarketUnavailable",
  ACQUISITION_DUPLICATE_CONFLICT:
    "appText.marketDataAcquisitionErrorLocalValidation",
  ACQUISITION_FILE_NAME_CONFLICT:
    "appText.marketDataAcquisitionErrorLocalValidation",
  ACQUISITION_SYMBOL_RESULT_MISSING:
    "appText.marketDataAcquisitionErrorLocalValidation",
  ACQUISITION_INTERRUPTED:
    "appText.marketDataAcquisitionErrorInterrupted",
  ACQUISITION_ROW_LIMIT_EXCEEDED:
    "appText.marketDataAcquisitionErrorRangeTooLarge",
  ACQUISITION_PAGE_LIMIT_EXCEEDED:
    "appText.marketDataAcquisitionErrorRangeTooLarge",
  ACQUISITION_FILE_LIMIT_EXCEEDED:
    "appText.marketDataAcquisitionErrorRangeTooLarge",
  ACQUISITION_OUTPUT_LIMIT_EXCEEDED:
    "appText.marketDataAcquisitionErrorRangeTooLarge",
  AKSHARE_RUNTIME_UNAVAILABLE:
    "appText.marketDataAcquisitionErrorRuntimeUnavailable",
  AKSHARE_SIDECAR_START_FAILED:
    "appText.marketDataAcquisitionErrorRuntimeUnavailable",
  AKSHARE_SIDECAR_TIMEOUT: "appText.marketDataAcquisitionErrorConnection",
  AKSHARE_SIDECAR_RESPONSE_INVALID:
    "appText.marketDataAcquisitionErrorFormatChanged",
  AKSHARE_UPSTREAM_FAILED:
    "appText.marketDataAcquisitionErrorAkshareConnection",
  AKSHARE_UPSTREAM_RETRYABLE:
    "appText.marketDataAcquisitionErrorAkshareConnection",
  AKSHARE_UPSTREAM_SCHEMA_INVALID:
    "appText.marketDataAcquisitionErrorFormatChanged",
  CCXT_UPSTREAM_FAILED: "appText.marketDataAcquisitionErrorConnection",
  CCXT_UPSTREAM_SCHEMA_INVALID:
    "appText.marketDataAcquisitionErrorFormatChanged",
  CCXT_OHLCV_UNAVAILABLE:
    "appText.marketDataAcquisitionErrorMarketUnavailable",
  CCXT_TIMEFRAME_UNAVAILABLE:
    "appText.marketDataAcquisitionErrorMarketUnavailable",
  CCXT_SYMBOL_UNAVAILABLE:
    "appText.marketDataAcquisitionErrorMarketUnavailable",
  CCXT_SPOT_SYMBOL_UNAVAILABLE:
    "appText.marketDataAcquisitionErrorMarketUnavailable",
  FINANCEDATAREADER_RUNTIME_UNAVAILABLE:
    "appText.marketDataAcquisitionErrorRuntimeUnavailable",
  FINANCEDATAREADER_SIDECAR_START_FAILED:
    "appText.marketDataAcquisitionErrorRuntimeUnavailable",
  FINANCEDATAREADER_SIDECAR_TIMEOUT:
    "appText.marketDataAcquisitionErrorConnection",
  FINANCEDATAREADER_SIDECAR_RESPONSE_INVALID:
    "appText.marketDataAcquisitionErrorFormatChanged",
  FINANCEDATAREADER_SIDECAR_RESPONSE_TOO_LARGE:
    "appText.marketDataAcquisitionErrorRangeTooLarge",
  FINANCEDATAREADER_SIDECAR_REQUEST_INVALID:
    "appText.marketDataAcquisitionErrorFormatChanged",
  FINANCEDATAREADER_SIDECAR_PROTOCOL_UNSUPPORTED:
    "appText.marketDataAcquisitionErrorRuntimeUnavailable",
  FINANCEDATAREADER_SIDECAR_OPERATION_FORBIDDEN:
    "appText.marketDataAcquisitionErrorMarketUnavailable",
  FINANCEDATAREADER_UPSTREAM_FAILED:
    "appText.marketDataAcquisitionErrorConnection",
  FINANCEDATAREADER_UPSTREAM_SCHEMA_INVALID:
    "appText.marketDataAcquisitionErrorFormatChanged",
  FINANCEDATAREADER_OHLCV_UNAVAILABLE:
    "appText.marketDataAcquisitionErrorMarketUnavailable",
  FINANCEDATAREADER_TIMEFRAME_UNAVAILABLE:
    "appText.marketDataAcquisitionErrorMarketUnavailable",
  FINANCEDATAREADER_SYMBOL_UNAVAILABLE:
    "appText.marketDataAcquisitionErrorMarketUnavailable",
  ACQUISITION_MARKET_UNAVAILABLE:
    "appText.marketDataAcquisitionErrorMarketUnavailable",
  ACQUISITION_SOURCE_PLAN_INVALID:
    "appText.marketDataAcquisitionErrorMarketUnavailable",
  ACQUISITION_SYMBOL_INVALID:
    "appText.marketDataAcquisitionErrorMarketUnavailable",
  ACQUISITION_FALLBACK_EXHAUSTED:
    "appText.marketDataAcquisitionErrorConnection",
};

export const resolveMarketDataAcquisitionErrorMessageKey = (
  rawCode: unknown,
  rawArgs?: unknown,
): MarketDataAcquisitionErrorMessageKey => {
  const code = String(rawCode || "").trim().toUpperCase();
  if (code === "ACQUISITION_FALLBACK_EXHAUSTED") {
    const fallbackErrorCode =
      rawArgs && typeof rawArgs === "object"
        ? String(
            (rawArgs as { fallbackErrorCode?: unknown }).fallbackErrorCode ?? "",
          )
            .trim()
            .toUpperCase()
        : "";
    if (fallbackErrorCode && fallbackErrorCode !== code) {
      return resolveMarketDataAcquisitionErrorMessageKey(fallbackErrorCode);
    }
  }
  const statusCode = Number(
    rawArgs && typeof rawArgs === "object"
      ? (rawArgs as { statusCode?: unknown }).statusCode
      : Number.NaN,
  );
  if (statusCode === 429) {
    return "appText.marketDataAcquisitionErrorRateLimited";
  }
  if (KNOWN_ACQUISITION_ERROR_CODES.has(code)) {
    return ACQUISITION_ERROR_MESSAGE_KEYS[
      code as MarketDataAcquisitionErrorCode
    ];
  }
  if (/CANCEL|ABORT/u.test(code)) {
    return "appText.marketDataAcquisitionErrorCanceled";
  }
  if (/RATE_LIMIT|TOO_MANY_REQUESTS|(?:^|_)429(?:_|$)/u.test(code)) {
    return "appText.marketDataAcquisitionErrorRateLimited";
  }
  if (/NO_DATA|EMPTY_RESULT/u.test(code)) {
    return "appText.marketDataAcquisitionErrorNoData";
  }
  if (
    /SCHEMA|RESPONSE_INVALID|RESPONSE_MISMATCH|BAR_INVALID|TIMESTAMP_INVALID|TIMEZONE_INVALID|DUPLICATE_CONFLICT|SYMBOL_RESULT_MISSING/u.test(
      code,
    )
  ) {
    return "appText.marketDataAcquisitionErrorFormatChanged";
  }
  if (/SIDECAR.*UNAVAILABLE|CONNECTOR.*UNAVAILABLE|RUNTIME.*UNAVAILABLE/u.test(code)) {
    return "appText.marketDataAcquisitionErrorRuntimeUnavailable";
  }
  if (/SYMBOL_UNAVAILABLE|SPOT_SYMBOL_UNAVAILABLE|TIMEFRAME_UNAVAILABLE|OHLCV_UNAVAILABLE|EXCHANGE_UNAVAILABLE/u.test(code)) {
    return "appText.marketDataAcquisitionErrorMarketUnavailable";
  }
  if (/LIMIT_EXCEEDED|PAGE_LIMIT|ROW_LIMIT|OUTPUT_LIMIT|FILE_LIMIT/u.test(code)) {
    return "appText.marketDataAcquisitionErrorRangeTooLarge";
  }
  if (/UPSTREAM_FAILED|NETWORK|TIMEOUT|TIMED_OUT|CONNECTION|UNREACHABLE/u.test(code)) {
    return "appText.marketDataAcquisitionErrorConnection";
  }
  return "appText.marketDataAcquisitionJobFailed";
};

export const readMarketDataAcquisitionErrorCode = (error: unknown): string => {
  if (error && typeof error === "object") {
    const record = error as { code?: unknown; message?: unknown; name?: unknown };
    const explicitCode = String(record.code || "").trim();
    if (explicitCode) {
      return explicitCode;
    }
    const message = String(record.message || "").trim();
    const embeddedCode = message.match(
      /(?:ACQUISITION|AKSHARE|CCXT|FINANCEDATAREADER)_[A-Z0-9_]+/u,
    )?.[0];
    if (embeddedCode) {
      return embeddedCode;
    }
    return `${String(record.name || "")} ${message}`.trim();
  }
  return String(error || "").trim();
};

export type MarketDataAcquisitionSaveErrorKey =
  | "appText.marketDataAcquisitionSaveFailed"
  | "appText.marketDataAcquisitionSaveFailedManifestInvalid"
  | "appText.marketDataAcquisitionSaveFailedFileMismatch"
  | "appText.marketDataAcquisitionSaveFailedStagingMissing"
  | "appText.marketDataAcquisitionSaveFailedOutputExists"
  | "appText.marketDataAcquisitionSaveFailedFolderUnavailable"
  | "appText.marketDataAcquisitionSaveFailedPathTooLong";

export const resolveMarketDataAcquisitionSaveErrorKey = (
  rawCode: unknown,
): MarketDataAcquisitionSaveErrorKey => {
  const code = String(rawCode || "").trim().toUpperCase();
  if (
    code === "MARKET_DATA_ACQUISITION_MANIFEST_INVALID" ||
    code === "MARKET_DATA_ACQUISITION_MANIFEST_HASH_MISMATCH"
  ) {
    return "appText.marketDataAcquisitionSaveFailedManifestInvalid";
  }
  if (
    code === "MARKET_DATA_ACQUISITION_FILE_SIZE_MISMATCH" ||
    code === "MARKET_DATA_ACQUISITION_FILE_HASH_MISMATCH"
  ) {
    return "appText.marketDataAcquisitionSaveFailedFileMismatch";
  }
  if (
    code === "MARKET_DATA_ACQUISITION_STAGING_MISSING" ||
    code === "MARKET_DATA_ACQUISITION_STAGING_UNSAFE" ||
    code === "MARKET_DATA_ACQUISITION_STAGING_UNEXPECTED_ENTRY"
  ) {
    return "appText.marketDataAcquisitionSaveFailedStagingMissing";
  }
  if (code === "MARKET_DATA_ACQUISITION_OUTPUT_ALREADY_EXISTS") {
    return "appText.marketDataAcquisitionSaveFailedOutputExists";
  }
  if (
    code === "MARKET_DATA_ACQUISITION_FOLDER_UNAVAILABLE" ||
    code === "MARKET_DATA_ACQUISITION_FOLDER_AUTHORIZATION_EXPIRED"
  ) {
    return "appText.marketDataAcquisitionSaveFailedFolderUnavailable";
  }
  if (code === "MARKET_DATA_ACQUISITION_DESTINATION_PATH_TOO_LONG") {
    return "appText.marketDataAcquisitionSaveFailedPathTooLong";
  }
  return "appText.marketDataAcquisitionSaveFailed";
};

export type MarketDataAcquisitionValidationDetail = {
  key:
    | "appText.marketDataAcquisitionValidationDetailSymbol"
    | "appText.marketDataAcquisitionValidationDetailTimeframe"
    | "appText.marketDataAcquisitionValidationDetailTimezone"
    | "appText.marketDataAcquisitionValidationDetailSymbols"
    | "appText.marketDataAcquisitionValidationDetailFiles"
    | "appText.marketDataAcquisitionValidationDetailHeaders"
    | "appText.marketDataAcquisitionValidationDetailMetadata"
    | "appText.marketDataAcquisitionValidationDetailSourceResults";
  params: (string | number)[];
};

const readErrorArg = (args: unknown, name: string): string => {
  if (args && typeof args === "object") {
    const value = (args as Record<string, unknown>)[name];
    return String(value ?? "").trim();
  }
  return "";
};

export const readMarketDataAcquisitionValidationDetail = (
  rawCode: unknown,
  rawArgs?: unknown,
): MarketDataAcquisitionValidationDetail | null => {
  const code = String(rawCode || "").trim().toUpperCase();
  const args =
    rawArgs && typeof rawArgs === "object"
      ? (rawArgs as Record<string, unknown>)
      : {};
  const check = readErrorArg(args, "validationCheck");
  if (check === "timeframe") {
    return {
      key: "appText.marketDataAcquisitionValidationDetailTimeframe",
      params: [readErrorArg(args, "expectedTimeframe"), readErrorArg(args, "detectedTimeframe")],
    };
  }
  if (check === "timezone") {
    return {
      key: "appText.marketDataAcquisitionValidationDetailTimezone",
      params: [readErrorArg(args, "expectedTimeZone"), readErrorArg(args, "suggestedTimeZone")],
    };
  }
  if (check === "symbols") {
    return { key: "appText.marketDataAcquisitionValidationDetailSymbols", params: [] };
  }
  if (check === "files") {
    return {
      key: "appText.marketDataAcquisitionValidationDetailFiles",
      params: [
        readErrorArg(args, "expectedFiles"),
        readErrorArg(args, "totalFiles"),
        readErrorArg(args, "invalidFiles"),
      ],
    };
  }
  if (check === "headers") {
    return { key: "appText.marketDataAcquisitionValidationDetailHeaders", params: [] };
  }
  if (check === "metadata") {
    return { key: "appText.marketDataAcquisitionValidationDetailMetadata", params: [] };
  }
  if (check === "sourceResults") {
    const symbol = readErrorArg(args, "symbol");
    return symbol
      ? {
          key: "appText.marketDataAcquisitionValidationDetailSourceResults",
          params: [symbol],
        }
      : null;
  }
  const symbol = readErrorArg(args, "symbol");
  if (
    symbol &&
    [
      "ACQUISITION_BAR_INVALID",
      "ACQUISITION_TIMEZONE_INVALID",
      "ACQUISITION_TIMEFRAME_INVALID",
      "ACQUISITION_DUPLICATE_CONFLICT",
      "ACQUISITION_NO_DATA",
    ].includes(code)
  ) {
    return {
      key: "appText.marketDataAcquisitionValidationDetailSymbol",
      params: [symbol],
    };
  }
  return null;
};

export const MARKET_DATA_ACQUISITION_MAX_ROWS = 250_000;

const EQUITY_DAILY_BARS: Record<MarketDataAcquisitionTimeframe, number> = {
  "1m": 240,
  "5m": 48,
  "1h": 4,
  "1d": 1,
};
const CRYPTO_DAILY_BARS: Record<MarketDataAcquisitionTimeframe, number> = {
  "1m": 1440,
  "5m": 288,
  "1h": 24,
  "1d": 1,
};

export const projectMarketDataAcquisitionRowEstimate = (input: {
  startDate: string;
  endDate: string;
  timeframe: MarketDataAcquisitionTimeframe;
  marketId: MarketDataAcquisitionMarketId | null;
}): number | null => {
  const { startDate, endDate, timeframe, marketId } = input;
  if (
    !isValidMarketDataAcquisitionDate(startDate) ||
    !isValidMarketDataAcquisitionDate(endDate)
  ) {
    return null;
  }
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  const startMs = Date.UTC(startYear!, startMonth! - 1, startDay!);
  const endMs = Date.UTC(endYear!, endMonth! - 1, endDay!);
  if (endMs < startMs) return null;
  const calendarDays = Math.floor((endMs - startMs) / 86_400_000) + 1;
  const tradingDays = Math.max(1, Math.round(calendarDays * (5 / 7)));
  const dailyBars =
    marketId === "CRYPTO_SPOT" ? CRYPTO_DAILY_BARS : EQUITY_DAILY_BARS;
  return tradingDays * dailyBars[timeframe];
};
