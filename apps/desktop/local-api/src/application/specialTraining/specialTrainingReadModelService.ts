// SPDX-License-Identifier: GPL-3.0-only

// Special Training Read Model Service
//
// This module is the main entry point for all special training read models.
// It re-exports individual read model builders from their respective modules.
//
// Architecture:
// - Read models produce "facts" — structured data that represents business state
// - The web layer consumes facts and maps them to UI display state (i18n, formatting, classNames)
// - All business logic (status, permissions, disabled reasons, summaries, validation,
//   action availability, run conclusions) lives here in local-api

export {
  buildCompletedOrderTicketDisplayFact,
  buildLoadingOrderTicketDisplayFact,
  buildRuntimeOrderTicketDisplayFact,
  resolveVisibleOrderTicketDisplayFact,
  type OrderTicketDisplayFact,
  type OrderTicketEstimateFact,
  type OrderTicketSideButtonFact,
} from './specialTrainingOrderTicketReadModel.js';

export {
  buildRiskActionFacts,
  buildRiskAccountBreakevenPrice,
  buildRiskCostPriceFacts,
  buildRiskDisplayFacts,
  buildRiskGravityFieldFact,
  buildRiskHolderReferenceFact,
  buildRiskSurvivalFact,
  buildRiskSurvivalProgressFact,
  type RiskActionFacts,
  type RiskActionStatusFact,
  type RiskBreakevenFact,
  type RiskDisplayFacts,
  type RiskFloatingFact,
  type RiskGravityFieldFact,
  type RiskHolderReferenceFact,
  type RiskPositionPressureFact,
  type RiskRealityCheckFact,
  type RiskSurvivalFact,
  type RiskUndoActionStatusFact,
} from './specialTrainingRiskDisciplineReadModel.js';

export {
  buildFastDecisionCapitalToneFact,
  buildFastDecisionGaugeFact,
  buildFastDecisionReviewDetailFact,
  buildFastDecisionReviewToneFact,
  buildFastDecisionSessionReviewMarketToneFact,
  buildFastDecisionSessionReviewToneFact,
  buildFastDecisionTrainingFacts,
  type FastDecisionChoice,
  type FastDecisionGaugeFact,
  type FastDecisionReviewDetailFact,
  type FastDecisionReviewToneFact,
  type FastDecisionSessionReviewMarketTone,
  type FastDecisionSessionReviewTone,
  type FastDecisionTrainingFacts,
} from './specialTrainingFastDecisionReadModel.js';

export {
  buildModePickerQuestionBankFact,
  buildModePickerReadinessFact,
  buildModePickerStartAvailabilityFact,
  type ModePickerNoticeTone,
  type ModePickerQuestionBankFact,
  type ModePickerQuestionBankStatusFact,
  type ModePickerReadinessFact,
  type ModePickerStartAvailabilityFact,
  type ModePickerStatusTone,
} from './specialTrainingModePickerReadModel.js';

export {
  buildChallengeReviewNoteFact,
  buildChallengeReviewSummaryChipFacts,
  buildFastDecisionSessionReviewItemFacts,
  buildRiskDisciplineSessionReviewItemFacts,
  buildSessionReplayProjectFact,
  type ChallengeReviewNoteFact,
  type ChallengeReviewSummaryChipFact,
  type FastDecisionSessionReviewItemFact,
  type RiskDisciplineSessionReviewItemFact,
  type SessionReplayProjectFact,
  type SessionReviewItemFact,
  type SessionReviewMarketTone,
  type SessionReviewTone,
} from './specialTrainingSessionReviewReadModel.js';
