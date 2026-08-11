// SPDX-License-Identifier: GPL-3.0-only

import { Button } from "@/ui/primitives/button";
import {
  getPortableDataTransferCopy,
  type AppUiLanguage,
} from "@/ui/config/uiConfig";

type PortableDataSettingsLinkProps = {
  language: AppUiLanguage;
  onOpenDeviceTransferSettings: () => void;
};

export const PortableDataSettingsLink = ({
  language,
  onOpenDeviceTransferSettings,
}: PortableDataSettingsLinkProps) => {
  const copy = getPortableDataTransferCopy(language);
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="portable-transfer-settings-link"
      onClick={onOpenDeviceTransferSettings}
    >
      {copy.goToSettingsAction}
    </Button>
  );
};
