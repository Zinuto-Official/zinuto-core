// SPDX-License-Identifier: GPL-3.0-only

import type { AppIconName } from "@/assets/graphics";
import type { DesktopOnboardingTargetId } from "@/domains/onboarding/desktopOnboardingModel";
import type {
  OrderEstimate,
  TradeCapacitySummary,
} from "@/domains/training/types";
import type { TrainerHydrationState } from "@/domains/trainer/trainerHydration";
import type { TrainerTradingAssetUiModel } from "@/domains/trainer/trainerTradingAssetUi";
import type {
  FreeReplayAdvancePeriod,
  FreeReplayAssetClass,
  FreeReplayBaseTimeframe,
  FreeReplayMode,
} from "@/domains/trainer/freeReplaySetup";
import type {
  TrainerStartPointApplyPayload,
  TrainerStartPointWindowPayload,
} from "@/domains/trainer/trainerStartPointTypes";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import type {
  OrderInputMode,
  PriceMode,
} from "@zinuto/shared/trading";
import type { ReactNode } from "react";
import type {
  TrainerMarketPresetEditorModel,
} from "@/workspaces/trainer/TrainerMarketPresetInlinePanel";

export type TradeInputMode = OrderInputMode;
export type OrderPriceMode = PriceMode;

export type TradeFillRow = {
  id: string;
  side: "BUY" | "SELL";
  fill_time?: string;
  fill_price: number;
  fill_qty: number;
  contract_multiplier: number;
  fee: number;
  tax: number;
  slippage: number;
};

export type FreeReplayBlindBoxValue = "SHOW" | "HIDE";

export type FreeReplayMinimumBaseTimeframeOption = {
  value: FreeReplayAdvancePeriod;
  label: string;
  disabled?: boolean;
};

export type FreeReplayBlindBoxOption = {
  value: FreeReplayBlindBoxValue;
  label: string;
};

export type FreeReplaySamplePoolOption = {
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

export type FreeReplaySymbolOption = {
  value: string;
  label: string;
  locked?: boolean;
  lockReason?: string | null;
};

export type FreeReplayPoolDataTrait = {
  id: "assetClass" | "marketPreset" | "sourceTimeframe";
  label: string;
  value: string;
  iconName?: AppIconName;
};

export type FreeReplayEnvironmentAssetOption = {
  value: FreeReplayAssetClass;
  label: string;
};

export type FreeReplayEnvironmentPresetOption = {
  value: string;
  label: string;
};

export type FreeReplayEnvironmentRuleCard = {
  id: string;
  label: string;
  value: string;
};

export type FreeReplayEnvironmentSummaryItem = {
  label: string;
  value: string;
};

export type FreeReplaySetupProps = {
  isPrepMode: boolean;
  dialogTitle: string;
  dialogSubtitle: string;
  modeLabel: string;
  modeOptions: Array<{
    value: FreeReplayMode;
    label: string;
    iconName: AppIconName;
  }>;
  selectedMode: FreeReplayMode;
  onSelectMode: (value: FreeReplayMode) => void;
  summaryLabel: string;
  summaryText: string;
  startHelperText: string;
  samplePoolLabel: string;
  selectedSamplePool: {
    id: string;
    label: string;
    locked?: boolean;
    symbolCount: number;
  } | null;
  symbolLabel: string;
  symbolSearchPlaceholder: string;
  startPointLabel: string;
  startPointEmptyText: string;
  startPointSummaryText: string;
  blindBoxLabel: string;
  blindBoxActiveLabel: string;
  emptyStateText: string;
  startLabel: string;
  samplePoolOptions: FreeReplaySamplePoolOption[];
  selectedSamplePoolId: string;
  onSelectSamplePool: (value: string) => void;
  noSamplePoolLabel: string;
  environmentDefaultTitle: string;
  selectedPoolDataTraits: FreeReplayPoolDataTrait[];
  environmentAssetLabel: string;
  environmentAssetOptions: FreeReplayEnvironmentAssetOption[];
  selectedEnvironmentAssetClass: FreeReplayAssetClass;
  onSelectEnvironmentAssetClass: (value: FreeReplayAssetClass) => void;
  environmentPresetLabel: string;
  environmentPresetOptions: FreeReplayEnvironmentPresetOption[];
  selectedEnvironmentPresetId: string;
  selectedEnvironmentPresetText: string;
  onSelectEnvironmentPreset: (value: string) => void;
  environmentRulesTitle: string;
  environmentRuleCards: FreeReplayEnvironmentRuleCard[];
  persistEnvironmentToPoolLabel: string;
  persistEnvironmentToPoolHint: string;
  persistEnvironmentToPool: boolean;
  onPersistEnvironmentToPoolChange: (next: boolean) => void;
  minimumBaseTimeframeLabel: string;
  minimumBaseTimeframeOptions: FreeReplayMinimumBaseTimeframeOption[];
  selectedMinimumBaseTimeframe: FreeReplayAdvancePeriod;
  onSelectMinimumBaseTimeframe: (value: FreeReplayAdvancePeriod) => void;
  symbolOptions: FreeReplaySymbolOption[];
  availableSymbolCount: number;
  selectedSymbolId: string;
  selectedSymbol: string;
  onSelectSymbol: (value: string) => void;
  onApplyStartPoint: (selection: TrainerStartPointApplyPayload) => Promise<void>;
  noSymbolLabel: string;
  blindBoxOptions: FreeReplayBlindBoxOption[];
  blindBoxValue: FreeReplayBlindBoxValue;
  onSelectBlindBox: (value: FreeReplayBlindBoxValue) => void;
  startPointWindowPayload?: TrainerStartPointWindowPayload;
  startDisabled: boolean;
  showEmptyStateText: boolean;
  startButtonIconName: AppIconName;
  environmentTitle: string;
  environmentActionLabel: string;
  environmentSummary: FreeReplayEnvironmentSummaryItem[];
  onStart: () => void;
  showResumeAction: boolean;
  resumeLabel: string;
  resumeDisabled: boolean;
  onResume: () => void;
  onResetToPrepView: () => void;
};

export type TrainerWorkspacePageProps = {
  embedded?: boolean;
  isActive?: boolean;
  onboardingTargetId?: DesktopOnboardingTargetId | null;
  trainerChartWorkspaceLayout: ReactNode;
  ui: {
    endAllTraining: string;
    tradeSettings: string;
    nextBar: string;
    currentClose: string;
    nextOpen: string;
  };
  freeReplaySetup: FreeReplaySetupProps;
  tradingAssetUi: TrainerTradingAssetUiModel;
  tradeLogBaseTimeframe: FreeReplayBaseTimeframe;
  tradeLogTimeZone?: string | null;
  tradingPresetEditor: TrainerMarketPresetEditorModel;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values?: Array<unknown>) => string;
  trainerHydrationState: TrainerHydrationState;
  isBusy: boolean;
  isPreparingAction: boolean;
  trainingDays: number;
  trainingKlineCount: number;
  trainingKlineSourceProgressLine: string;
  hasTrainingKlineProgressWarning: boolean;
  calendarSpanText: string;
  replaySpanText: string;
  securitiesTotal: number;
  securitiesDelta: number;
  positionMarketValue: number;
  securitiesAccount: { balance?: number; currency?: string } | null;
  currentPosition:
    | {
        qty?: number;
        unrealizedPnl?: number;
        totalPnl?: number;
      }
    | null
    | undefined;
  currentLeverageSummary: {
    isActive: boolean;
    isConfigured: boolean;
    allowLongMarginTrading: boolean;
    allowShortSelling: boolean;
    holdingStartDate: string | null;
    holdingEndDate: string | null;
    longFinancingFee: number;
    cumulativeLongFinancingFee: number;
    shortAmount: number;
    shortFee: number;
    cumulativeShortFee: number;
    totalFee: number;
    shortQty: number;
    shortAmountRatio: number;
    shortQtyRatio: number;
  };
  currentTradingFee: number;
  floatingRate: number;
  cumulativePnlRate: number;
  tradeCapacity: TradeCapacitySummary;
  trainingDateRange: string;
  buyTradeInputMode: TradeInputMode;
  buyLotInput: string;
  buyAmountInput: string;
  buyRatioInput: string;
  buyRatioPresetOptions: string[];
  buyEstimate: OrderEstimate;
  sellEstimate: OrderEstimate;
  buyPriceMode: OrderPriceMode;
  buyOrderDisabled: boolean;
  buyBlockReason?: string;
  sellOrderDisabled: boolean;
  sellBlockReason?: string;
  nextOpenUnavailable: boolean;
  tradeLogRows: Array<{ fill: TradeFillRow; sequence: string }>;
  tradeLogSideStats: { buyCount: number; sellCount: number };
  formatMoney: (value: number, digits?: number) => string;
  formatRatio: (value: number) => string;
  formatSignedMoney: (value: number) => string;
  formatTradingQuantityText: (
    quantity: number,
    kind?: "ORDER" | "POSITION" | "ORDER_PRIMARY",
  ) => string;
  formatTradeLogQuantityText: (quantity: number) => string;
  withCountUnit: (value: string, unit: string) => string;
  withBuySellCount: (buy: string | number, sell: string | number) => string;
  pnlClass: (value: number) => string;
  normalizeInput: (value: string) => string;
  setBuyTradeInputMode: (mode: TradeInputMode) => void;
  setBuyLotInput: (value: string) => void;
  setBuyAmountInput: (value: string) => void;
  setBuyRatioInput: (value: string) => void;
  setBuyPriceMode: (mode: OrderPriceMode) => void;
  stepNext: () => Promise<void>;
  isStepNextDisabled: boolean;
  canUndo: boolean;
  undoAvailableSteps: number;
  undoMaxSteps: number;
  lastUndoableAction: "STEP" | "BUY" | "SELL" | null;
  undo: () => Promise<void>;
  placeOrder: (side: "BUY" | "SELL") => Promise<void>;
  openResetAllDialog: () => Promise<void>;
};

export type TrainerPositionMetricProps = {
  label: ReactNode;
  value: ReactNode;
  meta?: ReactNode;
  className?: string;
  valueClassName?: string;
  metaClassName?: string;
};
