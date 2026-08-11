// SPDX-License-Identifier: GPL-3.0-only

import { getDisplayPeriodLabel, PERIOD_TITLE_BY_LANGUAGE } from "@/ui/config/uiConfig";
import type { KLineData } from "klinecharts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  normalizeValidationInstrumentSymbol,
  selectValidationInstrumentFromFacts,
} from "@/workspaces/custom-indicator/validationInstrumentSelection";
import {
  readValidationSamplePoolOptions,
  readValidationSymbolsForPool,
} from "@/workspaces/custom-indicator/validationInstrumentCatalog";
import {
  mergeValidationKlineData,
  resolveValidationLoadMoreState,
  toValidationFrameMeta,
  toValidationKlineData,
  type ValidationMarketFrameMeta,
  type ValidationMarketLoadMoreResult,
} from "@/workspaces/custom-indicator/validationMarketFrameUi";
import { api, type ApiDesktopWorkspaceReadModel } from "@/api";
import {
  TRAINER_BACKGROUND_FETCH_MAX_BARS,
  TRAINER_LAUNCH_BACKWARD_BARS,
  TRAINER_LAUNCH_FORWARD_BARS,
} from "@/domains/trainer/trainerHydration";
import type {
  CatalogLoadState,
  CustomIndicatorSystemPageProps,
  MarketLoadState,
} from "@/workspaces/custom-indicator/customIndicatorWorkbenchTypes";
import type {
  readCustomIndicatorValidationFacts,
} from "@/workspaces/custom-indicator/customIndicatorWorkspaceReadModelUi";

const VALIDATION_SYMBOL = "AAPL";
const VALIDATION_INITIAL_FRAME_LIMIT =
  TRAINER_LAUNCH_BACKWARD_BARS + TRAINER_LAUNCH_FORWARD_BARS + 1;
const VALIDATION_LOAD_MORE_FRAME_LIMIT = TRAINER_BACKGROUND_FETCH_MAX_BARS;

type ValidationFacts = ReturnType<typeof readCustomIndicatorValidationFacts>;

type CustomIndicatorWorkbenchMarketStateArgs = Pick<
  CustomIndicatorSystemPageProps,
  "language" | "ui"
> & {
  customIndicatorValidationFacts: ValidationFacts;
  setCustomIndicatorReadModel: (model: ApiDesktopWorkspaceReadModel | null) => void;
  appendConsoleLog: (level: "info" | "success" | "error", message: string) => void;
  reportCustomIndicatorError: (
    error: unknown,
    context: "market-load",
    fallback?: string,
  ) => string;
  resolveSamplePoolDisplayName: (
    samplePoolId: string,
    fallbackName?: string,
  ) => string;
};

export const useCustomIndicatorWorkbenchMarketState = ({
  language,
  ui,
  customIndicatorValidationFacts,
  setCustomIndicatorReadModel,
  appendConsoleLog,
  reportCustomIndicatorError,
  resolveSamplePoolDisplayName,
}: CustomIndicatorWorkbenchMarketStateArgs) => {
  const chartDataRef = useRef<KLineData[]>([]);
  const activeValidationSymbolRef = useRef(VALIDATION_SYMBOL);
  const effectiveValidationDisplayPeriodRef = useRef<"1d" | string>("1d");
  const marketLoadVersionRef = useRef(0);
  const catalogLoadVersionRef = useRef(0);
  const marketFrameMetaRef = useRef<ValidationMarketFrameMeta | null>(null);
  const loadMoreValidationBarsRef = useRef<
    (
      direction: "backward" | "forward",
    ) => Promise<ValidationMarketLoadMoreResult>
  >(async () => ({
    data: [],
    hasBackward: false,
    hasForward: false,
  }));
  const prefetchValidationBarsRef = useRef<
    (direction: "backward" | "forward") => Promise<void>
  >(async () => undefined);
  const validationPrefetchKeyRef = useRef("");

  const [activeSamplePoolId, setActiveSamplePoolId] =
    useState(() => customIndicatorValidationFacts.defaultSamplePoolId);
  const [validationSymbol, setValidationSymbol] = useState(
    () => customIndicatorValidationFacts.defaultSymbol ?? VALIDATION_SYMBOL,
  );
  const [validationDisplayPeriod, setValidationDisplayPeriod] = useState(
    () => customIndicatorValidationFacts.defaultDisplayPeriod,
  );
  const [marketData, setMarketData] = useState<KLineData[]>([]);
  const [marketDataVersionToken, setMarketDataVersionToken] = useState(0);
  const [marketDataResetToken, setMarketDataResetToken] = useState(0);
  const [marketLoadState, setMarketLoadState] =
    useState<MarketLoadState>("idle");
  const [, setMarketLoadTotal] = useState(0);
  const [, setMarketLoadLoaded] = useState(0);
  const [marketLoadError, setMarketLoadError] = useState("");
  const [catalogLoadError, setCatalogLoadError] = useState("");
  const [catalogLoadState, setCatalogLoadState] =
    useState<CatalogLoadState>("idle");

  const samplePoolOptions = useMemo(
    () =>
      readValidationSamplePoolOptions(customIndicatorValidationFacts).map(
        (option) => ({
          ...option,
          name:
            option.id === customIndicatorValidationFacts.allPoolId
              ? ui.statsAllSamplePools
              : resolveSamplePoolDisplayName(option.id, option.name),
        }),
      ),
    [
      customIndicatorValidationFacts,
      resolveSamplePoolDisplayName,
      ui.statsAllSamplePools,
    ],
  );
  const symbolOptions = useMemo(
    () =>
      readValidationSymbolsForPool(
        customIndicatorValidationFacts,
        activeSamplePoolId,
      ),
    [activeSamplePoolId, customIndicatorValidationFacts],
  );
  const activeSamplePool = useMemo(
    () =>
      samplePoolOptions.find((pool) => pool.id === activeSamplePoolId) ??
      samplePoolOptions.find(
        (pool) => pool.id === customIndicatorValidationFacts.allPoolId,
      ) ??
      null,
    [
      activeSamplePoolId,
      customIndicatorValidationFacts.allPoolId,
      samplePoolOptions,
    ],
  );
  const resolvedValidationInstrument = useMemo(
    () =>
      selectValidationInstrumentFromFacts({
        facts: customIndicatorValidationFacts,
        samplePoolId: activeSamplePoolId,
        symbol: validationSymbol,
      }),
    [activeSamplePoolId, customIndicatorValidationFacts, validationSymbol],
  );
  const activeValidationSymbol = useMemo(
    () =>
      resolvedValidationInstrument?.symbol ||
      normalizeValidationInstrumentSymbol(validationSymbol),
    [resolvedValidationInstrument, validationSymbol],
  );
  const validationInstrumentId = String(
    resolvedValidationInstrument?.id || "",
  ).trim();
  const validationInstrumentBarCount = Math.max(
    0,
    Math.floor(Number(resolvedValidationInstrument?.barCount) || 0),
  );
  const validationPeriodOptions = useMemo(
    () =>
      resolvedValidationInstrument?.displayPeriodOptions ??
      activeSamplePool?.displayPeriodOptions ??
      [customIndicatorValidationFacts.defaultDisplayPeriod],
    [
      activeSamplePool,
      customIndicatorValidationFacts.defaultDisplayPeriod,
      resolvedValidationInstrument,
    ],
  );
  const validationPeriodSelectOptions = useMemo(
    () =>
      validationPeriodOptions.map((period) => ({
        value: period,
        label: getDisplayPeriodLabel(period, language),
      })),
    [language, validationPeriodOptions],
  );
  const effectiveValidationDisplayPeriod = validationPeriodOptions.includes(
    validationDisplayPeriod,
  )
    ? validationDisplayPeriod
    : resolvedValidationInstrument?.defaultDisplayPeriod ??
      activeSamplePool?.defaultDisplayPeriod ??
      customIndicatorValidationFacts.defaultDisplayPeriod;
  const validationPeriodTitle = PERIOD_TITLE_BY_LANGUAGE[language];
  const validationSymbolOptions = useMemo(
    () =>
      symbolOptions.map((symbol) => ({
        value: symbol,
        label: symbol,
      })),
    [symbolOptions],
  );
  chartDataRef.current = marketData;
  activeValidationSymbolRef.current = activeValidationSymbol || VALIDATION_SYMBOL;
  effectiveValidationDisplayPeriodRef.current =
    effectiveValidationDisplayPeriod;

  const loadSelectionOptions = useCallback(
    async (options: { signal?: AbortSignal } = {}) => {
      const runVersion = catalogLoadVersionRef.current + 1;
      catalogLoadVersionRef.current = runVersion;
      setCatalogLoadState("loading");
      try {
        const model = await api.getWorkspaceReadModel("custom-indicator", {
          signal: options.signal,
        });
        if (options.signal?.aborted || catalogLoadVersionRef.current !== runVersion) {
          return;
        }
        setCatalogLoadError("");
        setCatalogLoadState("ready");
        setCustomIndicatorReadModel(model);
      } catch (error) {
        if (options.signal?.aborted || catalogLoadVersionRef.current !== runVersion) {
          return;
        }
        const message = ui.customIndicatorDataLoadFailed;
        setCatalogLoadError(message);
        setCatalogLoadState("error");
        setCustomIndicatorReadModel(null);
        appendConsoleLog("error", message);
      }
    },
    [
      appendConsoleLog,
      setCustomIndicatorReadModel,
      ui.customIndicatorDataLoadFailed,
    ],
  );

  const loadMarketData = useCallback(async () => {
    const runVersion = marketLoadVersionRef.current + 1;
    marketLoadVersionRef.current = runVersion;
    if (
      !validationInstrumentId ||
      customIndicatorValidationFacts.readiness.statusCode !== "READY"
    ) {
      setMarketLoadState("idle");
      setMarketLoadError("");
      chartDataRef.current = [];
      marketFrameMetaRef.current = null;
      setMarketData([]);
      setMarketDataVersionToken((current) => current + 1);
      setMarketDataResetToken((current) => current + 1);
      setMarketLoadLoaded(0);
      setMarketLoadTotal(0);
      return;
    }

    setMarketLoadState("loading");
    setMarketLoadError("");
    setMarketLoadLoaded(0);
    setMarketLoadTotal(0);

    try {
      const frame = await api.getInstrumentBarsFrame(
        validationInstrumentId,
        0,
        VALIDATION_INITIAL_FRAME_LIMIT,
        {
          displayPeriod: effectiveValidationDisplayPeriod,
          direction: "BACKWARD",
          anchorRawIndex: Math.max(0, validationInstrumentBarCount - 1),
          before: TRAINER_LAUNCH_BACKWARD_BARS,
          after: TRAINER_LAUNCH_FORWARD_BARS,
          maxDisplayBars: VALIDATION_INITIAL_FRAME_LIMIT,
        },
      );
      if (marketLoadVersionRef.current !== runVersion) {
        return;
      }

      const nextBars = toValidationKlineData(frame);
      const nextMeta = toValidationFrameMeta(frame);
      chartDataRef.current = nextBars;
      marketFrameMetaRef.current = nextMeta;
      setMarketLoadLoaded(nextBars.length);
      setMarketLoadTotal(nextMeta.totalDisplay);
      setMarketData(nextBars);
      setMarketDataVersionToken((current) => current + 1);
      setMarketDataResetToken((current) => current + 1);
      setMarketLoadState("ready");
    } catch (error) {
      if (marketLoadVersionRef.current !== runVersion) {
        return;
      }
      const message = reportCustomIndicatorError(
        error,
        "market-load",
        ui.customIndicatorDataLoadFailed,
      );
      setMarketLoadState("error");
      setMarketLoadError(message);
      chartDataRef.current = [];
      marketFrameMetaRef.current = null;
      setMarketData([]);
      setMarketDataVersionToken((current) => current + 1);
      setMarketDataResetToken((current) => current + 1);
      setMarketLoadLoaded(0);
      setMarketLoadTotal(0);
    }
  }, [
    customIndicatorValidationFacts.readiness.statusCode,
    effectiveValidationDisplayPeriod,
    reportCustomIndicatorError,
    ui.customIndicatorDataLoadFailed,
    validationInstrumentBarCount,
    validationInstrumentId,
  ]);

  const commitValidationFrame = useCallback(
    (
      direction: "backward" | "forward",
      currentMeta: ValidationMarketFrameMeta,
      frame: Awaited<ReturnType<typeof api.getInstrumentBarsFrame>>,
      fetchedBars: KLineData[],
    ): ValidationMarketFrameMeta => {
      const frameMeta = toValidationFrameMeta(frame);
      const nextBars = mergeValidationKlineData(
        direction,
        chartDataRef.current,
        fetchedBars,
      );
      const nextMeta: ValidationMarketFrameMeta = {
        displayStartIndex: Math.min(
          currentMeta.displayStartIndex,
          frameMeta.displayStartIndex,
        ),
        displayEndIndex: Math.max(
          currentMeta.displayEndIndex,
          frameMeta.displayEndIndex,
        ),
        totalDisplay: Math.max(currentMeta.totalDisplay, frameMeta.totalDisplay),
        hasBackward:
          direction === "backward" ? frameMeta.hasBackward : currentMeta.hasBackward,
        hasForward:
          direction === "forward" ? frameMeta.hasForward : currentMeta.hasForward,
        versionToken: frameMeta.versionToken || currentMeta.versionToken,
      };
      chartDataRef.current = nextBars;
      marketFrameMetaRef.current = nextMeta;
      setMarketData(nextBars);
      setMarketDataVersionToken((current) => current + 1);
      setMarketLoadLoaded(nextBars.length);
      setMarketLoadTotal(nextMeta.totalDisplay);
      return nextMeta;
    },
    [],
  );

  const loadMoreValidationBars = useCallback(
    async (
      direction: "backward" | "forward",
    ): Promise<ValidationMarketLoadMoreResult> => {
      const currentMeta = marketFrameMetaRef.current;
      const currentLoadMoreState = resolveValidationLoadMoreState(currentMeta);
      if (!currentMeta || !validationInstrumentId) {
        return { data: [], hasBackward: false, hasForward: false };
      }
      if (
        (direction === "backward" && !currentMeta.hasBackward) ||
        (direction === "forward" && !currentMeta.hasForward)
      ) {
        return {
          data: [],
          hasBackward: currentLoadMoreState.backward,
          hasForward: currentLoadMoreState.forward,
        };
      }

      const requestVersion = marketLoadVersionRef.current;
      const anchorDisplayIndex =
        direction === "backward"
          ? Math.max(0, currentMeta.displayStartIndex - 1)
          : Math.min(
              Math.max(0, currentMeta.totalDisplay - 1),
              currentMeta.displayEndIndex + 1,
            );
      const frame = await api.getInstrumentBarsFrame(
        validationInstrumentId,
        anchorDisplayIndex,
        VALIDATION_LOAD_MORE_FRAME_LIMIT,
        {
          displayPeriod: effectiveValidationDisplayPeriod,
          direction: direction === "backward" ? "BACKWARD" : "FORWARD",
          anchorDisplayIndex,
          before:
            direction === "backward" ? VALIDATION_LOAD_MORE_FRAME_LIMIT - 1 : 0,
          after:
            direction === "forward" ? VALIDATION_LOAD_MORE_FRAME_LIMIT - 1 : 0,
          maxDisplayBars: VALIDATION_LOAD_MORE_FRAME_LIMIT,
        },
      );

      if (
        marketLoadVersionRef.current !== requestVersion ||
        frame.displayPeriod !== effectiveValidationDisplayPeriod
      ) {
        const latestState = resolveValidationLoadMoreState(
          marketFrameMetaRef.current,
        );
        return {
          data: [],
          hasBackward: latestState.backward,
          hasForward: latestState.forward,
        };
      }

      const fetchedBars = toValidationKlineData(frame);
      if (!fetchedBars.length) {
        return {
          data: [],
          hasBackward: currentLoadMoreState.backward,
          hasForward: currentLoadMoreState.forward,
        };
      }

      const nextMeta = commitValidationFrame(
        direction,
        currentMeta,
        frame,
        fetchedBars,
      );
      return {
        data: fetchedBars,
        hasBackward: nextMeta.hasBackward,
        hasForward: nextMeta.hasForward,
      };
    },
    [commitValidationFrame, effectiveValidationDisplayPeriod, validationInstrumentId],
  );

  const prefetchValidationBars = useCallback(
    async (direction: "backward" | "forward"): Promise<void> => {
      const currentMeta = marketFrameMetaRef.current;
      if (
        !currentMeta ||
        !validationInstrumentId ||
        (direction === "backward" && !currentMeta.hasBackward) ||
        (direction === "forward" && !currentMeta.hasForward)
      ) {
        return;
      }

      const requestVersion = marketLoadVersionRef.current;
      const requestDisplayPeriod = effectiveValidationDisplayPeriod;
      const requestVersionToken = currentMeta.versionToken;
      const anchorDisplayIndex =
        direction === "backward"
          ? Math.max(0, currentMeta.displayStartIndex - 1)
          : Math.min(
              Math.max(0, currentMeta.totalDisplay - 1),
              currentMeta.displayEndIndex + 1,
            );
      const requestKey = [
        validationInstrumentId,
        requestDisplayPeriod,
        requestVersionToken,
        direction,
        anchorDisplayIndex,
      ].join("\u0000");
      if (validationPrefetchKeyRef.current === requestKey) {
        return;
      }
      validationPrefetchKeyRef.current = requestKey;
      try {
        const frame = await api.getInstrumentBarsFrame(
          validationInstrumentId,
          anchorDisplayIndex,
          VALIDATION_LOAD_MORE_FRAME_LIMIT,
          {
            displayPeriod: requestDisplayPeriod,
            direction: direction === "backward" ? "BACKWARD" : "FORWARD",
            anchorDisplayIndex,
            before:
              direction === "backward"
                ? VALIDATION_LOAD_MORE_FRAME_LIMIT - 1
                : 0,
            after:
              direction === "forward"
                ? VALIDATION_LOAD_MORE_FRAME_LIMIT - 1
                : 0,
            maxDisplayBars: VALIDATION_LOAD_MORE_FRAME_LIMIT,
          },
        );
        const latestMeta = marketFrameMetaRef.current;
        if (
          marketLoadVersionRef.current !== requestVersion ||
          !latestMeta ||
          latestMeta.versionToken !== requestVersionToken ||
          frame.displayPeriod !== requestDisplayPeriod
        ) {
          return;
        }

        const fetchedBars = toValidationKlineData(frame);
        if (!fetchedBars.length) {
          return;
        }
        commitValidationFrame(direction, latestMeta, frame, fetchedBars);
      } catch {
        // Opportunistic prefetch.
      } finally {
        if (validationPrefetchKeyRef.current === requestKey) {
          validationPrefetchKeyRef.current = "";
        }
      }
    },
    [commitValidationFrame, effectiveValidationDisplayPeriod, validationInstrumentId],
  );

  useEffect(() => {
    loadMoreValidationBarsRef.current = loadMoreValidationBars;
  }, [loadMoreValidationBars]);

  useEffect(() => {
    prefetchValidationBarsRef.current = prefetchValidationBars;
  }, [prefetchValidationBars]);

  useEffect(() => {
    const controller = new AbortController();
    void loadSelectionOptions({ signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, [loadSelectionOptions]);

  useEffect(() => {
    void loadMarketData();
  }, [loadMarketData]);

  useEffect(() => {
    const optionSet = new Set(
      samplePoolOptions.filter((item) => !item.disabled).map((item) => item.id),
    );
    setActiveSamplePoolId((current) => {
      const normalized = String(current || "").trim();
      if (normalized && optionSet.has(normalized)) {
        return normalized;
      }
      return customIndicatorValidationFacts.defaultSamplePoolId;
    });
  }, [customIndicatorValidationFacts.defaultSamplePoolId, samplePoolOptions]);

  useEffect(() => {
    const symbolSet = new Set(symbolOptions);
    setValidationSymbol((current) => {
      const normalized = normalizeValidationInstrumentSymbol(current);
      if (normalized && symbolSet.has(normalized)) {
        return normalized;
      }
      return symbolOptions[0] ?? (normalized || VALIDATION_SYMBOL);
    });
  }, [symbolOptions]);

  useEffect(() => {
    setValidationDisplayPeriod((current) => {
      if (validationPeriodOptions.includes(current)) {
        return current;
      }
      return (
        resolvedValidationInstrument?.defaultDisplayPeriod ??
        activeSamplePool?.defaultDisplayPeriod ??
        customIndicatorValidationFacts.defaultDisplayPeriod
      );
    });
  }, [
    activeSamplePool,
    customIndicatorValidationFacts.defaultDisplayPeriod,
    resolvedValidationInstrument,
    validationPeriodOptions,
  ]);

  return {
    activeSamplePoolId,
    setActiveSamplePoolId,
    validationSymbol,
    setValidationSymbol,
    validationDisplayPeriod,
    setValidationDisplayPeriod,
    marketDataResetToken,
    marketDataVersionToken,
    marketLoadState,
    marketLoadError,
    catalogLoadState,
    catalogLoadError,
    hasMarketData: marketData.length > 0,
    samplePoolOptions,
    validationSymbolOptions,
    validationPeriodSelectOptions,
    validationPeriodTitle,
    activeValidationSymbol,
    effectiveValidationDisplayPeriod,
    chartDataRef,
    activeValidationSymbolRef,
    effectiveValidationDisplayPeriodRef,
    marketFrameMetaRef,
    marketLoadVersionRef,
    loadMoreValidationBarsRef,
    prefetchValidationBarsRef,
  };
};
