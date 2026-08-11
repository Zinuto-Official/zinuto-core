// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react";
import {
  PageSectionGroup,
  PlainTabBar,
  WorkspaceFrameShell,
  WorkspacePageShell,
} from "@/ui/components";
import type {
  SystemSettingsTabId,
  SystemSettingsTabItem,
} from "@/workspaces/settings/settings/SystemSettingsTabs";

type SystemSettingsLayoutProps = {
  activeTab: SystemSettingsTabId;
  activeTabItem: SystemSettingsTabItem;
  ariaLabel: string;
  children: ReactNode;
  onTabChange: (value: SystemSettingsTabId) => void;
  tabItems: SystemSettingsTabItem[];
};

export const SystemSettingsLayout = ({
  activeTab,
  activeTabItem,
  ariaLabel,
  children,
  onTabChange,
  tabItems,
}: SystemSettingsLayoutProps) => (
  <WorkspacePageShell
    template="workflow"
    className="settings-page settings-redesign-page"
    bodyClassName="settings-page-content settings-redesign-page-content"
  >
    <WorkspaceFrameShell>
      <div className="settings-redesign-shell">
        <aside className="settings-redesign-sidebar" aria-label={ariaLabel}>
          <PlainTabBar
            orientation="vertical"
            ariaLabel={ariaLabel}
            className="settings-redesign-sidebar-tabs"
            itemClassName="settings-redesign-sidebar-tab"
            value={activeTab}
            onChange={onTabChange}
            items={tabItems.map(({ key, label }) => ({ key, label }))}
          />
        </aside>

        <div className="settings-redesign-divider" aria-hidden="true" />

        <main className="settings-redesign-main">
          <div className="settings-redesign-top-rail" aria-label={ariaLabel}>
            <PlainTabBar
              ariaLabel={ariaLabel}
              className="settings-redesign-top-tabs"
              itemClassName="settings-redesign-top-tab"
              value={activeTab}
              onChange={onTabChange}
              items={tabItems.map(({ key, label }) => ({ key, label }))}
            />
          </div>

          <header className="settings-redesign-header">
            <div className="settings-redesign-header-copy">
              <h2 className="settings-redesign-title">{activeTabItem.label}</h2>
            </div>
          </header>

          <div className="settings-redesign-scroll" data-active-tab={activeTab}>
            <PageSectionGroup className="settings-redesign-section-stack">
              {children}
            </PageSectionGroup>
          </div>
        </main>
      </div>
    </WorkspaceFrameShell>
  </WorkspacePageShell>
);
