// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react";
import { cn } from "@/ui/cn";

type MetricStripTone =
  | "default"
  | "accent"
  | "positive"
  | "negative"
  | "warning"
  | "danger"
  | "neutral";

type MetricStripItem = {
  key: string;
  label: ReactNode;
  value: ReactNode;
  support?: ReactNode;
  tone?: MetricStripTone;
};

type MetricStripProps = {
  items: readonly MetricStripItem[];
  className?: string;
  itemClassName?: string;
};

export const MetricStrip = ({
  items,
  className,
  itemClassName,
}: MetricStripProps) => (
  <div className={cn("metric-strip", className)}>
    {items.map((item) => (
      <article
        key={item.key}
        className={cn(
          "metric-strip-item",
          item.tone ? `tone-${item.tone}` : "",
          itemClassName,
        )}
      >
        <span className="metric-strip-item-label">{item.label}</span>
        <strong className="metric-strip-item-value">{item.value}</strong>
        {item.support ? (
          <span className="metric-strip-item-support">{item.support}</span>
        ) : null}
      </article>
    ))}
  </div>
);
