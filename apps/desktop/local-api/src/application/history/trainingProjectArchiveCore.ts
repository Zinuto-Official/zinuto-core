// SPDX-License-Identifier: GPL-3.0-only

import type { PriceMode } from '../../domain/models.js';
import { appError } from '../../kernel/appError.js';
import { createId } from '../../kernel/id.js';
import { runtimeLimits } from '../../kernel/runtimeLimits.js';
import { nowIso } from '../../kernel/time.js';
import {
  type ArchiveCashAdjustmentRow,
  type ArchiveReplayFill,
  listArchiveCashAdjustmentRows,
  listArchiveSessionFills,
} from '../ports/infrastructure/db/history/historyStore.js';
import {
  getReplayArchiveBarsByInstrumentIdRawRange as getReplayArchiveBarsByInstrumentIdRawRangeInternal,
  getSessionSnapshot as getSessionSnapshotInternal,
} from '../trading/core.js';
import { calculateTradingCostBreakdown } from '../../domain/trading/feeModel.js';
import { resolveContractMultiplier } from '../../domain/trading/orderSizing.js';
import {
  getReplayArchiveBarsByInstrumentIdRawRange,
  getSessionSnapshot,
  getTradingSettings,
} from '../trading/sessionService.js';
import { normalizeTradingExecutionSettings } from '../trading/sessionTradingSettings.js';
import {
  buildTrainingReviewProjectionMetrics,
  type TrainingReviewProjectionMetrics,
} from '../../domain/training/reviewProjection.js';
import { normalizeTrainingSummary, type TrainingSummaryPayload } from '../../domain/training/summary.js';
import {
  clamp,
  normalizeArchiveSourceBar,
  normalizeArchivedBaseTimeframe,
  normalizeArchivedDisplayPeriod,
  normalizeNumber,
  round,
  type ArchiveCashAdjustment,
  type ArchiveSourceBar,
  type ArchivedBaseTimeframe,
  type ArchivedDisplayPeriod,
  type ReplayBar,
  type ReplayCurvePoint,
  type SessionPositionForArchive,
  type SessionSnapshotForArchive,
} from './trainingProjectArchiveModels.js';
import { parseTimestampMs, toMarketDateKey } from '@zinuto/shared/marketTime';
import {
  calculateReplayEquityMetrics,
  compactReplayFillsForArchive,
  deriveReplayTradeRounds,
} from '@zinuto/shared/replay';
import { isPriceMode } from '@zinuto/shared/trading';

export type { ArchivedBaseTimeframe, ArchivedDisplayPeriod, ReplayCurvePoint } from './trainingProjectArchiveModels.js';

const ARCHIVE_REPLAY_MAX_FILLS = runtimeLimits.archiveReplayFillsMax;
const ARCHIVE_DRAWING_COUNT_MAX = runtimeLimits.archiveDrawingCountMax;
const ARCHIVE_TEXT_CHARS_MAX = runtimeLimits.archiveTextCharsMax;
const POSITION_EPSILON = 1e-8;

export const resolveArchiveFinalizePriceMode = (value: unknown): PriceMode | null =>
  isPriceMode(value) ? value : null;

const resolveTrainingDateRangeFromBars = (bars: ReplayBar[]): string => {
  const firstTs = typeof bars[0]?.ts === 'string' ? bars[0].ts : '';
  const lastTs = typeof bars[bars.length - 1]?.ts === 'string' ? bars[bars.length - 1].ts : '';
  const firstDate = firstTs ? toMarketDateKey(parseTimestampMs(firstTs)) : '';
  const lastDate = lastTs ? toMarketDateKey(parseTimestampMs(lastTs)) : '';
  if (firstDate && lastDate) {
    return `${firstDate} ~ ${lastDate}`;
  }
  return firstDate || lastDate || '';
};

const resolveReplayBarDateKey = (bar: ReplayBar | undefined): string => {
  const rawTs = typeof bar?.ts === 'string' ? bar.ts.trim() : '';
  if (!rawTs) {
    return '';
  }
  const parsed = parseTimestampMs(rawTs);
  if (Number.isFinite(parsed)) {
    return toMarketDateKey(parsed);
  }
  return rawTs.slice(0, 10);
};

const resolveAdjustmentTargetDay = (row: ArchiveCashAdjustmentRow): string => {
  const accrualDay = typeof row.accrualDay === 'string' ? row.accrualDay.trim() : '';
  if (accrualDay) {
    return accrualDay;
  }
  const accrualTime = typeof row.accrualTime === 'string' ? row.accrualTime.trim() : '';
  const parsed = parseTimestampMs(accrualTime);
  return Number.isFinite(parsed) ? toMarketDateKey(parsed) : accrualTime.slice(0, 10);
};

const resolveCashAdjustmentBarIndex = (
  bars: ReplayBar[],
  row: ArchiveCashAdjustmentRow,
): number | null => {
  if (!bars.length) {
    return null;
  }
  const targetDay = resolveAdjustmentTargetDay(row);
  if (!targetDay) {
    return bars.length - 1;
  }
  let fallbackIndex = bars.length - 1;
  for (let index = 0; index < bars.length; index += 1) {
    const barDay = resolveReplayBarDateKey(bars[index]);
    if (!barDay) {
      continue;
    }
    if (barDay === targetDay) {
      return index;
    }
    if (barDay > targetDay) {
      fallbackIndex = index;
      break;
    }
  }
  return fallbackIndex;
};

const readArchiveCashAdjustments = (
  sessionId: string,
  bars: ReplayBar[],
): ArchiveCashAdjustment[] => {
  if (!sessionId || !bars.length) {
    return [];
  }
  const rows = listArchiveCashAdjustmentRows(sessionId);

  return rows
    .map((row): ArchiveCashAdjustment | null => {
      const amount = normalizeNumber(row.amount, Number.NaN);
      if (!Number.isFinite(amount) || Math.abs(amount) <= POSITION_EPSILON) {
        return null;
      }
      const barIndex = resolveCashAdjustmentBarIndex(bars, row);
      if (barIndex === null) {
        return null;
      }
      const ts = String(row.accrualTime || '').trim() || bars[barIndex]?.ts || '';
      return {
        kind: row.kind,
        bar_index: barIndex,
        amount: round(amount, 6),
        ts,
        created_at: String(row.createdAt || '').trim() || ts || nowIso(),
      };
    })
    .filter((item): item is ArchiveCashAdjustment => Boolean(item));
};

const normalizeArchiveCashAdjustments = (value: unknown): ArchiveCashAdjustment[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item): ArchiveCashAdjustment | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const source = item as Record<string, unknown>;
      const amount = normalizeNumber(source.amount, Number.NaN);
      const barIndex = Math.max(
        0,
        Math.floor(normalizeNumber(source.bar_index ?? source.barIndex, Number.NaN)),
      );
      if (!Number.isFinite(amount) || Math.abs(amount) <= POSITION_EPSILON || !Number.isFinite(barIndex)) {
        return null;
      }
      const kind = source.kind === 'SHORT_BORROW' ? 'SHORT_BORROW' : 'LONG_FINANCING';
      const ts = typeof source.ts === 'string' ? source.ts.trim() : '';
      const createdAt =
        typeof source.created_at === 'string'
          ? source.created_at.trim()
          : typeof source.createdAt === 'string'
            ? source.createdAt.trim()
            : ts;
      return {
        kind,
        bar_index: barIndex,
        amount: round(amount, 6),
        ts,
        created_at: createdAt || ts || nowIso(),
      };
    })
    .filter((item): item is ArchiveCashAdjustment => Boolean(item));
};

const sumArchiveCashAdjustmentAmounts = (snapshot: SessionSnapshotForArchive): number =>
  normalizeArchiveCashAdjustments((snapshot as { cashAdjustments?: unknown }).cashAdjustments)
    .reduce((sum, item) => sum + item.amount, 0);

const calcMaxDrawdownRateFromEquityCurve = (equityCurve: ReplayCurvePoint[]): number => {
  let peak = Number.NEGATIVE_INFINITY;
  let maxDrawdownRate = 0;
  equityCurve.forEach((point) => {
    const value = normalizeNumber(point?.value, Number.NaN);
    if (!Number.isFinite(value)) {
      return;
    }
    if (value > peak) {
      peak = value;
      return;
    }
    if (peak <= 0) {
      return;
    }
    maxDrawdownRate = Math.max(maxDrawdownRate, (peak - value) / peak);
  });
  return maxDrawdownRate;
};

const resolveSnapshotUnrealizedPnl = (snapshot: SessionSnapshotForArchive): number => {
  const positions = Array.isArray(snapshot.positions) ? snapshot.positions : [];
  return positions.reduce((sum, item) => {
    if (!item || typeof item !== 'object') {
      return sum;
    }
    const source = item as Record<string, unknown>;
    const qty = normalizeNumber(source.qty, Number.NaN);
    if (!Number.isFinite(qty) || Math.abs(qty) <= POSITION_EPSILON) {
      return sum;
    }
    const explicitUnrealizedPnl = normalizeNumber(source.unrealizedPnl, Number.NaN);
    if (Number.isFinite(explicitUnrealizedPnl)) {
      return sum + explicitUnrealizedPnl;
    }
    const avgCost = normalizeNumber(source.avgCost, Number.NaN);
    const markPrice = normalizeNumber(source.markPrice, Number.NaN);
    if (!Number.isFinite(avgCost) || !Number.isFinite(markPrice)) {
      return sum;
    }
    const contractMultiplier = Math.max(
      Number.EPSILON,
      normalizeNumber(source.contractMultiplier ?? source.contract_multiplier, 1),
    );
    return sum + qty * (markPrice - avgCost) * contractMultiplier;
  }, 0);
};

const buildTrainingSummaryFromReplayArchive = (input: {
  initialCapital: number;
  bars: ReplayBar[];
  snapshot: SessionSnapshotForArchive;
  equityCurve: ReplayCurvePoint[];
  drawdownCurve: ReplayCurvePoint[];
  finalEquity: number;
  equityReturnRate: number;
}): TrainingSummaryPayload => {
  const initialCapital = Math.max(0, normalizeNumber(input.initialCapital));
  const bars = Array.isArray(input.bars) ? input.bars : [];
  const fills = Array.isArray(input.snapshot?.fills) ? input.snapshot.fills : [];
  const firstTs = typeof bars[0]?.ts === 'string' ? bars[0].ts : '';
  const lastTs =
    typeof bars[bars.length - 1]?.ts === 'string' ? bars[bars.length - 1].ts : '';
  const firstMs = parseTimestampMs(firstTs);
  const lastMs = parseTimestampMs(lastTs);
  const durationDays =
    Number.isFinite(firstMs) && Number.isFinite(lastMs)
      ? Math.max(1, Math.floor((lastMs - firstMs) / (24 * 60 * 60 * 1000)) + 1)
      : 0;
  const finalEquity = normalizeNumber(input.finalEquity, initialCapital);
  const totalPnl = finalEquity - initialCapital;
  const unrealizedPnl = resolveSnapshotUnrealizedPnl(input.snapshot);
  const realizedPnl = totalPnl - unrealizedPnl;
  const investedAmount = fills.reduce((sum, fill) => {
    const price = normalizeNumber(fill?.fill_price, Number.NaN);
    const qty = normalizeNumber(fill?.fill_qty, Number.NaN);
    const contractMultiplier = Math.max(Number.EPSILON, normalizeNumber(fill?.contract_multiplier, 1));
    if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) {
      return sum;
    }
    return sum + price * qty * contractMultiplier;
  }, 0);
  const tradingCostFromFills = fills.reduce((sum, fill) => {
    const fee = normalizeNumber(fill?.fee, 0);
    const tax = normalizeNumber(fill?.tax, 0);
    const slippage = normalizeNumber(fill?.slippage, 0);
    return sum + Math.max(0, fee + tax + slippage);
  }, 0);
  const tradingCost = tradingCostFromFills + sumArchiveCashAdjustmentAmounts(input.snapshot);
  const maxDrawdownAmount = (Array.isArray(input.drawdownCurve) ? input.drawdownCurve : []).reduce(
    (max, point) => Math.max(max, normalizeNumber(point?.value, 0)),
    0,
  );
  const maxDrawdownRate = calcMaxDrawdownRateFromEquityCurve(input.equityCurve);

  return normalizeTrainingSummary({
    initialAsset: initialCapital,
    endingAsset: finalEquity,
    assetReturnRate: normalizeNumber(input.equityReturnRate, initialCapital > 0 ? totalPnl / initialCapital : 0),
    durationDays,
    startDate: Number.isFinite(firstMs) ? toMarketDateKey(firstMs) : null,
    endDate: Number.isFinite(lastMs) ? toMarketDateKey(lastMs) : null,
    buyCount: fills.filter((fill) => fill?.side === 'BUY').length,
    sellCount: fills.filter((fill) => fill?.side === 'SELL').length,
    totalTrades: fills.length,
    investedAmount,
    tradingCost,
    realizedPnl,
    unrealizedPnl,
    totalPnl,
    profitRate: initialCapital > 0 ? totalPnl / initialCapital : 0,
    maxDrawdownRate,
    maxDrawdownAmount,
    decisionSecondsUsed: 0,
    decisionCount: 0,
  });
};

const normalizeSessionPositionForArchive = (
  value: unknown,
  fallbackSessionId: string,
  fallbackInstrumentId: string,
  fallbackSymbol: string,
): SessionPositionForArchive | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const source = value as Record<string, unknown>;
  const qty = normalizeNumber(source.qty, Number.NaN);
  if (!Number.isFinite(qty) || Math.abs(qty) <= POSITION_EPSILON) {
    return null;
  }
  const sessionId = typeof source.sessionId === 'string' && source.sessionId.trim() ? source.sessionId : fallbackSessionId;
  const instrumentId =
    typeof source.instrumentId === 'string' && source.instrumentId.trim() ? source.instrumentId : fallbackInstrumentId;
  const symbol = typeof source.symbol === 'string' && source.symbol.trim() ? source.symbol : fallbackSymbol;
  if (!sessionId || !instrumentId) {
    return null;
  }
  return {
    sessionId,
    instrumentId,
    symbol,
    qty,
  };
};

const resolveArchiveForcedFillTarget = (
  bars: ReplayBar[],
  cursorIndexRaw: number,
  priceMode: PriceMode,
): { fillIndex: number; fillTime: string; fillPrice: number } | null => {
  if (!bars.length) {
    return null;
  }
  const cursorIndex = clamp(Math.floor(normalizeNumber(cursorIndexRaw, 0)), 0, bars.length - 1);
  const currentBar = bars[cursorIndex];
  if (!currentBar) {
    return null;
  }
  if (priceMode === 'NEXT_OPEN' && cursorIndex + 1 < bars.length) {
    const nextBar = bars[cursorIndex + 1];
    if (nextBar) {
      const nextOpen = normalizeNumber(nextBar.open, Number.NaN);
      if (Number.isFinite(nextOpen) && nextOpen > POSITION_EPSILON) {
        return {
          fillIndex: cursorIndex + 1,
          fillTime: nextBar.ts || nowIso(),
          fillPrice: nextOpen,
        };
      }
    }
  }
  const closePrice = normalizeNumber(currentBar.close, Number.NaN);
  if (Number.isFinite(closePrice) && closePrice > POSITION_EPSILON) {
    return {
      fillIndex: cursorIndex,
      fillTime: currentBar.ts || nowIso(),
      fillPrice: closePrice,
    };
  }
  const openPrice = normalizeNumber(currentBar.open, Number.NaN);
  if (Number.isFinite(openPrice) && openPrice > POSITION_EPSILON) {
    return {
      fillIndex: cursorIndex,
      fillTime: currentBar.ts || nowIso(),
      fillPrice: openPrice,
    };
  }
  return null;
};

const appendForcedLiquidationFillsForArchive = (
  snapshot: SessionSnapshotForArchive,
  bars: ReplayBar[],
  priceMode: PriceMode,
): SessionSnapshotForArchive => {
  const sessionRecord = snapshot?.session;
  if (!sessionRecord || typeof sessionRecord !== 'object') {
    return snapshot;
  }
  const sessionId = typeof sessionRecord.id === 'string' ? sessionRecord.id.trim() : '';
  const sessionInstrumentId = typeof sessionRecord.instrument_id === 'string' ? sessionRecord.instrument_id.trim() : '';
  const sessionSymbol = typeof sessionRecord.symbol === 'string' ? sessionRecord.symbol.trim().toUpperCase() : '';
  if (!sessionId || !sessionInstrumentId) {
    return snapshot;
  }
  const positionsRaw = Array.isArray(snapshot.positions) ? snapshot.positions : [];
  const positions = positionsRaw
    .map((item) => normalizeSessionPositionForArchive(item, sessionId, sessionInstrumentId, sessionSymbol))
    .filter((item): item is SessionPositionForArchive => Boolean(item));
  if (!positions.length) {
    return snapshot;
  }
  const fillTarget = resolveArchiveForcedFillTarget(bars, normalizeNumber(sessionRecord.cursor_index, 0), priceMode);
  if (!fillTarget) {
    return snapshot;
  }
  const fallbackTradingSettings = getTradingSettings();
  const tradingSettings =
    snapshot.sessionTradingSettings &&
    typeof snapshot.sessionTradingSettings === 'object' &&
    !Array.isArray(snapshot.sessionTradingSettings)
      ? normalizeTradingExecutionSettings(snapshot.sessionTradingSettings as Record<string, unknown>, fallbackTradingSettings)
      : fallbackTradingSettings;
  const contractMultiplier = resolveContractMultiplier(tradingSettings.contractMultiplier);
  const existingFills = Array.isArray(snapshot.fills) ? snapshot.fills : [];
  const createdAtSeed = Date.now();
  const forcedFills: ArchiveReplayFill[] = [];
  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index]!;
    const side: 'BUY' | 'SELL' = position.qty > 0 ? 'SELL' : 'BUY';
    const fillQty = round(Math.abs(position.qty), 8);
    if (!Number.isFinite(fillQty) || fillQty <= POSITION_EPSILON) {
      continue;
    }
    const gross = fillQty * fillTarget.fillPrice * contractMultiplier;
    const breakdown = calculateTradingCostBreakdown(
      gross,
      side,
      tradingSettings,
      fillQty,
    );
    forcedFills.push({
      id: createId(),
      order_id: createId(),
      session_id: position.sessionId,
      instrument_id: position.instrumentId,
      symbol: (position.symbol || sessionSymbol || '').trim().toUpperCase(),
      side,
      fill_index: fillTarget.fillIndex,
      fill_time: fillTarget.fillTime,
      fill_price: round(fillTarget.fillPrice, 8),
      fill_qty: fillQty,
      contract_multiplier: round(contractMultiplier, 8),
      fee: round(breakdown.fee, 8),
      tax: round(breakdown.tax, 8),
      slippage: round(breakdown.slippage, 8),
      created_at: new Date(createdAtSeed + index).toISOString(),
    });
  }
  if (!forcedFills.length) {
    return snapshot;
  }
  const nextCursorIndex = Math.max(Math.floor(normalizeNumber(sessionRecord.cursor_index, 0)), fillTarget.fillIndex);
  const forcedCashDelta = forcedFills.reduce((sum, fill) => {
    const gross =
      normalizeNumber(fill.fill_price) *
      normalizeNumber(fill.fill_qty) *
      Math.max(Number.EPSILON, normalizeNumber(fill.contract_multiplier, 1));
    const tradingCost =
      normalizeNumber(fill.fee) +
      normalizeNumber(fill.tax) +
      normalizeNumber(fill.slippage);
    return fill.side === 'BUY'
      ? sum - gross - tradingCost
      : sum + gross - tradingCost;
  }, 0);
  const accounts = Array.isArray((snapshot as { accounts?: unknown }).accounts)
    ? ((snapshot as { accounts?: Array<Record<string, unknown>> }).accounts ?? []).map((account) => {
        if (!account || typeof account !== 'object' || account.kind !== 'SECURITIES') {
          return account;
        }
        return {
          ...account,
          balance: round(normalizeNumber(account.balance) + forcedCashDelta, 6),
        };
      })
    : (snapshot as { accounts?: unknown }).accounts;
  return {
    ...snapshot,
    session: {
      ...sessionRecord,
      cursor_index: nextCursorIndex,
    },
    accounts,
    positions: [],
    fills: [...existingFills, ...forcedFills],
    fillsTotal: existingFills.length + forcedFills.length,
    nextFillCursor: null,
  };
};

const sanitizeArchiveDrawings = (drawings: unknown): unknown[] => {
  if (!Array.isArray(drawings)) {
    return [];
  }
  const normalized = drawings
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const source = item as Record<string, unknown>;
      const name = typeof source.name === 'string' ? source.name.trim() : '';
      if (!name) {
        return null;
      }
      const points = Array.isArray(source.points)
        ? source.points
            .map((point) => {
              if (!point || typeof point !== 'object') {
                return null;
              }
              const pointSource = point as Record<string, unknown>;
              const timestamp = Number(pointSource.timestamp);
              if (!Number.isFinite(timestamp)) {
                return null;
              }
              const normalizedPoint: Record<string, unknown> = { timestamp };
              const valueNumber = Number(pointSource.value);
              if (Number.isFinite(valueNumber)) {
                normalizedPoint.value = valueNumber;
              }
              const dataIndex = Number(pointSource.dataIndex);
              if (Number.isFinite(dataIndex)) {
                normalizedPoint.dataIndex = dataIndex;
              }
              return normalizedPoint;
            })
            .filter((point): point is Record<string, unknown> => Boolean(point))
        : [];
      const minPointCount = name === 'simpleTag' || name === 'simpleAnnotation' || name === 'priceLine' ? 1 : 2;
      if (points.length < minPointCount) {
        return null;
      }

      const next: Record<string, unknown> = {
        name,
        points,
      };
      if (typeof source.id === 'string' && source.id) next.id = source.id;
      if (typeof source.visible === 'boolean') next.visible = source.visible;
      if (typeof source.lock === 'boolean') next.lock = source.lock;
      if (Number.isFinite(Number(source.zLevel))) next.zLevel = Number(source.zLevel);
      if (typeof source.mode === 'string') next.mode = source.mode;
      if (Number.isFinite(Number(source.modeSensitivity))) next.modeSensitivity = Number(source.modeSensitivity);
      if (typeof source.needDefaultXAxisFigure === 'boolean') next.needDefaultXAxisFigure = source.needDefaultXAxisFigure;
      if (typeof source.sourcePeriod === 'string' && source.sourcePeriod.trim()) next.sourcePeriod = source.sourcePeriod;
      if (source.styles && typeof source.styles === 'object') next.styles = source.styles;
      if (source.extendData !== undefined) {
        if (name === 'simpleAnnotation' && source.extendData && typeof source.extendData === 'object') {
          const extendData = { ...(source.extendData as Record<string, unknown>) };
          if (typeof extendData.text === 'string') {
            extendData.text = extendData.text.slice(0, ARCHIVE_TEXT_CHARS_MAX);
          }
          next.extendData = extendData;
        } else {
          next.extendData = source.extendData;
        }
      }
      return next;
    })
    .filter((item): item is Record<string, unknown> => Boolean(item));
  if (normalized.length <= ARCHIVE_DRAWING_COUNT_MAX) {
    return normalized;
  }
  return normalized.slice(normalized.length - ARCHIVE_DRAWING_COUNT_MAX);
};

const buildReplaySnapshotFromSession = (
  bars: ReplayBar[],
  snapshot: SessionSnapshotForArchive,
): { bars: ReplayBar[]; snapshot: SessionSnapshotForArchive } | null => {
  if (!bars.length) {
    return null;
  }
  const maxIndex = clamp(Math.floor(normalizeNumber(snapshot.session.cursor_index)), 0, bars.length - 1);
  const startIndex = clamp(Math.floor(normalizeNumber(snapshot.session.start_index)), 0, maxIndex);
  const nextBars = bars.slice(startIndex, maxIndex + 1);
  if (!nextBars.length) {
    return null;
  }
  const entryIndex = clamp(Math.floor(normalizeNumber(snapshot.session.entry_index)) - startIndex, 0, nextBars.length - 1);
  const nextSession = {
    ...snapshot.session,
    start_index: 0,
    entry_index: entryIndex,
    cursor_index: nextBars.length - 1,
  };
  const nextFills = (Array.isArray(snapshot.fills) ? snapshot.fills : [])
    .filter((fill) => fill.fill_index >= startIndex && fill.fill_index <= maxIndex)
    .map((fill) => ({
      ...fill,
      fill_index: fill.fill_index - startIndex,
    }));
  const nextCashAdjustments = normalizeArchiveCashAdjustments(
    (snapshot as { cashAdjustments?: unknown }).cashAdjustments,
  )
    .filter((adjustment) => adjustment.bar_index >= startIndex && adjustment.bar_index <= maxIndex)
    .map((adjustment) => ({
      ...adjustment,
      bar_index: adjustment.bar_index - startIndex,
    }));

  return {
    bars: nextBars,
    snapshot: {
      ...snapshot,
      session: nextSession,
      fills: nextFills,
      cashAdjustments: nextCashAdjustments,
      fillsTotal: nextFills.length,
      nextFillCursor: null,
    },
  };
};

const resolveArchiveSourceDisplayIndexForRawIndex = (
  bars: ArchiveSourceBar[],
  rawIndex: unknown,
): number => {
  if (!bars.length) {
    return 0;
  }
  const safeRawIndex = Math.max(0, Math.floor(normalizeNumber(rawIndex, 0)));
  const first = bars[0]!;
  const last = bars[bars.length - 1]!;
  if (safeRawIndex < first.startRawIndex) {
    return first.displayIndex - 1;
  }
  if (safeRawIndex > last.endRawIndex) {
    return last.displayIndex + 1;
  }

  let left = 0;
  let right = bars.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const bar = bars[mid]!;
    if (safeRawIndex < bar.startRawIndex) {
      right = mid - 1;
      continue;
    }
    if (safeRawIndex > bar.endRawIndex) {
      left = mid + 1;
      continue;
    }
    return bar.displayIndex;
  }
  const fallback = bars[Math.max(0, Math.min(bars.length - 1, right))] ?? first;
  return fallback.displayIndex;
};

const localizeArchiveSnapshotToSourceBars = (
  snapshot: SessionSnapshotForArchive,
  bars: ArchiveSourceBar[],
  displayOffset: number,
): SessionSnapshotForArchive => {
  const safeOffset = Math.max(0, Math.floor(normalizeNumber(displayOffset, 0)));
  const session = snapshot.session ?? {};
  const localizeIndex = (value: unknown): number =>
    resolveArchiveSourceDisplayIndexForRawIndex(bars, value) - safeOffset;
  const localizeSessionIndex = (value: unknown): number =>
    Math.max(0, localizeIndex(value));

  return {
    ...snapshot,
    session: {
      ...session,
      start_index: localizeSessionIndex(session.start_index),
      entry_index: localizeSessionIndex(session.entry_index),
      cursor_index: localizeSessionIndex(session.cursor_index),
    },
    fills: (Array.isArray(snapshot.fills) ? snapshot.fills : []).map((fill) => ({
      ...fill,
      fill_index: localizeIndex(fill.fill_index),
    })),
    nextFillCursor: null,
  };
};

const compactReplaySnapshotForArchive = (snapshot: SessionSnapshotForArchive): SessionSnapshotForArchive => {
  const fallbackSymbol = typeof snapshot.session?.symbol === 'string' ? snapshot.session.symbol.trim().toUpperCase() : '';
  const fallbackCreatedAt =
    typeof snapshot.session?.created_at === 'string' && snapshot.session.created_at.trim()
      ? snapshot.session.created_at
      : nowIso();
  const compactFills = compactReplayFillsForArchive(snapshot.fills ?? [], {
    fallbackSymbol,
    fallbackCreatedAt,
    nonNegativeCosts: true,
  }) as ArchiveReplayFill[];

  return {
    ...snapshot,
    fills: compactFills,
    cashAdjustments: normalizeArchiveCashAdjustments(
      (snapshot as { cashAdjustments?: unknown }).cashAdjustments,
    ),
    fillsTotal: compactFills.length,
    nextFillCursor: null,
    drawings: [],
  };
};

const buildReplayEquityMetrics = (
  initialCapital: number,
  bars: ReplayBar[],
  snapshot: SessionSnapshotForArchive,
): { equityCurve: ReplayCurvePoint[]; drawdownCurve: ReplayCurvePoint[]; finalEquity: number; equityReturnRate: number } =>
  calculateReplayEquityMetrics({
    initialCapital,
    bars,
    fills: snapshot.fills ?? [],
    cashAdjustments: normalizeArchiveCashAdjustments(
      (snapshot as { cashAdjustments?: unknown }).cashAdjustments,
    ),
    entryIndex: clamp(Math.floor(normalizeNumber(snapshot.session.entry_index)), 0, Math.max(0, bars.length - 1)),
  });

export const buildReplayPayloadFromSessionArchive = async (
  sessionId: string,
  initialCapital: number,
  drawings: unknown,
  chartIndicators: unknown,
  displayPeriod: ArchivedDisplayPeriod,
  finalizePriceMode: PriceMode | null,
  options?: {
    bypassAccessGuard?: boolean;
  },
): Promise<{
  symbol: string;
  baseTimeframe: ArchivedBaseTimeframe;
  trainingDateRange: string;
  summary: TrainingSummaryPayload;
  replay: Record<string, unknown> | undefined;
  replayOmitted: boolean;
  reviewProjection: TrainingReviewProjectionMetrics | null;
  metrics: {
    initialCapital: number;
    finalEquity: number;
    equityReturnRate: number;
    equityCurve: ReplayCurvePoint[];
    drawdownCurve: ReplayCurvePoint[];
  };
}> => {
  const readSessionSnapshot = options?.bypassAccessGuard
    ? getSessionSnapshotInternal
    : getSessionSnapshot;
  const readArchiveBarsByInstrumentRange = options?.bypassAccessGuard
    ? getReplayArchiveBarsByInstrumentIdRawRangeInternal
    : getReplayArchiveBarsByInstrumentIdRawRange;
  const rawSnapshot = (await readSessionSnapshot(
    sessionId,
    null,
  )) as SessionSnapshotForArchive;
  const allFills = listArchiveSessionFills(sessionId);
  const rawSnapshotWithAllFills: SessionSnapshotForArchive = {
    ...rawSnapshot,
    fills: allFills,
    fillsTotal: allFills.length,
    nextFillCursor: null,
  };
  const symbol = (rawSnapshotWithAllFills?.session?.symbol || '').trim().toUpperCase();
  const instrumentId =
    typeof rawSnapshotWithAllFills?.session?.instrument_id === 'string'
      ? rawSnapshotWithAllFills.session.instrument_id.trim()
      : '';
  const baseTimeframe = normalizeArchivedBaseTimeframe(rawSnapshotWithAllFills?.session?.timeframe);
  const archivedDisplayPeriod = normalizeArchivedDisplayPeriod(displayPeriod);
  const snapshotInitialCapital = normalizeNumber(
    (rawSnapshotWithAllFills as { sessionTradingSettings?: { initialSecuritiesBalance?: unknown } })
      ?.sessionTradingSettings?.initialSecuritiesBalance,
    Number.NaN,
  );
  const resolvedInitialCapital =
    Number.isFinite(snapshotInitialCapital) && snapshotInitialCapital > 0
      ? snapshotInitialCapital
      : Math.max(0, normalizeNumber(initialCapital));
  if (!symbol) {
    throw appError('INSTRUMENT_NOT_FOUND');
  }
  if (!instrumentId) {
    throw appError('INSTRUMENT_NOT_FOUND', { symbol });
  }
  const sessionStartIndex = Math.max(0, Math.floor(normalizeNumber(rawSnapshotWithAllFills?.session?.start_index, 0)));
  const sessionCursorIndex = Math.max(sessionStartIndex, Math.floor(normalizeNumber(rawSnapshotWithAllFills?.session?.cursor_index, 0)));
  const rangeEndIndex =
    finalizePriceMode === 'NEXT_OPEN' ? Math.max(sessionCursorIndex, sessionCursorIndex + 1) : sessionCursorIndex;
  const sourceBarsRange = await readArchiveBarsByInstrumentRange(
    instrumentId,
    archivedDisplayPeriod,
    sessionStartIndex,
    rangeEndIndex,
    runtimeLimits.barsRangeLimitMax,
  );
  const sourceBars = sourceBarsRange.bars
    .map((bar) => normalizeArchiveSourceBar(bar))
    .filter((bar): bar is ArchiveSourceBar => Boolean(bar));
  const localizedSnapshot = {
    ...localizeArchiveSnapshotToSourceBars(
      rawSnapshotWithAllFills,
      sourceBars,
      sourceBarsRange.offset,
    ),
    cashAdjustments: readArchiveCashAdjustments(sessionId, sourceBars),
  };
  const replaySnapshot =
    isPriceMode(finalizePriceMode)
      ? appendForcedLiquidationFillsForArchive(localizedSnapshot, sourceBars, finalizePriceMode)
      : localizedSnapshot;
  const replayBase = buildReplaySnapshotFromSession(sourceBars, replaySnapshot);
  if (!replayBase) {
    throw appError('TRAINING_PROJECT_REPLAY_ARCHIVE_FAILED');
  }
  const compactSnapshot = compactReplaySnapshotForArchive(replayBase.snapshot);
  const metrics = buildReplayEquityMetrics(resolvedInitialCapital, replayBase.bars, compactSnapshot);
  const trainingDateRange = resolveTrainingDateRangeFromBars(replayBase.bars);
  const summary = buildTrainingSummaryFromReplayArchive({
    initialCapital: resolvedInitialCapital,
    bars: replayBase.bars,
    snapshot: compactSnapshot,
    equityCurve: metrics.equityCurve,
    drawdownCurve: metrics.drawdownCurve,
    finalEquity: metrics.finalEquity,
    equityReturnRate: metrics.equityReturnRate,
  });
  const tradeRounds = deriveReplayTradeRounds({
    bars: replayBase.bars,
    fills: compactSnapshot.fills,
  });
  const reviewProjection = buildTrainingReviewProjectionMetrics({
    initialTotal: resolvedInitialCapital,
    totalPnl: summary.totalPnl,
    finalEquity: metrics.finalEquity,
    totalTrades: summary.totalTrades,
    profitRate: summary.profitRate,
    maxDrawdownRate: summary.maxDrawdownRate,
    decisionCount: summary.decisionCount,
    decisionSecondsUsed: summary.decisionSecondsUsed,
    replay: {
      bars: replayBase.bars,
      snapshot: compactSnapshot,
      tradeRounds,
    },
  });
  const replayFillCount = compactSnapshot.fills.length;
  if (replayFillCount > ARCHIVE_REPLAY_MAX_FILLS) {
    throw appError('TRAINING_PROJECT_REPLAY_ARCHIVE_TOO_LARGE');
  }

  return {
    symbol,
    baseTimeframe,
    trainingDateRange,
    summary,
    replayOmitted: false,
    replay: {
      bars: replayBase.bars,
      snapshot: compactSnapshot,
      drawings: sanitizeArchiveDrawings(drawings),
      equityCurve: metrics.equityCurve,
      drawdownCurve: metrics.drawdownCurve,
      tradeRounds,
      finalEquity: metrics.finalEquity,
      equityReturnRate: metrics.equityReturnRate,
      chartIndicators,
      baseTimeframe,
      displayPeriod: archivedDisplayPeriod,
    },
    reviewProjection,
    metrics: {
      initialCapital: resolvedInitialCapital,
      finalEquity: metrics.finalEquity,
      equityReturnRate: metrics.equityReturnRate,
      equityCurve: metrics.equityCurve,
      drawdownCurve: metrics.drawdownCurve,
    },
  };
};
