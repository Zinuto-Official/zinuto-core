// SPDX-License-Identifier: GPL-3.0-only

import type { ArchivedReplayData } from "@/domains/history/replayArchiveTypes";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { UseAppRootDesktopShellBindingsArgs } from "@/app-shell/useAppRootDesktopShellBindings";
import {
  buildRuntimeModalProps,
  type RuntimeModalPropsArgs,
  type RuntimeWorkspaceSwitcherBaseArgs,
} from "@/app-shell/runtime/workspace-shell/runtimeDesktopBindings";

type RuntimeDesktopBindingsArgs = UseAppRootDesktopShellBindingsArgs<
  ArchivedReplayData,
  DisplayPeriodKey
>;

type ActionDialogBindings = RuntimeDesktopBindingsArgs["actionDialog"];
type ActionDialogHistoryReviewBindings =
  RuntimeDesktopBindingsArgs["actionDialogHistoryReview"];

type BuildRuntimeActionDialogHistoryReviewBindingsArgs = Omit<
  ActionDialogHistoryReviewBindings,
  "actionDialogOpen" | "barCount" | "buildCurrentReplayContext"
> & {
  actionDialogOpen: boolean;
  barCount: number;
  buildCurrentReplayContext: () => {
    drawings?: ArchivedReplayData["drawings"];
  } | null;
};

export const buildRuntimeModalPropsBundle = (
  args: RuntimeModalPropsArgs,
): RuntimeDesktopBindingsArgs["modalProps"] => buildRuntimeModalProps(args);

export const buildRuntimeActionDialogHistoryReviewBindings = ({
  actionDialogOpen,
  barCount,
  sessionId,
  snapshot,
  trainerDisplayPeriod,
  buildCurrentReplayContext,
  createHistoryReviewReplayNote,
  setError,
  missingContextMessage,
}: BuildRuntimeActionDialogHistoryReviewBindingsArgs): ActionDialogHistoryReviewBindings => ({
  actionDialogOpen,
  barCount,
  sessionId,
  snapshot,
  trainerDisplayPeriod,
  buildCurrentReplayContext: () => {
    const contextReplay = buildCurrentReplayContext();
    if (!contextReplay) {
      return null;
    }
    return {
      ...contextReplay,
      drawings: contextReplay.drawings ?? [],
    } as ArchivedReplayData;
  },
  createHistoryReviewReplayNote,
  setError,
  missingContextMessage,
});

export const buildRuntimeActionDialogBindings = (
  args: ActionDialogBindings,
): ActionDialogBindings => args;

type BuildRuntimeWorkspaceSwitcherBaseBindingsArgs = Omit<
  RuntimeWorkspaceSwitcherBaseArgs,
  "onResumeTrainerSession"
> & {
  onResumeTrainerSession: () => void;
};

export const buildRuntimeWorkspaceSwitcherBaseBindings = ({
  onResumeTrainerSession,
  ...rest
}: BuildRuntimeWorkspaceSwitcherBaseBindingsArgs): RuntimeWorkspaceSwitcherBaseArgs => ({
  ...rest,
  onResumeTrainerSession,
});
