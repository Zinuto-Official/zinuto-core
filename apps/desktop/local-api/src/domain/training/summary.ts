// SPDX-License-Identifier: GPL-3.0-only

export interface TrainingSummaryPayload {
  initialAsset: number;
  endingAsset: number;
  assetReturnRate: number;
  durationDays: number;
  startDate: string | null;
  endDate: string | null;
  buyCount: number;
  sellCount: number;
  totalTrades: number;
  investedAmount: number;
  tradingCost: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  profitRate: number;
  maxDrawdownRate: number;
  maxDrawdownAmount: number;
  decisionSecondsUsed: number;
  decisionCount: number;
}

const DEFAULT_TRAINING_SUMMARY: TrainingSummaryPayload = {
  initialAsset: 0,
  endingAsset: 0,
  assetReturnRate: 0,
  durationDays: 0,
  startDate: null,
  endDate: null,
  buyCount: 0,
  sellCount: 0,
  totalTrades: 0,
  investedAmount: 0,
  tradingCost: 0,
  realizedPnl: 0,
  unrealizedPnl: 0,
  totalPnl: 0,
  profitRate: 0,
  maxDrawdownRate: 0,
  maxDrawdownAmount: 0,
  decisionSecondsUsed: 0,
  decisionCount: 0
};

const normalizeNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeTrainingSummary = (value: unknown): TrainingSummaryPayload => {
  const source = value && typeof value === 'object' ? (value as Partial<TrainingSummaryPayload>) : {};
  return {
    initialAsset: normalizeNumber(source.initialAsset),
    endingAsset: normalizeNumber(source.endingAsset),
    assetReturnRate: normalizeNumber(source.assetReturnRate),
    durationDays: Math.max(0, Math.floor(normalizeNumber(source.durationDays))),
    startDate: typeof source.startDate === 'string' ? source.startDate : null,
    endDate: typeof source.endDate === 'string' ? source.endDate : null,
    buyCount: Math.max(0, Math.floor(normalizeNumber(source.buyCount))),
    sellCount: Math.max(0, Math.floor(normalizeNumber(source.sellCount))),
    totalTrades: Math.max(0, Math.floor(normalizeNumber(source.totalTrades))),
    investedAmount: normalizeNumber(source.investedAmount),
    tradingCost: normalizeNumber(source.tradingCost),
    realizedPnl: normalizeNumber(source.realizedPnl),
    unrealizedPnl: normalizeNumber(source.unrealizedPnl),
    totalPnl: normalizeNumber(source.totalPnl),
    profitRate: normalizeNumber(source.profitRate),
    maxDrawdownRate: normalizeNumber(source.maxDrawdownRate),
    maxDrawdownAmount: normalizeNumber(source.maxDrawdownAmount),
    decisionSecondsUsed: Math.max(0, normalizeNumber(source.decisionSecondsUsed)),
    decisionCount: Math.max(0, Math.floor(normalizeNumber(source.decisionCount)))
  };
};

export const parseTrainingSummaryJson = (raw: string): TrainingSummaryPayload => {
  if (!raw) {
    return { ...DEFAULT_TRAINING_SUMMARY };
  }
  try {
    return normalizeTrainingSummary(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_TRAINING_SUMMARY };
  }
};
