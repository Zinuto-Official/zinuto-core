// SPDX-License-Identifier: GPL-3.0-only

import type { SystemDevSimulationEnabledPool } from "../../../domain/systemDevSimulation/sharedDomain.js";
import type {
  SystemDevSimulationCalibrationObservation,
  SystemDevSimulationEffectivePlan,
  SystemDevSimulationProfileId,
  SystemDevSimulationProfileTargets,
} from "@zinuto/shared/systemDevSimulationProfiles";
import type { LocalizedMessageToken } from "@zinuto/shared/i18n";

export type StartSystemDevSimulationPayload = {
  profileId: SystemDevSimulationProfileId;
  repeatMode: "REPLACE" | "APPEND";
  targets: SystemDevSimulationProfileTargets;
  enabledSamplePools: SystemDevSimulationEnabledPool[];
  batchId: string;
  batchSeed: string;
};

export type SystemDevSimulationJobStatus =
  "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED" | "INTERRUPTED";

export type SystemDevSimulationJobPhase =
  | "CALIBRATING"
  | "FREE_REPLAY"
  | "FAST_DECISION"
  | "RISK_DISCIPLINE"
  | "CUSTOM_INDICATORS"
  | "REAL_BACKTEST"
  | "DESKTOP_MUTABLE"
  | "VERIFYING"
  | "DONE";

export type SystemDevSimulationJobCreatedCounts = {
  trainingProjects: number;
  replayNotes: number;
  independentCustomNotes: number;
  specialTrainingSessions: number;
  specialTrainingQuestions: number;
  specialTrainingBanks: number;
  questionLedger: number;
  customIndicatorProfiles: number;
  realBacktestBatches: number;
  desktopMutableRuns: number;
};

export type SystemDevSimulationJobThroughput = {
  completedItems: number;
  itemsPerMinute: number;
};

export type SystemDevSimulationJobMetrics = {
  retryCount: number;
  phaseElapsedMs: number;
  verificationStatus: "PENDING" | "SUCCESS" | "FAILED";
  workloadAverageMs: SystemDevSimulationCalibrationObservation;
};

export type SystemDevSimulationJobCurrentWorkload = {
  phase: SystemDevSimulationJobPhase;
  workload:
    | "FREE_REPLAY"
    | "FAST_DECISION"
    | "RISK_DISCIPLINE"
    | "CUSTOM_NOTE"
    | "CUSTOM_INDICATORS"
    | "REAL_BACKTEST"
    | "DESKTOP_MUTABLE"
    | "VERIFYING";
  index: number | null;
  current: number;
  target: number;
  startedAt: string;
  updatedAt: string;
};

export type SystemDevSimulationJobSnapshot = {
  id: string;
  profileId: SystemDevSimulationProfileId;
  status: SystemDevSimulationJobStatus;
  progressPercent: number;
  phase: SystemDevSimulationJobPhase;
  startedAt: string | null;
  finishedAt: string | null;
  freeReplayCompleted: number;
  freeReplayTarget: number;
  fastDecisionCompleted: number;
  fastDecisionTarget: number;
  riskDisciplineCompleted: number;
  riskDisciplineTarget: number;
  totalTarget: number;
  currentMessage: string;
  currentMessageToken?: LocalizedMessageToken | null;
  errorMessage: string | null;
  errorMessageToken?: LocalizedMessageToken | null;
  errorCode: string | null;
  errorArgs: Record<string, string | number | boolean | null> | null;
  effectivePlan: SystemDevSimulationEffectivePlan | null;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  throughput: SystemDevSimulationJobThroughput;
  createdCounts: SystemDevSimulationJobCreatedCounts;
  currentWorkload: SystemDevSimulationJobCurrentWorkload | null;
  canCancel: boolean;
  cancelRequested: boolean;
  metrics: SystemDevSimulationJobMetrics;
};

export type MutableSystemDevSimulationJob = SystemDevSimulationJobSnapshot & {
  payload: StartSystemDevSimulationPayload | null;
  phaseStartedAt: string | null;
};

export type PersistedSystemDevSimulationJobRecord = {
  version?: number;
  snapshot: SystemDevSimulationJobSnapshot;
  payload: StartSystemDevSimulationPayload | null;
};
