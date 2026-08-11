// SPDX-License-Identifier: GPL-3.0-only

import { useCallback } from "react";
import type { NativeWindowDragDropEvent } from "@/app-shell/useWindowChromeDrag";
import { normalizeDroppedImportFolderPath } from "@/domains/data-import/nativeImportHelpers";
import type { WorkspacePage } from "@/frontend-kernel/workspacePageModel";

type UseWorkspaceNavigationAccessArgs = {
  activePage: WorkspacePage;
  setActivePage: (page: WorkspacePage) => void;
  setIsNativeImportDragActive: (value: boolean) => void;
  isPreparingCsvImportPreview: boolean;
  isClearingLocalDataSources: boolean;
  deletingSamplePoolId: string;
  openCsvFolderPickerAndPrepareImport: () => void;
  openCsvFolderPathAndPrepareImport: (folderPath: string) => void;
};

export const useWorkspaceNavigationAccess = ({
  activePage,
  setActivePage,
  setIsNativeImportDragActive,
  isPreparingCsvImportPreview,
  isClearingLocalDataSources,
  deletingSamplePoolId,
  openCsvFolderPickerAndPrepareImport,
  openCsvFolderPathAndPrepareImport,
}: UseWorkspaceNavigationAccessArgs) => {
  const handleNativeWindowDragDropEvent = useCallback(
    (event: NativeWindowDragDropEvent) => {
      if (activePage !== "DATA") {
        if (event.type === "leave" || event.type === "drop") {
          setIsNativeImportDragActive(false);
        }
        return;
      }
      const isImportEntryBlocked =
        isPreparingCsvImportPreview ||
        isClearingLocalDataSources ||
        Boolean(deletingSamplePoolId);
      if (event.type === "enter" || event.type === "over") {
        setIsNativeImportDragActive(!isImportEntryBlocked);
        return;
      }
      if (event.type === "leave") {
        setIsNativeImportDragActive(false);
        return;
      }
      if (event.type !== "drop") {
        return;
      }
      setIsNativeImportDragActive(false);
      if (isImportEntryBlocked) {
        return;
      }
      const droppedFolderPath =
        event.paths
          .map((rawPath) => normalizeDroppedImportFolderPath(rawPath))
          .find((path) => Boolean(path)) ?? "";
      if (!droppedFolderPath) {
        openCsvFolderPickerAndPrepareImport();
        return;
      }
      openCsvFolderPathAndPrepareImport(droppedFolderPath);
    },
    [
      activePage,
      deletingSamplePoolId,
      isClearingLocalDataSources,
      isPreparingCsvImportPreview,
      openCsvFolderPickerAndPrepareImport,
      openCsvFolderPathAndPrepareImport,
      setIsNativeImportDragActive,
    ],
  );

  const handleSelectWorkspacePage = useCallback(
    (page: WorkspacePage) => {
      setActivePage(page);
    },
    [setActivePage],
  );

  return {
    handleNativeWindowDragDropEvent,
    handleSelectWorkspacePage,
  };
};
