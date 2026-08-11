// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from 'react';
import { buildSidebarGroups } from '@/app-shell/navigation/sidebar';
import {
  WORKSPACE_PAGE_SET,
  type WorkspacePage,
  type WorkspaceSidebarGroupLabelKey,
  type WorkspaceSidebarItemLabelKey,
} from '@/frontend-kernel/workspacePageModel';
import {
  normalizeWorkspacePageForCache,
  preloadWorkspacePageAssets
} from '@/workspaces/workspacePageModulePreload';

type SidebarLabels = Record<
  WorkspaceSidebarGroupLabelKey | WorkspaceSidebarItemLabelKey,
  string
> & {
  navStats: string;
};

type UseAppSidebarGroupsParams = {
  activePage: WorkspacePage;
  labels: SidebarLabels;
  setActivePage: (page: WorkspacePage) => void;
  preparePage?: (page: WorkspacePage) => void;
};

const isWorkspacePageKey = (value: string): value is WorkspacePage =>
  WORKSPACE_PAGE_SET.has(value as WorkspacePage);

export const useAppSidebarGroups = ({
  activePage,
  labels,
  setActivePage,
  preparePage,
}: UseAppSidebarGroupsParams) => {
  return useMemo(
    () =>
      buildSidebarGroups({
        activePage,
        labels,
        onSelectPage: setActivePage,
      }).map((group) => ({
        ...group,
        items: group.items.map((item) => {
          if (!isWorkspacePageKey(item.key)) {
            return item;
          }
          const pageKey: WorkspacePage = item.key;
          const preloadWorkspacePage = () => {
            void preloadWorkspacePageAssets(
              normalizeWorkspacePageForCache(pageKey),
            ).catch(() => undefined);
          };
          const prepareWorkspacePage = () => {
            preloadWorkspacePage();
            preparePage?.(pageKey);
          };
          return {
            ...item,
            onClick: () => {
              prepareWorkspacePage();
              item.onClick();
            },
            onFocus: preloadWorkspacePage,
            onPointerDown: preloadWorkspacePage,
            onPointerEnter: preloadWorkspacePage
          };
        })
      })),
    [
      activePage,
      labels.navGroupCommand,
      labels.navTrainingCommandCenter,
      labels.navCustomIndicator,
      labels.navChallengeStats,
      labels.navDataConfig,
      labels.navGroupReflection,
      labels.navGroupReview,
      labels.navGroupTools,
      labels.navGroupTraining,
      labels.navHistory,
      labels.navNotes,
      labels.navSettings,
      labels.navSpecialTraining,
      labels.navStrategyBacktest,
      labels.navStats,
      labels.navTrainer,
      preparePage,
      setActivePage
    ]
  );
};
