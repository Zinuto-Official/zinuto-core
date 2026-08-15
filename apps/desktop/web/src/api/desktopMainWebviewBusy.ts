// SPDX-License-Identifier: GPL-3.0-only

import {
  invokeMainWebviewBusySignal,
  isTauriRuntime,
} from "@/api/desktopNativeBridge";

// The busy signal keeps the macOS webview watchdog from reloading the window
// while the renderer is knowingly running a long operation. It is refreshed
// periodically by the reporter and expires natively after 30 seconds.
const MAIN_WEBVIEW_BUSY_REFRESH_INTERVAL_MS = 5_000;

let lastReportedBusy = false;
let refreshTimerId: number | null = null;

const sendMainWebviewBusySignal = (busy: boolean): void => {
  lastReportedBusy = busy;
  void invokeMainWebviewBusySignal(busy).catch(() => {
    lastReportedBusy = false;
  });
};

export const reportMainWebviewBusy = (busy: boolean): void => {
  if (!isTauriRuntime()) {
    return;
  }
  if (!busy && !lastReportedBusy) {
    return;
  }
  if (!busy) {
    lastReportedBusy = false;
    if (refreshTimerId !== null) {
      window.clearInterval(refreshTimerId);
      refreshTimerId = null;
    }
    sendMainWebviewBusySignal(false);
    return;
  }
  if (refreshTimerId === null) {
    sendMainWebviewBusySignal(true);
    refreshTimerId = window.setInterval(() => {
      sendMainWebviewBusySignal(true);
    }, MAIN_WEBVIEW_BUSY_REFRESH_INTERVAL_MS);
  }
};
