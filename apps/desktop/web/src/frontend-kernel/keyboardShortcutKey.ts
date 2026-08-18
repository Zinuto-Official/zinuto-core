// SPDX-License-Identifier: GPL-3.0-only

export type KeyboardShortcutKeyEvent = {
  key?: string;
  code?: string;
};

const normalizeKeyboardKey = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase();

/**
 * Resolve a fixed application shortcut from the physical key when available.
 * Windows IMEs can report `Process` (or a localized character) in
 * KeyboardEvent.key while KeyboardEvent.code still identifies KeyS/KeyR.
 */
export const resolveKeyboardShortcutKey = (
  event: KeyboardShortcutKeyEvent,
): string => {
  const code = String(event.code ?? "").trim();
  const physicalKey = /^(?:Key|Digit|Numpad)([A-Z0-9])$/u.exec(
    code,
  )?.[1];
  const key = normalizeKeyboardKey(event.key);
  return (
    physicalKey?.toLowerCase() ||
    (key !== "process" && key !== "unidentified" ? key : "") ||
    code.toLowerCase()
  );
};
