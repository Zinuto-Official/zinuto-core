// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react";

import { cn } from "@/ui/cn";

type TradingEstimateSide = {
  quantityLabel: ReactNode;
  quantityValue: ReactNode;
  cashLabel: ReactNode;
  cashValue: ReactNode;
  executionBreakdown?: ReactNode;
  disabled?: boolean;
};

type TradingEstimateBoxProps = {
  className?: string;
  referenceLabel: ReactNode;
  referenceValue: ReactNode;
  referenceModeControl?: ReactNode;
  buy: TradingEstimateSide;
  sell: TradingEstimateSide;
};

const renderEstimateSide = (
  side: "buy" | "sell",
  estimate: TradingEstimateSide,
) => (
  <div
    className={cn(
      "estimate-dl-row",
      side === "buy" ? "estimate-dl-row-buy" : "estimate-dl-row-sell",
      estimate.disabled && "is-disabled",
    )}
  >
    <dt>{estimate.quantityLabel}</dt>
    <dd>
      <span className="estimate-dl-row-summary">
        <span className="estimate-dl-value-stack">
          <span className="estimate-dl-value">{estimate.quantityValue}</span>
          {estimate.executionBreakdown ? (
            <span className="estimate-dl-meta">
              {estimate.executionBreakdown}
            </span>
          ) : null}
        </span>
        <span className="estimate-dl-side-value">
          {estimate.cashLabel}
          <strong>{estimate.cashValue}</strong>
        </span>
      </span>
    </dd>
  </div>
);

export const TradingEstimateBox = ({
  className,
  referenceLabel,
  referenceValue,
  referenceModeControl = null,
  buy,
  sell,
}: TradingEstimateBoxProps) => (
  <div className={cn("estimate-box", className)}>
    <dl className="estimate-dl">
      <div className="estimate-dl-row estimate-dl-row-ref">
        <dt>{referenceLabel}</dt>
        <dd>
          <span className="estimate-dl-value estimate-dl-main">
            {referenceValue}
          </span>
          {referenceModeControl}
        </dd>
      </div>
      {renderEstimateSide("buy", buy)}
      {renderEstimateSide("sell", sell)}
    </dl>
  </div>
);
