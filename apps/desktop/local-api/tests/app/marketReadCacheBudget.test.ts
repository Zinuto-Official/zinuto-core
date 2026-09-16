// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';
import type { MarketBarFrame, OhlcvBar } from '../../src/domain/models.js';
import {
  getCachedMarketBarChunk, setCachedMarketBarChunk,
  getCachedMarketBarFrame, setCachedMarketBarFrame,
  invalidateMarketReadCaches,
} from '../../src/infrastructure/db/marketReadCache.js';

const frame = (rows: number): MarketBarFrame => ({
  schemaVersion: 'zinuto-market-frame-v2', instrumentId: 'sample', symbol: 'sample',
  baseTimeframe: '1m', timeframe: '1m', displayPeriod: '1m', timeZone: 'UTC',
  totalRaw: rows, totalDisplay: rows, rawStartIndex: 0, rawEndIndex: rows - 1,
  displayStartIndex: 0, displayEndIndex: rows - 1, limit: rows,
  hasBackward: false, hasForward: false, versionToken: 'v1',
  ...Object.fromEntries(['displayIndex', 'timestampMs', 'open', 'high', 'low', 'close',
    'volume', 'startRawIndex', 'endRawIndex'].map((key) => [key, Array<number>(rows).fill(1)])),
} as MarketBarFrame);

test('frame cache evicts least recently read payloads within its total row budget', () => {
  invalidateMarketReadCaches();
  try {
    const value = frame(100_000);
    setCachedMarketBarFrame('first', value);
    setCachedMarketBarFrame('second', value);
    assert.equal(getCachedMarketBarFrame('first'), value);
    setCachedMarketBarFrame('third', value);
    assert.equal(getCachedMarketBarFrame('second'), null);
    assert.equal(getCachedMarketBarFrame('first'), value);
    assert.equal(getCachedMarketBarFrame('third'), value);
    setCachedMarketBarFrame('oversized', frame(250_001));
    assert.equal(getCachedMarketBarFrame('oversized'), null);
    assert.equal(getCachedMarketBarFrame('third'), value);
  } finally { invalidateMarketReadCaches(); }
});

test('chunk cache bounds retained rows and invalidation removes cached data', () => {
  invalidateMarketReadCaches();
  const bar: OhlcvBar = { ts: '2026-01-01', open: 1, high: 2, low: 1, close: 2, volume: 1 };
  const bars = Array<OhlcvBar>(65_537).fill(bar);
  try {
    setCachedMarketBarChunk('one', 0, bars);
    setCachedMarketBarChunk('two', 0, bars);
    assert.equal(getCachedMarketBarChunk('one', 0), null);
    assert.equal(getCachedMarketBarChunk('two', 0), bars);
    setCachedMarketBarChunk('large', 0, Array<OhlcvBar>(131_073).fill(bar));
    assert.equal(getCachedMarketBarChunk('large', 0), null);
    assert.equal(getCachedMarketBarChunk('two', 0), bars);
    invalidateMarketReadCaches('two');
    assert.equal(getCachedMarketBarChunk('two', 0), null);
  } finally { invalidateMarketReadCaches(); }
});
