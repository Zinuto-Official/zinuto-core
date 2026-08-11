// SPDX-License-Identifier: GPL-3.0-only

import type {
  BacktestInstrumentCandidate,
} from './types.js';

export type BacktestSkippedSymbolReason = 'NO_BARS';
export type BacktestFailedSymbolReason = 'HYDRATION_FAILED' | 'RUNTIME_ERROR';

export type BacktestSymbolIssue = {
  instrumentId: string;
  symbol: string;
  reason: BacktestSkippedSymbolReason | BacktestFailedSymbolReason;
  message?: string;
};

export const toSkippedIssue = (
  instrument: BacktestInstrumentCandidate,
  reason: BacktestSkippedSymbolReason,
  message?: string,
): BacktestSymbolIssue & { reason: BacktestSkippedSymbolReason } => ({
  instrumentId: instrument.instrumentId,
  symbol: instrument.symbol,
  reason,
  ...(message ? { message } : {}),
});

export const toFailedIssue = (
  instrument: BacktestInstrumentCandidate,
  reason: BacktestFailedSymbolReason,
  message?: string,
): BacktestSymbolIssue & { reason: BacktestFailedSymbolReason } => ({
  instrumentId: instrument.instrumentId,
  symbol: instrument.symbol,
  reason,
  ...(message ? { message } : {}),
});

export const summarizeSymbolIssues = (input: {
  candidates: readonly BacktestInstrumentCandidate[];
  skippedSymbols: readonly BacktestSymbolIssue[];
  failedSymbols: readonly BacktestSymbolIssue[];
}): Record<string, unknown> => ({
  totalCandidateSymbols: input.candidates.length,
  successfulSymbols: Math.max(
    0,
    input.candidates.length - input.skippedSymbols.length - input.failedSymbols.length,
  ),
  skippedSymbolCount: input.skippedSymbols.length,
  failedSymbolCount: input.failedSymbols.length,
  skippedSymbols: input.skippedSymbols,
  failedSymbols: input.failedSymbols,
});
