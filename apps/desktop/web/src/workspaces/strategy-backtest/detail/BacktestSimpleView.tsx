// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react";

import type { BacktestAnalyticsResult } from "@/domains/backtest/backtestAnalytics";
import { MetricStrip } from "@/ui/components";
import {
  resolveStrategyBacktestLossFinancialTone,
  resolveStrategyBacktestSignedFinancialTone,
} from "@/workspaces/strategy-backtest/strategyBacktestFinancialTone";

type BacktestSimpleViewProps = {
  metrics: BacktestAnalyticsResult;
  chartNode: ReactNode;
  fillListNode: ReactNode;
  labels: {
    totalReturn: string;
    maxDrawdown: string;
    winRate: string;
    excessReturn: string;
    tradeChart: string;
    fills: string;
  };
  formatPercent: (value: number) => string;
};

export const BacktestSimpleView = ({
  metrics,
  chartNode,
  fillListNode,
  labels,
  formatPercent,
}: BacktestSimpleViewProps) => {
  const cards = [
    {
      key: "totalReturn",
      label: labels.totalReturn,
      value: formatPercent(metrics.returns.totalReturn),
      tone: resolveStrategyBacktestSignedFinancialTone(metrics.returns.totalReturn),
    },
    {
      key: "maxDrawdown",
      label: labels.maxDrawdown,
      value: formatPercent(metrics.risk.maxDrawdown),
      tone: resolveStrategyBacktestLossFinancialTone(metrics.risk.maxDrawdown),
    },
    {
      key: "winRate",
      label: labels.winRate,
      value: formatPercent(metrics.trades.winRate),
      tone: "neutral",
    },
    {
      key: "excessReturn",
      label: labels.excessReturn,
      value: metrics.benchmark
        ? formatPercent(metrics.benchmark.excessReturn)
        : "-",
      tone: resolveStrategyBacktestSignedFinancialTone(metrics.benchmark?.excessReturn),
    },
  ] as const;

  return (
    <div className="strategy-backtest-simple-view">
      <MetricStrip
        className="strategy-backtest-simple-cards"
        itemClassName="strategy-backtest-simple-card"
        items={cards.map((card) => ({
          key: card.key,
          label: card.label,
          value: <span className="ui-num">{card.value}</span>,
          tone: card.tone,
        }))}
      />
      <section className="strategy-backtest-simple-chart">
        <div className="strategy-backtest-section-head">
          <h3>{labels.tradeChart}</h3>
        </div>
        {chartNode}
      </section>
      <section className="strategy-backtest-simple-fills">
        <div className="strategy-backtest-section-head">
          <h3>{labels.fills}</h3>
        </div>
        {fillListNode}
      </section>
    </div>
  );
};
