// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { runDestructiveDataChangeFinalizer } from "../../src/app-shell/useDestructiveDataChangeFinalizer";

test("destructive data finalizer clears runtime before refreshing data sources in fixed order", async () => {
  const calls: string[] = [];
  const result = await runDestructiveDataChangeFinalizer(
    {
      resetTrainerToPrepView: () => {
        calls.push("resetTrainer");
      },
      setActionDialog: () => {
        calls.push("actionDialog");
      },
      setOrderEndPrompt: () => {
        calls.push("orderPrompt");
      },
      setIsAutoplay: (value) => {
        calls.push(`autoplay:${String(value)}`);
      },
      setDataPoolRemovedSymbolsBySourceId: () => {
        calls.push("removedSymbols");
      },
      refreshInstruments: async () => {
        calls.push("refreshInstruments");
      },
      syncCustomSamplePoolsFromDataSources: async () => {
        calls.push("syncPools");
      },
      refreshLatestResumableTrainerSession: async () => {
        calls.push("refreshLatestSession");
      },
      refreshTradingSettings: async () => {
        calls.push("refreshTradingSettings");
      },
      refreshSystemStorageUsage: async () => {
        calls.push("refreshStorage");
      },
    },
    {
      clearRemovedSymbols: true,
      refreshDataSources: true,
      resetAutoplay: true,
    },
  );

  assert.equal(result.failed, false);
  assert.deepEqual(calls, [
    "resetTrainer",
    "actionDialog",
    "orderPrompt",
    "autoplay:false",
    "removedSymbols",
    "refreshInstruments",
    "syncPools",
    "refreshLatestSession",
    "refreshTradingSettings",
    "refreshStorage",
  ]);
});

test("destructive data finalizer keeps running refresh chain after one refresh fails", async () => {
  const calls: string[] = [];
  const result = await runDestructiveDataChangeFinalizer(
    {
      resetTrainerToPrepView: () => {
        calls.push("resetTrainer");
      },
      refreshInstruments: async () => {
        calls.push("refreshInstruments");
        throw new Error("network");
      },
      syncCustomSamplePoolsFromDataSources: async () => {
        calls.push("syncPools");
      },
      refreshLatestResumableTrainerSession: async () => {
        calls.push("refreshLatestSession");
      },
      refreshTradingSettings: async () => {
        calls.push("refreshTradingSettings");
      },
      refreshSystemStorageUsage: async () => {
        calls.push("refreshStorage");
      },
    },
    { refreshDataSources: true },
  );

  assert.equal(result.failed, true);
  assert.deepEqual(calls, [
    "resetTrainer",
    "refreshInstruments",
    "syncPools",
    "refreshLatestSession",
    "refreshTradingSettings",
    "refreshStorage",
  ]);
});

test("destructive data finalizer refreshes history without duplicating storage refresh", async () => {
  const calls: string[] = [];
  const result = await runDestructiveDataChangeFinalizer(
    {
      resetTrainerToPrepView: () => {
        calls.push("resetTrainer");
      },
      resetHistoryRuntime: () => {
        calls.push("resetHistory");
      },
      refreshInstruments: async () => {
        calls.push("refreshInstruments");
      },
      syncCustomSamplePoolsFromDataSources: async () => {
        calls.push("syncPools");
      },
      refreshTrainingProjects: async () => {
        calls.push("refreshProjects");
      },
      refreshReplayNotes: async () => {
        calls.push("refreshNotes");
      },
      refreshSystemStorageUsage: async () => {
        calls.push("refreshStorage");
      },
    },
    {
      refreshDataSources: true,
      refreshHistory: true,
    },
  );

  assert.equal(result.failed, false);
  assert.deepEqual(calls, [
    "resetTrainer",
    "refreshInstruments",
    "syncPools",
    "refreshStorage",
    "resetHistory",
    "refreshProjects",
    "refreshNotes",
  ]);
});
