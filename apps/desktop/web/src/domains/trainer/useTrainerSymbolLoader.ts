// SPDX-License-Identifier: GPL-3.0-only

import {
  startTransition,
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import type {
  FreeReplayAdvancePeriod,
  SessionBootstrap,
  SessionSnapshot,
  TradingSettings,
} from "@/domains/training/types";
import { normalizeFreeReplayAdvancePeriod } from "@zinuto/shared/period";
import type { BuiltInSamplePoolConfig } from "@/domains/trainer/samplePools";
import type { BaseTimeframe, DisplayPeriodKey, ReplayBar } from "@/domains/trainer/trainerTypes";
import {
  TRAINER_LAUNCH_BACKWARD_BARS,
  TRAINER_LAUNCH_FORWARD_BARS,
  type TrainerHydrationState,
} from "@/domains/trainer/trainerHydration";
import { frameToReplayRange } from "@/domains/trainer/marketFrameStore";
import { applyTrainerFillEnvelopeToSnapshot } from "@/domains/trainer/trainerFillEnvelope";
import {
  createTrainerLaunchMetricTracker,
  resolveDisplayProgressBetweenRawIndexes,
  toBaseTimeframe,
  toDisplayPeriod,
  waitForNextAnimationFrame,
} from "@/domains/trainer/trainerSymbolLoaderProgress";
import {
  resolvePoolBaseTimeframe,
  resolveTrainingPoolState,
  type CustomSamplePoolLike,
  type TrainingPoolMeta,
} from "@/domains/trainer/trainerSymbolLoaderPoolResolvers";

type LoadSymbolOptions = {
  silentError?: boolean;
  forceNewSession?: boolean;
  cleanupStaleSessions?: boolean;
  instrumentId?: string;
  poolId?: string;
  poolName?: string;
  anchorIndex?: number;
};

type ResumeSessionOptions = {
  silentError?: boolean;
  preferredPoolId?: string;
  preferredPoolName?: string;
  symbol?: string;
  timeframe?: BaseTimeframe;
};

type UseTrainerSymbolLoaderParams = {
  appIsMountedRef: MutableRefObject<boolean>;
  symbolLoadRequestVersionRef: MutableRefObject<number>;
  symbolLoadAbortControllerRef: MutableRefObject<AbortController | null>;
  sessionIdRef: MutableRefObject<string | null>;
  snapshotRef: MutableRefObject<SessionSnapshot | null>;
  snapshotRequestVersionRef: MutableRefObject<number>;
  snapshotAbortControllerRef: MutableRefObject<AbortController | null>;
  ensureBarsForwardAbortControllerRef: MutableRefObject<AbortController | null>;
  ensureBarsBackwardAbortControllerRef: MutableRefObject<AbortController | null>;
  barsRef: MutableRefObject<ReplayBar[]>;
  barsOffsetRef: MutableRefObject<number>;
  barsTotalRef: MutableRefObject<number>;
  samplePoolAllId: string;
  samplePoolUnknownId: string;
  samplePoolUnknownName: () => string;
  customSamplePools: CustomSamplePoolLike[];
  includeSystemDefaultPool: boolean;
  findBuiltInSamplePoolById: (poolId: string) => BuiltInSamplePoolConfig | undefined;
  resolveBuiltInPoolBySymbol: (symbol: string) => BuiltInSamplePoolConfig | null;
  resolveSamplePoolDisplayName: (poolId: string, fallbackName?: string) => string;
  sanitizeSamplePoolName: (raw: string, fallback?: string) => string;
  setError: Dispatch<SetStateAction<string>>;
  setReplayUnavailableMessage: Dispatch<SetStateAction<string>>;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
  setTrainerHydrationState: Dispatch<SetStateAction<TrainerHydrationState>>;
  setBarsOffset: Dispatch<SetStateAction<number>>;
  setBarsTotal: Dispatch<SetStateAction<number>>;
  setBars: Dispatch<SetStateAction<ReplayBar[]>>;
  setBarsTimeZone: Dispatch<SetStateAction<string | null>>;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
  setSessionId: Dispatch<SetStateAction<string>>;
  setSelectedSymbol: Dispatch<SetStateAction<string>>;
  setSelectedInstrumentId: Dispatch<SetStateAction<string>>;
  setCurrentTrainingPoolMeta: Dispatch<SetStateAction<TrainingPoolMeta>>;
  setCurrentTrainingBaseTimeframe: Dispatch<SetStateAction<BaseTimeframe>>;
  setCurrentTrainingMinimumBaseTimeframe: Dispatch<SetStateAction<FreeReplayAdvancePeriod>>;
  setTrainerDisplayPeriod: Dispatch<SetStateAction<DisplayPeriodKey>>;
  setHint: Dispatch<SetStateAction<string>>;
  cleanupStaleSessionsRequest: (keepSessionId?: string) => Promise<unknown>;
  createSessionBootstrap: (
    symbol: string,
    timeframe: BaseTimeframe,
    forceNew: boolean,
    anchorIndex?: number,
    options?: {
      signal?: AbortSignal;
      instrumentId?: string;
      samplePoolId?: string;
      sessionTradingSettings?: TradingSettings;
      backwardBars?: number;
      forwardBars?: number;
    },
  ) => Promise<SessionBootstrap>;
  getSessionBootstrapById: (
    sessionId: string,
    options?: {
      signal?: AbortSignal;
      backwardBars?: number;
      forwardBars?: number;
    },
  ) => Promise<SessionBootstrap>;
  formatMoney: (value: number, fractionDigits?: number) => string;
  resolveSessionTradingSettingsByPoolId: (poolId?: string) => TradingSettings | undefined;
  applyResolvedTradingSettingsToForm?: (settings: TradingSettings) => void;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values?: Array<unknown>) => string;
};

const REQUEST_ABORTED_ERROR = "__SYMBOL_LOAD_ABORTED__";

export const useTrainerSymbolLoader = ({
  appIsMountedRef,
  symbolLoadRequestVersionRef,
  symbolLoadAbortControllerRef,
  sessionIdRef,
  snapshotRef,
  snapshotRequestVersionRef,
  snapshotAbortControllerRef,
  ensureBarsForwardAbortControllerRef,
  ensureBarsBackwardAbortControllerRef,
  barsRef,
  barsOffsetRef,
    barsTotalRef,
    samplePoolAllId,
    samplePoolUnknownId,
  samplePoolUnknownName,
  customSamplePools,
  includeSystemDefaultPool,
  findBuiltInSamplePoolById,
  resolveBuiltInPoolBySymbol,
  resolveSamplePoolDisplayName,
  sanitizeSamplePoolName,
  setError,
  setReplayUnavailableMessage,
  setIsBusy,
  setTrainerHydrationState,
  setBarsOffset,
  setBarsTotal,
  setBars,
  setBarsTimeZone,
  setSnapshot,
  setSessionId,
  setSelectedSymbol,
  setSelectedInstrumentId,
  setCurrentTrainingPoolMeta,
  setCurrentTrainingBaseTimeframe,
  setCurrentTrainingMinimumBaseTimeframe,
  setTrainerDisplayPeriod,
  setHint,
  cleanupStaleSessionsRequest,
  createSessionBootstrap,
  getSessionBootstrapById,
  formatMoney,
  resolveSessionTradingSettingsByPoolId,
  applyResolvedTradingSettingsToForm,
  tt,
  ttf,
}: UseTrainerSymbolLoaderParams) => {
  const commitBootstrappedSession = useCallback(
    ({
      bootstrap,
      preferredPoolId,
      preferredPoolName,
      fallbackSymbol,
      fallbackBaseTimeframe,
    }: {
      bootstrap: SessionBootstrap;
      preferredPoolId?: string;
      preferredPoolName?: string;
      fallbackSymbol?: string;
      fallbackBaseTimeframe: BaseTimeframe;
    }) => {
      const snapshot = applyTrainerFillEnvelopeToSnapshot(bootstrap.snapshot);
      const range = frameToReplayRange(bootstrap.chartFrame);
      const resolvedSessionId = String(
        snapshot.session.id || bootstrap.session.id || "",
      ).trim();
      const resolvedSymbol = String(
        snapshot.session.symbol ||
          bootstrap.session.symbol ||
          fallbackSymbol ||
          "",
      )
        .trim()
        .toUpperCase();
      if (!resolvedSessionId || !resolvedSymbol) {
        throw new Error(tt("appText.loading"));
      }
      const resolvedBaseTimeframe = toBaseTimeframe(
        snapshot.session.timeframe || bootstrap.session.timeframe,
        fallbackBaseTimeframe,
      );
      const resolvedMinimumBaseTimeframe = normalizeFreeReplayAdvancePeriod(
        snapshot.session.minimumBaseTimeframe,
        resolvedBaseTimeframe,
      );
      const resolvedDisplayPeriod = toDisplayPeriod(
        bootstrap.chartFrame.displayPeriod,
        resolvedMinimumBaseTimeframe,
      );
      const resolvedInstrumentId = String(
        snapshot.session.instrument_id || bootstrap.session.instrument_id || "",
      ).trim();
      const resolvedTrainingPool = resolveTrainingPoolState({
        symbol: resolvedSymbol,
        preferredPoolId,
        preferredPoolName,
        fallbackBaseTimeframe: resolvedBaseTimeframe,
        samplePoolAllId,
        samplePoolUnknownId,
        samplePoolUnknownName,
        customSamplePools,
        includeSystemDefaultPool,
        findBuiltInSamplePoolById,
        resolveBuiltInPoolBySymbol,
        resolveSamplePoolDisplayName,
        sanitizeSamplePoolName,
      });
      const resolvedTimeZone =
        typeof range.timeZone === "string" && range.timeZone.trim()
          ? range.timeZone
          : typeof snapshot.session.timeZone === "string" &&
              snapshot.session.timeZone.trim()
            ? snapshot.session.timeZone
            : null;
      barsOffsetRef.current = range.offset;
      barsTotalRef.current = range.total;
      barsRef.current = range.bars;
      sessionIdRef.current = resolvedSessionId;
      snapshotRef.current = snapshot;
      snapshotRequestVersionRef.current += 1;
      snapshotAbortControllerRef.current?.abort();
      snapshotAbortControllerRef.current = null;

      startTransition(() => {
        setSessionId(resolvedSessionId);
        setSelectedSymbol(resolvedSymbol);
        setSelectedInstrumentId(resolvedInstrumentId);
        setCurrentTrainingPoolMeta(resolvedTrainingPool.poolMeta);
        setCurrentTrainingBaseTimeframe(resolvedTrainingPool.baseTimeframe);
        setCurrentTrainingMinimumBaseTimeframe(resolvedMinimumBaseTimeframe);
        setTrainerDisplayPeriod(resolvedDisplayPeriod);
        setBarsOffset(range.offset);
        setBarsTotal(range.total);
        setBars(range.bars);
        setBarsTimeZone(resolvedTimeZone);
        if (snapshot.sessionTradingSettings) {
          applyResolvedTradingSettingsToForm?.(snapshot.sessionTradingSettings);
        }
        setSnapshot(snapshot);
      });

      return {
        sessionId: resolvedSessionId,
        symbol: resolvedSymbol,
        range,
        snapshot,
      };
    },
    [
      barsOffsetRef,
      barsRef,
      barsTotalRef,
      sessionIdRef,
      snapshotAbortControllerRef,
      snapshotRef,
      snapshotRequestVersionRef,
      customSamplePools,
      applyResolvedTradingSettingsToForm,
      findBuiltInSamplePoolById,
      includeSystemDefaultPool,
      resolveBuiltInPoolBySymbol,
      resolveSamplePoolDisplayName,
      samplePoolAllId,
      samplePoolUnknownId,
      samplePoolUnknownName,
      sanitizeSamplePoolName,
      setBars,
      setBarsOffset,
      setBarsTimeZone,
      setBarsTotal,
      setCurrentTrainingBaseTimeframe,
      setCurrentTrainingMinimumBaseTimeframe,
      setCurrentTrainingPoolMeta,
      setSelectedInstrumentId,
      setSelectedSymbol,
      setSessionId,
      setSnapshot,
      setTrainerDisplayPeriod,
      tt,
    ],
  );

  const loadSymbol = useCallback(
    async (symbol: string, options?: LoadSymbolOptions) => {
      const upper = symbol.trim().toUpperCase();
      if (!upper) {
        return "";
      }
      symbolLoadRequestVersionRef.current += 1;
      const requestVersion = symbolLoadRequestVersionRef.current;
      symbolLoadAbortControllerRef.current?.abort();
      ensureBarsForwardAbortControllerRef.current?.abort();
      ensureBarsBackwardAbortControllerRef.current?.abort();
      const abortController = new AbortController();
      symbolLoadAbortControllerRef.current = abortController;
      const isRequestActive = () =>
        appIsMountedRef.current &&
        symbolLoadRequestVersionRef.current === requestVersion &&
        !abortController.signal.aborted;
      const throwIfRequestInactive = () => {
        if (!isRequestActive()) {
          throw new Error(REQUEST_ABORTED_ERROR);
        }
      };
      const launchMetrics = createTrainerLaunchMetricTracker(requestVersion);
      const bootstrapRequestStartMark =
        launchMetrics.mark("bootstrap-request-start");

      setError("");
      setReplayUnavailableMessage("");
      setIsBusy(true);
      setTrainerHydrationState("LAUNCHING");

      try {
        const targetBaseTimeframe = resolvePoolBaseTimeframe({
          symbol: upper,
          poolId: options?.poolId,
          samplePoolAllId,
          customSamplePools,
          findBuiltInSamplePoolById,
          resolveBuiltInPoolBySymbol,
        });
        const bootstrap = await createSessionBootstrap(
          upper,
          targetBaseTimeframe,
          Boolean(options?.forceNewSession),
          options?.anchorIndex,
          {
            signal: abortController.signal,
            instrumentId: options?.instrumentId,
            samplePoolId: options?.poolId,
            sessionTradingSettings: resolveSessionTradingSettingsByPoolId(
              options?.poolId,
            ),
            backwardBars: TRAINER_LAUNCH_BACKWARD_BARS,
            forwardBars: TRAINER_LAUNCH_FORWARD_BARS,
          },
        );
        const bootstrapRequestEndMark =
          launchMetrics.mark("bootstrap-request-end");
        launchMetrics.measure(
          "bootstrapRequestMs",
          bootstrapRequestStartMark,
          bootstrapRequestEndMark,
        );
        throwIfRequestInactive();

        setTrainerHydrationState("HYDRATING");
        const committed = commitBootstrappedSession({
          bootstrap,
          preferredPoolId: options?.poolId,
          preferredPoolName: options?.poolName,
          fallbackSymbol: upper,
          fallbackBaseTimeframe: targetBaseTimeframe,
        });
        const stateCommitMark = launchMetrics.mark("state-commit");
        launchMetrics.measure(
          "stateCommitMs",
          bootstrapRequestEndMark,
          stateCommitMark,
        );
        launchMetrics.setValue("initialBarsCount", committed.range.bars.length);
        launchMetrics.setValue("didFullRawRead", false);

        if (options?.cleanupStaleSessions) {
          void cleanupStaleSessionsRequest(committed.sessionId).catch(() => undefined);
        }

        const { consumed, future } = resolveDisplayProgressBetweenRawIndexes({
          bars: committed.range.bars,
          offset: committed.range.offset,
          total: committed.range.total,
          startRawIndex: committed.snapshot.session.start_index,
          cursorRawIndex: committed.snapshot.session.cursor_index,
        });
        setHint(
          ttf("appText.loadedValue0TotalValue1LinesHistoryValue2FutureValue3", [
            committed.symbol,
            formatMoney(committed.range.total, 0),
            formatMoney(consumed, 0),
            formatMoney(future, 0),
          ]),
        );

        await waitForNextAnimationFrame();
        throwIfRequestInactive();
        const firstChartPaintMark = launchMetrics.mark("first-chart-paint");
        launchMetrics.measure(
          "firstChartResetMs",
          stateCommitMark,
          firstChartPaintMark,
        );
        setTrainerHydrationState("READY");
        const firstActionableMark = launchMetrics.mark("first-actionable");
        launchMetrics.measure(
          "firstActionableMs",
          bootstrapRequestStartMark,
          firstActionableMark,
        );
        launchMetrics.flush();
        return committed.sessionId;
      } catch (error) {
        if (
          (error instanceof Error && error.message === REQUEST_ABORTED_ERROR) ||
          !isRequestActive()
        ) {
          return "";
        }
        const message = tt("appText.loading");
        setTrainerHydrationState("FAILED");
        setReplayUnavailableMessage(message);
        if (!options?.silentError) {
          setError(message);
        }
        return "";
      } finally {
        launchMetrics.cleanup();
        if (symbolLoadAbortControllerRef.current === abortController) {
          symbolLoadAbortControllerRef.current = null;
        }
        if (
          appIsMountedRef.current &&
          symbolLoadRequestVersionRef.current === requestVersion
        ) {
          setIsBusy(false);
        }
      }
    },
    [
      appIsMountedRef,
      cleanupStaleSessionsRequest,
      commitBootstrappedSession,
      createSessionBootstrap,
      ensureBarsBackwardAbortControllerRef,
      ensureBarsForwardAbortControllerRef,
      formatMoney,
      resolveSessionTradingSettingsByPoolId,
      customSamplePools,
      findBuiltInSamplePoolById,
      resolveBuiltInPoolBySymbol,
      samplePoolAllId,
      setError,
      setHint,
      setIsBusy,
      setReplayUnavailableMessage,
      setTrainerHydrationState,
      symbolLoadAbortControllerRef,
      symbolLoadRequestVersionRef,
      tt,
      ttf,
    ],
  );

  const resumeSessionById = useCallback(
    async (sessionId: string, options?: ResumeSessionOptions) => {
      const normalizedSessionId = String(sessionId || "").trim();
      if (!normalizedSessionId) {
        return "";
      }

      symbolLoadRequestVersionRef.current += 1;
      const requestVersion = symbolLoadRequestVersionRef.current;
      symbolLoadAbortControllerRef.current?.abort();
      ensureBarsForwardAbortControllerRef.current?.abort();
      ensureBarsBackwardAbortControllerRef.current?.abort();
      const abortController = new AbortController();
      symbolLoadAbortControllerRef.current = abortController;
      const isRequestActive = () =>
        appIsMountedRef.current &&
        symbolLoadRequestVersionRef.current === requestVersion &&
        !abortController.signal.aborted;
      const throwIfRequestInactive = () => {
        if (!isRequestActive()) {
          throw new Error(REQUEST_ABORTED_ERROR);
        }
      };
      const launchMetrics = createTrainerLaunchMetricTracker(requestVersion);
      const bootstrapRequestStartMark =
        launchMetrics.mark("bootstrap-request-start");

      setError("");
      setReplayUnavailableMessage("");
      setIsBusy(true);
      setTrainerHydrationState("LAUNCHING");

      try {
        const hintedTimeframe = toBaseTimeframe(options?.timeframe, "1d");
        const bootstrap = await getSessionBootstrapById(normalizedSessionId, {
          signal: abortController.signal,
          backwardBars: TRAINER_LAUNCH_BACKWARD_BARS,
          forwardBars: TRAINER_LAUNCH_FORWARD_BARS,
        });
        const bootstrapRequestEndMark =
          launchMetrics.mark("bootstrap-request-end");
        launchMetrics.measure(
          "bootstrapRequestMs",
          bootstrapRequestStartMark,
          bootstrapRequestEndMark,
        );
        throwIfRequestInactive();

        setTrainerHydrationState("HYDRATING");
        const committed = commitBootstrappedSession({
          bootstrap,
          preferredPoolId: options?.preferredPoolId,
          preferredPoolName: options?.preferredPoolName,
          fallbackSymbol: options?.symbol,
          fallbackBaseTimeframe: hintedTimeframe,
        });
        const stateCommitMark = launchMetrics.mark("state-commit");
        launchMetrics.measure(
          "stateCommitMs",
          bootstrapRequestEndMark,
          stateCommitMark,
        );
        launchMetrics.setValue("initialBarsCount", committed.range.bars.length);
        launchMetrics.setValue("didFullRawRead", false);

        const { consumed, future } = resolveDisplayProgressBetweenRawIndexes({
          bars: committed.range.bars,
          offset: committed.range.offset,
          total: committed.range.total,
          startRawIndex: committed.snapshot.session.start_index,
          cursorRawIndex: committed.snapshot.session.cursor_index,
        });
        setHint(
          ttf("appText.loadedValue0TotalValue1LinesHistoryValue2FutureValue3", [
            committed.symbol,
            formatMoney(committed.range.total, 0),
            formatMoney(consumed, 0),
            formatMoney(future, 0),
          ]),
        );

        await waitForNextAnimationFrame();
        throwIfRequestInactive();
        const firstChartPaintMark = launchMetrics.mark("first-chart-paint");
        launchMetrics.measure(
          "firstChartResetMs",
          stateCommitMark,
          firstChartPaintMark,
        );
        setTrainerHydrationState("READY");
        const firstActionableMark = launchMetrics.mark("first-actionable");
        launchMetrics.measure(
          "firstActionableMs",
          bootstrapRequestStartMark,
          firstActionableMark,
        );
        launchMetrics.flush();
        return normalizedSessionId;
      } catch (error) {
        if (
          (error instanceof Error && error.message === REQUEST_ABORTED_ERROR) ||
          !isRequestActive()
        ) {
          return "";
        }
        const message = tt("appText.loading");
        setTrainerHydrationState("FAILED");
        setReplayUnavailableMessage(message);
        if (!options?.silentError) {
          setError(message);
        }
        return "";
      } finally {
        launchMetrics.cleanup();
        if (symbolLoadAbortControllerRef.current === abortController) {
          symbolLoadAbortControllerRef.current = null;
        }
        if (
          appIsMountedRef.current &&
          symbolLoadRequestVersionRef.current === requestVersion
        ) {
          setIsBusy(false);
        }
      }
    },
    [
      appIsMountedRef,
      commitBootstrappedSession,
      ensureBarsBackwardAbortControllerRef,
      ensureBarsForwardAbortControllerRef,
      formatMoney,
      getSessionBootstrapById,
      setError,
      setIsBusy,
      setReplayUnavailableMessage,
      setTrainerHydrationState,
      symbolLoadAbortControllerRef,
      symbolLoadRequestVersionRef,
      tt,
      ttf,
    ],
  );

  return {
    applySessionBootstrap: (
      bootstrap: SessionBootstrap,
      options: {
        preferredPoolId?: string;
        preferredPoolName?: string;
        fallbackSymbol?: string;
        fallbackBaseTimeframe: BaseTimeframe;
      },
    ) =>
      commitBootstrappedSession({
        bootstrap,
        preferredPoolId: options.preferredPoolId,
        preferredPoolName: options.preferredPoolName,
        fallbackSymbol: options.fallbackSymbol,
        fallbackBaseTimeframe: options.fallbackBaseTimeframe,
      }),
    loadSymbol,
    resumeSessionById,
  };
};
