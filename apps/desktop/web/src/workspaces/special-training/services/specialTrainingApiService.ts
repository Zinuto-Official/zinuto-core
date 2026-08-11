// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import { api } from "@/api";

type SpecialTrainingQuestionBankPayload = {
  bankId: string;
  modeId: Parameters<typeof api.previewSpecialTrainingQuestionBank>[0]["modeId"];
  questionCount?: number;
  horizonBars?: number;
  previousSummary?: {
    scopeHash?: string | null;
    poolCount?: number | null;
    instrumentCount?: number | null;
    symbolCount?: number | null;
    totalQuestionCount?: number | null;
    completedQuestionCount?: number | null;
  } | null;
  activeSession?: {
    hasLiveChallengeSession?: boolean | null;
    modeId?: Parameters<typeof api.previewSpecialTrainingQuestionBank>[0]["modeId"] | null;
    scopeHash?: string | null;
  } | null;
};

type SpecialTrainingStartPayload = {
  bankId: string;
  modeId: Parameters<typeof api.startSpecialTrainingChallenge>[0]["modeId"];
  questionCount: number;
  horizonBars?: number;
  decisionSecondsLimit?: number;
  fastDecisionStrictnessLevel?: Parameters<
    typeof api.startSpecialTrainingChallenge
  >[0]["fastDecisionStrictnessLevel"];
};

type SpecialTrainingBankPayload = {
  name: string;
  assetClass: "STOCK" | "FUTURES" | "FOREX" | "CRYPTO";
  targetTimeframe: BaseTimeframe;
  poolIds: string[];
};

export const listSpecialTrainingBanks = (
  payload?: Parameters<typeof api.listSpecialTrainingBanks>[0],
  options?: Parameters<typeof api.listSpecialTrainingBanks>[1],
) => api.listSpecialTrainingBanks(payload, options);

export const createSpecialTrainingBank = (
  payload: SpecialTrainingBankPayload,
  options?: Parameters<typeof api.createSpecialTrainingBank>[1],
) => api.createSpecialTrainingBank(payload, options);

export const updateSpecialTrainingBank = (
  bankId: string,
  payload: SpecialTrainingBankPayload,
  options?: Parameters<typeof api.updateSpecialTrainingBank>[2],
) => api.updateSpecialTrainingBank(bankId, payload, options);

export const deleteSpecialTrainingBank = (
  bankId: string,
  options?: Parameters<typeof api.deleteSpecialTrainingBank>[1],
) => api.deleteSpecialTrainingBank(bankId, options);

export const startSpecialTrainingChallenge = (
  payload: SpecialTrainingStartPayload,
  options?: Parameters<typeof api.startSpecialTrainingChallenge>[1],
) => api.startSpecialTrainingChallenge(payload, options);

export const discardSpecialTrainingChallenge = (
  challengeId: Parameters<typeof api.discardSpecialTrainingChallenge>[0],
  options?: Parameters<typeof api.discardSpecialTrainingChallenge>[1],
) => api.discardSpecialTrainingChallenge(challengeId, options);

export const previewSpecialTrainingQuestionBank = (
  payload: SpecialTrainingQuestionBankPayload,
  options?: Parameters<typeof api.previewSpecialTrainingQuestionBank>[1],
) =>
  api.previewSpecialTrainingQuestionBank(
    payload as Parameters<typeof api.previewSpecialTrainingQuestionBank>[0],
    options,
  );

export const previewSpecialTrainingQuestionBankDraft = (
  payload: Parameters<typeof api.previewSpecialTrainingQuestionBankDraft>[0],
  options?: Parameters<typeof api.previewSpecialTrainingQuestionBankDraft>[1],
) => api.previewSpecialTrainingQuestionBankDraft(payload, options);

export const getSpecialTrainingBankEditorReadModel = (
  payload: Parameters<typeof api.getSpecialTrainingBankEditorReadModel>[0],
  options?: Parameters<typeof api.getSpecialTrainingBankEditorReadModel>[1],
) => api.getSpecialTrainingBankEditorReadModel(payload, options);

export const resetSpecialTrainingQuestionBank = (
  payload: SpecialTrainingQuestionBankPayload,
  options?: Parameters<typeof api.resetSpecialTrainingQuestionBank>[1],
) =>
  api.resetSpecialTrainingQuestionBank(
    payload as Parameters<typeof api.resetSpecialTrainingQuestionBank>[0],
    options,
  );

export const settleSpecialTrainingQuestion = (
  challengeId: Parameters<typeof api.settleSpecialTrainingQuestion>[0],
  questionId: Parameters<typeof api.settleSpecialTrainingQuestion>[1],
  payload: Parameters<typeof api.settleSpecialTrainingQuestion>[2],
  options?: Parameters<typeof api.settleSpecialTrainingQuestion>[3],
) =>
  api.settleSpecialTrainingQuestion(challengeId, questionId, payload, options);

export const getSpecialTrainingChallengeRuntime = (
  challengeId: Parameters<typeof api.getSpecialTrainingChallengeRuntime>[0],
  options?: Parameters<typeof api.getSpecialTrainingChallengeRuntime>[1],
) => api.getSpecialTrainingChallengeRuntime(challengeId, options);

export const setSpecialTrainingChallengeActivity = (
  challengeId: Parameters<typeof api.setSpecialTrainingChallengeActivity>[0],
  paused: Parameters<typeof api.setSpecialTrainingChallengeActivity>[1],
  options?: Parameters<typeof api.setSpecialTrainingChallengeActivity>[2],
) => api.setSpecialTrainingChallengeActivity(challengeId, paused, options);

export const getSpecialTrainingChallengeProgress = (
  challengeId: Parameters<typeof api.getSpecialTrainingChallengeProgress>[0],
  options?: Parameters<typeof api.getSpecialTrainingChallengeProgress>[1],
) => api.getSpecialTrainingChallengeProgress(challengeId, options);

export const getSpecialTrainingChallengeOrderQuote = (
  challengeId: Parameters<typeof api.getSpecialTrainingChallengeOrderQuote>[0],
  payload: Parameters<typeof api.getSpecialTrainingChallengeOrderQuote>[1],
  options?: Parameters<typeof api.getSpecialTrainingChallengeOrderQuote>[2],
) => api.getSpecialTrainingChallengeOrderQuote(challengeId, payload, options);

export const executeSpecialTrainingChallengeAction = (
  challengeId: Parameters<typeof api.executeSpecialTrainingChallengeAction>[0],
  payload: Parameters<typeof api.executeSpecialTrainingChallengeAction>[1],
  options?: Parameters<typeof api.executeSpecialTrainingChallengeAction>[2],
) => api.executeSpecialTrainingChallengeAction(challengeId, payload, options);

export const submitSpecialTrainingChallengeDecision = (
  challengeId: Parameters<typeof api.submitSpecialTrainingChallengeDecision>[0],
  payload: Parameters<typeof api.submitSpecialTrainingChallengeDecision>[1],
  options?: Parameters<typeof api.submitSpecialTrainingChallengeDecision>[2],
) => api.submitSpecialTrainingChallengeDecision(challengeId, payload, options);
