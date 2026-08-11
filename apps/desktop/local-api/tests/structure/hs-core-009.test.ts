// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const localApiRoot = fileURLToPath(new URL('../../', import.meta.url));
const read = (path: string): string => readFileSync(`${localApiRoot}${path}`, 'utf8');
const lines = (source: string): number => source.trimEnd().split(/\r?\n/u).length;

test('HS-CORE-009 keeps trading orchestration below its ceiling and delegates market reads', () => {
  const owner = read('src/application/trading/core.ts');
  assert.ok(lines(owner) <= 1000, `core.ts has ${lines(owner)} lines`);

  const seams = [
    ['marketFrameRuntime.ts', 'getBarsFrameByInstrumentId'],
    ['marketFrameSemantics.ts', 'normalizeDisplayPeriod'],
    ['freeReplayOverview.ts', 'getFreeReplayStartPointOverview'],
    ['tradingCoreStoreRuntime.ts', 'tradingCoreStore'],
  ] as const;
  for (const [file, symbol] of seams) {
    const source = read(`src/application/trading/${file}`);
    assert.ok(lines(source) <= 1000, `${file} has ${lines(source)} lines`);
    assert.match(source, new RegExp(`export const ${symbol}\\b`, 'u'));
    assert.doesNotMatch(source, /from ['"]\.\/core\.js['"]/u);
    assert.match(owner, new RegExp(`['"]\\./${file.replace('.ts', '.js')}['"]`, 'u'));
  }
  assert.match(owner, /export \{ getFreeReplayStartPointOverview \} from ['"]\.\/freeReplayOverview\.js['"]/u);
});
