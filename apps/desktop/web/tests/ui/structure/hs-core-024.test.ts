// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path: string): string => readFileSync(`${webRoot}${path}`, 'utf8');
const lines = (source: string): number => source.trimEnd().split(/\r?\n/u).length;

test('HS-CORE-024 keeps special-training API types below the ceiling with one-way domain seams', () => {
  const apiFacade = read('src/api/specialTraining.ts');
  const typeFacade = read('src/api/specialTrainingTypes.ts');
  assert.ok(lines(apiFacade) <= 1000, `specialTraining.ts has ${lines(apiFacade)} lines`);
  assert.ok(lines(typeFacade) <= 1000, `specialTrainingTypes.ts has ${lines(typeFacade)} lines`);

  const core = read('src/api/specialTrainingCoreTypes.ts');
  const stats = read('src/api/specialTrainingStatsTypes.ts');
  assert.ok(lines(core) <= 1000, `specialTrainingCoreTypes.ts has ${lines(core)} lines`);
  assert.ok(lines(stats) <= 1000, `specialTrainingStatsTypes.ts has ${lines(stats)} lines`);
  assert.match(stats, /from ['"]\.\/specialTrainingCoreTypes['"]/u);
  assert.doesNotMatch(core, /specialTrainingStatsTypes/u);
  assert.match(typeFacade, /export type \* from ['"]\.\/specialTrainingCoreTypes['"]/u);
  assert.match(typeFacade, /export type \* from ['"]\.\/specialTrainingStatsTypes['"]/u);
});
