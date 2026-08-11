// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const localApiRoot = fileURLToPath(new URL('../../', import.meta.url));
const read = (path: string): string => readFileSync(`${localApiRoot}${path}`, 'utf8');
const lines = (source: string): number => source.trimEnd().split(/\r?\n/u).length;

test('HS-CORE-014 separates timeline build, readiness, reads, and prewarm runtime', () => {
  const owner = read('src/infrastructure/db/marketDatabase/timeline.ts');
  assert.ok(lines(owner) <= 1000, `timeline.ts has ${lines(owner)} lines`);

  const seams = [
    ['timelineBuild.ts', 'rebuildMarketTimelineWithConnection'],
    ['timelineReady.ts', 'ensureMarketTimelinePeriodsReady'],
    ['timelineReader.ts', 'getFixedDisplayBarsByIndexRange'],
    ['timelinePrewarm.ts', 'prewarmHotMarketTimelinesForInstruments'],
  ] as const;
  for (const [file, symbol] of seams) {
    const source = read(`src/infrastructure/db/marketDatabase/${file}`);
    assert.ok(lines(source) <= 1000, `${file} has ${lines(source)} lines`);
    assert.match(source, new RegExp(`export const ${symbol}\\b`, 'u'));
    assert.doesNotMatch(source, /from ['"]\.\/timeline\.js['"]/u);
    assert.match(owner, new RegExp(`['"]\\./${file.replace('.ts', '.js')}['"]`, 'u'));
  }
});
