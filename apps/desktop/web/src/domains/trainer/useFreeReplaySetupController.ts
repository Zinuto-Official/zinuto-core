// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ApiFreeReplayPrepPool,
  ApiFreeReplayPrepReadModel,
} from "@/api";
import type { TradingAssetClassId } from "@/domains/trainer/tradingMarketPresets";
import {
  FREE_REPLAY_ASSET_CLASS_IDS,
  FREE_REPLAY_ASSET_ICON_NAME_BY_CLASS,
  FREE_REPLAY_MODES,
  toFreeReplayAdvancePeriod,
  type FreeReplayAdvancePeriod,
  type FreeReplayAssetClass,
  type FreeReplayMode,
  type FreeReplayPrepConfig,
} from "@/domains/trainer/freeReplaySetup";

type UseFreeReplaySetupControllerArgs = {
  initialAssetClass: TradingAssetClassId;
  initialSourceTimeframe: string;
  sessionId: string;
  activeSessionMinimumBaseTimeframe: FreeReplayAdvancePeriod;
  readModel: ApiFreeReplayPrepReadModel | null;
  assetClassLabels: Record<TradingAssetClassId, string>;
  modeRandomLabel: string;
  modeFocusedLabel: string;
  blindBoxShowLabel: string;
  blindBoxHideLabel: string;
};

type FreeReplayPrepConfigState = Pick<
  FreeReplayPrepConfig,
  "mode" | "minimumBaseTimeframe" | "hideSymbolName"
>;

const toAssetClass = (
  value: unknown,
  fallback: FreeReplayAssetClass = "STOCK",
): FreeReplayAssetClass =>
  value === "FUTURES" || value === "FOREX" || value === "CRYPTO"
    ? value
    : fallback;

const normalizeSelectionId = (value: unknown): string =>
  String(value ?? "").trim();

type FreeReplaySelectedInstrumentState = {
  selectedInstrument: ApiFreeReplayPrepReadModel["selectedInstrument"];
  selectedInstrumentId: string;
  selectedSymbol: string;
  selectedSourceTimeframe: ApiFreeReplayPrepReadModel["selection"]["selectedSourceTimeframe"];
};

export const resolveFreeReplaySelectedInstrumentState = ({
  selectedPool,
  readModelSelectedInstrument,
  readModelSelection,
  selectedInstrumentId,
}: {
  selectedPool: ApiFreeReplayPrepReadModel["selectedPool"];
  readModelSelectedInstrument: ApiFreeReplayPrepReadModel["selectedInstrument"];
  readModelSelection: ApiFreeReplayPrepReadModel["selection"] | null;
  selectedInstrumentId: string;
}): FreeReplaySelectedInstrumentState => {
  const localSelectedInstrumentId = normalizeSelectionId(selectedInstrumentId);
  if (localSelectedInstrumentId) {
    const localSelectedInstrument =
      (selectedPool?.instruments ?? []).find(
        (instrument) =>
          normalizeSelectionId(instrument.instrumentId) ===
          localSelectedInstrumentId,
      ) ?? null;
    return {
      selectedInstrument: localSelectedInstrument,
      selectedInstrumentId: localSelectedInstrumentId,
      selectedSymbol: localSelectedInstrument?.symbol ?? "",
      selectedSourceTimeframe:
        localSelectedInstrument?.sourceTimeframe ??
        readModelSelection?.selectedSourceTimeframe ??
        selectedPool?.sourceBaseTimeframe ??
        "1d",
    };
  }

  return {
    selectedInstrument: readModelSelectedInstrument,
    selectedInstrumentId: normalizeSelectionId(
      readModelSelection?.selectedInstrumentId,
    ),
    selectedSymbol: readModelSelection?.selectedSymbol ?? "",
    selectedSourceTimeframe:
      readModelSelection?.selectedSourceTimeframe ??
      selectedPool?.sourceBaseTimeframe ??
      "1d",
  };
};

const createInitialPrepConfigState = ({
  sessionId,
  initialSourceTimeframe,
  activeSessionMinimumBaseTimeframe,
}: Pick<
  UseFreeReplaySetupControllerArgs,
  "sessionId" | "initialSourceTimeframe" | "activeSessionMinimumBaseTimeframe"
>): FreeReplayPrepConfigState => ({
  mode: "RANDOM",
  minimumBaseTimeframe: toFreeReplayAdvancePeriod(
    normalizeSelectionId(sessionId)
      ? activeSessionMinimumBaseTimeframe
      : initialSourceTimeframe,
    "1d",
  ),
  hideSymbolName: false,
});

export const useFreeReplaySetupController = ({
  initialAssetClass,
  initialSourceTimeframe,
  sessionId,
  activeSessionMinimumBaseTimeframe,
  readModel,
  assetClassLabels,
  modeRandomLabel,
  modeFocusedLabel,
  blindBoxShowLabel,
  blindBoxHideLabel,
}: UseFreeReplaySetupControllerArgs) => {
  const [prepConfigState, setPrepConfigState] =
    useState<FreeReplayPrepConfigState>(() =>
      createInitialPrepConfigState({
        sessionId,
        initialSourceTimeframe,
        activeSessionMinimumBaseTimeframe,
      }),
    );
  const minimumBaseTimeframeTouchedRef = useRef(false);
  const previousSessionIdRef = useRef(normalizeSelectionId(sessionId));
  const [selectedPoolId, setSelectedPoolIdState] = useState("");
  const [selectedInstrumentId, setSelectedInstrumentIdState] = useState("");

  useEffect(() => {
    const currentSessionId = normalizeSelectionId(sessionId);
    if (!currentSessionId && previousSessionIdRef.current) {
      minimumBaseTimeframeTouchedRef.current = false;
    }
    previousSessionIdRef.current = currentSessionId;
  }, [sessionId]);

  useEffect(() => {
    if (!readModel) {
      return;
    }
    setSelectedPoolIdState((current) => {
      const normalized = normalizeSelectionId(readModel.selection.selectedPoolId);
      return current === normalized ? current : normalized;
    });
    setSelectedInstrumentIdState((current) => {
      const normalized = normalizeSelectionId(
        readModel.selection.selectedInstrumentId,
      );
      return current === normalized ? current : normalized;
    });
    setPrepConfigState((current) => {
      const nextMinimum = readModel.prepConfig.minimumBaseTimeframe;
      const nextMode = readModel.prepConfig.mode;
      const nextHideSymbolName = readModel.prepConfig.hideSymbolName;
      if (
        current.minimumBaseTimeframe === nextMinimum &&
        current.mode === nextMode &&
        current.hideSymbolName === nextHideSymbolName
      ) {
        return current;
      }
      return {
        mode: nextMode,
        minimumBaseTimeframe: nextMinimum,
        hideSymbolName: nextHideSymbolName,
      };
    });
  }, [readModel]);

  const selectedPool = readModel?.selectedPool ?? null;
  const selectedInstrument = readModel?.selectedInstrument ?? null;
  const selectedInstrumentState = resolveFreeReplaySelectedInstrumentState({
    selectedPool,
    readModelSelectedInstrument: selectedInstrument,
    readModelSelection: readModel?.selection ?? null,
    selectedInstrumentId,
  });

  const prepConfig = useMemo<FreeReplayPrepConfig>(
    () => ({
      ...prepConfigState,
      assetClass: toAssetClass(
        readModel?.prepConfig.assetClass,
        toAssetClass(initialAssetClass),
      ),
      baseTimeframe:
        readModel?.prepConfig.baseTimeframe ??
        prepConfigState.minimumBaseTimeframe,
      minimumBaseTimeframe:
        readModel?.prepConfig.minimumBaseTimeframe ??
        prepConfigState.minimumBaseTimeframe,
    }),
    [initialAssetClass, prepConfigState, readModel],
  );

  const modeOptions = useMemo(
    () =>
      FREE_REPLAY_MODES.map((mode) => ({
        value: mode,
        label: mode === "RANDOM" ? modeRandomLabel : modeFocusedLabel,
      })),
    [modeFocusedLabel, modeRandomLabel],
  );

  const samplePoolOptions = useMemo(
    () =>
      (readModel?.pools ?? []).map((pool: ApiFreeReplayPrepPool) => ({
        value: pool.id,
        label: pool.name,
        symbolCount: pool.symbolCount,
        locked: Boolean(pool.disabled || pool.sourceLocked),
        assetClass: pool.assetClass,
        assetClassLabel: assetClassLabels[pool.assetClass],
        marketPresetId: pool.marketPresetId,
        marketPresetLabel: pool.marketPresetId,
        sourceBaseTimeframe: pool.sourceBaseTimeframe,
        lockReason: pool.lockReason ?? null,
        minimumBaseTimeframeOptions: pool.minimumBaseTimeframeOptions.map(
          (timeframe) => ({
            value: timeframe,
            label: timeframe,
            disabled: false,
          }),
        ),
      })),
    [assetClassLabels, readModel?.pools],
  );

  const symbolOptions = useMemo(
    () =>
      (selectedPool?.instruments ?? []).map((instrument) => ({
        value: instrument.instrumentId,
        label: instrument.label || instrument.symbol,
        locked: Boolean(instrument.locked),
        lockReason: instrument.lockReason ?? null,
      })),
    [selectedPool?.instruments],
  );

  const assetOptions = useMemo(() => {
    const availabilityByAssetClass = new Map(
      (readModel?.environment.assetOptions ?? []).map((option) => [
        option.value,
        option.disabled,
      ]),
    );
    return FREE_REPLAY_ASSET_CLASS_IDS.map((assetClass) => ({
      value: assetClass,
      label: assetClassLabels[assetClass],
      iconName: FREE_REPLAY_ASSET_ICON_NAME_BY_CLASS[assetClass],
      disabled: availabilityByAssetClass.get(assetClass) ?? true,
    }));
  }, [assetClassLabels, readModel?.environment.assetOptions]);

  const timeframeOptions = useMemo(
    () =>
      (selectedPool?.minimumBaseTimeframeOptions ?? []).map((timeframe) => ({
        value: timeframe,
        label: timeframe,
        disabled: false,
      })),
    [selectedPool?.minimumBaseTimeframeOptions],
  );

  const blindBoxOptions = useMemo(
    () => [
      { value: "SHOW" as const, label: blindBoxShowLabel },
      { value: "HIDE" as const, label: blindBoxHideLabel },
    ],
    [blindBoxHideLabel, blindBoxShowLabel],
  );

  const setSelectedPoolId = useCallback((poolId: string) => {
    setSelectedPoolIdState(normalizeSelectionId(poolId));
    setSelectedInstrumentIdState("");
    minimumBaseTimeframeTouchedRef.current = false;
  }, []);

  const setSelectedInstrumentId = useCallback((instrumentId: string) => {
    setSelectedInstrumentIdState(normalizeSelectionId(instrumentId));
  }, []);

  const setBaseTimeframe = useCallback(
    (baseTimeframe: FreeReplayAdvancePeriod) => {
      minimumBaseTimeframeTouchedRef.current = true;
      setPrepConfigState((current) =>
        current.minimumBaseTimeframe === baseTimeframe
          ? current
          : {
              ...current,
              minimumBaseTimeframe: baseTimeframe,
            },
      );
    },
    [],
  );

  const setBlindBoxValue = useCallback((value: "SHOW" | "HIDE") => {
    setPrepConfigState((current) => {
      const nextHideSymbolName = value === "HIDE";
      return current.hideSymbolName === nextHideSymbolName
        ? current
        : {
            ...current,
            hideSymbolName: nextHideSymbolName,
          };
    });
  }, []);

  const setMode = useCallback((mode: FreeReplayMode) => {
    setPrepConfigState((current) =>
      current.mode === mode
        ? current
        : {
            ...current,
            mode,
          },
    );
  }, []);

  return {
    prepConfig,
    prepConfigState,
    minimumBaseTimeframeTouched: minimumBaseTimeframeTouchedRef.current,
    blindBoxValue: prepConfig.hideSymbolName
      ? ("HIDE" as const)
      : ("SHOW" as const),
    prepPoolOptions: readModel?.pools ?? [],
    candidatePools: selectedPool ? [selectedPool] : [],
    selectedPool,
    selectedPoolId,
    selectedInstrument: selectedInstrumentState.selectedInstrument,
    selectedInstrumentId: selectedInstrumentState.selectedInstrumentId,
    selectedSymbol: selectedInstrumentState.selectedSymbol,
    selectedSourceTimeframe: selectedInstrumentState.selectedSourceTimeframe,
    availableSymbolCount: readModel?.facts.availableSymbolCount ?? 0,
    trainableSymbolCount: readModel?.facts.trainableSymbolCount ?? 0,
    startCandidates: readModel?.startCandidates ?? [],
    startReadiness: readModel?.startReadiness ?? null,
    samplePoolOptions,
    symbolOptions,
    modeOptions,
    assetOptions,
    timeframeOptions,
    blindBoxOptions,
    setMode,
    setBaseTimeframe,
    setBlindBoxValue,
    setSelectedPoolId,
    setSelectedSymbol: setSelectedInstrumentId,
  };
};
