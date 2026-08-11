// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from 'react';
import { cn } from '@/ui/cn';

type ChartTopBarProps = {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  className?: string;
  surface?: "card" | "flush";
};

export const ChartTopBar = ({
  left,
  center,
  right,
  className,
  surface = "card",
}: ChartTopBarProps) => (
  <div
    data-surface={surface}
    className={cn(
      "chart-top-bar grid min-h-[44px] grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)] items-center gap-3",
      surface === "card"
        ? "rounded-[var(--workspace-surface-radius,var(--radius-card-sm))] border border-[color:var(--workspace-top-bar-border,var(--ui-divider-soft))] bg-[color:var(--workspace-top-bar-surface,var(--surface-s2))] px-4 py-2"
        : "rounded-none border-0 bg-transparent px-0 py-0",
      className,
    )}
  >
    <div className="min-w-0">{left}</div>
    <div className="min-w-0 justify-self-stretch">{center}</div>
    <div className="min-w-0 justify-self-end">{right}</div>
  </div>
);
