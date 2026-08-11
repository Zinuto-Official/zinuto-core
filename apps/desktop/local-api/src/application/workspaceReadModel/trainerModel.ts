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
} from '../workspaceReadModelPrimitives.js';

import { buildTrainerTradingFormFacts } from '../trading/tradingFormFacts.js';
import { buildTrainerWorkspaceTradingReadModel } from '../trading/sessionReadModel.js';

import {
  summarizeDataSources,
  resolveDataReadiness,
  dataSourceSection,
} from './dataSourceFacts.js';

export const buildTrainerModel = async (
  deps: WorkspaceReadModelDependencies,
): Promise<DesktopWorkspaceReadModel> => {
  const [dataFacts, resumableSession, portfolioSummary, tradingSettings] =
    await Promise.all([
      summarizeDataSources(deps),
      deps.getLatestResumableSession(),
      deps.getPortfolioSummary(),
      deps.getTradingSettings(),
    ]);
  const readiness = resolveDataReadiness(dataFacts);
  const tradingReadModel = buildTrainerWorkspaceTradingReadModel({
    dataFacts,
    resumableSession,
    portfolioSummary,
    tradingSettings,
  });
  const canStart = tradingReadModel.replayAvailability.canStart;
  const canResume = tradingReadModel.replayAvailability.canResume;
  return createModel({
    deps,
    workspaceId: 'trainer',
    statusCode: canStart ? 'READY' : readiness.statusCode,
    reasonCode: canStart ? null : readiness.reasonCode,
    tone: canStart ? 'ready' : readiness.tone,
    priority: canStart ? 20 : 90,
    facts: {
      data: dataFacts,
      hasResumableSession: canResume,
      portfolioSummary,
      tradingSettings,
      tradingForm: buildTrainerTradingFormFacts(),
      tradingReadModel,
      tradingFacts: tradingReadModel.tradingFacts,
      replayAvailability: tradingReadModel.replayAvailability,
      validation: tradingReadModel.validation,
      actionAvailability: tradingReadModel.actionAvailability,
      runConclusion: tradingReadModel.runConclusion,
    },
    actions: [
      createAction({
        id: 'start-session',
        enabled: canStart,
        reasonCode:
          tradingReadModel.actionAvailability.startSession.reasonCode,
        priority: 10,
        facts: tradingReadModel.actionAvailability.startSession.facts,
      }),
      createAction({
        id: 'resume-session',
        enabled: canResume,
        reasonCode:
          tradingReadModel.actionAvailability.resumeSession.reasonCode,
        priority: 20,
        facts: tradingReadModel.actionAvailability.resumeSession.facts,
      }),
    ],
    sections: [
      dataSourceSection(dataFacts),
      createSection({
        id: 'session',
        statusCode: canResume ? 'RESUMABLE' : 'EMPTY',
        reasonCode: canResume ? null : 'NO_RESUMABLE_SESSION',
        tone: canResume ? 'ready' : 'neutral',
        priority: canResume ? 20 : 60,
        facts: {
          resumableSession,
        },
      }),
    ],
  });
};
