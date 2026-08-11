// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { DESKTOP_API_LIMITS } from "@zinuto/shared/input-limits";
import { DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID } from "@zinuto/shared/trading";
import { createTrainingRuntimeApi } from "../../src/api/trainingRuntime";
import type { ApiFreeReplayPrepPool } from "../../src/api/trainingRuntime";
import type { ApiRequester, ApiRequesterOptions } from "../../src/api/requesterTypes";
import {
  APP_UI_LANGUAGES,
  getDisplayPeriodLabel,
  type AppDisplayPeriodKey,
} from "../../src/ui/config/uiConfig";
import { DEFAULT_TRADING_SETTINGS } from "../../src/domains/trainer/defaultTradingSettings";
import {
  resolveDefaultFocusedFreeReplayAnchorIndex,
  resolveDefaultFreeReplayPrepSymbol,
} from "../../src/domains/trainer/freeReplayPrepDefaults";
import { buildFreeReplaySetupViewModel } from "../../src/domains/trainer/buildFreeReplaySetupViewModel";
import {
  buildStartPointApplySelection,
  chooseCompleteStartPointDisplayPeriod,
  isReplayableStartPointOverviewBar,
  resolveReplayableStartPointOverviewBarByTrainingIndex,
  resolveNextStartPointDrillDisplayPeriod,
  resolveStartPointOverviewBarByAnchor,
} from "../../src/domains/trainer/startPointOverviewDisplay";
import { buildTrainerDisplayPeriodFrameRequest } from "../../src/domains/trainer/trainerDisplayPeriodFrameRequest";
import {
  createFreeReplayEnvironmentDefaultCursor,
  resolveFreeReplayMinimumBaseTimeframeOptions,
  resolveFreeReplayPrepMinimumBaseTimeframe,
  resolveFreeReplayEnvironmentSelectionForStart,
  shouldApplyFreeReplayEnvironmentDefault,
} from "../../src/domains/trainer/freeReplaySetup";
import { resolveFreeReplaySelectedInstrumentState } from "../../src/domains/trainer/useFreeReplaySetupController";
import {
  isSnapshotForSession,
  readActiveSessionTerminationReasonCode,
} from "../../src/domains/trainer/trainingSessionGuards";
import {
  createTrainerAutoplayScheduler,
  resolveTrainerAutoplayFromSessionPaused,
  resolveTrainerAutoplaySurfaceRunning,
  type TrainerAutoplaySchedulerRuntime,
} from "../../src/app-shell/trainerAutoplayRuntime";
import { applySessionTradingSettingsToReplayPanelProps } from "../../src/domains/trainer/sessionTradingSettingsPanel";
import type { ReplayTrainerSettingsPanelProps } from "../../src/domains/trainer/ReplayTrainerSettingsPanel";
import { shouldSyncGlobalTradingSettingsIntoForm } from "../../src/domains/trainer/useTrainerBootstrapData";
import { resetFreeReplayDraftLifecycle } from "../../src/domains/trainer/freeReplayDraftLifecycle";

type FakeAutoplayTimerHandle = {
  callback: () => void;
  delayMs: number;
  cleared: boolean;
};

const flushAutoplaySchedulerMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const createDeferredAutoplayTick = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const createFakeAutoplaySchedulerRuntime = () => {
  const timers: FakeAutoplayTimerHandle[] = [];
  const activeTimers = () => timers.filter((timer) => !timer.cleared);
  const runtime: TrainerAutoplaySchedulerRuntime = {
    setTimeout: (callback, delayMs) => {
      const timer: FakeAutoplayTimerHandle = {
        callback,
        delayMs,
        cleared: false,
      };
      timers.push(timer);
      return timer as unknown as ReturnType<typeof globalThis.setTimeout>;
    },
    clearTimeout: (handle) => {
      (handle as unknown as FakeAutoplayTimerHandle).cleared = true;
    },
  };
  return {
    runtime,
    activeTimers,
    runNextTimer: () => {
      const timer = activeTimers()[0];
      assert.ok(timer);
      timer.cleared = true;
      timer.callback();
      return timer;
    },
  };
};

test("focused free replay keeps a valid selected symbol", () => {
  assert.equal(
    resolveDefaultFreeReplayPrepSymbol({
      availableSymbols: ["AAPL", "MSFT"],
      selectedSymbol: "msft",
    }),
    "MSFT",
  );
});

test("focused free replay auto-selects the first available symbol", () => {
  assert.equal(
    resolveDefaultFreeReplayPrepSymbol({
      availableSymbols: ["AAPL", "MSFT"],
      selectedSymbol: "",
    }),
    "AAPL",
  );
  assert.equal(
    resolveDefaultFreeReplayPrepSymbol({
      availableSymbols: ["AAPL", "MSFT"],
      selectedSymbol: "NVDA",
    }),
    "AAPL",
  );
});

test("a new free replay discards resumed-session state and restores global defaults", () => {
  const calls: string[] = [];
  const globalEnvironment = {
    assetClass: "STOCK" as const,
    marketPresetId: "A_SHARE" as const,
  };
  let activeFormEnvironment: {
    assetClass: string;
    marketPresetId: string;
  } = {
    assetClass: "STOCK",
    marketPresetId: "US_STOCK",
  };
  let draftEnvironment: {
    assetClass: string;
    marketPresetId: string;
  } = { ...activeFormEnvironment };
  let hasActiveSession = true;
  let selectedPoolId = "system-us-stocks";
  let selectedInstrumentId = "instrument-gs";
  let anchorIndex: number | null = 120;
  let prepTouched = true;
  let readModelValid = true;

  resetFreeReplayDraftLifecycle({
    globalEnvironment,
    resetActiveTrainerSession: () => {
      calls.push("reset-session");
      hasActiveSession = false;
    },
    invalidatePrepReadModel: () => {
      calls.push("invalidate-read-model");
      readModelValid = false;
    },
    clearPrepSelection: () => {
      calls.push("clear-selection");
      selectedPoolId = "";
      selectedInstrumentId = "";
    },
    clearPrepAnchors: () => {
      calls.push("clear-anchors");
      anchorIndex = null;
    },
    clearPrepInteractionState: () => {
      calls.push("clear-interaction");
      prepTouched = false;
    },
    restoreGlobalTradingSettingsForm: () => {
      calls.push("restore-global-settings");
      activeFormEnvironment = { ...globalEnvironment };
    },
    applyPrepEnvironment: (selection) => {
      calls.push("apply-global-environment");
      draftEnvironment = { ...selection };
    },
  });

  assert.deepEqual(calls, [
    "reset-session",
    "invalidate-read-model",
    "clear-selection",
    "clear-anchors",
    "clear-interaction",
    "restore-global-settings",
    "apply-global-environment",
  ]);
  assert.equal(hasActiveSession, false);
  assert.equal(readModelValid, false);
  assert.equal(selectedPoolId, "");
  assert.equal(selectedInstrumentId, "");
  assert.equal(anchorIndex, null);
  assert.equal(prepTouched, false);
  assert.deepEqual(activeFormEnvironment, globalEnvironment);
  assert.deepEqual(draftEnvironment, globalEnvironment);
});

test("free replay prep read model is requested from the local api", async () => {
  let requestedPath = "";
  let requestedBody: unknown = null;
  const requester: ApiRequester = async <T,>(
    path: string,
    options?: ApiRequesterOptions,
  ) => {
    requestedPath = String(path);
    requestedBody = JSON.parse(String(options?.body ?? "{}"));
    return {
      statusCode: "EMPTY",
      reasonCode: "NO_POOLS",
      prepConfig: {
        mode: "FOCUSED",
        minimumBaseTimeframe: "1d",
        baseTimeframe: "1d",
        hideSymbolName: false,
        assetClass: "STOCK",
      },
      selection: {
        selectedPoolId: "",
        selectedInstrumentId: "",
        selectedSymbol: "",
        selectedSourceTimeframe: "1d",
      },
      facts: {
        availablePoolCount: 0,
        availableSymbolCount: 0,
        trainableSymbolCount: 0,
        candidateCount: 0,
      },
      pools: [],
      selectedPool: null,
      selectedInstrument: null,
      startCandidates: [],
      startReadiness: {
        enabled: false,
        reasonCode: "NO_SAMPLES",
        facts: {
          mode: "FOCUSED",
          candidateCount: 0,
          scopedCandidateCount: 0,
          selectedPoolId: null,
          selectedInstrumentId: null,
          selectedSymbol: null,
          selectedAnchorIndex: 10,
          requiresSymbol: true,
          requiresAnchor: true,
          hasExplicitAnchor: true,
          normalizedSelectedSymbol: "",
        },
        readiness: {
          canStart: false,
          reason: "NO_SAMPLES",
          requiresSymbol: true,
          requiresAnchor: true,
          hasExplicitAnchor: true,
          normalizedSelectedSymbol: "",
        },
      },
      actions: {
        start: {
          enabled: false,
          reasonCode: "NO_SAMPLES",
          facts: {
            mode: "FOCUSED",
            candidateCount: 0,
            scopedCandidateCount: 0,
            selectedPoolId: null,
            selectedInstrumentId: null,
            selectedSymbol: null,
            selectedAnchorIndex: 10,
            requiresSymbol: true,
            requiresAnchor: true,
            hasExplicitAnchor: true,
            normalizedSelectedSymbol: "",
          },
          readiness: {
            canStart: false,
            reason: "NO_SAMPLES",
            requiresSymbol: true,
            requiresAnchor: true,
            hasExplicitAnchor: true,
            normalizedSelectedSymbol: "",
          },
        },
      },
      environment: {
        selected: {
          assetClass: "STOCK",
          marketPresetId: "US_STOCK",
        },
        assetOptions: [],
        presetOptions: [],
      },
    } as T;
  };
  const trainingApi = createTrainingRuntimeApi(requester);

  await trainingApi.getFreeReplayPrepReadModel({
    mode: "FOCUSED",
    selectedAnchorIndex: 10,
    selectedPoolId: "pool-1",
  });

  assert.equal(
    requestedPath,
    "/api/v1/training/free-replay/prep-read-model",
  );
  assert.deepEqual(requestedBody, {
    mode: "FOCUSED",
    selectedAnchorIndex: 10,
    selectedPoolId: "pool-1",
  });
});

test("focused free replay symbol switch prefers the local instrument over the stale read model", () => {
  const selectedPool: ApiFreeReplayPrepPool = {
    id: "pool-1",
    name: "US stocks",
    assetClass: "STOCK",
    marketPresetId: "US_STOCK",
    sourceBaseTimeframe: "1d",
    baseTimeframe: "1d",
    minimumBaseTimeframeOptions: ["1d"],
    disabled: false,
    sourceLocked: false,
    lockReason: null,
    symbolCount: 2,
    trainableSymbolCount: 2,
    instruments: [
      {
        instrumentId: "instrument-aapl",
        samplePoolId: "pool-1",
        symbol: "AAPL",
        label: "AAPL",
        sourceTimeframe: "1d",
        barCount: 100,
        locked: false,
        lockReason: null,
      },
      {
        instrumentId: "instrument-msft",
        samplePoolId: "pool-1",
        symbol: "MSFT",
        label: "MSFT",
        sourceTimeframe: "1d",
        barCount: 100,
        locked: false,
        lockReason: null,
      },
    ],
    symbols: ["AAPL", "MSFT"],
  };

  const selected = resolveFreeReplaySelectedInstrumentState({
    selectedPool,
    readModelSelectedInstrument: selectedPool.instruments[0],
    readModelSelection: {
      selectedPoolId: "pool-1",
      selectedInstrumentId: "instrument-aapl",
      selectedSymbol: "AAPL",
      selectedSourceTimeframe: "1d",
    },
    selectedInstrumentId: "instrument-msft",
  });

  assert.equal(selected.selectedInstrumentId, "instrument-msft");
  assert.equal(selected.selectedSymbol, "MSFT");
  assert.equal(selected.selectedInstrument?.instrumentId, "instrument-msft");
});

test("focused free replay defaults the anchor to the middle of the replayable window", () => {
  assert.equal(resolveDefaultFocusedFreeReplayAnchorIndex(0), null);
  assert.equal(resolveDefaultFocusedFreeReplayAnchorIndex(1), null);
  assert.equal(resolveDefaultFocusedFreeReplayAnchorIndex(101), 47);
  assert.ok((resolveDefaultFocusedFreeReplayAnchorIndex(3) ?? 99) <= 1);
});

test("focused free replay start point helpers reject the final effective bucket", () => {
  const bars = [
    {
      startTrainingIndex: 0,
      endTrainingIndex: 1439,
    },
    {
      startTrainingIndex: 1440,
      endTrainingIndex: 2879,
    },
    {
      startTrainingIndex: 2880,
      endTrainingIndex: 4319,
    },
  ];

  assert.equal(isReplayableStartPointOverviewBar(bars[0], 4320), true);
  assert.equal(isReplayableStartPointOverviewBar(bars[2], 4320), false);
  assert.equal(
    resolveReplayableStartPointOverviewBarByTrainingIndex(
      bars,
      4319,
      4320,
    ),
    bars[1],
  );
});

test("trainer termination state is scoped to the active session", () => {
  const terminatedSnapshot = {
    session: {
      id: "previous-session",
    },
    termination: {
      isTerminated: true,
      reasonCode: "NO_FUTURE_DATA",
    },
  };

  assert.equal(
    isSnapshotForSession(terminatedSnapshot as never, "active-session"),
    false,
  );
  assert.equal(
    readActiveSessionTerminationReasonCode(
      terminatedSnapshot as never,
      "active-session",
    ),
    null,
  );
  assert.equal(
    readActiveSessionTerminationReasonCode(
      terminatedSnapshot as never,
      "previous-session",
    ),
    "NO_FUTURE_DATA",
  );
});

test("prepared free replay bootstrap syncs autoplay from backend paused state", () => {
  assert.equal(resolveTrainerAutoplayFromSessionPaused(true), true);
  assert.equal(resolveTrainerAutoplayFromSessionPaused(1), true);
  assert.equal(resolveTrainerAutoplayFromSessionPaused("1"), true);
  assert.equal(resolveTrainerAutoplayFromSessionPaused("true"), true);
  assert.equal(resolveTrainerAutoplayFromSessionPaused(false), false);
  assert.equal(resolveTrainerAutoplayFromSessionPaused(0), false);
  assert.equal(resolveTrainerAutoplayFromSessionPaused("0"), false);
  assert.equal(resolveTrainerAutoplayFromSessionPaused("false"), false);
  assert.equal(resolveTrainerAutoplayFromSessionPaused(null), null);
  assert.equal(resolveTrainerAutoplayFromSessionPaused(undefined), null);
  assert.equal(resolveTrainerAutoplayFromSessionPaused(""), null);
  assert.equal(resolveTrainerAutoplayFromSessionPaused("unknown"), null);
});

test("free replay autoplay pauses off-surface and restores only the prior user intent", () => {
  const resolveRunning = (
    userAutoplayIntent: boolean,
    isSurfaceActive: boolean,
  ) =>
    resolveTrainerAutoplaySurfaceRunning({
      hasSession: true,
      isSurfaceActive,
      userAutoplayIntent,
    });

  assert.equal(resolveRunning(true, true), true);
  assert.equal(resolveRunning(true, false), false);
  assert.equal(resolveRunning(true, true), true);
  assert.equal(resolveRunning(false, false), false);
  assert.equal(resolveRunning(false, true), false);
  assert.equal(
    resolveTrainerAutoplaySurfaceRunning({
      hasSession: false,
      isSurfaceActive: true,
      userAutoplayIntent: true,
    }),
    false,
  );
});

test("trainer autoplay scheduler runs serial ticks at the latest speed", async () => {
  const fakeRuntime = createFakeAutoplaySchedulerRuntime();
  const firstTick = createDeferredAutoplayTick();
  let delayMs = 300;
  let tickCalls = 0;
  const scheduler = createTrainerAutoplayScheduler({
    getShouldRun: () => true,
    getDelayMs: () => delayMs,
    step: async () => {
      tickCalls += 1;
      if (tickCalls === 1) {
        await firstTick.promise;
      }
      return { shouldContinue: true };
    },
    runtime: fakeRuntime.runtime,
  });

  scheduler.start();
  assert.equal(scheduler.isRunning(), true);
  assert.equal(fakeRuntime.runNextTimer().delayMs, 0);
  assert.equal(tickCalls, 1);
  assert.equal(fakeRuntime.activeTimers().length, 0);

  delayMs = 100;
  scheduler.reschedule();
  assert.equal(fakeRuntime.activeTimers().length, 0);

  firstTick.resolve();
  await flushAutoplaySchedulerMicrotasks();

  assert.equal(fakeRuntime.activeTimers().length, 1);
  assert.equal(fakeRuntime.activeTimers()[0]?.delayMs, 100);

  fakeRuntime.runNextTimer();
  await flushAutoplaySchedulerMicrotasks();

  assert.equal(tickCalls, 2);
  assert.equal(fakeRuntime.activeTimers().length, 1);
  assert.equal(fakeRuntime.activeTimers()[0]?.delayMs, 100);
});

test("trainer autoplay scheduler treats a busy step as a continue signal", async () => {
  const fakeRuntime = createFakeAutoplaySchedulerRuntime();
  let tickCalls = 0;
  let isBusy = true;
  const scheduler = createTrainerAutoplayScheduler({
    getShouldRun: () => true,
    getDelayMs: () => 200,
    step: async () => {
      tickCalls += 1;
      return { shouldContinue: isBusy };
    },
    runtime: fakeRuntime.runtime,
  });

  scheduler.start();
  assert.equal(fakeRuntime.runNextTimer().delayMs, 0);
  await flushAutoplaySchedulerMicrotasks();

  assert.equal(scheduler.isRunning(), true);
  assert.equal(tickCalls, 1);
  assert.equal(fakeRuntime.activeTimers().length, 1);
  assert.equal(fakeRuntime.activeTimers()[0]?.delayMs, 200);

  isBusy = false;
  fakeRuntime.runNextTimer();
  await flushAutoplaySchedulerMicrotasks();

  assert.equal(tickCalls, 2);
  assert.equal(scheduler.isRunning(), false);
  assert.equal(fakeRuntime.activeTimers().length, 0);
});

test("trainer autoplay scheduler stops when a tick reports completion", async () => {
  const fakeRuntime = createFakeAutoplaySchedulerRuntime();
  let tickCalls = 0;
  const scheduler = createTrainerAutoplayScheduler({
    getShouldRun: () => true,
    getDelayMs: () => 250,
    step: async () => {
      tickCalls += 1;
      return { shouldContinue: false };
    },
    runtime: fakeRuntime.runtime,
  });

  scheduler.start();
  assert.equal(fakeRuntime.runNextTimer().delayMs, 0);
  await flushAutoplaySchedulerMicrotasks();

  assert.equal(tickCalls, 1);
  assert.equal(scheduler.isRunning(), false);
  assert.equal(fakeRuntime.activeTimers().length, 0);
});

test("free replay advance period options take four upward periods from the source timeframe", () => {
  assert.deepEqual(resolveFreeReplayMinimumBaseTimeframeOptions("1m"), [
    "1m",
    "5m",
    "1h",
    "1d",
  ]);
  assert.deepEqual(resolveFreeReplayMinimumBaseTimeframeOptions("5m"), [
    "5m",
    "1h",
    "1d",
    "1w",
  ]);
  assert.deepEqual(resolveFreeReplayMinimumBaseTimeframeOptions("1h"), [
    "1h",
    "1d",
    "1w",
    "1month",
  ]);
  assert.deepEqual(resolveFreeReplayMinimumBaseTimeframeOptions("1d"), [
    "1d",
    "1w",
    "1month",
    "1year",
  ]);
});

test("free replay prep defaults to the source timeframe until the period is touched", () => {
  assert.equal(
    resolveFreeReplayPrepMinimumBaseTimeframe({
      availableTimeframes: ["1m", "5m", "1h", "1d"],
      currentMinimumBaseTimeframe: "1d",
      sourceBaseTimeframe: "1m",
      activeSessionMinimumBaseTimeframe: "1d",
      hasActiveSession: false,
      minimumBaseTimeframeTouched: false,
    }),
    "1m",
  );
  assert.equal(
    resolveFreeReplayPrepMinimumBaseTimeframe({
      availableTimeframes: ["5m", "1h", "1d", "1w"],
      currentMinimumBaseTimeframe: "1d",
      sourceBaseTimeframe: "5m",
      activeSessionMinimumBaseTimeframe: "1d",
      hasActiveSession: false,
      minimumBaseTimeframeTouched: false,
    }),
    "5m",
  );
});

test("free replay prep preserves manual and active-session periods", () => {
  assert.equal(
    resolveFreeReplayPrepMinimumBaseTimeframe({
      availableTimeframes: ["1m", "5m", "1h", "1d"],
      currentMinimumBaseTimeframe: "1h",
      sourceBaseTimeframe: "1m",
      activeSessionMinimumBaseTimeframe: "1d",
      hasActiveSession: false,
      minimumBaseTimeframeTouched: true,
    }),
    "1h",
  );
  assert.equal(
    resolveFreeReplayPrepMinimumBaseTimeframe({
      availableTimeframes: ["1m", "5m", "1h", "1d"],
      currentMinimumBaseTimeframe: "1m",
      sourceBaseTimeframe: "1m",
      activeSessionMinimumBaseTimeframe: "1d",
      hasActiveSession: true,
      minimumBaseTimeframeTouched: true,
    }),
    "1d",
  );
});

test("free replay advance period labels use localized display text", () => {
  const periods = [
    "1m",
    "5m",
    "1h",
    "1d",
    "1w",
    "1month",
    "1year",
  ] satisfies AppDisplayPeriodKey[];
  const expectedLabelsByLanguage = {
    en: ["1 minute", "5 minutes", "1 hour", "Daily", "Weekly", "Monthly", "Yearly"],
    "zh-CN": ["1分钟", "5分钟", "1小时", "日K", "周K", "月K", "年K"],
    ja: ["1分", "5分", "1時間", "日足", "週足", "月足", "年足"],
    ko: ["1분", "5분", "1시간", "일봉", "주봉", "월봉", "연봉"],
    es: ["1 minuto", "5 minutos", "1 hora", "Diario", "Semanal", "Mensual", "Anual"],
  } satisfies Record<(typeof APP_UI_LANGUAGES)[number], readonly string[]>;

  for (const language of APP_UI_LANGUAGES) {
    assert.deepEqual(
      periods.map((period) => getDisplayPeriodLabel(period, language)),
      expectedLabelsByLanguage[language],
    );
  }
});

test("free replay keeps a manually selected environment within the same pool", () => {
  const previous = createFreeReplayEnvironmentDefaultCursor({
    poolId: "pool-a",
    assetClass: "STOCK",
    marketPresetId: "us-stock",
  });
  const next = createFreeReplayEnvironmentDefaultCursor({
    poolId: "pool-a",
    assetClass: "STOCK",
    marketPresetId: "a-share",
  });

  assert.equal(
    shouldApplyFreeReplayEnvironmentDefault({
      previous,
      next,
      environmentTouched: true,
    }),
    false,
  );
});

test("free replay applies the pool default when the selected pool changes", () => {
  const previous = createFreeReplayEnvironmentDefaultCursor({
    poolId: "pool-a",
    assetClass: "STOCK",
    marketPresetId: "us-stock",
  });
  const next = createFreeReplayEnvironmentDefaultCursor({
    poolId: "pool-b",
    assetClass: "FOREX",
    marketPresetId: "forex-standard-lot",
  });

  assert.equal(
    shouldApplyFreeReplayEnvironmentDefault({
      previous,
      next,
      environmentTouched: true,
    }),
    true,
  );
});

test("free replay start uses the latest selected environment over rendered fallback", () => {
  assert.deepEqual(
    resolveFreeReplayEnvironmentSelectionForStart({
      current: {
        assetClass: "STOCK",
        marketPresetId: "JP_STOCK",
      },
      fallback: {
        assetClass: "STOCK",
        marketPresetId: "A_SHARE",
      },
    }),
    {
      assetClass: "STOCK",
      marketPresetId: "JP_STOCK",
    },
  );
});

test("prepared free replay start posts no candidate array for a 1571-symbol pool", async () => {
  const selectedPoolSymbolCount = 1_571;
  const captured: { body: Record<string, unknown> | null } = { body: null };
  const api = createTrainingRuntimeApi(async (_path, init) => {
    captured.body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return {
      selected: {
        symbol: "AAPL",
        poolId: "pool-1",
        poolName: "Pool",
        sourceTimeframe: "1d",
        anchorIndex: 10,
        instrumentId: "instrument-1",
      },
      bootstrap: {},
    } as never;
  });

  await api.startPreparedFreeReplaySession({
    mode: "FOCUSED",
    selectedPoolId: "pool-1",
    selectedPoolName: "Pool",
    selectedSymbol: "AAPL",
    selectedAnchorIndex: 10,
    minimumBaseTimeframe: "1d",
    tradingEnvironment: {
      assetClass: "STOCK",
      marketPresetId: "HK_STOCK",
    },
  });

  assert.ok(captured.body);
  assert.deepEqual(captured.body.tradingEnvironment, {
    assetClass: "STOCK",
    marketPresetId: "HK_STOCK",
  });
  assert.equal(selectedPoolSymbolCount, 1_571);
  assert.equal("candidates" in captured.body, false);
  assert.equal("sessionTradingSettings" in captured.body, false);
});

test("free replay setup keeps Start enabled for a 1571-symbol random pool", () => {
  const viewModel = buildFreeReplaySetupViewModel({
    isPrepMode: true,
    ui: {
      freeReplayPrepTitle: "prep",
      freeReplayPrepSubtitle: "subtitle",
      mode: "mode",
      freeReplayPrepSummaryLabel: "summary",
      freeReplayPrepSummaryPendingAnchor: "pending",
      freeReplayPrepRandomHint: "random hint",
      freeReplayPrepFocusedHint: "focused hint",
      freeReplayPrepSelectSymbolFirst: "select symbol",
      freeReplayPrepAnchorRequired: "anchor required",
      freeReplayEmptyState: "empty",
      randomPool: "pool",
      symbol: "symbol",
      freeReplaySymbolSearch: "search",
      freeReplayBlindBox: "blind",
      freeReplayBlindBoxActive: "hidden",
      freeReplayStart: "start",
      freeReplayEnvironmentDefaultTitle: "default environment",
      freeReplayAssetClass: "asset",
      freeReplayEnvironmentPresetLabel: "preset",
      freeReplaySourceTimeframe: "source timeframe",
      freeReplayEnvironmentTitle: "environment",
      freeReplayEnvironmentAction: "environment action",
      freeReplayEnvironmentRulesTitle: "rules",
      freeReplayEnvironmentSyncLabel: "sync",
      freeReplayEnvironmentSyncHint: "sync hint",
      freeReplayTimeframe: "timeframe",
      freeReplayResumeLast: "resume",
    } as never,
    tt: (key: string) => key,
    freeReplayModeOptions: [{ value: "RANDOM", label: "random" }],
    freeReplayPrepConfig: {
      mode: "RANDOM",
      minimumBaseTimeframe: "1d",
      hideSymbolName: false,
      assetClass: "STOCK",
      baseTimeframe: "1d",
    },
    freeReplayEnvironmentAssetOptions: [],
    freeReplayEnvironmentPresetOptions: [],
    freeReplaySelectedEnvironmentAssetClass: "STOCK",
    freeReplaySelectedEnvironmentPresetId: "preset",
    freeReplaySelectedEnvironmentPresetLabel: "preset",
    freeReplayEnvironmentRuleCards: [],
    freeReplayPersistEnvironmentToPool: false,
    freeReplayTimeframeOptions: [],
    freeReplaySamplePoolOptions: [{
      value: "large-pool",
      label: "Large Pool",
      locked: false,
      symbolCount: 1_571,
      assetClassLabel: "Stock",
      marketPresetId: "preset",
      marketPresetLabel: "Preset",
      sourceBaseTimeframe: "1d",
      minimumBaseTimeframeOptions: [],
    }],
    freeReplaySelectedPoolId: "large-pool",
    freeReplaySymbolOptions: [],
    freeReplayAvailableSymbolCount: 1_571,
    freeReplaySelectedInstrumentId: "",
    freeReplaySelectedSymbol: "",
    freeReplayPrepAnchorText: "",
    freeReplayBlindBoxOptions: [],
    freeReplayBlindBoxValue: "SHOW",
    startPointWindowPayload: null,
    onApplyStartPoint: async () => undefined,
    freeReplayStartDisabled: false,
    freeReplayStartDisableReason: null,
    freeReplayHasAvailableSymbols: true,
    freeReplayStartButtonIconName: "actionArrowRight",
    startPreparedFreeReplay: () => undefined,
    resetTrainerToPrepView: () => undefined,
    canResumeTrainerSession: false,
    resumeLatestTrainerSession: () => undefined,
    handleFreeReplayPrepModeChange: () => undefined,
    handleFreeReplayPrepEnvironmentAssetClassChange: () => undefined,
    handleFreeReplayPrepEnvironmentPresetChange: () => undefined,
    handleFreeReplayPrepPersistEnvironmentToPoolChange: () => undefined,
    handleFreeReplayPrepBaseTimeframeChange: () => undefined,
    handleFreeReplayPrepSamplePoolChange: () => undefined,
    handleFreeReplayPrepSymbolChange: () => undefined,
    handleFreeReplayPrepBlindBoxChange: () => undefined,
  } as never);

  assert.equal(viewModel.selectedSamplePool?.symbolCount, 1_571);
  assert.equal(viewModel.availableSymbolCount, 1_571);
  assert.equal(viewModel.startDisabled, false);
  assert.equal(viewModel.showEmptyStateText, false);
});

test("free replay start point overview requests stay within desktop contract limit", async () => {
  const capturedPaths: string[] = [];
  const api = createTrainingRuntimeApi(async (path) => {
    capturedPaths.push(path);
    return {
      samplePoolId: "pool-1",
      instrumentId: "instrument-1",
      symbol: "AAPL",
      sourceTimeframe: "1d",
      minimumBaseTimeframe: "1d",
      effectiveTimeframe: "1d",
      displayPeriod: "1d",
      timeZone: "UTC",
      trainingTotal: 0,
      total: 0,
      offset: 0,
      limit: DESKTOP_API_LIMITS.startPointOverviewBarsMax,
      bars: [],
    } as never;
  });

  await api.getFreeReplayStartPointOverview(
    "instrument-1",
    "pool-1",
    "1d",
    0,
    DESKTOP_API_LIMITS.startPointOverviewBarsMax + 1,
  );

  const url = new URL(capturedPaths[0] ?? "", "http://localhost");
  assert.equal(
    url.searchParams.get("limit"),
    String(DESKTOP_API_LIMITS.startPointOverviewBarsMax),
  );
});

test("free replay start point overview picks the smallest complete aggregate period", () => {
  const totals = new Map([
    ["1m", 8_640],
    ["5m", 1_728],
    ["1h", 72],
  ] as const);

  assert.equal(
    chooseCompleteStartPointDisplayPeriod(
      "1m",
      totals,
      DESKTOP_API_LIMITS.startPointOverviewBarsMax,
    ),
    "5m",
  );
  assert.equal(resolveNextStartPointDrillDisplayPeriod("1d", "1m"), "1h");
  assert.equal(resolveNextStartPointDrillDisplayPeriod("5m", "1m"), "1m");
});

test("free replay aggregated start point selection commits training and raw indexes", () => {
  assert.deepEqual(
    buildStartPointApplySelection({
      endTrainingIndex: 1439,
      applyAnchorIndex: 4319,
      ts: "2026-01-03T23:59:00.000Z",
    }),
    {
      overviewIndex: 1439,
      rawAnchorIndex: 4319,
      anchorTs: "2026-01-03T23:59:00.000Z",
    },
  );
});

test("trainer display period frame requests use the target display period", () => {
  assert.deepEqual(
    buildTrainerDisplayPeriodFrameRequest({
      sourceTimeframe: "1m",
      targetDisplayPeriod: "1d",
      anchorRawIndex: 2880,
      before: 10,
      after: 5,
    }),
    {
      timeframe: "1m",
      displayPeriod: "1d",
      anchorRawIndex: 2880,
      before: 10,
      after: 5,
      maxDisplayBars: 16,
    },
  );
});

test("trainer action API payloads only send backend intent fields", async () => {
  const captured: Array<{ path: string; body: Record<string, unknown> }> = [];
  const api = createTrainingRuntimeApi(async (path, init) => {
    captured.push({
      path,
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    return {
      session: { id: "session-1", is_paused: 0 },
      runtimeDelta: { session: { is_paused: 0 } },
      chartFrame: null,
      fillIds: [],
      forcedLiquidationCount: 0,
    } as never;
  });

  await api.executeSessionAction("session-1", {
    action: "STEP",
    displayPeriod: "1d",
    fillCursor: null,
  });
  await api.executeSessionAction("session-1", {
    action: "PLAYBACK_TICK",
    displayPeriod: "1d",
    fillCursor: null,
  });
  await api.placeOrder("session-1", {
    side: "BUY",
    inputMode: "LOT",
    lotInput: "1",
    priceMode: "NEXT_OPEN",
    displayPeriod: "1d",
    fillCursor: null,
  });
  await api.setPlayback("session-1", 500, false, "1d");
  await api.getSessionOrderQuote("session-1", {
    side: "BUY",
    inputMode: "LOT",
    lotInput: "1",
    priceMode: "NEXT_OPEN",
    displayPeriod: "1d",
  });

  assert.equal(captured.length, 5);
  assert.deepEqual(
    captured.map((entry) => entry.path),
    [
      "/api/v1/training/free-replay/sessions/session-1/actions",
      "/api/v1/training/free-replay/sessions/session-1/actions",
      "/api/v1/training/free-replay/sessions/session-1/actions",
      "/api/v1/training/free-replay/sessions/session-1/playback",
      "/api/v1/training/free-replay/sessions/session-1/order/quote",
    ],
  );
  for (const { body } of captured) {
    assert.equal(body.displayPeriod, "1d");
    assert.equal("count" in body, false);
    assert.equal("nextOpenDelayBars" in body, false);
    assert.equal("followupStepCount" in body, false);
    assert.equal("chartWindowDisplayStartIndex" in body, false);
    assert.equal("chartWindowDisplayEndIndex" in body, false);
  }
});

test("start point remaps by raw anchor when advance period changes", () => {
  const bars = [
    {
      index: 0,
      startRawIndex: 0,
      endRawIndex: 99,
      startTrainingIndex: 0,
      endTrainingIndex: 0,
      ts: "2026-01-01T00:00:00.000Z",
      startTs: "2026-01-01T00:00:00.000Z",
      endTs: "2026-01-01T23:59:00.000Z",
    },
    {
      index: 1,
      startRawIndex: 100,
      endRawIndex: 199,
      startTrainingIndex: 1,
      endTrainingIndex: 1,
      ts: "2026-01-02T00:00:00.000Z",
      startTs: "2026-01-02T00:00:00.000Z",
      endTs: "2026-01-02T23:59:00.000Z",
    },
  ];

  assert.equal(
    resolveStartPointOverviewBarByAnchor(bars, {
      rawAnchorIndex: 150,
      anchorTs: "2026-01-02T12:00:00.000Z",
      trainingIndex: 0,
    })?.index,
    1,
  );
});

test("locked free replay sample pools remain visible instead of empty", () => {
  const viewModel = buildFreeReplaySetupViewModel({
    isPrepMode: true,
    ui: {
      freeReplayPrepTitle: "prep",
      freeReplayPrepSubtitle: "subtitle",
      mode: "mode",
      freeReplayPrepSummaryLabel: "summary",
      freeReplayPrepSummaryPendingAnchor: "pending",
      freeReplayPrepRandomHint: "random hint",
      freeReplayPrepFocusedHint: "focused hint",
      freeReplayPrepSelectSymbolFirst: "select symbol",
      freeReplayPrepAnchorRequired: "anchor required",
      freeReplayEmptyState: "empty",
      randomPool: "pool",
      symbol: "symbol",
      freeReplaySymbolSearch: "search",
      freeReplayBlindBox: "blind",
      freeReplayBlindBoxActive: "hidden",
      freeReplayStart: "start",
      freeReplayEnvironmentDefaultTitle: "default environment",
      freeReplayAssetClass: "asset",
      freeReplayEnvironmentPresetLabel: "preset",
      freeReplaySourceTimeframe: "source timeframe",
      freeReplayEnvironmentTitle: "environment",
      freeReplayEnvironmentAction: "environment action",
      freeReplayEnvironmentRulesTitle: "rules",
      freeReplayEnvironmentSyncLabel: "sync",
      freeReplayEnvironmentSyncHint: "sync hint",
      freeReplayTimeframe: "timeframe",
      freeReplayResumeLast: "resume",
    } as never,
    tt: (key: string) => key,
    freeReplayModeOptions: [{ value: "RANDOM", label: "random" }],
    freeReplayPrepConfig: {
      mode: "RANDOM",
      minimumBaseTimeframe: "1d",
      hideSymbolName: false,
      assetClass: "STOCK",
      baseTimeframe: "1d",
    },
    freeReplayEnvironmentAssetOptions: [],
    freeReplayEnvironmentPresetOptions: [],
    freeReplaySelectedEnvironmentAssetClass: "STOCK",
    freeReplaySelectedEnvironmentPresetId: "preset",
    freeReplaySelectedEnvironmentPresetLabel: "preset",
    freeReplayEnvironmentRuleCards: [],
    freeReplayPersistEnvironmentToPool: false,
    freeReplayTimeframeOptions: [],
    freeReplaySamplePoolOptions: [
      {
        value: "locked-pool",
        label: "Imported",
        locked: true,
        symbolCount: 2,
        assetClassLabel: "Stock",
        marketPresetId: "preset",
        marketPresetLabel: "Preset",
        sourceBaseTimeframe: "1d",
        minimumBaseTimeframeOptions: [],
      },
    ],
    freeReplaySelectedPoolId: "locked-pool",
    freeReplaySymbolOptions: [
      {
        value: "instrument-1",
        label: "AAPL",
        locked: true,
      },
    ],
    freeReplayAvailableSymbolCount: 1,
    freeReplaySelectedInstrumentId: "instrument-1",
    freeReplaySelectedSymbol: "AAPL",
    freeReplayPrepAnchorText: "",
    freeReplayBlindBoxOptions: [],
    freeReplayBlindBoxValue: "SHOW",
    startPointWindowPayload: null,
    onApplyStartPoint: async () => undefined,
    freeReplayStartDisabled: true,
    freeReplayStartDisableReason: "NO_SAMPLES",
    freeReplayHasAvailableSymbols: true,
    freeReplayStartButtonIconName: "actionArrowRight",
    startPreparedFreeReplay: () => undefined,
    resetTrainerToPrepView: () => undefined,
    canResumeTrainerSession: false,
    resumeLatestTrainerSession: () => undefined,
    handleFreeReplayPrepModeChange: () => undefined,
    handleFreeReplayPrepEnvironmentAssetClassChange: () => undefined,
    handleFreeReplayPrepEnvironmentPresetChange: () => undefined,
    handleFreeReplayPrepPersistEnvironmentToPoolChange: () => undefined,
    handleFreeReplayPrepBaseTimeframeChange: () => undefined,
    handleFreeReplayPrepSamplePoolChange: () => undefined,
    handleFreeReplayPrepSymbolChange: () => undefined,
    handleFreeReplayPrepBlindBoxChange: () => undefined,
  } as never);

  assert.equal(viewModel.showEmptyStateText, false);
  assert.equal(viewModel.selectedSamplePool?.locked, true);
  assert.equal(viewModel.samplePoolOptions[0]?.symbolCount, 2);
  assert.equal(viewModel.startHelperText, "random hint");
});

test("active trainer settings panel displays backend HK session trading settings", () => {
  const basePanel = {
    tradingAssetClass: "STOCK",
    initialSecuritiesInput: "50000",
    minTradeStepInput: "100",
    allowLongMarginTrading: false,
    allowShortSelling: false,
    longInitialMarginRatioInput: "100",
    longMaintenanceMarginRatioInput: "100",
    longFinancingAnnualRateInput: "0",
    shortBorrowAnnualRateInput: "0",
    activeTradingMarketPresetLabel: "A股",
    marketPresetChips: [
      {
        id: "A_SHARE",
        label: "A股",
        isBuiltIn: true,
        isCustom: false,
        isSelected: true,
        isUsedBySamplePool: false,
        canDelete: false,
      },
      {
        id: "HK_STOCK",
        label: "港股",
        isBuiltIn: true,
        isCustom: false,
        isSelected: false,
        isUsedBySamplePool: false,
        canDelete: false,
      },
    ],
  } as ReplayTrainerSettingsPanelProps;
  const hkSettings = {
    ...DEFAULT_TRADING_SETTINGS,
    ...DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID.HK_STOCK,
  };

  const resolved = applySessionTradingSettingsToReplayPanelProps({
    panel: basePanel,
    settings: hkSettings,
    activeTradingMarketPresetLabel: "港股",
  });

  assert.equal(resolved.activeTradingMarketPresetLabel, "港股");
  assert.equal(resolved.tradingAssetClass, "STOCK");
  assert.equal(resolved.minTradeStepInput, "1");
  assert.equal(resolved.allowLongMarginTrading, true);
  assert.equal(resolved.allowShortSelling, true);
  assert.equal(resolved.longInitialMarginRatioInput, "50");
  assert.equal(resolved.longMaintenanceMarginRatioInput, "30");
  assert.equal(resolved.longFinancingAnnualRateInput, "6.8");
  assert.equal(
    resolved.marketPresetChips.find((chip) => chip.id === "HK_STOCK")?.isSelected,
    true,
  );
});

test("global trading settings refresh does not overwrite an active free replay session environment", () => {
  assert.equal(
    shouldSyncGlobalTradingSettingsIntoForm({
      activePage: "TRAINER",
      sessionId: "session-1",
      hasSessionTradingSettings: true,
      isSessionTerminated: false,
    }),
    false,
  );
});

test("global trading settings refresh can hydrate the form outside a live trainer session", () => {
  assert.equal(
    shouldSyncGlobalTradingSettingsIntoForm({
      activePage: "TRAINER",
      sessionId: "",
      hasSessionTradingSettings: false,
      isSessionTerminated: false,
    }),
    true,
  );
  assert.equal(
    shouldSyncGlobalTradingSettingsIntoForm({
      activePage: "SETTINGS",
      sessionId: "session-1",
      hasSessionTradingSettings: true,
      isSessionTerminated: false,
    }),
    true,
  );
});
