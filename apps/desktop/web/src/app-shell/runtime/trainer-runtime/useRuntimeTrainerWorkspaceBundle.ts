// SPDX-License-Identifier: GPL-3.0-only

import type { UiLanguage } from "@/frontend-kernel/typography";
import { useAppRootTrainerWorkspaceBundle } from "@/app-shell/useAppRootTrainerWorkspaceBundle";
import { formatAnchorTs } from "@/domains/trainer/AnchorNavigatorControl";
import type { ResumableSessionSummary } from "@/domains/training/types";

type TrainerWorkspaceBundleDeps = Parameters<typeof useAppRootTrainerWorkspaceBundle>[0];

export type UseRuntimeTrainerWorkspaceBundleArgs = Omit<
  TrainerWorkspaceBundleDeps,
  | "freeReplayPrepAnchorText"
  | "canResumeTrainerSession"
  | "resumeLatestTrainerSession"
  | "stepNext"
> & {
  freeReplayPrepAnchorTs: string | null;
  freeReplayStartHasExplicitAnchor: boolean;
  language: UiLanguage;
  onResumeLatestTrainerSession: () => Promise<void>;
  onStepNext: TrainerWorkspaceBundleDeps["stepNext"];
  hasLiveResumableTrainerSession: boolean;
  latestResumableTrainerSession: ResumableSessionSummary | null;
};

export const useRuntimeTrainerWorkspaceBundle = ({
  freeReplayPrepAnchorTs,
  freeReplayStartHasExplicitAnchor,
  language,
  onResumeLatestTrainerSession,
  onStepNext,
  hasLiveResumableTrainerSession,
  latestResumableTrainerSession,
  ...deps
}: UseRuntimeTrainerWorkspaceBundleArgs) => {
  const canResumeTrainerSession =
    hasLiveResumableTrainerSession || Boolean(latestResumableTrainerSession);
  const trainerWorkspaceBundle = useAppRootTrainerWorkspaceBundle({
    ...deps,
    freeReplayPrepAnchorText:
      freeReplayPrepAnchorTs && freeReplayStartHasExplicitAnchor
        ? formatAnchorTs(
            freeReplayPrepAnchorTs,
            language,
            deps.freeReplayPrepConfig.minimumBaseTimeframe ??
              deps.freeReplayPrepConfig.baseTimeframe,
          )
        : "",
    canResumeTrainerSession,
    resumeLatestTrainerSession: onResumeLatestTrainerSession,
    stepNext: onStepNext,
  });

  return {
    canResumeTrainerSession,
    trainerWorkspaceBundle,
  };
};
