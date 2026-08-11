// SPDX-License-Identifier: GPL-3.0-only

import type { ApiResponse } from "@/domains/training/types";
import type { ApiRequester, ApiRequesterOptions } from "@/api/requesterTypes";
import { tt } from "@/frontend-kernel/i18n/messageRuntime";
import { createApiError } from "@/api/error";
import { toBackendErrorMessage } from "@/api/backendErrorMessage";
import {
  resolveTauriBridgeRetryDelayMs,
  shouldRetryTauriBridgeRequest,
} from "@/api/requestRetry";
import {
  resolveApiInFlightGetCoalescingKey,
  resolveApiGetResponseCacheTtlMs,
  trimApiInFlightGetCoalescingMap,
} from "@/api/requestCoalescing";
import {
  invokeBackendBridge,
  isTauriRuntime,
  type BackendBridgeResponse,
} from "@/api/desktopNativeBridge";
import {
  isPlainRecord,
  readBridgeCommandErrorArgs,
  readBridgeCommandErrorCode,
  readTrimmedText,
} from "@/api/bridgeCommandErrors";
import { recordTrainerHotInteractionMetric } from "@/domains/trainer/trainerPerfTrace";
import {
  beginWorkspaceReadModelMutationForIds,
  finishWorkspaceReadModelMutation,
  resolveWorkspaceReadModelIdFromPath,
  type WorkspaceReadModelMutationLease,
} from "@/api/workspaces";
import { BACKEND_ENDPOINT_EFFECTS } from "@/api/backendEndpointEffects.generated";

type RequestOptions = ApiRequesterOptions;

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
type BackendGetScopeState = {
  abortController: AbortController;
  activeMutationCount: number;
  generation: number;
  invalidated: Promise<void>;
  lastUsedAtMs: number;
  mutationsSettled: Promise<void>;
  resolveInvalidated: () => void;
  resolveMutationsSettled: () => void;
};

type BackendMutationLease = {
  scopes: string[];
  workspace: WorkspaceReadModelMutationLease;
};

const GLOBAL_BACKEND_GET_SCOPE = "*";
const BACKEND_GET_SCOPE_TTL_MS = 10 * 60 * 1000;
const BACKEND_GET_SCOPE_SWEEP_INTERVAL_MS = 2 * 60 * 1000;
const inFlightCoalescedGetRequests = new Map<
  string,
  { scope: string; task: Promise<unknown> }
>();
const cachedGetResponses = new Map<
  string,
  {
    expiresAtMs: number;
    scope: string;
    value: unknown;
  }
>();
const backendGetScopeStates = new Map<string, BackendGetScopeState>();

const createBackendGetScopeState = (): BackendGetScopeState => {
  let resolveInvalidated: () => void = () => undefined;
  const invalidated = new Promise<void>((resolve) => {
    resolveInvalidated = resolve;
  });
  return {
    abortController: new AbortController(),
    activeMutationCount: 0,
    generation: 0,
    invalidated,
    lastUsedAtMs: Date.now(),
    mutationsSettled: Promise.resolve(),
    resolveInvalidated,
    resolveMutationsSettled: () => undefined,
  };
};

const sweepStaleBackendGetScopeStates = (): void => {
  const now = Date.now();
  backendGetScopeStates.forEach((state, scope) => {
    if (
      state.activeMutationCount === 0 &&
      now - state.lastUsedAtMs >= BACKEND_GET_SCOPE_TTL_MS
    ) {
      backendGetScopeStates.delete(scope);
    }
  });
};

let backendGetScopeSweepTimerId: number | null = null;

const ensureBackendGetScopeSweepTimer = (): void => {
  if (
    backendGetScopeSweepTimerId !== null ||
    typeof window === "undefined" ||
    typeof window.setInterval !== "function"
  ) {
    return;
  }
  backendGetScopeSweepTimerId = window.setInterval(
    sweepStaleBackendGetScopeStates,
    BACKEND_GET_SCOPE_SWEEP_INTERVAL_MS,
  );
};

const getBackendGetScopeState = (scope: string): BackendGetScopeState => {
  let state = backendGetScopeStates.get(scope);
  if (!state) {
    state = createBackendGetScopeState();
    backendGetScopeStates.set(scope, state);
  }
  state.lastUsedAtMs = Date.now();
  ensureBackendGetScopeSweepTimer();
  if (backendGetScopeStates.size >= 32) {
    sweepStaleBackendGetScopeStates();
  }
  return state;
};

const normalizeBackendPathname = (path: string): string =>
  String(path || "").trim().split("?")[0] ?? "";

const escapeEndpointPattern = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const endpointEffectMatchers = BACKEND_ENDPOINT_EFFECTS.map((entry) => ({
  ...entry,
  pattern: new RegExp(`^${escapeEndpointPattern(entry.path).replace(/\\\{[^/{}]+\\\}/gu, "[^/?]+")}$`, "u"),
}));

const resolveBackendEndpointEffect = (method: string, path: string) => {
  const pathname = normalizeBackendPathname(path);
  const normalizedMethod = method.trim().toUpperCase();
  const effect = endpointEffectMatchers.find(
    (entry) => entry.method === normalizedMethod && entry.pattern.test(pathname),
  );
  if (!effect) {
    throw new Error(`Unclassified backend endpoint effect: ${normalizedMethod} ${pathname}`);
  }
  return effect;
};

const resolveBackendGetScope = (path: string): string => {
  const workspaceId = resolveWorkspaceReadModelIdFromPath(path);
  if (workspaceId) {
    return `workspace:${workspaceId}`;
  }
  const pathname = normalizeBackendPathname(path);
  const segments = pathname.split("/").filter(Boolean);
  if (segments[2] === "system" && segments[3] === "app-preferences") {
    return "system:app-preferences";
  }
  if (segments[2] === "system" && segments[3] === "history-retention") {
    return "system:history-retention";
  }
  if (segments[2] === "system" && segments[3]) {
    return `system:${segments[3]}`;
  }
  return segments[2] ? `resource:${segments[2]}` : `path:${pathname}`;
};

const invalidateBackendGetScope = (scope: string): void => {
  const state = getBackendGetScopeState(scope);
  state.generation += 1;
  state.resolveInvalidated();
  state.abortController.abort();
  state.abortController = new AbortController();
  state.invalidated = new Promise<void>((resolve) => {
    state.resolveInvalidated = resolve;
  });
  inFlightCoalescedGetRequests.forEach((entry, cacheKey) => {
    if (scope === GLOBAL_BACKEND_GET_SCOPE || entry.scope === scope) {
      inFlightCoalescedGetRequests.delete(cacheKey);
    }
  });
  cachedGetResponses.forEach((entry, cacheKey) => {
    if (scope === GLOBAL_BACKEND_GET_SCOPE || entry.scope === scope) {
      cachedGetResponses.delete(cacheKey);
    }
  });
};

const beginBackendMutation = (
  effect: (typeof endpointEffectMatchers)[number],
): BackendMutationLease => {
  const scopes = [...effect.invalidationScopes];
  scopes.forEach((scope) => {
    const state = getBackendGetScopeState(scope);
    if (state.activeMutationCount === 0) {
      state.mutationsSettled = new Promise<void>((resolve) => {
        state.resolveMutationsSettled = resolve;
      });
    }
    state.activeMutationCount += 1;
    invalidateBackendGetScope(scope);
  });
  return {
    scopes,
    workspace: beginWorkspaceReadModelMutationForIds(effect.workspaceIds),
  };
};

const finishBackendMutation = (lease: BackendMutationLease): void => {
  lease.scopes.forEach((scope) => {
    const state = getBackendGetScopeState(scope);
    invalidateBackendGetScope(scope);
    state.activeMutationCount = Math.max(0, state.activeMutationCount - 1);
    if (state.activeMutationCount === 0) {
      state.resolveMutationsSettled();
      state.resolveMutationsSettled = () => undefined;
    }
  });
  finishWorkspaceReadModelMutation(lease.workspace);
};

const createMergedAbortSignal = (
  signals: Array<AbortSignal | null | undefined>,
): { signal?: AbortSignal; cleanup: () => void } => {
  const available = signals.filter((signal): signal is AbortSignal =>
    Boolean(signal),
  );
  if (!available.length) {
    return {
      signal: undefined,
      cleanup: () => undefined,
    };
  }
  const mergedController = new AbortController();
  const onAbort = () => {
    if (!mergedController.signal.aborted) {
      mergedController.abort();
    }
  };
  available.forEach((signal) => {
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
  return {
    signal: mergedController.signal,
    cleanup: () => {
      available.forEach((signal) =>
        signal.removeEventListener("abort", onAbort),
      );
    },
  };
};

const awaitWithAbortSignal = async <T,>(
  task: Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  if (!signal) {
    return task;
  }
  if (signal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    task.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
};

const normalizeRequestHeaders = (
  headers?: HeadersInit,
): Record<string, string> => {
  if (!headers) {
    return {};
  }
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  if (Array.isArray(headers)) {
    const result: Record<string, string> = {};
    headers.forEach(([key, value]) => {
      if (!key) {
        return;
      }
      result[String(key)] = String(value);
    });
    return result;
  }
  const result: Record<string, string> = {};
  Object.entries(headers).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    result[String(key)] = String(value);
  });
  return result;
};

const hasHeaderIgnoreCase = (
  headers: Record<string, string>,
  headerName: string,
): boolean => {
  const target = headerName.trim().toLowerCase();
  return Object.keys(headers).some(
    (key) => key.trim().toLowerCase() === target,
  );
};

type BridgeApiEnvelopeParseResult<T> = {
  statusCode: number;
  payload: ApiResponse<T> | null;
  errorCode?: string;
  errorArgs?: Record<string, unknown>;
};

const BACKEND_HTTP_RESPONSE_INVALID_ERROR_CODE =
  "BACKEND_HTTP_RESPONSE_INVALID";

const nowApiPerfMs = (): number =>
  typeof performance === "undefined" ? Date.now() : performance.now();

const buildFailureMessageArgs = (
  payload: ApiResponse<unknown> | null | undefined,
  statusCode: number,
  path: string,
): Record<string, unknown> | undefined => {
  if (!payload) {
    return undefined;
  }
  const args: Record<string, unknown> = {};
  if (payload.cause !== undefined) {
    args.cause = payload.cause;
  }
  if (isPlainRecord(payload.details)) {
    Object.assign(args, payload.details);
    args.details = payload.details;
  }
  const requestId = readTrimmedText(payload.requestId);
  if (requestId) {
    args.requestId = requestId;
  }
  const errorStage = readTrimmedText(payload.errorStage);
  if (errorStage) {
    args.errorStage = errorStage;
  }
  const presentationKey = readTrimmedText(payload.presentationKey);
  if (presentationKey) {
    args.presentationKey = presentationKey;
  }
  const recoveryAction = readTrimmedText(payload.recoveryAction);
  if (recoveryAction) {
    args.recoveryAction = recoveryAction;
  }
  args.path = path;
  args.statusCode = statusCode;
  return Object.keys(args).length ? args : undefined;
};

const recordBackendHotActionTimingHeader = (
  headers: Record<string, string> | undefined,
  path: string,
): void => {
  const headerValue =
    headers?.["x-zinuto-hot-action-timing"] ??
    headers?.["X-Zinuto-Hot-Action-Timing"];
  if (!headerValue) {
    return;
  }
  const nameBySegment: Record<string, Parameters<typeof recordTrainerHotInteractionMetric>[0]["name"]> = {
    access: "backend-access",
    action: "backend-action",
    delta: "backend-delta",
    chartFrame: "backend-chart-frame",
    serialize: "backend-serialize",
    total: "backend-total",
  };
  headerValue.split(",").forEach((segment) => {
    const [rawLabel, rawDuration] = segment.trim().split(";dur=");
    const name = nameBySegment[String(rawLabel ?? "").trim()];
    const durationMs = Number(rawDuration);
    if (!name || !Number.isFinite(durationMs)) {
      return;
    }
    recordTrainerHotInteractionMetric({
      name,
      source: "backend",
      path,
      durationMs,
    });
  });
};

const parseBridgeApiEnvelope = <T>(
  bridgeResponse: BackendBridgeResponse,
): BridgeApiEnvelopeParseResult<T> => {
  const statusCode = Number(bridgeResponse?.status) || 0;
  const bodyText = String(bridgeResponse?.body ?? "").trim();
  const invalidResponse = (
    reason: string,
  ): BridgeApiEnvelopeParseResult<T> => ({
    statusCode,
    payload: null,
    errorCode: BACKEND_HTTP_RESPONSE_INVALID_ERROR_CODE,
    errorArgs: {
      reason,
      cause: {
        code: reason,
        stage: "SYSTEM",
      },
      details: {
        reason,
        statusCode,
        bodyLength: bodyText.length,
      },
      statusCode,
      bodyLength: bodyText.length,
    },
  });
  if (!bodyText) {
    return invalidResponse("EMPTY_BODY");
  }
  const parseStartedAtMs = nowApiPerfMs();
  try {
    const parsed: unknown = JSON.parse(bodyText);
    recordTrainerHotInteractionMetric({
      name: "json-parse",
      durationMs: nowApiPerfMs() - parseStartedAtMs,
    });
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return invalidResponse("INVALID_JSON_SHAPE");
    }
    if (typeof (parsed as { ok?: unknown }).ok !== "boolean") {
      return invalidResponse("MISSING_OK_FLAG");
    }
    return {
      statusCode,
      payload: parsed as ApiResponse<T>,
    };
  } catch {
    recordTrainerHotInteractionMetric({
      name: "json-parse",
      durationMs: nowApiPerfMs() - parseStartedAtMs,
    });
    return invalidResponse("INVALID_JSON");
  }
};

const waitForTauriBridgeRetry = async (
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> => {
  if (!(delayMs > 0)) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timerId = window.setTimeout(
      () => {
        cleanup();
        resolve();
      },
      Math.max(1, Math.floor(delayMs)),
    );
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => {
      window.clearTimeout(timerId);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
};

export const request: ApiRequester = async <T>(
  path: string,
  init?: RequestOptions,
): Promise<T> => {
  const {
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    signal: externalSignal,
    ...fetchInit
  } = init ?? {};
  const timeoutController = new AbortController();
  let didTimeout = false;
  const hasTimeout = Number.isFinite(timeoutMs) && Number(timeoutMs) > 0;
  const timeoutId = hasTimeout
    ? window.setTimeout(
        () => {
          didTimeout = true;
          timeoutController.abort();
        },
        Math.max(1, Math.floor(Number(timeoutMs))),
      )
    : null;
  const { signal, cleanup } = createMergedAbortSignal([
    externalSignal,
    timeoutController.signal,
  ]);

  try {
    const normalizedHeaders = normalizeRequestHeaders(fetchInit.headers);
    if (!hasHeaderIgnoreCase(normalizedHeaders, "content-type")) {
      normalizedHeaders["Content-Type"] = "application/json";
    }
    const method = (
      String(fetchInit.method ?? "GET").trim() || "GET"
    ).toUpperCase();
    const endpointEffect = resolveBackendEndpointEffect(method, path);
    const bodyText =
      typeof fetchInit.body === "string"
        ? fetchInit.body
        : fetchInit.body
          ? String(fetchInit.body)
          : "";

    if (!isTauriRuntime()) {
      throw new Error(tt("appText.request"));
    }
    const normalizedTimeoutMs =
      hasTimeout && Number.isFinite(timeoutMs) && Number(timeoutMs) > 0
        ? Math.max(1, Math.floor(Number(timeoutMs)))
        : undefined;
    const runBridgeRequest = async (
      requestSignal: AbortSignal | undefined = signal,
    ): Promise<T> => {
      let bridgeRetryAttempt = 0;
      while (true) {
        try {
          const bridgeStartedAtMs = nowApiPerfMs();
          const bridgeResponse = await invokeBackendBridge(
            {
              method,
              path,
              body: bodyText,
              headers: normalizedHeaders,
              timeoutMs: normalizedTimeoutMs,
            },
            requestSignal,
          );
          recordTrainerHotInteractionMetric({
            name: "bridge",
            source: "bridge",
            path,
            durationMs: nowApiPerfMs() - bridgeStartedAtMs,
          });
          recordBackendHotActionTimingHeader(bridgeResponse.headers, path);
          const {
            statusCode,
            payload,
            errorCode: bridgeResponseErrorCode,
            errorArgs: bridgeResponseErrorArgs,
          } = parseBridgeApiEnvelope<T>(bridgeResponse);

          if (bridgeResponseErrorCode) {
            throw createApiError(
              toBackendErrorMessage(
                bridgeResponseErrorCode,
                bridgeResponseErrorArgs,
                statusCode,
              ),
              bridgeResponseErrorCode,
              bridgeResponseErrorArgs,
              statusCode,
            );
          }

          if (statusCode < 200 || statusCode >= 300 || !payload?.ok) {
            const payloadErrorArgs = buildFailureMessageArgs(
              payload,
              statusCode,
              path,
            );
            const payloadErrorCode = payload?.errorCode;
            throw createApiError(
              toBackendErrorMessage(
                payloadErrorCode,
                payloadErrorArgs,
                statusCode,
              ),
              payloadErrorCode,
              payloadErrorArgs,
              statusCode,
            );
          }
          return payload.data;
        } catch (error) {
          const bridgeErrorCode = readBridgeCommandErrorCode(error);
          if (
            bridgeErrorCode &&
            shouldRetryTauriBridgeRequest({
              method,
              errorCode: bridgeErrorCode,
              attemptIndex: bridgeRetryAttempt,
            })
          ) {
            const retryDelayMs =
              resolveTauriBridgeRetryDelayMs(bridgeRetryAttempt);
            bridgeRetryAttempt += 1;
            await waitForTauriBridgeRetry(retryDelayMs, requestSignal);
            continue;
          }
          throw error;
        }
      }
    };
    if (endpointEffect.effect === "write") {
      const mutationLease = beginBackendMutation(endpointEffect);
      try {
        return await runBridgeRequest();
      } finally {
        finishBackendMutation(mutationLease);
      }
    }
    if (method !== "GET") {
      return await runBridgeRequest();
    }
    const getScope = resolveBackendGetScope(path);
    const coalescingKey = resolveApiInFlightGetCoalescingKey({
      method,
      path,
      body: bodyText,
      headers: normalizedHeaders,
      timeoutMs: normalizedTimeoutMs,
      hasExternalSignal: Boolean(externalSignal),
    });
    while (true) {
      const relevantScopes = Array.from(
        new Set([GLOBAL_BACKEND_GET_SCOPE, getScope]),
      );
      const scopeStates = relevantScopes.map((scope) => ({
        scope,
        state: getBackendGetScopeState(scope),
      }));
      const activeMutationTasks = scopeStates
        .filter(({ state }) => state.activeMutationCount > 0)
        .map(({ state }) => state.mutationsSettled);
      if (activeMutationTasks.length > 0) {
        await awaitWithAbortSignal(
          Promise.all(activeMutationTasks).then(() => undefined),
          signal,
        );
        continue;
      }
      const scopeSnapshots = scopeStates.map(({ scope, state }) => ({
        abortSignal: state.abortController.signal,
        generation: state.generation,
        invalidated: state.invalidated,
        scope,
      }));
      const createGenerationBridgeTask = (): Promise<T> => {
        const generationSignal = createMergedAbortSignal([
          signal,
          ...scopeSnapshots.map(({ abortSignal }) => abortSignal),
        ]);
        return runBridgeRequest(generationSignal.signal).finally(
          generationSignal.cleanup,
        );
      };
      const isCurrentGeneration = (): boolean =>
        scopeSnapshots.every(
          ({ generation, scope }) =>
            getBackendGetScopeState(scope).generation === generation,
        );
      const wasGenerationAborted = (): boolean =>
        scopeSnapshots.some(({ abortSignal }) => abortSignal.aborted);

      if (coalescingKey) {
        const cachedResponse = cachedGetResponses.get(coalescingKey);
        if (cachedResponse && cachedResponse.expiresAtMs > Date.now()) {
          return cachedResponse.value as T;
        }
        if (cachedResponse) {
          cachedGetResponses.delete(coalescingKey);
        }
      }

      let generationTask: Promise<T>;
      if (!coalescingKey) {
        generationTask = createGenerationBridgeTask();
      } else {
        const existingEntry = inFlightCoalescedGetRequests.get(coalescingKey);
        if (existingEntry) {
          generationTask = existingEntry.task as Promise<T>;
        } else {
          const coalescedRequest = createGenerationBridgeTask().finally(() => {
            if (
              inFlightCoalescedGetRequests.get(coalescingKey)?.task ===
              coalescedRequest
            ) {
              inFlightCoalescedGetRequests.delete(coalescingKey);
            }
          });
          inFlightCoalescedGetRequests.set(coalescingKey, {
            scope: getScope,
            task: coalescedRequest,
          });
          trimApiInFlightGetCoalescingMap(inFlightCoalescedGetRequests);
          generationTask = coalescedRequest;
        }
      }

      const outcome = await Promise.race([
        generationTask.then(
          (value) =>
            isCurrentGeneration()
              ? ({ kind: "value" as const, value })
              : ({ kind: "invalidated" as const }),
          (error) => {
            if (!isCurrentGeneration() || wasGenerationAborted()) {
              return { kind: "invalidated" as const };
            }
            throw error;
          },
        ),
        ...scopeSnapshots.map(({ invalidated }) =>
          invalidated.then(() => ({ kind: "invalidated" as const })),
        ),
      ]);
      if (outcome.kind === "invalidated") {
        continue;
      }

      const value = outcome.value;
      if (coalescingKey) {
        const cacheTtlMs = resolveApiGetResponseCacheTtlMs(path);
        if (cacheTtlMs > 0 && isCurrentGeneration()) {
          cachedGetResponses.set(coalescingKey, {
            expiresAtMs: Date.now() + cacheTtlMs,
            scope: getScope,
            value,
          });
          trimApiInFlightGetCoalescingMap(cachedGetResponses);
        }
      }
      return value;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw createApiError(
        didTimeout
          ? tt("appText.requestTimedOutTryAgainLater")
          : tt("appText.requestCanceled"),
        didTimeout
          ? "BACKEND_HTTP_REQUEST_TIMEOUT"
          : "BACKEND_HTTP_REQUEST_CANCELED",
        {
          reason: didTimeout ? "TIMEOUT" : "ABORTED",
          path,
        },
      );
    }
    const bridgeErrorCode = readBridgeCommandErrorCode(err);
    if (bridgeErrorCode) {
      throw createApiError(
        toBackendErrorMessage(
          bridgeErrorCode,
          readBridgeCommandErrorArgs(err),
          400,
        ),
        bridgeErrorCode,
        readBridgeCommandErrorArgs(err),
        400,
      );
    }
    throw err instanceof Error ? err : new Error(tt("appText.request"));
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
    cleanup();
  }
};
