// SPDX-License-Identifier: GPL-3.0-only

import { useDesktopHelpContextReporter } from "@/domains/desktop-help/DesktopHelpContext";
import { resolveSpecialTrainingHelpContextId } from "@/workspaces/special-training/specialTrainingPageRuntimePresentation";

export const useSpecialTrainingPageHelpContext = ({
  isPageActive,
  view,
  activeModeId,
}: {
  isPageActive: boolean;
  view: "MODE_PICKER" | "TRAINING" | "SETTLEMENT";
  activeModeId: string | null | undefined;
}) => {
  useDesktopHelpContextReporter({
    active: isPageActive,
    contextId: resolveSpecialTrainingHelpContextId({ view, activeModeId }),
    workspace: "SPECIAL_TRAINING",
  });
};
