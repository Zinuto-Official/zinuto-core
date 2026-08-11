// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useMemo, useState } from 'react';
import type { Bar } from '@/domains/training/types';
import { clamp } from '@/frontend-kernel/math';
import type {
  SpecialTrainingChartSyncState,
} from '@/domains/special-training/specialTrainingContracts';
import {
  resolveBarsBaseTimeframe,
  type CsvImportBaseTimeframe
} from '@/domains/data-import/baseTimeframeInference';

const areChartBarsEqual = (left: Bar[], right: Bar[]): boolean => {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  return left.every((leftBar, index) => {
    const rightBar = right[index];
    if (!rightBar) {
      return false;
    }
    return (
      String(leftBar?.ts ?? '') === String(rightBar.ts ?? '') &&
      Number(leftBar?.open) === Number(rightBar.open) &&
      Number(leftBar?.high) === Number(rightBar.high) &&
      Number(leftBar?.low) === Number(rightBar.low) &&
      Number(leftBar?.close) === Number(rightBar.close) &&
      Number(leftBar?.volume ?? 0) === Number(rightBar.volume ?? 0)
    );
  });
};

export const useSpecialTrainingChartSyncState = () => {
  const [specialTrainingChartState, setSpecialTrainingChartState] = useState<SpecialTrainingChartSyncState | null>(null);

  const syncSpecialTrainingChartState = useCallback((payload: SpecialTrainingChartSyncState | null) => {
    setSpecialTrainingChartState((current) => {
      if (!payload) {
        return current ? null : current;
      }

      const normalizedQuestionId = String(payload.questionId || '').trim();
      const normalizedSymbol = String(payload.symbol || '').trim().toUpperCase();
      const normalizedBars = Array.isArray(payload.bars) ? payload.bars : [];
      const nextBaseTimeframeRaw = String(payload.baseTimeframe ?? '').trim().toLowerCase();
      const nextBaseTimeframe: CsvImportBaseTimeframe | null =
        nextBaseTimeframeRaw === '1m' ||
        nextBaseTimeframeRaw === '5m' ||
        nextBaseTimeframeRaw === '1h' ||
        nextBaseTimeframeRaw === '1d'
          ? (nextBaseTimeframeRaw as CsvImportBaseTimeframe)
          : null;
      if (!normalizedQuestionId || !normalizedSymbol || !normalizedBars.length) {
        return current ? null : current;
      }

      const maxIndex = Math.max(0, normalizedBars.length - 1);
      const nextCursorIndex = clamp(Math.floor(Number(payload.cursorIndex) || 0), 0, maxIndex);
      const nextWindowStartIndex = clamp(Math.floor(Number(payload.windowStartIndex) || 0), 0, nextCursorIndex);
      const nextDecisionBoundaryRawIndexRaw = Number(payload.decisionBoundaryRawIndex);
      const nextDecisionBoundaryRawIndex =
        Number.isFinite(nextDecisionBoundaryRawIndexRaw) && nextDecisionBoundaryRawIndexRaw >= 0
          ? clamp(Math.floor(nextDecisionBoundaryRawIndexRaw), 0, maxIndex)
          : -1;

      const nextDecisionMarkerRaw =
        payload.decisionMarker && typeof payload.decisionMarker === 'object' ? payload.decisionMarker : null;
      const nextDecisionMarkerSelectionRaw = String(nextDecisionMarkerRaw?.selection ?? '').trim().toUpperCase();
      const nextDecisionMarkerLabelRaw = String(nextDecisionMarkerRaw?.label ?? '').trim().toUpperCase();
      const nextDecisionMarkerDisplayTextRaw = String(nextDecisionMarkerRaw?.displayText ?? '').trim();
      const nextDecisionMarkerSelection =
        nextDecisionMarkerSelectionRaw === 'LONG' ||
        nextDecisionMarkerSelectionRaw === 'SHORT' ||
        nextDecisionMarkerSelectionRaw === 'OBSERVE'
          ? nextDecisionMarkerSelectionRaw
          : '';
      const nextDecisionMarker =
        nextDecisionMarkerSelection && nextDecisionMarkerLabelRaw && nextDecisionMarkerDisplayTextRaw
          ? {
              selection: nextDecisionMarkerSelection as 'LONG' | 'SHORT' | 'OBSERVE',
              label: nextDecisionMarkerLabelRaw.slice(0, 2),
              displayText: nextDecisionMarkerDisplayTextRaw.slice(0, 8)
            }
          : null;
      const nextTradeMarkersRaw = Array.isArray(payload.tradeMarkers) ? payload.tradeMarkers : [];
      const nextTradeMarkers = nextTradeMarkersRaw.flatMap((item) => {
        if (!item || typeof item !== 'object') {
          return [];
        }
        const rawIndex = clamp(Math.floor(Number((item as { rawIndex?: unknown }).rawIndex) || 0), 0, maxIndex);
        const price = Number((item as { price?: unknown }).price);
        const sideRaw = String((item as { side?: unknown }).side ?? '').trim().toUpperCase();
        const label = String((item as { label?: unknown }).label ?? '').trim().toUpperCase();
        if (!Number.isFinite(price) || price <= 0 || (sideRaw !== 'BUY' && sideRaw !== 'SELL') || !label) {
          return [];
        }
        return [{
          rawIndex,
          side: sideRaw as 'BUY' | 'SELL',
          price,
          label: label.slice(0, 2)
        }];
      });

      const nextFastDecisionExtremeRayRaw =
        payload.fastDecisionExtremeRay && typeof payload.fastDecisionExtremeRay === 'object'
          ? payload.fastDecisionExtremeRay
          : null;
      const nextProfitPriceRaw = Number(nextFastDecisionExtremeRayRaw?.profitPrice);
      const nextDrawdownPriceRaw = Number(nextFastDecisionExtremeRayRaw?.drawdownPrice);
      const nextBaselinePriceRaw = Number(nextFastDecisionExtremeRayRaw?.baselinePrice);
      const nextProfitRatioRaw = Number(nextFastDecisionExtremeRayRaw?.profitRatio);
      const nextDrawdownRatioRaw = Number(nextFastDecisionExtremeRayRaw?.drawdownRatio);
      const nextProfitTagText = String(nextFastDecisionExtremeRayRaw?.profitTagText ?? '').trim();
      const nextDrawdownTagText = String(nextFastDecisionExtremeRayRaw?.drawdownTagText ?? '').trim();
      const nextFastDecisionExtremeRay =
        Number.isFinite(nextProfitPriceRaw) &&
        Number.isFinite(nextDrawdownPriceRaw) &&
        Number.isFinite(nextBaselinePriceRaw) &&
        Number.isFinite(nextProfitRatioRaw) &&
        Number.isFinite(nextDrawdownRatioRaw)
          ? {
              profitPrice: nextProfitPriceRaw,
              drawdownPrice: nextDrawdownPriceRaw,
              baselinePrice: nextBaselinePriceRaw,
              profitRatio: Math.max(0, nextProfitRatioRaw),
              drawdownRatio: Math.max(0, nextDrawdownRatioRaw),
              profitTagText: nextProfitTagText,
              drawdownTagText: nextDrawdownTagText
            }
          : null;

      const nextRiskDisciplineGuidesRaw =
        payload.riskDisciplineGuides && typeof payload.riskDisciplineGuides === 'object'
          ? payload.riskDisciplineGuides
          : null;
      const nextRiskBaselinePriceRaw = Number(nextRiskDisciplineGuidesRaw?.baselinePrice);
      const nextRiskCurrentCostPriceRaw = Number(nextRiskDisciplineGuidesRaw?.currentCostPrice);
      const nextRiskBaselineTagText = String(nextRiskDisciplineGuidesRaw?.baselineTagText ?? '').trim();
      const nextRiskCurrentCostTagText = String(nextRiskDisciplineGuidesRaw?.currentCostTagText ?? '').trim();
      const nextRiskDisciplineGuides =
        Number.isFinite(nextRiskBaselinePriceRaw) ||
        Number.isFinite(nextRiskCurrentCostPriceRaw)
          ? {
              baselinePrice: Number.isFinite(nextRiskBaselinePriceRaw) ? Math.max(0, nextRiskBaselinePriceRaw) : null,
              currentCostPrice:
                Number.isFinite(nextRiskCurrentCostPriceRaw) ? Math.max(0, nextRiskCurrentCostPriceRaw) : null,
              baselineTagText: nextRiskBaselineTagText.slice(0, 16),
              currentCostTagText: nextRiskCurrentCostTagText.slice(0, 16)
            }
          : null;
      const currentTradeMarkers = current && Array.isArray(current.tradeMarkers) ? current.tradeMarkers : [];

      if (
        current &&
        current.questionId === normalizedQuestionId &&
        current.symbol === normalizedSymbol &&
        (current.baseTimeframe ?? null) === nextBaseTimeframe &&
        areChartBarsEqual(current.bars, normalizedBars) &&
        current.cursorIndex === nextCursorIndex &&
        current.windowStartIndex === nextWindowStartIndex &&
        current.decisionBoundaryRawIndex === nextDecisionBoundaryRawIndex &&
        ((current.decisionMarker === null && nextDecisionMarker === null) ||
          (current.decisionMarker !== null &&
            nextDecisionMarker !== null &&
            current.decisionMarker.selection === nextDecisionMarker.selection &&
            current.decisionMarker.label === nextDecisionMarker.label &&
            current.decisionMarker.displayText === nextDecisionMarker.displayText)) &&
        currentTradeMarkers.length === nextTradeMarkers.length &&
        currentTradeMarkers.every((marker, index) => {
          const nextMarker = nextTradeMarkers[index];
          return (
            Boolean(nextMarker) &&
            marker.rawIndex === nextMarker.rawIndex &&
            marker.side === nextMarker.side &&
            marker.price === nextMarker.price &&
            marker.label === nextMarker.label
          );
        }) &&
        ((current.fastDecisionExtremeRay === null && nextFastDecisionExtremeRay === null) ||
          (current.fastDecisionExtremeRay !== null &&
            nextFastDecisionExtremeRay !== null &&
            current.fastDecisionExtremeRay.profitPrice === nextFastDecisionExtremeRay.profitPrice &&
            current.fastDecisionExtremeRay.drawdownPrice === nextFastDecisionExtremeRay.drawdownPrice &&
            current.fastDecisionExtremeRay.baselinePrice === nextFastDecisionExtremeRay.baselinePrice &&
            current.fastDecisionExtremeRay.profitRatio === nextFastDecisionExtremeRay.profitRatio &&
            current.fastDecisionExtremeRay.drawdownRatio === nextFastDecisionExtremeRay.drawdownRatio &&
            current.fastDecisionExtremeRay.profitTagText === nextFastDecisionExtremeRay.profitTagText &&
            current.fastDecisionExtremeRay.drawdownTagText === nextFastDecisionExtremeRay.drawdownTagText)) &&
        ((current.riskDisciplineGuides === null && nextRiskDisciplineGuides === null) ||
          (current.riskDisciplineGuides !== null &&
            nextRiskDisciplineGuides !== null &&
            current.riskDisciplineGuides.baselinePrice === nextRiskDisciplineGuides.baselinePrice &&
            current.riskDisciplineGuides.currentCostPrice === nextRiskDisciplineGuides.currentCostPrice &&
            current.riskDisciplineGuides.baselineTagText === nextRiskDisciplineGuides.baselineTagText &&
            current.riskDisciplineGuides.currentCostTagText === nextRiskDisciplineGuides.currentCostTagText))
      ) {
        return current;
      }

      return {
        questionId: normalizedQuestionId,
        symbol: normalizedSymbol,
        baseTimeframe: nextBaseTimeframe,
        bars: normalizedBars,
        cursorIndex: nextCursorIndex,
        windowStartIndex: nextWindowStartIndex,
        decisionBoundaryRawIndex: nextDecisionBoundaryRawIndex,
        decisionMarker: nextDecisionMarker,
        tradeMarkers: nextTradeMarkers,
        fastDecisionExtremeRay: nextFastDecisionExtremeRay,
        riskDisciplineGuides: nextRiskDisciplineGuides
      };
    });
  }, []);

  const specialTrainingChartBaseTimeframe = useMemo<CsvImportBaseTimeframe | null>(
    () => specialTrainingChartState?.baseTimeframe ?? resolveBarsBaseTimeframe(specialTrainingChartState?.bars ?? []),
    [specialTrainingChartState]
  );

  return {
    specialTrainingChartState,
    specialTrainingChartBaseTimeframe,
    syncSpecialTrainingChartState
  };
};
