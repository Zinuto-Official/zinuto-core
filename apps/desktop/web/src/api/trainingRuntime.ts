// SPDX-License-Identifier: GPL-3.0-only

import type { ApiRequestOptions, ApiRequester } from "@/api/requesterTypes";
import { createApiError } from "@/api/error";
import { DESKTOP_LOCAL_API_ROUTES, type DesktopLocalApiPath } from "@zinuto/shared/contracts-desktop/http-api";
import { buildHttpApiRoute } from "@zinuto/shared/httpApiRouteBuilder";
import { DESKTOP_API_LIMITS } from "@zinuto/shared/input-limits";
import type {
  Account,
  BarsRange,
  DisplayPeriodKey,
  FreeReplayAdvancePeriod,
  FreeReplayStartPointOverviewRange,
  Instrument,
  MarketBarFrame,
  PortfolioSummary,
  PreparedFreeReplayStartResult,
  PriceMode,
  ResumableSessionSummary,
  Session,
  SessionBootstrap,
  SessionOrderQuote,
  SessionSnapshot,
  SessionStepResult,
  Side,
  TradingSettings,
} from "@/domains/training/types";

const desktopApiPath = <TPath extends DesktopLocalApiPath>(path: TPath): TPath =>
  path;

const TRAINER_HOT_ACTION_TIMEOUT_MS = 10_000;

const normalizeStartPointOverviewLimit = (limit: number): number => {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed)) {
    return DESKTOP_API_LIMITS.startPointOverviewBarsMax;
  }
  return Math.max(
    1,
    Math.min(
      DESKTOP_API_LIMITS.startPointOverviewBarsMax,
      Math.floor(parsed),
    ),
  );
};

export type ApiInstrumentListOptions = ApiRequestOptions & {
  query?: string;
  sourceId?: string;
  offset?: number;
  limit?: number;
};

export type ApiFreeReplayPoolDefaultEnvironment = {
  assetClass: "STOCK" | "FUTURES" | "FOREX" | "CRYPTO";
  marketPresetId: string;
};

export type ApiFreeReplayPoolDefaultEnvironmentById = Record<
  string,
  ApiFreeReplayPoolDefaultEnvironment
>;

export type ApiFreeReplayStartReadinessReasonCode =
  | "NO_SAMPLES"
  | "NO_SYMBOL"
  | "NO_ANCHOR";

export type ApiFreeReplayStartReadiness = {
  enabled: boolean;
  reasonCode: ApiFreeReplayStartReadinessReasonCode | null;
  facts: {
    mode: "RANDOM" | "FOCUSED";
    candidateCount: number;
    scopedCandidateCount: number;
    selectedPoolId: string | null;
    selectedInstrumentId: string | null;
    selectedSymbol: string | null;
    selectedAnchorIndex: number | null;
    requiresSymbol: boolean;
    requiresAnchor: boolean;
    hasExplicitAnchor: boolean;
    normalizedSelectedSymbol: string;
  };
  readiness: {
    canStart: boolean;
    reason: ApiFreeReplayStartReadinessReasonCode | null;
    requiresSymbol: boolean;
    requiresAnchor: boolean;
    hasExplicitAnchor: boolean;
    normalizedSelectedSymbol: string;
  };
};

export type ApiFreeReplayStartReadinessRequest = {
  mode: "RANDOM" | "FOCUSED";
  selectedPoolId?: string;
  selectedInstrumentId?: string;
  selectedSymbol?: string;
  selectedAnchorIndex?: number;
  minimumBaseTimeframe?: FreeReplayAdvancePeriod;
  candidates: Array<{
    instrumentId: string;
    symbol: string;
    poolId: string;
    poolName: string;
    sourceTimeframe: "1m" | "5m" | "1h" | "1d";
  }>;
};

export type ApiFreeReplayPrepInstrument = {
  instrumentId: string;
  samplePoolId: string;
  symbol: string;
  label: string;
  sourceTimeframe: "1m" | "5m" | "1h" | "1d";
  barCount: number;
  locked: boolean;
  lockReason: string | null;
};

export type ApiFreeReplayPrepPool = {
  id: string;
  name: string;
  assetClass: ApiFreeReplayPoolDefaultEnvironment["assetClass"];
  marketPresetId: string;
  sourceBaseTimeframe: "1m" | "5m" | "1h" | "1d";
  baseTimeframe: "1m" | "5m" | "1h" | "1d";
  minimumBaseTimeframeOptions: FreeReplayAdvancePeriod[];
  disabled: boolean;
  sourceLocked: boolean;
  lockReason: string | null;
  symbolCount: number;
  trainableSymbolCount: number;
  instruments: ApiFreeReplayPrepInstrument[];
  symbols: string[];
};

export type ApiFreeReplayPrepReadModelRequest = {
  mode?: "RANDOM" | "FOCUSED";
  selectedPoolId?: string;
  selectedInstrumentId?: string;
  selectedSymbol?: string;
  selectedAnchorIndex?: number;
  minimumBaseTimeframe?: FreeReplayAdvancePeriod;
  minimumBaseTimeframeTouched?: boolean;
  hideSymbolName?: boolean;
  preferredAssetClass?: ApiFreeReplayPoolDefaultEnvironment["assetClass"];
  preferredBaseTimeframe?: "1m" | "5m" | "1h" | "1d";
  activeSessionMinimumBaseTimeframe?: FreeReplayAdvancePeriod;
  hasActiveSession?: boolean;
  environmentSelection?: Partial<ApiFreeReplayPoolDefaultEnvironment> | null;
  environmentTouched?: boolean;
};

export type ApiFreeReplayEnvironmentRuleCard = {
  id:
    | "settlement"
    | "direction"
    | "longPermission"
    | "minTradeStep"
    | "commissionRate"
    | "commissionMinimumFee"
    | "platformFeeRate"
    | "platformFeeMinimumFee"
    | "transactionLevyRate"
    | "transactionLevyMinimumFee"
    | "transferFeeRate"
    | "regulatoryFeeRate"
    | "stampDutyRate"
    | "stampDutyMode"
    | "makerFeeRate"
    | "takerFeeRate"
    | "fundingRate"
    | "slippageRate"
    | "contractMultiplier"
    | "longInitialMargin"
    | "longMaintenanceMargin"
    | "longFinancing"
    | "shortInitialMargin"
    | "shortMaintenanceMargin"
    | "shortBorrow";
  valueKind:
    | "TEXT"
    | "TRADE_SETTLEMENT_MODE"
    | "DIRECTION"
    | "LONG_MARGIN_PERMISSION"
    | "MIN_TRADE_STEP"
    | "STAMP_DUTY_MODE";
  value: string;
};

export type ApiFreeReplayPrepReadModel = {
  statusCode: "READY" | "EMPTY";
  reasonCode: "NO_POOLS" | null;
  prepConfig: {
    mode: "RANDOM" | "FOCUSED";
    minimumBaseTimeframe: FreeReplayAdvancePeriod;
    baseTimeframe: FreeReplayAdvancePeriod;
    hideSymbolName: boolean;
    assetClass: ApiFreeReplayPoolDefaultEnvironment["assetClass"];
  };
  selection: {
    selectedPoolId: string;
    selectedInstrumentId: string;
    selectedSymbol: string;
    selectedSourceTimeframe: "1m" | "5m" | "1h" | "1d";
  };
  facts: {
    availablePoolCount: number;
    availableSymbolCount: number;
    trainableSymbolCount: number;
    candidateCount: number;
  };
  pools: ApiFreeReplayPrepPool[];
  selectedPool: ApiFreeReplayPrepPool | null;
  selectedInstrument: ApiFreeReplayPrepInstrument | null;
  startCandidates: ApiFreeReplayStartReadinessRequest["candidates"];
  startReadiness: ApiFreeReplayStartReadiness;
  actions: {
    start: ApiFreeReplayStartReadiness;
  };
  environment: {
    selected: ApiFreeReplayPoolDefaultEnvironment;
    ruleCards: ApiFreeReplayEnvironmentRuleCard[];
    assetOptions: Array<{
      value: ApiFreeReplayPoolDefaultEnvironment["assetClass"];
      disabled: boolean;
    }>;
    presetOptions: Array<{ value: string; disabled: boolean }>;
  };
};

export const createTrainingRuntimeApi = (request: ApiRequester) => ({
  listInstruments: (options?: ApiInstrumentListOptions) => {
    const {
      query,
      sourceId,
      offset,
      limit,
      ...requestOptions
    } = options ?? {};
    const search = new URLSearchParams();
    const normalizedQuery = String(query ?? "").trim();
    const normalizedSourceId = String(sourceId ?? "").trim();
    if (normalizedQuery) {
      search.set("query", normalizedQuery);
    }
    if (normalizedSourceId) {
      search.set("sourceId", normalizedSourceId);
    }
    if (Number.isFinite(offset)) {
      search.set("offset", String(Math.max(0, Math.floor(Number(offset)))));
    }
    if (Number.isFinite(limit)) {
      search.set("limit", String(Math.max(1, Math.floor(Number(limit)))));
    }
    const queryString = search.toString();
    return request<Instrument[]>(
      `${desktopApiPath(DESKTOP_LOCAL_API_ROUTES.marketInstruments)}${queryString ? `?${queryString}` : ""}`,
      requestOptions,
    );
  },
  getBarsRange: (
      symbol: string,
      timeframe = "1d",
      offset = 0,
      limit = 3000,
      options?: ApiRequestOptions & { instrumentId?: string },
    ) => {
      const instrumentId = String(options?.instrumentId || "").trim();
      if (!instrumentId) {
        throw createApiError(
          "Instrument id is required for v1 bar range requests.",
          "INSTRUMENT_ID_REQUIRED",
          { symbol, timeframe },
          400,
        );
      }
      const { instrumentId: _instrumentId, ...requestOptions } = options ?? {};
      void _instrumentId;
      return request<BarsRange>(
        buildHttpApiRoute(
          DESKTOP_LOCAL_API_ROUTES.marketInstrumentsInstrumentIdBarsRange,
          { instrumentId },
          {
            offset: Math.max(0, Math.floor(offset)),
            limit: Math.min(3000, Math.max(1, Math.floor(limit))),
          },
        ),
        requestOptions,
      );
    },
    getInstrumentBarsRange: (
      instrumentId: string,
      offset = 0,
      limit = 3000,
      options?: ApiRequestOptions,
    ) =>
      request<BarsRange>(
        buildHttpApiRoute(
          DESKTOP_LOCAL_API_ROUTES.marketInstrumentsInstrumentIdBarsRange,
          { instrumentId },
          {
            offset: Math.max(0, Math.floor(offset)),
            limit: Math.min(3000, Math.max(1, Math.floor(limit))),
          },
        ),
        options,
      ),
    getBarsFrame: (
      symbol: string,
      timeframe = "1d",
      offset = 0,
      limit = 1200,
      options?: ApiRequestOptions & {
        instrumentId?: string;
  	      displayPeriod?: DisplayPeriodKey;
  	      anchorRawIndex?: number;
  	      anchorDisplayIndex?: number;
  	      direction?: "FORWARD" | "BACKWARD";
  	      before?: number;
  	      after?: number;
  	      maxDisplayBars?: number;
  	    },
    ) => {
      const instrumentId = String(options?.instrumentId || "").trim();
      if (!instrumentId) {
        throw createApiError(
          "Instrument id is required for v1 bar frame requests.",
          "INSTRUMENT_ID_REQUIRED",
          { symbol, timeframe },
          400,
        );
      }
      const {
        instrumentId: _instrumentId,
  	      displayPeriod,
  	      anchorRawIndex,
  	      anchorDisplayIndex,
  	      direction,
  	      before,
  	      after,
  	      maxDisplayBars,
        ...requestOptions
      } = options ?? {};
      void _instrumentId;
      const search = new URLSearchParams();
      search.set("offset", String(Math.max(0, Math.floor(offset))));
      search.set("limit", String(Math.min(3000, Math.max(1, Math.floor(limit)))));
      if (displayPeriod) {
        search.set("displayPeriod", displayPeriod);
      }
  	    if (Number.isFinite(anchorRawIndex)) {
  	      search.set("anchorRawIndex", String(Math.max(0, Math.floor(Number(anchorRawIndex)))));
  	    }
  	    if (Number.isFinite(anchorDisplayIndex)) {
  	      search.set("anchorDisplayIndex", String(Math.max(0, Math.floor(Number(anchorDisplayIndex)))));
  	    }
  	    if (direction === "FORWARD" || direction === "BACKWARD") {
  	      search.set("direction", direction);
  	    }
  	    if (Number.isFinite(before)) {
  	      search.set("before", String(Math.max(0, Math.floor(Number(before)))));
  	    }
  	    if (Number.isFinite(after)) {
  	      search.set("after", String(Math.max(0, Math.floor(Number(after)))));
  	    }
      if (Number.isFinite(maxDisplayBars)) {
        search.set("maxDisplayBars", String(Math.max(1, Math.floor(Number(maxDisplayBars)))));
      }
      return request<MarketBarFrame>(
        buildHttpApiRoute(
          DESKTOP_LOCAL_API_ROUTES.marketInstrumentsInstrumentIdBarsFrame,
          { instrumentId },
          Object.fromEntries(search.entries()),
        ),
        requestOptions,
      );
    },
    getInstrumentBarsFrame: (
      instrumentId: string,
      offset = 0,
      limit = 1200,
      options?: ApiRequestOptions & {
  	      displayPeriod?: DisplayPeriodKey;
  	      anchorRawIndex?: number;
  	      anchorDisplayIndex?: number;
  	      direction?: "FORWARD" | "BACKWARD";
  	      before?: number;
  	      after?: number;
  	      maxDisplayBars?: number;
  	    },
    ) => {
      const {
  	      displayPeriod,
  	      anchorRawIndex,
  	      anchorDisplayIndex,
  	      direction,
  	      before,
  	      after,
  	      maxDisplayBars,
        ...requestOptions
      } = options ?? {};
      const search = new URLSearchParams();
      search.set("offset", String(Math.max(0, Math.floor(offset))));
      search.set("limit", String(Math.max(1, Math.floor(limit))));
      if (displayPeriod) {
        search.set("displayPeriod", displayPeriod);
      }
  	    if (Number.isFinite(anchorRawIndex)) {
  	      search.set("anchorRawIndex", String(Math.max(0, Math.floor(Number(anchorRawIndex)))));
  	    }
  	    if (Number.isFinite(anchorDisplayIndex)) {
  	      search.set("anchorDisplayIndex", String(Math.max(0, Math.floor(Number(anchorDisplayIndex)))));
  	    }
  	    if (direction === "FORWARD" || direction === "BACKWARD") {
  	      search.set("direction", direction);
  	    }
  	    if (Number.isFinite(before)) {
  	      search.set("before", String(Math.max(0, Math.floor(Number(before)))));
  	    }
  	    if (Number.isFinite(after)) {
  	      search.set("after", String(Math.max(0, Math.floor(Number(after)))));
  	    }
      if (Number.isFinite(maxDisplayBars)) {
        search.set("maxDisplayBars", String(Math.max(1, Math.floor(Number(maxDisplayBars)))));
      }
      return request<MarketBarFrame>(
        buildHttpApiRoute(
          DESKTOP_LOCAL_API_ROUTES.marketInstrumentsInstrumentIdBarsFrame,
          { instrumentId },
          Object.fromEntries(search.entries()),
        ),
        requestOptions,
      );
    },
    getFreeReplayStartPointOverview: (
	      instrumentId: string,
	      samplePoolId: string | undefined,
	      minimumBaseTimeframe: FreeReplayAdvancePeriod,
      offset = 0,
      limit = 5000,
      range?: {
        rawStartIndex?: number;
        rawEndIndex?: number;
        displayPeriod?: DisplayPeriodKey;
      },
      options?: ApiRequestOptions,
    ) => {
      const normalizedOffset = Number.isFinite(offset)
        ? Math.max(0, Math.floor(Number(offset)))
        : 0;
      const search = new URLSearchParams({
        instrumentId,
        minimumBaseTimeframe,
        offset: String(normalizedOffset),
        limit: String(normalizeStartPointOverviewLimit(limit)),
      });
      const normalizedSamplePoolId = String(samplePoolId || "").trim();
      if (normalizedSamplePoolId) {
        search.set("samplePoolId", normalizedSamplePoolId);
      }
      if (Number.isFinite(range?.rawStartIndex)) {
        search.set(
          "rawStartIndex",
          String(Math.max(0, Math.floor(Number(range?.rawStartIndex)))),
        );
      }
      if (Number.isFinite(range?.rawEndIndex)) {
        search.set(
          "rawEndIndex",
          String(Math.max(0, Math.floor(Number(range?.rawEndIndex)))),
        );
      }
      if (range?.displayPeriod) {
        search.set("displayPeriod", range.displayPeriod);
      }
      return request<FreeReplayStartPointOverviewRange>(
        buildHttpApiRoute(
          DESKTOP_LOCAL_API_ROUTES.trainingFreeReplayStartPointOverview,
          {},
          Object.fromEntries(search.entries()),
        ),
        options,
      );
    },
    createSession: (
      symbol: string,
      timeframe = "1d",
      forceNew = false,
      anchorIndex?: number,
      options?: ApiRequestOptions & {
	        instrumentId?: string;
	        samplePoolId?: string;
	        minimumBaseTimeframe?: FreeReplayAdvancePeriod;
        sessionTradingSettings?: TradingSettings;
      },
    ) => {
      const {
        instrumentId,
        samplePoolId,
        minimumBaseTimeframe,
        sessionTradingSettings,
        ...requestOptions
      } = options ?? {};
      if (!String(instrumentId || "").trim()) {
        throw createApiError(
          "Instrument id is required for v1 session requests.",
          "INSTRUMENT_ID_REQUIRED",
          { symbol, timeframe },
          400,
        );
      }
      return request<Session>(DESKTOP_LOCAL_API_ROUTES.trainingFreeReplaySessions, {
        method: "POST",
        body: JSON.stringify({
          instrumentId,
          symbol,
          timeframe,
          minimumBaseTimeframe,
          forceNew,
          anchorIndex,
          samplePoolId,
          sessionTradingSettings,
        }),
        ...requestOptions,
      });
    },
    createSessionBootstrap: (
      symbol: string,
      timeframe = "1d",
      forceNew = false,
      anchorIndex?: number,
      options?: ApiRequestOptions & {
	        instrumentId?: string;
	        samplePoolId?: string;
	        minimumBaseTimeframe?: FreeReplayAdvancePeriod;
        sessionTradingSettings?: TradingSettings;
        backwardBars?: number;
        forwardBars?: number;
      },
    ) => {
      const {
        instrumentId,
        samplePoolId,
        minimumBaseTimeframe,
        sessionTradingSettings,
        backwardBars,
        forwardBars,
        ...requestOptions
      } =
        options ?? {};
      if (!String(instrumentId || "").trim()) {
        throw createApiError(
          "Instrument id is required for v1 session bootstrap requests.",
          "INSTRUMENT_ID_REQUIRED",
          { symbol, timeframe },
          400,
        );
      }
      return request<SessionBootstrap>(DESKTOP_LOCAL_API_ROUTES.trainingFreeReplaySessionsBootstrap, {
        method: "POST",
        body: JSON.stringify({
          instrumentId,
          symbol,
          timeframe,
          minimumBaseTimeframe,
          forceNew,
          anchorIndex,
          samplePoolId,
          sessionTradingSettings,
          backwardBars,
          forwardBars,
        }),
        ...requestOptions,
      });
    },
    startPreparedFreeReplaySession: (
      payload: {
        mode: "RANDOM" | "FOCUSED";
        selectedPoolId?: string;
	        selectedPoolName?: string;
	        selectedInstrumentId?: string;
	        selectedSymbol?: string;
	        selectedAnchorIndex?: number;
	        minimumBaseTimeframe?: FreeReplayAdvancePeriod;
        tradingEnvironment: ApiFreeReplayPoolDefaultEnvironment;
      },
      options?: ApiRequestOptions,
    ) =>
      request<PreparedFreeReplayStartResult>(
        DESKTOP_LOCAL_API_ROUTES.trainingFreeReplaySessionsStart,
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
      ),
    getFreeReplayPrepReadModel: (
      payload: ApiFreeReplayPrepReadModelRequest,
      options?: ApiRequestOptions,
    ) =>
      request<ApiFreeReplayPrepReadModel>(
        DESKTOP_LOCAL_API_ROUTES.trainingFreeReplayPrepReadModel,
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
      ),
    getFreeReplayStartReadiness: (
      payload: ApiFreeReplayStartReadinessRequest,
      options?: ApiRequestOptions,
    ) =>
      request<ApiFreeReplayStartReadiness>(
        DESKTOP_LOCAL_API_ROUTES.trainingFreeReplayStartReadiness,
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
      ),
    listFreeReplayPoolDefaultEnvironments: (options?: ApiRequestOptions) =>
      request<ApiFreeReplayPoolDefaultEnvironmentById>(
        DESKTOP_LOCAL_API_ROUTES.trainingFreeReplayPoolDefaultEnvironments,
        options,
      ),
    setFreeReplayPoolDefaultEnvironment: (
      poolId: string,
      payload: ApiFreeReplayPoolDefaultEnvironment,
      options?: ApiRequestOptions,
    ) =>
      request<ApiFreeReplayPoolDefaultEnvironmentById>(
        buildHttpApiRoute(
          DESKTOP_LOCAL_API_ROUTES.trainingFreeReplayPoolDefaultEnvironmentsPoolId,
          { poolId },
        ),
        {
          method: "PUT",
          body: JSON.stringify(payload),
          ...options,
        },
      ),
    cleanupStaleSessions: (keepSessionId?: string, options?: ApiRequestOptions) =>
      request<{
        keptSessionId: string | null;
        clearedSessions: number;
        accounts: Account[];
      }>(DESKTOP_LOCAL_API_ROUTES.trainingFreeReplaySessionsCleanupStale, {
        method: "POST",
        body: JSON.stringify(keepSessionId ? { keepSessionId } : {}),
        ...options,
      }),
    getLatestResumableSession: (options?: ApiRequestOptions) =>
      request<ResumableSessionSummary | null>(
        DESKTOP_LOCAL_API_ROUTES.trainingFreeReplaySessionsResumableLatest,
        options,
      ),
    getSessionBootstrapById: (
      sessionId: string,
      options?: ApiRequestOptions & {
        backwardBars?: number;
        forwardBars?: number;
      },
    ) => {
      const { backwardBars, forwardBars, ...requestOptions } = options ?? {};
      const params = new URLSearchParams();
      if (Number.isFinite(backwardBars) && Number(backwardBars) >= 0) {
        params.set("backwardBars", String(Math.max(0, Math.floor(Number(backwardBars)))));
      }
      if (Number.isFinite(forwardBars) && Number(forwardBars) >= 0) {
        params.set("forwardBars", String(Math.max(0, Math.floor(Number(forwardBars)))));
      }
      const query = params.toString();
      return request<SessionBootstrap>(
        buildHttpApiRoute(
          DESKTOP_LOCAL_API_ROUTES.trainingFreeReplaySessionsIdBootstrap,
          { id: sessionId },
          query ? Object.fromEntries(params.entries()) : undefined,
        ),
        requestOptions,
      );
    },
    getSnapshot: (
      sessionId: string,
      fillCursor?: string | null,
      options?: ApiRequestOptions,
    ) => {
      const params = new URLSearchParams();
      if (typeof fillCursor === "string" && fillCursor.trim()) {
        params.set("fillCursor", fillCursor.trim());
      }
      const query = params.toString();
      return request<SessionSnapshot>(
        buildHttpApiRoute(
          DESKTOP_LOCAL_API_ROUTES.trainingFreeReplaySessionsIdSnapshot,
          { id: sessionId },
          query ? Object.fromEntries(params.entries()) : undefined,
        ),
        options,
      );
    },
    updateSessionTradingSettings: (
      sessionId: string,
      payload: TradingSettings,
      options?: ApiRequestOptions,
    ) =>
      request<SessionSnapshot>(
        buildHttpApiRoute(
          DESKTOP_LOCAL_API_ROUTES.trainingFreeReplaySessionsIdTradingSettings,
          { id: sessionId },
        ),
        {
          method: "PUT",
          body: JSON.stringify(payload),
          ...options,
        },
      ),
    step: (
      sessionId: string,
      displayPeriod: DisplayPeriodKey,
      fillCursor: string | null | undefined = null,
      options?: ApiRequestOptions,
    ) =>
	      request<SessionStepResult>(buildHttpApiRoute(
          DESKTOP_LOCAL_API_ROUTES.trainingFreeReplaySessionsIdActions,
          { id: sessionId },
        ), {
        method: "POST",
        body: JSON.stringify({ action: "STEP", displayPeriod, fillCursor }),
        ...options,
      }),
    executeSessionAction: (
      sessionId: string,
      payload:
        | {
            action: "STEP";
            displayPeriod: DisplayPeriodKey;
            fillCursor?: string | null;
          }
        | {
            action: "PLAYBACK_TICK";
            displayPeriod: DisplayPeriodKey;
            fillCursor?: string | null;
          }
        | {
            action: "BUY" | "SELL";
            inputMode: "LOT" | "AMOUNT" | "RATIO";
            lotInput?: string | number | null;
            amountInput?: string | number | null;
            ratioInput?: string | number | null;
            priceMode: PriceMode;
            displayPeriod: DisplayPeriodKey;
            fillCursor?: string | null;
          }
        | {
            action: "UNDO";
            displayPeriod: DisplayPeriodKey;
            fillCursor?: string | null;
          },
      options?: ApiRequestOptions,
    ) =>
      request<SessionStepResult>(buildHttpApiRoute(
        DESKTOP_LOCAL_API_ROUTES.trainingFreeReplaySessionsIdActions,
        { id: sessionId },
      ), {
        method: "POST",
        body: JSON.stringify(payload),
        timeoutMs: TRAINER_HOT_ACTION_TIMEOUT_MS,
        ...options,
      }),
    setPlayback: (
      sessionId: string,
      intervalMs: number,
      isPaused: boolean,
      displayPeriod?: DisplayPeriodKey,
      options?: ApiRequestOptions,
    ) =>
      request<SessionStepResult>(buildHttpApiRoute(
        DESKTOP_LOCAL_API_ROUTES.trainingFreeReplaySessionsIdPlayback,
        { id: sessionId },
      ), {
        method: "POST",
        body: JSON.stringify({ intervalMs, isPaused, displayPeriod }),
        ...options,
      }),
    placeOrder: (
      sessionId: string,
      payload: {
        side: Side;
        inputMode: "LOT" | "AMOUNT" | "RATIO";
        lotInput?: string | number | null;
        amountInput?: string | number | null;
        ratioInput?: string | number | null;
        priceMode: PriceMode;
        displayPeriod: DisplayPeriodKey;
        fillCursor?: string | null;
      },
      options?: ApiRequestOptions,
    ) =>
      request<SessionStepResult>(buildHttpApiRoute(
        DESKTOP_LOCAL_API_ROUTES.trainingFreeReplaySessionsIdActions,
        { id: sessionId },
      ), {
        method: "POST",
        body: JSON.stringify({
          action: payload.side,
          inputMode: payload.inputMode,
          lotInput: payload.lotInput,
          amountInput: payload.amountInput,
          ratioInput: payload.ratioInput,
          priceMode: payload.priceMode,
          displayPeriod: payload.displayPeriod,
          fillCursor: payload.fillCursor,
        }),
        ...options,
      }),
    getSessionOrderQuote: (
      sessionId: string,
      payload: {
        side: Side;
        inputMode: "LOT" | "AMOUNT" | "RATIO";
        lotInput?: string | number | null;
        amountInput?: string | number | null;
        ratioInput?: string | number | null;
  	      priceMode: PriceMode;
  	      displayPeriod: DisplayPeriodKey;
      },
      options?: ApiRequestOptions,
    ) =>
      request<SessionOrderQuote>(buildHttpApiRoute(
        DESKTOP_LOCAL_API_ROUTES.trainingFreeReplaySessionsIdOrderQuote,
        { id: sessionId },
      ), {
        method: "POST",
        body: JSON.stringify(payload),
        ...options,
      }),
    getSessionOrderEstimationReadModel: (
      sessionId: string,
      payload: {
        side: Side;
        inputMode: "LOT" | "AMOUNT" | "RATIO";
        lotInput?: string | number | null;
        amountInput?: string | number | null;
        ratioInput?: string | number | null;
        priceMode: PriceMode;
        displayPeriod: DisplayPeriodKey;
      },
      options?: ApiRequestOptions,
    ) =>
      request<{
        buyAction: { enabled: boolean; reasonCode: string | null; facts: Record<string, unknown> };
        sellAction: { enabled: boolean; reasonCode: string | null; facts: Record<string, unknown> };
        buyDisabled: boolean;
        sellDisabled: boolean;
        buyBlockedReasonCode: string | null;
        sellBlockedReasonCode: string | null;
      }>(buildHttpApiRoute(
        DESKTOP_LOCAL_API_ROUTES.trainingFreeReplaySessionsIdOrderEstimationReadModel,
        { id: sessionId },
      ), {
        method: "POST",
        body: JSON.stringify(payload),
        ...options,
      }),
  getPortfolioSummary: () =>
      request<PortfolioSummary>(DESKTOP_LOCAL_API_ROUTES.trainingFreeReplayPortfolioSummary),
  getTradingSettings: (options?: ApiRequestOptions) =>
      request<TradingSettings>(DESKTOP_LOCAL_API_ROUTES.trainingFreeReplaySettingsTrading, options),
    updateTradingSettings: (
      payload: TradingSettings,
      options?: ApiRequestOptions,
    ) =>
      request<TradingSettings>(DESKTOP_LOCAL_API_ROUTES.trainingFreeReplaySettingsTrading, {
        method: "PUT",
        body: JSON.stringify(payload),
        ...options,
      })
});
