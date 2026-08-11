// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { resolveBackendTransportConfig } from "../../src/runtime/backendTransport.js";
import { isAppError } from "../../src/kernel/appError.js";

test("macOS only accepts the unix socket transport contract", () => {
  assert.deepEqual(
    resolveBackendTransportConfig({
      platform: "darwin",
      env: {
        ZINUTO_BACKEND_SOCKET: "/tmp/zinuto.sock",
        ZINUTO_BACKEND_PORT: "4100",
      } as NodeJS.ProcessEnv,
    }),
    {
      type: "unix",
      socketPath: "/tmp/zinuto.sock",
      socketPathLengthBytes: Buffer.byteLength("/tmp/zinuto.sock"),
      socketPathMaxBytes: 103,
      host: null,
      port: null,
    },
  );

  assert.throws(
    () =>
      resolveBackendTransportConfig({
        platform: "darwin",
        env: {
          ZINUTO_BACKEND_PORT: "4100",
        } as NodeJS.ProcessEnv,
      }),
    (error: unknown) =>
      isAppError(error) && error.code === "BACKEND_TRANSPORT_REQUIRED",
  );
});

test("Windows only accepts the loopback TCP transport contract", () => {
  assert.deepEqual(
    resolveBackendTransportConfig({
      platform: "win32",
      env: {
        ZINUTO_BACKEND_SOCKET: "/tmp/zinuto.sock",
        ZINUTO_BACKEND_PORT: "4100",
      } as NodeJS.ProcessEnv,
    }),
    {
      type: "tcp",
      socketPath: null,
      socketPathLengthBytes: 0,
      socketPathMaxBytes: null,
      host: "127.0.0.1",
      port: 4100,
    },
  );

  assert.throws(
    () =>
      resolveBackendTransportConfig({
        platform: "win32",
        env: {
          ZINUTO_BACKEND_SOCKET: "/tmp/zinuto.sock",
        } as NodeJS.ProcessEnv,
      }),
    (error: unknown) =>
      isAppError(error) && error.code === "BACKEND_TRANSPORT_REQUIRED",
  );
});
