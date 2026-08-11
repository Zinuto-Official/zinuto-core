// SPDX-License-Identifier: GPL-3.0-only

import { Button } from "@/ui/primitives/button";
import type { ApiSpecialTrainingScopeRestartSignal } from "@/api";
import { AppModal } from "@/ui/components/AppModal";
import { StandardModalFrame } from "@/ui/components";

type SpecialTrainingScopeRestartNoticeDialogProps = {
  notice: ApiSpecialTrainingScopeRestartSignal | null;
  countdown: number;
  title: string;
  description: string;
  fallbackDescription: string;
  continueLabel: string;
  countdownContinueLabel: string;
  onClose: () => void;
};

export const SpecialTrainingScopeRestartNoticeDialog = ({
  notice,
  countdown,
  title,
  description,
  fallbackDescription,
  continueLabel,
  countdownContinueLabel,
  onClose,
}: SpecialTrainingScopeRestartNoticeDialogProps) => (
  <AppModal
    open={Boolean(notice)}
    onClose={onClose}
    preset="alert"
    showCloseButton
    accessibilityTitle={title}
    accessibilityDescription={notice ? description : fallbackDescription}
  >
    <StandardModalFrame
      title={title}
      description={notice ? description : fallbackDescription}
      variant="alert"
      actions={
        <Button variant="secondary" onClick={onClose}>
          {countdown > 0 ? countdownContinueLabel : continueLabel}
        </Button>
      }
    />
  </AppModal>
);
