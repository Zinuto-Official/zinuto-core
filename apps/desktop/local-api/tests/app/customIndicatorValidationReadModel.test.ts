// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCustomIndicatorValidationFacts } from '../../src/application/customIndicatorEngine/indicator/validationReadModel.js';
import type { LocalDataSourceSummary } from '../../src/application/dataSource/types.js';

const buildLocalDataSource = (): LocalDataSourceSummary =>
  ({
    id: 'local-source-1',
    name: 'Local Source',
    baseTimeframe: '1d',
    sourceLocked: false,
    lockedSymbols: [],
    unlockedSymbols: [],
    instruments: [
      {
        instrumentId: 'local-aapl-1d',
        symbol: 'AAPL',
        displayLabel: 'AAPL Local',
        sourceTimeframe: '1d',
        barCount: 123,
      },
    ],
  }) as LocalDataSourceSummary;

test('custom indicator validation facts keep local and system instruments separate', () => {
  const facts = buildCustomIndicatorValidationFacts({
    instruments: [
      {
        id: 'system-aapl-1d',
        symbol: 'AAPL',
        baseTimeframe: '1d',
        barCount: 100,
        scopeKind: 'SYSTEM',
        displayLabel: 'AAPL System',
      },
    ],
    localDataSources: [buildLocalDataSource()],
  });

  const aaplInstruments = facts.instruments.filter(
    (instrument) => instrument.symbol === 'AAPL' && instrument.baseTimeframe === '1d',
  );
  assert.equal(aaplInstruments.length, 2);
  assert.deepEqual(
    aaplInstruments.map((instrument) => instrument.id).sort(),
    ['local-aapl-1d', 'system-aapl-1d'],
  );

  const localInstrument = aaplInstruments.find(
    (instrument) => instrument.id === 'local-aapl-1d',
  );
  const systemInstrument = aaplInstruments.find(
    (instrument) => instrument.id === 'system-aapl-1d',
  );
  assert.ok(localInstrument);
  assert.ok(systemInstrument);
  assert.equal(localInstrument.scopeKind, 'LOCAL');
  assert.equal(systemInstrument.scopeKind, 'SYSTEM');
  assert.ok(localInstrument.samplePoolIds.includes('local-source-1'));
  assert.ok(systemInstrument.samplePoolIds.includes('SYSTEM:1d'));
});
