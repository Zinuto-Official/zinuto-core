// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useMemo } from 'react';
import type { AppUtilityDialogsProps } from '@/app-shell/AppUtilityDialogs';

type UseAppUtilityDialogsPropsArgs = {
  actionDialogOpen: boolean;
  noticeDialog: AppUtilityDialogsProps['noticeDialog'];
  noticeCountdownSec: number;
  setNoticeDialog: (value: AppUtilityDialogsProps['noticeDialog']) => void;
  orderEndPrompt: AppUtilityDialogsProps['orderEndPrompt'];
  setOrderEndPrompt: (value: AppUtilityDialogsProps['orderEndPrompt']) => void;
  onConfirmOrderEndPrompt: () => void;
  compactScriptLanguage: boolean;
  tt: AppUtilityDialogsProps['tt'];
  ttf: AppUtilityDialogsProps['ttf'];
};

export const useAppUtilityDialogsProps = ({
  actionDialogOpen,
  noticeDialog,
  noticeCountdownSec,
  setNoticeDialog,
  orderEndPrompt,
  setOrderEndPrompt,
  onConfirmOrderEndPrompt,
  compactScriptLanguage,
  tt,
  ttf
}: UseAppUtilityDialogsPropsArgs): AppUtilityDialogsProps => {
  const onCloseNoticeDialog = useCallback(() => {
    setNoticeDialog(null);
  }, [setNoticeDialog]);

  const onCloseOrderEndPrompt = useCallback(() => {
    setOrderEndPrompt(null);
  }, [setOrderEndPrompt]);

  return useMemo(
    () => ({
      actionDialogOpen,
      noticeDialog,
      noticeCountdownSec,
      onCloseNoticeDialog,
      orderEndPrompt,
      onCloseOrderEndPrompt,
      onConfirmOrderEndPrompt,
      compactScriptLanguage,
      tt,
      ttf
    }),
    [
      actionDialogOpen,
      noticeDialog,
      noticeCountdownSec,
      onCloseNoticeDialog,
      orderEndPrompt,
      onCloseOrderEndPrompt,
      onConfirmOrderEndPrompt,
      compactScriptLanguage,
      tt,
      ttf
    ]
  );
};
