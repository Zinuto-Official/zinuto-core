// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";
import {
  createTrainerKeyboardModifierState,
  hasTrainerKeyboardShortcutModifier,
  isTrainerBuyShortcutEvent,
  isTrainerPhysicalUndoKey,
  isTrainerSellShortcutEvent,
  isTrainerUndoShortcutEvent,
  resolveTrainerHoldShortcutActionKey,
  resolveTrainerRatioPresetHotkeyIndex,
  resolveTrainerShortcutKey,
  updateTrainerKeyboardModifierStateOnKeyDown,
  updateTrainerKeyboardModifierStateOnKeyUp,
} from "../../src/app-shell/trainerKeyboardShortcutRouting";

test("trainer keyboard routing treats Cmd+physical Z as undo even when layout key is not z", () => {
  const tracked = createTrainerKeyboardModifierState();
  updateTrainerKeyboardModifierStateOnKeyDown(tracked, { key: "Meta" });

  assert.equal(
    isTrainerUndoShortcutEvent(
      {
        key: "s",
        code: "KeyZ",
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      },
      tracked,
    ),
    true,
  );

  assert.equal(
    hasTrainerKeyboardShortcutModifier(
      {
        key: "s",
        code: "KeyZ",
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      },
      tracked,
    ),
    true,
  );
});

test("trainer keyboard routing blocks plain buy/sell shortcuts while Cmd is tracked", () => {
  const tracked = createTrainerKeyboardModifierState();
  updateTrainerKeyboardModifierStateOnKeyDown(tracked, { key: "Meta" });

  assert.equal(
    isTrainerUndoShortcutEvent(
      {
        key: "s",
        code: "KeyS",
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      },
      tracked,
    ),
    false,
  );
  assert.equal(
    hasTrainerKeyboardShortcutModifier(
      {
        key: "s",
        code: "KeyS",
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      },
      tracked,
    ),
    true,
  );

  updateTrainerKeyboardModifierStateOnKeyUp(tracked, { key: "Meta" });
  assert.equal(
    hasTrainerKeyboardShortcutModifier(
      {
        key: "s",
        code: "KeyS",
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      },
      tracked,
    ),
    false,
  );
});

test("trainer keyboard routing still recognizes normal Cmd+Z event fields", () => {
  const tracked = createTrainerKeyboardModifierState();

  assert.equal(
    isTrainerUndoShortcutEvent(
      {
        key: "z",
        code: "KeyZ",
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      },
      tracked,
    ),
    true,
  );
});

test("trainer keyboard routing blocks physical Z from plain trade shortcuts when modifier state is lost", () => {
  assert.equal(
    isTrainerPhysicalUndoKey({
      key: "s",
      code: "KeyZ",
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    }),
    true,
  );
});

test("trainer keyboard routing recognizes physical buy and sell hotkeys", () => {
  assert.equal(isTrainerBuyShortcutEvent({ key: "b", code: "" }), true);
  assert.equal(isTrainerBuyShortcutEvent({ key: "", code: "KeyB" }), true);
  assert.equal(isTrainerBuyShortcutEvent({ key: "Process", code: "KeyB" }), true);

  assert.equal(isTrainerSellShortcutEvent({ key: "s", code: "" }), true);
  assert.equal(isTrainerSellShortcutEvent({ key: "", code: "KeyS" }), true);
  assert.equal(isTrainerSellShortcutEvent({ key: "Process", code: "KeyS" }), true);
});

test("trainer keyboard routing uses the physical key when an IME localizes event.key", () => {
  assert.equal(
    resolveTrainerShortcutKey({ key: "Process", code: "KeyN" }),
    "n",
  );
  assert.equal(
    resolveTrainerShortcutKey({ key: "漢", code: "KeyK" }),
    "k",
  );
  assert.equal(resolveTrainerShortcutKey({ key: "n", code: "" }), "n");
});

test("trainer keyboard routing maps hold shortcuts for all trainer surfaces", () => {
  assert.equal(resolveTrainerHoldShortcutActionKey({ code: "Space" }), "NEXT_BAR");
  assert.equal(
    resolveTrainerHoldShortcutActionKey({ key: "", code: "KeyB" }),
    "BUY",
  );
  assert.equal(
    resolveTrainerHoldShortcutActionKey({ key: "", code: "KeyS" }),
    "SELL",
  );
  assert.equal(resolveTrainerHoldShortcutActionKey({ key: "x", code: "KeyX" }), null);
});

test("trainer keyboard routing maps ratio preset hotkeys from key and physical code", () => {
  assert.equal(resolveTrainerRatioPresetHotkeyIndex({ key: "1" }), 0);
  assert.equal(resolveTrainerRatioPresetHotkeyIndex({ key: "4" }), 3);
  assert.equal(resolveTrainerRatioPresetHotkeyIndex({ key: "", code: "Digit1" }), 0);
  assert.equal(resolveTrainerRatioPresetHotkeyIndex({ key: "", code: "Digit4" }), 3);
  assert.equal(resolveTrainerRatioPresetHotkeyIndex({ key: "", code: "Numpad2" }), 1);
  assert.equal(resolveTrainerRatioPresetHotkeyIndex({ key: "", code: "Digit5" }), -1);
});
