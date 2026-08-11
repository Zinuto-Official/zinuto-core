// SPDX-License-Identifier: GPL-3.0-only

import { db, DEFAULT_USER_ID } from "../database.js";
import { CHALLENGE_TTL_MS } from "../../../domain/specialTraining/constants.js";

type ReferenceTime = Date | number | string;

const toDeletedCount = (value: unknown): number => {
  const numeric = Math.floor(Number(value) || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

const resolveReferenceTimeMs = (value?: ReferenceTime): number => {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return Date.parse(value);
  }
  return Date.now();
};

export const releaseExpiredAssignedQuestionLedgerRows = (
  referenceTime?: ReferenceTime,
): number => {
  const referenceMs = resolveReferenceTimeMs(referenceTime);
  const safeReferenceMs = Number.isFinite(referenceMs) ? referenceMs : Date.now();
  const cutoffAt = new Date(
    Math.max(0, safeReferenceMs - CHALLENGE_TTL_MS),
  ).toISOString();
  const result = db
    .prepare(
      `DELETE FROM special_training_question_ledger
        WHERE user_id = ?
          AND status = 'ASSIGNED'
          AND updated_at < ?`,
    )
    .run(DEFAULT_USER_ID, cutoffAt);
  return toDeletedCount(result.changes);
};

export const compactQuestionLedgerByRetentionWindow = (
  cutoffAtRaw: string | null | undefined,
): number => {
  const cutoffAt = String(cutoffAtRaw ?? "").trim();
  if (!cutoffAt) {
    return 0;
  }
  const result = db
    .prepare(
      `DELETE FROM special_training_question_ledger
        WHERE user_id = ?
          AND status IN ('SETTLED', 'ABANDONED')
          AND updated_at < ?`,
    )
    .run(DEFAULT_USER_ID, cutoffAt);
  return toDeletedCount(result.changes);
};
