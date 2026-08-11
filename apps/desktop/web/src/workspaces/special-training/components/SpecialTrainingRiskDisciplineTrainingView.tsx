// SPDX-License-Identifier: GPL-3.0-only

import type {
  ReactNode,
  RefObject,
} from "react";
import { Button } from "@/ui/primitives/button";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import { AppIcon, VendorIcon } from "@/assets/graphics";
import { SpecialTrainingActionButton } from "@/ui/components";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import type { getSpecialTrainingPageContent } from "@/ui/config/uiConfig";
import { SpecialTrainingTrainerFrame } from "@/workspaces/special-training/components/SpecialTrainingTrainerFrame";

type RiskHudMetricCard = {
  id: string;
  label: string;
  value: string;
  tone: string;
};

type RiskSnapshotItem = {
  key: string;
  label: string;
  value: string;
};

type SpecialTrainingRiskDisciplineTrainingViewProps = {
  chartWorkspace: ReactNode;
  content: ReturnType<typeof getSpecialTrainingPageContent>;
  ui: UiLabelEntry;
  tt: (key: AppTextKey) => string;
  textSlash: string;
  activeModeTitle: string;
  riskGravityCurrentPriceDisplay: string;
  riskGravityBreakevenPriceDisplay: string;
  riskBreakevenTone: string;
  riskGravityGapFillPercent: number;
  riskBreakevenDistanceDisplay: string;
  riskHudMetricCards: ReadonlyArray<RiskHudMetricCard>;
  riskQuestionProgressValue: string;
  riskQuestionProgressSegmentCount: number;
  currentQuestionIndex: number;
  questionCount: number;
  riskSurvivalTrackTone: string;
  riskRemainingBarsDisplay: string;
  riskPanelBodyRef: RefObject<HTMLDivElement | null>;
  submitErrorMessage: string | null;
  riskSurvivalCardTone: string;
  riskCurrentAssetDisplay: string;
  riskFloatingLabel: string;
  riskFloatingValueDisplay: string;
  riskFloatingTone: string;
  riskSnapshotItems: ReadonlyArray<RiskSnapshotItem>;
  isQuestionLoading: boolean;
  questionSettledInTraining: boolean;
  riskOrderTicket: ReactNode;
  gotoNextQuestion: () => void;
  postSettlementActionsDisabled: boolean;
  exitTraining: () => void;
  onCreateChallengeReviewNote?: unknown;
  handleCreateChallengeReviewNote: () => void;
  setRiskAutoplayEnabled: (enabled: boolean) => void;
  finalizeQuestion: (abandoned: boolean) => Promise<void>;
  completeDisabled: boolean;
  hasActiveQuestion: boolean;
};

export const SpecialTrainingRiskDisciplineTrainingView = ({
  chartWorkspace,
  content,
  tt,
  textSlash,
  activeModeTitle,
  riskGravityCurrentPriceDisplay,
  riskGravityBreakevenPriceDisplay,
  riskBreakevenTone,
  riskGravityGapFillPercent,
  riskBreakevenDistanceDisplay,
  riskHudMetricCards,
  riskQuestionProgressValue,
  riskQuestionProgressSegmentCount,
  currentQuestionIndex,
  questionCount,
  riskSurvivalTrackTone,
  riskRemainingBarsDisplay,
  riskPanelBodyRef,
  submitErrorMessage,
  riskSurvivalCardTone,
  riskCurrentAssetDisplay,
  riskFloatingLabel,
  riskFloatingValueDisplay,
  riskFloatingTone,
  riskSnapshotItems,
  isQuestionLoading,
  questionSettledInTraining,
  riskOrderTicket,
  gotoNextQuestion,
  postSettlementActionsDisabled,
  exitTraining,
  onCreateChallengeReviewNote,
  handleCreateChallengeReviewNote,
  setRiskAutoplayEnabled,
  finalizeQuestion,
  completeDisabled,
  hasActiveQuestion,
}: SpecialTrainingRiskDisciplineTrainingViewProps) => (
  <SpecialTrainingTrainerFrame
    chartWorkspace={chartWorkspace}
    leftPanelTop={
      <div
        className="special-training-risk-left-top-grid"
      >
        <section
          className="special-training-risk-hud-card special-training-risk-hud-card-gravity"
          aria-label={content.riskDisciplineGravityTitle}
        >
          <div className="special-training-risk-hud-gravity-head">
            <span>
              <em>{content.riskDisciplineGravityCurrentPriceHudLabel}</em>
              <strong>{riskGravityCurrentPriceDisplay}</strong>
            </span>
            <span>
              <em>{content.riskDisciplineGravityBreakevenHudLabel}</em>
              <strong>{riskGravityBreakevenPriceDisplay}</strong>
            </span>
          </div>
          <div
            className={`special-training-risk-hud-gravity-track is-${riskBreakevenTone}`}
            aria-hidden="true"
          >
            <span
              className="special-training-risk-hud-gravity-fill"
              style={{ width: `${riskGravityGapFillPercent}%` }}
            />
          </div>
          <div className="special-training-risk-hud-gravity-foot">
            <span
              className={`special-training-risk-hud-gravity-badge is-${riskBreakevenTone}`}
            >
              {riskBreakevenDistanceDisplay}
            </span>
          </div>
        </section>

        {riskHudMetricCards.map((card) => (
          <section
            key={card.id}
            className={`special-training-risk-hud-card special-training-risk-hud-card-metric is-${card.tone}`}
            aria-label={card.label}
          >
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </section>
        ))}
      </div>
    }
    leftPanelBodyClassName="special-training-risk-left-panel-body"
    rightPanelBodyClassName="right-panel-body special-training-right-panel-body special-training-lightning-panel-body special-training-risk-panel-body"
    rightPanelBody={
      <>
        <header
          className="special-training-lightning-status-panel special-training-risk-status-panel"
          aria-live="polite"
        >
          <div className="special-training-risk-console-meta">
            <div className="special-training-risk-status-banner-main">
              <span className="special-training-risk-status-mode">
                {activeModeTitle}
              </span>
            </div>
          </div>
          <div className="special-training-risk-mission-strip">
            <article className="special-training-lightning-status-card is-progress special-training-risk-mission-progress">
              <div className="special-training-risk-mission-progress-head">
                <span className="special-training-lightning-status-inline-label">
                  {content.trainingProgressLabel}
                </span>
                <strong className="special-training-lightning-status-inline-value">
                  {riskQuestionProgressValue}
                </strong>
              </div>
              <div
                className="special-training-lightning-progress-segments special-training-risk-progress-segments"
                aria-hidden="true"
              >
                {Array.from({
                  length: riskQuestionProgressSegmentCount,
                }).map((_, index) => (
                  <span
                    key={`special-training-risk-progress-segment-${index}`}
                    className={index < currentQuestionIndex + 1 ? "is-active" : ""}
                  />
                ))}
              </div>
            </article>
            <article
              className={`special-training-risk-mission-countdown is-${riskSurvivalTrackTone}`}
            >
              <span>{content.riskDisciplineRemainingActionableBarsLabel}</span>
              <strong>{riskRemainingBarsDisplay}</strong>
            </article>
          </div>
          <p className="special-training-live-guide special-training-risk-live-guide">
            {content.riskDisciplineLiveGuideText}
          </p>
        </header>

        <div className="special-training-lightning-panel-middle special-training-risk-panel-middle">
          <section
            className="special-training-lightning-result-card special-training-risk-panel-stage"
            aria-live="polite"
          >
            <div ref={riskPanelBodyRef} className="special-training-risk-panel-scroll">
              {submitErrorMessage ? (
                <p className="special-training-inline-hint">
                  {submitErrorMessage}
                </p>
              ) : null}

              <section className="special-training-risk-trade-card">
                <section
                  className={`special-training-risk-survival-hero is-${riskSurvivalCardTone}`}
                  aria-label={content.riskDisciplineSurvivalTitle}
                >
                  <div className="special-training-risk-survival-hero-head">
                    <span className="special-training-risk-section-label">
                      {content.riskDisciplineSurvivalTitle}
                    </span>
                  </div>
                  <div className="special-training-risk-survival-hero-main">
                    <span>{content.riskDisciplineCurrentAssetLabel}</span>
                    <strong>{riskCurrentAssetDisplay}</strong>
                  </div>
                  <div className="special-training-risk-survival-hero-floating">
                    <span>{riskFloatingLabel}</span>
                    <strong className={riskFloatingTone}>
                      {riskFloatingValueDisplay}
                    </strong>
                  </div>
                </section>

                <section className="special-training-risk-snapshot-grid">
                  {riskSnapshotItems.map((item) => (
                    <article
                      key={item.key}
                      className="special-training-risk-snapshot-card"
                    >
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </article>
                  ))}
                </section>

              </section>
            </div>
          </section>
        </div>

        <footer
          className={`special-training-lightning-panel-footer special-training-risk-footer ${
            questionSettledInTraining ? "is-post-settlement" : ""
          }`}
        >
          {questionSettledInTraining ? (
            <>
              {onCreateChallengeReviewNote ? (
                <Button
                  variant="ghost"
                  className="special-training-risk-note-card"
                  onClick={handleCreateChallengeReviewNote}
                  disabled={postSettlementActionsDisabled}
                  title={tt("appText.addChallengeNote")}
                  aria-label={tt("appText.addChallengeNote")}
                >
                  <span className="special-training-risk-note-card-copy">
                    <AppIcon
                      name="drawNote"
                      className="special-training-risk-note-card-icon"
                      aria-hidden="true"
                    />
                    <span className="special-training-risk-note-card-label">
                      {tt("appText.addChallengeNote")}
                    </span>
                  </span>
                </Button>
              ) : null}
              <div className="special-training-lightning-action-stack is-post-settlement">
                <SpecialTrainingActionButton
                  variant="default"
                  priority="secondary"
                  onClick={gotoNextQuestion}
                  disabled={postSettlementActionsDisabled}
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
                  disabled={postSettlementActionsDisabled}
                  title={`${content.trainingExitLabel} ${textSlash} ${content.fastArenaExitHotkeyLabel}`}
                  aria-label={`${content.trainingExitLabel} ${textSlash} ${content.fastArenaExitHotkeyLabel}`}
                  label={content.trainingExitLabel}
                  hotkey={content.fastArenaExitHotkeyLabel}
                />
              </div>
            </>
          ) : (
            <>
              {riskOrderTicket}

              <div className="special-training-control-grid special-training-control-grid-low-priority special-training-risk-footer-link-grid">
                <SpecialTrainingActionButton
                  variant="ghost"
                  priority="low-priority"
                  onClick={() => {
                    setRiskAutoplayEnabled(false);
                    void finalizeQuestion(false);
                  }}
                  disabled={completeDisabled}
                  single
                  icon={<VendorIcon name="check" aria-hidden="true" />}
                  label={content.controlCompleteLabel}
                />
                <SpecialTrainingActionButton
                  variant="ghost"
                  priority="low-priority"
                  onClick={() => {
                    setRiskAutoplayEnabled(false);
                    void finalizeQuestion(true);
                  }}
                  disabled={isQuestionLoading || !hasActiveQuestion}
                  single
                  icon={<VendorIcon name="x" aria-hidden="true" />}
                  label={content.controlAbandonLabel}
                />
              </div>
            </>
          )}
        </footer>
      </>
    }
  />
);
