// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const localApiRoot = fileURLToPath(new URL('../../', import.meta.url));
const read = (path: string): string => readFileSync(`${localApiRoot}${path}`, 'utf8');
const lines = (source: string): number => source.trimEnd().split(/\r?\n/u).length;

test('HS-CORE-003 keeps folder preview orchestration below its ceiling with acyclic responsibility seams', () => {
  const owner = read('src/application/dataSource/folderPreview.ts');
  assert.ok(lines(owner) <= 1000, `folderPreview.ts has ${lines(owner)} lines`);

  const seams = [
    ['folderPreviewCommon.ts', 'emitPreviewProgress'],
    ['folderPreviewPlanning.ts', 'scanImportFilesRecursively'],
    ['folderPreviewQualityAnalysis.ts', 'buildPreviewQualityDiagnostics'],
  ] as const;
  for (const [file, symbol] of seams) {
    const source = read(`src/application/dataSource/${file}`);
    assert.ok(lines(source) <= 1000, `${file} has ${lines(source)} lines`);
    assert.match(source, new RegExp(`export const ${symbol}\\b`, 'u'));
    assert.doesNotMatch(source, /from ['"]\.\/folderPreview\.js['"]/u);
    assert.match(owner, new RegExp(`from ['"]\\.\/${file.replace('.ts', '.js')}['"]`, 'u'));
  }
});
