// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from 'react';
import { CardAction, CardDescription, CardHeader, CardTitle } from '@/ui/primitives/card';
import { SoftSurfaceCard } from '@/ui/primitives/surface-card';
import { cn } from '@/ui/cn';

type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  rightSlot?: ReactNode;
  className?: string;
  variant?: 'surface' | 'plain';
};

export const PageHeader = ({
  title,
  subtitle,
  rightSlot,
  className,
  variant = 'plain',
}: PageHeaderProps) => {
  if (variant === 'plain') {
    return (
      <section
        data-page-slot="page-header"
        className={cn('workspace-page-header workspace-page-header-plain', className)}
      >
        <div className="workspace-page-header-inner workspace-page-header-inner-plain px-0 py-0">
          <div className="workspace-page-header-copy">
            <span className="workspace-page-header-accent" aria-hidden="true" />
            <div className="workspace-page-title-wrap">
              <div
                className="workspace-page-title text-r5 text-text-primary"
                data-i18n-slot="pageTitle"
                data-i18n-critical="true"
              >
                {title}
              </div>
              {subtitle ? (
                <div
                  className="workspace-page-subtitle mt-1 text-r3 text-text-secondary"
                  data-i18n-slot="pageSubtitle"
                  data-i18n-critical="true"
                >
                  {subtitle}
                </div>
              ) : null}
            </div>
          </div>
          {rightSlot ? (
            <div className="workspace-page-header-actions shrink-0">{rightSlot}</div>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <SoftSurfaceCard
      data-page-slot="page-header"
      className={cn('workspace-page-header', className)}
    >
      <CardHeader className="workspace-page-header-inner px-4 py-3">
        <div className="workspace-page-header-copy">
          <span className="workspace-page-header-accent" aria-hidden="true" />
          <div className="workspace-page-title-wrap">
            <CardTitle
              className="workspace-page-title text-r5 text-text-primary"
              data-i18n-slot="pageTitle"
              data-i18n-critical="true"
            >
              {title}
            </CardTitle>
            {subtitle ? (
              <CardDescription
                className="workspace-page-subtitle mt-1 text-r3 text-text-secondary"
                data-i18n-slot="pageSubtitle"
                data-i18n-critical="true"
              >
                {subtitle}
              </CardDescription>
            ) : null}
          </div>
        </div>
        {rightSlot ? <CardAction className="workspace-page-header-actions shrink-0">{rightSlot}</CardAction> : null}
      </CardHeader>
    </SoftSurfaceCard>
  );
};
