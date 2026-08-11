// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useMemo, type ComponentProps } from "react";
import { WorkspacePageSwitcher } from "@/workspaces";
import { useShallowStableObject } from "@/workspaces/useShallowStableObject";

type WorkspaceSwitcherProps = ComponentProps<typeof WorkspacePageSwitcher>;

type UseAppWorkspaceSwitcherPropsArgs = Omit<
  WorkspaceSwitcherProps,
  "onStatsError"
> & {
  setError: (message: string) => void;
  showNotice: (message: string, title: string) => void;
  statsTitle: string;
};

export const useAppWorkspaceSwitcherProps = ({
  setError,
  showNotice,
  statsTitle,
  ...workspaceSwitcherProps
}: UseAppWorkspaceSwitcherPropsArgs): WorkspaceSwitcherProps => {
  const stableWorkspaceSwitcherProps = useShallowStableObject(
    workspaceSwitcherProps,
  );
  const handleStatsError = useCallback(
    (message: string) => {
      setError(message);
    },
    [setError],
  );

  return useMemo(
    () => ({
      ...stableWorkspaceSwitcherProps,
      onStatsError: handleStatsError,
    }),
    [handleStatsError, stableWorkspaceSwitcherProps],
  );
};
