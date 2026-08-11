// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useState, type UIEvent } from "react";

import type {
  ApiBacktestFill,
  ApiBacktestResultDetail,
} from "@/api";
import {
  toBacktestDetailAnalytics,
  type BacktestExplainMode,
} from "@/domains/backtest/backtestAnalytics";
import {
  HistoryReplayChartView,
  type HistoryReplayChartBindings,
  type HistoryReplayChartViewProps,
} from "@/domains/chart/HistoryReplayChart";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { ChartDisplayEdgeConfig } from "@/domains/chart/display";
import { useI18n } from "@/frontend-kernel/i18n";
import { Button } from "@/ui/primitives/button";
import { SegmentedControl } from "@/ui/primitives/segmented-control";
import { resolveTradeVisualThemePalette } from "@/ui/theme/visualColors";
import { BacktestAnalysisTearsheet } from "@/workspaces/strategy-backtest/detail/BacktestAnalysisTearsheet";
import { BacktestSimpleView } from "@/workspaces/strategy-backtest/detail/BacktestSimpleView";
import {
  buildBacktestReplayProject,
} from "@/workspaces/strategy-backtest/strategyBacktestReplayProject";
import type {
  StrategyBacktestDetailStrategyIndicator,
} from "@/workspaces/strategy-backtest/strategyBacktestResultDetailWindow";
import {
  resolveFillEquityDelta,
} from "@/workspaces/strategy-backtest/strategyBacktestDisplay";
import {
  resolveStrategyBacktestSignedFinancialTone,
} from "@/workspaces/strategy-backtest/strategyBacktestFinancialTone";
import { formatMoney as formatGlobalMoney } from "@/ui/formatting/format";

type StrategyBacktestDetailPanelProps = {
  chartRenderMode: NonNullable<HistoryReplayChartViewProps["chartRenderMode"]>;
  createSystemMarkers: HistoryReplayChartViewProps["createSystemMarkers"];
  customScriptIndicator?: StrategyBacktestDetailStrategyIndicator | null;
  detail: ApiBacktestResultDetail | null;
  emptyLabel?: string;
  explainMode: BacktestExplainMode;
  focusRawBarIndex: number | null;
  focusRequestNonce: number;
  historyReplayChartBindings: HistoryReplayChartBindings;
  language: HistoryReplayChartViewProps["language"];
  onChartRenderModeChange: NonNullable<HistoryReplayChartViewProps["onChartRenderModeChange"]>;
  onDisplayPeriodChange: (period: DisplayPeriodKey) => void;
  onExplainModeChange: (mode: BacktestExplainMode) => void;
  onOpenChartSettings: () => void;
  onSelectFill: (fill: ApiBacktestFill) => void;
  showGlobalDecimals: boolean;
  priceColorMode: HistoryReplayChartViewProps["priceColorMode"];
  selectedFillId: string | null;
  showChartSettingsModal: boolean;
  themeMode: HistoryReplayChartViewProps["themeMode"];
  tradeColorTheme: NonNullable<HistoryReplayChartViewProps["tradeColorTheme"]>;
  trainerDisplayPeriod: DisplayPeriodKey;
  trainerPeriodOptionsByBase: HistoryReplayChartViewProps["trainerPeriodOptionsByBase"];
};

const MONTH_LABEL_KEYS = [
  "trainer.strategyBacktest.monthJan",
  "trainer.strategyBacktest.monthFeb",
  "trainer.strategyBacktest.monthMar",
  "trainer.strategyBacktest.monthApr",
  "trainer.strategyBacktest.monthMay",
  "trainer.strategyBacktest.monthJun",
  "trainer.strategyBacktest.monthJul",
  "trainer.strategyBacktest.monthAug",
  "trainer.strategyBacktest.monthSep",
  "trainer.strategyBacktest.monthOct",
  "trainer.strategyBacktest.monthNov",
  "trainer.strategyBacktest.monthDec",
] as const;

const TOOLTIP_KEYS = {
  totalReturn: "trainer.strategyBacktest.tooltip.totalReturn",
  CAGR: "trainer.strategyBacktest.tooltip.CAGR",
  annualizedReturn: "trainer.strategyBacktest.tooltip.annualizedReturn",
  annualVolatility: "trainer.strategyBacktest.tooltip.annualVolatility",
  sharpe: "trainer.strategyBacktest.tooltip.sharpe",
  sortino: "trainer.strategyBacktest.tooltip.sortino",
  calmar: "trainer.strategyBacktest.tooltip.calmar",
  downsideDeviation: "trainer.strategyBacktest.tooltip.downsideDeviation",
  VaR95: "trainer.strategyBacktest.tooltip.VaR95",
  maxDrawdown: "trainer.strategyBacktest.tooltip.maxDrawdown",
  avgDrawdown: "trainer.strategyBacktest.tooltip.avgDrawdown",
  maxDrawdownDuration: "trainer.strategyBacktest.tooltip.maxDrawdownDuration",
  ulcerIndex: "trainer.strategyBacktest.tooltip.ulcerIndex",
  totalTrades: "trainer.strategyBacktest.tooltip.totalTrades",
  winRate: "trainer.strategyBacktest.tooltip.winRate",
  profitFactor: "trainer.strategyBacktest.tooltip.profitFactor",
  payoffRatio: "trainer.strategyBacktest.tooltip.payoffRatio",
  expectancy: "trainer.strategyBacktest.tooltip.expectancy",
  avgWin: "trainer.strategyBacktest.tooltip.avgWin",
  avgLoss: "trainer.strategyBacktest.tooltip.avgLoss",
  largestWin: "trainer.strategyBacktest.tooltip.largestWin",
  largestLoss: "trainer.strategyBacktest.tooltip.largestLoss",
  maxConsecutiveWins: "trainer.strategyBacktest.tooltip.maxConsecutiveWins",
  maxConsecutiveLosses: "trainer.strategyBacktest.tooltip.maxConsecutiveLosses",
  exposure: "trainer.strategyBacktest.tooltip.exposure",
  totalCost: "trainer.strategyBacktest.tooltip.totalCost",
  benchmarkReturn: "trainer.strategyBacktest.tooltip.benchmarkReturn",
  excessReturn: "trainer.strategyBacktest.tooltip.excessReturn",
  alpha: "trainer.strategyBacktest.tooltip.alpha",
  beta: "trainer.strategyBacktest.tooltip.beta",
  informationRatio: "trainer.strategyBacktest.tooltip.informationRatio",
  correlation: "trainer.strategyBacktest.tooltip.correlation",
  trackingError: "trainer.strategyBacktest.tooltip.trackingError",
} as const;

const BACKTEST_DETAIL_CHART_EDGE_CONFIG: ChartDisplayEdgeConfig = Object.freeze({
  xAxisSize: 32,
  yAxisSize: 64,
  rightOffset: 4,
  minRightVisibleBars: 4,
  maxRightOffsetMultiplier: 4,
});
const BACKTEST_FILL_PAGE_SIZE = 24;
const BACKTEST_FILL_SCROLL_LOAD_MARGIN_PX = 48;

export const StrategyBacktestDetailPanel = ({
  chartRenderMode,
  createSystemMarkers,
  customScriptIndicator = null,
  detail,
  emptyLabel,
  explainMode,
  focusRawBarIndex,
  focusRequestNonce,
  historyReplayChartBindings,
  language,
  onChartRenderModeChange,
  onDisplayPeriodChange,
  onExplainModeChange,
  onOpenChartSettings,
  onSelectFill,
  showGlobalDecimals,
  priceColorMode,
  selectedFillId,
  showChartSettingsModal,
  themeMode,
  tradeColorTheme,
  trainerDisplayPeriod,
  trainerPeriodOptionsByBase,
}: StrategyBacktestDetailPanelProps) => {
  const { t, formatNumber, formatDateTime } = useI18n();
  const [visibleFillCount, setVisibleFillCount] = useState(BACKTEST_FILL_PAGE_SIZE);
  const resultDetailId = detail?.result.id ?? "";
  const metrics = useMemo(
    () => (detail ? toBacktestDetailAnalytics(detail) : null),
    [detail],
  );
  const backtestReplayProject = useMemo(
    () => (detail ? buildBacktestReplayProject(detail) : null),
    [detail],
  );
  const selectedFillIndex = useMemo(
    () =>
      detail && selectedFillId
        ? detail.fills.findIndex((fill) => fill.id === selectedFillId)
        : -1,
    [detail, selectedFillId],
  );
  const selectedFill = selectedFillIndex >= 0 ? detail?.fills[selectedFillIndex] ?? null : null;
  const tradeVisual = useMemo(
    () => resolveTradeVisualThemePalette(themeMode, tradeColorTheme),
    [themeMode, tradeColorTheme],
  );
  useEffect(() => {
    setVisibleFillCount(BACKTEST_FILL_PAGE_SIZE);
  }, [resultDetailId]);
  const handleFillListScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const remainingScroll = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remainingScroll > BACKTEST_FILL_SCROLL_LOAD_MARGIN_PX) {
      return;
    }
    setVisibleFillCount((current) =>
      Math.min(current + BACKTEST_FILL_PAGE_SIZE, detail?.fills.length ?? current),
    );
  }, [detail?.fills.length]);
  const selectedFillFocusMarker = useMemo<HistoryReplayChartViewProps["focusMarker"]>(() => {
    if (!selectedFill) {
      return null;
    }
    const sequence = selectedFillIndex + 1;
    const sidePrefix = selectedFill.side === "BUY" ? "B" : "S";
    return {
      rawBarIndex: selectedFill.fillIndex,
      label: `${sidePrefix}${sequence}`,
      tone: selectedFill.side === "BUY" ? "primary" : "danger",
      toneColor: selectedFill.side === "BUY" ? tradeVisual.buyMarker : tradeVisual.sellMarker,
      fullHeight: true,
    };
  }, [selectedFill, selectedFillIndex, tradeVisual.buyMarker, tradeVisual.sellMarker]);

  const formatPercent = (value: number): string =>
    Number.isFinite(value)
      ? formatNumber(value, {
          style: "percent",
          maximumFractionDigits: 2,
        })
      : "-";
  const formatMoneyValue = (value: number): string =>
    Number.isFinite(value) ? formatGlobalMoney(value) : "-";
  const formatInteger = (value: number): string =>
    Number.isFinite(value)
      ? formatNumber(value, { maximumFractionDigits: 0 })
      : "-";
  const formatRatio = (value: number): string => {
    if (value === Number.POSITIVE_INFINITY) {
      return t("trainer.strategyBacktest.infinity");
    }
    return Number.isFinite(value)
      ? formatNumber(value, { maximumFractionDigits: 2 })
      : "-";
  };

  const tradeChartNode = useMemo(
    () =>
      detail ? (
        <div className="strategy-backtest-history-chart">
          <HistoryReplayChartView
            key={detail.result.id}
            project={backtestReplayProject}
            themeMode={themeMode}
            showGlobalDecimals={showGlobalDecimals}
            priceColorMode={priceColorMode}
            tradeColorTheme={tradeColorTheme}
            language={language}
            displayPeriod={trainerDisplayPeriod}
            trainerPeriodOptionsByBase={trainerPeriodOptionsByBase}
            bindings={historyReplayChartBindings}
            initialDisplayPeriod={backtestReplayProject?.replay?.displayPeriod}
            createSystemMarkers={createSystemMarkers}
            chartRenderMode={chartRenderMode}
            edgeConfig={BACKTEST_DETAIL_CHART_EDGE_CONFIG}
            customScriptIndicator={customScriptIndicator}
            disableIndicators
            equityCurvePane={{
              points: detail.equityCurve,
              title: t("trainer.strategyBacktest.equityCurve"),
            }}
            onChartRenderModeChange={onChartRenderModeChange}
            onDisplayPeriodChange={onDisplayPeriodChange}
            showChartRenderModeSwitch
            showIndicatorButton
            showPeriodSwitch
            isChartSettingsActive={showChartSettingsModal}
            onOpenChartSettings={onOpenChartSettings}
            showReplayDrawings={false}
            systemMarkerMode="TRADE_ONLY"
            showVolumePane={false}
            volumePaneRatio={0.28}
            focusBehavior="scroll-and-select"
            focusRawBarIndex={focusRawBarIndex}
            focusRequestNonce={focusRequestNonce}
            focusMarker={selectedFillFocusMarker}
            changeBubblePlacement="toolbar-right"
          />
        </div>
      ) : null,
    [
      backtestReplayProject,
      chartRenderMode,
      createSystemMarkers,
      customScriptIndicator,
      detail,
      focusRawBarIndex,
      focusRequestNonce,
      historyReplayChartBindings,
      language,
      onChartRenderModeChange,
      onDisplayPeriodChange,
      onOpenChartSettings,
      showGlobalDecimals,
      priceColorMode,
      selectedFillFocusMarker,
      showChartSettingsModal,
      t,
      themeMode,
      tradeColorTheme,
      trainerDisplayPeriod,
      trainerPeriodOptionsByBase,
    ],
  );

  const fillListNode = useMemo(() => {
    if (!detail) {
      return null;
    }
    const shownFillCount = Math.min(visibleFillCount, detail.fills.length);
    const shownFills = detail.fills.slice(0, shownFillCount);
    return (
        <div className="strategy-backtest-fill-list" onScroll={handleFillListScroll}>
          <div className="strategy-backtest-fill-head" aria-hidden="true">
            <span className="strategy-backtest-fill-cell strategy-backtest-fill-side">
              {t("trainer.strategyBacktest.fillSide")}
            </span>
            <span className="strategy-backtest-fill-cell strategy-backtest-fill-qty">
              {t("trainer.strategyBacktest.fillQty")}
            </span>
            <span className="strategy-backtest-fill-cell strategy-backtest-fill-price">
              {t("trainer.strategyBacktest.fillPrice")}
            </span>
            <span className="strategy-backtest-fill-cell strategy-backtest-fill-time">
              {t("trainer.strategyBacktest.fillTime")}
            </span>
            <span className="strategy-backtest-fill-cell strategy-backtest-fill-pnl">
              {t("trainer.strategyBacktest.fillPnl")}
            </span>
          </div>
          {shownFills.map((fill) => {
            const fillPnl = resolveFillEquityDelta(detail, fill);
            return (
              <Button
                key={fill.id}
                type="button"
                variant="secondary"
                className={`strategy-backtest-fill-row ${fill.id === selectedFillId ? "is-active" : ""}`}
                onClick={() => onSelectFill(fill)}
              >
                <span
                  className="strategy-backtest-fill-cell strategy-backtest-fill-side"
                  data-side={fill.side}
                >
                  {fill.side}
                </span>
                <strong className="strategy-backtest-fill-cell strategy-backtest-fill-qty ui-num">
                  {formatNumber(fill.qty, { maximumFractionDigits: 4 })}
                </strong>
                <em className="strategy-backtest-fill-cell strategy-backtest-fill-price ui-num">
                  {formatMoneyValue(fill.price)}
                </em>
                <span className="strategy-backtest-fill-cell strategy-backtest-fill-time">
                  <small>{formatDateTime(fill.fillTime)}</small>
                  <small className="strategy-backtest-fill-bar">
                    {t("trainer.strategyBacktest.fillBar")}{" "}
                    {formatNumber(fill.fillIndex, { maximumFractionDigits: 0 })}
                  </small>
                </span>
                <strong
                  className="strategy-backtest-fill-cell strategy-backtest-fill-pnl ui-num"
                  data-tone={resolveStrategyBacktestSignedFinancialTone(fillPnl)}
                >
                  {fillPnl === null ? "-" : formatMoneyValue(fillPnl)}
                </strong>
              </Button>
            );
          })}
          {detail.fills.length ? (
            <small className="strategy-backtest-fill-count">
              {t("trainer.strategyBacktest.fillListShownCount", {
                count: formatNumber(shownFillCount, { maximumFractionDigits: 0 }),
                total: formatNumber(detail.fills.length, { maximumFractionDigits: 0 }),
              })}
            </small>
          ) : null}
          {!detail.fills.length ? (
            <div className="strategy-backtest-empty">{t("trainer.strategyBacktest.noFills")}</div>
          ) : null}
        </div>
      );
  },
    [
      detail,
      formatDateTime,
      formatMoneyValue,
      formatNumber,
      handleFillListScroll,
      onSelectFill,
      selectedFillId,
      t,
      visibleFillCount,
    ],
  );

  if (!detail || !metrics) {
    return (
      <div className="strategy-backtest-panel strategy-backtest-detail-panel">
        <div className="strategy-backtest-panel-head">
          <h2>{t("trainer.strategyBacktest.detail")}</h2>
        </div>
        <div className="strategy-backtest-empty">
          {emptyLabel ?? t("trainer.strategyBacktest.selectResult")}
        </div>
      </div>
    );
  }

  const proLabels = {
    benchmarkUnavailable: t("trainer.strategyBacktest.benchmarkUnavailable"),
    equityVsBenchmark: t("trainer.strategyBacktest.equityVsBenchmark"),
    underwaterDrawdown: t("trainer.strategyBacktest.underwaterDrawdown"),
    monthlyReturns: t("trainer.strategyBacktest.monthlyReturns"),
    heatmapRange5y: t("trainer.strategyBacktest.heatmapRange5y"),
    heatmapRange10y: t("trainer.strategyBacktest.heatmapRange10y"),
    heatmapRangeAll: t("trainer.strategyBacktest.heatmapRangeAll"),
    returnDistribution: t("trainer.strategyBacktest.returnDistribution"),
    rollingRisk: t("trainer.strategyBacktest.rollingRisk"),
    groupedMetrics: t("trainer.strategyBacktest.groupedMetrics"),
    priceVolumeInspection: t("trainer.strategyBacktest.priceVolumeInspection"),
    strategyEquity: t("trainer.strategyBacktest.strategyEquity"),
    buyHoldBenchmark: t("trainer.strategyBacktest.buyHoldBenchmark"),
    periodReturns: t("trainer.strategyBacktest.periodReturns"),
    sharpe: t("trainer.strategyBacktest.sharpe"),
    sortino: t("trainer.strategyBacktest.sortino"),
    calmar: t("trainer.strategyBacktest.calmar"),
    CAGR: t("trainer.strategyBacktest.CAGR"),
    maxDrawdown: t("trainer.strategyBacktest.maxDrawdown"),
    profitFactor: t("trainer.strategyBacktest.profitFactor"),
    annualVolatility: t("trainer.strategyBacktest.annualVolatility"),
    skewness: t("trainer.strategyBacktest.skewness"),
    kurtosis: t("trainer.strategyBacktest.kurtosis"),
    totalReturn: t("trainer.strategyBacktest.totalReturn"),
    annualizedReturn: t("trainer.strategyBacktest.annualizedReturn"),
    downsideDeviation: t("trainer.strategyBacktest.downsideDeviation"),
    VaR95: t("trainer.strategyBacktest.VaR95"),
    avgDrawdown: t("trainer.strategyBacktest.avgDrawdown"),
    maxDrawdownDuration: t("trainer.strategyBacktest.maxDrawdownDuration"),
    ulcerIndex: t("trainer.strategyBacktest.ulcerIndex"),
    totalTrades: t("trainer.strategyBacktest.totalTrades"),
    winRate: t("trainer.strategyBacktest.winRate"),
    payoffRatio: t("trainer.strategyBacktest.payoffRatio"),
    expectancy: t("trainer.strategyBacktest.expectancy"),
    avgWin: t("trainer.strategyBacktest.avgWin"),
    avgLoss: t("trainer.strategyBacktest.avgLoss"),
    largestWin: t("trainer.strategyBacktest.largestWin"),
    largestLoss: t("trainer.strategyBacktest.largestLoss"),
    maxConsecutiveWins: t("trainer.strategyBacktest.maxConsecutiveWins"),
    maxConsecutiveLosses: t("trainer.strategyBacktest.maxConsecutiveLosses"),
    exposure: t("trainer.strategyBacktest.exposure"),
    totalCost: t("trainer.strategyBacktest.totalCost"),
    benchmarkReturn: t("trainer.strategyBacktest.benchmarkReturn"),
    excessReturn: t("trainer.strategyBacktest.excessReturn"),
    alpha: t("trainer.strategyBacktest.alpha"),
    beta: t("trainer.strategyBacktest.beta"),
    informationRatio: t("trainer.strategyBacktest.informationRatio"),
    correlation: t("trainer.strategyBacktest.correlation"),
    trackingError: t("trainer.strategyBacktest.trackingError"),
    returnsSection: t("trainer.strategyBacktest.returnsSection"),
    riskSection: t("trainer.strategyBacktest.riskSection"),
    tradesSection: t("trainer.strategyBacktest.tradesSection"),
    benchmarkSection: t("trainer.strategyBacktest.benchmarkSection"),
  };
  const tooltips = Object.fromEntries(
    Object.entries(TOOLTIP_KEYS).map(([key, messageId]) => [key, t(messageId)]),
  );

  return (
    <div className="strategy-backtest-panel strategy-backtest-detail-panel">
      <div className="strategy-backtest-panel-head">
        <h2>{detail.result.symbol ?? t("trainer.strategyBacktest.detail")}</h2>
        <SegmentedControl<BacktestExplainMode>
          className="strategy-backtest-explain-control"
          size="sm"
          value={explainMode}
          onChange={onExplainModeChange}
          options={[
            { value: "simple", label: t("trainer.strategyBacktest.explainSimple") },
            { value: "professional", label: t("trainer.strategyBacktest.explainProfessional") },
          ]}
          gridTemplateColumns="repeat(2, minmax(0, 1fr))"
        />
      </div>
      {explainMode === "simple" ? (
        <BacktestSimpleView
          metrics={metrics}
          chartNode={tradeChartNode}
          fillListNode={fillListNode}
          labels={{
            totalReturn: t("trainer.strategyBacktest.totalReturn"),
            maxDrawdown: t("trainer.strategyBacktest.maxDrawdown"),
            winRate: t("trainer.strategyBacktest.winRate"),
            excessReturn: t("trainer.strategyBacktest.excessReturn"),
            tradeChart: t("trainer.strategyBacktest.tradeChart"),
            fills: t("trainer.strategyBacktest.trades"),
          }}
          formatPercent={formatPercent}
        />
      ) : (
        <BacktestAnalysisTearsheet
          metrics={metrics}
          chartNode={tradeChartNode}
          labels={proLabels}
          tooltips={tooltips}
          monthLabels={MONTH_LABEL_KEYS.map((key) => t(key))}
          themeMode={themeMode}
          priceColorMode={priceColorMode}
          formatInteger={formatInteger}
          formatMoney={formatMoneyValue}
          formatNumber={(value) =>
            Number.isFinite(value)
              ? formatNumber(value, { maximumFractionDigits: 2 })
              : "-"
          }
          formatPercent={formatPercent}
          formatRatio={formatRatio}
          notAvailableLabel={t("common.metric.notAvailable")}
        />
      )}
    </div>
  );
};
