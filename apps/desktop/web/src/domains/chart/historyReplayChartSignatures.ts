// SPDX-License-Identifier: GPL-3.0-only

import type { DisplayPeriodKey } from '@/domains/chart/chartPeriods';
import type { SessionSnapshot } from '@/domains/training/types';

type ReplayDrawingSignatureItem = {
  id?: string;
  name: string;
  points: Array<{ timestamp: number; value?: number; dataIndex?: number }>;
  sourcePeriod?: DisplayPeriodKey;
  visible?: boolean;
  lock?: boolean;
  zLevel?: number;
  mode?: string;
  modeSensitivity?: number;
  needDefaultXAxisFigure?: boolean;
  styles?: unknown;
  extendData?: unknown;
};

export const buildReplayDrawingOverlaySignature = (
  drawings: readonly ReplayDrawingSignatureItem[] | undefined,
): string => {
  if (!Array.isArray(drawings) || drawings.length === 0) {
    return '';
  }
  try {
    return JSON.stringify(
      drawings.map((item) => ({
        id: item.id ?? '',
        name: item.name,
        sourcePeriod: item.sourcePeriod ?? '',
        visible: item.visible,
        zLevel: item.zLevel,
        mode: item.mode,
        modeSensitivity: item.modeSensitivity,
        needDefaultXAxisFigure: item.needDefaultXAxisFigure,
        points: item.points,
        styles: item.styles,
        extendData: item.extendData,
      })),
    );
  } catch {
    return drawings.map((item) => [
      item.id ?? '',
      item.name,
      item.sourcePeriod ?? '',
      item.points.length,
      item.points[0]?.timestamp ?? '',
      item.points[item.points.length - 1]?.timestamp ?? '',
    ].join(':')).join('|');
  }
};

export const buildReplaySystemMarkerSignature = (
  snapshot: SessionSnapshot | null | undefined,
): string => {
  if (!snapshot) {
    return '';
  }
  const fills = Array.isArray(snapshot.fills) ? snapshot.fills : [];
  const positions = Array.isArray(snapshot.positions) ? snapshot.positions : [];
  try {
    return JSON.stringify({
      fillsTotal: snapshot.fillsTotal ?? null,
      residentFillsStartIndex: snapshot.residentFillsStartIndex ?? null,
      fills: fills.map((fill) => ({
        id: fill.id ?? '',
        side: fill.side,
        fillIndex: fill.fill_index,
        fillTime: fill.fill_time,
        fillPrice: fill.fill_price,
        fillQty: fill.fill_qty,
        contractMultiplier: fill.contract_multiplier,
        fee: fill.fee,
        tax: fill.tax,
        slippage: fill.slippage,
        createdAt: fill.created_at,
      })),
      positions: positions.map((position) => ({
        symbol: position.symbol,
        qty: position.qty,
        avgCost: position.avgCost,
        realizedPnl: position.realizedPnl,
        unrealizedPnl: position.unrealizedPnl,
        totalPnl: position.totalPnl,
        markPrice: position.markPrice,
      })),
      sessionSymbol: snapshot.session?.symbol ?? '',
      sessionCursorIndex: snapshot.session?.cursor_index ?? null,
      tradeAmountIncludesFees: snapshot.sessionTradingSettings?.tradeAmountIncludesFees ?? null,
      contractMultiplier: snapshot.sessionTradingSettings?.contractMultiplier ?? null,
    });
  } catch {
    return [
      fills.length,
      fills[0]?.id ?? '',
      fills[0]?.side ?? '',
      fills[0]?.fill_index ?? '',
      fills[fills.length - 1]?.id ?? '',
      fills[fills.length - 1]?.side ?? '',
      fills[fills.length - 1]?.fill_index ?? '',
      positions.length,
      positions[0]?.symbol ?? '',
      positions[0]?.qty ?? '',
      snapshot.session?.symbol ?? '',
      snapshot.session?.cursor_index ?? '',
    ].join('|');
  }
};
