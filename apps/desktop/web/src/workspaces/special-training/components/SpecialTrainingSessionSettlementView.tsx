// SPDX-License-Identifier: GPL-3.0-only

import { Button } from "@/ui/primitives/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui/primitives/tooltip";
import { VendorIcon } from "@/assets/graphics";
import type {
  AppUiLanguage,
  getSpecialTrainingPageContent,
  SpecialTrainingModeId,
} from "@/ui/config/uiConfig";
import { formatMoneyFixed } from "@/ui/formatting/format";
import { formatCountWithUnitText } from "@/ui/formatting/i18nDisplay";
import { SpecialTrainingActionButton } from "@/ui/components";
import { formatFastDecisionCapitalAmount } from "@/workspaces/special-training/fastDecisionCapitalPresentation";
import {
  formatConfigValue,
  formatPercent,
  formatPercentFixed,
  formatTemplate,
} from "@/workspaces/special-training/domain/specialTrainingHelpers";
import type {
  FastDecisionSessionDirectionStat,
  FastDecisionSessionGrade,
  FastDecisionSessionGradeTone,
  FastDecisionSessionMetricTone,
  FastDecisionSessionReviewItem,
  FastDecisionStrictnessOption,
  RiskDisciplineSessionReviewItem,
} from "@/workspaces/special-training/domain/specialTrainingTypes";
import {
  FastDecisionDirectionAccuracyBar,
  FastDecisionReviewCard,
  FastDecisionSessionMetricCard,
  RiskDisciplineBehaviorBar,
  RiskDisciplineReviewCard,
} from "@/workspaces/special-training/components/specialTrainingSessionReviewCards";

type SpecialTrainingPageContent = ReturnType<typeof getSpecialTrainingPageContent>;

type SpecialTrainingSessionSettlementCommonProps = {
  language: AppUiLanguage;
  content: SpecialTrainingPageContent;
  activeModeTitle: string;
  activeHorizonBars: number;
  hasEnabledSampleSymbols: boolean;
  onRestartCurrentMode: () => void;
  onExitTraining: () => void;
};

type FastDecisionSessionSummaryForSettlement = {
  winRate: number;
  averageDecisionSeconds: number;
  missRate: number;
  missCount: number;
  completedCount: number;
};

type FastDecisionCapitalSummaryForSettlement = {
  positiveCount: number;
  flatCount: number;
  negativeCount: number;
};

type FastDecisionSessionSettlementProps =
  SpecialTrainingSessionSettlementCommonProps & {
    modeId: Extract<SpecialTrainingModeId, "fast-decision-training">;
    activeDecisionSecondsLimit: number;
    activeFastDecisionStrictnessOption: Pick<
      FastDecisionStrictnessOption,
      "title" | "ratio"
    >;
    questionCount: number;
    fastDecisionSessionGrade: FastDecisionSessionGrade;
    fastDecisionSessionGradeTone: FastDecisionSessionGradeTone;
    fastDecisionSessionCommentary: string;
    fastDecisionSessionSummary: FastDecisionSessionSummaryForSettlement;
    fastDecisionSessionDecisionMetricTone: FastDecisionSessionMetricTone;
    fastDecisionSessionBiasSummary: string;
    fastDecisionSessionDirectionStats: FastDecisionSessionDirectionStat[];
    fastDecisionSessionCapitalSummaryLine: string;
    fastDecisionSessionCapitalSummary: FastDecisionCapitalSummaryForSettlement;
    fastDecisionSessionReviewItems: FastDecisionSessionReviewItem[];
    performancePositiveColor: string;
    performanceNegativeColor: string;
    fastDecisionReviewTextColor: string;
    onOpenSessionReviewDialog: (reviewIndex: number) => void;
  };

type RiskDisciplineSessionSummaryForSettlement = {
  survivalRate: number;
  comebackRate: number;
  averageAlpha: number;
};

type RiskDisciplineSessionBehaviorRow = {
  behavior: string;
  label: string;
  count: number;
  survivalRate: number;
  tone: FastDecisionSessionMetricTone;
};

type RiskDisciplineSessionSettlementProps =
  SpecialTrainingSessionSettlementCommonProps & {
    modeId: Extract<SpecialTrainingModeId, "risk-discipline-training">;
    activeQuestionCount: number;
    riskDisciplineSessionGrade: FastDecisionSessionGrade;
    riskDisciplineSessionGradeTone: FastDecisionSessionGradeTone;
    riskDisciplineSessionCommentary: string;
    riskDisciplineSessionSummary: RiskDisciplineSessionSummaryForSettlement;
    riskDisciplineSessionAlphaMetricTone: FastDecisionSessionMetricTone;
    riskDisciplineSessionBehaviorInsight: string;
    riskDisciplineSessionBehaviorRows: RiskDisciplineSessionBehaviorRow[];
    riskDisciplineSessionReviewItems: RiskDisciplineSessionReviewItem[];
    riskCurveUserColor: string;
    tradeBuyDirectionColor: string;
    tradeSellDirectionColor: string;
    fastDecisionReviewTextColor: string;
    onOpenSessionReviewDialog: (reviewIndex: number) => void;
  };

export type SpecialTrainingSessionSettlementViewProps =
  | FastDecisionSessionSettlementProps
  | RiskDisciplineSessionSettlementProps;

export const SpecialTrainingSessionSettlementView = (
  props: SpecialTrainingSessionSettlementViewProps,
) =>
  props.modeId === "fast-decision-training" ? (
    <FastDecisionSessionSettlementView {...props} />
  ) : (
    <RiskDisciplineSessionSettlementView {...props} />
  );

const FastDecisionSessionSettlementView = ({
  language,
  content,
  activeModeTitle,
  activeHorizonBars,
  hasEnabledSampleSymbols,
  onRestartCurrentMode,
  onExitTraining,
  activeDecisionSecondsLimit,
  activeFastDecisionStrictnessOption,
  questionCount,
  fastDecisionSessionGrade,
  fastDecisionSessionGradeTone,
  fastDecisionSessionCommentary,
  fastDecisionSessionSummary,
  fastDecisionSessionDecisionMetricTone,
  fastDecisionSessionBiasSummary,
  fastDecisionSessionDirectionStats,
  fastDecisionSessionCapitalSummaryLine,
  fastDecisionSessionCapitalSummary,
  fastDecisionSessionReviewItems,
  performancePositiveColor,
  performanceNegativeColor,
  fastDecisionReviewTextColor,
  onOpenSessionReviewDialog,
}: FastDecisionSessionSettlementProps) => (
  <section className="special-training-stage special-training-record-stage special-training-session-settlement-stage">
    <div className="special-training-session-settlement-shell">
      <header className="special-training-session-settlement-header">
        <div className="special-training-session-settlement-header-copy">
          <h3>{content.sessionSettlementTitle}</h3>
        </div>
        <Tooltip delay={120}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost" size="sm"
              aria-label={content.sessionSettlementSettingsLabel}
            >
              <VendorIcon name="circleHelp" aria-hidden="true" />
              <span>{content.sessionSettlementSettingsLabel}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            align="end"
            sideOffset={8}
            showArrow
            className="special-training-session-settings-tooltip"
          >
            <div className="special-training-session-settings-tooltip-body">
              <strong>{content.sessionSettlementSettingsLabel}</strong>
              <div>
                <span>{content.decisionTimeLimitLabel}</span>
                <span>
                  {formatCountWithUnitText(
                    language,
                    formatMoneyFixed(activeDecisionSecondsLimit, 0),
                    content.modePickerSecondUnitLabel,
                  )}
                </span>
              </div>
              <div>
                <span>{content.horizonLimitLabel}</span>
                <span>
                  {formatCountWithUnitText(
                    language,
                    formatMoneyFixed(activeHorizonBars, 0),
                    content.modePickerBarsUnitLabel,
                  )}
                </span>
              </div>
              <div>
                <span>{content.fastDecisionStrictnessLabel}</span>
                <span>
                  {formatTemplate(
                    content.fastDecisionStrictnessOptionTitleTemplate,
                    [
                      activeFastDecisionStrictnessOption.title,
                      formatConfigValue(
                        activeFastDecisionStrictnessOption.ratio,
                        1,
                      ),
                    ],
                  )}
                </span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </header>

      <div className="special-training-session-settlement-main">
        <article className="special-training-session-panel special-training-session-verdict-panel">
          <div className="special-training-session-verdict-hero">
            <div
              className={`special-training-session-grade-badge is-${fastDecisionSessionGradeTone}`}
              aria-label={formatTemplate(
                content.challengeBattleResultGradeTemplate,
                [fastDecisionSessionGrade],
              )}
            >
              {fastDecisionSessionGrade}
            </div>
            <div className="special-training-session-verdict-copy">
              <span>{content.sessionSettlementVerdictTitle}</span>
              <strong>{fastDecisionSessionCommentary}</strong>
              <p>{activeModeTitle}</p>
            </div>
          </div>

          <div className="special-training-session-diagnostics-row">
            <div className="special-training-session-metrics-grid">
              <FastDecisionSessionMetricCard
                label={content.challengeStatsFastWinRateLabel}
                tone="accent"
                value={formatPercentFixed(fastDecisionSessionSummary.winRate, 0)}
                progressRate={fastDecisionSessionSummary.winRate}
              />
              <FastDecisionSessionMetricCard
                label={content.challengeStatsFastAvgDecisionSecondsLabel}
                value={formatCountWithUnitText(
                  language,
                  formatMoneyFixed(fastDecisionSessionSummary.averageDecisionSeconds, 2),
                  content.fastArenaSecondUnitLabel,
                )}
                subtitle={
                  fastDecisionSessionDecisionMetricTone === "warning"
                    ? content.sessionSettlementDecisionWarningLabel
                    : fastDecisionSessionDecisionMetricTone === "accent"
                      ? content.sessionSettlementDecisionFastLabel
                      : content.sessionSettlementDecisionStableLabel
                }
                tone={fastDecisionSessionDecisionMetricTone}
              />
              <FastDecisionSessionMetricCard
                label={content.challengeStatsFastMissRateLabel}
                value={formatPercent(fastDecisionSessionSummary.missRate)}
                subtitle={`${fastDecisionSessionSummary.missCount}/${fastDecisionSessionSummary.completedCount || questionCount}`}
                tone="danger"
              />
            </div>
            <div className="special-training-session-bias-inline">
              <div className="special-training-session-panel-head">
                <h4>{content.sessionSettlementBiasTitle}</h4>
                <p>{fastDecisionSessionBiasSummary}</p>
              </div>
              <div className="special-training-session-bias-stack">
                {fastDecisionSessionDirectionStats.map((item) => (
                  <FastDecisionDirectionAccuracyBar
                    key={`special-training-session-bias-inline-${item.id}`}
                    item={item}
                  />
                ))}
              </div>
            </div>
          </div>
        </article>

        <article className="special-training-session-panel special-training-session-capital-panel">
          <div className="special-training-session-panel-head">
            <h4>{content.fastDecisionCapitalSessionTitle}</h4>
            <p>{fastDecisionSessionCapitalSummaryLine}</p>
          </div>
          <div className="special-training-session-capital-summary-grid">
            <article className="special-training-session-capital-summary-card is-up">
              <span>{content.fastDecisionCapitalPositiveCountLabel}</span>
              <strong>
                {formatFastDecisionCapitalAmount(
                  fastDecisionSessionCapitalSummary.positiveCount,
                )}
              </strong>
            </article>
            <article className="special-training-session-capital-summary-card is-flat">
              <span>{content.fastDecisionCapitalFlatCountLabel}</span>
              <strong>
                {formatFastDecisionCapitalAmount(
                  fastDecisionSessionCapitalSummary.flatCount,
                )}
              </strong>
            </article>
            <article className="special-training-session-capital-summary-card is-down">
              <span>{content.fastDecisionCapitalNegativeCountLabel}</span>
              <strong>
                {formatFastDecisionCapitalAmount(
                  fastDecisionSessionCapitalSummary.negativeCount,
                )}
              </strong>
            </article>
          </div>
        </article>
      </div>

      <article className="special-training-session-panel special-training-session-review-panel">
        <div className="special-training-session-panel-head">
          <h4>{content.sessionSettlementReviewTitle}</h4>
          <p>{content.sessionSettlementReviewSubtitle}</p>
        </div>
        <div className="special-training-session-review-strip">
          {fastDecisionSessionReviewItems.map((item, index) => (
            <FastDecisionReviewCard
              key={`special-training-session-review-${item.id}`}
              item={item}
              reviewIndex={index}
              upColor={performancePositiveColor}
              downColor={performanceNegativeColor}
              flatColor={fastDecisionReviewTextColor}
              markerDotColor={fastDecisionReviewTextColor}
              onOpen={onOpenSessionReviewDialog}
            />
          ))}
        </div>
      </article>
    </div>
    <footer className="special-training-stage-actions">
      <SpecialTrainingActionButton
        variant="ghost"
        priority="secondary"
        onClick={onRestartCurrentMode}
        disabled={!hasEnabledSampleSymbols}
        title={formatTemplate(content.sessionSettlementActionHotkeyTemplate, [
          content.settlementRestartLabel,
          content.sessionSettlementKeyboardEnterLabel,
        ])}
        aria-label={formatTemplate(content.sessionSettlementActionHotkeyTemplate, [
          content.settlementRestartLabel,
          content.sessionSettlementKeyboardEnterLabel,
        ])}
        label={content.settlementRestartLabel}
        hotkey={content.sessionSettlementKeyboardEnterLabel}
      />
      <SpecialTrainingActionButton
        variant="secondary"
        priority="secondary"
        onClick={onExitTraining}
        title={formatTemplate(content.sessionSettlementActionHotkeyTemplate, [
          content.sessionSettlementBackLabel,
          content.sessionSettlementKeyboardEscLabel,
        ])}
        aria-label={formatTemplate(content.sessionSettlementActionHotkeyTemplate, [
          content.sessionSettlementBackLabel,
          content.sessionSettlementKeyboardEscLabel,
        ])}
        label={content.sessionSettlementBackLabel}
        hotkey={content.sessionSettlementKeyboardEscLabel}
      />
    </footer>
  </section>
);

const RiskDisciplineSessionSettlementView = ({
  language,
  content,
  activeModeTitle,
  activeHorizonBars,
  hasEnabledSampleSymbols,
  onRestartCurrentMode,
  onExitTraining,
  activeQuestionCount,
  riskDisciplineSessionGrade,
  riskDisciplineSessionGradeTone,
  riskDisciplineSessionCommentary,
  riskDisciplineSessionSummary,
  riskDisciplineSessionAlphaMetricTone,
  riskDisciplineSessionBehaviorInsight,
  riskDisciplineSessionBehaviorRows,
  riskDisciplineSessionReviewItems,
  riskCurveUserColor,
  tradeBuyDirectionColor,
  tradeSellDirectionColor,
  fastDecisionReviewTextColor,
  onOpenSessionReviewDialog,
}: RiskDisciplineSessionSettlementProps) => (
  <section className="special-training-stage special-training-record-stage special-training-session-settlement-stage">
    <div className="special-training-session-settlement-shell">
      <header className="special-training-session-settlement-header">
        <div className="special-training-session-settlement-header-copy">
          <h3>{content.sessionSettlementTitle}</h3>
        </div>
        <Tooltip delay={120}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost" size="sm"
              aria-label={content.sessionSettlementSettingsLabel}
            >
              <VendorIcon name="circleHelp" aria-hidden="true" />
              <span>{content.sessionSettlementSettingsLabel}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            align="end"
            sideOffset={8}
            showArrow
            className="special-training-session-settings-tooltip"
          >
            <div className="special-training-session-settings-tooltip-body">
              <strong>{content.sessionSettlementSettingsLabel}</strong>
              <div>
                <span>{content.questionCountLabel}</span>
                <span>
                  {formatCountWithUnitText(
                    language,
                    formatMoneyFixed(activeQuestionCount, 0),
                    content.modePickerQuestionUnitLabel,
                  )}
                </span>
              </div>
              <div>
                <span>{content.horizonLimitLabel}</span>
                <span>
                  {formatCountWithUnitText(
                    language,
                    formatMoneyFixed(activeHorizonBars, 0),
                    content.modePickerBarsUnitLabel,
                  )}
                </span>
              </div>
              <div>
                <span>{content.opsLimitLabel}</span>
                <span>{content.operationUnlimitedValueLabel}</span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </header>

      <div className="special-training-session-settlement-main">
        <article className="special-training-session-panel special-training-session-verdict-panel">
          <div className="special-training-session-verdict-hero">
            <div
              className={`special-training-session-grade-badge is-${riskDisciplineSessionGradeTone}`}
              aria-label={formatTemplate(
                content.challengeBattleResultGradeTemplate,
                [riskDisciplineSessionGrade],
              )}
            >
              {riskDisciplineSessionGrade}
            </div>
            <div className="special-training-session-verdict-copy">
              <span>{content.sessionSettlementVerdictTitle}</span>
              <strong>{riskDisciplineSessionCommentary}</strong>
              <p>{activeModeTitle}</p>
            </div>
          </div>

          <div className="special-training-session-metrics-grid">
            <FastDecisionSessionMetricCard
              label={content.challengeStatsRiskSurvivalRateLabel}
              tone="accent"
              value={formatPercentFixed(
                riskDisciplineSessionSummary.survivalRate,
                0,
              )}
              progressRate={riskDisciplineSessionSummary.survivalRate}
            />
            <FastDecisionSessionMetricCard
              label={content.challengeDashboardRiskComebackRateLabel}
              value={formatPercent(riskDisciplineSessionSummary.comebackRate)}
              subtitle={content.challengeDashboardRiskComebackSubtitle}
              tone={
                riskDisciplineSessionSummary.comebackRate >= 0.34
                  ? "accent"
                  : riskDisciplineSessionSummary.comebackRate > 0
                    ? "warning"
                    : "neutral"
              }
            />
            <FastDecisionSessionMetricCard
              label={content.challengeStatsRiskAvgAlphaLabel}
              value={formatPercent(riskDisciplineSessionSummary.averageAlpha)}
              subtitle={
                riskDisciplineSessionSummary.averageAlpha > 0
                  ? content.settlementFeedbackAlphaPositive
                  : content.settlementFeedbackAlphaNegative
              }
              tone={riskDisciplineSessionAlphaMetricTone}
            />
          </div>
        </article>

        <article className="special-training-session-panel special-training-session-bias-panel">
          <div className="special-training-session-panel-head">
            <h4>{content.challengeDashboardRiskBehaviorTitle}</h4>
            <p>{riskDisciplineSessionBehaviorInsight}</p>
          </div>
          <div className="special-training-session-bias-stack">
            {riskDisciplineSessionBehaviorRows.map((item) => (
              <RiskDisciplineBehaviorBar
                key={`special-training-risk-session-behavior-${item.behavior}`}
                label={item.label}
                count={item.count}
                survivalRate={item.survivalRate}
                tone={item.tone}
              />
            ))}
          </div>
        </article>
      </div>

      <article className="special-training-session-panel special-training-session-review-panel">
        <div className="special-training-session-panel-head">
          <h4>{content.sessionSettlementReviewTitle}</h4>
          <p>{content.sessionSettlementReviewSubtitle}</p>
        </div>
        <div className="special-training-session-review-strip">
          {riskDisciplineSessionReviewItems.map((item, index) => (
            <RiskDisciplineReviewCard
              key={`special-training-risk-session-review-${item.id}`}
              item={item}
              reviewIndex={index}
              lineColor={riskCurveUserColor}
              upColor={tradeBuyDirectionColor}
              downColor={tradeSellDirectionColor}
              markerDotColor={fastDecisionReviewTextColor}
              onOpen={onOpenSessionReviewDialog}
            />
          ))}
        </div>
      </article>
    </div>
    <footer className="special-training-stage-actions">
      <SpecialTrainingActionButton
        variant="ghost"
        priority="secondary"
        onClick={onRestartCurrentMode}
        disabled={!hasEnabledSampleSymbols}
        title={formatTemplate(content.sessionSettlementActionHotkeyTemplate, [
          content.settlementRestartLabel,
          content.sessionSettlementKeyboardEnterLabel,
        ])}
        aria-label={formatTemplate(content.sessionSettlementActionHotkeyTemplate, [
          content.settlementRestartLabel,
          content.sessionSettlementKeyboardEnterLabel,
        ])}
        label={content.settlementRestartLabel}
        hotkey={content.sessionSettlementKeyboardEnterLabel}
      />
      <SpecialTrainingActionButton
        variant="secondary"
        priority="secondary"
        onClick={onExitTraining}
        title={formatTemplate(content.sessionSettlementActionHotkeyTemplate, [
          content.sessionSettlementBackLabel,
          content.sessionSettlementKeyboardEscLabel,
        ])}
        aria-label={formatTemplate(content.sessionSettlementActionHotkeyTemplate, [
          content.sessionSettlementBackLabel,
          content.sessionSettlementKeyboardEscLabel,
        ])}
        label={content.sessionSettlementBackLabel}
        hotkey={content.sessionSettlementKeyboardEscLabel}
      />
    </footer>
  </section>
);
