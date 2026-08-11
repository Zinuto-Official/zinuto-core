// SPDX-License-Identifier: GPL-3.0-only

import type { ArchivedReplayData } from "@/domains/history/replayArchiveTypes";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { UseAppRootDesktopShellBindingsArgs } from "@/app-shell/useAppRootDesktopShellBindings";

type RuntimeDesktopBindingsArgs = UseAppRootDesktopShellBindingsArgs<
  ArchivedReplayData,
  DisplayPeriodKey
>;

type RuntimeWorkspaceSwitcherArgs = RuntimeDesktopBindingsArgs["workspaceSwitcher"];

type RuntimeWorkspacePageShellArgs = Pick<
  RuntimeWorkspaceSwitcherArgs,
  | "trainerWorkspacePageProps"
  | "historyWorkspacePageProps"
  | "notesPageProps"
  | "dataConfigPageProps"
  | "systemSettingsPageProps"
> & {
  handleWorkspacePageSwitch: RuntimeWorkspaceSwitcherArgs["onSelectPage"];
};

export type RuntimeWorkspaceSwitcherBaseArgs = Omit<
  RuntimeWorkspaceSwitcherArgs,
  | "onSelectPage"
  | "trainerWorkspacePageProps"
  | "historyWorkspacePageProps"
  | "notesPageProps"
  | "dataConfigPageProps"
  | "systemSettingsPageProps"
>;

export type RuntimeModalPropsArgs = {
  csvMappingModalProps: RuntimeDesktopBindingsArgs["modalProps"]["csvMappingModal"];
  trainerModalHostProps: RuntimeDesktopBindingsArgs["modalProps"]["trainerModalHost"];
  trainingRecordNoteModalProps: RuntimeDesktopBindingsArgs["modalProps"]["trainingRecordNoteModal"];
  utilityDialogsProps: RuntimeDesktopBindingsArgs["modalProps"]["utilityDialogs"];
};

export const buildRuntimeModalProps = ({
  csvMappingModalProps,
  trainerModalHostProps,
  trainingRecordNoteModalProps,
  utilityDialogsProps,
}: RuntimeModalPropsArgs): RuntimeDesktopBindingsArgs["modalProps"] => ({
  csvMappingModal: csvMappingModalProps,
  trainerModalHost: trainerModalHostProps,
  trainingRecordNoteModal: trainingRecordNoteModalProps,
  utilityDialogs: utilityDialogsProps,
});

type BuildRuntimeDesktopBindingsArgsInput = {
  workspaceShellArgs: RuntimeWorkspacePageShellArgs;
  modalProps: RuntimeDesktopBindingsArgs["modalProps"];
  actionDialogHistoryReview: RuntimeDesktopBindingsArgs["actionDialogHistoryReview"];
  actionDialog: RuntimeDesktopBindingsArgs["actionDialog"];
  workspaceSwitcherBase: RuntimeWorkspaceSwitcherBaseArgs;
};

export const buildRuntimeDesktopBindingsArgs = ({
  workspaceShellArgs,
  modalProps,
  actionDialogHistoryReview,
  actionDialog,
  workspaceSwitcherBase,
}: BuildRuntimeDesktopBindingsArgsInput): RuntimeDesktopBindingsArgs => ({
  modalProps,
  actionDialogHistoryReview,
  actionDialog,
  workspaceSwitcher: {
    ...workspaceSwitcherBase,
    onSelectPage: workspaceShellArgs.handleWorkspacePageSwitch,
    trainerWorkspacePageProps: workspaceShellArgs.trainerWorkspacePageProps,
    historyWorkspacePageProps: workspaceShellArgs.historyWorkspacePageProps,
    notesPageProps: workspaceShellArgs.notesPageProps,
    dataConfigPageProps: workspaceShellArgs.dataConfigPageProps,
    systemSettingsPageProps: workspaceShellArgs.systemSettingsPageProps,
  },
});
