// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useState } from "react";
import { useWorkspaceNavigationAccess } from "@/app-shell/useWorkspaceNavigationAccess";
import { useAppSidebarGroups } from "@/app-shell/useAppSidebarGroups";
import { useHistoryReplayChartBindings } from "@/domains/chart/useHistoryReplayChartBindings";
import { useWindowChromeDrag } from "@/app-shell/useWindowChromeDrag";
import type { WorkspacePage } from "@/frontend-kernel/workspacePageModel";

type AppRootNavigationShellLabels = {
  navGroupCommand: string;
  navTrainingCommandCenter: string;
  navGroupTraining: string;
  navGroupReview: string;
  navGroupReflection: string;
  navGroupTools: string;
  navTrainer: string;
  navHistory: string;
  navStats: string;
  navSpecialTraining: string;
  navChallengeStats: string;
  navNotes: string;
  navCustomIndicator: string;
  navStrategyBacktest: string;
  navDataConfig: string;
  navSettings: string;
};

type UseAppRootNavigationShellBindingsArgs = {
  activePage: WorkspacePage;
  setActivePage: (page: WorkspacePage) => void;
  isPreparingCsvImportPreview: boolean;
  isClearingLocalDataSources: boolean;
  deletingSamplePoolId: string;
  openCsvFolderPickerAndPrepareImport: () => void;
  openCsvFolderPathAndPrepareImport: (folderPath: string) => void;
  labels: AppRootNavigationShellLabels;
  prefetchWorkspacePageData?: (page: WorkspacePage) => void;
};

export const useAppRootNavigationShellBindings = ({
  activePage,
  setActivePage,
  isPreparingCsvImportPreview,
  isClearingLocalDataSources,
  deletingSamplePoolId,
  openCsvFolderPickerAndPrepareImport,
  openCsvFolderPathAndPrepareImport,
  labels,
  prefetchWorkspacePageData,
}: UseAppRootNavigationShellBindingsArgs) => {
  const [isNativeImportDragActive, setIsNativeImportDragActive] = useState(false);

  useEffect(() => {
    if (activePage !== "DATA" && isNativeImportDragActive) {
      setIsNativeImportDragActive(false);
    }
  }, [activePage, isNativeImportDragActive]);

  const {
    handleNativeWindowDragDropEvent,
    handleSelectWorkspacePage,
  } = useWorkspaceNavigationAccess({
    activePage,
    setActivePage,
    setIsNativeImportDragActive,
    isPreparingCsvImportPreview,
    isClearingLocalDataSources,
    deletingSamplePoolId,
    openCsvFolderPickerAndPrepareImport,
    openCsvFolderPathAndPrepareImport,
  });

  const {
    clearPendingWindowDrag,
    startWindowDrag,
    continueWindowDrag,
    toggleWindowMaximize,
  } = useWindowChromeDrag({
    onNativeDragDropEvent: handleNativeWindowDragDropEvent,
  });

  const historyReplayChartBindings = useHistoryReplayChartBindings();
  const sidebarGroups = useAppSidebarGroups({
    activePage,
    labels,
    setActivePage: handleSelectWorkspacePage,
    preparePage: prefetchWorkspacePageData,
  });

  return {
    isNativeImportDragActive,
    historyReplayChartBindings,
    sidebarGroups,
    clearPendingWindowDrag,
    startWindowDrag,
    continueWindowDrag,
    toggleWindowMaximize,
  };
};
