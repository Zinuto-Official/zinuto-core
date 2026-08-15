// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createMarketAcquisitionCatalogCache,
  MARKET_ACQUISITION_CATALOG_CACHE_TTL_MS,
  type MarketAcquisitionCatalogCacheInstrument,
} from '../../src/application/market-data-acquisition/marketAcquisitionCatalogCache.js';

const instruments: MarketAcquisitionCatalogCacheInstrument[] = [
  { symbol: '7203', name: 'TOYOTA MOTOR CORPORATION', exchangeId: 'TSE' },
  { symbol: '9984', name: 'SOFTBANK GROUP', exchangeId: 'TSE' },
];

const catalogInput = ({
  forceRefresh,
  load,
  connectorFingerprint = 'financedatareader:0.9.202',
}: {
  forceRefresh: boolean;
  load: () => Promise<MarketAcquisitionCatalogCacheInstrument[]>;
  connectorFingerprint?: string;
}) => ({
  marketId: 'JP_STOCKS' as const,
  sourcePlanId: 'FDR_TSE' as const,
  connectorFingerprint,
  forceRefresh,
  load,
});

test('market catalog cache persists for seven days, expires at the boundary, and marks stale fallback', async (t) => {
  const cacheDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'zinuto-market-catalog-cache-'),
  );
  t.after(() => fs.rm(cacheDir, { recursive: true, force: true }));
  let nowMs = Date.parse('2026-08-15T00:00:00.000Z');
  let upstreamCalls = 0;
  const cache = () =>
    createMarketAcquisitionCatalogCache({
      cacheDir,
      now: () => new Date(nowMs),
    });

  const first = await cache().readOrLoad(
    catalogInput({
      forceRefresh: false,
      load: async () => {
        upstreamCalls += 1;
        return instruments;
      },
    }),
  );
  assert.equal(first.cacheState, 'FRESH');
  assert.equal(upstreamCalls, 1);
  first.instruments[0]!.name = 'mutated response';

  nowMs += MARKET_ACQUISITION_CATALOG_CACHE_TTL_MS - 1;
  const restarted = await cache().readOrLoad(
    catalogInput({
      forceRefresh: false,
      load: async () => {
        upstreamCalls += 1;
        return instruments;
      },
    }),
  );
  assert.equal(restarted.cacheState, 'FRESH');
  assert.equal(restarted.instruments[0]?.name, 'TOYOTA MOTOR CORPORATION');
  assert.equal(upstreamCalls, 1);

  nowMs += 1;
  const stale = await cache().readOrLoad(
    catalogInput({
      forceRefresh: false,
      load: async () => {
        upstreamCalls += 1;
        throw new Error('upstream unavailable');
      },
    }),
  );
  assert.equal(stale.cacheState, 'STALE');
  assert.deepEqual(stale.instruments, instruments);
  assert.equal(upstreamCalls, 2);
});

test('manual refresh bypasses a fresh catalog and version fingerprints invalidate old records', async (t) => {
  const cacheDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'zinuto-market-catalog-force-'),
  );
  t.after(() => fs.rm(cacheDir, { recursive: true, force: true }));
  const now = () => new Date('2026-08-15T00:00:00.000Z');
  const cache = createMarketAcquisitionCatalogCache({ cacheDir, now });
  let upstreamCalls = 0;

  await cache.readOrLoad(
    catalogInput({
      forceRefresh: false,
      load: async () => {
        upstreamCalls += 1;
        return instruments;
      },
    }),
  );
  const refreshed = await cache.readOrLoad(
    catalogInput({
      forceRefresh: true,
      load: async () => {
        upstreamCalls += 1;
        return [{ symbol: '7203', name: 'Toyota refreshed', exchangeId: 'TSE' }];
      },
    }),
  );
  assert.equal(refreshed.cacheState, 'FRESH');
  assert.equal(refreshed.instruments[0]?.name, 'Toyota refreshed');
  assert.equal(upstreamCalls, 2);

  const versionChanged = await cache.readOrLoad(
    catalogInput({
      connectorFingerprint: 'financedatareader:0.9.203',
      forceRefresh: false,
      load: async () => {
        upstreamCalls += 1;
        return [{ symbol: '7203', name: 'Toyota new version', exchangeId: 'TSE' }];
      },
    }),
  );
  assert.equal(versionChanged.cacheState, 'FRESH');
  assert.equal(versionChanged.instruments[0]?.name, 'Toyota new version');
  assert.equal(upstreamCalls, 3);
});

test('concurrent catalog reads merge one upstream load and a missing cache does not hide an error', async (t) => {
  const cacheDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'zinuto-market-catalog-concurrent-'),
  );
  t.after(() => fs.rm(cacheDir, { recursive: true, force: true }));
  const cache = createMarketAcquisitionCatalogCache({
    cacheDir,
    now: () => new Date('2026-08-15T00:00:00.000Z'),
  });
  let releaseLoad: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    releaseLoad = resolve;
  });
  let upstreamCalls = 0;
  const load = async () => {
    upstreamCalls += 1;
    await gate;
    return instruments;
  };

  const first = cache.readOrLoad(catalogInput({ forceRefresh: false, load }));
  const second = cache.readOrLoad(catalogInput({ forceRefresh: false, load }));
  releaseLoad?.();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(upstreamCalls, 1);
  assert.deepEqual(firstResult.instruments, instruments);
  assert.deepEqual(secondResult.instruments, instruments);

  const emptyCache = createMarketAcquisitionCatalogCache({
    cacheDir: path.join(cacheDir, 'empty'),
    now: () => new Date('2026-08-15T00:00:00.000Z'),
  });
  await assert.rejects(
    emptyCache.readOrLoad(
      catalogInput({
        forceRefresh: false,
        load: async () => {
          throw new Error('no cached directory');
        },
      }),
    ),
    /no cached directory/u,
  );
});
