// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const localApiRoot = fileURLToPath(new URL('../../', import.meta.url));
const read = (path: string): string => readFileSync(`${localApiRoot}${path}`, 'utf8');
const lines = (source: string): number => source.trimEnd().split(/\r?\n/u).length;

test('HS-CORE-011 separates quote contracts and capacity calculations from projection', () => {
  const owner = read('src/domain/trading/orderQuote.ts');
  const capacity = read('src/domain/trading/orderQuoteCapacity.ts');
  const types = read('src/domain/trading/orderQuoteTypes.ts');

  assert.ok(lines(owner) <= 1000, `orderQuote.ts has ${lines(owner)} lines`);
  assert.ok(lines(capacity) <= 1000, `orderQuoteCapacity.ts has ${lines(capacity)} lines`);
  assert.ok(lines(types) <= 1000, `orderQuoteTypes.ts has ${lines(types)} lines`);
  assert.match(owner, /from ['"]\.\/orderQuoteCapacity\.js['"]/u);
  assert.match(owner, /export type \* from ['"]\.\/orderQuoteTypes\.js['"]/u);
  assert.match(capacity, /export const buildTradeCapacitySummary\b/u);
  assert.match(types, /export type SessionOrderQuote\b/u);
  assert.doesNotMatch(capacity, /from ['"]\.\/orderQuote\.js['"]/u);
});
