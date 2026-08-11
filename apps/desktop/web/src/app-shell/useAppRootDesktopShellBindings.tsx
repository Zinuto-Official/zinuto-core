// SPDX-License-Identifier: GPL-3.0-only

import {
  useEffect,
  useMemo,
  useRef,
  type ComponentProps,
  type ReactNode,
} from "react";
import type { CurveSparkline } from "@/assets/graphics";
import { api } from "@/api";
import {
  useAppRootModalProps,
  type AppRootModalPropsBundle,
} from "@/app-shell/useAppRootModalProps";
import { useAppWorkspaceSwitcherProps } from "@/app-shell/useAppWorkspaceSwitcherProps";
import {
  useActionDialogHistoryReviewNote,
  type UseActionDialogHistoryReviewNoteArgs,
} from "@/app-shell/useActionDialogHistoryReviewNote";
import type { ActionDialogReplayMetrics } from "@/app-shell/useTrainingResetDialogController";
import type { TrainingSummary } from "@/domains/training/types";

type ModalPropsArgs = Parameters<typeof useAppRootModalProps>[0];
type WorkspaceSwitcherArgs = Parameters<typeof useAppWorkspaceSwitcherProps>[0];

type ActionDialogArgs = {
  summary: TrainingSummary | null;
  title: string;
  description: string;
  replayMetrics: ActionDialogReplayMetrics;
  baseTimeframe: ComponentProps<typeof CurveSparkline>["baseTimeframe"];
  language: ComponentProps<typeof CurveSparkline>["language"];
  themeMode: ComponentProps<typeof CurveSparkline>["themeMode"];
  isActionBlocked: boolean;
  onClose: () => void;
  onConfirm: () => void;
  createHistoryReviewNoteLabel: string;
};

export type UseAppRootDesktopShellBindingsArgs<
  TArchive,
  TDisplayPeriod extends string,
> = {
  modalProps: ModalPropsArgs;
  actionDialogHistoryReview: UseActionDialogHistoryReviewNoteArgs<
    TArchive,
    TDisplayPeriod
  >;
  actionDialog: ActionDialogArgs;
  workspaceSwitcher: WorkspaceSwitcherArgs;
};

export type AppRootDesktopShellBindings = AppRootModalPropsBundle & {
  actionDialogNode: ReactNode;
  workspaceSwitcherProps: ReturnType<typeof useAppWorkspaceSwitcherProps>;
};

export const useAppRootDesktopShellBindings = <
  TArchive,
  TDisplayPeriod extends string,
>({
  modalProps,
  actionDialogHistoryReview,
  actionDialog,
  workspaceSwitcher,
}: UseAppRootDesktopShellBindingsArgs<
  TArchive,
  TDisplayPeriod
>): AppRootDesktopShellBindings => {
  const modalBundle = useAppRootModalProps(modalProps);
  const {
    canCreateActionDialogHistoryReviewNote,
    handleCreateActionDialogHistoryReviewNote,
  } = useActionDialogHistoryReviewNote(actionDialogHistoryReview);
  const workspaceSwitcherProps =
    useAppWorkspaceSwitcherProps(workspaceSwitcher);

  const settlementWindowOpenedRef = useRef(false);
  const settlementWindowPayload = useMemo(
    () =>
      actionDialog.summary
        ? {
            title: actionDialog.title,
            description: actionDialog.description,
            summary: actionDialog.summary,
            replayMetrics: actionDialog.replayMetrics,
            baseTimeframe: actionDialog.baseTimeframe,
            language: actionDialog.language,
            themeMode: actionDialog.themeMode,
            createHistoryReviewNoteLabel:
              actionDialog.createHistoryReviewNoteLabel,
            canCreateHistoryReviewNote:
              canCreateActionDialogHistoryReviewNote,
            isActionBlocked: actionDialog.isActionBlocked,
          }
        : null,
    [
      actionDialog.baseTimeframe,
      actionDialog.createHistoryReviewNoteLabel,
      actionDialog.description,
      actionDialog.isActionBlocked,
      actionDialog.language,
      actionDialog.replayMetrics,
      actionDialog.summary,
      actionDialog.themeMode,
      actionDialog.title,
      canCreateActionDialogHistoryReviewNote,
    ],
  );

  useEffect(() => {
    if (!settlementWindowPayload) {
      settlementWindowOpenedRef.current = false;
      void api
        .closeDesktopSecondaryWindow("FREE_REPLAY_SETTLEMENT_DETAIL")
        .catch(() => undefined);
      return;
    }

    const input = {
      kind: "FREE_REPLAY_SETTLEMENT_DETAIL" as const,
      title: settlementWindowPayload.title,
      payload: settlementWindowPayload,
    };
    if (!settlementWindowOpenedRef.current) {
      settlementWindowOpenedRef.current = true;
      void api.openDesktopSecondaryWindow(input).catch((error) => {
        settlementWindowOpenedRef.current = false;
        console.error("[desktop-secondary-window] settlement detail failed", error);
      });
      return;
    }
    void api.publishDesktopSecondaryWindowState(input).catch((error) => {
      settlementWindowOpenedRef.current = false;
      console.error("[desktop-secondary-window] settlement detail sync failed", error);
    });
  }, [settlementWindowPayload]);

  useEffect(
    () =>
      api.subscribeDesktopSecondaryWindowActions((message) => {
        if (message.kind !== "FREE_REPLAY_SETTLEMENT_DETAIL") {
          return;
        }
        switch (message.action) {
          case "CREATE_HISTORY_REVIEW_NOTE":
            handleCreateActionDialogHistoryReviewNote();
            break;
          case "CONFIRM":
            actionDialog.onConfirm();
            void api
              .closeDesktopSecondaryWindow("FREE_REPLAY_SETTLEMENT_DETAIL")
              .catch(() => undefined);
            break;
          case "CLOSE":
          case "WINDOW_CLOSED":
            settlementWindowOpenedRef.current = false;
            if (actionDialog.summary) {
              actionDialog.onClose();
            }
            break;
          default:
            break;
        }
      }),
    [actionDialog, handleCreateActionDialogHistoryReviewNote],
  );

  return {
    ...modalBundle,
    workspaceSwitcherProps,
    actionDialogNode: null,
  };
};
