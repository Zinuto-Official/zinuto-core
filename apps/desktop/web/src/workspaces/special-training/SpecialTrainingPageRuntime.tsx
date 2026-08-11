// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useMemo, useRef } from "react";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { ReplayContextSummaryChip } from "@/frontend-kernel/replayContext";
import { WorkspacePageShell } from "@/ui/components";
import { useSpecialTrainingDurationEstimate } from "@/workspaces/special-training/session/useSpecialTrainingDurationEstimate";
import {
  useSpecialTrainingInactivePagePause,
  useSpecialTrainingResumableSessionSync,
  useSpecialTrainingRiskAutoplay,
  useSpecialTrainingRiskPanelScrollReset,
  useSpecialTrainingShortcutBindings,
} from "@/workspaces/special-training/session/useSpecialTrainingRouteEffects";
import { useSpecialTrainingSessionReplayWindow } from "@/workspaces/special-training/session/useSpecialTrainingSessionReplayWindow";
import { SpecialTrainingChartWorkspaceHost } from "@/workspaces/special-training/components/SpecialTrainingChartWorkspaceHost";
import { SpecialTrainingFastDecisionTrainingView } from "@/workspaces/special-training/components/SpecialTrainingFastDecisionTrainingView";
import { SpecialTrainingModePickerView } from "@/workspaces/special-training/components/SpecialTrainingModePickerView";
import { SpecialTrainingRiskDisciplineTrainingView } from "@/workspaces/special-training/components/SpecialTrainingRiskDisciplineTrainingView";
import { SpecialTrainingRiskOrderTicket } from "@/workspaces/special-training/components/SpecialTrainingRiskOrderTicket";
import { SpecialTrainingScopeRestartNoticeDialog } from "@/workspaces/special-training/components/SpecialTrainingScopeRestartNoticeDialog";
import { SpecialTrainingSessionSettlementView } from "@/workspaces/special-training/components/SpecialTrainingSessionSettlementView";
import { useSpecialTrainingPageState } from "@/workspaces/special-training/useSpecialTrainingPageState";
import { useSpecialTrainingTrainingInteractions } from "@/workspaces/special-training/useSpecialTrainingTrainingInteractions";
import type { SpecialTrainingPageProps } from "@/workspaces/special-training/specialTrainingPageTypes";
import { useSpecialTrainingModePickerPageViewModel } from "@/workspaces/special-training/view-models/useSpecialTrainingModePickerPageViewModel";
import { useSpecialTrainingRiskDisciplineDisplayViewModel } from "@/workspaces/special-training/view-models/useSpecialTrainingRiskDisciplineDisplayViewModel";
import { buildChallengeReviewNotePayload } from "@/workspaces/special-training/view-models/specialTrainingChallengeReviewNoteViewModel";
import { composeChallengeReviewChips } from "@/workspaces/special-training/view-models/specialTrainingChallengeReviewChipsViewModel";
import { buildFastDecisionReviewDetail } from "@/workspaces/special-training/view-models/specialTrainingFastDecisionReviewViewModel";
import { buildFastDecisionReplayOverlayContext } from "@/workspaces/special-training/view-models/specialTrainingReplayOverlayViewModel";
import { buildSpecialTrainingFastDecisionTrainingViewModel } from "@/workspaces/special-training/view-models/specialTrainingFastDecisionTrainingViewModel";
import { useSpecialTrainingSessionPanelsViewModel } from "@/workspaces/special-training/view-models/useSpecialTrainingSessionSettlementViewModel";
import { formatScopeRestartDescription } from "@/workspaces/special-training/domain/specialTrainingHelpers";
import {
  buildModeQuestionBankProgressItems,
  resolveSpecialTrainingPageClassName,
} from "@/workspaces/special-training/specialTrainingPageRuntimePresentation";
import { useSpecialTrainingPageHelpContext } from "@/workspaces/special-training/useSpecialTrainingPageHelpContext";
import { useSpecialTrainingModeRestartConfirmation } from "@/workspaces/special-training/useSpecialTrainingModeRestartConfirmation";

export const SpecialTrainingPageRuntime = (props: SpecialTrainingPageProps) => {
  const {
    language,
    ui,
    onCreateChallengeReviewNote,
    onResumableSessionChange,
    onShortcutBindingsChange,
    reviewSnapshotChart,
  } = props;
  const state = useSpecialTrainingPageState(props);
  const interactions = useSpecialTrainingTrainingInteractions({
    isPageActive: props.isPageActive,
    state,
    ui,
  });

  const {
    activeDecisionSecondsLimit,
    activeDurationEstimatePayload,
    activeDurationEstimateSignature,
    activeFastDecisionDominanceRatio,
    activeFastDecisionStrictnessLevel,
    activeFastDecisionStrictnessOption,
    activeHorizonBars,
    activeMode,
    activeModeId,
    activeModeQuestionBankState,
    activePoolCount,
    activeQuestion,
    activeQuestionBankEffectiveTrainingTimeframeLabel,
    activeQuestionCount,
    activeQuestionEffectiveTrainingTimeframe,
    activeSymbolCount,
    applyCommandChallengeRuntime,
    availableModes,
    averageDecisionSeconds,
    bankSearchQuery,
    beginTraining: beginTrainingFromState,
    cancelRenameBank,
    clearFastDecisionTimers,
    completedCount,
    content,
    currentPrice,
    currentQuestionIndex,
    currentTotalAsset,
    decisionCount,
    decisionCountdownPercent,
    decisionSecondsLeft,
    editingBankId,
    editingBankName,
    enabledSamplePoolById,
    exitTraining,
    fastDecisionCountdownClock,
    fastDecisionCountdownTone,
    fastDecisionPhase,
    fastDecisionResult,
    fastDecisionStrictnessOptions,
    filteredSpecialTrainingBanks,
    floatingPnl,
    formatBankTimeframeLabel,
    gotoNextQuestion,
    hasEnabledSampleSymbols,
    hasLiveChallengeSession,
    hasMoreSpecialTrainingBanks,
    isCriticalCountdown,
    isFastDecisionMode,
    isLoadingMoreBanks,
    isPageActive,
    isQuestionLoading,
    isRiskDisciplineMode,
    loadMoreSpecialTrainingBanks,
    lockedDecisionSelection,
    modeQuestionBankState,
    openBankEditor,
    passCount,
    questionBars,
    questionStartIndex,
    questions,
    requestDeleteBankConfirmation,
    resetModeQuestionBank,
    resolveBankApiErrorMessage,
    resolveBankCardPresentation,
    resolveQuestionEffectiveTrainingTimeframe,
    resumableChallengeSession,
    riskAutoplayEnabled,
    riskBaselineCostPrice,
    riskCostPriceNow,
    riskGravityFieldModel,
    riskHolderReference,
    riskRemainingActionableBars,
    riskRemainingActionableRatio,
    runtime,
    saveRenameBank,
    scopeRestartNotice,
    scopeRestartNoticeCountdown,
    selectedBank,
    selectedBankMissingPoolIds,
    selectedSessionReviewIndex,
    selectedSessionReviewOpenRequestId,
    sessionSettlements,
    setActiveModeId,
    setBankSearchQuery,
    setDecisionSecondsLeft,
    setEditingBankName,
    setRiskAutoplayEnabled,
    setSelectedBankId,
    setSelectedSessionReviewIndex,
    setSelectedSessionReviewOpenRequestId,
    setSubmitErrorMessage,
    settlement,
    specialTrainingBanks,
    startRenameBank,
    submitErrorMessage,
    textDoubleDash,
    textSlash,
    tradeActions,
    tt,
    ttf,
    updateModeRuntimeConfig,
    view,
    winRate,
  } = state;
  useSpecialTrainingPageHelpContext({
    isPageActive,
    view,
    activeModeId,
  });
  const {
    buyAndAdvanceDisabled,
    canUndoRiskAction,
    completeDisabled,
    createTrainingRecordReplayNoteShortcut,
    directionSelectDisabled,
    finalizeQuestion,
    handleBuyAndAdvance,
    handleNextBar,
    handleRiskOrderInputModeChange,
    handleRiskRatioInputChange,
    handleSellAndAdvance,
    handleUndo,
    nextBarDisabled,
    questionSettledInTraining,
    restartCurrentMode,
    riskAmountInput,
    riskAmountInputRef,
    riskBuyAdvanceActionState,
    riskBuyEstimate,
    riskLotInput,
    riskLotInputRef,
    riskNextBarActionState,
    riskOrderInputMode,
    riskOrderTicketDisplay,
    riskPriceMode,
    riskRatioInput,
    riskSellAdvanceActionState,
    riskSellEstimate,
    riskUndoActionState,
    riskUndoButtonTitle,
    sellAndAdvanceDisabled,
    setRiskAmountInput,
    setRiskLotInput,
    setRiskPriceMode,
    setShortcutBuyRatioInput,
    submitFastDecision,
    undoAvailableRiskSteps,
    undoMaxRiskSteps,
  } = interactions;

  const riskPanelBodyRef = useRef<HTMLDivElement | null>(null);
  useSpecialTrainingDurationEstimate({
    view,
    activeModeId: activeMode?.id ?? null,
    activeDurationEstimatePayload,
    activeDurationEstimateSignature,
  });
  const {
    fastDecisionSessionSummary,
    fastDecisionCapitalCopy,
    fastDecisionSessionCapitalSummary,
    riskDisciplineSessionSummary,
    riskReviewAlphaVsHold,
    riskReviewAlphaVsHardStop,
    riskAlphaVsHoldLabel,
    riskAlphaVsHardStopLabel,
    riskCurveUserColor,
    performancePositiveColor,
    performanceNegativeColor,
    fastDecisionFinalAnchorColor,
    tradeBuyDirectionColor,
    tradeSellDirectionColor,
    fastDecisionReviewTextColor,
    resolveFastChoiceLabel,
    fastDecisionSessionGrade,
    fastDecisionSessionGradeTone,
    fastDecisionSessionCommentary,
    fastDecisionSessionDecisionMetricTone,
    fastDecisionSessionDirectionStats,
    fastDecisionSessionBiasSummary,
    fastDecisionSessionCapitalSummaryLine,
    riskDisciplineSessionGrade,
    riskDisciplineSessionGradeTone,
    riskDisciplineSessionCommentary,
    riskDisciplineSessionAlphaMetricTone,
    riskDisciplineSessionBehaviorInsight,
    riskDisciplineSessionBehaviorRows,
    fastDecisionSessionReviewItems,
    riskDisciplineSessionReviewItems,
    sessionReviewItems,
    selectedSessionReviewItem,
    selectedSessionReviewSummaryChips,
  } = useSpecialTrainingSessionPanelsViewModel({
    language,
    content,
    view,
    activeMode,
    sessionSettlements,
    questions,
    basePeriod: props.sharedTrainerChartWorkspaceProps.basePeriod,
    selectedSessionReviewIndex,
    textDoubleDash,
    resolveQuestionEffectiveTrainingTimeframe,
  });
  const {
    riskQuestionProgressValue,
    riskQuestionProgressSegmentCount,
    riskSurvivalTrackTone,
    riskRemainingBarsDisplay,
    riskSurvivalCardTone,
    riskCurrentAssetDisplay,
    riskFloatingLabel,
    riskFloatingValueDisplay,
    riskFloatingTone,
    riskSnapshotItems,
    riskNextBarReason,
    riskUndoReason,
    riskGravityCurrentPriceDisplay,
    riskGravityBreakevenPriceDisplay,
    riskBreakevenTone,
    riskGravityGapFillPercent,
    riskBreakevenDistanceDisplay,
    riskHudMetricCards,
  } = useSpecialTrainingRiskDisciplineDisplayViewModel({
    language,
    content,
    ui,
    tt,
    textSlash,
    textDoubleDash,
    currentQuestionIndex,
    questionCount: questions.length,
    runtime,
    currentPrice,
    currentTotalAsset,
    floatingPnl,
    riskRemainingActionableRatio,
    riskRemainingActionableBars,
    riskHolderReference,
    riskGravityFieldModel,
    riskBuyEstimate,
    riskSellEstimate,
    buyAndAdvanceDisabled,
    sellAndAdvanceDisabled,
    nextBarDisabled,
    canUndoRiskAction,
    riskBuyAdvanceActionState,
    riskSellAdvanceActionState,
    riskNextBarActionState,
    riskUndoActionState,
  });
  const modeQuestionBankProgressItems = useMemo(
    () =>
      buildModeQuestionBankProgressItems({
        availableModes,
        language,
        modeQuestionBankState,
      }),
    [availableModes, language, modeQuestionBankState],
  );
  const {
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
    startTrainingUnavailable,
  } = useSpecialTrainingModePickerPageViewModel({
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
    selectedBankMissingPoolIdsLength: selectedBankMissingPoolIds.length,
  });
  const openSessionReviewDialog = useCallback(
    (questionIndex: number) => {
      if (!sessionReviewItems[questionIndex]) {
        return;
      }
      setSelectedSessionReviewIndex(questionIndex);
      setSelectedSessionReviewOpenRequestId((current) => current + 1);
    },
    [
      sessionReviewItems,
      setSelectedSessionReviewIndex,
      setSelectedSessionReviewOpenRequestId,
    ],
  );
  const closeSessionReviewDialog = useCallback(() => {
    setSelectedSessionReviewIndex(null);
  }, [setSelectedSessionReviewIndex]);
  const fastDecisionReviewSourceResult =
    settlement?.directionResult ??
    (fastDecisionPhase === "THINKING"
      ? null
      : (state.pendingFastDecisionResultRef.current ??
        fastDecisionResult ??
        null));
  const resolvedFastDecisionReviewDetail = useMemo(
    () =>
      buildFastDecisionReviewDetail({
        language,
        directionResult: fastDecisionReviewSourceResult,
        resolveFastChoiceLabel,
        percentUnitLabel: tt("appText.percent"),
        secondUnitLabel: content.fastArenaSecondUnitLabel,
        infinityRatioLabel: content.fastDecisionMfeMaeInfinityValue,
        reasonConfirmedLabel: content.fastDecisionOutcomeReasonConfirmed,
        reasonTimeoutLabel: content.decisionTimedOutLabel,
        reasonMissedTrendLabel: content.fastDecisionOutcomeReasonMissedTrend,
        reasonReverseLabel: content.fastDecisionOutcomeReasonReverse,
        reasonChoppyLabel: content.fastDecisionOutcomeReasonChoppy,
        favorableLabel: content.fastArenaMfeTagLabel,
        adverseLabel: content.fastArenaMaeTagLabel,
      }),
    [
      content.decisionTimedOutLabel,
      content.fastArenaMaeTagLabel,
      content.fastArenaMfeTagLabel,
      content.fastArenaSecondUnitLabel,
      content.fastDecisionMfeMaeInfinityValue,
      content.fastDecisionOutcomeReasonChoppy,
      content.fastDecisionOutcomeReasonConfirmed,
      content.fastDecisionOutcomeReasonMissedTrend,
      content.fastDecisionOutcomeReasonReverse,
      fastDecisionReviewSourceResult,
      language,
      resolveFastChoiceLabel,
      tt,
    ],
  );
  const activeFastDecisionDirectionResult = fastDecisionReviewSourceResult;
  const postSettlementActionsDisabled = !questionSettledInTraining;
  const {
    showFastDecisionDecisionControls,
    showFastDecisionSettlementActions,
    fastDecisionReviewTone,
    fastDecisionLiveHintText,
    fastDecisionProgressValue,
    fastDecisionProgressSegmentCount,
    fastDecisionWinRateMeta,
    fastDecisionAverageDecisionDisplay,
    fastDecisionAverageDecisionMeta,
    fastDecisionWinRateDialStyle,
    fastDecisionPaceMeterStyle,
    fastDecisionCountdownRingStyle,
    fastDecisionReviewSelectionTone,
    fastDecisionReviewDirectionIconName,
    fastDecisionReviewActualTone,
    fastDecisionReviewActualIconName,
    fastDecisionReviewGaugeTone,
    fastDecisionReviewThresholdDisplay,
    fastDecisionReviewRatioDisplay,
    activeFastDecisionCapitalReview,
    activeFastDecisionCapitalTone,
    activeFastDecisionCapitalAnchorItems,
    activeFastDecisionCapitalCurveOption,
  } = buildSpecialTrainingFastDecisionTrainingViewModel({
    language,
    content,
    tt,
    textSlash,
    textDoubleDash,
    currentQuestionIndex,
    questionCount: questions.length,
    completedCount,
    passCount,
    decisionCount,
    averageDecisionSeconds,
    activeDecisionSecondsLimit,
    decisionCountdownPercent,
    winRate,
    fastDecisionPhase,
    activeFastDecisionDirectionResult,
    resolvedFastDecisionReviewDetail,
    activeFastDecisionDominanceRatio,
    settlement,
    activeQuestionEffectiveTrainingTimeframe,
    basePeriod: props.sharedTrainerChartWorkspaceProps
      .basePeriod as DisplayPeriodKey,
    fastDecisionCapitalCopy,
    performancePositiveColor,
    performanceNegativeColor,
    fastDecisionReviewTextColor,
    fastDecisionFinalAnchorColor,
    questionSettledInTraining,
  });
  const challengeReviewSummaryChips = useMemo<ReplayContextSummaryChip[]>(
    () =>
      composeChallengeReviewChips({
        content,
        activeQuestion: activeMode ? activeQuestion : null,
        activeFastDecisionDirectionResult,
        resolvedFastDecisionReviewDetail,
        settlement,
        riskReviewAlphaVsHold,
        riskReviewAlphaVsHardStop,
        riskAlphaVsHoldLabel,
        riskAlphaVsHardStopLabel,
        fastDecisionReviewGaugeTone,
        fastDecisionReviewRatioDisplay,
        textDoubleDash,
        resolveFastChoiceLabel,
      }),
    [
      activeFastDecisionDirectionResult,
      activeMode,
      activeQuestion,
      content,
      fastDecisionReviewGaugeTone,
      fastDecisionReviewRatioDisplay,
      resolveFastChoiceLabel,
      resolvedFastDecisionReviewDetail,
      riskAlphaVsHardStopLabel,
      riskAlphaVsHoldLabel,
      riskReviewAlphaVsHardStop,
      riskReviewAlphaVsHold,
      settlement,
      textDoubleDash,
    ],
  );
  const handleCreateChallengeReviewNote = useCallback(() => {
    if (!onCreateChallengeReviewNote) {
      return;
    }
    const payload = buildChallengeReviewNotePayload({
      activeMode,
      activeQuestion,
      activeFastDecisionDirectionResult,
      fastDecisionPhase,
      questionBars,
      cursorIndex: state.cursorIndex,
      questionStartIndex,
      activeQuestionEffectiveTrainingTimeframe,
      labels: {
        fastArenaBuyHotkeyLabel: content.fastArenaBuyHotkeyLabel,
        fastArenaSellHotkeyLabel: content.fastArenaSellHotkeyLabel,
        fastArenaObserveMarkLabel: content.fastArenaObserveMarkLabel,
        decisionDirectionUpLabel: content.decisionDirectionUpLabel,
        decisionDirectionDownLabel: content.decisionDirectionDownLabel,
        decisionObserveLabel: content.decisionObserveLabel,
        fastArenaMfeTagLabel: content.fastArenaMfeTagLabel,
        fastArenaMaeTagLabel: content.fastArenaMaeTagLabel,
        riskDisciplineBaselineGuideTagLabel:
          content.riskDisciplineBaselineGuideTagLabel,
        riskDisciplineCostGuideTagLabel:
          content.riskDisciplineCostGuideTagLabel,
      },
      tradeActions,
      riskBaselineCostPrice,
      riskCostPriceNow,
      settlement,
      riskReviewAlphaVsHold,
      riskReviewAlphaVsHardStop,
      currentTotalAsset,
      runtime,
      currentPrice,
      challengeReviewSummaryChips,
      buildFastDecisionReplayOverlayContext,
    });
    if (payload) {
      onCreateChallengeReviewNote(payload);
    }
  }, [
    activeFastDecisionDirectionResult,
    activeMode,
    activeQuestion,
    activeQuestionEffectiveTrainingTimeframe,
    challengeReviewSummaryChips,
    content,
    currentPrice,
    currentTotalAsset,
    fastDecisionPhase,
    onCreateChallengeReviewNote,
    questionBars,
    questionStartIndex,
    riskBaselineCostPrice,
    riskCostPriceNow,
    riskReviewAlphaVsHardStop,
    riskReviewAlphaVsHold,
    runtime,
    settlement,
    state.cursorIndex,
    tradeActions,
  ]);
  const beginTraining = useCallback(async () => {
    await beginTrainingFromState();
  }, [beginTrainingFromState]);

  const requestRestartModeConfirmation =
    useSpecialTrainingModeRestartConfirmation({
      activeModeId: activeMode?.id,
      canRestartModeProgress,
      dialogTitle: tt("trainer.questionBank.resetDialogTitle"),
      failureMessage: content.dataLoadFailedLabel,
      setSubmitErrorMessage,
      resetModeQuestionBank,
    });

  useSpecialTrainingShortcutBindings({
    onShortcutBindingsChange,
    isPageActive,
    view,
    isFastDecisionMode,
    isRiskDisciplineMode,
    activeMode,
    isQuestionLoading,
    runtimePaused: runtime.paused,
    fastDecisionPhase,
    fastDecisionResult,
    decisionSecondsLeft,
    settlement,
    gotoNextQuestion,
    handleNextBar,
    handleUndo,
    handleBuyAndAdvance,
    handleSellAndAdvance,
    submitFastDecision,
    setRiskAutoplayEnabled,
    createTrainingRecordReplayNoteShortcut,
    setShortcutBuyRatioInput,
  });
  useSpecialTrainingRiskPanelScrollReset({
    view,
    isRiskDisciplineMode,
    currentQuestionIndex,
    settlement,
    riskPanelBodyRef,
  });
  useSpecialTrainingResumableSessionSync({
    onResumableSessionChange,
    resumableChallengeSession,
  });
  const handleActivityRuntime = useCallback(
    (nextRuntime: Parameters<typeof applyCommandChallengeRuntime>[0]) => {
      void applyCommandChallengeRuntime(nextRuntime);
    },
    [applyCommandChallengeRuntime],
  );
  const handleActivityError = useCallback(
    (error: unknown) => {
      setSubmitErrorMessage(resolveBankApiErrorMessage(error));
    },
    [resolveBankApiErrorMessage, setSubmitErrorMessage],
  );
  useSpecialTrainingInactivePagePause({
    challengeId: state.challengeId,
    hasLiveChallengeSession,
    isPageActive,
    clearFastDecisionTimers,
    onActivityError: handleActivityError,
    onActivityRuntime: handleActivityRuntime,
    setRuntime: state.setRuntime,
    setDecisionDeadlineAtMs: state.setDecisionDeadlineAtMs,
  });
  useSpecialTrainingRiskAutoplay({
    riskAutoplayEnabled,
    view,
    isRiskDisciplineMode,
    runtimePaused: runtime.paused,
    isQuestionLoading,
    settlement,
    nextBarDisabled,
    handleNextBar,
    setRiskAutoplayEnabled,
  });

  const trainerChartWorkspaceNode = useMemo(
    () => (
      <SpecialTrainingChartWorkspaceHost
        sharedTrainerChartWorkspaceProps={
          props.sharedTrainerChartWorkspaceProps
        }
        activeQuestionEffectiveTrainingTimeframe={
          activeQuestionEffectiveTrainingTimeframe
        }
        activeQuestionSymbol={activeQuestion?.symbol}
        isPageActive={isPageActive}
        view={view}
      />
    ),
    [
      activeQuestion?.symbol,
      activeQuestionEffectiveTrainingTimeframe,
      isPageActive,
      props.sharedTrainerChartWorkspaceProps,
      view,
    ],
  );
  useSpecialTrainingSessionReplayWindow({
    language,
    selectedSessionReviewIndex,
    selectedSessionReviewOpenRequestId,
    selectedSessionReviewItem,
    sessionSettlements,
    sessionSettlementReviewTitle: content.sessionSettlementReviewTitle,
    selectedSessionReviewSummaryChips,
    reviewSnapshotChart,
    closeSessionReviewDialog,
  });

  const riskOrderTicket = (
    <SpecialTrainingRiskOrderTicket
      content={content}
      formatRiskOrderQuantity={interactions.formatRiskOrderQuantity}
      handleBuyAndAdvance={handleBuyAndAdvance}
      handleNextBar={handleNextBar}
      handleRiskOrderInputModeChange={handleRiskOrderInputModeChange}
      handleRiskRatioInputChange={handleRiskRatioInputChange}
      handleSellAndAdvance={handleSellAndAdvance}
      handleUndo={handleUndo}
      nextBarReason={riskNextBarReason}
      riskAmountInput={riskAmountInput}
      riskAmountInputRef={riskAmountInputRef}
      riskLotInput={riskLotInput}
      riskLotInputRef={riskLotInputRef}
      riskOrderInputMode={riskOrderInputMode}
      riskOrderTicketDisplay={riskOrderTicketDisplay}
      riskPriceMode={riskPriceMode}
      riskRatioInput={riskRatioInput}
      riskUndoButtonTitle={riskUndoButtonTitle}
      riskUndoReason={riskUndoReason}
      setRiskAmountInput={setRiskAmountInput}
      setRiskLotInput={setRiskLotInput}
      setRiskPriceMode={setRiskPriceMode}
      textDoubleDash={textDoubleDash}
      textSlash={textSlash}
      tt={tt}
      ui={ui}
      undoAvailableRiskSteps={undoAvailableRiskSteps}
      undoMaxRiskSteps={undoMaxRiskSteps}
    />
  );
  const pageClassName = resolveSpecialTrainingPageClassName({
    view,
    isFastDecisionMode,
  });

  return (
    <WorkspacePageShell
      template="workbench"
      className={pageClassName}
      bodyClassName="special-training-body"
    >
      {view === "MODE_PICKER" ? (
        <SpecialTrainingModePickerView
          language={language}
          content={content}
          activeMode={activeMode}
          activeModeToneClassName={activeModeToneClassName}
          availableModes={availableModes}
          onActiveModeChange={setActiveModeId}
          modeQuestionBankProgressItems={modeQuestionBankProgressItems}
          hasEnabledSampleSymbols={hasEnabledSampleSymbols}
          bankSearchQuery={bankSearchQuery}
          onBankSearchQueryChange={setBankSearchQuery}
          openBankEditor={openBankEditor}
          specialTrainingBanks={specialTrainingBanks}
          filteredSpecialTrainingBanks={filteredSpecialTrainingBanks}
          hasMoreSpecialTrainingBanks={hasMoreSpecialTrainingBanks}
          isLoadingMoreBanks={isLoadingMoreBanks}
          loadMoreSpecialTrainingBanks={loadMoreSpecialTrainingBanks}
          resolveBankCardPresentation={resolveBankCardPresentation}
          selectedBank={selectedBank}
          setSelectedBankId={setSelectedBankId}
          editingBankId={editingBankId}
          editingBankName={editingBankName}
          setEditingBankName={setEditingBankName}
          saveRenameBank={saveRenameBank}
          cancelRenameBank={cancelRenameBank}
          enabledSamplePoolById={enabledSamplePoolById}
          textSlash={textSlash}
          formatBankTimeframeLabel={formatBankTimeframeLabel}
          startRenameBank={startRenameBank}
          requestDeleteBankConfirmation={requestDeleteBankConfirmation}
          requestRestartModeConfirmation={requestRestartModeConfirmation}
          activeQuestionBankStatus={activeQuestionBankStatus}
          selectedBankDetailMetricEntries={selectedBankDetailMetricEntries}
          selectedBankDetailNotices={selectedBankDetailNotices}
          selectedBankMissingPoolIds={selectedBankMissingPoolIds}
          canRestartModeProgress={canRestartModeProgress}
          modePickerTitle={modePickerTitle}
          modePickerDynamicConfigTitle={modePickerDynamicConfigTitle}
          prepGuideItems={prepGuideItems}
          questionCountSettingHint={questionCountSettingHint}
          modePickerSegmentQuestionCountLabel={
            modePickerSegmentQuestionCountLabel
          }
          activeQuestionCount={activeQuestionCount}
          modePickerQuestionCountOptions={modePickerQuestionCountOptions}
          updateModeRuntimeConfig={updateModeRuntimeConfig}
          isFastDecisionMode={isFastDecisionMode}
          decisionSecondsSettingHint={decisionSecondsSettingHint}
          modePickerSegmentDecisionSecondsLabel={
            modePickerSegmentDecisionSecondsLabel
          }
          activeDecisionSecondsLimit={activeDecisionSecondsLimit}
          setDecisionSecondsLeft={setDecisionSecondsLeft}
          horizonSettingHint={horizonSettingHint}
          riskHorizonSettingHint={riskHorizonSettingHint}
          modePickerSegmentHorizonBarsLabel={modePickerSegmentHorizonBarsLabel}
          activeHorizonBars={activeHorizonBars}
          modePickerHorizonOptions={modePickerHorizonOptions}
          strictnessSettingHint={strictnessSettingHint}
          activeFastDecisionStrictnessLevel={activeFastDecisionStrictnessLevel}
          fastDecisionStrictnessOptions={fastDecisionStrictnessOptions}
          activeFastDecisionStrictnessOption={
            activeFastDecisionStrictnessOption
          }
          submitErrorMessage={submitErrorMessage}
          startTrainingUnavailable={startTrainingUnavailable}
          beginTraining={beginTraining}
        />
      ) : null}
      {view === "TRAINING" && activeMode ? (
        <>
          {isFastDecisionMode ? (
            <SpecialTrainingFastDecisionTrainingView
              chartWorkspace={trainerChartWorkspaceNode}
              language={language}
              content={content}
              textSlash={textSlash}
              tt={tt}
              fastDecisionProgressSegmentCount={
                fastDecisionProgressSegmentCount
              }
              currentQuestionIndex={currentQuestionIndex}
              questionCount={questions.length}
              fastDecisionProgressValue={fastDecisionProgressValue}
              fastDecisionWinRateDialStyle={fastDecisionWinRateDialStyle}
              winRate={winRate}
              fastDecisionWinRateMeta={fastDecisionWinRateMeta}
              fastDecisionAverageDecisionDisplay={
                fastDecisionAverageDecisionDisplay
              }
              activeDecisionSecondsLimit={activeDecisionSecondsLimit}
              fastDecisionAverageDecisionMeta={fastDecisionAverageDecisionMeta}
              fastDecisionPaceMeterStyle={fastDecisionPaceMeterStyle}
              showFastDecisionDecisionControls={
                showFastDecisionDecisionControls
              }
              fastDecisionCountdownTone={fastDecisionCountdownTone}
              isCriticalCountdown={isCriticalCountdown}
              fastDecisionLiveHintText={fastDecisionLiveHintText}
              fastDecisionCountdownRingStyle={fastDecisionCountdownRingStyle}
              fastDecisionCountdownClock={fastDecisionCountdownClock}
              fastDecisionReviewTone={fastDecisionReviewTone}
              resolvedFastDecisionReviewDetail={
                resolvedFastDecisionReviewDetail
              }
              activeFastDecisionCapitalReview={activeFastDecisionCapitalReview}
              activeFastDecisionCapitalTone={activeFastDecisionCapitalTone}
              activeFastDecisionCapitalCurveOption={
                activeFastDecisionCapitalCurveOption
              }
              activeFastDecisionCapitalAnchorItems={
                activeFastDecisionCapitalAnchorItems
              }
              fastDecisionReviewSelectionTone={fastDecisionReviewSelectionTone}
              fastDecisionReviewDirectionIconName={
                fastDecisionReviewDirectionIconName
              }
              fastDecisionReviewActualTone={fastDecisionReviewActualTone}
              fastDecisionReviewActualIconName={
                fastDecisionReviewActualIconName
              }
              fastDecisionReviewGaugeTone={fastDecisionReviewGaugeTone}
              fastDecisionReviewThresholdDisplay={
                fastDecisionReviewThresholdDisplay
              }
              fastDecisionReviewRatioDisplay={fastDecisionReviewRatioDisplay}
              onCreateChallengeReviewNote={onCreateChallengeReviewNote}
              showFastDecisionSettlementActions={
                showFastDecisionSettlementActions
              }
              handleCreateChallengeReviewNote={handleCreateChallengeReviewNote}
              fastDecisionPhase={fastDecisionPhase}
              lockedDecisionSelection={lockedDecisionSelection}
              submitFastDecision={submitFastDecision}
              directionSelectDisabled={directionSelectDisabled}
              gotoNextQuestion={gotoNextQuestion}
              exitTraining={exitTraining}
              submitErrorMessage={submitErrorMessage}
            />
          ) : (
            <SpecialTrainingRiskDisciplineTrainingView
              chartWorkspace={trainerChartWorkspaceNode}
              content={content}
              ui={ui}
              tt={tt}
              textSlash={textSlash}
              activeModeTitle={activeMode.title}
              riskGravityCurrentPriceDisplay={riskGravityCurrentPriceDisplay}
              riskGravityBreakevenPriceDisplay={
                riskGravityBreakevenPriceDisplay
              }
              riskBreakevenTone={riskBreakevenTone}
              riskGravityGapFillPercent={riskGravityGapFillPercent}
              riskBreakevenDistanceDisplay={riskBreakevenDistanceDisplay}
              riskHudMetricCards={riskHudMetricCards}
              riskQuestionProgressValue={riskQuestionProgressValue}
              riskQuestionProgressSegmentCount={
                riskQuestionProgressSegmentCount
              }
              currentQuestionIndex={currentQuestionIndex}
              questionCount={questions.length}
              riskSurvivalTrackTone={riskSurvivalTrackTone}
              riskRemainingBarsDisplay={riskRemainingBarsDisplay}
              riskPanelBodyRef={riskPanelBodyRef}
              submitErrorMessage={submitErrorMessage}
              riskSurvivalCardTone={riskSurvivalCardTone}
              riskCurrentAssetDisplay={riskCurrentAssetDisplay}
              riskFloatingLabel={riskFloatingLabel}
              riskFloatingValueDisplay={riskFloatingValueDisplay}
              riskFloatingTone={riskFloatingTone}
              riskSnapshotItems={riskSnapshotItems}
              isQuestionLoading={isQuestionLoading}
              questionSettledInTraining={questionSettledInTraining}
              riskOrderTicket={riskOrderTicket}
              gotoNextQuestion={gotoNextQuestion}
              postSettlementActionsDisabled={postSettlementActionsDisabled}
              exitTraining={exitTraining}
              onCreateChallengeReviewNote={onCreateChallengeReviewNote}
              handleCreateChallengeReviewNote={handleCreateChallengeReviewNote}
              setRiskAutoplayEnabled={setRiskAutoplayEnabled}
              finalizeQuestion={finalizeQuestion}
              completeDisabled={completeDisabled}
              hasActiveQuestion={Boolean(activeQuestion)}
            />
          )}
        </>
      ) : null}
      {view === "SETTLEMENT" && activeMode && settlement ? (
        <SpecialTrainingSessionSettlementView
          modeId={activeMode.id}
          language={language}
          content={content}
          activeModeTitle={activeMode.title}
          activeHorizonBars={activeHorizonBars}
          hasEnabledSampleSymbols={hasEnabledSampleSymbols}
          onRestartCurrentMode={restartCurrentMode}
          onExitTraining={exitTraining}
          activeDecisionSecondsLimit={activeDecisionSecondsLimit}
          activeFastDecisionStrictnessOption={
            activeFastDecisionStrictnessOption
          }
          questionCount={questions.length}
          fastDecisionSessionGrade={fastDecisionSessionGrade}
          fastDecisionSessionGradeTone={fastDecisionSessionGradeTone}
          fastDecisionSessionCommentary={fastDecisionSessionCommentary}
          fastDecisionSessionSummary={fastDecisionSessionSummary}
          fastDecisionSessionDecisionMetricTone={
            fastDecisionSessionDecisionMetricTone
          }
          fastDecisionSessionBiasSummary={fastDecisionSessionBiasSummary}
          fastDecisionSessionDirectionStats={fastDecisionSessionDirectionStats}
          fastDecisionSessionCapitalSummaryLine={
            fastDecisionSessionCapitalSummaryLine
          }
          fastDecisionSessionCapitalSummary={fastDecisionSessionCapitalSummary}
          fastDecisionSessionReviewItems={fastDecisionSessionReviewItems}
          performancePositiveColor={performancePositiveColor}
          performanceNegativeColor={performanceNegativeColor}
          fastDecisionReviewTextColor={fastDecisionReviewTextColor}
          onOpenSessionReviewDialog={openSessionReviewDialog}
          activeQuestionCount={activeQuestionCount}
          riskDisciplineSessionGrade={riskDisciplineSessionGrade}
          riskDisciplineSessionGradeTone={riskDisciplineSessionGradeTone}
          riskDisciplineSessionCommentary={riskDisciplineSessionCommentary}
          riskDisciplineSessionSummary={riskDisciplineSessionSummary}
          riskDisciplineSessionAlphaMetricTone={
            riskDisciplineSessionAlphaMetricTone
          }
          riskDisciplineSessionBehaviorInsight={
            riskDisciplineSessionBehaviorInsight
          }
          riskDisciplineSessionBehaviorRows={riskDisciplineSessionBehaviorRows}
          riskDisciplineSessionReviewItems={riskDisciplineSessionReviewItems}
          riskCurveUserColor={riskCurveUserColor}
          tradeBuyDirectionColor={tradeBuyDirectionColor}
          tradeSellDirectionColor={tradeSellDirectionColor}
        />
      ) : null}
      <SpecialTrainingScopeRestartNoticeDialog
        notice={scopeRestartNotice}
        countdown={scopeRestartNoticeCountdown}
        title={tt("appText.questionBankRestarted")}
        description={
          scopeRestartNotice
            ? formatScopeRestartDescription(scopeRestartNotice)
            : ttf(
                "appText.questionSlotsExhaustedSoSystemRestartedFormalQuestionValue0Value1Value2",
                [0, 0, 0],
              )
        }
        fallbackDescription={ttf(
          "appText.questionSlotsExhaustedSoSystemRestartedFormalQuestionValue0Value1Value2",
          [0, 0, 0],
        )}
        continueLabel={tt("appText.continue")}
        countdownContinueLabel={ttf("appText.value0Value1", [
          tt("appText.continue"),
          scopeRestartNoticeCountdown,
        ])}
        onClose={state.closeScopeRestartNotice}
      />
    </WorkspacePageShell>
  );
};
