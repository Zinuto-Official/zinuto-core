// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path: string): string => readFileSync(`${webRoot}${path}`, 'utf8');
const lines = (source: string): number => source.trimEnd().split(/\r?\n/u).length;

test('HS-CORE-023 keeps local-data API and normalization responsibilities below the ceiling', () => {
  const facade = read('src/api/localData.ts');
  const owner = read('src/api/localDataNormalization.ts');
  assert.ok(lines(facade) <= 1000, `localData.ts has ${lines(facade)} lines`);
  assert.ok(lines(owner) <= 1000, `localDataNormalization.ts has ${lines(owner)} lines`);

  const seams = [
    ['localDataCalendarNormalization.ts', 'normalizeApiTradingCalendarConfig'],
    ['localDataNormalizationCommon.ts', 'toRecord'],
    ['localDataImportDraftNormalization.ts', 'normalizeLocalDataImportDraftValidation'],
    ['localDataImportPreviewNormalization.ts', 'normalizeLocalDataImportFolderPreview'],
  ] as const;
  for (const [file, symbol] of seams) {
    const source = read(`src/api/${file}`);
    assert.ok(lines(source) <= 1000, `${file} has ${lines(source)} lines`);
    assert.match(source, new RegExp(`export const ${symbol}\\b`, 'u'));
    assert.doesNotMatch(source, /from ['"]\.\/localDataNormalization['"]/u);
    assert.match(owner, new RegExp(`from ['"]\\.\/${file.replace('.ts', '')}['"]`, 'u'));
  }
});
