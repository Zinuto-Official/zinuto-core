// SPDX-License-Identifier: GPL-3.0-only

import type { ApiRequestOptions, ApiRequester } from "@/api/requesterTypes";
import type {
  DesktopWorkspaceId as GeneratedDesktopWorkspaceId,
  DesktopWorkspaceReadModel,
} from "@zinuto/shared/contracts-desktop/api";
import type {
  PortfolioSummary,
  TradingSettings,
} from "@/domains/training/types";

export type ApiDesktopWorkspaceId = GeneratedDesktopWorkspaceId;
type DesktopWorkspaceId = ApiDesktopWorkspaceId;
export type ApiDesktopWorkspaceReadModel = DesktopWorkspaceReadModel;
export type ApiWorkspaceReadModelQuery = {
  keyword?: string;
  scope?: string;
  colorTokens?: readonly string[];
};
export type ApiHistoryReviewConsoleQuery = {
  keyword?: string;
  profitFilter?: 'ALL' | 'PROFIT' | 'LOSS';
  samplePoolFilter?: string;
  samplePoolAllId?: string;
  samplePoolUnknownId?: string;
};
export type ApiWorkspaceReadModelRequestOptions = ApiRequestOptions & {
  query?: ApiWorkspaceReadModelQuery;
  historyQuery?: ApiHistoryReviewConsoleQuery;
  forceRefresh?: boolean;
};
export type ApiSpecialTrainingModeParameterFacts = {
  modeId: "fast-decision-training" | "risk-discipline-training";
  defaults: {
    questionCount: number;
    horizonBars: number;
    maxOperations: number;
    maxEntries: number;
    decisionSecondsLimit: number;
    fastDecisionStrictnessLevel: string;
  };
  options: {
    questionCounts: readonly number[];
    horizonBars: readonly number[];
    decisionSeconds: readonly number[];
    fastDecisionStrictnessLevels: readonly string[];
  };
  supports: {
    decisionSecondsLimit: boolean;
    fastDecisionStrictness: boolean;
  };
  validation: Record<string, unknown>;
};
export type ApiSpecialTrainingWorkspaceFacts = {
  bankCount: number;
  readyBankCount: number;
  repairRequiredBankCount: number;
  modeParameterFactsById: Partial<
    Record<
      "fast-decision-training" | "risk-discipline-training",
      ApiSpecialTrainingModeParameterFacts
    >
  >;
};
export type ApiWorkspaceReadModelAction = {
  id: string;
  enabled: boolean;
  reasonCode: string | null;
  priority: number;
  facts: Record<string, unknown>;
};
export type ApiTrainerWorkspaceActionFacts = {
  enabled: boolean;
  reasonCode: string | null;
  facts: Record<string, unknown>;
};
export type ApiTrainerWorkspaceTradingReadModel = {
  schemaVersion: "trainer-workspace-trading-read-model.v1";
  tradingFacts: {
    assetClass: TradingSettings["assetClass"];
    marketPresetId: string;
    tradeSettlementMode: TradingSettings["tradeSettlementMode"];
    freeReplayEndSettlementMode: TradingSettings["freeReplayEndSettlementMode"];
    minTradeStep: number;
    contractMultiplier: number;
    allowLongMarginTrading: boolean;
    allowShortSelling: boolean;
    initialSecuritiesBalance: number;
  };
  replayAvailability: {
    statusCode: "READY" | "EMPTY";
    reasonCode: string | null;
    canStart: boolean;
    canResume: boolean;
    startDisabledReasonCode: string | null;
    resumeDisabledReasonCode: string | null;
    sourceCount: number;
    readySourceCount: number;
    trainableSymbolCount: number;
    hasResumableSession: boolean;
  };
  summary: {
    portfolioSummary: PortfolioSummary;
    tradingSettings: TradingSettings;
    hasResumableSession: boolean;
  };
  validation: {
    startSession: ApiTrainerWorkspaceActionFacts;
    resumeSession: ApiTrainerWorkspaceActionFacts;
  };
  actionAvailability: {
    startSession: ApiTrainerWorkspaceActionFacts;
    resumeSession: ApiTrainerWorkspaceActionFacts;
  };
  runConclusion: {
    statusCode: "IDLE" | "RESUMABLE" | "BLOCKED";
    reasonCode: string | null;
    resumableSessionId: string | null;
  };
};
export type ApiTrainerWorkspaceFacts = {
  tradingReadModel: ApiTrainerWorkspaceTradingReadModel;
  tradingFacts: ApiTrainerWorkspaceTradingReadModel["tradingFacts"];
  replayAvailability: ApiTrainerWorkspaceTradingReadModel["replayAvailability"];
  validation: ApiTrainerWorkspaceTradingReadModel["validation"];
  actionAvailability: ApiTrainerWorkspaceTradingReadModel["actionAvailability"];
  runConclusion: ApiTrainerWorkspaceTradingReadModel["runConclusion"];
};

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const toCount = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
};

export const readSpecialTrainingWorkspaceFacts = (
  model: DesktopWorkspaceReadModel | null | undefined,
): ApiSpecialTrainingWorkspaceFacts => {
  const facts = toRecord(model?.facts);
  const modeParameterFactsById = toRecord(facts?.modeParameterFactsById);
  const fastFacts = toRecord(modeParameterFactsById?.["fast-decision-training"]);
  const riskFacts = toRecord(modeParameterFactsById?.["risk-discipline-training"]);
  return {
    bankCount: toCount(facts?.bankCount),
    readyBankCount: toCount(facts?.readyBankCount),
    repairRequiredBankCount: toCount(facts?.repairRequiredBankCount),
    modeParameterFactsById: {
      ...(fastFacts
        ? {
            "fast-decision-training":
              fastFacts as ApiSpecialTrainingModeParameterFacts,
          }
        : {}),
      ...(riskFacts
        ? {
            "risk-discipline-training":
              riskFacts as ApiSpecialTrainingModeParameterFacts,
          }
        : {}),
    },
  };
};

const TRAINER_WORKSPACE_TRADING_READ_MODEL_SCHEMA_VERSION =
  "trainer-workspace-trading-read-model.v1";

const readTrainerWorkspaceTradingReadModel = (
  value: unknown,
): ApiTrainerWorkspaceTradingReadModel | null => {
  const readModel = toRecord(value);
  if (
    !readModel ||
    String(readModel.schemaVersion ?? "").trim() !==
      TRAINER_WORKSPACE_TRADING_READ_MODEL_SCHEMA_VERSION
  ) {
    return null;
  }
  const tradingFacts = toRecord(readModel.tradingFacts);
  const replayAvailability = toRecord(readModel.replayAvailability);
  const summary = toRecord(readModel.summary);
  const actionAvailability = toRecord(readModel.actionAvailability);
  const runConclusion = toRecord(readModel.runConclusion);
  if (
    !tradingFacts ||
    !replayAvailability ||
    !summary ||
    !actionAvailability ||
    !runConclusion
  ) {
    return null;
  }
  const startSessionFacts = toRecord(actionAvailability.startSession);
  const resumeSessionFacts = toRecord(actionAvailability.resumeSession);
  if (!startSessionFacts || !resumeSessionFacts) {
    return null;
  }
  return {
    schemaVersion: TRAINER_WORKSPACE_TRADING_READ_MODEL_SCHEMA_VERSION,
    tradingFacts: tradingFacts as ApiTrainerWorkspaceTradingReadModel["tradingFacts"],
    replayAvailability:
      replayAvailability as ApiTrainerWorkspaceTradingReadModel["replayAvailability"],
    summary: summary as ApiTrainerWorkspaceTradingReadModel["summary"],
    validation: {
      startSession: startSessionFacts as ApiTrainerWorkspaceActionFacts,
      resumeSession: resumeSessionFacts as ApiTrainerWorkspaceActionFacts,
    },
    actionAvailability:
      actionAvailability as ApiTrainerWorkspaceTradingReadModel["actionAvailability"],
    runConclusion:
      runConclusion as ApiTrainerWorkspaceTradingReadModel["runConclusion"],
  };
};

// Distinguishable error for structurally invalid trainer workspace facts so
// callers can react explicitly instead of trusting an unchecked cast.
export const createTrainerWorkspaceFactsShapeError = (): Error =>
  new Error("TRAINER_WORKSPACE_FACTS_INVALID_SHAPE");

export const readTrainerWorkspaceFacts = (
  model: DesktopWorkspaceReadModel | null | undefined,
): ApiTrainerWorkspaceFacts => {
  const facts = toRecord(model?.facts);
  const tradingReadModel = readTrainerWorkspaceTradingReadModel(
    facts?.tradingReadModel,
  );
  if (!tradingReadModel) {
    throw createTrainerWorkspaceFactsShapeError();
  }
  return {
    tradingReadModel,
    tradingFacts: tradingReadModel.tradingFacts,
    replayAvailability: tradingReadModel.replayAvailability,
    validation: tradingReadModel.validation,
    actionAvailability: tradingReadModel.actionAvailability,
    runConclusion: tradingReadModel.runConclusion,
  };
};

const WORKSPACE_READ_MODEL_PATHS = {
  "command-center": "/api/v1/workspaces/command-center",
  trainer: "/api/v1/workspaces/trainer",
  "history-review-console": "/api/v1/workspaces/history/review-console",
  "challenge-stats": "/api/v1/workspaces/challenge-stats",
  "special-training": "/api/v1/workspaces/special-training",
  "data-management": "/api/v1/workspaces/data-management",
  notes: "/api/v1/workspaces/notes",
  settings: "/api/v1/workspaces/settings",
  "custom-indicator": "/api/v1/workspaces/custom-indicator",
  "strategy-backtest": "/api/v1/workspaces/strategy-backtest",
} as const satisfies Record<DesktopWorkspaceId, string>;

const buildHistoryQueryParams = (
  historyQuery: ApiHistoryReviewConsoleQuery,
): URLSearchParams => {
  const params = new URLSearchParams();
  const keyword = String(historyQuery.keyword || "").trim();
  const profitFilter = String(historyQuery.profitFilter || "").trim();
  const samplePoolFilter = String(historyQuery.samplePoolFilter || "").trim();
  const samplePoolAllId = String(historyQuery.samplePoolAllId || "").trim();
  const samplePoolUnknownId = String(historyQuery.samplePoolUnknownId || "").trim();
  if (keyword) params.set("keyword", keyword);
  if (profitFilter && profitFilter !== "ALL") params.set("profitFilter", profitFilter);
  if (samplePoolFilter) params.set("samplePoolFilter", samplePoolFilter);
  if (samplePoolAllId) params.set("samplePoolAllId", samplePoolAllId);
  if (samplePoolUnknownId) params.set("samplePoolUnknownId", samplePoolUnknownId);
  return params;
};

const buildWorkspaceReadModelPath = (
  workspaceId: DesktopWorkspaceId,
  query?: ApiWorkspaceReadModelQuery,
  historyQuery?: ApiHistoryReviewConsoleQuery,
): string => {
  const basePath = WORKSPACE_READ_MODEL_PATHS[workspaceId];
  if (workspaceId === "notes" && query) {
    const params = new URLSearchParams();
    const keyword = String(query.keyword || "").trim();
    const scope = String(query.scope || "").trim();
    const colorTokens = Array.isArray(query.colorTokens)
      ? query.colorTokens.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    if (keyword) params.set("keyword", keyword);
    if (scope) params.set("scope", scope);
    if (colorTokens.length) params.set("colorTokens", colorTokens.join(","));
    const queryText = params.toString();
    return queryText ? `${basePath}?${queryText}` : basePath;
  }
  if (workspaceId === "history-review-console" && historyQuery) {
    const params = buildHistoryQueryParams(historyQuery);
    const queryText = params.toString();
    return queryText ? `${basePath}?${queryText}` : basePath;
  }
  return basePath;
};

export const WORKSPACE_READ_MODEL_CACHE_TTL_MS = 5_000;
const WORKSPACE_READ_MODEL_CACHE_MAX_ENTRIES = 64;
const workspaceReadModelResponseCache = new Map<
  string,
  {
    expiresAtMs: number;
    value: DesktopWorkspaceReadModel;
    workspaceId: DesktopWorkspaceId;
  }
>();
const workspaceReadModelInFlightCache = new Map<
  string,
  {
    controller: AbortController;
    generation: number;
    task: Promise<DesktopWorkspaceReadModel>;
    workspaceId: DesktopWorkspaceId;
  }
>();
const workspaceReadModelCacheGenerationById = new Map<
  DesktopWorkspaceId,
  number
>();
const workspaceReadModelMutationStateById = new Map<
  DesktopWorkspaceId,
  {
    activeCount: number;
    resolveSettled: () => void;
    settled: Promise<void>;
  }
>();

export type WorkspaceReadModelMutationLease = {
  workspaceIds: DesktopWorkspaceId[];
};

const ALL_WORKSPACE_READ_MODEL_IDS = Object.keys(
  WORKSPACE_READ_MODEL_PATHS,
) as DesktopWorkspaceId[];

const getWorkspaceReadModelCacheGeneration = (
  workspaceId: DesktopWorkspaceId,
): number => workspaceReadModelCacheGenerationById.get(workspaceId) ?? 0;

const getWorkspaceReadModelMutationState = (
  workspaceId: DesktopWorkspaceId,
) => {
  let state = workspaceReadModelMutationStateById.get(workspaceId);
  if (!state) {
    state = {
      activeCount: 0,
      resolveSettled: () => undefined,
      settled: Promise.resolve(),
    };
    workspaceReadModelMutationStateById.set(workspaceId, state);
  }
  return state;
};

const trimWorkspaceReadModelCache = <T>(cache: Map<string, T>): void => {
  while (cache.size > WORKSPACE_READ_MODEL_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey !== "string") {
      return;
    }
    cache.delete(oldestKey);
  }
};

const createAbortError = (): Error =>
  typeof DOMException === "function"
    ? new DOMException("Aborted", "AbortError")
    : Object.assign(new Error("Aborted"), { name: "AbortError" });

const awaitWorkspaceReadModelForConsumer = <T>(
  task: Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  if (!signal) {
    return task;
  }
  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }
  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => {
      cleanup();
      reject(createAbortError());
    };
    const cleanup = () => {
      signal.removeEventListener("abort", handleAbort);
    };
    signal.addEventListener("abort", handleAbort, { once: true });
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

const uniqueWorkspaceIds = (
  workspaceIds: readonly DesktopWorkspaceId[],
): DesktopWorkspaceId[] => Array.from(new Set(workspaceIds));

export const resolveWorkspaceReadModelIdsAffectedByMutation = (
  path: string,
): DesktopWorkspaceId[] => {
  const pathname = String(path || "").trim().split("?")[0] ?? "";
  const segments = pathname.split("/").filter(Boolean);
  const resource = segments[2] ?? "";
  const operation = segments[3] ?? "";
  if (resource === "backtest") {
    return ["strategy-backtest"];
  }
  if (resource === "custom-indicators") {
    if (operation === "compile" || operation === "execute") {
      return [];
    }
    return ["custom-indicator", "trainer", "strategy-backtest"];
  }
  if (resource === "data-sources" || resource === "market") {
    return [
      "command-center",
      "trainer",
      "special-training",
      "data-management",
      "settings",
      "strategy-backtest",
    ];
  }
  if (resource === "history") {
    return ["command-center", "history-review-console", "challenge-stats"];
  }
  if (resource === "replay-notes") {
    return ["notes", "history-review-console"];
  }
  if (resource === "training" && operation === "special") {
    return ["command-center", "special-training", "challenge-stats"];
  }
  if (resource === "training") {
    return [
      "command-center",
      "trainer",
      "history-review-console",
      "challenge-stats",
      "special-training",
    ];
  }
  if (resource === "system" && operation === "app-preferences") {
    return [
      "command-center",
      "trainer",
      "special-training",
      "data-management",
      "settings",
    ];
  }
  if (
    resource === "system" &&
    ((operation === "portable-import" && segments.length === 4) ||
      operation === "reset-all-data" ||
      operation === "startup-local-data" ||
      operation === "dev-simulation")
  ) {
    return [...ALL_WORKSPACE_READ_MODEL_IDS];
  }
  if (resource === "system" && operation === "history-retention") {
    if (segments[4] === "preview") {
      return [];
    }
    return [
      "command-center",
      "history-review-console",
      "challenge-stats",
      "settings",
    ];
  }
  // Export, inspection, diagnostics, and other unclassified commands do not
  // invalidate workspace facts merely because they use a non-GET verb.
  return [];
};

export const resolveWorkspaceReadModelIdFromPath = (
  path: string,
): DesktopWorkspaceId | null => {
  const pathname = String(path || "").trim().split("?")[0] ?? "";
  const match = ALL_WORKSPACE_READ_MODEL_IDS.find(
    (workspaceId) => WORKSPACE_READ_MODEL_PATHS[workspaceId] === pathname,
  );
  return match ?? null;
};

const invalidateWorkspaceReadModelIds = (
  workspaceIds: readonly DesktopWorkspaceId[],
): void => {
  const affectedIds = new Set(uniqueWorkspaceIds(workspaceIds));
  affectedIds.forEach((workspaceId) => {
    workspaceReadModelCacheGenerationById.set(
      workspaceId,
      getWorkspaceReadModelCacheGeneration(workspaceId) + 1,
    );
  });
  workspaceReadModelResponseCache.forEach((entry, cacheKey) => {
    if (affectedIds.has(entry.workspaceId)) {
      workspaceReadModelResponseCache.delete(cacheKey);
    }
  });
  workspaceReadModelInFlightCache.forEach((entry, cacheKey) => {
    if (!affectedIds.has(entry.workspaceId)) {
      return;
    }
    workspaceReadModelInFlightCache.delete(cacheKey);
    entry.controller.abort();
  });
};

export const invalidateWorkspaceReadModelCache = (
  mutationPath?: string,
): void => {
  invalidateWorkspaceReadModelIds(
    mutationPath
      ? resolveWorkspaceReadModelIdsAffectedByMutation(mutationPath)
      : ALL_WORKSPACE_READ_MODEL_IDS,
  );
};

export const beginWorkspaceReadModelMutationForIds = (
  rawWorkspaceIds: readonly string[],
): WorkspaceReadModelMutationLease => {
  const workspaceIds = uniqueWorkspaceIds(rawWorkspaceIds.map((workspaceId) => {
    if (!ALL_WORKSPACE_READ_MODEL_IDS.includes(workspaceId as DesktopWorkspaceId)) {
      throw new Error(`Unknown workspace read-model effect: ${workspaceId}`);
    }
    return workspaceId as DesktopWorkspaceId;
  }));
  workspaceIds.forEach((workspaceId) => {
    const state = getWorkspaceReadModelMutationState(workspaceId);
    if (state.activeCount === 0) {
      state.settled = new Promise<void>((resolve) => {
        state.resolveSettled = resolve;
      });
    }
    state.activeCount += 1;
  });
  invalidateWorkspaceReadModelIds(workspaceIds);
  return { workspaceIds };
};

export const beginWorkspaceReadModelMutation = (
  mutationPath: string,
): WorkspaceReadModelMutationLease =>
  beginWorkspaceReadModelMutationForIds(
    resolveWorkspaceReadModelIdsAffectedByMutation(mutationPath),
  );

export const finishWorkspaceReadModelMutation = (
  lease: WorkspaceReadModelMutationLease,
): void => {
  uniqueWorkspaceIds(lease.workspaceIds).forEach((workspaceId) => {
    const state = getWorkspaceReadModelMutationState(workspaceId);
    state.activeCount = Math.max(0, state.activeCount - 1);
    if (state.activeCount === 0) {
      state.resolveSettled();
      state.resolveSettled = () => undefined;
    }
  });
};

export const createWorkspaceReadModelsApi = (request: ApiRequester) => {
  const getWorkspaceReadModel = (
    workspaceId: DesktopWorkspaceId,
    options?: ApiWorkspaceReadModelRequestOptions,
  ): Promise<DesktopWorkspaceReadModel> => {
    const path = buildWorkspaceReadModelPath(
      workspaceId,
      options?.query,
      options?.historyQuery,
    );
    // Filtered reads change with user input and must remain truly cancelable.
    // Only stable, unfiltered workspace resources participate in navigation warmup.
    if (options?.query || options?.historyQuery) {
      const runFilteredRead = async (): Promise<DesktopWorkspaceReadModel> => {
        const mutationState = getWorkspaceReadModelMutationState(workspaceId);
        if (mutationState.activeCount > 0) {
          await awaitWorkspaceReadModelForConsumer(
            mutationState.settled,
            options?.signal,
          );
          return runFilteredRead();
        }
        return request<DesktopWorkspaceReadModel>(path, options);
      };
      return runFilteredRead();
    }
    if (options?.forceRefresh) {
      invalidateWorkspaceReadModelIds([workspaceId]);
    }
    const runStableRead = async (): Promise<DesktopWorkspaceReadModel> => {
      const mutationState = getWorkspaceReadModelMutationState(workspaceId);
      if (mutationState.activeCount > 0) {
        await awaitWorkspaceReadModelForConsumer(
          mutationState.settled,
          options?.signal,
        );
        return runStableRead();
      }

      const cacheKey = JSON.stringify({
        path,
        timeoutMs: options?.timeoutMs,
      });
      const cachedResponse = workspaceReadModelResponseCache.get(cacheKey);
      if (
        !options?.forceRefresh &&
        cachedResponse &&
        cachedResponse.expiresAtMs > Date.now()
      ) {
        return awaitWorkspaceReadModelForConsumer(
          Promise.resolve(cachedResponse.value),
          options?.signal,
        );
      }
      if (cachedResponse) {
        workspaceReadModelResponseCache.delete(cacheKey);
      }

      const requestGeneration = getWorkspaceReadModelCacheGeneration(workspaceId);
      let sharedEntry = workspaceReadModelInFlightCache.get(cacheKey);
      if (!sharedEntry || sharedEntry.generation !== requestGeneration) {
        const controller = new AbortController();
        const requestOptions = {
          ...(options?.timeoutMs !== undefined
            ? { timeoutMs: options.timeoutMs }
            : {}),
          signal: controller.signal,
        };
        const sharedTask = request<DesktopWorkspaceReadModel>(path, requestOptions)
          .then((value) => {
            if (
              getWorkspaceReadModelCacheGeneration(workspaceId) ===
              requestGeneration
            ) {
              workspaceReadModelResponseCache.set(cacheKey, {
                expiresAtMs: Date.now() + WORKSPACE_READ_MODEL_CACHE_TTL_MS,
                value,
                workspaceId,
              });
              trimWorkspaceReadModelCache(workspaceReadModelResponseCache);
            }
            return value;
          })
          .finally(() => {
            if (
              workspaceReadModelInFlightCache.get(cacheKey)?.task === sharedTask
            ) {
              workspaceReadModelInFlightCache.delete(cacheKey);
            }
          });
        sharedEntry = {
          controller,
          generation: requestGeneration,
          task: sharedTask,
          workspaceId,
        };
        workspaceReadModelInFlightCache.set(cacheKey, sharedEntry);
        trimWorkspaceReadModelCache(workspaceReadModelInFlightCache);
      }

      try {
        const value = await awaitWorkspaceReadModelForConsumer(
          sharedEntry.task,
          options?.signal,
        );
        if (
          sharedEntry.generation ===
          getWorkspaceReadModelCacheGeneration(workspaceId)
        ) {
          return value;
        }
      } catch (error) {
        if (
          sharedEntry.generation ===
          getWorkspaceReadModelCacheGeneration(workspaceId)
        ) {
          throw error;
        }
      }
      if (options?.signal?.aborted) {
        throw createAbortError();
      }
      return runStableRead();
    };
    return runStableRead();
  };

  return {
    getWorkspaceReadModel,
    getWorkspaceReadModels: (
      workspaceIds: DesktopWorkspaceId[],
      options?: ApiRequestOptions,
    ) =>
      Promise.allSettled(
        workspaceIds.map((workspaceId) =>
          getWorkspaceReadModel(workspaceId, options),
        ),
      ).then((results) =>
        results
          .filter(
            (
              result,
            ): result is PromiseFulfilledResult<DesktopWorkspaceReadModel> =>
              result.status === "fulfilled",
          )
          .map((result) => result.value),
      ),
  };
};
