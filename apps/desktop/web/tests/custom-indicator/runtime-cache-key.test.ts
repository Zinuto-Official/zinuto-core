// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCustomIndicatorRuntimeCacheKey,
} from '../../src/domains/custom-indicator/indicator/runtimeCacheKey.js';
import type { CompiledIndicator } from '../../src/domains/custom-indicator/indicator/types.js';

const buildCompiled = (color: string): CompiledIndicator => ({
  definition: {
    name: `CACHE_${color}`,
    source: 'CACHE_OUT: C;',
    parameters: [],
    outputs: [
      {
        key: 'CACHE_OUT',
        title: 'Cache output',
        directives: [color],
      },
    ],
  },
  outputKeys: ['CACHE_OUT'],
  parameterDefaults: {},
});

test('workbench runtime cache isolates identical formulas with different render metadata', () => {
  const bars = [
    { time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
  ];
  const red = buildCompiled('COLORRED');
  const green = buildCompiled('COLORGREEN');

  assert.notEqual(
    buildCustomIndicatorRuntimeCacheKey(red, bars, {}),
    buildCustomIndicatorRuntimeCacheKey(green, bars, {}),
  );
});
