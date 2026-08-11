// SPDX-License-Identifier: GPL-3.0-only

import { useI18n } from "../src/frontend-kernel/i18n";
import { Button } from "../src/ui/primitives/button";
import {
  MetricStrip,
  WorkspaceFrameShell,
  WorkspacePageShell,
  WorkspaceSection,
} from "../src/ui/components";

const StrategyBacktestPreviewChart = () => (
  <div className="strategy-backtest-history-chart" aria-hidden="true">
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
        alignItems: "end",
        gap: "8px",
        height: "100%",
        padding: "12px",
        boxSizing: "border-box",
      }}
    >
      {[38, 52, 47, 68, 59, 76, 72, 88].map((height, index) => (
        <span
          key={index}
          style={{
            display: "block",
            minHeight: "24px",
            height: `${height}%`,
            borderRadius: "var(--ui-radius-control)",
            background:
              index % 2 === 0
                ? "color-mix(in srgb, var(--price-up-color) 28%, transparent)"
                : "color-mix(in srgb, var(--visual-accent-base) 28%, transparent)",
          }}
        />
      ))}
    </div>
  </div>
);

const StrategyBacktestPreviewMetricStrip = () => {
  const { t, formatNumber } = useI18n();

  return (
    <MetricStrip
      className="strategy-backtest-run-summary"
      itemClassName="strategy-backtest-run-summary-item"
      items={[
        {
          key: "success",
          label: t("trainer.strategyBacktest.summarySuccess"),
          value: <span className="ui-num">{formatNumber(38)}</span>,
          tone: "positive",
        },
        {
          key: "skipped",
          label: t("trainer.strategyBacktest.summarySkipped"),
          value: <span className="ui-num">{formatNumber(4)}</span>,
          tone: "warning",
        },
        {
          key: "failed",
          label: t("trainer.strategyBacktest.summaryFailed"),
          value: <span className="ui-num">{formatNumber(1)}</span>,
          tone: "danger",
        },
        {
          key: "return",
          label: t("trainer.strategyBacktest.return"),
          value: (
            <span className="ui-num">
              {formatNumber(0.182, { style: "percent" })}
            </span>
          ),
          support: t("trainer.strategyBacktest.maxDrawdown"),
          tone: "positive",
        },
      ]}
    />
  );
};

const StrategyBacktestPreviewRuleCard = ({
  directionKey,
  operatorKey,
}: {
  directionKey:
    | "trainer.strategyBacktest.signalRule.direction.buy"
    | "trainer.strategyBacktest.signalRule.direction.sell"
    | "trainer.strategyBacktest.signalRule.direction.short";
  operatorKey:
    | "trainer.strategyBacktest.signalRule.operator.crossAbove"
    | "trainer.strategyBacktest.signalRule.operator.crossBelow"
    | "trainer.strategyBacktest.signalRule.operator.greater";
}) => {
  const { t } = useI18n();

  return (
    <section className="strategy-signal-rule-direction">
      <div className="strategy-signal-rule-direction-head">
        <label className="strategy-signal-rule-enable">
          <input type="checkbox" defaultChecked />
          <span>{t(directionKey)}</span>
        </label>
        <span className="strategy-signal-rule-reserved">
          {t("trainer.strategyBacktest.signalRule.availableOutputs", {
            count: "6",
          })}
        </span>
      </div>
      <div className="strategy-signal-rule-body">
        <div className="strategy-signal-rule-conditions">
          {[0, 1, 2].map((index) => (
            <div className="strategy-signal-rule-condition" key={index}>
              <span className="strategy-signal-rule-operand">
                <button
                  className="strategy-backtest-select strategy-signal-rule-select"
                  type="button"
                >
                  EMA_FAST_12_LONG_OUTPUT
                </button>
              </span>
              <button
                className="strategy-backtest-select strategy-signal-rule-operator"
                type="button"
              >
                {t(operatorKey)}
              </button>
              <span className="strategy-signal-rule-operand">
                <button
                  className="strategy-backtest-select strategy-signal-rule-select"
                  type="button"
                >
                  {index === 0
                    ? "EMA_SLOW_26_SIGNAL_OUTPUT"
                    : t("trainer.strategyBacktest.signalRule.price.close")}
                </button>
              </span>
              <button
                aria-label={t(
                  "trainer.strategyBacktest.signalRule.deleteCondition",
                )}
                className="strategy-signal-rule-constant"
                title={t("trainer.strategyBacktest.signalRule.deleteCondition")}
                type="button"
              >
                x
              </button>
            </div>
          ))}
        </div>
        <Button
          className="strategy-signal-rule-add"
          type="button"
          variant="secondary"
          size="sm"
        >
          {t("trainer.strategyBacktest.signalRule.addCondition")}
        </Button>
      </div>
    </section>
  );
};

export const StrategyBacktestPreviewPage = () => {
  const { t, formatNumber } = useI18n();

  return (
    <WorkspacePageShell
      template="workbench"
      className="strategy-backtest-page"
      bodyClassName="strategy-backtest-page-body"
    >
      <WorkspaceFrameShell className="strategy-backtest-shell">
        <section className="strategy-backtest-layout">
          <div className="strategy-backtest-config">
            <WorkspaceSection
              shell
              className="strategy-backtest-panel strategy-backtest-config-section"
              title={
                <span data-i18n-critical="true">
                  {t("trainer.strategyBacktest.config")}
                </span>
              }
              bodyClassName="strategy-backtest-config-section-body"
            >
              <div className="strategy-backtest-config-scroll">
                <label className="strategy-backtest-field">
                  <span>{t("trainer.strategyBacktest.batchName")}</span>
                  <input value="Momentum composite Q3" readOnly />
                </label>
                <label className="strategy-backtest-field">
                  <span className="strategy-backtest-field-label">
                    <span>{t("trainer.strategyBacktest.samplePool")}</span>
                    <small className="strategy-backtest-pool-universe">
                      {t("trainer.strategyBacktest.poolUniverseInline", {
                        count: formatNumber(43),
                      })}
                    </small>
                  </span>
                  <button className="strategy-backtest-select" type="button">
                    NASDAQ 100 rotation sample
                  </button>
                </label>
                <section className="strategy-backtest-environment">
                  <div className="strategy-backtest-environment-head">
                    <div>
                      <h3>{t("trainer.strategyBacktest.environment")}</h3>
                    </div>
                    <Button type="button" variant="secondary" size="sm">
                      {t("trainer.strategyBacktest.environmentDetails")}
                    </Button>
                  </div>
                  <div className="strategy-backtest-environment-fields">
                    <label className="strategy-backtest-field">
                      <span>
                        {t("trainer.strategyBacktest.initialCapital")}
                      </span>
                      <input value="$100,000" readOnly />
                    </label>
                    <label className="strategy-backtest-field">
                      <span>{t("trainer.strategyBacktest.orderAmount")}</span>
                      <input value="$10,000" readOnly />
                    </label>
                  </div>
                  <div className="strategy-backtest-environment-summary">
                    <span>
                      <small>{t("trainer.strategyBacktest.execution")}</small>
                      <strong>{t("trainer.strategyBacktest.nextOpen")}</strong>
                    </span>
                    <span>
                      <small>
                        {t("trainer.strategyBacktest.strategySource")}
                      </small>
                      <strong>EMA / RSI composite</strong>
                    </span>
                  </div>
                </section>
                <div className="strategy-backtest-inline-fields">
                  <label className="strategy-backtest-field">
                    <span>{t("trainer.strategyBacktest.execution")}</span>
                    <button className="strategy-backtest-select" type="button">
                      {t("trainer.strategyBacktest.curClose")}
                    </button>
                  </label>
                  <label className="strategy-backtest-field">
                    <span>{t("trainer.strategyBacktest.strategySource")}</span>
                    <button className="strategy-backtest-select" type="button">
                      Multi-line momentum strategy
                    </button>
                  </label>
                </div>
              </div>
              <div className="strategy-backtest-config-actions">
                <Button type="button" variant="default">
                  {t("trainer.strategyBacktest.run")}
                </Button>
              </div>
            </WorkspaceSection>
          </div>
          <WorkspaceSection
            shell
            className="strategy-backtest-panel strategy-backtest-signal-panel"
            title={
              <span data-i18n-critical="true">
                {t("trainer.strategyBacktest.signalRule.title")}
              </span>
            }
            actions={
              <span className="strategy-backtest-panel-status">
                {t("trainer.strategyBacktest.signalRule.availableOutputs", {
                  count: "6",
                })}
              </span>
            }
          >
            <div className="strategy-signal-rule-builder">
              <div className="strategy-signal-rule-card-list">
                <StrategyBacktestPreviewRuleCard
                  directionKey="trainer.strategyBacktest.signalRule.direction.buy"
                  operatorKey="trainer.strategyBacktest.signalRule.operator.crossAbove"
                />
                <StrategyBacktestPreviewRuleCard
                  directionKey="trainer.strategyBacktest.signalRule.direction.sell"
                  operatorKey="trainer.strategyBacktest.signalRule.operator.crossBelow"
                />
              </div>
            </div>
          </WorkspaceSection>
          <WorkspaceSection
            shell
            className="strategy-backtest-panel strategy-backtest-batches-panel"
            title={
              <span data-i18n-critical="true">
                {t("trainer.strategyBacktest.batches")}
              </span>
            }
            subtitle={t("trainer.strategyBacktest.stageRunning")}
          >
            <StrategyBacktestPreviewMetricStrip />
            <div className="strategy-backtest-issue-details">
              <div className="strategy-backtest-issues-summary">
                <Button
                  className="strategy-backtest-issue-details-toggle"
                  type="button"
                  variant="secondary"
                >
                  {t("trainer.strategyBacktest.issueDetails")}
                </Button>
                <span>{t("trainer.strategyBacktest.summarySkipped")}</span>
              </div>
            </div>
            <div className="strategy-backtest-batch-list">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <Button
                  key={index}
                  type="button"
                  variant="secondary"
                  className={
                    index === 0
                      ? "strategy-backtest-batch is-active"
                      : "strategy-backtest-batch"
                  }
                >
                  <span className="strategy-backtest-batch-main">
                    <strong>{`Batch ${index + 1} / 2026-Q3-Momentum`}</strong>
                    <span className="strategy-backtest-batch-meta">
                      <small>{t("trainer.strategyBacktest.results")}</small>
                      <small>{t("trainer.strategyBacktest.trades")}</small>
                    </span>
                  </span>
                  <span className="strategy-backtest-batch-status">
                    {t(
                      index === 0
                        ? "trainer.strategyBacktest.status.RUNNING"
                        : "trainer.strategyBacktest.status.SUCCEEDED",
                    )}
                  </span>
                </Button>
              ))}
            </div>
          </WorkspaceSection>
        </section>
      </WorkspaceFrameShell>
    </WorkspacePageShell>
  );
};

export const StrategyBacktestDetailPreviewPage = () => {
  const { t, formatDateTime, formatNumber } = useI18n();

  return (
    <section className="desktop-secondary-window-panel strategy-backtest-page strategy-backtest-detail-window">
      <div className="strategy-backtest-secondary-layout">
        <aside className="strategy-backtest-panel strategy-backtest-secondary-results">
          <div className="strategy-backtest-secondary-results-summary">
            <div className="strategy-backtest-panel-head">
              <div className="strategy-backtest-panel-title-block">
                <h2 data-i18n-critical="true">
                  {t("trainer.strategyBacktest.detail")}
                </h2>
                <span>
                  {t("trainer.strategyBacktest.stageDone")}{" "}
                  {t("app.joiner.slash")}{" "}
                  {formatNumber(1, { style: "percent" })}
                </span>
              </div>
            </div>
            <StrategyBacktestPreviewMetricStrip />
            <div className="strategy-backtest-batch-error-detail">
              <span>
                <small>{t("trainer.strategyBacktest.summarySkipped")}</small>
                <strong>{t("trainer.strategyBacktest.issueNoBars")}</strong>
              </span>
              <span>
                <small>{t("trainer.strategyBacktest.summaryFailed")}</small>
                <strong>
                  {t("trainer.strategyBacktest.issueRuntimeError")}
                </strong>
              </span>
            </div>
          </div>
          <div className="strategy-backtest-secondary-result-list">
            <div className="strategy-backtest-secondary-result-list-head">
              <span>{t("trainer.strategyBacktest.results")}</span>
              <small>{t("trainer.strategyBacktest.return")}</small>
            </div>
            {["AAPL", "MSFT", "NVDA", "AMZN", "META", "TSLA", "AVGO"].map(
              (symbol, index) => (
                <Button
                  key={symbol}
                  type="button"
                  variant="secondary"
                  className={
                    index === 0
                      ? "strategy-backtest-secondary-result-row is-active"
                      : "strategy-backtest-secondary-result-row"
                  }
                >
                  <span className="strategy-backtest-secondary-result-main">
                    <strong>{symbol}</strong>
                    <small>{formatDateTime("2026-06-11T09:30:00Z")}</small>
                  </span>
                  <span className="strategy-backtest-secondary-result-stats">
                    <em
                      className="ui-num"
                      data-tone={index % 3 === 0 ? "negative" : "positive"}
                    >
                      {formatNumber(index % 3 === 0 ? -0.047 : 0.156, {
                        style: "percent",
                        maximumFractionDigits: 1,
                      })}
                    </em>
                    <small>
                      <span className="ui-num">{formatNumber(12 + index)}</span>
                      <span>{t("trainer.strategyBacktest.trades")}</span>
                    </small>
                  </span>
                </Button>
              ),
            )}
          </div>
        </aside>
        <section className="strategy-backtest-panel strategy-backtest-detail-panel">
          <div className="strategy-backtest-panel-head">
            <div className="strategy-backtest-panel-title-block">
              <h2 data-i18n-critical="true">AAPL</h2>
              <span>{t("trainer.strategyBacktest.simpleProHint")}</span>
            </div>
            <div
              className="strategy-backtest-explain-control"
              data-slot="segmented-control"
            >
              <Button type="button" variant="secondary" size="sm">
                {t("trainer.strategyBacktest.explainSimple")}
              </Button>
              <Button type="button" variant="secondary" size="sm">
                {t("trainer.strategyBacktest.explainProfessional")}
              </Button>
            </div>
          </div>
          <div className="strategy-backtest-pro-tearsheet">
            <div className="strategy-backtest-pro-grid">
              <MetricStrip
                className="strategy-backtest-kpi-strip strategy-backtest-pro-kpi-row"
                items={[
                  {
                    key: "total-return",
                    label: t("trainer.strategyBacktest.totalReturn"),
                    value: formatNumber(0.214, { style: "percent" }),
                    tone: "positive",
                  },
                  {
                    key: "drawdown",
                    label: t("trainer.strategyBacktest.maxDrawdown"),
                    value: formatNumber(-0.082, { style: "percent" }),
                    tone: "negative",
                  },
                  {
                    key: "sharpe",
                    label: t("trainer.strategyBacktest.sharpe"),
                    value: formatNumber(1.46, { maximumFractionDigits: 2 }),
                  },
                  {
                    key: "trades",
                    label: t("trainer.strategyBacktest.totalTrades"),
                    value: formatNumber(38),
                  },
                ]}
              />
              <section className="strategy-backtest-pro-section strategy-backtest-pro-span-8 strategy-backtest-pro-row-lg strategy-backtest-pro-section-main-chart">
                <div className="strategy-backtest-section-head">
                  <h3>{t("trainer.strategyBacktest.equityVsBenchmark")}</h3>
                  <small>{t("trainer.strategyBacktest.strategyEquity")}</small>
                </div>
                <div
                  className="strategy-backtest-pro-chart"
                  aria-hidden="true"
                />
              </section>
              <section className="strategy-backtest-pro-section strategy-backtest-pro-span-4 strategy-backtest-pro-row-md">
                <div className="strategy-backtest-section-head">
                  <h3>{t("trainer.strategyBacktest.returnDistribution")}</h3>
                  <small>{t("trainer.strategyBacktest.winRate")}</small>
                </div>
                <div className="strategy-backtest-pro-chart-stack">
                  <div
                    className="strategy-backtest-pro-chart"
                    aria-hidden="true"
                  />
                  <div className="strategy-backtest-distribution-stats">
                    <span>
                      <small>{t("trainer.strategyBacktest.avgWin")}</small>
                      <strong>
                        {formatNumber(0.026, { style: "percent" })}
                      </strong>
                    </span>
                    <span>
                      <small>{t("trainer.strategyBacktest.avgLoss")}</small>
                      <strong>
                        {formatNumber(-0.014, { style: "percent" })}
                      </strong>
                    </span>
                  </div>
                </div>
              </section>
              <section className="strategy-backtest-pro-section strategy-backtest-pro-span-6 strategy-backtest-pro-row-md">
                <div className="strategy-backtest-section-head">
                  <h3>{t("trainer.strategyBacktest.monthlyReturns")}</h3>
                  <small>{t("trainer.strategyBacktest.heatmapRange5y")}</small>
                </div>
                <div
                  className="strategy-backtest-monthly-heatmap"
                  aria-hidden="true"
                >
                  <div className="strategy-backtest-pro-chart" />
                </div>
              </section>
              <section className="strategy-backtest-pro-section strategy-backtest-pro-span-6 strategy-backtest-pro-row-md">
                <div className="strategy-backtest-section-head">
                  <h3>{t("trainer.strategyBacktest.rollingRisk")}</h3>
                  <small>
                    {t("trainer.strategyBacktest.annualVolatility")}
                  </small>
                </div>
                <div className="strategy-backtest-rolling-risk">
                  <div
                    className="strategy-backtest-pro-chart"
                    aria-hidden="true"
                  />
                </div>
              </section>
              <section className="strategy-backtest-pro-price-inspection">
                <button
                  className="strategy-backtest-pro-price-toggle"
                  type="button"
                >
                  <span>
                    {t("trainer.strategyBacktest.priceVolumeInspection")}
                  </span>
                  <small>{t("trainer.strategyBacktest.tradeChart")}</small>
                </button>
                <div className="strategy-backtest-pro-price-chart">
                  <StrategyBacktestPreviewChart />
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
};
