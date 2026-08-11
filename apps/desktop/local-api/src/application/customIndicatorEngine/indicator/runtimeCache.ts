// SPDX-License-Identifier: GPL-3.0-only

import { parseTimestampMs } from "@zinuto/shared/marketTime";
import type { RenderInstruction } from "../plot/types.js";
import type {
  CompiledIndicator,
  IndicatorExecutionResult,
  IndicatorExecutionRuntimeStats,
  IndicatorRuntimeExecuteInput,
} from "./types.js";

export const CUSTOM_INDICATOR_RUNTIME_LIMITS = Object.freeze({
  astMaxStatements: 800,
  astMaxOperations: 2_000_000,
  barsMax: 120_000,
  cacheEntries: 120,
  cacheBytesMax: 24_000_000,
});

type RuntimeCacheEntry = {
  result: IndicatorExecutionResult;
  bytes: number;
};

const RUNTIME_CACHE = new Map<string, RuntimeCacheEntry>();
let runtimeCacheBytes = 0;
const runtimeCacheStats = {
  hits: 0,
  misses: 0,
  writes: 0,
  evictions: 0,
  oversizeSkips: 0,
  disabledSkips: 0,
};

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const hashText = (hash: number, value: string): number => {
  let nextHash = hash;
  for (let index = 0; index < value.length; index += 1) {
    nextHash ^= value.charCodeAt(index);
    nextHash = Math.imul(nextHash, 16777619);
  }
  return nextHash;
};

const hashNumber = (hash: number, value: number): number => {
  if (!Number.isFinite(value)) {
    hash ^= 0x9e3779b9;
    return Math.imul(hash, 16777619);
  }
  const scaled = Math.round(value * 1_000_000);
  hash ^= scaled & 0xffff;
  hash = Math.imul(hash, 16777619);
  hash ^= (scaled >>> 16) & 0xffff;
  hash = Math.imul(hash, 16777619);
  return hash;
};

const hashTime = (hash: number, value: number | string): number => {
  if (typeof value === "number") {
    return hashNumber(hash, value);
  }
  const timestamp = parseTimestampMs(String(value));
  if (Number.isFinite(timestamp)) {
    return hashNumber(hash, timestamp);
  }
  return hashText(hash, `invalid:${String(value)}`);
};

const hashBars = (bars: IndicatorRuntimeExecuteInput["bars"]): string => {
  let hash = 2166136261;
  for (let index = 0; index < bars.length; index += 1) {
    const item = bars[index];
    hash = hashTime(hash, item.time);
    hash = hashNumber(hash, item.open);
    hash = hashNumber(hash, item.high);
    hash = hashNumber(hash, item.low);
    hash = hashNumber(hash, item.close);
    hash = hashNumber(hash, item.volume);
    hash = hashNumber(hash, Number((item as { amount?: number }).amount));
  }
  return (hash >>> 0).toString(16);
};

const cloneRenderInstruction = (
  instruction: RenderInstruction,
): RenderInstruction => {
  const base = {
    ...instruction,
    visibleMask: [...instruction.visibleMask],
    directiveFamilies: instruction.directiveFamilies.map((family) => ({
      ...family,
    })),
    style: { ...instruction.style },
  };
  switch (instruction.primitive) {
    case "line":
      return {
        ...base,
        primitive: "line",
        series: [...instruction.series],
      };
    case "histogram":
      return {
        ...base,
        primitive: "histogram",
        upperSeries: [...instruction.upperSeries],
        lowerSeries: [...instruction.lowerSeries],
        widthSeries: [...instruction.widthSeries],
        hollowSeries: [...instruction.hollowSeries],
      };
    case "iconMarker":
      return {
        ...base,
        primitive: "iconMarker",
        anchorSeries: [...instruction.anchorSeries],
        iconSeries: [...instruction.iconSeries],
      };
    case "textMarker":
      return {
        ...base,
        primitive: "textMarker",
        anchorSeries: [...instruction.anchorSeries],
        text: instruction.text,
      };
    case "numberMarker":
      return {
        ...base,
        primitive: "numberMarker",
        anchorSeries: [...instruction.anchorSeries],
        numberSeries: [...instruction.numberSeries],
      };
    case "segment":
      return {
        ...base,
        primitive: "segment",
        startMask: [...instruction.startMask],
        startSeries: [...instruction.startSeries],
        endMask: [...instruction.endMask],
        endSeries: [...instruction.endSeries],
        extend: instruction.extend,
      };
    case "slopeSegment":
      return {
        ...base,
        primitive: "slopeSegment",
        anchorMask: [...instruction.anchorMask],
        anchorSeries: [...instruction.anchorSeries],
        slopeSeries: [...instruction.slopeSeries],
        lengthSeries: [...instruction.lengthSeries],
        directSeries: [...instruction.directSeries],
      };
    case "ohlc":
      return {
        ...base,
        primitive: "ohlc",
        openSeries: [...instruction.openSeries],
        highSeries: [...instruction.highSeries],
        lowSeries: [...instruction.lowSeries],
        closeSeries: [...instruction.closeSeries],
      };
    case "band":
      return {
        ...base,
        primitive: "band",
        upperSeries: [...instruction.upperSeries],
        lowerSeries: [...instruction.lowerSeries],
      };
    default:
      return instruction;
  }
};

const cloneRenderInstructions = (
  items: RenderInstruction[],
): RenderInstruction[] => items.map((item) => cloneRenderInstruction(item));

const cloneExecutionResult = (
  result: IndicatorExecutionResult,
): IndicatorExecutionResult => ({
  ...result,
  outputs: Object.entries(result.outputs).reduce<Record<string, number[]>>(
    (acc, [key, value]) => {
      acc[key] = [...value];
      return acc;
    },
    {},
  ),
  renderInstructions: cloneRenderInstructions(result.renderInstructions),
  params: { ...result.params },
  runtimeStats: result.runtimeStats ? { ...result.runtimeStats } : undefined,
  errors: result.errors.map((item) => ({ ...item })),
});

const estimateExecutionResultBytes = (
  result: IndicatorExecutionResult,
): number => {
  let bytes = 0;

  Object.values(result.outputs).forEach((series) => {
    bytes += series.length * 8;
  });

  result.renderInstructions.forEach((instruction) => {
    bytes += instruction.visibleMask.length;
    bytes += instruction.name.length * 2;
    bytes += instruction.style.color.length * 2;
    bytes += instruction.style.fillColor
      ? instruction.style.fillColor.length * 2
      : 0;
    switch (instruction.primitive) {
      case "line":
        bytes += instruction.series.length * 8;
        break;
      case "histogram":
        bytes += instruction.upperSeries.length * 8;
        bytes += instruction.lowerSeries.length * 8;
        bytes += instruction.widthSeries.length * 8;
        bytes += instruction.hollowSeries.length;
        break;
      case "iconMarker":
        bytes += instruction.anchorSeries.length * 8;
        bytes += instruction.iconSeries.length * 8;
        break;
      case "textMarker":
        bytes += instruction.anchorSeries.length * 8;
        bytes += instruction.text.length * 2;
        break;
      case "numberMarker":
        bytes += instruction.anchorSeries.length * 8;
        bytes += instruction.numberSeries.length * 8;
        break;
      case "segment":
        bytes += instruction.startMask.length;
        bytes += instruction.endMask.length;
        bytes += instruction.startSeries.length * 8;
        bytes += instruction.endSeries.length * 8;
        break;
      case "slopeSegment":
        bytes += instruction.anchorMask.length;
        bytes += instruction.anchorSeries.length * 8;
        bytes += instruction.slopeSeries.length * 8;
        bytes += instruction.lengthSeries.length * 8;
        bytes += instruction.directSeries.length * 8;
        break;
      case "ohlc":
        bytes += instruction.openSeries.length * 8;
        bytes += instruction.highSeries.length * 8;
        bytes += instruction.lowSeries.length * 8;
        bytes += instruction.closeSeries.length * 8;
        break;
      case "band":
        bytes += instruction.upperSeries.length * 8;
        bytes += instruction.lowerSeries.length * 8;
        break;
      default:
        break;
    }
  });

  bytes += Object.keys(result.params).length * 16;
  bytes += result.runtimeStats ? 64 : 0;
  bytes += result.errors.length * 256;
  return bytes;
};

export const buildRuntimeStats = (
  durationMs: number,
  statementsExecuted: number,
  operationsExecuted: number,
  fromCache: boolean,
): IndicatorExecutionRuntimeStats => ({
  durationMs: Math.max(0, durationMs),
  statementsExecuted: Math.max(0, Math.floor(statementsExecuted)),
  operationsExecuted: Math.max(0, Math.floor(operationsExecuted)),
  fromCache,
});

export const buildRuntimeCacheKey = (
  compiled: CompiledIndicator,
  bars: IndicatorRuntimeExecuteInput["bars"],
  params: Record<string, number>,
  statementLimit: number,
  operationLimit: number,
): string => {
  const barsSignature = `${String(bars.length)}|${hashBars(bars)}`;
  const paramsSignature = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(",");
  return [
    hashString(JSON.stringify(compiled.definition)),
    barsSignature,
    paramsSignature,
    statementLimit,
    operationLimit,
  ].join("::");
};

export const readRuntimeCache = (
  cacheKey: string,
): IndicatorExecutionResult | null => {
  const cached = RUNTIME_CACHE.get(cacheKey);
  if (!cached) {
    runtimeCacheStats.misses += 1;
    return null;
  }
  RUNTIME_CACHE.delete(cacheKey);
  RUNTIME_CACHE.set(cacheKey, cached);
  runtimeCacheStats.hits += 1;
  const result = cloneExecutionResult(cached.result);
  result.runtimeStats = buildRuntimeStats(
    0,
    result.runtimeStats?.statementsExecuted ?? 0,
    result.runtimeStats?.operationsExecuted ?? 0,
    true,
  );
  return result;
};

export const touchRuntimeCache = (
  key: string,
  value: IndicatorExecutionResult,
) => {
  const maxEntries = CUSTOM_INDICATOR_RUNTIME_LIMITS.cacheEntries;
  const maxBytes = CUSTOM_INDICATOR_RUNTIME_LIMITS.cacheBytesMax;
  if (maxEntries <= 0 || maxBytes <= 0) {
    runtimeCacheStats.disabledSkips += 1;
    if (RUNTIME_CACHE.size > 0) {
      runtimeCacheStats.evictions += RUNTIME_CACHE.size;
      RUNTIME_CACHE.clear();
      runtimeCacheBytes = 0;
    }
    return;
  }
  const cloned = cloneExecutionResult(value);
  const entryBytes = estimateExecutionResultBytes(cloned);
  if (entryBytes <= 0 || entryBytes > maxBytes) {
    runtimeCacheStats.oversizeSkips += 1;
    return;
  }

  const existing = RUNTIME_CACHE.get(key);
  if (existing) {
    runtimeCacheBytes = Math.max(0, runtimeCacheBytes - existing.bytes);
    RUNTIME_CACHE.delete(key);
  }

  RUNTIME_CACHE.set(key, { result: cloned, bytes: entryBytes });
  runtimeCacheBytes += entryBytes;
  runtimeCacheStats.writes += 1;

  while (
    (RUNTIME_CACHE.size > maxEntries || runtimeCacheBytes > maxBytes) &&
    RUNTIME_CACHE.size > 0
  ) {
    const oldest = RUNTIME_CACHE.entries().next().value as
      | [string, RuntimeCacheEntry]
      | undefined;
    if (!oldest) {
      break;
    }
    const [oldestKey, oldestEntry] = oldest;
    RUNTIME_CACHE.delete(oldestKey);
    runtimeCacheBytes = Math.max(0, runtimeCacheBytes - oldestEntry.bytes);
    runtimeCacheStats.evictions += 1;
  }
};
