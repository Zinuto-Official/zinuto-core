// SPDX-License-Identifier: GPL-3.0-only

import type { DataSourceSyncPrefsById } from "@/domains/data-import/dataSourceTypes";
import type { Dispatch, SetStateAction } from "react";
import type { AppWorkspacePageBundleArgs } from "@/app-shell/useAppWorkspacePageBundleArgs";

export const buildRuntimeHistoryWorkspaceBundleArgs = (
  args: AppWorkspacePageBundleArgs["history"],
): AppWorkspacePageBundleArgs["history"] => args;

type RuntimeNotesPageController = ReturnType<
  typeof import("@/workspaces/notes/useNotesPageController").useNotesPageController
>;

type RuntimeNotesWorkspaceBundleInput = Omit<
  AppWorkspacePageBundleArgs["notes"],
  | "replayNotesKeyword"
  | "onReplayNotesKeywordChange"
  | "activeScopeFilter"
  | "onSelectActiveScopeFilter"
  | "selectedColorTokens"
  | "onSelectColorTokens"
  | "collectionNotes"
  | "collectionTotal"
  | "collectionNextCursor"
  | "isCollectionLoading"
  | "isCollectionLoadingMore"
  | "onLoadMoreCollectionNotes"
  | "selectedReplayNote"
  | "onRequestReplayNoteDelete"
  | "onCreateCustomReplayNote"
> & {
  notesPageController: RuntimeNotesPageController;
};

export const buildRuntimeNotesWorkspaceBundleArgs = ({
  notesPageController,
  ...args
}: RuntimeNotesWorkspaceBundleInput): AppWorkspacePageBundleArgs["notes"] => ({
  ...args,
  replayNotesKeyword: notesPageController.replayNotesKeyword,
  onReplayNotesKeywordChange: notesPageController.setReplayNotesKeyword,
  activeScopeFilter: notesPageController.activeScopeFilter,
  onSelectActiveScopeFilter: notesPageController.setActiveScopeFilter,
  selectedColorTokens: notesPageController.selectedColorTokens,
  onSelectColorTokens: notesPageController.setSelectedColorTokens,
  collectionNotes: notesPageController.collectionNotes,
  collectionTotal: notesPageController.collectionTotal,
  collectionNextCursor: notesPageController.collectionNextCursor,
  isCollectionLoading: notesPageController.isCollectionLoading,
  isCollectionLoadingMore: notesPageController.isCollectionLoadingMore,
  onLoadMoreCollectionNotes: notesPageController.loadMoreCollectionNotes,
  selectedReplayNote: notesPageController.selectedReplayNote,
  onRequestReplayNoteDelete: (noteId) => {
    void notesPageController.deleteReplayNote(noteId);
  },
  onCreateCustomReplayNote: notesPageController.onCreateCustomReplayNote,
});

export type RuntimeDataConfigWorkspaceBundleArgs = Omit<
  AppWorkspacePageBundleArgs["dataConfig"],
  "updateDataSourceSyncPreference"
> & {
  setDataSourceSyncPrefsById: Dispatch<SetStateAction<DataSourceSyncPrefsById>>;
};

export const buildRuntimeDataConfigWorkspaceBundleArgs = ({
  setDataSourceSyncPrefsById,
  ...args
}: RuntimeDataConfigWorkspaceBundleArgs): AppWorkspacePageBundleArgs["dataConfig"] => ({
  ...args,
  updateDataSourceSyncPreference: (sourceId, mode) => {
    const normalizedSourceId = String(sourceId || "").trim();
    if (!normalizedSourceId) {
      return;
    }
    setDataSourceSyncPrefsById((current) => ({
      ...current,
      [normalizedSourceId]: { mode },
    }));
  },
});

export const buildRuntimeSystemSettingsWorkspaceBundleArgs = (
  args: AppWorkspacePageBundleArgs["systemSettings"],
): AppWorkspacePageBundleArgs["systemSettings"] => args;

type BuildRuntimeWorkspacePageBundleArgsInput = {
  trainer: AppWorkspacePageBundleArgs["trainer"];
  history: AppWorkspacePageBundleArgs["history"];
  notes: AppWorkspacePageBundleArgs["notes"];
  dataConfig: AppWorkspacePageBundleArgs["dataConfig"];
  systemSettings: AppWorkspacePageBundleArgs["systemSettings"];
};

export const buildRuntimeWorkspacePageBundleArgs = ({
  trainer,
  history,
  notes,
  dataConfig,
  systemSettings,
}: BuildRuntimeWorkspacePageBundleArgsInput): AppWorkspacePageBundleArgs => ({
  trainer,
  history,
  notes,
  dataConfig,
  systemSettings,
});
