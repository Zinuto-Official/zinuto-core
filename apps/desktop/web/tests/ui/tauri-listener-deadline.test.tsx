// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  installTauriListenerWithinDeadline,
  installTauriListenerWithRetry,
  settleTauriTaskWithinDeadline,
} from "../../src/frontend-kernel/tauriEventCleanup";

const waitForNextTask = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

test("Tauri listener registration settles inside its deadline", async () => {
  let unlistenCalls = 0;
  const unlisten = await installTauriListenerWithinDeadline(
    async () => () => {
      unlistenCalls += 1;
    },
    "READY",
    100,
  );

  assert.equal(unlistenCalls, 0);
  unlisten();
  assert.equal(unlistenCalls, 1);
});

test("late Tauri listener registration is rejected and automatically removed", async () => {
  let finishInstall: (unlisten: () => void) => void = () => {
    throw new Error("listener installer was not initialized");
  };
  let unlistenCalls = 0;
  const registration = installTauriListenerWithinDeadline(
    () =>
      new Promise<() => void>((resolve) => {
        finishInstall = resolve;
      }),
    "SHELL_READY",
    10,
  );

  await assert.rejects(registration, /TAURI_LISTENER_SHELL_READY_TIMEOUT/u);
  finishInstall(() => {
    unlistenCalls += 1;
  });
  await waitForNextTask();

  assert.equal(unlistenCalls, 1);
});

test("Tauri listener registration retries one transient startup timeout", async () => {
  let installCalls = 0;
  let unlistenCalls = 0;
  const unlisten = await installTauriListenerWithRetry(
    async () => {
      installCalls += 1;
      if (installCalls === 1) {
        return new Promise<() => void>(() => undefined);
      }
      return () => {
        unlistenCalls += 1;
      };
    },
    "ACTION",
    10,
    2,
  );

  assert.equal(installCalls, 2);
  unlisten();
  assert.equal(unlistenCalls, 1);
});

test("Tauri host operations reject instead of holding an opening path forever", async () => {
  await assert.rejects(
    settleTauriTaskWithinDeadline(
      new Promise<never>(() => undefined),
      "SECONDARY_LOOKUP",
      10,
    ),
    /TAURI_TASK_SECONDARY_LOOKUP_TIMEOUT/u,
  );
  await assert.doesNotReject(
    settleTauriTaskWithinDeadline(
      Promise.resolve("ready"),
      "SECONDARY_LOOKUP",
      100,
    ),
  );
});
