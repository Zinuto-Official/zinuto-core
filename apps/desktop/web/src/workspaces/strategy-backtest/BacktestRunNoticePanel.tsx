// SPDX-License-Identifier: GPL-3.0-only

import { InlineFeedback } from "@/ui/primitives/inline-feedback";
import { Button } from "@/ui/primitives/button";
import { VendorIcon } from "@/assets/graphics";

type BacktestRunNoticePanelProps = {
  skippedCount: number;
  failedCount: number;
  summaryLabel: string;
  detailsLabel: string;
  onOpenDetails: () => void;
};

export const BacktestRunNoticePanel = ({
  skippedCount,
  failedCount,
  summaryLabel,
  detailsLabel,
  onOpenDetails,
}: BacktestRunNoticePanelProps) => {
  if (skippedCount <= 0 && failedCount <= 0) {
    return null;
  }
  return (
    <div className="strategy-backtest-issues-summary">
      <InlineFeedback
        feedback={{
          id: 1,
          tone: failedCount > 0 ? "error" : "warning",
          message: summaryLabel,
          autoHideMs: null,
        }}
      />
      <Button
        type="button"
        variant="inline"
        className="strategy-backtest-issue-details-toggle"
        onClick={(event) => {
          event.stopPropagation();
          onOpenDetails();
        }}
      >
        <span>{detailsLabel}</span>
        <VendorIcon name="chevronRight" />
      </Button>
    </div>
  );
};
