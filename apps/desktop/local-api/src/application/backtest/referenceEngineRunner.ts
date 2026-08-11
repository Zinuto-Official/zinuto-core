// SPDX-License-Identifier: GPL-3.0-only

import {
  compileCustomIndicatorScript,
  executeCustomIndicatorScript,
} from '../customIndicatorRuntimeService.js';
import { deriveBacktestSignals } from './signalSemantics.js';
import { runBacktestReferenceEngine } from './referenceEngine.js';
import { buildParameterOverrides } from './backtestRuntimeParameters.js';
import { attachExactBacktestMetrics } from './backtestMetricsPersistence.js';
import { downsampleBacktestResultEquity } from './equityDownsample.js';
import {
  toFailedIssue,
  toSkippedIssue,
  type BacktestFailedSymbolReason,
  type BacktestSkippedSymbolReason,
  type BacktestSymbolIssue,
} from './backtestSymbolIssues.js';
import type { OhlcvBar } from '../../domain/models.js';
import type {
  BacktestConfig,
  BacktestInstrumentCandidate,
  BacktestInstrumentRunResult,
} from './types.js';

export type CompiledBacktestStrategy = NonNullable<
  ReturnType<typeof compileCustomIndicatorScript>['state']
>['compiled'];

export type BacktestInstrumentRunOutcome =
  | {
    status: 'COMPLETED';
    result: BacktestInstrumentRunResult;
  }
  | {
    status: 'SKIPPED';
    issue: BacktestSymbolIssue & { reason: BacktestSkippedSymbolReason };
  }
  | {
    status: 'FAILED';
    issue: BacktestSymbolIssue & { reason: BacktestFailedSymbolReason };
  };

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? '').trim();
};

export const compileBacktestReferenceStrategy = (input: {
  source: string;
  parameterInputs?: Record<string, string>;
  displayName: string;
}): CompiledBacktestStrategy => {
  const compileResult = compileCustomIndicatorScript({
    source: input.source,
    parameterInputs: input.parameterInputs,
    displayName: input.displayName,
  });
  if (!compileResult.state) {
    throw new Error('BACKTEST_STRATEGY_COMPILE_FAILED');
  }
  return compileResult.state.compiled;
};

export const runBacktestReferenceInstrumentFromBars = (
  input: {
    config: BacktestConfig;
    instrument: BacktestInstrumentCandidate;
    bars: OhlcvBar[];
    compiled: CompiledBacktestStrategy;
  },
): BacktestInstrumentRunOutcome => {
  const { config, instrument, bars, compiled } = input;
  if (!bars.length) {
    return {
      status: 'SKIPPED',
      issue: toSkippedIssue(instrument, 'NO_BARS'),
    };
  }

  const executionResult = executeCustomIndicatorScript({
    compiled,
    input: {
      bars: bars.map((bar) => ({
        time: bar.ts,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      })),
      parameterOverrides: buildParameterOverrides(config.parameterInputs),
    },
  });
  if (!executionResult.ok) {
    const firstError = executionResult.errors[0];
    return {
      status: 'FAILED',
      issue: toFailedIssue(
        instrument,
        'RUNTIME_ERROR',
        firstError?.code || 'BACKTEST_STRATEGY_RUNTIME_FAILED',
      ),
    };
  }

  const signals = deriveBacktestSignals(executionResult.outputs, bars.length);
  try {
    const result = runBacktestReferenceEngine(
      {
        config,
        instrument: {
          ...instrument,
          barCount: bars.length,
        },
        bars,
        signals: signals.signals,
        priceMode: config.signalExecutionMode ?? config.priceMode,
      },
      signals.conflicts,
    );
    return {
      status: 'COMPLETED',
      result: downsampleBacktestResultEquity(
        attachExactBacktestMetrics(result, config, bars),
      ),
    };
  } catch (error) {
    return {
      status: 'FAILED',
      issue: toFailedIssue(
        instrument,
        'RUNTIME_ERROR',
        toErrorMessage(error).slice(0, 240) || 'BACKTEST_STRATEGY_RUNTIME_FAILED',
      ),
    };
  }
};
