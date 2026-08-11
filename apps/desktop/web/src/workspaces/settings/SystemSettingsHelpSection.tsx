// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from "react";
import { DesktopHelpCenter } from "@/domains/desktop-help/DesktopHelpCenter";
import { getDesktopHelpCatalog } from "@/domains/desktop-help/desktopHelpCatalog";
import { useI18n } from "@/frontend-kernel/i18n";
import { WorkspaceSection } from "@/ui/components";

export const SystemSettingsHelpSection = () => {
  const { locale } = useI18n();
  const catalog = useMemo(() => getDesktopHelpCatalog(locale), [locale]);
  return (
    <WorkspaceSection
      title={catalog.copy.embeddedTitle}
      subtitle={catalog.copy.embeddedDescription}
      className="settings-flow-group settings-help-center-section"
      bodyClassName="settings-flow-row-list"
    >
      <DesktopHelpCenter
        catalog={catalog}
        contextId="SETTINGS_ABOUT"
        mode="embedded"
        showEmbeddedHeader={false}
      />
    </WorkspaceSection>
  );
};
