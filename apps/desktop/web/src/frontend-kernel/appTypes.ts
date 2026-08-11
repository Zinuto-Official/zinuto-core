// SPDX-License-Identifier: GPL-3.0-only

import type { OverlayMode } from 'klinecharts';
import type {
  OrderInputMode,
  PriceMode,
} from '@zinuto/shared/trading';
import type { BaseTimeframe } from '@zinuto/shared/timeframe';
import type { TradingCalendarConfig as ApiTradingCalendarConfig } from '@zinuto/shared/tradingCalendar';
import type {
  OperatorSummary,
} from '@zinuto/shared/operatorSummary';
import type { TradeColorThemeToken } from '@/ui/theme/visual/types';
import type { ThemeMode } from '@/ui/theme/themeTokens';
import type { DesktopCloseButtonAction } from '@/frontend-kernel/windowBehaviorTypes';
import type { FontSizePreset, UiLanguage } from '@/frontend-kernel/typography';
import type { UiLanguagePreferenceSource } from '@/frontend-kernel/i18n/localeState';
import type { ChartRenderMode } from '@/domains/chart/chartRenderMode';
import type { PriceColorMode } from '@/domains/chart/display';
import type {
  TradingAssetClassId,
  TradingCustomFeeTemplateMeta,
  TradingMarketPresetLabelOverridesById,
  TradingMarketPresetId,
  TradingMarketPresetValues
} from '@/domains/trainer/tradingMarketPresets';
import type {
  AggregatedBarItem as ChartAggregatedBarItem
} from '@/domains/chart/replayAggregation';
import type { DrawLineType } from '@/domains/chart/drawingTypes';
import type { DisplayPeriodKey } from '@/domains/chart/chartPeriods';
import type { ArchivedReplayData } from '@/domains/history/replayArchiveTypes';
import type { SignalIndicatorName } from '@/domains/indicators/core';
import type { CsvFieldMapping } from '@/domains/data-import/csvHelpers';
import type { DataSourceSyncPrefsById } from '@/domains/data-import/dataSourceTypes';
import type {
  DesktopOnboardingTourStatus,
  DesktopOnboardingTourStep,
} from '@/domains/onboarding/desktopOnboardingModel';
import type {
  ReplayBar,
  ReplayCurvePoint,
  ReplayTradeRound
} from '@/domains/trainer/trainerTypes';
import type { SessionTerminationReasonCode, TrainingSummary } from '@/domains/training/types';

export type SessionNameFormat = 'YYYY-MM-DD HH:SS' | 'MM-DD HH:SS' | 'HH:SS' | 'YYYY-MM-DD' | 'MM-DD';
export type { FontSizePreset, ThemeMode, UiLanguage };
export type { ChartRenderMode };
export type {
  DisplayPeriodKey,
  ReplayBar,
  ReplayCurvePoint,
  ReplayTradeRound,
  TradeColorThemeToken
};

export type AggregatedBarItem = ChartAggregatedBarItem;

export type AggregationCacheEntry = {
  period: DisplayPeriodKey;
  start: number;
  end: number;
  items: AggregatedBarItem[];
};

export type TrainingProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  initialTotal: number;
  totalPnl: number;
  profitRate: number;
  durationDays: number;
  totalTrades: number;
  symbol: string;
  samplePoolId: string;
  samplePoolName: string;
  baseTimeframe: string;
  trainingDateRange: string;
  summary: TrainingSummary;
  finalEquity: number;
  equityReturnRate: number;
  assetClass?: TradingAssetClassId;
  detailExpiredAt?: string | null;
  replayHydrationStatus?: "READY" | "SOURCE_CHANGED" | "SOURCE_MISSING" | "SNAPSHOT_ONLY" | "EXPIRED";
  replay?: ArchivedReplayData;
  operatorSummary: OperatorSummary;
};

export type CustomSamplePoolInstrument = {
  instrumentId: string;
  samplePoolId: string;
  symbol: string;
  displayLabel: string;
  sourceTimeframe: BaseTimeframe;
  barCount: number;
};

export type CustomSamplePool = {
  id: string;
  name: string;
  assetClass?: TradingAssetClassId;
  marketPresetId?: string;
  sourceFolder: string;
  sourceFolderBookmarkId?: string;
  importScopeStrategy?: 'FLAT' | 'WITH_PARENT' | null;
  importScopeTopLevelSubfolder?: string;
  instruments: CustomSamplePoolInstrument[];
  symbols: string[];
  sourceLocked?: boolean;
  unlockedSymbols?: string[];
  lockedSymbols?: string[];
  lockedSymbolCount?: number;
  lockReason?: string | null;
  fileCount: number;
  storageBytes: number;
  csvFieldMapping: CsvFieldMapping;
  tradingCalendar: ApiTradingCalendarConfig;
  baseTimeframe: BaseTimeframe;
  selected: boolean;
  createdAt: string;
  updatedAt: string;
};
export type { UiLanguagePreferenceSource };

export type UiSettings = {
  language?: UiLanguage;
  languageSource?: UiLanguagePreferenceSource;
  themeMode?: ThemeMode;
  priceColorMode?: PriceColorMode;
  tradeColorTheme?: TradeColorThemeToken;
  chartRenderMode?: ChartRenderMode;
  fontSizePreset?: FontSizePreset;
  mainNativeIndicator?: string;
  mainNativeIndicatorParams?: number[];
  signalTopIndicator?: SignalIndicatorName;
  signalTopIndicatorParams?: number[];
  signalBottomIndicator?: SignalIndicatorName;
  signalBottomIndicatorParams?: number[];
  includeSystemDefaultPool?: boolean;
  systemPoolNameOverrides?: Record<string, string>;
  customPoolNameOverrides?: Record<string, string>;
  freeReplayPoolDefaultEnvironmentById?: Record<string, { assetClass?: TradingAssetClassId; marketPresetId?: string }>;
  dataConfigPoolOrderByBase?: Partial<Record<BaseTimeframe, string[]>>;
  dataSourceSyncPrefsById?: DataSourceSyncPrefsById;
  selectedSystemRandomSymbols?: string[];
  selectedImportedRandomSymbols?: string[];
  activeSamplePoolId?: string;
  historySamplePoolFilter?: string;
  drawLineWidth?: number;
  drawLineType?: DrawLineType;
  drawColor?: string;
  drawMagnet?: OverlayMode;
  autoplayBarsPerSec?: string;
  buyTradeInputMode?: OrderInputMode;
  buyLotInput?: string;
  buyAmountInput?: string;
  buyRatioPresetInputs?: string[];
  buyRatioInput?: string;
  buyPriceMode?: PriceMode;
  sellTradeInputMode?: OrderInputMode;
  sellLotInput?: string;
  sellAmountInput?: string;
  sellRatioPresetInputs?: string[];
  sellRatioInput?: string;
  sellPriceMode?: PriceMode;
  lotSizeByPool?: Record<string, number>;
  lotSizeBySymbol?: Record<string, number>;
  uniformLotInput?: string;
  sessionNameFormat?: SessionNameFormat;
  trainerDisplayPeriod?: DisplayPeriodKey;
  showGlobalDecimals?: boolean;
  showDesktopHelpLauncher?: boolean;
  showDrawingsAcrossPeriods?: boolean;
  tradeMarkerDensityRatio?: number;
  tradingAssetClass?: TradingAssetClassId;
  tradingMarketPresetKey?: TradingMarketPresetId;
  tradingMarketPresetValuesByKey?: Partial<Record<TradingMarketPresetId, Partial<TradingMarketPresetValues>>>;
  tradingMarketPresetCustomTemplates?: TradingCustomFeeTemplateMeta[];
  tradingMarketPresetLabelOverridesById?: TradingMarketPresetLabelOverridesById;
  hiddenBuiltInTradingMarketPresetIds?: string[];
  developerModeEnabled?: boolean;
  onboardingTourStatus?: DesktopOnboardingTourStatus;
  onboardingTourStep?: DesktopOnboardingTourStep;
  desktopCloseButtonAction?: DesktopCloseButtonAction;
};

export type ActionDialogState = {
  kind: 'RESET_ALL';
  summary: TrainingSummary;
  terminationReasonCode?: SessionTerminationReasonCode | null;
};
