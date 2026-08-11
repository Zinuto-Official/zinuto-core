// SPDX-License-Identifier: GPL-3.0-only

import {
  forwardRef,
  type ComponentPropsWithoutRef,
} from "react";
import { cn } from "@/ui/cn";

type WorkspaceFrameShellProps = ComponentPropsWithoutRef<"div"> & {
  fit?: "stretch" | "content";
};

export const WorkspaceFrameShell = forwardRef<
  HTMLDivElement,
  WorkspaceFrameShellProps
>(function WorkspaceFrameShell(
  {
    className,
    fit = "stretch",
    ...props
  },
  ref,
) {
  return (
    <div
      ref={ref}
      data-workspace-frame-shell="true"
      data-workspace-frame-fit={fit}
      className={cn("workspace-frame-shell", className)}
      {...props}
    />
  );
});
