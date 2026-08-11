// SPDX-License-Identifier: GPL-3.0-only

import { Button } from "@/ui/primitives/button";
import { InlineLoadingState } from "@/ui/primitives/loading";
import { DatePicker } from "@/ui/primitives/date-picker";
import { Input } from "@/ui/primitives/input";
import { SelectField } from "@/ui/primitives/select-field";
import { AppIcon } from "@/assets/graphics";
import type {
  ApiTrainingStatsComparisonMetrics,
  ApiTrainingStatsReport,
} from "@/api";
import type {
  Dispatch,
  SetStateAction,
} from "react";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import {
  ALL_VALUE,
  ensureDateInput,
  normalizeStatsComparePoolValue,
  normalizeStatsSamplePoolFilterValue,
  type StatsFilterState,
} from "@/workspaces/challenge-stats/statsFilters";
import {
  MetricStrip,
  PageHeader,
} from "@/ui/components";
import {
  formatMoney,
  formatSignedMoney,
} from "@/ui/formatting/format";
import {
  toDurationText,
  toPercentDisplay,
} from "@/workspaces/challenge-stats/trainingStatsFormatting";

type TrainingStatsComparisonCard = {
  key: string;
  title: string;
  data: ApiTrainingStatsReport["comparisons"]["recent20VsPrevious20"];
};

type TrainingStatsComparisonMetric = {
  key: string;
  label: string;
  valueOf: (item: ApiTrainingStatsComparisonMetrics) => string;
  deltaOf: (
    item: Omit<ApiTrainingStatsComparisonMetrics, "sessionCount">,
  ) => string;
  deltaTone: (
    item: Omit<ApiTrainingStatsComparisonMetrics, "sessionCount">,
  ) => string;
};

type OverviewPrimaryCard = {
  key: string;
  label: string;
  value: string;
  tone: "profit" | "loss" | "flat" | "risk";
};

type OverviewSecondaryCard = {
  key: string;
  label: string;
  value: string;
};

type MonthlyTrendCard = ApiTrainingStatsReport["monthlyPerformance"][number] & {
  trend: "up" | "down" | "flat";
  tone: "profit" | "loss" | "flat";
  delta: number;
};

type MonthlyWinRateRow =
  ApiTrainingStatsReport["winRateBreakdown"]["monthlyWinRate"][number];

type SamplePoolWinRateRow =
  ApiTrainingStatsReport["winRateBreakdown"]["samplePoolWinRate"][number] & {
    samplePoolName: string;
  };

type ResolvedSamplePoolStat = ApiTrainingStatsReport["samplePoolStats"][number] & {
  samplePoolName: string;
};

type FilterSamplePoolOption = {
  id: string;
  name: string;
  count: number;
};

type SessionOption = {
  value: string;
  label: string;
};

type TrainingStatsTrainingReportViewProps = {
  language: AppUiLanguage;
  ui: UiLabelEntry;
  pendingFilters: StatsFilterState;
  setPendingFilters: Dispatch<SetStateAction<StatsFilterState>>;
  updatePendingFilter: <K extends keyof StatsFilterState>(
    key: K,
    value: StatsFilterState[K],
  ) => void;
  normalizedPendingSamplePoolId: string;
  normalizedPendingComparePoolA: string;
  normalizedPendingComparePoolB: string;
  resolvedFilterSamplePools: FilterSamplePoolOption[];
  isFilterRefreshPending: boolean;
  isLoading: boolean;
  report: ApiTrainingStatsReport | null;
  isExportingPdf: boolean;
  onExportReportCsv: () => void;
  onExportReportPdf: () => void;
  overviewPrimaryCards: OverviewPrimaryCard[];
  overviewSecondaryCards: OverviewSecondaryCard[];
  monthlyWinRateRows: MonthlyWinRateRow[];
  samplePoolWinRateRows: SamplePoolWinRateRow[];
  comparisonCards: TrainingStatsComparisonCard[];
  comparisonMetrics: TrainingStatsComparisonMetric[];
  monthlyTrendCards: MonthlyTrendCard[];
  resolvedSamplePoolStats: ResolvedSamplePoolStat[];
  selectedSessionId: string;
  setSelectedSessionId: Dispatch<SetStateAction<string>>;
  sessionOptions: SessionOption[];
  onExportSessionCsv: () => void;
  onExportSessionPdf: () => void;
  onRefreshReport: () => void;
  onApplyQuickRange: (days: number) => void;
  onResetFilters: () => void;
  onApplyFilters: () => void;
  renderOptionLabelWithCount: (label: string, count: number) => string;
  emptyPlaceholder: string;
  pageTitle: string;
  pageSubtitle: string;
  sessionOptionSeparator: string;
};

export const TrainingStatsTrainingReportView = ({
  language,
  ui,
  pendingFilters,
  setPendingFilters,
  updatePendingFilter,
  normalizedPendingSamplePoolId,
  normalizedPendingComparePoolA,
  normalizedPendingComparePoolB,
  resolvedFilterSamplePools,
  isFilterRefreshPending,
  isLoading,
  report,
  isExportingPdf,
  onExportReportCsv,
  onExportReportPdf,
  overviewPrimaryCards,
  overviewSecondaryCards,
  monthlyWinRateRows,
  samplePoolWinRateRows,
  comparisonCards,
  comparisonMetrics,
  monthlyTrendCards,
  resolvedSamplePoolStats,
  selectedSessionId,
  setSelectedSessionId,
  sessionOptions,
  onExportSessionCsv,
  onExportSessionPdf,
  onRefreshReport,
  onApplyQuickRange,
  onResetFilters,
  onApplyFilters,
  renderOptionLabelWithCount,
  emptyPlaceholder,
  pageTitle,
  pageSubtitle,
  sessionOptionSeparator,
}: TrainingStatsTrainingReportViewProps) => (
  <>
    <PageHeader
      variant="plain"
      className="training-stats-header"
      title={pageTitle}
      subtitle={pageSubtitle}
      rightSlot={
        <div className="training-stats-header-actions">
          {isFilterRefreshPending ? (
            <InlineLoadingState label={ui.statsLoading} />
          ) : null}
          <Button
            variant="ghost"
            size="default"
            onClick={onExportReportCsv}
            disabled={!report}
          >
            {ui.statsExportPhaseCsv}
          </Button>
          <Button
            variant="ghost"
            size="default"
            onClick={onExportReportPdf}
            disabled={!report || isExportingPdf}
            loading={isExportingPdf}
            loadingLabel={ui.statsExportPhasePdf}
          >
            {ui.statsExportPhasePdf}
          </Button>
        </div>
      }
    />

    <div className="training-stats-filters-shell">
      <div className="training-stats-filters">
        <div className="training-stats-filter-grid training-stats-filter-grid-primary">
          <label className="training-stats-filter-item">
            <span>{ui.statsFilterFrom}</span>
            <DatePicker
              density="compact"
              value={pendingFilters.from}
              onChange={(nextValue) =>
                setPendingFilters((current) => ({
                  ...current,
                  from: ensureDateInput(nextValue),
                }))
              }
              locale={language}
              aria-label={ui.statsFilterFrom}
            />
          </label>
          <label className="training-stats-filter-item">
            <span>{ui.statsFilterTo}</span>
            <DatePicker
              density="compact"
              value={pendingFilters.to}
              onChange={(nextValue) =>
                setPendingFilters((current) => ({
                  ...current,
                  to: ensureDateInput(nextValue),
                }))
              }
              locale={language}
              aria-label={ui.statsFilterTo}
            />
          </label>
          <label className="training-stats-filter-item">
            <span>{ui.statsFilterSamplePool}</span>
            <SelectField
              density="compact"
              value={normalizedPendingSamplePoolId}
              onValueChange={(nextValue) => {
                updatePendingFilter(
                  "samplePoolId",
                  normalizeStatsSamplePoolFilterValue(nextValue),
                );
              }}
              options={[
                { value: ALL_VALUE, label: ui.statsAllSamplePools },
                ...resolvedFilterSamplePools.map((item) => ({
                  value: item.id,
                  label: renderOptionLabelWithCount(item.name, item.count),
                  textValue: `${item.name} ${item.count}`,
                })),
              ]}
            />
          </label>
          <label className="training-stats-filter-item">
            <span>{ui.statsFilterSymbol}</span>
            <SelectField
              density="compact"
              value={pendingFilters.symbol}
              onValueChange={(nextValue) => {
                updatePendingFilter("symbol", nextValue);
              }}
              options={[
                { value: ALL_VALUE, label: ui.statsAllSymbols },
                ...(report?.filterOptions.symbols ?? []).map((item) => ({
                  value: item.symbol,
                  label: renderOptionLabelWithCount(item.symbol, item.count),
                  textValue: `${item.symbol} ${item.count}`,
                })),
              ]}
            />
          </label>
          <label className="training-stats-filter-item">
            <span>{ui.statsFilterTimeframe}</span>
            <SelectField
              density="compact"
              value={pendingFilters.timeframe}
              onValueChange={(nextValue) => {
                updatePendingFilter("timeframe", nextValue);
              }}
              options={[
                { value: ALL_VALUE, label: ui.statsAllTimeframes },
                ...(report?.filterOptions.timeframes ?? []).map((item) => ({
                  value: item.timeframe,
                  label: renderOptionLabelWithCount(item.timeframe, item.count),
                  textValue: `${item.timeframe} ${item.count}`,
                })),
              ]}
            />
          </label>
          <label className="training-stats-filter-item">
            <span>{ui.statsFilterTag}</span>
            <Input
              density="compact"
              value={pendingFilters.tag}
              onChange={(event) => {
                updatePendingFilter("tag", event.target.value);
              }}
              placeholder={ui.statsAllTags}
            />
          </label>
          <label className="training-stats-filter-item">
            <span>{ui.statsFilterResult}</span>
            <SelectField
              density="compact"
              value={pendingFilters.profitability}
              onValueChange={(nextValue) => {
                updatePendingFilter(
                  "profitability",
                  nextValue as StatsFilterState["profitability"],
                );
              }}
              options={[
                { value: "ALL", label: ui.statsFilterResultAll },
                { value: "PROFIT", label: ui.statsFilterResultProfit },
                { value: "LOSS", label: ui.statsFilterResultLoss },
              ]}
            />
          </label>
        </div>

        <div className="training-stats-filter-bottom">
          <div className="training-stats-filter-grid training-stats-filter-grid-compare">
            <label className="training-stats-filter-item">
              <span>{`${ui.statsPoolCompare} A`}</span>
              <SelectField
                density="compact"
                value={normalizedPendingComparePoolA}
                onValueChange={(nextValue) => {
                  updatePendingFilter(
                    "comparePoolA",
                    normalizeStatsComparePoolValue(nextValue),
                  );
                }}
                options={[
                  { value: "", label: ui.statsAllSamplePools },
                  ...resolvedFilterSamplePools.map((item) => ({
                    value: item.id,
                    label: item.name,
                  })),
                ]}
              />
            </label>
            <label className="training-stats-filter-item">
              <span>{`${ui.statsPoolCompare} B`}</span>
              <SelectField
                density="compact"
                value={normalizedPendingComparePoolB}
                onValueChange={(nextValue) => {
                  updatePendingFilter(
                    "comparePoolB",
                    normalizeStatsComparePoolValue(nextValue),
                  );
                }}
                options={[
                  { value: "", label: ui.statsAllSamplePools },
                  ...resolvedFilterSamplePools.map((item) => ({
                    value: item.id,
                    label: item.name,
                  })),
                ]}
              />
            </label>
          </div>

          <div className="training-stats-filter-actions">
            <div className="training-stats-quick-range">
              <Button variant="ghost" size="sm" onClick={() => onApplyQuickRange(30)}>
                {ui.statsQuick30d}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onApplyQuickRange(90)}>
                {ui.statsQuick90d}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onApplyQuickRange(180)}>
                {ui.statsQuick180d}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onApplyQuickRange(365)}>
                {ui.statsQuick365d}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onApplyQuickRange(0)}>
                {ui.statsQuickAll}
              </Button>
            </div>
            <div className="training-stats-quick-range training-stats-filter-commit">
              <Button variant="ghost" size="default" onClick={onResetFilters}>
                {ui.statsResetFilters}
              </Button>
              <Button
                variant="default"
                size="default"
                onClick={onApplyFilters}
                loading={isFilterRefreshPending}
                loadingLabel={ui.statsApplyFilters}
              >
                {ui.statsApplyFilters}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>

    {isLoading && !report ? (
      <div className="training-stats-loading">{ui.statsLoading}</div>
    ) : null}

    {!report && !isLoading ? (
      <div className="training-stats-empty">{ui.statsNoData}</div>
    ) : report ? (
      <div
        className="training-stats-content"
        aria-busy={isFilterRefreshPending ? "true" : undefined}
      >
        <div className="training-stats-overview-shell">
          <MetricStrip
            className="training-stats-grid training-stats-grid-overview training-stats-grid-overview-primary training-stats-metric-strip"
            itemClassName="training-stats-metric-strip-item"
            items={overviewPrimaryCards.map((item) => ({
              key: item.key,
              label: item.label,
              value: item.value,
              tone:
                item.tone === "profit"
                  ? "positive"
                  : item.tone === "loss"
                    ? "negative"
                    : item.tone === "risk"
                      ? "accent"
                      : "neutral",
            }))}
          />
          <MetricStrip
            className="training-stats-grid training-stats-grid-overview training-stats-grid-overview-secondary training-stats-metric-strip is-secondary"
            itemClassName="training-stats-metric-strip-item"
            items={overviewSecondaryCards.map((item) => ({
              key: item.key,
              label: item.label,
              value: item.value,
            }))}
          />
        </div>

        <div className="training-stats-grid training-stats-grid-detail">
          <div className="training-stats-panel">
            <h3>{ui.statsWinBreakdown}</h3>
            <div className="training-stats-list">
              <div>
                <span>{ui.metricOverallWinRate}</span>
                <strong>
                  {toPercentDisplay(report.winRateBreakdown.overallWinRate)}
                </strong>
              </div>
              <div>
                <span>{ui.metricLongWinRate}</span>
                <strong>{toPercentDisplay(report.winRateBreakdown.longWinRate)}</strong>
              </div>
              <div>
                <span>{ui.metricSessionWinRate}</span>
                <strong>
                  {toPercentDisplay(report.winRateBreakdown.sessionWinRate)}
                </strong>
              </div>
            </div>
            <div className="training-stats-subtable">
              <div className="training-stats-subtable-head">
                <span>{ui.statsPeriod}</span>
                <span>{ui.metricWinRate}</span>
                <span>{ui.statsTrainings}</span>
              </div>
              <div className="training-stats-subtable-body">
                {monthlyWinRateRows.map((item) => (
                  <div
                    key={item.period}
                    className="training-stats-subtable-row"
                  >
                    <span>{item.period}</span>
                    <span>{toPercentDisplay(item.winRate)}</span>
                    <span>{formatMoney(item.sessionCount, 0)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="training-stats-subtable">
              <div className="training-stats-subtable-head">
                <span>{ui.statsSamplePool}</span>
                <span>{ui.metricWinRate}</span>
                <span>{ui.statsTrainings}</span>
              </div>
              <div className="training-stats-subtable-body">
                {samplePoolWinRateRows.map((item) => (
                  <div
                    key={item.samplePoolId}
                    className="training-stats-subtable-row"
                  >
                    <span>{item.samplePoolName}</span>
                    <span>{toPercentDisplay(item.winRate)}</span>
                    <span>{formatMoney(item.sessionCount, 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="training-stats-panel">
            <h3>{ui.statsPnlStructure}</h3>
            <div className="training-stats-list">
              <div>
                <span>{ui.metricAvgProfitTrade}</span>
                <strong>{formatSignedMoney(report.pnlStructure.avgProfitTrade)}</strong>
              </div>
              <div>
                <span>{ui.metricAvgLossTrade}</span>
                <strong>{formatSignedMoney(report.pnlStructure.avgLossTrade)}</strong>
              </div>
              <div>
                <span>{ui.metricProfitLossRatio}</span>
                <strong>{formatMoney(report.pnlStructure.profitLossRatio, 2)}</strong>
              </div>
              <div>
                <span>{ui.metricExpectancy}</span>
                <strong>{formatSignedMoney(report.pnlStructure.expectancy)}</strong>
              </div>
            </div>
          </div>
          <div className="training-stats-panel">
            <h3>{ui.statsBehavior}</h3>
            <div className="training-stats-list">
              <div>
                <span>{ui.metricAvgTradesPerDay}</span>
                <strong>{formatMoney(report.behavior.avgTradesPerDay, 0)}</strong>
              </div>
              <div>
                <span>{ui.metricAvgTradesPerSession}</span>
                <strong>{formatMoney(report.behavior.avgTradesPerSession, 2)}</strong>
              </div>
              <div>
                <span>{ui.metricMaxConsecWins}</span>
                <strong>{formatMoney(report.behavior.maxConsecutiveWins, 0)}</strong>
              </div>
              <div>
                <span>{ui.metricMaxConsecLosses}</span>
                <strong>{formatMoney(report.behavior.maxConsecutiveLosses, 0)}</strong>
              </div>
              <div>
                <span>{ui.metricAvgTakeProfit}</span>
                <strong>{toPercentDisplay(report.behavior.averageTakeProfitRate)}</strong>
              </div>
              <div>
                <span>{ui.metricAvgStopLoss}</span>
                <strong>{toPercentDisplay(report.behavior.averageStopLossRate)}</strong>
              </div>
              <div>
                <span>{ui.metricAddPosition}</span>
                <strong>{formatMoney(report.behavior.addPositionCount, 0)}</strong>
              </div>
              <div>
                <span>{ui.metricReducePosition}</span>
                <strong>{formatMoney(report.behavior.reducePositionCount, 0)}</strong>
              </div>
              <div>
                <span>{ui.metricFullPosition}</span>
                <strong>{formatMoney(report.behavior.fullPositionCount, 0)}</strong>
              </div>
            </div>
          </div>
          <div className="training-stats-panel">
            <h3>{ui.statsCost}</h3>
            <div className="training-stats-list">
              <div>
                <span>{ui.metricTotalFees}</span>
                <strong>{formatMoney(report.cost.totalFees)}</strong>
              </div>
              <div>
                <span>{ui.metricAvgFeePerSession}</span>
                <strong>{formatMoney(report.cost.avgFeePerSession)}</strong>
              </div>
              <div>
                <span>{ui.metricFeeProfitRatio}</span>
                <strong>{formatMoney(report.cost.feeToProfitRatio, 2)}</strong>
              </div>
              <div>
                <span>{ui.metricSlippageImpact}</span>
                <strong>{formatMoney(report.cost.slippageImpact)}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="training-stats-panel">
          <h3>{ui.statsComparisons}</h3>
          <div className="training-stats-compare-grid">
            {comparisonCards.map((card) => (
              <div key={card.key} className="training-stats-compare-card">
                <div className="training-stats-compare-head">{card.title}</div>
                <div className="training-stats-compare-legend">
                  <span>{card.data.leftLabel || emptyPlaceholder}</span>
                  <span>{card.data.rightLabel || emptyPlaceholder}</span>
                </div>
                <div className="training-stats-compare-matrix">
                  <div className="training-stats-compare-matrix-row training-stats-compare-matrix-head">
                    <span>{ui.statsOverview}</span>
                    <span>{card.data.leftLabel || emptyPlaceholder}</span>
                    <span>{card.data.rightLabel || emptyPlaceholder}</span>
                    <span>{ui.statsDelta}</span>
                  </div>
                  {comparisonMetrics.map((metric) => (
                    <div
                      key={`${card.key}-${metric.key}`}
                      className={`training-stats-compare-matrix-row ${metric.deltaTone(card.data.delta)}`}
                    >
                      <span>{metric.label}</span>
                      <span>{metric.valueOf(card.data.left)}</span>
                      <span>{metric.valueOf(card.data.right)}</span>
                      <span>{metric.deltaOf(card.data.delta)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="training-stats-panel">
          <h3>{ui.statsMonthlyPerformance}</h3>
          <div className="training-stats-month-grid">
            {monthlyTrendCards.map((item) => (
              <div
                key={`month-trend-${item.period}`}
                className={`training-stats-month-card tone-${item.tone} trend-${item.trend}`}
              >
                <div className="training-stats-month-head">
                  <span>{item.period}</span>
                  <strong>{formatSignedMoney(item.totalPnl)}</strong>
                </div>
                <div className="training-stats-month-metrics">
                  <div>
                    <span>{ui.metricTotalReturnRate}</span>
                    <strong>{toPercentDisplay(item.totalReturnRate)}</strong>
                  </div>
                  <div>
                    <span>{ui.metricWinRate}</span>
                    <strong>{toPercentDisplay(item.winRate)}</strong>
                  </div>
                  <div>
                    <span>{ui.metricMaxDrawdown}</span>
                    <strong>{toPercentDisplay(item.maxDrawdownRate)}</strong>
                  </div>
                  <div>
                    <span>{ui.statsTrainings}</span>
                    <strong>{formatMoney(item.sessionCount, 0)}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="training-stats-table-wrap">
            <table className="training-stats-table">
              <thead>
                <tr>
                  <th>{ui.statsPeriod}</th>
                  <th>{ui.statsTrainings}</th>
                  <th>{ui.metricTotalPnl}</th>
                  <th>{ui.metricWinRate}</th>
                  <th>{ui.metricMaxDrawdown}</th>
                  <th>{ui.metricTotalReturnRate}</th>
                </tr>
              </thead>
              <tbody>
                {report.monthlyPerformance.map((item) => (
                  <tr key={item.period}>
                    <td>{item.period}</td>
                    <td>{formatMoney(item.sessionCount, 0)}</td>
                    <td>{formatSignedMoney(item.totalPnl)}</td>
                    <td>{toPercentDisplay(item.winRate)}</td>
                    <td>{toPercentDisplay(item.maxDrawdownRate)}</td>
                    <td>{toPercentDisplay(item.totalReturnRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="training-stats-grid training-stats-grid-table">
          <div className="training-stats-panel">
            <h3>{`${ui.statsPeriod}${sessionOptionSeparator}${ui.statsPeriodWeekShort}`}</h3>
            <div className="training-stats-table-wrap">
              <table className="training-stats-table">
                <thead>
                  <tr>
                    <th>{ui.statsPeriod}</th>
                    <th>{ui.statsTrainings}</th>
                    <th>{ui.metricTotalPnl}</th>
                    <th>{ui.metricWinRate}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.weeklyPerformance.slice(-24).map((item) => (
                    <tr key={item.period}>
                      <td>{item.period}</td>
                      <td>{formatMoney(item.sessionCount, 0)}</td>
                      <td>{formatSignedMoney(item.totalPnl)}</td>
                      <td>{toPercentDisplay(item.winRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="training-stats-panel">
            <h3>{`${ui.statsPeriod}${sessionOptionSeparator}${ui.statsPeriodDayShort}`}</h3>
            <div className="training-stats-table-wrap">
              <table className="training-stats-table">
                <thead>
                  <tr>
                    <th>{ui.statsPeriod}</th>
                    <th>{ui.statsTrainings}</th>
                    <th>{ui.metricTotalPnl}</th>
                    <th>{ui.metricWinRate}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.dailyPerformance.slice(-24).map((item) => (
                    <tr key={item.period}>
                      <td>{item.period}</td>
                      <td>{formatMoney(item.sessionCount, 0)}</td>
                      <td>{formatSignedMoney(item.totalPnl)}</td>
                      <td>{toPercentDisplay(item.winRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="training-stats-grid training-stats-grid-table">
          <div className="training-stats-panel">
            <h3>{ui.statsPoolDimension}</h3>
            <div className="training-stats-table-wrap">
              <table className="training-stats-table">
                <thead>
                  <tr>
                    <th>{ui.statsSamplePool}</th>
                    <th>{ui.statsTrainings}</th>
                    <th>{ui.metricTotalReturnRate}</th>
                    <th>{ui.metricWinRate}</th>
                    <th>{ui.metricTotalTrades}</th>
                    <th>{ui.metricAvgHold}</th>
                  </tr>
                </thead>
                <tbody>
                  {resolvedSamplePoolStats.map((item) => (
                    <tr key={item.samplePoolId}>
                      <td>{item.samplePoolName}</td>
                      <td>{formatMoney(item.sessionCount, 0)}</td>
                      <td>{toPercentDisplay(item.totalReturnRate)}</td>
                      <td>{toPercentDisplay(item.winRate)}</td>
                      <td>{formatMoney(item.totalTrades, 0)}</td>
                      <td>{toDurationText(item.avgHoldBars, ui)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="training-stats-panel">
            <h3>{ui.statsSymbolDimension}</h3>
            <div className="training-stats-table-wrap">
              <table className="training-stats-table">
                <thead>
                  <tr>
                    <th>{ui.statsSymbol}</th>
                    <th>{ui.statsTrainings}</th>
                    <th>{ui.statsBest}</th>
                    <th>{ui.statsWorst}</th>
                    <th>{ui.statsAverage}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.symbolStats.map((item) => (
                    <tr key={item.symbol}>
                      <td>{item.symbol}</td>
                      <td>{formatMoney(item.sessionCount, 0)}</td>
                      <td>{toPercentDisplay(item.bestReturn)}</td>
                      <td>{toPercentDisplay(item.worstReturn)}</td>
                      <td>{toPercentDisplay(item.avgReturn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="training-stats-panel">
          <h3>{ui.statsTimeframeDimension}</h3>
          <div className="training-stats-table-wrap">
            <table className="training-stats-table">
              <thead>
                <tr>
                  <th>{ui.statsTimeframe}</th>
                  <th>{ui.statsTrainings}</th>
                  <th>{ui.metricWinRate}</th>
                  <th>{ui.statsAverage}</th>
                  <th>{ui.metricMaxDrawdown}</th>
                  <th>{ui.statsTradeFrequency}</th>
                </tr>
              </thead>
              <tbody>
                {report.timeframeStats.map((item) => (
                  <tr key={item.timeframe}>
                    <td>{item.timeframe}</td>
                    <td>{formatMoney(item.sessionCount, 0)}</td>
                    <td>{toPercentDisplay(item.winRate)}</td>
                    <td>{toPercentDisplay(item.avgReturn)}</td>
                    <td>{toPercentDisplay(item.maxDrawdownRate)}</td>
                    <td>{formatMoney(item.tradeFrequency, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="training-stats-panel">
          <h3>{ui.statsSingleReport}</h3>
          <div className="training-stats-single-export">
            <label className="training-stats-filter-item">
              <span>{ui.statsSelectSession}</span>
              <SelectField
                density="compact"
                value={selectedSessionId}
                onValueChange={setSelectedSessionId}
                options={sessionOptions}
              />
            </label>
            <Button
              variant="ghost"
              size="sm"
              disabled={!selectedSessionId}
              onClick={onExportSessionCsv}
            >
              {ui.statsExportSessionCsv}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!selectedSessionId}
              onClick={onExportSessionPdf}
            >
              {ui.statsExportSessionPdf}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefreshReport}
              title={ui.statsRefresh}
            >
              <AppIcon name="navHistory" />
            </Button>
          </div>
        </div>
      </div>
    ) : null}
  </>
);
