// SPDX-License-Identifier: GPL-3.0-only

import type { ComponentPropsWithoutRef, CSSProperties } from "react";
import { cn } from "@/ui/cn";
import type { PageSummaryGridColumns } from "@/ui/components/pageLayoutTypes";

type PageSummaryGridProps = ComponentPropsWithoutRef<"section"> & {
  columns?: PageSummaryGridColumns;
};

export const PageSummaryGrid = ({
  columns = 3,
  className,
  style,
  ...props
}: PageSummaryGridProps) => (
  <section
    data-page-slot="page-summary"
    className={cn("page-summary-grid", className)}
    style={
      {
        "--page-summary-grid-cols": String(columns),
        ...(style ?? {}),
      } as CSSProperties
    }
    {...props}
  />
);
