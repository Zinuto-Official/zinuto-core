// SPDX-License-Identifier: GPL-3.0-only

import {
  acquireMarketReadConnection,
  getMarketReadConnectionPoolState,
  releaseMarketReadConnection,
  withMarketDbLock,
} from '../../src/infrastructure/db/marketDatabase/connection.js';
import {
  acquireMarketPrewarmQuiesceLease,
  drainMarketTimelinePrewarmQueue,
  enqueueHotMarketTimelinePrewarmForInstruments,
  getMarketTimelinePrewarmQueueState,
  resetMarketTimelinePrewarmRuntime,
  scheduleMarketPrewarmTask,
  setMarketTimelinePrewarmBlocker,
  setMarketTimelinePrewarmRunner,
  stopMarketTimelinePrewarmQueue,
  waitForMarketTimelinePrewarmQueueIdle,
} from '../../src/infrastructure/db/marketDatabase/timeline.js';
import {
  getMarketPrewarmExecutionState,
} from '../../src/infrastructure/db/marketDatabase/prewarmExecutionState.js';

export const marketDatabaseHarness = {
  acquireReadConnection: async (): Promise<() => void> => {
    const entry = await acquireMarketReadConnection();
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      releaseMarketReadConnection(entry, true);
    };
  },
  getReadConnectionPoolState: getMarketReadConnectionPoolState,
  withWriteLock: withMarketDbLock,
  getTimelinePrewarmQueueState: getMarketTimelinePrewarmQueueState,
  getPrewarmExecutionState: getMarketPrewarmExecutionState,
  acquirePrewarmQuiesceLease: acquireMarketPrewarmQuiesceLease,
  schedulePrewarmTask: scheduleMarketPrewarmTask,
  setTimelinePrewarmRunner: setMarketTimelinePrewarmRunner,
  setTimelinePrewarmBlocker: setMarketTimelinePrewarmBlocker,
  enqueueTimelinePrewarm: enqueueHotMarketTimelinePrewarmForInstruments,
  drainTimelinePrewarmQueue: drainMarketTimelinePrewarmQueue,
  stopTimelinePrewarmQueue: stopMarketTimelinePrewarmQueue,
  awaitTimelinePrewarmIdle: waitForMarketTimelinePrewarmQueueIdle,
  resetTimelinePrewarmQueue: resetMarketTimelinePrewarmRuntime,
};
