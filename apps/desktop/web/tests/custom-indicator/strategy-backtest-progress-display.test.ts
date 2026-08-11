// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import type {
  ApiBacktestBatch,
  ApiBacktestBatchStatus,
} from "../../src/api";
import {
  mergeBacktestBatchUpdate,
  resolveBacktestProgressPercent,
} from "../../src/workspaces/strategy-backtest/strategyBacktestDisplay";

type BatchOptions = {
  completedSymbols?: number;
  id?: string;
  stage?: string;
  status?: ApiBacktestBatchStatus;
  totalSymbols?: number;
  updatedAt?: string;
};

const makeBatch = ({
  completedSymbols = 0,
  id = "batch-1",
  stage,
  status = "RUNNING",
  totalSymbols = 10,
  updatedAt = "2026-06-14T10:00:00.000Z",
}: BatchOptions = {}): ApiBacktestBatch => ({
  id,
  name: "Backtest progress test",
  status,
  config: {
    strategySource: "BUY:1;",
    initialCapital: 1000,
    priceMode: "NEXT_OPEN",
    signalExecutionMode: "NEXT_OPEN",
    orderSizing: {
      mode: "FIXED_QTY",
      value: 1,
    },
    tradingSettings: {} as ApiBacktestBatch["config"]["tradingSettings"],
  },
  progress: {
    stage: stage ?? status,
    completedSymbols,
    totalSymbols,
    updatedAt,
  },
  summary: {},
  errorCode: null,
  errorMessage: null,
  createdAt: "2026-06-14T09:59:00.000Z",
  updatedAt,
  startedAt: "2026-06-14T09:59:30.000Z",
  finishedAt: status === "SUCCEEDED" ? updatedAt : null,
});

test("strategy backtest progress keeps hydrating completion below terminal progress", () => {
  const hydratingComplete = makeBatch({
    stage: "HYDRATING",
    completedSymbols: 10,
    totalSymbols: 10,
  });

  assert.equal(resolveBacktestProgressPercent(hydratingComplete), 35);
  assert.ok(resolveBacktestProgressPercent(hydratingComplete) < 100);
});

test("strategy backtest progress does not move backward when running starts after hydration", () => {
  const hydratingComplete = makeBatch({
    stage: "HYDRATING",
    completedSymbols: 10,
    totalSymbols: 10,
  });
  const runningStart = makeBatch({
    stage: "RUNNING",
    completedSymbols: 0,
    totalSymbols: 10,
    updatedAt: "2026-06-14T10:00:01.000Z",
  });

  assert.equal(
    resolveBacktestProgressPercent(runningStart),
    resolveBacktestProgressPercent(hydratingComplete),
  );
});

test("strategy backtest progress waits for done before displaying 100", () => {
  const runningComplete = makeBatch({
    stage: "RUNNING",
    completedSymbols: 10,
    totalSymbols: 10,
  });
  const done = makeBatch({
    stage: "DONE",
    status: "SUCCEEDED",
    completedSymbols: 10,
    totalSymbols: 10,
    updatedAt: "2026-06-14T10:00:02.000Z",
  });

  assert.equal(resolveBacktestProgressPercent(runningComplete), 99);
  assert.equal(resolveBacktestProgressPercent(done), 100);
});

test("strategy backtest batch merge ignores stale running updates after success", () => {
  const current = makeBatch({
    stage: "DONE",
    status: "SUCCEEDED",
    completedSymbols: 10,
    totalSymbols: 10,
    updatedAt: "2026-06-14T10:00:02.000Z",
  });
  const staleRunning = makeBatch({
    stage: "RUNNING",
    completedSymbols: 5,
    totalSymbols: 10,
    updatedAt: "2026-06-14T10:00:01.000Z",
  });

  assert.equal(mergeBacktestBatchUpdate(current, staleRunning), current);
});

test("strategy backtest batch merge accepts a newer rerun reset", () => {
  const current = makeBatch({
    stage: "DONE",
    status: "SUCCEEDED",
    completedSymbols: 10,
    totalSymbols: 10,
    updatedAt: "2026-06-14T10:00:02.000Z",
  });
  const rerunQueued = makeBatch({
    stage: "QUEUED",
    status: "QUEUED",
    completedSymbols: 0,
    totalSymbols: 0,
    updatedAt: "2026-06-14T10:00:03.000Z",
  });

  assert.equal(mergeBacktestBatchUpdate(current, rerunQueued), rerunQueued);
});
