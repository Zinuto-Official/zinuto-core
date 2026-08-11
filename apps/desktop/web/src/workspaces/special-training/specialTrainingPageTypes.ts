// SPDX-License-Identifier: GPL-3.0-only

import type {
  ApiSpecialTrainingBank,
  ApiSpecialTrainingChallengeRuntime,
} from "@/api";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { ChartRenderMode } from "@/domains/chart/chartRenderMode";
import type { PriceColorMode } from "@/domains/chart/display";
import type { SystemMarkerRenderer } from "@/domains/chart/systemMarkerTypes";
import type { SpecialTrainingReplayOverlayContext } from "@/domains/chart/overlays/specialTrainingReplayOverlayTypes";
import type { HistoryReplayChartBindings } from "@/domains/chart/HistoryReplayChart";
import type { Bar } from "@/domains/training/types";
import type {
  SpecialTrainingChartSyncHandler,
  SpecialTrainingLaunchRequest,
  SpecialTrainingResumableSessionState,
  SpecialTrainingShortcutBindings,
} from "@/domains/special-training/specialTrainingContracts";
import type { TrainerChartWorkspaceProps } from "@/domains/trainer/TrainerChartWorkspace";
import type { ReplayContextSummaryChip } from "@/frontend-kernel/replayContext";
import type { DesktopOnboardingTargetId } from "@/domains/onboarding/desktopOnboardingModel";
import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type {
  AppUiLanguage,
  SpecialTrainingModeId,
} from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import { BUILT_IN_SAMPLE_POOL_IDS } from "@/domains/trainer/samplePools";
import type {
  SpecialTrainingQuestion,
  SpecialTrainingView,
} from "@/workspaces/special-training/domain/specialTrainingTypes";

export type SpecialTrainingPageProps = {
  language: AppUiLanguage;
  ui: UiLabelEntry;
  controlledModeId?: SpecialTrainingModeId;
  onRequestModeChange?: (modeId: SpecialTrainingModeId) => void;
  launchRequest?: SpecialTrainingLaunchRequest | null;
  enabledSamplePoolSymbols: string[];
  enabledSamplePools: Array<{
    id: string;
    name: string;
    assetClass: "STOCK" | "FUTURES" | "FOREX" | "CRYPTO";
    assetClassLabel: string;
    marketPresetId: string;
    baseTimeframe: BaseTimeframe;
    symbols: string[];
    instruments: Array<{
      instrumentId: string;
      symbol: string;
    }>;
    questionBankRevisionToken: string;
  }>;
  globalResetRevision: number;
  sharedTrainerChartWorkspaceProps: Omit<TrainerChartWorkspaceProps, "topBar">;
  onShortcutBindingsChange?: (
    payload: SpecialTrainingShortcutBindings | null,
  ) => void;
  onSyncChartQuestion?: SpecialTrainingChartSyncHandler;
  onCreateChallengeReviewNote?: (payload: {
    questionId: string;
    modeId: string;
    summaryChips: ReplayContextSummaryChip[];
    initialCapital: number;
    finalTotalAsset: number | null;
    maxDrawdownRatio: number;
    position: {
      qty: number;
      avgCost: number;
      markPrice: number;
    } | null;
    contextOverride?: {
      symbol: string;
      bars: Bar[];
      cursorIndex: number;
      tradeMarkers?: Array<{
        rawIndex: number;
        side: "BUY" | "SELL";
        price: number;
        label?: string;
      }>;
      baseTimeframe?: BaseTimeframe | null;
      specialTraining?: SpecialTrainingReplayOverlayContext | null;
    } | null;
  }) => void;
  isPageActive?: boolean;
  onboardingTargetId?: DesktopOnboardingTargetId | null;
  onResumableSessionChange?: (
    payload: SpecialTrainingResumableSessionState | null,
  ) => void;
  reviewSnapshotChart: {
    themeMode: "light" | "dark";
    priceColorMode: PriceColorMode;
    trainerDisplayPeriod: DisplayPeriodKey;
    chartRenderMode: ChartRenderMode;
    onChartRenderModeChange: (mode: ChartRenderMode) => void;
    showChartSettingsModal: boolean;
    openChartSettingsModal: () => void;
    setTrainerDisplayPeriod: (period: DisplayPeriodKey) => void;
    trainerPeriodOptionsByBase: Record<BaseTimeframe, DisplayPeriodKey[]>;
    bindings: HistoryReplayChartBindings;
    createSystemMarkers: SystemMarkerRenderer;
  };
};

export const resolveOnboardingDefaultSpecialTrainingBank = (
  banks: ApiSpecialTrainingBank[],
): ApiSpecialTrainingBank | null => {
  const builtInPoolIdSet = new Set<string>(BUILT_IN_SAMPLE_POOL_IDS);
  return (
    banks.find((bank) => {
      const poolIds = bank.scope.poolIds.map((poolId) => String(poolId));
      return (
        bank.assetClass === "STOCK" &&
        bank.targetTimeframe === "1d" &&
        !bank.simulationBatchId &&
        poolIds.length === builtInPoolIdSet.size &&
        poolIds.every((poolId) => builtInPoolIdSet.has(poolId))
      );
    }) ?? null
  );
};

export type CachedSpecialTrainingQuestionRuntime = {
  question: SpecialTrainingQuestion;
  bars: Bar[];
  runtime: ApiSpecialTrainingChallengeRuntime | null;
};

export type ApplyChallengeRuntimeOptions = {
  syncCurrentQuestionIndex?: boolean;
  updateDisplayedRuntime?: boolean;
};

export type ApplyChallengeRuntimeResult = {
  questionId: string;
  questionIndex: number;
  hasIncomingBars: boolean;
  hasResolvedBars: boolean;
  needsRuntimeHydration: boolean;
};

export type SpecialTrainingPageView = SpecialTrainingView;
