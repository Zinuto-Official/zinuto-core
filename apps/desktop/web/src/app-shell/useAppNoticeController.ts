// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import {
  APP_ERROR_DIALOG_AUTO_CLOSE_MS,
  type NoticeDialogState,
} from '@/frontend-kernel/notifications/globalNoticeDialog';

type UseAppNoticeControllerArgs = {
  noticeDialog: NoticeDialogState;
  setNoticeDialog: Dispatch<SetStateAction<NoticeDialogState>>;
  setNoticeCountdownMs: Dispatch<SetStateAction<number | null>>;
  resolveDefaultNoticeTitle: () => string;
};

export const useAppNoticeController = ({
  noticeDialog,
  setNoticeDialog,
  setNoticeCountdownMs,
  resolveDefaultNoticeTitle,
}: UseAppNoticeControllerArgs) => {
  const showNotice = useCallback((message: string, title = resolveDefaultNoticeTitle(), autoCloseMs?: number) => {
    setNoticeDialog({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      message,
      autoCloseMs,
      severity: 'notice',
    });
  }, [resolveDefaultNoticeTitle, setNoticeDialog]);

  const showErrorDialog = useCallback(
    (
      message: string,
      title = resolveDefaultNoticeTitle(),
      autoCloseMs = APP_ERROR_DIALOG_AUTO_CLOSE_MS,
    ) => {
      setNoticeDialog({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        message,
        autoCloseMs,
        severity: 'error',
      });
    },
    [resolveDefaultNoticeTitle, setNoticeDialog],
  );

  useEffect(() => {
    if (!noticeDialog?.autoCloseMs) {
      setNoticeCountdownMs(null);
      return;
    }
    const duration = Math.max(0, noticeDialog.autoCloseMs);
    const currentNoticeId = noticeDialog.id;
    const endsAtMs = Date.now() + duration;
    setNoticeCountdownMs(duration);
    const ticker = window.setInterval(() => {
      const remain = Math.max(0, endsAtMs - Date.now());
      setNoticeCountdownMs(remain);
      if (remain <= 0) {
        window.clearInterval(ticker);
        setNoticeDialog((current) => (current?.id === currentNoticeId ? null : current));
      }
    }, 1_000);
    return () => {
      window.clearInterval(ticker);
    };
  }, [noticeDialog, setNoticeCountdownMs, setNoticeDialog]);

  return {
    showErrorDialog,
    showNotice
  };
};
