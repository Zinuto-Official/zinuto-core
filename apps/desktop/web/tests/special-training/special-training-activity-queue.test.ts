// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";
import { createSpecialTrainingActivityQueue } from "../../src/workspaces/special-training/session/specialTrainingActivityQueue";

type ActivityResult = {
  challengeId: string;
  paused: boolean;
};

type Deferred<Result> = {
  promise: Promise<Result>;
  resolve: (result: Result) => void;
};

const createDeferred = <Result,>(): Deferred<Result> => {
  let resolve!: (result: Result) => void;
  const promise = new Promise<Result>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test("activity requests are serialized and only the latest visibility result applies", async () => {
  const calls: Array<{ challengeId: string; paused: boolean }> = [];
  const deferredRequests: Deferred<ActivityResult>[] = [];
  const queue = createSpecialTrainingActivityQueue<ActivityResult>(
    (challengeId, paused) => {
      calls.push({ challengeId, paused });
      const deferred = createDeferred<ActivityResult>();
      deferredRequests.push(deferred);
      return deferred.promise;
    },
  );

  const active = queue.scheduleActivity("challenge-1", false);
  const paused = queue.scheduleActivity("challenge-1", true);
  const resumed = queue.scheduleActivity("challenge-1", false);
  await flushMicrotasks();
  assert.deepEqual(calls, [{ challengeId: "challenge-1", paused: false }]);

  deferredRequests[0]?.resolve({ challengeId: "challenge-1", paused: false });
  assert.equal(await active.completion, null);
  await flushMicrotasks();
  assert.deepEqual(calls, [
    { challengeId: "challenge-1", paused: false },
    { challengeId: "challenge-1", paused: true },
  ]);

  deferredRequests[1]?.resolve({ challengeId: "challenge-1", paused: true });
  assert.equal(await paused.completion, null);
  await flushMicrotasks();
  assert.deepEqual(calls, [
    { challengeId: "challenge-1", paused: false },
    { challengeId: "challenge-1", paused: true },
    { challengeId: "challenge-1", paused: false },
  ]);

  const finalResult = { challengeId: "challenge-1", paused: false };
  deferredRequests[2]?.resolve(finalResult);
  assert.deepEqual(await resumed.completion, finalResult);
});

test("repeated pause requests are idempotent while the request is pending", async () => {
  const deferred = createDeferred<ActivityResult>();
  let requestCount = 0;
  const queue = createSpecialTrainingActivityQueue<ActivityResult>(
    async () => {
      requestCount += 1;
      return deferred.promise;
    },
  );

  const first = queue.scheduleActivity("challenge-2", true);
  const repeated = queue.scheduleActivity("challenge-2", true);
  assert.equal(first.scheduled, true);
  assert.equal(repeated.scheduled, false);
  await flushMicrotasks();
  assert.equal(requestCount, 1);

  deferred.resolve({ challengeId: "challenge-2", paused: true });
  assert.deepEqual(await first.completion, {
    challengeId: "challenge-2",
    paused: true,
  });
});
