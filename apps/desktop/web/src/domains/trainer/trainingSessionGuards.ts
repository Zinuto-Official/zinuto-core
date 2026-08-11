// SPDX-License-Identifier: GPL-3.0-only

// Session guard utilities.
// Canonical implementations in local-api/src/application/trading/sessionReadModel.ts.
// These are thin wrappers for runtime guard callers that need in-memory snapshot validation.

import type { SessionSnapshot, SessionTerminationReasonCode } from "@/domains/training/types";

export const normalizeTrainingSessionId = (value: unknown): string =>
  String(value ?? "").trim();

export const isSnapshotForSession = (
  snapshot: Pick<SessionSnapshot, "session"> | null | undefined,
  sessionId: unknown,
): boolean => {
  const normalizedSessionId = normalizeTrainingSessionId(sessionId);
  if (!normalizedSessionId || !snapshot) {
    return false;
  }
  return normalizeTrainingSessionId(snapshot.session?.id) === normalizedSessionId;
};

export const readActiveSessionTerminationReasonCode = (
  snapshot: SessionSnapshot | null | undefined,
  sessionId: unknown,
): SessionTerminationReasonCode | null => {
  const activeSnapshot = snapshot;
  if (!activeSnapshot || !isSnapshotForSession(activeSnapshot, sessionId)) {
    return null;
  }
  return activeSnapshot.termination?.isTerminated
    ? (activeSnapshot.termination.reasonCode ?? null)
    : null;
};
