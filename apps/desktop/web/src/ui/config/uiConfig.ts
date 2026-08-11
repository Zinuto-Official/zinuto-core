// SPDX-License-Identifier: GPL-3.0-only

import { formatMessage } from "@zinuto/shared/i18n";
import {
  DRAW_TOOL_EXCLUDED_NATIVE_NAMES,
  DRAW_TOOL_INTERNAL_NAMES,
  DRAW_TOOL_LABELS,
  DRAW_TOOL_PREFERRED_ORDER,
  TRAINER_SHORTCUT_KEYS,
  buildDrawShortcutByTool,
} from "@/ui/config/uiConfig/staticOptionConfigMaps";
import { type AppUiLanguage } from "@/ui/config/appUiLanguage";
import {
  buildLocalizedRecord,
  formatUiConfigMessage,
  parseUiConfigJsonBundle,
} from "@/ui/config/uiConfig/uiConfigLocalization";

export {
  normalizeTradingCopyText,
  normalizeTradingCopyTree,
} from "@/ui/config/uiConfig/uiConfigLocalization";
export {
  getSpecialTrainingPageContent,
  SPECIAL_TRAINING_MODULE_BINDINGS,
} from "@/ui/config/uiConfig/specialTrainingContent";
export type { SpecialTrainingPageContent } from "@/ui/config/uiConfig/specialTrainingContent";

export type {
  SpecialTrainingModeDefinition,
  SpecialTrainingModeId,
} from "@/ui/config/uiConfig/specialTrainingModes";
export {
  APP_UI_BASE_LANGUAGE,
  APP_UI_LANGUAGES,
  type AppUiLanguage,
} from "@/ui/config/appUiLanguage";

export type ReplayNoteTitleMetricCopy = {
  profitLossRatio: string;
  winRate: string;
  advantageRatio: string;
  grade: string;
  recoveryRate: string;
};

export const getReplayNoteTitleMetricCopy = (
  language: AppUiLanguage,
): ReplayNoteTitleMetricCopy => ({
  profitLossRatio: formatMessage(
    language,
    "appText.replayNote.titleMetric.profitLossRatio",
  ),
  winRate: formatMessage(language, "appText.replayNote.titleMetric.winRate"),
  advantageRatio: formatMessage(
    language,
    "appText.replayNote.titleMetric.advantageRatio",
  ),
  grade: formatMessage(language, "appText.replayNote.titleMetric.grade"),
  recoveryRate: formatMessage(
    language,
    "appText.replayNote.titleMetric.recoveryRate",
  ),
});

export const REPLAY_NOTE_SUMMARY_CHIP_MATCHERS = Object.freeze({
  advantageRatio: ["优势比", "advantage"],
  judgement: ["判断", "你的选择", "选择", "selected", "choice"],
  actual: ["实际", "真实方向", "真实", "actual", "direction"],
  grade: ["评级", "grade"],
  recoveryRate: ["recovery", "挽回率"],
});
export type AppDisplayPeriodKey =
  "1m" | "5m" | "1h" | "1d" | "1w" | "1month" | "1year";

const DISPLAY_PERIOD_LABELS: Record<AppDisplayPeriodKey, string> = {
  "1m": "1 minute",
  "5m": "5 minutes",
  "1h": "1 hour",
  "1d": "Daily",
  "1w": "Weekly",
  "1month": "Monthly",
  "1year": "Yearly",
};

const DISPLAY_PERIOD_SHORT_LABELS: Record<AppDisplayPeriodKey, string> = {
  "1m": "1m",
  "5m": "5m",
  "1h": "1h",
  "1d": "1d",
  "1w": "1w",
  "1month": "1mo",
  "1year": "1y",
};

const DISPLAY_PERIOD_LABELS_BY_LANGUAGE: Record<
  AppUiLanguage,
  Record<AppDisplayPeriodKey, string>
> = buildLocalizedRecord((language) => ({
  "1m": formatUiConfigMessage(language, "displayPeriod.1m"),
  "5m": formatUiConfigMessage(language, "displayPeriod.5m"),
  "1h": formatUiConfigMessage(language, "displayPeriod.1h"),
  "1d": formatUiConfigMessage(language, "displayPeriod.1d"),
  "1w": formatUiConfigMessage(language, "displayPeriod.1w"),
  "1month": formatUiConfigMessage(language, "displayPeriod.1month"),
  "1year": formatUiConfigMessage(language, "displayPeriod.1year"),
}));

export const PERIOD_TITLE_BY_LANGUAGE: Record<AppUiLanguage, string> =
  buildLocalizedRecord((language) =>
    formatUiConfigMessage(language, "period.title"),
  );

export const PERIOD_ORIGIN_PREFIX_BY_LANGUAGE: Record<AppUiLanguage, string> =
  buildLocalizedRecord((language) =>
    formatUiConfigMessage(language, "period.originPrefix"),
  );

export const INDICATOR_LABEL_BY_LANGUAGE: Record<AppUiLanguage, string> =
  buildLocalizedRecord((language) =>
    formatUiConfigMessage(language, "indicator.title"),
  );

export type ChartRenderModeLabelMap = Record<
  "CANDLE" | "LINE" | "OHLC",
  string
>;

export const CHART_RENDER_MODE_LABELS_BY_LANGUAGE: Record<
  AppUiLanguage,
  ChartRenderModeLabelMap
> = buildLocalizedRecord((language) => ({
  CANDLE: formatUiConfigMessage(language, "chartRenderMode.CANDLE"),
  LINE: formatUiConfigMessage(language, "chartRenderMode.LINE"),
  OHLC: formatUiConfigMessage(language, "chartRenderMode.OHLC"),
}));

export const CHART_RENDER_MODE_GROUP_LABEL_BY_LANGUAGE: Record<
  AppUiLanguage,
  string
> = buildLocalizedRecord((language) =>
  formatUiConfigMessage(language, "chartRenderMode.groupTitle"),
);

export const INDICATOR_NONE_LABEL_BY_LANGUAGE: Record<AppUiLanguage, string> =
  buildLocalizedRecord((language) =>
    formatUiConfigMessage(language, "indicator.none"),
  );

export const REPLAY_NOTE_TYPE_LABEL_BY_LANGUAGE: Record<
  AppUiLanguage,
  Record<string, string>
> = buildLocalizedRecord((language) => ({
  FREE_REPLAY: formatUiConfigMessage(language, "replayNote.type.FREE_REPLAY"),
  CHALLENGE: formatUiConfigMessage(language, "replayNote.type.CHALLENGE"),
  CUSTOM: formatUiConfigMessage(language, "replayNote.type.CUSTOM"),
}));

export const REPLAY_NOTE_SEMANTIC_LABEL_BY_LANGUAGE: Record<
  AppUiLanguage,
  Record<string, string>
> = buildLocalizedRecord((language) => ({
  FREE_REPLAY: formatUiConfigMessage(
    language,
    "replayNote.semantic.FREE_REPLAY",
  ),
  CHALLENGE: formatUiConfigMessage(language, "replayNote.semantic.CHALLENGE"),
  CUSTOM: formatUiConfigMessage(language, "replayNote.semantic.CUSTOM"),
}));

export type ReplayNoteSeedTemplate = {
  content: string;
};

export const REPLAY_NOTE_SEEDING_BY_LANGUAGE: Record<
  AppUiLanguage,
  Record<string, ReplayNoteSeedTemplate>
> = buildLocalizedRecord((language) =>
  parseUiConfigJsonBundle(
    language,
    "replayNote.seeding.bundle",
    {} as Record<string, ReplayNoteSeedTemplate>,
  ),
);

export type ReplayNoteReflectionSectionText = {
  label: string;
  placeholder: string;
  description?: string;
};

export type ReplayNoteReflectionFormText = {
  dashboardTitle: string;
  replayTitle: string;
  title: string;
  subtitle: string;
  requiredTag: string;
  optionalTag: string;
  emptyText: string;
};

export const REPLAY_NOTE_REFLECTION_SECTION_TEXT_BY_LANGUAGE: Record<
  AppUiLanguage,
  Record<string, ReplayNoteReflectionSectionText>
> = buildLocalizedRecord((language) =>
  parseUiConfigJsonBundle(
    language,
    "replayNote.reflectionSection.bundle",
    {} as Record<string, ReplayNoteReflectionSectionText>,
  ),
);

export const REPLAY_NOTE_REFLECTION_FORM_TEXT_BY_LANGUAGE: Record<
  AppUiLanguage,
  ReplayNoteReflectionFormText
> = buildLocalizedRecord((language) =>
  parseUiConfigJsonBundle(language, "replayNote.reflectionForm.bundle", {
    dashboardTitle: "",
    replayTitle: "",
    title: "",
    subtitle: "",
    requiredTag: "",
    optionalTag: "",
    emptyText: "",
  } as ReplayNoteReflectionFormText),
);

export const REPLAY_NOTE_REFLECTION_COPY_BY_LANGUAGE: Record<
  AppUiLanguage,
  {
    dashboardTitle: string;
    replayTitle: string;
    reflectionTitle: string;
    markdownTitle: string;
    reflectionEmpty: string;
    sections: Record<
      string,
      {
        label: string;
        placeholder: string;
        description?: string;
      }
    >;
  }
> = buildLocalizedRecord((language) =>
  parseUiConfigJsonBundle(language, "replayNote.reflectionCopy.bundle", {
    dashboardTitle: "",
    replayTitle: "",
    reflectionTitle: "",
    markdownTitle: "",
    reflectionEmpty: "",
    sections: {},
  }),
);

export const DEFAULT_REPLAY_NOTE_TITLE_BY_LANGUAGE: Record<
  AppUiLanguage,
  string
> = buildLocalizedRecord((language) =>
  formatUiConfigMessage(language, "replayNote.defaultTitle"),
);

export const REPLAY_NOTE_FILTER_ALL_LABEL_BY_LANGUAGE: Record<
  AppUiLanguage,
  string
> = buildLocalizedRecord((language) =>
  formatUiConfigMessage(language, "replayNote.filter.all"),
);

export const REPLAY_NOTE_FILTER_TEXT_BY_LANGUAGE: Record<
  AppUiLanguage,
  {
    colorLabel: string;
    sourceLabel: string;
    allColorsLabel: string;
    allSourcesLabel: string;
    unknownSourceLabel: string;
  }
> = buildLocalizedRecord((language) => ({
  colorLabel: formatUiConfigMessage(language, "replayNote.filter.colorLabel"),
  sourceLabel: formatUiConfigMessage(language, "replayNote.filter.sourceLabel"),
  allColorsLabel: formatUiConfigMessage(
    language,
    "replayNote.filter.allColorsLabel",
  ),
  allSourcesLabel: formatUiConfigMessage(
    language,
    "replayNote.filter.allSourcesLabel",
  ),
  unknownSourceLabel: formatUiConfigMessage(
    language,
    "replayNote.filter.unknownSourceLabel",
  ),
}));

export const REPLAY_NOTE_REFERENCE_TEXT_BY_LANGUAGE: Record<
  AppUiLanguage,
  {
    title: string;
    empty: string;
    add: string;
    remove: string;
    selectPlaceholder: string;
    currentLabel: string;
  }
> = buildLocalizedRecord((language) => ({
  title: formatUiConfigMessage(language, "replayNote.reference.title"),
  empty: formatUiConfigMessage(language, "replayNote.reference.empty"),
  add: formatUiConfigMessage(language, "replayNote.reference.add"),
  remove: formatUiConfigMessage(language, "replayNote.reference.remove"),
  selectPlaceholder: formatUiConfigMessage(
    language,
    "replayNote.reference.selectPlaceholder",
  ),
  currentLabel: formatUiConfigMessage(
    language,
    "replayNote.reference.currentLabel",
  ),
}));

export const REPLAY_NOTE_PANEL_TEXT_BY_LANGUAGE: Record<
  AppUiLanguage,
  {
    bars: string;
    trades: string;
    fills: string;
    finalEquity: string;
    returnRate: string;
    maxDrawdown: string;
    range: string;
    symbol: string;
    timeframe: string;
    equityCurve: string;
    drawdownCurve: string;
  }
> = buildLocalizedRecord((language) => ({
  bars: formatUiConfigMessage(language, "replayNote.panel.bars"),
  trades: formatUiConfigMessage(language, "replayNote.panel.trades"),
  fills: formatUiConfigMessage(language, "replayNote.panel.fills"),
  finalEquity: formatUiConfigMessage(language, "replayNote.panel.finalEquity"),
  returnRate: formatUiConfigMessage(language, "replayNote.panel.returnRate"),
  maxDrawdown: formatUiConfigMessage(language, "replayNote.panel.maxDrawdown"),
  range: formatUiConfigMessage(language, "replayNote.panel.range"),
  symbol: formatUiConfigMessage(language, "replayNote.panel.symbol"),
  timeframe: formatUiConfigMessage(language, "replayNote.panel.timeframe"),
  equityCurve: formatUiConfigMessage(language, "replayNote.panel.equityCurve"),
  drawdownCurve: formatUiConfigMessage(
    language,
    "replayNote.panel.drawdownCurve",
  ),
}));

type TradingAssetClassLabelMap = Record<
  "STOCK" | "FUTURES" | "FOREX" | "CRYPTO",
  string
>;
type TradingMarketPresetLabelMap = Record<
  | "A_SHARE"
  | "HK_STOCK"
  | "US_STOCK"
  | "JP_STOCK"
  | "KR_STOCK"
  | "TW_STOCK"
  | "FUTURES_COMMODITY"
  | "FUTURES_FINANCIAL"
  | "FOREX_STANDARD_LOT"
  | "FOREX_MICRO_LOT"
  | "CRYPTO_SPOT"
  | "CRYPTO_USDT_PERP"
  | "ADD_CUSTOM",
  string
>;

type TradingSettingsText = {
  assetClassLabels: TradingAssetClassLabelMap;
  marketPresetLabels: TradingMarketPresetLabelMap;
  minTradeStepUnitPlaceholderByAssetClass: TradingAssetClassLabelMap;
  trainerTradeQuantityModeLabelByAssetClass: TradingAssetClassLabelMap;
  trainerTradeQuantityPlaceholderByAssetClass: TradingAssetClassLabelMap;
  trainerTradeQuantityUnitByAssetClass: TradingAssetClassLabelMap;
  trainerTradeQtyValueUnitByAssetClass: TradingAssetClassLabelMap;
  trainerTradeAmountModeLabelByAssetClass: TradingAssetClassLabelMap;
  trainerTradeAmountPlaceholderByAssetClass: TradingAssetClassLabelMap;
  trainerPositionQtyLabelByAssetClass: TradingAssetClassLabelMap;
  trainerPositionValueLabelByAssetClass: TradingAssetClassLabelMap;
  presetNameLabel: string;
  presetNamePlaceholder: string;
  saveToCurrentPresetActionLabel: string;
  saveAsNewPresetActionLabel: string;
  addPresetActionLabel: string;
  applyTradingSettingsActionLabel: string;
  deletePresetActionLabel: string;
  resetAllPresetParamsActionLabel: string;
  updateCurrentTemplateActionLabel: string;
  saveAsReusableTemplateActionLabel: string;
  confirmResetDefaultsActionLabel: string;
  rulesSummaryTitle: string;
  activeTemplateLabel: string;
  builtInTemplateBadgeLabel: string;
  customTemplateBadgeLabel: string;
  importRuleBindingHint: string;
  importRuleSummaryPrefix: string;
  importRuleEditActionLabel: string;
  importRuleCreateActionLabel: string;
  importRuleDrawerEditTitle: string;
  importRuleDrawerCreateTitle: string;
  importRuleDrawerApplyActionLabel: string;
  importRuleDrawerSaveAsNewActionLabel: string;
  importRuleDrawerOverwriteActionLabel: string;
  importRuleDrawerBuiltInHint: string;
  importRuleDrawerOverwriteConfirmTitle: string;
  importRuleDrawerOverwriteConfirmDescription: string;
  importRuleSummarySettlementModeLabels: Record<"T0" | "T1", string>;
  importRuleSummaryDirectionLabels: Record<
    "LONG_ONLY" | "SHORT_ONLY" | "BOTH",
    string
  >;
  importRuleSummarySlippageLabel: string;
  importRuleSummaryStampDutyModeLabels: Record<
    "BUY" | "SELL" | "DOUBLE",
    string
  >;
  importRuleSummaryMakerFeeLabel: string;
  importRuleSummaryTakerFeeLabel: string;
  assetClassSectionTitle: string;
  marketPresetsSectionTitle: string;
  drawerSectionMarketLabel: string;
  drawerSectionFrictionLabel: string;
  drawerSectionLeverageLabel: string;
  drawerDirtyStateLabel: string;
  drawerLiveEditHint: string;
  panelBasicRulesTitle: string;
  panelFrictionTitle: string;
  panelLeverageTitle: string;
  panelFrictionBrokerageGroupTitle: string;
  panelFrictionStatutoryGroupTitle: string;
  panelFrictionTaxAndExecutionGroupTitle: string;
  panelFrictionExchangeGroupTitle: string;
  panelFrictionFundingGroupTitle: string;
  panelLeverageContractGroupTitle: string;
  panelLeverageMarginGroupTitle: string;
  panelLeverageLongGroupTitle: string;
  panelLeverageShortGroupTitle: string;
  initialSecuritiesLabel: string;
  freeReplayEndSettlementModeLabel: string;
  freeReplayEndSettlementModeOptionLabels: Record<
    "FORCE_CLOSE" | "CURRENT_TOTAL_ASSET",
    string
  >;
  tradeSettlementModeLabel: string;
  tradeSettlementModeOptionLabels: Record<"T0" | "T1", string>;
  allowLongMarginTradingLabelByAssetClass: Record<
    "STOCK" | "FUTURES" | "FOREX" | "CRYPTO",
    string
  >;
  allowShortSellingLabel: string;
  allowShortSellingLabelByAssetClass: Record<
    "STOCK" | "FUTURES" | "FOREX" | "CRYPTO",
    string
  >;
  allowLongMarginTradingOptionLabels: Record<"ALLOW" | "DISALLOW", string>;
  allowShortSellingOptionLabels: Record<"ALLOW" | "DISALLOW", string>;
  minTradeStepLabel: string;
  commissionRateLabel: string;
  slippageRateLabel: string;
  stampDutyRateLabel: string;
  stampDutyModeLabel: string;
  stampDutyModeOptionLabels: Record<"BUY" | "SELL" | "DOUBLE", string>;
  transferFeeRateLabel: string;
  regulatoryFeeRateLabel: string;
  commissionMinimumFeeLabel: string;
  transactionLevyRateLabel: string;
  transactionLevyMinimumFeeLabel: string;
  platformFeeRateLabel: string;
  platformFeeMinimumFeeLabel: string;
  makerFeeRateLabelByAssetClass: Record<"FUTURES" | "FOREX" | "CRYPTO", string>;
  takerFeeRateLabelByAssetClass: Record<"FUTURES" | "FOREX" | "CRYPTO", string>;
  fundingRateLabelByAssetClass: Record<"FUTURES" | "FOREX" | "CRYPTO", string>;
  contractMultiplierLabelByAssetClass: Record<
    "STOCK" | "FUTURES" | "FOREX" | "CRYPTO",
    string
  >;
  longInitialMarginRatioLabel: string;
  longMaintenanceMarginRatioLabel: string;
  longFinancingAnnualRateLabel: string;
  shortInitialMarginRatioLabel: string;
  shortMaintenanceMarginRatioLabel: string;
  shortBorrowAnnualRateLabel: string;
};

const TRADING_SETTINGS_TEXT_BASE = {} as TradingSettingsText;

const TRADING_SETTINGS_TEXT_BY_LANGUAGE: Record<
  AppUiLanguage,
  TradingSettingsText
> = buildLocalizedRecord((language) =>
  parseUiConfigJsonBundle(
    language,
    "tradingSettings.bundle",
    TRADING_SETTINGS_TEXT_BASE,
  ),
);

export const getTradingSettingsText = (
  language: AppUiLanguage,
): TradingSettingsText =>
  TRADING_SETTINGS_TEXT_BY_LANGUAGE[language] ?? TRADING_SETTINGS_TEXT_BASE;

export {
  DRAW_TOOL_EXCLUDED_NATIVE_NAMES,
  DRAW_TOOL_INTERNAL_NAMES,
  DRAW_TOOL_LABELS,
  DRAW_TOOL_PREFERRED_ORDER,
  TRAINER_SHORTCUT_KEYS,
  buildDrawShortcutByTool,
};

export const isDisplayPeriodKey = (
  value: unknown,
): value is AppDisplayPeriodKey =>
  typeof value === "string" &&
  Object.prototype.hasOwnProperty.call(DISPLAY_PERIOD_LABELS, value);

export const getDisplayPeriodLabel = (
  period: AppDisplayPeriodKey,
  language: AppUiLanguage,
): string => DISPLAY_PERIOD_LABELS_BY_LANGUAGE[language]?.[period] ?? period;

export const getDisplayPeriodShortLabel = (
  period: AppDisplayPeriodKey,
): string => DISPLAY_PERIOD_SHORT_LABELS[period] ?? period;

export type CustomIndicatorRuleDocModuleKey =
  "syntax" | "fields" | "functions" | "plot" | "examples";

export type CustomIndicatorRuleDocEntryKind =
  "guide" | "template" | "directive" | "debug" | "function";

export type CustomIndicatorRuleDocPreviewStyle =
  "neutral" | "template" | "directive" | "warning" | "reference";

export type CustomIndicatorRuleDocExampleKind =
  "code" | "prose" | "unavailable";

export type CustomIndicatorRuleDocAvailability =
  "available" | "unsupported" | "blocked-data-scope";

export type CustomIndicatorRuleDocExampleGuideStep = {
  title: string;
  code: string;
  paragraphs: readonly string[];
};

export type CustomIndicatorRuleDocExampleGuide = {
  overview: string;
  steps: readonly CustomIndicatorRuleDocExampleGuideStep[];
  result: string;
  useCases?: readonly string[];
};

export type CustomIndicatorRuleDocEntry = {
  id: string;
  title: string;
  summary?: string;
  formula: string;
  description?: string;
  example: string;
  exampleGuide?: CustomIndicatorRuleDocExampleGuide;
  exampleKind?: CustomIndicatorRuleDocExampleKind;
  availability?: CustomIndicatorRuleDocAvailability;
  runnableScript?: boolean;
  kind?: CustomIndicatorRuleDocEntryKind;
  useWhen?: string;
  commonMistake?: string;
  keywords?: readonly string[];
  priority?: number;
  previewStyle?: CustomIndicatorRuleDocPreviewStyle;
};

export type CustomIndicatorRuleDocSection = {
  id: string;
  title: string;
  summary: string;
  entries: readonly CustomIndicatorRuleDocEntry[];
};

export type CustomIndicatorRuleDocModule = {
  key: CustomIndicatorRuleDocModuleKey;
  label: string;
  overview: string;
  sections: readonly CustomIndicatorRuleDocSection[];
};

export type CustomIndicatorAiConversionGuideCopy = {
  title: string;
  summary: string;
  instructions: readonly string[];
  indicatorSystemTitle: string;
  indicatorSystemItems: readonly string[];
  drawingTitle: string;
  drawingItems: readonly string[];
  exampleTitle: string;
  functionIndexTitle: string;
  unavailableTitle: string;
  availabilityLabels: Record<CustomIndicatorRuleDocAvailability, string>;
  referenceUi: {
    downloadGuideLabel: string;
    closeGuideLabel: string;
    copySyntaxLabel: string;
    copyExampleLabel: string;
    copiedLabel: string;
    expandAllLabel: string;
    collapseAllLabel: string;
    functionCountTemplate: string;
    categoryCountTemplate: string;
    resultCountTemplate: string;
    keyboardHint: string;
  };
};

const CUSTOM_INDICATOR_RULE_DOCS_BASE =
  [] as readonly CustomIndicatorRuleDocModule[];

const CUSTOM_INDICATOR_RULE_DOCS_BY_LANGUAGE: Record<
  AppUiLanguage,
  readonly CustomIndicatorRuleDocModule[]
> = buildLocalizedRecord((language) =>
  parseUiConfigJsonBundle(
    language,
    "customIndicatorRuleDocs.bundle",
    CUSTOM_INDICATOR_RULE_DOCS_BASE,
  ),
);

export const getCustomIndicatorRuleDocs = (
  language: AppUiLanguage,
): readonly CustomIndicatorRuleDocModule[] =>
  CUSTOM_INDICATOR_RULE_DOCS_BY_LANGUAGE[language] ??
  CUSTOM_INDICATOR_RULE_DOCS_BASE;

export const normalizeCustomIndicatorRuleDocText = (value: string): string =>
  value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/<br\s*\/?>/gi, "\n")
    .trim();

const CUSTOM_INDICATOR_AI_CONVERSION_GUIDE_COPY_BASE =
  {} as CustomIndicatorAiConversionGuideCopy;

const CUSTOM_INDICATOR_AI_CONVERSION_GUIDE_COPY_BY_LANGUAGE: Record<
  AppUiLanguage,
  CustomIndicatorAiConversionGuideCopy
> = buildLocalizedRecord((language) =>
  parseUiConfigJsonBundle(
    language,
    "customIndicatorAiConversionGuide.bundle",
    CUSTOM_INDICATOR_AI_CONVERSION_GUIDE_COPY_BASE,
  ),
);

export const getCustomIndicatorAiConversionGuideCopy = (
  language: AppUiLanguage,
): CustomIndicatorAiConversionGuideCopy =>
  CUSTOM_INDICATOR_AI_CONVERSION_GUIDE_COPY_BY_LANGUAGE[language] ??
  CUSTOM_INDICATOR_AI_CONVERSION_GUIDE_COPY_BASE;

export type TrainingCommandCenterContent = {
  eyebrow: string;
  title: string;
  heroSectionTitle: string;
  heroSectionSubtitle: string;
  strategySummary: string;
  strategyMetricLabel: string;
  strategyResumeMetricLabel: string;
  strategyResumeMetricSupportTemplate: string;
  strategyRecentMetricLabelTemplate: string;
  strategyRecentMetricSupportTemplate: string;
  strategyEnvironmentMetricLabel: string;
  strategyMetricPairTemplate: string;
  strategyProfitRatioValueTemplate: string;
  strategyProfitRatioInfinity: string;
  strategyEnvironmentFocusedSupportTemplate: string;
  strategyEnvironmentFocusedSupportFallback: string;
  strategyEnvironmentRandomSupportTemplate: string;
  strategyEnvironmentRandomSupportFallback: string;
  strategyPrimaryAction: string;
  strategySecondaryAction: string;
  strategyDatasetTemplate: string;
  strategyPoolUnitLabel: string;
  strategySymbolUnitLabel: string;
  strategyContinueEmpty: string;
  flashSummary: string;
  flashPrimaryAction: string;
  flashMetricLabel: string;
  flashMetricEmpty: string;
  flashMetricHintEmpty: string;
  flashTodayMetricLabel: string;
  flashTodayMetricSupportTemplate: string;
  flashRecentMetricLabelTemplate: string;
  flashRecentMetricSupportTemplate: string;
  flashColdMetricLabel: string;
  flashColdMetricValue: string;
  flashColdMetricSupport: string;
  crisisSummary: string;
  crisisPrimaryAction: string;
  crisisMetricLabel: string;
  crisisMetricPending: string;
  crisisMetricSupportLabel: string;
  crisisTodayMetricLabel: string;
  crisisTodayMetricSupportTemplate: string;
  crisisRecentMetricLabelTemplate: string;
  crisisRecentMetricSupportTemplate: string;
  crisisRecentNoActionMetricSupportTemplate: string;
  crisisBehaviorCutLossLabel: string;
  crisisBehaviorAddPositionLabel: string;
  crisisBehaviorFreezeLabel: string;
  crisisColdMetricLabel: string;
  crisisColdMetricValue: string;
  crisisColdMetricSupport: string;
  utilitySectionTitle: string;
  utilitySectionSubtitle: string;
  dataCenterTitle: string;
  dataCenterSubtitle: string;
  dataCenterSummaryLabel: string;
  dataCenterAction: string;
  recentActivitiesTitle: string;
  recentActivitiesMoreAction: string;
  recentActivitiesEmpty: string;
  recentActivitiesEmptyHint: string;
  recentActivityViewChart: string;
  recentActivityViewNote: string;
  recentActivityContinueEdit: string;
  recentActivityOpen: string;
};

const TRAINING_COMMAND_CENTER_CONTENT_BASE = {} as TrainingCommandCenterContent;

const TRAINING_COMMAND_CENTER_CONTENT_BY_LANGUAGE: Record<
  AppUiLanguage,
  TrainingCommandCenterContent
> = buildLocalizedRecord((language) =>
  parseUiConfigJsonBundle(
    language,
    "trainingCommandCenter.bundle",
    TRAINING_COMMAND_CENTER_CONTENT_BASE,
  ),
);

export const getTrainingCommandCenterContent = (
  language: AppUiLanguage,
): TrainingCommandCenterContent =>
  TRAINING_COMMAND_CENTER_CONTENT_BY_LANGUAGE[language] ??
  TRAINING_COMMAND_CENTER_CONTENT_BASE;

export type PortableDataTransferCopy = {
  sectionTitle: string;
  sectionBody: string;
  migrateSummaryLine: string;
  excludeSummaryLine: string;
  trustOffline: string;
  trustEncrypted: string;
  trustNonDestructive: string;
  stepExport: string;
  stepImport: string;
  stepRebind: string;
  exportCardTitle: string;
  exportCardBody: string;
  exportCardPrep: string;
  importCardTitle: string;
  importCardBody: string;
  importCardPrep: string;
  exportAction: string;
  importAction: string;
  exportDialogTitle: string;
  importDialogTitle: string;
  exportSelectStepTitle: string;
  exportPreviewStepTitle: string;
  exportConfirmStepTitle: string;
  exportSuccessStepTitle: string;
  importPickStepTitle: string;
  importOverviewStepTitle: string;
  importSelectStepTitle: string;
  importResultStepTitle: string;
  pickExportPath: string;
  pickImportFile: string;
  previewAction: string;
  exportNowAction: string;
  importNowAction: string;
  nextAction: string;
  backAction: string;
  finishAction: string;
  goToDataAction: string;
  goToSettingsAction: string;
  selectedDomainsTitle: string;
  symbolsUnitLabel: string;
  conflictsLabel: string;
  remapLabel: string;
  domainSettingsLabel: string;
  domainIndicatorsLabel: string;
  domainNotesLabel: string;
  domainTrainingHistoryLabel: string;
  domainSpecialHistoryLabel: string;
  selectedMarketSourcesTitle: string;
  legalTitle: string;
  legalConfirmLabel: string;
  legalNotice: string;
  marketDataLabel: string;
  marketContextHint: string;
  restoreCountsLabel: string;
  offlineValidationHint: string;
  nonDestructiveHint: string;
  outputPathLabel: string;
  inputPathLabel: string;
  noDomainsSelected: string;
  noSourcesSelected: string;
  noPackageSelected: string;
  pickPackageHint: string;
  settingsOverwriteTitle: string;
  settingsOverwriteConfirmLabel: string;
  settingsOverwriteNotice: string;
  exportSuccess: string;
  importSuccess: string;
  pendingRebindLabel: string;
  rebindActionLabel: string;
  rebindBannerTitle: string;
  rebindBannerBody: string;
  dataWorkspaceLinkLabel: string;
  reusedSourceLabel: string;
  importedSourceLabel: string;
  importedBarsLabel: string;
};

const PORTABLE_DATA_TRANSFER_COPY_BASE = {} as PortableDataTransferCopy;

const PORTABLE_DATA_TRANSFER_COPY_BY_LANGUAGE: Record<
  AppUiLanguage,
  PortableDataTransferCopy
> = buildLocalizedRecord((language) =>
  parseUiConfigJsonBundle(
    language,
    "portableDataTransfer.bundle",
    PORTABLE_DATA_TRANSFER_COPY_BASE,
  ),
);

export const getPortableDataTransferCopy = (
  language: AppUiLanguage,
): PortableDataTransferCopy =>
  PORTABLE_DATA_TRANSFER_COPY_BY_LANGUAGE[language] ??
  PORTABLE_DATA_TRANSFER_COPY_BASE;
