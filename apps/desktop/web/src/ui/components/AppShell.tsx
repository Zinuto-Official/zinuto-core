// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from 'react';
import { cn } from '@/ui/cn';

type AppShellProps = {
  sidebar: ReactNode;
  children: ReactNode;
  className?: string;
  mainClassName?: string;
};

export const AppShell = ({ sidebar, children, className, mainClassName }: AppShellProps) => {
  return (
    <div
      className={cn(
        'desktop-shell desktop-shell-surface overflow-hidden rounded-[var(--radius-shell)] border border-subtle/60 bg-window-bg',
        className
      )}
    >
      {sidebar}
      <main className={cn('desktop-main min-w-0', mainClassName)}>{children}</main>
    </div>
  );
};
