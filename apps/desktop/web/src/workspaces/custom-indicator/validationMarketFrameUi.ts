// SPDX-License-Identifier: GPL-3.0-only

import type { KLineData } from "klinecharts";
import type { Instrument, MarketBarFrame } from "@/domains/training/types";
import { normalizeValidationInstrumentSymbol } from "@/workspaces/custom-indicator/validationInstrumentSelection";

export type ValidationMarketFrameMeta = {
  displayStartIndex: number;
  displayEndIndex: number;
  totalDisplay: number;
  hasBackward: boolean;
  hasForward: boolean;
  versionToken: string;
};

export type ValidationMarketLoadMoreResult = {
  data: KLineData[];
  hasBackward: boolean;
  hasForward: boolean;
};

const getMarketFrameLength = (frame: MarketBarFrame): number =>
  Math.min(
    frame.timestampMs.length,
    frame.open.length,
    frame.high.length,
    frame.low.length,
    frame.close.length,
    frame.volume.length,
  );

export const toValidationKlineData = (frame: MarketBarFrame): KLineData[] => {
  const length = getMarketFrameLength(frame);
  const bars: KLineData[] = [];
  for (let index = 0; index < length; index += 1) {
    const bar = {
      timestamp: Number(frame.timestampMs[index]),
      open: Number(frame.open[index]),
      high: Number(frame.high[index]),
      low: Number(frame.low[index]),
      close: Number(frame.close[index]),
      volume: Number(frame.volume[index]),
    };
    if (
      Number.isFinite(bar.timestamp as number) &&
      Number.isFinite(bar.open as number) &&
      Number.isFinite(bar.high as number) &&
      Number.isFinite(bar.low as number) &&
      Number.isFinite(bar.close as number) &&
      Number.isFinite(bar.volume as number)
    ) {
      bars.push(bar);
    }
  }
  return bars;
};

export const toValidationFrameMeta = (
  frame: MarketBarFrame,
): ValidationMarketFrameMeta => ({
  displayStartIndex: Math.max(
    0,
    Math.floor(Number(frame.displayStartIndex) || 0),
  ),
  displayEndIndex: Math.max(
    0,
    Math.floor(Number(frame.displayEndIndex) || 0),
  ),
  totalDisplay: Math.max(0, Math.floor(Number(frame.totalDisplay) || 0)),
  hasBackward: Boolean(frame.hasBackward),
  hasForward: Boolean(frame.hasForward),
  versionToken: String(frame.versionToken || "").trim(),
});

export const mergeValidationKlineData = (
  direction: "backward" | "forward",
  currentBars: KLineData[],
  incomingBars: KLineData[],
): KLineData[] => {
  if (!incomingBars.length) {
    return currentBars;
  }
  const orderedBars =
    direction === "backward"
      ? [...incomingBars, ...currentBars]
      : [...currentBars, ...incomingBars];
  const byTimestamp = new Map<number, KLineData>();
  orderedBars.forEach((bar) => {
    const timestamp = Number(bar.timestamp);
    if (Number.isFinite(timestamp)) {
      byTimestamp.set(timestamp, bar);
    }
  });
  return Array.from(byTimestamp.values()).sort(
    (left, right) => Number(left.timestamp) - Number(right.timestamp),
  );
};

export const resolveValidationLoadMoreState = (
  meta: ValidationMarketFrameMeta | null,
) => ({
  backward: Boolean(meta?.hasBackward),
  forward: Boolean(meta?.hasForward),
});

export const normalizeListedValidationInstruments = (
  instruments: readonly Instrument[],
): Instrument[] =>
  instruments
    .map((item) => ({
      ...item,
      symbol: normalizeValidationInstrumentSymbol(item.symbol),
    }))
    .filter((item) => Boolean(item.symbol));
