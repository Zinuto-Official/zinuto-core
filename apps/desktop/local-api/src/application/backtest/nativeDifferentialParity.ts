// SPDX-License-Identifier: GPL-3.0-only

import { appError } from '../../kernel/appError.js';
import type { BacktestInstrumentRunOutcome } from './referenceEngineRunner.js';
import type { BacktestInstrumentRunResult } from './types.js';

export const BACKTEST_EVALUATOR_SEMANTICS_VERSION = 'backtest-evaluator-v1';

const canonicalizeSummary = (
  summary: BacktestInstrumentRunResult['result']['summary'],
): Record<string, unknown> => {
  const {
    engine: _engine,
    engineVersion: _engineVersion,
    nativeWorkers: _nativeWorkers,
    durationMs: _durationMs,
    equityCurveSampled: _equityCurveSampled,
    ...semanticSummary
  } = summary as Record<string, unknown>;
  return semanticSummary;
};

export const canonicalizeBacktestDifferentialResult = (
  item: BacktestInstrumentRunResult,
): unknown => ({
  instrument: {
    instrumentId: item.instrument.instrumentId,
    symbol: item.instrument.symbol,
    baseTimeframe: item.instrument.baseTimeframe,
  },
  result: {
    ...item.result,
    summary: canonicalizeSummary(item.result.summary),
  },
  fills: item.fills.map((fill) => ({
    instrumentId: fill.instrumentId,
    symbol: fill.symbol,
    orderId: fill.orderId,
    fillIndex: fill.fillIndex,
    fillTime: fill.fillTime,
    side: fill.side,
    price: fill.price,
    qty: fill.qty,
    gross: fill.gross,
    fee: fill.fee,
    tax: fill.tax,
    slippage: fill.slippage,
  })),
  equityCurve: item.equityCurve.map((point) => ({
    instrumentId: point.instrumentId,
    symbol: point.symbol,
    barIndex: point.barIndex,
    barTime: point.barTime,
    equity: point.equity,
    drawdown: point.drawdown,
  })),
  conflicts: item.conflicts,
});

export const assertNativeBacktestDifferentialParity = (input: {
  nativeResults: readonly BacktestInstrumentRunResult[];
  referenceOutcomes: readonly BacktestInstrumentRunOutcome[];
}): void => {
  const referenceResults = input.referenceOutcomes.flatMap((outcome) =>
    outcome.status === 'COMPLETED' ? [outcome.result] : [],
  );
  const canonicalNative = new Map(
    input.nativeResults.map((item) => [
      item.instrument.instrumentId,
      JSON.stringify(canonicalizeBacktestDifferentialResult(item)),
    ]),
  );
  const canonicalReference = new Map(
    referenceResults.map((item) => [
      item.instrument.instrumentId,
      JSON.stringify(canonicalizeBacktestDifferentialResult(item)),
    ]),
  );
  const instrumentIds = Array.from(
    new Set([...canonicalNative.keys(), ...canonicalReference.keys()]),
  ).sort();
  const mismatch = instrumentIds.find(
    (instrumentId) => canonicalNative.get(instrumentId) !== canonicalReference.get(instrumentId),
  );
  if (
    mismatch
    || canonicalNative.size !== input.nativeResults.length
    || canonicalReference.size !== referenceResults.length
    || input.referenceOutcomes.some((outcome) => outcome.status !== 'COMPLETED')
  ) {
    throw appError('BACKTEST_NATIVE_DIFFERENTIAL_MISMATCH', {
      semanticsVersion: BACKTEST_EVALUATOR_SEMANTICS_VERSION,
      instrumentId: mismatch ?? null,
      nativeCompleted: input.nativeResults.length,
      referenceCompleted: referenceResults.length,
      referenceOutcomes: input.referenceOutcomes.length,
    });
  }
};
