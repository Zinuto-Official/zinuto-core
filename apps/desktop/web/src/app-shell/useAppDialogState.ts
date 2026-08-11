// SPDX-License-Identifier: GPL-3.0-only

import type { SavedDrawingOverlay } from "@/domains/chart/drawingTypes";
import { useState, type Dispatch, type SetStateAction } from 'react';
import type {
  ActionDialogState
} from "@/frontend-kernel/appTypes";
import type { OrderEndPromptState } from '@/app-shell/AppUtilityDialogs';
import type { NoticeDialogState } from '@/frontend-kernel/notifications/globalNoticeDialog';

type UseAppDialogStateResult = {
  showChartSettingsModal: boolean;
  setShowChartSettingsModal: Dispatch<SetStateAction<boolean>>;
  showTradingSettingsModal: boolean;
  setShowTradingSettingsModal: Dispatch<SetStateAction<boolean>>;
  actionDialog: ActionDialogState | null;
  setActionDialog: Dispatch<SetStateAction<ActionDialogState | null>>;
  noticeDialog: NoticeDialogState;
  setNoticeDialog: Dispatch<SetStateAction<NoticeDialogState>>;
  noticeCountdownMs: number | null;
  setNoticeCountdownMs: Dispatch<SetStateAction<number | null>>;
  orderEndPrompt: OrderEndPromptState;
  setOrderEndPrompt: Dispatch<SetStateAction<OrderEndPromptState>>;
  pendingRestoreDrawings: SavedDrawingOverlay[] | null;
  setPendingRestoreDrawings: Dispatch<SetStateAction<SavedDrawingOverlay[] | null>>;
  isPreparingAction: boolean;
  setIsPreparingAction: Dispatch<SetStateAction<boolean>>;
  showShortcutModal: boolean;
  setShowShortcutModal: Dispatch<SetStateAction<boolean>>;
};

export const useAppDialogState = (): UseAppDialogStateResult => {
  const [showChartSettingsModal, setShowChartSettingsModal] = useState(false);
  const [showTradingSettingsModal, setShowTradingSettingsModal] = useState(false);
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null);
  const [noticeDialog, setNoticeDialog] = useState<NoticeDialogState>(null);
  const [noticeCountdownMs, setNoticeCountdownMs] = useState<number | null>(null);
  const [orderEndPrompt, setOrderEndPrompt] = useState<OrderEndPromptState>(null);
  const [pendingRestoreDrawings, setPendingRestoreDrawings] = useState<SavedDrawingOverlay[] | null>(null);
  const [isPreparingAction, setIsPreparingAction] = useState(false);
  const [showShortcutModal, setShowShortcutModal] = useState(false);

  return {
    showChartSettingsModal,
    setShowChartSettingsModal,
    showTradingSettingsModal,
    setShowTradingSettingsModal,
    actionDialog,
    setActionDialog,
    noticeDialog,
    setNoticeDialog,
    noticeCountdownMs,
    setNoticeCountdownMs,
    orderEndPrompt,
    setOrderEndPrompt,
    pendingRestoreDrawings,
    setPendingRestoreDrawings,
    isPreparingAction,
    setIsPreparingAction,
    showShortcutModal,
    setShowShortcutModal
  };
};
