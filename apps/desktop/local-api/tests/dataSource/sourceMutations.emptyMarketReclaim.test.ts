// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  clearLocalDataSourcesAndMarketDataCore,
  removeLocalDataSourceCore,
} from "../../src/application/dataSource/sourceMutations.js";

const NOW_ISO = "2026-05-12T00:00:00.000Z";

test("clearing local data sources triggers empty market storage reclaim", async () => {
  let reclaimCalls = 0;

  const result = await clearLocalDataSourcesAndMarketDataCore({
    isSystemResetRunning: () => false,
    countActiveJobs: () => 0,
    markAllSourcesDeleting: () => true,
    listAllImportFilePaths: () => [],
    readDistinctFilePaths: () => [],
    readDistinctImportTempDirPaths: () => [],
    listLocalInstrumentIds: () => ["instrument-a", "instrument-b"],
    removeMarketInstrumentData: async () => undefined,
    runDeleteAllSourcesTx: () => ({
      deletedSourceFiles: 0,
      deletedImportJobs: 0,
      deletedSources: 1,
      deletedInstruments: 2,
    }),
    removeImportTempFilesByPath: async () => undefined,
    removeImportTempDirsByPath: async () => undefined,
    cleanupUntrackedImportUploadTempFiles: async () => undefined,
    restoreSystemMarketSeedMetadataAfterLocalClear: async () => undefined,
    reclaimEmptyMarketStorage: async () => {
      reclaimCalls += 1;
    },
    verifyLocalDataSourcesCleared: async () => undefined,
    nowIso: () => NOW_ISO,
  });

  assert.equal(result.deletedInstruments, 2);
  assert.equal(reclaimCalls, 1);
});

test("removing the final source triggers empty market storage reclaim", async () => {
  let reclaimCalls = 0;

  const result = await removeLocalDataSourceCore("source-a", {
    isSystemResetRunning: () => false,
    getSourceById: () => ({ id: "source-a", baseTimeframe: "1d" }),
    countActiveJobsBySource: () => 0,
    markSourceDeleting: () => true,
    listFilePathsBySource: () => [],
    readDistinctFilePaths: () => [],
    readDistinctImportTempDirPaths: () => [],
    listLocalInstrumentIdsBySource: () => ["instrument-a"],
    removeMarketInstrumentData: async () => undefined,
    runDeleteSourceTx: () => ({
      deletedSourceFiles: 0,
      deletedImportJobs: 0,
      deletedSources: 1,
      deletedInstruments: 1,
    }),
    removeImportTempFilesByPath: async () => undefined,
    removeImportTempDirsByPath: async () => undefined,
    cleanupUntrackedImportUploadTempFiles: async () => undefined,
    reclaimEmptyMarketStorage: async () => {
      reclaimCalls += 1;
    },
    verifyLocalDataSourceRemoved: async () => undefined,
    nowIso: () => NOW_ISO,
  });

  assert.equal(result.deletedInstruments, 1);
  assert.equal(reclaimCalls, 1);
});

test("active import jobs block source removal before empty market reclaim", async () => {
  let reclaimCalls = 0;

  await assert.rejects(
    () =>
      removeLocalDataSourceCore("source-a", {
        isSystemResetRunning: () => false,
        getSourceById: () => ({ id: "source-a", baseTimeframe: "1d" }),
        countActiveJobsBySource: () => 1,
        markSourceDeleting: () => true,
        listFilePathsBySource: () => [],
        readDistinctFilePaths: () => [],
        readDistinctImportTempDirPaths: () => [],
        listLocalInstrumentIdsBySource: () => ["instrument-a"],
        removeMarketInstrumentData: async () => undefined,
        runDeleteSourceTx: () => ({
          deletedSourceFiles: 0,
          deletedImportJobs: 0,
          deletedSources: 0,
          deletedInstruments: 0,
        }),
        removeImportTempFilesByPath: async () => undefined,
        removeImportTempDirsByPath: async () => undefined,
        cleanupUntrackedImportUploadTempFiles: async () => undefined,
        reclaimEmptyMarketStorage: async () => {
          reclaimCalls += 1;
        },
        verifyLocalDataSourceRemoved: async () => undefined,
        nowIso: () => NOW_ISO,
      }),
    /LOCAL_DATA_IMPORT_JOB_ACTIVE/,
  );

  assert.equal(reclaimCalls, 0);
});

test("source removal cannot take over a source-level symbol mutation lease", async () => {
  let marketDeleteCalls = 0;

  await assert.rejects(
    () =>
      removeLocalDataSourceCore("source-a", {
        isSystemResetRunning: () => false,
        getSourceById: () => ({ id: "source-a", baseTimeframe: "1d" }),
        countActiveJobsBySource: () => 0,
        markSourceDeleting: () => false,
        listFilePathsBySource: () => [],
        readDistinctFilePaths: () => [],
        readDistinctImportTempDirPaths: () => [],
        listLocalInstrumentIdsBySource: () => ["instrument-a"],
        removeMarketInstrumentData: async () => {
          marketDeleteCalls += 1;
        },
        runDeleteSourceTx: () => ({
          deletedSourceFiles: 0,
          deletedImportJobs: 0,
          deletedSources: 0,
          deletedInstruments: 0,
        }),
        removeImportTempFilesByPath: async () => undefined,
        removeImportTempDirsByPath: async () => undefined,
        cleanupUntrackedImportUploadTempFiles: async () => undefined,
        reclaimEmptyMarketStorage: async () => undefined,
        verifyLocalDataSourceRemoved: async () => undefined,
        nowIso: () => NOW_ISO,
      }),
    (error: unknown) =>
      Boolean(error) &&
      typeof error === "object" &&
      (error as { code?: unknown }).code ===
        "LOCAL_DATA_SOURCE_MUTATION_IN_PROGRESS",
  );

  assert.equal(marketDeleteCalls, 0);
});

test("clear-all cannot overwrite an active symbol mutation lease", async () => {
  let marketDeleteCalls = 0;

  await assert.rejects(
    () =>
      clearLocalDataSourcesAndMarketDataCore({
        isSystemResetRunning: () => false,
        countActiveJobs: () => 0,
        markAllSourcesDeleting: () => false,
        listAllImportFilePaths: () => [],
        readDistinctFilePaths: () => [],
        readDistinctImportTempDirPaths: () => [],
        listLocalInstrumentIds: () => ["instrument-a"],
        removeMarketInstrumentData: async () => {
          marketDeleteCalls += 1;
        },
        runDeleteAllSourcesTx: () => ({
          deletedSourceFiles: 0,
          deletedImportJobs: 0,
          deletedSources: 0,
          deletedInstruments: 0,
        }),
        removeImportTempFilesByPath: async () => undefined,
        removeImportTempDirsByPath: async () => undefined,
        cleanupUntrackedImportUploadTempFiles: async () => undefined,
        restoreSystemMarketSeedMetadataAfterLocalClear: async () => undefined,
        reclaimEmptyMarketStorage: async () => undefined,
        verifyLocalDataSourcesCleared: async () => undefined,
        nowIso: () => NOW_ISO,
      }),
    (error: unknown) =>
      Boolean(error) &&
      typeof error === "object" &&
      (error as { code?: unknown }).code ===
        "LOCAL_DATA_SOURCE_MUTATION_IN_PROGRESS",
  );

  assert.equal(marketDeleteCalls, 0);
});

test("active system reset blocks local data source clearing before deletion starts", async () => {
  let markedDeleting = false;

  await assert.rejects(
    () =>
      clearLocalDataSourcesAndMarketDataCore({
        isSystemResetRunning: () => true,
        countActiveJobs: () => 0,
        markAllSourcesDeleting: () => {
          markedDeleting = true;
          return true;
        },
        listAllImportFilePaths: () => [],
        readDistinctFilePaths: () => [],
        readDistinctImportTempDirPaths: () => [],
        listLocalInstrumentIds: () => [],
        removeMarketInstrumentData: async () => undefined,
        runDeleteAllSourcesTx: () => ({
          deletedSourceFiles: 0,
          deletedImportJobs: 0,
          deletedSources: 0,
          deletedInstruments: 0,
        }),
        removeImportTempFilesByPath: async () => undefined,
        removeImportTempDirsByPath: async () => undefined,
        cleanupUntrackedImportUploadTempFiles: async () => undefined,
        restoreSystemMarketSeedMetadataAfterLocalClear: async () => undefined,
        reclaimEmptyMarketStorage: async () => undefined,
        verifyLocalDataSourcesCleared: async () => undefined,
        nowIso: () => NOW_ISO,
      }),
    /SYSTEM_RESET_IN_PROGRESS/,
  );

  assert.equal(markedDeleting, false);
});

test("clear-all verifier failure returns local destructive partial failure", async () => {
  await assert.rejects(
    () =>
      clearLocalDataSourcesAndMarketDataCore({
        isSystemResetRunning: () => false,
        countActiveJobs: () => 0,
        markAllSourcesDeleting: () => true,
        listAllImportFilePaths: () => [],
        readDistinctFilePaths: () => [],
        readDistinctImportTempDirPaths: () => [],
        listLocalInstrumentIds: () => ["instrument-a"],
        removeMarketInstrumentData: async () => undefined,
        runDeleteAllSourcesTx: () => ({
          deletedSourceFiles: 0,
          deletedImportJobs: 0,
          deletedSources: 1,
          deletedInstruments: 1,
        }),
        removeImportTempFilesByPath: async () => undefined,
        removeImportTempDirsByPath: async () => undefined,
        cleanupUntrackedImportUploadTempFiles: async () => undefined,
        restoreSystemMarketSeedMetadataAfterLocalClear: async () => undefined,
        reclaimEmptyMarketStorage: async () => undefined,
        verifyLocalDataSourcesCleared: async () => {
          throw new Error("MARKET_DATA_REMAINING");
        },
        nowIso: () => NOW_ISO,
      }),
    (error: unknown) =>
      Boolean(error) &&
      typeof error === "object" &&
      (error as { code?: string }).code ===
        "LOCAL_DATA_DESTRUCTIVE_OPERATION_PARTIAL_FAILED" &&
      (error as { args?: Record<string, unknown> }).args?.operation ===
        "CLEAR_ALL_LOCAL_DATA_SOURCES" &&
      (error as { args?: Record<string, unknown> }).args?.cause ===
        "MARKET_DATA_REMAINING",
  );
});

test("single-source delete SQLite failure returns local destructive partial failure", async () => {
  await assert.rejects(
    () =>
      removeLocalDataSourceCore("source-a", {
        isSystemResetRunning: () => false,
        getSourceById: () => ({ id: "source-a", baseTimeframe: "1d" }),
        countActiveJobsBySource: () => 0,
        markSourceDeleting: () => true,
        listFilePathsBySource: () => [],
        readDistinctFilePaths: () => [],
        readDistinctImportTempDirPaths: () => [],
        listLocalInstrumentIdsBySource: () => ["instrument-a"],
        removeMarketInstrumentData: async () => undefined,
        runDeleteSourceTx: () => {
          throw new Error("SQLITE_DELETE_FAILED");
        },
        removeImportTempFilesByPath: async () => undefined,
        removeImportTempDirsByPath: async () => undefined,
        cleanupUntrackedImportUploadTempFiles: async () => undefined,
        reclaimEmptyMarketStorage: async () => undefined,
        verifyLocalDataSourceRemoved: async () => undefined,
        nowIso: () => NOW_ISO,
      }),
    (error: unknown) =>
      Boolean(error) &&
      typeof error === "object" &&
      (error as { code?: string }).code ===
        "LOCAL_DATA_DESTRUCTIVE_OPERATION_PARTIAL_FAILED" &&
      (error as { args?: Record<string, unknown> }).args?.operation ===
        "REMOVE_LOCAL_DATA_SOURCE" &&
      (error as { args?: Record<string, unknown> }).args?.sourceId ===
        "source-a" &&
      (error as { args?: Record<string, unknown> }).args?.cause ===
        "SQLITE_DELETE_FAILED",
  );
});
