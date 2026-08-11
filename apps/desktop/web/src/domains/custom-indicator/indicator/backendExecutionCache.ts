// SPDX-License-Identifier: GPL-3.0-only

import { api } from '@/api';
import type { KLineData } from 'klinecharts';
import { buildCustomIndicatorRuntimeCacheKey } from '@/domains/custom-indicator/indicator/runtimeCacheKey';
import type {
  CompiledIndicator,
  IndicatorExecutionResult,
} from '@/domains/custom-indicator/indicator/types';
import type { Bar } from '@/domains/custom-indicator/indicator/dataTypes';

type BackendExecutionBarsCacheEntry = {
  signature: string;
  bars: Bar[];
};

const BACKEND_EXECUTION_BARS_CACHE = new WeakMap<KLineData[], BackendExecutionBarsCacheEntry>();
const EXECUTION_RESULT_CACHE = new Map<string, IndicatorExecutionResult>();
const EXECUTION_PENDING = new Set<string>();
const EXECUTION_PENDING_PROMISES = new Map<string, Promise<IndicatorExecutionResult | null>>();
const MAX_EXECUTION_RESULT_CACHE_ENTRIES = 64;

const hashNumber = (hash: number, value: number): number => {
  const numeric = Number.isFinite(value) ? value : Number.NaN;
  const text = Number.isFinite(numeric) ? String(numeric) : 'NaN';
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash;
};

const buildDataListSignature = (dataList: KLineData[]): string => {
  let hash = 2166136261;
  hash = hashNumber(hash, dataList.length);
  for (let index = 0; index < dataList.length; index += 1) {
    const item = dataList[index];
    hash = hashNumber(hash, Number(item?.timestamp));
    hash = hashNumber(hash, Number(item?.open));
    hash = hashNumber(hash, Number(item?.high));
    hash = hashNumber(hash, Number(item?.low));
    hash = hashNumber(hash, Number(item?.close));
    hash = hashNumber(hash, Number(item?.volume));
  }
  return (hash >>> 0).toString(16);
};

export const toCustomIndicatorExecutionBars = (dataList: KLineData[]): Bar[] => {
  const signature = buildDataListSignature(dataList);
  const cached = BACKEND_EXECUTION_BARS_CACHE.get(dataList);
  if (cached && cached.signature === signature) {
    return cached.bars;
  }

  const bars = dataList.map((item, index) => ({
    time: Number.isFinite(item.timestamp as number) ? Number(item.timestamp) : Date.now() + index * 60_000,
    open: Number(item.open),
    high: Number(item.high),
    low: Number(item.low),
    close: Number(item.close),
    volume: Number(item.volume),
  }));
  BACKEND_EXECUTION_BARS_CACHE.set(dataList, { signature, bars });
  return bars;
};

const trimExecutionResultCache = (): void => {
  while (EXECUTION_RESULT_CACHE.size > MAX_EXECUTION_RESULT_CACHE_ENTRIES) {
    const oldestKey = EXECUTION_RESULT_CACHE.keys().next().value;
    if (!oldestKey) {
      break;
    }
    EXECUTION_RESULT_CACHE.delete(oldestKey);
  }
};

const readCachedExecutionResult = (
  key: string,
): IndicatorExecutionResult | null => {
  const cached = EXECUTION_RESULT_CACHE.get(key);
  if (!cached) {
    return null;
  }
  EXECUTION_RESULT_CACHE.delete(key);
  EXECUTION_RESULT_CACHE.set(key, cached);
  return cached;
};

const writeExecutionResultCache = (
  key: string,
  result: IndicatorExecutionResult,
): void => {
  EXECUTION_RESULT_CACHE.set(key, result);
  trimExecutionResultCache();
};

export const rememberCustomIndicatorExecutionResult = (
  compiled: CompiledIndicator,
  bars: readonly Bar[],
  parameterOverrides: Record<string, number>,
  result: IndicatorExecutionResult,
) => {
  writeExecutionResultCache(
    buildCustomIndicatorRuntimeCacheKey(compiled, bars, parameterOverrides),
    result,
  );
};

export const readOrScheduleCustomIndicatorExecution = (
  compiled: CompiledIndicator,
  bars: Bar[],
  parameterOverrides: Record<string, number>,
): IndicatorExecutionResult | null => {
  const key = buildCustomIndicatorRuntimeCacheKey(
    compiled,
    bars,
    parameterOverrides,
  );
  const cached = readCachedExecutionResult(key);
  if (cached) {
    return cached;
  }
  if (!EXECUTION_PENDING.has(key)) {
    EXECUTION_PENDING.add(key);
    void api.executeCustomIndicatorScript({
      compiled,
      input: {
        bars,
        parameterOverrides,
      },
    }).then((result) => {
      writeExecutionResultCache(key, result);
    }).catch(() => {
      // The next render can retry the backend execution for this key.
    }).finally(() => {
      EXECUTION_PENDING.delete(key);
    });
  }
  return null;
};

export const readOrExecuteCustomIndicatorExecution = async (
  compiled: CompiledIndicator,
  bars: Bar[],
  parameterOverrides: Record<string, number>,
): Promise<IndicatorExecutionResult | null> => {
  const key = buildCustomIndicatorRuntimeCacheKey(
    compiled,
    bars,
    parameterOverrides,
  );
  const cached = readCachedExecutionResult(key);
  if (cached) {
    return cached;
  }

  const pending = EXECUTION_PENDING_PROMISES.get(key);
  if (pending) {
    return pending;
  }

  EXECUTION_PENDING.add(key);
  const execution = api.executeCustomIndicatorScript({
    compiled,
    input: {
      bars,
      parameterOverrides,
    },
  }).then((result) => {
    writeExecutionResultCache(key, result);
    return result;
  }).catch(() => null).finally(() => {
    EXECUTION_PENDING.delete(key);
    EXECUTION_PENDING_PROMISES.delete(key);
  });
  EXECUTION_PENDING_PROMISES.set(key, execution);
  return execution;
};
