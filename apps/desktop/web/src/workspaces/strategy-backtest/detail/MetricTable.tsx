// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react";

import type { BacktestAnalyticsResult } from "@/domains/backtest/backtestAnalytics";
import { InlineInfoLabel } from "@/ui/components";
import {
  formatStrategyBacktestRatio,
  resolveStrategyBacktestLossFinancialTone,
  resolveStrategyBacktestProfitFactorFinancialTone,
  resolveStrategyBacktestSignedFinancialTone,
  type StrategyBacktestFinancialTone,
} from "@/workspaces/strategy-backtest/strategyBacktestFinancialTone";

type MetricLabelKey =
  | "totalReturn"
  | "CAGR"
  | "annualizedReturn"
  | "annualVolatility"
  | "sharpe"
  | "sortino"
  | "calmar"
  | "downsideDeviation"
  | "VaR95"
  | "maxDrawdown"
  | "avgDrawdown"
  | "maxDrawdownDuration"
  | "ulcerIndex"
  | "totalTrades"
  | "winRate"
  | "profitFactor"
  | "payoffRatio"
  | "expectancy"
  | "avgWin"
  | "avgLoss"
  | "largestWin"
  | "largestLoss"
  | "maxConsecutiveWins"
  | "maxConsecutiveLosses"
  | "exposure"
  | "totalCost"
  | "benchmarkReturn"
  | "excessReturn"
  | "alpha"
  | "beta"
  | "informationRatio"
  | "correlation"
  | "trackingError";

type MetricTableProps = {
  metrics: BacktestAnalyticsResult;
  labels: Record<MetricLabelKey, string> & {
    returnsSection: string;
    riskSection: string;
    tradesSection: string;
    benchmarkSection: string;
    benchmarkUnavailable: string;
  };
  tooltips: Partial<Record<MetricLabelKey, string>>;
  formatInteger: (value: number) => string;
  formatMoney: (value: number) => string;
  formatPercent: (value: number) => string;
  formatRatio: (value: number) => string;
  notAvailableLabel: string;
  layout?: "side" | "full";
};

type MetricRow = {
  key: MetricLabelKey;
  value: ReactNode;
  tone?: StrategyBacktestFinancialTone;
};

const MetricRows = ({
  rows,
  labels,
  tooltips,
}: {
  rows: MetricRow[];
  labels: MetricTableProps["labels"];
  tooltips: MetricTableProps["tooltips"];
}) => (
  <div className="strategy-backtest-metric-table-rows">
    {rows.map((row) => (
      <div key={row.key} className="strategy-backtest-metric-table-row">
        <InlineInfoLabel
          label={labels[row.key]}
          tooltip={tooltips[row.key]}
          className="flex-nowrap"
        />
        <strong data-tone={row.tone ?? "neutral"}>{row.value}</strong>
      </div>
    ))}
  </div>
);

export const MetricTable = ({
  metrics,
  labels,
  tooltips,
  formatInteger,
  formatMoney,
  formatPercent,
  formatRatio,
  notAvailableLabel,
  layout = "full",
}: MetricTableProps) => {
  const returnRows: MetricRow[] = [
    {
      key: "totalReturn",
      value: formatPercent(metrics.returns.totalReturn),
      tone: resolveStrategyBacktestSignedFinancialTone(metrics.returns.totalReturn),
    },
    {
      key: "CAGR",
      value: formatPercent(metrics.returns.CAGR),
      tone: resolveStrategyBacktestSignedFinancialTone(metrics.returns.CAGR),
    },
    {
      key: "annualizedReturn",
      value: formatPercent(metrics.returns.annualizedReturn),
      tone: resolveStrategyBacktestSignedFinancialTone(metrics.returns.annualizedReturn),
    },
  ];
  const riskRows: MetricRow[] = [
    { key: "annualVolatility", value: formatPercent(metrics.risk.annualVolatility) },
    {
      key: "sharpe",
      value: formatRatio(metrics.risk.sharpe),
      tone: resolveStrategyBacktestSignedFinancialTone(metrics.risk.sharpe),
    },
    {
      key: "sortino",
      value: formatRatio(metrics.risk.sortino),
      tone: resolveStrategyBacktestSignedFinancialTone(metrics.risk.sortino),
    },
    {
      key: "calmar",
      value: formatRatio(metrics.risk.calmar),
      tone: resolveStrategyBacktestSignedFinancialTone(metrics.risk.calmar),
    },
    { key: "downsideDeviation", value: formatPercent(metrics.risk.downsideDeviation) },
    { key: "VaR95", value: formatPercent(metrics.risk.VaR95), tone: resolveStrategyBacktestLossFinancialTone(metrics.risk.VaR95) },
    { key: "maxDrawdown", value: formatPercent(metrics.risk.maxDrawdown), tone: resolveStrategyBacktestLossFinancialTone(metrics.risk.maxDrawdown) },
    { key: "avgDrawdown", value: formatPercent(metrics.risk.avgDrawdown), tone: resolveStrategyBacktestLossFinancialTone(metrics.risk.avgDrawdown) },
    { key: "maxDrawdownDuration", value: formatInteger(metrics.risk.maxDrawdownDuration) },
    { key: "ulcerIndex", value: formatPercent(metrics.risk.ulcerIndex) },
  ];
  const tradeRows: MetricRow[] = [
    { key: "totalTrades", value: formatInteger(metrics.trades.totalTrades) },
    { key: "winRate", value: formatPercent(metrics.trades.winRate) },
    {
      key: "profitFactor",
      value: formatStrategyBacktestRatio(
        metrics.trades.profitFactor,
        metrics.trades.profitFactorState,
        formatRatio,
        notAvailableLabel,
      ),
      tone: resolveStrategyBacktestProfitFactorFinancialTone(
        metrics.trades.profitFactor,
        metrics.trades.profitFactorState,
      ),
    },
    {
      key: "payoffRatio",
      value: formatStrategyBacktestRatio(
        metrics.trades.payoffRatio,
        metrics.trades.payoffRatioState,
        formatRatio,
        notAvailableLabel,
      ),
    },
    { key: "expectancy", value: formatMoney(metrics.trades.expectancy), tone: resolveStrategyBacktestSignedFinancialTone(metrics.trades.expectancy) },
    { key: "avgWin", value: formatMoney(metrics.trades.avgWin), tone: resolveStrategyBacktestSignedFinancialTone(metrics.trades.avgWin) },
    { key: "avgLoss", value: formatMoney(metrics.trades.avgLoss), tone: resolveStrategyBacktestLossFinancialTone(metrics.trades.avgLoss) },
    { key: "largestWin", value: formatMoney(metrics.trades.largestWin), tone: resolveStrategyBacktestSignedFinancialTone(metrics.trades.largestWin) },
    { key: "largestLoss", value: formatMoney(metrics.trades.largestLoss), tone: resolveStrategyBacktestLossFinancialTone(metrics.trades.largestLoss) },
    { key: "maxConsecutiveWins", value: formatInteger(metrics.trades.maxConsecutiveWins) },
    { key: "maxConsecutiveLosses", value: formatInteger(metrics.trades.maxConsecutiveLosses) },
    { key: "exposure", value: formatPercent(metrics.trades.exposure) },
    { key: "totalCost", value: formatMoney(metrics.trades.totalCost) },
  ];
  const benchmarkRows: MetricRow[] = metrics.benchmark
    ? [
        {
          key: "benchmarkReturn",
          value: formatPercent(metrics.benchmark.benchmarkReturn),
          tone: resolveStrategyBacktestSignedFinancialTone(metrics.benchmark.benchmarkReturn),
        },
        {
          key: "excessReturn",
          value: formatPercent(metrics.benchmark.excessReturn),
          tone: resolveStrategyBacktestSignedFinancialTone(metrics.benchmark.excessReturn),
        },
        {
          key: "alpha",
          value: formatPercent(metrics.benchmark.alpha),
          tone: resolveStrategyBacktestSignedFinancialTone(metrics.benchmark.alpha),
        },
        { key: "beta", value: formatRatio(metrics.benchmark.beta) },
        {
          key: "informationRatio",
          value: formatRatio(metrics.benchmark.informationRatio),
          tone: resolveStrategyBacktestSignedFinancialTone(metrics.benchmark.informationRatio),
        },
        { key: "correlation", value: formatRatio(metrics.benchmark.correlation) },
        { key: "trackingError", value: formatPercent(metrics.benchmark.trackingError) },
      ]
    : [];

  return (
    <div className="strategy-backtest-metric-table" data-layout={layout}>
      <section
        className="strategy-backtest-metric-table-section"
        data-section="returns"
      >
        <h3>{labels.returnsSection}</h3>
        <MetricRows rows={returnRows} labels={labels} tooltips={tooltips} />
      </section>
      <section
        className="strategy-backtest-metric-table-section"
        data-section="risk"
      >
        <h3>{labels.riskSection}</h3>
        <MetricRows rows={riskRows} labels={labels} tooltips={tooltips} />
      </section>
      <section
        className="strategy-backtest-metric-table-section"
        data-section="trades"
      >
        <h3>{labels.tradesSection}</h3>
        <MetricRows rows={tradeRows} labels={labels} tooltips={tooltips} />
      </section>
      <section
        className="strategy-backtest-metric-table-section"
        data-section="benchmark"
      >
        <h3>{labels.benchmarkSection}</h3>
        {benchmarkRows.length ? (
          <MetricRows rows={benchmarkRows} labels={labels} tooltips={tooltips} />
        ) : (
          <div className="strategy-backtest-metric-table-empty">
            {labels.benchmarkUnavailable}
          </div>
        )}
      </section>
    </div>
  );
};
