// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react";

import { TradingActionButton } from "@/ui/components/TradingActionButton";

type ManualActionDescriptor = {
  label: ReactNode;
  reason?: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  onPointerDown?: () => void;
  title?: string;
  ariaLabel?: string;
  wrapClassName?: string;
  buttonClassName: string;
  tone: "buy" | "sell" | "next" | "ghost";
};

type TradingManualActionDeckProps = {
  buy: ManualActionDescriptor;
  sell: ManualActionDescriptor;
  next: ManualActionDescriptor;
  undo?: ManualActionDescriptor | null;
};

const renderAction = (key: string, action: ManualActionDescriptor) => (
  <span
    key={key}
    className={`trade-action-wrap ${action.disabled ? "is-disabled" : ""} ${action.wrapClassName ?? ""}`.trim()}
  >
    <TradingActionButton
      tone={action.tone}
      className={action.buttonClassName}
      disabled={action.disabled}
      onClick={action.onClick}
      onPointerDown={action.onPointerDown}
      title={action.title}
      aria-label={action.ariaLabel}
    >
      {action.label}
    </TradingActionButton>
    {action.reason ? (
      <span
        className={`trade-action-inline-reason is-${action.tone}`}
        role="status"
        aria-live="polite"
      >
        {action.reason}
      </span>
    ) : null}
  </span>
);

export const TradingManualActionDeck = ({
  buy,
  sell,
  next,
  undo = null,
}: TradingManualActionDeckProps) => (
  <>
    <div className="trade-actions">
      {renderAction("buy", buy)}
      {renderAction("sell", sell)}
    </div>
    <div
      className={`trade-next-row ${undo ? "has-undo-action" : ""}`.trim()}
    >
      {renderAction("next", next)}
      {undo ? renderAction("undo", undo) : null}
    </div>
  </>
);
