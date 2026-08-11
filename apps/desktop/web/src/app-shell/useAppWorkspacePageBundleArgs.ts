// SPDX-License-Identifier: GPL-3.0-only

import { useShallowStableObject } from "@/workspaces/useShallowStableObject";
import { useWorkspacePagePropsBundleState } from "@/app-shell/useWorkspacePagePropsBundleState";

export type AppWorkspacePageBundleArgs = Parameters<
  typeof useWorkspacePagePropsBundleState
>[0];

export const useAppWorkspacePageBundleArgs = (
  args: AppWorkspacePageBundleArgs,
): AppWorkspacePageBundleArgs => {
  const trainer = useShallowStableObject(args.trainer);
  const history = useShallowStableObject(args.history);
  const notes = useShallowStableObject(args.notes);
  const dataConfig = useShallowStableObject(args.dataConfig);
  const systemSettings = useShallowStableObject(args.systemSettings);
  return useShallowStableObject({
    trainer,
    history,
    notes,
    dataConfig,
    systemSettings,
  });
};
