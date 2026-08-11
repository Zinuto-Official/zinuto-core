// SPDX-License-Identifier: GPL-3.0-only

import { nowIso } from "../kernel/time.js";
import type {
  HistoryRetentionApplyResult,
  HistoryRetentionImpact,
  HistoryRetentionImpactSummary,
  HistoryRetentionPolicy,
  HistoryRetentionPreview,
  HistoryRetentionTargets,
  HistoryRetentionWindow,
} from "../domain/historyRetentionTypes.js";
import {
  applyHistoryRetentionPolicyData,
  ensureHistoryRetentionPolicyRow,
  estimateHistoryRetentionPolicyImpact,
  markHistoryRetentionPolicyApplied,
  type HistoryRetentionPolicyRow,
} from "./ports/infrastructure/db/history/historyRetentionStore.js";
import { releaseExpiredAssignedQuestionLedgerRows } from "./ports/infrastructure/db/specialTraining/questionLedgerStore.js";

const HISTORY_RETENTION_WINDOWS = new Set<HistoryRetentionWindow>([
  "ONE_MONTH",
  "SIX_MONTHS",
  "ONE_YEAR",
  "THREE_YEARS",
  "FOREVER",
]);

export const DEFAULT_HISTORY_RETENTION_TARGETS: HistoryRetentionTargets = {
  freeReplayDetails: true,
  challengeDetails: true,
  noteText: false,
};

const EMPTY_IMPACT: HistoryRetentionImpact = {
  rows: 0,
  bytes: 0,
};

const normalizeBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean"
    ? value
    : Number(value) === 1
      ? true
      : Number(value) === 0
        ? false
        : fallback;

export const normalizeHistoryRetentionWindow = (
  value: unknown,
  fallback: HistoryRetentionWindow,
): HistoryRetentionWindow => {
  const normalized = String(value ?? "").trim().toUpperCase();
  return HISTORY_RETENTION_WINDOWS.has(normalized as HistoryRetentionWindow)
    ? (normalized as HistoryRetentionWindow)
    : fallback;
};

const toIsoText = (value: unknown): string | null => {
  const text = String(value ?? "").trim();
  return text ? text : null;
};

const summarizeImpact = (
  value: Partial<Record<keyof HistoryRetentionTargets, HistoryRetentionImpact>>,
): HistoryRetentionImpactSummary => {
  const freeReplayDetails = value.freeReplayDetails ?? EMPTY_IMPACT;
  const challengeDetails = value.challengeDetails ?? EMPTY_IMPACT;
  const noteText = value.noteText ?? EMPTY_IMPACT;
  return {
    freeReplayDetails,
    challengeDetails,
    noteText,
    totalRows:
      freeReplayDetails.rows +
      challengeDetails.rows +
      noteText.rows,
    totalBytes:
      freeReplayDetails.bytes +
      challengeDetails.bytes +
      noteText.bytes,
  };
};

const mapPolicyRow = (row: HistoryRetentionPolicyRow): HistoryRetentionPolicy => ({
  retentionWindow: normalizeHistoryRetentionWindow(row.retention_window, "ONE_YEAR"),
  targets: {
    freeReplayDetails: normalizeBoolean(
      row.free_replay_details_enabled,
      DEFAULT_HISTORY_RETENTION_TARGETS.freeReplayDetails,
    ),
    challengeDetails: normalizeBoolean(
      row.challenge_details_enabled,
      DEFAULT_HISTORY_RETENTION_TARGETS.challengeDetails,
    ),
    noteText: normalizeBoolean(
      row.note_text_enabled,
      DEFAULT_HISTORY_RETENTION_TARGETS.noteText,
    ),
  },
  updatedAt: toIsoText(row.updated_at) ?? nowIso(),
  lastAppliedAt: toIsoText(row.last_applied_at),
});

export const ensureHistoryRetentionPolicy = (): HistoryRetentionPolicy =>
  mapPolicyRow(ensureHistoryRetentionPolicyRow(nowIso()));

const subtractMonthsClampedToTargetMonth = (date: Date, months: number): Date => {
  const dayOfMonth = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const daysInTargetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(dayOfMonth, daysInTargetMonth));
  return date;
};

const resolveCutoffAt = (
  retentionWindow: HistoryRetentionWindow,
  referenceIso = nowIso(),
): string | null => {
  if (retentionWindow === "FOREVER") {
    return null;
  }
  const date = new Date(referenceIso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  if (retentionWindow === "ONE_MONTH") {
    subtractMonthsClampedToTargetMonth(date, 1);
  } else if (retentionWindow === "SIX_MONTHS") {
    subtractMonthsClampedToTargetMonth(date, 6);
  } else if (retentionWindow === "THREE_YEARS") {
    date.setUTCFullYear(date.getUTCFullYear() - 3);
  } else {
    date.setUTCFullYear(date.getUTCFullYear() - 1);
  }
  return date.toISOString();
};

export const buildHistoryRetentionPreviewForPolicy = (
  policy: HistoryRetentionPolicy,
  measuredAt = nowIso(),
): HistoryRetentionPreview => {
  const cutoffAt = resolveCutoffAt(policy.retentionWindow, measuredAt);
  if (!cutoffAt) {
    return {
      policy,
      cutoffAt: null,
      estimated: summarizeImpact({}),
      measuredAt,
    };
  }
  return {
    policy,
    cutoffAt,
    estimated: estimateHistoryRetentionPolicyImpact(cutoffAt, policy.targets),
    measuredAt,
  };
};

export const applyHistoryRetentionPolicySnapshot = (
  policy: HistoryRetentionPolicy,
  options: { assertCanContinue?: () => void } = {},
): HistoryRetentionApplyResult => {
  const assertCanContinue = options.assertCanContinue ?? (() => undefined);
  assertCanContinue();
  const appliedAt = nowIso();
  const preview = buildHistoryRetentionPreviewForPolicy(policy, appliedAt);
  assertCanContinue();
  releaseExpiredAssignedQuestionLedgerRows(appliedAt);
  assertCanContinue();
  if (!preview.cutoffAt) {
    markHistoryRetentionPolicyApplied(appliedAt);
    assertCanContinue();
    return {
      ...preview,
      deleted: summarizeImpact({}),
      appliedAt,
      storageReclaimedBytes: 0,
    };
  }
  const deleted = applyHistoryRetentionPolicyData({
    policy,
    cutoffAt: preview.cutoffAt,
    estimated: preview.estimated,
    appliedAt,
    assertCanContinue,
  });
  assertCanContinue();
  return {
    ...preview,
    deleted,
    appliedAt,
    storageReclaimedBytes: 0,
  };
};

export type AutomaticHistoryRetentionResult =
  | { status: "SKIPPED"; lastAppliedAt: string }
  | { status: "APPLIED"; result: HistoryRetentionApplyResult };

export const applyHistoryRetentionPolicyForIdleMaintenance = ({
  minimumIntervalMs,
  assertCanContinue,
}: {
  minimumIntervalMs: number;
  assertCanContinue?: () => void;
}): AutomaticHistoryRetentionResult => {
  assertCanContinue?.();
  const policy = ensureHistoryRetentionPolicy();
  const lastAppliedAtMs = Date.parse(policy.lastAppliedAt ?? "");
  if (
    Number.isFinite(lastAppliedAtMs) &&
    Date.now() - lastAppliedAtMs < Math.max(0, minimumIntervalMs)
  ) {
    return {
      status: "SKIPPED",
      lastAppliedAt: policy.lastAppliedAt as string,
    };
  }
  return {
    status: "APPLIED",
    result: applyHistoryRetentionPolicySnapshot(policy, { assertCanContinue }),
  };
};

export const applyHistoryRetentionPolicyForManualMaintenance = ({
  assertCanContinue,
}: {
  assertCanContinue?: () => void;
} = {}): HistoryRetentionApplyResult => {
  assertCanContinue?.();
  return applyHistoryRetentionPolicySnapshot(ensureHistoryRetentionPolicy(), {
    assertCanContinue,
  });
};
