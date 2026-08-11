// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo, useRef, useState } from "react";
import { VendorIcon } from "@/assets/graphics";
import { DesktopHelpCenter } from "@/domains/desktop-help/DesktopHelpCenter";
import { useDesktopHelpContext } from "@/domains/desktop-help/DesktopHelpContext";
import { getDesktopHelpCatalog } from "@/domains/desktop-help/desktopHelpCatalog";
import { useI18n } from "@/frontend-kernel/i18n";
import { AnchoredUtilityPanel } from "@/ui/components";
import { Button } from "@/ui/primitives/button";

export const DesktopHelpFloatingHost = ({
  defaultOpen = false,
  onboardingActive,
}: {
  defaultOpen?: boolean;
  onboardingActive: boolean;
}) => {
  const { locale } = useI18n();
  const helpContext = useDesktopHelpContext();
  const catalog = useMemo(() => getDesktopHelpCatalog(locale), [locale]);
  const [open, setOpen] = useState(defaultOpen);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contextId = helpContext?.activeContextId ?? "COMMAND_CENTER";
  const embeddedHelpVisible = contextId === "SETTINGS_ABOUT";
  const showDesktopHelpLauncher =
    helpContext?.showDesktopHelpLauncher ?? true;
  const hidden =
    onboardingActive || embeddedHelpVisible || !showDesktopHelpLauncher;

  useEffect(() => {
    if (hidden) {
      setOpen(false);
    }
  }, [hidden]);

  if (hidden) {
    return null;
  }
  return (
    <div className="desktop-help-floating-host">
      <Button
        ref={launcherRef}
        type="button"
        variant="default"
        size="icon-lg"
        className="desktop-help-launcher"
        aria-label={catalog.copy.launcherLabel}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <VendorIcon name="circleHelp" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="icon-xs"
        className="desktop-help-launcher-dismiss"
        aria-label={catalog.copy.hideLauncher}
        onClick={() => {
          setOpen(false);
          helpContext?.setShowDesktopHelpLauncher(false);
        }}
      >
        <VendorIcon name="x" aria-hidden="true" />
      </Button>
      <AnchoredUtilityPanel
        anchorRef={launcherRef}
        ariaLabel={catalog.copy.panelTitle}
        className="desktop-help-floating-panel"
        initialFocusRef={searchInputRef}
        open={open}
        onOpenChange={setOpen}
      >
        {open ? (
          <DesktopHelpCenter
            key={contextId}
            catalog={catalog}
            contextId={contextId}
            mode="floating"
            onClose={() => setOpen(false)}
            onNavigate={() => setOpen(false)}
            searchInputRef={searchInputRef}
          />
        ) : null}
      </AnchoredUtilityPanel>
    </div>
  );
};
