// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  desktopPreparedFreeReplayStartRequestSchema,
} from "@zinuto/shared/contracts-desktop/api";
import {
  preparedFreeReplayStartSchema,
} from "../../src/http/apiSchemas/sessionSchemas.js";

const request = {
  mode: "RANDOM" as const,
  selectedPoolId: "pool-large",
  minimumBaseTimeframe: "1d" as const,
  tradingEnvironment: {
    assetClass: "STOCK" as const,
    marketPresetId: "A_SHARE",
  },
};

test("prepared free replay start resolves candidates locally", () => {
  assert.deepEqual(
    preparedFreeReplayStartSchema.parse(request),
    desktopPreparedFreeReplayStartRequestSchema.parse(request),
  );
});

test("prepared free replay start rejects obsolete candidate snapshots", () => {
  const legacyRequest = {
    ...request,
    candidates: Array.from({ length: 1_571 }, (_, index) => ({
      instrumentId: `instrument-${index}`,
      symbol: `SYMBOL${index}`,
      poolId: "pool-large",
      poolName: "Large pool",
      sourceTimeframe: "1d",
    })),
  };

  assert.equal(
    desktopPreparedFreeReplayStartRequestSchema.safeParse(legacyRequest).success,
    false,
  );
  assert.equal(preparedFreeReplayStartSchema.safeParse(legacyRequest).success, false);
});
