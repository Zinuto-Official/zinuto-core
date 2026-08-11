// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef } from "react";
import { api } from "@/api";
import type { SystemGlobalResetConfirmWindowPayload } from "@/app-shell/systemGlobalResetConfirmWindow";

type RuntimeGlobalResetConfirmationOptions = {
  isBusy: boolean;
  isPreparingAction: boolean;
  isGlobalResetProgressVisible: boolean;
  isGlobalResetStorageSummaryReady: boolean;
  globalResetStorageTotalText: string;
  globalResetAffectedPoolCount: number;
  globalResetAffectedSymbolCount: number;
  confirmTitle: string;
  requestErrorMessage: string;
  setError: (message: string) => void;
  resetAllStoredData: () => void | Promise<void>;
};

export const useRuntimeGlobalResetConfirmation = ({
  isBusy,
  isPreparingAction,
  isGlobalResetProgressVisible,
  isGlobalResetStorageSummaryReady,
  globalResetStorageTotalText,
  globalResetAffectedPoolCount,
  globalResetAffectedSymbolCount,
  confirmTitle,
  requestErrorMessage,
  setError,
  resetAllStoredData,
}: RuntimeGlobalResetConfirmationOptions) => {
  const revisionRef = useRef<number | null>(null);
  const requestConfirmation = useCallback(() => {
    if (
      isBusy ||
      isPreparingAction ||
      isGlobalResetProgressVisible ||
      !isGlobalResetStorageSummaryReady
    ) {
      return;
    }
    const payload: SystemGlobalResetConfirmWindowPayload = {
      totalUsageText: globalResetStorageTotalText,
      affectedPoolCount: globalResetAffectedPoolCount,
      affectedSymbolCount: globalResetAffectedSymbolCount,
    };
    void api
      .openDesktopSecondaryWindow({
        kind: "SYSTEM_GLOBAL_RESET_CONFIRM",
        title: confirmTitle,
        payload,
      })
      .then((state) => {
        revisionRef.current = state.revision;
      })
      .catch((error) => {
        console.error("[system-global-reset-confirm] open failed", error);
        revisionRef.current = null;
        setError(requestErrorMessage);
      });
  }, [
    confirmTitle,
    globalResetAffectedPoolCount,
    globalResetAffectedSymbolCount,
    globalResetStorageTotalText,
    isGlobalResetStorageSummaryReady,
    isBusy,
    isGlobalResetProgressVisible,
    isPreparingAction,
    requestErrorMessage,
    setError,
  ]);

  useEffect(
    () =>
      api.subscribeDesktopSecondaryWindowActions((message) => {
        if (message.kind !== "SYSTEM_GLOBAL_RESET_CONFIRM") {
          return;
        }
        if (message.action === "WINDOW_CLOSED") {
          revisionRef.current = null;
          return;
        }
        if (
          message.action !== "CONFIRM_GLOBAL_RESET" ||
          !api.isCurrentDesktopSecondaryWindowAction(
            message,
            revisionRef.current,
          )
        ) {
          return;
        }
        void resetAllStoredData();
      }),
    [resetAllStoredData],
  );

  return requestConfirmation;
};
