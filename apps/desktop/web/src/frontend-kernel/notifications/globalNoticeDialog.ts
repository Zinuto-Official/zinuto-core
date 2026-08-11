// SPDX-License-Identifier: GPL-3.0-only

export const APP_ERROR_DIALOG_AUTO_CLOSE_MS = 8_000;

export type NoticeDialogSeverity = "notice" | "error";

export type NoticeDialogState = {
  id: string;
  title: string;
  message: string;
  autoCloseMs?: number;
  severity: NoticeDialogSeverity;
} | null;

export type NoticeDialogInput = {
  title?: string | null;
  message: string;
  autoCloseMs?: number;
  severity?: NoticeDialogSeverity;
};

type NoticeDialogListener = (notice: NoticeDialogState) => void;

const noticeDialogListeners = new Set<NoticeDialogListener>();

let nextNoticeDialogId = 0;
let lastPublishedSignature = "";
let lastPublishedAtMs = 0;

const normalizeNoticeDialog = (
  input: NoticeDialogInput,
): NoticeDialogState => {
  const message = String(input.message || "").trim();
  if (!message) {
    return null;
  }
  nextNoticeDialogId += 1;
  return {
    id: `notice-${Date.now()}-${nextNoticeDialogId}`,
    title: String(input.title || "").trim(),
    message,
    autoCloseMs:
      typeof input.autoCloseMs === "number" && input.autoCloseMs >= 0
        ? input.autoCloseMs
        : undefined,
    severity: input.severity === "error" ? "error" : "notice",
  };
};

export const publishGlobalNoticeDialog = (
  input: NoticeDialogInput,
): NoticeDialogState => {
  const nextNotice = normalizeNoticeDialog(input);
  if (!nextNotice) {
    return null;
  }
  const nextSignature = [
    nextNotice.severity,
    nextNotice.title,
    nextNotice.message,
  ].join("::");
  const nowMs = Date.now();
  if (
    nextSignature === lastPublishedSignature &&
    nowMs - lastPublishedAtMs < 1_200
  ) {
    return nextNotice;
  }
  lastPublishedSignature = nextSignature;
  lastPublishedAtMs = nowMs;
  noticeDialogListeners.forEach((listener) => {
    listener(nextNotice);
  });
  return nextNotice;
};

export const subscribeToGlobalNoticeDialog = (
  listener: NoticeDialogListener,
): (() => void) => {
  noticeDialogListeners.add(listener);
  return () => {
    noticeDialogListeners.delete(listener);
  };
};

export const showGlobalNoticeDialog = (
  message: string,
  title?: string,
  autoCloseMs?: number,
): NoticeDialogState =>
  publishGlobalNoticeDialog({
    autoCloseMs,
    message,
    severity: "notice",
    title,
  });

export const showGlobalErrorDialog = (
  message: string,
  title?: string,
  autoCloseMs = APP_ERROR_DIALOG_AUTO_CLOSE_MS,
): NoticeDialogState =>
  publishGlobalNoticeDialog({
    autoCloseMs,
    message,
    severity: "error",
    title,
  });
