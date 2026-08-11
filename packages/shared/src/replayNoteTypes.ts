// SPDX-License-Identifier: GPL-3.0-only

export const REPLAY_NOTE_TYPES = [
  "FREE_REPLAY",
  "CHALLENGE",
  "CUSTOM",
] as const;

export type ReplayNoteType = (typeof REPLAY_NOTE_TYPES)[number];

export const isReplayNoteType = (value: unknown): value is ReplayNoteType =>
  typeof value === "string" &&
  REPLAY_NOTE_TYPES.includes(value as ReplayNoteType);
