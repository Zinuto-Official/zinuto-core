// SPDX-License-Identifier: GPL-3.0-only

import type { DataSourceSyncMode } from "@/domains/data-import/dataSourceTypes";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/ui/primitives/button";
import { Checkbox } from "@/ui/primitives/checkbox";
import { InlineLoadingState } from "@/ui/primitives/loading";
import { Input } from "@/ui/primitives/input";
import { SegmentedControl } from "@/ui/primitives/segmented-control";
import { AppIcon } from "@/assets/graphics";
import {
  HistoryReplayChartView,
  type HistoryReplayChartViewProps,
} from "@/domains/chart/HistoryReplayChart";
import { useHistoryReplayChartBindings } from "@/domains/chart/useHistoryReplayChartBindings";
import { INPUT_LIMITS } from "@zinuto/shared/input-limits";
import { FeatureLockLabel, StandardSheetFrame } from "@/ui/components";
import type { ApiTradingCalendarConfig } from "@/api";
import {
  addTradingCalendarSession,
  buildTradingSessionRangeFromInput,
  formatTradingCalendarSummary,
  formatTradingMinute,
  formatTradingSessionEndMinute,
  formatTradingSessionRange,
  isDailyTradingCalendarTimeframe,
  removeTradingCalendarSession,
  TRADING_CALENDAR_WEEKDAYS,
  updateTradingCalendarDay,
  updateTradingCalendarSession,
  type TradingCalendarWeekday,
} from "@/domains/data-import/tradingCalendarUi";
import type { SourceDiagnosticFilterKind } from "@/workspaces/data/dataConfig/model";
import {
  createIndeterminateProgress,
  DataConfigDetailContentBoundary,
  DataTaskProgressRail,
} from "@/workspaces/data/DataConfigDetailWindowShared";
import { isTableRowSelectionActivationKey } from "@/ui/a11y/tableRowSelection";

import type {
  DataConfigDetailWindowPanelProps,
  DataConfigDetailWindowPayload,
  DataConfigDetailWindowTabId,
} from "@/workspaces/data/DataConfigDetailWindowTypes";

export type {
  DataConfigDetailWindowAction,
  DataConfigDetailWindowPayload,
  DataConfigDetailWindowTabId,
} from "@/workspaces/data/DataConfigDetailWindowTypes";
const createNoopSystemMarkers: HistoryReplayChartViewProps["createSystemMarkers"] =
  () => undefined;

const buildDetailWeekdayLabels = (
  labels: DataConfigDetailWindowPayload["labels"],
): Record<TradingCalendarWeekday, string> => ({
  1: labels.weekdayMon,
  2: labels.weekdayTue,
  3: labels.weekdayWed,
  4: labels.weekdayThu,
  5: labels.weekdayFri,
  6: labels.weekdaySat,
  7: labels.weekdaySun,
});

export const DataConfigDetailWindowPanel = ({
  payload,
  language,
  themeMode,
  showGlobalDecimals,
  priceColorMode,
  tradeColorTheme,
  onAction,
  historyReplayChartBindings,
}: DataConfigDetailWindowPanelProps) => {
  const localBindings = useHistoryReplayChartBindings();
  const chartBindings = historyReplayChartBindings ?? localBindings;
  const [tradingCalendarDraft, setTradingCalendarDraft] =
    useState<ApiTradingCalendarConfig>(payload.pool.tradingCalendar);
  const [tradingCalendarSessionErrorText, setTradingCalendarSessionErrorText] =
    useState("");
  const weekdayLabels = useMemo(
    () => buildDetailWeekdayLabels(payload.labels),
    [payload.labels],
  );
  const tradingCalendarSummary = formatTradingCalendarSummary(
    payload.pool.tradingCalendar,
    weekdayLabels,
    language,
    payload.pool.baseTimeframe,
  );
  const tradingCalendarDraftChanged =
    JSON.stringify(tradingCalendarDraft) !==
    JSON.stringify(payload.pool.tradingCalendar);
  const isDailyTradingCalendar = isDailyTradingCalendarTimeframe(
    payload.pool.baseTimeframe,
  );
  const checkedSymbolSet = new Set(payload.symbols.checkedSymbols);
  const activeSymbolRow =
    payload.symbols.rows.find(
      (row) => row.symbol === payload.symbols.activeSymbol,
    ) ?? null;
  const hasFocusedDiagnosticItem = Boolean(
    payload.sourceDiagnostics.focusedDetailItemId,
  );
  const hasActiveMarketBars = payload.sourceDiagnostics.activeBarCount > 0;
  const diagnosticFilterColumnCount = Math.max(
    1,
    payload.sourceDiagnostics.filterOptions.length,
  );

  useEffect(() => {
    setTradingCalendarSessionErrorText("");
    setTradingCalendarDraft(payload.pool.tradingCalendar);
  }, [payload.pool.id, payload.pool.tradingCalendar]);

  const commitTradingSessionField = (
    index: number,
    field: "start" | "end",
    value: string,
  ) => {
    const session = tradingCalendarDraft.sessions[index];
    if (!session) {
      return;
    }
    const nextSession = buildTradingSessionRangeFromInput(
      field === "start" ? value : formatTradingMinute(session.startMinute),
      field === "end"
        ? value
        : formatTradingSessionEndMinute(session, payload.pool.baseTimeframe),
      payload.pool.baseTimeframe,
    );
    if (!nextSession) {
      setTradingCalendarSessionErrorText(
        payload.labels.tradingCalendarTimeframeAlignmentInvalid,
      );
      return;
    }
    setTradingCalendarSessionErrorText("");
    setTradingCalendarDraft((current) =>
      updateTradingCalendarSession(current, index, nextSession),
    );
  };

  return (
    <StandardSheetFrame
      className="data-config-detail-window"
      headerClassName="data-config-detail-window-header"
      bodyClassName="data-config-detail-window-body"
      title={
        <div className="data-config-detail-window-title-group">
          <div className="data-config-detail-window-title-row">
            <h2 className="text-r3 leading-tight font-semibold text-[color:var(--text-strong)]">
              {payload.title}
            </h2>
            <span
              className={`data-config-detail-window-status is-${payload.statusTone}`}
            >
              {payload.statusLabel}
            </span>
          </div>
          <div className="data-config-detail-window-title-meta">
            <span>{payload.pool.baseTimeframeLabel}</span>
            <span>{payload.pool.timeZone}</span>
            <span>{payload.pool.timeRangeLabel}</span>
          </div>
        </div>
      }
      actions={
        <>
          {payload.primaryActionLabel ? (
            <Button
              type="button"
              size="sm"
              disabled={payload.primaryActionDisabled}
              onClick={() => onAction({ action: "PRIMARY_ACTION" })}
            >
              {payload.primaryActionLabel}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onAction({ action: "CLOSE" })}
          >
            {payload.closeLabel}
          </Button>
        </>
      }
    >
      <div className="data-config-detail-window-layout">
        <aside className="data-config-detail-window-rail">
          <SegmentedControl
            size="sm"
            selectionStyle="pill"
            gridTemplateColumns="1fr"
            className="data-config-detail-window-tabs"
            options={payload.tabs.map((tab) => ({
              value: tab.id,
              label: tab.label,
            }))}
            value={payload.activeTab}
            onChange={(value) =>
              onAction({
                action: "SET_TAB",
                payload: { tabId: value as DataConfigDetailWindowTabId },
              })
            }
          />
          <dl className="data-config-detail-window-facts">
            <div>
              <dt>{payload.labels.symbolCount}</dt>
              <dd>{payload.pool.symbolCountLabel}</dd>
            </div>
            <div>
              <dt>{payload.labels.lineCount}</dt>
              <dd>{payload.pool.barCountLabel}</dd>
            </div>
            <div>
              <dt>{payload.labels.timeRange}</dt>
              <dd>{payload.pool.timeRangeLabel}</dd>
            </div>
            <div>
              <dt>{payload.labels.importScope}</dt>
              <dd>{payload.pool.importScopeLabel}</dd>
            </div>
            <div>
              <dt>{payload.labels.lastSync}</dt>
              <dd>{payload.pool.lastSyncLabel}</dd>
            </div>
          </dl>
        </aside>

        <div className="data-config-detail-window-content">
          <DataConfigDetailContentBoundary
            resetKey={payload.resetKey}
            fallbackMessage={payload.errorFallbackMessage}
          >
            {payload.activeTab === "OVERVIEW" ? (
              <div className="data-config-detail-overview">
                <section className="data-config-detail-overview-status-card">
                  <div className="data-config-detail-overview-status-copy">
                    <span className="data-config-detail-overview-label">
                      {payload.labels.syncStatus}
                    </span>
                    <strong>
                      {payload.pool.syncStatusHint || payload.statusLabel}
                    </strong>
                    <span className="data-config-detail-overview-status-meta">
                      <span>{payload.labels.lastCheck}</span>
                      <strong>{payload.pool.lastCheckedLabel || "--"}</strong>
                    </span>
                    {payload.operationProgress ? (
                      <DataTaskProgressRail
                        progress={payload.operationProgress}
                      />
                    ) : null}
                  </div>
                  <div className="data-config-detail-inline-actions">
                    {payload.canEditSyncPreference ? (
                      <SegmentedControl<DataSourceSyncMode>
                        className="data-config-sync-mode-control"
                        value={payload.syncPreferenceMode ?? "PROMPT"}
                        onChange={(mode) =>
                          onAction({
                            action: "SET_SYNC_PREFERENCE",
                            payload: { mode },
                          })
                        }
                        activeIndicator={
                          <AppIcon name="actionCheck" className="size-3" />
                        }
                        gridTemplateColumns="repeat(3, minmax(0, 1fr))"
                        selectionStyle="pill"
                        options={[
                          {
                            value: "MANUAL",
                            label: payload.labels.checkAllChanges,
                          },
                          {
                            value: "AUTO",
                            label: payload.labels.autoSync,
                          },
                          {
                            value: "PROMPT",
                            label: payload.labels.promptAfterCheck,
                          },
                        ]}
                      />
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          onAction({ action: "CHECK_ALL_CHANGES" })
                        }
                      >
                        {payload.labels.checkAllChanges}
                      </Button>
                    )}
                  </div>
                </section>
                {payload.operationErrorText ? (
                  <span className="csv-preview-invalid-file-hint" role="alert">
                    {payload.operationErrorText}
                  </span>
                ) : null}
                <div className="data-config-detail-overview-grid">
                  <div className="data-config-detail-overview-card">
                    <span className="data-config-detail-overview-label">
                      {payload.labels.sourceFolder}
                    </span>
                    <strong>{payload.pool.sourceFolder || "--"}</strong>
                  </div>
                  <div className="data-config-detail-overview-card">
                    <span className="data-config-detail-overview-label">
                      {payload.labels.timeZone}
                    </span>
                    <strong>{payload.pool.timeZone || "--"}</strong>
                  </div>
                  <div className="data-config-detail-overview-card">
                    <span className="data-config-detail-overview-label">
                      {payload.labels.tradingCalendar}
                    </span>
                    <strong>{tradingCalendarSummary || "--"}</strong>
                  </div>
                  <div className="data-config-detail-overview-card">
                    <span className="data-config-detail-overview-label">
                      {payload.labels.importScope}
                    </span>
                    <strong>{payload.pool.importScopeLabel}</strong>
                  </div>
                  <div className="data-config-detail-overview-card">
                    <span className="data-config-detail-overview-label">
                      {payload.labels.lastSync}
                    </span>
                    <strong>{payload.pool.lastSyncLabel}</strong>
                  </div>
                </div>
                {!payload.pool.isSystem ? (
                  <section className="data-config-detail-overview-card csv-preview-trading-calendar-editor">
                    <div className="data-config-detail-section-toolbar">
                      <span className="data-config-detail-overview-label">
                        {payload.labels.tradingCalendar}
                      </span>
                      <div className="data-config-detail-inline-actions">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={
                            !tradingCalendarDraftChanged ||
                            payload.isOperationBlocked
                          }
                          onClick={() => {
                            setTradingCalendarSessionErrorText("");
                            setTradingCalendarDraft(
                              payload.pool.tradingCalendar,
                            );
                          }}
                        >
                          {payload.labels.reset}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={
                            !tradingCalendarDraftChanged ||
                            payload.isOperationBlocked
                          }
                          onClick={() =>
                            onAction({
                              action: "SAVE_TRADING_CALENDAR",
                              payload: {
                                tradingCalendar: tradingCalendarDraft,
                              },
                            })
                          }
                        >
                          {payload.labels.save}
                        </Button>
                      </div>
                    </div>
                    <div
                      className="csv-preview-trading-calendar-days"
                      role="group"
                      aria-label={payload.labels.defaultTradingDays}
                    >
                      {TRADING_CALENDAR_WEEKDAYS.map((weekday) => {
                        const active =
                          tradingCalendarDraft.tradingDays.includes(weekday);
                        return (
                          <Button
                            key={weekday}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="csv-preview-plan-chip csv-preview-trading-calendar-day"
                            aria-pressed={active}
                            disabled={payload.isOperationBlocked}
                            onClick={() =>
                              setTradingCalendarDraft((current) =>
                                updateTradingCalendarDay(
                                  current,
                                  weekday,
                                  !active,
                                ),
                              )
                            }
                          >
                            {weekdayLabels[weekday]}
                          </Button>
                        );
                      })}
                    </div>
                    {!isDailyTradingCalendar ? (
                      <div className="csv-preview-trading-calendar-sessions">
                        {tradingCalendarDraft.sessions.map((session, index) => (
                          <div
                            key={`${index}-${formatTradingSessionRange(session, payload.pool.baseTimeframe)}`}
                            className="csv-preview-trading-calendar-session-row"
                          >
                            <span className="csv-preview-section-label">
                              {payload.labels.dailyTradingSessions}
                            </span>
                            <Input
                              key={`detail-start-${index}-${session.startMinute}`}
                              aria-label={payload.labels.tradingSessionStart}
                              defaultValue={formatTradingMinute(
                                session.startMinute,
                              )}
                              disabled={payload.isOperationBlocked}
                              inputMode="numeric"
                              onBlur={(event) =>
                                commitTradingSessionField(
                                  index,
                                  "start",
                                  event.currentTarget.value,
                                )
                              }
                            />
                            <Input
                              key={`detail-end-${index}-${session.endMinute}-${session.crossesMidnight ? "x" : "n"}`}
                              aria-label={payload.labels.tradingSessionEnd}
                              defaultValue={formatTradingSessionEndMinute(
                                session,
                                payload.pool.baseTimeframe,
                              )}
                              disabled={payload.isOperationBlocked}
                              inputMode="numeric"
                              onBlur={(event) =>
                                commitTradingSessionField(
                                  index,
                                  "end",
                                  event.currentTarget.value,
                                )
                              }
                            />
                            {session.crossesMidnight ? (
                              <span className="csv-preview-plan-chip">
                                {payload.labels.crossesMidnight}
                              </span>
                            ) : null}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={
                                payload.isOperationBlocked ||
                                tradingCalendarDraft.sessions.length <= 1
                              }
                              onClick={() =>
                                setTradingCalendarDraft((current) =>
                                  removeTradingCalendarSession(current, index),
                                )
                              }
                            >
                              {payload.labels.delete}
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {!isDailyTradingCalendar &&
                    Boolean(tradingCalendarSessionErrorText) ? (
                      <span className="csv-preview-invalid-file-hint">
                        {tradingCalendarSessionErrorText}
                      </span>
                    ) : null}
                    {!isDailyTradingCalendar ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={payload.isOperationBlocked}
                        onClick={() =>
                          setTradingCalendarDraft((current) =>
                            addTradingCalendarSession(current),
                          )
                        }
                      >
                        {payload.labels.addTradingSession}
                      </Button>
                    ) : null}
                    <span className="data-config-detail-overview-label">
                      {payload.labels.tradingCalendarSavedHint}
                    </span>
                  </section>
                ) : null}
              </div>
            ) : null}

            {payload.activeTab === "SYMBOLS" ? (
              <div className="data-config-detail-symbols-pane">
                <div className="data-config-detail-section-toolbar">
                  <Input
                    className="data-asset-detail-search"
                    value={payload.symbols.keyword}
                    maxLength={INPUT_LIMITS.searchQueryChars}
                    onChange={(event) =>
                      onAction({
                        action: "SET_SYMBOL_KEYWORD",
                        payload: { value: event.target.value },
                      })
                    }
                    placeholder={payload.labels.searchSymbolCode}
                  />
                </div>
                <div className="data-asset-table-wrap">
                  <table className="data-asset-table">
                    <thead>
                      <tr>
                        <th className="data-asset-table-col-checkbox">
                          <Checkbox
                            className="data-asset-table-checkbox"
                            checked={payload.symbols.isAllChecked}
                            disabled={payload.symbols.isSystemPool}
                            onChange={(event) =>
                              onAction({
                                action: "SET_ALL_SYMBOLS_CHECKED",
                                payload: { checked: event.target.checked },
                              })
                            }
                          />
                        </th>
                        <th className="data-asset-table-col-symbol">
                          {payload.labels.symbolCode}
                        </th>
                        <th className="data-asset-table-col-bars">
                          {payload.labels.lineCount}
                        </th>
                        <th className="data-asset-table-col-health">
                          {payload.labels.health}
                        </th>
                        <th className="data-asset-table-col-range">
                          {payload.labels.timeRange}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.symbols.rows.length ? (
                        payload.symbols.rows.map((row) => (
                          <tr
                            key={row.symbol}
                            className={`${row.symbol === payload.symbols.activeSymbol ? "is-active" : ""} ${row.locked ? "is-locked" : ""}`.trim()}
                            tabIndex={0}
                            aria-selected={
                              row.symbol === payload.symbols.activeSymbol
                            }
                            onClick={() =>
                              onAction({
                                action: "SET_ACTIVE_SYMBOL",
                                payload: { symbol: row.symbol },
                              })
                            }
                            onKeyDown={(event) => {
                              if (
                                !isTableRowSelectionActivationKey(event.key)
                              ) {
                                return;
                              }
                              event.preventDefault();
                              onAction({
                                action: "SET_ACTIVE_SYMBOL",
                                payload: { symbol: row.symbol },
                              });
                            }}
                          >
                            <td onClick={(event) => event.stopPropagation()}>
                              <Checkbox
                                className="data-asset-table-checkbox"
                                checked={checkedSymbolSet.has(row.symbol)}
                                disabled={
                                  payload.symbols.isSystemPool || row.locked
                                }
                                onChange={(event) =>
                                  onAction({
                                    action: "SET_SYMBOL_CHECKED",
                                    payload: {
                                      symbol: row.symbol,
                                      checked: event.target.checked,
                                    },
                                  })
                                }
                              />
                            </td>
                            <td className="data-asset-table-cell-symbol">
                              <FeatureLockLabel locked={row.locked}>
                                {row.symbol}
                              </FeatureLockLabel>
                            </td>
                            <td className="data-asset-table-cell-bars">
                              {row.barCountLabel}
                            </td>
                            <td className="data-asset-table-cell-health">
                              <span
                                className={`data-asset-symbol-health is-${row.healthTone}`}
                              >
                                {row.healthLabel}
                              </span>
                            </td>
                            <td className="data-asset-table-cell-range">
                              {row.timeSpanText}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr className="is-empty">
                          <td colSpan={5}>{payload.labels.symbolsAvailable}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="data-asset-symbol-actions-bar">
                  <span className="data-asset-batch-text">
                    {payload.labels.selectedCount}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      !payload.symbols.activeSymbol ||
                      Boolean(activeSymbolRow?.locked) ||
                      payload.isOperationBlocked
                    }
                    onClick={() =>
                      onAction({ action: "START_TRAINING_SYMBOL" })
                    }
                  >
                    {payload.labels.startTrainingSymbol}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={
                      !payload.symbols.activeSymbol ||
                      payload.isOperationBlocked ||
                      payload.symbols.isSystemPool
                    }
                    onClick={() => onAction({ action: "REMOVE_ACTIVE_SYMBOL" })}
                  >
                    {payload.labels.removeSymbol}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={
                      !payload.symbols.checkedSymbols.length ||
                      payload.isOperationBlocked ||
                      payload.symbols.isSystemPool
                    }
                    onClick={() =>
                      onAction({ action: "REMOVE_CHECKED_SYMBOLS" })
                    }
                  >
                    {payload.labels.batchRemove}
                  </Button>
                </div>
              </div>
            ) : null}

            {payload.activeTab === "DIAGNOSTICS" ? (
              <div className="data-config-detail-diagnostics data-config-detail-diagnostics-source">
                <div className="data-config-detail-diagnostics-main">
                  <div className="data-config-detail-diagnostic-grid data-config-source-diagnostic-grid">
                    <div className="data-config-source-diagnostic-left">
                      <div className="data-asset-alerts-panel data-config-source-diagnostic-summary">
                        <div className="data-asset-alerts-head">
                          <span className="data-asset-alerts-title">
                            {payload.labels.sourceDiagnostics}
                          </span>
                        </div>
                        <div className="data-asset-alerts-grid data-config-source-diagnostic-metrics">
                          <div
                            className={`data-asset-diagnostic-card data-asset-diagnostic-card-slim ${
                              payload.sourceDiagnostics.totalIssueCountLabel ===
                              "0"
                                ? "is-safe"
                                : "is-warning"
                            }`}
                          >
                            <span className="data-asset-diagnostic-title">
                              {payload.labels.totalIssues}
                            </span>
                            <span className="data-asset-diagnostic-value">
                              {payload.sourceDiagnostics.totalIssueCountLabel}
                            </span>
                          </div>
                          <div className="data-asset-diagnostic-card data-asset-diagnostic-card-slim is-safe">
                            <span className="data-asset-diagnostic-title">
                              {payload.labels.health}
                            </span>
                            <span className="data-asset-diagnostic-value">
                              {payload.sourceDiagnostics.healthScoreLabel}
                            </span>
                          </div>
                          <div className="data-asset-diagnostic-card data-asset-diagnostic-card-slim">
                            <span className="data-asset-diagnostic-title">
                              {payload.labels.syncStatus}
                            </span>
                            <span className="data-asset-diagnostic-value">
                              {payload.sourceDiagnostics.statusLabel}
                            </span>
                          </div>
                          <div
                            className={`data-asset-diagnostic-card data-asset-diagnostic-card-slim ${
                              payload.sourceDiagnostics
                                .affectedSymbolCountLabel === "0"
                                ? "is-safe"
                                : "is-warning"
                            }`}
                          >
                            <span className="data-asset-diagnostic-title">
                              {payload.labels.affectedSymbols}
                            </span>
                            <span className="data-asset-diagnostic-value">
                              {
                                payload.sourceDiagnostics
                                  .affectedSymbolCountLabel
                              }
                            </span>
                          </div>
                          <div className="data-asset-diagnostic-card data-asset-diagnostic-card-slim">
                            <span className="data-asset-diagnostic-title">
                              {payload.labels.scannedSymbols}
                            </span>
                            <span className="data-asset-diagnostic-value">
                              {
                                payload.sourceDiagnostics
                                  .scannedSymbolCountLabel
                              }
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="data-config-source-diagnostic-filter">
                        <SegmentedControl<SourceDiagnosticFilterKind>
                          size="sm"
                          selectionStyle="pill"
                          className="data-config-source-diagnostic-filter-tabs"
                          gridTemplateColumns={`repeat(${diagnosticFilterColumnCount}, minmax(0, 1fr))`}
                          options={payload.sourceDiagnostics.filterOptions.map(
                            (option) => ({
                              value: option.kind,
                              label: option.label,
                            }),
                          )}
                          value={payload.sourceDiagnostics.activeFilterKind}
                          onChange={(kind) =>
                            onAction({
                              action: "SET_DIAGNOSTIC_KIND",
                              payload: { kind },
                            })
                          }
                        />
                      </div>

                      <div className="data-asset-diagnostics-panel data-asset-diagnostics-panel-foldable">
                        <div className="data-asset-gap-alert-panel">
                          <div className="data-asset-gap-alert-head">
                            <span className="data-asset-gap-alert-title">
                              {payload.sourceDiagnostics.detailCountLabel}
                            </span>
                          </div>
                          {payload.sourceDiagnostics
                            .isLoadingSourceDiagnostics ? (
                            <div className="data-asset-gap-alert-empty data-asset-gap-alert-loading">
                              <DataTaskProgressRail
                                progress={createIndeterminateProgress(
                                  payload.labels.loading,
                                )}
                              />
                            </div>
                          ) : payload.sourceDiagnostics
                              .sourceDiagnosticsLoadFailed ? (
                            <div className="data-asset-gap-alert-empty">
                              {payload.labels.diagnosticsUnavailable}
                            </div>
                          ) : payload.sourceDiagnostics.items.length ? (
                            <div className="data-asset-gap-alert-list">
                              {payload.sourceDiagnostics.items.map(
                                (detailItem) => (
                                  <Button
                                    key={detailItem.id}
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className={`data-asset-gap-alert-item ${payload.sourceDiagnostics.focusedDetailItemId === detailItem.id ? "is-active" : ""} ${
                                      detailItem.stacked ? "is-stacked" : ""
                                    }`}
                                    onClick={() =>
                                      onAction({
                                        action: "JUMP_TO_DIAGNOSTIC_ITEM",
                                        payload: { id: detailItem.id },
                                      })
                                    }
                                  >
                                    <span className="data-asset-gap-alert-item-primary">
                                      {detailItem.dateLabel}
                                    </span>
                                    <span className="data-asset-gap-alert-item-secondary">
                                      {detailItem.detailText}
                                    </span>
                                  </Button>
                                ),
                              )}
                            </div>
                          ) : (
                            <div className="data-asset-gap-alert-empty">
                              {payload.sourceDiagnostics.emptyText}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="data-asset-mini-chart-panel data-config-source-diagnostic-chart">
                      <div className="data-asset-mini-chart-head">
                        <span className="data-asset-alerts-title">
                          {payload.labels.marketPreview}
                        </span>
                        <span className="data-asset-mini-chart-meta">
                          {payload.sourceDiagnostics.activeBarCountLabel}
                        </span>
                      </div>
                      <div
                        className={`data-asset-mini-chart-surface ${payload.sourceDiagnostics.isLoadingSymbolBars ? "is-loading" : ""}`}
                        aria-busy={
                          payload.sourceDiagnostics.isLoadingSymbolBars
                            ? "true"
                            : undefined
                        }
                      >
                        {payload.sourceDiagnostics.isLoadingSymbolBars ? (
                          <div className="data-asset-mini-chart-state">
                            <InlineLoadingState
                              label={payload.labels.systemProcessingWait}
                            />
                            <DataTaskProgressRail
                              progress={createIndeterminateProgress(
                                payload.labels.systemProcessingWait,
                              )}
                            />
                          </div>
                        ) : null}
                        {!payload.sourceDiagnostics.isLoadingSymbolBars &&
                        payload.sourceDiagnostics.activeSymbolBarsLoadFailed ? (
                          <div className="data-asset-mini-chart-state">
                            {hasActiveMarketBars
                              ? payload.labels.diagnosticsUnavailable
                              : payload.labels.barsAvailableSymbol}
                          </div>
                        ) : null}
                        {!payload.sourceDiagnostics.isLoadingSymbolBars &&
                        !payload.sourceDiagnostics.activeSymbolBarsLoadFailed &&
                        !hasFocusedDiagnosticItem ? (
                          <div className="data-asset-mini-chart-state">
                            {hasActiveMarketBars
                              ? payload.sourceDiagnostics.items.length
                                ? payload.sourceDiagnostics.detailHint
                                : payload.sourceDiagnostics.emptyText
                              : payload.labels.barsAvailableSymbol}
                          </div>
                        ) : null}
                        {!payload.sourceDiagnostics.isLoadingSymbolBars &&
                        !payload.sourceDiagnostics.activeSymbolBarsLoadFailed &&
                        hasFocusedDiagnosticItem &&
                        !payload.sourceDiagnostics.project ? (
                          <div className="data-asset-mini-chart-state">
                            {hasActiveMarketBars
                              ? payload.labels.diagnosticsUnavailable
                              : payload.labels.barsAvailableSymbol}
                          </div>
                        ) : null}
                        {payload.sourceDiagnostics
                          .shouldRenderMiniHistoryChart &&
                        hasFocusedDiagnosticItem &&
                        payload.sourceDiagnostics.project ? (
                          <div className="data-asset-mini-history-chart-host">
                            <HistoryReplayChartView
                              key={
                                payload.sourceDiagnostics.miniHistoryChartKey
                              }
                              project={payload.sourceDiagnostics.project}
                              themeMode={themeMode}
                              showGlobalDecimals={showGlobalDecimals}
                              priceColorMode={priceColorMode}
                              tradeColorTheme={tradeColorTheme}
                              createSystemMarkers={createNoopSystemMarkers}
                              language={language}
                              displayPeriod={
                                payload.sourceDiagnostics.displayPeriod
                              }
                              trainerPeriodOptionsByBase={
                                payload.sourceDiagnostics
                                  .trainerPeriodOptionsByBase
                              }
                              bindings={chartBindings}
                              initialDisplayPeriod={
                                payload.sourceDiagnostics.initialDisplayPeriod
                              }
                              showIndicatorButton={false}
                              showSubIndicatorToggle={false}
                              disableIndicators
                              focusBehavior="scroll-and-select"
                              focusRawBarIndex={
                                payload.sourceDiagnostics.focusedDetailBarIndex
                              }
                              focusRequestNonce={
                                payload.sourceDiagnostics.focusRequestNonce
                              }
                              focusMarker={
                                payload.sourceDiagnostics.focusedDetailMarker
                              }
                              changeBubblePlacement="origin-left"
                              hideLastPriceLine
                              hideNativeTooltip
                              showVolumePane={
                                payload.sourceDiagnostics.showVolumePane
                              }
                              volumePaneRatio={0.2}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </DataConfigDetailContentBoundary>
        </div>
      </div>
    </StandardSheetFrame>
  );
};
