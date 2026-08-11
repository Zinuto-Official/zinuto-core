// SPDX-License-Identifier: GPL-3.0-only

import { appError } from '../../kernel/appError.js';
import { assertReplayInstrumentReadAccess } from '../trainingDataAccessService.js';
import {
  createSpecialTrainingBank as createSpecialTrainingBankRecord,
  getSpecialTrainingBankById,
  listSpecialTrainingInstrumentIdsByPoolScope,
  resolveSpecialTrainingBankScopeSummary,
  updateSpecialTrainingBank as updateSpecialTrainingBankRecord,
} from './banks.js';
import type {
  CreateSpecialTrainingBankPayload,
  SpecialTrainingBankSummary,
  SpecialTrainingLedgerSourceTag,
  StartSpecialTrainingChallengePayload,
  UpdateSpecialTrainingBankPayload,
} from '../../domain/specialTraining/contracts.js';
import { normalizeSpecialTrainingBaseTimeframe } from '../../domain/specialTraining/timeframeSemantics.js';

export const assertSpecialTrainingPoolScopeAccess = async (
  poolIds: string[],
): Promise<string[]> => {
  const instrumentIds = listSpecialTrainingInstrumentIdsByPoolScope(poolIds);
  if (!instrumentIds.length) {
    throw appError('SPECIAL_TRAINING_SYMBOLS_REQUIRED');
  }
  for (const instrumentId of instrumentIds) {
    await assertReplayInstrumentReadAccess(instrumentId);
  }
  return instrumentIds;
};

export const createSpecialTrainingBank = createSpecialTrainingBankRecord;
export const updateSpecialTrainingBank = updateSpecialTrainingBankRecord;

export const createSpecialTrainingBankWithAccess = async (
  payload: CreateSpecialTrainingBankPayload,
): Promise<SpecialTrainingBankSummary> => {
  await assertSpecialTrainingPoolScopeAccess(payload.poolIds);
  return createSpecialTrainingBankRecord(payload);
};

export const updateSpecialTrainingBankWithAccess = async (
  bankId: string,
  payload: UpdateSpecialTrainingBankPayload,
): Promise<SpecialTrainingBankSummary> => {
  await assertSpecialTrainingPoolScopeAccess(payload.poolIds);
  return updateSpecialTrainingBankRecord(bankId, payload);
};

export const requireSpecialTrainingBank = (
  bankIdRaw: string,
): SpecialTrainingBankSummary => {
  const bank = getSpecialTrainingBankById(bankIdRaw);
  if (!bank) {
    throw appError('SPECIAL_TRAINING_BANK_NOT_FOUND');
  }
  return bank;
};

export const resolveChallengeBankFromPayload = (
  payload: StartSpecialTrainingChallengePayload,
  sourceTag: SpecialTrainingLedgerSourceTag,
): SpecialTrainingBankSummary => {
  const normalizedBankId = String(payload.bankId || '').trim();
  if (normalizedBankId) {
    return requireSpecialTrainingBank(normalizedBankId);
  }
  if (sourceTag !== 'SYSTEM_DEV_SIMULATION') {
    throw appError('SPECIAL_TRAINING_BANK_NOT_FOUND');
  }
  const targetTimeframe = normalizeSpecialTrainingBaseTimeframe(
    payload.timeframe,
  );
  if (!targetTimeframe) {
    throw appError('SPECIAL_TRAINING_BANK_NOT_FOUND');
  }
  return {
    id: payload.bankId,
    name: '',
    assetClass: 'STOCK',
    targetTimeframe,
    scope: {
      poolIds: [],
    },
    scopeSummary: resolveSpecialTrainingBankScopeSummary({
      targetTimeframe,
      poolIds: [],
    }),
    createdAt: '',
    updatedAt: '',
  };
};
