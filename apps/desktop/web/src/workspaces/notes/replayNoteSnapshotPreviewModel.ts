// SPDX-License-Identifier: GPL-3.0-only

import type { HistoryReplayChartViewProps } from "@/domains/chart/HistoryReplayChart";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { ReplayNoteType } from "@/workspaces/notes/replayNoteTypes";

export type ReplayNoteSnapshotOverlayState =
  | {
      mode: "loading";
      heading: string;
      body?: string | null;
    }
  | {
      mode: "error";
      heading: string;
      retryLabel?: string;
      onRetry?: (() => void) | null;
    };

export type ReplayNoteSnapshotChartProps = {
  noteId: string;
  noteType: ReplayNoteType;
  contextReplay: unknown;
  project: HistoryReplayChartViewProps["project"];
  themeMode: HistoryReplayChartViewProps["themeMode"];
  showGlobalDecimals?: HistoryReplayChartViewProps["showGlobalDecimals"];
  priceColorMode: HistoryReplayChartViewProps["priceColorMode"];
  tradeColorTheme?: HistoryReplayChartViewProps["tradeColorTheme"];
  createSystemMarkers: HistoryReplayChartViewProps["createSystemMarkers"];
  language: HistoryReplayChartViewProps["language"];
  chartRenderMode?: HistoryReplayChartViewProps["chartRenderMode"];
  onChartRenderModeChange?: HistoryReplayChartViewProps["onChartRenderModeChange"];
  trainerPeriodOptionsByBase: HistoryReplayChartViewProps["trainerPeriodOptionsByBase"];
  bindings: HistoryReplayChartViewProps["bindings"];
  initialDisplayPeriod?: HistoryReplayChartViewProps["initialDisplayPeriod"];
  displayPeriod?: HistoryReplayChartViewProps["displayPeriod"];
  onDisplayPeriodChange?: (noteId: string, period: DisplayPeriodKey) => void;
  chartBodyVisible?: boolean;
  toolbarLeadingContent?: HistoryReplayChartViewProps["toolbarLeadingContent"];
  hideLastPriceLine?: boolean;
  emptyLabel?: string;
  overlay?: ReplayNoteSnapshotOverlayState | null;
};

const toJsonSignature = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
};

const resolveBarEdgeSignature = (
  bar: NonNullable<
    NonNullable<
      NonNullable<HistoryReplayChartViewProps["project"]>["replay"]
    >["bars"]
  >[number] | undefined,
): unknown =>
  bar
    ? {
        ts: bar.ts,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      }
    : null;

const toSignatureRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const buildReplayNoteFillSignature = (fill: unknown): unknown => {
  const record = toSignatureRecord(fill);
  if (!record) {
    return null;
  }
  return {
    id: record.id ?? null,
    orderId: record.order_id ?? record.orderId ?? null,
    side: record.side ?? null,
    fillIndex: record.fill_index ?? record.fillIndex ?? null,
    fillTime: record.fill_time ?? record.fillTime ?? null,
    fillPrice: record.fill_price ?? record.fillPrice ?? null,
    fillQty: record.fill_qty ?? record.fillQty ?? null,
    contractMultiplier:
      record.contract_multiplier ?? record.contractMultiplier ?? null,
    fee: record.fee ?? null,
    tax: record.tax ?? null,
    slippage: record.slippage ?? null,
    createdAt: record.created_at ?? record.createdAt ?? null,
  };
};

const buildReplayNotePositionSignature = (position: unknown): unknown => {
  const record = toSignatureRecord(position);
  if (!record) {
    return null;
  }
  return {
    sessionId: record.sessionId ?? record.session_id ?? null,
    instrumentId: record.instrumentId ?? record.instrument_id ?? null,
    symbol: record.symbol ?? null,
    qty: record.qty ?? null,
    avgCost: record.avgCost ?? record.avg_cost ?? null,
    realizedPnl: record.realizedPnl ?? record.realized_pnl ?? null,
    unrealizedPnl: record.unrealizedPnl ?? record.unrealized_pnl ?? null,
    totalPnl: record.totalPnl ?? record.total_pnl ?? null,
    markPrice: record.markPrice ?? record.mark_price ?? null,
  };
};

const buildReplayNoteSessionSignature = (session: unknown): unknown => {
  const record = toSignatureRecord(session);
  if (!record) {
    return null;
  }
  return {
    id: record.id ?? null,
    instrumentId: record.instrument_id ?? record.instrumentId ?? null,
    symbol: record.symbol ?? null,
    samplePoolId: record.samplePoolId ?? record.sample_pool_id ?? null,
    sourceTimeframe: record.sourceTimeframe ?? record.source_timeframe ?? null,
    timeframe: record.timeframe ?? null,
    minimumBaseTimeframe:
      record.minimumBaseTimeframe ?? record.minimum_base_timeframe ?? null,
    startIndex: record.start_index ?? record.startIndex ?? null,
    entryIndex: record.entry_index ?? record.entryIndex ?? null,
    cursorIndex: record.cursor_index ?? record.cursorIndex ?? null,
    historyBars: record.history_bars ?? record.historyBars ?? null,
    createdAt: record.created_at ?? record.createdAt ?? null,
  };
};

export const buildReplayNoteSnapshotProjectSignature = (
  project: HistoryReplayChartViewProps["project"],
): string => {
  if (!project) {
    return "none";
  }
  const replay = project.replay;
  const bars = replay?.bars ?? [];
  const snapshot = replay?.snapshot ?? null;
  const session = snapshot?.session ?? null;
  const fills = Array.isArray(snapshot?.fills) ? snapshot.fills : [];
  const positions = Array.isArray(snapshot?.positions) ? snapshot.positions : [];
  const drawings = replay?.drawings ?? [];
  return toJsonSignature({
    projectId: project.id,
    symbol: project.symbol,
    baseTimeframe: replay?.baseTimeframe ?? null,
    displayPeriod: replay?.displayPeriod ?? null,
    barWindow: replay?.barWindow ?? null,
    barsLength: bars.length,
    firstBar: resolveBarEdgeSignature(bars[0]),
    lastBar: resolveBarEdgeSignature(bars[bars.length - 1]),
    session: buildReplayNoteSessionSignature(session),
    fillsTotal: snapshot?.fillsTotal ?? null,
    fillsLength: fills.length,
    fills: fills.map(buildReplayNoteFillSignature),
    positionsLength: positions.length,
    positions: positions.map(buildReplayNotePositionSignature),
    sessionTradingSettings: snapshot?.sessionTradingSettings ?? null,
    drawingsLength: drawings.length,
    drawingsEdge: [drawings[0] ?? null, drawings[drawings.length - 1] ?? null],
    chartIndicators: replay?.chartIndicators ?? null,
    specialTraining: replay?.specialTraining ?? null,
  });
};

export const areReplayNoteSnapshotChartPropsEqual = (
  previous: ReplayNoteSnapshotChartProps,
  next: ReplayNoteSnapshotChartProps,
): boolean =>
  previous.noteId === next.noteId &&
  previous.noteType === next.noteType &&
  previous.contextReplay === next.contextReplay &&
  previous.project === next.project &&
  previous.themeMode === next.themeMode &&
  previous.showGlobalDecimals === next.showGlobalDecimals &&
  previous.priceColorMode === next.priceColorMode &&
  previous.tradeColorTheme === next.tradeColorTheme &&
  previous.createSystemMarkers === next.createSystemMarkers &&
  previous.language === next.language &&
  previous.chartRenderMode === next.chartRenderMode &&
  previous.onChartRenderModeChange === next.onChartRenderModeChange &&
  previous.trainerPeriodOptionsByBase === next.trainerPeriodOptionsByBase &&
  previous.bindings === next.bindings &&
  previous.initialDisplayPeriod === next.initialDisplayPeriod &&
  previous.displayPeriod === next.displayPeriod &&
  previous.onDisplayPeriodChange === next.onDisplayPeriodChange &&
  previous.chartBodyVisible === next.chartBodyVisible &&
  previous.toolbarLeadingContent === next.toolbarLeadingContent &&
  previous.hideLastPriceLine === next.hideLastPriceLine &&
  previous.emptyLabel === next.emptyLabel &&
  previous.overlay?.mode === next.overlay?.mode &&
  previous.overlay?.heading === next.overlay?.heading &&
  (previous.overlay?.mode === 'loading'
    ? previous.overlay?.body
    : null) ===
    (next.overlay?.mode === 'loading' ? next.overlay?.body : null) &&
  (previous.overlay?.mode === 'error'
    ? previous.overlay?.retryLabel
    : null) ===
    (next.overlay?.mode === 'error' ? next.overlay?.retryLabel : null) &&
  (previous.overlay?.mode === 'error'
    ? previous.overlay?.onRetry
    : null) ===
    (next.overlay?.mode === 'error' ? next.overlay?.onRetry : null);
