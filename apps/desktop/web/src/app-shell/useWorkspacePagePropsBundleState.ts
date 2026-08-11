// SPDX-License-Identifier: GPL-3.0-only

import { useWorkspacePagePropsBundle } from '@/workspaces';
import {
  buildDataConfigWorkspaceBundleInput,
  buildHistoryWorkspaceBundleInput,
  buildNotesWorkspaceBundleInput,
  buildSystemSettingsWorkspaceBundleInput,
  buildTrainerWorkspaceBundleInput
} from '@/workspaces/workspacePageBundleBuilders';
import type {
  BuildDataConfigWorkspaceBundleArgs,
  BuildHistoryWorkspaceBundleArgs,
  BuildNotesWorkspaceBundleArgs,
  BuildSystemSettingsWorkspaceBundleArgs,
  BuildTrainerWorkspaceBundleArgs
} from '@/workspaces/workspacePageBundleBuilders';

type WorkspacePagePropsBundleStateArgs = {
  trainer: BuildTrainerWorkspaceBundleArgs;
  history: BuildHistoryWorkspaceBundleArgs;
  notes: BuildNotesWorkspaceBundleArgs;
  dataConfig: BuildDataConfigWorkspaceBundleArgs;
  systemSettings: BuildSystemSettingsWorkspaceBundleArgs;
};

export const useWorkspacePagePropsBundleState = ({
  trainer,
  history,
  notes,
  dataConfig,
  systemSettings
}: WorkspacePagePropsBundleStateArgs) => {
  const trainerWorkspaceBundleInput = buildTrainerWorkspaceBundleInput(trainer);
  const historyWorkspaceBundleInput = buildHistoryWorkspaceBundleInput(history);
  const notesWorkspaceBundleInput = buildNotesWorkspaceBundleInput(notes);
  const dataConfigWorkspaceBundleInput = buildDataConfigWorkspaceBundleInput(dataConfig);
  const systemSettingsWorkspaceBundleInput = buildSystemSettingsWorkspaceBundleInput(systemSettings);

  return useWorkspacePagePropsBundle({
    trainer: trainerWorkspaceBundleInput,
    history: historyWorkspaceBundleInput,
    notes: notesWorkspaceBundleInput,
    dataConfig: dataConfigWorkspaceBundleInput,
    systemSettings: systemSettingsWorkspaceBundleInput
  });
};
