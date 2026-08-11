// SPDX-License-Identifier: GPL-3.0-only

import type {
  DesktopWorkspaceReadModel,
} from '@zinuto/shared/contracts-desktop/api';

import type {
  WorkspaceReadModelDependencies,
} from '../workspaceReadModelPrimitives.js';
import {
  createAction,
  createModel,
  createSection,
  toArray,
  toRecord,
} from '../workspaceReadModelPrimitives.js';

import { buildSpecialTrainingModeParameterFactsById } from '../specialTraining/modeParameters.js';

import {
  summarizeDataSources,
  dataSourceSection,
} from './dataSourceFacts.js';

export const buildSpecialTrainingModel = async (
  deps: WorkspaceReadModelDependencies,
): Promise<DesktopWorkspaceReadModel> => {
  const [dataFacts, banksPage] = await Promise.all([
    summarizeDataSources(deps),
    deps.listSpecialTrainingBanksPage({ limit: 100 }),
  ]);
  const banks = toArray(toRecord(banksPage).items);
  const readyBanks = banks.filter(
    (bank) => String(toRecord(toRecord(bank).scopeSummary).status ?? '') === 'READY',
  );
  const repairRequiredBanks = banks.filter(
    (bank) => String(toRecord(toRecord(bank).scopeSummary).status ?? '') !== 'READY',
  );
  const canStart = readyBanks.length > 0;
  const statusCode = canStart
    ? 'READY'
    : banks.length > 0
      ? 'BLOCKED'
      : 'EMPTY';
  const reasonCode = canStart
    ? null
    : banks.length > 0
      ? 'QUESTION_BANK_NOT_READY'
      : 'NO_QUESTION_BANK';
  return createModel({
    deps,
    workspaceId: 'special-training',
    statusCode,
    reasonCode,
    tone: canStart ? 'ready' : 'warning',
    priority: canStart ? 20 : 90,
    facts: {
      data: dataFacts,
      bankCount: banks.length,
      readyBankCount: readyBanks.length,
      repairRequiredBankCount: repairRequiredBanks.length,
      modeParameterFactsById: buildSpecialTrainingModeParameterFactsById(),
    },
    actions: [
      createAction({
        id: 'start-challenge',
        enabled: canStart,
        reasonCode: canStart ? null : reasonCode,
        priority: 10,
      }),
      createAction({
        id: 'manage-question-banks',
        enabled: true,
        priority: 30,
      }),
      createAction({
        id: 'repair-question-bank',
        enabled: repairRequiredBanks.length > 0,
        reasonCode:
          repairRequiredBanks.length > 0 ? null : 'NO_QUESTION_BANK_REPAIR_REQUIRED',
        priority: 40,
      }),
    ],
    sections: [
      dataSourceSection(dataFacts),
      createSection({
        id: 'question-banks',
        statusCode,
        reasonCode,
        tone: canStart ? 'ready' : 'warning',
        priority: canStart ? 20 : 90,
        facts: {
          bankCount: banks.length,
          readyBankCount: readyBanks.length,
          repairRequiredBankCount: repairRequiredBanks.length,
          modeParameterFactsById: buildSpecialTrainingModeParameterFactsById(),
        },
      }),
    ],
  });
};
