// SPDX-License-Identifier: GPL-3.0-only

import { useCallback } from "react";
import type {
  DestructiveDataChangeFinalizer,
  DestructiveDataChangeFinalizerOptions,
  DestructiveDataChangeFinalizerResult,
} from "@/domains/data-import/destructiveDataChangeTypes";

type AsyncStep = () => Promise<unknown>;

type DestructiveDataChangeFinalizerDeps = {
  resetTrainerToPrepView: () => void;
  setActionDialog?: (value: null) => void;
  setOrderEndPrompt?: (value: null) => void;
  setIsAutoplay?: (value: boolean) => void;
  setIsBusy?: (value: boolean) => void;
  setDataPoolRemovedSymbolsBySourceId?: (value: Record<string, string[]>) => void;
  resetHistoryRuntime?: () => void | Promise<unknown>;
  refreshInstruments?: AsyncStep;
  syncCustomSamplePoolsFromDataSources?: AsyncStep;
  refreshLatestResumableTrainerSession?: AsyncStep;
  refreshTradingSettings?: AsyncStep;
  refreshTrainingProjects?: AsyncStep;
  refreshReplayNotes?: AsyncStep;
  refreshSystemStorageUsage?: (options?: {
    silent?: boolean;
    forceRefresh?: boolean;
  }) => Promise<unknown>;
};

export const runDestructiveDataChangeFinalizer = async (
  deps: DestructiveDataChangeFinalizerDeps,
  options: DestructiveDataChangeFinalizerOptions = {},
): Promise<DestructiveDataChangeFinalizerResult> => {
  let failed = false;
  const runStep = async (step?: AsyncStep): Promise<void> => {
    if (!step) {
      return;
    }
    try {
      await step();
    } catch {
      failed = true;
    }
  };
  const refreshStorageUsage = async (): Promise<void> => {
    await deps.refreshSystemStorageUsage?.({ silent: true, forceRefresh: true });
  };

  deps.resetTrainerToPrepView();
  deps.setActionDialog?.(null);
  deps.setOrderEndPrompt?.(null);
  if (options.resetAutoplay) {
    deps.setIsAutoplay?.(false);
  }
  if (options.resetBusy) {
    deps.setIsBusy?.(false);
  }
  if (options.clearRemovedSymbols) {
    deps.setDataPoolRemovedSymbolsBySourceId?.({});
  }

  if (options.refreshDataSources) {
    await runStep(deps.refreshInstruments);
    await runStep(deps.syncCustomSamplePoolsFromDataSources);
    await runStep(deps.refreshLatestResumableTrainerSession);
    await runStep(deps.refreshTradingSettings);
    await runStep(refreshStorageUsage);
  }

  if (options.refreshHistory) {
    await runStep(async () => deps.resetHistoryRuntime?.());
    await runStep(deps.refreshTrainingProjects);
    await runStep(deps.refreshReplayNotes);
    if (!options.refreshDataSources) {
      await runStep(refreshStorageUsage);
    }
  }

  return { failed };
};

export const useDestructiveDataChangeFinalizer = (
  deps: DestructiveDataChangeFinalizerDeps,
): DestructiveDataChangeFinalizer =>
  useCallback(
    (options?: DestructiveDataChangeFinalizerOptions) =>
      runDestructiveDataChangeFinalizer(deps, options),
    [deps],
  );
