// SPDX-License-Identifier: GPL-3.0-only

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/ui/cn";

type WorkspaceTopBarProps = ComponentPropsWithoutRef<"section"> & {
  rail?: ReactNode;
  tools?: ReactNode;
  status?: ReactNode;
  railClassName?: string;
  toolsClassName?: string;
  statusClassName?: string;
};

export const WorkspaceTopBar = ({
  rail,
  tools,
  status,
  className,
  railClassName,
  toolsClassName,
  statusClassName,
  ...props
}: WorkspaceTopBarProps) => (
  <section className={cn("workspace-top-bar", className)} {...props}>
    <div className="workspace-top-bar-main">
      <div className={cn("workspace-top-bar-rail", railClassName)}>{rail}</div>
      <div className={cn("workspace-top-bar-tools", toolsClassName)}>
        {tools}
      </div>
    </div>
    {status ? (
      <div className={cn("workspace-top-bar-status", statusClassName)}>
        {status}
      </div>
    ) : null}
  </section>
);
