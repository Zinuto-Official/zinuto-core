// SPDX-License-Identifier: GPL-3.0-only

import {
  getAppPreferences,
  setAppUiSettings,
  setDataPoolRemovedSymbolsBySourceId,
  type AppPreferences,
} from "../../appPreferencesService.js";
import {
  getHistoryRetentionPolicy,
  previewHistoryRetentionPolicy,
  updateHistoryRetentionPolicy,
} from "../../historyRetentionService.js";
import type { HistoryRetentionPolicy } from "../../../domain/historyRetentionTypes.js";
import { previewPortableExport } from "../../portableDataService.js";
import type { StartSystemDevSimulationPayload } from "../../ports/infrastructure/db/systemDevSimulation/jobStore.js";
import { throwIfSystemDevSimulationTaskAborted } from "../taskExecutionState.js";

export type SystemDevSimulationDesktopMutableDataResult = {
  preferencesUpdated: boolean;
  historyRetentionPreviewed: boolean;
  historyRetentionUpdated: boolean;
  portablePreviewed: boolean;
};

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const buildSimulationUiSettings = (
  preferences: AppPreferences,
  batchId: string,
): AppPreferences["uiSettings"] => ({
  ...preferences.uiSettings,
  systemDevSimulationLastBatchId: batchId,
});

const buildSimulationRemovedSymbols = (
  payload: StartSystemDevSimulationPayload,
): AppPreferences["dataPoolRemovedSymbolsBySourceId"] => {
  const firstPool = payload.enabledSamplePools[0];
  const firstSymbol = firstPool?.symbols[0];
  if (!firstPool || !firstSymbol) {
    return {};
  }
  return {
    [firstPool.id]: [firstSymbol],
  };
};


export const executeSystemDevSimulationDesktopMutableDataWorkload = async (
  payload: StartSystemDevSimulationPayload,
  signal?: AbortSignal,
): Promise<SystemDevSimulationDesktopMutableDataResult> => {
  const originalPreferences = cloneJson(getAppPreferences());
  const originalHistoryRetentionPolicy = cloneJson(getHistoryRetentionPolicy());
  const result: SystemDevSimulationDesktopMutableDataResult = {
    preferencesUpdated: false,
    historyRetentionPreviewed: false,
    historyRetentionUpdated: false,
    portablePreviewed: false,
  };

  try {
    throwIfSystemDevSimulationTaskAborted(signal);
    setAppUiSettings(buildSimulationUiSettings(originalPreferences, payload.batchId));
    throwIfSystemDevSimulationTaskAborted(signal);
    setDataPoolRemovedSymbolsBySourceId(buildSimulationRemovedSymbols(payload));
    throwIfSystemDevSimulationTaskAborted(signal);
    result.preferencesUpdated = true;

    throwIfSystemDevSimulationTaskAborted(signal);
    previewHistoryRetentionPolicy({
      retentionWindow: "ONE_MONTH",
      targets: {
        freeReplayDetails: true,
        challengeDetails: true,
        noteText: true,
      },
    });
    result.historyRetentionPreviewed = true;
    throwIfSystemDevSimulationTaskAborted(signal);
    updateHistoryRetentionPolicy({
      retentionWindow: "SIX_MONTHS",
      targets: {
        freeReplayDetails: true,
        challengeDetails: true,
        noteText: true,
      },
    });
    result.historyRetentionUpdated = true;

    throwIfSystemDevSimulationTaskAborted(signal);
    previewPortableExport({
      domains: [
        "SETTINGS",
        "CUSTOM_INDICATORS",
        "NOTES",
        "TRAINING_HISTORY",
        "SPECIAL_TRAINING_HISTORY",
      ],
      marketSourceIds: payload.enabledSamplePools
        .filter((pool) =>
          (pool.instruments ?? []).some(
            (instrument) => instrument.sourceKind === "LOCAL",
          ),
        )
        .map((pool) => pool.id),
    });
    throwIfSystemDevSimulationTaskAborted(signal);
    result.portablePreviewed = true;
    return result;
  } finally {
    restoreSystemDevSimulationPreferences(originalPreferences);
    restoreSystemDevSimulationHistoryRetentionPolicy(
      originalHistoryRetentionPolicy,
    );
  }
};

const restoreSystemDevSimulationPreferences = (
  preferences: AppPreferences,
): void => {
  setAppUiSettings(preferences.uiSettings);
  setDataPoolRemovedSymbolsBySourceId(
    preferences.dataPoolRemovedSymbolsBySourceId,
  );
};

const restoreSystemDevSimulationHistoryRetentionPolicy = (
  policy: HistoryRetentionPolicy,
): void => {
  updateHistoryRetentionPolicy({
    retentionWindow: policy.retentionWindow,
    targets: policy.targets,
  });
};
