// SPDX-License-Identifier: GPL-3.0-only

import type { CSSProperties } from "react";
import { Button } from "@/ui/primitives/button";
import type { ReplayNoteColorToken } from "@zinuto/shared/replayNoteColors";
import {
  REPLAY_NOTE_COLOR_OPTIONS,
  resolveReplayNoteColorCssVar,
} from "@/workspaces/notes/noteColorPalette";

export const notesColorStyle = (colorToken: string): CSSProperties =>
  ({
    "--notes-color-accent": resolveReplayNoteColorCssVar(colorToken),
  }) as CSSProperties;

export const NotesColorDot = ({
  colorToken,
  className = "",
}: {
  colorToken: ReplayNoteColorToken;
  className?: string;
}) => (
  <span
    className={`notes-color-dot ${className}`.trim()}
    style={notesColorStyle(colorToken)}
  />
);

const toggleColorToken = (
  tokens: ReplayNoteColorToken[],
  token: ReplayNoteColorToken,
): ReplayNoteColorToken[] =>
  tokens.includes(token)
    ? tokens.filter((item) => item !== token)
    : [...tokens, token];

export const NoteColorToggleRow = ({
  value,
  onChange,
  ariaLabel,
}: {
  value: ReplayNoteColorToken[];
  onChange: (tokens: ReplayNoteColorToken[]) => void;
  ariaLabel: string;
}) => (
  <div className="notes-color-toggle-row" role="group" aria-label={ariaLabel}>
    {REPLAY_NOTE_COLOR_OPTIONS.map((option) => {
      const active = value.includes(option.token);
      return (
        <Button
          key={option.token}
          type="button"
          variant="ghost"
          size="icon-sm"
          className="notes-color-toggle"
          style={notesColorStyle(option.token)}
          data-active={active ? "true" : undefined}
          aria-pressed={active}
          onClick={() => onChange(toggleColorToken(value, option.token))}
        >
          <NotesColorDot colorToken={option.token} />
        </Button>
      );
    })}
  </div>
);
