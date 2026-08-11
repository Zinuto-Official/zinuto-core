// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';

import { createCcxtAcquisitionAdapter } from '../../src/application/market-data-acquisition/ccxtAcquisitionAdapter.js';

test('CCXT market catalogs merge same-exchange loads and serialize all exchanges', async () => {
  let activeLoads = 0;
  let maxActiveLoads = 0;
  const factoryCalls: string[] = [];
  const loadCalls: string[] = [];
  const closeCalls: string[] = [];
  let releaseFirstLoad = () => undefined;
  let markFirstLoadStarted = () => undefined;
  const firstLoadStarted = new Promise<void>((resolve) => {
    markFirstLoadStarted = resolve;
  });
  const firstLoadGate = new Promise<void>((resolve) => {
    releaseFirstLoad = resolve;
  });
  const adapter = createCcxtAcquisitionAdapter({
    now: () => Date.parse('2026-07-19T00:00:00Z'),
    exchangeFactory: async (exchangeId) => {
      factoryCalls.push(exchangeId);
      return {
        has: { fetchOHLCV: true },
        timeframes: { '1m': '1m' },
        loadMarkets: async () => {
          loadCalls.push(exchangeId);
          activeLoads += 1;
          maxActiveLoads = Math.max(maxActiveLoads, activeLoads);
          try {
            if (loadCalls.length === 1) {
              markFirstLoadStarted();
              await firstLoadGate;
            }
            const base = exchangeId === 'binance' ? 'BTC' : 'ETH';
            return {
              market: {
                symbol: `${base}/USDT`,
                base,
                quote: 'USDT',
                spot: true,
                active: true,
              },
            };
          } finally {
            activeLoads -= 1;
          }
        },
        market: () => ({ spot: true, active: true }),
        fetchOHLCV: async () => [],
        close: async () => {
          closeCalls.push(exchangeId);
        },
      };
    },
  });

  const firstBinance = adapter.listMarkets('binance', 'btc');
  const secondBinance = adapter.listMarkets('binance', 'usdt');
  const okx = adapter.listMarkets('okx', 'eth');
  await firstLoadStarted;
  await Promise.resolve();
  assert.deepEqual(factoryCalls, ['binance']);
  assert.deepEqual(loadCalls, ['binance']);
  releaseFirstLoad();

  const [firstResult, secondResult, okxResult] = await Promise.all([
    firstBinance,
    secondBinance,
    okx,
  ]);
  assert.deepEqual(firstResult.markets.map((market) => market.symbol), ['BTC/USDT']);
  assert.deepEqual(secondResult.markets.map((market) => market.symbol), ['BTC/USDT']);
  assert.deepEqual(okxResult.markets.map((market) => market.symbol), ['ETH/USDT']);
  assert.deepEqual(factoryCalls, ['binance', 'okx']);
  assert.deepEqual(loadCalls, ['binance', 'okx']);
  assert.deepEqual(closeCalls, ['binance', 'okx']);
  assert.equal(maxActiveLoads, 1);

  await adapter.listMarkets('binance', '');
  assert.deepEqual(loadCalls, ['binance', 'okx']);
});

test('CCXT market catalogs put familiar spot pairs before the long tail', async () => {
  const adapter = createCcxtAcquisitionAdapter({
    now: () => Date.parse('2026-07-19T00:00:00Z'),
    exchangeFactory: async () => ({
      has: { fetchOHLCV: true },
      timeframes: { '1m': '1m' },
      loadMarkets: async () => ({
        zzz: {
          symbol: 'ZZZ/USDT',
          base: 'ZZZ',
          quote: 'USDT',
          spot: true,
          active: true,
        },
        eth: {
          symbol: 'ETH/USDT',
          base: 'ETH',
          quote: 'USDT',
          spot: true,
          active: true,
        },
        btc: {
          symbol: 'BTC/USDT',
          base: 'BTC',
          quote: 'USDT',
          spot: true,
          active: true,
        },
        ada: {
          symbol: 'ADA/USDT',
          base: 'ADA',
          quote: 'USDT',
          spot: true,
          active: true,
        },
      }),
      market: () => ({ spot: true, active: true }),
      fetchOHLCV: async () => [],
      close: async () => undefined,
    }),
  });

  const result = await adapter.listMarkets('binance', '');
  assert.deepEqual(
    result.markets.map((market) => market.symbol),
    ['BTC/USDT', 'ETH/USDT', 'ADA/USDT', 'ZZZ/USDT'],
  );
});
