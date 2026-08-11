// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { canSubmitFastDecision } from "../../src/workspaces/special-training/domain/fastDecisionSubmitGate";

const createDeferred = <T = void>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
};

const flushMicrotasks = () => new Promise<void>((resolve) => setImmediate(resolve));

const baseGateInput = () => ({
  hasQuestionBars: true,
  hasResult: false,
  hasPendingResult: false,
  phase: "THINKING",
  submitInFlight: false,
});

test("gate blocks submission while a decision POST is in flight", async () => {
  let inFlight = false;
  const post = createDeferred<void>();
  let submitCount = 0;

  const tick = () => {
    if (!canSubmitFastDecision({ ...baseGateInput(), submitInFlight: inFlight })) {
      return;
    }
    inFlight = true;
    submitCount += 1;
    void post.promise.finally(() => {
      inFlight = false;
    });
  };

  tick();
  tick();
  assert.equal(submitCount, 1, "slow response must not allow a second POST");
  post.resolve();
  await flushMicrotasks();
  assert.equal(inFlight, false);
  assert.equal(submitCount, 1);
});

test("gate allows retry on the next tick after a rejected POST", async () => {
  let inFlight = false;
  let submitCount = 0;

  const tick = async () => {
    if (!canSubmitFastDecision({ ...baseGateInput(), submitInFlight: inFlight })) {
      return;
    }
    inFlight = true;
    try {
      await Promise.reject(new Error("POST rejected"));
    } catch {
      // The rejected POST surfaces as an error message; the finally below
      // resets the in-flight flag so the next tick can retry.
    } finally {
      inFlight = false;
    }
    submitCount += 1;
  };

  await tick();
  await tick();
  assert.equal(submitCount, 2, "POST error must clear the in-flight flag for the next tick");
});

test("gate stays blocked while pendingFastDecisionResultRef is set", () => {
  assert.equal(
    canSubmitFastDecision({
      ...baseGateInput(),
      hasPendingResult: true,
    }),
    false,
  );
  assert.equal(
    canSubmitFastDecision({
      ...baseGateInput(),
      hasResult: true,
    }),
    false,
  );
  assert.equal(
    canSubmitFastDecision({
      ...baseGateInput(),
      phase: "REVEALING",
    }),
    false,
  );
  assert.equal(
    canSubmitFastDecision({
      ...baseGateInput(),
      hasQuestionBars: false,
    }),
    false,
  );
});
