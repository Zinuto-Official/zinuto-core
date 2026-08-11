// SPDX-License-Identifier: GPL-3.0-only

import { parseTimestampMs, toMarketDateKey } from '@zinuto/shared/marketTime';
import {
  deriveReplayProfitFactor,
  deriveReplayTradeRounds,
  type ReplayBarLike,
  type ReplayFillLike,
  type ReplayRatioState,
} from '@zinuto/shared/replay';
import type { TradingAssetClass, TradingSettings } from '@zinuto/shared/trading';
import { type TrainingProjectRecord } from './historyService.js';
import { calcSessionTradeAnalytics } from '../domain/training/statsDomain.js';

export const ASSET_CLASS_ORDER: TradingAssetClass[] = [
  'STOCK',
  'FUTURES',
  'FOREX',
  'CRYPTO',
];

const POSITION_EPSILON = 1e-9;
const CRITICAL_FAILURE_DRAWDOWN_THRESHOLD = 0.2;

export const normalizeNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const normalizePercentRatio = (
  value: unknown,
  fallbackPercent: number,
): number => {
  const percent = Number(value);
  const resolvedPercent =
    Number.isFinite(percent) && percent > POSITION_EPSILON
      ? percent
      : fallbackPercent;
  return Math.max(POSITION_EPSILON, resolvedPercent / 100);
};

const normalizeTradingAssetClass = (value: unknown): TradingAssetClass => {
  if (value === 'FUTURES' || value === 'FOREX' || value === 'CRYPTO') {
    return value;
  }
  return 'STOCK';
};

export type ReplayArchive = {
  bars?: ReplayBarLike[];
  snapshot?: {
    fills?: unknown[];
    sessionTradingSettings?: TradingSettings;
    longFinancingChargesTotal?: number;
    shortBorrowChargesTotal?: number;
    cashAdjustments?: Array<{
      bar_index?: unknown;
      barIndex?: unknown;
      amount?: unknown;
    }>;
  };
  tradeRounds?: unknown[];
  equityCurve?: Array<{ ts?: string; value?: unknown }>;
  drawdownCurve?: Array<{ ts?: string; value?: unknown }>;
};

type ReplayCashAdjustmentView = {
  barIndex: number;
  amount: number;
};

export const resolveReplayArchive = (
  project: TrainingProjectRecord,
): ReplayArchive | null => {
  const { replay } = project;
  if (!replay || typeof replay !== 'object') {
    return null;
  }
  return replay as ReplayArchive;
};

const resolveReplayTradingSettings = (
  archive: ReplayArchive | null,
): TradingSettings | null => {
  const settings = archive?.snapshot?.sessionTradingSettings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return null;
  }
  return settings;
};

const resolveMarginRatios = (settings: TradingSettings | null) => {
  const allowLongMarginTrading = Boolean(settings?.allowLongMarginTrading);
  return {
    longInitialRatio: normalizePercentRatio(
      allowLongMarginTrading ? settings?.longInitialMarginRatio : 100,
      100,
    ),
    longMaintenanceRatio: normalizePercentRatio(
      allowLongMarginTrading ? settings?.longMaintenanceMarginRatio : 100,
      100,
    ),
    shortInitialRatio: normalizePercentRatio(
      settings?.shortInitialMarginRatio,
      150,
    ),
    shortMaintenanceRatio: normalizePercentRatio(
      settings?.shortMaintenanceMarginRatio,
      30,
    ),
  };
};

const resolveSessionLeverageMultiple = (
  settings: TradingSettings | null,
): number => {
  if (!settings) {
    return 1;
  }
  const ratios = resolveMarginRatios(settings);
  const longMultiple = settings.allowLongMarginTrading
    ? 1 / ratios.longInitialRatio
    : 1;
  const shortMultiple = settings.allowShortSelling
    ? 1 / ratios.shortInitialRatio
    : 1;
  return Math.max(1, longMultiple, shortMultiple);
};

const parseReplayCashAdjustments = (
  archive: ReplayArchive | null,
): ReplayCashAdjustmentView[] => {
  const raw = Array.isArray(archive?.snapshot?.cashAdjustments)
    ? archive.snapshot.cashAdjustments
    : [];
  return raw
    .map((adjustment): ReplayCashAdjustmentView | null => {
      if (!adjustment || typeof adjustment !== 'object') {
        return null;
      }
      const barIndex = Math.floor(
        normalizeNumber(adjustment.bar_index ?? adjustment.barIndex, Number.NaN),
      );
      const amount = normalizeNumber(adjustment.amount, Number.NaN);
      if (!Number.isFinite(barIndex) || barIndex < 0 || !Number.isFinite(amount)) {
        return null;
      }
      return { barIndex, amount };
    })
    .filter((adjustment): adjustment is ReplayCashAdjustmentView => Boolean(adjustment))
    .sort((left, right) => left.barIndex - right.barIndex);
};

const sumReplayCashAdjustmentCosts = (
  adjustments: ReplayCashAdjustmentView[],
): number =>
  adjustments.reduce(
    (sum, adjustment) => sum + Math.max(0, normalizeNumber(adjustment.amount)),
    0,
  );

type ReplayFillView = {
  side: 'BUY' | 'SELL';
  fillIndex: number;
  fillTime: string;
  fillPrice: number;
  fillQty: number;
  contractMultiplier: number;
  fee: number;
  tax: number;
  slippage: number;
};

const estimatePeakMaintenanceUtilizationRate = ({
  fills,
  archive,
  settings,
  initialCapital,
  forcedLiquidationApplied,
}: {
  fills: ReplayFillView[];
  archive: ReplayArchive | null;
  settings: TradingSettings | null;
  initialCapital: number;
  forcedLiquidationApplied: boolean;
}): number => {
  const bars = Array.isArray(archive?.bars) ? archive.bars : [];
  if (!bars.length || !fills.length || initialCapital <= POSITION_EPSILON) {
    return forcedLiquidationApplied ? 1 : 0;
  }
  const ratios = resolveMarginRatios(settings);
  const orderedFills = [...fills].sort((left, right) => {
    if (left.fillIndex !== right.fillIndex) {
      return left.fillIndex - right.fillIndex;
    }
    return left.fillTime.localeCompare(right.fillTime);
  });

  const cashAdjustments = parseReplayCashAdjustments(archive);
  let cash = initialCapital;
  let positionQty = 0;
  let markExposureQty = 0;
  let fillPointer = 0;
  let adjustmentPointer = 0;
  let peakUtilization = 0;

  for (let barIndex = 0; barIndex < bars.length; barIndex += 1) {
    while (
      fillPointer < orderedFills.length &&
      orderedFills[fillPointer]!.fillIndex <= barIndex
    ) {
      const fill = orderedFills[fillPointer]!;
      const fillQty = Math.max(0, normalizeNumber(fill.fillQty));
      const fillPrice = Math.max(0, normalizeNumber(fill.fillPrice));
      const contractMultiplier = Math.max(Number.EPSILON, normalizeNumber(fill.contractMultiplier, 1));
      const fillCost =
        Math.max(0, normalizeNumber(fill.fee)) +
        Math.max(0, normalizeNumber(fill.tax)) +
        Math.max(0, normalizeNumber(fill.slippage));
      const notional = fillQty * fillPrice * contractMultiplier;
      if (fill.side === 'BUY') {
        cash -= notional + fillCost;
        positionQty += fillQty;
        markExposureQty += fillQty * contractMultiplier;
      } else {
        cash += notional - fillCost;
        positionQty -= fillQty;
        markExposureQty -= fillQty * contractMultiplier;
      }
      fillPointer += 1;
    }
    while (
      adjustmentPointer < cashAdjustments.length &&
      cashAdjustments[adjustmentPointer]!.barIndex <= barIndex
    ) {
      cash -= cashAdjustments[adjustmentPointer]!.amount;
      adjustmentPointer += 1;
    }

    const markPrice = Math.max(
      0,
      normalizeNumber(
        bars[barIndex]?.close,
        normalizeNumber(bars[barIndex]?.open),
      ),
    );
    if (markPrice <= POSITION_EPSILON || Math.abs(positionQty) <= POSITION_EPSILON) {
      continue;
    }
    const notional = Math.abs(markExposureQty) * markPrice;
    const equity = cash + markExposureQty * markPrice;
    const maintenanceRatio =
      positionQty > 0 ? ratios.longMaintenanceRatio : ratios.shortMaintenanceRatio;
    const requiredMaintenanceEquity = notional * maintenanceRatio;
    const utilization =
      equity > POSITION_EPSILON
        ? requiredMaintenanceEquity / equity
        : 1;
    peakUtilization = Math.max(peakUtilization, utilization);
  }

  if (forcedLiquidationApplied) {
    peakUtilization = Math.max(peakUtilization, 1);
  }

  return clamp(peakUtilization, 0, 1.4);
};

type ReplayTradeRoundView = {
  id: string;
  direction: 'LONG' | 'SHORT';
  entryIndex: number;
  closeIndex: number;
  entryTime: string;
  closeTime: string;
  holdBars: number;
  quantity: number;
  entryAvgPrice: number;
  exitAvgPrice: number;
  grossPnl: number;
  pnl: number;
  returnRate: number;
  mfeRate: number;
  maeRate: number;
};

const parseReplayTradeRound = (value: unknown): ReplayTradeRoundView | null => {
  if (!value) {
    return null;
  }
  if (Array.isArray(value)) {
    if (value.length < 13) {
      return null;
    }
    const entryIndex = Math.floor(normalizeNumber(value[1], Number.NaN));
    const closeIndex = Math.floor(normalizeNumber(value[2], Number.NaN));
    const quantity = normalizeNumber(value[3], Number.NaN);
    if (
      !Number.isFinite(entryIndex) ||
      !Number.isFinite(closeIndex) ||
      entryIndex < 0 ||
      closeIndex < entryIndex ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      return null;
    }
    return {
      id: '',
      direction:
        Math.floor(normalizeNumber(value[0], 1)) === -1 ? 'SHORT' : 'LONG',
      entryIndex,
      closeIndex,
      entryTime: typeof value[13] === 'string' ? value[13] : '',
      closeTime: typeof value[14] === 'string' ? value[14] : '',
      holdBars: Math.max(0, closeIndex - entryIndex),
      quantity,
      entryAvgPrice: normalizeNumber(value[4]),
      exitAvgPrice: normalizeNumber(value[5]),
      grossPnl: normalizeNumber(value[6]),
      pnl: normalizeNumber(value[7]),
      returnRate: normalizeNumber(value[8]),
      mfeRate: Math.max(0, normalizeNumber(value[9])),
      maeRate: Math.max(0, normalizeNumber(value[10])),
    };
  }
  if (typeof value !== 'object') {
    return null;
  }
  const source = value as Record<string, unknown>;
  const entryIndex = Math.floor(normalizeNumber(source.entryIndex, Number.NaN));
  const closeIndex = Math.floor(normalizeNumber(source.closeIndex, Number.NaN));
  const quantity = normalizeNumber(source.quantity, Number.NaN);
  if (
    !Number.isFinite(entryIndex) ||
    !Number.isFinite(closeIndex) ||
    entryIndex < 0 ||
    closeIndex < entryIndex ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return null;
  }
  return {
    id:
      typeof source.id === 'string' && source.id.trim()
        ? source.id
        : '',
    direction: source.direction === 'SHORT' ? 'SHORT' : 'LONG',
    entryIndex,
    closeIndex,
    entryTime: typeof source.entryTime === 'string' ? source.entryTime : '',
    closeTime: typeof source.closeTime === 'string' ? source.closeTime : '',
    holdBars: Math.max(
      0,
      Math.floor(normalizeNumber(source.holdBars, closeIndex - entryIndex)),
    ),
    quantity,
    entryAvgPrice: normalizeNumber(source.entryAvgPrice),
    exitAvgPrice: normalizeNumber(source.exitAvgPrice),
    grossPnl: normalizeNumber(source.grossPnl),
    pnl: normalizeNumber(source.pnl),
    returnRate: normalizeNumber(source.returnRate),
    mfeRate: Math.max(0, normalizeNumber(source.mfeRate)),
    maeRate: Math.max(0, normalizeNumber(source.maeRate)),
  };
};

const parseReplayFill = (value: unknown): ReplayFillView | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const source = value as Record<string, unknown>;
  const side =
    source.side === 'BUY' || source.side === 'SELL' ? source.side : null;
  if (!side) {
    return null;
  }
  const fillIndex = Math.floor(
    normalizeNumber(source.fill_index ?? source.fillIndex, Number.NaN),
  );
  const fillPrice = normalizeNumber(
    source.fill_price ?? source.fillPrice,
    Number.NaN,
  );
  const fillQty = normalizeNumber(
    source.fill_qty ?? source.fillQty,
    Number.NaN,
  );
  if (
    !Number.isFinite(fillIndex) ||
    fillIndex < 0 ||
    !Number.isFinite(fillPrice) ||
    !Number.isFinite(fillQty) ||
    fillQty <= 0
  ) {
    return null;
  }
  return {
    side,
    fillIndex,
    fillTime:
      typeof source.fill_time === 'string'
        ? source.fill_time
        : typeof source.fillTime === 'string'
          ? source.fillTime
          : '',
    fillPrice,
    fillQty,
    contractMultiplier: Math.max(
      Number.EPSILON,
      normalizeNumber(source.contract_multiplier ?? source.contractMultiplier, 1),
    ),
    fee: Math.max(0, normalizeNumber(source.fee)),
    tax: Math.max(0, normalizeNumber(source.tax)),
    slippage: Math.max(0, normalizeNumber(source.slippage)),
  };
};

const parseReplayTradeRounds = (project: TrainingProjectRecord): ReplayTradeRoundView[] => {
  const archive = resolveReplayArchive(project);
  if (!archive) {
    return [];
  }
  const storedRounds = Array.isArray(archive.tradeRounds)
    ? archive.tradeRounds
    : [];
  const sourceBars = (Array.isArray(archive.bars) ? archive.bars : []) as ReplayBarLike[];
  const sourceFills = (
    Array.isArray(archive.snapshot?.fills) ? archive.snapshot.fills : []
  ) as ReplayFillLike[];
  const roundsRaw = storedRounds.length
    ? storedRounds
    : deriveReplayTradeRounds({
        bars: sourceBars,
        fills: sourceFills,
      });
  return roundsRaw
    .map((round) => parseReplayTradeRound(round))
    .filter((round): round is ReplayTradeRoundView => Boolean(round))
    .map((round, index) => ({
      ...round,
      id: round.id || `round-${index + 1}`,
    }))
    .sort((left, right) => {
      if (left.entryIndex !== right.entryIndex) {
        return left.entryIndex - right.entryIndex;
      }
      return left.closeIndex - right.closeIndex;
    });
};

const parseReplayFills = (project: TrainingProjectRecord): ReplayFillView[] => {
  const archive = resolveReplayArchive(project);
  const fillsRaw = Array.isArray(archive?.snapshot?.fills)
    ? archive.snapshot.fills
    : [];
  return fillsRaw
    .map((item) => parseReplayFill(item))
    .filter((item): item is ReplayFillView => Boolean(item))
    .sort((left, right) => {
      if (left.fillIndex !== right.fillIndex) {
        return left.fillIndex - right.fillIndex;
      }
      if (left.fillTime !== right.fillTime) {
        return left.fillTime.localeCompare(right.fillTime);
      }
      // Preserve the stored execution sequence for same-bar reversals.
      return 0;
    });
};

const resolveRoundLossCutDelayBars = (
  round: ReplayTradeRoundView,
  archive: ReplayArchive | null,
): number | null => {
  if (!archive || !Array.isArray(archive.bars) || round.pnl >= 0) {
    return null;
  }
  const bars = archive.bars;
  if (!bars.length) {
    return null;
  }
  const entryPrice = Math.max(0, normalizeNumber(round.entryAvgPrice, Number.NaN));
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    return null;
  }
  const startIndex = Math.max(
    0,
    Math.min(round.closeIndex, round.entryIndex + (round.closeIndex > round.entryIndex ? 1 : 0)),
  );
  const endIndex = Math.min(round.closeIndex, bars.length - 1);
  for (let index = startIndex; index <= endIndex; index += 1) {
    const bar = bars[index];
    if (!bar) {
      continue;
    }
    const triggerLoss =
      round.direction === 'SHORT'
        ? normalizeNumber(bar.high) > entryPrice
        : normalizeNumber(bar.low) < entryPrice;
    if (triggerLoss) {
      return Math.max(0, round.closeIndex - index);
    }
  }
  return Math.max(0, round.closeIndex - endIndex);
};

type ReplayReviewEnvironmentContext = {
  marketPresetId: string;
  assetClass: TradingAssetClass;
  tradeSettlementMode: 'T0' | 'T1';
  allowLongMarginTrading: boolean;
  allowShortSelling: boolean;
  leverageMultiple: number;
  usesMakerTaker: boolean;
  fundingRate: number;
};

export type ReplayReviewSessionMetric = {
  id: string;
  project: TrainingProjectRecord;
  detail: TrainingProjectRecord;
  assetClass: TradingAssetClass;
  environment: ReplayReviewEnvironmentContext;
  projectTs: number;
  projectDateKey: string;
  tradeRounds: ReplayTradeRoundView[];
  fills: ReplayFillView[];
  analytics: {
    closedTrades: number;
    winningTrades: number;
    losingTrades: number;
    profitTradeTotal: number;
    lossTradeTotal: number;
    averageHoldBars: number;
    addPositionCount: number;
    reducePositionCount: number;
    fullPositionCount: number;
    maxConsecutiveWins: number;
    maxConsecutiveLosses: number;
    totalSlippage: number;
    totalFeesFromFills: number;
  };
  grossPnl: number;
  slippageCost: number;
  feeAndTaxCost: number;
  borrowCost: number;
  decisionAverageSeconds: number | null;
  tradeWinRate: number;
  returnRate: number;
  maxDrawdownRate: number;
  sessionProfitFactor: number | null;
  sessionProfitFactorState: ReplayRatioState;
  expectancyPerTrade: number;
  peakMaintenanceUtilizationRate: number;
  criticalFailure: boolean;
  lossCutDelayBarsTotal: number;
  lossCutDelayBarsCount: number;
};

const resolveProjectSortTimestamp = (project: TrainingProjectRecord): number => {
  const createdAt = parseTimestampMs(project.createdAt || '');
  if (Number.isFinite(createdAt)) {
    return createdAt;
  }
  const updatedAt = parseTimestampMs(project.updatedAt || '');
  return Number.isFinite(updatedAt) ? updatedAt : 0;
};

const resolveProjectDateKey = (project: TrainingProjectRecord): string =>
  toMarketDateKey(project.createdAt || project.updatedAt || '') || '';

const deriveSessionMetricFromProjection = (
  project: TrainingProjectRecord,
): ReplayReviewSessionMetric | null => {
  const projection = project.reviewProjection;
  if (!projection) {
    return null;
  }
  const sessionProfitFactor = deriveReplayProfitFactor(
    projection.analytics.profitTradeTotal,
    projection.analytics.lossTradeTotal,
  );
  return {
    id: project.id,
    project,
    detail: project,
    assetClass: projection.assetClass,
    environment: {
      marketPresetId: projection.marketPresetId,
      assetClass: projection.assetClass,
      tradeSettlementMode: projection.tradeSettlementMode,
      allowLongMarginTrading: projection.allowLongMarginTrading,
      allowShortSelling: projection.allowShortSelling,
      leverageMultiple: projection.leverageMultiple,
      usesMakerTaker: projection.usesMakerTaker,
      fundingRate: projection.fundingRate,
    },
    projectTs: resolveProjectSortTimestamp(project),
    projectDateKey: resolveProjectDateKey(project),
    tradeRounds: [],
    fills: [],
    analytics: projection.analytics,
    grossPnl: projection.grossPnl,
    slippageCost: projection.analytics.totalSlippage,
    feeAndTaxCost: projection.feeAndTaxCost,
    borrowCost: projection.borrowCost,
    decisionAverageSeconds:
      projection.decisionAverageSeconds > 0
        ? projection.decisionAverageSeconds
        : null,
    tradeWinRate: projection.tradeWinRate,
    returnRate: normalizeNumber(project.profitRate),
    maxDrawdownRate: Math.max(0, normalizeNumber(project.summary.maxDrawdownRate)),
    sessionProfitFactor: sessionProfitFactor.value,
    sessionProfitFactorState: sessionProfitFactor.state,
    expectancyPerTrade: projection.expectancyPerTrade,
    peakMaintenanceUtilizationRate: projection.peakMaintenanceUtilizationRate,
    criticalFailure: projection.criticalFailure,
    lossCutDelayBarsTotal: projection.lossCutDelayBarsTotal,
    lossCutDelayBarsCount: projection.lossCutDelayBarsCount,
  };
};

export const deriveSessionMetric = (
  project: TrainingProjectRecord,
): ReplayReviewSessionMetric | null => {
  const projected = deriveSessionMetricFromProjection(project);
  if (projected) {
    return projected;
  }
  const archive = resolveReplayArchive(project);
  if (!archive) {
    return null;
  }
  const settings = resolveReplayTradingSettings(archive);
  if (!settings) {
    return null;
  }
  const assetClass = normalizeTradingAssetClass(settings.assetClass);
  const tradeRounds = parseReplayTradeRounds(project);
  const fills = parseReplayFills(project);
  const analyticsFull = calcSessionTradeAnalytics(
    fills.map((fill) => ({
      side: fill.side,
      fill_index: fill.fillIndex,
      fill_time: fill.fillTime,
      fill_price: fill.fillPrice,
      fill_qty: fill.fillQty,
      contract_multiplier: fill.contractMultiplier,
      fee: fill.fee,
      tax: fill.tax,
      slippage: fill.slippage,
    })),
    Math.max(0, normalizeNumber(project.initialTotal, project.summary.initialAsset)),
  );
  const analytics = {
    closedTrades: analyticsFull.closedTrades,
    winningTrades: analyticsFull.winningTrades,
    losingTrades: analyticsFull.losingTrades,
    profitTradeTotal: analyticsFull.profitTradeTotal,
    lossTradeTotal: analyticsFull.lossTradeTotal,
    averageHoldBars: analyticsFull.averageHoldBars,
    addPositionCount: analyticsFull.addPositionCount,
    reducePositionCount: analyticsFull.reducePositionCount,
    fullPositionCount: analyticsFull.fullPositionCount,
    maxConsecutiveWins: analyticsFull.maxConsecutiveWins,
    maxConsecutiveLosses: analyticsFull.maxConsecutiveLosses,
    totalSlippage: analyticsFull.totalSlippage,
    totalFeesFromFills: analyticsFull.totalFeesFromFills,
  };
  const grossPnl = tradeRounds.reduce(
    (sum, round) => sum + normalizeNumber(round.grossPnl),
    0,
  );
  const feeAndTaxCost = fills.reduce(
    (sum, fill) => sum + fill.fee + fill.tax,
    0,
  );
  const cashAdjustments = parseReplayCashAdjustments(archive);
  const borrowCost = cashAdjustments.length
    ? sumReplayCashAdjustmentCosts(cashAdjustments)
    : Math.max(0, normalizeNumber(archive.snapshot?.shortBorrowChargesTotal)) +
      Math.max(0, normalizeNumber(archive.snapshot?.longFinancingChargesTotal));
  const decisionCount = Math.max(0, normalizeNumber(project.summary.decisionCount));
  const decisionSeconds = Math.max(
    0,
    normalizeNumber(project.summary.decisionSecondsUsed),
  );
  const maxDrawdownRate = Math.max(0, project.summary.maxDrawdownRate);
  const netPnl = normalizeNumber(project.totalPnl);
  const sessionProfitFactor = deriveReplayProfitFactor(
    analytics.profitTradeTotal,
    analytics.lossTradeTotal,
  );
  const lossCutDelayBars = tradeRounds
    .map((round) => resolveRoundLossCutDelayBars(round, archive))
    .filter((value): value is number => Number.isFinite(value));
  const initialCapital = Math.max(
    0,
    normalizeNumber(project.initialTotal, project.summary.initialAsset),
  );
  const expectancyPerTrade =
    analytics.closedTrades > 0 ? netPnl / analytics.closedTrades : netPnl;
  const peakMaintenanceUtilizationRate = estimatePeakMaintenanceUtilizationRate({
    fills,
    archive,
    settings,
    initialCapital,
    forcedLiquidationApplied:
      false,
  });
  const environment: ReplayReviewEnvironmentContext = {
    marketPresetId: String(settings.marketPresetId || '').trim(),
    assetClass,
    tradeSettlementMode: settings.tradeSettlementMode === 'T1' ? 'T1' : 'T0',
    allowLongMarginTrading: Boolean(settings.allowLongMarginTrading),
    allowShortSelling: Boolean(settings.allowShortSelling),
    leverageMultiple: resolveSessionLeverageMultiple(settings),
    usesMakerTaker:
      normalizeNumber(settings.makerFeeRate) > POSITION_EPSILON ||
      normalizeNumber(settings.takerFeeRate) > POSITION_EPSILON,
    fundingRate: normalizeNumber(settings.fundingRate),
  };
  return {
    id: project.id,
    project,
    detail: project,
    assetClass,
    environment,
    projectTs: resolveProjectSortTimestamp(project),
    projectDateKey: resolveProjectDateKey(project),
    tradeRounds,
    fills,
    analytics,
    grossPnl,
    slippageCost: analytics.totalSlippage,
    feeAndTaxCost,
    borrowCost,
    decisionAverageSeconds:
      decisionCount > 0 ? decisionSeconds / decisionCount : null,
    tradeWinRate:
      analytics.closedTrades > 0 ? analytics.winningTrades / analytics.closedTrades : 0,
    returnRate: normalizeNumber(project.profitRate),
    maxDrawdownRate,
    sessionProfitFactor: sessionProfitFactor.value,
    sessionProfitFactorState: sessionProfitFactor.state,
    expectancyPerTrade,
    peakMaintenanceUtilizationRate,
    criticalFailure:
      maxDrawdownRate >= CRITICAL_FAILURE_DRAWDOWN_THRESHOLD ||
      normalizeNumber(project.finalEquity) <= 0,
    lossCutDelayBarsTotal: lossCutDelayBars.reduce((sum, value) => sum + value, 0),
    lossCutDelayBarsCount: lossCutDelayBars.length,
  };
};
