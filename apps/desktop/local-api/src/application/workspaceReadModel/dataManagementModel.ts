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
  toRecord,
} from '../workspaceReadModelPrimitives.js';

import {
  summarizeDataSources,
  resolveDataReadiness,
  dataSourceSection,
} from './dataSourceFacts.js';

export const buildDataManagementModel = async (
  deps: WorkspaceReadModelDependencies,
): Promise<DesktopWorkspaceReadModel> => {
  const [dataFacts, storageUsage] = await Promise.all([
    summarizeDataSources(deps),
    deps.getSystemStorageUsage(),
  ]);
  const readiness = resolveDataReadiness(dataFacts);
  return createModel({
    deps,
    workspaceId: 'data-management',
    statusCode: readiness.statusCode,
    reasonCode: readiness.reasonCode,
    tone: readiness.tone,
    priority: readiness.statusCode === 'READY' ? 20 : 70,
    facts: {
      data: dataFacts,
      storageUsage,
    },
    actions: [
      createAction({
        id: 'import-data',
        enabled: true,
        priority: 10,
      }),
      createAction({
        id: 'clear-data',
        enabled: dataFacts.sourceCount > 0,
        reasonCode: dataFacts.sourceCount > 0 ? null : 'NO_DATA_SOURCE',
        priority: 80,
      }),
    ],
    sections: [
      dataSourceSection(dataFacts),
      createSection({
        id: 'storage',
        statusCode: 'READY',
        tone: 'ready',
        priority: 40,
        facts: toRecord(storageUsage),
      }),
    ],
  });
};
