// SPDX-License-Identifier: GPL-3.0-only

import type { BacktestAnalyticsResult } from "@/domains/backtest/backtestAnalytics";
import { InlineInfoLabel, MetricStrip } from "@/ui/components";
import {
  formatStrategyBacktestRatio,
  resolveStrategyBacktestLossFinancialTone,
  resolveStrategyBacktestProfitFactorFinancialTone,
  resolveStrategyBacktestSignedFinancialTone,
} from "@/workspaces/strategy-backtest/strategyBacktestFinancialTone";

type MetricKpiStripProps = {
  metrics: BacktestAnalyticsResult;
  labels: {
    sharpe: string;
    sortino: string;
    calmar: string;
    CAGR: string;
    maxDrawdown: string;
    profitFactor: string;
  };
  tooltips: {
    sharpe: string;
    sortino: string;
    calmar: string;
    CAGR: string;
    maxDrawdown: string;
    profitFactor: string;
  };
  formatPercent: (value: number) => string;
  formatRatio: (value: number) => string;
  notAvailableLabel: string;
};

export const MetricKpiStrip = ({
  metrics,
  labels,
  tooltips,
  formatPercent,
  formatRatio,
  notAvailableLabel,
}: MetricKpiStripProps) => {
  const items = [
    {
      key: "sharpe",
      label: labels.sharpe,
      tooltip: tooltips.sharpe,
      value: formatRatio(metrics.risk.sharpe),
      tone: resolveStrategyBacktestSignedFinancialTone(metrics.risk.sharpe),
    },
    {
      key: "sortino",
      label: labels.sortino,
      tooltip: tooltips.sortino,
      value: formatRatio(metrics.risk.sortino),
      tone: resolveStrategyBacktestSignedFinancialTone(metrics.risk.sortino),
    },
    {
      key: "calmar",
      label: labels.calmar,
      tooltip: tooltips.calmar,
      value: formatRatio(metrics.risk.calmar),
      tone: resolveStrategyBacktestSignedFinancialTone(metrics.risk.calmar),
    },
    {
      key: "cagr",
      label: labels.CAGR,
      tooltip: tooltips.CAGR,
      value: formatPercent(metrics.returns.CAGR),
      tone: resolveStrategyBacktestSignedFinancialTone(metrics.returns.CAGR),
    },
    {
      key: "maxDrawdown",
      label: labels.maxDrawdown,
      tooltip: tooltips.maxDrawdown,
      value: formatPercent(metrics.risk.maxDrawdown),
      tone: resolveStrategyBacktestLossFinancialTone(metrics.risk.maxDrawdown),
    },
    {
      key: "profitFactor",
      label: labels.profitFactor,
      tooltip: tooltips.profitFactor,
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
  ] as const;

  return (
    <div className="strategy-backtest-kpi-strip">
      <MetricStrip
        items={items.map((item) => ({
          key: item.key,
          label: item.tooltip ? (
            <InlineInfoLabel label={item.label} tooltip={item.tooltip} />
          ) : (
            item.label
          ),
          value: <span className="ui-num">{item.value}</span>,
          tone: item.tone,
        }))}
      />
    </div>
  );
};
