// SPDX-License-Identifier: GPL-3.0-only

import { useRef } from "react";

type Pool = {
  id: string;
  name: string;
  assetClass: "STOCK" | "FUTURES" | "FOREX" | "CRYPTO";
  assetClassLabel: string;
  marketPresetId: string;
  baseTimeframe: "1m" | "5m" | "1h" | "1d";
  symbols: string[];
  instruments: Array<{
    instrumentId: string;
    symbol: string;
    barCount?: number;
    timeStartTs?: string | null;
    timeEndTs?: string | null;
  }>;
  questionBankRevisionToken: string;
};

const areInstrumentsEqual = (
  left: Pool["instruments"],
  right: Pool["instruments"],
): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i++) {
    if (
      left[i].instrumentId !== right[i].instrumentId ||
      left[i].symbol !== right[i].symbol ||
      left[i].barCount !== right[i].barCount ||
      left[i].timeStartTs !== right[i].timeStartTs ||
      left[i].timeEndTs !== right[i].timeEndTs
    ) {
      return false;
    }
  }
  return true;
};

const areSymbolsEqual = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
};

export const areStableSamplePoolsEqual = (left: Pool[], right: Pool[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i++) {
    const a = left[i];
    const b = right[i];
    if (
      a.id !== b.id ||
      a.name !== b.name ||
      a.assetClass !== b.assetClass ||
      a.assetClassLabel !== b.assetClassLabel ||
      a.marketPresetId !== b.marketPresetId ||
      a.baseTimeframe !== b.baseTimeframe ||
      a.questionBankRevisionToken !== b.questionBankRevisionToken ||
      !areSymbolsEqual(a.symbols, b.symbols) ||
      !areInstrumentsEqual(a.instruments, b.instruments)
    ) {
      return false;
    }
  }
  return true;
};

export const useStableSamplePools = (pools: Pool[]): Pool[] => {
  const stableRef = useRef(pools);
  if (!areStableSamplePoolsEqual(stableRef.current, pools)) {
    stableRef.current = pools;
  }
  return stableRef.current;
};
