// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';

import { restoreSystemMarketSeedMetadataAfterLocalClearCore } from '../../src/application/dataSource/systemSeedReseed.js';

test('restoreSystemMarketSeedMetadataAfterLocalClearCore restores system instrument metadata after local clear', async () => {
  const upserts: Array<{
    instrumentId: string;
    symbol: string;
    baseTimeframe: '1m' | '1d';
    name: string;
    timeZone: string;
    minTradeStep: number;
    barCount: number;
    timeStartTs: string | null;
    timeEndTs: string | null;
    barsVersionToken: string;
    createdAt: string;
  }> = [];

  await restoreSystemMarketSeedMetadataAfterLocalClearCore({
    listSystemSeedInstruments: () => [
      {
        symbol: ' aapl ',
        baseTimeframe: '1d',
        name: 'AAPL',
        timeZone: 'America/New_York',
        minTradeStep: 0.01,
      },
    ],
    resolveSystemSeedInstrumentMetadata: (symbol, baseTimeframe) =>
      symbol === 'AAPL' && baseTimeframe === '1d'
        ? {
            barCount: 2,
            timeStartTs: '2024-01-01T00:00:00.000Z',
            timeEndTs: '2024-01-02T00:00:00.000Z',
            barsVersionToken: 'system-seed-v1:AAPL',
          }
        : null,
    getSystemInstrumentBySymbol: () => undefined,
    createId: () => 'instrument-system-aapl',
    upsertSystemInstrument: (payload) => {
      upserts.push(payload);
    },
    nowIso: () => '2026-04-01T00:00:00.000Z',
  });

  assert.deepEqual(upserts, [
    {
      instrumentId: 'instrument-system-aapl',
      symbol: 'AAPL',
      baseTimeframe: '1d',
      name: 'AAPL',
      timeZone: 'America/New_York',
      minTradeStep: 0.01,
      barCount: 2,
      timeStartTs: '2024-01-01T00:00:00.000Z',
      timeEndTs: '2024-01-02T00:00:00.000Z',
      barsVersionToken: 'system-seed-v1:AAPL',
      createdAt: '2026-04-01T00:00:00.000Z',
    },
  ]);
});

test('restoreSystemMarketSeedMetadataAfterLocalClearCore fails when system seed metadata is missing', async () => {
  await assert.rejects(
    () =>
      restoreSystemMarketSeedMetadataAfterLocalClearCore({
        listSystemSeedInstruments: () => [
          {
            symbol: 'AAPL',
            baseTimeframe: '1d',
            name: 'AAPL',
            timeZone: 'America/New_York',
            minTradeStep: 0.01,
          },
        ],
        resolveSystemSeedInstrumentMetadata: () => null,
        getSystemInstrumentBySymbol: () => undefined,
        createId: () => 'instrument-system-aapl',
        upsertSystemInstrument: () => undefined,
        nowIso: () => '2026-04-01T00:00:00.000Z',
      }),
    /SYSTEM_SEED_METADATA_MISSING/,
  );
});
