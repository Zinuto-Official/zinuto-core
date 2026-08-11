// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";
import {
  isApiInFlightGetCoalescingAllowedPath,
  resolveApiInFlightGetCoalescingKey,
  trimApiInFlightGetCoalescingMap,
} from "../../src/api/requestCoalescing";
import {
  WORKSPACE_PAGE_IDLE_PRELOAD_ORDER,
} from "../../src/workspaces/workspacePageModulePreload";

test("api GET coalescing is limited to safe bodyless reads", () => {
  const base = {
    path: "/api/v1/market/instruments/abc/bars/frame?offset=0&limit=512",
    headers: { "Content-Type": "application/json" },
    timeoutMs: 60_000,
    hasExternalSignal: false,
  };

  assert.ok(isApiInFlightGetCoalescingAllowedPath(base.path));
  assert.equal(
    resolveApiInFlightGetCoalescingKey({
      ...base,
      method: "GET",
      body: "",
    }),
    resolveApiInFlightGetCoalescingKey({
      ...base,
      method: "get",
      body: "",
      headers: { "content-type": "application/json" },
    }),
  );
  assert.equal(
    resolveApiInFlightGetCoalescingKey({
      ...base,
      method: "POST",
      body: "{}",
    }),
    null,
  );
  assert.equal(
    resolveApiInFlightGetCoalescingKey({
      ...base,
      method: "GET",
      body: "{}",
    }),
    null,
  );
  assert.equal(
    resolveApiInFlightGetCoalescingKey({
      ...base,
      method: "GET",
      body: "",
      hasExternalSignal: true,
    }),
    null,
  );
  assert.ok(isApiInFlightGetCoalescingAllowedPath("/api/v1/training/stats"));
  assert.ok(
    isApiInFlightGetCoalescingAllowedPath("/api/v1/training/stats/summary"),
  );
  assert.ok(
    isApiInFlightGetCoalescingAllowedPath(
      "/api/v1/training/special/stats/summary?modeId=fast-decision-training",
    ),
  );
});

test("api GET coalescing map trims oldest entries", async () => {
  const map = new Map<string, Promise<unknown>>();
  map.set("a", Promise.resolve("a"));
  map.set("b", Promise.resolve("b"));
  map.set("c", Promise.resolve("c"));

  trimApiInFlightGetCoalescingMap(map, 2);

  assert.deepEqual(Array.from(map.keys()), ["b", "c"]);
});

test("workspace idle preload excludes interaction-heavy pages", () => {
  assert.deepEqual(WORKSPACE_PAGE_IDLE_PRELOAD_ORDER, [
    "HISTORY",
    "DATA",
    "SETTINGS",
  ]);
  assert.equal(
    WORKSPACE_PAGE_IDLE_PRELOAD_ORDER.includes("COMMAND_CENTER"),
    false,
  );
  assert.equal(WORKSPACE_PAGE_IDLE_PRELOAD_ORDER.includes("NOTES"), false);
  assert.equal(
    WORKSPACE_PAGE_IDLE_PRELOAD_ORDER.includes("CHALLENGE_STATS"),
    false,
  );
  assert.equal(
    WORKSPACE_PAGE_IDLE_PRELOAD_ORDER.includes("SPECIAL_TRAINING"),
    false,
  );
  assert.equal(
    WORKSPACE_PAGE_IDLE_PRELOAD_ORDER.includes("CUSTOM_INDICATOR"),
    false,
  );
});
