// SPDX-License-Identifier: GPL-3.0-only

import {
  createAction,
  createModel,
  createSection,
  type WorkspaceReadModelDependencies,
} from '../workspaceReadModelPrimitives.js';
import { getNativeBatchBacktestRuntimeFacts } from '../backtest/nativeEngine.js';

export const buildStrategyBacktestModel = (
  deps: WorkspaceReadModelDependencies,
) => {
  const runtimeFacts = getNativeBatchBacktestRuntimeFacts();
  return createModel({
    deps,
    workspaceId: 'strategy-backtest',
    statusCode: 'READY',
    tone: 'ready',
    priority: 40,
    facts: {
      engine: runtimeFacts.engine,
      nativeBatchEnabled: runtimeFacts.nativeBatchEnabled,
      nativeEngineAvailable: runtimeFacts.nativeEngineAvailable,
      signalKeys: ['BUY', 'SELL', 'SHORT', 'COVER'],
      executionModes: ['NEXT_OPEN', 'CUR_CLOSE'],
    },
    actions: [
      createAction({
        id: 'create-run',
        enabled: true,
        priority: 10,
      }),
    ],
    sections: [
      createSection({
        id: 'runtime',
        statusCode: 'READY',
        tone: 'ready',
        priority: 10,
        facts: {
          engine: runtimeFacts.engine,
          nativeBatchEnabled: runtimeFacts.nativeBatchEnabled,
          nativeEngineAvailable: runtimeFacts.nativeEngineAvailable,
        },
      }),
    ],
  });
};
