// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { desktopMarketDataAcquisitionJobCreateRequestSchema } from "@zinuto/shared/contracts-desktop/api";

import {
  AKSHARE_SIDECAR_PROTOCOL,
  buildAkshareSidecarRequest,
  createAkshareSidecarAdapter,
  parseAkshareSidecarResponse,
  resolveAkshareSidecarLaunchSpec,
  type AkshareAcquisitionAdapter,
} from "../../src/application/market-data-acquisition/akshareSidecarAdapter.js";
import { validateAcquisitionStagingWithImportPreview } from "../../src/application/market-data-acquisition/acquisitionImportValidation.js";
import { normalizeAndValidateAcquisitionBars } from "../../src/application/market-data-acquisition/acquisitionStaging.js";
import {
  applyMarketDataHttpsProxy,
  createCcxtAcquisitionAdapter,
  resolveMarketDataHttpsProxy,
} from "../../src/application/market-data-acquisition/ccxtAcquisitionAdapter.js";
import {
  createMarketDataAcquisitionService,
} from "../../src/application/market-data-acquisition/marketDataAcquisitionService.js";
import { createMemoryAcquisitionJobStore } from "../../src/infrastructure/db/marketDataAcquisition/marketDataAcquisitionJobStore.js";
import {
  AcquisitionRuntimeError,
  type AcquisitionConnectorAdapter,
  type CcxtAcquisitionAdapter,
  type FinanceDataReaderAcquisitionAdapter,
} from "../../src/application/market-data-acquisition/marketDataAcquisitionTypes.js";

const ccxtRequest = {
  connectorId: "ccxt" as const,
  exchangeId: "binance" as const,
  marketType: "spot" as const,
  symbols: ["BTC/USDT"],
  timeframe: "1m" as const,
  startAt: "2026-07-18T00:00:00Z",
  endAt: "2026-07-18T00:05:00Z",
};

test("CCXT uses a validated proxy supplied by the Windows desktop shell", () => {
  assert.equal(
    resolveMarketDataHttpsProxy({
      env: { ZINUTO_MARKET_DATA_HTTPS_PROXY: "http://127.0.0.1:7897" },
    }),
    "http://127.0.0.1:7897/",
  );
  assert.equal(
    resolveMarketDataHttpsProxy({
      env: { ZINUTO_MARKET_DATA_HTTPS_PROXY: "ftp://proxy.example.test:21" },
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
    env: { ZINUTO_MARKET_DATA_HTTPS_PROXY: "https://proxy.example.test:8443" },
  });
  assert.equal(exchange.httpsProxy, "https://proxy.example.test:8443/");
});

const waitForStatus = async (
  service: ReturnType<typeof createMarketDataAcquisitionService>,
  jobId: string,
  status: "RUNNING" | "READY_TO_SAVE" | "FAILED" | "CANCELED",
) => {
  const timeoutAt = Date.now() + 5_000;
  let lastJob = service.getJob(jobId);
  while (Date.now() < timeoutAt) {
    const job = service.getJob(jobId);
    if (job.status === status) return job;
    if (job.status === "FAILED" && status !== "FAILED") {
      assert.fail(
        `job ${jobId} reached FAILED at ${job.progress.stage}: ${job.error?.code ?? "UNKNOWN"} ${JSON.stringify(job.error?.args ?? {})}`,
      );
    }
    lastJob = job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(
    `job ${jobId} did not reach ${status}; last status was ${lastJob.status}`,
  );
};

const waitForMarketStatus = async (
  service: ReturnType<typeof createMarketDataAcquisitionService>,
  jobId: string,
  status: "RUNNING" | "READY_TO_SAVE" | "FAILED" | "CANCELED",
) => {
  const timeoutAt = Date.now() + 5_000;
  let lastJob = service.getMarketJob(jobId);
  while (Date.now() < timeoutAt) {
    const job = service.getMarketJob(jobId);
    if (job.status === status) return job;
    if (job.status === "FAILED" && status !== "FAILED") {
      assert.fail(
        "market job " +
          jobId +
          " reached FAILED: " +
          (job.error?.code ?? "UNKNOWN") +
          " " +
          JSON.stringify(job.error?.args ?? {}),
      );
    }
    lastJob = job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(
    "market job " +
      jobId +
      " did not reach " +
      status +
      "; last status was " +
      lastJob.status,
  );
};

const dailyRows = (offset: string) => [
  {
    timestamp: "2026-01-02T16:00:00" + offset,
    open: 10,
    high: 12,
    low: 9,
    close: 11,
    volume: 100,
  },
  {
    timestamp: "2026-01-03T16:00:00" + offset,
    open: 11,
    high: 13,
    low: 10,
    close: 12,
    volume: 120,
  },
  {
    timestamp: "2026-01-04T16:00:00" + offset,
    open: 12,
    high: 14,
    low: 11,
    close: 13,
    volume: 130,
  },
];

test("acquisition request schema is closed and enforces connector-specific fields", () => {
  assert.equal(
    desktopMarketDataAcquisitionJobCreateRequestSchema.safeParse(ccxtRequest)
      .success,
    true,
  );
  assert.equal(
    desktopMarketDataAcquisitionJobCreateRequestSchema.safeParse({
      ...ccxtRequest,
      apiKey: "forbidden",
    }).success,
    false,
  );
  assert.equal(
    desktopMarketDataAcquisitionJobCreateRequestSchema.safeParse({
      ...ccxtRequest,
      exchangeId: "coinbase",
    }).success,
    false,
  );
  assert.equal(
    desktopMarketDataAcquisitionJobCreateRequestSchema.safeParse({
      connectorId: "akshare",
      dataset: "stock_zh_a_hist",
      symbols: ["000001"],
      timeframe: "5m",
      startAt: "2026-07-18T00:00:00+08:00",
      endAt: "2026-07-18T23:59:59+08:00",
      adjustment: "none",
    }).success,
    false,
  );
});

test("AKShare instrument catalog returns cached A shares and supported namespaced indexes", async (t) => {
  const catalogCacheDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinuto-akshare-catalog-cache-"),
  );
  t.after(() => fs.rm(catalogCacheDir, { recursive: true, force: true }));
  let catalogCalls = 0;
  const aShareInstruments = [
    {
      symbol: "600000",
      name: "浦发银行",
      exchangeId: "SH",
      kind: "A_SHARE",
    },
    {
      symbol: "000001",
      name: "平安银行",
      exchangeId: "SZ",
      kind: "A_SHARE",
    },
    {
      symbol: "920000",
      name: "安徽凤凰",
      exchangeId: "BJ",
      kind: "A_SHARE",
    },
  ] as const;
  const akshareAdapter: AkshareAcquisitionAdapter = {
    id: "akshare",
    isAvailable: () => true,
    fetchSymbol: async () => assert.fail("catalog lookup must not fetch bars"),
    listInstruments: async () => {
      catalogCalls += 1;
      return aShareInstruments.map((instrument) => ({ ...instrument }));
    },
  };
  const service = createMarketDataAcquisitionService({
    stagingRoot: path.join(os.tmpdir(), "unused-akshare-catalog-staging"),
    catalogCacheDir,
    createId: () => "catalog1",
    now: () => new Date("2026-07-20T00:00:00.000Z"),
    akshareAdapter,
  });

  const first = await service.listAkshareAcquisitionInstruments();
  first.instruments.pop();
  const second = await service.listAkshareAcquisitionInstruments();

  assert.equal(catalogCalls, 1);
  assert.equal(second.cachedAt, "2026-07-20T00:00:00.000Z");
  assert.deepEqual(
    second.instruments.filter((instrument) => instrument.kind === "A_SHARE"),
    aShareInstruments,
  );
  assert.deepEqual(
    second.instruments.find(
      (instrument) => instrument.symbol === "INDEX-000001",
    ),
    {
      symbol: "INDEX-000001",
      name: "上证指数",
      exchangeId: "SH",
      kind: "INDEX",
    },
  );
  assert.deepEqual(
    second.instruments.find(
      (instrument) => instrument.symbol === "INDEX-899050",
    ),
    {
      symbol: "INDEX-899050",
      name: "北证50",
      exchangeId: "BJ",
      kind: "INDEX",
    },
  );
  assert.equal(
    second.instruments.some((instrument) =>
      ["SH", "SZ", "BJ"].includes(instrument.symbol),
    ),
    false,
  );
  assert.deepEqual(service.listConnectors().connectors[0]?.datasets, [
    "stock_zh_a_hist",
    "stock_zh_a_hist_min_em",
    "index_zh_a_hist",
  ]);
});

test("single local acquisition job writes canonical CSV, source notice, and native manifest", async (t) => {
  const stagingRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinuto-acquisition-"),
  );
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  await fs.mkdir(path.join(stagingRoot, "stale-job"), { recursive: true });
  const ccxtAdapter: CcxtAcquisitionAdapter = {
    id: "ccxt",
    isAvailable: () => true,
    listMarkets: async () => ({
      markets: [],
      cachedAt: "2026-07-19T00:00:00.000Z",
    }),
    fetchSymbol: async () => [
      {
        timestamp: "2026-07-18T00:00:00.000Z",
        open: 100,
        high: 103,
        low: 99,
        close: 102,
        volume: 10,
      },
      {
        timestamp: "2026-07-18T00:01:00.000Z",
        open: 102,
        high: 104,
        low: 101,
        close: 103,
        volume: 8,
      },
      {
        timestamp: "2026-07-18T00:02:00.000Z",
        open: 103,
        high: 105,
        low: 102,
        close: 104,
        volume: 9,
      },
    ],
  };
  const unavailableAkshare: AcquisitionConnectorAdapter = {
    id: "akshare",
    isAvailable: () => false,
    fetchSymbol: async () => assert.fail("unavailable connector must not run"),
  };
  let productionValidationCalls = 0;
  const service = createMarketDataAcquisitionService({
    stagingRoot,
    createId: () => "job-00001",
    now: () => new Date("2026-07-19T08:09:10.000Z"),
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
    ["akshare"],
  );
  assert.deepEqual(
    catalog.connectors[1].terms.upstreams.map((upstream) => upstream.id),
    ["binance", "okx"],
  );

  const created = await service.createJob(ccxtRequest);
  assert.equal(created.status, "QUEUED");
  const ready = await waitForStatus(service, created.id, "READY_TO_SAVE");
  assert.equal(ready.progress.completedSymbols, 1);
  assert.equal(
    ready.staging?.outputFolderName,
    "Zinuto-Data-ccxt-20260719-080910-job00001",
  );
  assert.equal(
    await fs.stat(path.join(stagingRoot, "stale-job")).catch(() => null),
    null,
  );

  const jobRoot = path.join(stagingRoot, created.id);
  const csv = await fs.readFile(
    path.join(jobRoot, "payload", "BTC-USDT.csv"),
    "utf8",
  );
  assert.match(csv, /^datetime,open,high,low,close,volume\n/u);
  assert.match(csv, /2026-07-18T00:01:00\.000Z,102,104,101,103,8/u);
  const source = await fs.readFile(
    path.join(jobRoot, "payload", "SOURCE.md"),
    "utf8",
  );
  assert.match(source, /Zinuto does not distribute or host the market data/u);
  assert.match(source, /https:\/\/www\.binance\.com\/en\/terms/u);
  assert.match(source, /`BTC-USDT\.csv` → `BTC-USDT` \(source: `BTC\/USDT`\)/u);
  const manifestBytes = await fs.readFile(path.join(jobRoot, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
    schemaVersion: number;
    fileCount: number;
    files: Array<{ relativePath: string; sha256: string }>;
  };
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.fileCount, 2);
  assert.deepEqual(
    manifest.files.map((file) => file.relativePath),
    ["BTC-USDT.csv", "SOURCE.md"],
  );
  assert.equal(
    ready.staging?.manifestSha256,
    createHash("sha256").update(manifestBytes).digest("hex"),
  );
  assert.equal(productionValidationCalls, 1);
  await service.discardJob(created.id);
  assert.equal(await fs.stat(jobRoot).catch(() => null), null);
});

test("one-bar acquisition remains importable through its versioned timeframe provenance", async (t) => {
  const stagingRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinuto-acquisition-short-"),
  );
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  const service = createMarketDataAcquisitionService({
    stagingRoot,
    createId: () => "jobshort1",
    now: () => new Date("2026-07-19T08:09:10.000Z"),
    ccxtAdapter: {
      id: "ccxt",
      isAvailable: () => true,
      listMarkets: async () => ({
        markets: [],
        cachedAt: "2026-07-19T00:00:00.000Z",
      }),
      fetchSymbol: async () => [
        {
          timestamp: "2026-07-18T00:00:00.000Z",
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
  const ready = await waitForStatus(service, created.id, "READY_TO_SAVE");

  assert.equal(ready.progress.completedSymbols, 1);
  assert.equal(ready.staging?.fileCount, 2);
  await service.discardJob(created.id);
});

test("AKShare output passes the production import preview with Shanghai time and source metadata", async (t) => {
  const stagingRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinuto-acquisition-ak-"),
  );
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  const service = createMarketDataAcquisitionService({
    stagingRoot,
    createId: () => "jobak001",
    now: () => new Date("2026-07-19T08:09:10.000Z"),
    akshareAdapter: {
      id: "akshare",
      isAvailable: () => true,
      fetchSymbol: async () => [
        {
          timestamp: "2026-07-16T15:00:00+08:00",
          open: 10,
          high: 11,
          low: 9,
          close: 10.5,
          volume: 100,
        },
        {
          timestamp: "2026-07-17T15:00:00+08:00",
          open: 10.5,
          high: 12,
          low: 10,
          close: 11.5,
          volume: 120,
        },
        {
          timestamp: "2026-07-18T15:00:00+08:00",
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
    connectorId: "akshare",
    dataset: "stock_zh_a_hist",
    symbols: ["000001"],
    timeframe: "1d",
    startAt: "2026-07-16T00:00:00+08:00",
    endAt: "2026-07-18T23:59:59+08:00",
    adjustment: "qfq",
  });
  const ready = await waitForStatus(service, created.id, "READY_TO_SAVE");
  assert.equal(ready.staging?.fileCount, 2);
  const source = await fs.readFile(
    path.join(stagingRoot, created.id, "payload", "SOURCE.md"),
    "utf8",
  );
  assert.match(source, /AKShare 1\.18\.91.*github\.com\/akfamily\/akshare/u);
  assert.match(source, /akshare\.akfamily\.xyz\/introduction\.html/u);
  assert.match(source, /Adjustment: qfq/u);
  assert.match(source, /Asia\/Shanghai \(\+08:00\)/u);
  assert.match(source, /zinuto-market-data-acquisition:.*"adjustment":"qfq"/u);
});

test("AKShare index output keeps the INDEX prefix through CSV naming and import validation", async (t) => {
  const stagingRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinuto-acquisition-index-"),
  );
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  const service = createMarketDataAcquisitionService({
    stagingRoot,
    createId: () => "index001",
    now: () => new Date("2026-07-20T08:09:10.000Z"),
    akshareAdapter: {
      id: "akshare",
      isAvailable: () => true,
      listInstruments: async () => [],
      fetchSymbol: async ({ request, symbol }) => {
        assert.equal(request.connectorId, "akshare");
        assert.equal(request.dataset, "index_zh_a_hist");
        assert.equal(request.adjustment, "none");
        assert.equal(symbol, "INDEX-000001");
        return [
          {
            timestamp: "2026-07-16T15:00:00+08:00",
            open: 3_500,
            high: 3_520,
            low: 3_480,
            close: 3_510,
            volume: 1_000,
          },
          {
            timestamp: "2026-07-17T15:00:00+08:00",
            open: 3_510,
            high: 3_530,
            low: 3_500,
            close: 3_520,
            volume: 1_100,
          },
          {
            timestamp: "2026-07-18T15:00:00+08:00",
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
    connectorId: "akshare",
    dataset: "index_zh_a_hist",
    symbols: ["INDEX-000001"],
    timeframe: "1d",
    startAt: "2026-07-16T00:00:00+08:00",
    endAt: "2026-07-18T23:59:59+08:00",
    adjustment: "none",
  });
  const ready = await waitForStatus(service, created.id, "READY_TO_SAVE");

  assert.equal(ready.staging?.fileCount, 2);
  const payloadRoot = path.join(stagingRoot, created.id, "payload");
  assert.equal(
    (await fs.stat(path.join(payloadRoot, "INDEX-000001.csv"))).isFile(),
    true,
  );
  const source = await fs.readFile(path.join(payloadRoot, "SOURCE.md"), "utf8");
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

test("one active job is enforced and cancellation drains the adapter", async (t) => {
  const stagingRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinuto-acquisition-cancel-"),
  );
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  let finishCalls = 0;
  const ccxtAdapter: CcxtAcquisitionAdapter = {
    id: "ccxt",
    isAvailable: () => true,
    listMarkets: async () => ({
      markets: [],
      cachedAt: "2026-07-19T00:00:00.000Z",
    }),
    fetchSymbol: async ({ signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new AcquisitionRuntimeError("ACQUISITION_CANCELED")),
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
    now: () => new Date("2026-07-19T00:00:00.000Z"),
    ccxtAdapter,
  });
  const created = await service.createJob(ccxtRequest);
  await waitForStatus(service, created.id, "RUNNING");
  await assert.rejects(
    () => service.createJob(ccxtRequest),
    (error: unknown) =>
      error instanceof AcquisitionRuntimeError &&
      error.code === "ACQUISITION_JOB_ACTIVE",
  );
  assert.equal(service.cancelJob(created.id).status, "CANCELED");
  await service.stop();
  assert.equal(service.getJob(created.id).status, "CANCELED");
  assert.equal(finishCalls, 1);
});

test("concurrent job creation reserves the single active slot before pruning", async (t) => {
  const stagingRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinuto-acquisition-race-"),
  );
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  let id = 0;
  const service = createMarketDataAcquisitionService({
    stagingRoot,
    createId: () => `job0000${++id}`,
    now: () => new Date("2026-07-19T00:00:00.000Z"),
    ccxtAdapter: {
      id: "ccxt",
      isAvailable: () => true,
      listMarkets: async () => ({
        markets: [],
        cachedAt: "2026-07-19T00:00:00.000Z",
      }),
      fetchSymbol: async ({ signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new AcquisitionRuntimeError("ACQUISITION_CANCELED")),
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
    (
      result,
    ): result is PromiseFulfilledResult<
      Awaited<ReturnType<typeof service.createJob>>
    > => result.status === "fulfilled",
  );
  const rejected = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(
    rejected[0]?.reason instanceof AcquisitionRuntimeError &&
      rejected[0].reason.code === "ACQUISITION_JOB_ACTIVE",
    true,
  );
  service.cancelJob(fulfilled[0].value.id);
  await service.stop();
});

test("runtime start removes interrupted private staging before any job is created", async (t) => {
  const stagingRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinuto-acquisition-start-"),
  );
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  const staleFile = path.join(
    stagingRoot,
    "interrupted-job",
    "payload",
    "stale.csv",
  );
  await fs.mkdir(path.dirname(staleFile), { recursive: true });
  await fs.writeFile(staleFile, "stale", "utf8");
  const service = createMarketDataAcquisitionService({
    stagingRoot,
    createId: () => "job00001",
    now: () => new Date("2026-07-19T00:00:00.000Z"),
  });

  await service.start();

  assert.equal(await fs.stat(staleFile).catch(() => null), null);
  assert.equal((await fs.stat(stagingRoot)).isDirectory(), true);
});

test("job retention prunes discarded READY staging before accepting job 21", async (t) => {
  const stagingRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinuto-acquisition-prune-"),
  );
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  let id = 0;
  const service = createMarketDataAcquisitionService({
    stagingRoot,
    createId: () => `job${String((id += 1)).padStart(5, "0")}`,
    now: () => new Date("2026-07-19T00:00:00.000Z"),
    validateStaging: async () => undefined,
    ccxtAdapter: {
      id: "ccxt",
      isAvailable: () => true,
      listMarkets: async () => ({
        markets: [],
        cachedAt: "2026-07-19T00:00:00.000Z",
      }),
      fetchSymbol: async () => [
        {
          timestamp: "2026-07-18T00:00:00.000Z",
          open: 1,
          high: 2,
          low: 1,
          close: 1.5,
          volume: 1,
        },
        {
          timestamp: "2026-07-18T00:01:00.000Z",
          open: 1.5,
          high: 2,
          low: 1,
          close: 1.8,
          volume: 1,
        },
        {
          timestamp: "2026-07-18T00:02:00.000Z",
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
    await waitForStatus(service, created.id, "READY_TO_SAVE");
  }
  assert.equal(
    await fs.stat(path.join(stagingRoot, jobIds[0]!)).catch(() => null),
    null,
  );
  assert.equal(
    (await fs.stat(path.join(stagingRoot, jobIds[1]!))).isDirectory(),
    true,
  );
  assert.throws(() => service.getJob(jobIds[0]!), /ACQUISITION_JOB_NOT_FOUND/u);
});

test("CCXT adapter caches bounded active spot markets and drops unfinished candles", async () => {
  let loadCalls = 0;
  let closeCalls = 0;
  let fetchCalls = 0;
  const exchangeFactory = async () => ({
    has: { fetchOHLCV: true },
    timeframes: { "1m": "1m" },
    loadMarkets: async () => {
      loadCalls += 1;
      return {
        active: {
          symbol: "BTC/USDT",
          base: "BTC",
          quote: "USDT",
          spot: true,
          active: true,
        },
        inactive: {
          symbol: "OLD/USDT",
          base: "OLD",
          quote: "USDT",
          spot: true,
          active: false,
        },
        future: {
          symbol: "BTC/USDT:USDT",
          base: "BTC",
          quote: "USDT",
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
            [Date.parse("2026-07-19T00:00:00Z"), 1, 2, 0.5, 1.5, 10],
            [Date.parse("2026-07-19T00:10:00Z"), 1.5, 2, 1, 1.8, 12],
          ]
        : [];
    },
    close: async () => {
      closeCalls += 1;
    },
  });
  const adapter = createCcxtAcquisitionAdapter({
    exchangeFactory,
    now: () => Date.parse("2026-07-19T00:10:30Z"),
  });
  const firstCatalog = await adapter.listMarkets("binance", "btc");
  const secondCatalog = await adapter.listMarkets("binance", "usdt");
  assert.deepEqual(
    firstCatalog.markets.map((market) => market.symbol),
    ["BTC/USDT"],
  );
  assert.equal(secondCatalog.markets.length, 1);
  assert.equal(loadCalls, 1);
  assert.equal(closeCalls, 1);

  const rows = await adapter.fetchSymbol({
    jobId: "job00001",
    request: {
      ...ccxtRequest,
      startAt: "2026-07-19T00:00:00Z",
      endAt: "2026-07-19T00:20:00Z",
    },
    symbol: "BTC/USDT",
    signal: new AbortController().signal,
  });
  assert.deepEqual(
    rows.map((row) => row.timestamp),
    ["2026-07-19T00:00:00.000Z"],
  );
  await adapter.finishJob?.("job00001");
  assert.equal(loadCalls, 2);
  assert.equal(closeCalls, 2);
});

test("CCXT pagination keeps a monotonic cursor and retries bounded 429/5xx failures", async () => {
  const startAtMs = Date.parse("2026-07-19T00:00:00Z");
  const cursors: number[] = [];
  const waits: number[] = [];
  const retryEvents: Array<{ attempt: number; retryAfterMs: number }> = [];
  let fetchCall = 0;
  const rateLimitError = new Error("429");
  rateLimitError.name = "RateLimitExceeded";
  const unavailableError = new Error("HTTP 503");
  unavailableError.name = "ExchangeNotAvailable";
  const adapter = createCcxtAcquisitionAdapter({
    retryDelaysMs: [10, 20],
    wait: async (delayMs) => {
      waits.push(delayMs);
    },
    now: () => Date.parse("2026-07-20T00:00:00Z"),
    exchangeFactory: async () => ({
      has: { fetchOHLCV: true },
      timeframes: { "1m": "1m" },
      loadMarkets: async () => ({
        btc: {
          symbol: "BTC/USDT",
          base: "BTC",
          quote: "USDT",
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
    jobId: "job00002",
    request: {
      ...ccxtRequest,
      startAt: "2026-07-19T00:00:00Z",
      endAt: "2026-07-19T00:02:00Z",
    },
    symbol: "BTC/USDT",
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

test("normalization accepts a valid short result when cadence cannot be inferred", () => {
  const oneBar = {
    timestamp: "2026-07-18T00:00:00.000Z",
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
      timestamp: "2026-07-18T00:01:00.000Z",
      open: 1.5,
      close: 1.8,
    },
  ];

  assert.deepEqual(
    normalizeAndValidateAcquisitionBars({
      request: ccxtRequest,
      rows: [oneBar],
    }),
    { rows: [oneBar], mergedDuplicates: 0 },
  );
  assert.deepEqual(
    normalizeAndValidateAcquisitionBars({
      request: ccxtRequest,
      rows: twoBars,
    }),
    { rows: twoBars, mergedDuplicates: 0 },
  );
});

test("normalization rejects empty data, schema drift, and conflicting duplicates", () => {
  assert.throws(
    () =>
      normalizeAndValidateAcquisitionBars({ request: ccxtRequest, rows: [] }),
    /ACQUISITION_NO_DATA/u,
  );
  const spacedBars = [
    {
      timestamp: "2026-07-18T00:00:00.000Z",
      open: 1,
      high: 2,
      low: 1,
      close: 1.5,
      volume: 1,
    },
    {
      timestamp: "2026-07-18T00:05:00.000Z",
      open: 1.5,
      high: 2,
      low: 1,
      close: 1.8,
      volume: 1,
    },
    {
      timestamp: "2026-07-18T00:10:00.000Z",
      open: 1.8,
      high: 2.1,
      low: 1.7,
      close: 2,
      volume: 1,
    },
  ];
  // Samples below the detection threshold are staged under the requested
  // timeframe instead of failing on an unreliable cadence inference.
  assert.deepEqual(
    normalizeAndValidateAcquisitionBars({
      request: { ...ccxtRequest, endAt: "2026-07-18T00:10:00Z" },
      rows: spacedBars,
    }),
    { rows: spacedBars, mergedDuplicates: 0 },
  );
  const fiveMinuteBars = Array.from({ length: 96 }, (_, index) => ({
    timestamp: new Date(
      Date.parse("2026-07-18T00:00:00.000Z") + index * 300_000,
    ).toISOString(),
    open: 1,
    high: 2,
    low: 1,
    close: 1.5,
    volume: 1,
  }));
  assert.throws(
    () =>
      normalizeAndValidateAcquisitionBars({
        request: { ...ccxtRequest, endAt: "2026-07-18T08:00:00Z" },
        rows: fiveMinuteBars,
      }),
    /ACQUISITION_TIMEFRAME_INVALID/u,
  );
  assert.throws(
    () =>
      normalizeAndValidateAcquisitionBars({
        request: ccxtRequest,
        rows: [
          {
            timestamp: "2026-07-18T00:00:00.000Z",
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
            timestamp: "2026-07-18T00:00:00.000Z",
            open: 1,
            high: 2,
            low: 1,
            close: 1.5,
            volume: 1,
          },
          {
            timestamp: "2026-07-18T00:00:00.000Z",
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

test("AKShare sidecar protocol is fixed, versioned, and validates runtime versions", () => {
  const input = {
    jobId: "job00001",
    request: {
      connectorId: "akshare" as const,
      dataset: "stock_zh_a_hist" as const,
      symbols: ["000001"],
      timeframe: "1d" as const,
      startAt: "2026-07-18T00:00:00+08:00",
      endAt: "2026-07-18T23:59:59+08:00",
      adjustment: "none" as const,
    },
    symbol: "000001",
    signal: new AbortController().signal,
  };
  const request = buildAkshareSidecarRequest(input);
  assert.equal(request.protocol, AKSHARE_SIDECAR_PROTOCOL);
  assert.equal(request.operation, "stock_zh_a_hist");
  assert.deepEqual(Object.keys(request.params).sort(), [
    "adjustment",
    "endAt",
    "startAt",
    "symbol",
    "timeframe",
  ]);
  const rows = parseAkshareSidecarResponse(
    JSON.stringify({
      protocol: AKSHARE_SIDECAR_PROTOCOL,
      requestId: request.requestId,
      ok: true,
      runtime: { akshare: "1.18.91" },
      kind: "bars",
      rows: [
        {
          timestamp: "2026-07-18T15:00:00+08:00",
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
          runtime: { akshare: "1.18.90" },
          kind: "bars",
          rows: [],
        }),
        request.requestId,
      ),
    /AKSHARE_SIDECAR_RESPONSE_INVALID/u,
  );
});

test("production sidecar resolution rejects inherited development paths", async (t) => {
  const fixtureRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinuto-sidecar-trust-"),
  );
  t.after(() => fs.rm(fixtureRoot, { recursive: true, force: true }));
  const executablePath = path.join(fixtureRoot, "signed-sidecar");
  await fs.writeFile(executablePath, "fixture", { mode: 0o700 });
  await fs.chmod(executablePath, 0o700);

  assert.equal(
    resolveAkshareSidecarLaunchSpec({
      NODE_ENV: "production",
      ZINUTO_AKSHARE_SIDECAR_PATH: executablePath,
    }),
    null,
  );
  assert.equal(
    resolveAkshareSidecarLaunchSpec({
      NODE_ENV: "production",
      ZINUTO_AKSHARE_TRUSTED_SIDECAR_PATH: executablePath,
    })?.source,
    "TRUSTED_NATIVE",
  );
  assert.equal(
    resolveAkshareSidecarLaunchSpec({
      NODE_ENV: "test",
      ZINUTO_AKSHARE_SIDECAR_PATH: executablePath,
    })?.source,
    "EXPLICIT",
  );
});

test("AKShare retries only retryable upstream responses and reports wait progress", async () => {
  let executeCalls = 0;
  const waits: number[] = [];
  const retryEvents: Array<{ attempt: number; retryAfterMs: number }> = [];
  const resumeEvents: number[] = [];
  const adapter = createAkshareSidecarAdapter({
    resolveLaunchSpec: () => ({
      command: "/signed/sidecar",
      args: [],
      source: "EXPLICIT",
    }),
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
            code: "AKSHARE_UPSTREAM_RETRYABLE",
            args: { statusCode: executeCalls === 1 ? 429 : 503 },
          },
        });
      }
      return JSON.stringify({
        protocol: AKSHARE_SIDECAR_PROTOCOL,
        requestId: request.requestId,
        ok: true,
        runtime: { akshare: "1.18.91" },
        kind: "bars",
        rows: [
          {
            timestamp: "2026-07-18T15:00:00+08:00",
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
    jobId: "job00003",
    request: {
      connectorId: "akshare",
      dataset: "stock_zh_a_hist",
      symbols: ["000001"],
      timeframe: "1d",
      startAt: "2026-07-18T00:00:00+08:00",
      endAt: "2026-07-18T23:59:59+08:00",
      adjustment: "qfq",
    },
    symbol: "000001",
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

test("AKShare worker and build entry contain no generic HTTP or dynamic dispatch surface", async () => {
  const worker = await fs.readFile(
    path.resolve(process.cwd(), "sidecars/akshare/main.py"),
    "utf8",
  );
  const buildScript = await fs.readFile(
    path.resolve(process.cwd(), "scripts/build-akshare-sidecar.mjs"),
    "utf8",
  );
  const runtime = await fs.readFile(
    path.resolve(process.cwd(), "src/runtime/index.ts"),
    "utf8",
  );
  assert.doesNotMatch(worker, /\beval\s*\(/u);
  assert.doesNotMatch(worker, /FastAPI|uvicorn|CORSMiddleware|listen\s*\(/u);
  assert.doesNotMatch(worker, /aktools/u);
  assert.match(worker, /from multiprocessing import freeze_support/u);
  assert.match(
    worker,
    /freeze_support\(\)[\s\S]*raise SystemExit\(main\(\)\)/u,
  );
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

test("the generic acquisition catalog exposes every reviewed FDR price market and no direct FDR crypto plan", async (t) => {
  const catalogCacheDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinuto-fdr-catalog-cache-"),
  );
  t.after(() => fs.rm(catalogCacheDir, { recursive: true, force: true }));
  const instrumentRequests: unknown[] = [];
  const financeDataReaderAdapter: FinanceDataReaderAcquisitionAdapter = {
    id: "financedatareader",
    isAvailable: () => true,
    listInstruments: async (input) => {
      instrumentRequests.push(input);
      return [
        { symbol: "ZZZ", name: "AAPL lookup by name", exchangeId: "NASDAQ" },
        { symbol: "AAPL-P", name: "Preferred US share", exchangeId: "NASDAQ" },
        { symbol: "XAAPL", name: "Cross-listed security", exchangeId: "NASDAQ" },
        { symbol: "AAPL", name: "Apple Inc.", exchangeId: "NASDAQ" },
      ];
    },
    fetchSymbol: async () =>
      assert.fail("catalog lookup must not fetch FDR bars"),
  };
  const service = createMarketDataAcquisitionService({
    stagingRoot: path.join(os.tmpdir(), "zinuto-market-catalog"),
    catalogCacheDir,
    createId: () => "mkt00001",
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    financeDataReaderAdapter,
  });
  const catalog = service.listAcquisitionCatalog();
  assert.deepEqual(
    catalog.assetClasses.map((entry) => entry.id),
    ["STOCKS_AND_INDICES", "FOREX", "COMMODITIES_AND_RATES", "CRYPTO"],
  );
  assert.deepEqual(
    new Set(catalog.markets.map((entry) => entry.id)),
    new Set([
      "CN_A_SHARE",
      "HK_STOCKS",
      "KR_STOCKS",
      "US_STOCKS",
      "JP_STOCKS",
      "VN_STOCKS",
      "GLOBAL_INDICES",
      "FOREX",
      "COMMODITY_FUTURES",
      "RATE_FUTURES",
      "CRYPTO_SPOT",
    ]),
  );
  assert.deepEqual(
    catalog.markets
      .find((entry) => entry.id === "CRYPTO_SPOT")
      ?.sourcePlans.map((entry) => entry.providerChain),
    [
      ["ccxt", "financedatareader"],
      ["ccxt", "financedatareader"],
    ],
  );
  assert.equal(
    catalog.markets.some((entry) =>
      entry.sourcePlans.some((plan) => plan.id === "FDR_CRYPTO"),
    ),
    false,
  );
  const instruments = await service.listAcquisitionMarketInstruments({
    marketId: "US_STOCKS",
    sourcePlanId: "FDR_US_STOCKS",
    query: "apple",
    cursor: "",
  });
  assert.deepEqual(instrumentRequests, [{ marketId: "US_STOCKS", query: "" }]);
  assert.deepEqual(instruments.instruments, [
    {
      symbol: "AAPL",
      name: "Apple Inc.",
      marketId: "US_STOCKS",
      sourceSymbol: "AAPL",
      exchangeId: "NASDAQ",
      sourcePlanIds: ["FDR_US_STOCKS"],
    },
  ]);
  const cachedSearch = await service.listAcquisitionMarketInstruments({
    marketId: "US_STOCKS",
    sourcePlanId: "FDR_US_STOCKS",
    query: "aapl",
    cursor: "",
  });
  assert.equal(cachedSearch.instruments[0]?.symbol, "AAPL");
  assert.deepEqual(
    cachedSearch.instruments.map((entry) => entry.symbol),
    ["AAPL", "AAPL-P", "ZZZ", "XAAPL"],
  );
  assert.equal(instrumentRequests.length, 1);

  const restartedService = createMarketDataAcquisitionService({
    stagingRoot: path.join(os.tmpdir(), "zinuto-market-catalog-restarted"),
    catalogCacheDir,
    createId: () => "mkt00002",
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    financeDataReaderAdapter,
  });
  const restarted = await restartedService.listAcquisitionMarketInstruments({
    marketId: "US_STOCKS",
    sourcePlanId: "FDR_US_STOCKS",
    query: "",
    cursor: "",
  });
  assert.equal(restarted.cacheState, "FRESH");
  assert.equal(instrumentRequests.length, 1);

  await restartedService.listAcquisitionMarketInstruments({
    marketId: "US_STOCKS",
    sourcePlanId: "FDR_US_STOCKS",
    query: "",
    cursor: "",
    refresh: true,
  });
  assert.equal(instrumentRequests.length, 2);

  const bundled = await restartedService.listAcquisitionMarketInstruments({
    marketId: "GLOBAL_INDICES",
    sourcePlanId: "FDR_GLOBAL_INDICES",
    query: "",
    cursor: "",
  });
  assert.equal(bundled.cacheState, "BUNDLED");
  assert.equal(bundled.cachedAt, null);
  assert.equal(instrumentRequests.length, 2);
});

test("market directories rank code matches and paginate normalized catalog rows", async (t) => {
  const cacheDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinuto-paginated-market-catalog-"),
  );
  t.after(() => fs.rm(cacheDir, { recursive: true, force: true }));
  const instruments = Array.from({ length: 101 }, (_value, index) => ({
    symbol: String(index).padStart(4, "0"),
    name: `TSE ${String(index).padStart(4, "0")}`,
    exchangeId: "TSE",
  }));
  const service = createMarketDataAcquisitionService({
    stagingRoot: path.join(os.tmpdir(), "zinuto-paginated-market-staging"),
    catalogCacheDir: cacheDir,
    createId: () => "mkt-page-1",
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    financeDataReaderAdapter: {
      id: "financedatareader",
      isAvailable: () => true,
      listInstruments: async () => instruments,
      fetchSymbol: async () => assert.fail("catalog lookup must not fetch bars"),
    },
  });

  const firstPage = await service.listAcquisitionMarketInstruments({
    marketId: "JP_STOCKS",
    sourcePlanId: "FDR_TSE",
    query: "",
    cursor: "0",
  });
  assert.equal(firstPage.instruments.length, 100);
  assert.equal(firstPage.nextCursor, "100");
  const lastPage = await service.listAcquisitionMarketInstruments({
    marketId: "JP_STOCKS",
    sourcePlanId: "FDR_TSE",
    query: "",
    cursor: firstPage.nextCursor ?? "",
  });
  assert.deepEqual(lastPage.instruments.map((entry) => entry.symbol), ["0100"]);
  const exactCode = await service.listAcquisitionMarketInstruments({
    marketId: "JP_STOCKS",
    sourcePlanId: "FDR_TSE",
    query: "0010",
    cursor: "0",
  });
  assert.equal(exactCode.instruments[0]?.symbol, "0010");
});

test("Japanese stock jobs accept a direct TSE code and retain FDR provenance", async (t) => {
  const stagingRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinuto-market-jp-"),
  );
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  const fetchRequests: Array<{
    marketId: string;
    symbol: string;
    sourceSymbol: string;
  }> = [];
  const service = createMarketDataAcquisitionService({
    stagingRoot,
    createId: () => "mktjp001",
    now: () => new Date("2026-08-15T00:00:00.000Z"),
    financeDataReaderAdapter: {
      id: "financedatareader",
      isAvailable: () => true,
      listInstruments: async () => [],
      fetchSymbol: async (input) => {
        fetchRequests.push({
          marketId: input.marketId,
          symbol: input.symbol,
          sourceSymbol: input.sourceSymbol,
        });
        return { rows: dailyRows("+09:00"), upstreamId: "yahoo-finance" };
      },
    },
  });

  const created = await service.createMarketJob({
    marketId: "JP_STOCKS",
    sourcePlanId: "FDR_TSE",
    symbols: ["7203"],
    timeframe: "1d",
    startAt: "2026-01-01T00:00:00+09:00",
    endAt: "2026-01-04T23:59:59+09:00",
    adjustment: null,
  });
  const ready = await waitForMarketStatus(service, created.id, "READY_TO_SAVE");

  assert.deepEqual(fetchRequests, [
    {
      marketId: "JP_STOCKS",
      symbol: "7203",
      sourceSymbol: "7203",
    },
  ]);
  assert.equal(
    ready.sourceResults[0]?.finalSource?.providerId,
    "financedatareader",
  );
  assert.equal(
    ready.sourceResults[0]?.finalSource?.upstreamId,
    "yahoo-finance",
  );
  await service.discardMarketJob(created.id);
});

test("new market jobs retain whole-instrument provenance across the A-share and FDR fallback chain", async (t) => {
  const stagingRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinuto-market-mixed-"),
  );
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  const fdrSymbols: string[] = [];
  const service = createMarketDataAcquisitionService({
    stagingRoot,
    createId: () => "mkt00001",
    now: () => new Date("2026-01-05T00:00:00.000Z"),
    akshareAdapter: {
      id: "akshare",
      isAvailable: () => true,
      fetchSymbol: async ({ symbol }) => {
        if (symbol === "600000") {
          throw new AcquisitionRuntimeError("AKSHARE_UPSTREAM_FAILED");
        }
        return dailyRows("+08:00");
      },
    },
    financeDataReaderAdapter: {
      id: "financedatareader",
      isAvailable: () => true,
      listInstruments: async () => [],
      fetchSymbol: async ({ symbol }) => {
        fdrSymbols.push(symbol);
        return { rows: dailyRows("+08:00"), upstreamId: "yahoo-finance" };
      },
    },
  });

  const created = await service.createMarketJob({
    marketId: "CN_A_SHARE",
    sourcePlanId: "CN_A_SHARE_SMART",
    symbols: ["000001", "600000"],
    timeframe: "1d",
    startAt: "2026-01-01T00:00:00+08:00",
    endAt: "2026-01-05T23:59:59+08:00",
    adjustment: "none",
  });
  const ready = await waitForMarketStatus(service, created.id, "READY_TO_SAVE");
  assert.deepEqual(fdrSymbols, ["600000"]);
  assert.deepEqual(
    ready.sourceResults.map((entry) => entry.finalSource?.providerId),
    ["akshare", "financedatareader"],
  );
  assert.deepEqual(
    ready.sourceResults[1]?.attempts.map((entry) => [
      entry.providerId,
      entry.status,
    ]),
    [
      ["akshare", "FAILED"],
      ["financedatareader", "SUCCEEDED"],
    ],
  );
  const source = await fs.readFile(
    path.join(stagingRoot, created.id, "payload", "SOURCE.md"),
    "utf8",
  );
  assert.match(source, /Per-instrument provenance/u);
  assert.match(source, /akshare@[A-Za-z0-9.+-]+ FAILED/u);
  assert.match(source, /financedatareader@0\.9\.202 SUCCEEDED/u);
  assert.match(source, /"schemaVersion":3,"connectorId":"mixed"/u);
});

test("the generic mainland market retains curated indexes without sending them to FDR", async (t) => {
  const stagingRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinuto-market-index-"),
  );
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  const requests: unknown[] = [];
  let fdrCalls = 0;
  const service = createMarketDataAcquisitionService({
    stagingRoot,
    createId: () => "mktindex1",
    now: () => new Date("2026-01-05T00:00:00.000Z"),
    akshareAdapter: {
      id: "akshare",
      isAvailable: () => true,
      listInstruments: async () => [
        {
          symbol: "600000",
          name: "浦发银行",
          exchangeId: "SH",
          kind: "A_SHARE",
        },
      ],
      fetchSymbol: async () =>
        assert.fail("provenance fetch path should be used"),
      fetchSymbolWithProvenance: async ({ request }) => {
        requests.push(request);
        return { rows: dailyRows("+08:00"), upstreamId: "tencent" };
      },
    },
    financeDataReaderAdapter: {
      id: "financedatareader",
      isAvailable: () => true,
      listInstruments: async () => [],
      fetchSymbol: async () => {
        fdrCalls += 1;
        return { rows: dailyRows("+08:00"), upstreamId: "yahoo-finance" };
      },
    },
  });

  const instruments = await service.listAcquisitionMarketInstruments({
    marketId: "CN_A_SHARE",
    sourcePlanId: "CN_A_SHARE_SMART",
    query: "沪深",
    cursor: "",
  });
  assert.deepEqual(
    instruments.instruments.map((instrument) => instrument.symbol),
    ["INDEX-000300"],
  );

  const created = await service.createMarketJob({
    marketId: "CN_A_SHARE",
    sourcePlanId: "CN_A_SHARE_SMART",
    symbols: ["INDEX-000300"],
    timeframe: "1d",
    startAt: "2026-01-01T00:00:00+08:00",
    endAt: "2026-01-05T23:59:59+08:00",
    adjustment: "none",
  });
  const ready = await waitForMarketStatus(service, created.id, "READY_TO_SAVE");
  assert.equal(ready.sourceResults[0]?.finalSource?.providerId, "akshare");
  assert.equal(ready.sourceResults[0]?.finalSource?.upstreamId, "tencent");
  assert.equal(fdrCalls, 0);
  assert.deepEqual(requests, [
    {
      connectorId: "akshare",
      dataset: "index_zh_a_hist",
      symbols: ["INDEX-000300"],
      timeframe: "1d",
      startAt: "2026-01-01T00:00:00+08:00",
      endAt: "2026-01-05T23:59:59+08:00",
      adjustment: "none",
    },
  ]);

  await assert.rejects(
    service.createMarketJob({
      marketId: "CN_A_SHARE",
      sourcePlanId: "CN_A_SHARE_SMART",
      symbols: ["INDEX-000300"],
      timeframe: "1h",
      startAt: "2026-01-01T00:00:00+08:00",
      endAt: "2026-01-01T23:59:59+08:00",
      adjustment: "none",
    }),
    /ACQUISITION_TIMEFRAME_UNSUPPORTED/u,
  );
});

test("a rejected primary result is recorded as failed before a whole-symbol FDR retry", async (t) => {
  const stagingRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinuto-market-validation-fallback-"),
  );
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  const service = createMarketDataAcquisitionService({
    stagingRoot,
    createId: () => "mktvalid1",
    now: () => new Date("2026-01-05T00:00:00.000Z"),
    akshareAdapter: {
      id: "akshare",
      isAvailable: () => true,
      fetchSymbol: async () => [],
    },
    financeDataReaderAdapter: {
      id: "financedatareader",
      isAvailable: () => true,
      listInstruments: async () => [],
      fetchSymbol: async () => ({
        rows: dailyRows("+08:00"),
        upstreamId: "yahoo-finance",
      }),
    },
  });

  const created = await service.createMarketJob({
    marketId: "CN_A_SHARE",
    sourcePlanId: "CN_A_SHARE_SMART",
    symbols: ["000001"],
    timeframe: "1d",
    startAt: "2026-01-01T00:00:00+08:00",
    endAt: "2026-01-05T23:59:59+08:00",
    adjustment: "none",
  });
  const ready = await waitForMarketStatus(service, created.id, "READY_TO_SAVE");
  assert.deepEqual(
    ready.sourceResults[0]?.attempts.map((entry) => [
      entry.providerId,
      entry.status,
    ]),
    [
      ["akshare", "FAILED"],
      ["financedatareader", "SUCCEEDED"],
    ],
  );
  assert.equal(
    ready.sourceResults[0]?.finalSource?.providerId,
    "financedatareader",
  );
});

test("A-share adjusted or intraday failures and crypto intraday failures never invoke FDR, while eligible daily crypto retries whole symbols", async (t) => {
  const stagingRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinuto-market-fallback-policy-"),
  );
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  const fdrSymbols: string[] = [];
  let nextId = 0;
  const service = createMarketDataAcquisitionService({
    stagingRoot,
    createId: () => "mkt0000" + String(++nextId),
    now: () => new Date("2026-01-05T00:00:00.000Z"),
    akshareAdapter: {
      id: "akshare",
      isAvailable: () => true,
      fetchSymbol: async () => {
        throw new AcquisitionRuntimeError("AKSHARE_UPSTREAM_FAILED");
      },
    },
    ccxtAdapter: {
      id: "ccxt",
      isAvailable: () => true,
      listMarkets: async () => ({
        markets: [],
        cachedAt: "2026-01-01T00:00:00.000Z",
      }),
      fetchSymbol: async () => {
        throw new AcquisitionRuntimeError("CCXT_UPSTREAM_FAILED");
      },
    },
    financeDataReaderAdapter: {
      id: "financedatareader",
      isAvailable: () => true,
      listInstruments: async () => [],
      fetchSymbol: async ({ symbol }) => {
        fdrSymbols.push(symbol);
        return { rows: dailyRows("Z"), upstreamId: "investing-com" };
      },
    },
  });

  const adjusted = await service.createMarketJob({
    marketId: "CN_A_SHARE",
    sourcePlanId: "CN_A_SHARE_SMART",
    symbols: ["000001"],
    timeframe: "1d",
    startAt: "2026-01-01T00:00:00+08:00",
    endAt: "2026-01-05T23:59:59+08:00",
    adjustment: "qfq",
  });
  const adjustedFailed = await waitForMarketStatus(
    service,
    adjusted.id,
    "FAILED",
  );
  assert.equal(adjustedFailed.error?.code, "AKSHARE_UPSTREAM_FAILED");
  assert.deepEqual(fdrSymbols, []);

  const intradayAshare = await service.createMarketJob({
    marketId: "CN_A_SHARE",
    sourcePlanId: "CN_A_SHARE_SMART",
    symbols: ["000001"],
    timeframe: "1h",
    startAt: "2026-01-01T00:00:00+08:00",
    endAt: "2026-01-01T23:59:59+08:00",
    adjustment: "none",
  });
  const intradayAshareFailed = await waitForMarketStatus(
    service,
    intradayAshare.id,
    "FAILED",
  );
  assert.equal(intradayAshareFailed.error?.code, "AKSHARE_UPSTREAM_FAILED");
  assert.deepEqual(fdrSymbols, []);

  const intradayCrypto = await service.createMarketJob({
    marketId: "CRYPTO_SPOT",
    sourcePlanId: "CCXT_BINANCE_SMART",
    symbols: ["BTC/USD"],
    timeframe: "1h",
    startAt: "2026-01-01T00:00:00Z",
    endAt: "2026-01-01T23:59:59Z",
    adjustment: null,
  });
  const intradayFailed = await waitForMarketStatus(
    service,
    intradayCrypto.id,
    "FAILED",
  );
  assert.equal(intradayFailed.error?.code, "CCXT_UPSTREAM_FAILED");
  assert.deepEqual(fdrSymbols, []);

  const dailyCrypto = await service.createMarketJob({
    marketId: "CRYPTO_SPOT",
    sourcePlanId: "CCXT_BINANCE_SMART",
    symbols: ["BTC/USD"],
    timeframe: "1d",
    startAt: "2026-01-01T00:00:00Z",
    endAt: "2026-01-05T23:59:59Z",
    adjustment: null,
  });
  const ready = await waitForMarketStatus(
    service,
    dailyCrypto.id,
    "READY_TO_SAVE",
  );
  assert.deepEqual(fdrSymbols, ["BTC/USD"]);
  assert.deepEqual(
    ready.sourceResults[0]?.attempts.map((entry) => [
      entry.providerId,
      entry.status,
    ]),
    [
      ["ccxt", "FAILED"],
      ["financedatareader", "SUCCEEDED"],
    ],
  );
  assert.equal(
    ready.sourceResults[0]?.finalSource?.providerId,
    "financedatareader",
  );
});

test("startup recovers persisted market jobs, interrupts running ones, and sweeps orphan staging", async (t) => {
  const stagingRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinuto-market-history-"),
  );
  t.after(() => fs.rm(stagingRoot, { recursive: true, force: true }));
  const jobStore = createMemoryAcquisitionJobStore();
  const createdAt = "2026-07-19T00:00:00.000Z";
  const updatedAt = "2026-07-19T00:01:00.000Z";
  const request = {
    marketId: "CN_A_SHARE",
    sourcePlanId: "CN_A_SHARE_SMART",
    symbols: ["000001"],
    timeframe: "1d",
    startAt: "2026-01-01T00:00:00+08:00",
    endAt: "2026-07-19T23:59:59+08:00",
    adjustment: "none",
  };
  const progress = {
    stage: "DOWNLOADING",
    completedSymbols: 0,
    totalSymbols: 1,
    retryAttempt: 0,
    retryAfterMs: 0,
  };
  const staging = {
    fileCount: 2,
    totalBytes: 100,
    manifestSha256: "a".repeat(64),
    outputFolderName: "Zinuto-Data-CN_A_SHARE-20260719-000000-job0002",
    mergedDuplicateBars: 0,
  };
  jobStore.upsert({
    id: "job-0001-running",
    status: "RUNNING",
    requestJson: JSON.stringify(request),
    progressJson: JSON.stringify(progress),
    sourceResultsJson: "[]",
    stagingJson: null,
    errorJson: null,
    createdAt,
    updatedAt,
    finishedAt: null,
  });
  jobStore.upsert({
    id: "job-0002-ready",
    status: "READY_TO_SAVE",
    requestJson: JSON.stringify(request),
    progressJson: JSON.stringify({ ...progress, stage: "READY_TO_SAVE" }),
    sourceResultsJson: "[]",
    stagingJson: JSON.stringify(staging),
    errorJson: null,
    createdAt,
    updatedAt,
    finishedAt: null,
  });
  const readyJobDir = path.join(stagingRoot, "job-0002-ready");
  await fs.mkdir(readyJobDir, { recursive: true });
  await fs.writeFile(
    path.join(readyJobDir, "manifest.json"),
    "{}",
  );
  const orphanDir = path.join(stagingRoot, "job-0000-orphan");
  await fs.mkdir(orphanDir, { recursive: true });
  await fs.writeFile(path.join(orphanDir, "payload.csv"), "orphan");

  const service = createMarketDataAcquisitionService({
    stagingRoot,
    createId: () => "job-0003-next",
    now: () => new Date("2026-07-19T00:02:00.000Z"),
    jobStore,
  });
  await service.start();

  const summaries = service.listMarketJobs();
  assert.equal(summaries.length, 2);

  const interrupted = summaries.find(
    (entry) => entry.id === "job-0001-running",
  );
  assert.ok(interrupted);
  assert.equal(interrupted.status, "FAILED");
  assert.equal(interrupted.error?.code, "ACQUISITION_INTERRUPTED");

  const ready = service.getMarketJob("job-0002-ready");
  assert.equal(ready.status, "READY_TO_SAVE");
  assert.deepEqual(ready.staging, staging);

  const running = service.getMarketJob("job-0001-running");
  assert.equal(running.status, "FAILED");
  assert.equal(running.error?.code, "ACQUISITION_INTERRUPTED");

  await assert.rejects(
    fs.access(orphanDir),
    /ENOENT/u,
  );

  await service.discardMarketJob("job-0002-ready");
  assert.equal(
    service.listMarketJobs().some((entry) => entry.id === "job-0002-ready"),
    false,
  );
});
