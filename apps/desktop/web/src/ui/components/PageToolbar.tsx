// SPDX-License-Identifier: GPL-3.0-only

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/ui/cn";

type PageToolbarProps = ComponentPropsWithoutRef<"section"> & {
  actions?: ReactNode;
  children?: ReactNode;
};

export const PageToolbar = ({
  actions,
  children,
  className,
  ...props
}: PageToolbarProps) => (
  <section
    data-page-slot="page-toolbar"
    className={cn("page-toolbar", className)}
    {...props}
  >
    <div className="page-toolbar-main">{children}</div>
    {actions ? <div className="page-toolbar-actions">{actions}</div> : null}
  </section>
);
