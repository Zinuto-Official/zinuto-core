// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from 'react';
import { Card } from '@/ui/primitives/card';
import { cn } from '@/ui/cn';

type MainChartPanelProps = {
  children: ReactNode;
  className?: string;
  surface?: "card" | "flush";
};

export const MainChartPanel = ({
  children,
  className,
  surface = "card",
}: MainChartPanelProps) => {
  const Component = surface === "card" ? Card : "div";

  return (
    <Component
      data-surface={surface}
      className={cn(
        "main-chart-panel flex min-h-0 flex-1 flex-col py-0 shadow-none ring-0 gap-0",
        surface === "card"
          ? "rounded-[var(--radius-panel)] border border-[color:var(--surface-line)] bg-[color:var(--surface-panel-bg)]"
          : "rounded-none border-0 bg-transparent",
        className
      )}
    >
      {children}
    </Component>
  );
};
