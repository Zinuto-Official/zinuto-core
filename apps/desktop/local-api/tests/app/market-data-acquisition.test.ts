// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { desktopMarketDataAcquisitionJobCreateRequestSchema } from '@zinuto/shared/contracts-desktop/api';

import {
  AKSHARE_SIDECAR_PROTOCOL,
  buildAkshareSidecarRequest,
  createAkshareSidecarAdapter,
  parseAkshareSidecarResponse,
  resolveAkshareSidecarLaunchSpec,
  type AkshareAcquisitionAdapter,
} from '../../src/application/market-data-acquisition/akshareSidecarAdapter.js';
import { validateAcquisitionStagingWithImportPreview } from '../../src/application/market-data-acquisition/acquisitionImportValidation.js';
import { normalizeAndValidateAcquisitionBars } from '../../src/application/market-data-acquisition/acquisitionStaging.js';
import {
  applyMarketDataHttpsProxy,
  createCcxtAcquisitionAdapter,
  resolveMarketDataHttpsProxy,
} from '../../src/application/market-data-acquisition/ccxtAcquisitionAdapter.js';
import { createMarketDataAcquisitionService } from '../../src/application/market-data-acquisition/marketDataAcquisitionService.js';
import {
  AcquisitionRuntimeError,
  type AcquisitionConnectorAdapter,
  type CcxtAcquisitionAdapter,
} from '../../src/application/market-data-acquisition/marketDataAcquisitionTypes.js';

const ccxtRequest = {
  connectorId: 'ccxt' as const,
  exchangeId: 'binance' as const,
  marketType: 'spot' as const,
  symbols: ['BTC/USDT'],
  timeframe: '1m' as const,
  startAt: '2026-07-18T00:00:00Z',
  endAt: '2026-07-18T00:05:00Z',
};

test('CCXT uses a validated proxy supplied by the Windows desktop shell', () => {
  assert.equal(
    resolveMarketDataHttpsProxy({
      env: { ZINUTO_MARKET_DATA_HTTPS_PROXY: 'http://127.0.0.1:7897' },
    }),
    'http://127.0.0.1:7897/',
  );
  assert.equal(
    resolveMarketDataHttpsProxy({
      env: { ZINUTO_MARKET_DATA_HTTPS_PROXY: 'ftp://proxy.example.test:21' },
    }),
    null,
  );

  const exchange = {
    has: {},
    loadMarkets: async () => ({}),
    market: () => ({}),
    fetchOHLCV: async () => [],
  };
  applyMarketDataHttpsProxy(exchange, {
    env: { ZINUTO_MARKET_DATA_HTTPS_PROXY: 'https://proxy.example.test:8443' },
  });
  assert.equal(exchange.httpsProxy, 'https://proxy.example.test:8443/');
});

const waitForStatus = async (
  service: ReturnType<typeof createMarketDataAcquisitionService>,
  jobId: string,
  status: 'RUNNING' | 'READY_TO_SAVE' | 'FAILED' | 'CANCELED',
) => {
  const timeoutAt = Date.now() + 5_000;
  let lastJob = service.getJob(jobId);
  while (Date.now() < timeoutAt) {
    const job = service.getJob(jobId);
    if (job.status === status) return job;
    if (job.status === 'FAILED' && status !== 'FAILED') {
      assert.fail(
        `job ${jobId} reached FAILED at ${job.progress.stage}: ${job.error?.code ?? 'UNKNOWN'} ${JSON.stringify(job.error?.args ?? {})}`,
      );
    }
    lastJob = job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(
    `job ${jobId} did not reach ${status}; last status was ${lastJob.status}`,
  );
};

test('acquisition request schema is closed and enforces connector-specific fields', () => {
  assert.equal(
    desktopMarketDataAcquisitionJobCreateRequestSchema.safeParse(ccxtRequest).success,
    true,
  );
  assert.equal(
    desktopMarketDataAcquisitionJobCreateRequestSchema.safeParse({
      ...ccxtRequest,
      apiKey: 'forbidden',
    }).success,
    false,
  );
  assert.equal(
    desktopMarketDataAcquisitionJobCreateRequestSchema.safeParse({
      ...ccxtRequest,
      exchangeId: 'coinbase',
    }).success,
    false,
  );
  assert.equal(
    desktopMarketDataAcquisitionJobCreateRequestSchema.safeParse({
      connectorId: 'akshare',
      dataset: 'stock_zh_a_hist',
      symbols: ['000001'],
      timeframe: '5m',
      startAt: '2026-07-18T00:00:00+08:00',
      endAt: '2026-07-18T23:59:59+08:00',
      adjustment: 'none',
    }).success,
    false,
  );
});

test('AKShare instrument catalog returns cached A shares and supported namespaced indexes', async () => {
  let catalogCalls = 0;
  const aShareInstruments = [
    {
      symbol: '600000',
      name: '浦发银行',
      exchangeId: 'SH',
      kind: 'A_SHARE',
    },
    {
      symbol: '000001',
      name: '平安银行',
      exchangeId: 'SZ',
      kind: 'A_SHARE',
    },
    {
      symbol: '920000',
      name: '安徽凤凰',
      exchangeId: 'BJ',
      kind: 'A_SHARE',
    },
  ] as const;
  const akshareAdapter: AkshareAcquisitionAdapter = {
    id: 'akshare',
    isAvailable: () => true,
    fetchSymbol: async () => assert.fail('catalog lookup must not fetch bars'),
    listInstruments: async () => {
      catalogCalls += 1;
      return aShareInstruments.map((instrument) => ({ ...instrument }));
    },
  };
  const service = createMarketDataAcquisitionService({
    stagingRoot: path.join(os.tmpdir(), 'unused-akshare-catalog-staging'),
    createId: () => 'catalog1',
    now: () => new Date('2026-07-20T00:00:00.000Z'),
    akshareAdapter,
  });

  const first = await service.listAkshareAcquisitionInstruments();
  first.instruments.pop();
  const second = await service.listAkshareAcquisitionInstruments();

  assert.equal(catalogCalls, 1);
  assert.equal(second.cachedAt, '2026-07-20T00:00:00.000Z');
  assert.deepEqual(
    second.instruments.filter((instrument) => instrument.kind === 'A_SHARE'),
    aShareInstruments,
  );
  assert.deepEqual(
    second.instruments.find((instrument) => instrument.symbol === 'INDEX-000001'),
    {
      symbol: 'INDEX-000001',
      name: '上证指数',
      exchangeId: 'SH',
      kind: 'INDEX',
    },
  );
  assert.deepEqual(
    second.instruments.find((instrument) => instrument.symbol === 'INDEX-899050'),
    {
      symbol: 'INDEX-899050',
      name: '北证50',
      exchangeId: 'BJ',
      kind: 'INDEX',
    },
  );
  assert.equal(
    second.instruments.some((instrument) =>
      ['SH', 'SZ', 'BJ'].includes(instrument.symbol)),
    false,
  );
  assert.deepEqual(
    service.listConnectors().connectors[0]?.datasets,
    ['stock_zh_a_hist', 'stock_zh_a_hist_min_em', 'index_zh_a_hist'],
  );
});

test('single local acquisition job writes canonical CSV, source notice, and native manifest', async (t) => {
  const stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-acquisition-'));
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  await fs.mkdir(path.join(stagingRoot, 'stale-job'), { recursive: true });
  const ccxtAdapter: CcxtAcquisitionAdapter = {
    id: 'ccxt',
    isAvailable: () => true,
    listMarkets: async () => ({ markets: [], cachedAt: '2026-07-19T00:00:00.000Z' }),
    fetchSymbol: async () => [
      {
        timestamp: '2026-07-18T00:00:00.000Z',
        open: 100,
        high: 103,
        low: 99,
        close: 102,
        volume: 10,
      },
      {
        timestamp: '2026-07-18T00:01:00.000Z',
        open: 102,
        high: 104,
        low: 101,
        close: 103,
        volume: 8,
      },
      {
        timestamp: '2026-07-18T00:02:00.000Z',
        open: 103,
        high: 105,
        low: 102,
        close: 104,
        volume: 9,
      },
    ],
  };
  const unavailableAkshare: AcquisitionConnectorAdapter = {
    id: 'akshare',
    isAvailable: () => false,
    fetchSymbol: async () => assert.fail('unavailable connector must not run'),
  };
  let productionValidationCalls = 0;
  const service = createMarketDataAcquisitionService({
    stagingRoot,
    createId: () => 'job-00001',
    now: () => new Date('2026-07-19T08:09:10.000Z'),
    akshareAdapter: unavailableAkshare,
    ccxtAdapter,
    validateStaging: async (input) => {
      productionValidationCalls += 1;
      await validateAcquisitionStagingWithImportPreview(input);
    },
  });

  const catalog = service.listConnectors();
  assert.equal(catalog.connectors[0].available, false);
  assert.deepEqual(
    catalog.connectors[0].terms.projects.map((project) => project.id),
    ['aktools', 'akshare'],
  );
  assert.deepEqual(
    catalog.connectors[1].terms.upstreams.map((upstream) => upstream.id),
    ['binance', 'okx'],
  );

  const created = await service.createJob(ccxtRequest);
  assert.equal(created.status, 'QUEUED');
  const ready = await waitForStatus(service, created.id, 'READY_TO_SAVE');
  assert.equal(ready.progress.completedSymbols, 1);
  assert.equal(
    ready.staging?.outputFolderName,
    'Zinuto-Data-ccxt-20260719-080910-job00001',
  );
  assert.equal(await fs.stat(path.join(stagingRoot, 'stale-job')).catch(() => null), null);

  const jobRoot = path.join(stagingRoot, created.id);
  const csv = await fs.readFile(path.join(jobRoot, 'payload', 'BTC-USDT.csv'), 'utf8');
  assert.match(csv, /^datetime,open,high,low,close,volume\n/u);
  assert.match(csv, /2026-07-18T00:01:00\.000Z,102,104,101,103,8/u);
  const source = await fs.readFile(path.join(jobRoot, 'payload', 'SOURCE.md'), 'utf8');
  assert.match(source, /Zinuto does not distribute or host the market data/u);
  assert.match(source, /https:\/\/www\.binance\.com\/en\/terms/u);
  assert.match(source, /`BTC-USDT\.csv` → `BTC-USDT` \(source: `BTC\/USDT`\)/u);
  const manifestBytes = await fs.readFile(path.join(jobRoot, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as {
    schemaVersion: number;
    fileCount: number;
    files: Array<{ relativePath: string; sha256: string }>;
  };
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.fileCount, 2);
  assert.deepEqual(
    manifest.files.map((file) => file.relativePath),
    ['BTC-USDT.csv', 'SOURCE.md'],
  );
  assert.equal(
    ready.staging?.manifestSha256,
    createHash('sha256').update(manifestBytes).digest('hex'),
  );
  assert.equal(productionValidationCalls, 1);
  await service.discardJob(created.id);
  assert.equal(await fs.stat(jobRoot).catch(() => null), null);
});

test('one-bar acquisition remains importable through its versioned timeframe provenance', async (t) => {
  const stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-acquisition-short-'));
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  const service = createMarketDataAcquisitionService({
    stagingRoot,
    createId: () => 'jobshort1',
    now: () => new Date('2026-07-19T08:09:10.000Z'),
    ccxtAdapter: {
      id: 'ccxt',
      isAvailable: () => true,
      listMarkets: async () => ({ markets: [], cachedAt: '2026-07-19T00:00:00.000Z' }),
      fetchSymbol: async () => [
        {
          timestamp: '2026-07-18T00:00:00.000Z',
          open: 100,
          high: 103,
          low: 99,
          close: 102,
          volume: 10,
        },
      ],
    },
  });

  const created = await service.createJob(ccxtRequest);
  const ready = await waitForStatus(service, created.id, 'READY_TO_SAVE');

  assert.equal(ready.progress.completedSymbols, 1);
  assert.equal(ready.staging?.fileCount, 2);
  await service.discardJob(created.id);
});

test('AKShare output passes the production import preview with Shanghai time and source metadata', async (t) => {
  const stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-acquisition-ak-'));
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  const service = createMarketDataAcquisitionService({
    stagingRoot,
    createId: () => 'jobak001',
    now: () => new Date('2026-07-19T08:09:10.000Z'),
    akshareAdapter: {
      id: 'akshare',
      isAvailable: () => true,
      fetchSymbol: async () => [
        {
          timestamp: '2026-07-16T15:00:00+08:00',
          open: 10,
          high: 11,
          low: 9,
          close: 10.5,
          volume: 100,
        },
        {
          timestamp: '2026-07-17T15:00:00+08:00',
          open: 10.5,
          high: 12,
          low: 10,
          close: 11.5,
          volume: 120,
        },
        {
          timestamp: '2026-07-18T15:00:00+08:00',
          open: 11.5,
          high: 13,
          low: 11,
          close: 12,
          volume: 130,
        },
      ],
    },
  });
  const created = await service.createJob({
    connectorId: 'akshare',
    dataset: 'stock_zh_a_hist',
    symbols: ['000001'],
    timeframe: '1d',
    startAt: '2026-07-16T00:00:00+08:00',
    endAt: '2026-07-18T23:59:59+08:00',
    adjustment: 'qfq',
  });
  const ready = await waitForStatus(service, created.id, 'READY_TO_SAVE');
  assert.equal(ready.staging?.fileCount, 2);
  const source = await fs.readFile(
    path.join(stagingRoot, created.id, 'payload', 'SOURCE.md'),
    'utf8',
  );
  assert.match(source, /AKTools 0\.0\.91.*github\.com\/akfamily\/aktools/u);
  assert.match(source, /AKShare 1\.18\.91.*github\.com\/akfamily\/akshare/u);
  assert.match(source, /akshare\.akfamily\.xyz\/introduction\.html/u);
  assert.match(source, /Adjustment: qfq/u);
  assert.match(source, /Asia\/Shanghai \(\+08:00\)/u);
  assert.match(source, /zinuto-market-data-acquisition:.*"adjustment":"qfq"/u);
});

test('AKShare index output keeps the INDEX prefix through CSV naming and import validation', async (t) => {
  const stagingRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'zinuto-acquisition-index-'),
  );
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  const service = createMarketDataAcquisitionService({
    stagingRoot,
    createId: () => 'index001',
    now: () => new Date('2026-07-20T08:09:10.000Z'),
    akshareAdapter: {
      id: 'akshare',
      isAvailable: () => true,
      listInstruments: async () => [],
      fetchSymbol: async ({ request, symbol }) => {
        assert.equal(request.connectorId, 'akshare');
        assert.equal(request.dataset, 'index_zh_a_hist');
        assert.equal(request.adjustment, 'none');
        assert.equal(symbol, 'INDEX-000001');
        return [
          {
            timestamp: '2026-07-16T15:00:00+08:00',
            open: 3_500,
            high: 3_520,
            low: 3_480,
            close: 3_510,
            volume: 1_000,
          },
          {
            timestamp: '2026-07-17T15:00:00+08:00',
            open: 3_510,
            high: 3_530,
            low: 3_500,
            close: 3_520,
            volume: 1_100,
          },
          {
            timestamp: '2026-07-18T15:00:00+08:00',
            open: 3_520,
            high: 3_540,
            low: 3_510,
            close: 3_530,
            volume: 1_200,
          },
        ];
      },
    },
  });

  const created = await service.createJob({
    connectorId: 'akshare',
    dataset: 'index_zh_a_hist',
    symbols: ['INDEX-000001'],
    timeframe: '1d',
    startAt: '2026-07-16T00:00:00+08:00',
    endAt: '2026-07-18T23:59:59+08:00',
    adjustment: 'none',
  });
  const ready = await waitForStatus(service, created.id, 'READY_TO_SAVE');

  assert.equal(ready.staging?.fileCount, 2);
  const payloadRoot = path.join(stagingRoot, created.id, 'payload');
  assert.equal(
    (await fs.stat(path.join(payloadRoot, 'INDEX-000001.csv'))).isFile(),
    true,
  );
  const source = await fs.readFile(path.join(payloadRoot, 'SOURCE.md'), 'utf8');
  assert.match(source, /AKShare China index interface/u);
  assert.match(source, /data\/index\/index\.html/u);
  assert.match(
    source,
    /`INDEX-000001\.csv` → `INDEX-000001` \(source: `INDEX-000001`\)/u,
  );
  assert.match(
    source,
    /"sourceSymbols":\["INDEX-000001"\],"importSymbols":\["INDEX-000001"\]/u,
  );
});

test('one active job is enforced and cancellation drains the adapter', async (t) => {
  const stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-acquisition-cancel-'));
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  let finishCalls = 0;
  const ccxtAdapter: CcxtAcquisitionAdapter = {
    id: 'ccxt',
    isAvailable: () => true,
    listMarkets: async () => ({ markets: [], cachedAt: '2026-07-19T00:00:00.000Z' }),
    fetchSymbol: async ({ signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener(
          'abort',
          () => reject(new AcquisitionRuntimeError('ACQUISITION_CANCELED')),
          { once: true },
        );
      }),
    finishJob: async () => {
      finishCalls += 1;
    },
  };
  let id = 0;
  const service = createMarketDataAcquisitionService({
    stagingRoot,
    createId: () => `job0000${++id}`,
    now: () => new Date('2026-07-19T00:00:00.000Z'),
    ccxtAdapter,
  });
  const created = await service.createJob(ccxtRequest);
  await waitForStatus(service, created.id, 'RUNNING');
  await assert.rejects(
    () => service.createJob(ccxtRequest),
    (error: unknown) =>
      error instanceof AcquisitionRuntimeError && error.code === 'ACQUISITION_JOB_ACTIVE',
  );
  assert.equal(service.cancelJob(created.id).status, 'CANCELED');
  await service.stop();
  assert.equal(service.getJob(created.id).status, 'CANCELED');
  assert.equal(finishCalls, 1);
});

test('concurrent job creation reserves the single active slot before pruning', async (t) => {
  const stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-acquisition-race-'));
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  let id = 0;
  const service = createMarketDataAcquisitionService({
    stagingRoot,
    createId: () => `job0000${++id}`,
    now: () => new Date('2026-07-19T00:00:00.000Z'),
    ccxtAdapter: {
      id: 'ccxt',
      isAvailable: () => true,
      listMarkets: async () => ({ markets: [], cachedAt: '2026-07-19T00:00:00.000Z' }),
      fetchSymbol: async ({ signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new AcquisitionRuntimeError('ACQUISITION_CANCELED')),
            { once: true },
          );
        }),
    },
  });

  const results = await Promise.allSettled([
    service.createJob(ccxtRequest),
    service.createJob(ccxtRequest),
  ]);
  const fulfilled = results.filter(
    (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof service.createJob>>> =>
      result.status === 'fulfilled',
  );
  const rejected = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(
    rejected[0]?.reason instanceof AcquisitionRuntimeError &&
      rejected[0].reason.code === 'ACQUISITION_JOB_ACTIVE',
    true,
  );
  service.cancelJob(fulfilled[0].value.id);
  await service.stop();
});

test('runtime start removes interrupted private staging before any job is created', async (t) => {
  const stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-acquisition-start-'));
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  const staleFile = path.join(stagingRoot, 'interrupted-job', 'payload', 'stale.csv');
  await fs.mkdir(path.dirname(staleFile), { recursive: true });
  await fs.writeFile(staleFile, 'stale', 'utf8');
  const service = createMarketDataAcquisitionService({
    stagingRoot,
    createId: () => 'job00001',
    now: () => new Date('2026-07-19T00:00:00.000Z'),
  });

  await service.start();

  assert.equal(await fs.stat(staleFile).catch(() => null), null);
  assert.equal((await fs.stat(stagingRoot)).isDirectory(), true);
});

test('job retention prunes discarded READY staging before accepting job 21', async (t) => {
  const stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-acquisition-prune-'));
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  let id = 0;
  const service = createMarketDataAcquisitionService({
    stagingRoot,
    createId: () => `job${String(id += 1).padStart(5, '0')}`,
    now: () => new Date('2026-07-19T00:00:00.000Z'),
    validateStaging: async () => undefined,
    ccxtAdapter: {
      id: 'ccxt',
      isAvailable: () => true,
      listMarkets: async () => ({ markets: [], cachedAt: '2026-07-19T00:00:00.000Z' }),
      fetchSymbol: async () => [
        {
          timestamp: '2026-07-18T00:00:00.000Z',
          open: 1,
          high: 2,
          low: 1,
          close: 1.5,
          volume: 1,
        },
        {
          timestamp: '2026-07-18T00:01:00.000Z',
          open: 1.5,
          high: 2,
          low: 1,
          close: 1.8,
          volume: 1,
        },
        {
          timestamp: '2026-07-18T00:02:00.000Z',
          open: 1.8,
          high: 2.1,
          low: 1.7,
          close: 2,
          volume: 1,
        },
      ],
    },
  });
  const jobIds: string[] = [];
  for (let jobIndex = 0; jobIndex < 21; jobIndex += 1) {
    const created = await service.createJob(ccxtRequest);
    jobIds.push(created.id);
    await waitForStatus(service, created.id, 'READY_TO_SAVE');
  }
  assert.equal(await fs.stat(path.join(stagingRoot, jobIds[0]!)).catch(() => null), null);
  assert.equal((await fs.stat(path.join(stagingRoot, jobIds[1]!))).isDirectory(), true);
  assert.throws(
    () => service.getJob(jobIds[0]!),
    /ACQUISITION_JOB_NOT_FOUND/u,
  );
});

test('CCXT adapter caches bounded active spot markets and drops unfinished candles', async () => {
  let loadCalls = 0;
  let closeCalls = 0;
  let fetchCalls = 0;
  const exchangeFactory = async () => ({
    has: { fetchOHLCV: true },
    timeframes: { '1m': '1m' },
    loadMarkets: async () => {
      loadCalls += 1;
      return {
        active: {
          symbol: 'BTC/USDT',
          base: 'BTC',
          quote: 'USDT',
          spot: true,
          active: true,
        },
        inactive: {
          symbol: 'OLD/USDT',
          base: 'OLD',
          quote: 'USDT',
          spot: true,
          active: false,
        },
        future: {
          symbol: 'BTC/USDT:USDT',
          base: 'BTC',
          quote: 'USDT',
          spot: false,
          active: true,
        },
      };
    },
    market: () => ({ spot: true, active: true }),
    fetchOHLCV: async () => {
      fetchCalls += 1;
      return fetchCalls === 1
        ? [
            [Date.parse('2026-07-19T00:00:00Z'), 1, 2, 0.5, 1.5, 10],
            [Date.parse('2026-07-19T00:10:00Z'), 1.5, 2, 1, 1.8, 12],
          ]
        : [];
    },
    close: async () => {
      closeCalls += 1;
    },
  });
  const adapter = createCcxtAcquisitionAdapter({
    exchangeFactory,
    now: () => Date.parse('2026-07-19T00:10:30Z'),
  });
  const firstCatalog = await adapter.listMarkets('binance', 'btc');
  const secondCatalog = await adapter.listMarkets('binance', 'usdt');
  assert.deepEqual(firstCatalog.markets.map((market) => market.symbol), ['BTC/USDT']);
  assert.equal(secondCatalog.markets.length, 1);
  assert.equal(loadCalls, 1);
  assert.equal(closeCalls, 1);

  const rows = await adapter.fetchSymbol({
    jobId: 'job00001',
    request: {
      ...ccxtRequest,
      startAt: '2026-07-19T00:00:00Z',
      endAt: '2026-07-19T00:20:00Z',
    },
    symbol: 'BTC/USDT',
    signal: new AbortController().signal,
  });
  assert.deepEqual(rows.map((row) => row.timestamp), ['2026-07-19T00:00:00.000Z']);
  await adapter.finishJob?.('job00001');
  assert.equal(loadCalls, 2);
  assert.equal(closeCalls, 2);
});

test('CCXT pagination keeps a monotonic cursor and retries bounded 429/5xx failures', async () => {
  const startAtMs = Date.parse('2026-07-19T00:00:00Z');
  const cursors: number[] = [];
  const waits: number[] = [];
  const retryEvents: Array<{ attempt: number; retryAfterMs: number }> = [];
  let fetchCall = 0;
  const rateLimitError = new Error('429');
  rateLimitError.name = 'RateLimitExceeded';
  const unavailableError = new Error('HTTP 503');
  unavailableError.name = 'ExchangeNotAvailable';
  const adapter = createCcxtAcquisitionAdapter({
    retryDelaysMs: [10, 20],
    wait: async (delayMs) => {
      waits.push(delayMs);
    },
    now: () => Date.parse('2026-07-20T00:00:00Z'),
    exchangeFactory: async () => ({
      has: { fetchOHLCV: true },
      timeframes: { '1m': '1m' },
      loadMarkets: async () => ({
        btc: {
          symbol: 'BTC/USDT',
          base: 'BTC',
          quote: 'USDT',
          spot: true,
          active: true,
        },
      }),
      market: () => ({ spot: true, active: true }),
      fetchOHLCV: async (_symbol, _timeframe, since) => {
        cursors.push(since ?? -1);
        fetchCall += 1;
        if (fetchCall === 1) throw rateLimitError;
        if (fetchCall === 2) return [[startAtMs, 1, 2, 0.5, 1.5, 10]];
        if (fetchCall === 3) throw unavailableError;
        if (fetchCall === 4) {
          return [[startAtMs + 60_000, 1.5, 2, 1, 1.8, 11]];
        }
        return [];
      },
      close: async () => undefined,
    }),
  });
  const rows = await adapter.fetchSymbol({
    jobId: 'job00002',
    request: {
      ...ccxtRequest,
      startAt: '2026-07-19T00:00:00Z',
      endAt: '2026-07-19T00:02:00Z',
    },
    symbol: 'BTC/USDT',
    signal: new AbortController().signal,
    onRetryWait: (event) => retryEvents.push(event),
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(cursors, [
    startAtMs,
    startAtMs,
    startAtMs + 60_000,
    startAtMs + 60_000,
    startAtMs + 120_000,
  ]);
  assert.deepEqual(waits, [10, 10]);
  assert.deepEqual(retryEvents, [
    { attempt: 1, retryAfterMs: 10 },
    { attempt: 1, retryAfterMs: 10 },
  ]);
});

test('normalization accepts a valid short result when cadence cannot be inferred', () => {
  const oneBar = {
    timestamp: '2026-07-18T00:00:00.000Z',
    open: 1,
    high: 2,
    low: 1,
    close: 1.5,
    volume: 1,
  };
  const twoBars = [
    oneBar,
    {
      ...oneBar,
      timestamp: '2026-07-18T00:01:00.000Z',
      open: 1.5,
      close: 1.8,
    },
  ];

  assert.deepEqual(
    normalizeAndValidateAcquisitionBars({ request: ccxtRequest, rows: [oneBar] }),
    [oneBar],
  );
  assert.deepEqual(
    normalizeAndValidateAcquisitionBars({ request: ccxtRequest, rows: twoBars }),
    twoBars,
  );
});

test('normalization rejects empty data, schema drift, and conflicting duplicates', () => {
  assert.throws(
    () => normalizeAndValidateAcquisitionBars({ request: ccxtRequest, rows: [] }),
    /ACQUISITION_NO_DATA/u,
  );
  assert.throws(
    () =>
      normalizeAndValidateAcquisitionBars({
        request: {
          ...ccxtRequest,
          endAt: '2026-07-18T00:10:00Z',
        },
        rows: [
          {
            timestamp: '2026-07-18T00:00:00.000Z',
            open: 1,
            high: 2,
            low: 1,
            close: 1.5,
            volume: 1,
          },
          {
            timestamp: '2026-07-18T00:05:00.000Z',
            open: 1.5,
            high: 2,
            low: 1,
            close: 1.8,
            volume: 1,
          },
          {
            timestamp: '2026-07-18T00:10:00.000Z',
            open: 1.8,
            high: 2.1,
            low: 1.7,
            close: 2,
            volume: 1,
          },
        ],
      }),
    /ACQUISITION_TIMEFRAME_INVALID/u,
  );
  assert.throws(
    () =>
      normalizeAndValidateAcquisitionBars({
        request: ccxtRequest,
        rows: [
          {
            timestamp: '2026-07-18T00:00:00.000Z',
            open: Number.NaN,
            high: 2,
            low: 1,
            close: 1.5,
            volume: 1,
          },
        ],
      }),
    /ACQUISITION_BAR_INVALID/u,
  );
  assert.throws(
    () =>
      normalizeAndValidateAcquisitionBars({
        request: ccxtRequest,
        rows: [
          {
            timestamp: '2026-07-18T00:00:00.000Z',
            open: 1,
            high: 2,
            low: 1,
            close: 1.5,
            volume: 1,
          },
          {
            timestamp: '2026-07-18T00:00:00.000Z',
            open: 1,
            high: 3,
            low: 1,
            close: 2,
            volume: 1,
          },
        ],
      }),
    /ACQUISITION_DUPLICATE_CONFLICT/u,
  );
});

test('AKShare sidecar protocol is fixed, versioned, and validates runtime versions', () => {
  const input = {
    jobId: 'job00001',
    request: {
      connectorId: 'akshare' as const,
      dataset: 'stock_zh_a_hist' as const,
      symbols: ['000001'],
      timeframe: '1d' as const,
      startAt: '2026-07-18T00:00:00+08:00',
      endAt: '2026-07-18T23:59:59+08:00',
      adjustment: 'none' as const,
    },
    symbol: '000001',
    signal: new AbortController().signal,
  };
  const request = buildAkshareSidecarRequest(input);
  assert.equal(request.protocol, AKSHARE_SIDECAR_PROTOCOL);
  assert.equal(request.operation, 'stock_zh_a_hist');
  assert.deepEqual(Object.keys(request.params).sort(), [
    'adjustment',
    'endAt',
    'startAt',
    'symbol',
    'timeframe',
  ]);
  const rows = parseAkshareSidecarResponse(
    JSON.stringify({
      protocol: AKSHARE_SIDECAR_PROTOCOL,
      requestId: request.requestId,
      ok: true,
      runtime: { aktools: '0.0.91', akshare: '1.18.91' },
      kind: 'bars',
      rows: [
        {
          timestamp: '2026-07-18T15:00:00+08:00',
          open: 10,
          high: 11,
          low: 9,
          close: 10.5,
          volume: 100,
        },
      ],
    }),
    request.requestId,
  );
  assert.equal(rows.length, 1);
  assert.throws(
    () =>
      parseAkshareSidecarResponse(
        JSON.stringify({
          protocol: AKSHARE_SIDECAR_PROTOCOL,
          requestId: request.requestId,
          ok: true,
          runtime: { aktools: '0.0.90', akshare: '1.18.91' },
          kind: 'bars',
          rows: [],
        }),
        request.requestId,
      ),
    /AKSHARE_SIDECAR_RESPONSE_INVALID/u,
  );
});

test('production sidecar resolution rejects inherited development paths', async (t) => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-sidecar-trust-'));
  t.after(() => fs.rm(fixtureRoot, { recursive: true, force: true }));
  const executablePath = path.join(fixtureRoot, 'signed-sidecar');
  await fs.writeFile(executablePath, 'fixture', { mode: 0o700 });
  await fs.chmod(executablePath, 0o700);

  assert.equal(
    resolveAkshareSidecarLaunchSpec({
      NODE_ENV: 'production',
      ZINUTO_AKSHARE_SIDECAR_PATH: executablePath,
    }),
    null,
  );
  assert.equal(
    resolveAkshareSidecarLaunchSpec({
      NODE_ENV: 'production',
      ZINUTO_AKSHARE_TRUSTED_SIDECAR_PATH: executablePath,
    })?.source,
    'TRUSTED_NATIVE',
  );
  assert.equal(
    resolveAkshareSidecarLaunchSpec({
      NODE_ENV: 'test',
      ZINUTO_AKSHARE_SIDECAR_PATH: executablePath,
    })?.source,
    'EXPLICIT',
  );
});

test('AKShare retries only retryable upstream responses and reports wait progress', async () => {
  let executeCalls = 0;
  const waits: number[] = [];
  const retryEvents: Array<{ attempt: number; retryAfterMs: number }> = [];
  const resumeEvents: number[] = [];
  const adapter = createAkshareSidecarAdapter({
    resolveLaunchSpec: () => ({ command: '/signed/sidecar', args: [], source: 'EXPLICIT' }),
    retryDelaysMs: [5, 10],
    wait: async (delayMs) => {
      waits.push(delayMs);
    },
    execute: async ({ request }) => {
      executeCalls += 1;
      if (executeCalls < 3) {
        return JSON.stringify({
          protocol: AKSHARE_SIDECAR_PROTOCOL,
          requestId: request.requestId,
          ok: false,
          error: {
            code: 'AKSHARE_UPSTREAM_RETRYABLE',
            args: { statusCode: executeCalls === 1 ? 429 : 503 },
          },
        });
      }
      return JSON.stringify({
        protocol: AKSHARE_SIDECAR_PROTOCOL,
        requestId: request.requestId,
        ok: true,
        runtime: { aktools: '0.0.91', akshare: '1.18.91' },
        kind: 'bars',
        rows: [
          {
            timestamp: '2026-07-18T15:00:00+08:00',
            open: 10,
            high: 11,
            low: 9,
            close: 10.5,
            volume: 100,
          },
        ],
      });
    },
  });
  const rows = await adapter.fetchSymbol({
    jobId: 'job00003',
    request: {
      connectorId: 'akshare',
      dataset: 'stock_zh_a_hist',
      symbols: ['000001'],
      timeframe: '1d',
      startAt: '2026-07-18T00:00:00+08:00',
      endAt: '2026-07-18T23:59:59+08:00',
      adjustment: 'qfq',
    },
    symbol: '000001',
    signal: new AbortController().signal,
    onRetryWait: (event) => retryEvents.push(event),
    onRetryResume: () => resumeEvents.push(1),
  });
  assert.equal(rows.length, 1);
  assert.equal(executeCalls, 3);
  assert.deepEqual(waits, [5, 10]);
  assert.deepEqual(retryEvents, [
    { attempt: 1, retryAfterMs: 5 },
    { attempt: 2, retryAfterMs: 10 },
  ]);
  assert.equal(resumeEvents.length, 2);
});

test('AKShare worker and build entry contain no generic HTTP or dynamic dispatch surface', async () => {
  const worker = await fs.readFile(
    path.resolve(process.cwd(), 'sidecars/akshare/main.py'),
    'utf8',
  );
  const buildScript = await fs.readFile(
    path.resolve(process.cwd(), 'scripts/build-akshare-sidecar.mjs'),
    'utf8',
  );
  const runtime = await fs.readFile(
    path.resolve(process.cwd(), 'src/runtime/index.ts'),
    'utf8',
  );
  assert.doesNotMatch(worker, /\beval\s*\(/u);
  assert.doesNotMatch(worker, /FastAPI|uvicorn|CORSMiddleware|listen\s*\(/u);
  assert.doesNotMatch(worker, /aktools\.(?:core|main|api|cli)/u);
  assert.match(worker, /^import aktools$/mu);
  assert.match(worker, /aktools\.__version__/u);
  assert.match(worker, /from multiprocessing import freeze_support/u);
  assert.match(worker, /freeze_support\(\)[\s\S]*raise SystemExit\(main\(\)\)/u);
  assert.match(worker, /ALLOWED_OPERATIONS/u);
  assert.match(buildScript, /python-sidecar-dependencies\.json/u);
  assert.match(buildScript, /lockSha256/u);
  assert.match(buildScript, /UV_PROJECT_ENVIRONMENT/u);
  assert.match(buildScript, /process\.once\(["']exit["']/u);
  assert.match(buildScript, /--onedir/u);
  assert.match(buildScript, /resolveAkshareSidecarPackageLayout/u);
  assert.match(buildScript, /stageAkshareSidecarPackageInput/u);
  assert.match(buildScript, /generatedRoot/u);
  assert.match(runtime, /stopMarketDataAcquisitionRuntime/u);
  assert.match(runtime, /startMarketDataAcquisitionRuntime/u);
});
