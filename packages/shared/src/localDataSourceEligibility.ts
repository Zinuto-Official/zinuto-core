// SPDX-License-Identifier: GPL-3.0-only

export type LocalDataSourceTrainingEligibilityInput = {
  status?: unknown;
  deletionState?: unknown;
  /**
   * The desktop source-list contract exposes the runtime deletion state as an
   * operational lock. Keeping this optional preserves compatibility with
   * callers that read the database row directly.
   */
  sourceLocked?: unknown;
};

const normalizeState = (value: unknown): string =>
  String(value ?? "").trim().toUpperCase();

/**
 * A local source may contribute to training only after importing successfully
 * and while it is not being deleted or otherwise mutated. Older rows predate
 * `deletion_state`; their blank value is deliberately treated as `IDLE`.
 */
export const isLocalDataSourceEligibleForTraining = ({
  status,
  deletionState,
  sourceLocked,
}: LocalDataSourceTrainingEligibilityInput): boolean => {
  const normalizedDeletionState = normalizeState(deletionState);
  const deletionStateIsIdle =
    !normalizedDeletionState || normalizedDeletionState === "IDLE";
  return (
    normalizeState(status) === "READY" &&
    deletionStateIsIdle &&
    sourceLocked !== true
  );
};
