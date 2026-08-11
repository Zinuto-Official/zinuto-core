// SPDX-License-Identifier: GPL-3.0-only

import type { Request, Response } from 'express';
import {
  clearSpecialTrainingHistory,
  getSpecialTrainingStatsProjectDetail,
  getSpecialTrainingStatsReport,
  getSpecialTrainingStatsSummary,
} from '../application/specialTrainingStatsService.js';
import { estimateSpecialTrainingDuration } from '../application/specialTrainingDurationEstimateService.js';
import { resolveSpecialTrainingBankEditorReadModel } from '../application/specialTraining/bankEditorReadModel.js';
import {
  createSpecialTrainingBankWithAccess as createSpecialTrainingBankService,
  deleteSpecialTrainingBank as deleteSpecialTrainingBankService,
  discardSpecialTrainingChallenge,
  executeSpecialTrainingChallengeAction,
  getSpecialTrainingChallengeOrderQuote,
  getSpecialTrainingChallengeProgress,
  getSpecialTrainingChallengeRuntime,
  setSpecialTrainingChallengeActivity,
  getPersistedSpecialTrainingHistoryQuestionDetail,
  getPersistedSpecialTrainingHistorySession,
  listSpecialTrainingBanksPage,
  previewSpecialTrainingQuestionBankDraftWithAccess as previewSpecialTrainingQuestionBankDraft,
  listPersistedSpecialTrainingHistorySessions,
  previewSpecialTrainingQuestionBankWithAccess as previewSpecialTrainingQuestionBank,
  resetSpecialTrainingQuestionBank,
  settleSpecialTrainingQuestion,
  submitSpecialTrainingChallengeDecision,
  startSpecialTrainingChallengeWithAccess as startSpecialTrainingChallenge,
  updateSpecialTrainingBankWithAccess as updateSpecialTrainingBankService,
} from '../application/specialTrainingService.js';
import {
  specialTrainingBankCreateSchema,
  specialTrainingBankEditorReadModelSchema,
  specialTrainingBankListQuerySchema,
  specialTrainingBankUpdateSchema,
  specialTrainingChallengeActionSchema,
  specialTrainingChallengeActivitySchema,
  specialTrainingChallengeOrderQuoteSchema,
  specialTrainingChallengeStartSchema,
  specialTrainingDecisionSchema,
  specialTrainingDurationEstimateSchema,
  specialTrainingHistoryClearSchema,
  specialTrainingHistoryQuerySchema,
  specialTrainingQuestionBankDraftPreviewSchema,
  specialTrainingQuestionBankPreviewSchema,
  specialTrainingQuestionBankResetSchema,
  specialTrainingQuestionSettleSchema,
  specialTrainingStatsQuerySchema,
} from './apiSchemas.js';
import { ok } from './response.js';
import { parseRouteId } from './routeParams.js';

export const startSpecialTrainingChallengeController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = specialTrainingChallengeStartSchema.parse(req.body ?? {});
  res.json(ok(await startSpecialTrainingChallenge(payload)));
};

export const discardSpecialTrainingChallengeController = (
  req: Request,
  res: Response,
): void => {
  res.json(ok(discardSpecialTrainingChallenge(parseRouteId(req.params.challengeId))));
};

export const getSpecialTrainingChallengeRuntimeController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await getSpecialTrainingChallengeRuntime(parseRouteId(req.params.challengeId))));
};

export const setSpecialTrainingChallengeActivityController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const challengeId = parseRouteId(req.params.challengeId);
  const payload = specialTrainingChallengeActivitySchema.parse(req.body ?? {});
  res.json(
    ok(await setSpecialTrainingChallengeActivity(challengeId, payload.paused)),
  );
};

export const getSpecialTrainingChallengeProgressController = (
  req: Request,
  res: Response,
): void => {
  res.json(ok(getSpecialTrainingChallengeProgress(parseRouteId(req.params.challengeId))));
};

export const getSpecialTrainingChallengeOrderQuoteController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const challengeId = parseRouteId(req.params.challengeId);
  const payload = specialTrainingChallengeOrderQuoteSchema.parse(req.body ?? {});
  res.json(ok(await getSpecialTrainingChallengeOrderQuote(challengeId, payload)));
};

export const executeSpecialTrainingChallengeActionController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const challengeId = parseRouteId(req.params.challengeId);
  const payload = specialTrainingChallengeActionSchema.parse(req.body ?? {});
  res.json(ok(await executeSpecialTrainingChallengeAction(challengeId, payload)));
};

export const submitSpecialTrainingChallengeDecisionController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const challengeId = parseRouteId(req.params.challengeId);
  const payload = specialTrainingDecisionSchema.parse(req.body ?? {});
  res.json(ok(await submitSpecialTrainingChallengeDecision(challengeId, payload)));
};

export const estimateSpecialTrainingDurationController = (
  req: Request,
  res: Response,
): void => {
  const payload = specialTrainingDurationEstimateSchema.parse(req.body ?? {});
  res.json(ok(estimateSpecialTrainingDuration(payload)));
};

export const listSpecialTrainingBanksController = (
  req: Request,
  res: Response,
): void => {
  const query = specialTrainingBankListQuerySchema.parse(req.query ?? {});
  res.json(ok(listSpecialTrainingBanksPage(query)));
};

export const createSpecialTrainingBankController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = specialTrainingBankCreateSchema.parse(req.body ?? {});
  res.json(ok(await createSpecialTrainingBankService(payload)));
};

export const updateSpecialTrainingBankController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const bankId = parseRouteId(req.params.bankId);
  const payload = specialTrainingBankUpdateSchema.parse(req.body ?? {});
  res.json(ok(await updateSpecialTrainingBankService(bankId, payload)));
};

export const deleteSpecialTrainingBankController = (
  req: Request,
  res: Response,
): void => {
  res.json(ok(deleteSpecialTrainingBankService(parseRouteId(req.params.bankId))));
};

export const getSpecialTrainingBankEditorReadModelController = (
  req: Request,
  res: Response,
): void => {
  const payload = specialTrainingBankEditorReadModelSchema.parse(req.body ?? {});
  res.json(ok(resolveSpecialTrainingBankEditorReadModel(payload)));
};

export const previewSpecialTrainingQuestionBankController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = specialTrainingQuestionBankPreviewSchema.parse(req.body ?? {});
  res.json(ok(await previewSpecialTrainingQuestionBank(payload)));
};

export const previewSpecialTrainingQuestionBankDraftController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = specialTrainingQuestionBankDraftPreviewSchema.parse(req.body ?? {});
  res.json(ok(await previewSpecialTrainingQuestionBankDraft(payload)));
};

export const resetSpecialTrainingQuestionBankController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = specialTrainingQuestionBankResetSchema.parse(req.body ?? {});
  res.json(ok(await resetSpecialTrainingQuestionBank(payload)));
};

export const settleSpecialTrainingQuestionController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const challengeId = parseRouteId(req.params.challengeId);
  const questionId = parseRouteId(req.params.questionId);
  const payload = specialTrainingQuestionSettleSchema.parse(req.body ?? {});
  res.json(ok(await settleSpecialTrainingQuestion(challengeId, questionId, payload)));
};

export const listSpecialTrainingHistoryController = (
  req: Request,
  res: Response,
): void => {
  const query = specialTrainingHistoryQuerySchema.parse(req.query ?? {});
  res.json(ok(listPersistedSpecialTrainingHistorySessions(query)));
};

export const getSpecialTrainingStatsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const query = specialTrainingStatsQuerySchema.parse(req.query ?? {});
  res.json(ok(await getSpecialTrainingStatsReport(query)));
};

export const getSpecialTrainingStatsSummaryController = (
  req: Request,
  res: Response,
): void => {
  const query = specialTrainingStatsQuerySchema.parse(req.query ?? {});
  res.json(ok(getSpecialTrainingStatsSummary(query)));
};

export const getSpecialTrainingStatsProjectDetailController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await getSpecialTrainingStatsProjectDetail(parseRouteId(req.params.projectId))));
};

export const clearSpecialTrainingHistoryController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = specialTrainingHistoryClearSchema.parse(req.body ?? {});
  res.json(ok(await clearSpecialTrainingHistory(payload)));
};

export const getSpecialTrainingHistoryQuestionDetailController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await getPersistedSpecialTrainingHistoryQuestionDetail(parseRouteId(req.params.questionId))));
};

export const getSpecialTrainingHistorySessionController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await getPersistedSpecialTrainingHistorySession(parseRouteId(req.params.sessionId))));
};
