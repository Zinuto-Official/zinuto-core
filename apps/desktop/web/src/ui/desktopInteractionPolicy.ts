// SPDX-License-Identifier: GPL-3.0-only

import { resolveKeyboardShortcutKey } from "@/frontend-kernel/keyboardShortcutKey";

export const ZINUTO_CONTEXT_MENU_TRIGGER_ATTRIBUTE =
  "data-zinuto-context-menu";
export const ZINUTO_CONTEXT_MENU_TRIGGER_VALUE = "app";
export const ZINUTO_CONTEXT_MENU_TRIGGER_SELECTOR = `[${ZINUTO_CONTEXT_MENU_TRIGGER_ATTRIBUTE}="${ZINUTO_CONTEXT_MENU_TRIGGER_VALUE}"]`;
export const ZINUTO_DEV_TEXT_SELECTION_ATTRIBUTE =
  "data-zinuto-dev-text-selection";
export const ZINUTO_DEV_TEXT_SELECTION_VALUE = "enabled";

const EDITABLE_TEXT_INPUT_SELECTOR = [
  "input:not([type])",
  'input[type="date"]',
  'input[type="datetime-local"]',
  'input[type="email"]',
  'input[type="month"]',
  'input[type="number"]',
  'input[type="password"]',
  'input[type="search"]',
  'input[type="tel"]',
  'input[type="text"]',
  'input[type="time"]',
  'input[type="url"]',
  'input[type="week"]',
  "textarea",
].join(", ");

const EDITOR_SURFACE_SELECTOR = [
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="textbox"]',
  ".cm-editor",
  ".cm-content",
  ".custom-indicator-code-editor",
  ".replay-note-lexical-content",
].join(", ");

export const DESKTOP_INTERACTION_EDITABLE_SELECTOR = [
  EDITABLE_TEXT_INPUT_SELECTOR,
  EDITOR_SURFACE_SELECTOR,
].join(", ");

type ClosestCapableTarget = {
  closest: (selector: string) => unknown;
  isContentEditable?: boolean;
  nodeType?: number;
  parentElement?: unknown;
};

type DesktopShortcutEvent = {
  altKey?: boolean;
  code?: string;
  ctrlKey?: boolean;
  key?: string;
  metaKey?: boolean;
  shiftKey?: boolean;
};

type DesktopTextSelectionPolicyOptions = {
  allowGlobalTextSelection?: boolean;
};

type DesktopInteractionPolicyInstallOptions = {
  allowGlobalTextSelection?: boolean;
};

const TEXT_NODE_TYPE = 3;
const DEVTOOLS_LETTER_KEYS = new Set(["c", "i", "j"]);

const isClosestCapableTarget = (
  target: unknown,
): target is ClosestCapableTarget =>
  Boolean(
    target &&
      typeof target === "object" &&
      typeof (target as ClosestCapableTarget).closest === "function",
  );

const resolveClosestCapableTarget = (
  target: unknown,
): ClosestCapableTarget | null => {
  if (!target || typeof target !== "object") {
    return null;
  }
  const candidate = target as ClosestCapableTarget;
  if (candidate.nodeType === TEXT_NODE_TYPE) {
    return isClosestCapableTarget(candidate.parentElement)
      ? candidate.parentElement
      : null;
  }
  return isClosestCapableTarget(candidate) ? candidate : null;
};

const closestMatches = (
  target: ClosestCapableTarget,
  selector: string,
): boolean => Boolean(target.closest(selector));

const resolveShortcutKey = (event: DesktopShortcutEvent): string =>
  resolveKeyboardShortcutKey(event);

export const shouldAllowDesktopContextMenu = (
  target: unknown,
): boolean => {
  const closestCapableTarget = resolveClosestCapableTarget(target);
  if (!closestCapableTarget) {
    return false;
  }
  if (
    closestMatches(
      closestCapableTarget,
      ZINUTO_CONTEXT_MENU_TRIGGER_SELECTOR,
    )
  ) {
    return true;
  }
  if (closestCapableTarget.isContentEditable) {
    return true;
  }
  return closestMatches(
    closestCapableTarget,
    DESKTOP_INTERACTION_EDITABLE_SELECTOR,
  );
};

export const shouldPreventDesktopContextMenu = (
  target: unknown,
): boolean => !shouldAllowDesktopContextMenu(target);

export const shouldAllowDesktopTextSelection = (
  target: unknown,
  options: DesktopTextSelectionPolicyOptions = {},
): boolean => {
  if (options.allowGlobalTextSelection) {
    return true;
  }
  const closestCapableTarget = resolveClosestCapableTarget(target);
  if (!closestCapableTarget) {
    return false;
  }
  if (closestCapableTarget.isContentEditable) {
    return true;
  }
  return closestMatches(
    closestCapableTarget,
    DESKTOP_INTERACTION_EDITABLE_SELECTOR,
  );
};

export const shouldPreventDesktopTextSelection = (
  target: unknown,
  options: DesktopTextSelectionPolicyOptions = {},
): boolean => !shouldAllowDesktopTextSelection(target, options);

export const setDesktopDevTextSelectionEnabled = (
  enabled: boolean,
  ownerDocument: Document = document,
): void => {
  if (enabled) {
    ownerDocument.documentElement.setAttribute(
      ZINUTO_DEV_TEXT_SELECTION_ATTRIBUTE,
      ZINUTO_DEV_TEXT_SELECTION_VALUE,
    );
    return;
  }
  ownerDocument.documentElement.removeAttribute(
    ZINUTO_DEV_TEXT_SELECTION_ATTRIBUTE,
  );
};

export const isDesktopDevTextSelectionEnabled = (
  ownerDocument: Document = document,
): boolean =>
  ownerDocument.documentElement.getAttribute(
    ZINUTO_DEV_TEXT_SELECTION_ATTRIBUTE,
  ) === ZINUTO_DEV_TEXT_SELECTION_VALUE;

export const isDesktopDevtoolsShortcut = (
  event: DesktopShortcutEvent,
): boolean => {
  const shortcutKey = resolveShortcutKey(event);
  if (shortcutKey === "f12") {
    return true;
  }
  if (!DEVTOOLS_LETTER_KEYS.has(shortcutKey)) {
    return false;
  }
  const hasPrimaryModifier = Boolean(event.ctrlKey || event.metaKey);
  if (!hasPrimaryModifier) {
    return false;
  }
  if (event.shiftKey && !event.altKey) {
    return true;
  }
  return Boolean(event.metaKey && event.altKey && !event.shiftKey);
};

const stopDesktopShellEvent = (event: Event) => {
  event.preventDefault();
  event.stopPropagation();
  const maybeImmediateStop = event as Event & {
    stopImmediatePropagation?: () => void;
  };
  maybeImmediateStop.stopImmediatePropagation?.();
};

const hasDesktopSelectedText = (ownerWindow: Window | null): boolean =>
  Boolean(ownerWindow?.getSelection()?.toString());

export const installDesktopInteractionPolicy = (
  ownerDocument: Document = document,
  options: DesktopInteractionPolicyInstallOptions = {},
): (() => void) => {
  const { allowGlobalTextSelection = false } = options;
  const ownerWindow = ownerDocument.defaultView;
  setDesktopDevTextSelectionEnabled(allowGlobalTextSelection, ownerDocument);
  const handleContextMenu = (event: MouseEvent) => {
    if (
      isDesktopDevTextSelectionEnabled(ownerDocument) &&
      hasDesktopSelectedText(ownerWindow)
    ) {
      return;
    }
    if (shouldPreventDesktopContextMenu(event.target)) {
      event.preventDefault();
    }
  };
  const handleSelectStart = (event: Event) => {
    if (
      shouldPreventDesktopTextSelection(event.target, {
        allowGlobalTextSelection:
          isDesktopDevTextSelectionEnabled(ownerDocument),
      })
    ) {
      event.preventDefault();
    }
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    if (isDesktopDevtoolsShortcut(event)) {
      stopDesktopShellEvent(event);
    }
  };
  ownerDocument.addEventListener("contextmenu", handleContextMenu, {
    capture: true,
  });
  ownerDocument.addEventListener("selectstart", handleSelectStart, {
    capture: true,
  });
  ownerDocument.addEventListener("keydown", handleKeyDown, {
    capture: true,
  });
  ownerWindow?.addEventListener("keydown", handleKeyDown, {
    capture: true,
  });
  return () => {
    ownerDocument.removeEventListener("contextmenu", handleContextMenu, {
      capture: true,
    });
    ownerDocument.removeEventListener("selectstart", handleSelectStart, {
      capture: true,
    });
    ownerDocument.removeEventListener("keydown", handleKeyDown, {
      capture: true,
    });
    ownerWindow?.removeEventListener("keydown", handleKeyDown, {
      capture: true,
    });
  };
};
