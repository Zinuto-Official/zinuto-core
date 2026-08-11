// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { NativeBackendStartupPreflightStatus } from "../../src/api";
import {
  advanceNativeBackendStartupGate,
  createNativeBackendStartupGateState,
  NATIVE_BACKEND_STARTUP_MAX_READ_FAILURES,
  startNativeBackendStartupStatusWatcher,
} from "../../src/app-shell/nativeBackendStartupGate";

const status = (
  state: NativeBackendStartupPreflightStatus["state"],
  stage: string,
  errorCode: string | null = null,
  checkedAtMs = 0,
): NativeBackendStartupPreflightStatus => ({
  checkedAtMs,
  errorCode,
  errorMessage: null,
  stage,
  state,
});

test("versioned backend status event stays aligned across contract, Rust, and Web", () => {
  const contract = JSON.parse(
    readFileSync(
      new URL(
        "../../../../../contracts/native-bridge/native-bridge.v1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as {
    events?: Array<{ name?: string; payload?: Record<string, unknown> }>;
  };
  const event = contract.events?.find(
    (candidate) =>
      candidate.name === "zinuto://v1/backend-startup-preflight-status",
  );
  assert.deepEqual(Object.keys(event?.payload ?? {}).sort(), [
    "checkedAtMs",
    "errorCode",
    "errorMessage",
    "stage",
    "state",
  ]);

  const rustSource = [
    "../../../shell/src/runtime/backend_runtime.rs",
    "../../../shell/src/runtime/backend_runtime/preflight.rs",
  ]
    .map((relativePath) =>
      readFileSync(new URL(relativePath, import.meta.url), "utf8"),
    )
    .join("\n");
  const nativeCommandsSource = readFileSync(
    new URL("../../src/api/desktopNativeCommands.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    rustSource,
    /zinuto:\/\/v1\/backend-startup-preflight-status/u,
  );
  assert.match(rustSource, /app\.emit\(BACKEND_STARTUP_PREFLIGHT_STATUS_EVENT_V1/u);
  assert.match(
    nativeCommandsSource,
    /eventModule\.listen<unknown>[\s\S]*BACKEND_STARTUP_PREFLIGHT_STATUS_EVENT_V1/u,
  );
  assert.match(nativeCommandsSource, /createTauriUnlistenCleanup\(unlisten\)/u);
});

test("fatal startup retry requests one native app restart instead of reloading the webview", () => {
  const mainAppSource = readFileSync(
    new URL("../../src/app-shell/mainApp.ts", import.meta.url),
    "utf8",
  );
  const failureStart = mainAppSource.indexOf(
    "const renderBackendStartupFailure",
  );
  const failureEnd = mainAppSource.indexOf("let appRoot", failureStart);
  assert.ok(failureStart >= 0 && failureEnd > failureStart);
  const failureSource = mainAppSource.slice(failureStart, failureEnd);

  assert.match(failureSource, /api\.restartDesktopApp\(\)/u);
  assert.doesNotMatch(failureSource, /location\.reload/u);

  const nativeCommandsSource = readFileSync(
    new URL("../../src/api/desktopNativeCommands.ts", import.meta.url),
    "utf8",
  );
  assert.match(nativeCommandsSource, /restartDesktopApp/u);
  assert.match(nativeCommandsSource, /desktop_app_restart/u);
});

test("native startup gate keeps backend-dependent runtime unmounted until READY", () => {
  let gateState = createNativeBackendStartupGateState(1_000);
  let runtimeMountCount = 0;

  for (const [index, nativeStatus] of [
    status("PENDING", "launch"),
    status("PENDING", "dataUpgrade:core-schema"),
    status("PENDING", "healthProbe"),
  ].entries()) {
    const decision = advanceNativeBackendStartupGate({
      nowMs: 1_001 + index,
      state: gateState,
      status: nativeStatus,
    });
    gateState = decision.state;
    if (decision.kind === "ready") {
      runtimeMountCount += 1;
    }
    assert.equal(decision.kind, "wait");
    assert.equal(runtimeMountCount, 0);
  }

  const readyDecision = advanceNativeBackendStartupGate({
    nowMs: 1_010,
    state: gateState,
    status: status("READY", "ready"),
  });
  if (readyDecision.kind === "ready") {
    runtimeMountCount += 1;
  }

  assert.equal(readyDecision.kind, "ready");
  assert.equal(runtimeMountCount, 1);
});

test("native startup gate retains the longest verified upgrade deadline", () => {
  const startedAtMs = 10_000;
  const marketDecision = advanceNativeBackendStartupGate({
    nowMs: startedAtMs + 1,
    state: createNativeBackendStartupGateState(startedAtMs),
    status: status("PENDING", "dataUpgrade:market-copy"),
  });
  assert.equal(marketDecision.kind, "wait");

  const laterOrdinaryStage = advanceNativeBackendStartupGate({
    nowMs: startedAtMs + 3 * 60 * 1_000,
    state: marketDecision.state,
    status: status("PENDING", "healthProbe"),
  });

  assert.equal(laterOrdinaryStage.kind, "wait");
  assert.equal(
    laterOrdinaryStage.state.allowedStartupMs,
    24 * 60 * 60 * 1_000 + 60_000,
  );
});

test("native startup gate retains reset recovery headroom across shorter upgrade stages", () => {
  const startedAtMs = 20_000;
  const resetRecovery = advanceNativeBackendStartupGate({
    nowMs: startedAtMs + 1,
    state: createNativeBackendStartupGateState(startedAtMs),
    status: status("PENDING", "dataUpgrade:reset-recovery"),
  });
  assert.equal(resetRecovery.kind, "wait");
  assert.equal(resetRecovery.state.allowedStartupMs, 16 * 60 * 1_000);

  const runtimeBootstrap = advanceNativeBackendStartupGate({
    nowMs: startedAtMs + 3 * 60 * 1_000,
    state: resetRecovery.state,
    status: status("PENDING", "dataUpgrade:runtime-bootstrap"),
  });
  assert.equal(runtimeBootstrap.kind, "wait");
  assert.equal(runtimeBootstrap.state.allowedStartupMs, 16 * 60 * 1_000);

  const ordinaryStage = advanceNativeBackendStartupGate({
    nowMs: startedAtMs + 7 * 60 * 1_000,
    state: runtimeBootstrap.state,
    status: status("PENDING", "health"),
  });
  assert.equal(ordinaryStage.kind, "wait");
  assert.equal(ordinaryStage.state.allowedStartupMs, 16 * 60 * 1_000);
});

test("native startup gate covers every shell data-upgrade hard cap", () => {
  for (const [stage, expectedDeadlineMs] of [
    ["dataUpgrade:reset-recovery", 16 * 60 * 1_000],
    ["dataUpgrade:seed-reconcile", 16 * 60 * 1_000],
    ["dataUpgrade:runtime-bootstrap", 6 * 60 * 1_000],
  ] as const) {
    const decision = advanceNativeBackendStartupGate({
      nowMs: 1,
      state: createNativeBackendStartupGateState(0),
      status: status("PENDING", stage),
    });
    assert.equal(decision.kind, "wait");
    assert.equal(decision.state.allowedStartupMs, expectedDeadlineMs);
  }
});

test("native startup gate turns repeated unreadable status into a terminal failure", () => {
  let gateState = createNativeBackendStartupGateState(0);
  let decision = advanceNativeBackendStartupGate({
    nowMs: 1,
    state: gateState,
    status: null,
  });

  for (let index = 1; index < NATIVE_BACKEND_STARTUP_MAX_READ_FAILURES; index += 1) {
    gateState = decision.state;
    decision = advanceNativeBackendStartupGate({
      nowMs: index + 1,
      state: gateState,
      status: null,
    });
  }

  assert.equal(decision.kind, "failed");
  assert.equal(
    decision.kind === "failed" ? decision.failure.errorCode : null,
    "BACKEND_STARTUP_STATUS_UNAVAILABLE",
  );
});

test("native startup gate preserves the native terminal failure code", () => {
  const decision = advanceNativeBackendStartupGate({
    nowMs: 50,
    state: createNativeBackendStartupGateState(0),
    status: status(
      "FAILED",
      "dataUpgrade:core-schema",
      "CORE_SCHEMA_UPGRADE_FAILED",
    ),
  });

  assert.equal(decision.kind, "failed");
  assert.deepEqual(
    decision.kind === "failed" ? decision.failure : null,
    {
      errorCode: "CORE_SCHEMA_UPGRADE_FAILED",
      errorMessage: null,
      stage: "dataUpgrade:core-schema",
    },
  );
});

test("native backend watcher closes the event-before-initial-read race", async () => {
  const order: string[] = [];
  const pendingStages: string[] = [];
  let readyCount = 0;
  const watcher = startNativeBackendStartupStatusWatcher({
    listenStatus: async (handler) => {
      order.push("listen");
      handler(status("READY", "ready", null, 2));
      return () => undefined;
    },
    onFailed: () => assert.fail("must not fail"),
    onPending: (stage) => pendingStages.push(stage),
    onReady: () => {
      readyCount += 1;
    },
    readStatus: async () => {
      order.push("read");
      return status("PENDING", "spawn", null, 1);
    },
  });

  await watcher.initialRead;

  assert.deepEqual(order, ["listen", "read"]);
  assert.deepEqual(pendingStages, []);
  assert.equal(readyCount, 1);
  watcher.dispose();
});

test("native backend watcher transitions READY to one terminal FAILED surface", async () => {
  let emitStatus = (_value: NativeBackendStartupPreflightStatus): void => {
    assert.fail("listener must be installed");
  };
  let unlistenCount = 0;
  const failures: string[] = [];
  const watcher = startNativeBackendStartupStatusWatcher({
    listenStatus: async (handler) => {
      emitStatus = handler;
      return () => {
        unlistenCount += 1;
      };
    },
    onFailed: (failure) => failures.push(failure.errorCode),
    onPending: () => undefined,
    onReady: () => undefined,
    readStatus: async () => status("READY", "ready", null, 10),
  });
  await watcher.initialRead;

  emitStatus(status("PENDING", "health", null, 11));
  assert.deepEqual(failures, []);
  emitStatus(
    status("FAILED", "health", "BACKEND_RUNTIME_EXITED", 12),
  );

  assert.deepEqual(failures, ["BACKEND_RUNTIME_EXITED"]);
  assert.equal(unlistenCount, 1);
  watcher.dispose();
  assert.equal(unlistenCount, 1);
});

test("native backend watcher polls READY to FAILED when listener registration rejects", async () => {
  const readyFallbackPollIntervalMs = 47_000;
  let readCount = 0;
  let readyCount = 0;
  const scheduledPolls: Array<() => void> = [];
  const scheduledDelays: number[] = [];
  const failures: string[] = [];
  let resolveFailure: (() => void) | null = null;
  const failureObserved = new Promise<void>((resolve) => {
    resolveFailure = resolve;
  });
  const watcher = startNativeBackendStartupStatusWatcher({
    listenStatus: async () => {
      throw new Error("LISTENER_REGISTRATION_REJECTED");
    },
    onFailed: (failure) => {
      failures.push(failure.errorCode);
      resolveFailure?.();
    },
    onPending: () => assert.fail("READY fallback must not return to pending"),
    onReady: () => {
      readyCount += 1;
    },
    readStatus: async () => {
      readCount += 1;
      return readCount === 1
        ? status("READY", "ready", null, 40)
        : status("FAILED", "health", "BACKEND_RUNTIME_EXITED", 41);
    },
    readyFallbackPollIntervalMs,
    schedulePoll: (callback, delayMs) => {
      scheduledPolls.push(callback);
      scheduledDelays.push(delayMs);
      return {} as ReturnType<typeof globalThis.setTimeout>;
    },
  });
  await watcher.initialRead;

  assert.equal(readyCount, 1);
  assert.deepEqual(failures, []);
  assert.deepEqual(scheduledDelays, [readyFallbackPollIntervalMs]);
  const [runFallbackPoll] = scheduledPolls;
  assert.ok(runFallbackPoll, "READY fallback poll must remain scheduled");

  runFallbackPoll();
  await failureObserved;

  assert.deepEqual(failures, ["BACKEND_RUNTIME_EXITED"]);
  assert.equal(readCount, 2);
  assert.equal(scheduledDelays.length, 1);
  watcher.dispose();
});

test("native backend watcher deduplicates repeated FAILED events", async () => {
  let emitStatus = (_value: NativeBackendStartupPreflightStatus): void => {
    assert.fail("listener must be installed");
  };
  let failureCount = 0;
  const watcher = startNativeBackendStartupStatusWatcher({
    listenStatus: async (handler) => {
      emitStatus = handler;
      return () => undefined;
    },
    onFailed: () => {
      failureCount += 1;
    },
    onPending: () => undefined,
    onReady: () => undefined,
    readStatus: async () => status("READY", "ready", null, 20),
  });
  await watcher.initialRead;

  emitStatus(status("FAILED", "health", "BACKEND_RUNTIME_EXITED", 21));
  emitStatus(status("FAILED", "health", "BACKEND_RUNTIME_EXITED", 22));

  assert.equal(failureCount, 1);
  watcher.dispose();
});

test("native backend watcher disposal clears polling and native listener", async () => {
  let unlistenCount = 0;
  let cancelPollCount = 0;
  const watcher = startNativeBackendStartupStatusWatcher({
    cancelPoll: (timer) => {
      cancelPollCount += 1;
      globalThis.clearTimeout(timer);
    },
    listenStatus: async () => () => {
      unlistenCount += 1;
    },
    onFailed: () => assert.fail("must not fail"),
    onPending: () => undefined,
    onReady: () => assert.fail("must remain pending"),
    pollIntervalMs: 60_000,
    readStatus: async () => status("PENDING", "health", null, 30),
  });
  await watcher.initialRead;

  watcher.dispose();
  watcher.dispose();

  assert.equal(cancelPollCount, 1);
  assert.equal(unlistenCount, 1);

  const mainAppSource = readFileSync(
    new URL("../../src/app-shell/mainApp.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    mainAppSource,
    /addEventListener\('beforeunload', dispose, \{ once: true \}\)/u,
  );
  assert.match(mainAppSource, /watcher\.dispose\(\)/u);
});
