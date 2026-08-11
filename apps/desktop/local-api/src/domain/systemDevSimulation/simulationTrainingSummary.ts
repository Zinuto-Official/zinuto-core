// SPDX-License-Identifier: GPL-3.0-only

import type { TrainingSummaryPayload } from "../training/summary.js";
import type { ReplayArchive, ReplayCurvePoint } from "./sharedDomain.js";
import { EPSILON } from "./simulationRandomUtilities.js";

const calcMaxDrawdownRate = (equityCurve: ReplayCurvePoint[]): number => {
  let peak = 0;
  let maxRate = 0;
  equityCurve.forEach((point) => {
    const value = Number(point?.value);
    if (!Number.isFinite(value)) {
      return;
    }
    if (value > peak) {
      peak = value;
      return;
    }
    if (peak <= EPSILON) {
      return;
    }
    const drawdownRate = (peak - value) / peak;
    if (drawdownRate > maxRate) {
      maxRate = drawdownRate;
    }
  });
  return maxRate;
};

export const buildTrainingSummaryFromReplay = (
  replay: ReplayArchive,
  initialCapital: number,
): TrainingSummaryPayload => {
  const bars = Array.isArray(replay.bars) ? replay.bars : [];
  const fills = Array.isArray(replay.snapshot?.fills)
    ? replay.snapshot.fills
    : [];
  const positions = Array.isArray(replay.snapshot?.positions)
    ? replay.snapshot.positions
    : [];
  const endingAsset = Number.isFinite(Number(replay.finalEquity))
    ? Number(replay.finalEquity)
    : initialCapital;
  const totalPnl = endingAsset - initialCapital;
  const cashAdjustmentCost = Array.isArray(replay.snapshot?.cashAdjustments)
    ? replay.snapshot.cashAdjustments.reduce<number>((sum, adjustment) => {
        const amount = Number(adjustment?.amount);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0)
    : [
        replay.snapshot?.shortBorrowChargesTotal,
        replay.snapshot?.longFinancingChargesTotal,
      ].reduce<number>((sum, amount) => {
        const normalizedAmount = Number(amount);
        return sum + (Number.isFinite(normalizedAmount) ? normalizedAmount : 0);
      }, 0);
  const tradingCost =
    fills.reduce((sum, fill) => {
      const fee = Number(fill?.fee);
      const tax = Number(fill?.tax);
      const slippage = Number(fill?.slippage);
      return (
        sum +
        (Number.isFinite(fee) ? fee : 0) +
        (Number.isFinite(tax) ? tax : 0) +
        (Number.isFinite(slippage) ? slippage : 0)
      );
    }, 0) + cashAdjustmentCost;
  const investedAmount = fills.reduce((sum, fill) => {
    const price = Number(fill?.fill_price);
    const qty = Number(fill?.fill_qty);
    const contractMultiplier = Number(fill?.contract_multiplier);
    if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) {
      return sum;
    }
    return (
      sum +
      price *
        qty *
        (Number.isFinite(contractMultiplier) && contractMultiplier > 0
          ? contractMultiplier
          : 1)
    );
  }, 0);
  const unrealizedPnl = positions.reduce((sum, position) => {
    const value = Number(position?.unrealizedPnl);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const realizedPnl = totalPnl - unrealizedPnl;
  const maxDrawdownAmount = Array.isArray(replay.drawdownCurve)
    ? replay.drawdownCurve.reduce((max, point) => {
        const value = Number(point?.value);
        return Number.isFinite(value) ? Math.max(max, value) : max;
      }, 0)
    : 0;
  const equityCurve = Array.isArray(replay.equityCurve)
    ? replay.equityCurve
    : [];
  const maxDrawdownRate = equityCurve.length
    ? calcMaxDrawdownRate(equityCurve)
    : initialCapital > EPSILON
      ? maxDrawdownAmount / initialCapital
      : 0;
  const startDate = bars[0]?.ts ? String(bars[0].ts).slice(0, 10) : null;
  const endDate = bars[bars.length - 1]?.ts
    ? String(bars[bars.length - 1].ts).slice(0, 10)
    : null;
  const startMs = startDate ? new Date(startDate).getTime() : Number.NaN;
  const endMs = endDate ? new Date(endDate).getTime() : Number.NaN;
  const durationDays =
    Number.isFinite(startMs) && Number.isFinite(endMs)
      ? Math.max(1, Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1)
      : 0;
  return {
    initialAsset: Number(initialCapital.toFixed(6)),
    endingAsset: Number(endingAsset.toFixed(6)),
    assetReturnRate:
      initialCapital > EPSILON
        ? Number((totalPnl / initialCapital).toFixed(8))
        : 0,
    durationDays,
    startDate,
    endDate,
    buyCount: fills.filter((fill) => fill?.side === "BUY").length,
    sellCount: fills.filter((fill) => fill?.side === "SELL").length,
    totalTrades: fills.length,
    investedAmount: Number(investedAmount.toFixed(6)),
    tradingCost: Number(tradingCost.toFixed(6)),
    realizedPnl: Number(realizedPnl.toFixed(6)),
    unrealizedPnl: Number(unrealizedPnl.toFixed(6)),
    totalPnl: Number(totalPnl.toFixed(6)),
    profitRate:
      initialCapital > EPSILON
        ? Number((totalPnl / initialCapital).toFixed(8))
        : 0,
    maxDrawdownRate: Number(maxDrawdownRate.toFixed(8)),
    maxDrawdownAmount: Number(maxDrawdownAmount.toFixed(6)),
    decisionSecondsUsed: 0,
    decisionCount: 0,
  };
};
