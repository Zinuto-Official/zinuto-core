// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from "react";
import { formatMessage } from "@zinuto/shared/i18n";
import { formatMoneyFixed } from "@/ui/formatting/format";
import type {
  AppUiLanguage,
  SpecialTrainingModeDefinition,
} from "@/ui/config/uiConfig";
import {
  FAST_DECISION_HISTORY_BARS,
  FAST_DECISION_HORIZON_BAR_OPTIONS,
  MODE_PICKER_QUESTION_COUNT_OPTIONS,
  MODE_PICKER_RISK_HORIZON_BAR_OPTIONS,
} from "@/workspaces/special-training/domain/specialTrainingConstants";
import {
  formatConfigValue,
  formatTemplate,
} from "@/workspaces/special-training/domain/specialTrainingHelpers";
import type { ModeQuestionBankState } from "@/workspaces/special-training/specialTrainingModeRegistry";
import type {
  SpecialTrainingBankDetailMetricEntry,
  SpecialTrainingBankDetailNoticeEntry,
} from "@/workspaces/special-training/components/SpecialTrainingModePickerView";
import type { FastDecisionStrictnessOption } from "@/workspaces/special-training/domain/specialTrainingTypes";
import {
  buildModePickerPrepGuideItems,
  type ModePickerPrepGuideItem,
} from "@/workspaces/special-training/view-models/specialTrainingModePickerPanelsViewModel";
import { buildModePickerQuestionBankViewModel } from "@/workspaces/special-training/view-models/specialTrainingModePickerViewModel";

type SpecialTrainingPageContent = ReturnType<
  typeof import("@/ui/config/uiConfig").getSpecialTrainingPageContent
>;

type UseSpecialTrainingModePickerPageViewModelInput = {
  language: AppUiLanguage;
  content: SpecialTrainingPageContent;
  activeMode: SpecialTrainingModeDefinition | undefined;
  activeModeQuestionBankState: ModeQuestionBankState;
  activeQuestionCount: number;
  activeDecisionSecondsLimit: number;
  activeHorizonBars: number;
  activeFastDecisionStrictnessOption: FastDecisionStrictnessOption;
  activePoolCount: number;
  activeSymbolCount: number;
  activeQuestionBankEffectiveTrainingTimeframeLabel: string;
  isFastDecisionMode: boolean;
  isRiskDisciplineMode: boolean;
  isQuestionLoading: boolean;
  selectedBank: unknown | null | undefined;
  selectedBankMissingPoolIdsLength: number;
};

export const useSpecialTrainingModePickerPageViewModel = ({
  language,
  content,
  activeMode,
  activeModeQuestionBankState,
  activeQuestionCount,
  activeDecisionSecondsLimit,
  activeHorizonBars,
  activeFastDecisionStrictnessOption,
  activePoolCount,
  activeSymbolCount,
  activeQuestionBankEffectiveTrainingTimeframeLabel,
  isFastDecisionMode,
  isRiskDisciplineMode,
  isQuestionLoading,
  selectedBank,
  selectedBankMissingPoolIdsLength,
}: UseSpecialTrainingModePickerPageViewModelInput) => {
  const hasQuestionBankCapacityForRun =
    activeModeQuestionBankState.actionAvailability.start.hasCapacityForRun;
  const willRestartQuestionScope =
    activeModeQuestionBankState.actionAvailability.start
      .willRestartQuestionScope;
  const startTrainingUnavailable =
    isQuestionLoading ||
    activeModeQuestionBankState.loading ||
    activeModeQuestionBankState.building ||
    !activeModeQuestionBankState.actionAvailability.start.enabled;
  const {
    status: activeQuestionBankStatus,
    sessionUsesOldSnapshot: activeQuestionBankSessionUsesOldSnapshot,
  } = useMemo(
    () =>
      buildModePickerQuestionBankViewModel({
        state: activeModeQuestionBankState,
        activeQuestionCount,
        labels: {
          loadingBadge: content.questionBankLoadingBadgeLabel,
          refreshingBadge: formatMessage(language, "trainer.questionBank.statusRefreshing"),
          refreshingHint: formatMessage(language, "trainer.questionBank.refreshingNotice"),
          statusResetting: formatMessage(language, "trainer.questionBank.statusResetting"),
          statusError: formatMessage(language, "trainer.questionBank.statusError"),
          statusEmpty: formatMessage(language, "trainer.questionBank.statusEmpty"),
          statusFresh: formatMessage(language, "trainer.questionBank.statusFresh"),
          statusInProgress: formatMessage(
            language,
            "trainer.questionBank.statusInProgress",
          ),
          statusInsufficient: content.questionBankStatusInsufficientLabel,
          actionResetting: formatMessage(
            language,
            "trainer.questionBank.resettingAction",
          ),
          actionReset: formatMessage(language, "trainer.questionBank.resetAction"),
          activeSessionStaleNotice: formatMessage(
            language,
            "trainer.questionBank.activeSessionStaleNotice",
          ),
          insufficientHintTemplate:
            content.modePickerQuestionCountInsufficientHintTemplate,
          restartHintTemplate: content.modePickerQuestionCountRestartHintTemplate,
          readyHintTemplate: content.modePickerQuestionCountReadyHintTemplate,
        },
        formatMoneyFixed,
        formatTemplate: (template, values) => formatTemplate(template, [...values]),
      }),
    [
      activeModeQuestionBankState,
      activeQuestionCount,
      content.modePickerQuestionCountInsufficientHintTemplate,
      content.modePickerQuestionCountReadyHintTemplate,
      content.modePickerQuestionCountRestartHintTemplate,
      content.questionBankLoadingBadgeLabel,
      content.questionBankStatusInsufficientLabel,
      language,
    ],
  );
  const activeDatasetSummaryEntries = useMemo(
    () =>
      [
        {
          key: "pools",
          label: content.modePickerDatasetPoolCountLabel,
          value: formatMoneyFixed(activePoolCount, 0),
        },
        {
          key: "symbols",
          label: content.modePickerDatasetSymbolCountLabel,
          value: formatMoneyFixed(activeSymbolCount, 0),
        },
        activeQuestionBankEffectiveTrainingTimeframeLabel
          ? {
              key: "timeframe",
              label: content.modePickerDatasetTimeframeLabel,
              value: activeQuestionBankEffectiveTrainingTimeframeLabel,
            }
          : null,
      ].filter(
        (
          entry,
        ): entry is {
          key: string;
          label: string;
          value: string;
        } => Boolean(entry),
      ),
    [
      activePoolCount,
      activeQuestionBankEffectiveTrainingTimeframeLabel,
      activeSymbolCount,
      content.modePickerDatasetPoolCountLabel,
      content.modePickerDatasetSymbolCountLabel,
      content.modePickerDatasetTimeframeLabel,
    ],
  );
  const canRestartModeProgress =
    !!activeMode &&
    !!selectedBank &&
    selectedBankMissingPoolIdsLength <= 0 &&
    activeModeQuestionBankState.actionAvailability.reset.enabled &&
    !activeModeQuestionBankState.loading &&
    !activeModeQuestionBankState.refreshing &&
    !activeModeQuestionBankState.building;
  const prepQuestionCountTone = activeModeQuestionBankState.loading
    ? "loading"
    : !hasQuestionBankCapacityForRun
      ? "danger"
      : willRestartQuestionScope
        ? "warning"
        : "ready";
  const selectedBankDetailMetricEntries = useMemo<
    SpecialTrainingBankDetailMetricEntry[]
  >(
    () => [
      {
        key: "remaining",
        label: content.questionBankRemainingLabel,
        value: formatMoneyFixed(
          activeModeQuestionBankState.availableQuestionCount,
          0,
        ),
        tone: prepQuestionCountTone,
      },
      {
        key: "completed",
        label: content.questionBankCompletedLabel,
        value: formatMoneyFixed(
          activeModeQuestionBankState.completedQuestionCount,
          0,
        ),
        tone:
          activeModeQuestionBankState.completedQuestionCount > 0
            ? ("ready" as const)
            : ("neutral" as const),
      },
      {
        key: "total",
        label: content.questionBankTotalLabel,
        value: formatMoneyFixed(activeModeQuestionBankState.totalQuestionCount, 0),
        tone:
          activeModeQuestionBankState.totalQuestionCount > 0
            ? ("neutral" as const)
            : activeQuestionBankStatus.tone === "danger"
              ? ("danger" as const)
              : ("neutral" as const),
      },
      ...activeDatasetSummaryEntries.map((entry) => ({
        ...entry,
        tone: "neutral" as const,
      })),
    ],
    [
      activeDatasetSummaryEntries,
      activeModeQuestionBankState.availableQuestionCount,
      activeModeQuestionBankState.completedQuestionCount,
      activeModeQuestionBankState.totalQuestionCount,
      activeQuestionBankStatus.tone,
      content.questionBankCompletedLabel,
      content.questionBankRemainingLabel,
      content.questionBankTotalLabel,
      prepQuestionCountTone,
    ],
  );
  const prepSessionNotice = activeQuestionBankSessionUsesOldSnapshot
    ? formatMessage(language, "trainer.questionBank.activeSessionStaleNotice")
    : null;
  const selectedBankDetailNotices = useMemo<
    SpecialTrainingBankDetailNoticeEntry[]
  >(
    () => {
      const entries: Array<SpecialTrainingBankDetailNoticeEntry | null> = [
        selectedBankMissingPoolIdsLength > 0
          ? {
              key: "repair",
              tone: "danger",
              text: formatMessage(
                language,
                "trainer.specialTrainingBanks.repairRequiredBody",
              ),
            }
          : null,
        prepSessionNotice
          ? {
              key: "session",
              tone: "warning",
              text: prepSessionNotice,
            }
          : null,
      ];
      return entries.filter(
        (entry): entry is SpecialTrainingBankDetailNoticeEntry => Boolean(entry),
      );
    },
    [
      language,
      prepSessionNotice,
      selectedBankMissingPoolIdsLength,
    ],
  );
  const modePickerTitle = content.modePickerTitle;
  const modePickerDynamicConfigTitle = content.modePickerDynamicConfigTitle;
  const modePickerSegmentDecisionSecondsLabel =
    content.modePickerSegmentDecisionSecondsLabel;
  const modePickerSegmentHorizonBarsLabel =
    content.modePickerSegmentHorizonBarsLabel;
  const modePickerSegmentQuestionCountLabel =
    content.modePickerSegmentQuestionCountLabel;
  const modePickerHorizonOptions = isFastDecisionMode
    ? FAST_DECISION_HORIZON_BAR_OPTIONS
    : MODE_PICKER_RISK_HORIZON_BAR_OPTIONS;
  const modePickerQuestionCountOptions = MODE_PICKER_QUESTION_COUNT_OPTIONS;
  const activeModeToneClassName = isRiskDisciplineMode ? "is-risk" : "is-fast";
  const activeStrictnessSummary = formatTemplate(
    content.fastDecisionStrictnessOptionTitleTemplate,
    [
      activeFastDecisionStrictnessOption.shortLabel,
      formatConfigValue(activeFastDecisionStrictnessOption.ratio, 1),
    ],
  );
  const prepGuideItems = useMemo<ModePickerPrepGuideItem[]>(() => {
    if (!activeMode) {
      return [];
    }
    return buildModePickerPrepGuideItems({
      isFastDecisionMode,
      modeGoal: activeMode.goal,
      historyBars: FAST_DECISION_HISTORY_BARS,
      activeDecisionSecondsLimit,
      activeHorizonBars,
      activeStrictnessSummary,
      labels: {
        goal: content.goalLabel,
        rules: content.rulesLabel,
        settlementFocus: content.settlementFocusLabel,
      },
      templates: {
        fastDecisionGoal: content.fastDecisionGoalTemplate,
        fastDecisionRules: content.fastDecisionRulesTemplate,
        fastDecisionSettlementFocus: content.fastDecisionSettlementFocusTemplate,
        riskDisciplineRules: content.riskDisciplineRulesTemplate,
        riskDisciplineSettlementFocus:
          content.riskDisciplineSettlementFocusTemplate,
      },
      formatTemplate,
    });
  }, [
    activeDecisionSecondsLimit,
    activeFastDecisionStrictnessOption.ratio,
    activeFastDecisionStrictnessOption.shortLabel,
    activeHorizonBars,
    activeMode,
    activeStrictnessSummary,
    content.fastDecisionGoalTemplate,
    content.fastDecisionRulesTemplate,
    content.fastDecisionSettlementFocusTemplate,
    content.goalLabel,
    content.riskDisciplineRulesTemplate,
    content.riskDisciplineSettlementFocusTemplate,
    content.rulesLabel,
    content.settlementFocusLabel,
    isFastDecisionMode,
  ]);
  const questionCountSettingHint = formatMessage(
    language,
    "trainer.specialTrainingPrep.questionCountHint",
  );
  const decisionSecondsSettingHint = formatMessage(
    language,
    "trainer.specialTrainingPrep.decisionSecondsHint",
  );
  const horizonSettingHint = formatMessage(
    language,
    "trainer.specialTrainingPrep.horizonHint",
  );
  const strictnessSettingHint = formatMessage(
    language,
    "trainer.specialTrainingPrep.strictnessHint",
  );
  const riskHorizonSettingHint = formatMessage(
    language,
    "trainer.specialTrainingPrep.riskHorizonHint",
  );

  return {
    hasQuestionBankCapacityForRun,
    willRestartQuestionScope,
    startTrainingUnavailable,
    activeQuestionBankStatus,
    canRestartModeProgress,
    selectedBankDetailMetricEntries,
    selectedBankDetailNotices,
    modePickerTitle,
    modePickerDynamicConfigTitle,
    prepGuideItems,
    modePickerSegmentDecisionSecondsLabel,
    modePickerSegmentHorizonBarsLabel,
    modePickerSegmentQuestionCountLabel,
    modePickerHorizonOptions,
    modePickerQuestionCountOptions,
    activeModeToneClassName,
    questionCountSettingHint,
    decisionSecondsSettingHint,
    horizonSettingHint,
    strictnessSettingHint,
    riskHorizonSettingHint,
  };
};
