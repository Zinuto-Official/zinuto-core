// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { createLocalDataSourcesCache } from "../../src/application/dataSource/sourceCache.js";
import type { LocalDataSourceSummary } from "../../src/application/dataSource/types.js";

test("local data source cache is isolated by authorization signature", () => {
  let nowMs = 1_000;
  const cache = createLocalDataSourcesCache({
    ttlMs: 1_200,
    nowMs: () => nowMs,
  });
  const memberItems = [
    {
      id: "source-member",
      sourceLocked: true,
    },
  ] as LocalDataSourceSummary[];
  const proItems = [
    {
      id: "source-pro",
      sourceLocked: false,
    },
  ] as LocalDataSourceSummary[];

  cache.setCached("acct-a|MEMBER|fp-1|authz-1|FREE", memberItems);

  assert.equal(
    cache.getCached("acct-a|VIP|fp-2|authz-2|PRO"),
    null,
  );

  cache.setCached("acct-a|VIP|fp-2|authz-2|PRO", proItems);

  assert.equal(
    cache.getCached("acct-a|MEMBER|fp-1|authz-1|FREE"),
    null,
  );
  assert.equal(
    cache.getCached("acct-a|VIP|fp-2|authz-2|PRO"),
    proItems,
  );

  nowMs += 1_201;
  assert.equal(
    cache.getCached("acct-a|VIP|fp-2|authz-2|PRO"),
    null,
  );
});
