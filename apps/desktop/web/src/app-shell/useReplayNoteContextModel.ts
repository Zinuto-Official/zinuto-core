// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useMemo } from 'react';
import {
  constrainReplayArchiveRecordForFrontend,
  buildBoundedReplayBarsSnapshotWindow,
} from '@/api';
import { toMarketDateKey, toMarketDateTime, toMarketDayStartMs } from '@zinuto/shared/marketTime';
import type { BaseTimeframe } from '@/domains/chart/chartPeriods';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import type {
  ReplayArchiveLike,
  ReplayBarLike,
  ReplayNoteLike,
  ReplaySnapshotLike,
  TrainingProjectLike,
  TrainingSummaryLike,
} from '@/app-shell/replayNoteDomainTypes';
import {
  compactReplaySnapshotForArchive,
  readFastDecisionReplayTitleSignals,
  readHistoryReplayTitleSignals,
  readMaxReplayPeakDropRate,
  readReplayEquityMaterial,
  readRiskDisciplineReplayTitleSignals,
} from '@/app-shell/replayNoteContextFormat';
import { resolveReplayContextPreviewBars } from '@/app-shell/replayNoteSnapshotHelpers';

type UseReplayNoteMetricsParams<
  TDisplayPeriod extends string,
  TArchive extends ReplayArchiveLike<TDisplayPeriod>,
  TReplayNote extends ReplayNoteLike<TDisplayPeriod, TArchive>
> = {
  activeTrainingRecordNote: TReplayNote | null;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values?: Array<unknown>) => string;
  samplePoolUnknownId: string;
  samplePoolUnknownName: string;
  bars: ReplayBarLike[];
  snapshot: ReplaySnapshotLike | null;
  currentTrainingBaseTimeframe: string;
  trainerDisplayPeriod: TDisplayPeriod;
  tradingInitialSecuritiesBalance: number;
  mainNativeIndicator: string;
  mainNativeIndicatorParams: number[];
  signalTopIndicator: string;
  signalTopIndicatorParams: number[];
  signalBottomIndicator: string;
  signalBottomIndicatorParams: number[];
  syncDrawingStoreFromChart: (period: TDisplayPeriod) => void;
  currentDisplayPeriodRef: React.MutableRefObject<TDisplayPeriod>;
  drawingStoreRef: React.MutableRefObject<Array<{ id?: string }>>;
  sanitizeDrawingForArchive: (input: unknown) => unknown | null;
  maxArchiveDrawingCount: number;
  sessionId: string;
};

const normalizeReplayContextPreviewArchive = <
  TDisplayPeriod extends string,
  TArchive extends ReplayArchiveLike<TDisplayPeriod>,
>(
  archive: TArchive,
): TArchive => {
  const constrained = constrainReplayArchiveRecordForFrontend(
    archive as unknown as Record<string, unknown>,
  ) as unknown as TArchive;
  if (Array.isArray(constrained.bars)) {
    return constrained;
  }
  return {
    ...constrained,
    bars: resolveReplayContextPreviewBars(constrained),
  };
};

export const useReplayNoteMetrics = <
  TDisplayPeriod extends string,
  TArchive extends ReplayArchiveLike<TDisplayPeriod>,
  TReplayNote extends ReplayNoteLike<TDisplayPeriod, TArchive>
>({
  activeTrainingRecordNote,
  tt,
  ttf,
  samplePoolUnknownId,
  samplePoolUnknownName,
  bars,
  snapshot,
  currentTrainingBaseTimeframe,
  trainerDisplayPeriod,
  tradingInitialSecuritiesBalance,
  mainNativeIndicator,
  mainNativeIndicatorParams,
  signalTopIndicator,
  signalTopIndicatorParams,
  signalBottomIndicator,
  signalBottomIndicatorParams,
  syncDrawingStoreFromChart,
  currentDisplayPeriodRef,
  drawingStoreRef,
  sanitizeDrawingForArchive,
  maxArchiveDrawingCount,
}: UseReplayNoteMetricsParams<TDisplayPeriod, TArchive, TReplayNote>) => {
  const buildTrainingRecordProjectFromNote = useCallback(
    (note: TReplayNote | null): TrainingProjectLike<TArchive> | null => {
      const replay = note?.contextReplay;
      const replayBars = resolveReplayContextPreviewBars(replay);
      if (!note || !replay || !replayBars.length || !replay.snapshot) {
        return null;
      }
      const replayPreview = normalizeReplayContextPreviewArchive(replay);
      const firstBar = replayBars[0];
      const lastBar = replayBars[replayBars.length - 1];
      const dateStart = toMarketDateKey(firstBar?.ts ?? '') || tt('appText.message0367');
      const dateEnd = toMarketDateKey(lastBar?.ts ?? '') || tt('appText.message0367');
      const startDayMs = toMarketDayStartMs(firstBar?.ts ?? '');
      const endDayMs = toMarketDayStartMs(lastBar?.ts ?? '');
      const durationDays =
        Number.isFinite(startDayMs) && Number.isFinite(endDayMs)
          ? Math.max(1, Math.floor((endDayMs - startDayMs) / (24 * 60 * 60 * 1000)) + 1)
          : 0;
      const trainingDateRange = ttf('appText.value0Value14', [dateStart || tt('appText.message0367'), dateEnd || tt('appText.message0367')]);
      const finalEquity = Number.isFinite(Number(replay.finalEquity)) ? Number(replay.finalEquity) : 0;
      const replayRate = Number(replay.equityReturnRate);
      const derivedInitialFromRate =
        Number.isFinite(replayRate) && Math.abs(1 + replayRate) > 1e-9 ? finalEquity / (1 + replayRate) : Number.NaN;
      const derivedInitialFromCurve =
        Array.isArray(replay.equityCurve) && replay.equityCurve.length ? Number(replay.equityCurve[0]?.value) : Number.NaN;
      const initialCapital = Math.max(
        0,
        Number.isFinite(derivedInitialFromRate)
          ? derivedInitialFromRate
          : Number.isFinite(derivedInitialFromCurve)
            ? derivedInitialFromCurve
            : finalEquity
      );
      const totalPnl = finalEquity - initialCapital;
      const drawdownAmount = (Array.isArray(replay.drawdownCurve) ? replay.drawdownCurve : []).reduce((max, item) => {
        const value = Number(item?.value);
        return Number.isFinite(value) ? Math.max(max, value) : max;
      }, 0);
      const normalizedEquityCurve = (Array.isArray(replay.equityCurve) ? replay.equityCurve : []).map((point, index) => ({
        ts: String(point?.ts ?? index),
        value: Number.isFinite(Number(point?.value)) ? Number(point?.value) : 0
      }));
      const drawdownRate = readMaxReplayPeakDropRate(normalizedEquityCurve);
      const fills = Array.isArray(replay.snapshot.fills) ? replay.snapshot.fills : [];
      const buyCount = fills.filter((fill) => fill.side === 'BUY').length;
      const sellCount = fills.filter((fill) => fill.side === 'SELL').length;
      const investedAmount = fills.reduce((sum, fill) => {
        const price = Number(fill?.fill_price);
        const qty = Number(fill?.fill_qty);
        const contractMultiplier = Number(fill?.contract_multiplier);
        if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) {
          return sum;
        }
        return sum + price * qty * (Number.isFinite(contractMultiplier) && contractMultiplier > 0 ? contractMultiplier : 1);
      }, 0);
      const tradingCostFromFills = fills.reduce((sum, fill) => {
        const fee = Number(fill?.fee);
        const tax = Number(fill?.tax);
        const slippage = Number(fill?.slippage);
        const cost =
          (Number.isFinite(fee) ? fee : 0) +
          (Number.isFinite(tax) ? tax : 0) +
          (Number.isFinite(slippage) ? slippage : 0);
        return sum + Math.max(0, cost);
      }, 0);
      const cashAdjustmentCost = Array.isArray((replay.snapshot as { cashAdjustments?: unknown }).cashAdjustments)
        ? ((replay.snapshot as { cashAdjustments?: Array<{ amount?: unknown }> }).cashAdjustments ?? []).reduce<number>((sum, adjustment) => {
            const amount = Number(adjustment?.amount);
            return sum + (Number.isFinite(amount) ? amount : 0);
          }, 0)
        : [replay.snapshot.shortBorrowChargesTotal, replay.snapshot.longFinancingChargesTotal].reduce<number>((sum, amount) => {
            const normalizedAmount = Number(amount);
            return sum + (Number.isFinite(normalizedAmount) ? normalizedAmount : 0);
          }, 0);
      const tradingCost = tradingCostFromFills + cashAdjustmentCost;
      const openPositionUnrealizedPnl = Array.isArray(replay.snapshot.positions)
        ? replay.snapshot.positions.reduce((sum, position) => {
            const unrealized = Number(position?.unrealizedPnl);
            return sum + (Number.isFinite(unrealized) ? unrealized : 0);
          }, 0)
        : 0;
      const unrealizedPnl = Number.isFinite(openPositionUnrealizedPnl) ? openPositionUnrealizedPnl : 0;
      const realizedPnl = totalPnl - unrealizedPnl;
      const summary: TrainingSummaryLike = {
        initialAsset: initialCapital,
        endingAsset: finalEquity,
        assetReturnRate: initialCapital > 0 ? totalPnl / initialCapital : 0,
        durationDays,
        startDate: dateStart || null,
        endDate: dateEnd || null,
        buyCount,
        sellCount,
        totalTrades: fills.length,
        investedAmount,
        tradingCost,
        realizedPnl,
        unrealizedPnl,
        totalPnl,
        profitRate: initialCapital > 0 ? totalPnl / initialCapital : 0,
        maxDrawdownRate: drawdownRate,
        maxDrawdownAmount: drawdownAmount
      };
      return {
        id: `note-context-${note.id}`,
        name: note.title,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        initialTotal: initialCapital,
        totalPnl,
        profitRate: summary.profitRate,
        durationDays: summary.durationDays,
        totalTrades: summary.totalTrades,
        symbol: (replay.snapshot.session.symbol || '').trim().toUpperCase(),
        samplePoolId: samplePoolUnknownId,
        samplePoolName: samplePoolUnknownName,
        baseTimeframe: (replay.baseTimeframe || '').trim().toLowerCase() || 'unknown',
        trainingDateRange,
        summary,
        finalEquity,
        equityReturnRate: summary.assetReturnRate,
        replay: replayPreview
      };
    },
    [samplePoolUnknownId, samplePoolUnknownName, tt, ttf]
  );

  const activeTrainingRecordProject = useMemo<TrainingProjectLike<TArchive> | null>(
    () => buildTrainingRecordProjectFromNote(activeTrainingRecordNote),
    [activeTrainingRecordNote, buildTrainingRecordProjectFromNote]
  );

  const buildTrainingRecordContextReplay = useCallback((): TArchive | null => {
    if (!snapshot || !bars.length) {
      return null;
    }
    syncDrawingStoreFromChart(currentDisplayPeriodRef.current);

    const drawingOverlays = drawingStoreRef.current
      .map((item) => sanitizeDrawingForArchive(item))
      .filter((item): item is Record<string, unknown> => Boolean(item));

    const archivedDrawingOverlays =
      drawingOverlays.length > maxArchiveDrawingCount
        ? drawingOverlays.slice(drawingOverlays.length - maxArchiveDrawingCount)
        : drawingOverlays;

    const replayBase = buildBoundedReplayBarsSnapshotWindow(bars, snapshot);
    if (!replayBase) {
      return null;
    }

    const compactSnapshot = compactReplaySnapshotForArchive(
      replayBase.snapshot as unknown as ReplaySnapshotLike,
    ) as unknown as ReplaySnapshotLike;
    const initialCapital = Math.max(0, Number(tradingInitialSecuritiesBalance) || 0);
    const metrics = readReplayEquityMaterial(
      initialCapital,
      replayBase.bars,
      compactSnapshot,
    );
    const normalizedBaseTimeframe: BaseTimeframe =
      currentTrainingBaseTimeframe === '1m' ||
      currentTrainingBaseTimeframe === '5m' ||
      currentTrainingBaseTimeframe === '1h' ||
      currentTrainingBaseTimeframe === '1d'
        ? currentTrainingBaseTimeframe
        : '1d';

    return {
      bars: replayBase.bars,
      snapshot: compactSnapshot,
      drawings: archivedDrawingOverlays,
      equityCurve: metrics.equityCurve,
      drawdownCurve: metrics.drawdownCurve,
      finalEquity: metrics.finalEquity,
      equityReturnRate: metrics.equityReturnRate,
      chartIndicators: {
        mainNativeIndicator,
        mainNativeIndicatorParams: [...mainNativeIndicatorParams],
        signalTopIndicator,
        signalTopIndicatorParams: [...signalTopIndicatorParams],
        signalBottomIndicator,
        signalBottomIndicatorParams: [...signalBottomIndicatorParams]
      },
      baseTimeframe: normalizedBaseTimeframe,
      displayPeriod: trainerDisplayPeriod,
      barWindow: replayBase.window
    } as unknown as TArchive;
  }, [
    bars,
    currentDisplayPeriodRef,
    currentTrainingBaseTimeframe,
    drawingStoreRef,
    mainNativeIndicator,
    mainNativeIndicatorParams,
    maxArchiveDrawingCount,
    sanitizeDrawingForArchive,
    signalBottomIndicator,
    signalBottomIndicatorParams,
    signalTopIndicator,
    signalTopIndicatorParams,
    snapshot,
    syncDrawingStoreFromChart,
    tradingInitialSecuritiesBalance,
    trainerDisplayPeriod
  ]);

  const readFastDecisionTitleSignals = useCallback(
    (archive: TArchive | null) =>
      readFastDecisionReplayTitleSignals(
        archive as { noteSummary?: unknown } | null,
      ),
    [],
  );

  const readRiskDisciplineTitleSignals = useCallback(
    (archive: TArchive | null) =>
      readRiskDisciplineReplayTitleSignals(
        archive as { noteSummary?: unknown } | null,
      ),
    [],
  );

  const readHistoryTitleSignals = useCallback(
    (archive: TArchive | null) =>
      readHistoryReplayTitleSignals(
        archive as { tradeRounds?: unknown } | null,
      ),
    [],
  );

  const formatReplayNoteTime = useCallback(
    (isoText: string) => {
      const formatted = toMarketDateTime(isoText);
      return formatted || tt('appText.message0367');
    },
    [tt]
  );

  return {
    buildTrainingRecordProjectFromNote,
    activeTrainingRecordProject,
    buildTrainingRecordContextReplay,
    deriveHistoryReviewMetrics: readHistoryTitleSignals,
    deriveFastDecisionTitleMetrics: readFastDecisionTitleSignals,
    deriveRiskDisciplineTitleMetrics: readRiskDisciplineTitleSignals,
    formatReplayNoteTime,
  };
};
