// SPDX-License-Identifier: GPL-3.0-only

import type { RuntimeModalPropsArgs } from "@/app-shell/runtime/workspace-shell/runtimeDesktopBindings";

export const buildRuntimeCsvMappingModalProps = (
  args: RuntimeModalPropsArgs["csvMappingModalProps"],
): RuntimeModalPropsArgs["csvMappingModalProps"] => args;

export const buildRuntimeTrainerModalHostProps = (
  args: RuntimeModalPropsArgs["trainerModalHostProps"],
): RuntimeModalPropsArgs["trainerModalHostProps"] => args;

type RuntimeNotesPageController = ReturnType<
  typeof import("@/workspaces/notes/useNotesPageController").useNotesPageController
>;

type RuntimeTrainingRecordNoteModalInput = Omit<
  RuntimeModalPropsArgs["trainingRecordNoteModalProps"],
  | "onRequestDelete"
> & {
  notesPageController: RuntimeNotesPageController;
};

export const buildRuntimeTrainingRecordNoteModalProps = ({
  notesPageController,
  ...args
}: RuntimeTrainingRecordNoteModalInput): RuntimeModalPropsArgs["trainingRecordNoteModalProps"] => ({
  ...args,
  onRequestDelete: (noteId) => {
    void notesPageController.deleteReplayNote(noteId);
  },
});

export const buildRuntimeUtilityDialogsModalProps = (
  args: RuntimeModalPropsArgs["utilityDialogsProps"],
): RuntimeModalPropsArgs["utilityDialogsProps"] => args;
