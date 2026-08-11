// SPDX-License-Identifier: GPL-3.0-only

import { type TrainingProjectRecord } from '../historyService.js';
import {
  parseReplayFills,
  parseReplayTradeRoundRecords,
  type ReplayPayload,
} from '../../domain/training/statsDomain.js';
import {
  POSITION_EPSILON,
  clamp,
  normalizeNumber,
  resolveEnvironmentContext,
  resolveMarginRatio,
  toFixedRound,
  type ReplayReviewEnvironmentContext,
} from '../replayReviewEnvironmentContext.js';

export type ReplayReviewProjectMetrics = {
  projectId: string;
  projectTs: number;
  symbol: string;
  netPnl: number;
  grossPnl: number;
  slippageCost: number;
  feeAndTaxCost: number;
  fundingOrBorrowCost: number;
  returnRate: number;
  expectancy: number;
  maxDrawdownRate: number;
  closedTrades: number;
  winningTrades: number;
  profitTradeTotal: number;
  lossTradeTotal: number;
  averageHoldBars: number;
  trendAligned: boolean;
  criticalFailure: boolean;
  marginMaxUtilizationRate: number;
  marginMinBufferRate: number;
  lossCutDelayBarsTotal: number;
  lossCutDelayBarsCount: number;
  addPositionCount: number;
  fullPositionCount: number;
  environment: ReplayReviewEnvironmentContext;
};

type ReplayCashAdjustmentView = {
  barIndex: number;
  amount: number;
};

const resolveReplayPayload = (
  project: TrainingProjectRecord,
): ReplayPayload => {
  const replayRecord =
    project.replay && typeof project.replay === 'object' && !Array.isArray(project.replay)
      ? project.replay
      : {};
  return replayRecord as unknown as ReplayPayload;
};

const resolveProjectTimestampMs = (project: TrainingProjectRecord): number => {
  const createdAtMs = Date.parse(String(project.createdAt || ''));
  if (Number.isFinite(createdAtMs)) {
    return createdAtMs;
  }
  const updatedAtMs = Date.parse(String(project.updatedAt || ''));
  return Number.isFinite(updatedAtMs) ? updatedAtMs : 0;
};

const parseReplayCashAdjustments = (
  snapshotRecord: Record<string, unknown>,
): ReplayCashAdjustmentView[] => {
  const raw = Array.isArray(snapshotRecord.cashAdjustments)
    ? snapshotRecord.cashAdjustments
    : [];
  return raw
    .map((item): ReplayCashAdjustmentView | null => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }
      const source = item as Record<string, unknown>;
      const barIndex = Math.floor(
        normalizeNumber(source.bar_index ?? source.barIndex, Number.NaN),
      );
      const amount = normalizeNumber(source.amount, Number.NaN);
      if (!Number.isFinite(barIndex) || barIndex < 0 || !Number.isFinite(amount)) {
        return null;
      }
      return { barIndex, amount };
    })
    .filter((item): item is ReplayCashAdjustmentView => Boolean(item))
    .sort((left, right) => left.barIndex - right.barIndex);
};

const sumReplayCashAdjustmentCosts = (
  cashAdjustments: ReplayCashAdjustmentView[],
): number =>
  cashAdjustments.reduce(
    (sum, adjustment) => sum + Math.max(0, normalizeNumber(adjustment.amount)),
    0,
  );

const resolveFundingOrBorrowCost = (project: TrainingProjectRecord): number => {
  const projected = project.reviewProjection;
  if (projected) {
    return Math.max(0, normalizeNumber(projected.borrowCost));
  }
  const replayRecord =
    project.replay && typeof project.replay === 'object' && !Array.isArray(project.replay)
      ? project.replay
      : {};
  const snapshotRecord =
    replayRecord.snapshot &&
    typeof replayRecord.snapshot === 'object' &&
    !Array.isArray(replayRecord.snapshot)
      ? (replayRecord.snapshot as Record<string, unknown>)
      : {};
  const cashAdjustments = parseReplayCashAdjustments(snapshotRecord);
  if (cashAdjustments.length) {
    return sumReplayCashAdjustmentCosts(cashAdjustments);
  }
  const shortBorrowChargesTotal = normalizeNumber(snapshotRecord.shortBorrowChargesTotal);
  const longFinancingChargesTotal = normalizeNumber(snapshotRecord.longFinancingChargesTotal);
  return Math.max(0, shortBorrowChargesTotal) + Math.max(0, longFinancingChargesTotal);
};

const resolveMarginDiagnostics = (
  project: TrainingProjectRecord,
  environment: ReplayReviewEnvironmentContext,
  replayPayload: ReplayPayload,
): { maxUtilizationRate: number; minBufferRate: number } => {
  const projected = project.reviewProjection;
  if (projected) {
    return {
      maxUtilizationRate: toFixedRound(
        Math.max(0, normalizeNumber(projected.peakMaintenanceUtilizationRate)),
        6,
      ),
      minBufferRate: toFixedRound(
        normalizeNumber(projected.marginMinBufferRate, 1),
        6,
      ),
    };
  }
  const fills = parseReplayFills(replayPayload);
  if (!fills.length) {
    return {
      maxUtilizationRate: 0,
      minBufferRate: 1,
    };
  }
  const snapshotRecord =
    replayPayload.snapshot &&
    typeof replayPayload.snapshot === 'object' &&
    !Array.isArray(replayPayload.snapshot)
      ? (replayPayload.snapshot as Record<string, unknown>)
      : {};
  const settingsRecord =
    snapshotRecord.sessionTradingSettings &&
    typeof snapshotRecord.sessionTradingSettings === 'object' &&
    !Array.isArray(snapshotRecord.sessionTradingSettings)
      ? (snapshotRecord.sessionTradingSettings as Record<string, unknown>)
      : {};
  const longMaintenanceRatio = environment.allowLongMarginTrading
    ? resolveMarginRatio(settingsRecord.longMaintenanceMarginRatio, 100)
    : 1;
  const shortMaintenanceRatio = environment.allowShortSelling
    ? resolveMarginRatio(settingsRecord.shortMaintenanceMarginRatio, 30)
    : 0;
  const cashAdjustments = parseReplayCashAdjustments(snapshotRecord);
  let cash = Math.max(0, normalizeNumber(project.initialTotal, project.summary.initialAsset));
  let marginExposureQty = 0;
  let maxUtilizationRate = 0;
  let minBufferRate = 1;
  let adjustmentPointer = 0;
  let lastMarkPrice = 0;

  const recordMarginState = (markPrice: number): void => {
    if (markPrice <= POSITION_EPSILON) {
      return;
    }
    const longNotional = Math.max(0, marginExposureQty) * markPrice;
    const shortNotional = Math.max(0, -marginExposureQty) * markPrice;
    const equity = cash + longNotional - shortNotional;
    const requiredMaintenanceEquity =
      longNotional * longMaintenanceRatio + shortNotional * shortMaintenanceRatio;

    if (requiredMaintenanceEquity <= POSITION_EPSILON) {
      return;
    }
    const utilizationRate =
      equity <= POSITION_EPSILON
        ? 1
        : clamp(requiredMaintenanceEquity / Math.max(POSITION_EPSILON, equity), 0, 1.5);
    const bufferRate =
      equity <= POSITION_EPSILON
        ? -1
        : (equity - requiredMaintenanceEquity) / Math.max(POSITION_EPSILON, equity);
    maxUtilizationRate = Math.max(maxUtilizationRate, utilizationRate);
    minBufferRate = Math.min(minBufferRate, bufferRate);
  };

  const applyCashAdjustmentsThrough = (barIndex: number): void => {
    while (
      adjustmentPointer < cashAdjustments.length &&
      cashAdjustments[adjustmentPointer]!.barIndex <= barIndex
    ) {
      cash -= cashAdjustments[adjustmentPointer]!.amount;
      adjustmentPointer += 1;
    }
  };

  for (const fill of fills) {
    applyCashAdjustmentsThrough(fill.fill_index);
    const fillQty = Math.max(0, normalizeNumber(fill.fill_qty));
    const fillPrice = Math.max(POSITION_EPSILON, normalizeNumber(fill.fill_price));
    if (fillQty <= POSITION_EPSILON) {
      continue;
    }
    lastMarkPrice = fillPrice;
    const contractMultiplier = Math.max(Number.EPSILON, normalizeNumber(fill.contract_multiplier, 1));
    const gross = fillQty * fillPrice * contractMultiplier;
    const tradingCost =
      Math.max(0, normalizeNumber(fill.fee)) +
      Math.max(0, normalizeNumber(fill.tax)) +
      Math.max(0, normalizeNumber(fill.slippage));
    if (fill.side === 'BUY') {
      cash -= gross + tradingCost;
      marginExposureQty += fillQty * contractMultiplier;
    } else {
      cash += gross - tradingCost;
      marginExposureQty -= fillQty * contractMultiplier;
    }

    recordMarginState(fillPrice);
  }
  while (adjustmentPointer < cashAdjustments.length) {
    cash -= cashAdjustments[adjustmentPointer]!.amount;
    adjustmentPointer += 1;
  }
  recordMarginState(lastMarkPrice);

  return {
    maxUtilizationRate: toFixedRound(maxUtilizationRate, 6),
    minBufferRate: toFixedRound(minBufferRate, 6),
  };
};

const resolveProjectedProjectMetrics = (
  project: TrainingProjectRecord,
): ReplayReviewProjectMetrics | null => {
  const projection = project.reviewProjection;
  if (!projection) {
    return null;
  }
  const environment = resolveEnvironmentContext(project);
  const netPnl = normalizeNumber(
    project.totalPnl,
    normalizeNumber(project.summary.totalPnl),
  );
  const initialTotal = Math.max(
    0,
    normalizeNumber(project.initialTotal, project.summary.initialAsset),
  );
  const returnRate =
    initialTotal > POSITION_EPSILON
      ? netPnl / initialTotal
      : normalizeNumber(
          project.profitRate,
          normalizeNumber(project.summary.profitRate),
        );
  return {
    projectId: project.id,
    projectTs: resolveProjectTimestampMs(project),
    symbol: project.symbol,
    netPnl: toFixedRound(netPnl, 8),
    grossPnl: toFixedRound(normalizeNumber(projection.grossPnl), 8),
    slippageCost: toFixedRound(
      Math.max(0, normalizeNumber(projection.analytics.totalSlippage)),
      8,
    ),
    feeAndTaxCost: toFixedRound(
      Math.max(0, normalizeNumber(projection.feeAndTaxCost)),
      8,
    ),
    fundingOrBorrowCost: toFixedRound(
      Math.max(0, normalizeNumber(projection.borrowCost)),
      8,
    ),
    returnRate: toFixedRound(returnRate, 8),
    expectancy: toFixedRound(normalizeNumber(projection.expectancyPerTrade), 8),
    maxDrawdownRate: toFixedRound(
      Math.max(0, normalizeNumber(project.summary.maxDrawdownRate)),
      8,
    ),
    closedTrades: Math.max(
      0,
      Math.floor(normalizeNumber(projection.analytics.closedTrades)),
    ),
    winningTrades: Math.max(
      0,
      Math.floor(normalizeNumber(projection.analytics.winningTrades)),
    ),
    profitTradeTotal: toFixedRound(
      normalizeNumber(projection.analytics.profitTradeTotal),
      8,
    ),
    lossTradeTotal: toFixedRound(
      normalizeNumber(projection.analytics.lossTradeTotal),
      8,
    ),
    averageHoldBars: toFixedRound(
      Math.max(0, normalizeNumber(projection.analytics.averageHoldBars)),
      8,
    ),
    trendAligned: Boolean(projection.trendAligned),
    criticalFailure: Boolean(projection.criticalFailure),
    marginMaxUtilizationRate: toFixedRound(
      Math.max(0, normalizeNumber(projection.peakMaintenanceUtilizationRate)),
      8,
    ),
    marginMinBufferRate: toFixedRound(
      normalizeNumber(projection.marginMinBufferRate, 1),
      8,
    ),
    lossCutDelayBarsTotal: toFixedRound(
      Math.max(0, normalizeNumber(projection.lossCutDelayBarsTotal)),
      8,
    ),
    lossCutDelayBarsCount: Math.max(
      0,
      Math.floor(normalizeNumber(projection.lossCutDelayBarsCount)),
    ),
    addPositionCount: Math.max(
      0,
      Math.floor(normalizeNumber(projection.analytics.addPositionCount)),
    ),
    fullPositionCount: Math.max(
      0,
      Math.floor(normalizeNumber(projection.analytics.fullPositionCount)),
    ),
    environment,
  };
};

export const resolveProjectMetrics = (
  project: TrainingProjectRecord,
): ReplayReviewProjectMetrics => {
  const projected = resolveProjectedProjectMetrics(project);
  if (projected) {
    return projected;
  }
  const replayPayload = resolveReplayPayload(project);
  const fills = parseReplayFills(replayPayload);
  const tradeRecords = parseReplayTradeRoundRecords(replayPayload);
  const netPnl = normalizeNumber(project.totalPnl, normalizeNumber(project.summary.totalPnl));
  const slippageCost = fills.reduce(
    (sum, fill) => sum + Math.max(0, normalizeNumber(fill.slippage)),
    0,
  );
  const feeAndTaxCost = fills.reduce(
    (sum, fill) =>
      sum +
      Math.max(0, normalizeNumber(fill.fee)) +
      Math.max(0, normalizeNumber(fill.tax)),
    0,
  );
  const fundingOrBorrowCost = resolveFundingOrBorrowCost(project);
  const grossPnl = netPnl + slippageCost + feeAndTaxCost + fundingOrBorrowCost;
  const closedTrades = tradeRecords.length;
  const winningTrades = tradeRecords.filter((record) => record.pnl > 0).length;
  const profitTradeTotal = tradeRecords.reduce(
    (sum, record) => sum + Math.max(0, normalizeNumber(record.pnl)),
    0,
  );
  const lossTradeTotal = tradeRecords.reduce(
    (sum, record) => sum + Math.min(0, normalizeNumber(record.pnl)),
    0,
  );
  const averageHoldBars =
    closedTrades > 0
      ? tradeRecords.reduce((sum, record) => sum + Math.max(0, normalizeNumber(record.holdBars)), 0) /
        closedTrades
      : 0;
  const initialTotal = Math.max(0, normalizeNumber(project.initialTotal, project.summary.initialAsset));
  const returnRate =
    initialTotal > POSITION_EPSILON
      ? netPnl / initialTotal
      : normalizeNumber(project.profitRate, normalizeNumber(project.summary.profitRate));
  const expectancy =
    closedTrades > 0
      ? (profitTradeTotal + lossTradeTotal) / closedTrades
      : returnRate;
  const maxDrawdownRate = Math.max(
    0,
    normalizeNumber(project.summary.maxDrawdownRate),
  );
  const environment = resolveEnvironmentContext(project);
  const marginDiagnostics = resolveMarginDiagnostics(project, environment, replayPayload);
  const trendAligned =
    returnRate > 0 &&
    averageHoldBars >= 4 &&
    (Math.abs(lossTradeTotal) <= POSITION_EPSILON || profitTradeTotal / Math.abs(lossTradeTotal) >= 1);
  const lossCutDelayBarsTotal = Math.max(
    0,
    normalizeNumber(project.reviewProjection?.lossCutDelayBarsTotal),
  );
  const lossCutDelayBarsCount = Math.max(
    0,
    Math.floor(normalizeNumber(project.reviewProjection?.lossCutDelayBarsCount)),
  );

  return {
    projectId: project.id,
    projectTs: resolveProjectTimestampMs(project),
    symbol: project.symbol,
    netPnl: toFixedRound(netPnl, 8),
    grossPnl: toFixedRound(grossPnl, 8),
    slippageCost: toFixedRound(slippageCost, 8),
    feeAndTaxCost: toFixedRound(feeAndTaxCost, 8),
    fundingOrBorrowCost: toFixedRound(fundingOrBorrowCost, 8),
    returnRate: toFixedRound(returnRate, 8),
    expectancy: toFixedRound(expectancy, 8),
    maxDrawdownRate: toFixedRound(maxDrawdownRate, 8),
    closedTrades,
    winningTrades,
    profitTradeTotal: toFixedRound(profitTradeTotal, 8),
    lossTradeTotal: toFixedRound(lossTradeTotal, 8),
    averageHoldBars: toFixedRound(averageHoldBars, 8),
    trendAligned,
    criticalFailure:
      maxDrawdownRate >= 0.2 || normalizeNumber(project.finalEquity) <= POSITION_EPSILON,
    marginMaxUtilizationRate: marginDiagnostics.maxUtilizationRate,
    marginMinBufferRate: marginDiagnostics.minBufferRate,
    lossCutDelayBarsTotal: toFixedRound(lossCutDelayBarsTotal, 8),
    lossCutDelayBarsCount,
    addPositionCount: 0,
    fullPositionCount: 0,
    environment,
  };
};
