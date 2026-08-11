// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';

import { toSafeInt } from '../../src/infrastructure/db/marketDatabase/utils.js';

test('toSafeInt parses a numeric prefix when the source has a suffix', () => {
  assert.equal(toSafeInt('123abc'), 123);
  assert.equal(toSafeInt('1,234 rows'), 1234);
  assert.equal(toSafeInt('abc123'), 0);
});
