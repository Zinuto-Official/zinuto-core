// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from 'react';
import { tt, ttf } from '@/frontend-kernel/i18n/messageRuntime';
import { countDateKeysBetween, toTimeZoneDateKey } from '@zinuto/shared/timezone';
import type { BaseTimeframe } from '@zinuto/shared/timeframe';
import type {
  TrainerLeverageExposureSummary,
  TrainerSessionSummaryFacts,
} from '@/domains/training/types';
import {
  formatCalendarSpanText,
  formatReplaySpanText,
  resolveBaseTimeframeDurationMs,
} from '@/domains/trainer/replaySpanDisplay';
import {
  resolveReplayBarDisplayIndex,
  resolveReplayBarLocalIndexForRawIndex,
} from '@/domains/trainer/marketFrameStore';

type BarLike = {
  ts: string;
  close: number;
  displayIndex?: number;
  startRawIndex?: number;
  endRawIndex?: number;
};

type SnapshotLike = {
  session: {
    symbol: string;
    cursor_index: number;
    entry_index: number;
    timeZone?: string | null;
  };
  accounts: Array<{
    kind: string;
    balance: number;
  }>;
  actionState?: {
    summary?: TrainerSessionSummaryFacts;
    readModel?: {
      summary?: TrainerSessionSummaryFacts;
    };
  } | null;
};

type UseTrainerWorkspaceViewModelArgs = {
  bars: BarLike[];
  barsOffset: number;
  barsTotal: number;
  snapshot: SnapshotLike | null;
  selectedSymbol: string;
  instrumentMetaMap: Map<string, { barCount: number }>;
  baseTimeframe: BaseTimeframe;
  uiRemainingLabel: string;
  uiKlineUnitLabel: string;
  formatMoney: (value: number, digits?: number) => string;
  language: string;
};

const EMPTY_LEVERAGE_EXPOSURE_SUMMARY: TrainerLeverageExposureSummary = {
  isActive: false,
  isConfigured: false,
  allowLongMarginTrading: false,
  allowShortSelling: false,
  holdingStartDate: null,
  holdingEndDate: null,
  longFinancingFee: 0,
  cumulativeLongFinancingFee: 0,
  shortAmount: 0,
  shortFee: 0,
  cumulativeShortFee: 0,
  totalFee: 0,
  shortQty: 0,
  shortAmountRatio: 0,
  shortQtyRatio: 0,
};

const resolveBackendSummary = (
  snapshot: SnapshotLike | null,
): TrainerSessionSummaryFacts | null =>
  snapshot?.actionState?.summary ??
  snapshot?.actionState?.readModel?.summary ??
  null;

export const useTrainerWorkspaceViewModel = ({
  bars,
  barsOffset,
  barsTotal,
  snapshot,
  selectedSymbol,
  instrumentMetaMap,
  baseTimeframe,
  uiRemainingLabel,
  uiKlineUnitLabel,
  formatMoney,
  language
}: UseTrainerWorkspaceViewModelArgs) => {
  const sessionTimeZone = snapshot?.session.timeZone ?? undefined;
  const backendSummary = resolveBackendSummary(snapshot);
  const securitiesAccount = useMemo(
    () => snapshot?.accounts.find((item) => item.kind === 'SECURITIES') ?? null,
    [snapshot]
  );

  const currentTradingFee = backendSummary?.currentTradingFee ?? 0;
  const positionMarketValue = backendSummary?.positionMarketValue ?? 0;
  const securitiesTotal = backendSummary?.securitiesTotal ?? securitiesAccount?.balance ?? 0;
  const securitiesDelta = backendSummary?.securitiesDelta ?? 0;
  const cumulativePnlRate = backendSummary?.cumulativePnlRate ?? 0;
  const floatingRate = backendSummary?.floatingRate ?? 0;
  const leverageExposureSummary =
    backendSummary?.leverageExposureSummary ?? EMPTY_LEVERAGE_EXPOSURE_SUMMARY;

  const spanDisplayLabels = useMemo(
    () => ({
      empty: tt('appText.message0367'),
      minute: tt('appText.message0835'),
      hour: tt('appText.message0836'),
      day: tt('appText.message0837'),
    }),
    [language],
  );

  const spanBaseDurationMs = useMemo(
    () => resolveBaseTimeframeDurationMs(baseTimeframe),
    [baseTimeframe],
  );

  const trainingDays = useMemo(() => {
    if (backendSummary) {
      return backendSummary.trainingDays;
    }
    if (!snapshot || !bars.length) {
      return 0;
    }
    const cursorIndex = resolveReplayBarLocalIndexForRawIndex(
      bars,
      snapshot.session.cursor_index,
    );
    const cursorBar = bars[cursorIndex];
    if (!cursorBar) {
      return 0;
    }

    const currentDateKey = toTimeZoneDateKey(cursorBar.ts, sessionTimeZone);
    if (!currentDateKey) {
      return 0;
    }

    const entryIndex = resolveReplayBarLocalIndexForRawIndex(
      bars,
      snapshot.session.entry_index,
    );
    const entryBar = bars[entryIndex];
    if (!entryBar) {
      return 0;
    }
    const startDateKey = toTimeZoneDateKey(entryBar.ts, sessionTimeZone);
    if (!startDateKey) {
      return 0;
    }

    const raw = countDateKeysBetween(startDateKey, currentDateKey) + 1;
    if (!Number.isFinite(raw)) {
      return 0;
    }
    return Math.max(1, raw);
  }, [backendSummary, bars, sessionTimeZone, snapshot]);

  const trainingDateRange = useMemo(() => {
    const backendRange = backendSummary?.trainingDateRange;
    if (backendRange) {
      return ttf('appText.value0Value14', [
        backendRange.startDateKey || tt('appText.message0367'),
        backendRange.endDateKey || tt('appText.message0367'),
      ]);
    }
    if (!snapshot || !bars.length) {
      return tt('appText.message0369');
    }
    const startIndex = resolveReplayBarLocalIndexForRawIndex(
      bars,
      snapshot.session.entry_index,
    );
    const endIndex = resolveReplayBarLocalIndexForRawIndex(
      bars,
      snapshot.session.cursor_index,
    );
    const start = toTimeZoneDateKey(bars[startIndex]?.ts ?? '', sessionTimeZone) || tt('appText.message0367');
    const end = toTimeZoneDateKey(bars[endIndex]?.ts ?? '', sessionTimeZone) || tt('appText.message0367');
    return ttf('appText.value0Value14', [start, end]);
  }, [backendSummary, bars, language, sessionTimeZone, snapshot]);

  const calendarSpanText = useMemo(() => {
    if (!snapshot || !bars.length) {
      return spanDisplayLabels.empty;
    }
    const startIndex = resolveReplayBarLocalIndexForRawIndex(
      bars,
      snapshot.session.entry_index,
    );
    const endIndex = resolveReplayBarLocalIndexForRawIndex(
      bars,
      snapshot.session.cursor_index,
    );
    return formatCalendarSpanText({
      startTimestamp: bars[startIndex]?.ts ?? '',
      endTimestamp: bars[endIndex]?.ts ?? '',
      baseTimeframe,
      timeZone: sessionTimeZone,
      labels: spanDisplayLabels,
    });
  }, [bars, baseTimeframe, sessionTimeZone, snapshot, spanDisplayLabels]);

  const replaySpanText = useMemo(() => {
    if (!snapshot || !bars.length) {
      return spanDisplayLabels.empty;
    }
    const startIndex = resolveReplayBarLocalIndexForRawIndex(
      bars,
      snapshot.session.entry_index,
    );
    const endIndex = resolveReplayBarLocalIndexForRawIndex(
      bars,
      snapshot.session.cursor_index,
    );
    const progressedBars = Math.max(1, endIndex - startIndex + 1);
    return formatReplaySpanText({
      durationMs: progressedBars * spanBaseDurationMs,
      minimumMs: spanBaseDurationMs,
      labels: spanDisplayLabels,
    });
  }, [bars, snapshot, spanBaseDurationMs, spanDisplayLabels]);

  const selectedSymbolUpper = (selectedSymbol || snapshot?.session.symbol || '').trim().toUpperCase();

  const selectedSymbolBarCount = useMemo(() => {
    const backendCount = Number(backendSummary?.selectedSymbolBarCount ?? 0);
    if (backendCount > 0) {
      return backendCount;
    }
    if (barsTotal > 0) {
      return barsTotal;
    }
    if (!selectedSymbolUpper) {
      return 0;
    }
    const fromMeta = instrumentMetaMap.get(selectedSymbolUpper)?.barCount ?? 0;
    return fromMeta > 0 ? fromMeta : bars.length;
  }, [backendSummary?.selectedSymbolBarCount, bars.length, barsTotal, instrumentMetaMap, selectedSymbolUpper]);

  const klineProgressData = useMemo(() => {
    if (backendSummary?.klineProgress) {
      return backendSummary.klineProgress;
    }
    if (!snapshot || !bars.length) {
      return {
        current: 0,
        total: 0,
        remaining: 0
      };
    }
    const totalBars = selectedSymbolBarCount;
    if (totalBars <= 0) {
      return {
        current: 0,
        total: 0,
        remaining: 0
      };
    }
    const entryLocalIndex = resolveReplayBarLocalIndexForRawIndex(
      bars,
      snapshot.session.entry_index,
    );
    const cursorLocalIndex = resolveReplayBarLocalIndexForRawIndex(
      bars,
      snapshot.session.cursor_index,
    );
    if (entryLocalIndex < 0 || cursorLocalIndex < 0) {
      return {
        current: 0,
        total: 0,
        remaining: 0
      };
    }
    const maxDisplayIndex = Math.max(0, totalBars - 1);
    const entryDisplayIndex = Math.min(
      resolveReplayBarDisplayIndex(bars[entryLocalIndex], entryLocalIndex, barsOffset),
      maxDisplayIndex,
    );
    const cursorDisplayIndex = Math.min(
      resolveReplayBarDisplayIndex(bars[cursorLocalIndex], cursorLocalIndex, barsOffset),
      maxDisplayIndex,
    );
    const total = Math.max(1, totalBars - entryDisplayIndex);
    const current = Math.max(1, Math.min(cursorDisplayIndex - entryDisplayIndex + 1, total));
    const remaining = Math.max(0, total - current);
    return { current, total, remaining };
  }, [backendSummary, bars, barsOffset, selectedSymbolBarCount, snapshot]);

  const klineRemainingLine = useMemo(
    () => `${uiRemainingLabel} ${formatMoney(klineProgressData.remaining, 0)} ${uiKlineUnitLabel}`,
    [klineProgressData.remaining, uiKlineUnitLabel, uiRemainingLabel, formatMoney]
  );

  return {
    securitiesAccount,
    currentTradingFee,
    cumulativePnlRate,
    positionMarketValue,
    securitiesTotal,
    securitiesDelta,
    floatingRate,
    leverageExposureSummary,
    trainingDays,
    trainingDateRange,
    calendarSpanText,
    replaySpanText,
    selectedSymbolUpper,
    selectedSymbolBarCount,
    klineProgressData,
    klineRemainingLine
  };
};
