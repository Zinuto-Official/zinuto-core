// SPDX-License-Identifier: GPL-3.0-only

/**
 * Barrel file — re-exports the system dev simulation service API from
 * systemDevSimulation/.
 */
export {
  cleanupSystemDevSimulationData,
  getLatestSystemDevSimulationCleanupJob,
  getSystemDevSimulationCleanupJob,
  startSystemDevSimulationCleanupJob,
  waitForSystemDevSimulationCleanupRuntimeIdle,
  type SystemDevSimulationCleanupJobSnapshot,
  type SystemDevSimulationCleanupResult,
} from "./systemDevSimulation/cleanupRuntime.js";

export { simulateFreeReplayItem } from "./systemDevSimulation/freeReplayItemSimulation.js";

export { simulateChallengeItem } from "./systemDevSimulation/challengeItemSimulation.js";

export {
  cancelSystemDevSimulationJob,
  getLatestSystemDevSimulationJob,
  getSystemDevSimulationCapabilities,
  getSystemDevSimulationJob,
  startSystemDevSimulationJob,
  stopSystemDevSimulationJobRuntime,
} from "./systemDevSimulation/jobLifecycle.js";
