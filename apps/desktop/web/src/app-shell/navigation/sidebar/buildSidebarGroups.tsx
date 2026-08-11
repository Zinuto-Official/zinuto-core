// SPDX-License-Identifier: GPL-3.0-only

import {
  WORKSPACE_SIDEBAR_GROUPS,
  WORKSPACE_UI_REGISTRY,
  type WorkspacePage,
  type WorkspaceSidebarGroupLabelKey,
  type WorkspaceSidebarItemLabelKey,
} from '@/frontend-kernel/workspacePageModel';
import type { SidebarNavGroup } from '@/ui/components/sidebarNavTypes';

type SidebarLabels = Record<
  WorkspaceSidebarGroupLabelKey | WorkspaceSidebarItemLabelKey,
  string
> & {
  navStats: string;
};

type BuildSidebarGroupsArgs = {
  activePage: WorkspacePage;
  labels: SidebarLabels;
  onSelectPage: (page: WorkspacePage) => void;
};

export const buildSidebarGroups = ({
  activePage,
  labels,
  onSelectPage,
}: BuildSidebarGroupsArgs): SidebarNavGroup[] =>
  WORKSPACE_SIDEBAR_GROUPS.map((group) => ({
    key: group.key,
    label: labels[group.labelKey],
    items: WORKSPACE_UI_REGISTRY.filter(
      (entry) => entry.sidebarGroup === group.key,
    ).map((entry) => ({
      key: entry.page,
      label: labels[entry.sidebarLabelKey],
      icon: entry.icon,
      active: activePage === entry.page,
      onClick: () => onSelectPage(entry.page),
      rightSlot: null,
    })),
  }));
