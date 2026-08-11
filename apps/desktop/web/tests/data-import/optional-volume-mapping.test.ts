// SPDX-License-Identifier: GPL-3.0-only

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeCsvFieldMapping,
} from '../../src/domains/data-import/csvHelpers';

test('CSV mapping normalization preserves empty volume instead of rejecting the mapping', () => {
  const mapping = normalizeCsvFieldMapping({
    timestampMode: 'SINGLE',
    date: 'date',
    open: 'open',
    high: 'high',
    low: 'low',
    close: 'close',
    volume: '',
  });

  assert.ok(mapping);
  assert.equal(mapping.volume, '');
});
