// SPDX-License-Identifier: GPL-3.0-only

import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/ui/cn";

type WorkspacePageBodyProps = ComponentPropsWithoutRef<"div">;

export const WorkspacePageBody = ({
  className,
  ...props
}: WorkspacePageBodyProps) => (
  <div
    data-page-slot="page-body"
    className={cn("workspace-page-body", className)}
    {...props}
  />
);
