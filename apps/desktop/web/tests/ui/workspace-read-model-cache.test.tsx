// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type {
  ApiRequester,
  ApiRequesterOptions,
} from "../../src/api/requesterTypes";
import {
  beginWorkspaceReadModelMutation,
  createWorkspaceReadModelsApi,
  finishWorkspaceReadModelMutation,
  invalidateWorkspaceReadModelCache,
  type ApiDesktopWorkspaceReadModel,
} from "../../src/api/workspaces";

const makeReadModel = (id: string): ApiDesktopWorkspaceReadModel =>
  ({
    workspaceId: id,
    statusCode: "READY",
    reasonCode: null,
    facts: {},
    actions: [],
  }) as unknown as ApiDesktopWorkspaceReadModel;

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

test("workspace warmup and an abortable page consumer share one request", async () => {
  invalidateWorkspaceReadModelCache();
  let requestCount = 0;
  let sharedRequestSignal: AbortSignal | null | undefined;
  const deferred = createDeferred<ApiDesktopWorkspaceReadModel>();
  const request: ApiRequester = <T,>(
    _path: string,
    init?: ApiRequesterOptions,
  ) => {
    requestCount += 1;
    sharedRequestSignal = init?.signal;
    return deferred.promise as Promise<T>;
  };
  const workspaceApi = createWorkspaceReadModelsApi(request);
  const warmup = workspaceApi.getWorkspaceReadModel("command-center");
  const controller = new AbortController();
  const pageRead = workspaceApi.getWorkspaceReadModel("command-center", {
    signal: controller.signal,
  });

  assert.equal(requestCount, 1);
  assert.ok(sharedRequestSignal instanceof AbortSignal);
  assert.notEqual(sharedRequestSignal, controller.signal);
  const model = makeReadModel("command-center");
  deferred.resolve(model);
  assert.equal(await warmup, model);
  assert.equal(await pageRead, model);
  invalidateWorkspaceReadModelCache();
});

test("aborting one workspace consumer does not cancel the shared request", async () => {
  invalidateWorkspaceReadModelCache();
  const deferred = createDeferred<ApiDesktopWorkspaceReadModel>();
  const request: ApiRequester = <T,>() => deferred.promise as Promise<T>;
  const workspaceApi = createWorkspaceReadModelsApi(request);
  const controller = new AbortController();
  const abortableRead = workspaceApi.getWorkspaceReadModel("settings", {
    signal: controller.signal,
  });
  const survivingRead = workspaceApi.getWorkspaceReadModel("settings");

  controller.abort();
  await assert.rejects(abortableRead, (error: unknown) => {
    assert.equal((error as Error).name, "AbortError");
    return true;
  });
  const model = makeReadModel("settings");
  deferred.resolve(model);
  assert.equal(await survivingRead, model);
  invalidateWorkspaceReadModelCache();
});

test("workspace read models use a short cache and explicit invalidation", async () => {
  invalidateWorkspaceReadModelCache();
  let requestCount = 0;
  const request: ApiRequester = async <T,>() => {
    requestCount += 1;
    return makeReadModel(`settings-${requestCount}`) as T;
  };
  const workspaceApi = createWorkspaceReadModelsApi(request);

  const first = await workspaceApi.getWorkspaceReadModel("settings");
  const cached = await workspaceApi.getWorkspaceReadModel("settings");
  assert.equal(cached, first);
  assert.equal(requestCount, 1);
  invalidateWorkspaceReadModelCache();
  const refreshed = await workspaceApi.getWorkspaceReadModel("settings");
  assert.notEqual(refreshed, first);
  assert.equal(requestCount, 2);
  invalidateWorkspaceReadModelCache();
});

test("a forced workspace refresh bypasses a still-valid cached response", async () => {
  invalidateWorkspaceReadModelCache();
  let requestCount = 0;
  const request: ApiRequester = async <T,>() => {
    requestCount += 1;
    return makeReadModel(`settings-${requestCount}`) as T;
  };
  const workspaceApi = createWorkspaceReadModelsApi(request);

  const initial = await workspaceApi.getWorkspaceReadModel("settings");
  const refreshed = await workspaceApi.getWorkspaceReadModel("settings", {
    forceRefresh: true,
  });

  assert.notEqual(refreshed, initial);
  assert.equal(requestCount, 2);
  invalidateWorkspaceReadModelCache();
});

test("a forced workspace refresh supersedes an older in-flight request", async () => {
  invalidateWorkspaceReadModelCache();
  const requests = [
    createDeferred<ApiDesktopWorkspaceReadModel>(),
    createDeferred<ApiDesktopWorkspaceReadModel>(),
  ];
  const requestSignals: AbortSignal[] = [];
  let requestCount = 0;
  const request: ApiRequester = <T,>(
    _path: string,
    options?: ApiRequesterOptions,
  ) => {
    const deferred = requests[requestCount];
    requestCount += 1;
    assert.ok(deferred);
    assert.ok(options?.signal);
    requestSignals.push(options.signal);
    return deferred.promise as Promise<T>;
  };
  const workspaceApi = createWorkspaceReadModelsApi(request);

  const staleRead = workspaceApi.getWorkspaceReadModel("settings");
  const freshRead = workspaceApi.getWorkspaceReadModel("settings", {
    forceRefresh: true,
  });
  assert.equal(requestCount, 2);
  assert.equal(requestSignals[0]?.aborted, true);
  const freshModel = makeReadModel("settings-fresh");
  requests[1]?.resolve(freshModel);
  assert.equal(await freshRead, freshModel);
  requests[0]?.resolve(makeReadModel("settings-stale"));
  assert.equal(await staleRead, freshModel);
  invalidateWorkspaceReadModelCache();
});

test("a read invalidated by a mutation never delivers its stale response", async () => {
  invalidateWorkspaceReadModelCache();
  const requests = [
    createDeferred<ApiDesktopWorkspaceReadModel>(),
    createDeferred<ApiDesktopWorkspaceReadModel>(),
  ];
  let requestCount = 0;
  const request: ApiRequester = <T,>(
    _path: string,
    options?: ApiRequesterOptions,
  ) => {
    const deferred = requests[requestCount];
    requestCount += 1;
    assert.ok(deferred);
    options?.signal?.addEventListener(
      "abort",
      () => deferred.resolve(makeReadModel("settings-aborted")),
      { once: true },
    );
    return deferred.promise as Promise<T>;
  };
  const workspaceApi = createWorkspaceReadModelsApi(request);

  const staleConsumer = workspaceApi.getWorkspaceReadModel("settings");
  invalidateWorkspaceReadModelCache();
  const freshConsumer = workspaceApi.getWorkspaceReadModel("settings");
  const freshModel = makeReadModel("settings-fresh");
  requests[1]?.resolve(freshModel);
  assert.equal(await freshConsumer, freshModel);
  assert.equal(await staleConsumer, freshModel);

  requests[0]?.resolve(makeReadModel("settings-stale"));
  assert.equal(requestCount, 2);
  invalidateWorkspaceReadModelCache();
});

test("invalidated workspace consumers converge on one generation-owned fresh request", async () => {
  invalidateWorkspaceReadModelCache();
  const requests = [
    createDeferred<ApiDesktopWorkspaceReadModel>(),
    createDeferred<ApiDesktopWorkspaceReadModel>(),
  ];
  let requestCount = 0;
  const request: ApiRequester = <T,>(
    _path: string,
    options?: ApiRequesterOptions,
  ) => {
    const requestIndex = requestCount;
    const deferred = requests[requestIndex];
    requestCount += 1;
    assert.ok(deferred);
    options?.signal?.addEventListener(
      "abort",
      () => deferred.resolve(makeReadModel("settings-aborted")),
      { once: true },
    );
    return deferred.promise as Promise<T>;
  };
  const workspaceApi = createWorkspaceReadModelsApi(request);
  const consumers = [
    workspaceApi.getWorkspaceReadModel("settings"),
    workspaceApi.getWorkspaceReadModel("settings"),
    workspaceApi.getWorkspaceReadModel("settings"),
  ];
  assert.equal(requestCount, 1);

  const firstLease = beginWorkspaceReadModelMutation(
    "/api/v1/system/app-preferences/ui-settings",
  );
  const secondLease = beginWorkspaceReadModelMutation(
    "/api/v1/system/app-preferences/data-pool-removed-symbols",
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(requestCount, 1);
  finishWorkspaceReadModelMutation(firstLease);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(requestCount, 1);
  finishWorkspaceReadModelMutation(secondLease);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(requestCount, 2);

  const freshModel = makeReadModel("settings-fresh");
  requests[1]?.resolve(freshModel);
  assert.deepEqual(await Promise.all(consumers), [
    freshModel,
    freshModel,
    freshModel,
  ]);
  assert.equal(requestCount, 2);
  invalidateWorkspaceReadModelCache();
});

test("filtered workspace reads bypass navigation cache and preserve cancellation", async () => {
  invalidateWorkspaceReadModelCache();
  const controller = new AbortController();
  const requestOptions: ApiRequesterOptions[] = [];
  const request: ApiRequester = async <T,>(
    _path: string,
    options?: ApiRequesterOptions,
  ) => {
    requestOptions.push(options ?? {});
    return makeReadModel("notes") as T;
  };
  const workspaceApi = createWorkspaceReadModelsApi(request);

  await workspaceApi.getWorkspaceReadModel("notes", {
    query: { keyword: "risk" },
    signal: controller.signal,
  });
  await workspaceApi.getWorkspaceReadModel("notes", {
    query: { keyword: "risk" },
    signal: controller.signal,
  });

  assert.equal(requestOptions.length, 2);
  assert.equal(requestOptions[0]?.signal, controller.signal);
  assert.equal(requestOptions[1]?.signal, controller.signal);
  invalidateWorkspaceReadModelCache();
});

test("mutations use resource-scoped invalidation without global GET serialization", () => {
  const backendRequestSource = readFileSync(
    new URL("../../src/api/backendRequest.ts", import.meta.url),
    "utf8",
  );
  const mutationBranch = backendRequestSource.match(
    /if \(endpointEffect\.effect === "write"\) \{[\s\S]*?\n    \}/,
  )?.[0] ?? "";
  assert.ok(mutationBranch);
  assert.match(mutationBranch, /beginBackendMutation\(endpointEffect\)/);
  assert.match(mutationBranch, /finishBackendMutation\(mutationLease\)/);
  assert.match(backendRequestSource, /BACKEND_ENDPOINT_EFFECTS/);
  assert.match(backendRequestSource, /Unclassified backend endpoint effect/);
  assert.doesNotMatch(backendRequestSource, /resolveBackendMutationScopes/);
  assert.match(backendRequestSource, /BackendGetScopeState/);
  assert.doesNotMatch(backendRequestSource, /activeBackendMutationCount/);
  assert.match(backendRequestSource, /awaitWithAbortSignal/);
  assert.doesNotMatch(backendRequestSource, /return request<T>\(path, init\)/);
});

test("backend invalidation suppresses affected stale reads without blocking unrelated GETs", async () => {
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "window",
  );
  const firstAffectedRead = createDeferred<{
    status: number;
    body: string;
  }>();
  const mutation = createDeferred<{
    status: number;
    body: string;
  }>();
  let affectedReadCount = 0;
  let unrelatedReadCount = 0;
  const okResponse = (data: unknown) => ({
    status: 200,
    body: JSON.stringify({ ok: true, data }),
  });
  const runtimeWindow = {
    __TAURI_INTERNALS__: {
      invoke: async (_command: string, args: Record<string, unknown>) => {
        if (args.cancelRequestId) {
          return {};
        }
        const path = String(args.path ?? "");
        const method = String(args.method ?? "GET");
        if (method === "PUT") {
          return mutation.promise;
        }
        if (path === "/api/v1/system/app-preferences") {
          affectedReadCount += 1;
          return affectedReadCount === 1
            ? firstAffectedRead.promise
            : okResponse({ version: "fresh" });
        }
        if (path === "/api/v1/market/instruments") {
          unrelatedReadCount += 1;
          return okResponse({ version: "unrelated" });
        }
        throw new Error(`Unexpected bridge request: ${method} ${path}`);
      },
    },
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: runtimeWindow,
    writable: true,
  });

  try {
    const { request } = await import("../../src/api/backendRequest");
    const affectedRead = request<{ version: string }>(
      "/api/v1/system/app-preferences",
      { timeoutMs: 1_000 },
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    const mutationRequest = request<{ done: boolean }>(
      "/api/v1/system/app-preferences/ui-settings",
      { method: "PUT", body: "{}", timeoutMs: 1_000 },
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    const unrelated = await request<{ version: string }>(
      "/api/v1/market/instruments",
      { timeoutMs: 100 },
    );
    assert.equal(unrelated.version, "unrelated");
    assert.equal(unrelatedReadCount, 1);
    assert.equal(affectedReadCount, 1);

    mutation.resolve(okResponse({ done: true }));
    await mutationRequest;
    assert.equal((await affectedRead).version, "fresh");
    assert.equal(affectedReadCount, 2);

    firstAffectedRead.resolve(okResponse({ version: "stale" }));
  } finally {
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

test("one hundred read-only order quotes do not advance or abort the training read generation", async () => {
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "window",
  );
  const trainingRead = createDeferred<{ status: number; body: string }>();
  let trainingReadCount = 0;
  let quoteCount = 0;
  let cancelCount = 0;
  const runtimeWindow = {
    __TAURI_INTERNALS__: {
      invoke: async (_command: string, args: Record<string, unknown>) => {
        if (args.cancelRequestId) {
          cancelCount += 1;
          return {};
        }
        const path = String(args.path ?? "");
        const method = String(args.method ?? "GET");
        if (method === "GET" && path === "/api/v1/training/projects") {
          trainingReadCount += 1;
          return trainingRead.promise;
        }
        if (
          method === "POST"
          && path === "/api/v1/training/free-replay/sessions/session-1/order/quote"
        ) {
          quoteCount += 1;
          return {
            status: 200,
            body: JSON.stringify({ ok: true, data: { quote: quoteCount } }),
          };
        }
        throw new Error(`Unexpected bridge request: ${method} ${path}`);
      },
    },
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: runtimeWindow,
    writable: true,
  });

  try {
    const { request } = await import("../../src/api/backendRequest");
    const pendingTrainingRead = request<{ version: string }>(
      "/api/v1/training/projects",
      { timeoutMs: 2_000 },
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    await Promise.all(
      Array.from({ length: 100 }, () =>
        request<{ quote: number }>(
          "/api/v1/training/free-replay/sessions/session-1/order/quote",
          { method: "POST", body: "{}", timeoutMs: 1_000 },
        ),
      ),
    );
    assert.equal(quoteCount, 100);
    assert.equal(trainingReadCount, 1);
    assert.equal(cancelCount, 0);

    trainingRead.resolve({
      status: 200,
      body: JSON.stringify({ ok: true, data: { version: "same-generation" } }),
    });
    assert.equal((await pendingTrainingRead).version, "same-generation");
    assert.equal(trainingReadCount, 1);
  } finally {
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

test("an unclassified endpoint fails before any bridge side effect", async () => {
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "window",
  );
  let bridgeInvocations = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      __TAURI_INTERNALS__: {
        invoke: async () => {
          bridgeInvocations += 1;
          return { status: 200, body: '{"ok":true,"data":{}}' };
        },
      },
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      setTimeout: globalThis.setTimeout.bind(globalThis),
    },
    writable: true,
  });

  try {
    const { request } = await import("../../src/api/backendRequest");
    await assert.rejects(
      request("/api/v1/not-in-the-contract", { method: "POST", body: "{}" }),
      /Unclassified backend endpoint effect: POST \/api\/v1\/not-in-the-contract/u,
    );
    assert.equal(bridgeInvocations, 0);
  } finally {
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});
