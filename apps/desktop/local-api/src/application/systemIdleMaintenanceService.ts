// SPDX-License-Identifier: GPL-3.0-only

import { checkpointDatabaseStorage } from './ports/infrastructure/db/database.js';
import { pruneExpiredMarketReadCaches } from './ports/infrastructure/db/marketReadCache.js';
import { pruneExpiredMarketRangeCursors } from './ports/infrastructure/db/marketRangeCursorCache.js';
import {
  removeMarketInstrumentData,
} from './ports/infrastructure/db/marketDatabase.js';
import { runtimeLimits } from '../kernel/runtimeLimits.js';
import {
  deleteLocalDataSourceMetadataById,
  isLocalDataImportIdle as defaultIsLocalDataImportIdle,
  listDeletingLocalDataSourceIds,
  listInstrumentIdsBySourceId,
} from './ports/infrastructure/db/system/systemIdleMaintenanceStore.js';

type IdleCheck = () => boolean | Promise<boolean>;

type StartSystemIdleMaintenanceOptions = {
  isApiInteractionIdle: IdleCheck;
  isLocalDataImportIdle?: IdleCheck;
  isBacktestRuntimeIdle: IdleCheck;
  runAutomaticHistoryRetention?: (input: {
    minimumIntervalMs: number;
    signal: AbortSignal;
  }) => Promise<unknown>;
};

type SystemIdleMaintenanceHandle = {
  stop: () => Promise<void>;
  triggerNow: () => Promise<void>;
  interruptForApiInteraction: () => Promise<void>;
};

const HISTORY_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const HISTORY_RETENTION_FAILURE_RETRY_MS = 30 * 60 * 1000;
const HISTORY_RETENTION_BUSY_RETRY_MS = 5 * 60 * 1000;
const HISTORY_RETENTION_IDLE_MONITOR_MS = 100;

const logIdleMaintenanceError = (stage: string, error: unknown): void => {
  console.warn(`[idle-maintenance] ${stage} failed`, error);
};

export const startSystemIdleMaintenance = (
  options: StartSystemIdleMaintenanceOptions
): SystemIdleMaintenanceHandle => {
  const isApiInteractionIdle = options.isApiInteractionIdle;
  const isLocalDataImportIdle: IdleCheck =
    options.isLocalDataImportIdle ?? defaultIsLocalDataImportIdle;
  const isBacktestRuntimeIdle = options.isBacktestRuntimeIdle;
  const runAutomaticHistoryRetention = options.runAutomaticHistoryRetention;

  let stopped = false;
  let inFlight = false;
  let startupTimer: NodeJS.Timeout | null = null;
  let intervalTimer: NodeJS.Timeout | null = null;
  let activeRunPromise: Promise<void> | null = null;
  let activeRetentionPromise: Promise<unknown> | null = null;
  let activeRetentionAbortController: AbortController | null = null;
  let nextHistoryRetentionAttemptAt = 0;

  const canRunMaintenance = async (): Promise<boolean> => {
    if (stopped || !Boolean(await isApiInteractionIdle())) {
      return false;
    }
    if (!Boolean(await isLocalDataImportIdle())) {
      return false;
    }
    return Boolean(await isBacktestRuntimeIdle());
  };

  const runOnceInternal = async (): Promise<void> => {
    if (stopped || inFlight) {
      return;
    }
    inFlight = true;
    try {
      if (!(await canRunMaintenance())) {
        return;
      }
      pruneExpiredMarketReadCaches();
      pruneExpiredMarketRangeCursors();

      if (!(await canRunMaintenance())) {
        return;
      }
      // PASSIVE never waits for active SQLite readers. Idle maintenance must
      // yield to an arriving API request instead of inheriting the database's
      // busy timeout on the single Node.js event loop.
      checkpointDatabaseStorage('PASSIVE');

      if (
        runAutomaticHistoryRetention &&
        Date.now() >= nextHistoryRetentionAttemptAt
      ) {
        if (!(await canRunMaintenance())) {
          return;
        }
        const abortController = new AbortController();
        activeRetentionAbortController = abortController;
        let idleProbePending = false;
        const idleMonitor = setInterval(() => {
          if (idleProbePending || abortController.signal.aborted) {
            return;
          }
          idleProbePending = true;
          void canRunMaintenance()
            .then((idle) => {
              if (!idle) {
                abortController.abort();
              }
            })
            .catch(() => abortController.abort())
            .finally(() => {
              idleProbePending = false;
            });
        }, HISTORY_RETENTION_IDLE_MONITOR_MS);
        idleMonitor.unref?.();
        try {
          activeRetentionPromise = runAutomaticHistoryRetention({
            minimumIntervalMs: HISTORY_RETENTION_INTERVAL_MS,
            signal: abortController.signal,
          });
          await activeRetentionPromise;
          nextHistoryRetentionAttemptAt = Date.now() + HISTORY_RETENTION_INTERVAL_MS;
        } catch (error) {
          if (abortController.signal.aborted) {
            nextHistoryRetentionAttemptAt =
              Date.now() + HISTORY_RETENTION_BUSY_RETRY_MS;
            return;
          }
          nextHistoryRetentionAttemptAt =
            Date.now() + HISTORY_RETENTION_FAILURE_RETRY_MS;
          logIdleMaintenanceError('history retention worker', error);
        } finally {
          clearInterval(idleMonitor);
          activeRetentionPromise = null;
          if (activeRetentionAbortController === abortController) {
            activeRetentionAbortController = null;
          }
        }
      }

      // Physical cleanup for sources marked DELETING
      if (!(await canRunMaintenance())) {
        return;
      }
      try {
        const sourceIds = listDeletingLocalDataSourceIds(5);
        for (const sourceId of sourceIds) {
          if (!(await canRunMaintenance())) {
            return;
          }
          const instrumentIds = listInstrumentIdsBySourceId(sourceId);
          let physicalRemovalSucceeded = true;
          for (const instrumentId of instrumentIds) {
            if (!(await canRunMaintenance())) {
              return;
            }
            try {
              await removeMarketInstrumentData(instrumentId);
            } catch (error) {
              physicalRemovalSucceeded = false;
              logIdleMaintenanceError('source physical deletion cleanup', error);
              break;
            }
          }
          if (!physicalRemovalSucceeded) {
            continue;
          }
          if (!(await canRunMaintenance())) {
            return;
          }
          deleteLocalDataSourceMetadataById(sourceId);
        }
      } catch (error) {
        logIdleMaintenanceError('source deletion cleanup', error);
      }
    } catch (error) {
      logIdleMaintenanceError('run cycle', error);
      // keep scheduler resilient, maintenance can retry on next cycle
    } finally {
      inFlight = false;
    }
  };

  const runOnce = async (): Promise<void> => {
    if (activeRunPromise) {
      await activeRunPromise;
      return;
    }
    activeRunPromise = runOnceInternal().finally(() => {
      activeRunPromise = null;
    });
    await activeRunPromise;
  };

  startupTimer = setTimeout(() => {
    if (stopped) {
      return;
    }
    void runOnce();
  }, runtimeLimits.idleMaintenanceStartupDelayMs);

  intervalTimer = setInterval(() => {
    if (stopped) {
      return;
    }
    void runOnce();
  }, runtimeLimits.idleMaintenanceCheckpointIntervalMs);

  const stop = async () => {
    if (stopped) {
      await activeRunPromise;
      return;
    }
    stopped = true;
    activeRetentionAbortController?.abort();
    if (startupTimer) {
      clearTimeout(startupTimer);
      startupTimer = null;
    }
    if (intervalTimer) {
      clearInterval(intervalTimer);
      intervalTimer = null;
    }
    await activeRunPromise;
  };

  const interruptForApiInteraction = async (): Promise<void> => {
    const retentionPromise = activeRetentionPromise;
    activeRetentionAbortController?.abort();
    await retentionPromise?.catch(() => undefined);
  };

  return {
    stop,
    triggerNow: runOnce,
    interruptForApiInteraction,
  };
};
