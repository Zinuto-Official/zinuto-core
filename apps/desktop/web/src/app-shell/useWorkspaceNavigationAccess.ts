// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useRef } from "react";
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

type NativeWindowDragDropContext = {
  activePage: WorkspacePage;
  deletingSamplePoolId: string;
  isClearingLocalDataSources: boolean;
  isPreparingCsvImportPreview: boolean;
  openCsvFolderPathAndPrepareImport: (folderPath: string) => void;
  openCsvFolderPickerAndPrepareImport: () => void;
  setIsNativeImportDragActive: (value: boolean) => void;
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
  const dragDropContextRef = useRef<NativeWindowDragDropContext>({
    activePage,
    deletingSamplePoolId,
    isClearingLocalDataSources,
    isPreparingCsvImportPreview,
    openCsvFolderPathAndPrepareImport,
    openCsvFolderPickerAndPrepareImport,
    setIsNativeImportDragActive,
  });
  dragDropContextRef.current = {
    activePage,
    deletingSamplePoolId,
    isClearingLocalDataSources,
    isPreparingCsvImportPreview,
    openCsvFolderPathAndPrepareImport,
    openCsvFolderPickerAndPrepareImport,
    setIsNativeImportDragActive,
  };

  const handleNativeWindowDragDropEvent = useCallback(
    (event: NativeWindowDragDropEvent) => {
      const context = dragDropContextRef.current;
      if (context.activePage !== "DATA") {
        if (event.type === "leave" || event.type === "drop") {
          context.setIsNativeImportDragActive(false);
        }
        return;
      }
      const isImportEntryBlocked =
        context.isPreparingCsvImportPreview ||
        context.isClearingLocalDataSources ||
        Boolean(context.deletingSamplePoolId);
      if (event.type === "enter" || event.type === "over") {
        context.setIsNativeImportDragActive(!isImportEntryBlocked);
        return;
      }
      if (event.type === "leave") {
        context.setIsNativeImportDragActive(false);
        return;
      }
      if (event.type !== "drop") {
        return;
      }
      context.setIsNativeImportDragActive(false);
      if (isImportEntryBlocked) {
        return;
      }
      const droppedFolderPath =
        event.paths
          .map((rawPath) => normalizeDroppedImportFolderPath(rawPath))
          .find((path) => Boolean(path)) ?? "";
      if (!droppedFolderPath) {
        context.openCsvFolderPickerAndPrepareImport();
        return;
      }
      context.openCsvFolderPathAndPrepareImport(droppedFolderPath);
    },
    [],
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
