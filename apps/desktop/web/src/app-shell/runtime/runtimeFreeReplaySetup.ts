// SPDX-License-Identifier: GPL-3.0-only

import { createElement, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  api,
} from "@/api";
import { formatAnchorTs } from "@/domains/trainer/AnchorNavigatorControl";
import type { TrainerStartPointWindowPayload } from "@/domains/trainer/trainerStartPointTypes";
import {
  type UiSettings,
} from "@/frontend-kernel/appTypes";
import { buildTrainerTradingAssetUi } from "@/domains/trainer/trainerTradingAssetUi";
import {
  type TradingMarketPresetId,
} from "@/domains/trainer/tradingMarketPresets";
import {
  type FreeReplayEnvironmentSelection,
  type FreeReplayAssetClass,
} from "@/domains/trainer/freeReplaySetup";
import { resolveDefaultFocusedFreeReplayAnchorIndex } from "@/domains/trainer/freeReplayPrepDefaults";
import { isReplayableStartPointOverviewBar } from "@/domains/trainer/startPointOverviewDisplay";
import { toFreeReplayEnvironmentRuleCardDisplays } from "@/domains/trainer/freeReplayEnvironmentRuleCardDisplay";
import { useFreeReplaySetupController } from "@/domains/trainer/useFreeReplaySetupController";
import { resetFreeReplayDraftLifecycle } from "@/domains/trainer/freeReplayDraftLifecycle";
import type { ApiFreeReplayPrepReadModel } from "@/api";
import { VendorIcon } from "@/assets/graphics";
import type { useRuntimeStartupState } from "@/app-shell/runtime/runtimeStartupState";
import type { useRuntimeStartupHistoryState } from "@/app-shell/runtime/runtimeStartupHistoryState";
import type { useRuntimeStartupPersistence } from "@/app-shell/runtime/runtimeStartupPersistence";
import type { useRuntimeTrainerChartSession } from "@/app-shell/runtime/runtimeTrainerChartSession";
import type { useRuntimeTrainerMarketSettings } from "@/app-shell/runtime/runtimeTrainerMarketSettings";
import type { useRuntimeTrainerPoolChartPipeline } from "@/app-shell/runtime/runtimeTrainerPoolChartPipeline";
import type { useRuntimeTrainerChartOrchestration } from "@/app-shell/runtime/runtimeTrainerChartOrchestration";
type RuntimeHookScope = AppRootRuntimeProps & ReturnType<typeof useRuntimeStartupState> & ReturnType<typeof useRuntimeStartupHistoryState> & ReturnType<typeof useRuntimeStartupPersistence> & ReturnType<typeof useRuntimeTrainerChartSession> & ReturnType<typeof useRuntimeTrainerMarketSettings> & ReturnType<typeof useRuntimeTrainerPoolChartPipeline> & ReturnType<typeof useRuntimeTrainerChartOrchestration> & Record<string, unknown>;

export type AppRootRuntimeProps = {
  initialUiSettings: UiSettings;
  initialDataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
  canPersistUiSettings: boolean;
};





type FreeReplayPrepEnvironmentSelection = FreeReplayEnvironmentSelection<
  FreeReplayAssetClass,
  TradingMarketPresetId
>;

export const useRuntimeFreeReplaySetup = (scope: RuntimeHookScope) => {
  const { activeSessionTradingSettings, activeToolbarSymbol, applyResolvedTradingSettingsToForm, currentAnchorTs, currentTrainingBaseTimeframe, currentTrainingMinimumBaseTimeframe, currentTrainingPoolMeta, effectiveThemeMode, isBusy, isFreeReplayPrepMode, language, resetTrainerToPrepView: resetActiveTrainerSessionToPrepView, resolveTradingMarketPresetLabel, sessionId, tradingAssetClass, tradingMarketPresetKey, tradingSettings, tradingSettingsText, trainerBaseTimeframe, tt, ui } = scope;
  const trainerTradingAssetUi = useMemo(
    () =>
      buildTrainerTradingAssetUi({
        assetClass: activeSessionTradingSettings.assetClass,
        allowShortSelling: activeSessionTradingSettings.allowShortSelling,
        tradingText: tradingSettingsText,
        lotStepUnitLabel: tt("appText.lots2"),
      }),
    [activeSessionTradingSettings.allowShortSelling, activeSessionTradingSettings.assetClass, tradingSettingsText],
  );
  const [freeReplayPrepAnchorIndex, setFreeReplayPrepAnchorIndex] = useState<number | null>(null);
  const [freeReplayPrepAnchorOverviewIndex, setFreeReplayPrepAnchorOverviewIndex] =
    useState<number | null>(null);
  const [freeReplayPrepAnchorTs, setFreeReplayPrepAnchorTs] = useState<string | null>(null);
  const [freeReplayPrepEnvironmentSelection, setFreeReplayPrepEnvironmentSelectionState] =
    useState<FreeReplayPrepEnvironmentSelection>(() => ({
      assetClass: tradingAssetClass as FreeReplayAssetClass,
      marketPresetId: tradingMarketPresetKey as TradingMarketPresetId,
    }));
  const freeReplayPrepEnvironmentSelectionRef = useRef(
    freeReplayPrepEnvironmentSelection,
  );
  const freeReplayPrepEnvironmentTouchedRef = useRef(false);
  const commitFreeReplayPrepEnvironmentSelection = useCallback(
    (nextSelection: FreeReplayPrepEnvironmentSelection) => {
      const current = freeReplayPrepEnvironmentSelectionRef.current;
      if (
        current.assetClass === nextSelection.assetClass &&
        current.marketPresetId === nextSelection.marketPresetId
      ) {
        return;
      }
      freeReplayPrepEnvironmentSelectionRef.current = nextSelection;
      setFreeReplayPrepEnvironmentSelectionState(nextSelection);
    },
    [],
  );
  const setFreeReplayPrepEnvironmentAssetClass = useCallback<
    Dispatch<SetStateAction<FreeReplayAssetClass>>
  >(
    (value) => {
      const current = freeReplayPrepEnvironmentSelectionRef.current;
      const nextAssetClass =
        typeof value === "function"
          ? (value as (current: FreeReplayAssetClass) => FreeReplayAssetClass)(
              current.assetClass,
            )
          : value;
      freeReplayPrepEnvironmentTouchedRef.current = true;
      commitFreeReplayPrepEnvironmentSelection({
        ...current,
        assetClass: nextAssetClass,
      });
    },
    [commitFreeReplayPrepEnvironmentSelection],
  );
  const setFreeReplayPrepEnvironmentPresetId = useCallback<
    Dispatch<SetStateAction<TradingMarketPresetId>>
  >(
    (value) => {
      const current = freeReplayPrepEnvironmentSelectionRef.current;
      const nextMarketPresetId =
        typeof value === "function"
          ? (value as (
              current: TradingMarketPresetId,
            ) => TradingMarketPresetId)(current.marketPresetId)
          : value;
      freeReplayPrepEnvironmentTouchedRef.current = true;
      commitFreeReplayPrepEnvironmentSelection({
        ...current,
        marketPresetId: nextMarketPresetId,
      });
    },
    [commitFreeReplayPrepEnvironmentSelection],
  );
  const [freeReplayPrepReadModel, setFreeReplayPrepReadModel] =
    useState<ApiFreeReplayPrepReadModel | null>(null);
  const freeReplayPrepReadModelRequestRef = useRef(0);
  const {
    prepConfig: freeReplayPrepConfig,
    prepConfigState: freeReplayPrepConfigState,
    minimumBaseTimeframeTouched: freeReplayMinimumBaseTimeframeTouched,
    modeOptions: freeReplayModeOptions,
    blindBoxValue: freeReplayBlindBoxValue,
    selectedPool: freeReplaySelectedPool,
    selectedPoolId: freeReplaySelectedPoolId,
    selectedInstrument: freeReplaySelectedInstrument,
    selectedInstrumentId: freeReplaySelectedInstrumentId,
    selectedSymbol: freeReplaySelectedSymbol,
    selectedSourceTimeframe: freeReplaySelectedInstrumentSourceTimeframe,
    availableSymbolCount: freeReplayAvailableSymbolCount,
    startCandidates: freeReplayStartCandidates,
    startReadiness: freeReplayStartReadinessModel,
    samplePoolOptions: freeReplaySamplePoolOptions,
    symbolOptions: freeReplaySymbolOptions,
    assetOptions: freeReplayAssetOptions,
    timeframeOptions: freeReplayTimeframeOptions,
    blindBoxOptions: freeReplayBlindBoxOptions,
    setMode: setFreeReplayPrepMode,
    setBaseTimeframe: setFreeReplayPrepBaseTimeframe,
    setBlindBoxValue: setFreeReplayPrepBlindBoxValue,
    setSelectedPoolId: setFreeReplaySelectedPoolIdBase,
    setSelectedSymbol: setFreeReplaySelectedSymbol,
  } = useFreeReplaySetupController({
    initialAssetClass: tradingAssetClass,
    initialSourceTimeframe: currentTrainingBaseTimeframe,
    sessionId,
    activeSessionMinimumBaseTimeframe: currentTrainingMinimumBaseTimeframe,
    readModel: freeReplayPrepReadModel,
    assetClassLabels: tradingSettingsText.assetClassLabels,
    modeRandomLabel: ui.freeReplayModeRandom,
    modeFocusedLabel: ui.freeReplayModeFocused,
    blindBoxShowLabel: ui.freeReplayBlindBoxShow,
    blindBoxHideLabel: ui.freeReplayBlindBoxHide,
  });
  useEffect(() => {
    const requestVersion = freeReplayPrepReadModelRequestRef.current + 1;
    freeReplayPrepReadModelRequestRef.current = requestVersion;
    const abortController = new AbortController();
    void api
      .getFreeReplayPrepReadModel(
        {
          mode: freeReplayPrepConfigState.mode,
          selectedPoolId: freeReplaySelectedPoolId || undefined,
          selectedInstrumentId: freeReplaySelectedInstrumentId || undefined,
          selectedSymbol: freeReplaySelectedSymbol || undefined,
          selectedAnchorIndex:
            freeReplayPrepConfigState.mode === "FOCUSED"
              ? (freeReplayPrepAnchorIndex ?? undefined)
              : undefined,
          minimumBaseTimeframe:
            freeReplayPrepConfigState.minimumBaseTimeframe,
          minimumBaseTimeframeTouched: freeReplayMinimumBaseTimeframeTouched,
          hideSymbolName: freeReplayPrepConfigState.hideSymbolName,
          preferredAssetClass: (String(sessionId || "").trim()
            ? activeSessionTradingSettings.assetClass
            : tradingAssetClass) as FreeReplayAssetClass,
          preferredBaseTimeframe: currentTrainingBaseTimeframe,
          activeSessionMinimumBaseTimeframe: currentTrainingMinimumBaseTimeframe,
          hasActiveSession: Boolean(String(sessionId || "").trim()),
          environmentSelection: freeReplayPrepEnvironmentSelectionRef.current,
          environmentTouched: freeReplayPrepEnvironmentTouchedRef.current,
        },
        { signal: abortController.signal },
      )
      .then((readModel) => {
        if (freeReplayPrepReadModelRequestRef.current !== requestVersion) {
          return;
        }
        setFreeReplayPrepReadModel(readModel);
        commitFreeReplayPrepEnvironmentSelection({
          assetClass: readModel.environment.selected.assetClass as FreeReplayAssetClass,
          marketPresetId: readModel.environment.selected.marketPresetId as TradingMarketPresetId,
        });
      })
      .catch(() => {
        if (freeReplayPrepReadModelRequestRef.current !== requestVersion) {
          return;
        }
        setFreeReplayPrepReadModel(null);
      });
    return () => {
      abortController.abort();
    };
  }, [
    activeSessionTradingSettings.assetClass,
    commitFreeReplayPrepEnvironmentSelection,
    currentTrainingBaseTimeframe,
    currentTrainingMinimumBaseTimeframe,
    freeReplayMinimumBaseTimeframeTouched,
    freeReplayPrepAnchorIndex,
    freeReplayPrepConfigState.hideSymbolName,
    freeReplayPrepConfigState.minimumBaseTimeframe,
    freeReplayPrepConfigState.mode,
    freeReplaySelectedInstrumentId,
    freeReplaySelectedPoolId,
    freeReplaySelectedSymbol,
    freeReplayPrepEnvironmentSelection,
    sessionId,
    tradingAssetClass,
  ]);
  const freeReplayPrepEnvironmentAssetClass =
    freeReplayPrepEnvironmentSelection.assetClass;
  const freeReplayPrepEnvironmentPresetId =
    freeReplayPrepEnvironmentSelection.marketPresetId;
  const [freeReplayPersistEnvironmentToPool, setFreeReplayPersistEnvironmentToPool] =
    useState(false);
  const setFreeReplaySelectedPoolId = useCallback(
    (poolId: string) => {
      freeReplayPrepEnvironmentTouchedRef.current = false;
      setFreeReplayPersistEnvironmentToPool(false);
      setFreeReplaySelectedPoolIdBase(poolId);
    },
    [setFreeReplaySelectedPoolIdBase],
  );
  const freeReplayEnvironmentAssetOptions = useMemo(
    () =>
      (freeReplayPrepReadModel?.environment.assetOptions ?? []).map(
        (option) => ({
          value: option.value,
          label: tradingSettingsText.assetClassLabels[option.value],
          disabled: option.disabled,
        }),
      ),
    [freeReplayPrepReadModel?.environment.assetOptions, tradingSettingsText.assetClassLabels],
  );
  const freeReplayEnvironmentPresetOptions = useMemo(
    () =>
      (freeReplayPrepReadModel?.environment.presetOptions ?? []).map(
        (option) => ({
          value: option.value,
          label: resolveTradingMarketPresetLabel(option.value, option.value),
          disabled: option.disabled,
        }),
      ),
    [
      freeReplayPrepReadModel?.environment.presetOptions,
      resolveTradingMarketPresetLabel,
    ],
  );
  const freeReplaySelectedEnvironmentPresetLabel = useMemo(
    () =>
      resolveTradingMarketPresetLabel(
        freeReplayPrepEnvironmentPresetId,
        freeReplayPrepEnvironmentPresetId,
      ),
    [freeReplayPrepEnvironmentPresetId, resolveTradingMarketPresetLabel],
  );
  const freeReplayEnvironmentRuleCards = useMemo(
    () =>
      toFreeReplayEnvironmentRuleCardDisplays(
        freeReplayPrepReadModel?.environment.ruleCards ?? [],
        freeReplayPrepEnvironmentAssetClass,
        tradingSettingsText,
      ),
    [
      freeReplayPrepEnvironmentAssetClass,
      freeReplayPrepReadModel?.environment.ruleCards,
      tradingSettingsText,
    ],
  );
  const [freeReplayPrepTouched, setFreeReplayPrepTouched] = useState(false);
  const previousSessionIdRef = useRef("");
  const freeReplaySelectedMinimumBaseTimeframe =
    freeReplayPrepConfig.minimumBaseTimeframe ??
    freeReplayPrepConfig.baseTimeframe ??
    "1d";
  const freeReplaySelectedSourceBaseTimeframe =
    freeReplaySelectedInstrumentSourceTimeframe ??
    freeReplaySelectedPool?.sourceBaseTimeframe ??
    freeReplaySelectedMinimumBaseTimeframe;
  const freeReplayStartReadiness =
    freeReplayStartReadinessModel?.readiness ?? {
      canStart: false,
      reason: null,
      requiresSymbol: false,
      requiresAnchor: false,
      hasExplicitAnchor: false,
      normalizedSelectedSymbol: "",
    };
  const freeReplayHasAvailableSymbols =
    (freeReplayStartReadinessModel?.facts.scopedCandidateCount ?? 0) > 0;
  const freeReplayStartDisabled = !freeReplayStartReadiness.canStart;
  const freeReplayStartButtonIconName = "actionArrowRight" as const;
  useEffect(() => {
    setFreeReplayPrepAnchorIndex(null);
    setFreeReplayPrepAnchorOverviewIndex(null);
    setFreeReplayPrepAnchorTs(null);
  }, [
    freeReplaySelectedInstrumentId,
    freeReplaySelectedPoolId,
    freeReplaySelectedSymbol,
  ]);
  useEffect(() => {
    const currentSessionId = String(sessionId || "").trim();
    const previousSessionId = previousSessionIdRef.current;
    if (!currentSessionId && previousSessionId) {
      setFreeReplayPrepTouched(false);
    }
    previousSessionIdRef.current = currentSessionId;
  }, [sessionId]);
  const [lastTrainerHeaderSummary, setLastTrainerHeaderSummary] = useState<{
    samplePoolText: string;
    symbolText: string;
    anchorText: string;
  } | null>(null);
  useEffect(() => {
    if (!sessionId) {
      return;
    }
    const samplePoolText = String(currentTrainingPoolMeta.name || "").trim();
    const symbolText = String(activeToolbarSymbol || "").trim();
    const anchorText = formatAnchorTs(currentAnchorTs, language, trainerBaseTimeframe);
    if (!samplePoolText && !symbolText && !anchorText) {
      return;
    }
    setLastTrainerHeaderSummary((current) => {
      if (current?.samplePoolText === samplePoolText && current?.symbolText === symbolText && current?.anchorText === anchorText) {
        return current;
      }
      return {
        samplePoolText,
        symbolText,
        anchorText,
      };
    });
  }, [activeToolbarSymbol, currentAnchorTs, currentTrainingPoolMeta.name, language, sessionId, trainerBaseTimeframe]);
  const resetTrainerToPrepView = useCallback(() => {
    resetFreeReplayDraftLifecycle({
      globalEnvironment: {
        assetClass: tradingSettings.assetClass as FreeReplayAssetClass,
        marketPresetId:
          tradingSettings.marketPresetId as TradingMarketPresetId,
      },
      resetActiveTrainerSession: resetActiveTrainerSessionToPrepView,
      invalidatePrepReadModel: () => {
        freeReplayPrepReadModelRequestRef.current += 1;
        setFreeReplayPrepReadModel(null);
      },
      clearPrepSelection: () => {
        setFreeReplaySelectedPoolIdBase("");
      },
      clearPrepAnchors: () => {
        setFreeReplayPrepAnchorIndex(null);
        setFreeReplayPrepAnchorOverviewIndex(null);
        setFreeReplayPrepAnchorTs(null);
      },
      clearPrepInteractionState: () => {
        freeReplayPrepEnvironmentTouchedRef.current = false;
        setFreeReplayPersistEnvironmentToPool(false);
        setFreeReplayPrepTouched(false);
        setLastTrainerHeaderSummary(null);
      },
      restoreGlobalTradingSettingsForm: () => {
        applyResolvedTradingSettingsToForm(tradingSettings);
      },
      applyPrepEnvironment: commitFreeReplayPrepEnvironmentSelection,
    });
  }, [
    applyResolvedTradingSettingsToForm,
    commitFreeReplayPrepEnvironmentSelection,
    resetActiveTrainerSessionToPrepView,
    setFreeReplaySelectedPoolIdBase,
    tradingSettings,
  ]);
  const commitFreeReplayPrepAnchorSelection = useCallback(
    async (
      selection: {
        overviewIndex: number;
        rawAnchorIndex?: number;
        anchorTs?: string | null;
      },
      options?: {
        markTouched?: boolean;
      },
    ) => {
      const instrumentId = String(freeReplaySelectedInstrumentId || "").trim();
      if (!instrumentId) {
        return;
      }
      if (options?.markTouched !== false) {
        setFreeReplayPrepTouched(true);
      }
      const normalizedOverviewIndex = Math.max(
        0,
        Math.floor(Number(selection.overviewIndex) || 0),
      );
      try {
        const resolvedSelection:
          | {
              rawAnchorIndex: number;
              anchorTs: string | null;
            }
          | null =
          Number.isFinite(selection.rawAnchorIndex) && selection.anchorTs
            ? {
                rawAnchorIndex: Math.max(
                  0,
                  Math.floor(Number(selection.rawAnchorIndex) || 0),
                ),
                anchorTs: selection.anchorTs,
              }
            : null;
        if (resolvedSelection) {
          setFreeReplayPrepAnchorOverviewIndex(normalizedOverviewIndex);
          setFreeReplayPrepAnchorIndex(resolvedSelection.rawAnchorIndex);
          setFreeReplayPrepAnchorTs(resolvedSelection.anchorTs);
          return;
        }
        const overview = await api.getFreeReplayStartPointOverview(
          instrumentId,
          freeReplaySelectedPoolId,
          freeReplaySelectedMinimumBaseTimeframe,
          normalizedOverviewIndex,
          1,
        );
        const anchorBucket = overview.bars?.[0] ?? null;
        if (!anchorBucket) {
          setFreeReplayPrepAnchorOverviewIndex(null);
          setFreeReplayPrepAnchorIndex(null);
          setFreeReplayPrepAnchorTs(null);
          return;
        }
        if (
          !isReplayableStartPointOverviewBar(
            anchorBucket,
            overview.trainingTotal,
          )
        ) {
          setFreeReplayPrepAnchorOverviewIndex(null);
          setFreeReplayPrepAnchorIndex(null);
          setFreeReplayPrepAnchorTs(null);
          return;
        }
        setFreeReplayPrepAnchorOverviewIndex(normalizedOverviewIndex);
        setFreeReplayPrepAnchorIndex(anchorBucket.endRawIndex);
        setFreeReplayPrepAnchorTs(anchorBucket.ts ?? null);
      } catch {
        setFreeReplayPrepAnchorOverviewIndex(null);
        setFreeReplayPrepAnchorIndex(null);
        setFreeReplayPrepAnchorTs(null);
      }
    },
    [
      freeReplaySelectedMinimumBaseTimeframe,
      freeReplaySelectedInstrumentId,
      freeReplaySelectedPoolId,
      setFreeReplayPrepTouched,
    ],
  );
  const applyPrepAnchorSelection = useCallback(
    async (selection: {
      overviewIndex: number;
      rawAnchorIndex: number;
      anchorTs: string | null;
    }) => {
      await commitFreeReplayPrepAnchorSelection(selection, {
        markTouched: true,
      });
    },
    [commitFreeReplayPrepAnchorSelection],
  );
  useEffect(() => {
    if (freeReplayPrepConfig.mode !== "FOCUSED") {
      return;
    }
    const instrumentId = String(freeReplaySelectedInstrumentId || "").trim();
    if (!instrumentId || Number.isFinite(freeReplayPrepAnchorIndex)) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const firstRange = await api.getFreeReplayStartPointOverview(
          instrumentId,
          freeReplaySelectedPoolId,
          freeReplaySelectedMinimumBaseTimeframe,
          0,
          1,
        );
        if (cancelled) {
          return;
        }
        const defaultAnchorIndex = resolveDefaultFocusedFreeReplayAnchorIndex(
          firstRange.total,
        );
        if (defaultAnchorIndex === null) {
          return;
        }
        await commitFreeReplayPrepAnchorSelection(
          {
            overviewIndex: defaultAnchorIndex,
          },
          {
          markTouched: false,
          },
        );
      } catch {
        if (!cancelled) {
          setFreeReplayPrepAnchorOverviewIndex(null);
          setFreeReplayPrepAnchorIndex(null);
          setFreeReplayPrepAnchorTs(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    commitFreeReplayPrepAnchorSelection,
    freeReplayPrepAnchorIndex,
    freeReplayPrepConfig.mode,
    freeReplaySelectedInstrumentId,
    freeReplaySelectedMinimumBaseTimeframe,
    freeReplaySelectedPoolId,
  ]);
  const prepAnchorNavigatorWindowPayload: TrainerStartPointWindowPayload = {
    title: tt("appText.trainingStart"),
    samplePoolId: freeReplaySelectedPoolId,
    instrumentId: freeReplaySelectedInstrumentId,
    symbol: freeReplaySelectedSymbol,
    sourceTimeframe: freeReplaySelectedSourceBaseTimeframe,
    effectiveTimeframe: freeReplaySelectedMinimumBaseTimeframe,
    language,
    themeMode: effectiveThemeMode,
    currentRawAnchorIndex: freeReplayPrepAnchorIndex,
    currentAnchorOverviewIndex: freeReplayPrepAnchorOverviewIndex,
    currentAnchorTs: freeReplayPrepAnchorTs,
    isDisabled:
      isBusy ||
      !freeReplaySelectedInstrumentId ||
      Boolean(freeReplaySelectedPool?.disabled || freeReplaySelectedPool?.sourceLocked) ||
      Boolean(freeReplaySelectedInstrument?.locked),
    isBusy,
    ui: {
      startPoint: tt("appText.trainingStart"),
      dateRange: ui.dateRange,
      chartSettings: ui.chartSettings,
    },
  };
  const shouldUseLastTrainerHeaderSummaryInPrep = isFreeReplayPrepMode && !freeReplayPrepTouched && Boolean(lastTrainerHeaderSummary);
  const readonlySamplePoolText =
    !isFreeReplayPrepMode && sessionId
      ? currentTrainingPoolMeta.name || tt("appText.matchingSamplePool")
      : shouldUseLastTrainerHeaderSummaryInPrep
        ? lastTrainerHeaderSummary?.samplePoolText || tt("appText.matchingSamplePool")
        : freeReplaySelectedPool?.name || tt("appText.matchingSamplePool");
  const readonlySymbolText =
    !isFreeReplayPrepMode && sessionId
      ? !freeReplayPrepConfig.hideSymbolName
        ? activeToolbarSymbol || tt("appText.matchingSymbol")
        : ui.freeReplayBlindBoxActive
      : shouldUseLastTrainerHeaderSummaryInPrep
        ? lastTrainerHeaderSummary?.symbolText || tt("appText.matchingSymbol")
        : freeReplayPrepConfig.mode === "RANDOM"
          ? ui.freeReplayModeRandom
          : freeReplaySelectedSymbol || tt("appText.matchingSymbol");
  const readonlyAnchorText =
    !isFreeReplayPrepMode && sessionId
      ? formatAnchorTs(currentAnchorTs, language, trainerBaseTimeframe)
      : shouldUseLastTrainerHeaderSummaryInPrep
        ? lastTrainerHeaderSummary?.anchorText || tt("appText.message0367")
        : freeReplayPrepConfig.mode === "RANDOM"
          ? ""
          : formatAnchorTs(
              freeReplayPrepAnchorTs,
              language,
              freeReplaySelectedMinimumBaseTimeframe,
            );
  const readonlyAnchorLabel = `${tt("appText.trainingStart")}: ${readonlyAnchorText}`;
  const anchorToolbarNode = readonlyAnchorText
    ? createElement(
        "div",
        {
          "aria-label": readonlyAnchorLabel,
          className: "top-toolbar-anchor-readonly",
          title: readonlyAnchorLabel,
        },
        createElement(VendorIcon, {
          "aria-hidden": true,
          className: "top-toolbar-anchor-readonly-flag",
          name: "flag",
        }),
        createElement(
          "span",
          { className: "top-toolbar-anchor-readonly-text" },
          readonlyAnchorText,
        ),
      )
    : null;
  return { anchorToolbarNode, applyPrepAnchorSelection, commitFreeReplayPrepAnchorSelection, freeReplayAssetOptions, freeReplayAvailableSymbolCount, freeReplayBlindBoxOptions, freeReplayBlindBoxValue, freeReplayEnvironmentAssetOptions, freeReplayEnvironmentPresetOptions, freeReplayEnvironmentRuleCards, freeReplayHasAvailableSymbols, freeReplayModeOptions, freeReplayPersistEnvironmentToPool, freeReplayPrepAnchorIndex, freeReplayPrepAnchorOverviewIndex, freeReplayPrepAnchorTs, freeReplayPrepConfig, freeReplayPrepEnvironmentAssetClass, freeReplayPrepEnvironmentPresetId, freeReplayPrepEnvironmentSelectionRef, freeReplayPrepEnvironmentTouchedRef, freeReplayPrepTouched, freeReplaySamplePoolOptions, freeReplaySelectedEnvironmentPresetLabel, freeReplaySelectedInstrumentId, freeReplaySelectedMinimumBaseTimeframe, freeReplaySelectedPool, freeReplaySelectedPoolId, freeReplaySelectedSourceBaseTimeframe, freeReplaySelectedSymbol, freeReplayStartButtonIconName, freeReplayStartCandidates, freeReplayStartDisabled, freeReplayStartReadiness, freeReplaySymbolOptions, freeReplayTimeframeOptions, lastTrainerHeaderSummary, prepAnchorNavigatorWindowPayload, previousSessionIdRef, readonlyAnchorText, readonlySamplePoolText, readonlySymbolText, resetTrainerToPrepView, setFreeReplayPersistEnvironmentToPool, setFreeReplayPrepAnchorIndex, setFreeReplayPrepAnchorOverviewIndex, setFreeReplayPrepAnchorTs, setFreeReplayPrepBaseTimeframe, setFreeReplayPrepBlindBoxValue, setFreeReplayPrepEnvironmentAssetClass, setFreeReplayPrepEnvironmentPresetId, setFreeReplayPrepMode, setFreeReplayPrepTouched, setFreeReplaySelectedPoolId, setFreeReplaySelectedSymbol, setLastTrainerHeaderSummary, shouldUseLastTrainerHeaderSummaryInPrep, trainerTradingAssetUi };
};
