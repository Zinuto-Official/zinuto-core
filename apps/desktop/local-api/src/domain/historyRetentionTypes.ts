// SPDX-License-Identifier: GPL-3.0-only

export type HistoryRetentionWindow =
  | "ONE_MONTH"
  | "SIX_MONTHS"
  | "ONE_YEAR"
  | "THREE_YEARS"
  | "FOREVER";

export type HistoryRetentionTargets = {
  freeReplayDetails: boolean;
  challengeDetails: boolean;
  noteText: boolean;
};

export type HistoryRetentionPolicy = {
  retentionWindow: HistoryRetentionWindow;
  targets: HistoryRetentionTargets;
  updatedAt: string;
  lastAppliedAt: string | null;
};

export type HistoryRetentionImpact = {
  rows: number;
  bytes: number;
};

export type HistoryRetentionImpactSummary = {
  freeReplayDetails: HistoryRetentionImpact;
  challengeDetails: HistoryRetentionImpact;
  noteText: HistoryRetentionImpact;
  totalRows: number;
  totalBytes: number;
};

export type HistoryRetentionPreview = {
  policy: HistoryRetentionPolicy;
  cutoffAt: string | null;
  estimated: HistoryRetentionImpactSummary;
  measuredAt: string;
};

export type HistoryRetentionApplyResult = HistoryRetentionPreview & {
  deleted: HistoryRetentionImpactSummary;
  appliedAt: string;
  storageReclaimedBytes: number;
};

export type HistoryRetentionJob = {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED";
  stage:
    | "QUEUED"
    | "PREVIEWING"
    | "FREE_REPLAY"
    | "CHALLENGE"
    | "NOTES"
    | "FINALIZING"
    | "DONE";
  progressPercent: number;
  startedAt: string | null;
  finishedAt: string | null;
  errorCode: string | null;
  errorArgs: Record<string, string | number | boolean | null> | null;
  result: HistoryRetentionApplyResult | null;
};
