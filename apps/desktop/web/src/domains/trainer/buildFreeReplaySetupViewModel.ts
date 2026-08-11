// SPDX-License-Identifier: GPL-3.0-only

import type { AppIconName } from "@/assets/graphics";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import type {
  FreeReplayAdvancePeriod,
  FreeReplayAssetClass,
  FreeReplayBaseTimeframe,
  FreeReplayMode,
  FreeReplayPrepConfig,
  FreeReplayStartDisableReason,
} from "@/domains/trainer/freeReplaySetup";
import type {
  TrainerStartPointApplyPayload,
  TrainerStartPointWindowPayload,
} from "@/domains/trainer/trainerStartPointTypes";

type TrainerFreeReplayModeOption = {
  value: FreeReplayMode;
  label: string;
};
type FreeReplayOptionLabelFormatter = (key: AppTextKey) => string;
type FreeReplayBlindBoxValue = "SHOW" | "HIDE";
type FreeReplayMinimumBaseTimeframeOption = {
  value: FreeReplayAdvancePeriod;
  label: string;
  disabled?: boolean;
};
type FreeReplaySamplePoolOption = {
  value: string;
  label: string;
  locked?: boolean;
  symbolCount: number;
  assetClassLabel?: string;
  marketPresetId?: string;
  marketPresetLabel?: string;
  sourceBaseTimeframe?: FreeReplayBaseTimeframe;
  minimumBaseTimeframeOptions?: FreeReplayMinimumBaseTimeframeOption[];
};
type FreeReplaySymbolOption = {
  value: string;
  label: string;
  locked?: boolean;
  lockReason?: string | null;
};
type FreeReplayBlindBoxOption = {
  value: FreeReplayBlindBoxValue;
  label: string;
};

type FreeReplaySelectionPreviewTextArgs = {
  isRandomMode: boolean;
  samplePoolLabel: string;
  samplePoolMetaText: string;
  environmentPresetLabel: string;
  minimumBaseTimeframe: string;
  symbolLabel: string;
  anchorLabel: string;
  blindBoxActiveLabel: string;
  blindBoxValue: "SHOW" | "HIDE";
  joiner: string;
};

const TRAINER_META_JOINER = "·";

const formatFreeReplaySelectionPreviewText = ({
  isRandomMode,
  samplePoolLabel,
  samplePoolMetaText,
  environmentPresetLabel,
  minimumBaseTimeframe,
  symbolLabel,
  anchorLabel,
  blindBoxActiveLabel,
  blindBoxValue,
  joiner,
}: FreeReplaySelectionPreviewTextArgs): string => {
  const parts = isRandomMode
    ? [
        samplePoolLabel,
        samplePoolMetaText,
        environmentPresetLabel,
        minimumBaseTimeframe,
      ]
    : [
        samplePoolLabel,
        samplePoolMetaText,
        environmentPresetLabel,
        minimumBaseTimeframe,
        symbolLabel,
        anchorLabel,
      ];
  if (isRandomMode && blindBoxValue === "HIDE") {
    parts.push(blindBoxActiveLabel);
  }
  return parts.filter(Boolean).join(` ${joiner} `);
};

const resolveFreeReplayStartHelperText = ({
  isRandomMode,
  disableReason,
  ui,
}: {
  isRandomMode: boolean;
  disableReason: FreeReplayStartDisableReason;
  ui: UiLabelEntry;
}): string => {
  if (disableReason === "NO_SAMPLES") {
    return ui.freeReplayEmptyState;
  }
  if (disableReason === "NO_SYMBOL") {
    return ui.freeReplayPrepSelectSymbolFirst;
  }
  if (disableReason === "NO_ANCHOR") {
    return ui.freeReplayPrepAnchorRequired;
  }
  return isRandomMode
    ? ui.freeReplayPrepRandomHint
    : ui.freeReplayPrepFocusedHint;
};

const formatFreeReplayAdvancePeriodLabel = (
  period: FreeReplayAdvancePeriod,
  tt: FreeReplayOptionLabelFormatter,
): string => {
  switch (period) {
    case "1m":
      return tt("uiConfig.displayPeriod.1m");
    case "5m":
      return tt("uiConfig.displayPeriod.5m");
    case "1h":
      return tt("uiConfig.displayPeriod.1h");
    case "1d":
      return tt("uiConfig.displayPeriod.1d");
    case "1w":
      return tt("uiConfig.displayPeriod.1w");
    case "1month":
      return tt("uiConfig.displayPeriod.1month");
    case "1year":
      return tt("uiConfig.displayPeriod.1year");
    default:
      return period;
  }
};

export type BuildFreeReplaySetupViewModelArgs = {
  isPrepMode: boolean;
  ui: UiLabelEntry;
  tt: FreeReplayOptionLabelFormatter;
  freeReplayModeOptions: TrainerFreeReplayModeOption[];
  freeReplayPrepConfig: FreeReplayPrepConfig;
  freeReplayEnvironmentAssetOptions: Array<{
    value: FreeReplayAssetClass;
    label: string;
  }>;
  freeReplayEnvironmentPresetOptions: Array<{
    value: string;
    label: string;
  }>;
  freeReplaySelectedEnvironmentAssetClass: FreeReplayAssetClass;
  freeReplaySelectedEnvironmentPresetId: string;
  freeReplaySelectedEnvironmentPresetLabel: string;
  freeReplayEnvironmentRuleCards: Array<{
    id: string;
    label: string;
    value: string;
  }>;
  freeReplayPersistEnvironmentToPool: boolean;
  freeReplayTimeframeOptions: FreeReplayMinimumBaseTimeframeOption[];
  freeReplaySamplePoolOptions: FreeReplaySamplePoolOption[];
  freeReplaySelectedPoolId: string;
  freeReplaySymbolOptions: FreeReplaySymbolOption[];
  freeReplayAvailableSymbolCount: number;
  freeReplaySelectedInstrumentId: string;
  freeReplaySelectedSymbol: string;
  freeReplayPrepAnchorText: string;
  freeReplayBlindBoxOptions: FreeReplayBlindBoxOption[];
  freeReplayBlindBoxValue: FreeReplayBlindBoxValue;
  startPointWindowPayload?: TrainerStartPointWindowPayload;
  onApplyStartPoint: (selection: TrainerStartPointApplyPayload) => Promise<void>;
  freeReplayStartDisabled: boolean;
  freeReplayStartDisableReason: FreeReplayStartDisableReason;
  freeReplayHasAvailableSymbols: boolean;
  freeReplayStartButtonIconName: AppIconName;
  startPreparedFreeReplay: () => void;
  resetTrainerToPrepView: () => void;
  canResumeTrainerSession: boolean;
  resumeLatestTrainerSession: () => void;
  handleFreeReplayPrepModeChange: (value: FreeReplayMode) => void;
  handleFreeReplayPrepEnvironmentAssetClassChange: (
    value: FreeReplayAssetClass,
  ) => void;
  handleFreeReplayPrepEnvironmentPresetChange: (value: string) => void;
  handleFreeReplayPrepPersistEnvironmentToPoolChange: (
    next: boolean,
  ) => void;
  handleFreeReplayPrepBaseTimeframeChange: (value: FreeReplayAdvancePeriod) => void;
  handleFreeReplayPrepSamplePoolChange: (value: string) => void;
  handleFreeReplayPrepSymbolChange: (value: string) => void;
  handleFreeReplayPrepBlindBoxChange: (value: FreeReplayBlindBoxValue) => void;
};

export const buildFreeReplaySetupViewModel = ({
  isPrepMode,
  ui,
  tt,
  freeReplayModeOptions,
  freeReplayPrepConfig,
  freeReplayEnvironmentAssetOptions,
  freeReplayEnvironmentPresetOptions,
  freeReplaySelectedEnvironmentAssetClass,
  freeReplaySelectedEnvironmentPresetId,
  freeReplaySelectedEnvironmentPresetLabel,
  freeReplayEnvironmentRuleCards,
  freeReplayPersistEnvironmentToPool,
  freeReplayTimeframeOptions,
  freeReplaySamplePoolOptions,
  freeReplaySelectedPoolId,
  freeReplaySymbolOptions,
  freeReplayAvailableSymbolCount,
  freeReplaySelectedInstrumentId,
  freeReplaySelectedSymbol,
  freeReplayPrepAnchorText,
  freeReplayBlindBoxOptions,
  freeReplayBlindBoxValue,
  startPointWindowPayload,
  onApplyStartPoint,
  freeReplayStartDisabled,
  freeReplayStartDisableReason,
  freeReplayHasAvailableSymbols,
  freeReplayStartButtonIconName,
  startPreparedFreeReplay,
  resetTrainerToPrepView,
  canResumeTrainerSession,
  resumeLatestTrainerSession,
  handleFreeReplayPrepModeChange,
  handleFreeReplayPrepEnvironmentAssetClassChange,
  handleFreeReplayPrepEnvironmentPresetChange,
  handleFreeReplayPrepPersistEnvironmentToPoolChange,
  handleFreeReplayPrepBaseTimeframeChange,
  handleFreeReplayPrepSamplePoolChange,
  handleFreeReplayPrepSymbolChange,
  handleFreeReplayPrepBlindBoxChange,
}: BuildFreeReplaySetupViewModelArgs) => {
  const modeOptions = freeReplayModeOptions.map((option) => ({
    ...option,
    iconName:
      (option.value === "RANDOM"
        ? "actionShuffleCross"
        : "statusTarget") as AppIconName,
  }));
  const selectedSamplePool =
    freeReplaySamplePoolOptions.find(
      (option) => option.value === freeReplaySelectedPoolId,
    ) ?? null;
  const selectedSamplePoolLabel = selectedSamplePool?.label ?? tt("appText.matchingSamplePool");
  const selectedSamplePoolSourceTimeframeLabel =
    selectedSamplePool?.sourceBaseTimeframe
      ? formatFreeReplayAdvancePeriodLabel(
          selectedSamplePool.sourceBaseTimeframe,
          tt,
        )
      : "";
  const selectedSamplePoolMetaText = [
    selectedSamplePool?.assetClassLabel ?? "",
    selectedSamplePoolSourceTimeframeLabel,
  ]
    .filter(Boolean)
    .join(` ${TRAINER_META_JOINER} `);
  const selectedMinimumBaseTimeframe =
    freeReplayPrepConfig.minimumBaseTimeframe ??
    freeReplayPrepConfig.baseTimeframe ??
    "1d";
  const selectedMinimumBaseTimeframeLabel = formatFreeReplayAdvancePeriodLabel(
    selectedMinimumBaseTimeframe,
    tt,
  );
  const normalizedSelectedSymbol = String(freeReplaySelectedSymbol || "")
    .trim()
    .toUpperCase();
  const isRandomMode = freeReplayPrepConfig.mode !== "FOCUSED";
  const selectionPreviewText = formatFreeReplaySelectionPreviewText({
    isRandomMode,
    samplePoolLabel: selectedSamplePoolLabel,
    samplePoolMetaText: selectedSamplePoolMetaText,
    environmentPresetLabel: freeReplaySelectedEnvironmentPresetLabel,
    minimumBaseTimeframe: selectedMinimumBaseTimeframeLabel,
    symbolLabel: normalizedSelectedSymbol || tt("appText.matchingSymbol"),
    anchorLabel:
      freeReplayPrepAnchorText || ui.freeReplayPrepSummaryPendingAnchor,
    blindBoxActiveLabel: ui.freeReplayBlindBoxActive,
    blindBoxValue: freeReplayBlindBoxValue,
    joiner: TRAINER_META_JOINER,
  });
  const defaultStartHelperText = resolveFreeReplayStartHelperText({
    isRandomMode,
    disableReason: freeReplayStartDisableReason,
    ui,
  });
  const startHelperText =
    selectedSamplePool?.locked && freeReplayStartDisableReason === "NO_SAMPLES"
      ? isRandomMode
        ? ui.freeReplayPrepRandomHint
        : ui.freeReplayPrepFocusedHint
      : defaultStartHelperText;
  const startPointEmptyText = normalizedSelectedSymbol
    ? ui.freeReplayPrepAnchorRequired
    : ui.freeReplayPrepSelectSymbolFirst;
  const startPointSummaryText =
    freeReplayPrepAnchorText || startPointEmptyText;

  return {
    isPrepMode,
    dialogTitle: ui.freeReplayPrepTitle,
    dialogSubtitle: ui.freeReplayPrepSubtitle,
    modeLabel: ui.mode,
    modeOptions,
    selectedMode: freeReplayPrepConfig.mode,
    onSelectMode: handleFreeReplayPrepModeChange,
    summaryLabel: ui.freeReplayPrepSummaryLabel,
    summaryText: selectionPreviewText,
    startHelperText,
    samplePoolLabel: ui.randomPool,
    selectedSamplePool: selectedSamplePool
      ? {
          id: selectedSamplePool.value,
          label: selectedSamplePool.label,
          locked: selectedSamplePool.locked,
          symbolCount: selectedSamplePool.symbolCount,
        }
      : null,
    symbolLabel: ui.symbol,
    symbolSearchPlaceholder: ui.freeReplaySymbolSearch,
    startPointLabel: tt("appText.trainingStart"),
    startPointEmptyText,
    startPointSummaryText,
    blindBoxLabel: ui.freeReplayBlindBox,
    blindBoxActiveLabel: ui.freeReplayBlindBoxActive,
    emptyStateText: ui.freeReplayEmptyState,
    startLabel: ui.freeReplayStart,
    samplePoolOptions: freeReplaySamplePoolOptions.map((option) => ({
      value: option.value,
      label: option.label,
      locked: option.locked,
      symbolCount: option.symbolCount,
      assetClassLabel: option.assetClassLabel,
      marketPresetId: option.marketPresetId,
      marketPresetLabel: option.marketPresetLabel,
      sourceBaseTimeframe: option.sourceBaseTimeframe,
      minimumBaseTimeframeOptions: option.minimumBaseTimeframeOptions?.map(
        (timeframeOption) => ({
          ...timeframeOption,
          label: formatFreeReplayAdvancePeriodLabel(timeframeOption.value, tt),
        }),
      ),
    })),
    selectedSamplePoolId: freeReplaySelectedPoolId,
    onSelectSamplePool: handleFreeReplayPrepSamplePoolChange,
    noSamplePoolLabel: tt("appText.matchingSamplePool"),
    environmentDefaultTitle: ui.freeReplayEnvironmentDefaultTitle,
    selectedPoolDataTraits: [
      ...(selectedSamplePool?.assetClassLabel
        ? [
            {
              id: "assetClass" as const,
              label: ui.freeReplayAssetClass,
              value: selectedSamplePool.assetClassLabel,
            },
          ]
        : []),
      ...(selectedSamplePool?.marketPresetLabel
        ? [
            {
              id: "marketPreset" as const,
              label: ui.freeReplayEnvironmentPresetLabel,
              value: selectedSamplePool.marketPresetLabel,
            },
          ]
        : []),
      ...(selectedSamplePool?.sourceBaseTimeframe
        ? [
            {
              id: "sourceTimeframe" as const,
              label: ui.freeReplaySourceTimeframe,
              value: selectedSamplePoolSourceTimeframeLabel,
            },
          ]
        : []),
    ],
    environmentAssetLabel: ui.freeReplayAssetClass,
    environmentAssetOptions: freeReplayEnvironmentAssetOptions,
    selectedEnvironmentAssetClass: freeReplaySelectedEnvironmentAssetClass,
    onSelectEnvironmentAssetClass:
      handleFreeReplayPrepEnvironmentAssetClassChange,
    environmentPresetLabel: ui.freeReplayEnvironmentPresetLabel,
    environmentPresetOptions: freeReplayEnvironmentPresetOptions,
    selectedEnvironmentPresetId: freeReplaySelectedEnvironmentPresetId,
    selectedEnvironmentPresetText: freeReplaySelectedEnvironmentPresetLabel,
    onSelectEnvironmentPreset: handleFreeReplayPrepEnvironmentPresetChange,
    environmentRulesTitle: ui.freeReplayEnvironmentRulesTitle,
    environmentRuleCards: freeReplayEnvironmentRuleCards,
    persistEnvironmentToPoolLabel: ui.freeReplayEnvironmentSyncLabel,
    persistEnvironmentToPoolHint: ui.freeReplayEnvironmentSyncHint,
    persistEnvironmentToPool: freeReplayPersistEnvironmentToPool,
    onPersistEnvironmentToPoolChange:
      handleFreeReplayPrepPersistEnvironmentToPoolChange,
    minimumBaseTimeframeLabel: ui.freeReplayTimeframe,
    minimumBaseTimeframeOptions: freeReplayTimeframeOptions.map((option) => ({
      ...option,
      label: formatFreeReplayAdvancePeriodLabel(option.value, tt),
    })),
    selectedMinimumBaseTimeframe: selectedMinimumBaseTimeframe,
    onSelectMinimumBaseTimeframe: handleFreeReplayPrepBaseTimeframeChange,
    symbolOptions: freeReplaySymbolOptions,
    availableSymbolCount: freeReplayAvailableSymbolCount,
    selectedSymbolId: freeReplaySelectedInstrumentId,
    selectedSymbol: freeReplaySelectedSymbol,
    onSelectSymbol: handleFreeReplayPrepSymbolChange,
    noSymbolLabel: tt("appText.matchingSymbol"),
    blindBoxOptions: freeReplayBlindBoxOptions,
    blindBoxValue: freeReplayBlindBoxValue,
    onSelectBlindBox: handleFreeReplayPrepBlindBoxChange,
    startPointWindowPayload,
    onApplyStartPoint,
    startDisabled: freeReplayStartDisabled,
    showEmptyStateText: !freeReplayHasAvailableSymbols,
    startButtonIconName: freeReplayStartButtonIconName,
    environmentTitle: ui.freeReplayEnvironmentTitle,
    environmentActionLabel: ui.freeReplayEnvironmentAction,
    environmentSummary: [],
    onStart: startPreparedFreeReplay,
    onResetToPrepView: resetTrainerToPrepView,
    showResumeAction: canResumeTrainerSession,
    resumeLabel: ui.freeReplayResumeLast,
    resumeDisabled: !canResumeTrainerSession,
    onResume: resumeLatestTrainerSession,
  };
};
