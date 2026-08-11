// SPDX-License-Identifier: GPL-3.0-only

import { cn } from "@/ui/cn";

type SubtleDividerProps = {
  orientation?: "horizontal" | "vertical";
  className?: string;
};

export const SubtleDivider = ({
  orientation = "horizontal",
  className,
}: SubtleDividerProps) => (
  <div
    aria-hidden="true"
    className={cn(
      "subtle-divider",
      orientation === "vertical" ? "is-vertical" : "is-horizontal",
      className,
    )}
  />
);
