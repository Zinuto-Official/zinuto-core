// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  runReferenceBatchParallel,
  resolveReferenceWorkerCount,
  type ReferenceWorkerRunner,
} from "../../src/application/backtest/referenceEngineWorkerPool.js";
import type {
  BacktestConfig,
  BacktestInstrumentCandidate,
} from "../../src/application/backtest/types.js";

const restoreEnvValue = (key: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
};

test("resolveReferenceWorkerCount clamps explicit env override", () => {
  const previous = process.env.ZINUTO_BACKTEST_TS_WORKERS;
  try {
    process.env.ZINUTO_BACKTEST_TS_WORKERS = "64";
    assert.equal(resolveReferenceWorkerCount(), 32);
    process.env.ZINUTO_BACKTEST_TS_WORKERS = "3";
    assert.equal(resolveReferenceWorkerCount(), 3);
  } finally {
    restoreEnvValue("ZINUTO_BACKTEST_TS_WORKERS", previous);
  }
});

test("resolveReferenceWorkerCount returns bounded default when env is unset", () => {
  const previous = process.env.ZINUTO_BACKTEST_TS_WORKERS;
  try {
    delete process.env.ZINUTO_BACKTEST_TS_WORKERS;
    const resolved = resolveReferenceWorkerCount();
    assert.ok(resolved >= 1);
    assert.ok(resolved <= 8);
  } finally {
    restoreEnvValue("ZINUTO_BACKTEST_TS_WORKERS", previous);
  }
});

const testConfig = {
  initialCapital: 1000,
  parameterInputs: {},
} as BacktestConfig;

const testCandidates = Array.from({ length: 3 }, (_, index): BacktestInstrumentCandidate => ({
  instrumentId: `worker-pool-${index}`,
  sourceId: null,
  symbol: `W${index}`,
  baseTimeframe: "1d",
  name: null,
  market: "LOCAL",
  barCount: 1,
  timeZone: "UTC",
  barsVersionToken: "test",
}));

const createIdleRunner = (): ReferenceWorkerRunner => {
  let closed = false;
  return {
    get closed() {
      return closed;
    },
    run: async () => ({
      status: "SKIPPED",
      issue: {
        instrumentId: "worker-pool",
        symbol: "WORKER",
        reason: "NO_BARS",
      },
    }),
    terminate: () => {
      closed = true;
    },
  };
};

test("worker initialization uses one shared deadline instead of serial timeouts", async () => {
  const previous = process.env.ZINUTO_BACKTEST_TS_WORKERS;
  process.env.ZINUTO_BACKTEST_TS_WORKERS = "3";
  try {
    await assert.rejects(
      runReferenceBatchParallel({
        config: testConfig,
        candidates: testCandidates,
        strategySource: "BUY:1;",
        compiled: {} as never,
        displayName: "hung initialization",
        readBars: async () => [],
        isCancelled: () => false,
        onProgress: () => undefined,
      }, {
        workerInitTimeoutMs: 40,
        createWorkerSlot: async () => new Promise<ReferenceWorkerRunner>(() => undefined),
      }),
      /BACKTEST_WORKER_INIT_TIMEOUT/u,
    );
  } finally {
    restoreEnvValue("ZINUTO_BACKTEST_TS_WORKERS", previous);
  }
});

test("systemic readBars timeouts terminate the batch at the configured threshold", async () => {
  const previous = process.env.ZINUTO_BACKTEST_TS_WORKERS;
  process.env.ZINUTO_BACKTEST_TS_WORKERS = "3";
  try {
    await assert.rejects(
      runReferenceBatchParallel({
        config: testConfig,
        candidates: testCandidates,
        strategySource: "BUY:1;",
        compiled: {} as never,
        displayName: "hung reads",
        readBars: async () => new Promise(() => undefined),
        isCancelled: () => false,
        onProgress: () => undefined,
      }, {
        readBarsTimeoutMs: 30,
        systemTimeoutThreshold: 2,
        createWorkerSlot: async () => createIdleRunner(),
      }),
      /BACKTEST_SYSTEM_TIMEOUT_THRESHOLD/u,
    );
  } finally {
    restoreEnvValue("ZINUTO_BACKTEST_TS_WORKERS", previous);
  }
});

test("cancellation interrupts a hung readBars operation before its deadline", async () => {
  let cancelled = false;
  let readSignalAborted = false;
  const cancelTimer = setTimeout(() => {
    cancelled = true;
  }, 30);
  try {
    await assert.rejects(
      runReferenceBatchParallel({
        config: testConfig,
        candidates: testCandidates.slice(0, 1),
        strategySource: "BUY:1;",
        compiled: {} as never,
        displayName: "cancel hung read",
        readBars: async (_candidate, signal) => new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            readSignalAborted = true;
            reject(signal.reason);
          }, { once: true });
        }),
        isCancelled: () => cancelled,
        onProgress: () => undefined,
      }, {
        readBarsTimeoutMs: 5_000,
        createWorkerSlot: async () => createIdleRunner(),
      }),
      /BACKTEST_RUN_CANCELLED/u,
    );
    assert.equal(readSignalAborted, true);
  } finally {
    clearTimeout(cancelTimer);
  }
});
