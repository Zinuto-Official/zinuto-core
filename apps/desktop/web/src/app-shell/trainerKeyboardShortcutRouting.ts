// SPDX-License-Identifier: GPL-3.0-only

import { resolveKeyboardShortcutKey } from "@/frontend-kernel/keyboardShortcutKey";

export type TrainerKeyboardModifierState = {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

export type TrainerKeyboardEventLike = {
  key?: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  getModifierState?: (keyArg: string) => boolean;
};

export type TrainerHoldShortcutActionKey = "BUY" | "SELL" | "NEXT_BAR";

export const createTrainerKeyboardModifierState = (): TrainerKeyboardModifierState => ({
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
});

export const resolveTrainerShortcutKey = (
  event: TrainerKeyboardEventLike,
): string => resolveKeyboardShortcutKey(event);

const normalizeKeyboardKey = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase();

const isModifierKey = (
  event: TrainerKeyboardEventLike,
  keyName: "meta" | "control" | "alt" | "shift",
): boolean => normalizeKeyboardKey(event.key) === keyName;

export const resetTrainerKeyboardModifierState = (
  state: TrainerKeyboardModifierState,
) => {
  state.metaKey = false;
  state.ctrlKey = false;
  state.altKey = false;
  state.shiftKey = false;
};

export const updateTrainerKeyboardModifierStateOnKeyDown = (
  state: TrainerKeyboardModifierState,
  event: TrainerKeyboardEventLike,
) => {
  if (isModifierKey(event, "meta")) {
    state.metaKey = true;
  } else if (isModifierKey(event, "control")) {
    state.ctrlKey = true;
  } else if (isModifierKey(event, "alt")) {
    state.altKey = true;
  } else if (isModifierKey(event, "shift")) {
    state.shiftKey = true;
  }
};

export const updateTrainerKeyboardModifierStateOnKeyUp = (
  state: TrainerKeyboardModifierState,
  event: TrainerKeyboardEventLike,
) => {
  if (isModifierKey(event, "meta")) {
    state.metaKey = false;
  } else if (isModifierKey(event, "control")) {
    state.ctrlKey = false;
  } else if (isModifierKey(event, "alt")) {
    state.altKey = false;
  } else if (isModifierKey(event, "shift")) {
    state.shiftKey = false;
  }
};

const resolveModifierActive = (
  event: TrainerKeyboardEventLike,
  trackedState: TrainerKeyboardModifierState,
  eventFlag: "metaKey" | "ctrlKey" | "altKey" | "shiftKey",
  modifierName: "Meta" | "Control" | "Alt" | "Shift",
): boolean =>
  Boolean(
    event[eventFlag] ||
      trackedState[eventFlag] ||
      event.getModifierState?.(modifierName),
  );

export const hasTrainerKeyboardShortcutModifier = (
  event: TrainerKeyboardEventLike,
  trackedState: TrainerKeyboardModifierState,
): boolean =>
  resolveModifierActive(event, trackedState, "metaKey", "Meta") ||
  resolveModifierActive(event, trackedState, "ctrlKey", "Control") ||
  resolveModifierActive(event, trackedState, "altKey", "Alt") ||
  resolveModifierActive(event, trackedState, "shiftKey", "Shift");

export const isTrainerUndoShortcutEvent = (
  event: TrainerKeyboardEventLike,
  trackedState: TrainerKeyboardModifierState,
): boolean => {
  const hasPrimaryModifier =
    resolveModifierActive(event, trackedState, "metaKey", "Meta") ||
    resolveModifierActive(event, trackedState, "ctrlKey", "Control");
  if (!hasPrimaryModifier) {
    return false;
  }
  if (
    resolveModifierActive(event, trackedState, "altKey", "Alt") ||
    resolveModifierActive(event, trackedState, "shiftKey", "Shift")
  ) {
    return false;
  }
  return normalizeKeyboardKey(event.key) === "z" || event.code === "KeyZ";
};

export const isTrainerPhysicalUndoKey = (
  event: TrainerKeyboardEventLike,
): boolean => event.code === "KeyZ";

export const isTrainerBuyShortcutEvent = (
  event: TrainerKeyboardEventLike,
): boolean => normalizeKeyboardKey(event.key) === "b" || event.code === "KeyB";

export const isTrainerSellShortcutEvent = (
  event: TrainerKeyboardEventLike,
): boolean => normalizeKeyboardKey(event.key) === "s" || event.code === "KeyS";

export const resolveTrainerHoldShortcutActionKey = (
  event: TrainerKeyboardEventLike,
): TrainerHoldShortcutActionKey | null => {
  if (event.code === "Space") {
    return "NEXT_BAR";
  }
  if (isTrainerBuyShortcutEvent(event)) {
    return "BUY";
  }
  if (isTrainerSellShortcutEvent(event)) {
    return "SELL";
  }
  return null;
};

export const resolveTrainerRatioPresetHotkeyIndex = (
  event: TrainerKeyboardEventLike,
): number => {
  const key = normalizeKeyboardKey(event.key);
  if (key >= "1" && key <= "4") {
    return Number(key) - 1;
  }

  const code = String(event.code ?? "");
  const digitMatch = /^(?:Digit|Numpad)([1-4])$/.exec(code);
  if (digitMatch) {
    return Number(digitMatch[1]) - 1;
  }

  return -1;
};
