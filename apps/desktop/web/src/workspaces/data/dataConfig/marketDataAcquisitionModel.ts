// SPDX-License-Identifier: GPL-3.0-only

import type {
  MarketDataAcquisitionConnectorId,
  MarketDataAcquisitionRequest,
  MarketDataAcquisitionTimeframe,
} from "@/api";
import {
  MARKET_DATA_ACQUISITION_ERROR_CODES,
  MARKET_DATA_ACQUISITION_LIMITS,
  type MarketDataAcquisitionErrorCode,
} from "@zinuto/shared/contracts-desktop/api";

export const MARKET_DATA_ACQUISITION_MAX_SYMBOLS =
  MARKET_DATA_ACQUISITION_LIMITS.maxSymbols;

export type MarketDataAcquisitionSymbolInputIssue =
  | "EMPTY"
  | "TOO_MANY"
  | "INVALID_A_SHARE"
  | "INVALID_CRYPTO_PAIR"
  | null;

export const resolveMarketDataAcquisitionSymbolInputIssue = (
  connectorId: MarketDataAcquisitionConnectorId,
  symbols: string[],
  akshareInstrumentKind?: "A_SHARE" | "INDEX",
): MarketDataAcquisitionSymbolInputIssue => {
  if (!symbols.length) {
    return "EMPTY";
  }
  if (symbols.length > MARKET_DATA_ACQUISITION_MAX_SYMBOLS) {
    return "TOO_MANY";
  }
  if (connectorId === "akshare") {
    // Mirror the contract's kind-aware symbol pattern (INDEX requires the
    // INDEX- prefix; A_SHARE requires the bare exchange code).
    const symbolPattern =
      akshareInstrumentKind === "INDEX"
        ? /^INDEX-\d{6}$/u
        : akshareInstrumentKind === "A_SHARE"
          ? /^\d{6}$/u
          : /^(?:\d{6}|INDEX-\d{6})$/u;
    if (symbols.some((symbol) => !symbolPattern.test(symbol))) {
      return "INVALID_A_SHARE";
    }
  }
  if (
    connectorId === "ccxt" &&
    symbols.some(
      (symbol) =>
        symbol.length > MARKET_DATA_ACQUISITION_LIMITS.ccxtSymbolChars ||
        !/^[A-Z0-9][A-Z0-9._-]{0,31}\/[A-Z0-9][A-Z0-9._-]{0,31}$/u.test(
          symbol,
        ),
    )
  ) {
    return "INVALID_CRYPTO_PAIR";
  }
  return null;
};

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
  offset: "+08:00" | "Z",
): string => `${date}T${endOfDay ? "23:59:59" : "00:00:00"}${offset}`;

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
  ACQUISITION_JOB_ACTIVE: "appText.marketDataAcquisitionJobFailed",
  ACQUISITION_JOB_NOT_FOUND: "appText.marketDataAcquisitionJobFailed",
  ACQUISITION_CONNECTOR_UNAVAILABLE:
    "appText.marketDataAcquisitionErrorRuntimeUnavailable",
  ACQUISITION_NO_DATA: "appText.marketDataAcquisitionErrorNoData",
  ACQUISITION_CANCELED: "appText.marketDataAcquisitionErrorCanceled",
  ACQUISITION_IMPORT_VALIDATION_FAILED:
    "appText.marketDataAcquisitionErrorFormatChanged",
  ACQUISITION_BAR_INVALID: "appText.marketDataAcquisitionErrorFormatChanged",
  ACQUISITION_TIMEZONE_INVALID:
    "appText.marketDataAcquisitionErrorFormatChanged",
  ACQUISITION_TIMEFRAME_INVALID:
    "appText.marketDataAcquisitionErrorMarketUnavailable",
  ACQUISITION_DUPLICATE_CONFLICT:
    "appText.marketDataAcquisitionErrorFormatChanged",
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
};

export const resolveMarketDataAcquisitionErrorMessageKey = (
  rawCode: unknown,
  rawArgs?: unknown,
): MarketDataAcquisitionErrorMessageKey => {
  const code = String(rawCode || "").trim().toUpperCase();
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
      /(?:ACQUISITION|AKSHARE|CCXT)_[A-Z0-9_]+/u,
    )?.[0];
    if (embeddedCode) {
      return embeddedCode;
    }
    return `${String(record.name || "")} ${message}`.trim();
  }
  return String(error || "").trim();
};
