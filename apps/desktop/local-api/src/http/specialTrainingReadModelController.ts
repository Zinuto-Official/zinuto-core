// SPDX-License-Identifier: GPL-3.0-only

import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from './response.js';
import {
  buildCompletedOrderTicketDisplayFact,
  buildLoadingOrderTicketDisplayFact,
  buildRuntimeOrderTicketDisplayFact,
  resolveVisibleOrderTicketDisplayFact,
  buildRiskActionFacts,
  buildRiskDisplayFacts,
  buildRiskHolderReferenceFact,
  buildRiskGravityFieldFact,
  buildRiskSurvivalProgressFact,
  buildRiskCostPriceFacts,
  buildRiskAccountBreakevenPrice,
  buildFastDecisionTrainingFacts,
  buildFastDecisionReviewDetailFact,
  buildFastDecisionGaugeFact,
  buildFastDecisionCapitalToneFact,
  buildModePickerReadinessFact,
  buildModePickerQuestionBankFact,
  buildFastDecisionSessionReviewItemFacts,
  buildRiskDisciplineSessionReviewItemFacts,
  buildChallengeReviewSummaryChipFacts,
  buildChallengeReviewNoteFact,
  buildSessionReplayProjectFact,
} from '../application/specialTraining/specialTrainingReadModelService.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const nullableNumber = z.number().finite().nullable();

const orderTicketCompletedSchema = z.object({
  requestKey: z.string(),
  questionId: z.string(),
  buyQuote: z.any(),
  sellQuote: z.any(),
  currentPrice: nullableNumber,
  buyBlockedReason: z.string().nullable().optional(),
  sellBlockedReason: z.string().nullable().optional(),
});

const orderTicketRuntimeSchema = z.object({
  requestKey: z.string(),
  questionId: z.string(),
  currentPrice: nullableNumber,
  buyEstimate: z.object({ qty: nullableNumber, cashEffect: nullableNumber }).nullable(),
  sellEstimate: z.object({ qty: nullableNumber, cashEffect: nullableNumber }).nullable(),
  buyBlockedReason: z.string().nullable().optional(),
  sellBlockedReason: z.string().nullable().optional(),
  nextOpenUnavailable: z.boolean(),
});

const orderTicketLoadingSchema = z.object({
  requestKey: z.string(),
  questionId: z.string(),
  currentPrice: nullableNumber,
});

const orderTicketVisibleSchema = z.object({
  fact: z.any().nullable(),
  lifecycleActive: z.boolean(),
  questionId: z.string().nullable(),
});

const riskActionFactsSchema = z.object({
  actionState: z.any().nullable(),
});

const riskDisplayFactsSchema = z.object({
  currentQuestionIndex: z.number().int().min(0),
  questionCount: z.number().int().min(1),
  runtime: z.any(),
  currentPrice: nullableNumber,
  currentTotalAsset: nullableNumber,
  floatingPnl: nullableNumber,
  remainingActionableRatio: z.number().min(0).max(1),
  remainingActionableBars: z.number().min(0),
  riskHolderReference: z.any().nullable(),
  gravityField: z.any().nullable(),
});

const riskHolderReferenceSchema = z.object({
  isRiskDisciplineMode: z.boolean(),
  riskBaseline: z.any().nullable(),
  currentPrice: nullableNumber,
  currentTotalAsset: nullableNumber,
  runtimeInitialCapital: z.number().finite(),
});

const riskGravityFieldSchema = z.object({
  breakevenPrice: nullableNumber,
  currentPrice: nullableNumber,
});

const riskSurvivalProgressSchema = z.object({
  isRiskDisciplineMode: z.boolean(),
  cursorIndex: z.number().int().min(0),
  questionStartIndex: z.number().int().min(0),
  questionEndIndex: z.number().int().min(0),
});

const riskCostPriceSchema = z.object({
  isRiskDisciplineMode: z.boolean(),
  runtime: z.any(),
  riskBaseline: z.any().nullable(),
});

const riskBreakevenPriceSchema = z.object({
  isRiskDisciplineMode: z.boolean(),
  runtime: z.any(),
});

const fastDecisionTrainingSchema = z.object({
  currentQuestionIndex: z.number().int().min(0),
  questionCount: z.number().int().min(1),
  completedCount: z.number().int().min(0),
  passCount: z.number().int().min(0),
  decisionCount: z.number().int().min(0),
  winRate: z.number().min(0).max(1),
  fastDecisionPhase: z.string(),
  directionResult: z.any().nullable(),
  resolvedReviewDetail: z.any().nullable(),
  activeFastDecisionDominanceRatio: z.number().finite(),
  settlement: z.any().nullable(),
  questionSettledInTraining: z.boolean(),
});

const fastDecisionReviewDetailSchema = z.object({
  directionResult: z.any().nullable(),
});

const fastDecisionGaugeSchema = z.object({
  reviewDetail: z.any().nullable(),
  dominanceRatio: z.number().finite(),
});

const fastDecisionCapitalToneSchema = z.object({
  totalPnl: nullableNumber,
});

const modePickerReadinessSchema = z.object({
  isQuestionLoading: z.boolean(),
  questionBankState: z.any(),
  selectedBank: z.any().nullable(),
  selectedBankMissingPoolIdsLength: z.number().int().min(0),
  activeQuestionCount: z.number().int().min(0),
});

const modePickerQuestionBankSchema = z.object({
  state: z.any(),
});

const fastDecisionSessionReviewSchema = z.object({
  settlements: z.array(z.any()),
  questions: z.array(z.any()),
});

const riskDisciplineSessionReviewSchema = z.object({
  settlements: z.array(z.any()),
  questions: z.array(z.any()),
  cursorIndexes: z.array(z.number().int().min(0).nullable()).optional(),
});

const challengeReviewSummaryChipsSchema = z.object({
  settlement: z.any().nullable(),
  riskReviewAlphaVsHold: nullableNumber,
  riskReviewAlphaVsHardStop: nullableNumber,
  activeFastDecisionDirectionResult: z.any().nullable(),
  resolvedFastDecisionReviewDetail: z.any().nullable(),
});

const challengeReviewNoteSchema = z.object({
  activeModeId: z.string().nullable(),
  activeQuestionId: z.string().nullable(),
  fastDecisionPhase: z.string(),
  activeFastDecisionDirectionResult: z.any().nullable(),
  settlement: z.any().nullable(),
  currentTotalAsset: nullableNumber,
  runtime: z.any(),
  currentPrice: nullableNumber,
});

const sessionReplayProjectSchema = z.object({
  selectedSessionReviewIndex: z.number().int().min(0).nullable(),
  selectedSessionReviewItem: z.any().nullable(),
  settlements: z.array(z.any()),
});

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

export const buildOrderTicketCompletedController = (req: Request, res: Response): void => {
  const payload = orderTicketCompletedSchema.parse(req.body);
  res.json(ok(buildCompletedOrderTicketDisplayFact(payload)));
};

export const buildOrderTicketRuntimeController = (req: Request, res: Response): void => {
  const payload = orderTicketRuntimeSchema.parse(req.body);
  res.json(ok(buildRuntimeOrderTicketDisplayFact(payload)));
};

export const buildOrderTicketLoadingController = (req: Request, res: Response): void => {
  const payload = orderTicketLoadingSchema.parse(req.body);
  res.json(ok(buildLoadingOrderTicketDisplayFact(payload)));
};

export const resolveOrderTicketVisibleController = (req: Request, res: Response): void => {
  const payload = orderTicketVisibleSchema.parse(req.body);
  res.json(ok(resolveVisibleOrderTicketDisplayFact(payload)));
};

export const buildRiskActionFactsController = (req: Request, res: Response): void => {
  const payload = riskActionFactsSchema.parse(req.body);
  res.json(ok(buildRiskActionFacts(payload.actionState)));
};

export const buildRiskDisplayFactsController = (req: Request, res: Response): void => {
  const payload = riskDisplayFactsSchema.parse(req.body);
  res.json(ok(buildRiskDisplayFacts(payload)));
};

export const buildRiskHolderReferenceController = (req: Request, res: Response): void => {
  const payload = riskHolderReferenceSchema.parse(req.body);
  res.json(ok(buildRiskHolderReferenceFact(payload)));
};

export const buildRiskGravityFieldController = (req: Request, res: Response): void => {
  const payload = riskGravityFieldSchema.parse(req.body);
  res.json(ok(buildRiskGravityFieldFact(payload)));
};

export const buildRiskSurvivalProgressController = (req: Request, res: Response): void => {
  const payload = riskSurvivalProgressSchema.parse(req.body);
  res.json(ok(buildRiskSurvivalProgressFact(payload)));
};

export const buildRiskCostPriceController = (req: Request, res: Response): void => {
  const payload = riskCostPriceSchema.parse(req.body);
  res.json(ok(buildRiskCostPriceFacts(payload)));
};

export const buildRiskBreakevenPriceController = (req: Request, res: Response): void => {
  const payload = riskBreakevenPriceSchema.parse(req.body);
  res.json(ok(buildRiskAccountBreakevenPrice(payload)));
};

export const buildFastDecisionTrainingController = (req: Request, res: Response): void => {
  const payload = fastDecisionTrainingSchema.parse(req.body);
  res.json(ok(buildFastDecisionTrainingFacts(payload)));
};

export const buildFastDecisionReviewDetailController = (req: Request, res: Response): void => {
  const payload = fastDecisionReviewDetailSchema.parse(req.body);
  res.json(ok(buildFastDecisionReviewDetailFact(payload)));
};

export const buildFastDecisionGaugeController = (req: Request, res: Response): void => {
  const payload = fastDecisionGaugeSchema.parse(req.body);
  res.json(ok(buildFastDecisionGaugeFact(payload)));
};

export const buildFastDecisionCapitalToneController = (req: Request, res: Response): void => {
  const payload = fastDecisionCapitalToneSchema.parse(req.body);
  res.json(ok(buildFastDecisionCapitalToneFact(payload.totalPnl)));
};

export const buildModePickerReadinessController = (req: Request, res: Response): void => {
  const payload = modePickerReadinessSchema.parse(req.body);
  res.json(ok(buildModePickerReadinessFact(payload)));
};

export const buildModePickerQuestionBankController = (req: Request, res: Response): void => {
  const payload = modePickerQuestionBankSchema.parse(req.body);
  res.json(ok(buildModePickerQuestionBankFact(payload)));
};

export const buildFastDecisionSessionReviewController = (req: Request, res: Response): void => {
  const payload = fastDecisionSessionReviewSchema.parse(req.body);
  res.json(ok(buildFastDecisionSessionReviewItemFacts(payload)));
};

export const buildRiskDisciplineSessionReviewController = (req: Request, res: Response): void => {
  const payload = riskDisciplineSessionReviewSchema.parse(req.body);
  res.json(ok(buildRiskDisciplineSessionReviewItemFacts(payload)));
};

export const buildChallengeReviewSummaryChipsController = (req: Request, res: Response): void => {
  const payload = challengeReviewSummaryChipsSchema.parse(req.body);
  res.json(ok(buildChallengeReviewSummaryChipFacts(payload)));
};

export const buildChallengeReviewNoteController = (req: Request, res: Response): void => {
  const payload = challengeReviewNoteSchema.parse(req.body);
  res.json(ok(buildChallengeReviewNoteFact(payload)));
};

export const buildSessionReplayProjectController = (req: Request, res: Response): void => {
  const payload = sessionReplayProjectSchema.parse(req.body);
  res.json(ok(buildSessionReplayProjectFact(payload)));
};
