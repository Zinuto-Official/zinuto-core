// SPDX-License-Identifier: GPL-3.0-only

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type {
  DesktopHelpContextId,
  DesktopHelpNavigationTarget,
} from "@/domains/desktop-help/desktopHelpTypes";
import type { WorkspacePage } from "@/frontend-kernel/workspacePageModel";

type DesktopHelpContextValue = {
  activeContextId: DesktopHelpContextId;
  activeWorkspace: WorkspacePage;
  navigateToTarget: (target: DesktopHelpNavigationTarget) => void;
  showDesktopHelpLauncher: boolean;
  setShowDesktopHelpLauncher: Dispatch<SetStateAction<boolean>>;
  reportContext: (
    workspace: WorkspacePage,
    contextId: DesktopHelpContextId,
    active: boolean,
  ) => void;
};

const DesktopHelpContext = createContext<DesktopHelpContextValue | null>(null);
const ignoreDesktopHelpLauncherPreferenceChange: Dispatch<
  SetStateAction<boolean>
> = () => undefined;

export const DesktopHelpContextProvider = ({
  activeWorkspace,
  children,
  onNavigateToTarget,
  showDesktopHelpLauncher = true,
  setShowDesktopHelpLauncher = ignoreDesktopHelpLauncherPreferenceChange,
}: {
  activeWorkspace: WorkspacePage;
  children: ReactNode;
  onNavigateToTarget: (target: DesktopHelpNavigationTarget) => void;
  showDesktopHelpLauncher?: boolean;
  setShowDesktopHelpLauncher?: Dispatch<SetStateAction<boolean>>;
}) => {
  const [reportedContexts, setReportedContexts] = useState<
    Partial<Record<WorkspacePage, DesktopHelpContextId>>
  >({});
  const reportContext = useCallback(
    (
      workspace: WorkspacePage,
      contextId: DesktopHelpContextId,
      active: boolean,
    ) => {
      setReportedContexts((current) => {
        const nextContext = active ? contextId : workspace;
        if ((current[workspace] ?? workspace) === nextContext) {
          return current;
        }
        return { ...current, [workspace]: nextContext };
      });
    },
    [],
  );
  const value = useMemo<DesktopHelpContextValue>(
    () => ({
      activeContextId: reportedContexts[activeWorkspace] ?? activeWorkspace,
      activeWorkspace,
      navigateToTarget: onNavigateToTarget,
      showDesktopHelpLauncher,
      setShowDesktopHelpLauncher,
      reportContext,
    }),
    [
      activeWorkspace,
      onNavigateToTarget,
      reportContext,
      reportedContexts,
      setShowDesktopHelpLauncher,
      showDesktopHelpLauncher,
    ],
  );
  return (
    <DesktopHelpContext.Provider value={value}>
      {children}
    </DesktopHelpContext.Provider>
  );
};

export const useDesktopHelpContext = (): DesktopHelpContextValue | null =>
  useContext(DesktopHelpContext);

export const useDesktopHelpContextReporter = ({
  active = true,
  contextId,
  workspace,
}: {
  active?: boolean;
  contextId: DesktopHelpContextId;
  workspace: WorkspacePage;
}): void => {
  const context = useDesktopHelpContext();
  const reportContext = context?.reportContext;
  useEffect(() => {
    reportContext?.(workspace, contextId, active);
  }, [active, contextId, reportContext, workspace]);
};
