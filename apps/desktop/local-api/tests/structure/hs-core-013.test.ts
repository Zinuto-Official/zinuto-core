// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const localApiRoot = fileURLToPath(new URL('../../', import.meta.url));
const read = (path: string): string => readFileSync(`${localApiRoot}${path}`, 'utf8');
const lines = (source: string): number => source.trimEnd().split(/\r?\n/u).length;

test('HS-CORE-013 delegates CSV staging and interruptible writes to the support seam', () => {
  const owner = read('src/infrastructure/db/marketDatabase/importWriter.ts');
  const support = read('src/infrastructure/db/marketDatabase/importWriterSupport.ts');

  assert.ok(lines(owner) <= 1000, `importWriter.ts has ${lines(owner)} lines`);
  assert.ok(lines(support) <= 1000, `importWriterSupport.ts has ${lines(support)} lines`);
  assert.match(owner, /from ['"]\.\/importWriterSupport\.js['"]/u);
  assert.match(support, /export const runInterruptibleMarketConnectionTask\b/u);
  assert.match(support, /export const collectCsvImportQualityBySourceKeyWithConnection\b/u);
  assert.match(support, /export const refreshInstrumentCountsBatchInternal\b/u);
  assert.doesNotMatch(support, /from ['"]\.\/importWriter\.js['"]/u);
});
