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
  "ACQUISITION_IMPORT_VALIDATION_FAILED",
  "ACQUISITION_DUPLICATE_CONFLICT",
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
