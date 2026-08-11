// SPDX-License-Identifier: GPL-3.0-only

import type { ComponentProps, CSSProperties, ReactNode } from "react";
import type { FastDecisionCapitalReview } from "@zinuto/shared/domain-calculations/fast-decision-capital-review";
import type { EChartsOption } from "echarts";
import { Button } from "@/ui/primitives/button";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import { AppIcon } from "@/assets/graphics";
import { SpecialTrainingActionButton } from "@/ui/components";
import {
  EChartSurface,
} from "@/workspaces/challenge-stats/charts/echartSurface";
import type {
  AppUiLanguage,
  getSpecialTrainingPageContent,
} from "@/ui/config/uiConfig";
import { formatCountWithUnitText } from "@/ui/formatting/i18nDisplay";
import {
  type FastDecisionCapitalAnchorDisplayItem,
} from "@/workspaces/special-training/fastDecisionCapitalPresentation";
import { resolveFastDecisionCapitalAnchorTone } from "@/workspaces/special-training/charts/specialTrainingChartOptions";
import { formatConfigValue, formatPercentFixed } from "@/workspaces/special-training/domain/specialTrainingHelpers";
import type {
  FastDecisionArenaPhase,
  FastDecisionChoice,
  FastDecisionReviewDetail,
  FastDecisionSessionReviewTone,
} from "@/workspaces/special-training/domain/specialTrainingTypes";
import { SpecialTrainingTrainerFrame } from "@/workspaces/special-training/components/SpecialTrainingTrainerFrame";

type SpecialTrainingFastDecisionTrainingViewProps = {
  chartWorkspace: ReactNode;
  language: AppUiLanguage;
  content: ReturnType<typeof getSpecialTrainingPageContent>;
  textSlash: string;
  tt: (key: AppTextKey) => string;
  fastDecisionProgressSegmentCount: number;
  currentQuestionIndex: number;
  questionCount: number;
  fastDecisionProgressValue: string;
  fastDecisionWinRateDialStyle: CSSProperties;
  winRate: number;
  fastDecisionWinRateMeta: string;
  fastDecisionAverageDecisionDisplay: string;
  activeDecisionSecondsLimit: number;
  fastDecisionAverageDecisionMeta: string;
  fastDecisionPaceMeterStyle: CSSProperties;
  showFastDecisionDecisionControls: boolean;
  fastDecisionCountdownTone: string;
  isCriticalCountdown: boolean;
  fastDecisionLiveHintText: string;
  fastDecisionCountdownRingStyle: CSSProperties;
  fastDecisionCountdownClock: string;
  fastDecisionReviewTone: FastDecisionSessionReviewTone;
  resolvedFastDecisionReviewDetail: FastDecisionReviewDetail | null;
  activeFastDecisionCapitalReview: FastDecisionCapitalReview | null;
  activeFastDecisionCapitalTone: "up" | "down" | "flat";
  activeFastDecisionCapitalCurveOption: EChartsOption | null;
  activeFastDecisionCapitalAnchorItems: FastDecisionCapitalAnchorDisplayItem[];
  fastDecisionReviewSelectionTone: string;
  fastDecisionReviewDirectionIconName: ComponentProps<typeof AppIcon>["name"];
  fastDecisionReviewActualTone: string;
  fastDecisionReviewActualIconName: ComponentProps<typeof AppIcon>["name"];
  fastDecisionReviewGaugeTone: "up" | "down" | "flat";
  fastDecisionReviewThresholdDisplay: string;
  fastDecisionReviewRatioDisplay: string;
  onCreateChallengeReviewNote?: unknown;
  showFastDecisionSettlementActions: boolean;
  handleCreateChallengeReviewNote: () => void;
  fastDecisionPhase: FastDecisionArenaPhase;
  lockedDecisionSelection: FastDecisionChoice | null;
  submitFastDecision: (choice: FastDecisionChoice) => void;
  directionSelectDisabled: boolean;
  gotoNextQuestion: () => void;
  exitTraining: () => void;
  submitErrorMessage: string | null;
};

export const SpecialTrainingFastDecisionTrainingView = ({
  chartWorkspace,
  language,
  content,
  textSlash,
  tt,
  fastDecisionProgressSegmentCount,
  currentQuestionIndex,
  questionCount,
  fastDecisionProgressValue,
  fastDecisionWinRateDialStyle,
  winRate,
  fastDecisionWinRateMeta,
  fastDecisionAverageDecisionDisplay,
  activeDecisionSecondsLimit,
  fastDecisionAverageDecisionMeta,
  fastDecisionPaceMeterStyle,
  showFastDecisionDecisionControls,
  fastDecisionCountdownTone,
  isCriticalCountdown,
  fastDecisionLiveHintText,
  fastDecisionCountdownRingStyle,
  fastDecisionCountdownClock,
  fastDecisionReviewTone,
  resolvedFastDecisionReviewDetail,
  activeFastDecisionCapitalReview,
  activeFastDecisionCapitalTone,
  activeFastDecisionCapitalCurveOption,
  activeFastDecisionCapitalAnchorItems,
  fastDecisionReviewSelectionTone,
  fastDecisionReviewDirectionIconName,
  fastDecisionReviewActualTone,
  fastDecisionReviewActualIconName,
  fastDecisionReviewGaugeTone,
  fastDecisionReviewThresholdDisplay,
  fastDecisionReviewRatioDisplay,
  onCreateChallengeReviewNote,
  showFastDecisionSettlementActions,
  handleCreateChallengeReviewNote,
  submitFastDecision,
  directionSelectDisabled,
  gotoNextQuestion,
  exitTraining,
  submitErrorMessage,
}: SpecialTrainingFastDecisionTrainingViewProps) => (
  <SpecialTrainingTrainerFrame
    chartWorkspace={chartWorkspace}
    leftPanelBodyClassName="special-training-fast-decision-left-panel-body"
    rightPanelBodyClassName="right-panel-body special-training-right-panel-body special-training-lightning-panel-body special-training-fast-decision-panel-body"
    rightPanelBody={
      <>
        <header
          className="special-training-lightning-status-panel"
          aria-live="polite"
        >
          <div className="special-training-lightning-status-grid">
            <article className="special-training-lightning-status-card is-progress">
              <span className="special-training-lightning-status-inline-label">
                {content.trainingProgressLabel}
              </span>
              <div
                className="special-training-lightning-progress-segments"
                aria-hidden="true"
              >
                {Array.from({
                  length: fastDecisionProgressSegmentCount,
                }).map((_, index) => (
                  <span
                    key={`special-training-progress-segment-${index}`}
                    className={index < currentQuestionIndex + 1 ? "is-active" : ""}
                  />
                ))}
              </div>
              <strong className="special-training-lightning-status-inline-value">
                {fastDecisionProgressValue}
              </strong>
            </article>
            <article className="special-training-lightning-status-card is-win-rate">
              <div className="special-training-lightning-status-card-head">
                <span>{content.metricWinRateLabel}</span>
              </div>
              <div className="special-training-lightning-win-rate-visual">
                <div
                  className="special-training-lightning-donut"
                  style={fastDecisionWinRateDialStyle}
                  aria-hidden="true"
                >
                  <div className="special-training-lightning-donut-inner">
                    <strong>{formatPercentFixed(winRate, 0)}</strong>
                  </div>
                </div>
              </div>
              <span className="special-training-lightning-status-card-meta">
                {fastDecisionWinRateMeta}
              </span>
            </article>
            <article className="special-training-lightning-status-card is-pace">
              <div className="special-training-lightning-status-card-head">
                <span>{content.metricAvgDecisionSecondsLabel}</span>
                <span
                  className="special-training-lightning-status-card-icon"
                  aria-hidden="true"
                >
                  <AppIcon name="statusTimer" />
                </span>
              </div>
              <div className="special-training-lightning-pace-summary">
                <strong className="special-training-lightning-status-card-value">
                  {fastDecisionAverageDecisionDisplay}
                </strong>
                <span className="special-training-lightning-pace-limit">
                  {textSlash}
                  {formatCountWithUnitText(
                    language,
                    formatConfigValue(activeDecisionSecondsLimit, 0),
                    content.fastArenaSecondUnitLabel,
                  )}
                </span>
              </div>
              <span className="special-training-lightning-status-card-meta">
                {fastDecisionAverageDecisionMeta}
              </span>
              <div
                className="special-training-lightning-pace-meter"
                style={fastDecisionPaceMeterStyle}
                aria-hidden="true"
              >
                <span className="special-training-lightning-pace-meter-fill" />
              </div>
            </article>
          </div>
        </header>
        <div
          className={`special-training-lightning-panel-middle ${
            showFastDecisionDecisionControls ? "is-live" : "is-review"
          }`}
        >
          {showFastDecisionDecisionControls ? (
            <section
              className={`special-training-lightning-decision-stage is-${fastDecisionCountdownTone} ${isCriticalCountdown ? "is-critical" : ""}`}
            >
              <div className="special-training-lightning-decision-core">
                <p className="special-training-lightning-decision-hint">
                  {fastDecisionLiveHintText}
                </p>
                <div
                  className={`special-training-lightning-countdown-ring is-${fastDecisionCountdownTone} ${
                    isCriticalCountdown ? "is-critical" : ""
                  }`}
                  style={fastDecisionCountdownRingStyle}
                >
                  <div className="special-training-lightning-countdown-ring-inner">
                    <div className="special-training-lightning-countdown-top-copy">
                      <AppIcon
                        name="statusBolt"
                        className="special-training-lightning-decision-ghost-icon"
                        aria-hidden="true"
                      />
                    </div>
                    <strong
                      className={`special-training-lightning-countdown-seconds special-training-lightning-decision-countdown is-${fastDecisionCountdownTone} ${
                        isCriticalCountdown ? "is-critical" : ""
                      }`}
                    >
                      {fastDecisionCountdownClock}
                    </strong>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <section
              className={`special-training-lightning-result-card is-${fastDecisionReviewTone}`}
              role="status"
              aria-live="polite"
            >
              {resolvedFastDecisionReviewDetail &&
              activeFastDecisionCapitalReview ? (
                <div className="special-training-lightning-result-body">
                  <div className="special-training-lightning-capital-hero">
                    <div className="special-training-lightning-capital-head">
                      <div className="special-training-lightning-capital-copy">
                        <span
                          className={`special-training-lightning-capital-kicker is-${activeFastDecisionCapitalTone}`}
                        >
                          {content.fastDecisionCapitalHeroLabel}
                        </span>
                        <span className="special-training-lightning-capital-disclaimer">
                          {content.fastDecisionCapitalHeroDisclaimer}
                        </span>
                      </div>
                    </div>
                    {activeFastDecisionCapitalCurveOption ? (
                      <div className="special-training-lightning-capital-chart-card">
                        <div className="special-training-lightning-capital-chart-shell">
                          <EChartSurface
                            option={activeFastDecisionCapitalCurveOption}
                            className="special-training-lightning-capital-chart"
                          />
                        </div>
                      </div>
                    ) : null}
                    {activeFastDecisionCapitalAnchorItems.length ? (
                      <div
                        className="special-training-lightning-capital-anchor-strip"
                        data-card-count={activeFastDecisionCapitalAnchorItems.length}
                      >
                        {activeFastDecisionCapitalAnchorItems.map((item) => {
                          const anchorTone =
                            resolveFastDecisionCapitalAnchorTone(item);
                          return (
                            <article
                              key={`fast-decision-capital-anchor-${item.orderIndex}-${item.shortTitle}`}
                              className={`special-training-lightning-capital-anchor is-${anchorTone}`}
                            >
                              <span className="special-training-lightning-capital-anchor-label">
                                {item.title}
                              </span>
                              <strong className="special-training-lightning-capital-anchor-value">
                                {item.returnRateLabel}
                              </strong>
                              <small className="special-training-lightning-capital-anchor-time">
                                {item.timingLabel}
                              </small>
                            </article>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                  <header className="special-training-lightning-result-hero">
                    <div className="special-training-lightning-result-summary-deck">
                      <div className="special-training-lightning-result-summary-column">
                        <div className="special-training-lightning-result-summary-copy">
                          <span
                            className={`special-training-lightning-result-summary-kicker is-${fastDecisionReviewTone}`}
                          >
                            {resolvedFastDecisionReviewDetail.badgeLabel}
                          </span>
                        </div>
                        <div className="special-training-lightning-result-log">
                          <div className="special-training-lightning-result-log-pair">
                            <div
                              className={`special-training-lightning-result-log-row is-${fastDecisionReviewSelectionTone}`}
                            >
                              <span className="special-training-lightning-result-log-label">
                                {content.decisionSelectedLabel}
                              </span>
                              <strong className="special-training-lightning-result-log-value">
                                <AppIcon
                                  name={fastDecisionReviewDirectionIconName}
                                  className="special-training-lightning-result-log-icon"
                                  aria-hidden="true"
                                />
                                <span>
                                  {
                                    resolvedFastDecisionReviewDetail.directionLabel
                                  }
                                </span>
                              </strong>
                            </div>
                            <div
                              className={`special-training-lightning-result-log-row is-${fastDecisionReviewActualTone}`}
                            >
                              <span className="special-training-lightning-result-log-label">
                                {content.decisionResultLabel}
                              </span>
                              <strong className="special-training-lightning-result-log-value">
                                <AppIcon
                                  name={fastDecisionReviewActualIconName}
                                  className="special-training-lightning-result-log-icon"
                                  aria-hidden="true"
                                />
                                <span>
                                  {
                                    resolvedFastDecisionReviewDetail.actualDirectionLabel
                                  }
                                </span>
                              </strong>
                            </div>
                          </div>
                          <div className="special-training-lightning-result-log-pair">
                            <div className="special-training-lightning-result-log-row is-metric">
                              <span className="special-training-lightning-result-log-label">
                                {content.fastArenaMfeTagLabel}
                              </span>
                              <strong className="special-training-lightning-result-log-value">
                                <span>
                                  {
                                    resolvedFastDecisionReviewDetail.favorableValue
                                  }
                                </span>
                              </strong>
                            </div>
                            <div className="special-training-lightning-result-log-row is-metric">
                              <span className="special-training-lightning-result-log-label">
                                {content.fastArenaMaeTagLabel}
                              </span>
                              <strong className="special-training-lightning-result-log-value">
                                <span>
                                  {resolvedFastDecisionReviewDetail.adverseValue}
                                </span>
                              </strong>
                            </div>
                          </div>
                          <div className="special-training-lightning-result-log-pair">
                            <div
                              className={`special-training-lightning-result-log-row is-${fastDecisionReviewGaugeTone === "up" ? "pass" : fastDecisionReviewGaugeTone === "down" ? "fail" : "time"}`}
                            >
                              <span className="special-training-lightning-result-log-label">
                                {content.fastDecisionRatioLabel}
                              </span>
                              <strong className="special-training-lightning-result-log-value">
                                <span>{fastDecisionReviewRatioDisplay}</span>
                              </strong>
                            </div>
                            <div className="special-training-lightning-result-log-row is-threshold">
                              <span className="special-training-lightning-result-log-label">
                                {content.fastDecisionThresholdLabel}
                              </span>
                              <strong className="special-training-lightning-result-log-value">
                                <span>{fastDecisionReviewThresholdDisplay}</span>
                              </strong>
                            </div>
                          </div>
                          <div
                            className={`special-training-lightning-result-log-pair ${
                              onCreateChallengeReviewNote &&
                              showFastDecisionSettlementActions
                                ? ""
                                : "is-single"
                            }`}
                          >
                            <div className="special-training-lightning-result-log-row is-time">
                              <span className="special-training-lightning-result-log-label">
                                {content.decisionElapsedLabel}
                              </span>
                              <strong className="special-training-lightning-result-log-value">
                                <AppIcon
                                  name="statusTimer"
                                  className="special-training-lightning-result-log-icon"
                                  aria-hidden="true"
                                />
                                <span>
                                  {
                                    resolvedFastDecisionReviewDetail.decisionSecondsLabel
                                  }
                                </span>
                              </strong>
                            </div>
                            {onCreateChallengeReviewNote &&
                            showFastDecisionSettlementActions ? (
                              <div className="special-training-lightning-result-log-row is-note-action">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={handleCreateChallengeReviewNote}
                                  title={tt("appText.addChallengeNote")}
                                  aria-label={tt("appText.addChallengeNote")}
                                >
                                  <span className="special-training-lightning-inline-note-btn-copy">
                                    <AppIcon
                                      name="drawNote"
                                      className="special-training-lightning-inline-note-btn-icon"
                                      aria-hidden="true"
                                    />
                                    <span className="special-training-lightning-inline-note-btn-label">
                                      {tt("appText.addNote")}
                                    </span>
                                  </span>
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  </header>
                </div>
              ) : (
                <div className="special-training-lightning-result-body is-empty">
                  <div className="special-training-lightning-empty-state">
                    <p>{content.fastDecisionFocusHint}</p>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
        <footer className="special-training-lightning-panel-footer">
          {showFastDecisionDecisionControls ? (
            <div
              className="special-training-lightning-action-stack special-training-lightning-action-stack-live"
            >
              <SpecialTrainingActionButton
                tone="buy"
                priority="primary"
                onClick={() => submitFastDecision("LONG")}
                disabled={directionSelectDisabled}
                title={`${content.decisionDirectionUpLabel} ${textSlash} ${content.fastArenaBuyHotkeyLabel}`}
                aria-label={`${content.decisionDirectionUpLabel} ${textSlash} ${content.fastArenaBuyHotkeyLabel}`}
                icon={<AppIcon name="actionArrowUp" aria-hidden="true" />}
                label={content.decisionDirectionUpLabel}
                hotkey={content.fastArenaBuyHotkeyLabel}
              />
              <SpecialTrainingActionButton
                tone="sell"
                priority="primary"
                onClick={() => submitFastDecision("SHORT")}
                disabled={directionSelectDisabled}
                title={`${content.decisionDirectionDownLabel} ${textSlash} ${content.fastArenaSellHotkeyLabel}`}
                aria-label={`${content.decisionDirectionDownLabel} ${textSlash} ${content.fastArenaSellHotkeyLabel}`}
                icon={<AppIcon name="actionArrowDown" aria-hidden="true" />}
                label={content.decisionDirectionDownLabel}
                hotkey={content.fastArenaSellHotkeyLabel}
              />
              <SpecialTrainingActionButton
                tone="next"
                priority="muted"
                onClick={() => submitFastDecision("OBSERVE")}
                disabled={directionSelectDisabled}
                title={`${content.decisionObserveLabel} ${textSlash} ${content.fastArenaPassHotkeyLabel}`}
                aria-label={`${content.decisionObserveLabel} ${textSlash} ${content.fastArenaPassHotkeyLabel}`}
                iconPlaceholder
                label={content.decisionObserveLabel}
                hotkey={content.fastArenaPassHotkeyLabel}
              />
            </div>
          ) : showFastDecisionSettlementActions ? (
            <div className="special-training-lightning-action-stack is-post-settlement">
              <SpecialTrainingActionButton
                variant="default"
                priority="secondary"
                onClick={gotoNextQuestion}
                title={`${
                  currentQuestionIndex < questionCount - 1
                    ? content.settlementContinueLabel
                    : content.settlementFinishLabel
                } ${textSlash} ${content.fastArenaAnyKeyLabel}`}
                aria-label={`${
                  currentQuestionIndex < questionCount - 1
                    ? content.settlementContinueLabel
                    : content.settlementFinishLabel
                } ${textSlash} ${content.fastArenaAnyKeyLabel}`}
                label={
                  currentQuestionIndex < questionCount - 1
                    ? content.settlementContinueLabel
                    : content.settlementFinishLabel
                }
                hotkey={content.fastArenaAnyKeyLabel}
              />
              <SpecialTrainingActionButton
                variant="secondary"
                priority="secondary"
                onClick={exitTraining}
                title={`${content.trainingExitLabel} ${textSlash} ${content.fastArenaExitHotkeyLabel}`}
                aria-label={`${content.trainingExitLabel} ${textSlash} ${content.fastArenaExitHotkeyLabel}`}
                label={content.trainingExitLabel}
                hotkey={content.fastArenaExitHotkeyLabel}
              />
            </div>
          ) : (
            <p className="special-training-inline-hint special-training-lightning-inline-hint">
              {content.fastArenaLockedLabel}
            </p>
          )}
          {submitErrorMessage ? (
            <p className="special-training-inline-hint special-training-lightning-inline-hint">
              {submitErrorMessage}
            </p>
          ) : null}
        </footer>
      </>
    }
  />
);
