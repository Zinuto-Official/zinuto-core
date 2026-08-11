// SPDX-License-Identifier: GPL-3.0-only

import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/ui/cn';
import type { PageLayoutTemplate } from '@/ui/components/pageLayoutTypes';

type PageContainerProps = ComponentPropsWithoutRef<"section"> & {
  children?: ReactNode;
  className?: string;
  template?: PageLayoutTemplate;
};

export const PageContainer = ({
  children,
  className,
  template,
  ...props
}: PageContainerProps) => (
  <section
    data-page-shell="true"
    data-page-template={template}
    className={cn('workspace-page', template && `workspace-page--${template}`, className)}
    {...props}
  >
    {children}
  </section>
);
