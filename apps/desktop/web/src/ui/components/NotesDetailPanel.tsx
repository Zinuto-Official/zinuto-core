// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from 'react';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/primitives/card';
import { SurfaceCard } from '@/ui/primitives/surface-card';
import { cn } from '@/ui/cn';

type NotesDetailPanelProps = {
  title?: ReactNode;
  meta?: ReactNode;
  chartPreview?: ReactNode;
  children: ReactNode;
  className?: string;
  headerHidden?: boolean;
};

export const NotesDetailPanel = ({
  title,
  meta,
  chartPreview,
  children,
  className,
  headerHidden = false,
}: NotesDetailPanelProps) => (
  <SurfaceCard
    className={cn(
      'notes-detail-panel flex min-h-0 flex-1 flex-col',
      className
    )}
  >
    {headerHidden ? null : (
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-r4 text-text-primary">{title}</CardTitle>
        {meta ? (
          <CardDescription className="mt-1 text-r1 text-text-secondary">
            {meta}
          </CardDescription>
        ) : null}
      </CardHeader>
    )}
    <CardContent
      className={cn(
        "min-h-0 flex-1 p-4",
        headerHidden ? "" : "pt-0",
      )}
    >
      {chartPreview ? <div className="notes-detail-chart-preview mt-0 rounded-card border border-subtle/60 bg-panel-soft p-2">{chartPreview}</div> : null}
      <div
        className={cn(
          "notes-detail-content min-h-0 flex-1",
          headerHidden ? "mt-0" : "mt-3",
        )}
      >
        {children}
      </div>
    </CardContent>
  </SurfaceCard>
);
