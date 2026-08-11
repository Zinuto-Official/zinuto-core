// SPDX-License-Identifier: GPL-3.0-only

import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/ui/cn";

type PageSectionGroupProps = ComponentPropsWithoutRef<"div">;

export const PageSectionGroup = ({
  className,
  ...props
}: PageSectionGroupProps) => (
  <div
    data-page-slot="page-section-group"
    className={cn("page-section-group", className)}
    {...props}
  />
);
