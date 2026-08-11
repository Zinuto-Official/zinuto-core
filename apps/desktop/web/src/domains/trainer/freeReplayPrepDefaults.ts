// SPDX-License-Identifier: GPL-3.0-only

const FREE_REPLAY_DEFAULT_ANCHOR_MIN_RATIO = 0.1;
const FREE_REPLAY_DEFAULT_ANCHOR_MAX_RATIO = 0.85;

export const resolveDefaultFreeReplayPrepSymbol = ({
  availableSymbols,
  selectedSymbol,
}: {
  availableSymbols: string[];
  selectedSymbol: string;
}): string => {
  const normalizedSelectedSymbol = String(selectedSymbol || "")
    .trim()
    .toUpperCase();
  if (
    normalizedSelectedSymbol &&
    availableSymbols.includes(normalizedSelectedSymbol)
  ) {
    return normalizedSelectedSymbol;
  }
  return String(availableSymbols[0] || "")
    .trim()
    .toUpperCase();
};

export const resolveDefaultFocusedFreeReplayAnchorIndex = (
  totalBars: number,
): number | null => {
  const normalizedTotalBars = Math.max(
    0,
    Math.floor(Number(totalBars) || 0),
  );
  if (normalizedTotalBars < 2) {
    return null;
  }
  const maxIndex = Math.max(0, normalizedTotalBars - 1);
  const maxCursorIndex =
    normalizedTotalBars > 1 ? Math.max(0, maxIndex - 1) : 0;
  const minAnchorByRatio = Math.max(
    0,
    Math.min(
      maxCursorIndex,
      Math.ceil(maxCursorIndex * FREE_REPLAY_DEFAULT_ANCHOR_MIN_RATIO),
    ),
  );
  const maxAnchorByRatio = Math.max(
    minAnchorByRatio,
    Math.min(
      maxCursorIndex,
      Math.floor(maxCursorIndex * FREE_REPLAY_DEFAULT_ANCHOR_MAX_RATIO),
    ),
  );
  return Math.floor((minAnchorByRatio + maxAnchorByRatio) / 2);
};
