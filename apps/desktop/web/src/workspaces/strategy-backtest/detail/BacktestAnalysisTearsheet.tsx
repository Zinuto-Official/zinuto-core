// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react";

import type { BacktestAnalyticsResult } from "@/domains/backtest/backtestAnalytics";
import type { PriceColorMode } from "@/domains/chart/display";
import { DrawdownUnderwaterChart } from "@/workspaces/strategy-backtest/detail/charts/DrawdownUnderwaterChart";
import { EquityBenchmarkChart } from "@/workspaces/strategy-backtest/detail/charts/EquityBenchmarkChart";
import { MonthlyReturnsHeatmap } from "@/workspaces/strategy-backtest/detail/charts/MonthlyReturnsHeatmap";
import { ReturnDistributionChart } from "@/workspaces/strategy-backtest/detail/charts/ReturnDistributionChart";
import { RollingRiskChart } from "@/workspaces/strategy-backtest/detail/charts/RollingRiskChart";
import { MetricKpiStrip } from "@/workspaces/strategy-backtest/detail/MetricKpiStrip";
import { MetricTable } from "@/workspaces/strategy-backtest/detail/MetricTable";

type BacktestProLabels = {
  benchmarkUnavailable: string;
  equityVsBenchmark: string;
  underwaterDrawdown: string;
  monthlyReturns: string;
  heatmapRange5y: string;
  heatmapRange10y: string;
  heatmapRangeAll: string;
  returnDistribution: string;
  rollingRisk: string;
  groupedMetrics: string;
  priceVolumeInspection: string;
  strategyEquity: string;
  buyHoldBenchmark: string;
  periodReturns: string;
  sharpe: string;
  sortino: string;
  calmar: string;
  CAGR: string;
  maxDrawdown: string;
  profitFactor: string;
  annualVolatility: string;
  skewness: string;
  kurtosis: string;
  totalReturn: string;
  annualizedReturn: string;
  downsideDeviation: string;
  VaR95: string;
  avgDrawdown: string;
  maxDrawdownDuration: string;
  ulcerIndex: string;
  totalTrades: string;
  winRate: string;
  payoffRatio: string;
  expectancy: string;
  avgWin: string;
  avgLoss: string;
  largestWin: string;
  largestLoss: string;
  maxConsecutiveWins: string;
  maxConsecutiveLosses: string;
  exposure: string;
  totalCost: string;
  benchmarkReturn: string;
  excessReturn: string;
  alpha: string;
  beta: string;
  informationRatio: string;
  correlation: string;
  trackingError: string;
  returnsSection: string;
  riskSection: string;
  tradesSection: string;
  benchmarkSection: string;
};

type BacktestAnalysisTearsheetProps = {
  metrics: BacktestAnalyticsResult;
  chartNode: ReactNode;
  labels: BacktestProLabels;
  tooltips: Partial<Record<keyof BacktestProLabels, string>>;
  monthLabels: string[];
  themeMode: "light" | "dark";
  priceColorMode: PriceColorMode;
  formatInteger: (value: number) => string;
  formatMoney: (value: number) => string;
  formatNumber: (value: number) => string;
  formatPercent: (value: number) => string;
  formatRatio: (value: number) => string;
  notAvailableLabel: string;
};

const TearsheetSection = ({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) => (
  <section className={`strategy-backtest-analysis-section ${className ?? ""}`.trim()}>
    <div className="strategy-backtest-section-head">
      <h3>{title}</h3>
    </div>
    {children}
  </section>
);

export const BacktestAnalysisTearsheet = ({
  metrics,
  chartNode,
  labels,
  tooltips,
  monthLabels,
  themeMode,
  priceColorMode,
  formatInteger,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRatio,
  notAvailableLabel,
}: BacktestAnalysisTearsheetProps) => {
  const hasBenchmarkComparison = Boolean(
    metrics.benchmark && metrics.series.benchmarkEquity?.length,
  );
  const groupedMetricsClassName = [
    "strategy-backtest-analysis-section-metrics",
    hasBenchmarkComparison
      ? "strategy-backtest-analysis-section-metrics-side"
      : "strategy-backtest-analysis-section-metrics-full",
    hasBenchmarkComparison
      ? "strategy-backtest-analysis-span-4 strategy-backtest-analysis-row-lg"
      : "strategy-backtest-analysis-span-12",
  ].join(" ");

  const groupedMetricsSection = (
    <TearsheetSection
      title={labels.groupedMetrics}
      className={groupedMetricsClassName}
    >
      <MetricTable
        metrics={metrics}
        labels={{
          totalReturn: labels.totalReturn,
          CAGR: labels.CAGR,
          annualizedReturn: labels.annualizedReturn,
          annualVolatility: labels.annualVolatility,
          sharpe: labels.sharpe,
          sortino: labels.sortino,
          calmar: labels.calmar,
          downsideDeviation: labels.downsideDeviation,
          VaR95: labels.VaR95,
          maxDrawdown: labels.maxDrawdown,
          avgDrawdown: labels.avgDrawdown,
          maxDrawdownDuration: labels.maxDrawdownDuration,
          ulcerIndex: labels.ulcerIndex,
          totalTrades: labels.totalTrades,
          winRate: labels.winRate,
          profitFactor: labels.profitFactor,
          payoffRatio: labels.payoffRatio,
          expectancy: labels.expectancy,
          avgWin: labels.avgWin,
          avgLoss: labels.avgLoss,
          largestWin: labels.largestWin,
          largestLoss: labels.largestLoss,
          maxConsecutiveWins: labels.maxConsecutiveWins,
          maxConsecutiveLosses: labels.maxConsecutiveLosses,
          exposure: labels.exposure,
          totalCost: labels.totalCost,
          benchmarkReturn: labels.benchmarkReturn,
          excessReturn: labels.excessReturn,
          alpha: labels.alpha,
          beta: labels.beta,
          informationRatio: labels.informationRatio,
          correlation: labels.correlation,
          trackingError: labels.trackingError,
          returnsSection: labels.returnsSection,
          riskSection: labels.riskSection,
          tradesSection: labels.tradesSection,
          benchmarkSection: labels.benchmarkSection,
          benchmarkUnavailable: labels.benchmarkUnavailable,
        }}
        tooltips={tooltips}
        layout={hasBenchmarkComparison ? "side" : "full"}
        formatInteger={formatInteger}
        formatMoney={formatMoney}
        formatPercent={formatPercent}
        formatRatio={formatRatio}
        notAvailableLabel={notAvailableLabel}
      />
    </TearsheetSection>
  );
  const drawdownSection = (
    <TearsheetSection
      title={labels.underwaterDrawdown}
      className="strategy-backtest-analysis-section-chart strategy-backtest-analysis-section-drawdown strategy-backtest-analysis-span-6 strategy-backtest-analysis-row-md"
    >
      <DrawdownUnderwaterChart
        metrics={metrics}
        themeMode={themeMode}
        priceColorMode={priceColorMode}
        label={labels.underwaterDrawdown}
        formatPercent={formatPercent}
      />
    </TearsheetSection>
  );

  return (
    <div className="strategy-backtest-analysis-tearsheet">
      <div
        className="strategy-backtest-analysis-grid"
        data-benchmark-state={hasBenchmarkComparison ? "ready" : "unavailable"}
      >
        <div className="strategy-backtest-analysis-kpi-row">
          <MetricKpiStrip
            metrics={metrics}
            labels={{
              sharpe: labels.sharpe,
              sortino: labels.sortino,
              calmar: labels.calmar,
              CAGR: labels.CAGR,
              maxDrawdown: labels.maxDrawdown,
              profitFactor: labels.profitFactor,
            }}
            tooltips={{
              sharpe: tooltips.sharpe ?? "",
              sortino: tooltips.sortino ?? "",
              calmar: tooltips.calmar ?? "",
              CAGR: tooltips.CAGR ?? "",
              maxDrawdown: tooltips.maxDrawdown ?? "",
              profitFactor: tooltips.profitFactor ?? "",
            }}
            formatPercent={formatPercent}
            formatRatio={formatRatio}
            notAvailableLabel={notAvailableLabel}
          />
        </div>
        {hasBenchmarkComparison ? (
          <div className="strategy-backtest-analysis-comparison-layout">
            <div className="strategy-backtest-analysis-comparison-chart-stack">
              <TearsheetSection
                title={labels.equityVsBenchmark}
                className="strategy-backtest-analysis-section-chart strategy-backtest-analysis-section-main-chart strategy-backtest-analysis-span-8 strategy-backtest-analysis-row-lg"
              >
                <EquityBenchmarkChart
                  metrics={metrics}
                  themeMode={themeMode}
                  priceColorMode={priceColorMode}
                  strategyLabel={labels.strategyEquity}
                  benchmarkLabel={labels.buyHoldBenchmark}
                  formatMoney={formatMoney}
                />
              </TearsheetSection>
              {drawdownSection}
            </div>
            {groupedMetricsSection}
          </div>
        ) : null}
        {hasBenchmarkComparison ? null : groupedMetricsSection}
        {hasBenchmarkComparison ? null : drawdownSection}
        <TearsheetSection
          title={labels.returnDistribution}
          className="strategy-backtest-analysis-section-chart strategy-backtest-analysis-section-distribution strategy-backtest-analysis-span-6 strategy-backtest-analysis-row-md"
        >
          <ReturnDistributionChart
            metrics={metrics}
            themeMode={themeMode}
            priceColorMode={priceColorMode}
            label={labels.periodReturns}
            skewnessLabel={labels.skewness}
            kurtosisLabel={labels.kurtosis}
            formatNumber={formatNumber}
            formatPercent={formatPercent}
          />
        </TearsheetSection>
        <TearsheetSection
          title={labels.rollingRisk}
          className="strategy-backtest-analysis-section-chart strategy-backtest-analysis-section-rolling-risk strategy-backtest-analysis-span-6 strategy-backtest-analysis-row-md"
        >
          <RollingRiskChart
            metrics={metrics}
            themeMode={themeMode}
            priceColorMode={priceColorMode}
            sharpeLabel={labels.sharpe}
            volatilityLabel={labels.annualVolatility}
            formatNumber={formatNumber}
            formatPercent={formatPercent}
          />
        </TearsheetSection>
        <TearsheetSection
          title={labels.monthlyReturns}
          className="strategy-backtest-analysis-section-chart strategy-backtest-analysis-section-heatmap strategy-backtest-analysis-span-6 strategy-backtest-analysis-row-md"
        >
          <MonthlyReturnsHeatmap
            metrics={metrics}
            themeMode={themeMode}
            priceColorMode={priceColorMode}
            monthLabels={monthLabels}
            rangeLabels={{
              fiveYears: labels.heatmapRange5y,
              tenYears: labels.heatmapRange10y,
              all: labels.heatmapRangeAll,
            }}
            formatPercent={formatPercent}
          />
        </TearsheetSection>
        <section className="strategy-backtest-analysis-price-inspection">
          <div className="strategy-backtest-section-head">
            <h3>{labels.priceVolumeInspection}</h3>
          </div>
          <div className="strategy-backtest-analysis-price-chart">
            {chartNode}
          </div>
        </section>
      </div>
    </div>
  );
};
