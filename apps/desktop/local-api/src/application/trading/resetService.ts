// SPDX-License-Identifier: GPL-3.0-only

import {
  cleanupStaleSessions as cleanupStaleSessionsCore,
  getResetAllStoredDataJob as getResetAllStoredDataJobCore,
  getSystemStorageUsage as getSystemStorageUsageCore,
  isResetAllStoredDataRuntimeActive as isResetAllStoredDataRuntimeActiveCore,
  previewTrainingSummary as previewTrainingSummaryCore,
  recoverInterruptedResetAllStoredData as recoverInterruptedResetAllStoredDataCore,
  resetAllStoredData as resetAllStoredDataCore,
  resetAllTraining as resetAllTrainingCore,
  resetSymbolTraining as resetSymbolTrainingCore,
  startResetAllStoredDataJob as startResetAllStoredDataJobCore,
  waitForResetAllStoredDataRuntimeIdle as waitForResetAllStoredDataRuntimeIdleCore
} from './core.js';

export const getResetAllStoredDataJob: typeof getResetAllStoredDataJobCore = (...args) =>
  getResetAllStoredDataJobCore(...args);
export const isResetAllStoredDataRuntimeActive: typeof isResetAllStoredDataRuntimeActiveCore = (...args) =>
  isResetAllStoredDataRuntimeActiveCore(...args);
export const recoverInterruptedResetAllStoredData: typeof recoverInterruptedResetAllStoredDataCore = (...args) =>
  recoverInterruptedResetAllStoredDataCore(...args);
export const cleanupStaleSessions: typeof cleanupStaleSessionsCore = (...args) => cleanupStaleSessionsCore(...args);
export const getSystemStorageUsage: typeof getSystemStorageUsageCore = (...args) => getSystemStorageUsageCore(...args);
export const previewTrainingSummary: typeof previewTrainingSummaryCore = (...args) => previewTrainingSummaryCore(...args);
export const resetAllStoredData: typeof resetAllStoredDataCore = (...args) => resetAllStoredDataCore(...args);
export const resetAllTraining: typeof resetAllTrainingCore = (...args) => resetAllTrainingCore(...args);
export const resetSymbolTraining: typeof resetSymbolTrainingCore = (...args) => resetSymbolTrainingCore(...args);
export const startResetAllStoredDataJob: typeof startResetAllStoredDataJobCore = (...args) =>
  startResetAllStoredDataJobCore(...args);
export const waitForResetAllStoredDataRuntimeIdle: typeof waitForResetAllStoredDataRuntimeIdleCore = (...args) =>
  waitForResetAllStoredDataRuntimeIdleCore(...args);
