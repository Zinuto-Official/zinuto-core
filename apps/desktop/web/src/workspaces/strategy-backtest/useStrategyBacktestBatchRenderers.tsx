// SPDX-License-Identifier: GPL-3.0-only

import { useCallback } from "react";
import type { ApiBacktestBatch } from "@/api";
import { useI18n } from "@/frontend-kernel/i18n";
import { BacktestRunNoticePanel } from "@/workspaces/strategy-backtest/BacktestRunNoticePanel";
import {
  buildStrategyBacktestBatchReadout,
  EMPTY_STRATEGY_BACKTEST_BATCH_READOUT,
  type StrategyBacktestBatchReadout,
} from "@/workspaces/strategy-backtest/strategyBacktestBatchReadout";
import {
  formatBacktestStage,
  formatBacktestStatus,
  formatSignedPercent,
  getBatchErrorDisplay,
  isRunningStatus,
  readProgressNumber,
  readSummaryNumber,
  readSymbolIssues,
  readText,
  resolveBacktestProgressPercent,
} from "@/workspaces/strategy-backtest/strategyBacktestDisplay";
import {
  resolveStrategyBacktestLossFinancialTone,
  resolveStrategyBacktestSignedFinancialTone,
} from "@/workspaces/strategy-backtest/strategyBacktestFinancialTone";

export const useStrategyBacktestBatchRenderers = ({
  t,
  formatNumber,
  setIssueDetailsBatchId,
}: {
  t: ReturnType<typeof useI18n>["t"];
  formatNumber: ReturnType<typeof useI18n>["formatNumber"];
  setIssueDetailsBatchId: (batchId: string) => void;
}) => {
  const formatPercent = useCallback((value: number | null): string =>
    value === null
      ? "-"
      : formatNumber(value, {
        style: "percent",
        maximumFractionDigits: 1,
      }), [formatNumber]);
  const formatSignedMetricPercent = useCallback((value: number | null): string =>
    value === null ? "-" : formatSignedPercent(value, formatNumber), [formatNumber]);
  const readBatchReadout = useCallback((batch: ApiBacktestBatch): StrategyBacktestBatchReadout => {
    if (batch.status !== "SUCCEEDED") {
      return EMPTY_STRATEGY_BACKTEST_BATCH_READOUT;
    }
    return buildStrategyBacktestBatchReadout(batch);
  }, []);
  const readBatchProgressSnapshot = useCallback((batch: ApiBacktestBatch) => {
    const completedSymbols = readProgressNumber(batch.progress, "completedSymbols");
    const totalSymbols = readProgressNumber(batch.progress, "totalSymbols");
    const progressPercent = resolveBacktestProgressPercent(batch);
    const progressLabel = totalSymbols > 0
      ? `${formatNumber(completedSymbols, { maximumFractionDigits: 0 })}/${formatNumber(totalSymbols, { maximumFractionDigits: 0 })}`
      : formatBacktestStatus(batch.status, t);
    const stageLabel = formatBacktestStage(readText(batch.progress.stage || batch.status), t);
    return {
      completedSymbols,
      currentSymbol: readText(batch.progress.currentSymbol),
      progressLabel,
      progressPercent,
      stageLabel,
      totalSymbols,
    };
  }, [formatNumber, t]);
  const readBatchIssueCounts = useCallback((batch: ApiBacktestBatch) => {
    const skippedIssues = readSymbolIssues(batch.summary, "skippedSymbols");
    const failedIssues = readSymbolIssues(batch.summary, "failedSymbols");
    return {
      failedIssues,
      failedSymbolCount: readSummaryNumber(batch.summary, "failedSymbolCount") || failedIssues.length,
      skippedIssues,
      skippedSymbolCount: readSummaryNumber(batch.summary, "skippedSymbolCount") || skippedIssues.length,
      successfulSymbols: readSummaryNumber(batch.summary, "successfulSymbols"),
    };
  }, []);
  const renderBatchMetric = useCallback((
    key: string,
    label: string,
    value: string,
    tone: "positive" | "negative" | "neutral" | "warning" = "neutral",
    support?: string,
  ) => (
    <span key={key} className="strategy-backtest-batch-metric" data-tone={tone}>
      <small>{label}</small>
      <strong className="ui-num">{value}</strong>
      {support ? <em>{support}</em> : null}
    </span>
  ), []);
  const renderBatchProgress = useCallback((batch: ApiBacktestBatch) => {
    const progress = readBatchProgressSnapshot(batch);
    const progressText = `${progress.stageLabel} ${t("app.joiner.slash")} ${progress.progressLabel}`;
    return (
      <span className="strategy-backtest-batch-progress">
        <span className="strategy-backtest-batch-progress-head">
          <small>{progress.stageLabel}</small>
          <strong className="ui-num">{progress.progressLabel}</strong>
        </span>
        <span
          className="strategy-backtest-batch-progress-rail"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress.progressPercent)}
          aria-valuetext={progressText}
        >
          <span
            className="strategy-backtest-batch-progress-fill"
            style={{ width: `${progress.progressPercent}%` }}
          />
        </span>
        {progress.currentSymbol ? (
          <span className="strategy-backtest-batch-current-symbol">
            <small>{t("trainer.strategyBacktest.currentSymbol")}</small>
            <strong>{progress.currentSymbol}</strong>
          </span>
        ) : null}
      </span>
    );
  }, [readBatchProgressSnapshot, t]);
  const renderCompletedBatchMetrics = useCallback((batch: ApiBacktestBatch) => {
    const readout = readBatchReadout(batch);
    return (
      <span className="strategy-backtest-batch-metrics">
        {renderBatchMetric(
          "profitable-rate",
          t("trainer.strategyBacktest.batchProfitSuccessRate"),
          formatPercent(readout.profitableRate),
          resolveStrategyBacktestSignedFinancialTone(readout.profitableRate),
        )}
        {renderBatchMetric(
          "average-return",
          t("trainer.strategyBacktest.batchAverageReturn"),
          formatSignedMetricPercent(readout.averageProfitRate),
          resolveStrategyBacktestSignedFinancialTone(readout.averageProfitRate),
        )}
        {renderBatchMetric(
          "max-drawdown",
          t("trainer.strategyBacktest.maxDrawdown"),
          formatPercent(readout.maxDrawdown),
          resolveStrategyBacktestLossFinancialTone(readout.maxDrawdown),
        )}
        {renderBatchMetric(
          "best",
          t("trainer.strategyBacktest.batchBest"),
          readout.bestSymbol ? formatSignedMetricPercent(readout.bestProfitRate) : "-",
          resolveStrategyBacktestSignedFinancialTone(readout.bestProfitRate),
          readout.bestSymbol ?? undefined,
        )}
      </span>
    );
  }, [
    formatPercent,
    formatSignedMetricPercent,
    readBatchReadout,
    renderBatchMetric,
    t,
  ]);
  const renderBatchState = useCallback((batch: ApiBacktestBatch) => {
    if (isRunningStatus(batch.status)) {
      return renderBatchProgress(batch);
    }
    if (batch.status === "SUCCEEDED") {
      return renderCompletedBatchMetrics(batch);
    }
    const progress = readBatchProgressSnapshot(batch);
    const batchError = getBatchErrorDisplay(batch);
    return (
      <span className="strategy-backtest-batch-state" data-tone={batch.status === "FAILED" ? "danger" : "neutral"}>
        <span>
          <small>{t("trainer.strategyBacktest.stage")}</small>
          <strong>{progress.stageLabel}</strong>
        </span>
        {batchError ? (
          <span>
            <small>{batchError.code}</small>
            <strong>{batchError.message}</strong>
          </span>
        ) : null}
      </span>
    );
  }, [readBatchProgressSnapshot, renderBatchProgress, renderCompletedBatchMetrics, t]);
  const renderBatchIssueNotice = useCallback((batch: ApiBacktestBatch) => {
    const issueCounts = readBatchIssueCounts(batch);
    return (
      <BacktestRunNoticePanel
        skippedCount={issueCounts.skippedSymbolCount}
        failedCount={issueCounts.failedSymbolCount}
        summaryLabel={`${t("trainer.strategyBacktest.summarySkipped")} ${formatNumber(issueCounts.skippedSymbolCount, { maximumFractionDigits: 0 })} · ${t("trainer.strategyBacktest.summaryFailed")} ${formatNumber(issueCounts.failedSymbolCount, { maximumFractionDigits: 0 })}`}
        detailsLabel={t("trainer.strategyBacktest.issueDetails")}
        onOpenDetails={() => setIssueDetailsBatchId(batch.id)}
      />
    );
  }, [formatNumber, readBatchIssueCounts, t]);
  return { renderBatchIssueNotice, renderBatchState };
};
