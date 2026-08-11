// SPDX-License-Identifier: GPL-3.0-only

import { Router } from 'express';
import {
  getFreeReplayPrepReadModelController,
  getFreeReplayStartPointOverviewController,
  getFreeReplayStartReadinessController,
  getTrainingSummaryController,
  getTrainingResetDialogReadModelController,
  listFreeReplayPoolDefaultEnvironmentsController,
  resetAllTrainingController,
  resetSymbolTrainingController,
  setFreeReplayPoolDefaultEnvironmentController,
  startPreparedFreeReplaySessionController,
} from './trainingFreeReplayController.js';
import {
  archiveTrainingProjectFromSessionController,
  clearTrainingProjectsController,
  deleteTrainingProjectController,
  deleteTrainingProjectsController,
  getReplayReviewConsoleBundleController,
  getTrainingProjectController,
  getTrainingStatsController,
  getTrainingStatsSummaryController,
  listTrainingProjectsController,
  previewTrainingProjectSettlementFromSessionController,
  renameTrainingProjectController,
} from './trainingProjectsController.js';
import {
  clearSpecialTrainingHistoryController,
  createSpecialTrainingBankController,
  deleteSpecialTrainingBankController,
  discardSpecialTrainingChallengeController,
  estimateSpecialTrainingDurationController,
  getSpecialTrainingBankEditorReadModelController,
  executeSpecialTrainingChallengeActionController,
  getSpecialTrainingChallengeOrderQuoteController,
  getSpecialTrainingChallengeProgressController,
  getSpecialTrainingChallengeRuntimeController,
  setSpecialTrainingChallengeActivityController,
  getSpecialTrainingHistoryQuestionDetailController,
  getSpecialTrainingHistorySessionController,
  getSpecialTrainingStatsController,
  getSpecialTrainingStatsProjectDetailController,
  getSpecialTrainingStatsSummaryController,
  listSpecialTrainingBanksController,
  listSpecialTrainingHistoryController,
  previewSpecialTrainingQuestionBankController,
  previewSpecialTrainingQuestionBankDraftController,
  resetSpecialTrainingQuestionBankController,
  settleSpecialTrainingQuestionController,
  startSpecialTrainingChallengeController,
  submitSpecialTrainingChallengeDecisionController,
  updateSpecialTrainingBankController,
} from './trainingSpecialController.js';
import {
  buildOrderTicketCompletedController,
  buildOrderTicketLoadingController,
  buildOrderTicketRuntimeController,
  resolveOrderTicketVisibleController,
  buildRiskActionFactsController,
  buildRiskDisplayFactsController,
  buildRiskHolderReferenceController,
  buildRiskGravityFieldController,
  buildRiskSurvivalProgressController,
  buildRiskCostPriceController,
  buildRiskBreakevenPriceController,
  buildFastDecisionTrainingController,
  buildFastDecisionReviewDetailController,
  buildFastDecisionGaugeController,
  buildFastDecisionCapitalToneController,
  buildModePickerReadinessController,
  buildModePickerQuestionBankController,
  buildFastDecisionSessionReviewController,
  buildRiskDisciplineSessionReviewController,
  buildChallengeReviewSummaryChipsController,
  buildChallengeReviewNoteController,
  buildSessionReplayProjectController,
} from './specialTrainingReadModelController.js';

export const trainingRouter = Router();

trainingRouter.post('/training/free-replay/sessions/start', startPreparedFreeReplaySessionController);
trainingRouter.post('/training/free-replay/prep-read-model', getFreeReplayPrepReadModelController);
trainingRouter.post('/training/free-replay/start-readiness', getFreeReplayStartReadinessController);
trainingRouter.get('/training/free-replay/start-point-overview', getFreeReplayStartPointOverviewController);
trainingRouter.get('/training/free-replay/pool-default-environments', listFreeReplayPoolDefaultEnvironmentsController);
trainingRouter.put('/training/free-replay/pool-default-environments/:poolId', setFreeReplayPoolDefaultEnvironmentController);
trainingRouter.post('/training/reset-all', resetAllTrainingController);
trainingRouter.get('/training/summary', getTrainingSummaryController);
trainingRouter.post('/training/reset-symbol', resetSymbolTrainingController);
trainingRouter.post('/training/reset-dialog/read-model', getTrainingResetDialogReadModelController);

trainingRouter.get('/training/projects', listTrainingProjectsController);
trainingRouter.get('/training/projects/:id', getTrainingProjectController);
trainingRouter.get('/training/stats', getTrainingStatsController);
trainingRouter.get('/training/stats/summary', getTrainingStatsSummaryController);
trainingRouter.post('/training/review-console/bundle', getReplayReviewConsoleBundleController);

trainingRouter.post('/training/special/challenges/start', startSpecialTrainingChallengeController);
trainingRouter.delete('/training/special/challenges/:challengeId', discardSpecialTrainingChallengeController);
trainingRouter.get('/training/special/challenges/:challengeId/runtime', getSpecialTrainingChallengeRuntimeController);
trainingRouter.put('/training/special/challenges/:challengeId/activity', setSpecialTrainingChallengeActivityController);
trainingRouter.get('/training/special/challenges/:challengeId/progress', getSpecialTrainingChallengeProgressController);
trainingRouter.post('/training/special/challenges/:challengeId/order/quote', getSpecialTrainingChallengeOrderQuoteController);
trainingRouter.post('/training/special/challenges/:challengeId/actions', executeSpecialTrainingChallengeActionController);
trainingRouter.post('/training/special/challenges/:challengeId/decision', submitSpecialTrainingChallengeDecisionController);
trainingRouter.post('/training/special/estimate', estimateSpecialTrainingDurationController);
trainingRouter.get('/training/special/banks', listSpecialTrainingBanksController);
trainingRouter.post('/training/special/banks', createSpecialTrainingBankController);
trainingRouter.patch('/training/special/banks/:bankId', updateSpecialTrainingBankController);
trainingRouter.delete('/training/special/banks/:bankId', deleteSpecialTrainingBankController);
trainingRouter.post('/training/special/bank-editor/read-model', getSpecialTrainingBankEditorReadModelController);
trainingRouter.post('/training/special/question-bank/preview', previewSpecialTrainingQuestionBankController);
trainingRouter.post('/training/special/question-bank/draft-preview', previewSpecialTrainingQuestionBankDraftController);
trainingRouter.post('/training/special/question-bank/reset', resetSpecialTrainingQuestionBankController);
trainingRouter.post('/training/special/challenges/:challengeId/questions/:questionId/settle', settleSpecialTrainingQuestionController);
trainingRouter.get('/training/special/history', listSpecialTrainingHistoryController);
trainingRouter.get('/training/special/stats', getSpecialTrainingStatsController);
trainingRouter.get('/training/special/stats/summary', getSpecialTrainingStatsSummaryController);
trainingRouter.get('/training/special/stats/details/:projectId', getSpecialTrainingStatsProjectDetailController);
trainingRouter.post('/training/special/history/clear', clearSpecialTrainingHistoryController);
trainingRouter.get('/training/special/history/questions/:questionId', getSpecialTrainingHistoryQuestionDetailController);
trainingRouter.get('/training/special/history/:sessionId', getSpecialTrainingHistorySessionController);

trainingRouter.post('/training/projects/archive-session', archiveTrainingProjectFromSessionController);
trainingRouter.post('/training/projects/archive-session/preview', previewTrainingProjectSettlementFromSessionController);
trainingRouter.patch('/training/projects/:id', renameTrainingProjectController);
trainingRouter.delete('/training/projects/:id', deleteTrainingProjectController);
trainingRouter.post('/training/projects/bulk-delete', deleteTrainingProjectsController);
trainingRouter.post('/training/projects/clear-all', clearTrainingProjectsController);

// Special training read model endpoints
trainingRouter.post('/training/special/read-model/order-ticket/completed', buildOrderTicketCompletedController);
trainingRouter.post('/training/special/read-model/order-ticket/runtime', buildOrderTicketRuntimeController);
trainingRouter.post('/training/special/read-model/order-ticket/loading', buildOrderTicketLoadingController);
trainingRouter.post('/training/special/read-model/order-ticket/visible', resolveOrderTicketVisibleController);
trainingRouter.post('/training/special/read-model/risk/action-facts', buildRiskActionFactsController);
trainingRouter.post('/training/special/read-model/risk/display-facts', buildRiskDisplayFactsController);
trainingRouter.post('/training/special/read-model/risk/holder-reference', buildRiskHolderReferenceController);
trainingRouter.post('/training/special/read-model/risk/gravity-field', buildRiskGravityFieldController);
trainingRouter.post('/training/special/read-model/risk/survival-progress', buildRiskSurvivalProgressController);
trainingRouter.post('/training/special/read-model/risk/cost-price', buildRiskCostPriceController);
trainingRouter.post('/training/special/read-model/risk/breakeven-price', buildRiskBreakevenPriceController);
trainingRouter.post('/training/special/read-model/fast-decision/training', buildFastDecisionTrainingController);
trainingRouter.post('/training/special/read-model/fast-decision/review-detail', buildFastDecisionReviewDetailController);
trainingRouter.post('/training/special/read-model/fast-decision/gauge', buildFastDecisionGaugeController);
trainingRouter.post('/training/special/read-model/fast-decision/capital-tone', buildFastDecisionCapitalToneController);
trainingRouter.post('/training/special/read-model/mode-picker/readiness', buildModePickerReadinessController);
trainingRouter.post('/training/special/read-model/mode-picker/question-bank', buildModePickerQuestionBankController);
trainingRouter.post('/training/special/read-model/session-review/fast-decision', buildFastDecisionSessionReviewController);
trainingRouter.post('/training/special/read-model/session-review/risk-discipline', buildRiskDisciplineSessionReviewController);
trainingRouter.post('/training/special/read-model/session-review/summary-chips', buildChallengeReviewSummaryChipsController);
trainingRouter.post('/training/special/read-model/session-review/review-note', buildChallengeReviewNoteController);
trainingRouter.post('/training/special/read-model/session-review/replay-project', buildSessionReplayProjectController);
