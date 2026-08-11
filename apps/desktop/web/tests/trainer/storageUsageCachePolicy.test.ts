// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  isApiInFlightGetCoalescingAllowedPath,
  resolveApiGetResponseCacheTtlMs,
} from "../../src/api/requestCoalescing";

test("storage usage coalesces concurrent reads without pinning a warming snapshot", () => {
  const path = "/api/v1/system/storage-usage";
  assert.equal(isApiInFlightGetCoalescingAllowedPath(path), true);
  assert.equal(resolveApiGetResponseCacheTtlMs(path), 0);
});
