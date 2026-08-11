// SPDX-License-Identifier: GPL-3.0-only

import type { WorkspacePage } from "@/frontend-kernel/workspacePageModel";

type LaunchFreeReplayFromCommandCenterArgs = {
  canResumeTrainerSession: boolean;
  hasActiveTrainerSession: boolean;
  onSelectPage: (page: WorkspacePage) => void;
  onResumeTrainerSession: () => void;
};

export const launchFreeReplayFromCommandCenter = (
  args: LaunchFreeReplayFromCommandCenterArgs,
): void => {
  if (!args.hasActiveTrainerSession && args.canResumeTrainerSession) {
    args.onResumeTrainerSession();
    return;
  }
  args.onSelectPage("TRAINER");
};
