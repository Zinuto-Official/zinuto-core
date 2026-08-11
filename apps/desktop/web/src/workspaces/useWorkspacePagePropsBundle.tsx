// SPDX-License-Identifier: GPL-3.0-only

import { useDataConfigWorkspacePageProps } from '@/workspaces/data/useDataConfigWorkspacePageProps';
import { useHistoryWorkspacePageProps } from '@/workspaces/history/useHistoryWorkspacePageProps';
import { useNotesWorkspacePageProps } from '@/workspaces/notes/useNotesWorkspacePageProps';
import { useSystemSettingsWorkspacePageProps } from '@/workspaces/settings/useSystemSettingsWorkspacePageProps';
import { useTrainerWorkspacePageProps } from '@/workspaces/trainer/useTrainerWorkspacePageProps';

export type TrainerArgs = Parameters<typeof useTrainerWorkspacePageProps>[0];
export type HistoryArgs = Parameters<typeof useHistoryWorkspacePageProps>[0];
export type NotesArgs = Parameters<typeof useNotesWorkspacePageProps>[0];
export type DataConfigArgs = Parameters<typeof useDataConfigWorkspacePageProps>[0];
export type SystemSettingsArgs = Parameters<typeof useSystemSettingsWorkspacePageProps>[0];

export type UseWorkspacePagePropsBundleParams = {
  trainer: TrainerArgs;
  history: HistoryArgs;
  notes: NotesArgs;
  dataConfig: DataConfigArgs;
  systemSettings: SystemSettingsArgs;
};

export const useWorkspacePagePropsBundle = ({
  trainer,
  history,
  notes,
  dataConfig,
  systemSettings
}: UseWorkspacePagePropsBundleParams) => {
  const trainerWorkspacePageProps = useTrainerWorkspacePageProps(trainer);
  const historyWorkspacePageProps = useHistoryWorkspacePageProps(history);
  const notesPageProps = useNotesWorkspacePageProps(notes);
  const dataConfigPageProps = useDataConfigWorkspacePageProps(dataConfig);
  const systemSettingsPageProps = useSystemSettingsWorkspacePageProps(systemSettings);

  return {
    trainerWorkspacePageProps,
    historyWorkspacePageProps,
    notesPageProps,
    dataConfigPageProps,
    systemSettingsPageProps
  };
};
