// SPDX-License-Identifier: GPL-3.0-only

import type { OhlcvBar } from '../../domain/models.js';
import { createInstrumentBarReadCache } from './instrumentBarReadCache.js';
import type { createPortfolioSummaryStore } from '../ports/infrastructure/db/trading/portfolioSummaryStore.js';

type CreatePortfolioSummaryOpsDeps = {
  portfolioSummaryStore: ReturnType<typeof createPortfolioSummaryStore>;
  getBarCount: (instrumentId: string) => Promise<number>;
  getBarByIndex: (instrumentId: string, index: number) => Promise<OhlcvBar | undefined>;
  toUtcDayMs: (iso: string) => number;
  DAY_MS: number;
  round: (value: number, digits?: number) => number;
};

export const createPortfolioSummaryOps = (deps: CreatePortfolioSummaryOpsDeps) => {
  const {
    portfolioSummaryStore,
    getBarCount,
    getBarByIndex,
    toUtcDayMs,
    DAY_MS,
    round,
  } = deps;

  const getPortfolioSummary = async () => {
    const rows = portfolioSummaryStore.listPortfolioPositionRows();

    const map = new Map<
      string,
      {
        symbol: string;
        qty: number;
        weightedQty: number;
        totalCost: number;
        realizedPnl: number;
        markPrice: number;
        sessionId: string;
        durationDays: number;
      }
    >();
    const { getBarCountCached, getBarByIndexCached } = createInstrumentBarReadCache({
      getBarCount,
      getBarByIndex
    });

    for (const row of rows) {
      const barCount = await getBarCountCached(row.instrumentId);
      const markBar = barCount > 0 ? await getBarByIndexCached(row.instrumentId, row.cursorIndex) : undefined;
      const markPrice = markBar?.close ?? 0;
      const contractMultiplier = (() => {
        const raw = String(row.tradingSettingsJson ?? '').trim();
        if (!raw) {
          return 1;
        }
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return 1;
          }
          const source = parsed as Record<string, unknown>;
          const numeric = Number(source.contractMultiplier);
          return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
        } catch {
          return 1;
        }
      })();
      let durationDays = 0;
      if (barCount > 0) {
        const startIndex = Math.max(0, Math.min(row.entryIndex, barCount - 1));
        const endIndex = Math.max(0, Math.min(row.cursorIndex, barCount - 1));
        const [startBar, endBar] = await Promise.all([
          getBarByIndexCached(row.instrumentId, startIndex),
          getBarByIndexCached(row.instrumentId, endIndex)
        ]);
        if (startBar && endBar) {
          const startDay = toUtcDayMs(startBar.ts);
          const endDay = toUtcDayMs(endBar.ts);
          durationDays = Math.max(1, Math.floor((endDay - startDay) / DAY_MS) + 1);
        }
      }

      const existing = map.get(row.symbol);
      if (!existing) {
        map.set(row.symbol, {
          symbol: row.symbol,
          qty: row.qty,
          weightedQty: row.qty * contractMultiplier,
          totalCost: row.avgCost * row.qty * contractMultiplier,
          realizedPnl: row.realizedPnl,
          markPrice,
          sessionId: row.sessionId,
          durationDays
        });
        continue;
      }

      existing.qty += row.qty;
      existing.weightedQty += row.qty * contractMultiplier;
      existing.totalCost += row.avgCost * row.qty * contractMultiplier;
      existing.realizedPnl += row.realizedPnl;
      existing.markPrice = markPrice;
      existing.durationDays = Math.max(existing.durationDays, durationDays);
    }

    const items = [...map.values()].map((item) => {
      const avgCost = Math.abs(item.weightedQty) > 1e-8 ? item.totalCost / item.weightedQty : 0;
      const marketValue = item.weightedQty * item.markPrice;
      const unrealizedPnl = item.weightedQty * (item.markPrice - avgCost);
      const totalPnl = item.realizedPnl + unrealizedPnl;
      const positionCostAbs = Math.abs(item.weightedQty * avgCost);
      const pnlRate = positionCostAbs > 1e-8 ? unrealizedPnl / positionCostAbs : 0;

      return {
        symbol: item.symbol,
        qty: round(item.qty, 8),
        avgCost: round(avgCost, 8),
        markPrice: round(item.markPrice, 8),
        marketValue: round(marketValue, 6),
        realizedPnl: round(item.realizedPnl, 6),
        unrealizedPnl: round(unrealizedPnl, 6),
        totalPnl: round(totalPnl, 6),
        pnlRate,
        sessionId: item.sessionId,
        durationDays: item.durationDays
      };
    });

    const totalRealized = items.reduce((sum, item) => sum + item.realizedPnl, 0);
    const totalUnrealized = items.reduce((sum, item) => sum + item.unrealizedPnl, 0);

    return {
      totalRealized: round(totalRealized, 6),
      totalUnrealized: round(totalUnrealized, 6),
      totalPnl: round(totalRealized + totalUnrealized, 6),
      items
    };
  };

  return {
    getPortfolioSummary
  };
};
