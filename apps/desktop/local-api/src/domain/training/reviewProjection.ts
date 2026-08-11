// SPDX-License-Identifier: GPL-3.0-only

import {
  deriveReplayProfitFactor,
  deriveReplayTradeRounds,
  type ReplayBarLike,
  type ReplayFillLike,
  type ReplayRatioState,
} from "@zinuto/shared/replay";
import type { TradingAssetClass, TradingSettings } from "@zinuto/shared/trading";
import {
  calcSessionTradeAnalytics,
  type ReplayFill,
  type ReplayPayload,
} from "./statsDomain.js";

const POSITION_EPSILON = 1e-9;
const CRITICAL_FAILURE_DRAWDOWN_THRESHOLD = 0.2;

export type TrainingReviewProjectionMetrics = {
  marketPresetId: string;
  assetClass: TradingAssetClass;
  tradeSettlementMode: "T0" | "T1";
  allowLongMarginTrading: boolean;
  allowShortSelling: boolean;
  leverageMultiple: number;
  usesMakerTaker: boolean;
  fundingRate: number;
  grossPnl: number;
  feeAndTaxCost: number;
  borrowCost: number;
  longClosedTrades: number;
  longWinningTrades: number;
  tradeWinRate: number;
  decisionAverageSeconds: number;
  sessionProfitFactor: number | null;
  sessionProfitFactorState?: ReplayRatioState;
  expectancyPerTrade: number;
  peakMaintenanceUtilizationRate: number;
  marginMinBufferRate: number;
  trendAligned: boolean;
  criticalFailure: boolean;
  lossCutDelayBarsTotal: number;
  lossCutDelayBarsCount: number;
};

type ReplayTradeRoundView = {
  direction: "LONG" | "SHORT";
  entryIndex: number;
  closeIndex: number;
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

type ReplayFillView = {
  side: "BUY" | "SELL";
  fillIndex: number;
  fillPrice: number;
  fillQty: number;
  contractMultiplier: number;
  fee: number;
  tax: number;
  slippage: number;
};

type ReplayCashAdjustmentView = {
  barIndex: number;
  amount: number;
};

type ReviewProjectionSource = {
  initialTotal: number;
  totalPnl: number;
  finalEquity: number;
  totalTrades: number;
  profitRate: number;
  maxDrawdownRate: number;
  decisionCount: number;
  decisionSecondsUsed: number;
  replay?: Record<string, unknown>;
};

const normalizeNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const toFixedRound = (value: number, digits = 8): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(digits));
};

const normalizeReplayRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

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

const resolveReplayTradingSettings = (
  replay: Record<string, unknown> | null,
): TradingSettings | null => {
  const snapshot = normalizeReplayRecord(replay?.snapshot);
  const settings = normalizeReplayRecord(snapshot?.sessionTradingSettings);
  return settings as TradingSettings | null;
};

const normalizeTradingAssetClass = (value: unknown): TradingAssetClass => {
  if (value === "FUTURES" || value === "FOREX" || value === "CRYPTO") {
    return value;
  }
  return "STOCK";
};

const resolveTradeSettlementMode = (value: unknown): "T0" | "T1" =>
  value === "T1" ? "T1" : "T0";

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

const parseReplayFill = (value: unknown): ReplayFillView | null => {
  const source = normalizeReplayRecord(value);
  if (!source) {
    return null;
  }
  const side =
    source.side === "BUY" || source.side === "SELL" ? source.side : null;
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

const parseReplayFillsView = (
  replay: Record<string, unknown> | null,
): ReplayFillView[] => {
  const snapshot = normalizeReplayRecord(replay?.snapshot);
  const fillsRaw = Array.isArray(snapshot?.fills) ? snapshot?.fills : [];
  return fillsRaw
    .map((item) => parseReplayFill(item))
    .filter((item): item is ReplayFillView => Boolean(item))
    .sort((left, right) => {
      if (left.fillIndex !== right.fillIndex) {
        return left.fillIndex - right.fillIndex;
      }
      // Equal coordinates retain the archived execution sequence.
      return 0;
    });
};

const parseReplayCashAdjustmentsView = (
  replay: Record<string, unknown> | null,
): ReplayCashAdjustmentView[] => {
  const snapshot = normalizeReplayRecord(replay?.snapshot);
  const raw = Array.isArray(snapshot?.cashAdjustments)
    ? snapshot.cashAdjustments
    : [];
  return raw
    .map((item): ReplayCashAdjustmentView | null => {
      const source = normalizeReplayRecord(item);
      if (!source) {
        return null;
      }
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

const parseReplayTradeRound = (value: unknown): ReplayTradeRoundView | null => {
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
      direction:
        Math.floor(normalizeNumber(value[0], 1)) === -1 ? "SHORT" : "LONG",
      entryIndex,
      closeIndex,
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

  const source = normalizeReplayRecord(value);
  if (!source) {
    return null;
  }
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
    direction: source.direction === "SHORT" ? "SHORT" : "LONG",
    entryIndex,
    closeIndex,
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

const parseReplayTradeRounds = (
  replay: Record<string, unknown> | null,
  fills: ReplayFillView[],
): ReplayTradeRoundView[] => {
  const storedRounds = Array.isArray(replay?.tradeRounds) ? replay.tradeRounds : [];
  const bars = Array.isArray(replay?.bars) ? (replay.bars as ReplayBarLike[]) : [];
  const fillLikes: ReplayFillLike[] = fills.map((fill) => ({
    side: fill.side,
    fill_index: fill.fillIndex,
    fill_time: "",
    fill_price: fill.fillPrice,
    fill_qty: fill.fillQty,
    contract_multiplier: fill.contractMultiplier,
    fee: fill.fee,
    tax: fill.tax,
    slippage: fill.slippage,
  }));
  const roundsRaw = storedRounds.length
    ? storedRounds
    : deriveReplayTradeRounds({
        bars,
        fills: fillLikes,
      });
  return roundsRaw
    .map((round) => parseReplayTradeRound(round))
    .filter((round): round is ReplayTradeRoundView => Boolean(round))
    .sort((left, right) => {
      if (left.entryIndex !== right.entryIndex) {
        return left.entryIndex - right.entryIndex;
      }
      return left.closeIndex - right.closeIndex;
    });
};

const resolveLossCutDelayBars = (
  round: ReplayTradeRoundView,
  replay: Record<string, unknown> | null,
): number | null => {
  const bars = Array.isArray(replay?.bars) ? replay.bars : [];
  if (!bars.length || round.pnl >= 0) {
    return null;
  }
  const entryPrice = Math.max(
    0,
    normalizeNumber(round.entryAvgPrice, Number.NaN),
  );
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    return null;
  }
  const startIndex = Math.max(
    0,
    Math.min(round.closeIndex, round.entryIndex + (round.closeIndex > round.entryIndex ? 1 : 0)),
  );
  const endIndex = Math.min(round.closeIndex, bars.length - 1);
  for (let index = startIndex; index <= endIndex; index += 1) {
    const bar = normalizeReplayRecord(bars[index]);
    if (!bar) {
      continue;
    }
    const triggerLoss =
      round.direction === "SHORT"
        ? normalizeNumber(bar.high) > entryPrice
        : normalizeNumber(bar.low) < entryPrice;
    if (triggerLoss) {
      return Math.max(0, round.closeIndex - index);
    }
  }
  return Math.max(0, round.closeIndex - endIndex);
};

const resolveMarginDiagnostics = ({
  fills,
  cashAdjustments,
  settings,
  initialCapital,
}: {
  fills: ReplayFillView[];
  cashAdjustments: ReplayCashAdjustmentView[];
  settings: TradingSettings | null;
  initialCapital: number;
}): { maxUtilizationRate: number; minBufferRate: number } => {
  if (!fills.length || initialCapital <= POSITION_EPSILON) {
    return {
      maxUtilizationRate: 0,
      minBufferRate: 1,
    };
  }
  const ratios = resolveMarginRatios(settings);
  let cash = initialCapital;
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
      longNotional * ratios.longMaintenanceRatio +
      shortNotional * ratios.shortMaintenanceRatio;

    if (requiredMaintenanceEquity <= POSITION_EPSILON) {
      return;
    }
    const utilizationRate =
      equity <= POSITION_EPSILON
        ? 1
        : clamp(
            requiredMaintenanceEquity / Math.max(POSITION_EPSILON, equity),
            0,
            1.5,
          );
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
    applyCashAdjustmentsThrough(fill.fillIndex);
    const fillQty = Math.max(0, normalizeNumber(fill.fillQty));
    const fillPrice = Math.max(POSITION_EPSILON, normalizeNumber(fill.fillPrice));
    if (fillQty <= POSITION_EPSILON) {
      continue;
    }
    lastMarkPrice = fillPrice;
    const contractMultiplier = Math.max(Number.EPSILON, normalizeNumber(fill.contractMultiplier, 1));
    const gross = fillQty * fillPrice * contractMultiplier;
    const tradingCost =
      Math.max(0, normalizeNumber(fill.fee)) +
      Math.max(0, normalizeNumber(fill.tax)) +
      Math.max(0, normalizeNumber(fill.slippage));
    if (fill.side === "BUY") {
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

export const buildTrainingReviewProjectionMetrics = (
  source: ReviewProjectionSource,
): TrainingReviewProjectionMetrics | null => {
  const replay = normalizeReplayRecord(source.replay);
  const settings = resolveReplayTradingSettings(replay);
  if (!replay || !settings) {
    return null;
  }

  const fills = parseReplayFillsView(replay);
  const tradeRounds = parseReplayTradeRounds(replay, fills);
  const initialTotal = Math.max(0, normalizeNumber(source.initialTotal));
  const replayPayload: ReplayPayload = {
    snapshot: {
      fills: fills.map((fill) => ({
        side: fill.side,
        fill_index: fill.fillIndex,
        fill_time: "",
        fill_price: fill.fillPrice,
        fill_qty: fill.fillQty,
        contract_multiplier: fill.contractMultiplier,
        fee: fill.fee,
        tax: fill.tax,
        slippage: fill.slippage,
      })) as ReplayFill[],
    },
    tradeRounds: tradeRounds,
  };
  const analytics = calcSessionTradeAnalytics(
    replayPayload.snapshot?.fills ?? [],
    initialTotal,
  );
  const longClosedTrades = analytics.records.filter(
    (record) => record.direction === "LONG",
  ).length;
  const longWinningTrades = analytics.records.filter(
    (record) => record.direction === "LONG" && record.pnl > 0,
  ).length;
  const grossPnl = tradeRounds.reduce(
    (sum, round) => sum + normalizeNumber(round.grossPnl),
    0,
  );
  const feeAndTaxCost = fills.reduce(
    (sum, fill) =>
      sum +
      Math.max(0, normalizeNumber(fill.fee)) +
      Math.max(0, normalizeNumber(fill.tax)),
    0,
  );
  const snapshot = normalizeReplayRecord(replay.snapshot);
  const cashAdjustments = parseReplayCashAdjustmentsView(replay);
  const borrowCost = cashAdjustments.length
    ? cashAdjustments.reduce(
        (sum, adjustment) => sum + Math.max(0, adjustment.amount),
        0,
      )
    : Math.max(0, normalizeNumber(snapshot?.shortBorrowChargesTotal)) +
      Math.max(0, normalizeNumber(snapshot?.longFinancingChargesTotal));
  const decisionCount = Math.max(0, normalizeNumber(source.decisionCount));
  const decisionSecondsUsed = Math.max(
    0,
    normalizeNumber(source.decisionSecondsUsed),
  );
  const sessionProfitFactor = deriveReplayProfitFactor(
    analytics.profitTradeTotal,
    analytics.lossTradeTotal,
  );
  const expectancyPerTrade =
    analytics.closedTrades > 0
      ? normalizeNumber(source.totalPnl) / analytics.closedTrades
      : normalizeNumber(source.totalPnl);
  const marginDiagnostics = resolveMarginDiagnostics({
    fills,
    cashAdjustments,
    settings,
    initialCapital: initialTotal,
  });
  const trendAligned =
    normalizeNumber(source.profitRate) > 0 &&
    analytics.averageHoldBars >= 4 &&
    (sessionProfitFactor.state === "POSITIVE_INFINITY" ||
      (sessionProfitFactor.value ?? 0) >= 1);
  const lossCutDelayBars = tradeRounds
    .map((round) => resolveLossCutDelayBars(round, replay))
    .filter((value): value is number => Number.isFinite(value));
  const assetClass = normalizeTradingAssetClass(settings.assetClass);
  const marketPresetId = String(settings.marketPresetId ?? "")
    .trim()
    .toUpperCase();

  return {
    marketPresetId,
    assetClass,
    tradeSettlementMode: resolveTradeSettlementMode(settings.tradeSettlementMode),
    allowLongMarginTrading: Boolean(settings.allowLongMarginTrading),
    allowShortSelling: Boolean(settings.allowShortSelling),
    leverageMultiple: toFixedRound(resolveSessionLeverageMultiple(settings), 6),
    usesMakerTaker:
      assetClass !== "STOCK" &&
      (normalizeNumber(settings.makerFeeRate) > POSITION_EPSILON ||
        normalizeNumber(settings.takerFeeRate) > POSITION_EPSILON),
    fundingRate: toFixedRound(normalizeNumber(settings.fundingRate), 8),
    grossPnl: toFixedRound(grossPnl, 8),
    feeAndTaxCost: toFixedRound(feeAndTaxCost, 8),
    borrowCost: toFixedRound(borrowCost, 8),
    longClosedTrades,
    longWinningTrades,
    tradeWinRate:
      analytics.closedTrades > 0
        ? toFixedRound(analytics.winningTrades / analytics.closedTrades, 8)
        : 0,
    decisionAverageSeconds:
      decisionCount > 0 ? toFixedRound(decisionSecondsUsed / decisionCount, 8) : 0,
    sessionProfitFactor:
      sessionProfitFactor.value === null
        ? null
        : toFixedRound(sessionProfitFactor.value, 8),
    sessionProfitFactorState: sessionProfitFactor.state,
    expectancyPerTrade: toFixedRound(expectancyPerTrade, 8),
    peakMaintenanceUtilizationRate: marginDiagnostics.maxUtilizationRate,
    marginMinBufferRate: marginDiagnostics.minBufferRate,
    trendAligned,
    criticalFailure:
      Math.max(0, normalizeNumber(source.maxDrawdownRate)) >=
        CRITICAL_FAILURE_DRAWDOWN_THRESHOLD ||
      normalizeNumber(source.finalEquity) <= 0,
    lossCutDelayBarsTotal: toFixedRound(
      lossCutDelayBars.reduce((sum, value) => sum + value, 0),
      8,
    ),
    lossCutDelayBarsCount: lossCutDelayBars.length,
  };
};
