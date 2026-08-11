// SPDX-License-Identifier: GPL-3.0-only

import { useCallback } from "react";
import {
  useAppRootDesktopShellBindings,
  type UseAppRootDesktopShellBindingsArgs,
} from "@/app-shell/useAppRootDesktopShellBindings";
import { useWorkspacePagePropsBundleState } from "@/app-shell/useWorkspacePagePropsBundleState";
import type { WorkspacePage } from "@/frontend-kernel/workspacePageModel";
import { startTrainerPerfSpan } from "@/domains/trainer/trainerPerfTrace";
import {
  normalizeWorkspacePageForCache,
  preloadWorkspacePageAssets,
} from "@/workspaces/workspacePageModulePreload";

type WorkspacePageBundleArgs = Parameters<
  typeof useWorkspacePagePropsBundleState
>[0];
type WorkspacePageBundleState = ReturnType<typeof useWorkspacePagePropsBundleState>;
type BuildAppRootDesktopShellBindingsArgs = WorkspacePageBundleState & {
  handleWorkspacePageSwitch: (page: WorkspacePage) => void;
};

type UseAppRootWorkspaceDesktopBindingsArgs<
  TArchive,
  TDisplayPeriod extends string,
> = {
  workspacePageBundleArgs: WorkspacePageBundleArgs;
  setActivePage: (page: WorkspacePage) => void;
  buildDesktopShellBindingsArgs: (
    args: BuildAppRootDesktopShellBindingsArgs,
  ) => UseAppRootDesktopShellBindingsArgs<TArchive, TDisplayPeriod>;
};

export const useAppRootWorkspaceDesktopBindings = <
  TArchive,
  TDisplayPeriod extends string,
>({
  workspacePageBundleArgs,
  setActivePage,
  buildDesktopShellBindingsArgs,
}: UseAppRootWorkspaceDesktopBindingsArgs<TArchive, TDisplayPeriod>) => {
  const workspacePageBundleState = useWorkspacePagePropsBundleState(
    workspacePageBundleArgs,
  );

  const handleWorkspacePageSwitch = useCallback(
    (page: WorkspacePage) => {
      if (page === "TRAINER") {
        startTrainerPerfSpan("page-switch-to-trainer", {
          source: "workspace-page-switch",
        });
      }
      void preloadWorkspacePageAssets(normalizeWorkspacePageForCache(page))
        .catch(() => undefined);
      setActivePage(page);
    },
    [setActivePage],
  );

  return useAppRootDesktopShellBindings<TArchive, TDisplayPeriod>(
    buildDesktopShellBindingsArgs({
      ...workspacePageBundleState,
      handleWorkspacePageSwitch,
    }),
  );
};
