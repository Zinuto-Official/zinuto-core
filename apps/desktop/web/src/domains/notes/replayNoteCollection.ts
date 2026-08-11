// SPDX-License-Identifier: GPL-3.0-only

export type ReplayNoteCollectionItem = {
  id: string;
  updatedAt: string;
  createdAt: string;
  optimistic?: boolean;
};

const compareTextDescending = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }
  return left > right ? -1 : 1;
};

export const compareReplayNotesByServerOrder = <
  T extends ReplayNoteCollectionItem,
>(
  left: T,
  right: T,
): number => {
  if (Boolean(left.optimistic) !== Boolean(right.optimistic)) {
    return left.optimistic ? -1 : 1;
  }
  return (
    compareTextDescending(left.updatedAt, right.updatedAt) ||
    compareTextDescending(left.createdAt, right.createdAt) ||
    compareTextDescending(left.id, right.id)
  );
};

export const mergeReplayNotesByServerOrder = <
  T extends ReplayNoteCollectionItem,
>({
  current,
  incoming,
  retainUnmatched,
  mergeItem,
}: {
  current: readonly T[];
  incoming: readonly T[];
  retainUnmatched: "all" | "optimistic";
  mergeItem: (existing: T | undefined, incoming: T) => T;
}): T[] => {
  const currentById = new Map(current.map((item) => [item.id, item] as const));
  const mergedById = new Map<string, T>();

  current.forEach((item) => {
    if (retainUnmatched === "all" || item.optimistic === true) {
      mergedById.set(item.id, item);
    }
  });
  incoming.forEach((item) => {
    mergedById.set(item.id, mergeItem(currentById.get(item.id), item));
  });

  return [...mergedById.values()].sort(compareReplayNotesByServerOrder);
};
