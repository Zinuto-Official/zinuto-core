// SPDX-License-Identifier: GPL-3.0-only

export const MANUAL_ACTION_UNDO_MAX_STEPS = 5;

export type ManualActionUndoEntry<TAction extends string, TSnapshot> = {
  action: TAction;
  snapshot: TSnapshot;
  createdAt: string;
};

export const pushBoundedUndoEntry = <TAction extends string, TSnapshot>(
  entries: readonly ManualActionUndoEntry<TAction, TSnapshot>[],
  entry: ManualActionUndoEntry<TAction, TSnapshot>,
  maxSteps = MANUAL_ACTION_UNDO_MAX_STEPS,
): ManualActionUndoEntry<TAction, TSnapshot>[] => {
  const nextEntries = [...entries, entry];
  if (nextEntries.length <= maxSteps) {
    return nextEntries;
  }
  return nextEntries.slice(nextEntries.length - maxSteps);
};

export const peekLatestUndoEntry = <TAction extends string, TSnapshot>(
  entries: readonly ManualActionUndoEntry<TAction, TSnapshot>[],
): ManualActionUndoEntry<TAction, TSnapshot> | null =>
  entries.length > 0 ? entries[entries.length - 1] ?? null : null;

export const popLatestUndoEntry = <TAction extends string, TSnapshot>(
  entries: readonly ManualActionUndoEntry<TAction, TSnapshot>[],
): {
  entry: ManualActionUndoEntry<TAction, TSnapshot> | null;
  remainingEntries: ManualActionUndoEntry<TAction, TSnapshot>[];
} => {
  if (entries.length <= 0) {
    return {
      entry: null,
      remainingEntries: [],
    };
  }
  return {
    entry: entries[entries.length - 1] ?? null,
    remainingEntries: entries.slice(0, entries.length - 1),
  };
};
