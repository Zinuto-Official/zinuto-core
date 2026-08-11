// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";
import {
  readBridgeCommandErrorArgs,
  readBridgeCommandErrorCode,
} from "@/api/bridgeCommandErrors";

test("bridge command errors read the native camelCase wire fields", () => {
  const error = {
    errorCode: "BACKEND_STARTUP_FAILED",
    errorArgs: { stage: "health", checkedAtMs: 42 },
  };

  assert.equal(readBridgeCommandErrorCode(error), "BACKEND_STARTUP_FAILED");
  assert.deepEqual(readBridgeCommandErrorArgs(error), {
    stage: "health",
    checkedAtMs: "42",
  });
});

test("bridge command errors retain nested legacy envelope compatibility", () => {
  const error = {
    error: {
      code: "BACKEND_STARTUP_PENDING",
      args: { stage: "spawn" },
    },
  };

  assert.equal(readBridgeCommandErrorCode(error), "BACKEND_STARTUP_PENDING");
  assert.deepEqual(readBridgeCommandErrorArgs(error), { stage: "spawn" });
});

test("bridge command errors fall back to valid legacy args when the native field is malformed", () => {
  const error = {
    errorCode: "BACKEND_STARTUP_FAILED",
    errorArgs: ["malformed"],
    args: { stage: "health", details: { retryable: true } },
  };

  assert.deepEqual(readBridgeCommandErrorArgs(error), {
    stage: "health",
    details: '{"retryable":true}',
  });
});
