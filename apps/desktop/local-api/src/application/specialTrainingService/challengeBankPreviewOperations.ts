// SPDX-License-Identifier: GPL-3.0-only

import {
  previewSpecialTrainingQuestionBank as previewSpecialTrainingQuestionBankCore,
  previewSpecialTrainingQuestionBankDraft as previewSpecialTrainingQuestionBankDraftCore,
  previewSpecialTrainingQuestionBankWithAccess as previewSpecialTrainingQuestionBankWithAccessCore,
  resetSpecialTrainingQuestionBank as resetSpecialTrainingQuestionBankCore,
} from '../specialTraining/questionBankPreview.js';
import { cleanupExpiredChallenges } from './challengeRuntimeRegistry.js';
import type {
  SpecialTrainingQuestionBankDraftPreviewPayload,
  SpecialTrainingQuestionBankPreviewPayload,
  SpecialTrainingQuestionBankResetPayload,
  SpecialTrainingQuestionBankSummary,
} from '../../domain/specialTraining/contracts.js';

export const previewSpecialTrainingQuestionBank = async (
  payload: SpecialTrainingQuestionBankPreviewPayload,
): Promise<SpecialTrainingQuestionBankSummary> =>
  previewSpecialTrainingQuestionBankCore(payload, {
    beforePreview: cleanupExpiredChallenges,
  });

export const previewSpecialTrainingQuestionBankWithAccess = async (
  payload: SpecialTrainingQuestionBankPreviewPayload,
): Promise<SpecialTrainingQuestionBankSummary> =>
  previewSpecialTrainingQuestionBankWithAccessCore(payload, {
    beforePreview: cleanupExpiredChallenges,
  });

export const previewSpecialTrainingQuestionBankDraft = async (
  payload: SpecialTrainingQuestionBankDraftPreviewPayload,
): ReturnType<typeof previewSpecialTrainingQuestionBankDraftCore> =>
  previewSpecialTrainingQuestionBankDraftCore(payload, {
    beforePreview: cleanupExpiredChallenges,
  });

export const resetSpecialTrainingQuestionBank = async (
  payload: SpecialTrainingQuestionBankResetPayload,
): Promise<SpecialTrainingQuestionBankSummary> => {
  cleanupExpiredChallenges();
  return resetSpecialTrainingQuestionBankCore(payload);
};
