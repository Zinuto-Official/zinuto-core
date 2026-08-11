// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";
import { buildMarketStorageUsageSummary } from "../../src/infrastructure/db/marketStorageUsage.js";

test("market storage usage does not attribute an empty market database to bar data", () => {
  const summary = buildMarketStorageUsageSummary({
    physicalFootprint: {
      dbBytes: 320 * 1024 * 1024,
      walBytes: 0,
      shmBytes: 0,
      totalBytes: 320 * 1024 * 1024,
    },
    blockUsage: {
      totalBlocks: 10_000,
      usedBlocks: 200,
      freeBlocks: 9_800,
    },
    contentSummary: {
      hasContent: false,
      instrumentCount: 0,
      barCount: 0,
    },
  });

  assert.equal(summary.categories.marketDataBytes, 0);
  assert.equal(summary.categories.otherBytes, 320 * 1024 * 1024);
  assert.equal(summary.contentSummary.hasContent, false);
  assert.equal(summary.contentSummary.reclaimableBytes, 320 * 1024 * 1024);
});

test("market storage usage attributes only used duckdb blocks to bar data", () => {
  const summary = buildMarketStorageUsageSummary({
    physicalFootprint: {
      dbBytes: 1000,
      walBytes: 40,
      shmBytes: 24,
      totalBytes: 1064,
    },
    blockUsage: {
      totalBlocks: 10,
      usedBlocks: 6,
      freeBlocks: 4,
    },
    contentSummary: {
      hasContent: true,
      instrumentCount: 2,
      barCount: 120,
    },
  });

  assert.equal(summary.categories.marketDataBytes, 600);
  assert.equal(summary.categories.otherBytes, 464);
  assert.deepEqual(summary.contentSummary, {
    hasContent: true,
    instrumentCount: 2,
    barCount: 120,
    reclaimableBytes: 464,
  });
});

test("market storage usage falls back to database bytes when block usage is unavailable", () => {
  const summary = buildMarketStorageUsageSummary({
    physicalFootprint: {
      dbBytes: 1000,
      walBytes: 40,
      shmBytes: 24,
      totalBytes: 1064,
    },
    blockUsage: null,
    contentSummary: {
      hasContent: true,
      instrumentCount: 1,
      barCount: 20,
    },
  });

  assert.equal(summary.categories.marketDataBytes, 1000);
  assert.equal(summary.categories.otherBytes, 64);
  assert.equal(summary.contentSummary.reclaimableBytes, 64);
});
