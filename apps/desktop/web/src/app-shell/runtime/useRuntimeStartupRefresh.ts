// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef, type MutableRefObject } from "react";
import { api } from "@/api";
import { resetSharedStatsViewCache } from "@/workspaces/challenge-stats/trainingStatsViewCache";
import {
  connectRuntimeDataRecoveryToBackendLifecycle,
  createRuntimeDataRecoveryCoordinator,
  runRuntimeStartupDataRecovery,
} from "@/domains/trainer/runtimeStartupDataRecovery";
import { hydrateSavedIndicatorProfilesFromDatabase } from "@/domains/custom-indicator/indicator/profileStore";
import { runTauriUnlistenSafely } from "@/frontend-kernel/tauriEventCleanup";

type AbortableRefreshTask = (options?: { signal?: AbortSignal }) => Promise<unknown>;
type StorageUsageRefreshTask = (options?: { silent?: boolean }) => Promise<void>;
type PageRefreshTask = (append: boolean, cursor?: string | null) => Promise<void>;
type DataSourceSyncSweepTask = (options?: { force?: boolean }) => Promise<void>;

type RuntimeStartupRefreshParams = {
  appIsMountedRef: MutableRefObject<boolean>;
  historyProjectsWarmupTaskRef: MutableRefObject<Promise<void> | null>;
  replayNotesWarmupTaskRef: MutableRefObject<Promise<void> | null>;
  challengeStatsWarmupTaskRef: MutableRefObject<Promise<void> | null>;
  refreshInstruments: AbortableRefreshTask;
  syncCustomSamplePoolsFromDataSources: AbortableRefreshTask;
  refreshTradingSettings: AbortableRefreshTask;
  refreshLatestResumableTrainerSession: () => Promise<unknown>;
  refreshSystemStorageUsage: StorageUsageRefreshTask;
  loadTrainingProjectsPage: PageRefreshTask;
  loadReplayNotesPage: PageRefreshTask;
  runDataSourceSyncQuickCheckSweep: DataSourceSyncSweepTask;
};

export const useRuntimeStartupRefresh = ({
  appIsMountedRef,
  historyProjectsWarmupTaskRef,
  replayNotesWarmupTaskRef,
  challengeStatsWarmupTaskRef,
  refreshInstruments,
  syncCustomSamplePoolsFromDataSources,
  refreshTradingSettings,
  refreshLatestResumableTrainerSession,
  refreshSystemStorageUsage,
  loadTrainingProjectsPage,
  loadReplayNotesPage,
  runDataSourceSyncQuickCheckSweep,
}: RuntimeStartupRefreshParams): void => {
  const refreshSequenceRef = useRef(0);
  const latestParamsRef = useRef<RuntimeStartupRefreshParams>({
    appIsMountedRef,
    historyProjectsWarmupTaskRef,
    replayNotesWarmupTaskRef,
    challengeStatsWarmupTaskRef,
    refreshInstruments,
    syncCustomSamplePoolsFromDataSources,
    refreshTradingSettings,
    refreshLatestResumableTrainerSession,
    refreshSystemStorageUsage,
    loadTrainingProjectsPage,
    loadReplayNotesPage,
    runDataSourceSyncQuickCheckSweep,
  });
  latestParamsRef.current = {
    appIsMountedRef,
    historyProjectsWarmupTaskRef,
    replayNotesWarmupTaskRef,
    challengeStatsWarmupTaskRef,
    refreshInstruments,
    syncCustomSamplePoolsFromDataSources,
    refreshTradingSettings,
    refreshLatestResumableTrainerSession,
    refreshSystemStorageUsage,
    loadTrainingProjectsPage,
    loadReplayNotesPage,
    runDataSourceSyncQuickCheckSweep,
  };

  useEffect(() => {
    let disposed = false;
    let unlistenBackendStatus: (() => void) | null = null;
    const recoveryCoordinator = createRuntimeDataRecoveryCoordinator({
      run: async ({ reason, sequence, signal }) => {
        const startupParams = latestParamsRef.current;
        refreshSequenceRef.current = sequence;
        startupParams.historyProjectsWarmupTaskRef.current = null;
        startupParams.replayNotesWarmupTaskRef.current = null;
        startupParams.challengeStatsWarmupTaskRef.current = null;
        resetSharedStatsViewCache();

        const auxiliaryTasks =
          reason === "mount"
            ? [
                startupParams.refreshTradingSettings({ signal }),
                hydrateSavedIndicatorProfilesFromDatabase(true),
                startupParams.refreshLatestResumableTrainerSession(),
                startupParams.refreshSystemStorageUsage({ silent: true }),
                startupParams.loadTrainingProjectsPage(false, null),
                startupParams.loadReplayNotesPage(false, null),
              ]
            : [startupParams.refreshTradingSettings({ signal })];
        const [dataRecoveryResult] = await Promise.all([
          runRuntimeStartupDataRecovery({
            refreshInstruments: startupParams.refreshInstruments,
            syncCustomSamplePoolsFromDataSources:
              startupParams.syncCustomSamplePoolsFromDataSources,
            signal,
            isActive: () =>
              !disposed &&
              latestParamsRef.current.appIsMountedRef.current &&
              refreshSequenceRef.current === sequence,
          }),
          Promise.allSettled(auxiliaryTasks),
        ]);
        if (
          signal.aborted ||
          disposed ||
          !latestParamsRef.current.appIsMountedRef.current ||
          refreshSequenceRef.current !== sequence
        ) {
          return;
        }
        if (dataRecoveryResult.status === "failed") {
          console.warn(
            "[runtime-startup] instruments and data sources did not recover",
            dataRecoveryResult.error,
          );
        }
        await latestParamsRef.current
          .runDataSourceSyncQuickCheckSweep({ force: true })
          .catch(() => undefined);
      },
    });

    void recoveryCoordinator.request("mount").catch(() => undefined);
    void connectRuntimeDataRecoveryToBackendLifecycle({
      coordinator: recoveryCoordinator,
      subscribe: api.subscribeToNativeBackendStartupPreflightStatus,
    })
      .then((unlisten) => {
        if (disposed) {
          runTauriUnlistenSafely(unlisten);
          return;
        }
        unlistenBackendStatus = unlisten;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      recoveryCoordinator.dispose();
      runTauriUnlistenSafely(unlistenBackendStatus);
      unlistenBackendStatus = null;
    };
  }, []);
};
