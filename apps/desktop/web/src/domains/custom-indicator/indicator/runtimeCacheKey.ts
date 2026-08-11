// SPDX-License-Identifier: GPL-3.0-only

import { parseTimestampMs } from '@zinuto/shared/marketTime';
import type { Bar } from '@/domains/custom-indicator/indicator/dataTypes';
import type { CompiledIndicator } from '@/domains/custom-indicator/indicator/types';

const hashText = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

export const buildCustomIndicatorRuntimeCacheKey = (
  compiled: CompiledIndicator,
  bars: readonly Bar[],
  parameterOverrides: Readonly<Record<string, number>>,
): string =>
  hashText(
    JSON.stringify({
      definition: compiled.definition,
      outputKeys: compiled.outputKeys,
      parameterDefaults: Object.entries(compiled.parameterDefaults).sort(
        ([left], [right]) => left.localeCompare(right, 'en'),
      ),
      parameterOverrides: Object.entries(parameterOverrides).sort(
        ([left], [right]) => left.localeCompare(right, 'en'),
      ),
      bars: bars.map((bar) => [
        typeof bar.time === 'number' ? bar.time : parseTimestampMs(bar.time),
        bar.open,
        bar.high,
        bar.low,
        bar.close,
        bar.volume,
        bar.amount ?? null,
      ]),
    }),
  );
