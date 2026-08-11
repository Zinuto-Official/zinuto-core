// SPDX-License-Identifier: GPL-3.0-only

import { REPLAY_NOTE_TYPES } from "./replayNoteTypes.js";

export const REPLAY_NOTE_COLOR_TOKENS = [
  "RED",
  "ORANGE",
  "YELLOW",
  "GREEN",
  "BLUE",
] as const;

export type ReplayNoteColorToken = (typeof REPLAY_NOTE_COLOR_TOKENS)[number];

export const REPLAY_NOTE_SCOPE_FILTERS = [
  "ALL",
  ...REPLAY_NOTE_TYPES,
] as const;

export type ReplayNoteScopeFilter =
  (typeof REPLAY_NOTE_SCOPE_FILTERS)[number];

export const isReplayNoteColorToken = (
  value: unknown,
): value is ReplayNoteColorToken =>
  typeof value === "string" &&
  REPLAY_NOTE_COLOR_TOKENS.includes(value as ReplayNoteColorToken);

export const isReplayNoteScopeFilter = (
  value: unknown,
): value is ReplayNoteScopeFilter =>
  typeof value === "string" &&
  REPLAY_NOTE_SCOPE_FILTERS.includes(value as ReplayNoteScopeFilter);

export const normalizeReplayNoteColorTokens = (
  value: unknown,
): ReplayNoteColorToken[] => {
  const rawItems = Array.isArray(value) ? value : [];
  const seen = new Set<ReplayNoteColorToken>();
  const normalized: ReplayNoteColorToken[] = [];
  rawItems.forEach((item) => {
    const token = String(item ?? "").trim().toUpperCase();
    if (!isReplayNoteColorToken(token) || seen.has(token)) {
      return;
    }
    seen.add(token);
    normalized.push(token);
  });
  return normalized;
};
