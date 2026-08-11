// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  convertNativeImportPathToWirePath,
  preserveImportWireRelativePath,
  resolveImportWireTopLevelSubfolder,
} from '../../src/domain/dataSource/importPathSemantics.js';

test('native-to-wire path conversion is separator-aware', () => {
  assert.equal(
    convertNativeImportPathToWirePath('group\\AAPL.csv', '/'),
    'group\\AAPL.csv',
  );
  assert.equal(
    convertNativeImportPathToWirePath('group\\AAPL.csv', '\\'),
    'group/AAPL.csv',
  );
});

test('wire relative paths preserve literal backslashes and exact scope names', () => {
  const relativePath = ' group\\west /AAPL\\quote.csv ';
  assert.equal(preserveImportWireRelativePath(relativePath), relativePath);
  assert.equal(resolveImportWireTopLevelSubfolder(relativePath), ' group\\west ');
  assert.equal(preserveImportWireRelativePath('   '), '');
});
