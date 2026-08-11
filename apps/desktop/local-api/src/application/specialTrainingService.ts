// SPDX-License-Identifier: GPL-3.0-only

/**
 * Barrel file — re-exports the special training service API from specialTrainingService/.
 * Split from the original monolith for maintainability.
 */
export {
  startSpecialTrainingChallengeWithAccess,
  stopSpecialTrainingChallengeRuntime,
  discardSpecialTrainingChallenge,
  getSpecialTrainingChallengeProgress,
  getSpecialTrainingFastDecisionQuestionSnapshot,
  getSpecialTrainingChallengeRuntime,
  setSpecialTrainingChallengeActivity,
  getSpecialTrainingChallengeOrderQuote,
  executeSpecialTrainingChallengeAction,
  submitSpecialTrainingChallengeDecision,
  startSpecialTrainingChallenge,
  previewSpecialTrainingQuestionBank,
  previewSpecialTrainingQuestionBankWithAccess,
  previewSpecialTrainingQuestionBankDraft,
  resetSpecialTrainingQuestionBank,
  settleSpecialTrainingQuestion,
} from './specialTrainingService/challengeOperations.js';

export type {
  SpecialTrainingFastDecisionQuestionSnapshot,
} from './specialTrainingService/challengeOperations.js';

export {
  deleteSpecialTrainingBank,
  ensureDefaultSpecialTrainingQuestionBankSeed,
  listSpecialTrainingBanks,
  listSpecialTrainingBanksPage,
} from './specialTraining/banks.js';

export {
  createSpecialTrainingBank,
  createSpecialTrainingBankWithAccess,
  updateSpecialTrainingBank,
  updateSpecialTrainingBankWithAccess,
} from './specialTraining/bankAccess.js';

export {
  getPersistedSpecialTrainingHistoryQuestionDetail,
  getPersistedSpecialTrainingHistorySession,
  listPersistedSpecialTrainingHistorySessions,
} from './specialTraining/historyQueries.js';

export {
  previewSpecialTrainingQuestionBankDraftWithAccess,
  shouldRestartSpecialTrainingScope,
} from './specialTraining/questionBankPreview.js';

export type {
  CreateSpecialTrainingBankPayload,
  DiscardSpecialTrainingChallengeResult,
  ListSpecialTrainingHistorySessionsPayload,
  ListSpecialTrainingBanksPayload,
  ListSpecialTrainingBanksResult,
  SettleSpecialTrainingQuestionPayload,
  SpecialTrainingBankSummary,
  SpecialTrainingChallengeCommandResult,
  SpecialTrainingChallengeActivityResult,
  SpecialTrainingChallengeProgress,
  SpecialTrainingChallengeRuntime,
  SpecialTrainingFastDecisionChoice,
  SpecialTrainingFastDecisionStrictnessLevel,
  SpecialTrainingFeedbackCode,
  SpecialTrainingLedgerSourceTag,
  SpecialTrainingModeId,
  SpecialTrainingOrderBlockReasonCode,
  SpecialTrainingOrderEstimate,
  SpecialTrainingOrderInputMode,
  SpecialTrainingOrderPriceMode,
  SpecialTrainingOrderQuote,
  SpecialTrainingOrderQuotePayload,
  SpecialTrainingPublicQuestion,
  SpecialTrainingQuestionBankDraftPreviewPayload,
  SpecialTrainingQuestionBankPreviewPayload,
  SpecialTrainingQuestionBankResetPayload,
  SpecialTrainingQuestionBankSummary,
  SpecialTrainingQuestionScopeState,
  SpecialTrainingQuestionSlot,
  SpecialTrainingQuestionState,
  SpecialTrainingRiskActionBlockReasonCode,
  SpecialTrainingRiskActionStatus,
  SpecialTrainingRiskActionState,
  SpecialTrainingRiskRuntimeBaseline,
  SpecialTrainingScopeRestartSignal,
  SpecialTrainingSettlementResult,
  SpecialTrainingTradeAction,
  SpecialTrainingTradeRuntimeState,
  StartSpecialTrainingChallengePayload,
  StartSpecialTrainingChallengeResult,
  UpdateSpecialTrainingBankPayload,
} from '../domain/specialTraining/contracts.js';
