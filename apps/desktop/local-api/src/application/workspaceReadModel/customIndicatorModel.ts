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
  toArray,
  toRecord,
} from '../workspaceReadModelPrimitives.js';

import { buildCustomIndicatorSystemDefaultsReadModel } from '../customIndicatorEngine/indicator/systemDefaults.js';
import {
  buildCustomIndicatorProfileStorageFacts,
  type CustomIndicatorProfileStorageFactInput,
} from '../customIndicatorEngine/indicator/profileFacts.js';
import { buildCustomIndicatorValidationFacts } from '../customIndicatorEngine/indicator/validationReadModel.js';
import {
  getFutuCapabilityEntries,
  getFutuDataScopeBlockedFunctions,
  getFutuSupportCategoryIndex,
  getFutuSupportCoverage,
} from '../customIndicatorEngine/futu/futuSupportMatrix.js';

import {
  summarizeDataSourceRows,
} from './dataSourceFacts.js';

export const buildCustomIndicatorModel = async (
  deps: WorkspaceReadModelDependencies,
): Promise<DesktopWorkspaceReadModel> => {
  const [profiles, localDataSources, validationInstruments] = await Promise.all([
    deps.listCustomIndicatorProfiles(),
    deps.listLocalDataSources(),
    // The selector is a pure catalog read. The selected chart frame performs
    // its own readiness check before reading market bars.
    deps.listInstruments({ limit: 3000 }),
  ]);
  const profileRows = toArray(profiles) as CustomIndicatorProfileStorageFactInput[];
  const dataFacts = summarizeDataSourceRows(localDataSources);
  const profileValidationFacts =
    buildCustomIndicatorProfileStorageFacts(profileRows);
  const canCreateProfile =
    !profileValidationFacts.limitExceeded &&
    !profileValidationFacts.bytesLimitExceeded;
  const createProfileReasonCode = canCreateProfile
    ? null
    : 'CUSTOM_INDICATOR_LOCAL_STORAGE_LIMIT';
  const validationFacts = buildCustomIndicatorValidationFacts({
    instruments: validationInstruments,
    localDataSources,
  });
  const validationReady = Boolean(validationFacts.defaultInstrumentId);
  const validationReadiness = {
    statusCode: validationReady ? 'READY' : 'EMPTY',
    reasonCode: validationReady ? null : 'CUSTOM_INDICATOR_VALIDATION_DATA_EMPTY',
    readySourceCount: dataFacts.readySourceCount,
    sourceCount: dataFacts.sourceCount,
    symbolCount: dataFacts.symbolCount,
    defaultInstrumentId: validationFacts.defaultInstrumentId,
  };
  return createModel({
    deps,
    workspaceId: 'custom-indicator',
    statusCode: profileRows.length > 0 ? 'READY' : 'EMPTY',
    reasonCode: profileRows.length > 0 ? null : 'NO_CUSTOM_INDICATOR_PROFILE',
    tone: profileRows.length > 0 ? 'ready' : 'neutral',
    priority: 30,
    facts: {
      profileCount: profileRows.length,
      profileStorage: profileValidationFacts,
      profiles: profileRows.map((profile) => {
        const row = toRecord(profile);
        return {
          id: row.id,
          name: row.name,
          updatedAt: row.updatedAt ?? null,
        };
      }),
      systemDefaults: buildCustomIndicatorSystemDefaultsReadModel(),
      futuSupport: {
        capabilities: getFutuCapabilityEntries(),
        categoryIndex: getFutuSupportCategoryIndex(),
        coverage: getFutuSupportCoverage(),
        dataScopeBlockedFunctions: getFutuDataScopeBlockedFunctions(),
      },
      validationData: {
        readySourceCount: dataFacts.readySourceCount,
        sourceCount: dataFacts.sourceCount,
        symbolCount: dataFacts.symbolCount,
        barCount: dataFacts.barCount,
        sourceStatusById: dataFacts.sourceStatusById,
        readiness: validationReadiness,
        ...validationFacts,
      },
    },
    actions: [
      createAction({
        id: 'create-profile',
        enabled: canCreateProfile,
        reasonCode: createProfileReasonCode,
        priority: 10,
        facts: {
          validation: {
            profile: profileValidationFacts,
          },
        },
      }),
      createAction({
        id: 'edit-profile',
        enabled: profileRows.length > 0,
        reasonCode: profileRows.length > 0 ? null : 'NO_CUSTOM_INDICATOR_PROFILE',
        priority: 20,
        facts: {
          validation: {
            profile: profileValidationFacts,
          },
        },
      }),
    ],
  });
};
