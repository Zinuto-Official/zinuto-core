// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCurrentBarChangeRatio } from '../../src/domains/chart/barChangeRatio';

const bars = [
  { close: 100 },
  { close: 100.79 },
] as const;

test('current-bar change uses the preceding rendered candle close', () => {
  const ratio = resolveCurrentBarChangeRatio(bars, 1);
  assert.ok(ratio !== null);
  assert.ok(Math.abs(ratio - 0.0079) < Number.EPSILON);
});

test('current-bar change is unavailable for the first rendered candle', () => {
  assert.equal(resolveCurrentBarChangeRatio(bars, 0), null);
});

test('current-bar change does not substitute a raw or opening-price baseline', () => {
  assert.equal(resolveCurrentBarChangeRatio([{ close: 100.79 }], 0), null);
});
