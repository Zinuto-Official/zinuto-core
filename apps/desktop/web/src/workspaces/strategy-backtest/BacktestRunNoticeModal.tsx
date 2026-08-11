// SPDX-License-Identifier: GPL-3.0-only

import { Button } from "@/ui/primitives/button";
import { AppModal, StandardModalFrame } from "@/ui/components";
import type { BacktestSymbolIssue } from "@/workspaces/strategy-backtest/strategyBacktestDisplay";

type BacktestRunNoticeModalProps = {
  open: boolean;
  skippedIssues: readonly BacktestSymbolIssue[];
  failedIssues: readonly BacktestSymbolIssue[];
  title: string;
  skippedTitle: string;
  failedTitle: string;
  closeLabel: string;
  formatIssueReason: (reason: string) => string;
  onClose: () => void;
};

const BacktestIssueGroup = ({
  title,
  issues,
  formatIssueReason,
}: {
  title: string;
  issues: readonly BacktestSymbolIssue[];
  formatIssueReason: (reason: string) => string;
}) => {
  if (!issues.length) {
    return null;
  }
  return (
    <section className="strategy-backtest-issues-modal-group">
      <h3>{title}</h3>
      <div className="strategy-backtest-issue-list">
        {issues.map((issue) => (
          <span key={`${issue.instrumentId || issue.symbol}-${issue.reason}`}>
            <strong>{issue.symbol}</strong>
            <small>{formatIssueReason(issue.reason)}</small>
            {issue.message ? <em>{issue.message}</em> : null}
          </span>
        ))}
      </div>
    </section>
  );
};

export const BacktestRunNoticeModal = ({
  open,
  skippedIssues,
  failedIssues,
  title,
  skippedTitle,
  failedTitle,
  closeLabel,
  formatIssueReason,
  onClose,
}: BacktestRunNoticeModalProps) => (
  <AppModal
    open={open}
    onClose={onClose}
    preset="alert"
    className="strategy-backtest-issues-modal"
    showCloseButton
    accessibilityTitle={title}
  >
    <StandardModalFrame
      variant="alert"
      title={title}
      bodyClassName="strategy-backtest-issues-modal-body"
      actions={
        <Button type="button" variant="default" onClick={onClose}>
          {closeLabel}
        </Button>
      }
    >
      <BacktestIssueGroup
        title={skippedTitle}
        issues={skippedIssues}
        formatIssueReason={formatIssueReason}
      />
      <BacktestIssueGroup
        title={failedTitle}
        issues={failedIssues}
        formatIssueReason={formatIssueReason}
      />
    </StandardModalFrame>
  </AppModal>
);
