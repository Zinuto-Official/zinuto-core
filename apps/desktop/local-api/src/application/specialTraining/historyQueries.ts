// SPDX-License-Identifier: GPL-3.0-only

import { appError } from '../../kernel/appError.js';
import type { ListSpecialTrainingHistorySessionsPayload } from '../../domain/specialTraining/contracts.js';
import {
  getSpecialTrainingHistoryQuestionDetailById,
  getSpecialTrainingHistorySessionById,
  listSpecialTrainingHistorySessions,
  type SpecialTrainingHistoryQuestionDetail,
  type SpecialTrainingHistorySessionDetail,
  type SpecialTrainingHistorySessionSummary,
} from '../ports/infrastructure/db/specialTraining/historyStore.js';

export const listPersistedSpecialTrainingHistorySessions = (
  payload: ListSpecialTrainingHistorySessionsPayload = {},
): SpecialTrainingHistorySessionSummary[] =>
  listSpecialTrainingHistorySessions({
    modeId: payload.modeId,
    limit: payload.limit,
  });

export const getPersistedSpecialTrainingHistorySession = async (
  sessionId: string,
): Promise<SpecialTrainingHistorySessionDetail> => {
  const detail = await getSpecialTrainingHistorySessionById(sessionId);
  if (!detail) {
    throw appError('SPECIAL_TRAINING_HISTORY_SESSION_NOT_FOUND');
  }
  return detail;
};

export const getPersistedSpecialTrainingHistoryQuestionDetail = async (
  questionId: string,
): Promise<SpecialTrainingHistoryQuestionDetail> => {
  const detail = await getSpecialTrainingHistoryQuestionDetailById(questionId);
  if (!detail) {
    throw appError('SPECIAL_TRAINING_QUESTION_NOT_FOUND');
  }
  return detail;
};
