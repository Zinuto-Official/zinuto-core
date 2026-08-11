// SPDX-License-Identifier: GPL-3.0-only

import type { LocalDataImportSymbolLimit } from './types.js';

export const normalizeMaxImportSymbols = (_value: unknown): null => null;

export const normalizeSymbolListInOrder = (symbols: readonly unknown[]): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];
  symbols.forEach((item) => {
    const symbol = String(item || '').trim().toUpperCase();
    if (!symbol || seen.has(symbol)) {
      return;
    }
    seen.add(symbol);
    output.push(symbol);
  });
  return output;
};

export const createSymbolLimitSummary = (input: {
  maxSymbols: number | null;
  allSymbols: string[];
  selectedSymbols: string[];
}): LocalDataImportSymbolLimit => {
  const selectedSymbols = normalizeSymbolListInOrder(input.allSymbols);
  return {
    limitApplied: false,
    maxSymbols: null,
    selectedSymbols,
    skippedSymbols: [],
    skippedSymbolCount: 0,
    reason: null,
  };
};

export const createEmptySymbolLimitSummary = (
  maxSymbolsRaw?: unknown,
): LocalDataImportSymbolLimit =>
  createSymbolLimitSummary({
    maxSymbols: normalizeMaxImportSymbols(maxSymbolsRaw),
    allSymbols: [],
    selectedSymbols: [],
  });

export const selectCandidatesForSourceSymbolAccess = <T extends { symbol: string }>(
  candidates: T[],
  _maxSymbolsRaw: unknown,
  _unlockedSourceSymbolsRaw: readonly unknown[] | null | undefined,
): { candidates: T[]; symbolLimit: LocalDataImportSymbolLimit } => {
  const allSymbols = normalizeSymbolListInOrder(
    candidates.map((candidate) => candidate.symbol),
  );
  return {
    candidates,
    symbolLimit: createSymbolLimitSummary({
      maxSymbols: null,
      allSymbols,
      selectedSymbols: allSymbols,
    }),
  };
};

export const filterSymbolsForSourceSymbolAccess = ({
  symbols,
  maxSymbolsRaw: _maxSymbolsRaw,
  unlockedSourceSymbolsRaw: _unlockedSourceSymbolsRaw,
}: {
  symbols: string[];
  maxSymbolsRaw: unknown;
  unlockedSourceSymbolsRaw: readonly unknown[] | null | undefined;
}): string[] => {
  return symbols;
};
