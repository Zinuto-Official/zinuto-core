// SPDX-License-Identifier: GPL-3.0-only

import {
  REPLAY_NOTE_COLOR_TOKENS,
  type ReplayNoteColorToken,
} from "@zinuto/shared/replayNoteColors";

export const REPLAY_NOTE_COLOR_OPTIONS: Array<{
  token: ReplayNoteColorToken;
  cssVar: string;
}> = [
  { token: "RED", cssVar: "var(--note-color-red)" },
  { token: "ORANGE", cssVar: "var(--note-color-orange)" },
  { token: "YELLOW", cssVar: "var(--note-color-yellow)" },
  { token: "GREEN", cssVar: "var(--note-color-green)" },
  { token: "BLUE", cssVar: "var(--note-color-blue)" },
];

const REPLAY_NOTE_COLOR_CSS_VAR_BY_TOKEN = Object.fromEntries(
  REPLAY_NOTE_COLOR_OPTIONS.map((option) => [option.token, option.cssVar]),
) as Record<ReplayNoteColorToken, string>;

export const resolveReplayNoteColorCssVar = (
  token: ReplayNoteColorToken | string | null | undefined,
): string =>
  REPLAY_NOTE_COLOR_CSS_VAR_BY_TOKEN[
    (REPLAY_NOTE_COLOR_TOKENS.includes(
      token as ReplayNoteColorToken,
    )
      ? token
      : "BLUE") as ReplayNoteColorToken
  ];
