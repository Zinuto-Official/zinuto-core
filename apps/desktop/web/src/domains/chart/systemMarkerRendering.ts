// SPDX-License-Identifier: GPL-3.0-only

import type { ReplayNote } from "@/domains/notes/replayNoteModel";
import type { SystemMarkerRenderer } from "@/domains/chart/systemMarkerTypes";
import type { AggregatedBarItem } from "@/domains/chart/replayAggregation";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { ReplayBar } from "@/domains/trainer/trainerTypes";
import type { Chart, KLineData } from 'klinecharts';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import { resolveRawDisplayTarget } from '@/domains/chart/rawDisplayIndex';
import { shouldAggregateTradeMarkersByPeriod } from '@/domains/chart/tradeMarkerAggregationMode';
import {
  buildSystemTradeMarkerBuckets,
  type SystemTradeMarkerBucketSide
} from '@/domains/chart/systemTradeMarkerModel';
import {
  layoutTradeMarkerCandidates,
  resolveTradeMarkerPaneHeight,
  resolveTradeMarkerPixelPoint,
  type TradeMarkerLayoutCandidate
} from '@/domains/chart/tradeMarkerLayout';
import { resolveTradeMarkerCompactModeByDensity } from '@/domains/chart/overlays/tradeMarkerDensityRules';
import { resolveTradeMarkerVolumeVisual } from '@/domains/chart/overlays/tradeMarkerVolume';
import { resolveTradeMarkerViewportMetrics } from '@/domains/chart/overlays/tradeMarkerViewport';
import { INDICATOR_PANES } from '@/domains/indicators/runtime';
import {
  SYSTEM_NOTE_GROUP,
  SYSTEM_POSITION_OVERLAY_ID,
  SYSTEM_TRADE_GROUP,
  SYSTEM_TRADE_MARKER_OVERLAY_NAME
} from '@/domains/chart/overlays/constants';
import {
  syncSystemOverlayById,
  syncSystemOverlayGroup,
  type SystemOverlayCreate,
  withSystemOverlaySignature
} from '@/domains/chart/overlays/systemOverlayDiff';
import type { SessionSnapshot } from '@/domains/training/types';

export type ChartMarkerHover = {
  title: string;
  pageX: number;
  pageY: number;
};

export type SystemMarkerHoverController = {
  show: (hover: ChartMarkerHover) => void;
  clear: () => void;
};

export type TradeMarkerCompactState = {
  compact: boolean;
  overlayCount: number;
  viewportWidthPx: number;
  visibleBarCount: number;
  visibleBarPixelWidth: number;
};

export type SystemMarkerRendererCaches = {
  visibleBarCountCache: WeakMap<Chart, number>;
  compactStateCache: WeakMap<Chart, TradeMarkerCompactState>;
};

type SystemTradeMarkerLayoutPayload = {
  key: string;
  timestamp: number;
  markerValue: number;
  side: SystemTradeMarkerBucketSide;
  avgPrice: number;
  totalQty: number;
  lots: number;
  spent: number;
  received: number;
  isAggregated: boolean;
  displayLabel: string;
  hoverText: string;
  forceDirection?: 1 | -1;
};

type CreateSystemMarkerRendererArgs = {
  tradeMarkerDensityRatio: number;
  resolveTradeAmountIncludesFees: (snapshot: SessionSnapshot) => boolean;
  replayNotes?: ReplayNote[];
  isReplaySnapshotNote?: (note: ReplayNote) => boolean;
  openReplayNoteFromMarker?: (noteId: string) => void;
  hoverController?: SystemMarkerHoverController;
  formatMoney: (value: number, digits?: number) => string;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values?: unknown[]) => string;
  caches: SystemMarkerRendererCaches;
};

const SYSTEM_POSITION_GROUP = 'system-position';

export const resolveEventPagePoint = (
  event: { pageX?: number; pageY?: number; x?: number; y?: number }
) => {
  const pageX = Number.isFinite(Number(event.pageX)) ? Number(event.pageX) : Number(event.x);
  const pageY = Number.isFinite(Number(event.pageY)) ? Number(event.pageY) : Number(event.y);
  if (!Number.isFinite(pageX) || !Number.isFinite(pageY)) {
    return null;
  }
  return { pageX, pageY };
};

export const formatMarkerQuantity = (qty: number): string => {
  if (!Number.isFinite(qty)) {
    return '0';
  }
  return String(Number(qty.toFixed(8)));
};

export const formatSignedTradeAmount = ({
  side,
  spent,
  received,
  formatMoney
}: {
  side: SystemTradeMarkerBucketSide;
  spent: number;
  received: number;
  formatMoney: (value: number, digits?: number) => string;
}): string => {
  const normalizedSpent = Number.isFinite(spent) && spent > 0 ? spent : 0;
  const normalizedReceived = Number.isFinite(received) && received > 0 ? received : 0;
  if (side === 'BUY') {
    return `-${formatMoney(normalizedSpent, 2)}`;
  }
  if (side === 'SELL') {
    return `+${formatMoney(normalizedReceived, 2)}`;
  }
  return [
    normalizedSpent > 0 ? `-${formatMoney(normalizedSpent, 2)}` : '',
    normalizedReceived > 0 ? `+${formatMoney(normalizedReceived, 2)}` : ''
  ].filter(Boolean).join(' / ');
};

const resolveCompactModeState = ({
  chart,
  viewportWidthPx,
  fallbackCount = 1,
  tradeMarkerDensityRatio,
  visibleBarCountCache
}: {
  chart: Chart;
  viewportWidthPx?: number;
  fallbackCount?: number;
  tradeMarkerDensityRatio: number;
  visibleBarCountCache: WeakMap<Chart, number>;
}): { compact: boolean; visibleBarCount: number; visibleBarPixelWidth: number; viewportWidthPx: number } => {
  const normalizedViewportWidth = Number.isFinite(Number(viewportWidthPx))
    ? Math.max(0, Math.floor(Number(viewportWidthPx)))
    : 0;
  const { visibleBarCount, visibleBarPixelWidth } = resolveTradeMarkerViewportMetrics({
    chart,
    visibleBarCountCache,
    fallbackCount,
    viewportWidthPx: normalizedViewportWidth
  });
  return {
    compact: resolveTradeMarkerCompactModeByDensity({
      visibleBarPixelWidth,
      densityMinRatio: tradeMarkerDensityRatio
    }),
    visibleBarCount,
    visibleBarPixelWidth,
    viewportWidthPx: normalizedViewportWidth
  };
};

export const syncSystemTradeMarkerCompactMode = ({
  chart,
  viewportWidthPx,
  tradeMarkerDensityRatio,
  visibleBarCountCache,
  compactStateCache
}: {
  chart: Chart;
  viewportWidthPx?: number;
  tradeMarkerDensityRatio: number;
  visibleBarCountCache: WeakMap<Chart, number>;
  compactStateCache: WeakMap<Chart, TradeMarkerCompactState>;
}): void => {
  const tradeOverlays = chart.getOverlays({ groupId: SYSTEM_TRADE_GROUP });
  if (!tradeOverlays.length) {
    return;
  }

  const nextState = resolveCompactModeState({
    chart,
    viewportWidthPx,
    fallbackCount: tradeOverlays.length,
    tradeMarkerDensityRatio,
    visibleBarCountCache
  });
  const cachedState = compactStateCache.get(chart);
  if (
    cachedState &&
    cachedState.compact === nextState.compact &&
    cachedState.overlayCount === tradeOverlays.length &&
    cachedState.viewportWidthPx === nextState.viewportWidthPx &&
    cachedState.visibleBarCount === nextState.visibleBarCount &&
    cachedState.visibleBarPixelWidth === nextState.visibleBarPixelWidth
  ) {
    return;
  }

  const overlaysToUpdate = tradeOverlays.flatMap((overlay) => {
    const id = typeof overlay.id === 'string' ? overlay.id : '';
    if (!id) {
      return [];
    }
    const extendData =
      overlay.extendData && typeof overlay.extendData === 'object'
        ? (overlay.extendData as Record<string, unknown>)
        : {};

    const currentCompact = Boolean(extendData.compact);
    const currentHidden = Boolean(extendData.hidden);
    const currentCompactLabel = typeof extendData.compactLabel === 'string' ? extendData.compactLabel : '';
    if (currentCompact === nextState.compact && !currentHidden) {
      return [];
    }
    return [{
      id,
      extendData,
      compactLabel: currentCompactLabel
    }];
  });

  if (!overlaysToUpdate.length) {
    compactStateCache.set(chart, {
      compact: nextState.compact,
      overlayCount: tradeOverlays.length,
      viewportWidthPx: nextState.viewportWidthPx,
      visibleBarCount: nextState.visibleBarCount,
      visibleBarPixelWidth: nextState.visibleBarPixelWidth
    });
    return;
  }

  overlaysToUpdate.forEach((overlay) => {
    chart.overrideOverlay({
      id: overlay.id,
      extendData: {
        ...overlay.extendData,
        compact: nextState.compact,
        hidden: false,
        compactLabel: overlay.compactLabel || undefined
      }
    });
  });

  compactStateCache.set(chart, {
    compact: nextState.compact,
    overlayCount: tradeOverlays.length,
    viewportWidthPx: nextState.viewportWidthPx,
    visibleBarCount: nextState.visibleBarCount,
    visibleBarPixelWidth: nextState.visibleBarPixelWidth
  });
};

export const createSystemMarkerRenderer = ({
  tradeMarkerDensityRatio,
  resolveTradeAmountIncludesFees,
  replayNotes = [],
  isReplaySnapshotNote,
  openReplayNoteFromMarker,
  hoverController,
  formatMoney,
  tt,
  ttf,
  caches
}: CreateSystemMarkerRendererArgs): SystemMarkerRenderer => (
  chart: Chart,
  visibleData: KLineData[],
  currentSnapshot: SessionSnapshot,
  sourceBars: ReplayBar[],
  visibleItems: AggregatedBarItem[],
  context
) => {
  const refreshTradesAndNotes = context?.refreshTradesAndNotes !== false;
  if (refreshTradesAndNotes) {
    hoverController?.clear();
  }

  if (!visibleData.length || !visibleItems.length) {
    if (refreshTradesAndNotes) {
      syncSystemOverlayGroup(chart, SYSTEM_TRADE_GROUP, []);
      syncSystemOverlayGroup(chart, SYSTEM_NOTE_GROUP, []);
    }
    syncSystemOverlayById(chart, SYSTEM_POSITION_OVERLAY_ID, null);
    return;
  }

  if (refreshTradesAndNotes) {
    const compactModeState = resolveCompactModeState({
      chart,
      viewportWidthPx: context?.chartViewportWidthPx,
      fallbackCount: visibleData.length,
      tradeMarkerDensityRatio,
      visibleBarCountCache: caches.visibleBarCountCache
    });
    const useCompactTradeMarker = compactModeState.compact;
    const fills = Array.isArray(currentSnapshot.fills) ? currentSnapshot.fills : [];
    const aggregateTradeMarkersByVisiblePeriod = shouldAggregateTradeMarkersByPeriod(
      context?.displayPeriod,
      context?.baseDisplayPeriod ??
        currentSnapshot.session.minimumBaseTimeframe ??
        currentSnapshot.session.timeframe
    );
    const tradeMarkerBuckets = buildSystemTradeMarkerBuckets({
      fills,
      sourceBars,
      visibleItems,
      tradeAmountIncludesFees: resolveTradeAmountIncludesFees(currentSnapshot),
      aggregateByVisiblePeriod: aggregateTradeMarkersByVisiblePeriod,
      fillSequenceStartIndex: currentSnapshot.residentFillsStartIndex,
    });

    const desiredTradeOverlays: SystemOverlayCreate[] = [];
    const layoutCandidates: TradeMarkerLayoutCandidate<SystemTradeMarkerLayoutPayload>[] = [];
    const unresolvedTradeMarkers: SystemTradeMarkerLayoutPayload[] = [];
    tradeMarkerBuckets.forEach((marker) => {
      if (
        !Number.isFinite(marker.timestamp) ||
        !Number.isFinite(marker.markerValue) ||
        marker.markerValue <= 0
      ) {
        return;
      }
      const avgPrice = marker.totalQty > 0 ? marker.weightedPriceSum / marker.totalQty : 0;
      const markerVisual = resolveTradeMarkerVolumeVisual({
        side: marker.side === 'SELL' ? 'SELL' : 'BUY',
        lots: marker.details.length
      });
      const lots = markerVisual.lotCount;
      const buyCashAmount = marker.details.reduce(
        (sum, detail) => sum + (detail.side === 'BUY' ? detail.cashAmount : 0),
        0
      );
      const sellCashAmount = marker.details.reduce(
        (sum, detail) => sum + (detail.side === 'SELL' ? detail.cashAmount : 0),
        0
      );
      const spent = marker.side === 'SELL' ? marker.tradingCost : buyCashAmount;
      const received = marker.side === 'BUY' ? 0 : sellCashAmount;
      const markerPriceText =
        Number.isFinite(avgPrice) && avgPrice > 0 ? formatMoney(avgPrice, 3) : tt('appText.message0367');
      const markerAmountText = formatSignedTradeAmount({
        side: marker.side,
        spent,
        received,
        formatMoney
      });
      const markerDetailText = marker.details
        .map((detail) => {
          const detailAmountText = detail.side === 'BUY'
            ? `-${formatMoney(detail.cashAmount, 2)}`
            : `+${formatMoney(detail.cashAmount, 2)}`;
          return [
            detail.label,
            formatMoney(detail.price, 3),
            formatMarkerQuantity(detail.qty),
            detailAmountText,
          ].join(' ');
        })
        .join('\n');
      const markerHoverText = marker.details.length > 1
        ? [
            marker.displayLabel,
            markerPriceText,
            markerAmountText,
            markerDetailText,
          ].filter(Boolean).join('\n')
        : [
            marker.displayLabel,
            markerPriceText,
            formatMarkerQuantity(marker.totalQty),
            markerAmountText,
          ].filter(Boolean).join('\n');

      const payload: SystemTradeMarkerLayoutPayload = {
        key: marker.key,
        timestamp: marker.timestamp,
        markerValue: marker.markerValue,
        side: marker.side,
        avgPrice,
        totalQty: marker.totalQty,
        lots,
        spent,
        received,
        isAggregated: marker.isAggregated,
        displayLabel: marker.displayLabel,
        hoverText: markerHoverText,
        forceDirection: marker.forceDirection
      };
      const pixelPoint = resolveTradeMarkerPixelPoint({
        chart,
        timestamp: marker.timestamp,
        value: marker.markerValue,
        paneId: INDICATOR_PANES.candle
      });
      if (pixelPoint) {
        layoutCandidates.push({
          key: marker.key,
          side: marker.side,
          timestamp: marker.timestamp,
          value: marker.markerValue,
          label: marker.displayLabel,
          x: pixelPoint.x,
          y: pixelPoint.y,
          aggregated: marker.isAggregated,
          labelOnly: marker.isAggregated,
          count: lots,
          weight: marker.totalQty,
          price: avgPrice,
          hoverText: markerHoverText,
          forceDirection: marker.forceDirection,
          payload
        });
        return;
      }
      unresolvedTradeMarkers.push(payload);
    });

    const createTradeOverlay = ({
      overlayId,
      timestamp,
      markerValue,
      side,
      avgPrice,
      lots,
      spent,
      received,
      aggregated,
      labelOnly,
      displayLabel,
      hoverText,
      labelOffsetX = 0,
      labelOffsetY = 0,
      forceDirection = side === 'SELL' ? -1 : 1,
      compressed = false,
      sourceKeys = [overlayId]
    }: {
      overlayId: string;
      timestamp: number;
      markerValue: number;
      side: SystemTradeMarkerBucketSide;
      avgPrice: number;
      lots: number;
      spent: number;
      received: number;
      aggregated: boolean;
      labelOnly: boolean;
      displayLabel: string;
      hoverText: string;
      labelOffsetX?: number;
      labelOffsetY?: number;
      forceDirection?: 1 | -1;
      compressed?: boolean;
      sourceKeys?: string[];
    }) => {
      const syncMarkerHover = hoverController
        ? (event: { pageX?: number; pageY?: number; x?: number; y?: number }) => {
            const pagePoint = resolveEventPagePoint(event);
            if (!pagePoint) {
              return;
            }
            hoverController.show({ title: hoverText, pageX: pagePoint.pageX, pageY: pagePoint.pageY });
          }
        : null;

      desiredTradeOverlays.push({
        id: overlayId,
        groupId: SYSTEM_TRADE_GROUP,
        name: SYSTEM_TRADE_MARKER_OVERLAY_NAME,
        lock: true,
        zLevel: 800,
        points: [
          {
            timestamp,
            value: markerValue
          }
        ],
        extendData: withSystemOverlaySignature(
          {
            side,
            price: avgPrice,
            lots,
            spent,
            received,
            compact: useCompactTradeMarker,
            aggregated,
            labelOnly,
            labelOffsetX,
            labelOffsetY,
            forceDirection,
            compressed,
            hidden: false,
            compactLabel: displayLabel
          },
          [
            overlayId,
            timestamp,
            markerValue,
            side,
            avgPrice,
            lots,
            spent,
            received,
            useCompactTradeMarker,
            aggregated,
            labelOnly,
            labelOffsetX,
            labelOffsetY,
            forceDirection,
            compressed,
            displayLabel,
            hoverText,
            sourceKeys.join(',')
          ].join('|')
        ),
        ...(syncMarkerHover
          ? {
              onMouseEnter: (event) => {
                syncMarkerHover(event as any);
              },
              onMouseMove: (event) => {
                syncMarkerHover(event as any);
              },
              onMouseLeave: () => {
                hoverController?.clear();
              }
            }
          : {})
      });
    };

    const layoutMarkers = layoutTradeMarkerCandidates({
      candidates: layoutCandidates,
      compact: useCompactTradeMarker,
      visibleBarPixelWidth: compactModeState.visibleBarPixelWidth,
      paneHeight: resolveTradeMarkerPaneHeight({
        chart,
        paneId: INDICATOR_PANES.candle
      })
    });
    layoutMarkers.forEach((layoutMarker) => {
      const payloads = layoutMarker.payloads.length > 0 ? layoutMarker.payloads : [];
      const fallbackPayload = payloads[0];
      if (!fallbackPayload) {
        return;
      }
      const totalSpent = payloads.reduce((sum, payload) => sum + payload.spent, 0);
      const totalReceived = payloads.reduce((sum, payload) => sum + payload.received, 0);
      const totalQty = payloads.reduce((sum, payload) => sum + payload.totalQty, 0);
      const avgPrice = layoutMarker.price > 0 ? layoutMarker.price : fallbackPayload.avgPrice;
      const amountText = formatSignedTradeAmount({
        side: layoutMarker.side,
        spent: totalSpent,
        received: totalReceived,
        formatMoney
      });
      const hoverText = layoutMarker.compressed
        ? [
            layoutMarker.displayLabel,
            Number.isFinite(avgPrice) && avgPrice > 0 ? formatMoney(avgPrice, 3) : tt('appText.message0367'),
            formatMarkerQuantity(totalQty),
            amountText,
            layoutMarker.hoverText || fallbackPayload.hoverText,
          ].filter(Boolean).join('\n')
        : layoutMarker.hoverText || fallbackPayload.hoverText;
      createTradeOverlay({
        overlayId: `fill-layout-${layoutMarker.key}`,
        timestamp: layoutMarker.timestamp,
        markerValue: layoutMarker.value,
        side: layoutMarker.side,
        avgPrice,
        lots: layoutMarker.count,
        spent: totalSpent,
        received: totalReceived,
        aggregated: layoutMarker.aggregated,
        labelOnly: layoutMarker.labelOnly,
        displayLabel: layoutMarker.displayLabel,
        hoverText,
        labelOffsetX: layoutMarker.labelOffsetX,
        labelOffsetY: layoutMarker.labelOffsetY,
        forceDirection: layoutMarker.forceDirection,
        compressed: layoutMarker.compressed,
        sourceKeys: layoutMarker.sourceKeys
      });
    });
    unresolvedTradeMarkers.forEach((payload) => {
      createTradeOverlay({
        overlayId: `fill-agg-${payload.key}`,
        timestamp: payload.timestamp,
        markerValue: payload.markerValue,
        side: payload.side,
        avgPrice: payload.avgPrice,
        lots: payload.lots,
        spent: payload.spent,
        received: payload.received,
        aggregated: payload.isAggregated,
        labelOnly: payload.isAggregated,
        displayLabel: payload.displayLabel,
        hoverText: payload.hoverText,
        forceDirection: payload.forceDirection,
        sourceKeys: [payload.key]
      });
    });

    syncSystemOverlayGroup(chart, SYSTEM_TRADE_GROUP, desiredTradeOverlays);
    if (desiredTradeOverlays.length > 0) {
      syncSystemTradeMarkerCompactMode({
        chart,
        viewportWidthPx: context?.chartViewportWidthPx,
        tradeMarkerDensityRatio,
        visibleBarCountCache: caches.visibleBarCountCache,
        compactStateCache: caches.compactStateCache
      });
    }

    const currentSessionId =
      typeof currentSnapshot.session.id === 'string' ? currentSnapshot.session.id.trim() : '';
    const scopedTrainingProjectId =
      typeof context?.trainingProjectId === 'string' && context.trainingProjectId.trim()
        ? context.trainingProjectId.trim()
        : '';
    const desiredNoteOverlays: SystemOverlayCreate[] = [];

    if (openReplayNoteFromMarker && (currentSessionId || scopedTrainingProjectId)) {
      type AggregatedNoteMarker = {
        timestamp: number;
        markerValue: number;
        primaryNoteId: string;
        titles: string[];
        noteIds: string[];
      };
      const noteMap = new Map<number, AggregatedNoteMarker>();
      const sessionNotes = (Array.isArray(replayNotes) ? replayNotes : [])
        .filter((note) => {
          if (!note || typeof note !== 'object') {
            return false;
          }
          if (!isReplaySnapshotNote?.(note)) {
            return false;
          }
          const noteBinding = (note.trainingProjectId || '').trim();
          const noteSessionId = (note.contextSessionId || '').trim();
          if (noteBinding && scopedTrainingProjectId && noteBinding === scopedTrainingProjectId) {
            return true;
          }
          if (noteBinding && noteBinding === currentSessionId) {
            return true;
          }
          if (noteSessionId && noteSessionId === currentSessionId) {
            return true;
          }
          return false;
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

      sessionNotes.forEach((note) => {
        const rawCursor = Number(note.contextCursorIndex);
        if (!Number.isFinite(rawCursor)) {
          return;
        }
        const target = resolveRawDisplayTarget({
          rawIndex: Math.max(0, Math.floor(rawCursor)),
          sourceBars,
          visibleItems,
        });
        const targetItem = target.visibleItem;
        if (!targetItem) {
          return;
        }
        const sourceBar = target.sourceBar;
        const title = (note.title || '').trim() || tt('appText.untitledNote');
        const timestamp = Number(targetItem.bucketStartMs);
        if (!Number.isFinite(timestamp)) {
          return;
        }
        const markerValue =
          Number.isFinite(Number(targetItem.low)) && Number(targetItem.low) > 0
            ? Number(targetItem.low)
            : Number.isFinite(Number(sourceBar?.low)) && Number(sourceBar?.low) > 0
              ? Number(sourceBar?.low)
              : Number(sourceBar?.close);
        if (!Number.isFinite(markerValue) || markerValue <= 0) {
          return;
        }
        const existing = noteMap.get(timestamp);
        if (existing) {
          existing.noteIds.push(note.id);
          existing.titles.push(title);
          return;
        }
        noteMap.set(timestamp, {
          timestamp,
          markerValue,
          primaryNoteId: note.id,
          titles: [title],
          noteIds: [note.id]
        });
      });

      Array.from(noteMap.values()).forEach((marker) => {
        const titleLines = marker.titles.map((item) => item.trim()).filter((item) => item.length > 0);
        const titleText =
          marker.noteIds.length > 1
            ? ttf('appText.totalValue0NotesValue1', [
                formatMoney(marker.noteIds.length, 0),
                titleLines.map((title, index) => `${index + 1}. ${title}`).join('\n')
              ])
            : (titleLines[0] ?? marker.titles[0] ?? tt('appText.untitledNote'));

        const overlayId = `note-marker-${marker.timestamp}-${marker.primaryNoteId}`;
        desiredNoteOverlays.push({
          id: overlayId,
          groupId: SYSTEM_NOTE_GROUP,
          name: 'noteMarker',
          lock: false,
          zLevel: 790,
          needDefaultPointFigure: false,
          needDefaultXAxisFigure: false,
          needDefaultYAxisFigure: false,
          points: [
            {
              timestamp: marker.timestamp,
              value: marker.markerValue
            }
          ],
          extendData: withSystemOverlaySignature(
            {
              count: marker.noteIds.length
            },
            [
              overlayId,
              marker.timestamp,
              marker.markerValue,
              marker.primaryNoteId,
              marker.noteIds.join(','),
              titleText,
              context?.displayPeriod || ''
            ].join('|')
          ),
          onClick: () => {
            if (marker.noteIds.length > 1 && context?.displayPeriod && context.displayPeriod !== '1d') {
              context.onRequestDisplayPeriod?.('1d' as DisplayPeriodKey);
              return;
            }
            openReplayNoteFromMarker(marker.primaryNoteId);
          },
          ...(hoverController
            ? {
                onMouseEnter: (event) => {
                  const pagePoint = resolveEventPagePoint(event as any);
                  if (!pagePoint) {
                    return;
                  }
                  hoverController.show({ title: titleText, pageX: pagePoint.pageX, pageY: pagePoint.pageY });
                },
                onMouseMove: (event) => {
                  const pagePoint = resolveEventPagePoint(event as any);
                  if (!pagePoint) {
                    return;
                  }
                  hoverController.show({ title: titleText, pageX: pagePoint.pageX, pageY: pagePoint.pageY });
                },
                onMouseLeave: () => {
                  hoverController.clear();
                }
              }
            : {})
        });
      });
    }
    syncSystemOverlayGroup(chart, SYSTEM_NOTE_GROUP, desiredNoteOverlays);
  }

  const positions = Array.isArray(currentSnapshot.positions) ? currentSnapshot.positions : [];
  const currentPosition = positions.find(
    (item) => item.symbol === currentSnapshot.session.symbol
  );
  const positionQty = Number(currentPosition?.qty);
  if (!currentPosition || !Number.isFinite(positionQty) || Math.abs(positionQty) <= 1e-8) {
    syncSystemOverlayById(chart, SYSTEM_POSITION_OVERLAY_ID, null);
    return;
  }

  const positionTarget = resolveRawDisplayTarget({
    rawIndex: Math.max(0, Math.floor(currentSnapshot.session.cursor_index)),
    sourceBars,
    visibleItems,
  });
  const positionItem = positionTarget.visibleItem;
  if (!positionItem) {
    syncSystemOverlayById(chart, SYSTEM_POSITION_OVERLAY_ID, null);
    return;
  }
  const sourceBar = positionTarget.sourceBar;
  if (!sourceBar) {
    syncSystemOverlayById(chart, SYSTEM_POSITION_OVERLAY_ID, null);
    return;
  }
  const positionTimestamp = Number(positionItem.bucketStartMs);
  const avgCost = Number(currentPosition.avgCost);
  const markPrice = Number(sourceBar.close);
  const contractMultiplier = Number(currentSnapshot.sessionTradingSettings?.contractMultiplier ?? 1);
  const normalizedContractMultiplier =
    Number.isFinite(contractMultiplier) && contractMultiplier > 0 ? contractMultiplier : 1;
  if (
    !Number.isFinite(positionTimestamp) ||
    !Number.isFinite(avgCost) ||
    avgCost <= 0 ||
    !Number.isFinite(markPrice)
  ) {
    syncSystemOverlayById(chart, SYSTEM_POSITION_OVERLAY_ID, null);
    return;
  }
  const floating = (markPrice - avgCost) * positionQty * normalizedContractMultiplier;
  const tone = floating > 0 ? 'up' : floating < 0 ? 'down' : 'flat';
  const side = positionQty < -1e-8 ? 'SELL' : 'BUY';
  const positionText = ttf('appText.averagePositionPriceValue0', [formatMoney(avgCost, 3)]);

  syncSystemOverlayById(chart, SYSTEM_POSITION_OVERLAY_ID, {
    id: SYSTEM_POSITION_OVERLAY_ID,
    groupId: SYSTEM_POSITION_GROUP,
    name: 'positionLine',
    lock: true,
    zLevel: 760,
    points: [
      {
        timestamp: positionTimestamp,
        value: avgCost
      }
    ],
    extendData: withSystemOverlaySignature(
      {
        text: positionText,
        side,
        tone
      },
      [
        SYSTEM_POSITION_OVERLAY_ID,
        positionTimestamp,
        avgCost,
        positionText,
        side,
        tone
      ].join('|')
    )
  });
};
