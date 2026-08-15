// SPDX-License-Identifier: GPL-3.0-only

import { z } from "zod";
import { INPUT_LIMITS } from "../input-limits.js";

const nonEmptyTrimmedStringSchema = z.string().trim().min(1);
const idStringSchema = nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.idChars);
const jsonRecordSchema = z.record(z.string(), z.unknown());

export const desktopMarketDataAcquisitionTimeframeSchema = z.enum([
  "1m",
  "5m",
  "1h",
  "1d",
]);
export const MARKET_DATA_ACQUISITION_LIMITS = {
  maxSymbols: 20,
  aShareSymbolChars: 6,
  ccxtSymbolChars: 64,
  maxMarketResults: 500,
  maxAkshareInstruments: 10_000,
} as const;
export const MARKET_DATA_ACQUISITION_ERROR_CODES = [
  "ACQUISITION_FAILED",
  "ACQUISITION_JOB_ACTIVE",
  "ACQUISITION_JOB_NOT_FOUND",
  "ACQUISITION_CONNECTOR_UNAVAILABLE",
  "ACQUISITION_NO_DATA",
  "ACQUISITION_CANCELED",
  "ACQUISITION_BAR_INVALID",
  "ACQUISITION_TIMEZONE_INVALID",
  "ACQUISITION_TIMEFRAME_INVALID",
  "ACQUISITION_TIMEFRAME_UNSUPPORTED",
  "ACQUISITION_IMPORT_VALIDATION_FAILED",
  "ACQUISITION_DUPLICATE_CONFLICT",
  "ACQUISITION_FILE_NAME_CONFLICT",
  "ACQUISITION_SYMBOL_RESULT_MISSING",
  "ACQUISITION_INTERRUPTED",
  "ACQUISITION_ROW_LIMIT_EXCEEDED",
  "ACQUISITION_PAGE_LIMIT_EXCEEDED",
  "ACQUISITION_FILE_LIMIT_EXCEEDED",
  "ACQUISITION_OUTPUT_LIMIT_EXCEEDED",
  "AKSHARE_RUNTIME_UNAVAILABLE",
  "AKSHARE_SIDECAR_START_FAILED",
  "AKSHARE_SIDECAR_TIMEOUT",
  "AKSHARE_SIDECAR_RESPONSE_INVALID",
  "AKSHARE_UPSTREAM_FAILED",
  "AKSHARE_UPSTREAM_RETRYABLE",
  "AKSHARE_UPSTREAM_SCHEMA_INVALID",
  "CCXT_UPSTREAM_FAILED",
  "CCXT_UPSTREAM_SCHEMA_INVALID",
  "CCXT_OHLCV_UNAVAILABLE",
  "CCXT_TIMEFRAME_UNAVAILABLE",
  "CCXT_SYMBOL_UNAVAILABLE",
  "CCXT_SPOT_SYMBOL_UNAVAILABLE",
  "FINANCEDATAREADER_RUNTIME_UNAVAILABLE",
  "FINANCEDATAREADER_SIDECAR_START_FAILED",
  "FINANCEDATAREADER_SIDECAR_TIMEOUT",
  "FINANCEDATAREADER_SIDECAR_RESPONSE_INVALID",
  "FINANCEDATAREADER_SIDECAR_RESPONSE_TOO_LARGE",
  "FINANCEDATAREADER_SIDECAR_REQUEST_INVALID",
  "FINANCEDATAREADER_SIDECAR_PROTOCOL_UNSUPPORTED",
  "FINANCEDATAREADER_SIDECAR_OPERATION_FORBIDDEN",
  "FINANCEDATAREADER_UPSTREAM_FAILED",
  "FINANCEDATAREADER_UPSTREAM_SCHEMA_INVALID",
  "FINANCEDATAREADER_OHLCV_UNAVAILABLE",
  "FINANCEDATAREADER_TIMEFRAME_UNAVAILABLE",
  "FINANCEDATAREADER_SYMBOL_UNAVAILABLE",
  "ACQUISITION_MARKET_UNAVAILABLE",
  "ACQUISITION_SOURCE_PLAN_INVALID",
  "ACQUISITION_SYMBOL_INVALID",
  "ACQUISITION_FALLBACK_EXHAUSTED",
] as const;
export type MarketDataAcquisitionErrorCode =
  (typeof MARKET_DATA_ACQUISITION_ERROR_CODES)[number];
export const desktopMarketDataAcquisitionUpstreamTermsSchema = z
  .object({
    id: z.enum(["eastmoney", "binance", "okx"]),
    upstreamName: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.generalNameChars),
    termsUrl: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.urlChars),
    docsUrl: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.urlChars),
    termsRevision: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.idChars),
  })
  .strict();
export const desktopMarketDataAcquisitionProjectSchema = z
  .object({
    id: z.enum(["aktools", "akshare", "ccxt"]),
    name: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.generalNameChars),
    url: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.urlChars),
    infoUrl: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.urlChars),
    version: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.shortCodeChars),
    license: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.shortCodeChars),
  })
  .strict();
export const desktopMarketDataAcquisitionConnectorTermsSchema = z
  .object({
    projects: z
      .array(desktopMarketDataAcquisitionProjectSchema)
      .min(1)
      .max(2),
    upstreams: z
      .array(desktopMarketDataAcquisitionUpstreamTermsSchema)
      .min(1)
      .max(2),
  })
  .strict();
export const desktopMarketDataAcquisitionConnectorSchema = z
  .object({
    id: z.enum(["akshare", "ccxt"]),
    version: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.shortCodeChars),
    market: z.enum(["A_SHARE", "CRYPTO_SPOT"]),
    available: z.boolean(),
    unavailabilityCode: nonEmptyTrimmedStringSchema
      .max(INPUT_LIMITS.idChars)
      .nullable(),
    supportedTimeframes: z
      .array(desktopMarketDataAcquisitionTimeframeSchema)
      .min(1)
      .max(4),
    datasets: z
      .array(
        z.enum([
          "stock_zh_a_hist",
          "stock_zh_a_hist_min_em",
          "index_zh_a_hist",
        ]),
      )
      .max(4),
    exchanges: z.array(z.enum(["binance", "okx"])).max(2),
    terms: desktopMarketDataAcquisitionConnectorTermsSchema,
  })
  .strict();
export const desktopMarketDataAcquisitionConnectorCatalogSchema = z
  .object({
    connectors: z
      .array(desktopMarketDataAcquisitionConnectorSchema)
      .min(2)
      .max(2),
  })
  .strict();
export const desktopCcxtAcquisitionMarketSchema = z
  .object({
    symbol: nonEmptyTrimmedStringSchema.max(
      MARKET_DATA_ACQUISITION_LIMITS.ccxtSymbolChars,
    ),
    base: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.symbolChars),
    quote: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.symbolChars),
    active: z.literal(true),
  })
  .strict();
export const desktopCcxtAcquisitionMarketCatalogSchema = z
  .object({
    exchangeId: z.enum(["binance", "okx"]),
    markets: z
      .array(desktopCcxtAcquisitionMarketSchema)
      .max(MARKET_DATA_ACQUISITION_LIMITS.maxMarketResults),
    cachedAt: nonEmptyTrimmedStringSchema
      .max(INPUT_LIMITS.dateTimeChars)
      .datetime({ offset: true }),
  })
  .strict();
export const desktopAkshareAcquisitionInstrumentSchema = z
  .object({
    symbol: nonEmptyTrimmedStringSchema
      .max(12)
      .regex(/^(?:[0-9]{6}|INDEX-[0-9]{6})$/u),
    name: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.generalNameChars),
    exchangeId: z.enum(["SH", "SZ", "BJ"]),
    kind: z.enum(["A_SHARE", "INDEX"]),
  })
  .strict()
  .superRefine((instrument, context) => {
    const symbolMatchesKind =
      (instrument.kind === "A_SHARE" && /^[0-9]{6}$/u.test(instrument.symbol)) ||
      (instrument.kind === "INDEX" &&
        /^INDEX-[0-9]{6}$/u.test(instrument.symbol));
    if (!symbolMatchesKind) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ACQUISITION_INSTRUMENT_KIND_MISMATCH",
        path: ["symbol"],
      });
    }
  });
export const desktopAkshareAcquisitionInstrumentCatalogSchema = z
  .object({
    instruments: z
      .array(desktopAkshareAcquisitionInstrumentSchema)
      .min(1)
      .max(MARKET_DATA_ACQUISITION_LIMITS.maxAkshareInstruments),
    cachedAt: nonEmptyTrimmedStringSchema
      .max(INPUT_LIMITS.dateTimeChars)
      .datetime({ offset: true }),
  })
  .strict();

const desktopMarketDataAcquisitionSymbolsSchema = z
  .array(nonEmptyTrimmedStringSchema.max(64))
  .min(1)
  .max(20)
  .refine((symbols) => new Set(symbols).size === symbols.length, {
    message: "ACQUISITION_SYMBOLS_DUPLICATED",
  });
const desktopMarketDataAcquisitionDateTimeSchema = nonEmptyTrimmedStringSchema
  .max(INPUT_LIMITS.dateTimeChars)
  .datetime({ offset: true });
export const desktopAkshareAcquisitionJobCreateRequestSchema = z
  .object({
    connectorId: z.literal("akshare"),
    dataset: z.enum([
      "stock_zh_a_hist",
      "stock_zh_a_hist_min_em",
      "index_zh_a_hist",
    ]),
    symbols: desktopMarketDataAcquisitionSymbolsSchema,
    timeframe: desktopMarketDataAcquisitionTimeframeSchema,
    startAt: desktopMarketDataAcquisitionDateTimeSchema,
    endAt: desktopMarketDataAcquisitionDateTimeSchema,
    adjustment: z.enum(["none", "qfq", "hfq"]),
  })
  .strict()
  .superRefine((request, context) => {
    const symbolPattern =
      request.dataset === "index_zh_a_hist"
        ? /^INDEX-[0-9]{6}$/u
        : /^[0-9]{6}$/u;
    if (!request.symbols.every((symbol) => symbolPattern.test(symbol))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          request.dataset === "index_zh_a_hist"
            ? "ACQUISITION_INDEX_SYMBOL_INVALID"
            : "ACQUISITION_A_SHARE_SYMBOL_INVALID",
        path: ["symbols"],
      });
    }
    if (
      request.dataset === "index_zh_a_hist" &&
      request.adjustment !== "none"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ACQUISITION_INDEX_ADJUSTMENT_INVALID",
        path: ["adjustment"],
      });
    }
  });
export const desktopCcxtAcquisitionJobCreateRequestSchema = z
  .object({
    connectorId: z.literal("ccxt"),
    exchangeId: z.enum(["binance", "okx"]),
    marketType: z.literal("spot"),
    symbols: desktopMarketDataAcquisitionSymbolsSchema.refine(
      (symbols) =>
        symbols.every((symbol) =>
          /^[A-Z0-9._-]+\/[A-Z0-9._-]+$/u.test(symbol),
        ),
      { message: "ACQUISITION_CRYPTO_SYMBOL_INVALID" },
    ),
    timeframe: desktopMarketDataAcquisitionTimeframeSchema,
    startAt: desktopMarketDataAcquisitionDateTimeSchema,
    endAt: desktopMarketDataAcquisitionDateTimeSchema,
  })
  .strict();
export const desktopMarketDataAcquisitionJobCreateRequestSchema = z
  .discriminatedUnion("connectorId", [
    desktopAkshareAcquisitionJobCreateRequestSchema,
    desktopCcxtAcquisitionJobCreateRequestSchema,
  ])
  .superRefine((request, context) => {
    const startAt = Date.parse(request.startAt);
    const endAt = Date.parse(request.endAt);
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt < startAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ACQUISITION_TIME_RANGE_INVALID",
        path: ["endAt"],
      });
    }
    if (
      request.connectorId === "akshare" &&
      ((request.dataset === "stock_zh_a_hist" && request.timeframe !== "1d") ||
        (request.dataset === "stock_zh_a_hist_min_em" &&
          !["1m", "5m", "1h"].includes(request.timeframe)) ||
        (request.dataset === "index_zh_a_hist" &&
          request.timeframe !== "1d"))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ACQUISITION_DATASET_TIMEFRAME_INVALID",
        path: ["timeframe"],
      });
    }
  });
export const desktopMarketDataAcquisitionJobProgressSchema = z
  .object({
    stage: z.enum([
      "QUEUED",
      "CONNECTING",
      "DOWNLOADING",
      "NORMALIZING",
      "VALIDATING",
      "RETRY_WAIT",
      "READY_TO_SAVE",
    ]),
    completedSymbols: z.number().int().min(0).max(20),
    totalSymbols: z.number().int().min(1).max(20),
    retryAttempt: z.number().int().min(0).max(3),
    retryAfterMs: z.number().int().min(0).max(10_000),
  })
  .strict();
export const desktopMarketDataAcquisitionStagingSummarySchema = z
  .object({
    fileCount: z.number().int().min(2).max(21),
    totalBytes: z.number().int().positive(),
    manifestSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    outputFolderName: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.fileNameChars),
    mergedDuplicateBars: z.number().int().min(0),
  })
  .strict();
export const desktopMarketDataAcquisitionJobErrorSchema = z
  .object({
    code: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.idChars),
    args: jsonRecordSchema,
  })
  .strict();
export const desktopMarketDataAcquisitionJobSchema = z
  .object({
    id: idStringSchema,
    status: z.enum([
      "QUEUED",
      "RUNNING",
      "READY_TO_SAVE",
      "FAILED",
      "CANCELED",
    ]),
    connectorId: z.enum(["akshare", "ccxt"]),
    request: desktopMarketDataAcquisitionJobCreateRequestSchema,
    progress: desktopMarketDataAcquisitionJobProgressSchema,
    staging: desktopMarketDataAcquisitionStagingSummarySchema.nullable(),
    error: desktopMarketDataAcquisitionJobErrorSchema.nullable(),
    createdAt: desktopMarketDataAcquisitionDateTimeSchema,
    updatedAt: desktopMarketDataAcquisitionDateTimeSchema,
  })
  .strict();
export const desktopMarketDataAcquisitionDiscardResultSchema = z
  .object({ discarded: z.boolean() })
  .strict();

export type DesktopMarketDataAcquisitionJobCreateRequest = z.infer<
  typeof desktopMarketDataAcquisitionJobCreateRequestSchema
>;
export type DesktopMarketDataAcquisitionJob = z.infer<
  typeof desktopMarketDataAcquisitionJobSchema
>;
export type DesktopMarketDataAcquisitionConnectorCatalog = z.infer<
  typeof desktopMarketDataAcquisitionConnectorCatalogSchema
>;
export type DesktopCcxtAcquisitionMarketCatalog = z.infer<
  typeof desktopCcxtAcquisitionMarketCatalogSchema
>;
export type DesktopAkshareAcquisitionInstrument = z.infer<
  typeof desktopAkshareAcquisitionInstrumentSchema
>;
export type DesktopAkshareAcquisitionInstrumentCatalog = z.infer<
  typeof desktopAkshareAcquisitionInstrumentCatalogSchema
>;

// The market acquisition catalog is deliberately separate from the legacy
// connector catalog above. Existing staged downloads continue to use their
// original v1/v2 request contract, while new downloads are selected by asset
// class, market and an explicit, audited source plan.
export const desktopMarketDataAcquisitionAssetClassSchema = z.enum([
  "STOCKS_AND_INDICES",
  "FOREX",
  "COMMODITIES_AND_RATES",
  "CRYPTO",
]);
export const desktopMarketDataAcquisitionMarketIdSchema = z.enum([
  "CN_A_SHARE",
  "HK_STOCKS",
  "KR_STOCKS",
  "US_STOCKS",
  "JP_STOCKS",
  "VN_STOCKS",
  "GLOBAL_INDICES",
  "FOREX",
  "COMMODITY_FUTURES",
  "RATE_FUTURES",
  "CRYPTO_SPOT",
]);
export const desktopMarketDataAcquisitionProviderIdSchema = z.enum([
  "akshare",
  "ccxt",
  "financedatareader",
]);
export const desktopMarketDataAcquisitionSourcePlanIdSchema = z.enum([
  "CN_A_SHARE_SMART",
  "FDR_HKEX",
  "FDR_KRX",
  "FDR_US_STOCKS",
  "FDR_TSE",
  "FDR_HOSE",
  "FDR_GLOBAL_INDICES",
  "FDR_FOREX",
  "FDR_COMMODITY_FUTURES",
  "FDR_RATE_FUTURES",
  "CCXT_BINANCE_SMART",
  "CCXT_OKX_SMART",
]);

const marketDataAcquisitionProviderVersionSchema = z
  .object({
    id: desktopMarketDataAcquisitionProviderIdSchema,
    name: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.generalNameChars),
    version: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.shortCodeChars),
    license: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.shortCodeChars),
    projectUrl: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.urlChars),
    docsUrl: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.urlChars),
    termsUrl: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.urlChars),
    termsRevision: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.idChars),
    available: z.boolean(),
    unavailabilityCode: nonEmptyTrimmedStringSchema
      .max(INPUT_LIMITS.idChars)
      .nullable(),
  })
  .strict();

const marketDataAcquisitionSourcePlanSchema = z
  .object({
    id: desktopMarketDataAcquisitionSourcePlanIdSchema,
    providerChain: z
      .array(desktopMarketDataAcquisitionProviderIdSchema)
      .min(1)
      .max(3),
    fallbackPolicy: z.enum([
      "NONE",
      "WHOLE_INSTRUMENT_DAILY_UNADJUSTED_ONLY",
      "WHOLE_INSTRUMENT_DAILY_ONLY",
    ]),
    available: z.boolean(),
  })
  .strict();

export const desktopMarketDataAcquisitionMarketSchema = z
  .object({
    id: desktopMarketDataAcquisitionMarketIdSchema,
    assetClassId: desktopMarketDataAcquisitionAssetClassSchema,
    timeZone: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.generalNameChars),
    supportedTimeframes: z
      .array(desktopMarketDataAcquisitionTimeframeSchema)
      .min(1)
      .max(4),
    adjustmentOptions: z.array(z.enum(["none", "qfq", "hfq"])).max(3),
    instrumentDiscovery: z.enum(["CATALOG", "PRESET"]),
    sourcePlans: z.array(marketDataAcquisitionSourcePlanSchema).min(1).max(3),
  })
  .strict();

export const desktopMarketDataAcquisitionCatalogSchema = z
  .object({
    providers: z
      .array(marketDataAcquisitionProviderVersionSchema)
      .min(3)
      .max(3),
    assetClasses: z
      .array(
        z
          .object({
            id: desktopMarketDataAcquisitionAssetClassSchema,
            marketIds: z
              .array(desktopMarketDataAcquisitionMarketIdSchema)
              .min(1)
              .max(15),
          })
          .strict(),
      )
      .min(4)
      .max(4),
    markets: z.array(desktopMarketDataAcquisitionMarketSchema).min(1).max(15),
  })
  .strict();

export const desktopMarketDataAcquisitionInstrumentSchema = z
  .object({
    symbol: nonEmptyTrimmedStringSchema.max(64),
    name: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.generalNameChars),
    marketId: desktopMarketDataAcquisitionMarketIdSchema,
    sourceSymbol: nonEmptyTrimmedStringSchema.max(64),
    exchangeId: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.shortCodeChars).nullable(),
    sourcePlanIds: z
      .array(desktopMarketDataAcquisitionSourcePlanIdSchema)
      .min(1)
      .max(3),
  })
  .strict();
export const desktopMarketDataAcquisitionInstrumentCatalogSchema = z
  .object({
    marketId: desktopMarketDataAcquisitionMarketIdSchema,
    instruments: z
      .array(desktopMarketDataAcquisitionInstrumentSchema)
      .max(MARKET_DATA_ACQUISITION_LIMITS.maxMarketResults),
    nextCursor: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.idChars).nullable(),
    cachedAt: desktopMarketDataAcquisitionDateTimeSchema.nullable(),
    cacheState: z.enum(["FRESH", "STALE", "BUNDLED"]),
  })
  .strict();

const desktopMarketDataAcquisitionMarketSymbolsSchema = z
  .array(nonEmptyTrimmedStringSchema.max(64))
  .min(1)
  .max(MARKET_DATA_ACQUISITION_LIMITS.maxSymbols)
  .refine((symbols) => new Set(symbols).size === symbols.length, {
    message: "ACQUISITION_SYMBOLS_DUPLICATED",
  });
export const desktopMarketDataAcquisitionMarketJobCreateRequestSchema = z
  .object({
    marketId: desktopMarketDataAcquisitionMarketIdSchema,
    sourcePlanId: desktopMarketDataAcquisitionSourcePlanIdSchema,
    symbols: desktopMarketDataAcquisitionMarketSymbolsSchema,
    timeframe: desktopMarketDataAcquisitionTimeframeSchema,
    startAt: desktopMarketDataAcquisitionDateTimeSchema,
    endAt: desktopMarketDataAcquisitionDateTimeSchema,
    adjustment: z.enum(["none", "qfq", "hfq"]).nullable(),
  })
  .strict()
  .superRefine((request, context) => {
    const startAt = Date.parse(request.startAt);
    const endAt = Date.parse(request.endAt);
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt < startAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ACQUISITION_TIME_RANGE_INVALID",
        path: ["endAt"],
      });
    }
  });

export const desktopMarketDataAcquisitionSourceAttemptSchema = z
  .object({
    providerId: desktopMarketDataAcquisitionProviderIdSchema,
    providerVersion: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.shortCodeChars),
    upstreamId: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.idChars),
    status: z.enum(["SUCCEEDED", "FAILED", "SKIPPED"]),
    errorCode: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.idChars).nullable(),
  })
  .strict();
export const desktopMarketDataAcquisitionSymbolSourceResultSchema = z
  .object({
    symbol: nonEmptyTrimmedStringSchema.max(64),
    sourceSymbol: nonEmptyTrimmedStringSchema.max(64),
    finalSource: desktopMarketDataAcquisitionSourceAttemptSchema.nullable(),
    attempts: z
      .array(desktopMarketDataAcquisitionSourceAttemptSchema)
      .min(1)
      .max(3),
  })
  .strict();
export const desktopMarketDataAcquisitionMarketJobSchema = z
  .object({
    id: idStringSchema,
    status: z.enum(["QUEUED", "RUNNING", "READY_TO_SAVE", "FAILED", "CANCELED"]),
    request: desktopMarketDataAcquisitionMarketJobCreateRequestSchema,
    progress: desktopMarketDataAcquisitionJobProgressSchema,
    sourceResults: z
      .array(desktopMarketDataAcquisitionSymbolSourceResultSchema)
      .max(MARKET_DATA_ACQUISITION_LIMITS.maxSymbols),
    staging: desktopMarketDataAcquisitionStagingSummarySchema.nullable(),
    error: desktopMarketDataAcquisitionJobErrorSchema.nullable(),
    createdAt: desktopMarketDataAcquisitionDateTimeSchema,
    updatedAt: desktopMarketDataAcquisitionDateTimeSchema,
  })
  .strict();

export type DesktopMarketDataAcquisitionCatalog = z.infer<
  typeof desktopMarketDataAcquisitionCatalogSchema
>;
export type DesktopMarketDataAcquisitionMarket = z.infer<
  typeof desktopMarketDataAcquisitionMarketSchema
>;
export type DesktopMarketDataAcquisitionMarketId = z.infer<
  typeof desktopMarketDataAcquisitionMarketIdSchema
>;
export type DesktopMarketDataAcquisitionSourcePlanId = z.infer<
  typeof desktopMarketDataAcquisitionSourcePlanIdSchema
>;
export type DesktopMarketDataAcquisitionInstrumentCatalog = z.infer<
  typeof desktopMarketDataAcquisitionInstrumentCatalogSchema
>;
export type DesktopMarketDataAcquisitionInstrument = z.infer<
  typeof desktopMarketDataAcquisitionInstrumentSchema
>;
export type DesktopMarketDataAcquisitionMarketJobCreateRequest = z.infer<
  typeof desktopMarketDataAcquisitionMarketJobCreateRequestSchema
>;
export type DesktopMarketDataAcquisitionSourceAttempt = z.infer<
  typeof desktopMarketDataAcquisitionSourceAttemptSchema
>;
export type DesktopMarketDataAcquisitionMarketJob = z.infer<
  typeof desktopMarketDataAcquisitionMarketJobSchema
>;

export const desktopMarketDataAcquisitionJobSummarySchema = z
  .object({
    id: idStringSchema,
    status: z.enum(["QUEUED", "RUNNING", "READY_TO_SAVE", "FAILED", "CANCELED"]),
    marketId: desktopMarketDataAcquisitionMarketIdSchema,
    sourcePlanId: desktopMarketDataAcquisitionSourcePlanIdSchema,
    timeframe: desktopMarketDataAcquisitionTimeframeSchema,
    symbolCount: z.number().int().min(1).max(MARKET_DATA_ACQUISITION_LIMITS.maxSymbols),
    completedSymbols: z
      .number()
      .int()
      .min(0)
      .max(MARKET_DATA_ACQUISITION_LIMITS.maxSymbols),
    stage: z.enum([
      "QUEUED",
      "CONNECTING",
      "DOWNLOADING",
      "NORMALIZING",
      "VALIDATING",
      "RETRY_WAIT",
      "READY_TO_SAVE",
    ]),
    error: desktopMarketDataAcquisitionJobErrorSchema.nullable(),
    createdAt: desktopMarketDataAcquisitionDateTimeSchema,
    updatedAt: desktopMarketDataAcquisitionDateTimeSchema,
  })
  .strict();

export const desktopMarketDataAcquisitionJobListSchema = z
  .object({
    jobs: z
      .array(desktopMarketDataAcquisitionJobSummarySchema)
      .max(MARKET_DATA_ACQUISITION_LIMITS.maxMarketResults),
  })
  .strict();

export type DesktopMarketDataAcquisitionJobSummary = z.infer<
  typeof desktopMarketDataAcquisitionJobSummarySchema
>;
export type DesktopMarketDataAcquisitionJobList = z.infer<
  typeof desktopMarketDataAcquisitionJobListSchema
>;
