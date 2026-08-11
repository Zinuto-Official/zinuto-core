// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type ApiBacktestBatch,
  type ApiBacktestFill,
  type ApiBacktestResultListItem,
  type ApiBacktestResultDetail,
} from "@/api";
import { useArchivedSystemMarkerRenderer } from "@/domains/chart/useArchivedSystemMarkerRenderer";
import { useHistoryReplayChartBindings } from "@/domains/chart/useHistoryReplayChartBindings";
import type { HistoryReplayChartViewProps } from "@/domains/chart/HistoryReplayChart";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { BacktestExplainMode } from "@/domains/backtest/backtestAnalytics";
import { useI18n } from "@/frontend-kernel/i18n";
import { Button } from "@/ui/primitives/button";
import { MetricStrip } from "@/ui/components";
import { SecondaryWindowRoutePlaceholder, type SecondaryWindowRouteProps } from "@/app-shell/secondaryWindows/routes/secondaryWindowRouteTypes";
import { StrategyBacktestDetailPanel } from "@/workspaces/strategy-backtest/StrategyBacktestDetailPanel";
import { BacktestRunNoticeModal } from "@/workspaces/strategy-backtest/BacktestRunNoticeModal";
import { BacktestRunNoticePanel } from "@/workspaces/strategy-backtest/BacktestRunNoticePanel";
import {
  formatBacktestStage,
  formatIssueReason,
  formatSignedPercent,
  getBatchErrorDisplay,
  isRunningStatus,
  readProgressNumber,
  readProgressPollDelayMs,
  readSummaryNumber,
  readSymbolIssues,
  readText,
} from "@/workspaces/strategy-backtest/strategyBacktestDisplay";
import type {
  StrategyBacktestResultDetailWindowPayload,
} from "@/workspaces/strategy-backtest/strategyBacktestResultDetailWindow";
import {
  resolveStrategyBacktestSignedFinancialTone,
} from "@/workspaces/strategy-backtest/strategyBacktestFinancialTone";
import { mergeMonotonicBacktestProgress } from "@/app-shell/secondaryWindows/routes/secondaryBacktestProgressMerge";

const isStrategyBacktestResultDetailPayload = (
  value: unknown,
): value is StrategyBacktestResultDetailWindowPayload =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Boolean((value as StrategyBacktestResultDetailWindowPayload).batchId);

const SecondaryStrategyBacktestDetailRoute = ({
  state,
  language,
  themeMode,
  showGlobalDecimals,
  priceColorMode,
  tradeColorTheme,
}: SecondaryWindowRouteProps) => {
  const { t, formatNumber, formatDateTime } = useI18n();
  const bindings = useHistoryReplayChartBindings();
  const createSystemMarkers = useArchivedSystemMarkerRenderer(language);
  const [batch, setBatch] = useState<ApiBacktestBatch | null>(null);
  const [results, setResults] = useState<ApiBacktestResultListItem[]>([]);
  const [detail, setDetail] = useState<ApiBacktestResultDetail | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [displayPeriod, setDisplayPeriod] =
    useState<HistoryReplayChartViewProps["displayPeriod"]>(undefined);
  const [chartRenderMode, setChartRenderMode] =
    useState<HistoryReplayChartViewProps["chartRenderMode"]>(undefined);
  const [explainMode, setExplainMode] = useState<BacktestExplainMode>("simple");
  const [selectedFillId, setSelectedFillId] = useState<string | null>(null);
  const [focusRawBarIndex, setFocusRawBarIndex] = useState<number | null>(null);
  const [focusRequestNonce, setFocusRequestNonce] = useState(0);
  const [isResultsLoading, setIsResultsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [isIssueDetailsOpen, setIsIssueDetailsOpen] = useState(false);

  const payload = isStrategyBacktestResultDetailPayload(state.payload)
    ? state.payload
    : null;

  const loadResults = useCallback(async (batchId: string, signal?: AbortSignal) => {
    setIsResultsLoading(true);
    setLoadError("");
    try {
      const nextPayload = await api.getBacktestResults(batchId, { signal });
      if (signal?.aborted) {
        return;
      }
      setBatch(nextPayload.batch);
      setResults(nextPayload.results);
      setSelectedSymbol((current) =>
        nextPayload.results.some((result) => result.symbol === current)
          ? current
          : nextPayload.results[0]?.symbol ?? "",
      );
      if (!nextPayload.results.length) {
        setDetail(null);
      }
    } catch (error) {
      if (!signal?.aborted) {
        console.error("[strategy-backtest-detail] results load failed", error);
        setLoadError(t("trainer.strategyBacktest.errorGeneric"));
      }
    } finally {
      if (!signal?.aborted) {
        setIsResultsLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    if (!payload) {
      return;
    }
    const controller = new AbortController();
    setDisplayPeriod(payload.displayPeriod);
    setChartRenderMode(payload.chartRenderMode);
    setBatch(payload.batch ?? null);
    setResults([]);
    setDetail(payload.detail ?? null);
    setSelectedSymbol(payload.detail?.result.symbol ?? "");
    setSelectedFillId(null);
    setFocusRawBarIndex(null);
    setFocusRequestNonce((current) => current + 1);
    setLoadError("");
    setIsIssueDetailsOpen(false);
    void api.getBacktestBatch(payload.batchId, { signal: controller.signal }).then((nextBatch) => {
      if (!controller.signal.aborted) {
        setBatch(nextBatch);
      }
    }).catch((error) => {
      if (!controller.signal.aborted) {
        console.error("[strategy-backtest-detail] batch load failed", error);
        setLoadError(t("trainer.strategyBacktest.errorGeneric"));
      }
    });
    return () => controller.abort();
  }, [payload, state.revision, t]);

  useEffect(() => {
    if (!payload || !batch?.id) {
      return;
    }
    if (batch.status === "SUCCEEDED") {
      const controller = new AbortController();
      void loadResults(batch.id, controller.signal);
      return () => controller.abort();
    }
    setResults([]);
    setSelectedSymbol("");
    setDetail(null);
    return undefined;
  }, [batch?.id, batch?.status, loadResults, payload]);

  useEffect(() => {
    if (!payload || !batch || !isRunningStatus(batch.status)) {
      return;
    }
    const expectedBatchId = batch.id;
    const expectedRevision = state.revision;
    const controller = new AbortController();
    let active = true;
    let timer: number | null = null;
    const schedule = (delayMs: number): void => {
      timer = window.setTimeout(() => {
        void poll();
      }, delayMs);
    };
    const poll = async (): Promise<void> => {
      try {
        const nextPayload = await api.getBacktestProgress(expectedBatchId, {
          signal: controller.signal,
        });
        if (
          !active ||
          controller.signal.aborted ||
          state.revision !== expectedRevision ||
          payload.batchId !== expectedBatchId ||
          nextPayload.batch.id !== expectedBatchId
        ) {
          return;
        }
        setBatch((current) =>
          mergeMonotonicBacktestProgress(
            current,
            nextPayload.batch,
            expectedBatchId,
          ),
        );
        if (isRunningStatus(nextPayload.batch.status)) {
          schedule(readProgressPollDelayMs(nextPayload.batch.progress));
        }
      } catch {
        if (active && !controller.signal.aborted) {
          schedule(readProgressPollDelayMs(batch.progress));
        }
      }
    };
    schedule(readProgressPollDelayMs(batch.progress));
    return () => {
      active = false;
      controller.abort();
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [batch?.id, batch?.status, payload?.batchId, state.revision]);

  useEffect(() => {
    if (!payload || !batch?.id || !selectedSymbol) {
      setDetail(null);
      return;
    }
    if (detail?.batch.id === batch.id && detail.result.symbol === selectedSymbol) {
      return;
    }
    const controller = new AbortController();
    setIsDetailLoading(true);
    setLoadError("");
    void api.getBacktestResultDetail(batch.id, selectedSymbol, {
      signal: controller.signal,
    }).then((nextDetail) => {
      if (controller.signal.aborted) {
        return;
      }
      setDetail(nextDetail);
      setSelectedFillId(null);
      setFocusRawBarIndex(null);
      setFocusRequestNonce((current) => current + 1);
    }).catch((error) => {
      if (!controller.signal.aborted) {
        setDetail(null);
        console.error("[strategy-backtest-detail] result detail load failed", error);
        setLoadError(t("trainer.strategyBacktest.errorGeneric"));
      }
    }).finally(() => {
      if (!controller.signal.aborted) {
        setIsDetailLoading(false);
      }
    });
    return () => controller.abort();
  }, [batch?.id, detail, payload, selectedSymbol, t]);

  const handleSelectFill = (fill: ApiBacktestFill) => {
    setSelectedFillId(fill.id);
    setFocusRawBarIndex(fill.fillIndex);
    setFocusRequestNonce((current) => current + 1);
  };

  const handleSelectResult = (result: ApiBacktestResultListItem) => {
    setSelectedSymbol(result.symbol);
    setSelectedFillId(null);
    setFocusRawBarIndex(null);
    setFocusRequestNonce((current) => current + 1);
  };

  const completedSymbols = batch
    ? readProgressNumber(batch.progress, "completedSymbols")
    : 0;
  const totalSymbols = batch
    ? readProgressNumber(batch.progress, "totalSymbols")
    : 0;
  const progressLabel = totalSymbols > 0
    ? `${formatNumber(completedSymbols, { maximumFractionDigits: 0 })}/${formatNumber(totalSymbols, { maximumFractionDigits: 0 })}`
    : batch?.status ?? "-";
  const stage = readText(batch?.progress.stage || batch?.status);
  const stageLabel = formatBacktestStage(stage, t);
  const currentSymbol = readText(batch?.progress.currentSymbol);
  const skippedIssues = readSymbolIssues(batch?.summary, "skippedSymbols");
  const failedIssues = readSymbolIssues(batch?.summary, "failedSymbols");
  const successfulSymbols = readSummaryNumber(batch?.summary, "successfulSymbols");
  const skippedSymbolCount = readSummaryNumber(batch?.summary, "skippedSymbolCount") ||
    skippedIssues.length;
  const failedSymbolCount = readSummaryNumber(batch?.summary, "failedSymbolCount") ||
    failedIssues.length;
  const batchError = getBatchErrorDisplay(batch);
  const emptyDetailLabel = isDetailLoading
    ? t("common.status.loading")
    : t("trainer.strategyBacktest.selectResult");

  if (!payload) {
    return <SecondaryWindowRoutePlaceholder state={state} />;
  }

  return (
    <section className="desktop-secondary-window-panel strategy-backtest-page strategy-backtest-detail-window">
      <div className="strategy-backtest-secondary-layout">
        <aside className="strategy-backtest-panel strategy-backtest-secondary-results">
          <div className="strategy-backtest-secondary-results-summary">
            <div className="strategy-backtest-panel-head">
              <div className="strategy-backtest-panel-title-block">
                <h2>{batch?.name ?? payload.title}</h2>
                <span>
                  {stageLabel} {t("app.joiner.slash")} {progressLabel}
                </span>
              </div>
            </div>
            {batch ? (
              <MetricStrip
                className="strategy-backtest-run-summary"
                itemClassName="strategy-backtest-run-summary-item"
                items={[
                  {
                    key: "success",
                    label: t("trainer.strategyBacktest.summarySuccess"),
                    value: (
                      <span className="ui-num">
                        {formatNumber(successfulSymbols, { maximumFractionDigits: 0 })}
                      </span>
                    ),
                    tone: "neutral",
                  },
                  {
                    key: "skipped",
                    label: t("trainer.strategyBacktest.summarySkipped"),
                    value: (
                      <span className="ui-num">
                        {formatNumber(skippedSymbolCount, { maximumFractionDigits: 0 })}
                      </span>
                    ),
                    tone: skippedSymbolCount > 0 ? "warning" : "neutral",
                  },
                  {
                    key: "failed",
                    label: t("trainer.strategyBacktest.summaryFailed"),
                    value: (
                      <span className="ui-num">
                        {formatNumber(failedSymbolCount, { maximumFractionDigits: 0 })}
                      </span>
                    ),
                    tone: failedSymbolCount > 0 ? "danger" : "neutral",
                  },
                  ...(currentSymbol
                    ? [
                        {
                          key: "current-symbol",
                          label: t("trainer.strategyBacktest.currentSymbol"),
                          value: currentSymbol,
                        },
                      ]
                    : []),
                ]}
              />
            ) : null}
            <BacktestRunNoticePanel
              skippedCount={skippedSymbolCount}
              failedCount={failedSymbolCount}
              summaryLabel={`${t("trainer.strategyBacktest.summarySkipped")} ${formatNumber(skippedSymbolCount, { maximumFractionDigits: 0 })} · ${t("trainer.strategyBacktest.summaryFailed")} ${formatNumber(failedSymbolCount, { maximumFractionDigits: 0 })}`}
              detailsLabel={t("trainer.strategyBacktest.issueDetails")}
              onOpenDetails={() => setIsIssueDetailsOpen(true)}
            />
            <BacktestRunNoticeModal
              open={isIssueDetailsOpen}
              skippedIssues={skippedIssues}
              failedIssues={failedIssues}
              title={t("trainer.strategyBacktest.issueModalTitle")}
              skippedTitle={t("trainer.strategyBacktest.issueSkippedGroup")}
              failedTitle={t("trainer.strategyBacktest.issueFailedGroup")}
              closeLabel={t("appText.close")}
              formatIssueReason={(reason) => formatIssueReason(reason, t)}
              onClose={() => setIsIssueDetailsOpen(false)}
            />
            {batchError || loadError ? (
              <div className="strategy-backtest-batch-error-detail">
                {batchError ? (
                  <>
                    <span>
                      <small>{t("trainer.strategyBacktest.batchErrorCode")}</small>
                      <strong>{batchError.code}</strong>
                    </span>
                    <span>
                      <small>{t("trainer.strategyBacktest.batchErrorMessage")}</small>
                      <strong>{batchError.message}</strong>
                    </span>
                  </>
                ) : (
                  <span>
                    <small>{t("trainer.strategyBacktest.batchErrorMessage")}</small>
                    <strong>{loadError}</strong>
                  </span>
                )}
              </div>
            ) : null}
          </div>
          <div className="strategy-backtest-secondary-result-list">
            <div className="strategy-backtest-secondary-result-list-head">
              <span>{t("trainer.strategyBacktest.results")}</span>
              {isResultsLoading ? <small>{t("common.status.loading")}</small> : null}
            </div>
            {results.map((result) => (
              <Button
                key={result.id}
                type="button"
                variant="secondary"
                className={`strategy-backtest-secondary-result-row ${result.symbol === selectedSymbol ? "is-active" : ""}`}
                onClick={() => handleSelectResult(result)}
              >
                <span className="strategy-backtest-secondary-result-main">
                  <strong>{result.symbol}</strong>
                  <small>{formatDateTime(result.updatedAt)}</small>
                </span>
                <span className="strategy-backtest-secondary-result-stats">
                  <em
                    className="ui-num"
                    data-tone={resolveStrategyBacktestSignedFinancialTone(result.profitRate)}
                  >
                    {formatSignedPercent(result.profitRate, formatNumber)}
                  </em>
                  <small>
                    <span className="ui-num">
                      {formatSignedPercent(-result.maxDrawdown, formatNumber)}
                    </span>
                    <span>{t("app.joiner.slash")}</span>
                    <span className="ui-num">
                      {formatNumber(result.tradeCount, { maximumFractionDigits: 0 })}
                    </span>
                    <span>{t("trainer.strategyBacktest.trades")}</span>
                  </small>
                </span>
              </Button>
            ))}
            {!results.length ? (
              <div className="strategy-backtest-empty">
                {isResultsLoading ? t("common.status.loading") : t("trainer.strategyBacktest.noResults")}
              </div>
            ) : null}
          </div>
        </aside>
        <StrategyBacktestDetailPanel
          chartRenderMode={chartRenderMode ?? payload.chartRenderMode ?? "CANDLE"}
          createSystemMarkers={createSystemMarkers}
          customScriptIndicator={payload.strategyIndicator}
          detail={detail}
          emptyLabel={emptyDetailLabel}
          explainMode={explainMode}
          focusRawBarIndex={focusRawBarIndex}
          focusRequestNonce={focusRequestNonce}
          historyReplayChartBindings={bindings}
          language={language}
          onChartRenderModeChange={setChartRenderMode}
          onDisplayPeriodChange={(period: DisplayPeriodKey) => setDisplayPeriod(period)}
          onExplainModeChange={setExplainMode}
          onOpenChartSettings={() => undefined}
          onSelectFill={handleSelectFill}
          showGlobalDecimals={showGlobalDecimals}
          priceColorMode={priceColorMode}
          selectedFillId={selectedFillId}
          showChartSettingsModal={false}
          themeMode={themeMode}
          tradeColorTheme={tradeColorTheme}
          trainerDisplayPeriod={displayPeriod ?? payload.displayPeriod ?? "1d"}
          trainerPeriodOptionsByBase={payload.trainerPeriodOptionsByBase}
        />
      </div>
    </section>
  );
};

export default SecondaryStrategyBacktestDetailRoute;
