// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  areStableSamplePoolsEqual,
} from "../../src/workspaces/trainer/useStableSamplePools";

const pool = {
  id: "pool-1",
  name: "Pool 1",
  assetClass: "STOCK" as const,
  assetClassLabel: "Stock",
  marketPresetId: "US_STOCK",
  baseTimeframe: "1d" as const,
  symbols: ["AAPL"],
  instruments: [
    {
      instrumentId: "instrument-1",
      symbol: "AAPL",
      barCount: 260,
      timeStartTs: "2024-01-01T00:00:00.000Z",
      timeEndTs: "2024-12-31T00:00:00.000Z",
    },
  ],
  questionBankRevisionToken: "revision-1",
};

test("stable sample pools change when only the question-bank revision changes", () => {
  assert.equal(areStableSamplePoolsEqual([pool], [{ ...pool }]), true);
  assert.equal(
    areStableSamplePoolsEqual([
      pool,
    ], [{ ...pool, questionBankRevisionToken: "revision-2" }]),
    false,
  );
});
