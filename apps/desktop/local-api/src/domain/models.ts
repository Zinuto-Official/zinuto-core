// SPDX-License-Identifier: GPL-3.0-only

export type {
  OrderSide as Side,
  PriceMode,
} from '@zinuto/shared/trading';

export interface OhlcvBar {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketBarFrame {
  schemaVersion: 'zinuto-market-frame-v2';
  instrumentId: string;
  symbol: string;
  baseTimeframe: string;
  timeframe: string;
  displayPeriod: string;
  timeZone: string | null;
  totalRaw: number;
  totalDisplay: number;
  rawStartIndex: number;
  rawEndIndex: number;
  displayStartIndex: number;
  displayEndIndex: number;
  limit: number;
  hasBackward: boolean;
  hasForward: boolean;
  versionToken: string;
  displayIndex: number[];
  timestampMs: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  startRawIndex: number[];
  endRawIndex: number[];
}
