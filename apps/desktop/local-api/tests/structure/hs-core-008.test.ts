// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const localApiRoot = fileURLToPath(new URL('../../', import.meta.url));
const read = (path: string): string => readFileSync(`${localApiRoot}${path}`, 'utf8');
const lines = (source: string): number => source.trimEnd().split(/\r?\n/u).length;

test('HS-CORE-008 separates challenge state and startup ownership below the ceiling', () => {
  const owner = read('src/application/specialTrainingService/challengeOperations.ts');
  assert.ok(lines(owner) <= 1000, `challengeOperations.ts has ${lines(owner)} lines`);

  const seams = [
    ['challengeBankPreviewOperations.ts', 'previewSpecialTrainingQuestionBank'],
    ['challengeNumberSemantics.ts', 'toFiniteNumber'],
    ['challengeRuntimeRegistry.ts', 'challengeStore'],
    ['challengeStart.ts', 'startSpecialTrainingChallengeCore'],
  ] as const;
  for (const [file, symbol] of seams) {
    const source = read(`src/application/specialTrainingService/${file}`);
    assert.ok(lines(source) <= 1000, `${file} has ${lines(source)} lines`);
    assert.match(source, new RegExp(`export const ${symbol}\\b`, 'u'));
    assert.doesNotMatch(source, /from ['"]\.\/challengeOperations\.js['"]/u);
    assert.match(owner, new RegExp(`from ['"]\\.\/${file.replace('.ts', '.js')}['"]`, 'u'));
  }
});
