// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";
import {
  createDesktopSecondaryWindowStateEmitter,
  createDesktopSecondaryWindowStateStore,
  isDesktopSecondaryWindowActionIdentityCurrent,
  shouldAcceptDesktopSecondaryWindowState,
} from "../../src/frontend-kernel/secondary-windows/desktopSecondaryWindowManagerModel.js";
import { doesDesktopSecondaryWindowActionAckMatchRequest } from "../../src/frontend-kernel/secondary-windows/desktopSecondaryWindowActionAck.js";

const createDeferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

test("deferred open A cannot overwrite a newer B intent or perform A effects", async () => {
  const instanceIds = ["instance-a"];
  const store = createDesktopSecondaryWindowStateStore<"DETAIL">({
    createInstanceId: () => instanceIds.shift() ?? "unexpected-instance",
  });
  const aIntent = store.beginOpen("DETAIL");
  const a = store.publishForIntent(aIntent, {
    title: "A",
    payload: { value: "A" },
  });
  assert.ok(a);

  const listenerGate = createDeferred();
  let aWindowEffects = 0;
  let windowPayload: unknown = null;
  let callerRevision = 0;
  const deferredA = listenerGate.promise.then(() => {
    if (store.isCurrentIntent(aIntent)) {
      aWindowEffects += 1;
    }
    const current = store.get("DETAIL");
    windowPayload = current?.payload ?? null;
    callerRevision = Math.max(callerRevision, current?.revision ?? 0);
  });

  const b = store.publish({
    kind: "DETAIL",
    title: "B",
    payload: { value: "B" },
  });
  listenerGate.resolve();
  await deferredA;

  assert.equal(store.get("DETAIL"), b);
  assert.deepEqual(store.get("DETAIL")?.payload, { value: "B" });
  assert.deepEqual(windowPayload, { value: "B" });
  assert.equal(callerRevision, b.revision);
  assert.equal(aWindowEffects, 0);
});

test("state emission is serialized and stale queued state is skipped", async () => {
  const store = createDesktopSecondaryWindowStateStore<"DETAIL">({
    createInstanceId: () => "instance-a",
  });
  const emitted: string[] = [];
  const firstEmitGate = createDeferred();
  const firstEmitStarted = createDeferred();
  const emit = createDesktopSecondaryWindowStateEmitter<"DETAIL", unknown>({
    isCurrent: (state) => store.isCurrentState(state),
    emit: async (state) => {
      emitted.push(`start:${state.title}`);
      if (state.title === "A") {
        firstEmitStarted.resolve();
        await firstEmitGate.promise;
      }
      emitted.push(`end:${state.title}`);
    },
  });
  const a = store.publish({ kind: "DETAIL", title: "A" });
  const emitA = emit(a);
  await firstEmitStarted.promise;
  const b = store.publish({ kind: "DETAIL", title: "B" });
  const emitB = emit(b);
  firstEmitGate.resolve();
  await Promise.all([emitA, emitB]);

  assert.deepEqual(emitted, ["start:A", "end:A", "start:B", "end:B"]);

  const c = store.publish({ kind: "DETAIL", title: "C" });
  const d = store.publish({ kind: "DETAIL", title: "D" });
  await Promise.all([emit(c), emit(d)]);
  assert.deepEqual(emitted.slice(-2), ["start:D", "end:D"]);
});

test("actions fail closed for missing, zero, mismatched, or malformed identity", () => {
  const store = createDesktopSecondaryWindowStateStore<"DETAIL">({
    createInstanceId: () => "instance-a",
  });
  const state = store.publish({ kind: "DETAIL", title: "A" });
  const exact = {
    kind: "DETAIL",
    action: "CONFIRM",
    instanceId: state.instanceId,
    stateRevision: state.revision,
    requestId: "request-a",
  };

  assert.equal(isDesktopSecondaryWindowActionIdentityCurrent(exact, state), true);
  assert.equal(
    isDesktopSecondaryWindowActionIdentityCurrent(
      { ...exact, stateRevision: undefined },
      state,
    ),
    false,
  );
  assert.equal(
    isDesktopSecondaryWindowActionIdentityCurrent(
      { ...exact, stateRevision: 0 },
      state,
    ),
    false,
  );
  assert.equal(
    isDesktopSecondaryWindowActionIdentityCurrent(
      { ...exact, stateRevision: state.revision + 1 },
      state,
    ),
    false,
  );
  assert.equal(
    isDesktopSecondaryWindowActionIdentityCurrent(
      { ...exact, instanceId: "instance-b" },
      state,
    ),
    false,
  );
  assert.equal(
    isDesktopSecondaryWindowActionIdentityCurrent(
      { ...exact, requestId: "" },
      state,
    ),
    false,
  );
});

test("A close cannot clear B and A confirm remains rejected after B opens", () => {
  const instanceIds = ["instance-a", "instance-b"];
  const store = createDesktopSecondaryWindowStateStore<"DETAIL">({
    createInstanceId: () => instanceIds.shift() ?? "unexpected-instance",
  });
  const aIntent = store.beginOpen("DETAIL");
  const a = store.publishForIntent(aIntent, { title: "A" });
  assert.ok(a);
  const aConfirm = {
    kind: "DETAIL",
    action: "CONFIRM",
    instanceId: a.instanceId,
    stateRevision: a.revision,
    requestId: "request-a",
  };

  const bIntent = store.beginOpen("DETAIL");
  const b = store.publishForIntent(bIntent, { title: "B" });
  assert.ok(b);
  assert.equal(store.forget("DETAIL", a.instanceId), false);
  assert.equal(store.get("DETAIL"), b);
  assert.equal(isDesktopSecondaryWindowActionIdentityCurrent(aConfirm, b), false);
});

test("an ACK from another window instance cannot confirm the request", () => {
  const request = {
    kind: "DETAIL",
    action: "CONFIRM",
    instanceId: "instance-b",
    stateRevision: 2,
    requestId: "request-b",
  };
  const ack = {
    ...request,
    instanceId: "instance-a",
    status: "ACCEPTED" as const,
    code: "ACTION_ACCEPTED" as const,
  };
  assert.equal(doesDesktopSecondaryWindowActionAckMatchRequest(ack, request), false);
  assert.equal(
    doesDesktopSecondaryWindowActionAckMatchRequest(
      { ...ack, instanceId: request.instanceId },
      request,
    ),
    true,
  );
});

test("child state accepts only a valid strictly newer revision", () => {
  const store = createDesktopSecondaryWindowStateStore<"DETAIL">({
    createInstanceId: () => "instance-a",
  });
  const a = store.publish({ kind: "DETAIL", title: "A" });
  const b = store.publish({ kind: "DETAIL", title: "B" });

  assert.equal(shouldAcceptDesktopSecondaryWindowState(null, a), true);
  assert.equal(shouldAcceptDesktopSecondaryWindowState(a, a), false);
  assert.equal(shouldAcceptDesktopSecondaryWindowState(b, a), false);
  assert.equal(shouldAcceptDesktopSecondaryWindowState(a, b), true);
});
