// SPDX-License-Identifier: GPL-3.0-only

import {
  toBackendErrorMessage,
  type ApiBacktestBatch,
  type ApiBacktestFill,
  type ApiBacktestResultDetail,
} from "@/api";
import type { useI18n } from "@/frontend-kernel/i18n";

type I18nRuntime = ReturnType<typeof useI18n>;
type BacktestTranslator = I18nRuntime["t"];
type BacktestNumberFormatter = I18nRuntime["formatNumber"];

export const DEFAULT_INITIAL_CAPITAL = 100000;
export const DEFAULT_ORDER_AMOUNT = 10000;

export type BacktestSymbolIssue = {
  instrumentId: string;
  symbol: string;
  reason: string;
  message?: string;
};

export const isRunningStatus = (status: ApiBacktestBatch["status"]): boolean =>
  status === "QUEUED" || status === "RUNNING";

export const toBacktestStartTime = (date: string): string =>
  `${date}T00:00:00.000Z`;

export const toBacktestEndTime = (date: string): string =>
  `${date}T23:59:59.999Z`;

export const resolveBacktestStatusBadgeVariant = (
  status: ApiBacktestBatch["status"],
): "default" | "secondary" | "destructive" | "outline" => {
  if (status === "RUNNING" || status === "QUEUED") {
    return "default";
  }
  if (status === "SUCCEEDED") {
    return "secondary";
  }
  if (status === "FAILED") {
    return "destructive";
  }
  return "outline";
};

const padDatePart = (value: number): string => String(value).padStart(2, "0");

export const createDefaultBacktestBatchName = (date = new Date()): string =>
  `Backtest-${date.getFullYear()}${padDatePart(date.getMonth() + 1)}${padDatePart(date.getDate())}-${padDatePart(date.getHours())}${padDatePart(date.getMinutes())}${padDatePart(date.getSeconds())}`;

export const readProgressNumber = (
  progress: Record<string, unknown>,
  key: string,
): number => {
  const value = Number(progress[key]);
  return Number.isFinite(value) ? value : 0;
};

const HYDRATING_PROGRESS_MAX_PERCENT = 35;
const RUNNING_PROGRESS_BASE_PERCENT = 35;
const RUNNING_PROGRESS_SPAN_PERCENT = 64;
const ACTIVE_PROGRESS_MAX_PERCENT = 99;

const readProgressRatio = (progress: Record<string, unknown>): number => {
  const completedSymbols = readProgressNumber(progress, "completedSymbols");
  const totalSymbols = readProgressNumber(progress, "totalSymbols");
  if (totalSymbols <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, completedSymbols / totalSymbols));
};

const readTimestampMs = (value: unknown): number | null => {
  const text = readText(value);
  if (!text) {
    return null;
  }
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const readBatchUpdateTimestampMs = (batch: ApiBacktestBatch): number | null => {
  const timestamps = [
    readTimestampMs(batch.progress.updatedAt),
    readTimestampMs(batch.updatedAt),
    readTimestampMs(batch.finishedAt),
    readTimestampMs(batch.startedAt),
  ].filter((timestamp): timestamp is number => timestamp !== null);
  return timestamps.length ? Math.max(...timestamps) : null;
};

const readBatchStatusRank = (status: ApiBacktestBatch["status"]): number => {
  switch (status) {
    case "DRAFT":
      return 0;
    case "QUEUED":
      return 1;
    case "RUNNING":
      return 2;
    case "CANCELLED":
    case "FAILED":
      return 3;
    case "SUCCEEDED":
      return 4;
    default:
      return 0;
  }
};

export const resolveBacktestProgressPercent = (
  batch: ApiBacktestBatch,
): number => {
  const stage = readText(batch.progress.stage || batch.status);
  if (batch.status === "SUCCEEDED" || stage === "DONE") {
    return 100;
  }
  if (
    batch.status === "DRAFT" ||
    batch.status === "QUEUED" ||
    stage === "DRAFT" ||
    stage === "QUEUED"
  ) {
    return 0;
  }

  const ratio = readProgressRatio(batch.progress);
  if (stage === "HYDRATING") {
    return ratio * HYDRATING_PROGRESS_MAX_PERCENT;
  }
  if (stage === "RUNNING") {
    return Math.min(
      ACTIVE_PROGRESS_MAX_PERCENT,
      RUNNING_PROGRESS_BASE_PERCENT + ratio * RUNNING_PROGRESS_SPAN_PERCENT,
    );
  }
  if (stage === "PERSISTING") {
    return ACTIVE_PROGRESS_MAX_PERCENT;
  }
  return Math.min(
    ACTIVE_PROGRESS_MAX_PERCENT,
    ratio * ACTIVE_PROGRESS_MAX_PERCENT,
  );
};

export const mergeBacktestBatchUpdate = (
  current: ApiBacktestBatch,
  incoming: ApiBacktestBatch,
): ApiBacktestBatch => {
  if (current.id !== incoming.id) {
    return current;
  }
  const currentTimestamp = readBatchUpdateTimestampMs(current);
  const incomingTimestamp = readBatchUpdateTimestampMs(incoming);
  if (currentTimestamp !== null && incomingTimestamp !== null) {
    if (incomingTimestamp < currentTimestamp) {
      return current;
    }
    if (incomingTimestamp > currentTimestamp) {
      return incoming;
    }
  }
  if (
    readBatchStatusRank(incoming.status) < readBatchStatusRank(current.status)
  ) {
    return current;
  }
  return incoming;
};

export const readProgressPollDelayMs = (
  progress: Record<string, unknown> | undefined,
): number => {
  const value = Number(progress?.pollDelayMs);
  if (!Number.isFinite(value)) {
    return 1000;
  }
  return Math.min(5000, Math.max(250, Math.floor(value)));
};

export const readText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export const readSummaryNumber = (
  summary: Record<string, unknown> | undefined,
  key: string,
): number => {
  const value = Number(summary?.[key]);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
};

export const readSymbolIssues = (
  summary: Record<string, unknown> | undefined,
  key: "skippedSymbols" | "failedSymbols",
): BacktestSymbolIssue[] => {
  const raw = summary?.[key];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }
    const record = item as Record<string, unknown>;
    const instrumentId = readText(record.instrumentId);
    const symbol = readText(record.symbol);
    const reason = readText(record.reason);
    if (!symbol || !reason) {
      return [];
    }
    const message = readText(record.message);
    return [
      {
        instrumentId,
        symbol,
        reason,
        ...(message ? { message } : {}),
      },
    ];
  });
};

export const formatBacktestStage = (
  stage: string,
  t: BacktestTranslator,
): string => {
  switch (stage) {
    case "DRAFT":
      return t("trainer.strategyBacktest.stageDraft");
    case "QUEUED":
      return t("trainer.strategyBacktest.stageQueued");
    case "HYDRATING":
      return t("trainer.strategyBacktest.stageHydrating");
    case "RUNNING":
      return t("trainer.strategyBacktest.stageRunning");
    case "PERSISTING":
      return t("trainer.strategyBacktest.stagePersisting");
    case "DONE":
      return t("trainer.strategyBacktest.stageDone");
    case "FAILED":
      return t("trainer.strategyBacktest.stageFailed");
    case "CANCELLED":
      return t("trainer.strategyBacktest.status.CANCELLED");
    default:
      return stage || "-";
  }
};

export const formatBacktestStatus = (
  status: ApiBacktestBatch["status"],
  t: BacktestTranslator,
): string => {
  switch (status) {
    case "DRAFT":
      return t("trainer.strategyBacktest.status.DRAFT");
    case "QUEUED":
      return t("trainer.strategyBacktest.status.QUEUED");
    case "RUNNING":
      return t("trainer.strategyBacktest.status.RUNNING");
    case "SUCCEEDED":
      return t("trainer.strategyBacktest.status.SUCCEEDED");
    case "FAILED":
      return t("trainer.strategyBacktest.status.FAILED");
    case "CANCELLED":
      return t("trainer.strategyBacktest.status.CANCELLED");
    default:
      return status;
  }
};

export const formatIssueReason = (
  reason: string,
  t: BacktestTranslator,
): string => {
  switch (reason) {
    case "NO_BARS":
      return t("trainer.strategyBacktest.issueNoBars");
    case "HYDRATION_FAILED":
      return t("trainer.strategyBacktest.issueHydrationFailed");
    case "RUNTIME_ERROR":
      return t("trainer.strategyBacktest.issueRuntimeError");
    default:
      return reason || "-";
  }
};

export const getBatchErrorDisplay = (
  batch: ApiBacktestBatch | null,
): { code: string; message: string } | null => {
  const code = readText(batch?.errorCode);
  const rawMessage = readText(batch?.errorMessage);
  if (!code && !rawMessage) {
    return null;
  }
  return {
    code: code || "BACKTEST_RUN_FAILED",
    message:
      rawMessage && rawMessage !== code
        ? rawMessage
        : toBackendErrorMessage(
            code || rawMessage || "BACKTEST_RUN_FAILED",
            undefined,
            400,
          ),
  };
};

export const resolveFillEquityDelta = (
  detail: ApiBacktestResultDetail,
  fill: ApiBacktestFill,
): number | null => {
  const pointIndex = detail.equityCurve.findIndex(
    (point) => point.barIndex === fill.fillIndex,
  );
  if (pointIndex < 0) {
    return null;
  }
  const previous = detail.equityCurve[Math.max(0, pointIndex - 1)];
  const current = detail.equityCurve[pointIndex];
  if (!previous || !current) {
    return null;
  }
  return current.equity - previous.equity;
};

export const formatSignedPercent = (
  value: number,
  formatter: BacktestNumberFormatter,
): string =>
  formatter(value, {
    style: "percent",
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  });

export const formatMoney = (
  value: number,
  formatter: BacktestNumberFormatter,
): string =>
  formatter(value, {
    maximumFractionDigits: 2,
  });

export const parseMoneyInput = (value: string, fallback: number): number => {
  const sanitized = String(value ?? "")
    .trim()
    .replace(/\u2212/g, "-")
    .replace(/[^\d,.-]/g, "");
  if (!sanitized || sanitized.includes("-")) {
    return fallback;
  }

  const commaCount = (sanitized.match(/,/g) ?? []).length;
  const dotCount = (sanitized.match(/\./g) ?? []).length;
  const lastCommaIndex = sanitized.lastIndexOf(",");
  const lastDotIndex = sanitized.lastIndexOf(".");
  const separator =
    lastCommaIndex >= 0 && lastDotIndex >= 0
      ? lastCommaIndex > lastDotIndex
        ? ","
        : "."
      : lastCommaIndex >= 0
        ? ","
        : lastDotIndex >= 0
          ? "."
          : null;
  const separatorCount = separator === "," ? commaCount : dotCount;
  const chunks = separator ? sanitized.split(separator) : [sanitized];
  const hasGroupingShape =
    Boolean(separator) &&
    chunks.length > 1 &&
    chunks.slice(1).every((chunk) => chunk.length === 3);
  const shouldTreatSeparatorAsDecimal =
    Boolean(separator) &&
    ((commaCount > 0 && dotCount > 0) ||
      !hasGroupingShape ||
      (separatorCount === 1 && (chunks.at(-1)?.length ?? 0) <= 2));
  const normalized =
    shouldTreatSeparatorAsDecimal && separator
      ? `${sanitized
          .slice(0, sanitized.lastIndexOf(separator))
          .replace(/[.,]/g, "")}.${sanitized
          .slice(sanitized.lastIndexOf(separator) + 1)
          .replace(/[.,]/g, "")}`
      : sanitized.replace(/[.,]/g, "");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

export const formatMoneyInput = (
  value: string,
  fallback: number,
  formatter: BacktestNumberFormatter,
): string => formatMoney(parseMoneyInput(value, fallback), formatter);
