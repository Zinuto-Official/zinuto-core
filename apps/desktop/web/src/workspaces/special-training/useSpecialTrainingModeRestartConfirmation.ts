// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef } from "react";
import { api } from "@/api";
import type { SpecialTrainingModeId } from "@/ui/config/uiConfig";
import { readSpecialTrainingModeRestartConfirmActionPayload } from "@/workspaces/special-training/specialTrainingModeRestartConfirmWindow";

export const useSpecialTrainingModeRestartConfirmation = ({
  activeModeId,
  canRestartModeProgress,
  dialogTitle,
  failureMessage,
  setSubmitErrorMessage,
  resetModeQuestionBank,
}: {
  activeModeId: SpecialTrainingModeId | null | undefined;
  canRestartModeProgress: boolean;
  dialogTitle: string;
  failureMessage: string;
  setSubmitErrorMessage: (message: string) => void;
  resetModeQuestionBank: (
    modeId: SpecialTrainingModeId,
  ) => void | Promise<void>;
}) => {
  const revisionRef = useRef<number | null>(null);
  const requestConfirmation = useCallback(() => {
    if (!activeModeId || !canRestartModeProgress) {
      return;
    }
    setSubmitErrorMessage("");
    void api
      .openDesktopSecondaryWindow({
        kind: "SPECIAL_TRAINING_MODE_RESTART_CONFIRM",
        title: dialogTitle,
        payload: { modeId: activeModeId },
      })
      .then((windowState) => {
        revisionRef.current = windowState.revision;
      })
      .catch((error) => {
        console.error(
          "[special-training-mode-restart-confirm] open failed",
          error,
        );
        setSubmitErrorMessage(failureMessage);
      });
  }, [
    activeModeId,
    canRestartModeProgress,
    dialogTitle,
    failureMessage,
    setSubmitErrorMessage,
  ]);

  useEffect(
    () =>
      api.subscribeDesktopSecondaryWindowActions((message) => {
        if (
          message.kind !== "SPECIAL_TRAINING_MODE_RESTART_CONFIRM" ||
          message.action !== "CONFIRM_RESTART_MODE" ||
          !api.isCurrentDesktopSecondaryWindowAction(
            message,
            revisionRef.current,
          )
        ) {
          return;
        }
        const payload = readSpecialTrainingModeRestartConfirmActionPayload(
          message.payload,
        );
        if (payload) {
          void resetModeQuestionBank(payload.modeId);
        }
      }),
    [resetModeQuestionBank],
  );

  return requestConfirmation;
};
