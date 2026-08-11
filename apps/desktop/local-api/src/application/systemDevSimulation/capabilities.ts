// SPDX-License-Identifier: GPL-3.0-only

import {
  resolveSystemDevSimulationCapabilities as resolveSharedCapabilities,
  type SystemDevSimulationCapabilities,
} from "@zinuto/shared/systemDevSimulationProfiles";
import { planSystemDevSimulationDataset } from "./datasetPlanner.js";

const isTruthyFlag = (value: unknown): boolean => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
};

export const isStressSystemDevSimulationEnabled = (): boolean => {
  if (isTruthyFlag(process.env.ZINUTO_ENABLE_STRESS_SIMULATION)) {
    return true;
  }
  return String(process.env.NODE_ENV ?? "").trim().toLowerCase() !== "production";
};

export const getSystemDevSimulationCapabilities =
  (): SystemDevSimulationCapabilities =>
    resolveSharedCapabilities({
      stressAvailable: isStressSystemDevSimulationEnabled(),
      dataAvailability: planSystemDevSimulationDataset().dataAvailability,
    });
