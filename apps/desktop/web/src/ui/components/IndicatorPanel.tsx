// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from 'react';
import { Card, CardContent } from '@/ui/primitives/card';
import { cn } from '@/ui/cn';

type IndicatorPanelProps = {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
};

export const IndicatorPanel = ({ title, children, className }: IndicatorPanelProps) => (
  <Card className={cn('indicator-panel rounded-card-sm border border-subtle/60 bg-panel-soft py-0 shadow-none ring-0 gap-0', className)}>
    <CardContent className="px-3 py-2">
      {title ? <div className="indicator-panel-title mb-2 text-r1 font-semibold text-text-tertiary">{title}</div> : null}
      {children}
    </CardContent>
  </Card>
);
