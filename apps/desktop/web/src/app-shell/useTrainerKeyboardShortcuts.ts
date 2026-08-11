// SPDX-License-Identifier: GPL-3.0-only

import type { ActiveDrawTool } from "@/domains/chart/drawingTypes";
import type { OrderInputMode as TradeInputMode } from "@zinuto/shared/trading";
import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { WorkspacePage } from '@/frontend-kernel/workspacePageModel';
import { TRAINER_SHORTCUT_KEYS } from '@/ui/config/uiConfig';
import type { NoticeDialogState } from '@/frontend-kernel/notifications/globalNoticeDialog';
import {
  TRAINER_HOLD_SHORTCUT_REPEAT_DELAY_MS,
  TRAINER_HOLD_SHORTCUT_REPEAT_INTERVAL_MS
} from '@/frontend-kernel/runtimeConstants';
import { markTrainerHotInteractionInput } from '@/domains/trainer/trainerPerfTrace';
import {
  createTrainerKeyboardModifierState,
  hasTrainerKeyboardShortcutModifier,
  isTrainerBuyShortcutEvent,
  isTrainerPhysicalUndoKey,
  isTrainerSellShortcutEvent,
  isTrainerUndoShortcutEvent,
  resetTrainerKeyboardModifierState,
  resolveTrainerHoldShortcutActionKey,
  resolveTrainerRatioPresetHotkeyIndex,
  updateTrainerKeyboardModifierStateOnKeyDown,
  updateTrainerKeyboardModifierStateOnKeyUp,
  type TrainerHoldShortcutActionKey,
} from '@/app-shell/trainerKeyboardShortcutRouting';

type UseTrainerKeyboardShortcutsArgs = {
  noticeDialog: NoticeDialogState;
  setNoticeDialog: Dispatch<SetStateAction<NoticeDialogState>>;
  activePage: WorkspacePage;
  activeTrainingRecordNoteId: string;
  setActiveTrainingRecordNoteId: Dispatch<SetStateAction<string>>;
  activeDrawToolRef: MutableRefObject<ActiveDrawTool>;
  handleDrawToolSelect: (tool: ActiveDrawTool) => void;
  stepNext: () => Promise<void>;
  undo: () => Promise<void>;
  placeOrder: (side: 'BUY' | 'SELL') => Promise<void>;
  createTrainingRecordReplayNote: () => void;
  drawShortcutToolByKey: Record<string, ActiveDrawTool>;
  toggleAutoplay: () => Promise<void>;
  buyTradeInputMode: TradeInputMode;
  buyRatioPresetOptions: ReadonlyArray<string>;
  setBuyRatioInput: Dispatch<SetStateAction<string>>;
};

export const useTrainerKeyboardShortcuts = ({
  noticeDialog,
  setNoticeDialog,
  activePage,
  activeTrainingRecordNoteId,
  setActiveTrainingRecordNoteId,
  activeDrawToolRef,
  handleDrawToolSelect,
  stepNext,
  undo,
  placeOrder,
  createTrainingRecordReplayNote,
  drawShortcutToolByKey,
  toggleAutoplay,
  buyTradeInputMode,
  buyRatioPresetOptions,
  setBuyRatioInput
}: UseTrainerKeyboardShortcutsArgs) => {
  const latestRef = useRef<UseTrainerKeyboardShortcutsArgs>({
    noticeDialog,
    setNoticeDialog,
    activePage,
    activeTrainingRecordNoteId,
    setActiveTrainingRecordNoteId,
    activeDrawToolRef,
    handleDrawToolSelect,
    stepNext,
    undo,
    placeOrder,
    createTrainingRecordReplayNote,
    drawShortcutToolByKey,
    toggleAutoplay,
    buyTradeInputMode,
    buyRatioPresetOptions,
    setBuyRatioInput
  });

  latestRef.current = {
    noticeDialog,
    setNoticeDialog,
    activePage,
    activeTrainingRecordNoteId,
    setActiveTrainingRecordNoteId,
    activeDrawToolRef,
    handleDrawToolSelect,
    stepNext,
    undo,
    placeOrder,
    createTrainingRecordReplayNote,
    drawShortcutToolByKey,
    toggleAutoplay,
    buyTradeInputMode,
    buyRatioPresetOptions,
    setBuyRatioInput
  };
  const isShortcutPageActive =
    activePage === 'TRAINER' || activePage === 'SPECIAL_TRAINING';

  useEffect(() => {
    if (!isShortcutPageActive) {
      return;
    }
    const HOLD_REPEAT_DELAY_MS = TRAINER_HOLD_SHORTCUT_REPEAT_DELAY_MS;
    const HOLD_REPEAT_INTERVAL_MS = TRAINER_HOLD_SHORTCUT_REPEAT_INTERVAL_MS;

    type HoldActionState = {
      isPressed: boolean;
      isLooping: boolean;
      timeoutId: number | null;
    };

    const holdActionStateByKey = new Map<TrainerHoldShortcutActionKey, HoldActionState>();
    const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
    const getLatest = () => latestRef.current;
    const isTrainerPageActive = () => {
      const currentPage = getLatest().activePage;
      return currentPage === 'TRAINER' || currentPage === 'SPECIAL_TRAINING';
    };

    const getHoldActionState = (actionKey: TrainerHoldShortcutActionKey): HoldActionState => {
      const existing = holdActionStateByKey.get(actionKey);
      if (existing) {
        return existing;
      }
      const initial: HoldActionState = {
        isPressed: false,
        isLooping: false,
        timeoutId: null
      };
      holdActionStateByKey.set(actionKey, initial);
      return initial;
    };

    const clearHoldByActionKey = (actionKey: TrainerHoldShortcutActionKey) => {
      const state = getHoldActionState(actionKey);
      state.isPressed = false;
      if (typeof state.timeoutId === 'number') {
        window.clearTimeout(state.timeoutId);
      }
      state.timeoutId = null;
    };

    const clearAllHoldActions = () => {
      (['BUY', 'SELL', 'NEXT_BAR'] as const).forEach((actionKey) => clearHoldByActionKey(actionKey));
    };
    const trackedModifierState = createTrainerKeyboardModifierState();

    const startHoldAction = (
      actionKey: TrainerHoldShortcutActionKey,
      trigger: () => Promise<void>
    ) => {
      const state = getHoldActionState(actionKey);
      state.isPressed = true;
      if (state.isLooping) {
        return;
      }
      if (typeof state.timeoutId === 'number') {
        window.clearTimeout(state.timeoutId);
      }

      state.timeoutId = window.setTimeout(() => {
        state.timeoutId = null;
        void (async () => {
          state.isLooping = true;
          try {
            while (state.isPressed) {
              if (!isTrainerPageActive() || getLatest().activeTrainingRecordNoteId) {
                state.isPressed = false;
                break;
              }
              await trigger();
              if (!state.isPressed) {
                break;
              }
              await wait(HOLD_REPEAT_INTERVAL_MS);
            }
          } finally {
            state.isLooping = false;
          }
        })().catch((error) => {
          state.isLooping = false;
          console.error("[trainer-shortcuts] hold action failed", error);
        });
      }, HOLD_REPEAT_DELAY_MS);
    };

    const resolveTargetElement = (target: EventTarget | null): HTMLElement | null => {
      if (!target || !(target instanceof HTMLElement)) {
        return null;
      }
      return target;
    };

    const isTextInputTarget = (element: HTMLElement | null): boolean => {
      if (!element) {
        return false;
      }
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'OPTION'].includes(element.tagName)) {
        return element.tagName !== 'BUTTON';
      }
      if (element.isContentEditable) {
        return true;
      }
      return Boolean(
        element.closest('[contenteditable="true"], input, textarea, select, option')
      );
    };

    const isButtonLikeTarget = (element: HTMLElement | null): boolean => {
      if (!element) {
        return false;
      }
      if (element.tagName === 'BUTTON') {
        return true;
      }
      return Boolean(element.closest('button, [role="button"], [data-slot="button"]'));
    };

    const isLinkLikeTarget = (element: HTMLElement | null): boolean => {
      if (!element) {
        return false;
      }
      return Boolean(
        element.closest('a[href], summary')
      );
    };

    const isOverlayKeyboardTarget = (element: HTMLElement | null): boolean => {
      if (!element) {
        return false;
      }
      return Boolean(
        element.closest(
          '[role="dialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]'
        )
      );
    };

    const consumeShortcutEvent = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      updateTrainerKeyboardModifierStateOnKeyDown(trackedModifierState, event);
      const latest = getLatest();

      if (latest.noticeDialog) {
        consumeShortcutEvent(event);
        latest.setNoticeDialog(null);
        return;
      }

      if (!isTrainerPageActive()) {
        return;
      }
      if (latest.activeTrainingRecordNoteId) {
        if (event.key === 'Escape') {
          consumeShortcutEvent(event);
          latest.setActiveTrainingRecordNoteId('');
        }
        return;
      }

      const targetElement = resolveTargetElement(event.target);
      if (
        isTextInputTarget(targetElement) ||
        isLinkLikeTarget(targetElement) ||
        isOverlayKeyboardTarget(targetElement)
      ) {
        return;
      }

      if (isTrainerUndoShortcutEvent(event, trackedModifierState)) {
        consumeShortcutEvent(event);
        clearAllHoldActions();
        void latest.undo();
        return;
      }

      if (isButtonLikeTarget(targetElement)) {
        const activeElement = document.activeElement as HTMLElement | null;
        if (activeElement && typeof activeElement.blur === 'function') {
          activeElement.blur();
        }
      }

      if (event.repeat && event.code !== 'Space') {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === 'escape') {
        if (latest.activeDrawToolRef.current !== 'cursor') {
          consumeShortcutEvent(event);
          latest.handleDrawToolSelect('cursor');
        }
        return;
      }

      if (event.code === 'Space') {
        consumeShortcutEvent(event);
        const actionKey = 'NEXT_BAR';
        const state = getHoldActionState(actionKey);
        if (event.repeat || state.isPressed) {
          return;
        }
        markTrainerHotInteractionInput('STEP', 'keydown');
        void latest.stepNext();
        startHoldAction(actionKey, async () => {
          markTrainerHotInteractionInput('STEP', 'keydown');
          await getLatest().stepNext();
        });
        return;
      }

      if (hasTrainerKeyboardShortcutModifier(event, trackedModifierState)) {
        clearAllHoldActions();
        return;
      }
      if (isTrainerPhysicalUndoKey(event)) {
        clearAllHoldActions();
        return;
      }

      if (isTrainerPageActive() && latest.buyTradeInputMode === 'RATIO') {
        const ratioPresetHotkeyIndex = resolveTrainerRatioPresetHotkeyIndex(event);
        if (ratioPresetHotkeyIndex >= 0) {
          const ratioOption = latest.buyRatioPresetOptions[ratioPresetHotkeyIndex];
          if (typeof ratioOption === 'string' && ratioOption.length > 0) {
            consumeShortcutEvent(event);
            latest.setBuyRatioInput(ratioOption);
            return;
          }
        }
      }

      if (isTrainerBuyShortcutEvent(event)) {
        consumeShortcutEvent(event);
        const actionKey = 'BUY';
        const state = getHoldActionState(actionKey);
        if (event.repeat || state.isPressed) {
          return;
        }
        markTrainerHotInteractionInput('BUY', 'keydown');
        void latest.placeOrder('BUY');
        startHoldAction(actionKey, async () => {
          markTrainerHotInteractionInput('BUY', 'keydown');
          await getLatest().placeOrder('BUY');
        });
        return;
      }

      if (isTrainerSellShortcutEvent(event)) {
        consumeShortcutEvent(event);
        const actionKey = 'SELL';
        const state = getHoldActionState(actionKey);
        if (event.repeat || state.isPressed) {
          return;
        }
        markTrainerHotInteractionInput('SELL', 'keydown');
        void latest.placeOrder('SELL');
        startHoldAction(actionKey, async () => {
          markTrainerHotInteractionInput('SELL', 'keydown');
          await getLatest().placeOrder('SELL');
        });
        return;
      }

      if (key === TRAINER_SHORTCUT_KEYS.addNote) {
        consumeShortcutEvent(event);
        latest.createTrainingRecordReplayNote();
        return;
      }
      const drawTool = latest.drawShortcutToolByKey[key];
      if (drawTool) {
        consumeShortcutEvent(event);
        latest.handleDrawToolSelect(drawTool);
        return;
      }

      if (key === TRAINER_SHORTCUT_KEYS.autoPlay) {
        consumeShortcutEvent(event);
        void latest.toggleAutoplay();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const actionKey = resolveTrainerHoldShortcutActionKey(event);
      if (!actionKey) {
        updateTrainerKeyboardModifierStateOnKeyUp(trackedModifierState, event);
        return;
      }
      clearHoldByActionKey(actionKey);
      updateTrainerKeyboardModifierStateOnKeyUp(trackedModifierState, event);
    };

    const handleWindowBlur = () => {
      clearAllHoldActions();
      resetTrainerKeyboardModifierState(trackedModifierState);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearAllHoldActions();
        resetTrainerKeyboardModifierState(trackedModifierState);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearAllHoldActions();
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isShortcutPageActive]);
};
