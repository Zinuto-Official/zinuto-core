// SPDX-License-Identifier: GPL-3.0-only

import type { ArchivedReplayData } from "@/domains/history/replayArchiveTypes";
import type { SpecialTrainingReplayOverlayContext } from "@/domains/chart/overlays/specialTrainingReplayOverlayTypes";
import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type { SavedDrawingOverlay } from "@/domains/chart/drawingTypes";
import { useCallback } from "react";
import { type SpecialTrainingChallengeReviewNoteRequest } from "@/domains/special-training/specialTrainingContracts";
import {
  type UiSettings
} from "@/frontend-kernel/appTypes";
import { clamp } from "@/frontend-kernel/math";
import {
  MAX_ARCHIVE_DRAWING_COUNT,
} from "@/frontend-kernel/runtimeConstants";
import { sanitizeDrawingForArchive } from "@/app-shell/appDrawingArchive";
import type {
  Account,
	  Fill,
	  Position,
  Session,
  SessionSnapshot,
} from "@/domains/training/types";
import type { useRuntimeStartupState } from "@/app-shell/runtime/runtimeStartupState";
import type { useRuntimeStartupHistoryState } from "@/app-shell/runtime/runtimeStartupHistoryState";
import type { useRuntimeStartupPersistence } from "@/app-shell/runtime/runtimeStartupPersistence";
import type { useRuntimeTrainerChartSession } from "@/app-shell/runtime/runtimeTrainerChartSession";
import type { useRuntimeTrainerMarketSettings } from "@/app-shell/runtime/runtimeTrainerMarketSettings";
import type { useRuntimeTrainerPoolChartPipeline } from "@/app-shell/runtime/runtimeTrainerPoolChartPipeline";
import type { useRuntimeTrainerChartOrchestration } from "@/app-shell/runtime/runtimeTrainerChartOrchestration";
import type { useRuntimeFreeReplaySetup } from "@/app-shell/runtime/runtimeFreeReplaySetup";
import type { useRuntimeFreeReplayExecution } from "@/app-shell/runtime/runtimeFreeReplayExecution";
import type { useRuntimeTradingSettingsAndImport } from "@/app-shell/runtime/runtimeTradingSettingsAndImport";
import type { useRuntimeDataResetNavigation } from "@/app-shell/runtime/runtimeDataResetNavigation";
type RuntimeHookScope = AppRootRuntimeProps & ReturnType<typeof useRuntimeStartupState> & ReturnType<typeof useRuntimeStartupHistoryState> & ReturnType<typeof useRuntimeStartupPersistence> & ReturnType<typeof useRuntimeTrainerChartSession> & ReturnType<typeof useRuntimeTrainerMarketSettings> & ReturnType<typeof useRuntimeTrainerPoolChartPipeline> & ReturnType<typeof useRuntimeTrainerChartOrchestration> & ReturnType<typeof useRuntimeFreeReplaySetup> & ReturnType<typeof useRuntimeFreeReplayExecution> & ReturnType<typeof useRuntimeTradingSettingsAndImport> & ReturnType<typeof useRuntimeDataResetNavigation> & Record<string, unknown>;

export type AppRootRuntimeProps = {
  initialUiSettings: UiSettings;
  initialDataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
  canPersistUiSettings: boolean;
};





export const useRuntimeSpecialTrainingReviewNote = (scope: RuntimeHookScope) => {
const { createChallengeReviewReplayNote, currentDisplayPeriodRef, drawingStoreRef, effectiveTrainingBaseTimeframe, mainNativeIndicator, mainNativeIndicatorParams, setError, signalBottomIndicator, signalBottomIndicatorParams, signalTopIndicator, signalTopIndicatorParams, specialTrainingChartBaseTimeframe, specialTrainingChartState, syncDrawingStoreFromChart, trainerDisplayPeriod, tt } = scope;
const handleCreateSpecialTrainingChallengeReviewNote = useCallback(
    (request: SpecialTrainingChallengeReviewNoteRequest) => {
      const chartState = specialTrainingChartState;
      const normalizedQuestionId = String(request.questionId || "").trim();
      const normalizedModeId = String(request.modeId || "").trim();
      const contextOverride = request.contextOverride;
      const hasContextOverride = Boolean(contextOverride) && Array.isArray(contextOverride?.bars) && contextOverride.bars.length > 0;
      if (!normalizedQuestionId || !normalizedModeId) {
        setError(tt("appText.createNote"));
        return;
      }
      if (!hasContextOverride && (!chartState || chartState.questionId !== normalizedQuestionId || !chartState.bars.length)) {
        setError(tt("appText.createNote"));
        return;
      }

      const sourceBars = hasContextOverride ? (contextOverride?.bars ?? []) : (chartState?.bars ?? []);
      const sourceTradeMarkers = hasContextOverride ? (contextOverride?.tradeMarkers ?? []) : (chartState?.tradeMarkers ?? []);
      const sourceSymbol = hasContextOverride ? String(contextOverride?.symbol || "").trim() : String(chartState?.symbol || "").trim();
      const specialTrainingOverlayContext: SpecialTrainingReplayOverlayContext | null = hasContextOverride
        ? (contextOverride?.specialTraining ?? null)
        : chartState
          ? {
              decisionBoundaryRawIndex: Number.isFinite(Number(chartState.decisionBoundaryRawIndex)) ? Number(chartState.decisionBoundaryRawIndex) : -1,
              decisionMarker: chartState.decisionMarker,
              fastDecisionExtremeRay: chartState.fastDecisionExtremeRay,
              riskDisciplineGuides: chartState.riskDisciplineGuides,
            }
          : null;

      const maxIndex = Math.max(0, sourceBars.length - 1);
      const safeCursorIndex = clamp(Math.floor(Number(hasContextOverride ? contextOverride?.cursorIndex : chartState?.cursorIndex) || 0), 0, maxIndex);
      const visibleBars = sourceBars.slice(0, safeCursorIndex + 1);
      if (!visibleBars.length) {
        setError(tt("appText.createNote"));
        return;
      }

      const archivedDrawingOverlays: SavedDrawingOverlay[] =
        chartState && chartState.bars.length
          ? (() => {
              syncDrawingStoreFromChart(currentDisplayPeriodRef.current);
              const drawingOverlays = drawingStoreRef.current
                .map((item) => sanitizeDrawingForArchive(item))
                .filter((item): item is SavedDrawingOverlay => Boolean(item));
              return drawingOverlays.length > MAX_ARCHIVE_DRAWING_COUNT
                ? drawingOverlays.slice(drawingOverlays.length - MAX_ARCHIVE_DRAWING_COUNT)
                : drawingOverlays;
            })()
          : [];

      const bindingId = `special-training:${normalizedModeId}:${normalizedQuestionId}`;
      const challengeSessionId = `special-training:${normalizedQuestionId}`;
      const safeInitialCapital = Math.max(0, Number.isFinite(Number(request.initialCapital)) ? Number(request.initialCapital) : 0);
      const finalTotalAssetValue =
        typeof request.finalTotalAsset === "number"
          ? request.finalTotalAsset
          : Number.NaN;
      const safeFinalTotalAsset = Number.isFinite(finalTotalAssetValue) ? finalTotalAssetValue : safeInitialCapital;
      const safeMaxDrawdownRatio = clamp(Number.isFinite(Number(request.maxDrawdownRatio)) ? Number(request.maxDrawdownRatio) : 0, 0, 1);
      const safePosition =
        request.position &&
        Number.isFinite(Number(request.position.qty)) &&
        Math.abs(Number(request.position.qty)) > 1e-8 &&
        Number.isFinite(Number(request.position.avgCost)) &&
        Number(request.position.avgCost) > 0 &&
        Number.isFinite(Number(request.position.markPrice)) &&
        Number(request.position.markPrice) > 0
          ? {
              qty: Number(request.position.qty),
              avgCost: Number(request.position.avgCost),
              markPrice: Number(request.position.markPrice),
            }
          : null;

      const fills: Fill[] = sourceTradeMarkers
        .filter(
          (marker) =>
            Number.isFinite(Number(marker.rawIndex)) &&
            Number(marker.rawIndex) >= 0 &&
            Number(marker.rawIndex) <= safeCursorIndex &&
            Number.isFinite(Number(marker.price)) &&
            Number(marker.price) > 0,
        )
        .map((marker, index) => {
          const fillIndex = clamp(Math.floor(Number(marker.rawIndex) || 0), 0, visibleBars.length - 1);
          const fillTime = String(visibleBars[fillIndex]?.ts || visibleBars[visibleBars.length - 1]?.ts || "");
          return {
            id: `${bindingId}-fill-${index}`,
            order_id: `${bindingId}-order-${index}`,
            session_id: challengeSessionId,
            instrument_id: bindingId,
            symbol: sourceSymbol,
            side: marker.side,
            fill_index: fillIndex,
            fill_time: fillTime,
            fill_price: Number(marker.price),
            fill_qty: 1,
            contract_multiplier: 1,
            fee: 0,
            tax: 0,
            slippage: 0,
            created_at: fillTime,
          };
        });

      const positions: Position[] = safePosition
        ? [
            {
              sessionId: challengeSessionId,
              instrumentId: bindingId,
              symbol: sourceSymbol,
              qty: safePosition.qty,
              avgCost: safePosition.avgCost,
              realizedPnl: 0,
              unrealizedPnl: (safePosition.markPrice - safePosition.avgCost) * safePosition.qty,
              totalPnl: (safePosition.markPrice - safePosition.avgCost) * safePosition.qty,
              markPrice: safePosition.markPrice,
            },
          ]
        : [];

      const accountBalance =
        safePosition && safePosition.qty > 0 ? Math.max(0, safeFinalTotalAsset - safePosition.qty * safePosition.markPrice) : safeFinalTotalAsset;
      const accounts: Account[] = [
        {
          id: `${bindingId}-account`,
          user_id: "challenge-note",
          kind: "SECURITIES",
          balance: accountBalance,
          currency: "CNY",
        },
      ];

      const overrideBaseTimeframe =
        contextOverride?.baseTimeframe === "1m" ||
        contextOverride?.baseTimeframe === "5m" ||
        contextOverride?.baseTimeframe === "1h" ||
        contextOverride?.baseTimeframe === "1d"
          ? contextOverride.baseTimeframe
          : null;
      const normalizedBaseTimeframe: BaseTimeframe =
        overrideBaseTimeframe ??
        (specialTrainingChartBaseTimeframe === "1m" ||
        specialTrainingChartBaseTimeframe === "5m" ||
        specialTrainingChartBaseTimeframe === "1h" ||
        specialTrainingChartBaseTimeframe === "1d"
          ? specialTrainingChartBaseTimeframe
          : effectiveTrainingBaseTimeframe === "1m" ||
              effectiveTrainingBaseTimeframe === "5m" ||
              effectiveTrainingBaseTimeframe === "1h" ||
              effectiveTrainingBaseTimeframe === "1d"
            ? effectiveTrainingBaseTimeframe
            : "1d");
      const createdAt = new Date().toISOString();
      const entryIndexBase =
        Number.isFinite(Number(specialTrainingOverlayContext?.decisionBoundaryRawIndex)) && Number(specialTrainingOverlayContext?.decisionBoundaryRawIndex) >= 0
          ? Number(specialTrainingOverlayContext?.decisionBoundaryRawIndex)
          : Number.isFinite(Number(chartState?.decisionBoundaryRawIndex)) && Number(chartState?.decisionBoundaryRawIndex) >= 0
            ? Number(chartState?.decisionBoundaryRawIndex)
            : Number(chartState?.windowStartIndex);
      const session: Session = {
        id: challengeSessionId,
        user_id: "challenge-note",
        instrument_id: bindingId,
        samplePoolId: bindingId,
        sourceTimeframe: normalizedBaseTimeframe,
        timeframe: normalizedBaseTimeframe,
        minimumBaseTimeframe: normalizedBaseTimeframe,
        start_index: 0,
        entry_index: clamp(Math.floor(entryIndexBase || 0), 0, visibleBars.length - 1),
        history_bars: visibleBars.length,
        cursor_index: visibleBars.length - 1,
        autoplay_interval_ms: 0,
        is_paused: 1,
        created_at: createdAt,
        symbol: sourceSymbol,
        instrumentName: null,
      };
      const snapshot: SessionSnapshot = {
        session,
        accounts,
        positions,
        fills,
        fillsTotal: fills.length,
        nextFillCursor: null,
        shortBorrowChargesTotal: 0,
        drawings: [],
      };

      const firstBarTs = String(visibleBars[0]?.ts || createdAt);
      const lastBarTs = String(visibleBars[visibleBars.length - 1]?.ts || firstBarTs);
      const drawdownAmount = safeInitialCapital * safeMaxDrawdownRatio;
      const equityCurve =
        visibleBars.length > 1
          ? [
              { ts: firstBarTs, value: safeInitialCapital },
              { ts: lastBarTs, value: safeFinalTotalAsset },
            ]
          : [{ ts: firstBarTs, value: safeFinalTotalAsset }];
      const drawdownCurve =
        visibleBars.length > 1
          ? [
              { ts: firstBarTs, value: 0 },
              { ts: lastBarTs, value: drawdownAmount },
            ]
          : [{ ts: firstBarTs, value: drawdownAmount }];

      const contextReplay: ArchivedReplayData = {
        bars: visibleBars,
        snapshot,
        drawings: archivedDrawingOverlays,
        equityCurve,
        drawdownCurve,
        finalEquity: safeFinalTotalAsset,
        equityReturnRate: safeInitialCapital > 0 ? (safeFinalTotalAsset - safeInitialCapital) / safeInitialCapital : 0,
        chartIndicators: {
          mainNativeIndicator,
          mainNativeIndicatorParams: [...mainNativeIndicatorParams],
          signalTopIndicator,
          signalTopIndicatorParams: [...signalTopIndicatorParams],
          signalBottomIndicator,
          signalBottomIndicatorParams: [...signalBottomIndicatorParams],
        },
        noteSummary: request.summaryChips.length ? { chips: request.summaryChips } : undefined,
        baseTimeframe: normalizedBaseTimeframe,
        specialTraining: specialTrainingOverlayContext,
      };

      createChallengeReviewReplayNote({
        modeId: normalizedModeId,
        trainingProjectId: bindingId,
        contextReplay,
        contextDisplayPeriod: trainerDisplayPeriod,
      });
    },
    [
      createChallengeReviewReplayNote,
      currentDisplayPeriodRef,
      effectiveTrainingBaseTimeframe,
      drawingStoreRef,
      mainNativeIndicator,
      mainNativeIndicatorParams,
      sanitizeDrawingForArchive,
      setError,
      signalBottomIndicator,
      signalBottomIndicatorParams,
      signalTopIndicator,
      signalTopIndicatorParams,
      specialTrainingChartBaseTimeframe,
      specialTrainingChartState,
      syncDrawingStoreFromChart,
      trainerDisplayPeriod,
      tt,
    ],
  );
  return { handleCreateSpecialTrainingChallengeReviewNote };
};
